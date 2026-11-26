import { describe, expect, test } from "bun:test";
import { citajPlanovanePonuky, planovanePonukyNaDnes, pridajPlan } from "./planovanaPonuka";

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

describe("pridanie z obrazovky", () => {
  const T = "2026-11-26T21:00:00Z";
  test("nový plán, typ a tréner sa uložia; hotovo sa neukladá", () => {
    const r = pridajPlan([], { kontakt: " Leon  Box ", den: "2026-11-27", uvodny: true, trener: "Jerry", kto: "Jerry" }, "2026-11-26", T, "a1");
    expect(r).toEqual([{ id: "a1", kontakt: "Leon Box", den: "2026-11-27", trener: "Jerry", uvodny: true, vytvorene: T, kto: "Jerry" }]);
  });
  test("deň v minulosti a chýbajúce meno sa odmietnu", () => {
    expect(pridajPlan([], { kontakt: "Leon Box", den: "2026-11-25", uvodny: true, trener: "Jerry" }, "2026-11-26", T, "a1")).toBe("Deň už bol.");
    expect(pridajPlan([], { kontakt: " ", den: "2026-11-27", uvodny: true, trener: "Jerry" }, "2026-11-26", T, "a1")).toBe("Chýba komu.");
  });
  test("ten istý človek na ten istý deň je jedna pripomienka; bežné termíny majú vlastný nadpis", () => {
    const r1 = pridajPlan([], { kontakt: "Jan Kral", den: "2026-11-28", uvodny: false, trener: "Jerry" }, "2026-11-26", T, "a1") as never[];
    const r2 = pridajPlan(r1, { kontakt: "Jan Kral", den: "2026-11-28", uvodny: false, trener: "Jerry" }, "2026-11-26", T, "a2");
    expect(r2).toHaveLength(1);
    const [p] = planovanePonukyNaDnes(r2 as never, "2026-11-28");
    expect(p.nadpis).toBe("Poslať ponuku termínov — Jan Kral");
    expect(p.ciel).toBe("kalendar|terminy|k:Jan Kral|trening");
  });
});
