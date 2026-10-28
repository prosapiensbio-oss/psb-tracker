import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { isAuthed } from "../../lib/psb/auth.server";
import { btcVyplatyJerryho } from "../../lib/psb/btcVyplaty.server";
import { dnesPraha, mesiacPraha } from "../../lib/psb/cas";
import { loadData } from "../../lib/psb/db.server";
import { mzdoveHodiny } from "../../lib/psb/mzdoveHodiny";
import { posli, type Odber } from "../../lib/psb/push.server";
import { cerpanieMesiaca, narokPodlaTempa, rozhodni, rozhodniZalohu, stropZalohy, zalohyMesiaca, type PohybFio, type StavStrazcu } from "../../lib/psb/strazcaVyberu";
import { platbaNavyse } from "../../lib/psb/hodinyNavyse";
import { CURRENT_ERA } from "../../lib/psb/vzas";

// Strážca výberov pre Peniaze manažér — beh plánovača po stiahnutí banky.
// Vlastná požiadavka (loadData + push), aby prípadný pád nezhodil inú prácu
// (limit CPU, 29. 8. 2026). `?skuska=1` len spočíta a nič nepošle ani nezapíše.
//
// Ide LEN Jerrymu: sú to jeho súkromné peniaze, Terezka ich nevidí.

const PENIAZE = "https://peniaze.prosapiensbio.workers.dev/";
const KLUC = "strazca_vyberu";

export const Route = createFileRoute("/api/strazca-vyberu")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        const token = env.KAL_CRON_TOKEN;
        const dany = request.headers.get("x-cron-token") || "";
        const skuska = new URL(request.url).searchParams.get("skuska") === "1";
        // Plánovač s tokenom; prihlásený človek smie len skúšku (nič nepošle ani nezapíše).
        const odPlanovaca = !!token && token.length === dany.length && token === dany;
        if (!odPlanovaca && !(skuska && (await isAuthed(request)))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const DB = env.DB;
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        const dnes = dnesPraha();
        const mesiac = mesiacPraha();
        const minuly = mesiacPraha(new Date(), -1);
        const den = Number(dnes.slice(8, 10));
        const dniVMesiaci = new Date(Number(mesiac.slice(0, 4)), Number(mesiac.slice(5, 7)), 0).getDate();

        const [data, fioRs, stavRs] = await Promise.all([
          loadData(DB),
          DB.prepare(
            `SELECT date, amount_czk AS suma, category AS kat FROM fio_transactions
              WHERE date >= ?1 AND (category IN ('vyplaty.jerry', 'vyplaty', 'vyplaty.delene') OR category LIKE 'spolocne.%')`,
          ).bind(`${mesiac}-01`).all(),
          DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC).first<{ value: string }>(),
        ]);

        // hodiny len po dnešok — kalendár nesie aj budúce termíny
        const hodiny = mzdoveHodiny(data.sessions.filter((s) => s.date.slice(0, 10) <= dnes));
        const model = { fix: CURRENT_ERA.fix, prah: CURRENT_ERA.hoursThreshold, sadzba: CURRENT_ERA.hourlyRate };
        // Hodiny navyše (model A od 10/2026): minulý mesiac celé, bežiaci podľa tempa.
        const nav = data.hodinyNavyse || {};
        const navTeraz = nav[mesiac] ? { jerry: (nav[mesiac].jerry / Math.max(1, den)) * dniVMesiaci, terezka: (nav[mesiac].terezka / Math.max(1, den)) * dniVMesiaci } : undefined;
        const minulyNarok = hodiny[minuly] ? model.fix + (hodiny[minuly].jerry - model.prah) * model.sadzba + platbaNavyse(minuly, nav[minuly]).jerry : null;
        const tempo = narokPodlaTempa(model, hodiny[mesiac]?.jerry || 0, den, dniVMesiaci, minulyNarok);
        const narok = tempo.podlaTempa ? { ...tempo, narok: tempo.narok + platbaNavyse(mesiac, navTeraz).jerry } : tempo;
        // Výplaty v bitcoine (výber s „vyplat“ alebo presun Muun → Blink) sa
        // rátajú ako výplata z Fio — do čerpania aj do zálohy (28. 10. 2026).
        const btc = await btcVyplatyJerryho();
        const pohyby = [...(fioRs.results as unknown as PohybFio[]), ...(btc || []).filter((p) => p.date >= `${mesiac}-01`)];
        const cerpanie = cerpanieMesiaca(pohyby, mesiac);
        let posledny: StavStrazcu = null;
        try { posledny = stavRs?.value ? JSON.parse(stavRs.value) : null; } catch { /* starý zápis */ }
        /**
         * Od novembra 2026 (výplata 3. za predošlý mesiac) sa stráži ZÁLOHA
         * počas mesiaca proti dohodnutému stropu — výplata 3. by inak sama
         * vyzerala ako výber nad nárok bežiaceho mesiaca.
         */
        const strop = stropZalohy(mesiac);
        const zalohy = zalohyMesiaca(pohyby, mesiac);
        const r = strop === null ? rozhodni(mesiac, cerpanie, narok, posledny) : rozhodniZalohu(mesiac, zalohy, strop, posledny);
        const suhrn = { mesiac, cerpanie, narok: narok.narok, podlaTempa: narok.podlaTempa, hodinyDoteraz: hodiny[mesiac]?.jerry || 0, zalohy, stropZalohy: strop,
          btcVyplaty: btc === null ? "kniha neodpovedala" : btc.filter((p) => p.date >= `${mesiac}-01`).reduce((x, p) => x - p.suma, 0) };

        if (!r.poslat || skuska) return Response.json({ ok: true, ...suhrn, poslat: r.poslat, text: r.poslat ? r.text : undefined, skuska });

        const [kluceRs, odberyRs] = await Promise.all([
          DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all(),
          DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all(),
        ]);
        const m = Object.fromEntries((kluceRs.results as { key: string; value: string }[]).map((x) => [x.key, x.value]));
        if (!m.vapid_public || !m.vapid_private) return Response.json({ ok: false, error: "chybaju_kluce" }, { status: 500 });
        const kluce = { verejny: m.vapid_public, sukromny: m.vapid_private, kontakt: "mailto:prosapiensbio@gmail.com" };
        const jerryho = (odberyRs.results as unknown as (Odber & { kto: string })[]).filter((o) => o.kto.trim().toLowerCase() === "jerry");
        if (!jerryho.length) return Response.json({ ok: false, ...suhrn, error: "Jerry nemá na telefóne zapnuté notifikácie Kokpitu" }, { status: 409 });

        let poslanych = 0;
        const chyby: string[] = [];
        for (const o of jerryho) {
          const v = await posli(o, { titulok: r.titulok, text: r.text, url: PENIAZE, znacka: "strazca-vyberu" }, kluce);
          if (v.mrtvy) await DB.prepare("DELETE FROM push_odbery WHERE endpoint = ?1").bind(o.endpoint).run();
          if (v.ok) poslanych++; else chyby.push(`${v.status}: ${v.chyba || ""}`.slice(0, 120));
        }
        // Zapísať len keď aspoň jedna prešla — inak by sa upozornenie stratilo.
        if (poslanych) {
          await DB.prepare("INSERT INTO vzas_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(KLUC, JSON.stringify({ mesiac, prah: r.prah })).run();
        }
        return Response.json({ ok: poslanych > 0, ...suhrn, poslanych, chyby }, { status: poslanych ? 200 : 502 });
      },
    },
  },
});
