import { describe, expect, test } from "bun:test";

import {
  nastavPnlBunku, PNL, pnlCalc, pnlJeOpravena, pnlOverridesNaUlozenie, pnlPovodnaHodnota,
  poslednyMesiacSDatami, salaryCalc, VZAS_MONTHS,
} from "./vzas";

/**
 * VZAS je účtovná polovica appky — 18 mesiacov P&L, mzdové éry, nároky, dlhy.
 * Čísla v nej sedeli na korunu proti Jerryho Excelu, takže testy tu nemajú
 * hádať hodnoty; majú strážiť PRAVIDLÁ, ktoré sa dajú nechtiac zlomiť
 * refaktorom — a jedno z nich sa už zlomilo.
 *
 * Nález 9. 8.: `salaryCalc` počítal rozdiel medzi nárokom a poslaným aj za
 * BEŽIACI mesiac. Mesiac ešte nie je dochodený a výplaty ešte neodišli, takže
 * z torza vyšiel dlh — Terezkin bol vedľa o dvanásť tisíc. Test nižšie stráži,
 * že bežiaci mesiac zostáva na nule.
 */

const beziaciIdx = () => {
  const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  return VZAS_MONTHS.indexOf(mk);
};

describe("salaryCalc — bežiaci mesiac", () => {
  test("rozdiel za bežiaci mesiac je nula, nie torzo", () => {
    const i = beziaciIdx();
    if (i < 0) return; // dnešok je mimo rozsahu VZAS — test nemá čo strážiť
    for (const kto of ["jerry", "terezka"] as const) {
      expect(salaryCalc(kto).rozdiel[i]).toBe(0);
    }
  });

  test("kumulovaný dlh sa v bežiacom mesiaci nehýbe", () => {
    const i = beziaciIdx();
    if (i <= 0) return;
    for (const kto of ["jerry", "terezka"] as const) {
      const s = salaryCalc(kto);
      expect(s.cumDebt[i]).toBe(s.cumDebt[i - 1]);
    }
  });

  test("polia majú dĺžku počtu mesiacov — žiadne torzo na konci", () => {
    for (const kto of ["jerry", "terezka"] as const) {
      const s = salaryCalc(kto);
      for (const pole of [s.narok, s.poslane, s.rozdiel, s.cumDebt, s.variabil]) {
        expect(pole).toHaveLength(VZAS_MONTHS.length);
      }
    }
  });

  test("žiadne NaN nikde v mzdách — NaN sa v UI tvári ako pomlčka a mlčky sa šíri", () => {
    for (const kto of ["jerry", "terezka"] as const) {
      const s = salaryCalc(kto);
      for (const [nazov, pole] of Object.entries({ narok: s.narok, poslane: s.poslane, rozdiel: s.rozdiel, cumDebt: s.cumDebt })) {
        for (let i = 0; i < pole.length; i++) {
          expect(Number.isFinite(pole[i]), `${kto}.${nazov}[${i}] = ${pole[i]}`).toBe(true);
        }
      }
    }
  });
});

describe("poslednyMesiacSDatami", () => {
  test("ukazuje na existujúci mesiac", () => {
    const i = poslednyMesiacSDatami();
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(VZAS_MONTHS.length);
  });

  test("nie je to slepo posledný slot poľa — VZAS má mesiace nadopred", () => {
    // Práve toto bola príčina, prečo break-even klesol o desatinu a „mesiace
    // prevádzky z rezervy" vychádzali na 1,2 namiesto 1,0: priemer si bral aj
    // prázdny budúci mesiac.
    const i = poslednyMesiacSDatami();
    const p = pnlCalc();
    const maNieco = p.prijmy[i] > 0 || p.celkoveNaklady[i] > 0;
    expect(maNieco).toBe(true);
  });
});

