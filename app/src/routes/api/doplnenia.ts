import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * KOĽKO HODÍN PRIDALO „DOPLNENIE ČLENSTVA".
 *
 *   GET   → doplnenia bez odpovede (najnovšie prvé) + odpovedané
 *   POST  → { klient, den, hodiny } uloží odpoveď
 *
 * Jerry, 29. 9. 2026: doplnenie nie je predaj. Je to spôsob, ako v PTminderi
 * udržať pri živote hodiny, ktoré klient už mal zaplatené, keď mu skončila
 * platnosť členstva a hodiny v ňom zostali. Koľko ich bolo, rozhodoval
 * prípad od prípadu a export to nenesie — v službách stojí 223× ten istý
 * riadok s cenou 0.
 *
 * Preto sa Kokpit pýta. Kým odpoveď nie je, v tom období nepočíta dlh:
 * vymyslené číslo by išlo klientovi do mailu aj do SMS.
 */

export const Route = createFileRoute("/api/doplnenia")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        /**
         * Prednosť majú doplnenia v PRÁVE BEŽIACOM balíčku — tie menia
         * číslo, ktoré klientovi dnes ide do mailu. Staré sa pýtajú tiež,
         * ale až za nimi: `posledny` je deň posledného členstva klienta.
         */
        const rs = await DB.prepare(
          `SELECT s.client_name klient, substr(s.date,1,10) den, s.price_czk cena,
                  (SELECT MAX(substr(m.date,1,10)) FROM services m
                    WHERE m.client_name = s.client_name AND m.service_type = 'Membership') posledny
             FROM services s
             LEFT JOIN doplnenia_hodiny d
               ON d.klient = s.client_name AND d.den = substr(s.date,1,10)
            WHERE s.service_description LIKE '%oplnen%' AND d.klient IS NULL
            ORDER BY s.date DESC`,
        ).all();
        const odpovedane = await DB.prepare("SELECT COUNT(*) n FROM doplnenia_hodiny").first<{ n: number }>();
        return Response.json({
          ok: true,
          cakaju: rs.results || [],
          odpovedanych: odpovedane?.n ?? 0,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const klient = String(b.klient || "").trim();
        const den = String(b.den || "").slice(0, 10);
        const hodiny = Number(b.hodiny);
        if (!klient || !/^\d{4}-\d{2}-\d{2}$/.test(den)) {
          return Response.json({ ok: false, error: "chýba klient alebo deň" }, { status: 400 });
        }
        // Nula je platná odpoveď („nepridalo nič"), záporné číslo nie je.
        if (!Number.isFinite(hodiny) || hodiny < 0 || hodiny > 100) {
          return Response.json({ ok: false, error: "počet hodín musí byť 0 alebo viac" }, { status: 400 });
        }
        const kto = (await currentUser(request)) || "";
        await DB.prepare(
          "INSERT INTO doplnenia_hodiny (klient, den, hodiny, kto, kedy) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(klient, den) DO UPDATE SET hodiny=excluded.hodiny, kto=excluded.kto, kedy=excluded.kedy",
        ).bind(klient, den, hodiny, kto, new Date().toISOString()).run();
        await audit(DB, { action: "doplnenie-hodiny", predmet: `${klient} · ${den}`, neu: `${hodiny} h`, actor: kto });
        return Response.json({ ok: true });
      },
    },
  },
});
