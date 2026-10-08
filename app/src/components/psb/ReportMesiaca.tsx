import { useEffect } from "react";

import type { OtazkaReportu, Report } from "../../lib/psb/mesacnyReport";
import { C, mix } from "../../lib/psb/theme";

/**
 * Mesačný / kvartálny report — návrh C (tri otázky, semafor, akcia) s kartami
 * z návrhu A (veľké číslo, zmena, krivka). Jerry, 8. 10. 2026: „postav C
 * s kartami z A". Náčrt: navrhy-kokpitu/mesacny-report.html.
 *
 * Okno je NEPRIEHĽADNÉ (`C.surface`) — leží nad uzávierkou a cez sklo by sa
 * čísla prekrývali (pravidlo z 30. 9. 2026).
 */
const FARBA = { z: "#8fd19e", o: "#f2c14e", c: "#f08a7a" } as const;
const ZNAK = { z: "✓", o: "!", c: "✕" } as const;
const kc = (n: number) => Math.round(n).toLocaleString("sk-SK").replace(/,/g, " ");

function Krivka({ seria, popis, farba, stlpce }: { seria: number[]; popis: string[]; farba: string; stlpce: boolean }) {
  if (seria.length < 2) return null;
  const max = Math.max(...seria, 0);
  const min = Math.min(...seria, 0);
  const rozsah = max - min || 1;
  if (stlpce) {
    // Kvartál: mesiace štvrťroka vedľa seba.
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 64, marginTop: 10 }}>
        {seria.map((v, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: C.textDim }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{kc(v)}</div>
            <div style={{ height: Math.max(3, ((v - min) / rozsah) * 38), background: farba, opacity: i === seria.length - 1 ? 1 : 0.55, borderRadius: "5px 5px 2px 2px", margin: "3px auto 3px", width: "60%" }} />
            {popis[i]}
          </div>
        ))}
      </div>
    );
  }
  const w = 200, h = 40;
  const body = seria.map((v, i) => [(i / (seria.length - 1)) * w, h - 4 - ((v - min) / rozsah) * (h - 8)] as const);
  return (
    <div style={{ marginTop: 10 }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <polyline fill="none" stroke={farba} strokeWidth={2.4} points={body.map((b) => b.join(",")).join(" ")} vectorEffect="non-scaling-stroke" />
        <circle cx={body[body.length - 1][0]} cy={body[body.length - 1][1]} r={3.4} fill={farba} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim, marginTop: 2 }}>
        {popis.map((p, i) => <span key={i}>{p}</span>)}
      </div>
    </div>
  );
}

function Otazka({ o, kvartal }: { o: OtazkaReportu; kvartal: boolean }) {
  const farba = FARBA[o.semafor];
  const smer = o.hlavne.smer === "hore" ? C.green : o.hlavne.smer === "dole" ? C.red : C.textMuted;
  return (
    <div style={{ background: mix(C.card, 100), border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }} className="psb-report-otazka">
      <div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <span style={{ width: 38, height: 38, borderRadius: 19, background: farba, color: "#1b2619", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17, flex: "0 0 auto" }}>{ZNAK[o.semafor]}</span>
          <h3 style={{ margin: 0, fontSize: 17, color: C.text }}>{o.otazka}</h3>
        </div>
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, opacity: 0.92 }}>{o.odpoved}</div>
        {o.cisla.length > 0 && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
            {o.cisla.map((c, i) => (
              <div key={i}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{c.hodnota}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>{c.popis}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, background: mix(C.orange, 12), border: `1px solid ${mix(C.orange, 35)}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, lineHeight: 1.5, color: C.text }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", color: C.orange, fontWeight: 700, marginBottom: 3 }}>Urob</div>
          {o.akcia}
        </div>
      </div>
      {/* Karta z návrhu A: veľké číslo, zmena, krivka. */}
      <div style={{ background: mix(C.bg, 60), border: `1px solid ${mix(C.border, 70)}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 32, fontWeight: 750, letterSpacing: "-.02em", lineHeight: 1, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {o.hlavne.jednotka === "Kč" && o.hlavne.zmena === "chýba P&L" ? "—" : kc(o.hlavne.hodnota)}
          <span style={{ fontSize: 13, fontWeight: 500, color: C.textMuted, marginLeft: 6 }}>{o.hlavne.jednotka}</span>
        </div>
        <span style={{ display: "inline-block", marginTop: 7, fontSize: 12, fontWeight: 650, padding: "2px 9px", borderRadius: 10, color: smer, background: mix(smer, 14) }}>{o.hlavne.zmena}</span>
        <Krivka seria={o.hlavne.seria} popis={o.hlavne.popisSerie} farba={farba} stlpce={kvartal} />
      </div>
    </div>
  );
}

export function ReportMesiaca({ report, nahlad, onZavri }: { report: Report; nahlad: boolean; onZavri: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onZavri(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onZavri]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Report ${report.nadpis}`} onClick={onZavri}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "start center", overflowY: "auto", padding: "40px 16px" }}>
      <style>{"@media (max-width: 760px) { .psb-report-otazka { grid-template-columns: 1fr !important; } }"}</style>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 980, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 22, padding: "22px 22px 18px", boxShadow: "0 24px 80px rgba(0,0,0,.45)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24, color: C.text }}>{report.druh === "kvartal" ? `Kvartálny report ${report.nadpis}` : report.nadpis}</h2>
          <span style={{ fontSize: 13, color: C.textMuted }}>{report.porovnanie}</span>
          {nahlad && <span style={{ fontSize: 11.5, color: C.orange, border: `1px solid ${mix(C.orange, 45)}`, borderRadius: 10, padding: "2px 8px" }}>náhľad — mesiac ešte nie je zamknutý</span>}
          <span style={{ marginLeft: "auto" }} />
          <button onClick={onZavri} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Zavrieť</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {report.otazky.map((o) => <Otazka key={o.id} o={o} kvartal={report.druh === "kvartal"} />)}
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 14, lineHeight: 1.5 }}>
          Zisk je z P&L Kokpitu, hodiny a klienti zo sedení, Instagram z Metricoolu, reklama z Mety. Semafor porovnáva s {report.druh === "kvartal" ? "minulým štvrťrokom" : "priemerom posledných šiestich mesiacov"}.
        </div>
      </div>
    </div>
  );
}
