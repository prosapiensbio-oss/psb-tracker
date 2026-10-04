/**
 * SMS KLIENTOVI — ZVONČEK, NIE OBSAH.
 *
 * Jerry, 28. 9. 2026: „mne by stačilo, že by klientovi došla SMS, že dnes máš
 * posledný tréning." Celý prehľad — dochádzka, tempo, QR — je v maili; SMS má
 * jedinú úlohu: aby si ho klient otvoril v deň, keď na tom záleží.
 *
 * PREČO JE TO TAKÉ KRÁTKE
 *
 * SMS má 160 znakov, ALE len v GSM abecede. Len čo sa v nej objaví jediná
 * dĺžeň alebo mäkčeň, prepne sa na UCS-2 a limit padne na 70 znakov na
 * správu. Zoznam tréningov by bol päť správ a vyzeral by ako vysypaná
 * tabuľka do telefónu — preto v SMS nie je.
 *
 * `dlzkaSpravy` to počíta, aby bolo pred odoslaním vidieť, koľko správ
 * z toho bude. Cena je síce malá, ale „jedna veta" a „tri SMS" sú dve
 * rôzne veci a človek to má vedieť predtým, než klikne.
 */

import { zostavaHodin } from "./mailKlientovi";

/** Znaky, ktoré sa zmestia do GSM 03.38 — všetko ostatné prepne na UCS-2. */
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
  + "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Tieto zaberú v GSM dva znaky. */
const GSM_DVOJ = "^{}\\[~]|€";

export type DlzkaSpravy = {
  /** Koľko znakov správa zaberá (v GSM sa niektoré rátajú za dva). */
  znakov: number;
  /** `true` = v texte je diakritika alebo iný znak mimo GSM. */
  unicode: boolean;
  /** Koľko SMS sa za to zaplatí. */
  sprav: number;
};

export function dlzkaSpravy(text: string): DlzkaSpravy {
  const t = String(text || "");
  const unicode = [...t].some((z) => !GSM.includes(z) && !GSM_DVOJ.includes(z));
  if (unicode) {
    // UCS-2: 70 znakov na jednu správu, 67 na diel zreťazenej.
    const znakov = [...t].length;
    return { znakov, unicode, sprav: znakov === 0 ? 0 : znakov <= 70 ? 1 : Math.ceil(znakov / 67) };
  }
  const znakov = [...t].reduce((n, z) => n + (GSM_DVOJ.includes(z) ? 2 : 1), 0);
  return { znakov, unicode, sprav: znakov === 0 ? 0 : znakov <= 160 ? 1 : Math.ceil(znakov / 153) };
}

/**
 * Telefónne číslo v tvare, ktorý berie brána.
 *
 * Čísla sú v appke tak, ako ich vyviezol PTminder: „605965949",
 * „776 491 800", niekde aj s pomlčkami. Brána chce medzinárodný tvar.
 * Bez predvoľby sa predpokladá české číslo — klientela je česká; slovenské
 * sa pozná podľa toho, že si predvoľbu nesie samo.
 *
 * `null` = číslo nedáva zmysel a SMS sa nesmie poslať. Osem číslic je
 * v dátach naozaj (Martina Šintalová) a je to preklep, nie iná krajina.
 */
export function cisloPreBranu(telefon: string, predvolba = "420"): string | null {
  const c = String(telefon || "").replace(/[\s\-()./]/g, "");
  if (!c) return null;

  if (c.startsWith("+")) return /^\+\d{11,15}$/.test(c) ? c : null;
  if (c.startsWith("00")) return cisloPreBranu(`+${c.slice(2)}`);
  // „420…" alebo „421…" bez plusu je už medzinárodné.
  if (/^(420|421)\d{9}$/.test(c)) return `+${c}`;
  // Domáci tvar s nulou na začiatku (slovenský zápis): 0905… → +421905…
  if (/^0\d{9}$/.test(c)) return `+421${c.slice(1)}`;
  /**
   * DEVÄŤ ČÍSLIC ZAČÍNAJÚCICH DEVIATKOU JE SLOVENSKÝ MOBIL.
   *
   * Roman Pavlík, 2. 10. 2026: v PTminderi „944096975" (O2 Slovensko bez
   * nuly), appka predpokladala Česko a SMS odišla na +420 944 096 975 —
   * číslo, ktoré nepatrí nikomu. České mobily začínajú šestkou alebo
   * sedmičkou; čísla na 9 sú v Česku spoplatnené linky, nie ľudia.
   */
  if (/^9\d{8}$/.test(c)) return `+421${c}`;
  if (/^\d{9}$/.test(c)) return `+${predvolba}${c}`;
  return null;
}

