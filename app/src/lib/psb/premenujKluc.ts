import { normName } from "./format";

/**
 * KĽÚČ ODPOVEDE NA NOTIFIKÁCIU PO PREMENOVANÍ KLIENTA (24. 11. 2026).
 *
 * Revízia októbra našla 12 odpovedí v `anomaly_ack` pod starým menom
 * „Matej Prochadzka“: meno je súčasťou kľúča (`platnost|meno|deň`,
 * `mute|gone|meno`, `narodeniny|meno|…`) a `/api/premenuj` ho neprepisoval.
 * Odklepnutá platnosť sa preto vrátila ako nová notifikácia a „nehlásiť“
 * prestalo platiť.
 *
 * Mení sa len CELÝ diel kľúča medzi zvislicami — „Matej Prochadzka“ nesmie
 * zasiahnuť „Matej Prochadzka ml.“. Niektoré kľúče nesú meno v tvare
 * `normName` (malé písmená, bez diakritiky, napr. `uvodny-sms|`), aj ten sa
 * prepíše. Vráti null, keď v kľúči staré meno nie je.
 */
export function premenujKlucOdpovede(kluc: string, zo: string, na: string): string | null {
  const nZo = normName(zo);
  let zmena = false;
  const diely = String(kluc || "").split("|").map((d) => {
    if (d === zo) { zmena = true; return na; }
    if (nZo && d === nZo && d !== zo) { zmena = true; return normName(na); }
    return d;
  });
  return zmena ? diely.join("|") : null;
}
