import { describe, expect, it } from "bun:test";

import { hodnotaKlienta, koncentracia, obnovaBalickov, odchody, prezitie100, retencia6 } from "./metrikyKlientov";

describe("metriky klientov", () => {
  it("obnova: nový balíček alebo platba v okne; Gerich s platbou 30. 9. obnovil", () => {
    const b = (klient: string, od: string, doD: string, nazov = "6h Balíček") => ({ klient, nazov, platnost_od: od, platnost_do: doD, zrusene_at: null });
    const balicky = [
      b("Jakub Gerich", "2026-08-03", "2026-09-02"), b("Jakub Gerich", "2026-10-07", "2026-11-06"),
      b("Robin Martinek", "2026-08-03", "2026-09-02"), b("Robin Martinek", "2026-09-21", "2026-10-20"),
      b("Roman Jakubiček", "2026-08-29", "2026-09-28"),
      b("Albert Matl", "2026-09-14", "2026-09-14", "Úvodní trénink"),
    ];
    const platby = [{ klient: "Jakub Gerich", datum: "2026-09-30", suma: 15580 }, { klient: "Roman Jakubiček", datum: "2026-09-30", suma: 200 }];
    const o = obnovaBalickov(balicky, platby, "2026-09");
    expect(o.skoncilo).toBe(3);
    expect(o.obnovene).toBe(2);
    expect(o.bezObnovy).toEqual([{ klient: "Roman Jakubiček", do: "2026-09-28" }]);
  });

  it("prežitie 100 dní, retencia 6 mes., odchody", () => {
    const s = (client: string, date: string) => ({ client, date });
    const sedenia = [
      s("A", "2026-05-05"), s("A", "2026-09-10"),
      s("B", "2026-05-20"), s("B", "2026-06-10"),
      s("C", "2026-03-01"), s("C", "2026-08-01"), s("C", "2026-09-01"),
      s("D", "2026-03-02"), s("D", "2026-08-02"),
    ];
    expect(prezitie100(sedenia, "2026-09")).toEqual({ kohorta: "2026-05", novi: 2, ostali: 1 });
    expect(retencia6(sedenia, "2026-09")).toEqual({ kohorta: 2, ostali: 1 });
    expect(odchody(sedenia, "2026-09")).toEqual({ pred: 2, odisli: 1 });
  });

  it("koncentrácia a hodnota klienta", () => {
    const p = (klient: string, datum: string, suma: number) => ({ klient, datum, suma });
    const k = koncentracia([p("A", "2026-09-01", 50), p("B", "2026-09-02", 30), p("C", "2026-09-03", 10), p("D", "2026-09-04", 5), p("E", "2026-09-05", 5)], ["2026-09"]);
    expect(k.topKlient).toEqual({ klient: "A", podiel: 50 });
    expect(k.top20).toBe(50);
    const h = hodnotaKlienta([{ client: "X", date: "2025-03-01" }, { client: "X", date: "2025-09-01" }, { client: "Y", date: "2026-09-20" }], [p("X", "2025-03-01", 7000), p("X", "2025-06-01", 7000), p("Y", "2026-09-01", 9000)], "2026-09-30");
    expect(h.pocet).toBe(1);
    expect(h.priemer).toBe(14000);
    expect(Math.round(h.mesiacov)).toBe(6);
  });
});
