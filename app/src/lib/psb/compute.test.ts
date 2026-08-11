import { describe, expect, test } from "bun:test";

import {
  cenaZaSedenie,
  doPlnehoMesiaca,
  kotvaDat,
  menoKluc,
  najdiKlienta,
  ziskavanieKlientov,
  rodinaZKluca,
} from "./compute";
import { EMPTY_DATA } from "./types";
import type { PSBData, PaymentRow, SessionRow } from "./types";

/**
 * TESTY SÚ ZÁPISOM CHÝB, KTORÉ NÁS UŽ STÁLI ČAS.
 *
 * Nie sú tu preto, aby bolo pokrytie — sú tu preto, že každý jeden z nich
 * zodpovedá konkrétnemu nálezu z augusta 2026, keď sa zlé číslo objavilo na
 * obrazovke a Jerry ho musel nájsť očami. Typecheck ani build ani jednu z tých
 * chýb nechytili; všetky boli „kód sa preložil, len počítal inú vec".
 *
 * Preto sa testuje ARITMETIKA A PRAVIDLÁ, nie React. Komponenty sa overujú
 * preklikom na nasadenej verzii (to je vec, ktorú test nenahradí), ale
 * výpočet, ktorý sa dotýka koruny, má mať zápis, čo je správne.
 *
 * Spustenie: `bun test` v priečinku app/.
 */

// ── pomocníci na stavbu vzoriek ──────────────────────────────────────────────
const sedenie = (client: string, date: string, price: number, extra: Partial<SessionRow> = {}): SessionRow => ({
  date,
  time: "10:00",
  client,
  sessionTrainer: "Jerry",
  sessionName: "OFFLINE",
  sessionType: "OFFLINE",
  duration: 60,
  price,
  ...extra,
});

const platba = (client: string, date: string, amount: number, method = "bank"): PaymentRow => ({
  date,
  client,
  amount,
  method,
});

const data = (s: SessionRow[], p: PaymentRow[] = []): PSBData => ({ ...EMPTY_DATA, sessions: s, payments: p });

// ── Ø cena za sedenie ────────────────────────────────────────────────────────
describe("cenaZaSedenie", () => {
  // Nález 11. 8.: appka ju rátala štyrmi spôsobmi a ukazovala 1046 / 844 /
  // 1015 / 844. Príčina: 19,4 % sedení má v PTminderi cenu 0, lebo platba visí
  // na balíčku. Jediná definícia, čo o tú pätinu nepríde, sú PRIJATÉ PENIAZE
  // delené SEDENIAMI.
  test("ráta z prijatých peňazí, nie z ceny zapísanej pri sedení", () => {
    const d = data(
      [sedenie("Anna", "2026-01-05", 0), sedenie("Anna", "2026-01-12", 0)],
      [platba("Anna", "2026-01-02", 12000)],
    );
    // Dve sedenia kryté balíčkom (cena 0) + jedna platba 12 000 = 6 000 / sedenie.
    // Priemer z ceny pri sedení by dal 0 — a presne to bola tá chyba.
    expect(cenaZaSedenie(d, () => true).czk).toBe(6000);
  });

  test("váži sa súčtami, nie priemerom mesačných pomerov", () => {
    // Mesiac s jedným sedením a mesiac so stovkou nesmú vážiť rovnako.
    const s: SessionRow[] = [sedenie("A", "2026-01-10", 0)];
    for (let i = 1; i <= 99; i++) s.push(sedenie("B", `2026-02-${String((i % 28) + 1).padStart(2, "0")}`, 0));
    const d = data(s, [platba("A", "2026-01-10", 10000), platba("B", "2026-02-10", 99000)]);
    // Vážene: 109 000 / 100 = 1 090. Nevážene by to bolo (10 000 + 1 000) / 2 = 5 500.
    expect(Math.round(cenaZaSedenie(d, () => true).czk)).toBe(1090);
  });

  test("okno filtruje sedenia aj platby rovnako", () => {
    const d = data(
      [sedenie("A", "2025-12-10", 0), sedenie("A", "2026-01-10", 0)],
      [platba("A", "2025-12-01", 5000), platba("A", "2026-01-01", 3000)],
    );
    expect(cenaZaSedenie(d, (mk) => mk.startsWith("2026")).czk).toBe(3000);
    expect(cenaZaSedenie(d, (mk) => mk.startsWith("2025")).czk).toBe(5000);
  });

  test("platba bez klienta je súhrnný riadok reportu, nie tržba", () => {
    // monthlyFinance to ignoruje rovnako — inak by súčtový riadok z PTmindera
    // zdvojnásobil tržby.
    const d = data([sedenie("A", "2026-01-10", 0)], [platba("A", "2026-01-01", 1000), platba("", "2026-01-31", 999999)]);
    expect(cenaZaSedenie(d, () => true).czk).toBe(1000);
  });

  test("bez sedení nedelí nulou", () => {
    expect(cenaZaSedenie(data([], [platba("A", "2026-01-01", 5000)]), () => true).czk).toBe(0);
  });

  test("obmedzenie na skupinu klientov berie ich sedenia aj ich platby", () => {
    const d = data(
      [sedenie("Anna", "2026-01-05", 0), sedenie("Bob", "2026-01-06", 0)],
      [platba("Anna", "2026-01-02", 4000), platba("Bob", "2026-01-02", 10000)],
    );
    expect(cenaZaSedenie(d, () => true, new Set(["anna"])).czk).toBe(4000);
  });
});

