import { describe, expect, test } from "bun:test";

import { buildAiContext } from "./aiContext";
import { cenaZaSedenie, type ClientAgg } from "./compute";
import { EMPTY_DATA } from "./types";
import type { PSBData, PaymentRow, SessionRow } from "./types";

/**
 * STAVBA KONTEXTU JE ČISTÁ FUNKCIA — a preto sa dá testovať bez modelu.
 *
 * Toto je jediné miesto v celej appke, kde sa chyba prejaví tak, že sa nedá
 * uvidieť očami: čísla na obrazovkách sú v poriadku, ale Jarvis hovorí iné,
 * lebo dostal iný podklad. Odhalí to len otázka položená naživo — a to je
 * dvadsať minút a peniaze za tokeny.
 *
 * Každý test nižšie je zápisom konkrétneho nálezu z testu Jarvisa 11. 8. 2026.
 *
 * Spustenie: `bun run test` v app/.
 */

// ── vzorka ───────────────────────────────────────────────────────────────────
const sedenie = (client: string, date: string, price = 0, extra: Partial<SessionRow> = {}): SessionRow => ({
  date: `${date}T00:00:00.000Z`,
  time: "10:00",
  client,
  sessionTrainer: "Jerry",
  sessionName: "OFFLINE",
  sessionType: "OFFLINE",
  duration: 60,
  price,
  ...extra,
});

const platba = (client: string, date: string, amount: number): PaymentRow => ({
  date: `${date}T00:00:00.000Z`,
  client,
  amount,
  method: "bank",
});

const klient = (name: string, sessions: SessionRow[], extra: Partial<ClientAgg> = {}): ClientAgg => ({
  name, sessions,
  sessionCount: sessions.length, totalHours: sessions.length, totalPrice: 0, paidAvg: 0, avgPrice: 0,
  firstSession: sessions[0]?.date || "", lastSession: sessions[sessions.length - 1]?.date || "",
  attendance: 1, segment: "Stabilný", trainers: { Jerry: sessions.length },
  primaryTrainer: "Jerry", primaryTrainerOverride: false, substituteCount: 0,
  statusAuto: "Aktívny", status: "Aktívny", statusOverride: false,
  specialRate: false, specialRateNote: "", trainerNote: "", contractSigned: false, bitcoin: false,
  duch: "", packageValidTo: "", zdroj: "", zdrojKto: "", narodeniny: "",
  clientType: "Balíček", is6m: false, v6m: "", membership: "", modality: "Offline",
  serviceCount: 0, packageRemaining: 0, packageTotal: 0, packageStatus: "", lenDoplnky: false,
  ...extra,
});

/**
 * Dva plné mesiace (jan, feb) a rozrobený marec — presne stav z 11. 8., keď
 * kotva ležala v strede augusta.
 */
function vzorka(): { data: PSBData; clients: Record<string, ClientAgg> } {
  const sessions: SessionRow[] = [];
  const payments: PaymentRow[] = [];
  for (let d = 1; d <= 20; d++) {
    sessions.push(sedenie("Anna Nova", `2026-01-${String(d).padStart(2, "0")}`));
    sessions.push(sedenie("Anna Nova", `2026-02-${String(d).padStart(2, "0")}`));
  }
  // Marec: len tri sedenia do 3. 3. — mesiac je rozrobený.
  for (let d = 1; d <= 3; d++) sessions.push(sedenie("Anna Nova", `2026-03-0${d}`));
  payments.push(platba("Anna Nova", "2026-01-02", 20000));
  payments.push(platba("Anna Nova", "2026-02-02", 20000));
  payments.push(platba("Anna Nova", "2026-03-02", 3000));

  const data: PSBData = { ...EMPTY_DATA, sessions, payments };
  const clients = { "Anna Nova": klient("Anna Nova", sessions) };
  return { data, clients };
}

const ctx = (kal?: Parameters<typeof buildAiContext>[5]) => {
  const { data, clients } = vzorka();
  return buildAiContext(data, clients, [], [], [], kal);
};

