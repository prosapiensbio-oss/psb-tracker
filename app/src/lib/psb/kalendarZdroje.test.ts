import { describe, expect, test } from "bun:test";
import { chybaZdroja, NEDOKONCENE, vyberZdroj } from "./kalendarZdroje";

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

  test("skutočná zapísaná chyba (timeout, 429) sa ukáže, ako je", () => {
    const s = { kedy: "2026-09-13T18:00:00Z", ok: 0, chyba: "HTTP 429" };
    expect(chybaZdroja({ posledne_ok: "2026-09-12T00:00:00Z", posledna_chyba: "HTTP 429" }, s, teraz)).toBe("HTTP 429");
  });

  test("bez snímok vráti zapísanú chybu", () => {
    expect(chybaZdroja({ posledne_ok: null, posledna_chyba: null }, null, teraz)).toBeNull();
  });
});
