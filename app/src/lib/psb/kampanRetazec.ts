/**
 * Od koruny po klienta — reťazec, ktorý nikto iný nemá celý.
 *
 * PREČO TO NEVIE ADS MANAGER
 *
 * Meta pozná výdavok a odoslaný formulár. NIKDY nepovie cenu za klienta, ktorý
 * zostal pol roka — nevie, kto sa ním stal, lebo tréningy sa nedejú na webe.
 * Kokpit má oba konce: výdavok z Meta API a dochádzku z PTmindera. Toto je
 * jediné miesto, kde sa dajú spojiť.
 *
 * PREČO SA REŤAZEC POČÍTA PO ČLÁNKOCH A NIE JEDNÝM VZORCOM
 *
 * Lebo sa trhá — a keď sa pretrhne, treba vedieť KDE. „Cena za klienta: —"
 * je nepoužiteľná odpoveď; „35 dopytov, z toho 0 s kampaňou" povie, že chýbajú
 * UTM parametre v adrese reklamy, a to sa dá do hodiny opraviť.
 *
 * PREČO JE KLIENT TEN, KTO ZAPLATIL
 *
 * Nie ten, kto prišiel na úvodný. Úvodný tréning JE prvé sedenie, takže by
 * konverzia „úvodný → klient" vždy vyšla 100 % a cena za klienta by sa rovnala
 * cene za úvodný. Klient je ten, po kom zostali peniaze.
 */

import { normName } from "./format";

export type KampanRiadok = {
  id: string;
  nazov: string;
  ciel: string;
  spend: number;
  /** Konverzie tak, ako ich hlási Meta — nie to isté ako dopyt v Kokpite. */
  vysledkyMeta: number;
};

export type DopytRiadok = { id: string; date: string; name: string; kampan: string; source: string };
export type KlientRiadok = { name: string; zaplatil: boolean; trzba: number };

export type Clanok = {
  kampan: KampanRiadok;
  /** Dopyty v Kokpite, ktoré nesú meno tejto kampane v UTM. */
  dopyty: DopytRiadok[];
  /** Z tých dopytov tí, čo sa stali platiacimi klientmi. */
  klienti: KlientRiadok[];
  trzba: number;
  cenaZaDopyt: number | null;
  cenaZaKlienta: number | null;
};

export type Retazec = {
  clanky: Clanok[];
  spolu: {
    spend: number;
    dopytov: number;
    klientov: number;
    trzba: number;
    cenaZaDopyt: number | null;
    cenaZaKlienta: number | null;
  };
  /**
   * Kde sa reťazec trhá. Prázdne pole znamená, že drží celý.
   * Poradie je poradie riešenia — prvá prekážka blokuje ostatné.
   */
  prekazky: string[];
};

/** Kampaň sa páruje podľa `utm_campaign`, nie podľa mena — meno sa v Mete mení. */
const kluc = (s: string) => s.trim().toLowerCase();

