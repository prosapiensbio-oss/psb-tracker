import { useCallback, useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import type { MesiacDvojmo } from "../../lib/psb/dvojityVypocet";
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
  /** Dvojitý výpočet — to isté číslo z exportu aj z vlastných dát. */
  const [dvojmo, setDvojmo] = useState<MesiacDvojmo[] | null>(null);
  const [exportDo, setExportDo] = useState("");
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
    const d = (await fetch("/api/kalendar", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "dvojmo" }),
    }).then((r) => r.json()).catch(() => null)) as { ok?: boolean; mesiace?: MesiacDvojmo[]; exportDo?: string } | null;
    if (d?.ok) { setDvojmo(d.mesiace || []); setExportDo(d.exportDo || ""); }
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

      {dvojmo && dvojmo.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.55, marginBottom: 10 }}>
            To isté číslo dvoma cestami: vľavo to, čo appka počíta dnes z exportu, vpravo to, čo si
            dopočíta sama z kalendára a z vlastnej knihy platieb. Prebiehajúci mesiac sa nehodnotí —
            export chodí raz týždenne a je v ňom vždy pozadu{exportDo ? ` (siaha po ${exportDo})` : ""}.
          </div>
          {dvojmo.map((mes) => (
            <div key={mes.mesiac} style={{ marginBottom: 10, padding: "9px 11px", borderRadius: 10, border: `1px solid ${mix(mes.neuplny ? C.border : mes.sedi ? C.green : C.red, mes.neuplny ? 90 : 45)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <b style={{ fontSize: 13, color: C.text }}>{mes.mesiac}</b>
                <span style={{ fontSize: 11.5, color: mes.neuplny ? C.textDim : mes.sedi ? C.green : C.red }}>
                  {mes.neuplny ? "prebieha — nehodnotí sa" : mes.sedi ? "sedí" : "rozchádza sa"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.6, paddingBottom: 3 }}>
                <span style={{ flex: 1 }}></span>
                <span style={{ width: 78, textAlign: "right" }}>EXPORT</span>
                <span style={{ width: 78, textAlign: "right" }}>VLASTNÉ</span>
                <span style={{ width: 86, textAlign: "right" }}>ROZDIEL</span>
              </div>
              {mes.riadky.map((r) => (
                <div key={r.metrika} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ flex: 1, color: C.textMuted }}>{r.nazov}</span>
                  <span style={{ width: 78, textAlign: "right", color: C.text }}>{r.export.toLocaleString("sk-SK")}{r.jednotka ? ` ${r.jednotka}` : ""}</span>
                  <span style={{ width: 78, textAlign: "right", color: C.text }}>{r.vlastne.toLocaleString("sk-SK")}{r.jednotka ? ` ${r.jednotka}` : ""}</span>
                  <span style={{ width: 86, textAlign: "right", color: mes.neuplny ? C.textDim : r.sedi ? C.green : C.red, fontWeight: 600 }}>
                    {r.rozdiel > 0 ? "+" : ""}{r.rozdiel.toLocaleString("sk-SK")}
                    {r.percent ? <span style={{ fontWeight: 400, color: C.textDim }}> · {r.percent > 0 ? "+" : ""}{r.percent} %</span> : null}
                  </span>
                </div>
              ))}
              {/* Vyťaženosť sa počíta na trénera, nie na štúdio: celkové
                  číslo môže sedieť a rozdelenie byť pokazené — stačí, aby sa
                  záskok pripísal nesprávnemu človeku. */}
              {mes.treneri.length > 0 && (
                <div style={{ marginTop: 6, paddingTop: 5, borderTop: `1px solid ${mix(C.border, 50)}` }}>
                  {mes.treneri.map((t) => (
                    <div key={t.trener} style={{ display: "flex", gap: 10, fontSize: 11.5, padding: "2px 0", fontVariantNumeric: "tabular-nums", color: C.textDim }}>
                      <span style={{ flex: 1 }}>
                        {t.trener}
                        <span style={{ color: mix(C.textDim, 140) }}> · {t.klientiExport} / {t.klientiVlastne} klientov</span>
                      </span>
                      <span style={{ width: 78, textAlign: "right" }}>{t.treningyExport} · {t.hodinyExport} h</span>
                      <span style={{ width: 78, textAlign: "right" }}>{t.treningyVlastne} · {t.hodinyVlastne} h</span>
                      <span style={{ width: 86, textAlign: "right", color: mes.neuplny ? C.textDim : t.sedi ? C.green : C.red }}>
                        {t.treningyVlastne - t.treningyExport > 0 ? "+" : ""}{t.treningyVlastne - t.treningyExport}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.6, marginBottom: 4 }}>POČTY TRÉNINGOV PO MESIACOCH</div>
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
