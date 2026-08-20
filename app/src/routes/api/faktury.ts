import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Rozpis faktúr na položky.
//
//   GET                        → uložené položky
//   POST { polozky }           → zapíše potvrdený rozpis a naučí sa pravidlá
//
// PDF sa nespracúva tu, ale v prehliadači — súbor má aj pol megabajtu a posielať
// ho na server len preto, aby sa z neho vytiahli tri kilobajty textu, nedáva
// zmysel. Sem prichádza už hotový a človekom skontrolovaný rozpis.
const uid = () => crypto.randomUUID();

type Vstup = {
  faktura: string; dodavatel: string; datum: string;
  nazov: string; kod: string; ks: number; cena: number; kategoria: string;
};

export const Route = createFileRoute("/api/faktury")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, polozky: [] });
        try {
          const rs = await DB.prepare(
            "SELECT faktura, dodavatel, date, nazov, kod, ks, cena_czk, category FROM faktura_polozky ORDER BY date DESC, faktura LIMIT 800",
          ).all();
          return Response.json({
            ok: true,
            polozky: (rs.results as Record<string, unknown>[]).map((r) => ({
              faktura: r.faktura, dodavatel: r.dodavatel, datum: r.date, nazov: r.nazov,
              kod: r.kod, ks: r.ks, cena: r.cena_czk, kategoria: r.category,
            })),
          });
        } catch {
          return Response.json({ ok: false, polozky: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { polozky?: Vstup[] };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const polozky = Array.isArray(b.polozky) ? b.polozky.slice(0, 500) : [];
        if (!polozky.length) return Response.json({ ok: false, error: "no_rows" }, { status: 400 });

        const now = new Date().toISOString();
        const actor = (await currentUser(request)) || undefined;

        // Čo z týchto dokladov už v databáze je.
        //
        // Kľúč proti duplicitám niesol PORADIE V RÁMCI NAHRÁVANIA. Tá istá
        // faktúra nahratá znova, ale v inej dávke, dostala iné poradie, iný
        // kľúč — a prešla ako nová položka. Náklad by sa tichodvojil, presne
        // toho sa Jerry bál. Poradie v dávke nie je vlastnosť faktúry.
        //
        // Teraz sa porovnáva OBSAH: doklad + názov + suma. Dva rovnaké kusy na
        // jednom doklade prežijú, lebo sa počítajú — vloží sa len toľko, o koľko
        // je v nahrávanej dávke viac než v databáze.
        const cisla = [...new Set(polozky.map((x) => String(x.faktura || "")).filter(Boolean))];
        const uz = new Map<string, number>();
        if (cisla.length) {
          const existuje = await DB.prepare(
            `SELECT faktura, nazov, cena_czk FROM faktura_polozky WHERE faktura IN (${cisla.map(() => "?").join(",")})`,
          ).bind(...cisla).all<{ faktura: string; nazov: string; cena_czk: number }>();
          for (const r of existuje.results || []) {
            const k = `${r.faktura}|${String(r.nazov).trim().slice(0, 60)}|${r.cena_czk}`;
            uz.set(k, (uz.get(k) || 0) + 1);
          }
        }

        const stmts = [];
        let pridane = 0;
        let preskocene = 0;
        const vDavke = new Map<string, number>();
        for (const p of polozky) {
          const nazov = String(p.nazov || "").trim().slice(0, 200);
          if (!nazov || !p.cena) continue;
          const obsah = `${p.faktura}|${nazov.slice(0, 60)}|${p.cena}`;
          const poradie = vDavke.get(obsah) || 0;
          vDavke.set(obsah, poradie + 1);
          // Toľkýto rovnaký kus už v databáze je → nevkladať.
          if (poradie < (uz.get(obsah) || 0)) { preskocene++; continue; }
          const kluc = `${obsah}|${poradie}`;
          stmts.push(
            DB.prepare(
              `INSERT OR IGNORE INTO faktura_polozky
               (id, faktura, dodavatel, date, nazov, kod, ks, cena_czk, category, dedup_key, created_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
            ).bind(
              uid(), String(p.faktura || ""), String(p.dodavatel || ""), String(p.datum || ""),
              nazov, String(p.kod || ""), Number(p.ks) || 1, Number(p.cena) || 0,
              String(p.kategoria || ""), kluc, now,
            ),
          );
          pridane++;
        }
        if (stmts.length) await DB.batch(stmts);

        // Naučené pravidlá: kľúčom je názov produktu skrátený na prvé tri slová
        // („Granule pro štěňata" → Ahsoka). Celý názov je pri každom nákupe iný
        // (gramáž, príchuť), takže by sa pravidlo nikdy nechytilo druhýkrát.
        const naucene = new Map<string, string>();
        for (const p of polozky) {
          const vzor = String(p.nazov || "").trim().split(/\s+/).slice(0, 3).join(" ");
          if (vzor.length >= 5 && p.kategoria) naucene.set(vzor.toLowerCase(), p.kategoria);
        }
        // Počíta sa, čo sa NAOZAJ zapísalo — nie koľko pokusov prebehlo.
        // Appka hlásila „naučených M pravidiel" aj vtedy, keď insert padol,
        // a pri ďalšej Alze sa nezaradilo nič (revízia 18. 8. 2026).
        let naucenych = 0;
        for (const [vzor, kategoria] of naucene) {
          try {
            await DB.prepare("DELETE FROM vzas_rules WHERE text_pattern = ?1 AND created_by = 'faktura'").bind(vzor).run();
            await DB.prepare(
              `INSERT INTO vzas_rules (id, counterparty, merchant, text_pattern, category, priority, hit_count, active, created_by, created_at)
               VALUES (?1, NULL, NULL, ?2, ?3, 40, 0, 1, 'faktura', ?4)`,
            ).bind(uid(), vzor, kategoria, now).run();
            naucenych++;
          } catch { /* jedno pravidlo navyše nestojí za pád celého importu */ }
        }

        await audit(DB, {
          action: "import-faktura",
          predmet: `${polozky[0]?.dodavatel || "faktúra"} · ${polozky[0]?.faktura || ""}`,
          neu: `${pridane} položiek${preskocene ? `, ${preskocene} už bolo nahratých` : ""}, ${naucenych} pravidiel`,
          actor,
        });
        return Response.json({ ok: true, pridane, preskocene, pravidla: naucenych });
      },
    },
  },
});
