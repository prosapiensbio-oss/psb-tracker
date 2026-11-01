import { najdiKlientaVTexte, sposobZRiadku } from "./platbyEvidencia";
import { prveSlovo } from "./zositNahlad";

/**
 * MOŽNÉ ZDVOJENIA PO ZÁPISE ZOŠITA (Jerry, 1. 11. 2026: „keď vznikne podozrenie
 * na zdvojenie, tak po zápise zošita vyskočia otázky: toto sú zdvojené platby").
 *
 * Dávka z 1. 11. priniesla tri rôzne prípady a žiadny neodhalila kontrola
 * v náhľade — tá porovnáva zošit len s hotovosťou zo zošita:
 *
 *   • prijem — Terezka zapísala platbu ručne (Naďa 9 400) a neskôr prišiel ten
 *     istý príjem zo zošita. Riadok čakal medzi nepriradenými s hotovým návrhom
 *     klienta; jeden klik a tržba je dvakrát.
 *   • vratenie — Radek Baláž: vrátenie −15 275 je záporná platba, teda znižuje
 *     tržby, a zo zošita prišlo −15 500 ako náklad. Odčítané dvakrát.
 *   • dvaRiadky — Oběd −450 z 9. 10. a Obed −490 z 1. 11.: ten istý riadok
 *     prečítaný inak. Náhľad páruje na presnú sumu, tak ho pustil.
 *   • banka — rovnaká suma a kategória v banke do 3 dní. Terkine dve výplaty
 *     po 500 Kč tak naozaj vyzerajú, a sú dve: preto je to otázka.
 *
 * Appka sa PÝTA, nerozhoduje. Odpoveď „sú to dve"
 * sa pamätá podľa dvojice riadkov, aby sa nepýtala znova.
 *
 * Staršie mesiace sa nekontrolujú: príjmy pred 10/2026 idú z PTmindera a ručné
 * platby tam nič nezdvojujú.
 */
export const ZDVOJENIA_OD = "2026-10-01";
export const ZDVOJENIA_KLUC = "zosit_zdvojenia_vybavene";

export type PohybZdvojenia = {
  id: string; date: string; amount_czk: number; counterparty: string | null;
  note?: string | null; typ: string | null; category: string | null; created_at: string | null;
};
export type PlatbaZdvojenia = {
  id: string; klient: string; datum: string; suma_czk: number; sposob: string;
  fio_id: string | null; zrusene_at: string | null;
};
export type DruhZdvojenia = "prijem" | "vratenie" | "dvaRiadky" | "banka";
export type StranaZdvojenia = { id: string; datum: string; suma: number; popis: string };
export type Podozrenie = {
  kluc: string;
  druh: DruhZdvojenia;
  /** Riadok zo zošita — ten sa pri odpovedi „tá istá" mení. */
  riadok: StranaZdvojenia;
  /** S čím sa zhoduje: ručná platba, riadok z banky alebo starší riadok zošita. */
  druhy: StranaZdvojenia;
};

const dni = (a: string, b: string) =>
  Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86400000;
const blizko = (a: number, b: number, kc: number, podiel: number) =>
  Math.abs(a - b) <= Math.max(kc, Math.abs(b) * podiel);
const mimoPnl = (k: string | null) => k === "mimo" || k === "presun";

