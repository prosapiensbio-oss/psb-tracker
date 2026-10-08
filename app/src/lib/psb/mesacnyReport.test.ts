import { describe, expect, it } from "bun:test";

import { koniecKvartalu, postavReport, reportNaMarkdown, type MesiacReportu } from "./mesacnyReport";

const m = (mm: string, o: Partial<MesiacReportu>): MesiacReportu => ({ m: mm, hodiny: 200, aktivni: 55, novi: 5, dopyty: 6, prijmy: 200000, naklady: 150000, zisk: 50000, prirastokIg: 10, dosahReels: 450, reklama: 2000, prestali: 3, ...o });
const mesiace = [
  m("2025-10", {}), m("2025-11", {}), m("2025-12", {}),
  m("2026-01", {}), m("2026-02", {}), m("2026-03", {}),
  m("2026-04", {}), m("2026-05", {}), m("2026-06", {}),
  m("2026-07", { hodiny: 214, dosahReels: 608 }), m("2026-08", { hodiny: 183, dosahReels: 404, reklama: 2, prirastokIg: -9 }),
  m("2026-09", { hodiny: 231, aktivni: 60, novi: 4, dopyty: 7, dosahReels: 283, reklama: 6540, prirastokIg: 34, zisk: 60000 }),
];
const extra = { odmlcani: 3, zositChyba: false, topVydaje: [{ nazov: "Nájom", suma: 54750 }], zdroje: [{ zdroj: "referencia", pocet: 3 }] };

describe("mesačný report", () => {
  it("porovnáva s priemerom šiestich mesiacov, nie s augustom", () => {
    const r = postavReport(mesiace, "2026-09", "mesiac", extra);
    expect(r.nadpis).toBe("September 2026");
    expect(r.porovnanie).toBe("proti priemeru posledných 6 mesiacov");
    const o = (id: string) => r.otazky.find((x) => x.id === id)!;
    const [praca, peniaze, novi] = [o("praca"), o("peniaze"), o("novi")];
    // priemer apr–aug = (200+200+200+214+183+... ) — september je nad ním
    expect(praca.hlavne.zmena).toMatch(/▲ \d+ % nad priemerom/);
    expect(praca.hlavne.zmena).not.toContain("august");
    expect(praca.detail.find((d) => d.metrika === "Odtrénované hodiny")?.priemer).toBe("200");
    expect(praca.akcia).toContain("3 aktívni klienti netrénovali");
    expect(r.otazky.map((x) => x.id)).toEqual(["praca", "klienti", "peniaze", "novi", "koncentracia", "osobne"]);
    expect(peniaze.detail.map((d) => d.metrika)).toContain("Tržba na hodinu");
    expect(novi.akcia).toContain("Natoč príbeh klienta");
    expect(novi.zoznamy[0].nadpis).toBe("Odkiaľ prišli dopyty");
    // náklady: vyššie je horšie
    expect(peniaze.detail.find((d) => d.metrika === "Náklady vrátane výplat")?.dobre).toBeUndefined();
  });

  it("chýbajúci zošit a chýbajúce P&L sa nezamlčia; strata je červená", () => {
    const bezPnl = postavReport([...mesiace.slice(0, 11), m("2026-09", { prijmy: undefined, zisk: undefined, naklady: undefined })], "2026-09", "mesiac", { ...extra, zositChyba: true });
    expect(bezPnl.otazky.find((x) => x.id === "peniaze")!.semafor).toBe("o");
    expect(bezPnl.otazky.find((x) => x.id === "peniaze")!.akcia).toContain("zošit");
    const strata = postavReport([...mesiace.slice(0, 11), m("2026-09", { zisk: -12000, prijmy: 150000, naklady: 162000 })], "2026-09", "mesiac", extra);
    expect(strata.otazky.find((x) => x.id === "peniaze")!.semafor).toBe("c");
  });

  it("kvartál Q3 proti priemeru troch celých štvrťrokov", () => {
    const r = postavReport(mesiace, "2026-09", "kvartal", extra);
    expect(r.nadpis).toBe("Q3 2026");
    expect(r.porovnanie).toBe("proti priemeru posledných 3 štvrťrokov");
    expect(r.otazky[0].hlavne.hodnota).toBe(628);
    expect(r.otazky[0].hlavne.seria).toEqual([214, 183, 231]);
    expect(r.otazky[0].detail[0].priemer).toBe("600");
    expect(koniecKvartalu("2026-09")).toBe(true);
    expect(koniecKvartalu("2026-10")).toBe(false);
  });

  it("markdown na tlač nesie tabuľku proti priemeru a značky grafov", () => {
    const md = reportNaMarkdown(postavReport(mesiace, "2026-09", "mesiac", extra));
    expect(md).toContain("| | Toto obdobie | Priemer | Rozdiel |");
    expect(md).toContain("::graf:praca::");
    expect(md).toContain("**Urob:**");
  });
});

