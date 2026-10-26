import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { mesiacPraha } from "../../lib/psb/cas";
import { loadData } from "../../lib/psb/db.server";
import { mzdoveHodiny, narokJerryho } from "../../lib/psb/mzdoveHodiny";

// Most pre Jerryho súkromnú appku Peniaze manažér (worker `peniaze`).
//
// GET ?od=YYYY-MM-DD → { ok, results: [{ id, date, suma, counterparty, note, typ, kat }],
//                        narok: [{ mesiac, hodiny, narok, beziaci }] }
//
// Vracia LEN Jerryho čerpanie z Fio: `vyplaty.jerry` (prevody na Air Bank aj
// platby kartou z Fio) a `spolocne.*` (spoločné s Terezkou, jeho je polovica).
// Nič iné z Kokpitu (klienti, Terezkine výplaty, tržby) sem nejde.
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
            WHERE date >= ?1 AND (category = 'vyplaty.jerry' OR category LIKE 'spolocne.%')
            ORDER BY date LIMIT 5000`,
        ).bind(od).all();
        // Nárok z tých istých sedení a toho istého vzorca ako dlh trénera v Kokpite.
        const data = await loadData(DB);
        const narok = narokJerryho(mzdoveHodiny(data.sessions), od, mesiacPraha());
        return Response.json({ ok: true, results: rs.results || [], narok });
      },
    },
  },
});
