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
  const sedi = (cast: string) =>
    t.some((x) => x === cast || (x.startsWith(cast) && x.length - cast.length <= 3));
  const podlaPriezviska = menaKlientov.filter((m) => {
    const casti = bezY(normName(m)).split(/\s+/).filter(Boolean);
    const priezvisko = casti[casti.length - 1] || "";
    return priezvisko.length >= 4 && sedi(priezvisko);
  });
  if (podlaPriezviska.length) return podlaPriezviska;

  /**
   * Až keď priezvisko nesedí na nikoho, skúsi sa KRSTNÉ.
   *
   * „ProSapiens Balíček 6h Richard" alebo „Roman · …" priezvisko nemá, ale
   * krstné meno tam je a človek z neho vie. Appka z neho vedieť nemá — osem
   * krstných mien má v PSB viac než jedného klienta — preto je to až druhý
   * pokus a výsledok je NÁVRH na potvrdenie, nie priradenie. Keď sedí
   * viac ľudí, ukážu sa všetci; vybrať musí človek.
   *
   * Prečo vôbec: bez tohto zostalo 75 zo 108 príjmov úplne bez návrhu
   * a Jerry k nim meno písal rukou (23. 9. 2026).
   */
  return menaKlientov.filter((m) => {
    const krstne = bezY(normName(m)).split(/\s+/).filter(Boolean)[0] || "";
    return krstne.length >= 4 && sedi(krstne);
  });
}

/**
 * KTO ZAPLATIL, KEĎ V TEXTE MENO NIE JE.
 *
 * Jerry, 23. 9. 2026: „v poznámkach je vo väčšine prípadov meno alebo aspoň
 * niečo, podľa čoho by sa dalo usúdiť, komu to patrí — skús tam vytvoriť
 * párovací systém."
 *
 * Časť príjmov meno naozaj nenesie: „20260037 MGR. FILIP STRANAVSKY" je číslo
 * faktúry a meno PRÍJEMCU, nie odosielateľa. Zato PTminder o tej istej platbe
 * vie všetko — kto, koľko a kedy. Bankový prevod chodí na korunu presne, takže
 * dvojica (suma, deň) je silný kľúč: 6 990 Kč zo 16. 9. sa v PTminderi viaže
 * na Jana Krála a na nikoho iného.
 *
 * Preto sa páruje LEN na `bank` platby: hotovosť z PTmindera cez účet neprešla
 * a zhoda s ňou by bola náhoda. A preto sa vracia ZOZNAM — keď v okne sedí
 * viac ľudí s rovnakou sumou, nevyberie sa nikto a rozhodne človek. To je tá
 * istá poistka ako pri menách: falošná zhoda je horšia než diera, lebo podľa
 * nej sa ZAPISUJE.
 */
