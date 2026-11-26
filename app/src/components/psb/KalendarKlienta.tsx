import { useMemo, useState } from "react";

import type { Udalost } from "../../lib/psb/klientOsCasu";
import { posunMesiac, triMesiace, type DenKalendara, type PasBalicka } from "../../lib/psb/kalendarKlienta";
import { fmtCZK } from "../../lib/psb/format";
import { nazovProduktu } from "../../lib/psb/nazvyProduktov";
import { C, mix } from "../../lib/psb/theme";

/**
 * KALENDÁR V PROFILE KLIENTA — návrh B (Jerry, 26. 11. 2026): tri malé mesiace
 * vedľa seba. Zelený štvorček = tréning, modrý rámik = platba, oranžová bodka
 * = začiatok balíčka, prerušovaný = objednaný termín. Pod mesiacom pás
 * platnosti balíčkov a súčet. Ťuknutý deň sa vypíše pod mesiacmi.
 *
 * Rovnaké riadky ako zoznam (`os`) — kalendár nič nepočíta nanovo.
 */
const MESIACE = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
const DNI = ["P", "U", "S", "Š", "P", "S", "N"];
const DNI_CELE = ["pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota", "nedeľa"];

const farbaPasu = (p: PasBalicka) => (p.nezaplatene ? C.red : p.doplnenie ? "#c9a2f0" : C.orange);
const tvar = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

