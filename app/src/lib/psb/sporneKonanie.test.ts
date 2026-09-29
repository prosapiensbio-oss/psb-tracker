import { describe, expect, it } from "bun:test";

import { nepresnostKlienta, podlaKlienta, type SporneKonanie } from "./sporneKonanie";

const u = (klient: string, zaciatok: string, uid = zaciatok): SporneKonanie => ({
  uid, trener: "Jerry", zaciatok, nazov: klient, klient, typ: "trening",
  zmizla_at: `${zaciatok.slice(0, 10)}T18:00`,
});

describe("podlaKlienta", () => {
  it("jeden človek je jedna otázka, nie päť riadkov", () => {
    const v = podlaKlienta([
      u("Vítězslav Papiež", "2026-09-22T10:30"),
      u("Josef Pávek", "2026-09-22T09:30"),
      u("Vítězslav Papiež", "2026-09-08T10:30"),
    ]);
    expect(v).toHaveLength(2);
    expect(v[0].klient).toBe("Vítězslav Papiež");
    expect(v[0].polozky).toHaveLength(2);
  });

  it("najviac nerozhodnutých hodín ide hore — ich zostatok je najviac mimo", () => {
    const v = podlaKlienta([
      u("Anna Nová", "2026-09-01T10:00"),
      u("Boris Starý", "2026-09-02T10:00"),
      u("Boris Starý", "2026-09-03T10:00"),
    ]);
    expect(v.map((x) => x.klient)).toEqual(["Boris Starý", "Anna Nová"]);
  });

  it("u jedného klienta je najnovší termín prvý", () => {
    const v = podlaKlienta([u("Anna Nová", "2026-09-01T10:00"), u("Anna Nová", "2026-09-20T10:00")]);
    expect(v[0].polozky[0].zaciatok).toBe("2026-09-20T10:00");
  });
});

describe("nepresnostKlienta", () => {
  const norm = (s: string) => s.toLowerCase().trim();

  it("povie, o koľko hodín môže byť zostatok vedľa", () => {
    const xs = [u("Vítězslav Papiež", "2026-09-22T10:30"), u("Vítězslav Papiež", "2026-09-08T10:30")];
    expect(nepresnostKlienta(xs, "vítězslav papiež", norm)).toBe(2);
  });

  it("kto nemá nerozhodnuté hodiny, má nulu — nie odhad", () => {
    expect(nepresnostKlienta([u("Anna Nová", "2026-09-01T10:00")], "Boris Starý", norm)).toBe(0);
  });
});
