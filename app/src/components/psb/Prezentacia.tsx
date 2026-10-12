import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { dalej, postavPrezentaciu, spat, type Slajd, type SlajdAkcie, type SlajdOtazka, type SlajdSemafor, type SlajdTitulka, type SlajdZaver } from "../../lib/psb/prezentacia";
import type { Report, Semafor } from "../../lib/psb/mesacnyReport";

/**
 * PREZENTÁCIA REPORTU — slajdy na celú obrazovku (Jerry, 12. 10. 2026).
 *
 * Plátno má PEVNÝCH 1600×900 a zmenšuje sa `transform: scale` na to, čo je
 * k dispozícii. Dôvod: pri prezentácii sa nesmie nič preliať ani zlomiť inak
 * na notebooku a inak na telefóne — pri pevnom plátne je rozloženie, ktoré
 * vidím pri stavaní, to isté, ktoré uvidí Jerry na projektore.
 *
 * Slajdy sú SVETLÉ, aj keď appka je tmavá — tá istá paleta ako tlačený report
 * (`reportHtml.ts`). Prezentuje sa z projektora a tmavé plochy na ňom zhasnú.
 *
 * Dáta sú hotový `Report`. Nič sa tu nepočíta (dôvod v `prezentacia.ts`).
 *
 * VYKRESĽUJE SA PORTÁLOM DO `document.body`. Prvá verzia bola obyčajné dieťa
 * okna reportu a 12. 10. sa Jerrymu zjavila orezaná sprava aj zdola: niektorý
 * z rodičov (karta Workspace) má `transform`, a ten robí z `position: fixed`
 * polohu voči SEBE, nie voči obrazovke. Prezentácia na celú obrazovku teda
 * nesmie visieť na mieste, kde bola zavolaná.
 */

const POZADIE = "#F6F9F7";
const POZADIE2 = "#ECF2EE";
const TEXT = "#22302A";
const SLABA = "#6B7A72";
const LINKA = "#DCE5DF";
const ZELENA = "#2D7D5A";
const ZELENA_SVETLA = "#8FBFA6";
const RAM = "#141a12";

/** Semafor má farbu AJ slovo — na projektore sa odtiene strácajú. */
const SEM: Record<Semafor, { farba: string; slovo: string }> = {
  z: { farba: "#2D7D5A", slovo: "Dobré" },
  o: { farba: "#B07A12", slovo: "Pozor" },
  c: { farba: "#A8402C", slovo: "Zle" },
};

const W = 1600;
const H = 900;
const OKRAJ = 96;

/** Blok, ktorý sa objaví až vo svojom kroku. Miesto si drží vždy — inak by sa rozloženie pri odkrývaní hýbalo. */
function Blok({ ukaz, children, style }: { ukaz: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ opacity: ukaz ? 1 : 0, transform: ukaz ? "none" : "translateY(16px)", transition: "opacity .34s ease, transform .34s ease", ...style }}>
      {children}
    </div>
  );
}