export function parujPodlaSumy(
  r: Pick<FioRiadok, "date" | "amount_czk">,
  ptPlatby: PtPlatba[],
  /** Koľko dní môže byť medzi bankou a zápisom v PTminderi. */
  oknoDni = 3,
): string[] {
  const den = r.date.slice(0, 10);
  const cas = Date.parse(`${den}T00:00:00Z`);
  if (!Number.isFinite(cas) || !r.amount_czk) return [];
  const najdene = new Set<string>();
  for (const p of ptPlatby) {
    if (p.metoda !== "bank") continue;
    if (Math.round(p.suma) !== Math.round(r.amount_czk)) continue;
    const c = Date.parse(`${p.datum.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(c) || Math.abs(c - cas) > oknoDni * 86400000) continue;
    najdene.add(p.klient);
  }
  return [...najdene];
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
  /** Vyzerá to na platbu klienta? `false` = vrátka z obchodu, vklad, kaucia. */
  klientsky: boolean;
  /** Odkiaľ je návrh: aby človek vedel, čomu verí. */
  zdrojNavrhu: "naucene" | "faktura" | "firma" | "meno" | "suma" | "";
};

/** Vystavená faktúra — na párovanie podľa variabilného symbolu. */
export type FakturaVzor = { cislo: string; klient: string };

/**
 * Firma, na ktorú sa klientovi fakturuje.
 *
 * Jerry, 26. 9. 2026: „vnímaj to skôr tak, že k menu sa priraďuje IČO, a nie
 * názov." Klient je človek; firma a IČO sú jeho fakturačný údaj. Platba
 * z firmy teda patrí tomu človeku — nie je to cudzia platba.
 */
export type FirmaKlienta = { klient: string; firma: string; ico: string };

/**
 * JE TO PRÍJEM OD KLIENTA, ALEBO NIEČO INÉ?
 *
 * Jerry, 23. 9. 2026: „vo workspace budeme evidovať iba platby klientov;
 * Alzu vyriešime pri nahrávaní výpisu, tam sa to robí dopodrobna."
 *
 * Na účet chodia aj príjmy, ktoré s klientmi nemajú nič spoločné — vrátené
 * peniaze z e-shopu, dobropis z kaviarne, vlastný vklad do bankomatu, vratka
 * kaucie od prenajímateľa. V kope na dennú prácu sú to votrelci: človek nad
 * nimi zastane, zistí, že to nie je klient, a klikne „nie je klient". Každý
 * deň znova, kým ich niekto neodklikne.
 *
 * Dva znaky, obidva z výpisu, nie z hádania:
 *
 *   • KARETNÍ TRANSAKCE — peniaze, ktoré prišli späť na kartu (vrátený tovar,
 *     dobropis) alebo vklad v bankomate. Klient cez kartu neplatí, platí
 *     prevodom. Tento typ teda nikdy nie je príjem od klienta.
 *   • PROTISTRANA JE FIRMA — „a.s.", „s.r.o.", „spol. s r.o.", „z.ú." alebo
 *     slovo „eshop"/„kredit". Klienti sú ľudia.
 *
 * NIČ SA NESTRÁCA. Riadok sa len označí; obrazovka „Platby z banky" ho
 * ukazuje ďalej, lebo tam sa rieši celý výpis. Skryje ho iba kopa vo
 * Workspace, kde ide o dennú prácu s klientmi.
 *
 * Kde to môže zlyhať: klient, ktorému platí zamestnávateľ zo s.r.o. Stalo sa
 * to hneď pri prvej skúške — „HBH PROJEKT SPOL. S · 20260016" je faktúra PSB
 * zaplatená z firemného účtu. Preto má ČÍSLO FAKTÚRY prednosť pred všetkým
 * ostatným: kto platí našu faktúru, je náš klient, nech posiela odkiaľkoľvek.
 * A riadok sa aj tak NEZAHADZUJE — v úplnom zozname zostane a dá sa priradiť.
 */
/** Číslo faktúry PSB: rok a štyri číslice, napr. 20260037. */
const FAKTURA = /\b20\d{6}\b/;
const FIRMA = /\b(a\.\s?s\.|s\.\s?r\.\s?o\.|spol\.|z\.\s?ú\.|eshop|kredit:)/i;

/**
 * „Vrátenie", „vratka", „vraciam" — peniaze idúce SPÄŤ, nie platba za tréning.
 *
 * V PSB je to bežné: Jerry a Terézia si posielajú späť za nákupy („Vraciam za
 * potraviny", „Vratenie za zmrzku"), a prenajímateľ vracia kauciu. Klient
 * takú správu k platbe nenapíše — platí za balíček, nie vracia.
 */
const VRATKA = /\b(vr[aá]t|vraci)/i;

export function vyzeraNaKlienta(r: Pick<FioRiadok, "counterparty" | "note" | "typ">): boolean {
  const text = `${r.counterparty || ""} ${r.note || ""}`;
  if (FAKTURA.test(text)) return true;
  const typ = (r.typ || "").toLowerCase();
  if (typ.includes("karetní") || typ.includes("karetni")) return false;
  if (FIRMA.test(text)) return false;
  if (VRATKA.test(text)) return false;
  return true;
}

/**
 * Príjmy z výpisu, ktoré ešte nemajú klienta — a návrh, komu patria.
 *
 * Vynecháva sa to, čo už priradené je, čo je označené ako „nie je to platba
 * klienta", a vlastné vklady hotovosti (tie do banky prichádzajú zo zošita
 * a započítať ich druhýkrát by zdvojilo tržbu).
 */
/**
 * Klient podľa variabilného symbolu v texte platby.
 *
 * Číslo faktúry je v príkaze ako VS a banka ho dá do správy — je to najtvrdší
 * dôkaz, aký v platbe je. Silnejší než meno: firma zaplatí za zamestnanca
 * a v texte je meno firmy, nie klienta.
 */
export function klientPodlaFaktury(text: string, faktury: FakturaVzor[]): string[] {
  if (!faktury.length) return [];
  const cisla = new Set(text.match(/\d{6,10}/g) || []);
  if (!cisla.size) return [];
  const najdene = faktury.filter((f) => cisla.has(f.cislo)).map((f) => f.klient);
  return [...new Set(najdene)];
}

/**
 * Klient podľa firmy alebo IČO v texte platby.
 *
 * „FSH Devices s.r.o." nie je cudzia platba — je to klient, ktorý si nechal
 * faktúru vystaviť na svoju firmu. Appka to vie z jeho fakturačných údajov.
 */
export function klientPodlaFirmy(text: string, firmy: FirmaKlienta[]): string[] {
  if (!firmy.length) return [];
  // Bodky a čiarky preč: „FSH Devices s.r.o." v banke býva ako „FSH DEVICES
  // S R O" alebo úplne bez právnej formy. Bez tohto kroku sa nenašlo nič.
  const holy = (x: string) => normName(x).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const bezFormy = (x: string) => holy(x)
    .replace(/\b(s r o|sro|a s|as|spol|k s|z s|ltd|gmbh|zs|os)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const t = holy(text);
  const cisla = new Set(text.match(/\d{6,10}/g) || []);
  const najdene = firmy.filter((f) => {
    if (f.ico && cisla.has(f.ico)) return true;
    if (!f.firma) return false;
    const jadro = bezFormy(f.firma);
    return jadro.length >= 4 && t.includes(jadro);
  }).map((f) => f.klient);
  return [...new Set(najdene)];
}

export function nepriradene(
  fio: FioRiadok[],
  platby: Platba[],
  mapovanie: Record<string, string>,
  nieKlient: Set<string>,
  menaKlientov: string[],
  /** Platby z PTmindera — na spárovanie podľa sumy a dňa, keď meno chýba. */
  ptPlatby: PtPlatba[] = [],
  /** Vystavené faktúry — variabilný symbol je najtvrdší dôkaz. */
  faktury: FakturaVzor[] = [],
  /** Firmy klientov — platba z firmy patrí človeku, ktorý za ňou stojí. */
  firmy: FirmaKlienta[] = [],
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
    /**
     * PORADIE DÔVERY, a miešať sa nesmie: čo už človek potvrdil → číslo
     * faktúry (variabilný symbol) → firma alebo IČO klienta → meno v texte →
     * suma a deň z PTmindera.
     *
     * Faktúra a firma sú vyššie než meno zámerne: keď platí firma za
     * zamestnanca, v texte je meno firmy a meno klienta tam nie je vôbec.
     * Suma zostáva posledná — je to zhoda čísla, nie dôkaz.
     */
    const podlaFaktury = naucene ? [] : klientPodlaFaktury(text, faktury);
    const podlaFirmy = naucene || podlaFaktury.length ? [] : klientPodlaFirmy(text, firmy);
    const podlaMena = naucene || podlaFaktury.length || podlaFirmy.length ? [] : najdiKlientaVTexte(text, menaKlientov);
    const podlaSumy = naucene || podlaFaktury.length || podlaFirmy.length || podlaMena.length ? [] : parujPodlaSumy(r, ptPlatby);
    const kandidati = naucene ? [naucene]
      : podlaFaktury.length ? podlaFaktury
        : podlaFirmy.length ? podlaFirmy
          : podlaMena.length ? podlaMena : podlaSumy;
    out.push({
      fioId: r.id,
      datum: r.date.slice(0, 10),
      suma: r.amount_czk,
      text,
      kandidati,
      // Naučené priradenie prebíja odhad: keď už niekto raz povedal, že tento
      // odosielateľ je klient, appka to nemá spochybňovať.
      klientsky: !!naucene || vyzeraNaKlienta(r),
      zdrojNavrhu: naucene ? "naucene"
        : podlaFaktury.length ? "faktura"
          : podlaFirmy.length ? "firma"
            : podlaMena.length ? "meno" : podlaSumy.length ? "suma" : "",
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
  /** Bitcoin, barter — čo nie je ani účet, ani zošit. */
  kokpitIne: number;
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
    if (!r) { r = { mesiac, kokpit: 0, ptminder: 0, rozdiel: 0, kokpitHotovost: 0, kokpitBanka: 0, kokpitIne: 0 }; m.set(mesiac, r); }
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
    // Rozpad musí dať dokopy `kokpit`, inak tabuľka ticho stratí riadky.
    // „prevod" je ručne zapísaný prevod z cudzieho účtu (Revolut), ktorý
    // vo Fio výpise nie je; bitcoin a barter idú do „iné".
    if (p.sposob === "banka" || p.sposob === "prevod") r.kokpitBanka += p.sumaCzk;
    else if (p.sposob === "hotovost") r.kokpitHotovost += p.sumaCzk;
    else r.kokpitIne += p.sumaCzk;
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
