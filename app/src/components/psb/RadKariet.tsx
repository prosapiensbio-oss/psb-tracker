import { C } from "../../lib/psb/theme";
import { PosuvnyRad } from "./PosuvnyRad";

/**
 * RAD KARIET WORKSPACE — stojí na mieste (rozbor Kokpitu, 1. 11. 2026).
 *
 * Od 6. 10. 2026 to bol „nekonečný rad": názvy sa opakovali dokola a otvorená
 * karta sa po každom kliku vycentrovala. Cena: tlačidlá menili miesto pod rukou
 * (ďalší ťuk trafil suseda — preskok na Uzávierku), prvé boli orezané a čítačka
 * čítala každú kartu trikrát. Teraz je každá karta v rade raz a rad sa pohne,
 * len keď je otvorená karta mimo dohľadu. Dokola ide ďalej samotné prepínanie
 * — šípky a švih prejdú z poslednej karty na prvú.
 *
 * Zvýraznenie je obyčajný React, takže sa prepne hneď s klikom, nie až keď
 * doběhne prechod karty.
 */
export type PolozkaRadu = { kluc: string; nadpis: string; pocet: number };

export function RadKariet({ polozky, aktivna, onVyber, style }: {
  polozky: PolozkaRadu[];
  aktivna: number;
  onVyber: (j: number, smer: 1 | -1) => void;
  style?: React.CSSProperties;
}) {
  return (
    <PosuvnyRad rola="tablist" popis="Karty Workspace" zmena={`${aktivna}|${polozky.length}`} gap={4} style={style}>
      {polozky.map((p, j) => {
        const akt = j === aktivna;
        return (
          <button
            key={p.kluc}
            role="tab"
            aria-selected={akt}
            data-aktivna={akt ? "1" : undefined}
            onClick={() => { if (!akt) onVyber(j, j < aktivna ? -1 : 1); }}
            style={{
              flex: "none", whiteSpace: "nowrap", fontFamily: "inherit", fontSize: 12.5, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
              fontWeight: akt ? 800 : 600,
              color: akt ? C.accentLight : C.textMuted,
              border: `1px solid ${akt ? C.accent : "transparent"}`,
              background: akt ? C.accentBg : "transparent",
            }}
          >
            {/* Šírka sa meria na tučnom texte: aktívna karta je tučnejšia a rad by sa
                po každom prepnutí posunul o 1–6 px (kontrola po nasadení, 1. 11. 2026). */}
            <span style={{ display: "inline-grid" }}>
              <span aria-hidden="true" style={{ gridArea: "1 / 1", fontWeight: 800, visibility: "hidden" }}>{p.nadpis}</span>
              <span style={{ gridArea: "1 / 1" }}>{p.nadpis}</span>
            </span>
            {p.pocet > 0 && <span style={{ marginLeft: 5, fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: C.orange }}>{p.pocet}</span>}
          </button>
        );
      })}
    </PosuvnyRad>
  );
}
