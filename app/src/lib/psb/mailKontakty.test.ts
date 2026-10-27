// Mailový zoznam z MailerLite — záloha po zrušení predplatného (27. 10. 2026).
import { describe, expect, it } from "bun:test";

import { kontaktyZExportu, riadkyExportu, suhrnKontaktov } from "./mailKontakty";

const HLAVICKA = 'Subscriber,Sent,Opens,Clicks,Subscribed,Location,Name,"Last name",Company,Phone,Groups';
const VSETCI = [
  HLAVICKA,
  'a@seznam.cz,1,0,0,2025-09-03 20:19:04,Czechia,,,,,Fascie',
  'b@gmail.com,1,1,0,2025-08-16 09:34:25,Czechia,Anna,Nová,,,"Fascie;MFR"',
  'bounce@nikde.cz,1,0,0,2025-08-16 09:34:25,,,,,,MFR',
  'odhlaseny@seznam.cz,2,1,1,2025-08-16 09:34:25,Slovakia,,,,,Fascie',
].join("\n");
const AKTIVNI = [HLAVICKA, 'a@seznam.cz,1,0,0,2025-09-03 20:19:04,Czechia,,,,,Fascie',
  'b@gmail.com,1,1,0,2025-08-16 09:34:25,Czechia,Anna,Nová,,,"Fascie;MFR"'].join("\n");
const ODHLASENI = [
  'Subscriber,Sent,Opens,Clicks,Subscribed,Location,"Unsubscribed at","Unsubscribe reason",Name,"Last name",Company,Phone,Groups',
  'odhlaseny@seznam.cz,2,1,1,2025-08-16 09:34:25,Slovakia,2026-02-01 10:00:00,"Už mě to nezajímá",,,,,Fascie',
].join("\n");

describe("čítanie exportu", () => {
  it("hlavička sa číta podľa názvov, nie podľa poradia", () => {
    // Poradie stlpcov urcuje Set columns v MailerLite a meni sa medzi
    // dvoma stiahnutiami toho istého zoznamu.
    const r = riadkyExportu('Groups,Subscriber\nFascie,x@y.cz');
    expect(r[0].subscriber).toBe("x@y.cz");
    expect(r[0].groups).toBe("Fascie");
  });
  it("prázdny alebo samotná hlavička nevráti nič", () => {
    expect(riadkyExportu("")).toEqual([]);
    expect(riadkyExportu(HLAVICKA)).toEqual([]);
  });
});

describe("skladanie stavu z troch exportov", () => {
  const k = kontaktyZExportu({ vsetci: VSETCI, aktivni: AKTIVNI, odhlaseni: ODHLASENI });
  const najdi = (e: string) => k.find((x) => x.email === e)!;

  it("kto je len vo vsetkych, je nedorucitelny", () => {
    expect(najdi("bounce@nikde.cz").stav).toBe("bounced");
  });
  it("odhlásenie prebíja a nesie dátum aj dôvod", () => {
    const o = najdi("odhlaseny@seznam.cz");
    expect(o.stav).toBe("unsubscribed");
    expect(o.odhlasenyAt).toBe("2026-02-01");
    expect(o.dovod).toBe("Už mě to nezajímá");
  });
  it("aktívni zostanú aktívni a skupiny sa rozoberú", () => {
    expect(najdi("b@gmail.com").stav).toBe("active");
    expect(najdi("b@gmail.com").skupiny).toEqual(["Fascie", "MFR"]);
    expect(najdi("b@gmail.com").meno).toBe("Anna");
  });
  it("mail sa normalizuje na malé písmená a riadok bez zavináča sa zahodí", () => {
    const x = kontaktyZExportu({ vsetci: `${HLAVICKA}\nA@Seznam.CZ,1,0,0,,,,,,,\nnieJeMail,1,0,0,,,,,,,` });
    expect(x.map((y) => y.email)).toEqual(["a@seznam.cz"]);
  });
});

describe("zhrnutie", () => {
  it("počíta stavy, skupiny a okno prihlásenia", () => {
    const s = suhrnKontaktov(kontaktyZExportu({ vsetci: VSETCI, aktivni: AKTIVNI, odhlaseni: ODHLASENI }));
    expect(s).toMatchObject({ spolu: 4, aktivni: 2, odhlaseni: 1, nedorucitelni: 1, sMenom: 1, otvoriliAsponRaz: 2 });
    expect(s.skupiny[0]).toEqual({ nazov: "Fascie", pocet: 3 });
    expect(s.odkedy).toBe("2025-08-16");
    expect(s.dokedy).toBe("2025-09-03");
  });
});
