import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Obrázok priložený k nápadu.
 *
 * PREČO VLASTNÁ ADRESA A NIE POLE V NÁPADE
 *
 * Obrázok je desiatky až stovky kilobajtov a plánovač si ťahá dvesto nápadov
 * naraz. V riadku by nafúkol každú odpoveď, aj keď o obrázok vôbec nejde.
 * Takto sa načíta len vtedy, keď ho niekto naozaj otvorí.
 *
 * DVA DRUHY
 *
 * `titulka` — fotka do titulky príspevku.
 * `inspiracia` — snímka cudzieho príspevku pre Jarvisa. Vznikla z núdze:
 * Instagram vracia cloudflarovým adresám HTTP 429, takže metadáta sa
 * stiahnuť nedajú a snímka obrazovky je jediná cesta, ako mu ukázať, o čom
 * ten príspevok bol.
 */

const DRUHY = ["titulka", "inspiracia"] as const;

/**
 * Strop na jeden obrázok.
 *
 * Obrazovka posiela fotku zmenšenú na 1080 px (bežne 30–150 kB). Pol megabajtu
 * je pohodlná rezerva a zároveň hranica, za ktorou by riadok v D1 začal byť
 * problém.
 */
const MAX = 500_000;

export const Route = createFileRoute("/api/napad-obrazok")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        }
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "bez databázy" }, { status: 500 });
        const q = new URL(request.url).searchParams;
        const id = String(q.get("id") || "");
        const druh = String(q.get("druh") || "");
        if (!id || !DRUHY.includes(druh as (typeof DRUHY)[number])) {
          return Response.json({ ok: false, error: "zlý dopyt" }, { status: 400 });
        }
        const r = await DB.prepare(
          "SELECT data_uri, sirka, vyska FROM napad_obrazky WHERE napad_id = ?1 AND druh = ?2",
        ).bind(id, druh).first<{ data_uri: string; sirka: number; vyska: number }>();
        // Prázdno NIE JE chyba — nápad obrázok jednoducho ešte nemá.
        return Response.json({
          ok: true,
          obrazok: r ? { dataUri: r.data_uri, sirka: r.sirka, vyska: r.vyska } : null,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        }
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "bez databázy" }, { status: 500 });

        let b: { id?: unknown; druh?: unknown; dataUri?: unknown; sirka?: unknown; vyska?: unknown };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "nečitateľné telo" }, { status: 400 }); }

        const id = String(b.id || "");
        const druh = String(b.druh || "");
        const dataUri = String(b.dataUri || "");
        if (!id || !DRUHY.includes(druh as (typeof DRUHY)[number])) {
          return Response.json({ ok: false, error: "zlý dopyt" }, { status: 400 });
        }

        // Prázdny reťazec je platná hodnota: „obrázok preč".
        if (!dataUri) {
          await DB.prepare("DELETE FROM napad_obrazky WHERE napad_id = ?1 AND druh = ?2")
            .bind(id, druh).run();
          return Response.json({ ok: true, zmazane: true });
        }
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUri)) {
          return Response.json({ ok: false, error: "to nie je obrázok" }, { status: 400 });
        }
        if (dataUri.length > MAX) {
          return Response.json(
            { ok: false, error: `Obrázok má ${Math.round(dataUri.length / 1024)} kB, strop je ${MAX / 1024} kB.` },
            { status: 413 },
          );
        }

        await DB.prepare(
          `INSERT INTO napad_obrazky (napad_id, druh, data_uri, sirka, vyska, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(napad_id, druh) DO UPDATE SET
             data_uri = excluded.data_uri, sirka = excluded.sirka,
             vyska = excluded.vyska, created_at = excluded.created_at`,
        ).bind(id, druh, dataUri, Number(b.sirka) || 0, Number(b.vyska) || 0,
               new Date().toISOString()).run();
        return Response.json({ ok: true });
      },
    },
  },
});
