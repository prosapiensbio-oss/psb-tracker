import { DODAVATEL, den, suma, type Faktura } from "./vydanaFaktura";

/**
 * TEXT MAILU, KTORÝM ODCHÁDZA FAKTÚRA.
 *
 * Tón je odpozeraný z toho, ako Jerry píše z `info@prosapiens.cz`: klientom
 * TYKÁ („Ahoj Filip, … máme pro tebe něco navíc"), firmám nie. Preto sa
 * oslovenie vyberá podľa toho, či je odberateľ firma — a nie podľa nálady.
 *
 * Jazyk je čeština: klienti sú Česi a Jerryho vlastné maily aj faktúry sú
 * české, aj keď v chate hovorí po slovensky.
 */

/** Krstné meno na oslovenie. Pri „Ing. arch. Anna Nová" je to Anna. */
export function krstne(meno: string): string {
  const kusy = meno.trim().split(/\s+/).filter((k) => !k.endsWith(".") && k.length > 1);
  return kusy[0] || meno.trim().split(/\s+/)[0] || "";
}

export type MailFaktury = { predmet: string; telo: string; firme: boolean };

export function mailFaktury(f: Faktura): MailFaktury {
  // Firma = odberateľ sa volá inak než človek, ktorý cvičí. Vtedy doklad
  // otvára účtovníčka, nie klient, a tykanie by bolo mimo.
  const firme = !!f.odberatel.firma && f.odberatel.firma !== f.klient;
  const ciastka = `${suma(f.celkom)} Kč`;
  const podpis = [
    firme ? DODAVATEL.meno : "Filip",
    "ProSapiens Biomechanic",
    `${DODAVATEL.web} · ${DODAVATEL.telefon}`,
  ].join("\n");

  const telo = firme
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

  return { predmet: `Faktura ${f.cislo} — ProSapiens Biomechanic`, telo, firme };
}

/** Ako sa bude volať priložený súbor. */
export const menoPrilohy = (cislo: string) => `Faktura ${cislo}.pdf`;
