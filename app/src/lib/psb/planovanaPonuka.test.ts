import { describe, expect, test } from "bun:test";
import { citajPlanovanePonuky, planovanePonukyNaDnes } from "./planovanaPonuka";

const leon = { id: "leon-uvodny", kontakt: "Leon Box", telefon: "+420 776 192 222", den: "2026-11-27", trener: "Jerry", poznamka: "Chrbát — chce prísť na úvodný", vytvorene: "2026-11-26T10:00:00Z" };

describe("naplánovaná ponuka úvodnej lekcie", () => {
  test("deň vopred mlčí, v deň príde s cieľom do Termínov", () => {
    expect(planovanePonukyNaDnes([leon], "2026-11-26")).toEqual([]);
    const [p] = planovanePonukyNaDnes([leon], "2026-11-27");
    expect(p.kluc).toBe("planovana-ponuka|leon-uvodny");
    expect(p.nadpis).toBe("Poslať ponuku úvodnej lekcie — Leon Box");
    expect(p.ciel).toBe("kalendar|terminy|k:Leon Box|uvodny");
    expect(p.trener).toBe("Jerry");
  });
  test("po odoslaní ponuky zhasne, zmeškaná ostáva a povie kedy mala byť", () => {
    expect(planovanePonukyNaDnes([{ ...leon, hotovo: true }], "2026-11-27")).toEqual([]);
    expect(planovanePonukyNaDnes([leon], "2026-11-29")[0].detail).toContain("Naplánované na 27. 11.");
  });
  test("poškodený zápis nezhodí appku", () => {
    expect(citajPlanovanePonuky("{x")).toEqual([]);
    expect(citajPlanovanePonuky(JSON.stringify([leon, { id: 1 }]))).toHaveLength(1);
  });
});
