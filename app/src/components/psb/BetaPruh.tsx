import { jeBeta } from "../../lib/psb/beta";
import { C } from "../../lib/psb/theme";

/**
 * Červený pruh, ktorý hovorí nahlas, že toto je beta — a hlavne že píše do
 * OSTRÝCH dát. Oddelená kópia databázy by znamenala testovanie na starých
 * číslach; radšej jedna pravda a varovanie, ktoré sa nedá prehliadnuť.
 */
export function BetaPruh() {
  if (!jeBeta()) return null;
  return (
    <div
      style={{
        background: C.red,
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
        padding: "6px 16px",
        textAlign: "center",
      }}
    >
      BETA · skúšobné rozloženia · píše do tej istej databázy ako ostrý Kokpit
    </div>
  );
}
