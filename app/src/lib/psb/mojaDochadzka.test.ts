import { describe, expect, it } from "bun:test";

import { citajDochadzku, dlhKc, hodinyZaSumu, polozkyDochadzky, rucneAkoUdalosti, sNazvamiKontaktov, stavAktivity, type Aktivita, type Nakup, type UdalostDochadzky } from "./mojaDochadzka";

const BOX: Aktivita = { id: "a1", kto: "Jerry", nazov: "Box", nazvy: ["Box"], vytvorene: "" };
const nakup = (datum: string, hodiny: number): Nakup => ({ id: datum, aktivitaId: "a1", datum, hodiny, sumaKc: 5000, poznamka: "", vytvorene: datum });
const box = (zaciatok: string, trener = "Jerry", nazov = "Box"): UdalostDochadzky => ({ uid: zaciatok + trener, trener, zaciatok, nazov, typ: "sukromne" });

describe("stavAktivity", () => {
  const ud = [box("2026-09-01T12:00"), box("2026-09-07T12:00"), box("2026-09-09T12:00"), box("2026-09-15T12:00"), box("2026-09-18T12:00"), box("2026-09-20T12:00", "Terezka")];
  it("odpočet beží od nákupu, ráta len kalendár majiteľa, staršie sa nepočíta", () => {
    const s = stavAktivity(BOX, [nakup("2026-09-05", 3)], ud, "2026-09-30T08:00");
    expect(s.predEvidenciou).toBe(1);
    expect(s.body.map((b) => b.poradie ?? -(b.minus || 0))).toEqual([1, 2, 3, -1]);
    expect(s.zostatok).toBe(-1);
    expect(s.body[2].posledna).toBe(true);
  });
  it("budúce udalosti sa neodpočítajú, ale povedia, kedy to dôjde", () => {
    const s = stavAktivity(BOX, [nakup("2026-09-05", 3)], ud, "2026-09-08T08:00");
    expect(s.odtrenovane).toBe(1);
    expect(s.zostatok).toBe(2);
    expect(s.dojde).toBe("2026-09-15");
    expect(s.naplanovane).toBe(3);
  });
  it("nový balík začína znova od 1", () => {
    const s = stavAktivity(BOX, [nakup("2026-09-05", 2), nakup("2026-09-10", 10)], ud, "2026-09-30T08:00");
    expect(s.body.map((b) => `${b.poradie}/${b.zBalika}`)).toEqual(["1/2", "2/2", "1/10", "2/10"]);
    expect(s.zostatok).toBe(8);
  });
  it("Guillermo sa ráta podľa typu udalosti, nie názvu", () => {
    // Jerryho Guillermo, sedenie zapísané v Terezkinom kalendári — ráta sa.
    const g: Aktivita = { ...BOX, id: "g", nazov: "Guillermo", nazvy: [], guillermo: true, kto: "Jerry" };
    const u = [{ uid: "1", trener: "Terezka", zaciatok: "2026-10-01T10:00", nazov: "TR", typ: "guillermo" }];
    expect(stavAktivity(g, [{ ...nakup("2026-09-01", 3), aktivitaId: "g" }], u, "2026-10-02T08:00").odtrenovane).toBe(1);
  });
});

describe("polozkyDochadzky", () => {
  it("v deň poslednej zaplatenej hodiny príde notifikácia majiteľovi", () => {
    const d = { aktivity: [BOX], nakupy: [nakup("2026-09-05", 2)] };
    const p = polozkyDochadzky(d, [box("2026-09-07T12:00"), box("2026-09-09T12:00")], "2026-09-09T07:00");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: "Box — dnes posledný tréning", kto: "Jerry" });
  });
  it("mínus má vlastnú notifikáciu", () => {
    const d = { aktivity: [BOX], nakupy: [nakup("2026-09-05", 1)] };
    const p = polozkyDochadzky(d, [box("2026-09-07T12:00"), box("2026-09-09T12:00")], "2026-09-10T07:00");
    expect(p.map((x) => x.title)).toEqual(["Box: -1 h"]);
  });
  it("bez nákupu mlčí a zlý JSON nezhodí nič", () => {
    expect(polozkyDochadzky({ aktivity: [BOX], nakupy: [] }, [box("2026-09-07T12:00")], "2026-09-07T07:00")).toEqual([]);
    expect(citajDochadzku("nezmysel")).toEqual({ aktivity: [], nakupy: [], rucne: [] });
  });
});