/** „+421944096975" → „+421 944 096 975 (Slovensko)" — aby človek videl, kam to odíde. */
export function cisloNaUkazku(medzinarodne: string): string {
  const m = /^\+(420|421)(\d{3})(\d{3})(\d{3})$/.exec(medzinarodne);
  if (!m) return medzinarodne;
  return `+${m[1]} ${m[2]} ${m[3]} ${m[4]} (${m[1] === "421" ? "Slovensko" : "Česko"})`;
}

export type SpravaProKlienta = {
  oslovenie: string;
  /** Meno trénera — podpis. */
  trener: string;
  /** Koľko hodín zostáva; 0 alebo menej = balíček došiel. */
  zostatok: number;
  /** Posiela sa aj mail s dochádzkou a QR? */
  sMailom: boolean;
  /** Bol tréning DNES? Bez toho sa SMS na dnešok neodvoláva. */
  dnesnyTrening?: boolean;
  /** Rod klienta — „mal si" verzus „mala si". */
  rod?: "m" | "z";
  /** Odkaz na stránku s tréningmi a platbou — keď je, prebije vetu o maili. */
  odkaz?: string;
};

/** SMS ide bez diakritiky — jediný mäkčeň prepne správu na 70 znakov. */
export const bezDiakritiky = (t: string): string => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Rod z mena — HEURISTIKA, nie pravda. Ženu prezradí priezvisko na -ová/-á,
 * inak krstné meno na -a/-e (Hana, Lucie). „Nikita" či „Saša" to pomýli,
 * preto je v SMS paneli prepínač a text sa dá vždy prepísať rukou.
 */
export function rodZMena(meno: string): "m" | "z" {
  const casti = String(meno || "").trim().split(/\s+/);
  const priezvisko = (casti[casti.length - 1] || "").toLowerCase();
  if (/(ova|ová|á)$/.test(priezvisko)) return "z";
  const krstne = (casti[0] || "").toLowerCase();
  return /[ae]$/.test(bezDiakritiky(krstne)) ? "z" : "m";
}

/**
 * JEDNA SPRÁVA PRE VŠETKY SITUÁCIE OKOLO HODÍN.
 *
 * Jerry, 2. 10. 2026: „tieto SMS mám pocit, že to celé skomplikovali,
 * musíme to nejako zjednodušiť… a SMS je najlepšia ‚tady máš přehled hodin
 * a QR na platbu za balíček z 9. 9. 2026'. Okrem toho sa už len upravuje
 * nadpis — a to je definované počtom a aktuálnou situáciou, pričom obsah
 * odkazu vyzerá vždy rovnako."
 *
 * PREDTÝM BOLO PÄŤ ZNENÍ: zostávajú hodiny, dnes posledná, dochodený, nad
 * rámec, nezaplatená platba. Všetkých päť viedlo na TEN ISTÝ odkaz a tá
 * stránka si stav aj tak povie sama — presnejšie než veta v správe. Appka
 * teda hovorila dvakrát to isté a pri Lukášovi Hanusovi sa to rozišlo:
 * SMS tvrdila jedno, stránka druhé.
 *
 * Jedno znenie to rieši natrvalo: nedá sa poslať nepravda o stave, text
 * neprestane platiť pri zmene stránky a človek si nemusí pamätať, ktoré
 * tlačidlo kedy. Rod klienta sa už nerieši — v texte nie je ani jedno
 * sloveso v minulom čase.
 *
 * Suma sa do textu NEPÍŠE. Nesie ju QR aj stránka, a keď sa zmení, text
 * zostáva pravdivý.
 */
