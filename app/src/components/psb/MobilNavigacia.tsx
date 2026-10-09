import { useEffect, useState, type ReactNode } from "react";

import { C, mix } from "../../lib/psb/theme";
import { Icon } from "./ui";

/**
 * OVLÁDANIE KOKPITU NA TELEFÓNE — návrh C, naostro od 9. 10. 2026
 * (náčrty navrhy-kokpitu/mobil-navrhy.html; A sa skúšalo v bete a prehralo).
 *
 * Nahrádza na telefóne dvojriadkovú hlavičku a posuvný rad záložiek, ktoré
 * zaberali ~40 % obrazovky a polovicu záložiek schovávali mimo nej. Obsah
 * obrazoviek sa nemení — mení sa len to, ako sa medzi nimi chodí:
 * jeden tenký riadok hore a lišta dole, kam dosiahne palec.
 */
export type CielMobil = { id: string; label: string; icon: string };

export function MobilNavigacia({
  aktivna, nadpis, ciele, chod, onZapis, zapisCaka, onJarvis, hladanie,
  mozeSpat, spat, ktoSom, odhlasit,
}: {
  /** id aktívneho miesta v lište (Firma = "firma"). */
  aktivna: string;
  nadpis: string;
  /** Všetky miesta appky v poradí radu záložiek (Firma ako jedno miesto). */
  ciele: CielMobil[];
  chod: (id: string) => void;
  onZapis: () => void;
  /** Koľko zápisov čaká — odznak na „+". */
  zapisCaka: number;
  onJarvis: () => void;
  /** Hľadanie klienta — ten istý komponent ako na počítači. */
  hladanie: ReactNode;
  mozeSpat: boolean;
  spat: () => void;
  ktoSom: string | null;
  odhlasit: () => void;
}) {
  const [viac, setViac] = useState(false);
  const [hladat, setHladat] = useState(false);
  // Prechod inam zavrie otvorený zoznam aj hľadanie.
  useEffect(() => { setViac(false); setHladat(false); }, [aktivna]);

  const vListe = ["dashboard", "workspace", "kalendar"];
  const ciel = (id: string) => ciele.find((c) => c.id === id);
  const ostatne = ciele.filter((c) => !vListe.includes(c.id));

  const ikona = (meno: string, onClick: () => void, popis: string, zvyrazni = false, odznak = 0) => (
    <button onClick={onClick} aria-label={popis} title={popis}
      style={{ position: "relative", width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", cursor: "pointer", flex: "none",
        border: `1px solid ${zvyrazni ? mix(C.accent, 55) : C.border}`, background: zvyrazni ? mix(C.accent, 14) : "transparent", color: zvyrazni ? C.accentLight : C.text, fontSize: 18 }}>
      {meno.length === 1 ? meno : <Icon name={meno} size={18} />}
      {odznak > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: C.accent, color: C.onAccent, borderRadius: 9, fontSize: 10, fontWeight: 700, padding: "1px 5px" }}>{odznak}</span>}
    </button>
  );

  const polozkaListy = (id: string, label: string, icon: string, onClick: () => void) => {
    const on = aktivna === id;
    return (
      <button key={id} onClick={onClick}
        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer",
          color: on ? C.accentLight : C.textMuted, fontSize: 10.5, fontWeight: on ? 700 : 500, padding: "6px 0", fontFamily: "inherit" }}>
        {icon.length === 1 ? <span style={{ fontSize: 21, lineHeight: "21px", height: 21 }}>{icon}</span> : <Icon name={icon} size={21} />}{label}
      </button>
    );
  };

  const plus = (
    <div key="plus" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <button onClick={onZapis} aria-label="Zápis" style={{ position: "relative", width: 54, height: 54, marginTop: -20, borderRadius: "50%", border: "none", cursor: "pointer",
        background: C.accent, color: C.onAccent, fontSize: 30, fontWeight: 600, lineHeight: 1, boxShadow: "0 6px 18px rgba(0,0,0,.45)" }}>
        +
        {zapisCaka > 0 && <span style={{ position: "absolute", top: -2, right: -2, background: C.red, color: "#fff", borderRadius: 9, fontSize: 10, fontWeight: 700, padding: "1px 5px" }}>{zapisCaka}</span>}
      </button>
    </div>
  );

  const lista = [
    ...["dashboard", "workspace"].map((id) => { const c = ciel(id); return c ? polozkaListy(id, c.label, c.icon, () => chod(id)) : null; }),
    plus,
    ...["kalendar"].map((id) => { const c = ciel(id); return c ? polozkaListy(id, c.label, c.icon, () => chod(id)) : null; }),
    polozkaListy("jarvis", "Jarvis", "sparkles", onJarvis),
  ];

  return (
    <>
      {/* Hore jeden riadok: (≡) (‹) názov obrazovky … ikony. */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        background: mix(C.bg, 96), backdropFilter: "blur(10px)", borderBottom: `1px solid ${mix(C.border, 60)}` }}>
        {ikona("≡", () => setViac((v) => !v), "Viac — ostatné obrazovky", viac)}
        {mozeSpat && ikona("‹", spat, "Späť")}
        <span style={{ fontSize: 18, fontWeight: 800, color: C.accent, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nadpis}</span>
        {ikona("⌕", () => setHladat((h) => !h), "Hľadať klienta", hladat)}
      </div>
      {hladat && (
        <div style={{ position: "sticky", top: 59, zIndex: 39, padding: "8px 12px", background: mix(C.bg, 96), borderBottom: `1px solid ${mix(C.border, 60)}` }}>
          {hladanie}
        </div>
      )}

      {/* „Viac" — všetko, čo nie je v lište, plus prepínač A/C. */}
      {viac && (
        <>
          <div onClick={() => setViac(false)} style={{ position: "fixed", inset: 0, zIndex: 58, background: "rgba(0,0,0,.45)" }} />
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 59, background: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            borderTop: `1px solid ${C.border}`, padding: "10px 16px calc(84px + env(safe-area-inset-bottom))", maxHeight: "80dvh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 10px" }} />
            {ostatne.map((c) => (
              <button key={c.id} onClick={() => chod(c.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "13px 4px", background: "none", border: "none", borderBottom: `1px solid ${mix(C.border, 55)}`,
                  color: aktivna === c.id ? C.accentLight : C.text, fontSize: 15, fontWeight: aktivna === c.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <Icon name={c.icon} size={19} /> {c.label}
              </button>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: C.textMuted }}>
              <span>{ktoSom ? ktoSom.charAt(0).toUpperCase() + ktoSom.slice(1) : ""}</span>
              <button onClick={odhlasit} style={{ background: "none", border: "none", color: C.textDim, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Odhlásiť sa</button>
            </div>
          </div>
        </>
      )}

      {/* Lišta dole — nad ňou je vždy miesto (padding v App). */}
      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, display: "flex", alignItems: "flex-end",
        background: mix(C.bg, 97), backdropFilter: "blur(12px)", borderTop: `1px solid ${C.border}`, padding: "4px 4px calc(6px + env(safe-area-inset-bottom))" }}>
        {lista}
      </nav>
    </>
  );
}