function Stlpce({ seria, popis, farba, vyska = 230 }: { seria: number[]; popis: string[]; farba: string; vyska?: number }) {
  if (seria.length < 2) return null;
  const max = Math.max(...seria, 0);
  const min = Math.min(...seria, 0);
  const rozsah = max - min || 1;
  const kc = (n: number) => Math.round(n).toLocaleString("sk-SK").replace(/,/g, " ");
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 24 }}>
      {seria.map((v, i) => {
        const posledny = i === seria.length - 1;
        return (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 20, color: posledny ? farba : SLABA, fontWeight: posledny ? 700 : 500, fontVariantNumeric: "tabular-nums", marginBottom: 6 }}>{kc(v)}</div>
            <div style={{ height: Math.max(4, ((v - min) / rozsah) * vyska), background: posledny ? farba : ZELENA_SVETLA, borderRadius: "8px 8px 2px 2px" }} />
            <div style={{ fontSize: 20, color: posledny ? farba : SLABA, fontWeight: posledny ? 700 : 500, marginTop: 8 }}>{popis[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

function Titulka({ s, krok }: { s: SlajdTitulka; krok: number }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: ZELENA }}>ProSapiens Bio · uzávierka</div>
      <div>
        <h1 style={{ margin: 0, fontSize: 132, lineHeight: 1, fontWeight: 800, letterSpacing: "-.03em", color: TEXT }}>{s.nadpis}</h1>
        <div style={{ fontSize: 40, color: SLABA, marginTop: 24 }}>{s.porovnanie}</div>
      </div>
      <Blok ukaz={krok >= 1}>
        <div style={{ display: "flex", gap: 56, borderTop: `2px solid ${LINKA}`, paddingTop: 28 }}>
          {s.cisla.map((c) => (
            <div key={c.popis}>
              <div style={{ fontSize: 56, fontWeight: 800, color: ZELENA, letterSpacing: "-.02em" }}>{c.hodnota}</div>
              <div style={{ fontSize: 22, color: SLABA, marginTop: 4 }}>{c.popis}</div>
            </div>
          ))}
        </div>
      </Blok>
    </div>
  );
}

function SemaforSlajd({ s, krok }: { s: SlajdSemafor; krok: number }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 32 }}>
      <h2 style={{ margin: 0, fontSize: 64, fontWeight: 800, letterSpacing: "-.02em", color: TEXT }}>{s.nadpis}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, flex: 1, alignContent: "start" }}>
        {s.karty.map((k, i) => {
          const sem = SEM[k.semafor];
          return (
            <Blok key={k.id} ukaz={krok >= 1 + i}>
              <div style={{ background: POZADIE2, border: `1px solid ${LINKA}`, borderRadius: 18, padding: "22px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, background: sem.farba, flex: "0 0 auto" }} />
                  <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: sem.farba }}>{sem.slovo}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 600, color: TEXT, margin: "10px 0 8px" }}>{k.otazka}</div>
                {/* Jednotka niektorých otázok je celá veta („% tržieb od najväčšieho
                    klienta“) — dlhá hodnota sa zmenší, nech karta nemá tri riadky. */}
                <div style={{ fontSize: k.hodnota.length > 18 ? 26 : k.hodnota.length > 11 ? 32 : 38, fontWeight: 800, color: k.bezDat ? SLABA : sem.farba, letterSpacing: "-.02em", lineHeight: 1.15 }}>
                  {k.hodnota}
                </div>
                <div style={{ fontSize: 20, color: SLABA, marginTop: 6 }}>{k.zmena}</div>
              </div>
            </Blok>
          );
        })}
      </div>
    </div>
  );
}

