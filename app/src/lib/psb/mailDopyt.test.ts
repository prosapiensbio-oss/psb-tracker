import { describe, expect, it } from "bun:test";

import { naDopyt, rozdelAdresu, telefonZTextu, zFormulara } from "./mailDopyt";
import { dekoduj, dekodujTelo, imapDatum, rozoberOdpoved } from "./imapParse";

const sprava = (o: Partial<Parameters<typeof naDopyt>[0]> = {}) => ({
  uid: "1", od: "Jan Novák <jan@novak.cz>", komu: "info@prosapiens.cz", odpovedat: "",
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
    const f = zFormulara(cf7, ["prosapiens.cz"])!;
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

describe("čo NEMÁ byť dopyt (nálezy z prvého ostrého behu 21. 9. 2026)", () => {
  const z = (predmet: string, text: string, od = "Zuzana Seitlová <zuzana@aisignal.cz>") =>
    naDopyt({ uid: "9", od, komu: "info@prosapiens.cz", predmet, datum: "Wed, 02 Sep 2026 08:00:00 +0200", text });

  it("studená ponuka o webe a AI", () => {
    const v = z("Jste vlastníkem webu prosapiens.cz?", "Dobrý den, jsem Zuzana z aisignal.cz a věnuji se tomu, jak firmy rozpozná ChatGPT, Claude a Gemini.");
    expect(v).toHaveProperty("preskocene");
  });
  it("ponuka analýzy webu", () => {
    expect(z("Dobrý den", "píšu Vám ohledně webu prosapiens.cz, spolupracuji s firmami v Česku…", "Alena <alena@gptmatrix.cz>"))
      .toHaveProperty("preskocene");
  });
  it("správa bez akéhokoľvek náznaku dopytu sa nezapíše, ale je vidieť", () => {
    const v = z("Ahoj", "Posílám ty fotky z víkendu.");
    expect("preskocene" in v && v.preskocene).toContain("nevyzerá");
  });
  it("skutočný dopyt prejde", () => {
    const v = z("Dotaz", "Dobrý den, bolí mě záda a chtěl bych se objednat na úvodní trénink.", "Josef Pávek <josef.pavek@gmail.com>");
    expect("dopyt" in v && v.dopyt.email).toBe("josef.pavek@gmail.com");
  });
});

describe("MIME telo — dopyt Josefa Pávka, ako naozaj prišiel", () => {
  const surove = [
    "--b1=_l6zOgx96ExtcLmCUGSt8gMHvylgJNENn6xkDT4FYPWE",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    "NOVÝ TEST POSTURY",
    "====================================",
    "Jméno: Josef Pávek",
    "E-mail: josef.pavek@gmail.com",
    "Telefon: +420773972649",
    "",
    "--b1=_l6zOgx96ExtcLmCUGSt8gMHvylgJNENn6xkDT4FYPWE--",
  ].join("\r\n");

  it("z tela zmiznú oddeľovače aj hlavičky dielu", () => {
    const t = dekodujTelo(surove);
    expect(t).not.toContain("--b1=");
    expect(t).not.toContain("Content-Type");
    expect(t).toContain("NOVÝ TEST POSTURY");
    expect(t).toContain("Jméno: Josef Pávek");
  });

  it("formulár sa z takej správy prečíta celý", () => {
    const f = zFormulara({ uid: "1", od: "wordpress@prosapiens.cz", komu: "info@prosapiens.cz",
      predmet: "Nový test postury", datum: "Sun, 13 Sep 2026 12:00:00 +0200", text: dekodujTelo(surove) }, ["prosapiens.cz"])!;
    expect(f.meno).toBe("Josef Pávek");
    expect(f.email).toBe("josef.pavek@gmail.com");
    expect(f.telefon).toBe("+420773972649");
  });

  it("base64 diel sa prečíta", () => {
    const b64 = ["--x1=abcdef", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      btoa(String.fromCharCode(...new TextEncoder().encode("Dobrý den, chci se objednat."))), "--x1=abcdef--"].join("\r\n");
    expect(dekodujTelo(b64)).toBe("Dobrý den, chci se objednat.");
  });
});


/**
 * Presne to, čo sa stalo 21. 9. 2026: formulárová správa chodí z adresy webu
 * a človek je len v Reply-To. Bez toho vznikol z Hany Marko druhý dopyt
 * pomenovaný „online@prosapiens.cz".
 */
describe("formulár z adresy webu (Reply-To)", () => {
  const v = {
    uid: "3", od: "ProSapiens <online@prosapiens.cz>", komu: "info@prosapiens.cz",
    odpovedat: "Hana Marko <hana.marko@gmail.com>",
    predmet: "Nová zpráva od Hana Marko – prosapiens.cz",
    datum: "Sun, 20 Sep 2026 10:15:00 +0200",
    text: "Zpráva: Hezký den, bolí mě krk a chtěla bych se objednat.",
  };

  it("človekom je ten z Reply-To, nie web", () => {
    const r = naDopyt(v, ["info@prosapiens.cz"]);
    expect("dopyt" in r && r.dopyt.email).toBe("hana.marko@gmail.com");
    expect("dopyt" in r && r.dopyt.meno).toBe("Hana Marko");
    expect("dopyt" in r && r.dopyt.kluc).toBe("web-2026-09-20-hana.marko@gmail.com");
  });

  it("obyčajná pošta z vlastnej domény sa nezapíše", () => {
    const r = naDopyt({ ...v, predmet: "Přeposílám fakturu", text: "Tady je ta faktura na trénink.", odpovedat: "" }, ["info@prosapiens.cz"]);
    expect("preskocene" in r && r.preskocene).toContain("vlastná doména");
  });
});


/**
 * Regresia z 21. 9. 2026: keď sa za formulár považovala každá správa so slovom
 * „prosapiens", obchodná ponuka obišla filter a stala sa dopytom — dvakrát.
 */
describe("obchodná ponuka sa nesmie vydávať za formulár", () => {
  it("cudzia doména + zmienka o prosapiens.cz nie je formulár", () => {
    const v = {
      uid: "7", od: "Alena <alena@gptmatrix.cz>", komu: "info@prosapiens.cz",
      odpovedat: "Alena <alena@gptmatrix.cz>", predmet: "Dobrý den",
      datum: "Thu, 17 Sep 2026 09:00:00 +0200",
      text: "píšu Vám ohledně webu prosapiens.cz, spolupracuji s firmami v Česku…",
    };
    expect(zFormulara(v, ["prosapiens.cz"])).toBeNull();
    expect(naDopyt(v, ["info@prosapiens.cz"])).toHaveProperty("preskocene");
  });
});
