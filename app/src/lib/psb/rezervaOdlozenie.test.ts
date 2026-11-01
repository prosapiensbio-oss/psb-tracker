import { describe, expect, it } from "bun:test";

import { obdobieRezervy, predosleObdobie, rezervaZaObdobie } from "./rezervaOdlozenie";
import { odlozenieTeraz } from "./rezervaOdlozenie";

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

describe("odlozenieTeraz — jedno číslo pre register aj Jarvisa", () => {
  // 3. 11.: obdobie 18. 10.–2. 11.; predošlé (splatné 18. 10.) je 3.–17. 10.
  const platby = [{ date: "2026-10-05", amount: 20000 }, { date: "2026-10-25", amount: 10000 }];

  it("neodložené predošlé obdobie sa pripočíta", () => {
    const r = odlozenieTeraz(platby, [], {}, "2026-11-03");
    expect(r.teraz.suma).toBe(500);
    expect(r.dlzne?.suma).toBe(1000);
    expect(r.zostava).toBe(1500);
  });

  it("odpoveď v registri predošlé obdobie uzavrie", () => {
    expect(odlozenieTeraz(platby, [], { "rezerva|2026-10-18": true }, "2026-11-03").zostava).toBe(500);
  });

  it("prevod v predošlom období ho zníži, prevod po splatnosti zníži zvyšok", () => {
    expect(odlozenieTeraz(platby, [{ date: "2026-10-20", amount: -400 }], {}, "2026-11-03").zostava).toBe(1100);
    expect(odlozenieTeraz(platby, [{ date: "2026-11-03", amount: -1500 }], {}, "2026-11-03").zostava).toBe(0);
  });

  it("pred prvým termínom sa nepýta nič", () => {
    expect(odlozenieTeraz([{ date: "2026-10-01", amount: 20000 }], [], {}, "2026-10-05").zostava).toBe(0);
  });
});
