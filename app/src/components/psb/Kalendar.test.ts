import { describe, expect, test } from "bun:test";

import { odtrenovaneMimoExportu, type KalUdalost } from "./Kalendar";

/**
 * Hodiny medzi dvoma nedeľnými exportmi z PTmindera.
 *
 * Jerry, 10. 8. 19:08: „mal som teraz tréning s Annou o 18:00, ostáva jej 3/6"
 * — hodina prebehla, ale export príde až v nedeľu, takže appka o nej nevedela
 * a odznak ukazoval starý zostatok. Táto funkcia je tá predbežná vrstva.
 *
 * Pravidlá, ktoré musí držať a ktoré sa ľahko nechtiac zlomia:
 *   • počíta LEN tréningy, čo už PREBEHLI (budúce sú „objednané", iná vec),
 *   • porovnáva s PTminderom BEZ DIAKRITIKY a s toleranciou ±1 deň, lebo
 *     „Zuzana Spoligova" a presun o deň robili falošné poplachy,
 *   • zrušený tréning, ktorý Jerry z kalendára vymaže, sa proste prestane
 *     počítať — účtovníctvo zostáva na PTminderi.
 */

const udalost = (klient: string, zaciatok: string, extra: Partial<KalUdalost> = {}): KalUdalost => ({
  uid: `${klient}-${zaciatok}`,
  trener: "Jerry",
  zaciatok,
  koniec: zaciatok,
  nazov: klient,
  klient,
  typ: "trening",
  ...extra,
});

/** Dátum v minulosti/budúcnosti voči TERAZ, aby test nezostarol. */
const predDnami = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const oDni = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const den = (iso: string) => iso.slice(0, 10);

describe("odtrenovaneMimoExportu", () => {
  test("prebehnutý tréning, ktorý PTminder nemá, sa počíta", () => {
    const out = odtrenovaneMimoExportu([udalost("Anna Kadličkova", predDnami(1))], []);
    expect(out["Anna Kadličkova"]).toBe(1);
  });

  test("tréning, ktorý PTminder UŽ MÁ, sa nepočíta druhýkrát", () => {
    const kedy = predDnami(1);
    const out = odtrenovaneMimoExportu(
      [udalost("Anna Kadličkova", kedy)],
      [{ client: "Anna Kadličkova", date: den(kedy) }],
    );
    expect(out["Anna Kadličkova"]).toBeUndefined();
  });

  test("diakritika nesmie vyrobiť falošný poplach", () => {
    // PTminder píše „Zuzana Spoligova", kalendár „Zuzana Špoligová".
    const kedy = predDnami(2);
    const out = odtrenovaneMimoExportu(
      [udalost("Zuzana Špoligová", kedy)],
      [{ client: "Zuzana Spoligova", date: den(kedy) }],
    );
    expect(out["Zuzana Špoligová"]).toBeUndefined();
  });

  test("posun o jeden deň je stále tá istá hodina", () => {
    // Markétina hodina sa presunula o deň a karta hlásila chýbajúci zápis.
    const out = odtrenovaneMimoExportu(
      [udalost("Marketa Lozias", predDnami(3))],
      [{ client: "Marketa Lozias", date: den(predDnami(2)) }],
    );
    expect(out["Marketa Lozias"]).toBeUndefined();
  });

  test("posun o dva dni už tá istá hodina nie je", () => {
    const out = odtrenovaneMimoExportu(
      [udalost("Marketa Lozias", predDnami(5))],
      [{ client: "Marketa Lozias", date: den(predDnami(2)) }],
    );
    expect(out["Marketa Lozias"]).toBe(1);
  });

  test("BUDÚCI tréning sa neodpočítava — to je objednané, nie odtrénované", () => {
    const out = odtrenovaneMimoExportu([udalost("Anna Kadličkova", oDni(2))], []);
    expect(out["Anna Kadličkova"]).toBeUndefined();
  });

  test("iné typy udalostí sa nerátajú ako tréning klienta", () => {
    const out = odtrenovaneMimoExportu(
      [
        udalost("Guillermo", predDnami(1), { typ: "guillermo" }),
        udalost("dovolenka", predDnami(1), { typ: "sukromne" }),
      ],
      [],
    );
    expect(Object.keys(out)).toHaveLength(0);
  });

  test("udalosť bez priradeného klienta sa ignoruje", () => {
    const out = odtrenovaneMimoExportu([udalost("", predDnami(1), { klient: null })], []);
    expect(Object.keys(out)).toHaveLength(0);
  });

  test("dva prebehnuté tréningy toho istého klienta sa sčítajú", () => {
    const out = odtrenovaneMimoExportu(
      [udalost("Anna Kadličkova", predDnami(1)), udalost("Anna Kadličkova", predDnami(3))],
      [],
    );
    expect(out["Anna Kadličkova"]).toBe(2);
  });

  test("zrušený tréning vymazaný z kalendára sa proste nepočíta", () => {
    // Nie je čo „vracať" — funkcia číta aktuálny kalendár, takže hodina sa
    // vráti sama. Toto je poistka, že sa niekto nepokúsi zaviesť pamäť.
    expect(Object.keys(odtrenovaneMimoExportu([], []))).toHaveLength(0);
  });
});
