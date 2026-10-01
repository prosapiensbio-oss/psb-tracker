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
 * Predvolený text. Jerry ho pred odoslaním vidí a môže prepísať —
 * appka dáva tvar, slová zostávajú na ňom.
 *
 * Text SMS a úvod mailu NIE SÚ to isté (Jerry, 28. 9. 2026: „úvodný text
 * toho mailu by nemusel byť taký istý ako text tej SMS"). Mail má priestor
 * na vetu navyše, SMS má sedemdesiat znakov.
 */
export function textSms(v: SpravaProKlienta): string {
  /**
   * Text sa riadi SKUTOČNOSŤOU, nie jedným prípadom.
   *
   * Jerry, 29. 9. 2026: „ak je Vítězslav −1 tréning, nemôže mu prísť SMS,
   * že dnes mal poslednú hodinu." Mal pravdu — bola to nepravda o tom, čo
   * sa stalo, a klient si to vie prerátať. Tri stavy, tri vety:
   *
   *   > 0   „v balíčku ti zostávajú 2 h."
   *   = 0   „dnes si mal poslednú hodinu z balíčka."
   *   < 0   „máš 2 hodiny nad rámec balíčka."
   *
   * O DNEŠKU sa hovorí len vtedy, keď tréning naozaj dnes bol. SMS je síce
   * zvonček k mailu a posiela sa v deň tréningu, ale posiela ju človek —
   * a v nedeľu podvečer je „dnes" o štvrtkovej hodine nepravda.
   */
  const navyse = v.zostatok < 0 ? -v.zostatok : 0;
  const hodin = (n: number) => `${n} ${n === 1 ? "hodinu" : n < 5 ? "hodiny" : "hodín"}`;
  // „mal si" / „mala si" — jediné miesto, kde rod mení tvar.
  const mal = v.rod === "z" ? "mala" : "mal";
  const uvod = navyse
    ? `Ahoj ${v.oslovenie}, ${v.dnesnyTrening ? "dnešným tréningom máš" : "máš"} ${hodin(navyse)} nad rámec balíčka.`
    : v.zostatok === 0
      ? v.dnesnyTrening
        ? `Ahoj ${v.oslovenie}, dnes si ${mal} poslednú hodinu z balíčka.`
        : `Ahoj ${v.oslovenie}, balíček máš dochodený.`
      : `Ahoj ${v.oslovenie}, v balíčku ti ${zostavaHodin(v.zostatok)}.`;
  /**
   * Odkaz prebíja vetu o maili: klik je bližšie než hľadanie v schránke.
   *
   * Za tým istým odkazom sú od 30. 9. 2026 aj tri otázky, na ktoré si klient
   * odpovedá sám (`pocitovka.ts`). Správa ich menuje — inak by na ne klient
   * narazil až na konci stránky a väčšina by dočítala po platbu. Sú to tri
   * slová navyše a do jednej SMS sa to stále zmestí; stráži to test.
   */
  const kam = v.odkaz
    ? ` Treningy, platba a 3 otazky ako ti je: ${v.odkaz}`
    : v.sMailom ? " V maili nájdeš dochádzku aj QR na platbu." : "";
  // Bez diakritiky sa celá veta aj s odkazom zmestí do JEDNEJ správy;
  // s mäkčeňmi by to boli tri. Klientom SMS bez diakritiky chodia bežne.
  return bezDiakritiky(`${uvod}${kam} ${v.trener}, ProSapiens`);
}

/**
 * PRIPOMIENKA NEZAPLATENEJ PLATBY.
 *
 * Jerry, 1. 10. 2026: „Danielka Šašinkova je v mínuse 9 400, ale neviem, kde
 * by som mohol kliknúť na to, aby som jej poslal SMS?" Nikde — karta
 * nezaplatených mala len meno, sumu a klik na stôl klienta. Všetky ostatné
 * správy appky sú o hodinách, nie o peniazoch.
 *
 * DVE VECI, KTORÉ PRVÉ ZNENIE ROBILO ZLE
 *
 * Jerry o ňom: „‚Pošleš ju prosím' je také pasívne agresívne" a „‚už si ju
 * poslal' mi príde — no nie kokot, veď preto ti píšem, lebo som neposlala".
 *
 *  1. **Nerozkazuje.** „Pošleš ju prosím?" je otázka len tvarom. Správa
 *     povie, čo appka vidí, a nechá klienta konať.
 *  2. **Netvrdí, že klient nezaplatil.** Appka to vedieť NEMÔŽE: poplatok
 *     v PTminderi stojí otvorený, kým ho niekto nezmaže, a platba a balíček
 *     sa nemusia stretnúť ani v jednom smere. Preto „chýba mi" (chyba je na
 *     mojej strane evidencie) a výslovná odpustka „ak už odišla, nič nerieš".
 *     Bez nej správa obviňuje človeka, ktorý zaplatil včera.
 *
 * SUMA MÁ MAŤ DÔVOD. „Dlhuješ 9 400" je obvinenie; „za balíček z 9. 9." je
 * pripomienka, ktorú si klient vie overiť. Keď sa dátum aj s odkazom do
 * jednej SMS nezmestí, vypadne dátum — nie odpustka: za odkazom je celý
 * posledný balíček aj QR, takže informácia sa nestráca, len sa presúva.
 *
 * Suma sa píše bez medzier v tisícoch — „9400 Kc" prežije každú bránu,
 * kým úzka medzera sa občas zmení na otáznik.
 */
export function textSmsPlatba(v: {
  oslovenie: string; trener: string; suma: number;
  /** Dátum balíčka, za ktorý sa platí — „9. 9.". */
  datum?: string;
  /** Odkaz na /v/<token>: posledný balíček a QR na platbu. */
  odkaz?: string;
}): string {
  const zloz = (sDatumom: boolean) => {
    // Bez dátumu sa poradie slov mení: „za balíček z 9. 9. mi chýba" —
    // ale „mi chýba" na začiatku vety je nezmysel.
    const comu = sDatumom && v.datum ? `za balíček z ${v.datum} mi chýba` : "chýba mi";
    // Krátko zámerne: odkaz má 55 znakov a s dlhším menom by sa správa
    // prehupla do druhej SMS. Čo za odkazom je, povie stránka sama.
    const kam = v.odkaz ? ` Prehľad a QR: ${v.odkaz}` : "";
    return bezDiakritiky(
      `Ahoj ${v.oslovenie}, ${comu} platba ${Math.round(v.suma)} Kc. Ak už odišla, nič nerieš.${kam} ${v.trener}, ProSapiens`,
    );
  };
  const sDatumom = zloz(true);
  return dlzkaSpravy(sDatumom).sprav > 1 ? zloz(false) : sDatumom;
}

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
