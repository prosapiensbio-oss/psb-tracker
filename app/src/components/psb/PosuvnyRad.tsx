import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { C } from "../../lib/psb/theme";

/**
 * RAD, KTORÝ SA NEZMESTÍ — a povie to.
 *
 * Na telefóne je rad podzáložiek vodorovne posuvný a „Výsledky" či „Nákupy"
 * stoja za okrajom bez jediného náznaku, že tam niečo je (rozbor Kokpitu,
 * 1. 11. 2026). Kraj, za ktorým niečo pokračuje, preto vybledne a má šípku;
 * kraj, kde rad končí, nie.
 *
 * Aktívna položka (`data-aktivna="1"`) sa posunie do dohľadu, len ak je mimo.
 * Rad, ktorý sa po každom kliknutí vycentruje, posúva tlačidlá ľuďom spod
 * prsta: ďalší ťuk trafí susedné (Workspace, preskok na Uzávierku).
 * `scrollIntoView` tu nie je zámerne — ten by pohol aj stránkou.
 */

/** Je za ľavým / pravým krajom ešte niečo? Tolerancia na zlomky pixela pri zoome. */
export function krajeRadu(posun: number, okno: number, obsah: number): { vlavo: boolean; vpravo: boolean } {
  return { vlavo: posun > 1, vpravo: posun + okno < obsah - 1 };
}

/**
 * Kam posunúť rad, aby bola položka `[od, po]` celá vidno. Keď už je, rad ostane
 * stáť — to je celý zmysel. `okraj` nechá vidieť kúsok suseda, nech je jasné, že
 * rad pokračuje, a položka nestojí pod vyblednutím.
 */
export function posunDoDohladu(posun: number, okno: number, od: number, po: number, okraj = 28): number {
  if (od >= posun + (posun > 0 ? okraj : 0) && po <= posun + okno - okraj) return posun;
  if (od < posun + okraj) return Math.max(0, od - okraj);
  return po - okno + okraj;
}

const SIRKA_KRAJA = 26;

export function PosuvnyRad({ children, zmena, gap = 6, style, rola, popis }: {
  children: ReactNode;
  /** Čo sa zmenilo, keď treba skontrolovať, či je aktívna položka vidno. */
  zmena?: unknown;
  gap?: number;
  style?: CSSProperties;
  rola?: string;
  popis?: string;
}) {
  const rad = useRef<HTMLDivElement | null>(null);
  const [kraje, setKraje] = useState({ vlavo: false, vpravo: false });

  useEffect(() => {
    const el = rad.current;
    if (!el) return;
    const zmeraj = () => {
      const k = krajeRadu(el.scrollLeft, el.clientWidth, el.scrollWidth);
      setKraje((x) => (x.vlavo === k.vlavo && x.vpravo === k.vpravo ? x : k));
    };
    zmeraj();
    el.addEventListener("scroll", zmeraj, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(zmeraj) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", zmeraj); ro?.disconnect(); };
  }, []);

  useLayoutEffect(() => {
    const el = rad.current;
    const akt = el?.querySelector<HTMLElement>('[data-aktivna="1"]');
    if (!el || !akt) return;
    const r = el.getBoundingClientRect(), a = akt.getBoundingClientRect();
    const od = a.left - r.left + el.scrollLeft;
    const novy = posunDoDohladu(el.scrollLeft, el.clientWidth, od, od + a.width);
    if (novy !== el.scrollLeft) el.scrollLeft = novy;
  }, [zmena]);

  const maska = `linear-gradient(90deg, ${kraje.vlavo ? `transparent, #000 ${SIRKA_KRAJA}px` : "#000 0"}, ${kraje.vpravo ? `#000 calc(100% - ${SIRKA_KRAJA}px), transparent` : "#000 100%"})`;
  const sipka = (strana: "left" | "right") => (
    <span aria-hidden="true" style={{
      position: "absolute", [strana]: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", pointerEvents: "none",
      fontSize: 15, fontWeight: 700, color: C.textMuted, padding: "0 2px",
    }}>{strana === "left" ? "‹" : "›"}</span>
  );

  return (
    <div style={{ position: "relative", minWidth: 0, ...style }}>
      <div
        ref={rad}
        role={rola}
        aria-label={popis}
        style={{
          display: "flex", gap, alignItems: "center", overflowX: "auto", scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain",
          maskImage: maska, WebkitMaskImage: maska,
        }}
      >
        {children}
      </div>
      {kraje.vlavo && sipka("left")}
      {kraje.vpravo && sipka("right")}
    </div>
  );
}
