import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { C } from "../../lib/psb/theme";

/**
 * NAVÁDZAČ KARIET AKO NEKONEČNÝ RAD (Jerry, 6. 10. 2026).
 *
 * „Sprav to tak, že to ide dokola — vedľa Klienta je 1 · Kalendár… ako
 * nekonečný rad." Predtým sa rad posúval ako pás, ktorý má dva konce:
 * názov z kraja sa len objavil na druhej strane. Teraz sa názvy OPAKUJÚ cez
 * celú šírku (za Klientom zase Kalendár, SMS…), takže kraj neexistuje.
 * Otvorená karta je v strede a pás pri prepnutí plynulo prejde o jedno
 * miesto. Vybrané z náčrtov `navrhy-kokpitu/nekonecny-rad.html` (variant 1);
 * 3D valec (`kolotoc-kariet.html`) Jerry v ten istý deň odmietol.
 *
 * Poloha sa počíta mimo Reactu (rAF a priamy zápis štýlu). React kreslí len
 * to, KTORÁ karta stojí v ktorom slote — mení sa raz za krok, nie za snímok.
 *
 * DVA PRSTY / ŤAH (Jerry, 6. 10.: „tak ako to fungovalo predtým"). Starý rad
 * bol rolovací pás — dvoma prstami sa ním hýbalo, kartu to neprepínalo. Tu
 * je to isté: pás ide za prstami („voľný"), zvýraznená ostáva otvorená
 * karta (jej najbližšia kópia) a do stredu sa pás vráti až pri ďalšom
 * prepnutí karty.
 */
