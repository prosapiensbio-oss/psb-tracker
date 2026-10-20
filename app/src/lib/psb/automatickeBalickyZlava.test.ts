// Bitcoinová zľava pri balíčku, ktorý vznikol sám (Jerry, 20. 10. 2026).
import { describe, expect, it } from "bun:test";

import { sBtcZlavou } from "./btcZlavaBalicka";

const navrh = (cena: number, cenaPoznamka?: string, nazov = "18h Balíček") => ({ nazov, cena, cenaPoznamka });

describe("sBtcZlavou", () => {
  it("Knapčok: cenník 21 150 Kč, −30 % → 14 805 Kč", () => {
    const n = sBtcZlavou(navrh(21150, "posledný stál 14805 Kč, navrhujem cenník"), { bitcoin: true, btcZlava: 30 });
    expect(n.cena).toBe(14805);
    expect(n.cenaPoznamka).toContain("30 % zľava za bitcoin");
  });
  it("„platí stále“ je už cena po zľave — druhýkrát sa nezľavuje", () => {
    expect(sBtcZlavou(navrh(8460, "platí stále 8460 Kč, cenník je 9400", "8h Balíček"), { bitcoin: true, btcZlava: 10 }).cena).toBe(8460);
  });
  it("klient, ktorý neplatí bitcoinom, alebo bez zľavy, ostáva na cenníku", () => {
    expect(sBtcZlavou(navrh(21150), { bitcoin: false, btcZlava: 30 }).cena).toBe(21150);
    expect(sBtcZlavou(navrh(21150), { bitcoin: true, btcZlava: 0 }).cena).toBe(21150);
    expect(sBtcZlavou(navrh(21150), null).cena).toBe(21150);
  });
  it("úvodný sa nezľavuje", () => {
    expect(sBtcZlavou(navrh(1100, undefined, "Úvodní trénink"), { bitcoin: true, btcZlava: 30 }).cena).toBe(1100);
  });
});
