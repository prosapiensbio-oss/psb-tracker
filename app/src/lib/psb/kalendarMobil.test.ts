import { describe, expect, it } from "bun:test";

import { feedKlienta, jeNahladOdkazu, odoberaKalendar, platformaStranky, platformaZAgenta, stavOdberu, telefonZAdresy, teloStrankyKalendara, zalom } from "./kalendarMobil";

const T = { Jerry: { krstne: "Filip", telefon: "+420 111 222 333" }, Terezka: { krstne: "Terezka", telefon: "+420 702 147 704" } } as Record<string, { krstne: string; telefon: string }>;
const tr = (t: string) => T[t] || T.Jerry;

// Jerry, 7. 10. 2026: „uvidí všetky moje udalosti, alebo len tie svoje?"
describe("kalendár v mobile", () => {
  it("kalendár nesie len udalosti, ktoré dostane — a nič o hodinách ani peniazoch", () => {
    const s = feedKlienta([
      { uid: "abc@google.com|2026-10-13T10:00", trener: "Jerry", zaciatok: "2026-10-13T10:00", koniec: "2026-10-13T11:00" },
    ], tr, new Date("2026-10-07T08:00:00Z"));
    expect(s.match(/BEGIN:VEVENT/g)?.length).toBe(1);
    expect(s).toContain("DTSTART:20261013T080000Z");
    expect(s).toContain("SUMMARY:Trénink ProSapiens");
    expect(s).toContain("X-WR-CALNAME:ProSapiens");
    expect(s).toContain("TRIGGER:-P1D");
    expect(s).toContain("TRIGGER:-PT2H");
    expect(/ Kč|hodin zbývá|balíč/i.test(s)).toBe(false);
  });

  it("Terezkin tréning má jej meno a číslo, nie Jerryho", () => {
    const s = feedKlienta([{ uid: "x|2026-10-14T09:00", trener: "Terezka", zaciatok: "2026-10-14T09:00", koniec: "2026-10-14T10:00" }], tr);
    const spojene = s.replace(/\r\n /g, "");
    expect(spojene).toContain("Terezkou");
    expect(spojene).toContain("702 147 704");
    expect(spojene.includes("111 222 333")).toBe(false);
  });

  it("dlhý riadok sa láme podľa normy a nič sa nestratí", () => {
    const dlhy = `DESCRIPTION:${"Trénink s Filipem — změna termínu? ".repeat(5)}`;
    const z = zalom(dlhy);
    for (const r of z.split("\r\n")) expect(new TextEncoder().encode(r).length).toBeLessThanOrEqual(75);
    expect(z.replace(/\r\n /g, "")).toBe(dlhy);
  });

  it("platforma z hlavičky a kto ešte odoberá", () => {
    expect(platformaZAgenta("iOS/18.0 (22A3354) dataaccessd/1.0")).toBe("iPhone");
    expect(platformaZAgenta("Google-Calendar-Importer")).toBe("Google Kalendár");
    expect(platformaZAgenta("macOS/14.5 (23F79) dataaccessd/1.0")).toBe("Mac");
    expect(platformaZAgenta("Mac OS X/10.15.7 (19H2) CalendarAgent/954")).toBe("Mac");
    const teraz = Date.parse("2026-10-07T12:00:00Z");
    expect(odoberaKalendar("2026-10-06T12:00:00Z", teraz)).toBe(true);
    expect(odoberaKalendar("2026-10-01T12:00:00Z", teraz)).toBe(false);
    expect(odoberaKalendar(null, teraz)).toBe(false);
  });
});

// Jerry, 15. 10. 2026: Michal Knapčok (Android) odkaz dostal, kalendár sa mu
// neukázal a z Kokpitu sa nedalo zistiť, či stránku vôbec otvoril.
describe("otvorenie stránky kalendára", () => {
  it("platforma zo skutočných prehliadačov", () => {
    expect(platformaStranky("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe("Android");
    expect(platformaStranky("Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36")).toBe("Android");
    expect(platformaStranky("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone");
    expect(platformaStranky("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toBe("Mac");
  });
  it("náhľad odkazu sa za otvorenie nepočíta", () => {
    expect(jeNahladOdkazu("facebookexternalhit/1.1 Facebot Twitterbot/1.0")).toBe(true);
    expect(jeNahladOdkazu("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(jeNahladOdkazu("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(jeNahladOdkazu("curl/8.7.1")).toBe(true);
    expect(jeNahladOdkazu("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe(false);
    expect(jeNahladOdkazu("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
  it("stav rozlíši, kde sa to zaseklo", () => {
    const z = { odobera: false, pocet: 0, posledne: null, platforma: null, otvorene: null, otvorenePlatforma: null };
    expect(stavOdberu(z)).toBe("neotvoril");
    expect(stavOdberu({ ...z, otvorene: "2026-10-14T14:20:00Z", otvorenePlatforma: "Android" })).toBe("otvoril");
    expect(stavOdberu({ ...z, pocet: 3, posledne: "2026-10-01T00:00:00Z" })).toBe("prestal");
    expect(stavOdberu({ ...z, odobera: true, pocet: 3, posledne: "2026-10-14T00:00:00Z" })).toBe("odobera");
  });
});

// Jerry, 15. 10. 2026: „bude tam otázka, aký máš telefón, iPhone, Android,
// a keď klikne na Android, ukáže sa toto".
describe("stránka kalendára — otázka na telefón", () => {
  const v = {
    logo: "<img>", oslovenie: "Michale", webcal: "webcal://k.dev/k/AbC12345/kalendar.ics",
    google: "https://calendar.google.com/calendar/r?cid=x", kratka: "https://prosapiens.cz/k/AbC12345",
    telefonTrenera: "+420 702 090 289", komu: "Filipovi",
  };
  it("kým nezvolí, je tam len otázka — žiadne tlačidlo do kalendára", () => {
    const h = teloStrankyKalendara({ ...v, telefon: null });
    expect(h).toContain("Michale, jedním klepnutím");
    expect(h).toContain("Jaký máte telefon?");
    expect(h).toContain('href="?telefon=iphone#telefon"');
    expect(h).toContain('href="?telefon=android#telefon"');
    expect(h).not.toContain("Přidat do kalendáře");
    expect(h).not.toContain("ICSx");
  });
  it("iPhone: webcal a rada o upozorneniach", () => {
    const h = teloStrankyKalendara({ ...v, telefon: "iphone" });
    expect(h).toContain(`href="${v.webcal}">Přidat do kalendáře`);
    expect(h).toContain("Odstranit upozornění");
    expect(h).not.toContain("ICSx");
    expect(h).toContain('class="volba zvolena" href="?telefon=iphone');
  });
  it("Android: počítač, mail sebe, Google na počítači a ICSx⁵", () => {
    const h = teloStrankyKalendara({ ...v, telefon: "android" });
    expect(h).toContain("prosapiens.cz/k/AbC12345</div>");
    expect(h).toContain("mailto:?subject=");
    expect(h).toContain("Jste právě na počítači? Přidat přes Google Kalendář");
    expect(h).toContain("at.bitfire.icsdroid");
    expect(h).not.toContain("Odstranit upozornění");
  });
  it("adresa pustí len dve voľby", () => {
    expect(telefonZAdresy("android")).toBe("android");
    expect(telefonZAdresy("iphone")).toBe("iphone");
    expect(telefonZAdresy("<script>")).toBe(null);
    expect(telefonZAdresy(null)).toBe(null);
  });
});
