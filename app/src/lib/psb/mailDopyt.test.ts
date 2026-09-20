import { describe, expect, it } from "bun:test";

import { naDopyt, rozdelAdresu, telefonZTextu, zFormulara } from "./mailDopyt";
import { dekoduj, dekodujTelo, imapDatum, rozoberOdpoved } from "./imapParse";

const sprava = (o: Partial<Parameters<typeof naDopyt>[0]> = {}) => ({
  uid: "1", od: "Jan Novák <jan@novak.cz>", komu: "info@prosapiens.cz",
  predmet: "Dotaz na trénink", datum: "Sat, 20 Sep 2026 09:12:00 +0200",
  text: "Dobrý den, rád bych se objednal na úvodní trénink.", ...o,
});

describe("adresa a telefón", () => {
  it("rozoberie meno a adresu", () => {
    expect(rozdelAdresu("Jan Novák <jan@novak.cz>")).toEqual({ meno: "Jan Novák", email: "jan@novak.cz" });
  });
  it("bez mena poskladá meno z adresy", () => {
    expect(rozdelAdresu("petr.bata99@seznam.cz").meno).toBe("Petr Bata");
  });
  it("neplatnú adresu zahodí", () => {
    expect(rozdelAdresu("bez zavináča").email).toBe("");
  });
  it("nájde telefón v texte, rok nie", () => {
    expect(telefonZTextu("volejte 777 123 456 prosím")).toBe("777123456");
    expect(telefonZTextu("v roce 2026 jsem měl operaci")).toBe("");
  });
});

describe("čo je dopyt a čo nie", () => {
  it("bežná správa od človeka je dopyt", () => {
    const v = naDopyt(sprava());
    expect("dopyt" in v && v.dopyt.zdroj).toBe("mail");
    expect("dopyt" in v && v.dopyt.kluc).toBe("mail-2026-09-20-jan@novak.cz");
    expect("dopyt" in v && v.dopyt.meno).toBe("Jan Novák");
  });
  it("no-reply, DMARC ani služba dopyt nie sú", () => {
    expect(naDopyt(sprava({ od: "no-reply@seznam.cz" }))).toHaveProperty("preskocene");
    expect(naDopyt(sprava({ od: "Zprávy <notifications@facebookmail.com>" }))).toHaveProperty("preskocene");
    expect(naDopyt(sprava({ od: "dmarc@google.com", predmet: "Report domain: prosapiens.cz" }))).toHaveProperty("preskocene");
  });
  it("odpoveď v rozhovore sa nezaloží druhýkrát", () => {
    expect(naDopyt(sprava({ predmet: "Re: Dotaz na trénink" }))).toHaveProperty("preskocene");
  });
  it("vlastná adresa a zoznam ignorovaných", () => {
    expect(naDopyt(sprava({ od: "info@prosapiens.cz" }), ["info@prosapiens.cz"])).toHaveProperty("preskocene");
    expect(naDopyt(sprava(), [], ["novak.cz"])).toHaveProperty("preskocene");
  });
  it("faktúra nie je dopyt", () => {
    expect(naDopyt(sprava({ predmet: "Faktura 2026-114" }))).toHaveProperty("preskocene");
  });
});

describe("formulár preposlaný mailom", () => {
  const cf7 = sprava({
    od: "ProSapiens <wordpress@prosapiens.cz>",
    predmet: "ProSapiens Biomechanic „Úvodní trénink“",
    text: "Jméno: Petr Baťa\nE-mail: petr.bata@email.cz\nTelefon: 608 111 222\nZpráva: Bolí mě záda při sedu.",
  });

  it("vytiahne polia formulára", () => {
    const f = zFormulara(cf7)!;
    expect(f.meno).toBe("Petr Baťa");
    expect(f.email).toBe("petr.bata@email.cz");
    expect(f.telefon).toBe("608 111 222");
  });

  /**
   * Toto je celý dôvod, prečo formulár nemá vlastný kľúč: snippet na webe
   * pošle ten istý dopyt aj s kampaňou. Keby mal mail iný kľúč, ten istý
   * človek by bol v Dopytoch dvakrát a cena za dopyt by vyšla o polovicu nižšia.
   */
  it("má kľúč webového dopytu, aby sa so snippetom zliali do jedného", () => {
    const v = naDopyt(cf7);
    expect("dopyt" in v && v.dopyt.kluc).toBe("web-2026-09-20-petr.bata@email.cz");
    expect("dopyt" in v && v.dopyt.zdroj).toBe("web");
  });
});

describe("IMAP — dekódovanie", () => {
  it("dátum pre SEARCH SINCE", () => {
    expect(imapDatum(new Date("2026-09-20T10:00:00Z"))).toBe("20-Sep-2026");
  });
  it("base64 aj quoted-printable v hlavičke", () => {
    expect(dekoduj("=?UTF-8?B?RG90YXogbmEgdHLDqW5pbms=?=")).toBe("Dotaz na trénink");
    expect(dekoduj("=?UTF-8?Q?Dotaz_na_tr=C3=A9nink?=")).toBe("Dotaz na trénink");
  });
  it("telo bez HTML značiek a bez zalomení", () => {
    expect(dekodujTelo("<p>Dobr=C3=BD den,</p><p>chci se objednat.</p>")).toBe("Dobrý den,\nchci se objednat.");
  });
  it("z odpovede FETCH vyberie hlavičky a telo", () => {
    const r = [
      "* 5 FETCH (BODY[HEADER.FIELDS (FROM TO SUBJECT DATE)] {120}\r",
      "From: Jan Novák <jan@novak.cz>\r",
      "Subject: Dotaz\r",
      "Date: Sat, 20 Sep 2026 09:12:00 +0200\r",
      "\r",
      " BODY[TEXT]<0> {20}\r",
      "Dobrý den, chci...\r",
      ")\r",
      "k4 OK FETCH completed\r",
    ].join("\n");
    const v = rozoberOdpoved(r);
    expect(v.od).toBe("Jan Novák <jan@novak.cz>");
    expect(v.predmet).toBe("Dotaz");
    expect(v.text).toContain("Dobrý den");
  });
});
