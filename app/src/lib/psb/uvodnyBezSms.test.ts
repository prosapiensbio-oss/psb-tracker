import { describe, expect, test } from "bun:test";
import { menoZAuditu, uvodneBezSms } from "./uvodnyBezSms";
import { normName } from "./format";

const TERAZ = "2026-11-24T11:20";
// Skutočný prípad 24. 11. 2026: úvodný v Terezkinom kalendári bez mapovania mena.
const smidova = { zaciatok: "2026-11-27T15:00", klient: null, typ: "uvodny", nazov: "Tereza Šmídová-úvodná diagnostika", trener: "Terezka", zmizlaAt: null };

describe("úvodný bez SMS", () => {
  test("Šmídová: meno z názvu, tri dni dopredu, Terezkina", () => {
    const r = uvodneBezSms([smidova], new Set(), new Set(), TERAZ);
    expect(r).toEqual([{ kluc: `uvodny-sms|${normName("Tereza Šmídová")}|2026-11-27`, meno: "Tereza Šmídová", trener: "Terezka", kedy: "2026-11-27T15:00", dni: 3 }]);
  });

  test("odoslaná SMS (audit) ju zhasne", () => {
    expect(uvodneBezSms([smidova], new Set([normName(menoZAuditu("Tereza Šmídová · +420604423148"))]), new Set(), TERAZ)).toEqual([]);
  });

  test("čerstvý dopyt „nový“ to rieši sám — druhá notifikácia nevznikne", () => {
    expect(uvodneBezSms([smidova], new Set(), new Set([normName("Tereza Šmídová")]), TERAZ)).toEqual([]);
  });

  test("zrušený, odohraný, ďaleký a bežný tréning sa nehlásia", () => {
    const r = uvodneBezSms([
      { ...smidova, zmizlaAt: "2026-11-24T09:00:00Z" },
      { ...smidova, zaciatok: "2026-11-24T08:00" },
      { ...smidova, zaciatok: "2026-12-05T10:00" },
      { ...smidova, typ: "trening", klient: "Jakub Gerich", nazov: "Jakub Gerich" },
    ], new Set(), new Set(), TERAZ);
    expect(r).toEqual([]);
  });

  test("úvodný bez čitateľného mena nehlási — to je iná notifikácia", () => {
    expect(uvodneBezSms([{ ...smidova, nazov: "úvodný" }], new Set(), new Set(), TERAZ)).toEqual([]);
  });
});
