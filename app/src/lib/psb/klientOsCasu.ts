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
  | { druh: "trening"; den: string; cas?: string; trener?: string; nazov?: string; zKalendara?: boolean; minut?: number }
  | { druh: "balicekOd"; den: string; nazov: string; hodin: number; doDna?: string; zaplatene?: number; odvodene?: boolean; nezaplatene?: boolean; doplnenie?: boolean }
  | { druh: "balicekDo"; den: string; nazov: string; hodin: number; odvodene?: boolean };

/**
 * Koľko hodín má balíček v názve.
 *
 * Offline členstvá PTminder vyváža ako 0/0 a počet hodín stojí len v názve
 * („OFF - 18 hodín offline"). Bez toho by os času tvrdila „bez limitu"
 * a zostatok by po prvom tréningu padol do mínusu — Natália Pečková −1 h.
 * Tú istú hodnotu číta `deriveClients` v compute.ts; definícia je JEDNA.
 */
export function hodinZNazvuBalicka(nazov: string): number {
  return Number(/(\d+)\s*(?:h\b|hodin|hodiny|hodín)/i.exec(nazov || "")?.[1] || 0);
}

/**
 * Doplnenie členstva — hodiny sa dokupujú k bežiacemu balíčku.
 *
 * V exporte je 144 takých riadkov a ani jeden nehovorí, o koľko hodín ide.
 * Na os sa preto kladú ako značka („v ten deň sa dokupovalo"), nie ako číslo;
 * rozdiel oproti PTminderu sa k nim priradí, ak nejaký je.
 */
export function jeDoplnenie(nazov: string): boolean {
  return /doplnenie/i.test(nazov || "");
}

/** Čo z exportu služieb je predaj tréningov a čo tovar (míček, poukaz). */
const SLUZBA_JE_BALICEK = (typ: string) => typ === "Membership" || typ === "Package";

type Sedenie = { client: string; date: string; time?: string; sessionTrainer?: string; sessionName?: string; duration?: number };
type Platba = { client: string; date: string; amount: number; method: string; note?: string };
type Balicek = { client: string; package: string; total: number; remaining: number; validFrom?: string; validTo?: string; payment?: number; kind?: string };
type Sluzba = { client: string; date: string; serviceType: string; description: string; price: number };
type Poplatok = { klient: string; datum: string; popis: string; suma: number };
type KalUdalost = { zaciatok: string; klient: string | null; typ: string | null };

const den = (s: string) => (s || "").slice(0, 10);

export function osCasuKlienta(
  meno: string,
  zdroj: { sessions: Sedenie[]; payments: Platba[]; packages: Balicek[]; kalUdalosti?: KalUdalost[]; services?: Sluzba[]; poplatky?: Poplatok[] },
  dnes: string = new Date().toISOString().slice(0, 10),
): Udalost[] {
  const k = normName(meno);
  const moje = <T extends { client: string }>(xs: T[]) => xs.filter((x) => normName(x.client) === k);

  const out: Udalost[] = [];

  for (const s of moje(zdroj.sessions)) {
    out.push({ druh: "trening", den: den(s.date), cas: s.time, trener: s.sessionTrainer, nazov: s.sessionName, minut: s.duration });
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
    // Export mlčí (0/0) → hodiny z názvu, a riadok to prizná značkou ≈.
    const zNazvu = hodinZNazvuBalicka(b.package);
    const hodin = b.total || zNazvu;
    const odvodene = !b.total && zNazvu > 0;
    if (od) out.push({ druh: "balicekOd", den: od, nazov: b.package, hodin, doDna: doDna || undefined, zaplatene: b.payment, odvodene });
    if (doDna && doDna <= dnes) out.push({ druh: "balicekDo", den: doDna, nazov: b.package, hodin, odvodene });
  }

  /**
   * ZAČIATKY ČLENSTIEV Z EXPORTU SLUŽIEB
   *
   * Jerry, 26. 9. 2026: „vidím zapísané platby, ale nevidím začiatky členstiev,
   * iba tak max posledného." Bola to pravda o zdroji: `packages` je SNÍMKA
   * dneška (55 riadkov s dátumom, najstarší 3/2026), takže na osi stál jediný
   * balíček. Export služieb (Payroll → Services) je naproti tomu KNIHA — 456
   * riadkov od 5. 1. 2025 — a nesie každý predaj členstva aj s dňom a cenou.
   *
   * Riadok z `packages` má prednosť, lebo vie aj platnosť a zostatok; služba
   * v ten istý deň s tým istým názvom sa preto preskočí.
   */
  const uzJe = new Set(out.filter((x) => x.druh === "balicekOd").map((x) => `${x.den}|${normName(x.nazov)}`));
  const nezaplateneDni = new Set(
    (zdroj.poplatky || []).filter((p) => normName(p.klient) === k).map((p) => den(p.datum)),
  );
  for (const sl of (zdroj.services || []).filter((x) => normName(x.client) === k)) {
    if (!SLUZBA_JE_BALICEK(sl.serviceType)) continue;
    const d = den(sl.date);
    if (!d || d > dnes) continue;
    const kluc = `${d}|${normName(sl.description)}`;
    if (uzJe.has(kluc)) continue;
    uzJe.add(kluc);
    const zNazvu = hodinZNazvuBalicka(sl.description);
    out.push({
      druh: "balicekOd",
      den: d,
      nazov: sl.description,
      hodin: zNazvu,
      zaplatene: sl.price || undefined,
      nezaplatene: nezaplateneDni.has(d) || undefined,
      doplnenie: jeDoplnenie(sl.description) || undefined,
    });
  }
  // Nezaplatené sa musí prilepiť aj na riadok, ktorý prišiel z `packages`.
  for (const u of out) {
    if (u.druh === "balicekOd" && nezaplateneDni.has(u.den)) u.nezaplatene = true;
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
