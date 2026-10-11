import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * ZÁMOK SMIE BRÁNIŤ LEN TOMU, ČO SA PO ŇOM UŽ NEDÁ OPRAVIŤ.
 *
 * Jerry, 11. 10. 2026: „toto nemôže byť súčasťou uzávierky, dlžoby sa môžu
 * preniesť do ďalšieho mesiaca." Pravidlo je overiteľné v kóde: keď endpoint
 * zámok nekontroluje, jeho práca sa dá dorobiť aj po uzávierke — a potom
 * nesmie byť podmienkou zamknutia.
 *
 * Test stráži obe strany. Keď do `platby.ts` niekto pridá kontrolu zámku,
 * spadne — a je to správne: vtedy sa musí zmeniť aj krok uzávierky.
 */
const subor = (p: string) => readFileSync(`${import.meta.dir}/../../${p}`, "utf8");

describe("čo zámok mesiaca blokuje", () => {
  it("BLOKUJE položky faktúr — po uzamknutí sa kategória nedá zmeniť", () => {
    expect(subor("routes/api/faktury.ts")).toContain("locked");
  });

  it("NEBLOKUJE priradenie platby ani odpovede — dajú sa dorobiť neskôr", () => {
    for (const f of ["routes/api/platby.ts", "routes/api/anomaly.ts", "routes/api/kalendar.ts"]) {
      expect(subor(f).includes("vzas_periods"), f).toBe(false);
    }
  });

  it("príjmy bez klienta sa uzávierky netýkajú vôbec", () => {
    // Jerry, 11. 10. 2026: „toto daj úplne preč, to tam nedáva žiadny
    // zmysel." Najprv to bola podmienka zámku, potom informatívny riadok —
    // a ani to nie: nepriradený príjem mesačné číslo nemení (tržby idú
    // z `payments`) a priradiť sa dá aj po uzamknutí. V krokoch uzávierky
    // teda nemá čo robiť.
    expect(subor("components/psb/App.tsx")).not.toContain("prijmyBezKlienta.filter");
  });
});
