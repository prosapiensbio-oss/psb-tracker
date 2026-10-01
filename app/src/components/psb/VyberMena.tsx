import { useEffect, useRef, useState, type CSSProperties } from "react";

import { C, mix } from "../../lib/psb/theme";
import { najdiMena } from "../../lib/psb/vyberMena";

/**
 * POLÍČKO NA MENO KLIENTA S VLASTNOU ROLETOU.
 *
 * Predtým to bol `<input list=…>` s `<datalist>`. Vyzeralo to lacno a na
 * monitore to aj fungovalo — ale roletu kreslí PREHLIADAČ a ten si ju
 * umiestňuje sám. Jerry, 1. 10. 2026:
 *
 *   • na iPade sa zoznam zjavil odtrhnutý v ľavom hornom rohu obrazovky
 *     a po prvom písmene zmizol úplne (iPadOS ho prehodí do pásu nad
 *     klávesnicou, čo vyzerá ako chyba),
 *   • na MacBooku sa nad našu roletu položila ponuka KONTAKTOV z telefónu
 *     a náš zoznam ostal schovaný pod ňou.
 *
 * Preto si roletu kreslí appka: vieme, kde je, ako vyzerá a čo je v nej.
 * `autoComplete="off"` a neutrálny `name` k tomu odrádzajú systémové
 * dopĺňanie kontaktov — políčko, ktoré sa volá „meno", si operačný systém
 * inak vyloží ako kolónku na meno človeka z adresára.
 *
 * Klávesnica funguje (šípky, Enter, Escape), lebo na MacBooku je to
 * rýchlejšie než myš — a je to to isté, čo robila pôvodná roleta.
 */
export function VyberMena({ hodnota, mena, onZmen, placeholder = "píš meno…", style, autoFocus, varovanie }: {
  hodnota: string;
  mena: string[];
  onZmen: (v: string) => void;
  placeholder?: string;
  /** Štýl samotného políčka — rozmery si určuje miesto, kde stojí. */
  style?: CSSProperties;
  autoFocus?: boolean;
  /** Oranžový rámik: meno nesedí na nikoho zo zoznamu. */
  varovanie?: boolean;
}) {
  const [otvorene, setOtvorene] = useState(false);
  const [kurzor, setKurzor] = useState(0);
  const obal = useRef<HTMLDivElement | null>(null);

  const navrhy = najdiMena(mena, hodnota);

  // Klik mimo zavrie roletu. Bez toho by zostala otvorená nad obsahom aj
  // potom, čo človek odišiel inam — a prekrývala by, čo chce vidieť.
  useEffect(() => {
    if (!otvorene) return;
    const mimo = (e: MouseEvent | TouchEvent) => {
      if (obal.current && !obal.current.contains(e.target as Node)) setOtvorene(false);
    };
    document.addEventListener("mousedown", mimo);
    document.addEventListener("touchstart", mimo);
    return () => {
      document.removeEventListener("mousedown", mimo);
      document.removeEventListener("touchstart", mimo);
    };
  }, [otvorene]);

  const vyber = (m: string) => {
    onZmen(m);
    setOtvorene(false);
    setKurzor(0);
  };

  return (
    <div ref={obal} style={{ position: "relative" }}>
      <input
        value={hodnota}
        onChange={(e) => { onZmen(e.target.value); setOtvorene(true); setKurzor(0); }}
        onFocus={() => setOtvorene(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOtvorene(false); return; }
          if (!otvorene || !navrhy.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setKurzor((k) => Math.min(navrhy.length - 1, k + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setKurzor((k) => Math.max(0, k - 1)); }
          if (e.key === "Enter") { e.preventDefault(); vyber(navrhy[Math.min(kurzor, navrhy.length - 1)]); }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // Bez týchto štyroch si iOS aj macOS políčko vyloží ako meno osoby
        // a ponúkne kontakty z adresára — tie potom ležia NAD našou roletou.
        name="psb-vyber"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{
          padding: "7px 10px", borderRadius: 8, fontSize: 12.5, width: "100%", boxSizing: "border-box",
          background: C.bg, color: C.text,
          border: `1px solid ${varovanie ? C.orange : C.border}`,
          ...style,
        }}
      />
      {otvorene && navrhy.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 60,
          // NEPRIEHĽADNÁ plocha: pod sklenenými paletami by sa cez roletu
          // čítal text pod ňou (pravidlo z 30. 9. 2026).
          background: C.surface, border: `1px solid ${mix(C.border, 140)}`, borderRadius: 9,
          boxShadow: "0 10px 26px rgba(0,0,0,.45)", overflow: "hidden",
          maxHeight: 232, overflowY: "auto",
        }}>
          {navrhy.map((m, i) => (
            <button
              key={m}
              type="button"
              // `mousedown` by políčko odfokusoval skôr, než klik dobehne —
              // a roleta by sa zavrela bez výberu.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => vyber(m)}
              onMouseEnter={() => setKurzor(i)}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                padding: "9px 11px", fontSize: 13, fontFamily: "inherit",
                border: "none", borderBottom: i < navrhy.length - 1 ? `1px solid ${mix(C.border, 60)}` : "none",
                background: i === kurzor ? mix(C.accent, 14) : "transparent",
                color: i === kurzor ? C.text : C.textMuted,
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
