import { useEffect, useLayoutEffect, useRef } from "react";

import { C } from "../../lib/psb/theme";
import { useUzke } from "./useUzke";

/**
 * NAVÁDZAČ KARIET AKO 3D VALEC (Jerry, 6. 10. 2026).
 *
 * „Predstav si zoznam desiatich slov, vpredu je vždy jedno hlavné, zväčšené
 * a zvýraznené; keď posuniem doprava, zvýrazní sa ďalšie a ide to stále
 * dokolečka — vyzerá to, ako keby boli v kruhu, v ktorom sa točia. Need for
 * Speed malo také vyberanie áut." Z troch ukážok mimo Kokpitu
 * (`navrhy-kokpitu/kolotoc-kariet.html`) vybral A · Valec.
 *
 * Názvy stoja na obvode vodorovného kruhu, ktorý sa točí okolo zvislej osi.
 * Otvorená karta je vpredu — najväčšia, ostrá, s rámikom; ostatné sa
 * smerom dozadu zmenšujú, stúpajú a rozmazávajú. Za poslednou ide prvá.
 *
 * Poloha sa počíta mimo Reactu (rAF a priamy zápis štýlu): pri každom
 * snímku prekresľovať komponent by bolo zbytočné a na telefóne trhané.
 * `ciel` je celé číslo, ktoré môže rásť donekonečna — tak sa valec cez koniec
 * zoznamu točí ďalej tým istým smerom a neodbehne naspäť cez všetky karty.
 */
export type PolozkaKolotoca = { kluc: string; nadpis: string; pocet: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Kratšia cesta okolo kruhu z `od` na `na` (−n/2 … n/2). */
export function posunKolesa(od: number, na: number, n: number): number {
  let d = mod(na - od, n);
  if (d > n / 2) d -= n;
  return d;
}

export function KolotocKariet({ polozky, aktivna, onVyber }: {
  polozky: PolozkaKolotoca[];
  aktivna: number;
  /** Klik na názov — index karty a smer (kratšou cestou). */
  onVyber: (j: number, smer: 1 | -1) => void;
}) {
  const n = polozky.length;
  const uzke = useUzke();
  const scena = useRef<HTMLDivElement | null>(null);
  const slova = useRef<(HTMLButtonElement | null)[]>([]);
  const ciel = useRef(aktivna);
  const poloha = useRef(aktivna);
  const menejPohybu = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Otvorená karta sa zmenila (šípka, gesto, klik, obnovenie) → valec sa
  // dotočí kratšou cestou.
  useEffect(() => {
    if (n) ciel.current += posunKolesa(ciel.current, aktivna, n);
  }, [aktivna, n]);

  useLayoutEffect(() => {
    if (!n) return;
    const kresli = () => {
      const el = scena.current;
      if (!el) return;
      const R = Math.min(uzke ? 180 : 560, el.clientWidth * 0.47);
      const krok = (2 * Math.PI) / n;
      const p = poloha.current;
      slova.current.forEach((b, i) => {
        if (!b) return;
        let rel = i - p;
        rel -= n * Math.round(rel / n);
        const th = rel * krok;
        const vpredu = (Math.cos(th) + 1) / 2; // 1 vpredu, 0 vzadu
        const x = R * Math.sin(th);
        const z = R * Math.cos(th) - R;
        const y = -(uzke ? 30 : 50) * (1 - vpredu);
        b.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px) scale(${0.78 + 0.32 * vpredu ** 2})`;
        // Všetky názvy majú byť čitateľné (Jerry, 6. 10. 2026: „aby boli vidno
        // všetky možnosti") — hĺbku nesie veľkosť a výška, nie zmiznutie.
        b.style.opacity = String(0.55 + 0.45 * vpredu ** 2);
        b.style.filter = vpredu > 0.97 ? "none" : `blur(${(1 - vpredu) * 0.5}px)`;
        b.style.zIndex = String(Math.round(vpredu * 100));
        b.style.pointerEvents = vpredu > 0.2 ? "auto" : "none";
      });
    };
    let raf = 0;
    let zije = true;
    const snimka = () => {
      if (!zije) return;
      const d = ciel.current - poloha.current;
      if (Math.abs(d) > 0.001) {
        poloha.current = menejPohybu || Math.abs(d) < 0.002 ? ciel.current : poloha.current + d * 0.16;
        kresli();
      }
      raf = requestAnimationFrame(snimka);
    };
    kresli();
    raf = requestAnimationFrame(snimka);
    // rAF v skrytej záložke nebeží (28. 9. 2026 to zamklo kopu) — po návrate
    // sa valec postaví rovno na cieľ.
    const navrat = () => {
      if (document.visibilityState === "visible") { poloha.current = ciel.current; kresli(); }
    };
    document.addEventListener("visibilitychange", navrat);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(kresli) : null;
    if (ro && scena.current) ro.observe(scena.current);
    return () => {
      zije = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", navrat);
      ro?.disconnect();
    };
  }, [n, uzke, menejPohybu]);

  return (
    <div
      ref={scena}
      role="tablist"
      aria-label="Karty Workspace"
      style={{
        position: "relative", flex: "1 1 320px", minWidth: 0, height: uzke ? 78 : 96,
        perspective: 900, perspectiveOrigin: "50% 40%", overflow: "hidden",
        maskImage: "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)",
      }}
    >
      {polozky.map((p, j) => {
        const akt = j === aktivna;
        return (
          <button
            key={p.kluc}
            ref={(el) => { slova.current[j] = el; }}
            role="tab"
            aria-selected={akt}
            aria-current={akt ? "true" : undefined}
            onClick={() => { if (!akt) onVyber(j, posunKolesa(aktivna, j, n) < 0 ? -1 : 1); }}
            style={{
              position: "absolute", left: "50%", top: "64%", whiteSpace: "nowrap", fontFamily: "inherit",
              cursor: akt ? "default" : "pointer", willChange: "transform, opacity, filter",
              fontSize: uzke ? 11.5 : 12.5, fontWeight: akt ? 800 : 600, padding: akt ? "5px 13px" : "3px 9px", borderRadius: 999,
              border: `1px solid ${akt ? C.accent : "transparent"}`,
              // Nepriehľadné pozadie: názvy vzadu nesmú presvitať cez ten vpredu.
              background: akt ? `linear-gradient(${C.accentBg}, ${C.accentBg}), ${C.surface}` : "transparent",
              color: akt ? C.accentLight : C.textMuted,
              boxShadow: akt ? "0 0 26px rgba(232,137,58,.28)" : "none",
              transition: "color .2s, background .2s, border-color .2s, box-shadow .2s",
            }}
          >
            {p.nadpis}
            {p.pocet > 0 && <span style={{ marginLeft: 6, fontSize: "0.8em", fontWeight: 800, color: akt ? C.accentLight : C.orange }}>{p.pocet}</span>}
          </button>
        );
      })}
    </div>
  );
}
