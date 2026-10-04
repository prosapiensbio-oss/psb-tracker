import { describe, expect, it } from "bun:test";

import { klucNezaplateneho, zostatokKokpitu, type BalicekPreZostatok } from "./zostatokKokpitu";

const b = (od: string, doDna: string | null, hodiny: number | null, nazov = "OFF - 6h", extra: Partial<BalicekPreZostatok> = {}): BalicekPreZostatok =>
  ({ klient: "Vitezslav Papiež", nazov, hodiny, platnostOd: od, platnostDo: doDna, ...extra });
const s = (d: string, duration = 60) => ({ client: "Vitezslav Papiež", date: `${d}T00:00:00.000Z`, duration });

describe("zostatokKokpitu", () => {
  it("nový balíček zapísaný len v Kokpite karta vidí (Vítězslav, 29. 9.)", () => {
    const z = zostatokKokpitu(
      [b("2026-08-27", "2026-09-26", 6, "OFF - 6h S viazanostou"), b("2026-09-29", "2026-10-28", 6, "Předplatné 6 h")],
      "Vitezslav Papiež", [s("2026-09-15"), s("2026-09-29")], "2026-09-29",
    );
    expect(z).toMatchObject({ zostatok: 5, spolu: 6, minute: 1, nazov: "Předplatné 6 h" });
  });

  it("bez aktívneho balíčka je to null, nie nula", () => {
    expect(zostatokKokpitu([b("2026-08-27", "2026-09-26", 6)], "Vitezslav Papiež", [], "2026-10-02")).toBeNull();
  });

  it("dva prekrývajúce sa balíčky sa sčítajú a odpočítava sa od staršieho", () => {
    const z = zostatokKokpitu([b("2026-08-06", "2026-09-30", 8), b("2026-09-15", "2026-11-09", 8)], "Vitezslav Papiež",
      [s("2026-08-10"), s("2026-09-01"), s("2026-09-20")], "2026-09-29");
    expect(z).toMatchObject({ spolu: 16, minute: 3, zostatok: 13 });
  });

  it("90 minút je 1,5 h; tréning zadarmo sa neodpočíta", () => {
    const z = zostatokKokpitu([b("2026-10-01", null, 6)], "Vitezslav Papiež", [s("2026-10-02", 90), s("2026-10-05")], "2026-10-06",
      new Set(["vitezslav papiez|2026-10-05"]));
    expect(z?.minute).toBe(1.5);
    expect(z?.zostatok).toBe(4.5);
  });

  it("kotva: tréning z dňa naliatia sa neodpočíta — PTminder ho v zostatku má", () => {
    const z = zostatokKokpitu([b("2026-09-20", null, 50, "ONE YEAR", { kotva: true })], "Vitezslav Papiež",
      [s("2026-09-20"), s("2026-09-22")], "2026-09-29");
    expect(z).toMatchObject({ minute: 1, zostatok: 49 });
  });

  it("nad rámec balíčka sa nestráca — zostatok ide pod nulu a nadRamec to isté hovorí kladne", () => {
    const z = zostatokKokpitu([b("2026-10-01", null, 1)], "Vitezslav Papiež", [s("2026-10-02"), s("2026-10-05")], "2026-10-06");
    expect(z).toMatchObject({ zostatok: -1, nadRamec: 1 });
  });

  it("paušál hodiny nepočíta", () => {
    expect(zostatokKokpitu([b("2026-09-01", null, null, "DIAMOND")], "Vitezslav Papiež", [s("2026-09-02")], "2026-09-29")?.pausal).toBe(true);
  });

  it("zrušený balíček sa neráta", () => {
    expect(zostatokKokpitu([b("2026-09-01", null, 6, "X", { zruseneAt: "2026-09-29" })], "Vitezslav Papiež", [], "2026-09-29")).toBeNull();
  });
});

describe("nezaplatený balíček je nula (Jerry, 3. 10. 2026)", () => {
  const h = (od: string, doDna: string, hodiny = 6) => ({ klient: "Lukas Hanus", nazov: "OFF - 6h S viazanostou", hodiny, platnostOd: od, platnostDo: doDna });
  const t = (d: string) => ({ client: "Lukas Hanus", date: `${d}T00:00:00.000Z`, duration: 60 });
  const treningy = ["2026-09-09", "2026-09-14", "2026-09-16", "2026-09-21", "2026-09-25", "2026-09-29", "2026-10-02"].map(t);

  it("Hanus 3. 10.: zaplatené 6 h od 9. 9., sedem tréningov, druhé členstvo s otvoreným poplatkom → −1", () => {
    const z = zostatokKokpitu([h("2026-09-09", "2026-10-08"), h("2026-10-02", "2026-11-01")], "Lukas Hanus", treningy, "2026-10-03",
      new Set(), new Set([klucNezaplateneho("Lukáš Hanus", "2026-10-02")]));
    expect(z).toMatchObject({ zostatok: -1, nadRamec: 1, spolu: 6, nezaplateneHodin: 6, minute: 7 });
  });

  it("po zaplatení to isté členstvo dáva hodiny: 12 − 7 = 5", () => {
    const z = zostatokKokpitu([h("2026-09-09", "2026-10-08"), h("2026-10-02", "2026-11-01")], "Lukas Hanus", treningy, "2026-10-03");
    expect(z).toMatchObject({ zostatok: 5, nadRamec: 0, spolu: 12, nezaplateneHodin: 0 });
  });

  it("po 8. 10. (staré skončilo) mínus zostáva, kým sa nezaplatí: −1 → po platbe 5", () => {
    const neskor = [...treningy];
    const nezaplatene = new Set([klucNezaplateneho("Lukas Hanus", "2026-10-02")]);
    expect(zostatokKokpitu([h("2026-09-09", "2026-10-08"), h("2026-10-02", "2026-11-01")], "Lukas Hanus", neskor, "2026-10-09", new Set(), nezaplatene)?.zostatok).toBe(-1);
    expect(zostatokKokpitu([h("2026-09-09", "2026-10-08"), h("2026-10-02", "2026-11-01")], "Lukas Hanus", neskor, "2026-10-09")?.zostatok).toBe(5);
  });

  it("Šašinková: jediný balíček 8 h nezaplatený, tri tréningy → −3, názov členstva ostáva", () => {
    const z = zostatokKokpitu([{ klient: "Daniela Šašinkova", nazov: "OFF - 8 hodín offline", hodiny: 8, platnostOd: "2026-09-09", platnostDo: "2026-11-03" }],
      "Daniela Šašinkova", ["2026-09-16", "2026-09-23", "2026-10-01"].map((d) => ({ client: "Daniela Šašinkova", date: `${d}T00:00:00.000Z`, duration: 60 })),
      "2026-10-03", new Set(), new Set([klucNezaplateneho("Daniela Šašinkova", "2026-09-09")]));
    expect(z).toMatchObject({ zostatok: -3, spolu: 0, nezaplateneHodin: 8, nazov: "OFF - 8 hodín offline" });
  });
});
