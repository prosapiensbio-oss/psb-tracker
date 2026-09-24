import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { nepriradene, porovnajPlatby, smieSaZapamatat, vzorPlatby, type FioRiadok, type Platba } from "../../lib/psb/platbyEvidencia";

/**
 * Vlastná evidencia platieb: banka z výpisu, hotovosť zo zošita.
 *
 * Tretia a posledná tretina plánu z 22. 9. 2026. Prvé dve merajú
 * `/api/kalendar` → `porovnanie` (dochádzka) a `/api/balicky` (hodiny).
 *
 * BANKA SA NENALIEVA CELÁ NARAZ
 *
 * Pri balíčkoch sa dal vziať export a založiť z neho riadky, lebo v ňom
 * klient STOJÍ. Vo výpise nestojí — je v texte, niekedy v správe, niekedy
 * v mene odosielateľa a niekedy nikde. Hromadné naliatie by preto priradilo
 * peniaze cudzím ľuďom. Priraďuje sa po jednom, appka navrhne a človek
 * potvrdí; naučené priradenie sa pamätá podľa odosielateľa, takže ten istý
 * platiteľ sa pýta raz.
 */

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();
const denISO = (s: unknown) => {
  const v = String(s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
};

type PlatbaRiadok = {
  id: string; klient: string; datum: string; suma_czk: number; sposob: string;
  fio_id: string | null; poznamka: string | null; zrusene_at: string | null;
};

const naPlatbu = (r: PlatbaRiadok): Platba => ({
  id: r.id, klient: r.klient, datum: r.datum, sumaCzk: r.suma_czk,
  sposob: r.sposob, fioId: r.fio_id, zruseneAt: r.zrusene_at,
});

/** Ručné spôsoby platby. Fio si svoje riadky značí samo cez fio_id. */
const SPOSOBY = ["hotovost", "prevod", "bitcoin", "ine"];

export const Route = createFileRoute("/api/platby")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        /**
         * Platby jedného klienta — pre jeho profil.
         * Celá odpoveď nižšie ťahá aj výpis z banky a porovnanie s PTminderom;
         * na profil to je zbytočná práca, ktorú by človek čakal pri každom
         * kliknutí na meno.
         */
        // Meno sa NEPOROVNÁVA v SQL: „Tomáš Dvořák" a „Tomas Dvorak" sú v D1
        // dva rôzne reťazce a klientovi by jeho vlastná platba zmizla.
        // Tabuľka má stovky riadkov, takže sa vráti celá a triedi sa hore.
        if (new URL(request.url).searchParams.has("klient")) {
          const r = await DB.prepare(
            "SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at FROM platby ORDER BY datum DESC",
          ).all();
          return Response.json({ ok: true, platby: r.results || [] });
        }

        const [vlastne, fio, mapa, nieKlient, mena, pt, horizont] = await DB.batch([
          DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at FROM platby ORDER BY datum DESC"),
          DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE amount_czk > 0 ORDER BY date DESC"),
          DB.prepare("SELECT vzor, klient FROM platba_mapovanie"),
          DB.prepare("SELECT fio_id FROM platba_nie_klient"),
          DB.prepare("SELECT DISTINCT client_name FROM sessions WHERE date >= date('now','-400 days')"),
          DB.prepare("SELECT client_name, date, amount_czk, payment_method FROM payments"),
          DB.prepare("SELECT MAX(substr(date,1,10)) den FROM sessions"),
        ]);

        const platby = ((vlastne.results || []) as unknown as PlatbaRiadok[]);
        const mapovanie: Record<string, string> = {};
        for (const m of ((mapa.results || []) as unknown as { vzor: string; klient: string }[])) mapovanie[m.vzor] = m.klient;
        const poExport = String(((horizont.results || [])[0] as { den?: string } | undefined)?.den || new Date().toISOString().slice(0, 10));

        /**
         * Odkedy sa porovnáva — a prečo to nie je „odjakživa".
         *
         * Bankové platby sa dajú doplniť spätne z výpisu, HOTOVOSŤ nie:
         * tá je v zošite a nikto ju rok dozadu prepisovať nebude. V starších
         * mesiacoch by teda rozdiel ukazoval chýbajúcu hotovosť, nie chybu —
         * a cieľ „rozdiel nula" by bol nedosiahnuteľný. Súbežný chod preto
         * začína mesiacom, ktorý si Jerry zvolí (`platby_od`); staršie
         * bankové platby v evidencii zostávajú, len sa nesúdia.
         */
        const odMesiaca = String(
          (await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'platby_od'").first<{ value: string }>())?.value || "",
        ).replace(/"/g, "") || new Date().toISOString().slice(0, 7);

        const ptPlatby = ((pt.results || []) as unknown as { client_name: string; date: string; amount_czk: number; payment_method: string }[])
          .map((p) => ({ klient: p.client_name, datum: p.date, suma: p.amount_czk, metoda: p.payment_method }));
        const vsetkyNepriradene = nepriradene(
          (fio.results || []) as unknown as FioRiadok[],
          platby.map(naPlatbu),
          mapovanie,
          new Set(((nieKlient.results || []) as unknown as { fio_id: string }[]).map((x) => x.fio_id)),
          ((mena.results || []) as unknown as { client_name: string }[]).map((x) => x.client_name),
          ptPlatby,
        );
        const celkomNepriradenych = vsetkyNepriradene.length;

        return Response.json({
          ok: true,
          platby,
          nepriradene: vsetkyNepriradene.slice(0, 120),
          porovnanie: porovnajPlatby(
            platby.map(naPlatbu),
            ptPlatby,
            poExport,
            odMesiaca,
          ),
          poExport,
          odMesiaca,
          celkomNepriradenych,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }
        const akcia = String(b.akcia || "");
        const kto = await currentUser(request) || undefined;

        /** Riadok výpisu → platba klienta. `zapamataj` uloží aj pravidlo. */
        if (akcia === "priradz") {
          const fioId = String(b.fioId || "");
          const klient = String(b.klient || "").trim();
          if (!fioId || !klient) return Response.json({ ok: false, error: "Chýba platba alebo klient." }, { status: 400 });
          const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
            .bind(fioId).first<FioRiadok>();
          if (!r) return Response.json({ ok: false, error: "Riadok výpisu neexistuje." }, { status: 404 });
          const prikazy = [
            DB.prepare(
              "INSERT OR IGNORE INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor) VALUES (?,?,?,?,'banka',?,?,?,?)",
            ).bind(uid(), klient, r.date.slice(0, 10), r.amount_czk, fioId, (r.counterparty || "").slice(0, 200), teraz(), kto || null),
          ];
          // Pravidlo sa učí LEN vtedy, keď je klient priamo v odosielateľovi.
          // Inak by sa naučilo zo sprostredkovaného prevodu a každý ďalší
          // prevod tej istej osoby by appka ponúkala ako platbu toho klienta.
          const vzor = vzorPlatby(r);
          const naucil = !!b.zapamataj && smieSaZapamatat(vzor, klient);
          if (naucil) {
            prikazy.push(DB.prepare("INSERT OR REPLACE INTO platba_mapovanie (vzor, klient, potvrdene_at) VALUES (?,?,?)")
              .bind(vzor, klient, teraz()));
          }
          await DB.batch(prikazy);
          await audit(DB, { action: "platba-priradena", predmet: klient, neu: `${r.amount_czk} Kč · ${r.date.slice(0, 10)}`, actor: kto });
          return Response.json({ ok: true, zapamatane: naucil });
        }

        /**
         * „Toto nie je platba klienta" — nájom, vrátenie, vlastný prevod.
         * Nemaže sa nič z výpisu; len sa prestane pýtať.
         */
        if (akcia === "nieKlient") {
          const fioId = String(b.fioId || "");
          if (!fioId) return Response.json({ ok: false, error: "Chýba platba." }, { status: 400 });
          await DB.prepare("INSERT OR REPLACE INTO platba_nie_klient (fio_id, dovod, oznacene_at) VALUES (?,?,?)")
            .bind(fioId, String(b.dovod || "").slice(0, 200) || null, teraz()).run();
          return Response.json({ ok: true });
        }

        /** Hotovosť zo zošita — jediné miesto, kde sa píše ručne. */
        if (akcia === "hotovost") {
          const klient = String(b.klient || "").trim();
          const datum = denISO(b.datum);
          const suma = Number(b.suma) || 0;
          if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
          if (!datum) return Response.json({ ok: false, error: "Chýba dátum (RRRR-MM-DD)." }, { status: 400 });
          if (suma <= 0) return Response.json({ ok: false, error: "Suma musí byť kladná." }, { status: 400 });
          const sposob = SPOSOBY.includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          await DB.prepare(
            "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor) VALUES (?,?,?,?,?,NULL,?,?,?)",
          ).bind(uid(), klient, datum, suma, sposob, String(b.poznamka || "").slice(0, 300) || null, teraz(), kto || null).run();
          await audit(DB, { action: "platba-hotovost", predmet: klient, neu: `${suma} Kč · ${datum}`, actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * Oprava ručnej platby — preklep v sume alebo dátume.
         * Platby z banky sa neupravujú: ich pravdou je výpis, nie Kokpit.
         */
        if (akcia === "uprav") {
          const id = String(b.id || "");
          const datum = denISO(b.datum);
          const suma = Number(b.suma) || 0;
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          if (!datum) return Response.json({ ok: false, error: "Chýba dátum (RRRR-MM-DD)." }, { status: 400 });
          if (suma <= 0) return Response.json({ ok: false, error: "Suma musí byť kladná." }, { status: 400 });
          const stav = await DB.prepare("SELECT fio_id FROM platby WHERE id = ?").bind(id).first<{ fio_id: string | null }>();
          if (!stav) return Response.json({ ok: false, error: "Platba sa nenašla." }, { status: 404 });
          if (stav.fio_id) return Response.json({ ok: false, error: "Platbu z banky upraviť nejde — pravdou je výpis." }, { status: 400 });
          const sposob = SPOSOBY.includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          await DB.prepare(
            "UPDATE platby SET datum=?, suma_czk=?, sposob=?, poznamka=? WHERE id=?",
          ).bind(datum, suma, sposob, String(b.poznamka || "").slice(0, 300) || null, id).run();
          await audit(DB, { action: "platba-upravena", predmet: id, neu: `${suma} Kč · ${datum}`, actor: kto });
          return Response.json({ ok: true });
        }

        /** Zrušenie NEMAŽE — platba je záznam v knihe, nie riadok v tabuľke. */
        if (akcia === "zrus" || akcia === "vrat") {
          const id = String(b.id || "");
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          await DB.prepare("UPDATE platby SET zrusene_at = ? WHERE id = ?").bind(akcia === "zrus" ? teraz() : null, id).run();
          await audit(DB, { action: akcia === "zrus" ? "platba-zrusena" : "platba-vratena", predmet: id, actor: kto });
          return Response.json({ ok: true });
        }

        /** Odkedy sa súbežný chod súdi. Staršie mesiace zostávajú v evidencii. */
        if (akcia === "odMesiaca") {
          const m = String(b.mesiac || "").slice(0, 7);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return Response.json({ ok: false, error: "Mesiac musí byť RRRR-MM." }, { status: 400 });
          await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES ('platby_od',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(JSON.stringify(m)).run();
          await audit(DB, { action: "platby-od", predmet: m, actor: kto });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
      },
    },
  },
});
