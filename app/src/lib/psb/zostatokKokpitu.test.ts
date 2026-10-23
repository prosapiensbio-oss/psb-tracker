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

describe("odpočet po balíčkoch — skončenie platnosti nič nepreskupí (Fable, 22. 10. 2026)", () => {
  const v = (od: string, doDna: string | null, hodiny: number, nazov: string, extra: Partial<BalicekPreZostatok> = {}): BalicekPreZostatok =>
    ({ klient: "Martin Vaško", nazov, hodiny, platnostOd: od, platnostDo: doDna, ...extra });
  const t = (d: string) => ({ client: "Martin Vaško", date: `${d}T00:00:00.000Z`, duration: 60 });
  // Kotva 1 h k 20. 9., členstvo 6 h 27. 9.–25. 10., předplatné od 19. 10. nezaplatené.
  const balicky = [
    v("2026-09-20", null, 1, "Doplnenie členstva", { kotva: true }),
    v("2026-09-27", "2026-10-25", 6, "OFF - 6h S viazanostou"),
    v("2026-10-19", "2026-11-18", 6, "6h Předplatné"),
  ];
  const treningy = ["2026-09-23", "2026-09-27", "2026-09-29", "2026-10-01", "2026-10-08", "2026-10-11", "2026-10-16", "2026-10-19"].map(t);
  const nez = new Set([klucNezaplateneho("Martin Vaško", "2026-10-19")]);

  it("Vaško: −1 dnes aj po konci členstva 25. 10. (staré pravidlo dávalo −7)", () => {
    expect(zostatokKokpitu(balicky, "Martin Vaško", treningy, "2026-10-22", new Set(), nez)?.zostatok).toBe(-1);
    expect(zostatokKokpitu(balicky, "Martin Vaško", treningy, "2026-10-26", new Set(), nez)?.zostatok).toBe(-1);
  });

  it("po zaplatení předplatného: 6 − 1 = 5, aj po konci členstva", () => {
    expect(zostatokKokpitu(balicky, "Martin Vaško", treningy, "2026-10-26")?.zostatok).toBe(5);
  });

  it("prekrývajúce sa balíčky: keď starší skončí vyčerpaný, nič sa nestratí", () => {
    const g = [v("2026-05-18", "2026-11-17", 18, "OFF 18"), v("2026-07-24", "2027-01-23", 18, "OFF 18")];
    // 20 tréningov: 18 minie starší, 2 novší → 16, aj po 17. 11.
    const tr = Array.from({ length: 20 }, (_, i) => t(new Date(Date.parse("2026-05-20T00:00:00Z") + i * 7 * 864e5).toISOString().slice(0, 10)));
    expect(zostatokKokpitu(g, "Martin Vaško", tr, "2026-11-01")?.zostatok).toBe(16);
    expect(zostatokKokpitu(g, "Martin Vaško", tr, "2026-11-20")?.zostatok).toBe(16);
  });

  it("nevyčerpané hodiny skončeného balíčka prepadnú (ako doteraz)", () => {
    const b6 = [v("2026-10-07", "2026-12-01", 6, "6h Balíček")];
    const tr = ["2026-10-07", "2026-10-14", "2026-10-21"].map(t);
    expect(zostatokKokpitu(b6, "Martin Vaško", tr, "2026-10-22")?.zostatok).toBe(3);
    expect(zostatokKokpitu([...b6, v("2026-12-02", "2027-01-26", 6, "6h Balíček")], "Martin Vaško", tr, "2026-12-03")?.zostatok).toBe(6);
  });

  it("doplnenie v deň konca členstva nezdvojí zvyšok (Barbora Vaňková 23. 10.)", () => {
    const b = [v("2026-09-24", "2026-10-23", 6, "OFF - 6h S viazanostou"), v("2026-10-23", null, 1, "Doplnenie členstva")];
    const tr = ["2026-09-24", "2026-09-29", "2026-10-06", "2026-10-09", "2026-10-13"].map(t);
    expect(zostatokKokpitu(b, "Martin Vaško", tr, "2026-10-22")?.zostatok).toBe(1);
    expect(zostatokKokpitu(b, "Martin Vaško", tr, "2026-10-23")?.zostatok).toBe(1);
  });

  it("ukončený prevzatý zostatok nedáva hodinu (Jitka Heinrichová: 4, nie 5)", () => {
    const b = [v("2026-09-20", "2026-09-29", 1, "Doplnenie členstva", { kotva: true, ukonceny: true }), v("2026-09-21", "2026-11-15", 6, "OFF - 6h BEZ viazanosti")];
    expect(zostatokKokpitu(b, "Martin Vaško", ["2026-09-21", "2026-10-05"].map(t), "2026-10-22")?.zostatok).toBe(4);
  });

  it("mínus pred nezaplateným balíčkom prepíše prvý zaplatený (Lutonský: −1, po platbe 7)", () => {
    const b = [v("2026-09-20", null, 4, "Doplnenie členstva", { kotva: true }), v("2026-10-21", "2026-12-15", 8, "8h Balíček")];
    const tr = ["2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21"].map(t);
    expect(zostatokKokpitu(b, "Martin Vaško", tr, "2026-10-22", new Set(), new Set([klucNezaplateneho("Martin Vaško", "2026-10-21")]))?.zostatok).toBe(-1);
    expect(zostatokKokpitu(b, "Martin Vaško", tr, "2026-10-22")?.zostatok).toBe(7);
  });
});

describe("prenesené hodiny nie sú viac, než zostalo (Jaroslav Kalva, 23. 10. 2026)", () => {
  const k = (od: string, doDna: string | null, hodiny: number, nazov: string): BalicekPreZostatok =>
    ({ klient: "Jaroslav Kalva", nazov, hodiny, platnostOd: od, platnostDo: doDna });
  const t = (d: string) => ({ client: "Jaroslav Kalva", date: `${d}T00:00:00.000Z`, duration: 60 });
  // 8 h 17. 9.–16. 10., presun 2 h zapísaný 13. 10. (vtedy zostávali 2), 15. 10. ešte tréning → zostala 1.
  const b = [k("2026-09-17", "2026-10-16", 8, "OFF - 6h S viazanostou"), k("2026-10-16", null, 2, "Prenesené hodiny"),
    k("2026-10-17", "2026-11-16", 6, "6h Předplatné")];
  const tr = ["2026-09-17", "2026-09-24", "2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19"].map(t);

  it("prenesie sa 1 h, nie 2: po zaplatení 1 + 6 − 1 = 6", () => {
    expect(zostatokKokpitu(b, "Jaroslav Kalva", tr, "2026-10-23")?.zostatok).toBe(6);
  });

  it("doplnenie sa nestrihá — môže byť aj hodina navyše", () => {
    const d = b.map((x) => (x.nazov === "Prenesené hodiny" ? { ...x, nazov: "Doplnenie členstva" } : x));
    expect(zostatokKokpitu(d, "Jaroslav Kalva", tr, "2026-10-23")?.zostatok).toBe(7);
  });
});
