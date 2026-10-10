import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Rozpis faktúr na položky.
//
//   GET                        → uložené položky
//   POST { polozky }           → zapíše potvrdený rozpis a naučí sa pravidlá
//   POST { akcia: "kategoria", id, kategoria } → zmení kategóriu uloženej
//                                položky (krok Alza v uzávierke, 9. 10. 2026)
//   POST { akcia: "potvrd", faktura } | { akcia: "vrat", faktura }
//                              → doklad je vybavený a zmizne z uzávierky
//                                (alebo sa vráti späť), 10. 10. 2026
//   POST { akcia: "zmaz", id } | { akcia: "zmaz", ids }
//                              → zmaže položku (alebo zbalenú skupinu dopravy
//                                a zliav naraz), 10. 10. 2026
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
            "SELECT id, faktura, dodavatel, date, nazov, kod, ks, cena_czk, category, potvrdene_at FROM faktura_polozky ORDER BY date DESC, faktura LIMIT 800",
          ).all();
          return Response.json({
            ok: true,
            polozky: (rs.results as Record<string, unknown>[]).map((r) => ({
              id: r.id, faktura: r.faktura, dodavatel: r.dodavatel, datum: r.date, nazov: r.nazov,
              kod: r.kod, ks: r.ks, cena: r.cena_czk, kategoria: r.category, potvrdene: r.potvrdene_at || null,
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
        let b: { polozky?: Vstup[]; akcia?: string; id?: string; ids?: string[]; kategoria?: string; faktura?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        // Zmena kategórie jednej uloženej položky — rozdelenie „náklad /
        // výplata / Ahsoka" po zapísaní dokladu, bez nového nahrávania.
        if (b.akcia === "kategoria") {
          const id = String(b.id || "");
          const kategoria = String(b.kategoria ?? "").slice(0, 80);
          if (!id) return Response.json({ ok: false, error: "Chýba položka." }, { status: 400 });
          const pred = await DB.prepare("SELECT faktura, nazov, date, category FROM faktura_polozky WHERE id = ?1").bind(id).first<{ faktura: string; nazov: string; date: string; category: string }>();
          if (!pred) return Response.json({ ok: false, error: "Položka neexistuje." }, { status: 404 });
          // Uzamknutý mesiac sa nemení — rovnaké pravidlo ako pri banke a zošite.
          const zamok = await DB.prepare("SELECT locked FROM vzas_periods WHERE month = ?1").bind(String(pred.date || "").slice(0, 7)).first<{ locked: number }>().catch(() => null);
          if (zamok?.locked) return Response.json({ ok: false, error: "Mesiac je uzamknutý — najprv ho odomkni." }, { status: 409 });
          await DB.prepare("UPDATE faktura_polozky SET category = ?2 WHERE id = ?1").bind(id, kategoria).run();
          await audit(DB, { action: "faktura-kategoria", predmet: `${pred.faktura} · ${pred.nazov}`.slice(0, 200), month: String(pred.date || "").slice(0, 7), old: pred.category, neu: kategoria, actor: (await currentUser(request)) || undefined });
          return Response.json({ ok: true });
        }

        /**
         * DOKLAD JE VYBAVENÝ (alebo sa vracia späť do práce).
         *
         * Jerry, 10. 10. 2026: „chcem mať potvrdenie a tým, že to potvrdím,
         * sa to zapíše a schová, aby som mal uzávierku pekne čistú."
         *
         * Kategórie sa zapisujú hneď pri kliku a tak to zostáva — potvrdenie
         * nie je o zápise, je o tom, že doklad už nemá zaberať miesto. Preto
         * sa nekontroluje, či má všetko kategóriu: to je Jerryho rozhodnutie,
         * nie podmienka. Vrátiť sa dá kedykoľvek.
         */
        if (b.akcia === "potvrd" || b.akcia === "vrat") {
          const faktura = String(b.faktura || "");
          if (!faktura) return Response.json({ ok: false, error: "Chýba doklad." }, { status: 400 });
          const prvy = await DB.prepare("SELECT date FROM faktura_polozky WHERE faktura = ?1 LIMIT 1").bind(faktura).first<{ date: string }>();
          if (!prvy) return Response.json({ ok: false, error: "Doklad neexistuje." }, { status: 404 });
          const mesiac = String(prvy.date || "").slice(0, 7);
          const zamok = await DB.prepare("SELECT locked FROM vzas_periods WHERE month = ?1").bind(mesiac).first<{ locked: number }>().catch(() => null);
          if (zamok?.locked) return Response.json({ ok: false, error: "Mesiac je uzamknutý — najprv ho odomkni." }, { status: 409 });
          const kto = (await currentUser(request)) || null;
          const kedy = b.akcia === "potvrd" ? new Date().toISOString() : null;
          await DB.prepare("UPDATE faktura_polozky SET potvrdene_at = ?2, potvrdil = ?3 WHERE faktura = ?1")
            .bind(faktura, kedy, kedy ? kto : null).run();
          await audit(DB, {
            action: b.akcia === "potvrd" ? "faktura-potvrdena" : "faktura-vratena",
            month: mesiac, neu: faktura, actor: kto || undefined,
          });
          return Response.json({ ok: true, potvrdene: kedy });
        }

        /**
         * ZMAZANIE RIADKU Z DOKLADU.
         *
         * Jerry, 10. 10. 2026: „je tam veľakrát položka nehmotné produkty a to
         * by som mal rád možnosť vykrížikovať." Mažú sa hlavne tie — doprava
         * a zľava na dopravné, ktoré sa navzájom nulujú.
         *
         * Čo zmizne, musí ísť dohľadať: do auditu sa zapíše názov aj suma
         * každého zmazaného riadku, nielen ich počet. Bez toho by sa z P&L
         * nedalo zistiť, prečo doklad stojí inú sumu než PDF.
         */
        if (b.akcia === "zmaz") {
          const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map((x) => String(x || "")).filter(Boolean).slice(0, 100);
          if (!ids.length) return Response.json({ ok: false, error: "Chýba položka." }, { status: 400 });
          const rs = await DB.prepare(
            `SELECT id, faktura, nazov, cena_czk, date FROM faktura_polozky WHERE id IN (${ids.map(() => "?").join(",")})`,
          ).bind(...ids).all<{ id: string; faktura: string; nazov: string; cena_czk: number; date: string }>();
          const najdene = rs.results || [];
          if (!najdene.length) return Response.json({ ok: false, error: "Položka neexistuje." }, { status: 404 });
          // Uzamknutý mesiac sa nemení — to isté pravidlo ako pri kategórii.
          const mesiace = [...new Set(najdene.map((r) => String(r.date || "").slice(0, 7)))];
          for (const m of mesiace) {
            const zamok = await DB.prepare("SELECT locked FROM vzas_periods WHERE month = ?1").bind(m).first<{ locked: number }>().catch(() => null);
            if (zamok?.locked) return Response.json({ ok: false, error: `Mesiac ${m} je uzamknutý — najprv ho odomkni.` }, { status: 409 });
          }
          await DB.prepare(`DELETE FROM faktura_polozky WHERE id IN (${najdene.map(() => "?").join(",")})`).bind(...najdene.map((r) => r.id)).run();
          const spolu = najdene.reduce((a, r) => a + (Number(r.cena_czk) || 0), 0);
          await audit(DB, {
            action: "faktura-polozka-zmazana",
            month: mesiace[0],
            old: najdene.map((r) => `${r.faktura} · ${r.nazov} · ${r.cena_czk} Kč`).join(" | ").slice(0, 900),
            neu: `zmazaných ${najdene.length}, spolu ${Math.round(spolu)} Kč`,
            actor: (await currentUser(request)) || undefined,
          });
          return Response.json({ ok: true, zmazane: najdene.length, suma: Math.round(spolu * 100) / 100 });
        }

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
