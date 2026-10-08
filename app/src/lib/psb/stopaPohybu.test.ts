import { describe, expect, it } from "bun:test";

import { mozeDopredu, mozeSpat, posun, pridaj, tu, zacni, DLZKA } from "./stopaPohybu";

const rovnake = (a: string, b: string) => a === b;
const prejdi = (kam: string[]) => kam.reduce((s, m) => pridaj(s, m, rovnake), zacni("dnes"));

describe("stopa pohybu po Kokpite", () => {
  it("na začiatku sa nedá nikam", () => {
    const s = zacni("dnes");
    expect(mozeSpat(s)).toBe(false);
    expect(mozeDopredu(s)).toBe(false);
    expect(posun(s, -1)).toBe(null);
  });

  it("späť vráti predošlé miesto a dopredu to isté naspäť", () => {
    const s = prejdi(["klienti", "klient/Baťa"]);
    const a = posun(s, -1)!;
    expect(tu(a)).toBe("klienti");
    expect(tu(posun(a, -1)!)).toBe("dnes");
    expect(tu(posun(a, 1)!)).toBe("klient/Baťa");
  });

  it("to isté miesto dvakrát za sebou nie je pohyb", () => {
    const s = pridaj(pridaj(zacni("dnes"), "klienti", rovnake), "klienti", rovnake);
    expect(s.kroky).toEqual(["dnes", "klienti"]);
  });

  it("nový pohyb po kroku späť zahodí vetvu dopredu", () => {
    const s = posun(prejdi(["klienti", "klient/Baťa"]), -1)!;
    const novy = pridaj(s, "faktury", rovnake);
    expect(novy.kroky).toEqual(["dnes", "klienti", "faktury"]);
    expect(mozeDopredu(novy)).toBe(false);
  });

  it("pamätá si posledných DLZKA miest a prst drží na konci", () => {
    const s = prejdi(Array.from({ length: DLZKA + 20 }, (_, i) => `m${i}`));
    expect(s.kroky.length).toBe(DLZKA);
    expect(s.prst).toBe(DLZKA - 1);
    expect(tu(s)).toBe(`m${DLZKA + 19}`);
  });
});