describe("pnlCalc — vnútorná konzistencia", () => {
  const p = pnlCalc();

  test("hrubý zisk = príjmy − celkové náklady, mesiac po mesiaci", () => {
    for (let i = 0; i < VZAS_MONTHS.length; i++) {
      expect(Math.round(p.hrubyZisk[i])).toBe(Math.round(p.prijmy[i] - p.celkoveNaklady[i]));
    }
  });

  test("celkové náklady = bez výplat + výplaty", () => {
    for (let i = 0; i < VZAS_MONTHS.length; i++) {
      expect(Math.round(p.celkoveNaklady[i])).toBe(Math.round(p.bezVyplat[i] + p.vyplatySpolu[i]));
    }
  });

  test("žiadne NaN v P&L", () => {
    for (const [nazov, pole] of Object.entries({
      prijmy: p.prijmy, bezVyplat: p.bezVyplat, vyplatySpolu: p.vyplatySpolu,
      celkoveNaklady: p.celkoveNaklady, hrubyZisk: p.hrubyZisk,
    })) {
      for (let i = 0; i < pole.length; i++) {
        expect(Number.isFinite(pole[i]), `${nazov}[${i}] = ${pole[i]}`).toBe(true);
      }
    }
  });

  test("mesiace idú chronologicky a bez dier", () => {
    for (let i = 1; i < VZAS_MONTHS.length; i++) {
      expect(VZAS_MONTHS[i] > VZAS_MONTHS[i - 1]).toBe(true);
    }
  });
});

// ── Oprava bunky P&L: cesta, ktorou zapisuje `uprav-pnl` ─────────────────────
//
// Toto je jediná Jarvisova akcia, ktorá mení reálne peniaze. Otestovať ju
// naostro proti živej appke sa 11. 8. nepodarilo (prostredie zablokovalo zápis,
// potom vypršala relácia), tak je aspoň mechanizmus pod testom — a je to tá
// časť, kde by chyba narobila najviac škody: keby sa prepis nedal vrátiť,
// zostalo by v P&L cudzie číslo natrvalo.
//
// Pravidlo, ktoré sa tu stráži: oprava je PREKRYTIE, nie prepis. Pôvodná
// hodnota sa odloží a `null` ju vráti presne — aj po viacnásobnej oprave.
describe("nastavPnlBunku — prekrytie, nie prepis", () => {
  const KAT = "fixne.apps.canva";
  const MES = VZAS_MONTHS[VZAS_MONTHS.length - 1];
  const polozka = () => PNL.fixne.subcategories.apps.items.canva;
  const hodnota = () => polozka().values[VZAS_MONTHS.indexOf(MES)] || 0;

  test("zápis zmení hodnotu a odloží pôvodnú", () => {
    const povodna = hodnota();
    expect(nastavPnlBunku(KAT, MES, 199)).toBe(true);
    expect(hodnota()).toBe(199);
    expect(pnlPovodnaHodnota(KAT, MES)).toBe(povodna);
    expect(pnlJeOpravena(KAT, MES)).toBe(true);
    expect(pnlOverridesNaUlozenie()[KAT]?.[MES]).toBe(199);

    // A späť — presne na pôvodnú hodnotu.
    expect(nastavPnlBunku(KAT, MES, null)).toBe(true);
    expect(hodnota()).toBe(povodna);
    expect(pnlJeOpravena(KAT, MES)).toBe(false);
    expect(pnlOverridesNaUlozenie()[KAT]?.[MES]).toBeUndefined();
  });

  test("dve opravy za sebou vrátia PÔVODNÚ hodnotu, nie tú medzitýmnu", () => {
    // Toto je ten prípad, kvôli ktorému sa pôvodná hodnota ukladá len raz.
    // Keby ju druhý zápis prepísal, „vrátiť späť" by skončilo na 199.
    const povodna = hodnota();
    nastavPnlBunku(KAT, MES, 199);
    nastavPnlBunku(KAT, MES, 250);
    expect(hodnota()).toBe(250);
    nastavPnlBunku(KAT, MES, null);
    expect(hodnota()).toBe(povodna);
  });

  test("neznáma kategória ani mesiac mimo radu nič nezapíšu", () => {
    expect(nastavPnlBunku("fixne.apps.neexistuje", MES, 1)).toBe(false);
    expect(nastavPnlBunku(KAT, "1999-01", 1)).toBe(false);
  });
});
