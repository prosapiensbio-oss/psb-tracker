import { describe, expect, it } from "bun:test";

import { cenaPoZlave, katalogovaCena, satsText, satsZaCzk } from "./lightning";

describe("zľava pri platbe bitcoinom", () => {
  it("počíta sa z ceny balíčka a zaokrúhľuje nahor", () => {
    // Jerry, 5. 10. 2026: od 2025 je prvá platba 20 %, každá ďalšia 5 %.
    expect(cenaPoZlave(6990, 5)).toBe(6641);   // Gažo, Vopalenský…
    expect(cenaPoZlave(6990, 10)).toBe(6291);  // Kalmus, Krčmár
    expect(cenaPoZlave(6990, 30)).toBe(4893);  // Knapčok: 10 % bitcoin + 20 % kamarát
    expect(cenaPoZlave(7790, 20)).toBe(6232);  // prvá platba nového klienta
  });

  it("bez zľavy sa cena nemení a nezmysly sa orežú", () => {
    expect(cenaPoZlave(6990)).toBe(6990);
    expect(cenaPoZlave(6990, null)).toBe(6990);
    expect(cenaPoZlave(6990, 0)).toBe(6990);
    expect(cenaPoZlave(6990, 300)).toBe(0);
  });
});

describe("koruny na satoshi", () => {
  it("zaokrúhľuje NAHOR — nižšia suma by znamenala nedoplatok", () => {
    // 9 041 000 Kč za BTC, balíček 6 641 Kč.
    expect(satsZaCzk(6641, 9_041_000)).toBe(73455);
    expect(satsZaCzk(1, 100_000_000)).toBe(1);
  });

  it("bez kurzu alebo bez sumy nevymýšľa číslo", () => {
    expect(satsZaCzk(6990, 0)).toBe(null);
    expect(satsZaCzk(0, 9_041_000)).toBe(null);
  });

  it("satoshi sa píšu po tisícoch", () => {
    expect(satsText(73455)).toBe("73 455");
    expect(satsText(1461288)).toBe("1 461 288");
  });
});

describe("základ pre zľavu je cenník, nie zaplatená suma", () => {
  it("nájde katalógovú cenu podľa názvu z PTmindera", () => {
    // Gažo má v PTminderi 20 092,50 Kč — to je 21 150 po jeho 5 %. Keby sa
    // zľava počítala z nej, dala by sa druhýkrát (Jerry, 5. 10. 2026).
    expect(katalogovaCena("OFF - 18 hodín offline")).toBe(21150);
    expect(katalogovaCena("OFF - 6h S viazanostou")).toBe(6990);
    expect(katalogovaCena("ON - 6h S viazanostou")).toBe(5640);
    expect(cenaPoZlave(katalogovaCena("OFF - 18 hodín offline")!, 5)).toBe(20093);
  });

  it("čo v cenníku nie je, nemá základ — a zľava sa radšej nedá", () => {
    expect(katalogovaCena("EXKLUZIVNÍ PLÁN")).toBe(null);
    expect(katalogovaCena("Doplnenie členstva")).toBe(null);
    expect(katalogovaCena("")).toBe(null);
  });
});
