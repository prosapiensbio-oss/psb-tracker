import { jeBeta } from "../../lib/psb/beta";
import { C } from "../../lib/psb/theme";

/**
 * Čo sa v bete práve skúša.
 *
 * Jerry, 25. 9. 2026: „v bete nevidím žiadnu zmenu." Obe vtedajšie zmeny tam
 * pritom boli — jedna bola PRESUN karty preč (teda absencia, ktorú si nikto
 * nevšimne) a druhá iné poradie záložiek na obrazovke, kde záložky boli aj
 * predtým. Obe sme podľa jeho rozhodnutia vrátili. Beta, o ktorej treba hádať,
 * kde sa pozrieť, je na nič; pruh preto rovno povie, čo sa skúša, a klik
 * zavedie na to miesto.
 *
 * Keď sa niečo z bety nasadí naostro alebo zahodí, RIADOK SA ODTIAĽTO MAŽE —
 * inak pruh o pol roka klame rovnako, ako klamal text pod P&L.
 */
const SKUSA_SA: { text: string; tab: string; sub: string }[] = [
  // Prázdne: Marketing → Prehľad aj Peniaze → Prehľad sú od 25. 9. 2026
  // naostro. Pruh vtedy ukáže len varovanie o databáze — a to je správne,
  // beta bez skúšky je len druhá adresa toho istého.
];

/**
 * Červený pruh, ktorý hovorí nahlas, že toto je beta — a hlavne že píše do
 * OSTRÝCH dát. Oddelená kópia databázy by znamenala testovanie na starých
 * číslach; radšej jedna pravda a varovanie, ktoré sa nedá prehliadnuť.
 */
export function BetaPruh({ onSkoc }: { onSkoc?: (tab: string, sub?: string) => void }) {
  if (!jeBeta()) return null;
  return (
    <div
      style={{
        background: C.red,
        color: "#fff",
        fontSize: 12,
        letterSpacing: 0.3,
        padding: "6px 16px",
        textAlign: "center",
        display: "flex",
        flexWrap: "wrap",
        gap: "2px 10px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 700 }}>BETA · píše do tej istej databázy ako ostrý Kokpit</span>
      {SKUSA_SA.length > 0 && <span style={{ opacity: 0.75 }}>skúša sa:</span>}
      {SKUSA_SA.map((s, i) => (
        <button
          key={s.tab + s.sub}
          onClick={() => onSkoc?.(s.tab, s.sub)}
          disabled={!onSkoc}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "#fff",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            cursor: onSkoc ? "pointer" : "default",
          }}
        >
          {i + 1}. {s.text}
        </button>
      ))}
    </div>
  );
}
