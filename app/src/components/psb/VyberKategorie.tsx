import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { C, mix } from "../../lib/psb/theme";
import { kategorieZoznam } from "./Banka";

// Výber kategórie s hľadaním.
//
// Zoznam má cez päťdesiat položiek v šiestich skupinách a natívna rozbaľovačka
// v ňom nevie hľadať — človek musí očami prejsť celý zoznam, a to pri každom
// riadku znova. Napísať „najom" a stlačiť Enter je rádovo rýchlejšie.
//
// Keď je vybraných viac riadkov naraz, zmena v ktoromkoľvek z nich platí pre
// všetky označené. Panel hore na to bol tiež, ale znamenal cestu očami hore a
// späť; prirodzenejšie je zmeniť to tam, kde sa človek práve pozerá.
//
// PONUKA SA KRESLÍ NAD STRÁNKOU (portál do <body>), nie vnútri riadku.
// Jerry, 9. 10. 2026 (snímka z uzávierky): karta vo Workspace oreže všetko, čo
// z nej vytŕča, a z ponuky ostalo len políčko hľadania. Pozícia sa berie
// z tlačidla; keď pod ním nie je miesto, ponuka sa otvorí nahor.

const VYSKA_PONUKY = 340;

export function VyberKategorie({
  hodnota, onZmena, sirka = 250, pocetOznacenych = 0,
}: {
  hodnota: string;
  onZmena: (kategoria: string) => void;
  sirka?: number;
  /** Ak > 1, zmena sa prejaví na všetkých označených — povie to aj nápoveda. */
  pocetOznacenych?: number;
}) {
  const KAT = useMemo(kategorieZoznam, []);
  const [otvorene, setOtvorene] = useState(false);
  const [hladat, setHladat] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const ponukaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [poloha, setPoloha] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);

  // Poloha ponuky z tlačidla — pri otvorení, rolovaní aj zmene veľkosti okna.
  useLayoutEffect(() => {
    if (!otvorene) return;
    const zmeraj = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(sirka, 260);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const dole = window.innerHeight - r.bottom;
      setPoloha(dole >= VYSKA_PONUKY || dole >= r.top
        ? { left, top: r.bottom + 3, width }
        : { left, bottom: window.innerHeight - r.top + 3, width });
    };
    zmeraj();
    window.addEventListener("scroll", zmeraj, true);
    window.addEventListener("resize", zmeraj);
    return () => { window.removeEventListener("scroll", zmeraj, true); window.removeEventListener("resize", zmeraj); };
  }, [otvorene, sirka]);

  useEffect(() => {
    if (!otvorene) return;
    inputRef.current?.focus({ preventScroll: true });
    const mimo = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || ponukaRef.current?.contains(t)) return;
      setOtvorene(false); setHladat("");
    };
    document.addEventListener("mousedown", mimo);
    document.addEventListener("touchstart", mimo);
    return () => { document.removeEventListener("mousedown", mimo); document.removeEventListener("touchstart", mimo); };
  }, [otvorene]);

  const aktualna = KAT.find((k) => k.value === hodnota);
  const h = hladat.trim().toLowerCase();
  // Hľadá sa v názve aj v skupine — „spoloc" nájde všetky spoločné výdavky.
  const najdene = h ? KAT.filter((k) => `${k.label} ${k.skupina}`.toLowerCase().includes(h)) : KAT;

  const vyber = (v: string) => { onZmena(v); setOtvorene(false); setHladat(""); };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOtvorene((o) => !o)}
        style={{
          background: hodnota ? C.cardHover : mix(C.orange, 12),
          color: hodnota ? C.text : C.text,
          border: `1px solid ${hodnota ? C.border : mix(C.orange, 40)}`,
          borderRadius: 6, fontSize: 11.5, padding: "4px 7px", maxWidth: sirka,
          cursor: "pointer", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {aktualna?.label || "— nezaradené —"} <span style={{ color: C.textDim }}>▾</span>
      </button>

      {otvorene && poloha && typeof document !== "undefined" && createPortal(
        <div ref={ponukaRef} style={{
          position: "fixed", zIndex: 1000, left: poloha.left, top: poloha.top, bottom: poloha.bottom, width: poloha.width,
          background: C.surface, border: `1px solid ${mix(C.accent, 40)}`, borderRadius: 9,
          boxShadow: "0 10px 28px rgba(0,0,0,.45)", padding: 7,
        }}>
          {pocetOznacenych > 1 && (
            <div style={{ fontSize: 11, color: C.accentLight, marginBottom: 6, lineHeight: 1.4 }}>
              Zmena sa použije na všetkých <b>{pocetOznacenych}</b> označených.
            </div>
          )}
          <input
            ref={inputRef}
            value={hladat}
            onChange={(e) => setHladat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && najdene.length) vyber(najdene[0].value);
              if (e.key === "Escape") { setOtvorene(false); setHladat(""); }
            }}
            placeholder="Hľadať kategóriu…"
            style={{ width: "100%", padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, marginBottom: 6 }}
          />
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {najdene.length === 0 && (
              <div style={{ fontSize: 11.5, color: C.textDim, padding: "6px 8px" }}>Nič také tu nie je.</div>
            )}
            {[...new Set(najdene.map((k) => k.skupina))].map((sk) => (
              <div key={sk || "_"}>
                {sk && (
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.textDim, padding: "6px 8px 3px" }}>{sk}</div>
                )}
                {najdene.filter((k) => k.skupina === sk).map((k) => (
                  <button
                    key={k.value}
                    onClick={() => vyber(k.value)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                      padding: "5px 8px", borderRadius: 6, border: "none",
                      background: k.value === hodnota ? mix(C.accent, 16) : "transparent",
                      color: k.value === hodnota ? C.accentLight : C.text, fontSize: 12,
                    }}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
