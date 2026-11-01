// Jerry, 1. 11. 2026: klientom sa tyká na všetkých stránkach a v SMS.
import { describe, expect, it } from "bun:test";

import { FORMULAR } from "./anamnezaFormular";
import { strankaHtml } from "./anamnezaStranka";
import { dotaznikHotovo, dotaznikNeplati, dotaznikStranka } from "./dotaznikStranka";
import { blokFakturyHtml, hlaskaFaktury } from "./fakturaKlienta";
import { feedKlienta, teloStrankyKalendara } from "./kalendarMobil";
import { mailKlientovi, type VypisKlienta } from "./mailKlientovi";
import { ponukaStrankaHtml } from "./ponukaStranka";
import { textSmsPonuky } from "./ponukaTerminov";
import { textSms } from "./sms";
import { textSmsAnamnezy, textSmsFotiek, textSmsKalendara, textSmsPoUvodnom, textSmsPredUvodnym } from "./smsSablony";
import { uvodnaStrankaHtml } from "./uvodnaStranka";

/** Text, ktorý klient číta — bez štýlov, skriptov a atribútov okrem popisiek. */
const viditelne = (h: string) => h
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]*\splaceholder="([^"]*)"[^>]*>/g, " $1 ")
  .replace(/<[^>]+>/g, " ");

/**
 * Vykanie po česky je na konci slova: -te (Máte, Napište, Vyplňte, Zkuste…)
 * a zámená. Výnimky sú slová, ktoré vykanie nie sú.
 */
const VYKANIE = /(?<!\p{L})(v[áa][sšm]\p{L}*|\p{L}+te)(?!\p{L})/giu;
const NIE_SU_VYKANIE = new Set(["jeste"]); // „ještě" v SMS bez diakritiky
const najdi = (t: string) => [...t.matchAll(VYKANIE)].map((m) => m[0]).filter((s) => !NIE_SU_VYKANIE.has(s.toLowerCase()));

const STRANKY: Record<string, string> = {
  "u pred": uvodnaStrankaHtml({ druh: "pred", trener: "Jerry", kedy: "2026-10-16T09:00", logoUrl: "/l.svg", anamnezaUrl: "/a/x" }),
  "u pred bez termínu": uvodnaStrankaHtml({ druh: "pred", trener: "Terezka", logoUrl: "/l.svg" }),
  "u po": uvodnaStrankaHtml({ druh: "po", trener: "Terezka", kedy: "2026-10-16T09:00", logoUrl: "/l.svg", fotky: ["/f.jpg"], faktura: { klient: "Jan Novák", udaje: null } }),
  "u po bez termínu": uvodnaStrankaHtml({ druh: "po", trener: "Jerry", logoUrl: "/l.svg", odpovedChyba: "text" }),
  "faktúra má údaje": blokFakturyHtml({ klient: "Jan Novák", udaje: { firma: "Jan Novák", ulica: "Joštova 4", psc: "602 00", mesto: "Brno" } as never }),
  "a formulár": strankaHtml({ formular: FORMULAR, klient: "Jan Novák", kontakt: { email: "a@b.cz" }, uvodny: "pátek 9. 10. v 9:00" }).replace(/<label class="suhlas">[\s\S]*?<\/label>/g, ""),
  "a hotovo": strankaHtml({ formular: FORMULAR, klient: "Jan Novák", kontakt: {}, hotovo: true }),
  "t výber": ponukaStrankaHtml({ token: "abc", oslovenie: "Jane", trener: "Jerry", logoUrl: "/l.svg", typ: "trening", stav: { druh: "vyber", platiDo: "2026-10-25", volne: [{ id: "a", trener: "Jerry", zaciatok: "2026-10-20T10:00", koniec: "2026-10-20T11:00" }] as never } }),
  "t úvodný": ponukaStrankaHtml({ token: "abc", oslovenie: "", trener: "Terezka", logoUrl: "/l.svg", typ: "uvodny", stav: { druh: "vybrane", cas: { id: "a", trener: "Terezka", zaciatok: "2026-10-20T10:00", koniec: "2026-10-20T11:00" } as never } }),
  "t neplatí": ponukaStrankaHtml({ token: "abc", oslovenie: "", trener: "Terezka", logoUrl: "/l.svg", typ: "trening", stav: { druh: "neplati", preco: "obsadene" } }),
  "k bez voľby": teloStrankyKalendara({ logo: "", oslovenie: "Jane", telefon: null, webcal: "webcal://x", google: "g", kratka: "https://x", telefonTrenera: "+420", komu: "Filipovi" }),
  "k iphone": teloStrankyKalendara({ logo: "", oslovenie: "", telefon: "iphone", webcal: "webcal://x", google: "g", kratka: "https://x", telefonTrenera: "+420", komu: "Filipovi" }),
  "k android": teloStrankyKalendara({ logo: "", oslovenie: "", telefon: "android", webcal: "webcal://x", google: "g", kratka: "https://x", telefonTrenera: "+420", komu: "Filipovi" }),
  "k android na PC": teloStrankyKalendara({ logo: "", oslovenie: "", telefon: "android", webcal: "webcal://x", google: "g", kratka: "https://x", telefonTrenera: "+420", komu: "Filipovi", naPocitaci: true }),
  "d": dotaznikStranka({ chyba: "x" }),
  "d hotovo": dotaznikHotovo({}),
  "d už": dotaznikHotovo({ uzPredtym: true }),
  "d neplatí": dotaznikNeplati({ uzavrete: true }),
};