export function retazecKampani(
  kampane: KampanRiadok[],
  dopyty: DopytRiadok[],
  klienti: Record<string, { zaplatil: boolean; trzba: number }>,
): Retazec {
  // Kampaň v UTM sa páruje na meno kampane z Mety. Zhoda musí byť presná (po
  // orezaní a malých písmenách): keby sa hľadalo podreťazcom, „IG_Reels_2025_1"
  // by chytilo aj „IG_Reels_2025_10".
  const podlaKampane = new Map<string, DopytRiadok[]>();
  for (const d of dopyty) {
    if (!d.kampan) continue;
    const k = kluc(d.kampan);
    podlaKampane.set(k, [...(podlaKampane.get(k) || []), d]);
  }

  const najdiKlienta = (meno: string) => {
    const n = normName(meno);
    for (const [k, v] of Object.entries(klienti)) if (normName(k) === n) return { name: k, ...v };
    return null;
  };

  const clanky: Clanok[] = kampane.map((kampan) => {
    const dop = podlaKampane.get(kluc(kampan.nazov)) || [];
    const kl = dop
      .map((d) => najdiKlienta(d.name))
      .filter((c): c is KlientRiadok => !!c && c.zaplatil);
    const trzba = kl.reduce((a, c) => a + c.trzba, 0);
    return {
      kampan, dopyty: dop, klienti: kl, trzba,
      cenaZaDopyt: dop.length ? kampan.spend / dop.length : null,
      cenaZaKlienta: kl.length ? kampan.spend / kl.length : null,
    };
  });

  const spend = clanky.reduce((a, c) => a + c.kampan.spend, 0);
  const dopytov = clanky.reduce((a, c) => a + c.dopyty.length, 0);
  const klientov = clanky.reduce((a, c) => a + c.klienti.length, 0);
  const trzba = clanky.reduce((a, c) => a + c.trzba, 0);

  // ── kde sa to trhá ────────────────────────────────────────────────────────
  const prekazky: string[] = [];
  const naDopyt = kampane.filter((k) => JE_CIEL_DOPYT.has(k.ciel));
  if (kampane.length === 0) {
    prekazky.push("Z Mety nie sú stiahnuté žiadne kampane.");
  } else if (naDopyt.length === 0) {
    prekazky.push(
      `Ani jedna z ${kampane.length} kampaní nemá cieľ „dopyt“ — kupovali dosah, prekliky a interakcie. ` +
      "Kampaň, ktorá o dopyt nepožiada, ho nemá ako priniesť a cena za klienta z nej nevznikne.",
    );
  }
  const sKampanou = dopyty.filter((d) => d.kampan).length;
  if (dopyty.length > 0 && sKampanou === 0) {
    prekazky.push(
      `Ani jeden z ${dopyty.length} dopytov nemá kampaň. Pripoj do adresy v reklame utm_campaign — ` +
      "bez neho sa dopyt s kampaňou spojiť nedá a spojenie sa spätne nedoplní.",
    );
  }
  if (sKampanou > 0 && dopytov === 0) {
    prekazky.push(
      "Dopyty kampaň nesú, ale ani jedna sa nezhoduje s menom kampane z Mety. " +
      "Skontroluj, či utm_campaign v adrese sedí s názvom kampane v Ads Manageri.",
    );
  }
  if (dopytov > 0 && klientov === 0) {
    prekazky.push(
      `Z ${dopytov} dopytov z kampaní sa zatiaľ nikto nestal platiacim klientom. ` +
      "Buď je ešte skoro, alebo sa strácajú po prvom kontakte — pozri dôvody straty v Dopytoch.",
    );
  }

  return {
    clanky: clanky.sort((a, b) => b.kampan.spend - a.kampan.spend),
    spolu: {
      spend, dopytov, klientov, trzba,
      cenaZaDopyt: dopytov ? spend / dopytov : null,
      cenaZaKlienta: klientov ? spend / klientov : null,
    },
    prekazky,
  };
}

/** Ciele, pri ktorých Meta o dopyt naozaj žiada. */
export const JE_CIEL_DOPYT = new Set(["OUTCOME_LEADS", "LEAD_GENERATION", "OUTCOME_SALES", "CONVERSIONS"]);

/**
 * Stropy z marketingového plánu — koľko sa dá za klienta zaplatiť a byť na nule.
 *
 * Nie sú to odhady: vychádzajú z marginálnej marže. U Terezkiných klientov je
 * 850 Kč z hodiny náklad firmy, u Jerryho je to jeho vlastná výplata — preto
 * je ten rozdiel taký veľký.
 */
export const STROP_KLIENT = { terezka: 2200, mix: 5700, jerry: 10000 };

export function verdikt(cenaZaKlienta: number | null): { text: string; tón: "dobrá" | "zlá" | "neutrálna" } {
  if (cenaZaKlienta == null) return { text: "zatiaľ sa nedá povedať", tón: "neutrálna" };
  if (cenaZaKlienta <= STROP_KLIENT.terezka) return { text: "vyplatí sa aj u Terezky", tón: "dobrá" };
  if (cenaZaKlienta <= STROP_KLIENT.mix) return { text: "vyplatí sa pri bežnom mixe", tón: "neutrálna" };
  if (cenaZaKlienta <= STROP_KLIENT.jerry) return { text: "vyplatí sa len u Jerryho", tón: "neutrálna" };
  return { text: "nad stropom — nezaplatí sa", tón: "zlá" };
}
