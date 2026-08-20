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
// Kľúč na rozpoznanie „toto už máme".
//
// Prvá voľba je ID operácie z výpisu — jediná vec, ktorá spoľahlivo odlíši dva
// rovnaké pohyby. V júni 2026 odišli tri dvojice „Jerry vyplata −1000" v ten
// istý deň; podľa dátumu, sumy a protistrany sú nerozoznateľné, takže by sa
// z každej dvojice zapísala jedna a 3 000 Kč výplat by ticho zmizlo.
//
// Bez ID (export „Vyhledané pohyby" ani textový výpis ho nemajú) sa vracia
// pôvodný kľúč. Ten duplicitné platby zlúči — preto appka odporúča výpis.
const kluc = (r: { id?: string; datum: string; suma: number; protistrana?: string }) =>
  r.id ? `fio:${r.id}` : `${r.datum}|${r.suma}|${(r.protistrana || "").slice(0, 40)}`;

export const Route = createFileRoute("/api/fio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, pohyby: [], pravidla: [] });
        try {
          const [t, p] = await Promise.all([
            DB.prepare("SELECT date, amount_czk, counterparty, note, typ, category, dedup_key FROM fio_transactions ORDER BY date DESC LIMIT 2000").all(),
            DB.prepare("SELECT text_pattern, category FROM vzas_rules WHERE active = 1 ORDER BY priority").all(),
          ]);
          return Response.json({
            ok: true,
            pohyby: (t.results as Record<string, unknown>[]).map((r) => ({
              datum: r.date, suma: r.amount_czk, protistrana: r.counterparty,
              poznamka: r.note, typ: r.typ, kategoria: r.category, kluc: r.dedup_key,
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
        let b: { akcia?: string; text?: string; riadky?: FioRiadok[]; zmeny?: { kluc: string; kategoria: string; datum?: string; poznamka?: string }[] };
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
          // Kontrola proti hlavičke výpisu: sedí súčet toho, čo parser prečítal,
          // s tým, čo tvrdí banka? A má súbor vôbec ID operácií?
          const prijmy = v.riadky.filter((r) => r.suma > 0).reduce((a, r) => a + r.suma, 0);
          const vydaje = v.riadky.filter((r) => r.suma < 0).reduce((a, r) => a + r.suma, 0);
          const sedi = v.kontrola
            ? Math.abs(prijmy - v.kontrola.prijmy) < 1 && Math.abs(vydaje - v.kontrola.vydaje) < 1
            : null;
          const bezId = v.riadky.filter((r) => !r.id).length;
          return Response.json({
            ok: true, riadky, hlavicka: v.hlavicka,
            kontrola: v.kontrola ? { ...v.kontrola, precitanePrijmy: prijmy, precitaneVydaje: vydaje, sedi } : null,
            bezId,
          });
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
          // Zlyhaný zápis pravidla sa NESMIE prehltnúť: DELETE+INSERT s tichým
          // catch znamenal, že keď DELETE prešiel a INSERT padol, naučené
          // pravidlo zmizlo — a audit ohlásil „N pravidiel" ako uložené.
          let pravidlaZlyhane = 0;
          for (const [vzor, kategoria] of naucene) {
            // Upsert cez DELETE+INSERT: tabuľka nemá unique na text_pattern a
            // každý ďalší import by pridal duplicitný riadok. Posledné
            // zaradenie vyhráva — keď Jerry preradí Adobe inam, staré pravidlo
            // nesmie ďalej hlasovať.
            const r = await DB.batch([
              DB.prepare("DELETE FROM vzas_rules WHERE text_pattern = ?1 AND created_by = 'import'").bind(vzor),
              DB.prepare(
                `INSERT INTO vzas_rules (id, counterparty, merchant, text_pattern, category, priority, hit_count, active, created_by, created_at)
                 VALUES (?1, NULL, NULL, ?2, ?3, 50, 0, 1, 'import', ?4)`,
              ).bind(uid(), vzor, kategoria, now),
            ]).catch(() => null);
            if (!r) pravidlaZlyhane++;
          }

          await audit(DB, {
            action: "import-banka",
            predmet: `${pridane} pohybov`,
            neu: `+${pridane}, ${preskocene} duplicít${zamknute ? `, ${zamknute} odmietnutých (uzavretý mesiac)` : ""}, ${naucene.size - pravidlaZlyhane} pravidiel${pravidlaZlyhane ? ` (${pravidlaZlyhane} sa NEULOŽILO)` : ""}`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, pridane, preskocene, zamknute, pravidla: naucene.size - pravidlaZlyhane, pravidlaZlyhane });
        }

        // Úprava kategórie po zápise. Náhľad bol dôkladný, ale po zápise sa už
        // nedalo nič zmeniť — jeden nesprávny klik bol trvalý a človek sa potom
        // právom bojí zapísať čokoľvek, čo si nie je istý.
        if (b.akcia === "kategoria") {
          const zmeny = Array.isArray(b.zmeny) ? b.zmeny.slice(0, 2000) : [];
          if (!zmeny.length) return Response.json({ ok: false, error: "no_rows" }, { status: 400 });
          const zamky = await zamknuteMesiace(DB);
          const stmts = [];
          let zmenene = 0, zamknute = 0;
          for (const z of zmeny) {
            const kluc = String(z.kluc || "");
            if (!kluc) continue;
            if (z.datum && jeZamknuty(zamky, String(z.datum))) { zamknute++; continue; }
            // Poznámka je voliteľná — keď nepríde, kategória sa mení sama.
            stmts.push(
              z.poznamka === undefined
                ? DB.prepare("UPDATE fio_transactions SET category = ?2 WHERE dedup_key = ?1")
                    .bind(kluc, String(z.kategoria || ""))
                : DB.prepare("UPDATE fio_transactions SET category = ?2, note = ?3 WHERE dedup_key = ?1")
                    .bind(kluc, String(z.kategoria || ""), String(z.poznamka || "").slice(0, 400)),
            );
            zmenene++;
          }
          if (stmts.length) await DB.batch(stmts);

          // Zaradenie sa MUSÍ naučiť ako pravidlo.
          //
          // Pravidlá sa dovtedy učili len pri importe, takže keď Jerry (alebo
          // Jarvis) preradil pohyb dodatočne, appka na to pri ďalšom výpise
          // zabudla a spýtala sa znova. To je presne to, čo malo učenie
          // odstrániť — rozhodnutie, ktoré človek raz spravil, sa nemá pýtať
          // druhýkrát.
          //
          // Vzor sa berie z protistrany toho istého pohybu; tú v tele požiadavky
          // nemáme, tak sa dotiahne z databázy.
          const kluce = zmeny.map((z) => String(z.kluc || "")).filter(Boolean);
          if (kluce.length) {
            const otazniky = kluce.map((_, i) => `?${i + 1}`).join(",");
            const rs = await DB.prepare(
              `SELECT dedup_key, counterparty FROM fio_transactions WHERE dedup_key IN (${otazniky})`,
            ).bind(...kluce).all().catch(() => ({ results: [] as Record<string, unknown>[] }));
            const podlaKluca = new Map(
              (rs.results as Record<string, unknown>[]).map((r) => [String(r.dedup_key), String(r.counterparty || "")]),
            );
            const naucene = new Map<string, string>();
            for (const z of zmeny) {
              const kat = String(z.kategoria || "");
              const vzor = (podlaKluca.get(String(z.kluc || "")) || "").trim();
              // Prázdna kategória pravidlo neruší, len sa neučí — vyprázdnenie
              // je „neviem", nie „patrí nikam".
              if (kat && vzor.length >= 3) naucene.set(vzor.toLowerCase(), kat);
            }
            const kedy = new Date().toISOString();
            for (const [vzor, kategoria] of naucene) {
              // Rovnaká zásada ako pri importe: DELETE+INSERT atomicky (batch),
              // zlyhanie sa nesmie prehltnúť bez stopy.
              await DB.batch([
                DB.prepare("DELETE FROM vzas_rules WHERE text_pattern = ?1 AND created_by IN ('import','uprava')").bind(vzor),
                DB.prepare(
                  `INSERT INTO vzas_rules (id, counterparty, merchant, text_pattern, category, priority, hit_count, active, created_by, created_at)
                   VALUES (?1, NULL, NULL, ?2, ?3, 40, 0, 1, 'uprava', ?4)`,
                ).bind(uid(), vzor, kategoria, kedy),
              ]).catch(() => null);
            }
          }

          await audit(DB, {
            action: "uprava-banka",
            predmet: `${zmenene} pohybov`,
            neu: zmeny[0]?.kategoria || "(vyprázdnené)",
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, zmenene, zamknute });
        }

        return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
      },
    },
  },
});
