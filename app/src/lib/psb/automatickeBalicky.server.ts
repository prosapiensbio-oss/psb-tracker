/**
 * BALÍČEK VZNIKÁ PRVÝM TRÉNINGOM — automaticky (Jerry, 4. 10. 2026).
 *
 * „Keďže balíčky vznikajú automaticky začatím prvej hodiny, je potrebné,
 * aby tam to okno bolo?" Nie je. Kokpit pri otvorení appky prejde klientov
 * a tomu, kto trénuje bez balíčka, ho založí sám: veľkosť ako naposledy,
 * cena z cenníka, platnosť od prvého nekrytého tréningu. Nezaplatený ide do
 * mínusu s odpočtom (−1 · 6 h) a vznikne k nemu dlh — presne ako keď ho
 * v PTminderi nahodil Jerry.
 *
 * Návrh počíta `navrhNovehoBalicka` z tej istej osi, akú vidí profil; tu sa
 * len skladá zdroj na serveri. Pri návrate po dlhej pauze balíček vznikne
 * tiež, ale v poznámke nesie „návrat" a krok Balíčky sa spýta, či sedí.
 */
import type { D1Database } from "@cloudflare/workers-types";

import { deriveClients } from "./compute";
import { loadData } from "./db.server";
import { terazPraha } from "./cas";
import { normName } from "./format";
import { osCasuKlienta } from "./klientOsCasu";
import { priebehBalickov } from "./vypisHodin";
import { navrhNovehoBalicka, type NavrhNovehoBalicka } from "./workspaceKroky";

export async function navrhyNovychBalickov(DB: D1Database, dnes: string): Promise<NavrhNovehoBalicka[]> {
  const data = await loadData(DB);
  const clients = deriveClients(data);
  const [bal, kal] = await DB.batch([
    DB.prepare("SELECT klient, nazov, hodiny, platnost_od, platnost_do, cena_czk, zdroj, zrusene_at FROM balicky"),
    DB.prepare("SELECT klient, trener, zaciatok, koniec, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND klient IS NOT NULL"),
  ]);
  type B = { klient: string; nazov: string; hodiny: number | null; platnost_od: string; platnost_do: string | null; cena_czk: number | null; zdroj: string; zrusene_at: string | null };
  const balicky = (bal.results || []) as unknown as B[];
  const zdroj = {
    sessions: data.sessions as never,
    payments: data.payments as never,
    packages: (data.packages || []) as never,
    services: (data.services || []) as never,
    poplatky: (data.poplatky || []) as never,
    nezaplateneKokpit: data.nezaplateneKokpit || [],
    bezHodin: data.bezHodin, platbyKokpit: data.platbyKokpit,
    treningyZdarma: (data.treningyZdarma || []) as never,
    doplneniaHodiny: data.doplneniaHodiny || {},
    historia: (data.historiaBalickov || []) as never,
    balicky: balicky.map((b) => ({
      klient: b.klient, nazov: b.nazov, hodiny: b.hodiny,
      platnostOd: String(b.platnost_od || "").slice(0, 10), platnostDo: b.platnost_do ? String(b.platnost_do).slice(0, 10) : null,
      cenaCzk: b.cena_czk, zdroj: b.zdroj, zruseneAt: b.zrusene_at,
    })) as never,
    kalUdalosti: (kal.results || []) as never,
  };
  const out: NavrhNovehoBalicka[] = [];
  for (const c of Object.values(clients)) {
    if (c.status === "Neaktívny") continue;
    /**
     * NEROZHODNUTÁ PLATNOSŤ — starému balíčku skončila platnosť a hodiny
     * zostali. Kým Jerry nepovie, či ich dostane ako doplnenie, nový balíček
     * nevznikne: doplnenie má ísť PRED ním a posunie mu začiatok
     * (Jerry, 4. 10. 2026). Po odpovedi ho ďalšie otvorenie appky založí.
     */
    const doDna = String(c.packageValidTo || "").slice(0, 10);
    if (doDna && doDna < dnes && c.packageRemaining > 0 && !data.anomalyAck?.[`platnost|${c.name}|${doDna}`]) continue;
    // Os po TERAZ, nie po celý deň: tréning o 8:30 nesmie založiť balíček
    // o 6:40 — keby sa zrušil, balíček s dlhom by zostal (6. 10. 2026,
    // Markéta Resnerová). Profil a stránka klienta počítajú tiež s hodinou.
    const os = osCasuKlienta(c.name, zdroj, terazPraha());
    const { stavy } = priebehBalickov(os, c.packageTotal > 0 ? c.packageRemaining : null, dnes);
    const k = normName(c.name);
    const ceny = [
      ...balicky.filter((b) => normName(b.klient) === k && !b.zrusene_at).map((b) => ({ den: b.platnost_od, cena: b.cena_czk })),
      ...(data.historiaBalickov || []).filter((h) => normName(h.client) === k).map((h) => ({ den: h.validFrom || "", cena: h.payment ?? null })),
    ];
    const n = navrhNovehoBalicka(c.name, os, stavy, ceny);
    if (n) out.push(n);
  }
  return out;
}
