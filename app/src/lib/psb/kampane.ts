/**
 * Kampane z Mety — čítanie riadkov, ktoré prišli po mesiacoch.
 *
 * Meta vracia jeden riadok na kampaň A MESIAC (`time_increment=monthly`).
 * Rozhoduje sa ale o kampani ako celku — „vypnúť, nechať, priplatiť" nie je
 * otázka na máj. Preto sa mesiace sčítajú, kým sa to ukáže na obrazovke.
 *
 * Sčítanie nechávam tu a nie v komponente preto, že práve pri ňom sa dá tíško
 * pomýliť: kampaň bežiaca cez tri mesiace vyzerá ako tri kampane a priemerná
 * cena za dopyt potom vyjde trojnásobne lepšie, než je.
 */

export type Kampan = {
  id: string;
  mesiac: string;
  nazov: string;
  ciel: string;
  spend: number;
  impressions: number;
  clicks: number;
  vysledky: number;
};

export type ZlucenaKampan = Kampan & { mesiacov: number; od: string; do: string };

/**
 * Ciele tak, ako ich Meta pomenúva, aj s tým, čo znamenajú pre Jerryho.
 *
 * `dopyt: false` neznamená zlú kampaň — znamená kampaň, ktorá o dopyt nikdy
 * nepožiadala. To rozlíšenie je celý dôvod, prečo je cieľ v tabuľke prvý:
 * bez neho vyzerá nula dopytov ako zlyhanie kreatívy, hoci je to splnené
 * zadanie.
 */
export const CIELE: Record<string, { label: string; dopyt: boolean; co: string }> = {
  OUTCOME_LEADS: { label: "Dopyt", dopyt: true, co: "Meta hľadala ľudí, čo nechajú kontakt." },
  LEAD_GENERATION: { label: "Dopyt", dopyt: true, co: "Meta hľadala ľudí, čo nechajú kontakt." },
  OUTCOME_SALES: { label: "Predaj", dopyt: true, co: "Meta hľadala ľudí, čo nakúpia." },
  CONVERSIONS: { label: "Konverzie", dopyt: true, co: "Meta hľadala ľudí, čo spravia akciu na webe." },
  LINK_CLICKS: { label: "Prekliky", dopyt: false, co: "Meta hľadala ľudí, čo kliknú — nie takých, čo napíšu." },
  OUTCOME_TRAFFIC: { label: "Návštevnosť", dopyt: false, co: "Meta hľadala ľudí, čo kliknú — nie takých, čo napíšu." },
  OUTCOME_ENGAGEMENT: { label: "Interakcie", dopyt: false, co: "Meta hľadala lajky, uloženia a komentáre." },
  POST_ENGAGEMENT: { label: "Interakcie", dopyt: false, co: "Meta hľadala lajky, uloženia a komentáre." },
  OUTCOME_AWARENESS: { label: "Dosah", dopyt: false, co: "Meta hľadala čo najviac očí za čo najmenej peňazí." },
  VIDEO_VIEWS: { label: "Prehratia", dopyt: false, co: "Meta hľadala ľudí, čo si pustia video." },
};

export const ciel = (k: string) => CIELE[k] || { label: k || "—", dopyt: false, co: "" };

/** Mesačné riadky → jeden riadok na kampaň, zoradené podľa výdavku. */
export function zlucKampane(riadky: Kampan[]): ZlucenaKampan[] {
  const m = new Map<string, ZlucenaKampan>();
  for (const k of riadky) {
    const e = m.get(k.id);
    if (!e) {
      m.set(k.id, { ...k, mesiacov: 1, od: k.mesiac, do: k.mesiac });
      continue;
    }
    e.spend += k.spend;
    e.impressions += k.impressions;
    e.clicks += k.clicks;
    e.vysledky += k.vysledky;
    e.mesiacov++;
    if (k.mesiac < e.od) e.od = k.mesiac;
    // Meno aj cieľ sa berú z najnovšieho mesiaca: kampaň sa dá premenovať
    // a starý názov by v tabuľke prežil navždy.
    if (k.mesiac > e.do) {
      e.do = k.mesiac;
      e.nazov = k.nazov;
      e.ciel = k.ciel;
    }
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend);
}

export type SuhrnKampani = {
  spend: number;
  dopyty: number;
  kliky: number;
  videnia: number;
  /** Koľko z výdavku išlo do kampaní, ktoré o dopyt vôbec požiadali. */
  naDopyt: number;
  /** Podiel toho výdavku v percentách. Nula, keď sa neminulo nič. */
  podielNaDopyt: number;
  /** `null`, keď neprišiel ani jeden dopyt — delenie nulou nie je nekonečno. */
  cena: number | null;
};

export function suhrnKampani(k: ZlucenaKampan[]): SuhrnKampani {
  const s = k.reduce(
    (a, x) => ({
      spend: a.spend + x.spend,
      dopyty: a.dopyty + x.vysledky,
      kliky: a.kliky + x.clicks,
      videnia: a.videnia + x.impressions,
      naDopyt: a.naDopyt + (ciel(x.ciel).dopyt ? x.spend : 0),
    }),
    { spend: 0, dopyty: 0, kliky: 0, videnia: 0, naDopyt: 0 },
  );
  return {
    ...s,
    podielNaDopyt: s.spend > 0 ? (s.naDopyt / s.spend) * 100 : 0,
    cena: s.dopyty > 0 ? s.spend / s.dopyty : null,
  };
}