describe("sNazvamiKontaktov", () => {
  it("Box ráta aj termín, ktorý sa volá menom súkromného kontaktu", () => {
    const [a] = sNazvamiKontaktov([BOX], [{ meno: "Leon Box", aktivita: "Box" }]);
    expect(a.nazvy).toEqual(["Box", "Leon Box"]);
    const s = stavAktivity(a, [nakup("2026-11-01", 10)], [box("2026-11-13T12:30", "Jerry", "Leon Box")], "2026-11-14T08:00");
    expect(s.odtrenovane).toBe(1);
  });
});

describe("Guillermo: neskorá platba, séria a ručné tréningy", () => {
  const G: Aktivita = { id: "g", kto: "Jerry", nazov: "Guillermo", nazvy: [], guillermo: true, serie: ["5h9bl"], vytvorene: "" };
  const n = (datum: string, hodiny: number): Nakup => ({ id: datum, aktivitaId: "g", datum, hodiny, sumaKc: null, poznamka: "", vytvorene: datum });
  const busy = (z: string): UdalostDochadzky => ({ uid: `5h9bl318@google.com|${z}`, trener: "Jerry", zaciatok: z, nazov: "Busy", typ: "sukromne" });
  it("udalosť „Busy“ zo série sa ráta, cudzí Busy nie", () => {
    const s = stavAktivity(G, [n("2026-07-29", 3)], [busy("2026-08-12T12:45"), { ...busy("2026-08-13T10:00"), uid: "iny@google.com|x" }], "2026-08-20T08:00");
    expect(s.odtrenovane).toBe(1);
  });
  it("platba po tréningoch vyrovná mínus a odpočet pokračuje z nej", () => {
    const s = stavAktivity(G, [n("2026-06-01", 1), n("2026-07-29", 8)], ["2026-06-03", "2026-06-17", "2026-07-01", "2026-08-12"].map((d) => busy(`${d}T12:00`)), "2026-08-20T08:00");
    expect(s.body.map((b) => b.minus ? -b.minus : b.poradie)).toEqual([1, -1, -2, 3]);
    expect(s.zostatok).toBe(5);
  });
  it("ručne zapísaný tréning sa ráta rovnako ako kalendár", () => {
    const d = { aktivity: [G], nakupy: [n("2025-01-01", 2)], rucne: [{ id: "r1", aktivitaId: "g", zaciatok: "2025-01-08T12:00", poznamka: "zo správ" }] };
    expect(stavAktivity(G, d.nakupy, rucneAkoUdalosti(d), "2025-02-01T08:00").zostatok).toBe(1);
  });
});

describe("Box: cena hodiny 800 Kč", () => {
  const box: Aktivita = { id: "b", kto: "Jerry", nazov: "Box", nazvy: ["Box"], cenaHodiny: 800, vytvorene: "2026-11-14" };
  it("zo sumy dopočíta hodiny", () => {
    expect(hodinyZaSumu(box, 4000)).toBe(5);
    expect(hodinyZaSumu(box, 1600)).toBe(2);
    expect(hodinyZaSumu({ ...box, cenaHodiny: undefined }, 4000)).toBeNull();
  });
  it("mínus v korunách", () => {
    expect(dlhKc(box, -3)).toBe(2400);
    expect(dlhKc(box, 2)).toBeNull();
  });
});
