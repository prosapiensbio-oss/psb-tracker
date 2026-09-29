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
  if (/^\d{9}$/.test(c)) return `+${predvolba}${c}`;
  return null;
}

export type SpravaProKlienta = {
  oslovenie: string;
  /** Meno trénera — podpis. */
  trener: string;
  /** Koľko hodín zostáva; 0 alebo menej = balíček došiel. */
  zostatok: number;
  /** Posiela sa aj mail s dochádzkou a QR? */
  sMailom: boolean;
};

/**
 * Predvolený text. Jerry ho pred odoslaním vidí a môže prepísať —
 * appka dáva tvar, slová zostávajú na ňom.
 *
 * Text SMS a úvod mailu NIE SÚ to isté (Jerry, 28. 9. 2026: „úvodný text
 * toho mailu by nemusel byť taký istý ako text tej SMS"). Mail má priestor
 * na vetu navyše, SMS má sedemdesiat znakov.
 */
export function textSms(v: SpravaProKlienta): string {
  const uvod = v.zostatok <= 0
    ? `${v.oslovenie}, dnes si mal poslednú hodinu z balíčka.`
    : `${v.oslovenie}, v balíčku ti ${zostavaHodin(v.zostatok)}.`;
  const kam = v.sMailom ? " V maili nájdeš dochádzku aj QR na platbu." : "";
  return `${uvod}${kam} ${v.trener}, ProSapiens`;
}
