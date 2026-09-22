/**
 * Vlastná evidencia platieb — posledná tretina odchodu od PTmindera.
 *
 * Jerry, 22. 9. 2026: „platby by ťahal z výpisu banky a hotovosť stále zo
 * zošita, tam sa nič nemení."
 *
 * KOMU PLATBA PATRÍ SA NEDÁ ČÍTAŤ Z JEDNÉHO POĽA
 *
 * Fio dáva v `counterparty` zlepenec „správa · odosielateľ" a klient môže byť
 * v ktorejkoľvek polovici — alebo v oboch, alebo v žiadnej:
 *
 *   „Prosapiens 18h · Natália Pecková"          klient je odosielateľ
 *   „Josef snyrich · Filip Stráňavský"          klient je v SPRÁVE, platí kto iný
 *   „Krivdova - 6 hodín · Tomáš Krivda"         klientka je v správe, platí manžel
 *   „20260035 MGR. FILIP STRANAVSKY · Ing. BARBORA VANKOVÁ"   naša faktúra + klientka
 *   „Vklad do bankomatu: FIO BANKA…"            nie je to platba klienta vôbec
 *
 * Preto sa hľadá PRIEZVISKO kdekoľvek v celom texte. Je to jediná časť mena,
 * ktorá v bankovom zápise prežije skratky, veľké písmená aj poradie.
 *
 * A PRETO SA NEHÁDA
 *
 * Keď priezvisko sedí na dvoch klientov (Richard Matl a Katerina Matlová),
 * vrátia sa obaja a nevyberie sa ani jeden. Zle priradená platba je horšia
 * než nepriradená: pokazí tržbu klienta aj jeho históriu, a nikto to
 * nezbadá, lebo súčet v banke sedí.
 */

import { normName } from "./format";

/** Y a I sú v českých priezviskách to isté písmeno („snyrich"/„šnirych"). */
const bezY = (s: string) => s.replace(/y/g, "i");

const tokeny = (s: string) =>
  bezY(normName(s)).split(/[^\p{L}\d]+/u).filter(Boolean);

/**
 * Klienti, ktorých priezvisko v texte platby stojí.
 *
 * Token sedí, keď je priezviskom presne — alebo keď ním ZAČÍNA a je najviac
 * o tri písmená dlhší. To pokrýva skloňovanie a prechyľovanie („Dvořák" →
 * „Dvořákové"). Zároveň to vyrába aj kolízie („Matl" verzus „Matlová"), a to
 * je zámer: pri kolízii sa nevyberie nikto.
 *
 * Priezviská kratšie než štyri písmená sa nehľadajú — „Kral" by sedel na pol
 * výpisu.
 */
export function najdiKlientaVTexte(text: string, menaKlientov: string[]): string[] {
  const t = tokeny(text);
  if (!t.length) return [];
  const sedi = (priezvisko: string) =>
    t.some((x) => x === priezvisko || (x.startsWith(priezvisko) && x.length - priezvisko.length <= 3));
  return menaKlientov.filter((m) => {
    const casti = bezY(normName(m)).split(/\s+/).filter(Boolean);
    const priezvisko = casti[casti.length - 1] || "";
    return priezvisko.length >= 4 && sedi(priezvisko);
  });
}

export type FioRiadok = { id: string; date: string; amount_czk: number; counterparty: string | null; note: string | null; typ: string | null };
export type Platba = { id: string; klient: string; datum: string; sumaCzk: number; sposob: string; fioId: string | null; zruseneAt: string | null };
export type PtPlatba = { klient: string; datum: string; suma: number; metoda: string };

/** Text, podľa ktorého sa platba páruje: správa aj odosielateľ naraz. */
export const textPlatby = (r: FioRiadok): string => `${r.counterparty || ""} ${r.note || ""}`.trim();

/**
 * Vzor pre naučené priradenie: LEN odosielateľ (za „·"), bez správy.
 *
 * Správa nesie číslo faktúry a mesiac („ProSapiens 6hodin vazanost
 * 09/2026/2") a menila by sa pri každej platbe — naučené pravidlo by sa
 * nikdy nechytilo druhý raz. Odosielateľ je to, čo zostáva rovnaké.
 */
export function vzorPlatby(r: FioRiadok): string {
  const cely = r.counterparty || r.note || "";
  const kusy = cely.split("·");
  return normName(kusy.length > 1 ? kusy[kusy.length - 1] : cely).slice(0, 80);
}

/**
 * Smie sa odosielateľ zapamätať ako pravidlo pre tohto klienta?
 *
 * Len vtedy, keď v ňom STOJÍ priezvisko klienta. Bez toho by sa pravidlo
 * naučilo z prevodov, ktoré Jerry posiela sám za niekoho iného
 * („Josef snyrich · Filip Stráňavský"): odosielateľ je Filip Stráňavský
 * a appka by odvtedy každý jeho prevod ponúkala ako platbu Josefa Šnirycha.
 * Sprostredkovateľ nie je platiteľ.
 */
