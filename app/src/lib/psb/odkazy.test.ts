import { describe, expect, it } from "bun:test";

import { CIELE, adresaStranky, jePlatnyCiel, jeVonkajsiOdkaz, naPlnuAdresu } from "./odkazy";

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

describe("naPlnuAdresu", () => {
  it("doplní schému adrese napísanej bez nej", () => {
    // Presne takto Jarvis adresy píše v krátkych odpovediach.
    expect(naPlnuAdresu("prosapiens.cz/arm-lines")).toBe("https://prosapiens.cz/arm-lines");
    expect(naPlnuAdresu("www.prosapiens.cz/vysledky/")).toBe("https://www.prosapiens.cz/vysledky/");
    expect(naPlnuAdresu("instagram.com/p/DYEYoOujO9w/")).toBe("https://instagram.com/p/DYEYoOujO9w/");
  });

  it("úplnú adresu nechá tak", () => {
    expect(naPlnuAdresu("https://www.prosapiens.cz/fascia/")).toBe("https://www.prosapiens.cz/fascia/");
  });

  it("odsekne vetnú interpunkciu na konci", () => {
    expect(naPlnuAdresu("prosapiens.cz/fascia,")).toBe("https://prosapiens.cz/fascia");
  });

  it("z bežného slova odkaz nespraví", () => {
    // Robiť odkaz z každej bodky by vyrobilo viac škody než úžitku.
    for (const x of ["niečo.sk", "napr.", "6M", "CTR 0,3 %", "sedenia.cz"]) {
      expect(naPlnuAdresu(x)).toBeNull();
    }
  });
});

describe("adresaStranky", () => {
  it("celú adresu nechá tak, ako je", () => {
    expect(adresaStranky("https://www.prosapiens.cz/fascie/")).toBe("https://www.prosapiens.cz/fascie/");
  });

  it("z holej cesty spraví adresu — tak ju drží karta o rýchlosti", () => {
    // Tam sa doména odsekáva, aby sa tabuľka zmestila: „arm-lines/".
    expect(adresaStranky("arm-lines/")).toBe("https://www.prosapiens.cz/arm-lines/");
    expect(adresaStranky("/blog/")).toBe("https://www.prosapiens.cz/blog/");
  });

  it("doplní schému, keď chýba", () => {
    expect(adresaStranky("www.prosapiens.cz/vysledky/")).toBe("https://www.prosapiens.cz/vysledky/");
  });

  it("z cudzej adresy nerobí našu podstránku", () => {
    // Inak by odkaz viedol na prosapiens.cz/instagram.com/... — teda nikam.
    expect(adresaStranky("instagram.com/p/DYEYoOujO9w/")).toBe("https://instagram.com/p/DYEYoOujO9w/");
    expect(adresaStranky("example.com/x")).toBeNull();
    expect(adresaStranky("javascript:alert(1)")).toBeNull();
    expect(adresaStranky("")).toBeNull();
  });
});
