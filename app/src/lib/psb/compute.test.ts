import { describe, expect, test } from "bun:test";

import {
  cenaZaSedenie,
  doPlnehoMesiaca,
  kotvaDat,
  menoKluc,
  najdiKlienta,
  ziskavanieKlientov,
  rodinaZKluca,
  predictCash,
  deriveClients,
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
//
// Toky (príchod/odchod) sem prídu ZVONKU z `tokyKlientov`. Prvá verzia si ich
// rátala po svojom a dashboard hneď ukazoval dve rôzne čísla pre tú istú vec:
// dlaždica „+0,4 / mes." a karta pod ňou „+0,75". Testuje sa preto projekcia,
// nie meranie tokov.
describe("ziskavanieKlientov", () => {
  const toky = (prisloMes: number, odisloMes: number) => ({ prisloMes, odisloMes, aktivnych: 60 });

  test("treba získať VIAC než je voľných miest — to je celý zmysel", () => {
    const z = ziskavanieKlientov(toky(2.6, 1.8), 18);
    expect(z.trebaZiskat(6)).toBe(29);   // 18 + 1,8 × 6 = 28,8
    expect(z.trebaZiskat(12)).toBe(40);  // 18 + 21,6 = 39,6
  });

  test("bez odchodu je potrebné číslo presne počet voľných miest", () => {
    const z = ziskavanieKlientov(toky(2.6, 0), 18);
    expect(z.trebaZiskat(6)).toBe(18);
    expect(z.trebaZiskat(12)).toBe(18);
  });

  test("horizont nula = koľko chýba dnes", () => {
    expect(ziskavanieKlientov(toky(2.6, 1.8), 18).trebaZiskat(0)).toBe(18);
  });

  test("čas na zaplnenie ráta z ČISTÉHO prírastku, nie z príchodu", () => {
    const z = ziskavanieKlientov(toky(2.6, 1.8), 18);
    expect(z.cistyMes).toBeCloseTo(0.8, 2);
    // 18 / 0,8 = 22,5 → 23 mesiacov. Z príchodu 2,6 by vyšlo 7 a bola by to lož.
    expect(z.mesiacovNaZaplnenie).toBe(23);
  });

  test("pri nulovom alebo zápornom prírastku sa nezaplní nikdy", () => {
    expect(ziskavanieKlientov(toky(1.8, 1.8), 18).mesiacovNaZaplnenie).toBeNull();
    expect(ziskavanieKlientov(toky(1.0, 1.8), 18).mesiacovNaZaplnenie).toBeNull();
  });
});

// ── Návrat po pauze nie je nový klient ───────────────────────────────────────
//
// Kateřina Stoklásková: úvodný 14. 11. 2022, vrátila sa 19. 2. 2026. Dáta
// z PTmindera siahajú do januára 2025, takže ju appka videla ako nového
// klienta. V bežných číslach je to jedno — ale od septembra 2026 sa podľa
// počtu nových klientov meria, čo priniesla reklama, a návrat po pauze
// reklama nepriniesla.
describe("ziskavanieKlientov — vrátenie sa neráta ako príchod", () => {
  test("príchod je o jedného nižší, keď je klient označený ako návrat", () => {
    const beznavratu = ziskavanieKlientov({ prisloMes: 2, odisloMes: 1, aktivnych: 50 }, 10);
    const snavratom = ziskavanieKlientov({ prisloMes: 1.92, odisloMes: 1, aktivnych: 50 }, 10);
    expect(beznavratu.cistyMes).toBeGreaterThan(snavratom.cistyMes);
    // A hlavne: potrebné získanie sa tým NEZMENŠÍ — voľné miesta ostávajú.
    expect(snavratom.trebaZiskat(6)).toBe(beznavratu.trebaZiskat(6));
  });
});

/**
 * Odhad očakávaných tržieb — dva nálezy z 13. 8. 2026.
 *
 * Jerry klikol na „Tržby tento mesiac · Očakávané" a v zozname pätnástich ľudí
 * našiel jedného, kto tam nepatril, a nenašiel jedného, kto tam patriť mal.
 */
describe("predictCash", () => {
  const sedenie = (client: string, date: string, sessionType: SessionRow["sessionType"], price = 1150): SessionRow =>
    ({ date, time: "09:00", client, sessionTrainer: "Jerry", sessionName: "Tréning", sessionType, duration: 60, price });
  const platba = (client: string, date: string, amount: number): PaymentRow =>
    ({ date, client, amount, method: "bank" });
  const pred = (d: Partial<PSBData>) => {
    const data: PSBData = { ...EMPTY_DATA, ...d };
    return predictCash(data, deriveClients(data), 3);
  };
  const dniDozadu = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  /**
   * Horizont predpovede sa odvíja od POSLEDNEJ platby v dátach. Vzorka, kde je
   * najnovšia platba spred pol roka, by mala celé okno v minulosti a nikto by
   * do nej nespadol — preto do každej pribudne jedna dnešná platba.
   */
  const dnesnaPlatba = [platba("Kotva", dniDozadu(0), 9200)];
  const kotvaSedenia = Array.from({ length: 8 }, (_, i) => sedenie("Kotva", dniDozadu(56 - i * 7), "OFFLINE"));

  test("kto bol len na úvodnom, medzi očakávanými platbami nie je", () => {
    // Roman Pavlík: úvodný 5. 8., jedno sedenie, jedna platba 1 100 Kč za ten
    // úvodný. Stará podmienka ho pustila ďalej, lebo vylučovala malú platbu
    // len vtedy, keď ich bolo VIAC než jedna.
    const v = pred({
      sessions: [sedenie("Roman", dniDozadu(8), "UVODNE", 1100), ...kotvaSedenia],
      payments: [platba("Roman", dniDozadu(8), 1100), ...dnesnaPlatba],
    });
    expect(v.perClient.some((x) => x.name === "Roman")).toBe(false);
  });

  test("kto po úvodnom pokračoval, medzi očakávanými zostáva", () => {
    const v = pred({
      sessions: [
        sedenie("Petra", dniDozadu(70), "UVODNE"),
        ...Array.from({ length: 8 }, (_, i) => sedenie("Petra", dniDozadu(60 - i * 7), "OFFLINE")),
        ...kotvaSedenia,
      ],
      payments: [platba("Petra", dniDozadu(70), 9200), ...dnesnaPlatba],
    });
    expect(v.perClient.some((x) => x.name === "Petra")).toBe(true);
  });

  test("nulový zostatok pri starej platbe znamená obnovu TERAZ, nie o dva mesiace", () => {
    // Panagiotis Tsiolis: zaplatil v novembri, odvtedy odchodil všetko, export
    // hlási nula hodín — a model ho aj tak posielal na obnovu až do októbra,
    // lebo si z ceny balíčka dopočítal zostatok, ktorý už neexistuje.
    const v = pred({
      sessions: [
        ...Array.from({ length: 6 }, (_, i) => sedenie("Panagiotis", dniDozadu(45 - i * 7), "OFFLINE", 0)),
        ...kotvaSedenia,
      ],
      payments: [platba("Panagiotis", dniDozadu(260), 20550), ...dnesnaPlatba],
    });
    const x = v.perClient.find((p) => p.name === "Panagiotis");
    expect(x).toBeDefined();
    expect(x!.tyzdnov).toBeLessThan(1);
  });

  test("klient na dohodnutej pauze sa do odhadu neráta", () => {
    // Dan Kouřil ide 14. 8. na operáciu, Martin Špok príde až v septembri.
    // Obaja to majú napísané v denníku — a odhad s ich peniazmi aj tak počítal,
    // lebo pauzu nikto nezapol a predpoveď ju ani nepozerala.
    const zaklad = {
      sessions: [
        ...Array.from({ length: 8 }, (_, i) => sedenie("Dan", dniDozadu(60 - i * 7), "OFFLINE")),
        ...kotvaSedenia,
      ],
      payments: [platba("Dan", dniDozadu(70), 9200), ...dnesnaPlatba],
    };
    expect(pred(zaklad).perClient.some((x) => x.name === "Dan")).toBe(true);

    const naPauze = pred({
      ...zaklad,
      clientOverrides: { Dan: { status: `Pauza|${new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)}` } },
    });
    expect(naPauze.perClient.some((x) => x.name === "Dan")).toBe(false);
  });

  test("po skončení pauzy sa počíta ďalej", () => {
    const v = pred({
      sessions: [
        ...Array.from({ length: 8 }, (_, i) => sedenie("Dan", dniDozadu(60 - i * 7), "OFFLINE")),
        ...kotvaSedenia,
      ],
      payments: [platba("Dan", dniDozadu(70), 9200), ...dnesnaPlatba],
      clientOverrides: { Dan: { status: `Pauza|${dniDozadu(5)}` } },
    });
    expect(v.perClient.some((x) => x.name === "Dan")).toBe(true);
  });

  test("kto má obnovu ešte tento mesiac, v zozname JE", () => {
    // Graf mesiacov zámerne začína budúcim mesiacom. Zoznam ľudí sa z neho
    // plnil, takže obnova splatná dnes nemala kam spadnúť — a dashboard sa
    // pritom pýtal práve na tento mesiac.
    const v = pred({
      sessions: [
        ...Array.from({ length: 6 }, (_, i) => sedenie("Panagiotis", dniDozadu(45 - i * 7), "OFFLINE", 0)),
        ...kotvaSedenia,
      ],
      payments: [platba("Panagiotis", dniDozadu(260), 20550), ...dnesnaPlatba],
    });
    const teraz = new Date().toISOString().slice(0, 7);
    expect(v.perClient.find((x) => x.name === "Panagiotis")?.kedy).toBe(teraz);
    // Graf sa nemení: mesiace v ňom začínajú až za aktuálnym.
    expect(v.months.every((m) => m.month > teraz)).toBe(true);
  });
});