const URL = "https://prosapiens.cz/u/AbCdEfGhJkMn";
const SMS: Record<string, string> = {
  "pred úvodným": textSmsPredUvodnym("Jan Novák", URL),
  "po úvodnom": textSmsPoUvodnom("Jan Novák", URL, { termin: true, fotky: true }),
  "anamnéza pred": textSmsAnamnezy(URL, false, "Jan Novák"),
  "anamnéza po": textSmsAnamnezy(URL, true, "Jan Novák"),
  kalendár: textSmsKalendara("Jan Novák", URL, "Filip"),
  fotky: textSmsFotiek("Jan Novák", URL, "Filip"),
  ponuka: textSmsPonuky("Jan", URL, "Filip"),
  hodiny: textSms({ oslovenie: "Jan", trener: "Jerry", odkaz: URL, sQr: true }),
};

describe("klientom sa tyká", () => {
  for (const [nazov, h] of Object.entries(STRANKY)) {
    it(`stránka ${nazov}`, () => {
      expect(najdi(viditelne(h))).toEqual([]);
      expect(viditelne(h).length).toBeGreaterThan(10);
    });
  }
  for (const [nazov, t] of Object.entries(SMS)) {
    it(`SMS ${nazov}`, () => {
      expect(najdi(t)).toEqual([]);
      expect(t).toMatch(/^Ahoj /);
    });
  }
  it("hlásky formulára faktúry", () => {
    for (const k of ["ico", "dic", "email", "adresa", "ares", "nedostupne"] as const) expect(najdi(hlaskaFaktury(k))).toEqual([]);
  });
  it("udalosť v kalendári", () => {
    const ics = feedKlienta([{ uid: "a", trener: "Jerry", zaciatok: "2026-10-20T10:00", koniec: "2026-10-20T11:00" }], () => ({ krstne: "Filip", telefon: "+420" }));
    expect(ics.replace(/\r\n /g, "")).toContain("Napiš: +420");
    expect(najdi(ics.replace(/\r\n /g, ""))).toEqual([]);
  });
  it("kontrola by vykanie našla (stráž stráži)", () => {
    expect(najdi("Napište nám, co Vás trápí a kdy můžete.")).toEqual(["Napište", "Vás", "můžete"]);
  });
});

describe("výpisový mail je česky a bez rodu klienta", () => {
  const zaklad: VypisKlienta = {
    klient: "Jana Nováková", oslovenie: "Jana", trener: "Terezka",
    os: [
      { den: "2026-08-10", popis: "6h Balíček", druh: "balicekOd" },
      { den: "2026-08-10", cas: "17:00", popis: "tréning", druh: "trening", zostatok: 6, dlh: 1 },
      { den: "2026-08-23", popis: "zaplatené 7 790 Kč", druh: "platba" },
    ],
    zostatok: 0, hodinSpolu: 19, odkedy: "2026-06-01", tempo: 4, mesiacov: 4,
  };
  const varianty: VypisKlienta[] = [
    zaklad,
    { ...zaklad, dnes: "2026-08-10" },
    { ...zaklad, zostatok: 3 },
    { ...zaklad, zostatok: null },
    { ...zaklad, zostatok: -1, dnes: "2026-08-10" },
    { ...zaklad, zostatok: -7 },
    { ...zaklad, platnostSkoncila: true },
    { ...zaklad, uplna: true, zaplateneSpolu: 1000 },
    { ...zaklad, dalsi: "2026-10-06T10:30", platba: { popis: "Nový balíček", suma: 7790, ucet: "1/2010", sprava: "Jana" } },
  ];
  // Slovenské tvary, ktoré v maili boli; „tréning" s g je slovenčina, trénink česky.
  const SLOVENSKY = /tréning|posiel|prehľad|dochodený|dochádzk|zostáv|ďalš|chodíte|história|histór|si mal|si mala|bol[aoy]?\s|poslednú|posledný|mesiac|Najbliž|míňal|Chcem|celú|Napíš/i;
  for (const [i, v] of varianty.entries()) {
    it(`variant ${i}`, () => {
      const m = mailKlientovi(v);
      expect(m.text).not.toMatch(SLOVENSKY);
      expect(viditelne(m.html)).not.toMatch(SLOVENSKY);
      expect(m.predmet).not.toMatch(SLOVENSKY);
      expect(najdi(m.text)).toEqual([]);
    });
  }
  it("sedem hodín nad rámec má správny tvar", () => {
    expect(mailKlientovi({ ...zaklad, zostatok: -7 }).text).toContain("máš 7 hodin nad rámec balíčka — jsou v další platbě.");
  });
});
