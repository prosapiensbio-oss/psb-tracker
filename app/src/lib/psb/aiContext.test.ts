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
  duch: "", packageValidTo: "", zdroj: "", zdrojKto: "", narodeniny: "", prvyKontakt: "", vratenie: false,
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

// ── Marketing ────────────────────────────────────────────────────────────────
//
// Jarvis má byť plánovač marketingu — na to potrebuje čísla, nie len knihy.
// Dva testy: že tam tie čísla naozaj sú, a že sa nezmestili na úkor klientov.
describe("marketing v kontexte", () => {
  test("obsah je agregovaný po kategórii háku a zoradený podľa uložení", () => {
    const m = ctx().marketing;
    expect(m.obsahPodlaHooku.length).toBeGreaterThan(0);
    for (let i = 1; i < m.obsahPodlaHooku.length; i++) {
      expect(m.obsahPodlaHooku[i - 1].ulozeniaNaKus).toBeGreaterThanOrEqual(m.obsahPodlaHooku[i].ulozeniaNaKus);
    }
    // Poradie musí byť napísané číslom, nie len naznačené zoradením: model
    // zoznam raz prečítal odzadu a označil dve NAJHORŠIE kategórie za
    // najlepšie. Rovnako zhrnutie — záver, ktorý sa dá spočítať, sa počíta.
    expect(m.obsahPodlaHooku[0].poradie).toContain("1.");
    expect(m.obsahZhrnutie).toContain(m.obsahPodlaHooku[0].kategoria);
    expect(m.obsahZhrnutie).toContain(m.obsahPodlaHooku[m.obsahPodlaHooku.length - 1].kategoria);
    // Najlepší kus musí mať aspoň toľko uložení + zdieľaní ako najhorší.
    const naj = m.obsahNajlepsie[0], hor = m.obsahNajhorsie[m.obsahNajhorsie.length - 1];
    expect(naj.ulozenia + naj.zdielania).toBeGreaterThanOrEqual(hor.ulozenia + hor.zdielania);
  });

  test("marketing je PRED zoznamom klientov — rez odzadu smie brať len klientov", () => {
    // Server reže kontext odzadu (chat.ts, STROP). Poradie kľúčov v JSONe je
    // poradie zápisu, takže čo je vzadu, to odpadne prvé. Klienti sa dajú
    // dotiahnuť dopytom, marketingová agregácia nie.
    const kluce = Object.keys(ctx());
    expect(kluce.indexOf("marketing")).toBeLessThan(kluce.indexOf("klientiDetail"));
    expect(kluce.indexOf("naCoSaPozriet")).toBe(0);
  });

  test("celý kontext sa zmestí pod serverový strop 180 000 znakov", () => {
    // Vzorka je malá, tak sa meria to, čo NERASTIE s počtom klientov:
    // marketing, kalendár a P&L. Keď táto pevná časť prekročí 60 kB, na
    // 119 klientov už strop nevyjde a začnú miznúť zo zoznamu.
    const c = ctx() as Record<string, unknown>;
    const pevne = ["marketing", "pnlPolozky", "pnlSuhrn", "zarobky", "sedeniaTrend", "tyzdennePodlaTrenera"]
      .reduce((a, k) => a + JSON.stringify(c[k] ?? null).length, 0);
    expect(pevne).toBeLessThan(60000);
  });

  test("marketing má kotvu — chýbajúci mesiac sa nesmie čítať ako nula", () => {
    // Nález 11. 8., druhý toho dňa z tej istej rodiny: MKT_MESACNE končilo
    // júnom, júl bol len v databáze, a Jarvis z toho vyrobil „v júli spadol
    // obsah na nulu" — pritom júl mal 7 reelov a 64 stories, najviac za rok.
    const k = ctx().marketing.kotva;
    expect(k.instagramDo).toBe("2026-06");
    expect(k.poznamka).toContain("NIE JE");
    expect(k.poznamka).toContain("nenahraté");
  });

  test("zdroje klientov vedia, koľkým chýba — inak sa percentá čítajú zle", () => {
    const z = ctx().marketing.zdrojeKlientov;
    // Vzorkový klient zdroj nemá, takže musí byť započítaný medzi chýbajúce.
    expect(z.bezZdroja).toBe(1);
    expect(Object.keys(z.klienti)).toHaveLength(0);
  });
});