describe("break-even, aplikácie a osobné financie", () => {
  it("break-even v peniazoch, spoločný nájom v osobných financiách", () => {
    const s = (o: Partial<MesiacReportu>) => ({ breakEven: 180000, apps: 9000, ai: 3000, vyplataJerry: 60000, vyplataTerezka: 15000, spolocne: { Nájom: 23000, Potraviny: 20000 }, ...o });
    const ms = mesiace.map((x) => ({ ...x, ...s({}) }));
    ms[ms.length - 1] = { ...ms[ms.length - 1], ...s({ ai: 8723, spolocne: { Nájom: 23000, Potraviny: 25000, Ahsoka: 7300 } }) };
    const r = postavReport(ms, "2026-09", "mesiac", { ...extra, topVydaje: [{ nazov: "Prevádzka · Nájom + energie", suma: 54750 }] });
    const pen = r.otazky.find((x) => x.id === "peniaze")!;
    expect(pen.detail.map((d) => d.metrika)).toEqual(expect.arrayContaining(["Break-even (tržby, pri ktorých je zisk 0)", "Tržby nad break-even", "Aplikácie spolu", "z toho AI (Claude, ChatGPT, Perplexity…)"]));
    const osob = r.otazky.find((x) => x.id === "osobne")!;
    expect(osob.otazka).toBe("Koľko si berieme domov?");
    expect(osob.detail.map((d) => d.metrika)).toContain("· Nájom");
    expect(osob.semafor).toBe("o");
    expect(osob.akcia).toContain("Potraviny");
  });
});

describe("klienti, strop a koncentrácia", () => {
  it("strop 120 h, obnova s menami, koncentrácia pod prahom", () => {
    const ms = mesiace.map((x) => ({ ...x, hodinyJerry: 98, hodinyTerezka: 97, obnovaPct: 80, retenciaPct: 85 }));
    ms[ms.length - 1] = { ...ms[ms.length - 1], hodinyJerry: 131, hodinyTerezka: 100, obnovaPct: 80, retenciaPct: 83 };
    const r = postavReport(ms, "2026-09", "mesiac", { ...extra, odmlcani: 0, strop: { jerry: 120, terezka: 120 }, obnova: { skoncilo: 15, obnovene: 12 }, bezObnovy: [{ klient: "Roman Jakubiček", do: "2026-09-28" }], topKlient: { klient: "A", podiel: 6.5 }, top20: 39 });
    const o = (id: string) => r.otazky.find((x) => x.id === id)!;
    expect(o("praca").detail.find((d) => d.metrika === "Vyťaženie voči stropu — Jerry")?.rozdiel).toBe("109 %");
    expect(o("praca").akcia).toContain("Jerry (109 %)");
    expect(o("klienti").zoznamy[0].polozky).toEqual(["Roman Jakubiček (28. 9.)"]);
    expect(o("klienti").akcia).toContain("Roman Jakubiček");
    expect(o("koncentracia").semafor).toBe("z");
    // Podiel hodín je rozdelenie práce, nie dobré/zlé — bez farby.
    expect(o("koncentracia").detail.find((d) => d.metrika === "Hodiny odtrénované Jerrym")?.dobre).toBeUndefined();
  });
});
