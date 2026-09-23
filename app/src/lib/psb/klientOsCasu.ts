/**
 * Jedna os času klienta: čo zaplatil, kedy chodil a čo mu vtedy bežalo.
 *
 * Jerry, 23. 9. 2026: „klient chodí a zistíme, že mu nevychádzajú tréningy —
 * kde nájdem záznamy o tom, kedy platil, kedy bol na tréningu a aké má
 * členstvo a odkedy platí?"
 *
 * Doteraz nikde na jednom mieste. Profil mal platby ako zoznam, tréningy len
 * ako stĺpce po mesiacoch (konkrétne dni nikde) a z balíčka len zostatok
 * „1/6" — bez názvu a bez platnosti. Tri otázky, tri rôzne obrazovky a
 * jedna z odpovedí sa nedala nájsť vôbec.
 *
 * Táto os ich dáva pod seba v čase. Nič nepočíta a nič netvrdí: iba ukáže,
 * čo sa kedy stalo, aby sa dalo spočítať očami. Presne to človek pri „nesedí
 * mu to" potrebuje — nie ďalšie odvodené číslo.
 *
 * TRÉNING Z KALENDÁRA SA PRIZNÁ
 *
 * Export z PTmindera chodí raz za čas, takže posledné dni v ňom chýbajú.
 * Riadok z kalendára preto nesie značku `zKalendara` — inak by človek pri
 * počítaní hodín vynechal to, čo sa už odtrénovalo, a vyšlo by mu, že
 * zostatok nesedí (tá istá pasca ako pri „Posledné" v profile, 21. 9. 2026).
 */

import { normName } from "./format";

export type Udalost =
  | { druh: "platba"; den: string; suma: number; metoda: string; poznamka?: string }
  | { druh: "trening"; den: string; cas?: string; trener?: string; nazov?: string; zKalendara?: boolean }
  | { druh: "balicekOd"; den: string; nazov: string; hodin: number; doDna?: string; zaplatene?: number }
  | { druh: "balicekDo"; den: string; nazov: string; hodin: number };

type Sedenie = { client: string; date: string; time?: string; sessionTrainer?: string; sessionName?: string };
type Platba = { client: string; date: string; amount: number; method: string; note?: string };
type Balicek = { client: string; package: string; total: number; remaining: number; validFrom?: string; validTo?: string; payment?: number; kind?: string };
type KalUdalost = { zaciatok: string; klient: string | null; typ: string | null };

const den = (s: string) => (s || "").slice(0, 10);

export function osCasuKlienta(
  meno: string,
  zdroj: { sessions: Sedenie[]; payments: Platba[]; packages: Balicek[]; kalUdalosti?: KalUdalost[] },
  dnes: string = new Date().toISOString().slice(0, 10),
): Udalost[] {
  const k = normName(meno);
  const moje = <T extends { client: string }>(xs: T[]) => xs.filter((x) => normName(x.client) === k);

  const out: Udalost[] = [];

  for (const s of moje(zdroj.sessions)) {
    out.push({ druh: "trening", den: den(s.date), cas: s.time, trener: s.sessionTrainer, nazov: s.sessionName });
  }

  // Tréningy, ktoré sú v kalendári a v exporte ešte nie. Porovnáva sa po
  // DŇOCH: v jeden deň klient druhýkrát netrénuje a dvojica by len mýlila.
  const dniZExportu = new Set(out.map((x) => x.den));
  for (const u of zdroj.kalUdalosti || []) {
    if (!u.klient || normName(u.klient) !== k) continue;
    if (u.typ !== "trening" && u.typ !== "uvodny") continue;
    const d = den(u.zaciatok);
    if (d > dnes || dniZExportu.has(d)) continue;
    dniZExportu.add(d);
    out.push({ druh: "trening", den: d, cas: u.zaciatok.slice(11, 16), zKalendara: true });
  }

  for (const p of moje(zdroj.payments)) {
    out.push({ druh: "platba", den: den(p.date), suma: p.amount, metoda: p.method, poznamka: p.note });
  }

  for (const b of moje(zdroj.packages)) {
    const od = den(b.validFrom || "");
    const doDna = den(b.validTo || "");
    // Doplnenie členstva nemá v exporte dátumy — na os ho položiť nejde,
    // lebo sa nevie kam. Radšej vynechať než hádať deň.
    if (od) out.push({ druh: "balicekOd", den: od, nazov: b.package, hodin: b.total, doDna: doDna || undefined, zaplatene: b.payment });
    if (doDna && doDna <= dnes) out.push({ druh: "balicekDo", den: doDna, nazov: b.package, hodin: b.total });
  }

  // Najnovšie hore. Pri rovnakom dni ide začiatok balíčka pred tréningy
  // a tréningy pred platbu — tak, ako sa to v ten deň naozaj stalo.
  const poradie = { balicekOd: 0, trening: 1, platba: 2, balicekDo: 3 } as const;
  return out.sort((a, b) => b.den.localeCompare(a.den) || poradie[a.druh] - poradie[b.druh]);
}

/** Koľko tréningov padlo do platnosti daného balíčka — na spočítanie očami. */
export function treningovVBalicku(os: Udalost[], od: string, doDna?: string): number {
  return os.filter((x) => x.druh === "trening" && x.den >= od && (!doDna || x.den <= doDna)).length;
}
