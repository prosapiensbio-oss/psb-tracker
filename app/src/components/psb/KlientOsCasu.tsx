import { useMemo, useState } from "react";

import { jeBeta } from "../../lib/psb/beta";
import { osCasuKlienta, treningovVBalicku, type Udalost } from "../../lib/psb/klientOsCasu";
import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import type { PSBData } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { Info } from "./ui";

/**
 * „Nevychádzajú mu tréningy" — jedna os, na ktorej sa to dá spočítať očami.
 *
 * Jerry, 23. 9. 2026 sa pýtal na tri veci naraz: kedy platil, kedy bol na
 * tréningu a aké má členstvo a odkedy platí. Prvé bolo v profile, druhé len
 * ako stĺpce po mesiacoch (konkrétne dni nikde) a tretie nikde vôbec —
 * z balíčka bol vidieť iba zostatok „1/6".
 *
 * Karta zámerne NIČ NEPOČÍTA za človeka okrem jedného: koľko tréningov
 * padlo do platnosti balíčka. To je presne tá vec, ktorá pri „nesedí mu to"
 * rozhoduje, a ručne sa počíta najhoršie.
 */

const METODA: Record<string, string> = { bank: "prevodom", cash: "hotovosť", other: "iné" };

export function KlientOsCasu({ meno, data, kalUdalosti }: {
  meno: string;
  data: PSBData;
  kalUdalosti?: { zaciatok: string; klient: string | null; typ: string | null }[];
}) {
  const [vsetko, setVsetko] = useState(false);
  const os = useMemo(
    () => osCasuKlienta(meno, {
      sessions: data.sessions as never,
      payments: data.payments as never,
      packages: (data.packages || []) as never,
      kalUdalosti,
    }),
    [meno, data.sessions, data.payments, data.packages, kalUdalosti],
  );

  if (!os.length) return null;
  const vidno = vsetko ? os : os.slice(0, 18);

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${mix(C.border, 60)}` }}>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
        <Info
          text="Všetko, čo sa s klientom stalo, pod sebou v čase: kedy si kúpil balíček a dokedy mu platí, kedy chodil a kedy platil. Karta nič nedopočítava — okrem toho, koľko tréningov padlo do platnosti balíčka, lebo práve to sa ručne počíta najhoršie. Tréning, ktorý je zatiaľ len v kalendári a v PTminderi ešte nie, je označený."
          label="Os času — čo, kedy a za čo"
        />
      </div>

      <div style={{ maxHeight: vsetko ? "none" : 430, overflowY: vsetko ? "visible" : "auto" }}>
        {vidno.map((u, i) => <Riadok key={`${u.druh}|${u.den}|${i}`} u={u} os={os} />)}
      </div>

      {os.length > 18 && (
        <button
          onClick={() => setVsetko(!vsetko)}
          style={{ marginTop: 10, padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
        >
          {vsetko ? "Skrátiť" : `Ukázať všetkých ${os.length} záznamov`}
        </button>
      )}
    </div>
  );
}

function Riadok({ u, os }: { u: Udalost; os: Udalost[] }) {
  const zaklad = {
    display: "flex", gap: 10, alignItems: "baseline",
    padding: "6px 2px", borderBottom: `1px solid ${mix(C.border, 40)}`, fontSize: 12.5,
  };
  const denStyl = { color: C.textDim, minWidth: 74, fontVariantNumeric: "tabular-nums" as const };

  if (u.druh === "balicekOd") {
    const kolko = treningovVBalicku(os, u.den, u.doDna);
    const prekroceny = kolko > u.hodin;
    return (
      <div style={{ ...zaklad, background: mix(C.accent, 10), borderRadius: 6, padding: "8px 8px", marginTop: 4 }}>
        <span style={denStyl}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1, color: C.text }}>
          <b>{u.nazov}</b>
          <span style={{ color: C.textMuted }}>
            {" "}· {u.hodin ? `${u.hodin} h` : "bez limitu"}
            {u.doDna ? ` · platí do ${fmtDMY(u.doDna)}` : " · bez konca"}
            {u.zaplatene ? ` · ${fmtCZK(u.zaplatene)}` : ""}
          </span>
        </span>
        {!!u.hodin && (
          <span style={{ color: prekroceny ? C.red : C.textMuted, whiteSpace: "nowrap" }}>
            {kolko} z {u.hodin} odtrénovaných
          </span>
        )}
      </div>
    );
  }

  if (u.druh === "balicekDo") {
    return (
      <div style={{ ...zaklad, color: C.textDim }}>
        <span style={denStyl}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1 }}>skončila platnosť — {u.nazov}</span>
      </div>
    );
  }

  if (u.druh === "platba") {
    return (
      <div style={zaklad}>
        <span style={denStyl}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1, color: C.green }}>
          zaplatil {METODA[u.metoda] || u.metoda}
          {u.poznamka ? <span style={{ color: C.textDim }}> · {u.poznamka.slice(0, 40)}</span> : null}
        </span>
        <span style={{ color: C.green, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(u.suma)}</span>
      </div>
    );
  }

  return (
    <div style={zaklad}>
      <span style={denStyl}>{fmtDMY(u.den)}</span>
      <span style={{ flex: 1, color: C.textMuted }}>
        tréning
        {u.cas ? ` ${u.cas}` : ""}
        {u.trener ? ` · ${u.trener}` : ""}
        {u.nazov ? <span style={{ color: C.textDim }}> · {u.nazov}</span> : null}
      </span>
      {u.zKalendara && (
        <span style={{ color: C.blue, fontSize: 11, whiteSpace: "nowrap" }} title="V kalendári je, v PTminderi ešte nie">
          z kalendára
        </span>
      )}
    </div>
  );
}

/** V ostrom Kokpite sa karta zatiaľ nezobrazuje — skúša sa v bete. */
export const osCasuZapnuta = jeBeta;
