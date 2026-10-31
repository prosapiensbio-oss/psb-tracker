import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { dnesPraha, mesiacPraha } from "../../lib/psb/cas";
import { loadData } from "../../lib/psb/db.server";
import { mzdoveHodiny, narokJerryho } from "../../lib/psb/mzdoveHodiny";
import { NAVYSE } from "../../lib/psb/hodinyNavyse";
import { CURRENT_ERA } from "../../lib/psb/vzas";

// Most pre Jerryho súkromnú appku Peniaze manažér (worker `peniaze`).
//
// GET ?od=YYYY-MM-DD → { ok, results: [{ id, date, suma, counterparty, note, typ, kat }],
//                        narok: [{ mesiac, hodiny, narok, beziaci, planovane?, hodinySpolu?, narokOdhad? }], model: { fix, prah, sadzba } }
//
// Vracia LEN Jerryho čerpanie z Fio: `vyplaty.jerry` (prevody na Air Bank aj
// platby kartou), `spolocne.*` (spoločné s Terezkou) a výplaty bez mena
// a delené (`vyplaty`, `vyplaty.delene`) — pri posledných troch je jeho polovica.
// Nič iné z Kokpitu (klienti, Terezkine výplaty, tržby) sem nejde.
//
// Od 29. 10. 2026 aj:
//  - `polozky`: rozdelené položky faktúr z Alzy (`faktura_polozky`) s kategóriou
//    vyplaty.jerry alebo spolocne.* — nákup bitcoinom inak v Kasičke nie je nikde.
//    Suma je `cena_czk` (celý riadok); `ks` je pri Alze nespoľahlivé (120 kapsúl).
//  - `vratky`: platby z Fio mimo Jerryho kategórií, ku ktorým do 3 dní prišla na Fio
//    rovnaká suma späť (lekáreň 560, PANE 286/407) — Jerry ich firme vrátil, takže sú
//    jeho výdavok. Kasička si ich spáruje so svojím odchodom na Fio.
//
// Prístup je len tokenom `PENIAZE_TOKEN` v hlavičke, nie prihlásením do Kokpitu:
// volá ho druhý worker cez service binding a token nepustí nikam inam. Preto
// zámerne NEPOUŽÍVA currentUser() — tam by token Strižne-štýlu otvoril celý Kokpit.
function rovnake(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/peniaze-manazer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ocakavany = (bindings() as unknown as { PENIAZE_TOKEN?: string }).PENIAZE_TOKEN;
        const token = request.headers.get("x-peniaze-token") || "";
        if (!ocakavany || ocakavany.length < 32 || !rovnake(token, ocakavany)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const od = new URL(request.url).searchParams.get("od") || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(od)) return Response.json({ ok: false, error: "bad_od" }, { status: 400 });
        const rs = await DB.prepare(
          `SELECT id, date, amount_czk AS suma, counterparty, note, typ, category AS kat
             FROM fio_transactions
            WHERE date >= ?1 AND (category IN ('vyplaty.jerry', 'vyplaty', 'vyplaty.delene') OR category LIKE 'spolocne.%')
            ORDER BY date LIMIT 5000`,
        ).bind(od).all();
        const polozky = await DB.prepare(
          `SELECT id, faktura, date, nazov, cena_czk AS suma, category AS kat
             FROM faktura_polozky
            WHERE date >= ?1 AND lower(dodavatel) LIKE '%alza%'
              AND (category = 'vyplaty.jerry' OR category LIKE 'spolocne.%')
            ORDER BY date LIMIT 5000`,
        ).bind(od).all();
        const vratky = await DB.prepare(
          `SELECT a.id, a.date, a.amount_czk AS suma, a.counterparty, a.note, a.category AS kat
             FROM fio_transactions a
            WHERE a.date >= ?1 AND a.amount_czk < 0
              AND NOT (a.category IN ('vyplaty.jerry', 'vyplaty', 'vyplaty.delene') OR a.category LIKE 'spolocne.%')
              AND EXISTS (SELECT 1 FROM fio_transactions b
                           WHERE b.amount_czk = -a.amount_czk
                             AND abs(julianday(b.date) - julianday(a.date)) <= 3)
            ORDER BY a.date LIMIT 500`,
        ).bind(od).all();
        // Nárok z tých istých sedení a toho istého vzorca ako dlh trénera v Kokpite.
        const data = await loadData(DB);
        // Hodiny len po dnešok — kalendár nesie aj budúce termíny (ako strážca výberov).
        const dnes = dnesPraha();
        const mesiac = mesiacPraha();
        const narok = narokJerryho(mzdoveHodiny(data.sessions.filter((s) => s.date.slice(0, 10) <= dnes)), od, mesiac, data.hodinyNavyse || {});
        // Termíny v kalendári do konca bežiaceho mesiaca (Jerry 30. 10. 2026): Kasička nimi
        // nahradí odhad podľa tempa — na konci mesiaca tempo rátalo hodiny, ktoré už neprídu.
        const buduce = mzdoveHodiny(data.sessions.filter((s) => s.date.slice(0, 10) > dnes && s.date.slice(0, 7) === mesiac))[mesiac];
        // Odhad celého mesiaca počíta LEN Kokpit (Jerry 31. 10. 2026: nárok na jednom mieste) —
        // Kasička ho ukazuje tak, ako príde: odrobené + v kalendári, tým istým vzorcom.
        for (const n of narok) {
          if (!n.beziaci) continue;
          const planovane = Math.round((buduce?.jerry || 0) * 100) / 100;
          const spolu = Math.round((n.hodiny + planovane) * 100) / 100;
          Object.assign(n, {
            planovane,
            hodinySpolu: spolu,
            narokOdhad: Math.round(CURRENT_ERA.fix + (spolu - CURRENT_ERA.hoursThreshold) * CURRENT_ERA.hourlyRate + n.navyse),
          });
        }
        const model = {
          fix: CURRENT_ERA.fix, prah: CURRENT_ERA.hoursThreshold, sadzba: CURRENT_ERA.hourlyRate,
          // Model A (26. 10. 2026): hodiny navyše × 450, max 40 h — už sú v `narok`.
          navyseOd: NAVYSE.od, navyseSadzba: NAVYSE.sadzba, navyseStrop: NAVYSE.stropHodin,
        };
        return Response.json({ ok: true, results: rs.results || [], polozky: polozky.results || [], vratky: vratky.results || [], narok, model });
      },
    },
  },
});
