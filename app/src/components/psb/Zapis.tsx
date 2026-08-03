import { useState } from "react";

import type { Ritual } from "../../lib/psb/rituals";
import { C, mix } from "../../lib/psb/theme";
import { Modal } from "./ui";

// „+ Zápis" — jedno tlačidlo na všetko, čo sa do appky píše ručne.
//
// Appka vie sama len to, čo stiahne z PTmindera. Všetko ostatné — aký bol
// týždeň, čo sa stalo v mesiaci, odkiaľ prišiel dopyt, čo si o klientovi
// myslíme — musí niekto napísať. A to sa dialo tak, že si človek musel
// pamätať, na ktorej z piatich obrazoviek to políčko je.
//
// Preto jedno miesto, ktoré je vidieť vždy, a ktoré popri odkaze rovno hovorí,
// čo za toto obdobie ešte chýba. Nie je to formulár — je to rozcestník, ktorý
// človeka dovedie tam, kde sa to naozaj píše, nech je jeden zápis na jednom
// mieste a nie na dvoch.

type Polozka = { nadpis: string; popis: string; tab: string; sub?: string; stav?: "chyba" | "hotove" };

export function ZapisButton({
  ritualy,
  onNavigate,
}: {
  ritualy: Ritual[];
  onNavigate: (tab: string, sub?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cakajuce = ritualy.filter((r) => r.splatne).length;

  const polozky: Polozka[] = [
    ...ritualy.map((r) => ({
      nadpis: r.nadpis,
      popis: r.detail,
      tab: r.ciel.tab,
      sub: r.ciel.sub,
      stav: r.hotove ? ("hotove" as const) : r.splatne ? ("chyba" as const) : undefined,
    })),
    { nadpis: "Nový dopyt", popis: "Kto sa ozval, odkiaľ a čo sa s tým stalo.", tab: "marketing" },
    { nadpis: "Poznámka ku klientovi", popis: "Stav, pauza, poznámka trénera — v karte klienta.", tab: "klienti" },
    { nadpis: "Záver z debaty", popis: "Rozhodnutie s dátumom, kedy sa overí, či zabralo.", tab: "marketing" },
  ];

  const chod = (p: Polozka) => {
    onNavigate(p.tab, p.sub);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Kam sa čo zapisuje — a čo za toto obdobie ešte chýba"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          border: `1px solid ${cakajuce ? mix(C.accent, 55) : C.border}`,
          background: cakajuce ? mix(C.accent, 12) : "transparent",
          color: cakajuce ? C.accentLight : C.textMuted,
        }}
      >
        + Zápis
        {cakajuce > 0 && (
          <span style={{ background: C.accent, color: C.onAccent, borderRadius: 9, fontSize: 10.5, fontWeight: 700, padding: "1px 6px" }}>
            {cakajuce}
          </span>
        )}
      </button>

      {open && (
        <Modal title="Čo chceš zapísať" onClose={() => setOpen(false)}>
          <div style={{ display: "grid", gap: 8 }}>
            {polozky.map((p) => (
              <button
                key={p.nadpis}
                onClick={() => chod(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer",
                  padding: "11px 13px", borderRadius: 10, width: "100%",
                  border: `1px solid ${p.stav === "chyba" ? mix(C.accent, 45) : C.border}`,
                  background: p.stav === "chyba" ? mix(C.accent, 8) : "transparent",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.text }}>{p.nadpis}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.textDim, marginTop: 2, lineHeight: 1.45 }}>{p.popis}</span>
                </span>
                {p.stav === "hotove" && <span style={{ fontSize: 11, color: C.green, flexShrink: 0 }}>hotové</span>}
                {p.stav === "chyba" && <span style={{ fontSize: 11, color: C.accentLight, flexShrink: 0 }}>teraz</span>}
                <span style={{ color: C.textDim, flexShrink: 0 }}>→</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>
            Zapisuje sa tam, kde to patrí — toto je len rozcestník, aby si nemusel pamätať kde.
            Týždeň sa píše cez víkend, mesiac na prvý víkend nasledujúceho mesiaca.
          </div>
        </Modal>
      )}
    </>
  );
}
