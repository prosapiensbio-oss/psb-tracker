import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { deriveClients, TRAINERS } from "../../lib/psb/compute";
import { loadData } from "../../lib/psb/db.server";
import { jeCasPripomienky, textPripomienky, type CakaNaSpravu } from "../../lib/psb/nedelnaPripomienka";
import { posli, type Odber } from "../../lib/psb/push.server";

/**
 * NEDEĽNÁ PRIPOMIENKA — KOMU NAPÍSAŤ.
 *
 * Jerry, 29. 9. 2026: „notifikácia pre tú SMS by prišla v nedeľu cez obed
 * alebo podvečer, keď by malo teoreticky všetko sedieť."
 *
 * Cron môže chodiť každú hodinu; o tom, či je čas, rozhoduje
 * `jeCasPripomienky` v kóde. Rozvrh v cudzej službe je miesto, ku ktorému sa
 * človek dostane raz za rok a nikto nevie, čo tam stojí.
 *
 * NIČ SA NEODOSIELA KLIENTOM. Správa len povie, kto čaká, a otvorí Kopu.
 */

const KONTAKT = "mailto:prosapiensbio@gmail.com";
const trenerKonta = (kto: string) => TRAINERS.find((t) => t.toLowerCase() === kto.trim().toLowerCase()) || "";

async function kluce(DB: D1Database) {
  const rs = await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all();
  const m: Record<string, string> = {};
  for (const r of rs.results as { key: string; value: string }[]) m[r.key] = r.value;
  return { verejny: m.vapid_public || "", sukromny: m.vapid_private || "", kontakt: KONTAKT };
}

export const Route = createFileRoute("/api/push-nedela")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { DB, KAL_CRON_TOKEN } = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        const dany = request.headers.get("x-cron-token") || "";
        const token = KAL_CRON_TOKEN || "";
        if (!token || token.length !== dany.length || token !== dany) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        // `?nasilu=1` je na vyskúšanie z ruky — inak by sa to dalo overiť
        // len v nedeľu na obed.
        const nasilu = new URL(request.url).searchParams.get("nasilu") === "1";
        if (!nasilu && !jeCasPripomienky()) return Response.json({ ok: true, poslane: 0, dovod: "nie_je_cas" });

        const odbery = (await DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all())
          .results as unknown as (Odber & { kto: string })[];
        if (!odbery.length) return Response.json({ ok: true, poslane: 0, dovod: "ziadne_odbery" });

        const k = await kluce(DB);
        if (!k.verejny || !k.sukromny) return Response.json({ ok: false, error: "chybaju_kluce" }, { status: 500 });

        const data = await loadData(DB);
        const clients = deriveClients(data);

        /**
         * Kto čaká na správu: aktívny klient, ktorý má balíček dochodený
         * alebo je v mínuse.
         *
         * Klient bez balíčka (`packageTotal = 0`) sem NEPATRÍ — o tom sa
         * nedá povedať, že mu hodiny došli; on si žiadne nekúpil a je to
         * iný telefonát.
         */
        const caka: CakaNaSpravu[] = Object.values(clients)
          .filter((c) => c.status === "Aktívny" && c.packageTotal > 0 && c.packageRemaining <= 0)
          .map((c) => ({
            meno: c.name,
            trener: c.primaryTrainer || "",
            zostatok: c.packageRemaining,
            odvodene: !!c.packageOdvodeny,
          }));

        /**
         * Nerozhodnuté „bol tam?" hodiny sú PODMIENKA, nie vedľajšia
         * informácia: kým sa nevie, kto prišiel, niektoré z tých zostatkov
         * sú vedľa a správa by odišla na zlé číslo.
         */
        const sporne = (await DB.prepare(
          `SELECT u.klient, u.trener FROM kal_udalosti u
             LEFT JOIN kal_konanie kk ON kk.uid = u.uid AND kk.trener = u.trener
            WHERE u.zmizla_at IS NOT NULL AND u.zmizla_at > u.koniec
              AND u.typ IN ('trening','uvodny') AND u.klient IS NOT NULL AND kk.uid IS NULL
              AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.client_name = u.klient AND substr(s.date,1,10) = substr(u.zaciatok,1,10))`,
        ).all()).results as unknown as { klient: string; trener: string }[];

        let poslane = 0;
        for (const o of odbery) {
          const trener = trenerKonta(o.kto);
          // Bez rozpoznaného trénera ide celý zoznam: upozornenie navyše je
          // lepšie než stratené (rovnaké pravidlo ako v rannej dávke).
          const moje = trener ? caka.filter((x) => x.trener === trener) : caka;
          const mojeSporne = trener ? sporne.filter((x) => x.trener === trener) : sporne;
          const sprava = textPripomienky(moje, mojeSporne.length);
          if (!sprava) continue;
          const v = await posli(o, { titulok: sprava.titulok, text: sprava.text, url: "/#workspace", znacka: "nedela" }, k);
          if (v.ok) poslane += 1;
          // Odber, ktorý prehliadač zrušil, sa zmaže — inak by sa doň búchalo
          // každú nedeľu donekonečna.
          if (v.mrtvy) {
            await DB.prepare("DELETE FROM push_odbery WHERE endpoint = ?").bind(o.endpoint).run();
          }
        }
        return Response.json({ ok: true, poslane, caka: caka.length, sporne: sporne.length });
      },
    },
  },
});
