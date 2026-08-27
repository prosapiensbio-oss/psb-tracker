import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Výsledky klientov — bolesť na stupnici 0–10 v čase.
 *
 *   GET  ?name=…   → merania jedného klienta, najnovšie prvé
 *   GET            → posledné meranie každého klienta (na prehľad)
 *   POST           → nové meranie (pridáva sa, neprepisuje)
 *
 * Zámerne bez mazania: príbeh „v januári 7, v máji 3" je celá hodnota tejto
 * tabuľky a jedno prepisovateľné políčko by ho zmazalo pri prvom zápise.
 */

type Riadok = { id: string; klient: string; datum: string; bolest: number | null; poznamka: string; autor: string };

export const Route = createFileRoute("/api/merania")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const meno = new URL(request.url).searchParams.get("name") || "";
        try {
          if (meno) {
            const r = await DB.prepare(
              `SELECT id, klient, datum, bolest, poznamka, autor FROM klient_merania
                WHERE klient = ?1 ORDER BY datum DESC, created_at DESC`,
            ).bind(meno).all<Riadok>();
            return Response.json({ ok: true, merania: r.results || [] });
          }
          // Bez mena: prvé a posledné meranie každého klienta. Z toho sa dá
          // povedať jediná vec, na ktorej záleží — či sa niekto zlepšil.
          const r = await DB.prepare(
            `SELECT klient,
                    COUNT(*) AS pocet,
                    MIN(datum) AS prve_datum,
                    MAX(datum) AS posledne_datum
               FROM klient_merania WHERE bolest IS NOT NULL
              GROUP BY klient`,
          ).all<{ klient: string; pocet: number; prve_datum: string; posledne_datum: string }>();
          const von = [];
          for (const k of r.results || []) {
            const prve = await DB.prepare(
              "SELECT bolest FROM klient_merania WHERE klient = ?1 AND datum = ?2 AND bolest IS NOT NULL ORDER BY created_at LIMIT 1",
            ).bind(k.klient, k.prve_datum).first<{ bolest: number }>();
            const posledne = await DB.prepare(
              "SELECT bolest FROM klient_merania WHERE klient = ?1 AND datum = ?2 AND bolest IS NOT NULL ORDER BY created_at DESC LIMIT 1",
            ).bind(k.klient, k.posledne_datum).first<{ bolest: number }>();
            von.push({
              klient: k.klient, pocet: k.pocet,
              prveDatum: k.prve_datum, prva: prve?.bolest ?? null,
              posledneDatum: k.posledne_datum, posledna: posledne?.bolest ?? null,
            });
          }
          return Response.json({ ok: true, klienti: von });
        } catch {
          // Tabuľka ešte nemusí byť — obrazovka si vystačí s prázdnym.
          return Response.json({ ok: true, merania: [], klienti: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const klient = String(b.klient ?? "").trim().slice(0, 120);
        if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });

        // Prázdna hodnota je platná — meranie sa mohlo neurobiť a poznámka
        // aj tak stojí za zápis. Mimo rozsah 0–10 ale nie: to je preklep.
        const cislo = b.bolest === null || b.bolest === undefined || b.bolest === "" ? null : Number(b.bolest);
        if (cislo !== null && (!Number.isFinite(cislo) || cislo < 0 || cislo > 10)) {
          return Response.json({ ok: false, error: "Bolesť musí byť 0 až 10." }, { status: 400 });
        }
        const poznamka = String(b.poznamka ?? "").slice(0, 500);
        if (cislo === null && !poznamka.trim()) {
          return Response.json({ ok: false, error: "Zapíš číslo alebo poznámku." }, { status: 400 });
        }

        const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(b.datum)) ? String(b.datum) : new Date().toISOString().slice(0, 10);
        const id = crypto.randomUUID();
        const autor = (await currentUser(request)) || "";
        try {
          await DB.prepare(
            `INSERT INTO klient_merania (id, klient, datum, bolest, poznamka, autor, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          ).bind(id, klient, datum, cislo === null ? null : Math.round(cislo), poznamka, autor, new Date().toISOString()).run();
          await audit(DB, {
            action: "meranie", predmet: klient,
            neu: cislo === null ? "bez čísla" : `bolesť ${Math.round(cislo)}/10`,
            actor: autor || undefined,
          });
          return Response.json({ ok: true, id });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
