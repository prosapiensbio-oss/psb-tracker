import { describe, expect, it } from "bun:test";

import { MEMBERSHIP_ORDER, membershipBucket } from "./compute";
import { MEMBERSHIP_COLORS } from "./theme";
import { nazovKategorie } from "./vzas";

describe("skupiny balíčkov z ostrých názvov", () => {
  const OCAKAVANE: [string, string][] = [
    ["OFF - 6h S viazanostou", "6h Předplatné"],
    ["ON - 6h S viazanostou", "6h Předplatné"],
    ["6h Předplatné", "6h Předplatné"],
    ["6h Předplatné online", "6h Předplatné"],
    ["Předplatné 6 h", "6h Předplatné"],
    ["OFF - 6h BEZ viazanosti", "6h Balíček"],
    ["6h Balíček", "6h Balíček"],
    ["8h Balíček", "8h Balíček"],
    ["OFF - 8 hodín offline", "8h Balíček"],
    ["18h Balíček", "18h Balíček"],
    ["OFF - 18 hodín offline", "18h Balíček"],
    ["1h Balíček", "1h Balíček"],
    ["OFF - 1 hodina offline", "1h Balíček"],
    ["ON - 6h BEZ viazanosti", "Online balíček"],
    ["6h Balíček online", "Online balíček"],
    ["ONE YEAR", "Ročné"],
    ["Doplnenie členstva", "Členstvo (bez balíčka hodín)"],
    ["SPECIAL 3", "Špeciál"],
    ["", "Bez balíčka"],
    ["DYNAMIKA", "Iné"],
  ];
  for (const [nazov, skupina] of OCAKAVANE) {
    it(`${nazov || "(prázdne)"} → ${skupina}`, () => expect(membershipBucket(nazov)).toBe(skupina));
  }

  it("každá skupina má poradie aj farbu a staré názvy sú preč", () => {
    for (const [, s] of OCAKAVANE) {
      expect(MEMBERSHIP_ORDER as readonly string[]).toContain(s);
      expect(MEMBERSHIP_COLORS[s]).toBeTruthy();
    }
    expect(MEMBERSHIP_ORDER.join(" ")).not.toMatch(/viazano|ONE YEAR/);
  });
});

describe("názov kategórie pre človeka", () => {
  it("žiadny surový kľúč z ostrých dát", () => {
    const zDat = [
      "vyplaty.jerry", "mimo", "fixne.apps.ai", "spolocne.Potraviny", "vyplaty.terezka", "fixne.apps.ine", "vyplaty",
      "fixne.prevadzka.statTerezka", "fixne.marketing.facebook", "variabilne.sluzby.ine", "variabilne.prevadzka2.drogeria",
      "fixne.prevadzka.najom", "vyplaty.delene", "presun", "variabilne.produkty.atipicke", "prijem.produkt", "prijem.ine",
      "fixne.prevadzka.splatkaJarek", "variabilne.sluzby.skolenie", "spolocne.Nájom 2",
    ];
    for (const k of zDat) {
      expect(nazovKategorie(k)).not.toBe(k);
      expect(nazovKategorie(k)).not.toMatch(/^(fixne|variabilne|vyplaty|spolocne|prijem)\./);
    }
  });
});