export type PolozkaRadu = { kluc: string; nadpis: string; pocet: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;
const MEDZERA = 14;
/** Koľko názvov je naraz v rade z každej strany stredu. */
const POL = 10;

/** Index (neohraničený) kópie karty `karta` najbližšej k polohe `p`. */
export function najblizsiaKopia(p: number, karta: number, n: number): number {
  const z = Math.round(p);
  return z + posunRadu(z, karta, n);
}

/** Kratšia cesta okolo kruhu z `od` na `na` (−n/2 … n/2). */
export function posunRadu(od: number, na: number, n: number): number {
  let d = mod(na - od, n);
  if (d > n / 2) d -= n;
  return d;
}

/**
 * Stredy názvov v pixeloch okolo slotu 0 (karta `zaklad`), podľa ich šírok.
 * Index v poli je posun `o + POL`.
 */
export function stredyRadu(zaklad: number, sirky: number[], pol = POL, medzera = MEDZERA): number[] {
  const n = sirky.length;
  const w = (o: number) => sirky[mod(zaklad + o, n)] || 0;
  const out = new Array<number>(2 * pol + 2).fill(0);
  for (let o = 1; o <= pol + 1; o++) out[o + pol] = out[o - 1 + pol] + w(o - 1) / 2 + medzera + w(o) / 2;
  for (let o = -1; o >= -pol; o--) out[o + pol] = out[o + 1 + pol] - w(o + 1) / 2 - medzera - w(o) / 2;
  return out;
}

export function NekonecnyRad({ polozky, aktivna, onVyber }: {
  polozky: PolozkaRadu[];
  aktivna: number;
  onVyber: (j: number, smer: 1 | -1) => void;
}) {
  const n = polozky.length;
  const scena = useRef<HTMLDivElement | null>(null);
  const meradlo = useRef<HTMLDivElement | null>(null);
  const sloty = useRef<(HTMLButtonElement | null)[]>([]);
  const sirky = useRef<number[]>([]);
  const ciel = useRef(aktivna);
  const poloha = useRef(aktivna);
  const [zaklad, setZaklad] = useState(aktivna);
  const zakladRef = useRef(aktivna);
  const aktivnaRef = useRef(aktivna);
  aktivnaRef.current = aktivna;
  /** Pás ide za prstami — nepritahuje sa k cieľu, kým sa neprepne karta. */
  const volny = useRef(false);
  const tahRef = useRef<{ x: number; id: number; pohol: boolean } | null>(null);
  const menejPohybu = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Otvorená karta sa zmenila zvonku (šípka, gesto, obnovenie) → kratšou cestou.
  // Ak bol pás posunutý prstami, ide sa od miesta, kde práve stojí.
  useEffect(() => {
    if (!n) return;
    if (volny.current) { volny.current = false; ciel.current = najblizsiaKopia(poloha.current, aktivna, n); }
    else ciel.current += posunRadu(ciel.current, aktivna, n);
  }, [aktivna, n]);

  // Šírky názvov — zmerajú sa raz pri každej zmene zoznamu alebo počtov.
  const podpis = polozky.map((p) => `${p.nadpis}|${p.pocet}`).join("§");
  useLayoutEffect(() => {
    const m = meradlo.current;
    if (!m) return;
    sirky.current = [...m.children].map((x) => (x as HTMLElement).offsetWidth);
  }, [podpis]);

  useLayoutEffect(() => {
    if (!n) return;
    const kresli = () => {
      const p = poloha.current;
      const z = Math.floor(p);
      if (z !== zakladRef.current) { zakladRef.current = z; setZaklad(z); return; }
      const stredy = stredyRadu(z, sirky.current);
      const posunX = (p - z) * stredy[POL + 1];
      sloty.current.forEach((b, k) => {
        if (!b) return;
        const o = k - POL;
        b.style.transform = `translate(-50%, -50%) translateX(${stredy[k] - posunX}px)`;
        const akt = z + o === najblizsiaKopia(p, aktivnaRef.current, n);
        b.style.color = akt ? C.accentLight : C.textMuted;
        b.style.fontWeight = akt ? "800" : "600";
        b.style.borderColor = akt ? C.accent : "transparent";
        b.style.background = akt ? `linear-gradient(${C.accentBg}, ${C.accentBg}), ${C.surface}` : "transparent";
        b.setAttribute("aria-current", akt ? "true" : "false");
      });
    };
    let raf = 0;
    let zije = true;
    const snimka = () => {
      if (!zije) return;
      const d = ciel.current - poloha.current;
      if (!volny.current && Math.abs(d) > 0.0005) {
        poloha.current = menejPohybu || Math.abs(d) < 0.001 ? ciel.current : poloha.current + d * 0.16;
        kresli();
      }
      raf = requestAnimationFrame(snimka);
    };
    kresli();
    raf = requestAnimationFrame(snimka);
    // rAF v skrytej záložke nebeží (28. 9. 2026 to zamklo kopu) — po návrate
    // sa rad postaví rovno na cieľ.
    const navrat = () => {
      if (document.visibilityState === "visible" && !volny.current) { poloha.current = ciel.current; kresli(); }
    };
    document.addEventListener("visibilitychange", navrat);

    // Posun o `px` pixelov (kladné = pás doľava). Prepočet na kroky podľa
    // šírky aktuálneho kroku; pri prechode cez ďalší názov sa vezme jeho.
    const posunPx = (px: number) => {
      volny.current = true;
      let zvysok = px;
      for (let i = 0; i < 50 && Math.abs(zvysok) > 0.01; i++) {
        const p = poloha.current;
        // úsek [z, z+1], v ktorom sa pohyb deje (doľava z celého čísla = predošlý)
        const z = zvysok > 0 ? Math.floor(p) : Math.ceil(p) - 1;
        const krok = stredyRadu(z, sirky.current, 1)[2] || 80;
        const f = p - z;
        // koľko pixelov ostáva po hranicu úseku v smere pohybu
        const doHranice = zvysok > 0 ? (1 - f) * krok : -f * krok;
        if (Math.abs(zvysok) < Math.abs(doHranice)) { poloha.current = p + zvysok / krok; zvysok = 0; }
        else { poloha.current = zvysok > 0 ? z + 1 : z; zvysok -= doHranice; }
      }
      kresli();
    };
    const el = scena.current;
    // Dva prsty na touchpade. `passive: false`, inak Safari zo šmyku urobí
    // „späť v histórii".
    const naKoleso = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      posunPx(e.deltaX);
    };
    // Ťah prstom na telefóne (wheel tam nechodí). Myš ťahať nemusí — klik.
    // Ťah žije v refe: pri prechode cez názov sa efekt prestavia (nový `zaklad`).
    const tah = tahRef;
    const zac = (e: PointerEvent) => { if (e.pointerType !== "mouse") tah.current = { x: e.clientX, id: e.pointerId, pohol: false }; };
    const pohyb = (e: PointerEvent) => {
      const t = tah.current;
      if (!t || e.pointerId !== t.id) return;
      const dx = t.x - e.clientX;
      if (!t.pohol && Math.abs(dx) < 6) return;
      t.pohol = true;
      t.x = e.clientX;
      posunPx(dx);
    };
    const kon = (e: PointerEvent) => {
      const t = tah.current;
      if (!t || e.pointerId !== t.id) return;
      // Ťah nie je klik — inak by pustenie prsta otvorilo kartu pod ním.
      if (t.pohol) { const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); }; el?.addEventListener("click", stop, { capture: true, once: true }); setTimeout(() => el?.removeEventListener("click", stop, { capture: true }), 400); }
      tah.current = null;
    };
    el?.addEventListener("wheel", naKoleso, { passive: false });
    el?.addEventListener("pointerdown", zac);
    el?.addEventListener("pointermove", pohyb);
    el?.addEventListener("pointerup", kon);
    el?.addEventListener("pointercancel", kon);
    return () => {
      zije = false; cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", navrat);
      el?.removeEventListener("wheel", naKoleso);
      el?.removeEventListener("pointerdown", zac);
      el?.removeEventListener("pointermove", pohyb);
      el?.removeEventListener("pointerup", kon);
      el?.removeEventListener("pointercancel", kon);
    };
  }, [n, zaklad, podpis, menejPohybu]);

  const tlacidlo = {
    position: "absolute" as const, left: "50%", top: "50%", whiteSpace: "nowrap" as const, fontFamily: "inherit",
    fontSize: 12.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, border: "1px solid transparent",
    background: "transparent", color: C.textMuted, cursor: "pointer", willChange: "transform",
  };
  const obsah = (p: PolozkaRadu) => (
    <>
      {p.nadpis}
      {p.pocet > 0 && <span style={{ marginLeft: 5, fontSize: "0.85em", fontWeight: 800, color: C.orange }}>{p.pocet}</span>}
    </>
  );

  return (
    <div
      ref={scena}
      role="tablist"
      aria-label="Karty Workspace"
      style={{
        position: "relative", flex: "1 1 320px", minWidth: 0, height: 36, overflow: "hidden", touchAction: "pan-y",
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      {/* Meradlo šírok — neviditeľné, rovnaké písmo ako sloty. */}
      <div ref={meradlo} aria-hidden="true" style={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap", pointerEvents: "none" }}>
        {polozky.map((p) => <span key={p.kluc} style={{ ...tlacidlo, position: "static", display: "inline-block", fontWeight: 800 }}>{obsah(p)}</span>)}
      </div>
      {Array.from({ length: 2 * POL + 1 }, (_, k) => {
        const o = k - POL;
        const j = mod(zaklad + o, n);
        const p = polozky[j];
        if (!p) return null;
        return (
          <button
            key={k}
            ref={(el) => { sloty.current[k] = el; }}
            role="tab"
            onClick={() => {
              if (j === aktivna) {
                // Klik na otvorenú kartu (napr. po posune prstami) ju len vráti do stredu.
                volny.current = false;
                ciel.current = Math.floor(poloha.current) + o;
                return;
              }
              // Pás pôjde kratšou cestou (efekt nad `aktivna`); keby si cieľ
              // nastavil sám a prepnutie by kopa odmietla (beží animácia),
              // rad by ukazoval inú kartu, než je otvorená.
              onVyber(j, posunRadu(aktivna, j, n) < 0 ? -1 : 1);
            }}
            style={tlacidlo}
          >
            {obsah(p)}
          </button>
        );
      })}
    </div>
  );
}
