import { describe, expect, it } from "bun:test";

import { pokracovaniePredplatneho, type BalicekPredplatneho } from "./pokracovaniePredplatneho";

const R = "Robin Martinek";
const p = (od: string, doDna: string, hodiny = 6, extra: Partial<BalicekPredplatneho> = {}): BalicekPredplatneho =>
  ({ klient: R, nazov: "OFF - 6h S viazanostou", hodiny, platnostOd: od, platnostDo: doDna, cena: 6990, ...extra });
const t = (d: string) => ({ client: R, date: `${d}T00:00:00.000Z`, duration: 60 });

describe("předplatné pokračuje prvým tréningom po konci (Jerry, 22. a 25. 10. 2026)", () => {
  // Robin: 8 h (6 + 2 prenesené) 21. 9. – 20. 10., sedem tréningov → 1 h zostala.
  const robin = [p("2026-08-03", "2026-09-02"), p("2026-09-21", "2026-10-20", 8)];
  const treningy = ["2026-09-21", "2026-09-24", "2026-09-30", "2026-10-05", "2026-10-09", "2026-10-11", "2026-10-16"].map(t);
  const historia = [{ nazov: "OFF - 6h S viazanostou", od: "2026-06-29", do: "2026-07-28" }];

  const poKonci = [...treningy, t("2026-10-22")];

  it("Robin: nový mesiac od prvého tréningu 22. 10., 6 h a 1 h sa prenesie", () => {
    const n = pokracovaniePredplatneho(R, robin, historia, poKonci, "2026-10-22")!;
    expect(n).toMatchObject({ odDna: "2026-10-22", doDna: "2026-11-21", nazov: "6h Předplatné", hodiny: 6, cena: 6990, nevycerpane: 1, prenos: 1 });
    expect(n.zaciatokZavazku).toBe("2026-06-29");
  });

  it("po konci bez tréningu ešte nevzniká nič (Kalva 17. 10. nebol, prišiel 19. 10.)", () => {
    expect(pokracovaniePredplatneho(R, robin, historia, treningy, "2026-10-20")).toBeNull();
    expect(pokracovaniePredplatneho(R, robin, historia, treningy, "2026-10-21")).toBeNull();
  });

  it("tréning zadarmo mesiac nezačína", () => {
    const n = pokracovaniePredplatneho(R, robin, historia, [...poKonci, t("2026-10-21")], "2026-10-22", new Set(["martinek robin|2026-10-21", "robin martinek|2026-10-21"]));
    expect(n?.odDna).toBe("2026-10-22");
  });

  it("nad 2 h sa prenesú 2 (na tie má klient nárok), o zvyšku sa Kokpit pýta", () => {
    const n = pokracovaniePredplatneho(R, robin, historia, [...treningy.slice(0, 4), t("2026-10-22")], "2026-10-22")!;
    expect(n.nevycerpane).toBe(4);
    expect(n.prenos).toBe(2);
  });

  it("pravidlo A: minul skôr a ďalší mesiac už vznikol tréningom → nezakladá sa nič", () => {
    const skor = [...robin, p("2026-10-17", "2026-11-16", 6, { nazov: "6h Předplatné" })];
    expect(pokracovaniePredplatneho(R, skor, historia, treningy, "2026-10-22")).toBeNull();
  });

  it("prenesené hodiny v deň konca nebránia pokračovaniu (Kalva)", () => {
    const k = [...robin, { klient: R, nazov: "Prenesené hodiny", hodiny: 1, platnostOd: "2026-10-20", platnostDo: null }];
    expect(pokracovaniePredplatneho(R, k, historia, poKonci, "2026-10-22")?.odDna).toBe("2026-10-22");
  });

  it("po 6 mesiacoch pokračuje ďalší polrok (Jerry, 22. 10. 2026)", () => {
    const dlho = [{ nazov: "OFF - 6h S viazanostou", od: "2026-03-01", do: "2026-03-31" },
      { nazov: "OFF - 6h S viazanostou", od: "2026-04-01", do: "2026-04-30" },
      { nazov: "OFF - 6h S viazanostou", od: "2026-05-01", do: "2026-05-31" },
      { nazov: "OFF - 6h S viazanostou", od: "2026-06-01", do: "2026-07-01" },
      { nazov: "OFF - 6h S viazanostou", od: "2026-07-02", do: "2026-08-01" }];
    const b = [p("2026-08-02", "2026-09-01"), p("2026-09-02", "2026-10-01")];
    expect(pokracovaniePredplatneho(R, b, dlho, [t("2026-10-02")], "2026-10-03")).toMatchObject({ odDna: "2026-10-02", mesiac: 2, polrok: 2, zaciatokZavazku: "2026-03-01" });
  });

  it("kto po konci mesiac neprišiel, nepokračuje", () => {
    expect(pokracovaniePredplatneho(R, robin, historia, [...treningy, t("2026-11-25")], "2026-12-01")).toBeNull();
  });

  it("balíček (BEZ viazanosti) nepokračuje sám", () => {
    const b = [{ klient: R, nazov: "OFF - 6h BEZ viazanosti", hodiny: 6, platnostOd: "2026-08-19", platnostDo: "2026-10-13", cena: 7790 }];
    expect(pokracovaniePredplatneho(R, b, [], [], "2026-10-15")).toBeNull();
  });

  it("stála iná cena dvakrát po sebe sa drží", () => {
    const b = [p("2026-08-21", "2026-09-20", 6, { cena: 6500 }), p("2026-09-21", "2026-10-20", 6, { cena: 6500 })];
    expect(pokracovaniePredplatneho(R, b, [], [t("2026-10-21")], "2026-10-21")?.cena).toBe(6500);
  });
});
