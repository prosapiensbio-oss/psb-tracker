import { describe, expect, it } from "bun:test";

import { jeKontrolaPenazi, jeReklamaDozoru, klucSuhrnuReklam } from "./kontrolaPenazi";

describe("kontrola peňazí ide do Workspace (Jerry, 27. 10. 2026)", () => {
  it("náklady, dvojité zápisy, pravidlá a príjmy áno; výpis z banky a bitcoin nie", () => {
    expect(jeKontrolaPenazi("naklad|vyskocil|apps|2026-09")).toBe(true);
    expect(jeKontrolaPenazi("pravidlo|najom pradlacka|spolocne.najom")).toBe(true);
    expect(jeKontrolaPenazi("dvojity|najom|2026-08")).toBe(true);
    expect(jeKontrolaPenazi("prijmy|2026-09")).toBe(true);
    expect(jeKontrolaPenazi("nezhody|2026-01|4")).toBe(true);
    expect(jeKontrolaPenazi("banka|zastarana")).toBe(false);
    expect(jeKontrolaPenazi("btc|nesedi|x")).toBe(false);
  });
});

describe("reklamy: jedna notifikácia na Dnes (Jerry, 27. 10. 2026)", () => {
  it("položky dozoru sa poznajú; súhrn nesie kľúče, takže nová položka ho vráti", () => {
    expect(jeReklamaDozoru("reklama|vyhodnot|123|2026-10-11")).toBe(true);
    expect(jeReklamaDozoru("reklamy-suhrn|x")).toBe(false);
    expect(klucSuhrnuReklam(["b", "a"])).toBe(klucSuhrnuReklam(["a", "b"]));
    expect(klucSuhrnuReklam(["a"])).not.toBe(klucSuhrnuReklam(["a", "b"]));
  });
});