export function textSms(v: {
  oslovenie: string;
  trener: string;
  /** Dátum balíčka, o ktorý ide — „9. 9. 2026". Bez neho veta drží. */
  datum?: string;
  /** Odkaz na /v/<token>. Bez neho sa pošle aspoň veta o maili. */
  odkaz?: string;
  /** Starý režim bez odkazu: dochádzka chodila mailom. */
  sMailom?: boolean;
  /** Je na stránke QR? Vtedy a len vtedy ho správa menuje. */
  sQr?: boolean;
}): string {
  /**
   * O QR SA PÍŠE LEN VTEDY, KEĎ NA STRÁNKE NAOZAJ JE.
   *
   * Jerry, 2. 10. 2026: pri zostávajúcich hodinách „tady máš přehled hodin",
   * pri dochodenom a nad rámec „tady máš přehled hodin a QR na platbu za
   * balíček z 9. 9. 2026". Je to ten istý rozdiel ako na stránke: QR sa
   * kreslí, až keď je čo zaplatiť. Správa, ktorá sľúbi QR a klient ho tam
   * nenájde, je horšia než stručná.
   */
  const za = v.datum ? ` za balíček z ${v.datum}` : "";
  const telo = v.odkaz
    ? (v.sQr ? `tady máš přehled hodin a QR na platbu${za}: ${v.odkaz}` : `tady máš přehled hodin: ${v.odkaz}`)
    : v.sMailom
      ? `v maili najdeš dochádzku aj QR na platbu${za}.`
      : `ozvi sa mi, prejdeme si hodiny${za}.`;
  // Bez diakritiky sa celá veta aj s odkazom zmestí do JEDNEJ správy;
  // s mäkčeňmi by to boli tri. Klientom SMS bez diakritiky chodia bežne.
  return bezDiakritiky(`Ahoj ${v.oslovenie}, ${telo} ${v.trener}`);
}

/**
 * Pôvodný názov pre pripomienku platby. Je to TÁ ISTÁ správa — ponechaný
 * len preto, aby sa nemuseli prepisovať volania, ktoré o nej hovoria menom.
 */
export const textSmsPlatba = (v: { oslovenie: string; trener: string; suma?: number; datum?: string; odkaz?: string }): string =>
  textSms({ oslovenie: v.oslovenie, trener: v.trener, datum: v.datum, odkaz: v.odkaz, sQr: true });

/**
 * ODOSIELATEĽ — ČO BRÁNA VEZME.
 *
 * Alfanumerické meno má **11 znakov**. Nie je to pravidlo brány, ale limit
 * samotnej SMS, takže „ProSapiens Biomechanic" (22) neprejde nikdy a nikde.
 * Kokpit to musí povedať pri zadávaní; inak by sa to uložilo, SMS by ticho
 * odišla z čísla a nikto by nevedel prečo.
 *
 * Číslo (samé číslice, prípadne s +) je v poriadku v ľubovoľnej dĺžke —
 * to nie je meno, ale virtuálne číslo.
 *
 * Vracia dôvod odmietnutia, alebo `null` keď je všetko v poriadku.
 */
export function chybaOdosielatela(odosielatel: string, druh = "smsmanager"): string | null {
  const o = String(odosielatel || "").trim();
  if (!o) return druh === "twilio" ? "Twilio potrebuje číslo odosielateľa." : null;
  if (/^\+?\d+$/.test(o)) return null;
  if (druh === "twilio") return "Twilio berie ako odosielateľa len číslo.";
  if ([...o].length > 11) return `Meno odosielateľa má najviac 11 znakov, toto má ${[...o].length}.`;
  if (!/^[A-Za-z0-9 ]+$/.test(o)) return "Meno odosielateľa môže mať len písmená bez diakritiky, číslice a medzery.";
  return null;
}