// ── párovanie mien medzi dvoma zápismi ───────────────────────────────────────
describe("najdiKlienta", () => {
  // Nález 11. 8.: „Matěj Procházka" v BTC knihe a dopytoch vs „Matej
  // Prochadzka" v PTminderi. Prežilo to normName (dz vs z) a konverzia dopytov
  // toho človeka nevidela.
  const klienti = ["Matej Prochadzka", "Lucie Kafkova", "Anna Kadličkova"];

  test("presná zhoda vyhráva", () => {
    expect(najdiKlienta(klienti, "Anna Kadličkova")).toBe("Anna Kadličkova");
  });

  test("zhoda bez diakritiky", () => {
    expect(najdiKlienta(klienti, "anna kadlickova")).toBe("Anna Kadličkova");
  });

  test("fuzzy prežije iný prepis priezviska", () => {
    expect(najdiKlienta(klienti, "Matěj Procházka")).toBe("Matej Prochadzka");
    expect(najdiKlienta(klienti, "Lucia Kafková")).toBe("Lucie Kafkova");
  });

  test("presná zhoda vyhráva aj vtedy, keď je kľúč nejednoznačný", () => {
    // Pozor na poradie: „Jan Novák" je po odstránení diakritiky PRESNE
    // „Jan Novak", takže sa nájde hneď a fuzzy sa vôbec nespustí — hoci kľúč
    // zdieľa s Janou Novakovou. (Prvá verzia tohto testu čakala null a bola
    // to chyba v teste, nie v kóde.)
    const dvaja = ["Jan Novak", "Jana Novakova"];
    expect(menoKluc("Jan Novak")).toBe(menoKluc("Jana Novakova"));
    expect(najdiKlienta(dvaja, "Jan Novák")).toBe("Jan Novak");
  });

  test("pri KOLÍZII bez presnej zhody radšej nič — falošná zhoda je horšia než diera", () => {
    // Podľa výsledku sa zapisuje zdroj do overrides; označkovať cudzieho
    // klienta je horšie než nechať pole prázdne.
    const dvaja = ["Jan Novak", "Jana Novakova"];
    expect(najdiKlienta(dvaja, "Jano Novakovic")).toBeNull();
  });

  test("prázdne meno nikoho nenájde", () => {
    expect(najdiKlienta(klienti, "")).toBeNull();
  });

  test("neznáme meno nikoho nenájde", () => {
    expect(najdiKlienta(klienti, "Karel Zeman")).toBeNull();
  });
});

// ── kotva dát: rozrobený mesiac nie je hotový mesiac ──────────────────────────
describe("kotvaDat", () => {
  // Rodina chýb, čo sa vracala trikrát: zisk 34 155 Kč z desiatich dní augusta,
  // Zdravie firmy priemerujúce rozrobený mesiac, break-even −11k z dvoch
  // dobropisov. Kód, ktorý predpokladá, že dáta siahajú tam, kam kalendár.
  test("neúplný mesiac sa neráta ako plný", () => {
    const k = kotvaDat({ sessions: [{ date: "2026-08-11T00:00:00.000Z" }] });
    expect(k.mesiac).toBe("2026-08");
    expect(k.ciastocny).toBe(true);
    expect(k.plny).toBe("2026-07");
  });

  test("dáta do posledného dňa mesiaca = mesiac je plný", () => {
    const k = kotvaDat({ sessions: [{ date: "2026-07-31T00:00:00.000Z" }] });
    expect(k.ciastocny).toBe(false);
    expect(k.plny).toBe("2026-07");
  });

  test("prelom roka ide na december", () => {
    const k = kotvaDat({ sessions: [{ date: "2026-01-05T00:00:00.000Z" }] });
    expect(k.plny).toBe("2025-12");
  });

  test("kotvu posúva aj platba, nielen sedenie", () => {
    const k = kotvaDat({
      sessions: [{ date: "2026-06-30T00:00:00.000Z" }],
      payments: [{ date: "2026-07-31T00:00:00.000Z" }],
    });
    expect(k.plny).toBe("2026-07");
  });

  test("bez dát nehádže, len povie že nevie", () => {
    expect(kotvaDat({ sessions: [] }).plny).toBe("");
  });

  test("doPlnehoMesiaca odreže rozrobený mesiac", () => {
    const k = kotvaDat({ sessions: [{ date: "2026-08-11T00:00:00.000Z" }] });
    const rows = [{ m: "2026-06" }, { m: "2026-07" }, { m: "2026-08" }];
    expect(doPlnehoMesiaca(rows, k, (r) => r.m).map((r) => r.m)).toEqual(["2026-06", "2026-07"]);
  });
});

