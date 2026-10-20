import { describe, expect, test } from "bun:test";
import { chybaZdroja, NEDOKONCENE, stiahniIcal, vyberZdroj, zdrojNaDobeh } from "./kalendarZdroje";

describe("vyberZdroj — rotácia podľa pokusu", () => {
  test("scenár 10.–13. 9. 2026: padajúci Jerry nesmie blokovať Terezku", () => {
    const zdroje = [
      // Jerry: posledný ÚSPECH starý, ale práve sa o neho pokúšalo (a zomrelo).
      { trener: "Jerry", posledne_ok: "2026-09-10T00:00:18Z", posledny_pokus: "2026-09-13T18:00:00Z" },
      { trener: "Terezka", posledne_ok: "2026-09-12T15:00:00Z", posledny_pokus: "2026-09-13T15:00:00Z" },
    ];
    expect(vyberZdroj(zdroje)?.trener).toBe("Terezka");
  });

  test("zdroj bez jediného pokusu ide prvý", () => {
    expect(vyberZdroj([{ trener: "Jerry", posledny_pokus: "2026-09-13T00:00:00Z" }, { trener: "Terezka", posledny_pokus: null }])?.trener).toBe("Terezka");
  });

  test("žiadaný tréner má prednosť; neznámy nič nevráti", () => {
    const z = [{ trener: "Jerry", posledny_pokus: null }, { trener: "Terezka", posledny_pokus: null }];
    expect(vyberZdroj(z, "Jerry")?.trener).toBe("Jerry");
    expect(vyberZdroj(z, "Matyas")).toBeUndefined();
  });
});

describe("chybaZdroja — beh, ktorý zomrel bez zápisu chyby", () => {
  const teraz = Date.parse("2026-09-13T18:10:00Z");
  const pokus = { kedy: "2026-09-13T18:00:00Z", ok: 0, chyba: `${NEDOKONCENE} — beh sa neukončil` };

  test("nedokončený pokus starší než pár minút sa ohlási", () => {
    const c = chybaZdroja({ posledne_ok: "2026-09-10T00:00:18Z", posledna_chyba: null }, pokus, teraz);
    expect(c).toContain("nedokončilo");
    expect(c).toContain("pripájať ho netreba");
  });

  test("beh, ktorý práve prebieha, nie je chyba", () => {
    expect(chybaZdroja({ posledne_ok: "2026-09-10T00:00:18Z", posledna_chyba: null }, pokus, Date.parse("2026-09-13T18:00:40Z"))).toBeNull();
  });

  test("úspech po pokuse ho ruší", () => {
    expect(chybaZdroja({ posledne_ok: "2026-09-13T18:00:30Z", posledna_chyba: null }, pokus, teraz)).toBeNull();
  });

  test("skutočná zapísaná chyba (timeout, 429) sa ukáže", () => {
    const s = { kedy: "2026-09-13T18:00:00Z", ok: 0, chyba: "HTTP 429" };
    expect(chybaZdroja({ posledne_ok: "2026-09-12T00:00:00Z", posledna_chyba: "HTTP 429" }, s, teraz)).toContain("HTTP 429");
    const t = { kedy: "2026-09-13T18:00:00Z", ok: 0, chyba: "The operation timed out" };
    expect(chybaZdroja({ posledne_ok: "2026-09-12T00:00:00Z", posledna_chyba: t.chyba }, t, teraz)).toBe(t.chyba);
  });

  test("bez snímok vráti zapísanú chybu", () => {
    expect(chybaZdroja({ posledne_ok: null, posledna_chyba: null }, null, teraz)).toBeNull();
  });
});

describe("stiahniIcal — Google občas odmietne (HTTP 429)", () => {
  const odpovede = (...kody: number[]) => {
    const volania: number[] = [];
    const fetchFn = async () => {
      const k = kody[volania.length] ?? 200;
      volania.push(k);
      return new Response(k === 200 ? "BEGIN:VCALENDAR" : "", { status: k });
    };
    return { fetchFn, volania };
  };
  const pauzy: number[] = [];
  const cakaj = async (ms: number) => { pauzy.push(ms); };

  test("po odmietnutí skúsi znova a vráti kalendár", async () => {
    const o = odpovede(429, 200);
    expect(await stiahniIcal("u", { fetchFn: o.fetchFn, cakaj })).toBe("BEGIN:VCALENDAR");
    expect(o.volania).toEqual([429, 200]);
  });

  test("tri odmietnutia za sebou = chyba s počtom", async () => {
    const o = odpovede(429, 429, 503);
    await expect(stiahniIcal("u", { fetchFn: o.fetchFn, cakaj })).rejects.toThrow("HTTP 503 (3× za sebou)");
    expect(o.volania.length).toBe(3);
  });

  test("zlá adresa (404) sa neopakuje", async () => {
    const o = odpovede(404);
    await expect(stiahniIcal("u", { fetchFn: o.fetchFn, cakaj })).rejects.toThrow(/^HTTP 404$/);
    expect(o.volania.length).toBe(1);
  });
});

describe("chybaZdroja — odmietnutie Googlom", () => {
  const teraz = Date.parse("2026-10-20T15:05:00Z");
  test("pri čerstvých dátach nie je chyba", () => {
    expect(chybaZdroja({ posledne_ok: "2026-10-20T09:00:10Z", posledna_chyba: "HTTP 429" }, null, teraz)).toBeNull();
  });
  test("po dni sa ohlási s vysvetlením", () => {
    const c = chybaZdroja({ posledne_ok: "2026-10-19T09:00:10Z", posledna_chyba: "HTTP 429 (3× za sebou)" }, null, teraz);
    expect(c).toContain("Google opakovane odmieta");
  });
  test("iná chyba sa ukáže hneď", () => {
    expect(chybaZdroja({ posledne_ok: "2026-10-20T09:00:10Z", posledna_chyba: "HTTP 404" }, null, teraz)).toBe("HTTP 404");
  });
});

describe("zdrojNaDobeh — hodinový dobeh po zlyhaní", () => {
  const teraz = Date.parse("2026-10-20T16:30:00Z");
  test("berie len zlyhaný zdroj staršieho pokusu", () => {
    const z = [
      { trener: "Terezka", posledny_pokus: "2026-10-20T16:20:00Z", posledny_ok: 1 },
      { trener: "Jerry", posledny_pokus: "2026-10-20T15:00:00Z", posledny_ok: 0 },
    ];
    expect(zdrojNaDobeh(z, teraz)?.trener).toBe("Jerry");
  });
  test("keď je všetko v poriadku, nerobí nič", () => {
    expect(zdrojNaDobeh([{ trener: "Jerry", posledny_pokus: "2026-10-20T15:00:00Z", posledny_ok: 1 }], teraz)).toBeUndefined();
  });
  test("čerstvý pokus (ešte môže bežať) nechá tak", () => {
    expect(zdrojNaDobeh([{ trener: "Jerry", posledny_pokus: "2026-10-20T16:10:00Z", posledny_ok: 0 }], teraz)).toBeUndefined();
  });
});