function OtazkaSlajd({ s, krok }: { s: SlajdOtazka; krok: number }) {
  const sem = SEM[s.semafor];
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 56, alignContent: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 26, minWidth: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ width: 18, height: 18, borderRadius: 9, background: sem.farba, flex: "0 0 auto" }} />
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: sem.farba }}>{sem.slovo}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 60, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.08, color: TEXT }}>{s.otazka}</h2>
        </div>
        <Blok ukaz={krok >= 2}>
          <div style={{ fontSize: 30, lineHeight: 1.45, color: TEXT }}>{s.odpoved}</div>
        </Blok>
        {s.akcia && (
          <Blok ukaz={krok >= 3}>
            <div style={{ background: "#FBF3E0", border: "1px solid #E2C98B", borderRadius: 16, padding: "18px 22px" }}>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#8A5F12", marginBottom: 6 }}>Urob</div>
              <div style={{ fontSize: 26, lineHeight: 1.4, color: TEXT }}>{s.akcia}</div>
            </div>
          </Blok>
        )}
      </div>
      <Blok ukaz={krok >= 1} style={{ minWidth: 0 }}>
        <div style={{ background: POZADIE2, border: `1px solid ${LINKA}`, borderRadius: 18, padding: "26px 28px" }}>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
            {s.hodnota}
            {s.jednotka && <span style={{ fontSize: 30, fontWeight: 500, color: SLABA, marginLeft: 12 }}>{s.jednotka}</span>}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: sem.farba, marginTop: 10 }}>{s.zmena}</div>
          <Stlpce seria={s.seria} popis={s.popisSerie} farba={sem.farba} />
        </div>
        {s.detail.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 21, marginTop: 20 }}>
            <tbody>
              {s.detail.map((d) => (
                <tr key={d.metrika} style={{ borderTop: `1px solid ${LINKA}` }}>
                  <td style={{ padding: "9px 4px", color: SLABA }}>{d.metrika}</td>
                  <td style={{ padding: "9px 4px", textAlign: "right", fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{d.hodnota}</td>
                  <td style={{ padding: "9px 4px", textAlign: "right", color: SLABA, fontVariantNumeric: "tabular-nums" }}>{d.priemer}</td>
                  <td style={{ padding: "9px 4px", textAlign: "right", fontWeight: 600, color: d.dobre === undefined ? SLABA : d.dobre ? ZELENA : "#A8402C" }}>{d.rozdiel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Blok>
    </div>
  );
}

function ZaverSlajd({ s, krok }: { s: SlajdZaver; krok: number }) {
  const stlpec = (nadpis: string, farba: string, riadky: string[], ukaz: boolean) => (
    <Blok ukaz={ukaz}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: farba, marginBottom: 18 }}>{nadpis}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {riadky.map((r) => (
          <div key={r} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: farba, flex: "0 0 auto", marginTop: 11 }} />
            <span style={{ fontSize: 28, lineHeight: 1.35, color: TEXT }}>{r}</span>
          </div>
        ))}
      </div>
    </Blok>
  );
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 44 }}>
      <h2 style={{ margin: 0, fontSize: 64, fontWeight: 800, letterSpacing: "-.02em", color: TEXT }}>{s.nadpis}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignContent: "start" }}>
        {s.dobre.length > 0 && stlpec("Čo šlo dobre", ZELENA, s.dobre, krok >= 1)}
        {s.pozor.length > 0 && stlpec("Čo si žiada pozornosť", "#B07A12", s.pozor, krok >= (s.dobre.length ? 2 : 1))}
      </div>
      {s.bezDat.length > 0 && (
        <Blok ukaz={krok >= s.kroky - 1}>
          <div style={{ borderTop: `1px solid ${LINKA}`, paddingTop: 20, fontSize: 24, color: SLABA, lineHeight: 1.4 }}>
            Bez zdroja, nehodnotené: {s.bezDat.join(" · ")}
          </div>
        </Blok>
      )}
    </div>
  );
}

function AkcieSlajd({ s, krok }: { s: SlajdAkcie; krok: number }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 36 }}>
      <h2 style={{ margin: 0, fontSize: 64, fontWeight: 800, letterSpacing: "-.02em", color: TEXT }}>{s.nadpis}</h2>
      {s.akcie.length === 0 ? (
        <Blok ukaz={krok >= 1}>
          <div style={{ fontSize: 34, lineHeight: 1.4, color: TEXT }}>Report nič nenavrhol — každá otázka drží. Mesiac sa zamyká bez úlohy.</div>
        </Blok>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {s.akcie.map((a, i) => (
            <Blok key={`${a.nadpis}-${i}`} ukaz={krok >= 1 + i}>
              <div style={{ background: POZADIE2, border: `1px solid ${LINKA}`, borderRadius: 18, padding: "20px 26px", display: "flex", gap: 28, alignItems: "flex-start" }}>
                <div style={{ fontSize: 52, fontWeight: 800, color: ZELENA, lineHeight: 1, width: 48, flex: "0 0 auto" }}>{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 19, color: SLABA, marginBottom: 4 }}>{a.nadpis}</div>
                  <div style={{ fontSize: 30, lineHeight: 1.35, color: TEXT, fontWeight: 600 }}>{a.text}</div>
                </div>
              </div>
            </Blok>
          ))}
        </div>
      )}
    </div>
  );
}