// ── Lievik a ekonomika dopytu ────────────────────────────────────────────────
//
// Nález z 12. 8., a bol môj: v kontexte stáli vedľa seba klienti za CELÚ
// históriu a dopyty od januára 2026. Podiel z dvoch rôznych okien vychádza cez
// sto percent a znie presvedčivo — Jarvis by tvrdil „Instagram konvertuje na
// 190 %" a plánoval by podľa toho rozpočet.
describe("lievik — konverzia nad rovnakým obdobím", () => {
  const sLeadmi = (leads: { name: string; source: string }[], sedeniPodlaMena: Record<string, number>) => {
    const { data } = vzorka();
    const sessions: SessionRow[] = [];
    for (const [meno, n] of Object.entries(sedeniPodlaMena)) {
      for (let i = 0; i < n; i++) sessions.push(sedenie(meno, `2026-02-${String((i % 28) + 1).padStart(2, "0")}`));
    }
    const clients: Record<string, ClientAgg> = {};
    for (const [meno, n] of Object.entries(sedeniPodlaMena)) {
      clients[meno] = klient(meno, sessions.filter((s) => s.client === meno), { sessionCount: n });
    }
    const d: PSBData = { ...data, sessions: [...data.sessions, ...sessions], leads: leads.map((l, i) => ({
      id: `l${i}`, date: "2026-02-01", name: l.name, source: l.source as never, referrer: "",
      status: "novy" as never, note: "", email: "", telefon: "", kampan: "", utm: "", stranka: "",
      odpovedaneAt: "", dovod: "", createdAt: "2026-02-01T09:00:00.000Z",
    })) };
    return buildAiContext(d, { ...vzorka().clients, ...clients }, [], [], []);
  };

  test("konverzia sa počíta z dopytov, nie z klientov za celú históriu", () => {
    // Tri dopyty, dvaja z nich zostali (5+ sedení), jeden prišiel dvakrát.
    const c = sLeadmi(
      [{ name: "Anna Zostala", source: "instagram" }, { name: "Bob Zostal", source: "instagram" }, { name: "Cyril Zmizol", source: "instagram" }],
      { "Anna Zostala": 8, "Bob Zostal": 6, "Cyril Zmizol": 2 },
    );
    expect(c.marketing.lievik.spolu).toBe(3);
    expect(c.marketing.lievik.trenovalo).toBe(3);
    expect(c.marketing.lievik.zostalo).toBe(2);
    expect(c.marketing.lievik.zostaloPct).toBe(67);
    // A NIKDY nie viac než sto percent — to bola tá pôvodná chyba.
    expect(c.marketing.lievik.zostaloPct).toBeLessThanOrEqual(100);
    expect(c.marketing.lievik.podlaZdroja.instagram.zostaloPct).toBe(67);
  });

  test("mená sa párujú cez diakritiku — inak konverzia vyjde nižšia", () => {
    // „Lukáš Hanus" v dopyte a „Lukas Hanus" v PTminderi je jeden človek.
    const c = sLeadmi([{ name: "Lukáš Hanuš", source: "google" }], { "Lukas Hanus": 9 });
    expect(c.marketing.lievik.zostalo).toBe(1);
  });

  test("ten istý človek dvakrát v dopytoch sa počíta raz", () => {
    const c = sLeadmi(
      [{ name: "Anna Zostala", source: "web" }, { name: "anna zostala", source: "web" }],
      { "Anna Zostala": 7 },
    );
    expect(c.marketing.lievik.spolu).toBe(1);
  });

  test("zdrojeKlientov varuje, že sa z neho konverzia počítať nesmie", () => {
    // Text je poistka proti presne tomu deleniu, ktoré tam predtým lákalo.
    expect(ctx().marketing.zdrojeKlientov.poznamka).toContain("NESMIE");
    expect(ctx().marketing.zdrojeKlientov).not.toHaveProperty("dopyty");
  });
});
