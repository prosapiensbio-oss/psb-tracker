import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { posunDen, dnesPraha } from "../lib/psb/cas";
import { feedKlienta, platformaZAgenta, type UdalostFeedu } from "../lib/psb/kalendarMobil";
import { TRENERI } from "../lib/psb/mailFaktury";

/**
 * KALENDÁR KLIENTA PRE TELEFÓN — `/k/<token>/kalendar.ics` (7. 10. 2026).
 *
 * Toto si telefón (alebo Google Kalendár) sťahuje sám, pravidelne. Je v ňom
 * LEN to, čo patrí klientovi: jeho živé tréningy z kalendárov trénerov
 * (zrušené sa z neho stratia). Kalendár trénera klient nikdy nevidí.
 *
 * Každé stiahnutie sa zapíše (kedy, čím) — tak Kokpit vie, kto kalendár
 * naozaj odoberá. Zápis nesmie zhodiť odpoveď.
 */
const prazdny = () => new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ProSapiens Biomechanic//Kokpit//CS\r\nX-WR-CALNAME:ProSapiens\r\nEND:VCALENDAR\r\n", {
  headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-cache, max-age=0" },
});

export const Route = createFileRoute("/k/$token/kalendar.ics")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return new Response("Neplatí.", { status: 404 });
        const r = await DB.prepare("SELECT klient, zrusene_at FROM klient_kalendar WHERE token = ?1").bind(token)
          .first<{ klient: string; zrusene_at: string | null }>().catch(() => null);
        if (!r) return new Response("Neplatí.", { status: 404 });
        // Zneplatnený odkaz vráti PRÁZDNY kalendár, nie chybu — telefón tak
        // tréningy zmaže, namiesto toho, aby navždy ukazoval staré.
        if (r.zrusene_at) return prazdny();

        const dnes = dnesPraha();
        const udalosti = ((await DB.prepare(
          `SELECT uid, trener, zaciatok, koniec FROM kal_udalosti
            WHERE klient = ?1 AND zmizla_at IS NULL
              AND (typ IS NULL OR typ IN ('trening', 'uvodny'))
              AND zaciatok >= ?2 AND zaciatok < ?3`,
        ).bind(r.klient, posunDen(dnes, -60), posunDen(dnes, 200)).all().catch(() => ({ results: [] }))).results || []) as unknown as UdalostFeedu[];

        await DB.prepare("UPDATE klient_kalendar SET posledne_stiahnutie = ?2, pocet = pocet + 1, platforma = ?3 WHERE token = ?1")
          .bind(token, new Date().toISOString(), platformaZAgenta(request.headers.get("user-agent") || "")).run().catch(() => null);

        const t = (meno: string) => {
          const x = TRENERI[meno] || TRENERI.Jerry;
          return { krstne: x.krstne, telefon: x.telefon };
        };
        return new Response(feedKlienta(udalosti, t), {
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": "inline; filename=prosapiens.ics",
            "cache-control": "no-cache, max-age=0",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
