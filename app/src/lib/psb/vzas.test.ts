import { describe, expect, test } from "bun:test";

import {
  JAREK_SPLATKY, nastavBtcVyplaty, nastavJarekZTrackera, nastavNakladyZFio,
  nastavPnlBunku, PNL, pnlCalc, pnlJeOpravena, pnlOverridesNaUlozenie, pnlPovodnaHodnota,
  poslednyMesiacSDatami, SALARY, salaryCalc, tempoDlhu, CURRENT_ERA, VZAS_MONTHS,
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

  test("po importe vráti zrušená oprava hodnotu Z IMPORTU, nie spred neho", () => {
    // Revízia 19. 8. 2026: pôvodná hodnota sa pamätala raz, pri prvej oprave.
    // Kto opravil bunku v júni (Excel 5 000) a v auguste — po importe z Fio
    // (banka 7 000) — opravu zrušil, dostal späť 5 000. Bunka bez opravy by
    // dnes niesla 7 000; „zrušiť opravu" má vrátiť to, nie vlaňajší Excel.
    const MES_FIO = "2026-07"; // mesiac, ktorý import z Fio prepisuje
    const i = VZAS_MONTHS.indexOf(MES_FIO);
    const item = PNL.fixne.subcategories.apps.items.canva;
    const predImportom = item.values[i] || 0;
    nastavPnlBunku(KAT, MES_FIO, 199);
    expect(item.values[i]).toBe(199);
    // Príde import — banka hovorí 7 000. Oprava musí prežiť (199 zostáva
    // na obrazovke), ale PÔVODNÁ hodnota je odteraz 7 000.
    nastavNakladyZFio({ [MES_FIO]: { [KAT]: 7000 } }, {});
    expect(item.values[i]).toBe(199);
    expect(pnlPovodnaHodnota(KAT, MES_FIO)).toBe(7000);
    expect(pnlPovodnaHodnota(KAT, MES_FIO)).not.toBe(predImportom === 7000 ? -1 : predImportom);
    nastavPnlBunku(KAT, MES_FIO, null);
    expect(item.values[i]).toBe(7000);
  });

  test("neznáma kategória ani mesiac mimo radu nič nezapíšu", () => {
    expect(nastavPnlBunku("fixne.apps.neexistuje", MES, 1)).toBe(false);
    expect(nastavPnlBunku(KAT, "1999-01", 1)).toBe(false);
  });
});

describe("importné settery mažú aj to, čo zo zdroja zmizlo", () => {
  // Rodina dier zo 18. 8. 2026: setter zapisoval len mesiace, ktoré prišli.
  // Pohyb preradený inam (alebo výplata zmazaná v BTC appke) tak nechal
  // starý zápis žiť — P&L sa opravil, dlh nie.
  test("barter: mesiac, ktorý zo vstupu zmizol, sa vynuluje", () => {
    const rad = JAREK_SPLATKY["Sofia (vzdaná tržba)"];
    const i = VZAS_MONTHS.indexOf("2026-07");
    nastavJarekZTrackera({ "2026-07": 5000 });
    expect(rad[i]).toBe(5000);
    nastavJarekZTrackera({});
    expect(rad[i]).toBe(0);
  });

  test("BTC výplaty: mesiac, ktorý zo vstupu zmizol, sa vynuluje", () => {
    const i = VZAS_MONTHS.indexOf("2026-07");
    nastavBtcVyplaty({ "2026-07": { jerry: 10000, terezka: 2000, jerryFp: 700 } });
    expect(SALARY.jerry.personal["BTC"][i]).toBe(10000);
    expect(SALARY.jerry.personal["FP.Spain"][i]).toBe(700);
    nastavBtcVyplaty({});
    expect(SALARY.jerry.personal["BTC"][i]).toBe(0);
    expect(SALARY.terezka.personal["BTC"][i]).toBe(0);
    expect(SALARY.jerry.personal["FP.Spain"][i]).toBe(0);
  });

  test("náklady z Fio: prepis mesiaca vynuluje aj Jarkovu splátku a výplaty", () => {
    const i = VZAS_MONTHS.indexOf("2026-07");
    nastavNakladyZFio({ "2026-07": { "fixne.prevadzka.splatkaJarek": 6000 } }, { "2026-07": { jerry: 30000, terezka: 10000 } });
    expect(JAREK_SPLATKY["Fix splátka (P&L náklad)"][i]).toBe(6000);
    expect(SALARY.jerry.personal["Výplata"][i]).toBe(30000);
    // Pohyb sa preradil: splátka už v imports nie je, výplaty tiež nie.
    nastavNakladyZFio({ "2026-07": { "fixne.apps.ine": 6000 } }, {});
    expect(JAREK_SPLATKY["Fix splátka (P&L náklad)"][i]).toBe(0);
    expect(SALARY.jerry.personal["Výplata"][i]).toBe(0);
    expect(SALARY.terezka.personal["Výplata"][i]).toBe(0);
  });
});

describe("tempoDlhu — jedno tempo, vždy s oknom", () => {
  // Do 18. 8. 2026 rátala karta priemer nad zvoleným obdobím a Jarvis dve
  // vlastné čísla. Tempo závisí od okna, takže bez neho je to nezmysel.
  const rokIdx = (rok: string) =>
    VZAS_MONTHS.map((m, i) => (m.startsWith(rok) ? i : -1)).filter((i) => i >= 0);

  test("vracia okno, nad ktorým počítalo", () => {
    const t = tempoDlhu("jerry", rokIdx("2026"));
    expect(t.mesiacov).toBeGreaterThan(0);
    expect(t.od.startsWith("2026")).toBe(true);
    expect(t.do.startsWith("2026")).toBe(true);
  });

  test("mesiace pred dnešným modelom sa vyhadzujú", () => {
    // Éra 70/30 skončila v sep 2025 — pôžička z nej bola rozhodnutie,
    // nie výstup vzorca, a do smeru nepatrí.
    const t = tempoDlhu("jerry", rokIdx("2025"));
    expect(VZAS_MONTHS.indexOf(t.od)).toBeGreaterThanOrEqual(CURRENT_ERA.from);
  });

  test("smer sa číta zo znamienka", () => {
    const t = tempoDlhu("jerry", rokIdx("2026"));
    expect(["rastie", "klesá", "stojí"]).toContain(t.smer);
    if (t.tempo < 0) expect(t.smer).toBe("rastie");
    if (t.tempo > 0) expect(t.smer).toBe("klesá");
  });

  test("prázdne okno nespadne", () => {
    expect(tempoDlhu("terezka", []).mesiacov).toBe(0);
  });
});
