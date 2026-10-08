import { odhadniKategoriu } from "./fio";

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
export type OznacenyRiadok = RiadokZositu & { uzMame: boolean; kategoriaVDb: string; kategoria: string };

const prveSlovo = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().split(/[\s,.(]+/)[0] || "";
const den = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

export function oznacZosit(
  riadky: RiadokZositu[],
  vDb: HotovostVDb[],
  pravidla: { vzor: string; kategoria: string }[] = [],
): OznacenyRiadok[] {
  const volne = vDb.map((x) => ({ ...x, pouzite: false }));
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
    const navrh = r.suma < 0 ? odhadniKategoriu(`${r.popis} ${r.poznamka || ""}`, pravidla) : "";
    return { ...r, uzMame: false, kategoriaVDb: "", kategoria: navrh };
  });
}