// ── rodina upozornenia (tlačidlo „Nehlásiť") ─────────────────────────────────
describe("rodinaZKluca", () => {
  // „Nehlásiť" musí umlčať DRUH upozornenia, nie jeden jeho výskyt — inak bola
  // tá istá vec zajtra späť a tlačidlo vyzeralo, že nefunguje.
  test("dátum aj holé číslo vypadnú z kľúča", () => {
    expect(rodinaZKluca("odmlcany|2026-08-09|Jan Kral")).toBe("odmlcany|Jan Kral");
    expect(rodinaZKluca("balicek|3|Anna")).toBe("balicek|Anna");
  });

  test("kľúč bez dátumu zostáva sám sebou", () => {
    expect(rodinaZKluca("chyba-najom")).toBe("chyba-najom");
  });

  test("kľúč zložený len z dátumu sa nezmaže na prázdno", () => {
    // Prázdna rodina by umlčala všetko — radšej nech je kľúčom sám seba.
    expect(rodinaZKluca("2026-08-09")).toBe("2026-08-09");
  });
});

// ── Deravé vedro ─────────────────────────────────────────────────────────────
//
// Jerryho námietka z 11. 8.: „18 potrebujem teraz, ale skutočne potrebujem 30."
// Voľné miesta sú statické číslo, klientela je prietok — kým zapĺňaš, tečie.
describe("ziskavanieKlientov", () => {
  /** i = 0 → 2025-07 … i = 11 → 2026-06. Okno má presne 12 mesiacov. */
  const MES = (i: number) => {
    const t = 2025 * 12 + 6 + i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  };

  // Dvaja prídu a jeden odíde každý mesiac. Odídení majú prvé sedenie PRED
  // oknom, inak by sa počítali aj ako príchod.
  const vzorka = (): PSBData => {
    const s: SessionRow[] = [];
    for (let i = 0; i < 12; i++) {
      for (const k of ["a", "b"]) {
        const meno = `Prisiel ${i}${k}`;
        // Päť sedení hneď v prvom mesiaci — inak by sa klient, ktorý prišiel
        // v poslednom mesiaci okna, nestihol dostať cez hranicu 5 sedení
        // a vzorka by tichým spôsobom stratila príchody.
        for (let d = 1; d <= 5; d++) s.push(sedenie(meno, `${MES(i)}-0${d}`, 0));
        for (let j = i; j < 12; j++) s.push(sedenie(meno, `${MES(j)}-15`, 0));
        s.push(sedenie(meno, "2026-06-30", 0));
      }
      const odch = `Odisiel ${i}`;
      s.push(sedenie(odch, "2025-01-10", 0));
      for (let k = 0; k < 4; k++) s.push(sedenie(odch, `${MES(i)}-0${k + 1}`, 0));
    }
    return { ...EMPTY_DATA, sessions: s };
  };

  test("odchod sa počíta z TICHA, nie zo zrušenia", () => {
    const z = ziskavanieKlientov(vzorka(), 18);
    expect(z.prichodMes).toBe(2);
    // Desať z dvanástich: kto odišiel v posledných dvoch mesiacoch, ešte
    // nestihol stíchnuť na 60 dní. Je to vlastnosť, nie chyba — ale znamená,
    // že čerstvé mesiace vždy vyzerajú bez odchodov.
    expect(z.odchodMes).toBeCloseTo(0.83, 2);
    expect(z.cistyMes).toBeCloseTo(1.17, 2);
  });

  test("treba získať VIAC než je voľných miest — to je celý zmysel", () => {
    const z = ziskavanieKlientov(vzorka(), 18);
    expect(z.trebaZiskat(6)).toBe(23);   // 18 + 0,83 × 6
    expect(z.trebaZiskat(12)).toBe(28);  // 18 + 10
    expect(z.trebaZiskat(0)).toBe(18);   // nikdy menej než voľné miesta
  });

  test("pri nulovom alebo zápornom prírastku sa nezaplní nikdy", () => {
    const s: SessionRow[] = [];
    for (let i = 0; i < 12; i++) {
      const meno = `X${i}`;
      s.push(sedenie(meno, "2025-01-10", 0));
      for (let k = 0; k < 4; k++) s.push(sedenie(meno, `${MES(i)}-0${k + 1}`, 0));
    }
    // Klient, ktorý drží kotvu na konci júna a neprišiel v okne.
    s.push(sedenie("Stary", "2025-01-01", 0));
    for (let k = 0; k < 3; k++) s.push(sedenie("Stary", `2026-06-1${k}`, 0));
    s.push(sedenie("Stary", "2026-06-30", 0));

    const z = ziskavanieKlientov({ ...EMPTY_DATA, sessions: s }, 18);
    expect(z.prichodMes).toBe(0);
    expect(z.cistyMes).toBeLessThan(0);
    expect(z.mesiacovNaZaplnenie).toBeNull();
  });

  test("okno končí posledným PLNÝM mesiacom, nie rozrobeným", () => {
    const z = ziskavanieKlientov(vzorka(), 18);
    expect(z.obdobie).toEqual({ od: "2025-07", do: "2026-06", mesiacov: 12 });
  });
});