export function smieSaZapamatat(vzor: string, klient: string): boolean {
  return najdiKlientaVTexte(vzor, [klient]).length === 1;
}

export type NepriradenaPlatba = {
  fioId: string;
  datum: string;
  suma: number;
  text: string;
  kandidati: string[];
};

/**
 * Príjmy z výpisu, ktoré ešte nemajú klienta — a návrh, komu patria.
 *
 * Vynecháva sa to, čo už priradené je, čo je označené ako „nie je to platba
 * klienta", a vlastné vklady hotovosti (tie do banky prichádzajú zo zošita
 * a započítať ich druhýkrát by zdvojilo tržbu).
 */
export function nepriradene(
  fio: FioRiadok[],
  platby: Platba[],
  mapovanie: Record<string, string>,
  nieKlient: Set<string>,
  menaKlientov: string[],
): NepriradenaPlatba[] {
  const uz = new Set(platby.filter((p) => !p.zruseneAt && p.fioId).map((p) => p.fioId as string));
  const out: NepriradenaPlatba[] = [];
  for (const r of fio) {
    if (r.amount_czk <= 0) continue;
    if (uz.has(r.id) || nieKlient.has(r.id)) continue;
    const text = textPlatby(r);
    // Vlastný vklad hotovosti nie je príjem od klienta — tie isté peniaze
    // sú už v zošite a v banke by sa započítali druhýkrát.
    if (/vklad do bankomatu|vklad hotovosti/i.test(text)) continue;
    const naucene = mapovanie[vzorPlatby(r)];
    out.push({
      fioId: r.id,
      datum: r.date.slice(0, 10),
      suma: r.amount_czk,
      text,
      kandidati: naucene ? [naucene] : najdiKlientaVTexte(text, menaKlientov),
    });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}

export type RiadokPlatieb = {
  mesiac: string;
  kokpit: number;
  ptminder: number;
  rozdiel: number;
  kokpitHotovost: number;
  kokpitBanka: number;
};

/**
 * Porovnanie po MESIACOCH, nie po platbách.
 *
 * Jedna platba v banke môže v PTminderi stáť ako dve (klient poslal balíček
 * aj doplatok jedným prevodom) a naopak. Párovať kus na kus by vyrábalo
 * rozdiely, ktoré nikto neopraví; mesačný súčet je to, čo musí sedieť, a je
 * to aj to, z čoho appka počíta tržby.
 *
 * Porovnáva sa LEN po posledný deň exportu — za ním PTminder nemá nič a
 * každá platba by vyzerala ako prebytok. To isté pravidlo ako pri balíčkoch.
 */
export function porovnajPlatby(
  platby: Platba[],
  ptminder: PtPlatba[],
  poExport: string,
  odMesiaca = "",
): { mesiace: RiadokPlatieb[]; kokpit: number; ptminder: number; rozdiel: number; sediacich: number } {
  const m = new Map<string, RiadokPlatieb>();
  const riadok = (mesiac: string) => {
    let r = m.get(mesiac);
    if (!r) { r = { mesiac, kokpit: 0, ptminder: 0, rozdiel: 0, kokpitHotovost: 0, kokpitBanka: 0 }; m.set(mesiac, r); }
    return r;
  };
  for (const p of platby) {
    if (p.zruseneAt) continue;
    const den = p.datum.slice(0, 10);
    if (den > poExport) continue;
    const mes = den.slice(0, 7);
    if (odMesiaca && mes < odMesiaca) continue;
    const r = riadok(mes);
    r.kokpit += p.sumaCzk;
    if (p.sposob === "hotovost") r.kokpitHotovost += p.sumaCzk;
    else if (p.sposob === "banka") r.kokpitBanka += p.sumaCzk;
  }
  for (const p of ptminder) {
    const den = p.datum.slice(0, 10);
    if (den > poExport) continue;
    const mes = den.slice(0, 7);
    if (odMesiaca && mes < odMesiaca) continue;
    riadok(mes).ptminder += p.suma;
  }
  const mesiace = [...m.values()].map((r) => ({ ...r, rozdiel: Math.round(r.kokpit - r.ptminder) })).sort((a, b) => b.mesiac.localeCompare(a.mesiac));
  return {
    mesiace,
    kokpit: Math.round(mesiace.reduce((a, r) => a + r.kokpit, 0)),
    ptminder: Math.round(mesiace.reduce((a, r) => a + r.ptminder, 0)),
    rozdiel: Math.round(mesiace.reduce((a, r) => a + r.kokpit - r.ptminder, 0)),
    sediacich: mesiace.filter((r) => r.rozdiel === 0).length,
  };
}
