import { C, mix } from "../../lib/psb/theme";
import type { Pohyb } from "../../lib/psb/zabery";

/**
 * Kreslená ukážka pohybu telefónom.
 *
 * PREČO NIE VYGENEROVANÉ VIDEO
 *
 * Klip „ruka s telefónom robí nájazd" vieme vyrobiť, ale bol by to presvedčivo
 * vyzerajúci ODHAD — a návod, ktorý vyzerá správne a učí zle, je horší než
 * žiadny. Tu je telefón obdĺžnik na dráhe, ktorú určuje `pohyb`. Menej efektné,
 * zato presné a bez čakania na generovanie.
 *
 * Šípka aj dráha sú vždy rovnaké pre ten istý pohyb, takže sa dajú porovnávať.
 */

const KROKY: Record<Pohyb, { popis: string; sekund: number }> = {
  dopredu: { popis: "telefón ide dopredu, subjekt zostáva v strede", sekund: 2 },
  odhalenie: { popis: "telefón sa posunie bokom, scéna sa odkryje", sekund: 1 },
  "oblúk": { popis: "telefón obchádza subjekt po krivke", sekund: 3 },
  sklopenie: { popis: "telefón cúva a dvíha sa z detailu na celok", sekund: 2.5 },
  "švih": { popis: "prudké otočenie s rozmazaním", sekund: 0.4 },
  "statický": { popis: "telefón sa nehýbe, hýbe sa človek v zábere", sekund: 3 },
  dozadu: { popis: "telefón cúva pred idúcim človekom", sekund: 3 },
  sledovanie: { popis: "telefón ide bokom vedľa človeka rovnakým tempom", sekund: 4 },
  zhora: { popis: "telefón je nad subjektom, objektív kolmo dole", sekund: 2 },
  zdola: { popis: "telefón takmer na zemi, objektív mierne hore", sekund: 2.5 },
  naklon: { popis: "telefón sa na mieste otáča zdola nahor", sekund: 3.5 },
  prelet: { popis: "predmet v popredí prejde obrazom a odkryje subjekt", sekund: 2 },
};

export function ZaberUkazka({ pohyb, vyska = 116 }: { pohyb: Pohyb; vyska?: number }) {
  const k = KROKY[pohyb];
  const id = `zab-${pohyb}`;
  const trvanie = `${k.sekund}s`;

  // Dráha telefónu. Súradnice sú v sústave 200×100 a viewBox ich škáluje —
  // vďaka tomu vyzerá ukážka rovnako v okne aj v zozname.
  const drahy: Record<Pohyb, string> = {
    dopredu: "M 30 50 L 74 50",
    odhalenie: "M 22 50 L 66 50",
    "oblúk": "M 26 74 Q 40 26 78 34",
    sklopenie: "M 74 62 L 26 40",
    "švih": "M 40 50 L 88 50",
    "statický": "M 40 50 L 40 50",
    dozadu: "M 74 50 L 30 50",
    sledovanie: "M 18 50 L 82 50",
    zhora: "M 50 18 L 50 40",
    zdola: "M 50 82 L 50 62",
    naklon: "M 44 74 Q 66 52 44 30",
    prelet: "M 16 58 Q 50 38 84 58",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <svg viewBox="0 0 200 100" height={vyska} style={{ width: "100%", maxWidth: 240 }} role="img" aria-label={k.popis}>
        <style>{`
          @keyframes ${id} { from { offset-distance: 0%; } to { offset-distance: 100%; } }
          .${id}-tel {
            offset-path: path("${drahy[pohyb]}");
            offset-rotate: ${pohyb === "oblúk" ? "auto" : "0deg"};
            animation: ${id} ${trvanie} ${pohyb === "švih" ? "cubic-bezier(.7,0,.3,1)" : "ease-in-out"} infinite alternate;
          }
          @media (prefers-reduced-motion: reduce) { .${id}-tel { animation: none; } }
        `}</style>

        {/* subjekt — človek, ktorého točíš */}
        <circle cx="150" cy="38" r="7" fill={mix(C.textMuted, 0.9)} />
        <rect x="144" y="47" width="12" height="30" rx="5" fill={mix(C.textMuted, 0.9)} />

        {/* dráha pohybu */}
        {pohyb !== "statický" && (
          <path d={drahy[pohyb]} fill="none" stroke={mix(C.accent, 0.55)} strokeWidth="1.5"
            strokeDasharray="4 4" strokeLinecap="round" />
        )}

        {/* telefón */}
        <g className={`${id}-tel`}>
          <rect x="-7" y="-13" width="14" height="26" rx="3"
            fill={C.surface} stroke={C.accent} strokeWidth="2" />
          <rect x="-4" y="-10" width="8" height="16" rx="1" fill={mix(C.accent, 0.35)} />
        </g>

        {/* zorný kužeľ, aby bolo vidieť, kam telefón mieri */}
        {pohyb === "statický" && (
          <path d="M 47 50 L 132 30 L 132 70 Z" fill={mix(C.accent, 0.12)} />
        )}
      </svg>
      <div style={{ fontSize: 10.5, color: C.textDim, lineHeight: 1.35 }}>{k.popis}</div>
    </div>
  );
}
