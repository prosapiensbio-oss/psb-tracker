import { describe, expect, test } from "bun:test";

import { jeFioCerstve, kedyFio, vetaFio } from "./fioStav";

const TERAZ = new Date("2026-11-01T09:00:00Z"); // 10:00 v Prahe

describe("čerstvosť stiahnutia z Fio", () => {
  test("nočný beh z dnešného rána je čerstvý — výzva netreba", () => {
    expect(jeFioCerstve({ stiahnute: "2026-11-01T04:10:04Z" }, TERAZ)).toBe(true);
  });
  test("včerajší nočný beh ešte tiež (beh mohol prísť neskôr)", () => {
    expect(jeFioCerstve({ stiahnute: "2026-10-31T04:11:01Z" }, TERAZ)).toBe(true);
  });
  test("dva dni staré nie je čerstvé", () => {
    expect(jeFioCerstve({ stiahnute: "2026-10-30T04:11:01Z" }, TERAZ)).toBe(false);
  });
  test("zlyhaný nočný beh nie je čerstvý, aj keď ručné stiahnutie bolo dnes", () => {
    expect(jeFioCerstve({ stiahnute: "2026-11-01T08:00:00Z", nocnyChyba: { kedy: "2026-11-01T04:10:00Z", chyba: "x" } }, TERAZ)).toBe(false);
  });
  test("bez záznamu nie je čerstvé", () => {
    expect(jeFioCerstve({}, TERAZ)).toBe(false);
  });
});

describe("čas podľa Prahy", () => {
  test("dnes a čas v pražskom pásme, nie UTC", () => {
    expect(kedyFio("2026-11-01T04:10:04Z", TERAZ)).toBe("dnes 5:10");
  });
  test("polnoc: 23:30 UTC je v Prahe už ďalší deň", () => {
    expect(kedyFio("2026-10-31T23:30:00Z", TERAZ)).toBe("dnes 0:30");
  });
  test("včera a staršie dátumom", () => {
    expect(kedyFio("2026-10-31T04:10:00Z", TERAZ)).toBe("včera 5:10");
    expect(kedyFio("2026-10-28T04:10:00Z", TERAZ)).toBe("28. 10. 5:10");
  });
});

describe("veta", () => {
  test("hovorí, že to bol nočný beh", () => {
    expect(vetaFio({ stiahnute: "2026-11-01T04:10:04Z", stiahnuteKto: "plánovač" }, TERAZ)).toBe("Z banky stiahnuté dnes 5:10 (nočný beh)");
  });
  test("zlyhanie je vo vete aj s dôvodom", () => {
    expect(vetaFio({ stiahnute: "2026-10-28T04:10:00Z", nocnyChyba: { kedy: "2026-11-01T04:10:00Z", chyba: "Token neplatí" } }, TERAZ))
      .toBe("Z banky stiahnuté 28. 10. 5:10. Nočný beh dnes 5:10 zlyhal: Token neplatí");
  });
});
