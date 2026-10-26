import { describe, expect, it } from "bun:test";

import { obdobieRezervy, predosleObdobie, rezervaZaObdobie } from "./rezervaOdlozenie";

describe("rezerva firmy 3. a 18. (Jerry, 26. 10. 2026)", () => {
  it("18. a neskôr pokrýva 3. – 17.", () => {
    expect(obdobieRezervy("2026-10-26")).toEqual({ splatne: "2026-10-18", od: "2026-10-03", do: "2026-10-17" });
    expect(obdobieRezervy("2026-10-18")).toEqual({ splatne: "2026-10-18", od: "2026-10-03", do: "2026-10-17" });
  });
  it("3. – 17. pokrýva 18. predošlého mesiaca až 2.", () => {
    expect(obdobieRezervy("2026-11-03")).toEqual({ splatne: "2026-11-03", od: "2026-10-18", do: "2026-11-02" });
    expect(obdobieRezervy("2027-01-10")).toEqual({ splatne: "2027-01-03", od: "2026-12-18", do: "2027-01-02" });
  });
  it("1. a 2. ešte platí 18. predošlého mesiaca", () => {
    expect(obdobieRezervy("2026-11-02")).toEqual({ splatne: "2026-10-18", od: "2026-10-03", do: "2026-10-17" });
    expect(obdobieRezervy("2027-01-01")).toEqual({ splatne: "2026-12-18", od: "2026-12-03", do: "2026-12-17" });
  });
  it("predošlé obdobie nadväzuje bez diery", () => {
    expect(predosleObdobie(obdobieRezervy("2026-11-05"))).toEqual({ splatne: "2026-10-18", od: "2026-10-03", do: "2026-10-17" });
    expect(predosleObdobie(obdobieRezervy("2026-10-20"))).toEqual({ splatne: "2026-10-03", od: "2026-09-18", do: "2026-10-02" });
  });
  it("5 % zo všetkých platieb v období, vrátenie ich znižuje, okraje sa počítajú", () => {
    const platby = [
      { date: "2026-10-02T00:00:00.000Z", amount: 7790 },
      { date: "2026-10-03T00:00:00.000Z", amount: 6990 },
      { date: "2026-10-17T00:00:00.000Z", amount: 1100 },
      { date: "2026-10-10", amount: -2000 },
      { date: "2026-10-18", amount: 9999 },
    ];
    const r = rezervaZaObdobie(platby, obdobieRezervy("2026-10-20"));
    expect(r).toMatchObject({ prijate: 6090, pocet: 3, suma: 305 });
  });
});
