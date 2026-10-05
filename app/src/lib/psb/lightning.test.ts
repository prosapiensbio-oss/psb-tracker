import { describe, expect, it } from "bun:test";

import { cenaPoZlave, satsText, satsZaCzk } from "./lightning";

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
