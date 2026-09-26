import { DODAVATEL, den, suma, type Faktura } from "./vydanaFaktura";

/**
 * TEXT MAILU, KTORÝM ODCHÁDZA FAKTÚRA.
 *
 * Tón je odpozeraný z toho, ako Jerry píše z `info@prosapiens.cz`: klientom
 * TYKÁ („Ahoj Filip, … máme pro tebe něco navíc"), firmám nie. Predvolí sa
 * podľa toho, či je odberateľ firma — ale rozhodnutie zostáva na človeku,
 * lebo appka nevie, s kým si Jerry ako píše (Jerry, 26. 9. 2026: „daj mi
 * možnosť výberu tykanie aj vykanie").
 *
 * PODPIS PATRÍ TRÉNEROVI KLIENTA. „Niektorí klienti patria Terezke a niektorí
 * mne" — faktúra podpísaná cudzím menom je drobnosť, ktorá klienta zmätie.
 *
 * Jazyk je čeština: klienti sú Česi a Jerryho vlastné maily aj faktúry sú
 * české, aj keď v chate hovorí po slovensky.
 */

/**
 * Podpisy trénerov. Telefóny sú tie, ktoré naozaj používajú — Jerryho je
 * na faktúre, Terezkin v pätke jej mailov z info@.
 *
 * Terezkino priezvisko appka nikde nemá, preto sa pri formálnom podpise
 * uvádza krstným menom. Keď ho Jerry doplní, patrí SEM.
 */
export const TRENERI: Record<string, { krstne: string; formalne: string; telefon: string }> = {
  Jerry: { krstne: "Filip", formalne: DODAVATEL.meno, telefon: DODAVATEL.telefon },
  Terezka: { krstne: "Terezka", formalne: "Terezka", telefon: "+420 702 147 704" },
};

/** Krstné meno na oslovenie. Pri „Ing. arch. Anna Nová" je to Anna. */
export function krstne(meno: string): string {
  const kusy = meno.trim().split(/\s+/).filter((k) => !k.endsWith(".") && k.length > 1);
  return kusy[0] || meno.trim().split(/\s+/)[0] || "";
}

export type VolbyMailu = {
  /** „Jerry" | „Terezka"; čokoľvek iné sa berie ako Jerry. */
  trener?: string;
  /** Vykanie. Nezadané = podľa toho, či je odberateľ firma. */
  vykanie?: boolean;
};

export type MailFaktury = { predmet: string; telo: string; firme: boolean; vykanie: boolean };

export function mailFaktury(f: Faktura, volby: VolbyMailu = {}): MailFaktury {
  // Firma = odberateľ sa volá inak než človek, ktorý cvičí. Vtedy doklad
  // otvára účtovníčka, nie klient, a tykanie by bolo mimo.
  const firme = !!f.odberatel.firma && f.odberatel.firma !== f.klient;
  const vykanie = volby.vykanie ?? firme;
  const t = TRENERI[volby.trener || "Jerry"] || TRENERI.Jerry;
  const ciastka = `${suma(f.celkom)} Kč`;
  const podpis = [
    vykanie ? t.formalne : t.krstne,
    "ProSapiens Biomechanic",
    `${DODAVATEL.web} · ${t.telefon}`,
  ].join("\n");

  const telo = vykanie
    ? [
      "Dobrý den,",
      "",
      `posílám fakturu č. ${f.cislo} na ${ciastka} se splatností ${den(f.splatnost)} za ${f.popis}.`,
      "",
      "V příloze je PDF s QR platbou — po načtení v mobilním bankovnictví se částka",
      "i variabilní symbol předvyplní.",
      "",
      "Kdyby cokoliv nesedělo, stačí odpovědět na tento e-mail.",
      "",
      "S pozdravem",
      podpis,
    ].join("\n")
    : [
      `Ahoj ${krstne(f.klient)},`,
      "",
      `posílám fakturu č. ${f.cislo} na ${ciastka} se splatností ${den(f.splatnost)}.`,
      "",
      "V příloze je PDF a je na něm QR platba — stačí ho načíst v mobilním bankovnictví",
      "a částka i variabilní symbol se vyplní samy.",
      "",
      "Kdyby něco nesedělo, stačí odpovědět na tenhle mail.",
      "",
      "Díky!",
      podpis,
    ].join("\n");

  return { predmet: `Faktura ${f.cislo} — ProSapiens Biomechanic`, telo, firme, vykanie };
}

/** Ako sa bude volať priložený súbor. */
export const menoPrilohy = (cislo: string) => `Faktura ${cislo}.pdf`;