// ── Kotva dát ────────────────────────────────────────────────────────────────
//
// Nález 11. 8.: `monthlyFinance` končí BEŽIACIM mesiacom a kontext bral jeho
// posledný riadok ako „posledný mesiac". Jarvis potom na otázku o minulom
// mesiaci odpovedal jedenástimi dňami augusta (48 595 Kč) namiesto júla
// (199 463 Kč). Ten istý rozrobený mesiac padal aj do priemeru a do minima —
// „najhorší mesiac" tak bol mesiac, ktorý sa ešte len začal.
describe("kotva dát v kontexte", () => {
  test("posledný mesiac je posledný PLNÝ, nie rozrobený", () => {
    const c = ctx();
    expect(c.meta.kotvaDat.poslednyPlnyMesiac).toBe("2026-02");
    expect(c.meta.kotvaDat.beziaciMesiac).toBe("2026-03");
    expect(c.kpi.zarobkyPoslednyPlnyMesiac?.mesiac).not.toContain("mar");
    expect(c.zarobky.poslednyPlnyMesiac?.sedeni).toBe(20);
  });

  test("rozrobený mesiac je označený a nepadá do priemeru sedení", () => {
    const c = ctx();
    const marec = c.sedeniaTrend.mesacne.find((m) => m.mesiac.startsWith("mar"));
    expect(marec?.celkovo).toBe(3);
    expect((marec as { rozrobeny?: boolean }).rozrobeny).toBe(true);
    // Priemer musí byť 20 (dva plné mesiace po 20), nie 14,3 z troch mesiacov.
    expect(c.sedeniaTrend.priemerMesacne).toBe(20);
  });

  test("minimum nie je rozrobený mesiac — inak je „najhorší mesiac“ ten dnešný", () => {
    const c = ctx();
    expect(c.zarobky.minMesacne).toBe(c.zarobky.maxMesacne);
  });

  test("rozrobený mesiac sa nezahodí, len sa prizná zvlášť", () => {
    const c = ctx();
    expect(c.beziaciMesiac?.sedeni).toBe(3);
    expect(c.beziaciMesiac?.doDna).toBe("2026-03-03");
    // A stále je aj v mesačnom rade — Jarvis musí vedieť odpovedať aj na
    // „koľko sme zarobili doteraz tento mesiac".
    expect(c.zarobky.mesacne.some((m) => m.mesiac.startsWith("mar"))).toBe(true);
  });
});

// ── Ø cena za sedenie ────────────────────────────────────────────────────────
//
// Nález 11. 8.: appka sa zjednotila na „prijaté peniaze ÷ odtrénované sedenia",
// ale kontext posielal ďalej `paidAvg` — priemer z ceny ZAPÍSANEJ pri sedení.
// Pri 19 % sedení je tá cena nulová (platba visí na balíčku), takže Jarvis
// hovoril o vyše dvesto korún nižšie číslo než obrazovka hneď vedľa neho.
describe("cena za sedenie v kontexte", () => {
  test("sedí s kanonickou cenaZaSedenie do koruny", () => {
    const { data, clients } = vzorka();
    const c = buildAiContext(data, clients, [], [], []);
    const podlaAppky = Math.round(cenaZaSedenie(data, () => true, new Set(["anna nova"])).czk);
    expect(c.klientiDetail[0].priemCenaSedenia).toBe(podlaAppky);
  });

  test("neráta sa z ceny pri sedení — tá je pri balíčku nulová", () => {
    const c = ctx();
    // 43 000 Kč prijatých ÷ 43 sedení = 1 000 Kč. Zo zapísaných cien by vyšla 0.
    expect(c.klientiDetail[0].priemCenaSedenia).toBe(1000);
  });
});

// ── Kalendár ─────────────────────────────────────────────────────────────────
//
// Nález 11. 8.: kalendár si sťahovala len obrazovka Kalendár, do kontextu
// nešiel. Jarvis preto na „kde vidím zrušené tréningy" odpovedal, že to appka
// nesleduje — v tej chvíli mala v databáze 18 zrušených hodín.
describe("kalendár v kontexte", () => {
  const dnes = new Date().toISOString().slice(0, 10);
  const posun = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

  test("zrušené hodiny sú v kontexte a počítajú sa", () => {
    const c = ctx({
      udalosti: [{ zaciatok: `${posun(2)}T10:00`, klient: "Anna Nova", trener: "Jerry", typ: "trening" }],
      zmeny: [
        { kedy: dnes, druh: "zrusene", klient: "Anna Nova", nazov: null, pred: `${posun(1)}T15:00`, po: null, trener: "Jerry", poznamka: null },
        { kedy: dnes, druh: "zrusene", klient: "Petr Maly", nazov: null, pred: `${posun(-2)}T15:00`, po: null, trener: "Jerry", poznamka: "chorý" },
      ],
    });
    expect(c.kalendar?.zruseneSpolu).toBe(2);
    expect(c.kalendar?.zruseneNevysvetlene).toBe(1);
    expect(c.kalendar?.objednane).toHaveLength(1);
  });

  test("staršie zmeny než 30 dní sa nevozia so sebou", () => {
    const c = ctx({
      udalosti: [],
      zmeny: [{ kedy: posun(-90), druh: "zrusene", klient: "Anna Nova", nazov: null, pred: `${posun(-90)}T15:00`, po: null, trener: "Jerry", poznamka: null }],
    });
    expect(c.kalendar?.zruseneSpolu).toBe(0);
  });

  test("bez kalendára je kľúč null — nie prázdny zoznam, ktorý by vyzeral ako nula", () => {
    // Rozdiel, na ktorom celý nález stojí: „nesledujeme to" vs „sledujeme
    // a nič tam nie je". Prázdne pole by Jarvis prečítal ako druhé.
    expect(ctx().kalendar).toBeNull();
  });
});
