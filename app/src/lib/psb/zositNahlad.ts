import { odhadniKategoriu } from "./fio";
import { CENA_LOPTICKY, PRIJEM_PRODUKT } from "./kategoriePrijmov";

/**
 * NÁHĽAD ZOŠITA PROTI TOMU, ČO UŽ V KOKPITE JE (Jerry, 8. 10. 2026:
 * „povedalo mi, že aj dáta z minulých mesiacov jún, júl, august sú
 * nezaradené — prečo?").
 *
 * Strana zošita nesie aj staré riadky. Jún až august boli zapísané už
 * v auguste a zaradené, ale náhľad dával každému riadku prázdnu kategóriu,
 * takže vyzerali ako nová robota. Horšie: kľúč hotovosti je
 * `dátum|suma|popis` a rukopis sa pri druhom prepise prečíta inak
 * („Terka" / „Terezka") — zápis by ich vložil DRUHÝKRÁT.
 *
 * Preto: riadok, ktorý v databáze už stojí (ten istý deň a suma, a keď
 * nie deň, tak suma ±3 dni s rovnakým prvým slovom popisu), sa označí
 * `uzMame` a ukáže sa jeho kategória z Kokpitu. Párovanie je po kusoch —
 * dve výplaty po 1 500 v jeden deň sú dve. Novým výdavkom sa navrhne
 * kategória z naučených pravidiel; príjem kategóriu nepotrebuje.
 */
export type RiadokZositu = { datum: string; popis: string; suma: number; poznamka?: string; isty?: boolean };
export type HotovostVDb = { date: string; amount_czk: number; counterparty: string; category: string | null };
export type OznacenyRiadok = RiadokZositu & { uzMame: boolean; kategoriaVDb: string; kategoria: string; zBanky?: boolean };

/**
 * PRESUN NA ÚČET MÁ BANKA — v zošite sa nezapisuje (Jerry, 8. 10. 2026:
 * „bol tam presun na účet 23 000, dal som ho neoznačiť… prečo sa zapísal?").
 *
 * Nezapísal sa; appka ho ale ani nespoznala, takže ho musel odškrtnúť sám
 * a potom nemal ako vedieť, že tých 23 000, čo vidí medzi pohybmi, je riadok
 * od BANKY („Vklad do bankomatu", 18. 9.) — tá istá hotovosť z druhej strany.
 * Zapísať aj riadok zo zošita by tie peniaze započítalo dvakrát.
 *
 * Párovanie je zámerne na SUMU a DEŇ (±3), nie na text: zošit hovorí „presun
 * na účet", banka „Vklad do bankomatu: FIO BANKA, JOŠTOVA 4" a nijaké
 * spoločné slovo tam nie je.
 */
export type VkladVBanke = { date: string; amount_czk: number; counterparty: string };

const prveSlovo = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().split(/[\s,.(]+/)[0] || "";
const den = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

export function oznacZosit(
  riadky: RiadokZositu[],
  vDb: HotovostVDb[],
  pravidla: { vzor: string; kategoria: string }[] = [],
  /** Vklady hotovosti, ktoré už má banka — presun na účet sa nezapisuje. */
  vklady: VkladVBanke[] = [],
): OznacenyRiadok[] {
  const volne = vDb.map((x) => ({ ...x, pouzite: false }));
  const volneVklady = vklady.map((x) => ({ ...x, pouzite: false }));
  const vklad = (r: RiadokZositu) => volneVklady.find((x) => !x.pouzite
    && Math.round(Math.abs(x.amount_czk)) === Math.round(Math.abs(r.suma))
    && Math.abs(den(x.date) - den(r.datum)) <= 3 * 86400000);
  const najdi = (r: RiadokZositu) => {
    const presne = volne.find((x) => !x.pouzite && x.date.slice(0, 10) === r.datum && Math.round(x.amount_czk) === Math.round(r.suma));
    if (presne) return presne;
    const slovo = prveSlovo(r.popis);
    return volne.find((x) => !x.pouzite && Math.round(x.amount_czk) === Math.round(r.suma)
      && Math.abs(den(x.date) - den(r.datum)) <= 3 * 86400000
      && slovo.length >= 3 && prveSlovo(x.counterparty) === slovo);
  };
  return riadky.map((r) => {
    const z = najdi(r);
    if (z) {
      z.pouzite = true;
      return { ...r, uzMame: true, kategoriaVDb: z.category || "", kategoria: z.category || "" };
    }
    const v = vklad(r);
    if (v) {
      v.pouzite = true;
      return { ...r, uzMame: true, zBanky: true, kategoriaVDb: "", kategoria: "" };
    }
    // Príjem presne za cenu loptičky sa navrhne ako predaj produktu — len
    // návrh v rolete, človek ho vidí a prepne.
    const navrh = r.suma < 0 ? odhadniKategoriu(`${r.popis} ${r.poznamka || ""}`, pravidla)
      : Math.round(r.suma) === CENA_LOPTICKY ? PRIJEM_PRODUKT : "";
    return { ...r, uzMame: false, kategoriaVDb: "", kategoria: navrh };
  });
}
