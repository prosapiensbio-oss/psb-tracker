import { describe, expect, it } from "bun:test";

import { CIELE, jePlatnyCiel, jeVonkajsiOdkaz } from "./odkazy";

describe("jeVonkajsiOdkaz", () => {
  it("pozná adresu článku aj príspevku", () => {
    expect(jeVonkajsiOdkaz("https://www.instagram.com/p/DYEYoOujO9w/")).toBe(true);
    expect(jeVonkajsiOdkaz("https://prosapiens.cz/pracujeme-s-celym-telem/")).toBe(true);
    expect(jeVonkajsiOdkaz("http://prosapiens.cz")).toBe(true);
  });

  it("názov záložky ani veta adresou nie sú", () => {
    expect(jeVonkajsiOdkaz("marketing")).toBe(false);
    expect(jeVonkajsiOdkaz("")).toBe(false);
    expect(jeVonkajsiOdkaz("pozri na instagram.com")).toBe(false);
  });

  it("neberie javascript: ani data: — odkaz je adresa, nie príkaz", () => {
    expect(jeVonkajsiOdkaz("javascript:alert(1)")).toBe(false);
    expect(jeVonkajsiOdkaz("data:text/html,<h1>x</h1>")).toBe(false);
  });
});

describe("jePlatnyCiel", () => {
  it("pustí dnešné záložky", () => {
    for (const t of ["dashboard", "marketing", "vzas", "mesiac", "klienti"]) {
      expect(jePlatnyCiel(t)).toBe(true);
    }
  });

  it("pustí staré id, ktoré navigate stále mapuje", () => {
    // Vyhodiť ich by potichu zabilo odkazy v registri aj v starých debatách.
    for (const t of ["financie", "vysledky", "udaje", "6m"]) {
      expect(jePlatnyCiel(t)).toBe(true);
    }
  });

  it("nepustí adresu ani vymyslenú obrazovku", () => {
    // Presne toto Jarvis 16. 8. napísal do políčka pre názov záložky.
    expect(jePlatnyCiel("https://www.instagram.com/p/DYEYoOujO9w/")).toBe(false);
    expect(jePlatnyCiel("instagram")).toBe(false);
    expect(jePlatnyCiel("prispevky")).toBe(false);
    expect(jePlatnyCiel("")).toBe(false);
  });

  it("zoznam cieľov je bez duplicít", () => {
    expect(new Set(CIELE).size).toBe(CIELE.length);
  });
});
