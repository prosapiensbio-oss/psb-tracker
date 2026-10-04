import { describe, expect, it } from "bun:test";

import { FORMULAR, JINE, sekcieZapisu } from "./anamnezaFormular";
import { zhrnutieAnamnezy } from "./anamnezaZhrnutie";
import { predvyplnZapisu } from "./anamneza.server";

describe("otázky klienta sú v anamnéze vždy (Jerry, 4. 10. 2026)", () => {
  it("klient nevyplnil → prvá sekcia sú jeho otázky, prázdne, s pokynom vyplniť ich na úvodnom", () => {
    const s = sekcieZapisu(FORMULAR, {}, null);
    expect(s[0].s.nazov).toBe("Otázky pred úvodným");
    expect(s[0].s.pozn).toContain("nevyplnil");
    // Hlavná obtiaž stojí hneď pod prvou otázkou (Jerry: „prídu mi podobné").
    expect(s[0].otazky.map((o) => o.id)).toEqual(["privadza", "obtiz", "zakaz"]);
  });

  it("vetva bolesti otvorí oblasti, varovné príznaky a lieky; pri Ano aj doplnenie zákazu", () => {
    const s = sekcieZapisu(FORMULAR, { privadza: FORMULAR.klient[0].otazky[0].moznosti![0], zakaz: "Ano" }, "2026-10-03T08:00:00Z");
    const ids = s[0].otazky.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(["privadza", "oblasti", "vlajky", "lieky", "zakaz", "zakaz_popis"]));
    expect(s[0].s.pozn).toContain("Vyplnil klient 3. 10. 2026");
    // Oblasti sú medzi otázkami klienta — v zápise trénera sa neopakujú.
    expect(s.slice(1).flatMap((x) => x.otazky.map((o) => o.id))).not.toContain("oblasti");
  });

  it("predvyplnenie prevezme od klienta VŠETKY jeho odpovede, nielen oblasti a cieľ", () => {
    const p = predvyplnZapisu({
      klientOdpovede: { privadza: "Něco mě bolí", vlajky: ["vysoký krevní tlak"], lieky: "betablokátory", zakaz: "Ano", zakaz_popis: "běh" },
      klientVyplnilAt: "2026-10-03T08:00:00Z",
    });
    expect(p.hodnoty).toMatchObject({ privadza: "Něco mě bolí", vlajky: ["vysoký krevní tlak"], lieky: "betablokátory", zakaz: "Ano", zakaz_popis: "běh" });
    expect(p.odkial.lieky).toContain("od klienta");
  });
});

describe("Jiné a hlavná obtiaž v zápise trénera", () => {
  it("každá otázka s možnosťami má Jiné; po výbere sa otvorí políčko na písanie", () => {
    const bez = sekcieZapisu(FORMULAR, {}, null)[0].otazky.find((o) => o.id === "privadza")!;
    expect(bez.moznosti).toContain(JINE);
    const s = sekcieZapisu(FORMULAR, { privadza: JINE }, null)[0].otazky.map((o) => o.id);
    expect(s).toEqual(expect.arrayContaining(["privadza", "privadza_jine", "obtiz"]));
  });

  it("dotazník pre klienta Jiné nedostal — mení sa len zápis trénera", () => {
    expect(FORMULAR.klient[0].otazky.find((o) => o.id === "privadza")!.moznosti).not.toContain(JINE);
  });

  it("obtiaž sa nepýta druhýkrát v sekcii Co ho trápí, ani pri Nic mě nebolí", () => {
    const nic = FORMULAR.klient[0].otazky[0].moznosti![2];
    for (const odp of [{}, { privadza: nic }]) {
      const ids = sekcieZapisu(FORMULAR, odp, null).flatMap((x) => x.otazky.map((o) => o.id));
      expect(ids.filter((i) => i === "obtiz").length).toBeLessThanOrEqual(1);
      expect(sekcieZapisu(FORMULAR, odp, null).slice(1).flatMap((x) => x.otazky.map((o) => o.id))).not.toContain("obtiz");
    }
  });

  it("súhrn ukáže namiesto Jiné to, čo tréner dopísal", () => {
    const z = zhrnutieAnamnezy({}, { privadza: JINE, privadza_jine: "chce sa vrátiť k behu po pôrode", ciel: ["Zvýšit sílu nebo výdrž", JINE], ciel_jine: "zabehnúť polmaratón" });
    expect(z.find((r) => r.popis === "privádza ho")?.hodnota).toBe("chce sa vrátiť k behu po pôrode");
    expect(z.find((r) => r.popis === "cieľ")?.hodnota).toBe("Zvýšit sílu nebo výdrž, zabehnúť polmaratón");
  });
});