function Obsah({ s, krok }: { s: Slajd; krok: number }) {
  if (s.druh === "titulka") return <Titulka s={s} krok={krok} />;
  if (s.druh === "semafor") return <SemaforSlajd s={s} krok={krok} />;
  if (s.druh === "otazka") return <OtazkaSlajd s={s} krok={krok} />;
  if (s.druh === "zaver") return <ZaverSlajd s={s} krok={krok} />;
  return <AkcieSlajd s={s} krok={krok} />;
}

export const PLATNO = { sirka: W, vyska: H };

/**
 * Jeden slajd na plátne 1600×900. Vyčlenené z prezentácie, aby sa ten istý
 * slajd dal vykresliť aj bez nej — náhľad pri stavaní, neskôr tlač.
 */
export function Platno({ s, krok, pata, strana, zoSlajdov, onKlik }: {
  s: Slajd; krok: number; pata: string; strana?: number; zoSlajdov?: number; onKlik?: () => void;
}) {
  return (
    <div onClick={onKlik}
      style={{ width: W, height: H, flex: "0 0 auto", background: POZADIE, color: TEXT, cursor: onKlik ? "pointer" : "default",
        fontFamily: '"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: OKRAJ, boxSizing: "border-box", position: "relative" }}>
      <div style={{ height: "100%", position: "relative" }}>
        <Obsah s={s} krok={krok} />
      </div>
      <div style={{ position: "absolute", left: OKRAJ, bottom: 36, fontSize: 18, color: SLABA }}>{pata}</div>
      {strana !== undefined && zoSlajdov !== undefined && (
        <div style={{ position: "absolute", right: OKRAJ, bottom: 36, display: "flex", gap: 8, alignItems: "center" }}>
          {Array.from({ length: zoSlajdov }, (_, j) => (
            <span key={j} style={{ width: j === strana - 1 ? 22 : 8, height: 8, borderRadius: 4, background: j === strana - 1 ? ZELENA : LINKA, transition: "width .2s ease" }} />
          ))}
          <span style={{ fontSize: 18, color: SLABA, marginLeft: 10, fontVariantNumeric: "tabular-nums" }}>{strana} / {zoSlajdov}</span>
        </div>
      )}
    </div>
  );
}

export function Prezentacia({ report, onZavri }: { report: Report; onZavri: () => void }) {
  const slajdy = useMemo(() => postavPrezentaciu(report), [report]);
  // Slajd a krok v JEDNOM stave — posúvajú sa vždy spolu a dva settery by sa
  // pri rýchlom klikaní prečítali navzájom staré.
  const [kde, setKde] = useState({ i: 0, krok: 0 });
  const [mierka, setMierka] = useState(1);
  /** Úzka obrazovka na výšku — telefón. Slajd je 16:9, takže na výšku z neho zostane pásik. */
  const [naVysku, setNaVysku] = useState(false);
  const [celaObrazovka, setCelaObrazovka] = useState(false);
  const ram = useRef<HTMLDivElement | null>(null);
  const { i, krok } = kde;

  const vpred = useCallback(() => setKde((k) => dalej(slajdy, k.i, k.krok) || k), [slajdy]);
  const vzad = useCallback(() => setKde((k) => spat(slajdy, k.i, k.krok) || k), [slajdy]);

  const prepniCeluObrazovku = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (ram.current) await ram.current.requestFullscreen();
    } catch {
      // Safari na iPhone celú obrazovku pre <div> nedovolí — prezentácia funguje aj tak.
      setCelaObrazovka(false);
    }
  }, []);

  useEffect(() => {
    // 24 px po stranách a 84 px dole na lištu ovládania — inak tlačidlá ležia na slajde.
    // `innerWidth` vie byť na prvom behu 0 (skrytý panel) — vtedy radšej klientskú šírku.
    const prepocitaj = () => {
      const w = window.innerWidth || document.documentElement.clientWidth || 1280;
      const h = window.innerHeight || document.documentElement.clientHeight || 800;
      setMierka(Math.max(0.1, Math.min((w - 24) / W, (h - 84) / H)));
      setNaVysku(w < 700 && h > w);
    };
    prepocitaj();
    window.addEventListener("resize", prepocitaj);
    return () => window.removeEventListener("resize", prepocitaj);
  }, []);

  useEffect(() => {
    const zmena = () => setCelaObrazovka(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", zmena);
    return () => document.removeEventListener("fullscreenchange", zmena);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); vpred(); return; }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); vzad(); return; }
      if (e.key === "Home") { setKde({ i: 0, krok: 0 }); return; }
      if (e.key === "End") { setKde({ i: slajdy.length - 1, krok: Math.max(0, (slajdy[slajdy.length - 1]?.kroky || 1) - 1) }); return; }
      if (e.key === "f" || e.key === "F") { void prepniCeluObrazovku(); return; }
      if (e.key === "Escape" && !document.fullscreenElement) onZavri();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [vpred, vzad, slajdy, onZavri, prepniCeluObrazovku]);

  const s = slajdy[i];
  if (!s) return null;
  const naKonci = !dalej(slajdy, i, krok);

  const tlacidlo: React.CSSProperties = {
    background: "rgba(12,17,11,.88)", border: "1px solid rgba(255,255,255,.3)", color: "#EAF1EC",
    borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
  };

  return createPortal(
    <div ref={ram} role="dialog" aria-modal="true" aria-label={`Prezentácia ${report.nadpis}`}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: RAM, display: "grid", placeItems: "center", overflow: "hidden",
        padding: "12px 12px 72px", boxSizing: "border-box",
        // Klik posúva slajd; bez tohto druhý klik označí text pod kurzorom.
        userSelect: "none", WebkitUserSelect: "none" }}>
      {/* Obal má UŽ ZMENŠENÝ rozmer a plátno sa škáluje od ľavého horného rohu.
          Keď sa škálovalo od stredu, grid dostal box široký 1600 px, pri menšom
          okne ho zarovnal na začiatok (tak sa rieši pretečenie) a slajd potom
          trčal vpravo — presne to Jerry videl 12. 10. */}
      <div style={{ width: Math.round(W * mierka), height: Math.round(H * mierka), flex: "0 0 auto", overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,.5)" }}>
        <div style={{ width: W, height: H, transform: `scale(${mierka})`, transformOrigin: "top left" }}>
          <Platno s={s} krok={krok} pata={`${report.nadpis} · ${report.porovnanie}`} strana={i + 1} zoSlajdov={slajdy.length} onKlik={vpred} />
        </div>
      </div>

      {naVysku && (
        <div style={{ position: "fixed", top: 72, left: 0, right: 0, textAlign: "center", fontSize: 14, color: "rgba(234,241,236,.72)", zIndex: 2 }}>
          Otoč telefón na šírku — slajd je 16 : 9.
        </div>
      )}

      {/* Ovládanie je MIMO plátna, aby sa nezmenšovalo spolu s ním. */}
      <div style={{ position: "fixed", top: 16, right: 16, display: "flex", gap: 8, zIndex: 2 }}>
        <button onClick={() => void prepniCeluObrazovku()} style={tlacidlo}>{celaObrazovka ? "Zmenšiť" : "Celá obrazovka"}</button>
        <button onClick={onZavri} style={tlacidlo}>Zavrieť ✕</button>
      </div>
      <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, zIndex: 2, alignItems: "center" }}>
        <button onClick={vzad} disabled={i === 0 && krok === 0} style={{ ...tlacidlo, opacity: i === 0 && krok === 0 ? 0.4 : 1 }}>‹ Späť</button>
        <button onClick={vpred} disabled={naKonci} style={{ ...tlacidlo, opacity: naKonci ? 0.4 : 1 }}>Ďalej ›</button>
        {!naVysku && <span style={{ fontSize: 12.5, color: "rgba(234,241,236,.6)", marginLeft: 10 }}>šípky · medzerník · F = celá obrazovka</span>}
      </div>
    </div>,
    document.body,
  );
}
