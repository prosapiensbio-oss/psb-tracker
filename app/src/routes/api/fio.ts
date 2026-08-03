import { createFileRoute } from "@tanstack/react-router";

import { audit, jeZamknuty, zamknuteMesiace } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { parseFio, type FioRiadok } from "../../lib/psb/fio";

// Import bankového výpisu — dvojkrokovo.
//
//   POST { akcia: "nahlad", text }   → nič nezapíše, vráti, čo z výpisu pochopil
//   POST { akcia: "zapis", riadky }  → zapíše potvrdené riadky a naučí sa pravidlá
//   GET                              → uložené pohyby + naučené pravidlá
//
// Náhľad existuje preto, že formát výpisu sa časom mení. Keby import zapisoval
// rovno, zlý odhad stĺpcov by ticho pokazil P&L a prišlo by sa na to o mesiace
// neskôr. Takto zlý odhad nestojí nič — neuvidí sa v ňom zmysel a nepotvrdí sa.

const uid = () => crypto.randomUUID();
const kluc = (r: { datum: string; suma: number; protistrana?: string }) =>
  `${r.datum}|${r.suma}|${(r.protistrana || "").slice(0, 40)}`;

export const Route = createFileRoute("/api/fio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, pohyby: [], pravidla: [] });
        try {
          const [t, p] = await Promise.all([
            DB.prepare("SELECT date, amount_czk, counterparty, note, typ, category FROM fio_transactions ORDER BY date DESC LIMIT 500").all(),
            DB.prepare("SELECT text_pattern, category FROM vzas_rules WHERE active = 1 ORDER BY priority").all(),
          ]);
          return Response.json({
            ok: true,
            pohyby: (t.results as Record<string, unknown>[]).map((r) => ({
              datum: r.date, suma: r.amount_czk, protistrana: r.counterparty,
              poznamka: r.note, typ: r.typ, kategoria: r.category,
            })),
            pravidla: (p.results as Record<string, unknown>[]).map((r) => ({ vzor: r.text_pattern, kategoria: r.category })),
          });
        } catch {
          return Response.json({ ok: false, pohyby: [], pravidla: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { akcia?: string; text?: string; riadky?: FioRiadok[] };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        if (b.akcia === "nahlad") {
          const pr = await DB.prepare("SELECT text_pattern, category FROM vzas_rules WHERE active = 1 ORDER BY priority").all()
            .catch(() => ({ results: [] as Record<string, unknown>[] }));
          const pravidla = (pr.results as Record<string, unknown>[])
            .map((r) => ({ vzor: String(r.text_pattern || ""), kategoria: String(r.category || "") }))
            .filter((r) => r.vzor && r.kategoria);
          const v = parseFio(String(b.text || ""), pravidla);
          if (!v.ok) return Response.json({ ok: false, chyba: v.chyba, ukazka: v.ukazka });

          // Čo už v databáze je, nech sa v náhľade neponúka znova.
          const existujuce = new Set(
            ((await DB.prepare("SELECT dedup_key FROM fio_transactions").all()).results as { dedup_key: string }[])
              .map((r) => r.dedup_key),
          );
          const zamky = await zamknuteMesiace(DB);
          const riadky = v.riadky.map((r) => ({
            ...r,
            uzMame: existujuce.has(kluc(r)),
            zamknuty: jeZamknuty(zamky, r.datum),
          }));
          return Response.json({ ok: true, riadky, hlavicka: v.hlavicka });
        }

        if (b.akcia === "zapis") {
          const riadky = Array.isArray(b.riadky) ? b.riadky.slice(0, 2000) : [];
          if (!riadky.length) return Response.json({ ok: false, error: "no_rows" }, { status: 400 });
          const zamky = await zamknuteMesiace(DB);
          const existujuce = new Set(
            ((await DB.prepare("SELECT dedup_key FROM fio_transactions").all()).results as { dedup_key: string }[])
              .map((r) => r.dedup_key),
          );

          const stmts = [];
          let pridane = 0, preskocene = 0, zamknute = 0;
          const now = new Date().toISOString();
          for (const r of riadky) {
            if (jeZamknuty(zamky, r.datum)) { zamknute++; continue; }
            const k = kluc(r);
            if (existujuce.has(k)) { preskocene++; continue; }
            existujuce.add(k);
            stmts.push(
              DB.prepare(
                `INSERT OR IGNORE INTO fio_transactions (id, date, amount_czk, counterparty, note, typ, category, dedup_key, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
              ).bind(uid(), r.datum, r.suma, r.protistrana || "", r.poznamka || "", r.typ || "", r.kategoria || "", k, now),
            );
            pridane++;
          }
          if (stmts.length) await DB.batch(stmts);

          // Naučené pravidlá: čo Jerry zaradil, to už appka nabudúce navrhne
          // sama. Kľúčom je protistrana — je stabilnejšia než text poznámky.
          const naucene = new Map<string, string>();
          for (const r of riadky) {
            const vzor = (r.protistrana || "").trim();
            if (vzor.length >= 3 && r.kategoria) naucene.set(vzor.toLowerCase(), r.kategoria);
          }
          for (const [vzor, kategoria] of naucene) {
            // Upsert cez DELETE+INSERT: tabuľka nemá unique na text_pattern a
            // každý ďalší import by pridal duplicitný riadok. Posledné
            // zaradenie vyhráva — keď Jerry preradí Adobe inam, staré pravidlo
            // nesmie ďalej hlasovať.
            await DB.prepare("DELETE FROM vzas_rules WHERE text_pattern = ?1 AND created_by = 'import'").bind(vzor).run().catch(() => {});
            await DB.prepare(
              `INSERT INTO vzas_rules (id, counterparty, merchant, text_pattern, category, priority, hit_count, active, created_by, created_at)
               VALUES (?1, NULL, NULL, ?2, ?3, 50, 0, 1, 'import', ?4)`,
            ).bind(uid(), vzor, kategoria, now).run().catch(() => {});
          }

          await audit(DB, {
            action: "import-banka",
            predmet: `${pridane} pohybov`,
            neu: `+${pridane}, ${preskocene} duplicít${zamknute ? `, ${zamknute} odmietnutých (uzavretý mesiac)` : ""}, ${naucene.size} pravidiel`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, pridane, preskocene, zamknute, pravidla: naucene.size });
        }

        return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
      },
    },
  },
});