export function najdiZdvojenia(vstup: {
  pohyby: PohybZdvojenia[];
  platby: PlatbaZdvojenia[];
  /** Pohyby označené „toto nie je platba klienta". */
  nieKlient?: Set<string>;
  /** Dvojice, na ktoré už človek odpovedal. */
  vybavene?: Set<string>;
  /** Uzavreté mesiace `RRRR-MM` — tam sa už nič meniť nedá, tak sa nepýta. */
  zamky?: Set<string>;
}): Podozrenie[] {
  const { pohyby, platby, nieKlient = new Set<string>(), vybavene = new Set<string>(), zamky = new Set<string>() } = vstup;
  const out: Podozrenie[] = [];
  const zive = pohyby.filter((p) => p.date.slice(0, 10) >= ZDVOJENIA_OD && !zamky.has(p.date.slice(0, 7)));
  const hotovost = zive.filter((p) => sposobZRiadku(p) === "hotovost");
  const banka = zive.filter((p) => sposobZRiadku(p) !== "hotovost");
  const priradene = new Set(platby.filter((p) => !p.zrusene_at && p.fio_id).map((p) => p.fio_id as string));
  const rucne = platby.filter((p) => !p.zrusene_at && !p.fio_id && p.sposob === "hotovost" && p.datum.slice(0, 10) >= ZDVOJENIA_OD);

  const strana = (p: PohybZdvojenia): StranaZdvojenia =>
    ({ id: p.id, datum: p.date.slice(0, 10), suma: p.amount_czk, popis: p.counterparty || "" });
  const stranaPlatby = (p: PlatbaZdvojenia): StranaZdvojenia =>
    ({ id: p.id, datum: p.datum.slice(0, 10), suma: p.suma_czk, popis: p.klient });
  const uzVybavene = (druh: DruhZdvojenia, a: string, b: string) => vybavene.has(`${druh}|${a}|${b}`);
  const pridaj = (druh: DruhZdvojenia, riadok: StranaZdvojenia, druhy: StranaZdvojenia) =>
    out.push({ kluc: `${druh}|${riadok.id}|${druhy.id}`, druh, riadok, druhy });

  // PRÍJEM ↔ RUČNÁ PLATBA. Najprv podľa mena, až potom holá suma: dve platby
  // po 9 400 Kč do troch dní (Patrik, Markéta) sa nesmú prekrížiť.
  const prijmy = hotovost.filter((p) => p.amount_czk > 0 && !p.category && !priradene.has(p.id) && !nieKlient.has(p.id));
  const obsadene = new Set<string>();
  const volnePrijmy = rucne.filter((p) => p.suma_czk > 0);
  const zvysne: PohybZdvojenia[] = [];
  for (const r of prijmy) {
    const z = volnePrijmy.find((p) => !obsadene.has(p.id) && !uzVybavene("prijem", r.id, p.id)
      && dni(p.datum, r.date) <= 7 && blizko(r.amount_czk, p.suma_czk, 50, 0.02)
      && najdiKlientaVTexte(r.counterparty || "", [p.klient]).length > 0);
    if (z) { obsadene.add(z.id); pridaj("prijem", strana(r), stranaPlatby(z)); }
    else zvysne.push(r);
  }
  for (const r of zvysne) {
    const z = volnePrijmy.find((p) => !obsadene.has(p.id) && !uzVybavene("prijem", r.id, p.id)
      && dni(p.datum, r.date) <= 3 && Math.round(p.suma_czk) === Math.round(r.amount_czk));
    if (z) { obsadene.add(z.id); pridaj("prijem", strana(r), stranaPlatby(z)); }
  }

  // VÝDAVOK ↔ VRÁTENIE KLIENTOVI (záporná ručná platba).
  const vydavky = hotovost.filter((p) => p.amount_czk < 0 && !mimoPnl(p.category));
  for (const r of vydavky) {
    const z = rucne.find((p) => p.suma_czk < 0 && !obsadene.has(p.id) && !uzVybavene("vratenie", r.id, p.id)
      && dni(p.datum, r.date) <= 3 && blizko(r.amount_czk, p.suma_czk, 500, 0.05));
    if (z) { obsadene.add(z.id); pridaj("vratenie", strana(r), stranaPlatby(z)); }
  }

  // HOTOVOSŤ ↔ BANKA: rovnaká kategória a suma do troch dní.
  const pouzitaBanka = new Set<string>();
  for (const r of vydavky) {
    if (!r.category) continue;
    const z = banka.find((b) => !pouzitaBanka.has(b.id) && !uzVybavene("banka", r.id, b.id)
      && b.category === r.category && Math.round(b.amount_czk) === Math.round(r.amount_czk) && dni(b.date, r.date) <= 3);
    if (z) { pouzitaBanka.add(z.id); pridaj("banka", strana(r), strana(z)); }
  }

  // DVA RIADKY ZOŠITA Z RÔZNYCH DÁVOK. V jednej dávke sú dva podobné riadky
  // naozaj dva (Terka −1 200 a −2 000 v jeden deň); prepis tej istej strany
  // prichádza vždy v inej dávke.
  const noveNajprv = [...hotovost].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const pouzite = new Set<string>();
  for (const r of noveNajprv) {
    if (pouzite.has(r.id) || mimoPnl(r.category)) continue;
    const slovo = prveSlovo(r.counterparty || "");
    if (slovo.length < 3) continue;
    const z = noveNajprv.find((s) => s.id !== r.id && !pouzite.has(s.id) && !mimoPnl(s.category)
      && !uzVybavene("dvaRiadky", r.id, s.id)
      && String(s.created_at).slice(0, 10) < String(r.created_at).slice(0, 10)
      && Math.sign(s.amount_czk) === Math.sign(r.amount_czk)
      && dni(s.date, r.date) <= 1 && blizko(r.amount_czk, s.amount_czk, 100, 0.15)
      && prveSlovo(s.counterparty || "") === slovo);
    if (z) { pouzite.add(r.id); pouzite.add(z.id); pridaj("dvaRiadky", strana(r), strana(z)); }
  }
  return out;
}

/** Príjmy čakajúce na otázku — do nepriradených nepatria, kým sa človek nevyjadrí. */
export const prijmyNaOtazku = (p: Podozrenie[]) => new Set(p.filter((x) => x.druh === "prijem").map((x) => x.riadok.id));
