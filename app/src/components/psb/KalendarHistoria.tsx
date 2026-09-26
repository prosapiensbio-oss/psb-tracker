import { useCallback, useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import type { MesiacPorovnanie } from "../../lib/psb/porovnanieMesiacov";
import { Card, H3, Info } from "./ui";

/**
 * VLASTNÉ DÁTA PROTI EXPORTU — mesiac po mesiaci.
 *
 * Jerry, 26. 9. 2026: grafy majú stáť na Google kalendári a na vlastných
 * platbách, nie na reportoch z PTmindera — a obe verzie majú chvíľu bežať
 * vedľa seba a porovnávať sa.
 *
 * Táto karta robí to porovnanie viditeľným. Kým stĺpce nesedia, prepnúť
 * grafy na kalendár by znamenalo vymeniť overené číslo za neoverené.
 *
 * Doplnenie histórie je tu preto, že kalendár sa v appke zbiera až od konca
 * júla 2026 — bežná snímka berie okno 21 dní. iCal súbor pritom nesie celú
 * históriu, takže sa dá dotiahnuť rok po roku.
 */

type Odpoved = { ok: boolean; od?: string; mesiace?: MesiacPorovnanie[] };

const ROKY = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2];

export function KalendarHistoria() {
  const [m, setM] = useState<MesiacPorovnanie[] | null>(null);
  const [od, setOd] = useState("");
  const [pracujem, setPracujem] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(async () => {
    const j = (await fetch("/api/kalendar", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "porovnaj-mesiace" }),
    }).then((r) => r.json()).catch(() => null)) as Odpoved | null;
    if (j?.ok) { setM(j.mesiace || []); setOd(j.od || ""); }
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  /** Dotiahne jeden rok — po kalendároch, lebo každý je vlastné stiahnutie. */
  const dotiahni = async (rok: number) => {
    setPracujem(String(rok)); setChyba(""); setHlaska("");
    let trener = "";
    let spolu = 0;
    for (let i = 0; i < 4; i++) {
      const j = await fetch("/api/kalendar", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "historia", trener, od: `${rok}-01-01`, do: `${rok}-12-31` }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
      if (!j?.ok) { setChyba(j?.error || "nepodarilo sa"); break; }
      spolu += j.pridanych || 0;
      if (!j.zostava?.length) break;
      trener = j.zostava[0];
    }
    setPracujem("");
    setHlaska(`Rok ${rok}: pribudlo ${spolu} udalostí z kalendára.`);
    await nacitaj();
  };

  if (!m) return null;
  const sediacich = m.filter((x) => x.sedi).length;

  return (
    <Card>
      <H3>
        <Info
          label="Vlastné dáta proti exportu"
          text="Kokpit sa učí počítať tréningy z Google kalendára namiesto reportov z PTmindera. Kým sa mesiace rozchádzajú, grafy na kalendári stáť nemôžu. Kalendár sa v appke zbiera od konca júla 2026; staršie mesiace treba najprv dotiahnuť z toho istého iCal súboru."
        />
      </H3>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "6px 0 12px" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: sediacich === m.length ? C.green : C.orange }}>
            {sediacich}/{m.length}
          </div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>mesiacov sedí<br /><span style={{ color: C.textDim }}>do 5 % alebo dvoch kusov</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.text }}>{od || "—"}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>odkedy má appka kalendár<br /><span style={{ color: C.textDim }}>staršie treba dotiahnuť</span></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, color: C.textDim }}>dotiahnuť históriu:</span>
        {ROKY.map((r) => (
          <button
            key={r}
            type="button"
            disabled={!!pracujem}
            onClick={() => void dotiahni(r)}
            style={{
              padding: "5px 11px", borderRadius: 8, fontSize: 12, cursor: pracujem ? "default" : "pointer",
              border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit",
            }}
          >
            {pracujem === String(r) ? "ťahám…" : r}
          </button>
        ))}
      </div>

      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12.5, color: C.green, marginBottom: 8 }}>{hlaska}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.6, paddingBottom: 4, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
          <span style={{ width: 62 }}>MESIAC</span>
          <span style={{ width: 70, textAlign: "right" }}>KALENDÁR</span>
          <span style={{ width: 70, textAlign: "right" }}>EXPORT</span>
          <span style={{ width: 70, textAlign: "right" }}>ROZDIEL</span>
          <span style={{ flex: 1 }}>NEZARADENÉ</span>
        </div>
        {m.map((r) => (
          <div key={r.mesiac} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "4px 0", color: C.text, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ width: 62, color: C.textMuted }}>{r.mesiac}</span>
            <span style={{ width: 70, textAlign: "right" }}>{r.kalendar}</span>
            <span style={{ width: 70, textAlign: "right" }}>{r.export}</span>
            <span style={{ width: 70, textAlign: "right", color: r.sedi ? C.green : C.red, fontWeight: 600 }}>
              {r.rozdiel > 0 ? `+${r.rozdiel}` : r.rozdiel}
            </span>
            <span style={{ flex: 1, color: C.textDim, fontSize: 11.5 }}>
              {r.nezaradene ? `${r.nezaradene} nezaradených udalostí` : ""}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
        Kalendár počíta len udalosti zaradené ako tréning alebo úvodný. Nezaradené (nové meno,
        záskok) sa do súčtu nerátajú — appka nehádže do čísla nič, čím si nie je istá. Práve v nich
        však často býva rozdiel, preto sú v poslednom stĺpci.
      </div>
    </Card>
  );
}
