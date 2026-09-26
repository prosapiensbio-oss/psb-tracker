import { describe, expect, it } from "bun:test";
import jsQR from "jsqr";
import qrcode from "qrcode-generator";

import { DODAVATEL, POPISY, ascii, dalsieCislo, den, poSplatnosti, spayd, splatnostZ, suma } from "./vydanaFaktura";

describe("číselná rada", () => {
  it("prvá faktúra roku je RRRR1001", () => {
    expect(dalsieCislo("2026-09-26", [])).toBe("20261001");
  });

  it("nadväzuje na najvyššie, nie na počet", () => {
    // Po stornovaní by počet riadkov vrátil číslo, ktoré už raz existovalo.
    expect(dalsieCislo("2026-09-26", ["20261001", "20261002", "20261003"])).toBe("20261004");
    expect(dalsieCislo("2026-09-26", ["20261003"])).toBe("20261004");
  });

  it("nepletie sa s radou z iDokladu", () => {
    // 20260038 je posledné číslo z iDokladu. Nesmie posunúť našu radu.
    expect(dalsieCislo("2026-09-26", ["20260038", "20260037"])).toBe("20261001");
  });

  it("po zmazaní poslednej sa jej číslo vráti do hry", () => {
    // Jerry, 26. 9. 2026: chcel mazanie, nielen storno. Keď zmaže skúšobnú
    // faktúru, ďalšia nesmie dostať o číslo vyššie — v rade by zostala
    // diera po niečom, čo nikdy neexistovalo.
    expect(dalsieCislo("2026-09-26", ["20261001", "20261002"])).toBe("20261003");
    expect(dalsieCislo("2026-09-26", ["20261001"])).toBe("20261002");
    expect(dalsieCislo("2026-09-26", [])).toBe("20261001");
  });

  it("nový rok začína odznova", () => {
    expect(dalsieCislo("2027-01-02", ["20261037"])).toBe("20271001");
  });

  it("nezmyselný dátum nevyrobí NaN v čísle", () => {
    expect(/^\d{8}$/.test(dalsieCislo("", []))).toBe(true);
  });
});

describe("dátumy a sumy", () => {
  it("splatnosť je 14 dní a prechádza cez koniec mesiaca", () => {
    expect(splatnostZ("2026-09-26")).toBe("2026-10-10");
    expect(splatnostZ("2026-02-20", 14)).toBe("2026-03-06");
  });

  it("dá sa predĺžiť", () => {
    expect(splatnostZ("2026-09-26", 30)).toBe("2026-10-26");
  });

  it("sadzba sumy je česká", () => {
    expect(suma(6990)).toBe("6 990,00");
    expect(suma(15580)).toBe("15 580,00");
    expect(suma(7790.5)).toBe("7 790,50");
  });

  it("deň sa píše po česky", () => {
    expect(den("2026-09-13")).toBe("13.09.2026");
  });

  it("po splatnosti je len nezaplatená a nestornovaná", () => {
    const z = { splatnost: "2026-09-01" };
    expect(poSplatnosti({ ...z, uhradeneAt: null, stornoAt: null }, "2026-09-26")).toBe(true);
    expect(poSplatnosti({ ...z, uhradeneAt: "2026-09-02", stornoAt: null }, "2026-09-26")).toBe(false);
    expect(poSplatnosti({ ...z, uhradeneAt: null, stornoAt: "2026-09-02" }, "2026-09-26")).toBe(false);
    expect(poSplatnosti({ splatnost: "2026-10-10", uhradeneAt: null, stornoAt: null }, "2026-09-26")).toBe(false);
  });
});

describe("QR platba", () => {
  it("reťazec má polia, ktoré banka čaká", () => {
    const s = spayd({ suma: 6990, vs: "20261001", sprava: "Faktúra 20261001 · PSB", splatnost: "2026-10-10" });
    expect(s.startsWith("SPD*1.0*ACC:CZ1020100000002302732185*AM:6990.00*CC:CZK*X-VS:20261001")).toBe(true);
    expect(s).toContain("DT:20261010");
    expect(s).toContain("MSG:FAKTURA 20261001 PSB");
  });

  it("z variabilného symbolu ide len číslo", () => {
    expect(spayd({ suma: 1, vs: "2026/1001", sprava: "x" })).toContain("X-VS:20261001");
  });

  it("diakritika ani hviezdička sa do reťazca nedostane", () => {
    // Hviezdička je oddeľovač polí — v texte by rozbila celý príkaz.
    const s = spayd({ suma: 1, vs: "20261001", sprava: "Tréning *špeciál* pre Žofku" });
    // SPD*1.0 + päť polí = sedem kúskov. Keby hviezdička z textu prešla,
    // bolo by ich viac a banka by čítala vymyslené pole.
    expect(s.split("*").length).toBe(7);
    expect(s).toContain("MSG:TRENING SPECIAL PRE ZOFKU");
  });

  it("IBAN dodávateľa sedí s číslom účtu", () => {
    // Kontrolné číslice IBAN-u sú počítané z 2302732185/2010.
    expect(DODAVATEL.iban).toBe("CZ1020100000002302732185");
  });

  it("vygenerovaný QR kód sa dá prečítať späť", () => {
    // Zlá QR platba pošle peniaze inam. Preto sa kód naozaj dekóduje, nie
    // len porovná s očakávaným reťazcom.
    const text = spayd({ suma: 15580, vs: "20261007", sprava: "Faktúra 20261007", splatnost: "2026-10-10" });
    const q = qrcode(0, "M");
    q.addData(text, "Byte");
    q.make();
    const n = q.getModuleCount();
    const okraj = 4, skala = 4, sirka = (n + okraj * 2) * skala;
    const px = new Uint8ClampedArray(sirka * sirka * 4).fill(255);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!q.isDark(r, c)) continue;
        for (let dy = 0; dy < skala; dy++) {
          for (let dx = 0; dx < skala; dx++) {
            const i = (((r + okraj) * skala + dy) * sirka + (c + okraj) * skala + dx) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
        }
      }
    }
    expect(jsQR(px, sirka, sirka)?.data).toBe(text);
  });
});

describe("ponuka popisov", () => {
  it("je deväť a každý má cenu", () => {
    expect(POPISY.length).toBe(9);
    for (const p of POPISY) {
      expect(p.text.length).toBeGreaterThan(10);
      expect(p.cena).toBeGreaterThan(0);
    }
  });

  it("id sa neopakujú", () => {
    expect(new Set(POPISY.map((p) => p.id)).size).toBe(POPISY.length);
  });
});

describe("ascii", () => {
  it("nechá text čitateľný", () => {
    expect(ascii("Přadlácká 915/18")).toBe("Pradlacka 915/18");
    expect(ascii("  dve   medzery ")).toBe("dve medzery");
  });
});