export function KalendarKlienta({ os, objednane, dnes, uzke }: { os: Udalost[]; objednane: string[]; dnes: string; uzke?: boolean }) {
  const [posledny, setPosledny] = useState(dnes.slice(0, 7));
  const [vybrany, setVybrany] = useState<string>("");
  const mesiace = useMemo(() => triMesiace(posledny, os, objednane, dnes), [posledny, os, objednane, dnes]);
  const denVybrany = useMemo(() => mesiace.flatMap((m) => m.dni).find((d) => d.den === vybrany), [mesiace, vybrany]);
  const tl = { width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" } as const;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button type="button" onClick={() => setPosledny((m) => posunMesiac(m, -3))} style={tl} aria-label="Staršie mesiace">‹</button>
        <b style={{ fontSize: 13.5 }}>{MESIACE[+mesiace[0].mesiac.slice(5) - 1]} – {MESIACE[+mesiace[2].mesiac.slice(5) - 1]} {mesiace[2].mesiac.slice(0, 4)}</b>
        <button type="button" onClick={() => setPosledny((m) => posunMesiac(m, 3))} style={tl} aria-label="Novšie mesiace">›</button>
        {posledny !== dnes.slice(0, 7) && (
          <button type="button" onClick={() => setPosledny(dnes.slice(0, 7))} style={{ ...tl, width: "auto", padding: "0 9px", fontSize: 11.5 }}>dnes</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: uzke ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: uzke ? 14 : 16 }}>
        {mesiace.map((m) => {
          const n = m.dni.length;
          return (
            <div key={m.mesiac}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <b style={{ fontSize: 13 }}>{MESIACE[+m.mesiac.slice(5) - 1]}</b>
                <span style={{ fontSize: 11, color: C.textDim }}>{m.treningov} {tvar(m.treningov, "tréning", "tréningy", "tréningov")}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
                {DNI.map((d, i) => <div key={i} style={{ fontSize: 9.5, color: C.textDim, textAlign: "center" }}>{d}</div>)}
                {Array.from({ length: m.posun }, (_, i) => <div key={`x${i}`} />)}
                {m.dni.map((d) => <Bunka key={d.den} d={d} dnes={dnes} vybrany={vybrany === d.den} uzke={uzke} onKlik={() => setVybrany((v) => (v === d.den ? "" : d.den))} />)}
              </div>
              {/* Pás platnosti balíčkov — kde žiadny neplatí, je prázdno. Doplnenia
                  idú do vlastného pásu: bežia popri předplatnom a cez seba by sa
                  prekryli (Robin, 26. 11. 2026). */}
              {[m.pasy.filter((p) => !p.doplnenie), m.pasy.filter((p) => p.doplnenie)].map((rad, ri) => (ri === 1 && !rad.length ? null : (
                <div key={ri} style={{ position: "relative", height: 16, marginTop: ri ? 3 : 6, borderRadius: 5, background: mix(C.border, 40) }}>
                  {rad.map((p, i) => {
                    const l = (+p.od.slice(8) - 1) / n * 100, w = (+p.do.slice(8) - +p.od.slice(8) + 1) / n * 100;
                    const nazov = p.doplnenie ? "Doplnenie" : nazovProduktu(p.nazov);
                    return (
                      <span key={i} title={`${nazov} · ${p.hodin} h · ${+p.od.slice(8)}. – ${+p.do.slice(8)}. ${+p.do.slice(5, 7)}.${p.otvoreny ? " · bez konca platnosti" : ""}${p.nezaplatene ? " · nezaplatený" : ""}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `${l}%`, width: `${w}%`, borderRadius: 5, background: farbaPasu(p), color: "#14180f", fontSize: 9.5, fontWeight: 700, lineHeight: "16px", padding: "0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box", opacity: p.otvoreny ? 0.75 : 1, borderRight: `1px solid ${C.surface}` }}>
                        {nazov} · {p.hodin} h
                      </span>
                    );
                  })}
                </div>
              )))}
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5 }}>{m.zaplatene ? `zaplatil ${fmtCZK(m.zaplatene)}` : "bez platby"}</div>
            </div>
          );
        })}
      </div>

      {denVybrany && <DetailDna d={denVybrany} />}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.textDim, marginTop: 10 }}>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: C.green, marginRight: 4 }} />tréning</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, border: `2px solid ${C.blue}`, marginRight: 4, boxSizing: "border-box" }} />platba</span>
        <span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.orange, marginRight: 4 }} />začiatok balíčka</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, border: `1px dashed ${C.green}`, marginRight: 4, boxSizing: "border-box" }} />objednaný</span>
        <span>ťukni na deň — vypíše sa pod mesiacmi</span>
      </div>
    </div>
  );
}

function Bunka({ d, dnes, vybrany, uzke, onKlik }: { d: DenKalendara; dnes: string; vybrany: boolean; uzke?: boolean; onKlik: () => void }) {
  const trening = d.treningy.length > 0;
  const objednany = !trening && d.objednane.length > 0;
  const ma = trening || objednany || d.platby.length > 0 || d.balicky.length > 0;
  const nazov = [
    ...d.treningy.map((t) => `tréning${t.cas ? ` ${t.cas}` : ""}${t.uvodny ? " (úvodný)" : ""}${t.zdarma !== undefined ? " (zdarma)" : ""}`),
    ...d.objednane.map((c) => `objednané ${c}`),
    ...d.platby.map((p) => `platba ${fmtCZK(p.suma)}`),
    ...d.balicky.map((b) => `${b.doplnenie ? "Doplnenie" : nazovProduktu(b.nazov)} · ${b.hodin} h`),
  ].join(" · ");
  return (
    <button type="button" onClick={ma ? onKlik : undefined} title={nazov || undefined}
      style={{
        position: "relative", height: uzke ? 32 : undefined, aspectRatio: uzke ? undefined : "1", minWidth: 0, padding: 0,
        borderRadius: 5, fontFamily: "inherit", fontSize: uzke ? 11 : 9.5, fontVariantNumeric: "tabular-nums",
        cursor: ma ? "pointer" : "default",
        background: trening ? C.green : mix(C.border, 50),
        color: trening ? "#14180f" : objednany ? C.green : C.textDim,
        fontWeight: trening || objednany ? 800 : 400,
        border: objednany ? `1.5px dashed ${C.green}` : "none",
        boxShadow: [
          d.platby.length ? `0 0 0 2px ${C.blue}` : "",
          d.den === dnes ? `inset 0 0 0 1.5px ${C.accent}` : "",
          vybrany ? `0 0 0 3px ${mix(C.text, 60)}` : "",
        ].filter(Boolean).join(", ") || undefined,
      }}>
      {+d.den.slice(8)}
      {d.balicky.length > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: d.balicky.some((b) => b.doplnenie) ? "#c9a2f0" : C.orange }} />}
    </button>
  );
}

function DetailDna({ d }: { d: DenKalendara }) {
  const dt = new Date(`${d.den}T12:00:00Z`);
  const riadok = (farba: string, text: string, vpravo = "") => (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "3px 0" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: farba, flex: "none", transform: "translateY(-1px)" }} />
      <span>{text}</span>
      {vpravo && <span style={{ marginLeft: "auto", color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{vpravo}</span>}
    </div>
  );
  return (
    <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${mix(C.border, 80)}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>
        {DNI_CELE[(dt.getUTCDay() + 6) % 7].toUpperCase()} {+d.den.slice(8)}. {+d.den.slice(5, 7)}. {d.den.slice(0, 4)}
      </div>
      {d.balicky.map((b, i) => <div key={`b${i}`}>{riadok(b.doplnenie ? "#c9a2f0" : C.orange, `${b.doplnenie ? "Doplnenie členstva" : nazovProduktu(b.nazov)}${b.doDna ? ` · do ${+b.doDna.slice(8, 10)}. ${+b.doDna.slice(5, 7)}.` : ""}${b.nezaplatene ? " · nezaplatený" : ""}`, `${b.hodin} h`)}</div>)}
      {d.treningy.map((t, i) => <div key={`t${i}`}>{riadok(C.green, `${t.uvodny ? "Úvodný tréning" : "Tréning"}${t.cas ? ` ${t.cas}` : ""}${t.trener ? ` · ${t.trener}` : ""}${t.zdarma !== undefined ? " · zdarma" : ""}`)}</div>)}
      {d.objednane.map((c) => <div key={`o${c}`}>{riadok(C.green, `Objednané ${c}`)}</div>)}
      {d.platby.map((p, i) => <div key={`p${i}`}>{riadok(C.blue, `Platba · ${p.metoda}${p.poznamka ? ` · ${p.poznamka}` : ""}`, fmtCZK(p.suma))}</div>)}
    </div>
  );
}
