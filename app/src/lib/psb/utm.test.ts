import { describe, expect, it } from "bun:test";

import { klucKampane, slug, znackovanyOdkaz } from "./utm";

describe("slug", () => {
  it("zbaví názov diakritiky a medzier", () => {
    expect(slug("Úvodní trénink — září")).toBe("uvodni-trenink-zari");
  });

  it("nenechá spojovník na kraji", () => {
    expect(slug("  Dýchání!  ")).toBe("dychani");
    expect(slug("")).toBe("");
  });
});

describe("znackovanyOdkaz", () => {
  it("Meta dostane zdroj, médium aj kampaň", () => {
    expect(znackovanyOdkaz("https://www.prosapiens.cz/uvodni-trenink/", "meta", "Úvodní trénink září"))
      .toBe("https://www.prosapiens.cz/uvodni-trenink/?utm_source=meta&utm_medium=paid&utm_campaign=uvodni-trenink-zari");
  });

  it("mail má vlastný zdroj — inak by splynul s reklamou", () => {
    expect(znackovanyOdkaz("https://www.prosapiens.cz/vysledky/", "mail", "srpen"))
      .toBe("https://www.prosapiens.cz/vysledky/?utm_source=mailer&utm_medium=email&utm_campaign=srpen");
  });

  it("Google odkaz nedostane — značkuje si sám", () => {
    // Ručné utm_ vie prebiť automatické značkovanie (gclid) a z jedného
    // zdroja pravdy sa stanú dva.
    expect(znackovanyOdkaz("https://www.prosapiens.cz/uvodni-trenink/", "google", "test")).toBeNull();
  });

  it("bez názvu kampane je odkaz stále platný", () => {
    expect(znackovanyOdkaz("https://www.prosapiens.cz/faq/", "meta", ""))
      .toBe("https://www.prosapiens.cz/faq/?utm_source=meta&utm_medium=paid");
  });

  it("dvojité značkovanie nevyrobí dva odkazy na to isté", () => {
    const raz = znackovanyOdkaz("https://www.prosapiens.cz/faq/", "meta", "test");
    expect(znackovanyOdkaz(raz || "", "meta", "test")).toBe(raz);
  });

  it("nezmyselný vstup nevyrobí odkaz", () => {
    expect(znackovanyOdkaz("", "meta", "x")).toBeNull();
    expect(znackovanyOdkaz("javascript:alert(1)", "meta", "x")).toBeNull();
    expect(znackovanyOdkaz("toto nie je adresa", "meta", "x")).toBeNull();
  });
});

describe("klucKampane", () => {
  it("slug v adrese sa páruje s menom kampane z Mety", () => {
    // Presne tá dvojica, ktorá sa do 19. 10. 2026 nespárovala nikdy.
    expect(klucKampane("psb-2026-09-uvodni-trenink-navstevy-grafika-a"))
      .toBe(klucKampane("PSB 2026-09 — úvodní trénink — návštěvy (grafika A)"));
  });

  it("nezlúči kampane, ktoré sa líšia číslom", () => {
    expect(klucKampane("IG_Reels_2025_1")).not.toBe(klucKampane("IG_Reels_2025_10"));
  });

  it("prázdne meno dá prázdny kľúč", () => {
    expect(klucKampane("")).toBe("");
    expect(klucKampane("   ")).toBe("");
  });
});
