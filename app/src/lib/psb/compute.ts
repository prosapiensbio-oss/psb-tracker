// All derived analytics for the PSB Tracker. Pure functions over PSBData —
// no browser globals. Reused across every module.
import { daysBetween, fmtDMY, monthKey, monthLabel, monthsBetween, normName, quarterKey, quarterLabel, weekKey, weekLabel } from "./format";
import { menoZNazvuUvodneho } from "./kalendar";
import { BARTER_KLIENTI } from "./vzas";
import { podozriveCisla, type Podiel } from "./kontrolaDat";
import type {
  Lead,
  PackageRow,
  PaymentRow,
  PSBData,
  SessionRow,
} from "./types";

export const TRAINERS = ["Jerry", "Terezka"] as const;
export type TrainerName = string;

// Group a raw membership name into a friendly package bucket (shared by the
// dashboard + Klienti donuts and the Klienti package filter).
/**
 * Názvy, ktoré NIE SÚ balíček hodín — dokúpené hodiny a paušály. Jedna kópia
 * pre `membershipBucket` aj `jeDoplnok` v deriveClients: nový názov produktu
 * stačí dopísať sem, inak sa skupina balíčka a `lenDoplnky` rozídu.
 */
const DOPLNKOVY_NAZOV = /doplnenie|za protokol|členství/i;

export const membershipBucket = (m: string): string => {
  const s = (m || "").toLowerCase();
  if (/s viazanost/.test(s)) return "6h S viazanostou (6M)";
  if (/one year|ročn|rok/.test(s)) return "Ročné (ONE YEAR)";
  // "^on[ -]" matches the online product prefix ("ON - 6h…") without catching
  // words that merely start with "on" (e.g. "ONE YEAR", handled just above).
  if (/^on[ -]|online/.test(s)) return "Online balíček";
  if (/18 hod/.test(s)) return "18 hodín";
  if (/8 hod/.test(s)) return "8 hodín";
  if (/1 hod/.test(s)) return "1 hodina";
  if (/bez viazanosti/.test(s)) return "6h BEZ viazanosti";
  // Doplnenie je dokúpená hodina k paušálnemu členstvu (GOLD/SILVER/DIAMOND/
  // ONE), nie balíček. Ako názov skupiny to znelo ako produkt, ktorý si klient
  // kúpil — pritom hovorí len to, že balíček s hodinami evidovaný nemá.
  if (DOPLNKOVY_NAZOV.test(s)) return "Členstvo (bez balíčka hodín)";
  if (/special|špeci/.test(s)) return "Špeciál";
  if (!m) return "Bez balíčka";
  return "Iné";
};
export const MEMBERSHIP_ORDER = [
  "6h S viazanostou (6M)",
  "6h BEZ viazanosti",
  "8 hodín",
  "18 hodín",
  "1 hodina",
  "Online balíček",
  "Ročné (ONE YEAR)",
  "Členstvo (bez balíčka hodín)",
  "Špeciál",
  "Bez balíčka",
  "Iné",
] as const;

// ── segmentation window ──────────────────────────────────────────────────────
const SEG_WEEKS = 18;
const ANCHOR_H = 1.08;
const STABLE_H = 0.66;
const SPORADIC_H = 0.33;
export const TARGET_H = 29; // ideal weekly hours per trainer (golden middle of 24–34)
export const ZONE_LO = 24;
export const ZONE_HI = 34;

const refNow = (data: PSBData): Date => {
  let max = 0;
  for (const s of data.sessions) {
    const t = new Date(s.date).getTime();
    if (t > max) max = t;
  }
  const now = Date.now();
  // Use the later of "today" and the newest data point so a fresh live upload
  // and an all-historical seed both behave sensibly.
  return new Date(Math.max(now, max || now));
};

const lastWeekKeys = (ref: Date): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < SEG_WEEKS; i++) {
    const d = new Date(ref.getTime() - i * 7 * 86400000);
    set.add(weekKey(d.toISOString()));
  }
  return set;
};

export type ClientAgg = {
  name: string;
  sessions: SessionRow[];
  sessionCount: number;
  totalHours: number;
  totalPrice: number;
  paidAvg: number;
  avgPrice: number;
  firstSession: string;
  lastSession: string;
  attendance: number; // 0..1 over last 18 weeks
  segment: "Anchor" | "Stabilný" | "Sporadický";
  trainers: Record<string, number>;
  /** Sedenia za posledných 6 mesiacov — podľa nich sa určuje primárny tréner. */
  trainersNedavno: Record<string, number>;
  primaryTrainer: string;
  primaryTrainerOverride: boolean;
  substituteCount: number;
  statusAuto: string;
  status: string;
  statusOverride: boolean;
  pauseUntil?: string; // ISO date — when a "Pauza" is meant to end (from status override "Pauza|YYYY-MM-DD")
  specialRate: boolean;
  specialRateNote: string;
  trainerNote: string;
  contractSigned: boolean;
  bitcoin: boolean;
  duch: string;
  /** Skutočný koniec platnosti balíčka z exportu — prázdne, ak ho export nemá. */
  packageValidTo: string;
  zdroj: string;
  zdrojKto: string;
  /** Dátum narodenia (YYYY-MM-DD), prázdne = nevyplnené. */
  narodeniny: string;
  /**
   * Prvý kontakt, keď je skorší než prvé sedenie v dátach — klient, ktorý sa
   * vrátil po pauze. Prázdne = appka rozhoduje sama.
   */
  prvyKontakt: string;
  /** Vrátil sa po pauze, teda NIE je nový klient. */
  vratenie: boolean;
  clientType: "6M Predplatné" | "Balíček";
  is6m: boolean;
  /** Ručná oprava príslušnosti k 6M: "" = appka rozhoduje, "ano" / "nie". */
  v6m: string;
  /** Prečo po úvodnom tréningu už neprišiel. Prázdne = nikto to nezapísal. */
  precoNeprisiel: string;
  membership: string; // current product from Packages report (e.g. "OFF - 6h S viazanostou")
  modality: "Offline" | "Online";
  serviceCount: number;
  packageRemaining: number;
  packageTotal: number;
  packageStatus: string;
  /** Klient má v exporte len doplnky k členstvu, nie balíček s hodinami. */
  lenDoplnky: boolean;
};

// A client is in the 6M process if a "S viazanostou" service was sold to them
// OR their current membership (Packages report) is a "S viazanostou" product.
// The service report attributes all such sales to the seller (Jerry), so the
// packages source is essential to catch the other trainer's 6M clients.
export function sixMClientSet(data: PSBData): Set<string> {
  const set = new Set<string>();
  for (const s of data.services) if (s.is6m) set.add(s.client);
  for (const p of data.packages) if (/s viazanost/i.test(p.package)) set.add(p.client);
  // Ručná oprava má posledné slovo. Pravidlo hore je správne a zostáva
  // (balíček „S viazanostou" a platba 6 990 Kč SÚ 6M členstvo — Jerry to
  // potvrdil 9. 8. 2026), ale odvodenie je stále len odvodenie: klient si
  // môže viazanosť kúpiť a do procesu nevstúpiť. Preto override, nie výnimka
  // v pravidle — pravidlo zostáva čitateľné a výnimky sú vidieť ako výnimky.
  for (const [meno, ov] of Object.entries(data.clientOverrides || {})) {
    if (ov?.v6m === "nie") set.delete(meno);
    else if (ov?.v6m === "ano") set.add(meno);
  }
  return set;
}

export function deriveClients(data: PSBData): Record<string, ClientAgg> {
  // Šesť mesiacov: dosť dlho na to, aby jeden zástup nerozhodol, a dosť krátko
  // na to, aby sa zmena trénera prejavila v tej istej sezóne.
  const hranicaNedavnych = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);

  const ref = refNow(data);
  const window = lastWeekKeys(ref);
  const map: Record<string, ClientAgg> = {};

  for (const s of data.sessions) {
    let c = map[s.client];
    if (!c) {
      c = map[s.client] = {
        name: s.client,
        sessions: [],
        sessionCount: 0,
        totalHours: 0,
        totalPrice: 0,
        paidAvg: 0,
        avgPrice: 0,
        firstSession: s.date,
        lastSession: s.date,
        attendance: 0,
        segment: "Sporadický",
        trainers: {},
        trainersNedavno: {},
        primaryTrainer: "—",
        primaryTrainerOverride: false,
        substituteCount: 0,
        statusAuto: "Neaktívny",
        status: "Neaktívny",
        statusOverride: false,
        specialRate: false,
        specialRateNote: "",
        trainerNote: "",
        contractSigned: false,
        bitcoin: false,
        duch: "",
        packageValidTo: "",
        zdroj: "",
        zdrojKto: "",
        narodeniny: "",
        prvyKontakt: "",
        vratenie: false,
        clientType: "Balíček",
        is6m: false,
        v6m: "",
        precoNeprisiel: "",
        membership: "",
        modality: "Offline",
        serviceCount: 0,
        packageRemaining: 0,
        packageTotal: 0,
        packageStatus: "",
        lenDoplnky: false,
      };
    }
    c.sessions.push(s);
    c.trainers[s.sessionTrainer] = (c.trainers[s.sessionTrainer] || 0) + 1;
    // Aj oddelene za posledného pol roka — kto klienta trénuje TERAZ.
    if (s.date >= hranicaNedavnych) {
      c.trainersNedavno[s.sessionTrainer] = (c.trainersNedavno[s.sessionTrainer] || 0) + 1;
    }
    if (s.date < c.firstSession) c.firstSession = s.date;
    if (s.date > c.lastSession) c.lastSession = s.date;
    c.totalHours += s.duration / 60;
    c.totalPrice += s.price;
  }

  const sixMSet = sixMClientSet(data);
  const serviceCounts: Record<string, number> = {};
  for (const s of data.services) serviceCounts[s.client] = (serviceCounts[s.client] || 0) + 1;
  const packByClient: Record<string, PackageRow[]> = {};
  for (const p of data.packages) (packByClient[p.client] ||= []).push(p);

  for (const c of Object.values(map)) {
    c.sessionCount = c.sessions.length;
    c.avgPrice = c.sessionCount ? c.totalPrice / c.sessionCount : 0;
    const paid = c.sessions.filter((s) => s.price > 0);
    c.paidAvg = paid.length ? paid.reduce((a, s) => a + s.price, 0) / paid.length : 0;

    const clientWeeks = new Set(c.sessions.map((s) => weekKey(s.date)));
    let hit = 0;
    for (const w of clientWeeks) if (window.has(w)) hit++;
    // Menovateľ je počet týždňov, ktoré klient MOHOL odchodiť — nie vždy 18.
    // Predtým sa delilo natvrdo osemnástimi, takže klient, ktorý chodí dva
    // týždne, vyšiel na 2/18 = 0,11 a appka ho označila za neaktívneho a skryla
    // ho zo zoznamu klientov. Merala ho za obdobie, v ktorom ešte neexistoval.
    // Dolná hranica 6 týždňov bráni opačnému extrému: jeden tréning v prvom
    // týždni by inak spravil 1/1 = Anchor.
    const prve = c.sessions.reduce((min, s) => (s.date < min ? s.date : min), c.sessions[0]?.date || "");
    const tyzdnovOdZaciatku = prve ? Math.floor(daysBetween(prve, new Date()) / 7) + 1 : SEG_WEEKS;
    c.attendance = hit / Math.max(6, Math.min(SEG_WEEKS, tyzdnovOdZaciatku));
    // Segment potrebuje aj ČAS, nielen pravidelnosť.
    //
    // Predtým stačila dochádzka za posledných 18 týždňov, takže klient s dvoma
    // mesiacmi histórie vyšiel ako Anchor, kým Jaroslav Broskva (19 mesiacov,
    // 129 sedení) nie — stačilo, aby mal v poslednom okne dovolenku. To je
    // presne naopak, než čo slovo „anchor" znamená: klient, ktorého strata bolí
    // najviac. Dva mesiace nikoho takým nespravia.
    const mesiacovKlienta = c.firstSession && c.lastSession
      ? daysBetween(c.firstSession, new Date(c.lastSession)) / 30.4
      : 0;
    c.segment =
      mesiacovKlienta >= 6 && c.attendance >= 0.5 ? "Anchor"
      : c.attendance >= 0.5 || (mesiacovKlienta >= 6 && c.attendance >= 0.35) ? "Stabilný"
      : "Sporadický";

    const ov = data.clientOverrides?.[c.name];
    // PRIMÁRNY TRÉNER SA URČUJE Z POSLEDNÝCH ŠIESTICH MESIACOV.
    //
    // Do 24. 8. 2026 rozhodoval počet sedení za CELÝ ŽIVOT klienta a klient,
    // ktorý prešiel k inému trénerovi, zostal navždy pripísaný tomu prvému.
    // Natália Pečková mala 55 sedení s Matyášom (naposledy v marci) a 26
    // s Jerrym (naposledy 19. 8.) — appka ju stále viedla ako Matyášovu,
    // a keďže Matyáš nie je v prepínači, jej narodeniny svietili OBOM.
    // Terezka tak dostávala upozornenia na Jerryho klientku.
    //
    // Keď klient za pol roka netrénoval, platí celoživotný pomer — inak by
    // sa každý, kto má pauzu, ocitol bez trénera.
    const nedavne = Object.entries(c.trainersNedavno).sort((a, b) => b[1] - a[1])[0]?.[0];
    const autoPrimary = nedavne
      || Object.entries(c.trainers).sort((a, b) => b[1] - a[1])[0]?.[0]
      || "—";
    c.primaryTrainer = ov?.primaryTrainer || autoPrimary;
    c.primaryTrainerOverride = !!ov?.primaryTrainer;
    c.substituteCount = c.sessions.filter((s) => s.sessionTrainer !== c.primaryTrainer).length;

    c.statusAuto =
      c.attendance >= 0.5 ? "Aktívny" : c.attendance >= 0.16 ? "Sporadický" : "Neaktívny";
    // A "Pauza" override may carry an end date encoded as "Pauza|YYYY-MM-DD".
    const rawStatus = ov?.status || null;
    if (rawStatus && rawStatus.startsWith("Pauza")) {
      c.status = "Pauza";
      const bar = rawStatus.indexOf("|");
      c.pauseUntil = bar >= 0 ? rawStatus.slice(bar + 1).trim() || undefined : undefined;
    } else {
      c.status = rawStatus || c.statusAuto;
      c.pauseUntil = undefined;
    }
    c.statusOverride = !!ov?.status;
    c.specialRate = !!ov?.specialRate;
    c.specialRateNote = ov?.specialRateNote || "";
    c.trainerNote = ov?.trainerNote || "";
    c.contractSigned = !!ov?.contractSigned;
    c.bitcoin = !!ov?.bitcoin;
    c.duch = ov?.duch || "";
    c.zdroj = ov?.zdroj || "";
    c.zdrojKto = ov?.zdrojKto || "";
    c.narodeniny = ov?.narodeniny || "";
    // Vrátenie sa nepočíta ako príchod nového klienta — od septembra sa podľa
    // počtu nových klientov meria, čo priniesla reklama, a návrat po pauze
    // reklama nepriniesla.
    c.prvyKontakt = ov?.prvyKontakt || "";
    c.vratenie = !!(c.prvyKontakt && c.firstSession && c.prvyKontakt.slice(0, 10) < c.firstSession.slice(0, 10));
    c.v6m = String(ov?.v6m || "");
    c.precoNeprisiel = String(ov?.precoNeprisiel || "");
    c.is6m = sixMSet.has(c.name);
    c.clientType = c.is6m ? "6M Predplatné" : "Balíček";
    c.serviceCount = serviceCounts[c.name] || 0;

    const packs = packByClient[c.name] || [];
    // Dva riadky toho istého balíčka sú NORMÁLNY stav, nie chyba v dátach.
    //
    // Jerryho pravidlo, doslova: „Lenka si platí 18 h, ktoré platia 6 mesiacov,
    // ale keďže chodí 2× týždenne, minie ich za 3. Preto tam to jedno členstvo
    // 0/18 stále plynie — samo prirodzene odíde, keď skončí jeho platnosť.
    // Kde je 0/18, to je už neplatné; kde je x/18, to stále funguje."
    //
    // Čiže: riadok so zostatkom je ten živý, nulový je dobehnutý a čaká, kým mu
    // vyprší platnosť. Nikdy sa nesčítavajú — súčet by u Lenky dal 2/35 a appka
    // by tvrdila, že má zaplatených 35 hodín. Ak by boli nulové oba, berie sa
    // ten s väčším celkom (významnejší balíček).
    //
    // „Doplnenie členstva" a „Za protokol" sa do výberu neberú, kým existuje
    // čokoľvek iné. Nie sú to balíčky — sú to jednotlivé hodiny dokúpené k
    // paušálnemu členstvu (GOLD/SILVER/DIAMOND/ONE), takže v exporte stoja
    // navždy na 0/N. Appka ich brala ako aktuálny balíček a hlásila „došli
    // hodiny — čas na ďalší balíček" u 40 zo 73 klientov, ktorým nič
    // nekončilo: Tomáš Krčmar má DIAMOND členstvo a 12 tréningov za osem
    // týždňov, a napriek tomu svietil ako klient na konci balíčka.
    // „členstv í" (české ČLENSTVÍ ONE) je paušál, ktorý v exporte stojí na 0/1
    // alebo 0/2 — nie balíček hodín. Pozor na rozdiel: Broskvov „ONE YEAR" je
    // skutočný ročný balíček (62/78) a ten sa vylúčiť nesmie, preto sa hľadá
    // české „členství", nie slovo „one".
    const jeDoplnok = (p: string) => DOPLNKOVY_NAZOV.test(p || "");
    const skutocne = packs.filter((p) => !jeDoplnok(p.package));
    const zdroj = skutocne.length ? skutocne : packs;
    // Ktorý riadok je AKTUÁLNY balíček: rozhoduje platnosť a dátum, nie zostatok.
    //
    // Pôvodné „ber ten s najväčším zostatkom" malo preskočiť dochodené
    // historické riadky (nový 6/6 vedľa starého 0/6) — lenže Lenka mala
    // v exporte starý balíček 2/17 vedľa aktuálneho 0/18 a pravidlo vybralo
    // ten starý: PTminder ukazoval 0, karta tvrdila 2. Zostatok nehovorí,
    // ktorý balíček je ten živý — hovorí to platnosť.
    //
    // Poradie: balíček platný DNES pred neplatným → novší valid_from (potom
    // added) pred starším → a až pri riadkoch úplne bez dátumov (starý formát
    // exportu) zostáva pôvodná heuristika zostatku. Tú ambiguitu vyrieši až
    // nový upload — dnešný export dátumy nesie.
    const dnesPack = new Date().toISOString().slice(0, 10);
    const platnyDnes = (p: typeof zdroj[number]) =>
      !!p.validFrom && !!p.validTo && p.validFrom <= dnesPack && dnesPack <= p.validTo ? 1 : 0;
    const datumPack = (p: typeof zdroj[number]) => p.validFrom || p.added || "";
    const active = zdroj.slice().sort((a, b) =>
      platnyDnes(b) - platnyDnes(a) ||
      datumPack(b).localeCompare(datumPack(a)) ||
      b.remaining - a.remaining || b.total - a.total,
    )[0];
    // Klient, ktorý má LEN doplnky, nemá evidovaný balíček — má členstvo.
    // Tvrdiť o ňom „0 z 3 hodín" je nepravda o produkte, ktorý si kúpil.
    c.lenDoplnky = skutocne.length === 0 && packs.length > 0;
    c.packageRemaining = active?.remaining ?? 0;
    // Starý import vedel zapísať balíček ako 0/0, hoci názov hovorí „6h" —
    // Hanus potom svietil s odznakom bez menovateľa. Keď export total nedal,
    // vezme sa z názvu; kto číslo v názve nemá, zostáva na nule a karta
    // o ňom mlčí ako doteraz.
    const totalZNazvu = Number(/(\d+)\s*h/i.exec(active?.package || "")?.[1] || 0);
    c.packageTotal = (active?.total || totalZNazvu) ?? 0;
    c.packageStatus = active?.status || "";
    c.membership = active?.package || "";
    c.packageValidTo = active?.validTo || "";

    let off = 0;
    let on = 0;
    for (const s of c.sessions) s.sessionType === "OFFLINE" || s.sessionType === "UVODNE" ? off++ : on++;
    c.modality = on > off ? "Online" : "Offline";
  }
  return map;
}

// ── 6M tracker ───────────────────────────────────────────────────────────────
export type SixMRow = {
  client: string;
  startDate: string;
  price: number;
  primaryTrainer: string;
  months: number;
  phase: "Obnova" | "Integrácia" | "Udržateľnosť";
  monthInPhase: number;
  alert: string;
  alertTone: "red" | "orange" | "";
  historyBefore: string;
  lastSession?: string;
  contractSigned: boolean;
  trainerNote: string;
};

export function deriveSixM(data: PSBData, clients: Record<string, ClientAgg>): SixMRow[] {
  const members = sixMClientSet(data);
  // Earliest 6M signal per client: a "S viazanostou" service, or a 6990 monthly
  // payment (the recurring price). This recovers the true start for clients
  // whose sale isn't in the service report (e.g. the other trainer's clients).
  const first: Record<string, { date: string; trainer: string; price: number }> = {};
  const consider = (client: string, date: string, trainer: string, price: number) => {
    if (!members.has(client)) return;
    if (!first[client] || date < first[client].date) first[client] = { date, trainer, price };
  };
  for (const s of data.services) if (s.is6m) consider(s.client, s.date, s.trainer, s.price);
  for (const p of data.payments) if (Math.round(p.amount) === 6990) consider(p.client, p.date, "", 6990);
  // Any 6M member still without a start date: fall back to their first session.
  for (const client of members) {
    if (first[client]) continue;
    const cl = clients[client];
    if (cl) first[client] = { date: cl.firstSession, trainer: cl.primaryTrainer, price: 6990 };
  }
  const now = new Date();
  return Object.entries(first)
    .map(([client, info]) => {
      const months = monthsBetween(info.date, now);
      let phase: SixMRow["phase"];
      let monthInPhase: number;
      if (months <= 6) {
        phase = "Obnova";
        monthInPhase = months;
      } else if (months <= 18) {
        phase = "Integrácia";
        monthInPhase = months - 6;
      } else {
        phase = "Udržateľnosť";
        monthInPhase = months - 18;
      }
      let alert = "";
      let alertTone: SixMRow["alertTone"] = "";
      if (phase === "Obnova" && monthInPhase === 5) {
        alert = "⚠️ 5. MESIAC — HODNOTIACI ROZHOVOR";
        alertTone = "red";
      } else if (phase === "Obnova" && monthInPhase >= 6) {
        alert = "🔄 Prechod — Integrácia";
        alertTone = "orange";
      } else if (phase === "Integrácia" && monthInPhase >= 12) {
        alert = "🔄 Prechod — Udržateľnosť";
        alertTone = "orange";
      }
      const cl = clients[client];
      const historyBefore =
        cl?.firstSession && new Date(cl.firstSession) < new Date(info.date)
          ? `Balíček ${monthsBetween(cl.firstSession, info.date)}m pred vstupom`
          : "";
      const ov = data.clientOverrides?.[client];
      return {
        client,
        startDate: info.date,
        price: info.price,
        primaryTrainer: cl?.primaryTrainer || info.trainer,
        months,
        phase,
        monthInPhase,
        alert,
        alertTone,
        historyBefore,
        lastSession: cl?.lastSession,
        contractSigned: !!ov?.contractSigned,
        trainerNote: ov?.trainerNote || "",
      };
    })
    .sort(
      (a, b) =>
        (a.primaryTrainer || "").localeCompare(b.primaryTrainer || "") ||
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
}

// ── period grouping (Prehľad) ────────────────────────────────────────────────
export type Period = "week" | "month" | "quarter" | "custom";

// Returns a sortable grouping key + a human display label per period type.
export const periodInfo = (d: string, period: Period): { key: string; label: string } => {
  if (period === "week") return { key: weekKey(d), label: weekLabel(d) };
  if (period === "quarter") return { key: quarterKey(d), label: quarterLabel(quarterKey(d)) };
  return { key: monthKey(d), label: monthLabel(monthKey(d)) };
};

export type PeriodRow = {
  key: string;
  ts: number; // earliest timestamp in the period, for chronological sorting
  total: { hours: number; sessions: number; clients: number; revenue: number };
  byTrainer: Record<string, { hours: number; sessions: number; clients: Set<string> }>;
  score: number;
  recommendation: string;
};

const zoneForPeriod = (period: Period) => {
  // Weekly zone 24–34; scale for month (~4.3x) and quarter (~13x).
  const factor = period === "week" ? 1 : period === "quarter" ? 13 : 4.33;
  const lo = ZONE_LO * factor;
  const hi = ZONE_HI * factor;
  return { lo, hi };
};

export function groupTrainings(
  sessions: SessionRow[],
  period: Period,
  trainerFilter: string,
  range?: { from?: string; to?: string },
): PeriodRow[] {
  const map: Record<string, PeriodRow> = {};
  for (const s of sessions) {
    if (trainerFilter !== "all" && s.sessionTrainer !== trainerFilter) continue;
    if (range?.from && s.date < range.from) continue;
    if (range?.to && s.date > range.to + "T23:59:59.999Z") continue;
    const info = period === "custom" ? { key: "custom", label: "Vlastné obdobie" } : periodInfo(s.date, period);
    let g = map[info.key];
    if (!g) {
      g = map[info.key] = {
        key: info.label,
        ts: new Date(s.date).getTime(),
        total: { hours: 0, sessions: 0, clients: 0, revenue: 0 },
        byTrainer: {},
        score: 0,
        recommendation: "",
      };
    }
    g.ts = Math.min(g.ts, new Date(s.date).getTime());
    g.total.hours += s.duration / 60;
    g.total.sessions++;
    g.total.revenue += s.price;
    const bt = (g.byTrainer[s.sessionTrainer] ||= { hours: 0, sessions: 0, clients: new Set() });
    bt.hours += s.duration / 60;
    bt.sessions++;
    bt.clients.add(s.client);
  }
  const rows = Object.values(map);
  for (const g of rows) {
    const allClients = new Set<string>();
    for (const bt of Object.values(g.byTrainer)) for (const c of bt.clients) allClients.add(c);
    g.total.clients = allClients.size;
    // Score 1–10 from proximity to the healthy zone midpoint per active trainer.
    const activeTrainers = TRAINERS.filter((t) => g.byTrainer[t]);
    const { lo, hi } = zoneForPeriod(period);
    const mid = (lo + hi) / 2;
    let sc = 0;
    const denom = activeTrainers.length || 1;
    for (const t of activeTrainers) {
      const h = g.byTrainer[t].hours;
      const dev = Math.abs(h - mid) / mid; // 0 = perfect
      sc += Math.max(0, 10 - dev * 12);
    }
    g.score = Math.round(Math.min(10, sc / denom));
    const totalH = g.total.hours;
    if (totalH < lo) g.recommendation = "Pod zónou — priestor prijať klientov";
    else if (totalH > hi) g.recommendation = "Nad zónou — riziko preťaženia";
    else g.recommendation = "Zdravá zóna";
  }
  return rows.sort((a, b) => a.ts - b.ts);
}

export const periodZone = zoneForPeriod;

// ── session type analysis ────────────────────────────────────────────────────
export type AnalysisRow = {
  month: string;
  trainer: string;
  OFFLINE: number;
  ONLINE: number;
  TRUECOACH: number;
  UVODNE: number;
  total: number;
};

export function sessionAnalysis(sessions: SessionRow[]): AnalysisRow[] {
  const map: Record<string, AnalysisRow> = {};
  for (const s of sessions) {
    const mk = monthKey(s.date);
    const k = `${mk}|${s.sessionTrainer}`;
    const r = (map[k] ||= {
      month: mk,
      trainer: s.sessionTrainer,
      OFFLINE: 0,
      ONLINE: 0,
      TRUECOACH: 0,
      UVODNE: 0,
      total: 0,
    });
    r[s.sessionType]++;
    r.total++;
  }
  return Object.values(map).sort(
    (a, b) => a.month.localeCompare(b.month) || a.trainer.localeCompare(b.trainer),
  );
}

// PSB total per month, Online + TrueCoach combined per spec.
export type PsbAnalysisRow = { month: string; offline: number; onlineTc: number; uvodne: number; total: number };
export function sessionAnalysisPSB(sessions: SessionRow[]): PsbAnalysisRow[] {
  const map: Record<string, PsbAnalysisRow> = {};
  for (const s of sessions) {
    const mk = monthKey(s.date);
    const r = (map[mk] ||= { month: mk, offline: 0, onlineTc: 0, uvodne: 0, total: 0 });
    if (s.sessionType === "OFFLINE") r.offline++;
    else if (s.sessionType === "UVODNE") r.uvodne++;
    else r.onlineTc++; // ONLINE + TRUECOACH combined
    r.total++;
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

// ── capacity calculator ──────────────────────────────────────────────────────
export type CapacityRow = {
  trainer: string;
  anchor: number;
  stable: number;
  sporadic: number;
  clients: number;
  effHours: number; // segment-weighted (portfolio quality) — kept for reference
  // "Dvojitý strop" real-hours capacity:
  recentWeekly: number; // avg hours/week over the last ~8 weeks — the typical week
  busyWeekly: number; // 80th-percentile week over 12 weeks — a typically busy week
  peakWeekly: number; // absolute max week (12 wks) — reference only
  canTake: number; // more avg clients until typical→29h OR busy→34h, whichever first
  util: number; // the binding constraint as % — how full you really are
  advice: string;
};

const CAP_AVG_WEEKS = 8;
const CAP_PEAK_WEEKS = 12;
const BUSY_CAP = ZONE_HI; // 34h — busy weeks must not exceed the zone top

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  return lo >= a.length - 1 ? a[lo] : a[lo] + (a[lo + 1] - a[lo]) * (i - lo);
}

/**
 * Vyťaženie SPOLU — jedno číslo pre celé štúdio.
 *
 * Tri kópie, tri výsledky (revízia 18. 8. 2026):
 *   • dlaždica Vyťaženie: aritmetický priemer utilizácií trénerov,
 *   • karta Kapacita „Spolu (PSB)": dvojitý strop nad súčtom hodín,
 *   • Jarvisov kontext: to isté, ale s inou konštantou pre rušný týždeň.
 *
 * `priemer(max(...))` sa nerovná `max(súčet)` — dve percentá na jednej
 * obrazovke a tretie u Jarvisa. Platí dvojitý strop nad SÚČTOM: rastie, kým
 * typický týždeň nedosiahne ideál oboch trénerov ALEBO rušný týždeň nenarazí
 * na strop zóny — čo príde skôr. To je tá istá logika ako pri jednom
 * trénerovi, len s dvojnásobnými stropmi.
 */
export function vytazenieSpolu(capacity: Pick<CapacityRow, "recentWeekly" | "busyWeekly">[]): number | null {
  if (!capacity.length) return null;
  const n = capacity.length;
  const typicky = capacity.reduce((a, c) => a + c.recentWeekly, 0);
  const rusny = capacity.reduce((a, c) => a + c.busyWeekly, 0);
  return Math.round(Math.max(typicky / (TARGET_H * n), rusny / (ZONE_HI * n)) * 100);
}

export function capacityByTrainer(clients: Record<string, ClientAgg>, sessions: SessionRow[]): CapacityRow[] {
  const allWeeks = [...new Set(sessions.map((s) => weekKey(s.date)))].sort();
  const avgWeeks = new Set(allWeeks.slice(-CAP_AVG_WEEKS));
  const peakWeeks = allWeeks.slice(-CAP_PEAK_WEEKS);
  const nAvg = avgWeeks.size || 1;

  return TRAINERS.map((trainer) => {
    const cl = Object.values(clients).filter((c) => c.primaryTrainer === trainer && c.status !== "Neaktívny");
    const anchor = cl.filter((c) => c.segment === "Anchor").length;
    const stable = cl.filter((c) => c.segment === "Stabilný").length;
    const sporadic = cl.filter((c) => c.segment === "Sporadický").length;
    const clientCount = cl.length;
    const effHours = anchor * ANCHOR_H + stable * STABLE_H + sporadic * SPORADIC_H;

    const perWeek: Record<string, number> = {};
    let avgHours = 0;
    for (const s of sessions) {
      if (s.sessionTrainer !== trainer) continue;
      const w = weekKey(s.date);
      perWeek[w] = (perWeek[w] || 0) + s.duration / 60;
      if (avgWeeks.has(w)) avgHours += s.duration / 60;
    }
    const recentWeekly = avgHours / nAvg;
    const peakVals = peakWeeks.map((w) => perWeek[w] || 0);
    const busyWeekly = percentile(peakVals, 0.8);
    const peakWeekly = Math.max(0, ...peakVals);

    // Double cap: grow until the TYPICAL week reaches 29h OR a BUSY week reaches
    // 34h — whichever comes first. Each added client behaves like the current
    // average client (raises load by load/clientCount).
    const roomTypical = recentWeekly > 0 ? clientCount * ((TARGET_H - recentWeekly) / recentWeekly) : 0;
    const roomBusy = busyWeekly > 0 ? clientCount * ((BUSY_CAP - busyWeekly) / busyWeekly) : 0;
    const canTake = Math.max(0, Math.floor(Math.min(roomTypical, roomBusy)));
    // Utilisation = the tighter constraint (typical vs 29h, busy vs 34h).
    const util = Math.round(Math.max(recentWeekly / TARGET_H, busyWeekly / BUSY_CAP) * 100);

    const advice =
      util >= 100
        ? `Na strope — typický ${recentWeekly.toFixed(0)}h / rušný ${busyWeekly.toFixed(0)}h; priestor len cez zástup`
        : `Zvládne ešte ~${canTake} klientov (typický týždeň → ${TARGET_H}h, rušný → ${BUSY_CAP}h)`;

    return { trainer, anchor, stable, sporadic, clients: clientCount, effHours, recentWeekly, busyWeekly, peakWeekly, canTake, util, advice };
  });
}

// ── finance ──────────────────────────────────────────────────────────────────
export type FinanceMonth = {
  month: string;
  revenue: number;
  sessions: number;
  cash: number;
  byTrainer: Record<string, { revenue: number; sessions: number }>;
};

// ── kotva dát ────────────────────────────────────────────────────────────────
//
// Každý graf, ktorý kreslí mesiace, končil bežiacim kalendárnym mesiacom. Piaty
// august tak vyzeral ako mesiac s tržbami za 5 dní — posledný stĺpec padol na
// dno a graf hlásil prepad, ktorý sa nestal. To isté robil lievik: „Lievik —
// aug 26" s nulami, hoci august sa ešte len začal.
//
// Kotva je posledný deň, o ktorom appka niečo vie (posledné sedenie alebo
// platba z PTmindera). Mesiac je PLNÝ, keď kotva siaha aspoň po jeho posledný
// deň. Grafy kreslia po posledný plný mesiac; bežiaci sa ukazuje len tam, kde
// má zmysel sledovať ho v reálnom čase, a vždy označený.
//
// Zámerne jedno miesto: rovnaká úvaha bola predtým rozpísaná v troch
// komponentoch a každý mal mierne iný výsledok.
export type Kotva = {
  /** Posledný deň s dátami, "" keď nie sú žiadne. */
  den: string;
  /** Mesiac tohto dňa. */
  mesiac: string;
  /** Posledný mesiac, ktorý je celý pokrytý dátami. */
  plny: string;
  /** Je `mesiac` rozrobený (kotva nesiaha po jeho koniec)? */
  ciastocny: boolean;
};

const poslednyDenMesiaca = (mk: string) => {
  const [r, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
};

const predchadzajuciMesiac = (mk: string) => {
  const [r, m] = mk.split("-").map(Number);
  return m === 1 ? `${r - 1}-12` : `${r}-${String(m - 1).padStart(2, "0")}`;
};

// Berie čokoľvek, čo má sedenia (a voliteľne platby) — nie celé PSBData.
// Grafy, ktoré dostanú len `sessions`, tak nemusia kotvu počítať po svojom.
/**
 * Po koľkých dňoch bez nového exportu z PTmindera sa dáta hlásia ako zastarané.
 *
 * Nahráva sa v nedeľu, takže osem dní by znamenalo „prvá vynechaná nedeľa“.
 * Jerry si 11. 8. vybral desať — chce rezervu, nie budíček po jednom
 * vynechanom týždni. Zostáva to teda na desiatich, ale už ako JEDNA konštanta:
 * predtým bola desiatka natvrdo na dvoch miestach (register a dlaždica
 * čerstvosti) a pri zmene by sa jedno z nich zabudlo.
 */
export const PRAH_ZASTARANIA = 10;

export function kotvaDat(data: { sessions: { date: string }[]; payments?: { date: string }[] }): Kotva {
  let den = "";
  for (const s of data.sessions) if (s.date > den) den = s.date;
  for (const p of data.payments || []) if (p.date > den) den = p.date;
  den = den.slice(0, 10);
  if (!den) return { den: "", mesiac: "", plny: "", ciastocny: false };
  const mesiac = den.slice(0, 7);
  const ciastocny = den < poslednyDenMesiaca(mesiac);
  return { den, mesiac, plny: ciastocny ? predchadzajuciMesiac(mesiac) : mesiac, ciastocny };
}

/** Orezanie mesačnej série po posledný plný mesiac. */
export function doPlnehoMesiaca<T>(rows: T[], k: Kotva, mk: (r: T) => string): T[] {
  return k.plny ? rows.filter((r) => mk(r) <= k.plny) : rows;
}

// ── Bitcoinové platby: párovanie a poistky ───────────────────────────────────
//
// Dva nálezy z 11. 8., obidva rovnakého druhu — dve appky, dva zápisy tej
// istej skutočnosti, žiadna poistka medzi nimi:
//
//   1. Kaňovský 1. 7.: v BTC knihe platba 12 503 Kč, v PTminderi ten istý
//      deň 12 464 Kč označených ako „bank". Klik pri zápise v PTminderi —
//      a všetko, čo číta payment_method, ho radilo do banky.
//   2. „Procházka" (BTC kniha) vs „Prochadzka" (PTminder) — normName
//      nechá „prochazka" vs „prochadzka", takže párovanie po mene zlyhá
//      a klientov profil neukáže jeho satoshi.
//
// Poistka namiesto jednorazovej opravy: BTC KNIHA JE ZDROJ PRAVDY o tom, čo
// prišlo bitcoinom. Metóda z PTmindera sa jej podriaďuje — platba, ktorá sa
// spáruje s riadkom BTC knihy, JE bitcoinová bez ohľadu na klik pri zápise.
// Nesúlady sa neopravujú potichu: vracajú sa ako zoznam, ktorý ukazuje
// kontrola bitcoinových platieb, aby sa dal PTminder opraviť pri zdroji.

/**
 * Párovací kľúč mena medzi dvoma zdrojmi zápisu: prvých 5 znakov priezviska
 * + 3 mena, bez diakritiky. Prežije „Procházka/Prochadzka" aj „Tomaš/Tomáš".
 * Používa ho párovanie BTC knihy s PTminderom aj párovanie dopytov
 * s klientmi — všade, kde to isté meno písali dvaja ľudia dvakrát.
 */
/**
 * Tolerancie párovania bitcoinovej knihy s PTminderom — JEDNO miesto.
 *
 * Financie.tsx mali vlastnú kópiu s tými istými číslami a komentár
 * „tolerancie sú rovnaké ako v kontrole platieb" opisoval ten vzťah slovom,
 * nie kódom. Slovo sa nezmení, keď sa zmení číslo (revízia 18. 8. 2026).
 */
export const PAROVANIE = {
  /** Klient platí s odstupom; desať dní je bezpečných aj pri mesačnom. */
  oknoDni: 10,
  /** Kurz a spread brány robia rozdiel v korunách, nie chybu. */
  toleranciaKc: 400,
  toleranciaPct: 0.03,
} as const;

export const menoKluc = (m: string) => {
  const n = normName(m).split(" ").filter(Boolean);
  const priez = n[n.length - 1] || "";
  return `${priez.slice(0, 5)}|${(n[0] || "").slice(0, 3)}`;
};

/**
 * Nájde klienta podľa mena zapísaného DRUHÝM človekom (dopyt, BTC kniha).
 *
 * Dva stupne, zámerne v tomto poradí:
 *   1. presná zhoda po normName — keď existuje, fuzzy sa vôbec neskúša;
 *   2. fuzzy menoKluc, ale LEN ak kľúč patrí práve jednému klientovi.
 *      Pri kolízii (dvaja klienti s rovnakým kľúčom) sa radšej nenájde nič —
 *      falošná zhoda je horšia než diera, hlavne tam, kde sa podľa výsledku
 *      ZAPISUJE (auto-doplnenie zdroja z dopytu).
 *
 * Vzniklo z Prochádzku: „Prochadzka" (dopyt/PTminder) vs „Procházka" (BTC
 * kniha) prežili normName ako dve mená a konverzia dopytov ho nevidela.
 */
/**
 * JEDINÁ definícia klienta v celej appke.
 *
 * Klient = prišiel znova (čokoľvek okrem úvodného), alebo zaplatil nad cenu
 * úvodného viac než 500 Kč (Roman Pavlík: úvodný 5. 8., balíček 13. 8.,
 * druhý tréning ešte nemal — rozhodnutie padlo peniazmi). Pôvodné „má platbu"
 * spĺňal každý, kto prišiel na PLATENÝ úvodný.
 *
 * Bývala v MarketingLievik.tsx a komponenty ju odtiaľ importovali; presunutá
 * sem 19. 8. 2026, aby ju mohol čítať aj aiContext — Jarvis dovtedy definoval
 * klienta ako „5+ sedení" a na otázku „koľko dopytov sa stalo klientom"
 * odpovedal iným číslom než obrazovka. MarketingLievik ju re-exportuje,
 * existujúce importy fungujú ďalej.
 */
export const NAD_UVODNY_KC = 500;
export const jeKlient = (c: ClientAgg, payments: { client: string; amount: number }[]): boolean => {
  if (c.sessions.some((x) => x.sessionType !== "UVODNE")) return true;
  const uvodny = c.sessions.find((x) => x.sessionType === "UVODNE")?.price || 0;
  const zaplatil = payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
  return zaplatil - uvodny > NAD_UVODNY_KC;
};

/**
 * Koľko ĽUDÍ prišlo na úvodný tréning v danom výbere sedení.
 *
 * JEDNA DEFINÍCIA. Revízia 19. 8. 2026 našla tri nezávislé zápisy tej istej
 * myšlienky: raz sa počítali sedenia (`.length`), raz unikátne mená, raz
 * unikátne `meno|dátum`. Na ostrých dátach dávali to isté (62 = 62 = 62 —
 * nikto nemal úvodný dvakrát), takže nebol dôvod, aby boli tri, a raz sa
 * rozídu: keď niekto príde na úvodný druhýkrát po roku, „sedenia" ho zarátajú
 * dvakrát, ale do lievika patrí raz. Lievik meria ľudí, nie hodiny.
 *
 * Obdobie sa filtruje VOPRED a posiela sa sem už vybraný zoznam — funkcia
 * nevie o mesiacoch ani oknách a nemá vedieť.
 */
/**
 * Hodnota klienta (LTV) a dĺžka spolupráce — JEDNA definícia pre celú appku.
 *
 * ČO SA SČÍTAVA A PREČO NIE CENY SEDENÍ
 *
 * Do 22. 8. 2026 sa LTV rátalo zo `session.price`, teda z ceny zapísanej pri
 * sedení. Lenže tá je pri 663 z 3 449 sedení (19 %) NULOVÁ — platba visí na
 * balíčku, ktorý klient zaplatil dopredu. Appka to o pár riadkov ďalej sama
 * hovorí pri „Ø cene sedenia", kde presne z tohto dôvodu ceny sedení odmieta.
 * LTV tak vychádzalo 29 597 Kč, hoci tí istí klienti reálne zaplatili
 * priemerne 34 969 Kč. Bolo to podhodnotené o 18 % — a keďže LTV je strop na
 * to, koľko sa oplatí minúť za získanie klienta, podhodnotené LTV zbytočne
 * zväzuje ruky marketingu.
 *
 * Ráta sa z PLATIEB, čo je doslovná odpoveď na otázku „koľko klient zaplatí".
 *
 * Hranica ≥3 sedenia vyhadzuje skúšajúcich: jeden úvodný nie je spolupráca.
 * Počítajú sa aj tí, čo stále chodia — priemer cez odídených by meral, ako
 * vyzerá ODCHOD, nie ako vyzerá klient. Číslo tým zostáva podhodnotené
 * (kto chodí, zaplatí ešte), a to je pri strope na marketing bezpečná strana.
 */
export function ltvSpoluprace(
  sedenia: { client: string; date: string }[],
  platby: { client: string; amount: number }[],
): { ltv: number; dlzkaMes: number; klientov: number; mena: string[] } {
  const span: Record<string, { first: string; last: string; n: number }> = {};
  for (const s of sedenia) {
    const g = (span[s.client] ||= { first: s.date, last: s.date, n: 0 });
    if (s.date < g.first) g.first = s.date;
    if (s.date > g.last) g.last = s.date;
    g.n++;
  }
  const zaplatil: Record<string, number> = {};
  for (const p of platby) zaplatil[p.client] = (zaplatil[p.client] || 0) + p.amount;
  const usadeni = Object.entries(span).filter(([meno, g]) => g.n >= 3 && (zaplatil[meno] || 0) > 0);
  if (!usadeni.length) return { ltv: 0, dlzkaMes: 0, klientov: 0, mena: [] };
  const MES = 1000 * 60 * 60 * 24 * 30.44;
  const ltv = usadeni.reduce((a, [meno]) => a + (zaplatil[meno] || 0), 0) / usadeni.length;
  const dlzkaMes = usadeni.reduce((a, [, g]) => a + Math.max(1, (Date.parse(g.last) - Date.parse(g.first)) / MES), 0) / usadeni.length;
  return { ltv, dlzkaMes, klientov: usadeni.length, mena: usadeni.map(([m]) => m) };
}

export const pocetUvodnych = (sedenia: { client: string; sessionType: string }[]): number =>
  new Set(sedenia.filter((s) => s.sessionType === "UVODNE").map((s) => s.client)).size;

export function najdiKlienta(
  mena: string[],
  hladane: string,
): string | null {
  if (!hladane) return null;
  const n = normName(hladane);
  for (const m of mena) if (normName(m) === n) return m;
  const k = menoKluc(hladane);
  const kandidati = mena.filter((m) => menoKluc(m) === k);
  return kandidati.length === 1 ? kandidati[0] : null;
}

/** Platba z BTC knihy, ako ju vracia /api/btc-reserve?platby=1. */
export type BtcKnihaPlatba = { klient: string | null; datum: string; sats?: number; czk: number | null };

/**
 * Ktoré PTminder platby v skutočnosti prišli bitcoinom.
 *
 * Vracia `jeBtc` (rozhodnutie pre konkrétny riadok platby) a `zleOznacene` —
 * platby, ktoré sa spárovali s BTC knihou, ale v PTminderi majú „bank" alebo
 * „cash". Tolerancie sú rovnaké ako v kontrole platieb: ±10 dní (zápis
 * v PTminderi a pohyb v bitcoine sa bežne líšia o pár dní) a 400 Kč alebo
 * 3 % (kurz medzi okamihom platby a prepočtom).
 */
export function btcOznacenia(payments: PaymentRow[], btcPlatby: BtcKnihaPlatba[]): {
  jeBtc: (p: PaymentRow) => boolean;
  zleOznacene: { meno: string; datum: string; suma: number; metoda: string }[];
} {
  const OKNO_DNI = PAROVANIE.oknoDni;
  const TOL_KC = PAROVANIE.toleranciaKc;
  const TOL_PCT = PAROVANIE.toleranciaPct;
  const btcPodlaKluca = new Map<string, { t: number; czk: number }[]>();
  for (const b of btcPlatby) {
    if (!b.klient || b.czk == null) continue;
    const k = menoKluc(b.klient);
    if (!btcPodlaKluca.has(k)) btcPodlaKluca.set(k, []);
    btcPodlaKluca.get(k)!.push({ t: Date.parse(b.datum), czk: b.czk });
  }
  const sparovana = (p: PaymentRow) => {
    const kandidati = btcPodlaKluca.get(menoKluc(p.client));
    if (!kandidati) return false;
    const t = Date.parse(p.date);
    return kandidati.some((b) =>
      Math.abs(b.t - t) / 86400000 <= OKNO_DNI &&
      Math.abs(b.czk - p.amount) <= Math.max(TOL_KC, b.czk * TOL_PCT));
  };
  const jeBtc = (p: PaymentRow) => p.method === "other" || (!!p.client && sparovana(p));
  const zleOznacene = payments
    .filter((p) => p.client && p.method !== "other" && sparovana(p))
    .map((p) => ({ meno: p.client, datum: p.date.slice(0, 10), suma: p.amount, metoda: p.method }));
  return { jeBtc, zleOznacene };
}

/**
 * Ø CENA ZA SEDENIE — jediné miesto, kde sa počíta. (Jerry, 11. 8.)
 *
 * Appka to donedávna rátala na štyri spôsoby a ukazovala štyri čísla:
 *   • Klienti  1046 Kč — cena zapísaná pri sedení, BEZ nulových
 *   • Tréningy  844 Kč — cena zapísaná pri sedení, VRÁTANE nulových
 *   • Kokpit   1015 Kč — prijaté peniaze, nevážený priemer mesiacov
 *   • Peniaze   ~844  — cena pri sedení, vážene
 *
 * Rozdiel nie je v zaokrúhľovaní, ale v tom, že 661 z 3 416 sedení (19,4 %)
 * má v PTminderi cenu 0 — a je to tak rovnomerne každý rok (20 % / 19 %).
 * Nie sú to tréningy zadarmo: je to sedenie kryté balíčkom, kde platba visí
 * na balíčku, nie na riadku sedenia. Priemer z ceny pri sedení preto cenu
 * podhodnocuje o ~200 Kč, a keď sa nuly vyhodia, zase nadhodnocuje, lebo
 * z menovateľa zmizne pätina odrobenej práce.
 *
 * Jediná definícia, ktorá o tú pätinu nepríde, je PRIJATÉ PENIAZE delené
 * ODTRÉNOVANÝMI SEDENIAMI — platba za balíček sa v nej započíta. Váži sa
 * súčtami, nie priemerom mesačných pomerov: mesiac s piatimi sedeniami nemá
 * mať rovnakú váhu ako mesiac so stopäťdesiatimi.
 *
 * Pozor na jednu vlastnosť, ktorá je vlastnosť a nie chyba: predplatba
 * dorazí v jednom mesiaci a sedenia sa odchodia v ďalších, takže KRÁTKE okno
 * skáče. Cez celý rok sa to vyrovná.
 */
export function cenaZaSedenie(
  data: PSBData,
  vObdobi: (mk: string) => boolean,
  /** Normalizované mená — obmedzí výpočet na skupinu klientov. */
  klienti?: Set<string>,
): { czk: number; sedeni: number; cash: number } {
  const patri = (meno: string) => !klienti || klienti.has(normName(meno));
  let sedeni = 0;
  for (const s of data.sessions) if (vObdobi(monthKey(s.date)) && patri(s.client)) sedeni++;
  let cash = 0;
  // Riadky bez klienta sú súhrnné riadky reportu, nie platby — do tržieb
  // nepatria (rovnaké pravidlo ako monthlyFinance).
  for (const p of data.payments) if (p.client && vObdobi(monthKey(p.date)) && patri(p.client)) cash += p.amount;
  return { czk: sedeni ? cash / sedeni : 0, sedeni, cash };
}

export function monthlyFinance(data: PSBData): FinanceMonth[] {
  const map: Record<string, FinanceMonth> = {};
  const get = (mk: string) =>
    (map[mk] ||= { month: mk, revenue: 0, sessions: 0, cash: 0, byTrainer: {} });
  for (const s of data.sessions) {
    const m = get(monthKey(s.date));
    m.revenue += s.price;
    m.sessions++;
    const bt = (m.byTrainer[s.sessionTrainer] ||= { revenue: 0, sessions: 0 });
    bt.revenue += s.price;
    bt.sessions++;
  }
  // Skip unattributable rows (empty client) — those are report summary/total
  // lines, not real payments, and would blow up the cashflow total.
  for (const p of data.payments) {
    if (!p.client) continue;
    get(monthKey(p.date)).cash += p.amount;
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

// ── anomalies (persistent register) ──────────────────────────────────────────
export type Anomaly = {
  key: string;
  tone: "red" | "orange" | "blue";
  label: string;
  detail: string;
  acked: boolean;
  note?: string;
  client?: string; // the client this item is about (for click-through to Klienti)
};

// Odpoveď na otázku „je toto duch?" sa ukladá s dátumom ("ano|2026-08-03").
// Bez dátumu by platila NAVŽDY: klient, ktorý sa vráti a o rok znova stíchne,
// by už nikdy nevyskočil — odpoveď z minulej epizódy ticha by ho kryla.
// Epizódy ticha oddeľuje tréning: keď je posledné sedenie NOVŠIE než odpoveď,
// odpoveď patrí starej epizóde a neplatí. Holé "ano"/"nie" (staré zápisy bez
// dátumu) sa berú ako platné — nemáme ako zistiť ich vek.
export function duchOdpoved(c: { duch: string; lastSession: string }): "ano" | "nie" | "" {
  if (!c.duch) return "";
  const [odpoved, datum] = c.duch.split("|");
  if (odpoved !== "ano" && odpoved !== "nie") return "";
  if (datum && c.lastSession && c.lastSession.slice(0, 10) > datum) return "";
  return odpoved;
}

export type ZmenaVKalendari = { druh: string; klient: string | null; pred?: string | null; po?: string | null };

/**
 * Tréningy, o ktorých už niekto povedal, že sa nekonali — `meno|YYYY-MM-DD`.
 *
 * Zrušenie, ktoré prebehne v Google Kalendári, appka spozná sama: udalosť
 * zmizne a `zmizla_at` ju odloží nabok. Lenže Jerry sa o polovici zrušení
 * dozvie telefonicky a udalosť v kalendári nechá stáť — na to je v Kalendári
 * ručný zápis. Ten dovtedy nikto okrem samotného Kalendára nečítal, takže
 * appka ďalej hlásila „dnes o 17:00 máš tréning" s hodinou, o ktorej Jerry
 * pred chvíľou zapísal, že sa nekoná.
 */
export function zruseneTreningy(zmeny: ZmenaVKalendari[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const z of zmeny || []) {
    if (z.druh !== "zrusene" || !z.klient) continue;
    const den = (z.pred || "").slice(0, 10);
    if (den) out.add(`${normName(z.klient)}|${den}`);
  }
  return out;
}

/**
 * Kedy bol klient naposledy na tréningu — podľa VŠETKÉHO, čo o tom appka vie.
 *
 * PREČO NESTAČÍ EXPORT
 *
 * `lastSession` pochádza z PTmindera a ten chodí s odstupom dní. Klient, ktorý
 * trénoval v pondelok, je tak do štvrtka „14 dní bez tréningu" — appka na neho
 * hlási, aby sa mu ozval, hoci ho videl predvčerom. Jerry, 17. 8. 2026:
 * „keď zapíšem, že Richard Matl bol minulý týždeň na tréningu, má mi to
 * z notifikácií zmiznúť."
 *
 * Je to tá istá lekcia ako pri Romanovi Pavlíkovi: kalendár vie skôr než
 * export a jeho slovo platí rovnako. Zrušený tréning sa neráta — ani ten
 * zapísaný ručne.
 */
export function poslednyTrening(
  clients: Record<string, Pick<ClientAgg, "name" | "lastSession">>,
  udalosti: { zaciatok: string; klient: string | null; typ: string | null }[] | undefined,
  zmeny?: ZmenaVKalendari[],
  dnes: Date = new Date(),
): Record<string, string> {
  const out: Record<string, string> = {};
  const podlaMena: Record<string, string> = {};
  for (const c of Object.values(clients)) {
    out[c.name] = (c.lastSession || "").slice(0, 10);
    podlaMena[normName(c.name)] = c.name;
  }
  const zrusene = zruseneTreningy(zmeny);
  const den = dnes.toISOString().slice(0, 10);
  for (const u of udalosti || []) {
    if ((u.typ !== "trening" && u.typ !== "uvodny") || !u.klient) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    // Tréning, ktorý sa ešte len chystá, nie je dôkaz o ničom.
    if (!d || d > den || (d === den && Date.parse(u.zaciatok) > dnes.getTime())) continue;
    const kluc = normName(u.klient);
    if (zrusene.has(`${kluc}|${d}`)) continue;
    const meno = podlaMena[kluc];
    if (meno && d > (out[meno] || "")) out[meno] = d;
  }
  return out;
}

/**
 * Tréning, ktorý kalendár tvrdí a export nepotvrdil.
 *
 * PRAVIDLO (Jerry, 17. 8. 2026)
 *
 * „Kalendár má vyhrať a neskôr to má export potvrdiť. Ak nie, mala by vyskočiť
 * notifikácia, že tu niečo nesedí."
 *
 * Nepotvrdené sa pozná presne: tréning stojí v kalendári na deň, ktorý export
 * UŽ POKRÝVA, a v exporte nie je. Kým export k tomu dňu nedošiel, appka mlčí —
 * inak by hlásila každý včerajší tréning. Vďaka tomu je hlásenie tiché počas
 * bežného oneskorenia a ozve sa len vtedy, keď sa dva zdroje naozaj rozišli.
 *
 * Prečo na tom záleží: sú to dve rôzne chyby s rovnakým prejavom. Buď sa
 * tréning nekonal — a potom appka podľa kalendára pokladá klienta za aktívneho
 * a mlčí, hoci mal dostať telefonát. Alebo sa konal a nie je v PTminderi —
 * a potom je to odrobená hodina, ktorá nie je vyfakturovaná.
 *
 * Tolerancia ±1 deň je rovnaká ako v Balíčkoch: PTminder občas zapíše sedenie
 * na susedný deň (nočný prevod, iné pásmo) a to nie je nezhoda.
 */
/**
 * Čas z PTmindera na minúty od polnoci. Vracia `null`, keď sa nedá prečítať.
 *
 * Export píše „7:00am" / „12:00pm"; kalendár nesie 24-hodinový tvar. Obe
 * podoby musí vedieť to isté miesto, inak sa porovnáva hruška s jablkom.
 */
export function minutyZCasu(t: string | undefined | null): number | null {
  const s = String(t || "").trim().toLowerCase();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  if (m[3] === "am") h = h === 12 ? 0 : h;
  else if (m[3] === "pm") h = h === 12 ? 12 : h + 12;
  if (h > 23) return null;
  return h * 60 + min;
}

export type NepotvrdenyTrening = { klient: string; datum: string; trener: string | null };

export function nepotvrdeneTreningy(
  sedenia: { client: string; date: string; time?: string }[],
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; trener?: string }[] | undefined,
  zmeny?: ZmenaVKalendari[],
  dnes: Date = new Date(),
): NepotvrdenyTrening[] {
  // Kam až siaha export. Bez neho sa nedá povedať, či niečo chýba.
  const pokryteDo = sedenia.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);
  if (!pokryteDo) return [];
  /**
   * Posledný deň exportu je pokrytý len po hodinu, po ktorú siaha.
   *
   * Export sa sťahuje v nejakej chvíli dňa a ďalšie hodiny v ňom ešte byť
   * nemôžu. Bez tohto by appka pri každom stiahnutí napoludnie ohlásila ako
   * nezhodu každý popoludňajší tréning — teda presne to falošné hlásenie,
   * ktorému sa celé pravidlo vyhýba. Keď export v ten deň nemá časy, sa
   * posledný deň nesúdi vôbec.
   */
  const doMinuty = sedenia
    .filter((s) => s.date.slice(0, 10) === pokryteDo)
    .reduce<number | null>((m, s) => {
      const t = minutyZCasu(s.time);
      return t === null ? m : m === null ? t : Math.max(m, t);
    }, null);
  // Dokedy siaha POSLEDNÝ deň exportu.
  //
  // Export sa dá stiahnuť aj napoludnie a potom v ňom chýba celé popoludnie —
  // hlásiť to ako nezhodu by bol falošný poplach v deň, keď je všetko v poriadku.
  // Za dôkaz sa preto berie iné sedenie NESKÔR v ten istý deň: keď PTminder
  // vie o hodine o 19:00, o tej o 9:30 vedieť mal.
  //
  // Trinásteho augusta 2026 to rozhodlo správne: export mal ten deň sedenia od
  // 7:00 do 19:00, takže Roman Pavlík o 9:30 naozaj chýba — a je to hodina,
  // za ktorú zaplatil.
  const poslednaMinuta = sedenia
    .filter((s) => s.date.slice(0, 10) === pokryteDo)
    .reduce((m, s) => Math.max(m, minutyZCasu(s.time) ?? -1), -1);
  const zrusene = zruseneTreningy(zmeny);
  const zapisane = new Set(sedenia.map((s) => `${normName(s.client)}|${s.date.slice(0, 10)}`));
  const posun = (d: string, o: number) => new Date(Date.parse(`${d}T00:00:00Z`) + o * 86400_000).toISOString().slice(0, 10);
  const den = dnes.toISOString().slice(0, 10);
  const out: NepotvrdenyTrening[] = [];
  const videne = new Set<string>();
  for (const u of udalosti || []) {
    if ((u.typ !== "trening" && u.typ !== "uvodny") || !u.klient) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    if (!d || d > den || d > pokryteDo) continue;
    if (d === pokryteDo) {
      // Posledný deň sa posudzuje len po hodinu, po ktorú export naozaj siaha.
      const min = Number(u.zaciatok.slice(11, 13)) * 60 + Number(u.zaciatok.slice(14, 16));
      if (poslednaMinuta < 0 || min > poslednaMinuta) continue;
    }
    const k = normName(u.klient);
    if (zrusene.has(`${k}|${d}`)) continue;
    if ([-1, 0, 1].some((o) => zapisane.has(`${k}|${posun(d, o)}`))) continue;
    const kluc = `${k}|${d}`;
    if (videne.has(kluc)) continue;
    videne.add(kluc);
    out.push({ klient: u.klient, datum: d, trener: u.trener || null });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}

/**
 * Koho sa udalosť týka — vrátane mena vyčítaného z názvu úvodného.
 *
 * Mapovanie mien vždy vyhráva. Keď chýba a ide o ÚVODNÝ, meno sa skúsi
 * prečítať z názvu udalosti: ten človek v appke ešte nie je, takže sa nemá
 * čo pripísať cudziemu (viď menoZNazvuUvodneho). Pri bežnom tréningu sa
 * nehádа — tam by odhad pripísal hodinu existujúcemu klientovi.
 */
export function klientUdalosti(u: { klient?: string | null; typ?: string | null; nazov?: string | null }): string | null {
  const m = (u.klient || "").trim();
  if (m) return m;
  if (u.typ !== "uvodny") return null;
  return menoZNazvuUvodneho(u.nazov || "");
}

/**
 * Udalosť v kalendári, ku ktorej appka nevie priradiť človeka.
 *
 * Jerry, 17. 8. 2026: „keď tam nie je meno, treba na to upozorniť."
 * Tréning bez mena je diera vo všetkom naraz — nespočíta sa do dochádzky,
 * nevyvolá SMS po úvodnom, nespáruje sa s dopytom a pri úvodnom nevznikne
 * profil klienta. A pritom to je jedno kliknutie v Kalendári.
 */
export function udalostiBezMena(
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; nazov?: string; trener?: string }[] | undefined,
  dnes: Date = new Date(),
): { nazov: string; datum: string; typ: string; trener: string | null }[] {
  const den = dnes.toISOString().slice(0, 10);
  return (udalosti || [])
    // Úvodný, ktorého meno sa dá prečítať z názvu, sa hlási ako NOVÝ KLIENT —
    // to je tá istá vec povedaná užitočnejšie.
    .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && !klientUdalosti(u) && (u.zaciatok || "").slice(0, 10) <= den)
    .map((u) => ({ nazov: (u.nazov || "").trim(), datum: u.zaciatok.slice(0, 10), typ: u.typ as string, trener: u.trener || null }))
    .sort((a, b) => b.datum.localeCompare(a.datum));
}

/**
 * Klient, ktorý už mal úvodný tréning, ale v appke ešte neexistuje.
 *
 * Jerry, 17. 8. 2026: „záznam o klientovi — jeho profil — by mal vzniknúť po
 * tom, čo sa udeje úvodný tréning, ktorý je v kalendári, a tento klient by sa
 * mal potvrdiť z exportu z PTmindera."
 *
 * Doteraz klient vznikal VÝHRADNE z exportu. To znamená, že človek, ktorý mal
 * v pondelok úvodný, pre appku do nasledujúceho nahrania neexistoval: nedal
 * sa mu napísať denník, nedal sa mu priradiť tréner, nebolo kde zapísať dôvod,
 * prečo sa nevrátil. Kalendár pritom jeho meno pozná v ten istý deň.
 *
 * Existencia klienta a POTVRDENIE jeho existencie sú dve rôzne veci. Toto je
 * to prvé; druhé prinesie export a vtedy človek z tohto zoznamu zmizne sám.
 */
export type CakajuciKlient = { meno: string; uvodny: string; trener: string | null; zNazvu?: boolean };

export function cakajuciKlienti(
  clients: Record<string, Pick<ClientAgg, "name">>,
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; trener?: string; nazov?: string }[] | undefined,
  zmeny?: ZmenaVKalendari[],
  dnes: Date = new Date(),
): CakajuciKlient[] {
  const zname = new Set(Object.keys(clients).map(normName));
  const zrusene = zruseneTreningy(zmeny);
  const den = dnes.toISOString().slice(0, 10);
  const najdene: Record<string, CakajuciKlient> = {};
  for (const u of udalosti || []) {
    if (u.typ !== "uvodny") continue;
    // Meno smie prísť aj z názvu udalosti — pri úvodnom je to nový človek,
    // takže sa nemá čo pripísať cudziemu.
    const meno = klientUdalosti(u);
    if (!meno) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    // Úvodný, ktorý sa ešte nekonal, nikoho klientom nerobí.
    if (!d || d > den || (d === den && Date.parse(u.zaciatok) > dnes.getTime())) continue;
    const k = normName(meno);
    if (zrusene.has(`${k}|${d}`) || zname.has(k)) continue;
    // Fuzzy zhoda podrží preklep aj diakritiku — Prochadzka verzus Procházka.
    if (najdiKlienta(Object.keys(clients), meno)) continue;
    if (!najdene[k] || d > najdene[k].uvodny) {
      najdene[k] = { meno, uvodny: d, trener: u.trener || null, zNazvu: !(u.klient || "").trim() };
    }
  }
  return Object.values(najdene).sort((a, b) => b.uvodny.localeCompare(a.uvodny));
}

// Practical, client-centric signals — one item per client per type (deduped),
// the actionable things a trainer should follow up on this week.
/** Najbližší budúci termín klienta z kalendára, alebo null. */
export function najblizsiTermin(
  meno: string,
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null }[] | undefined,
  dnes: Date = new Date(),
): string | null {
  const od = dnes.toISOString().slice(0, 10);
  const buduce = (udalosti || [])
    .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && !u.zmizlaAt && u.klient
      && normName(u.klient) === normName(meno) && u.zaciatok.slice(0, 10) >= od)
    .sort((x, y) => x.zaciatok.localeCompare(y.zaciatok));
  return buduce.length ? buduce[0].zaciatok : null;
}

/** „ut 1. 9. o 10:30“ — termín tak, ako ho Jerry číta v kalendári. */
const DNI = ["ne", "po", "ut", "st", "št", "pi", "so"];
export function terminSlovom(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Bez vedúcej nuly — v kalendári to Jerry číta ako „9:30“, nie „09:30“.
  const cas = iso.slice(11, 16).replace(/^0/, "");
  return `${DNI[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.${cas ? ` o ${cas}` : ""}`;
}

/**
 * Má už človek zo záveru dohodnutý termín?
 *
 * Vracia začiatok najbližšieho budúceho tréningu, alebo null. Slúži na to,
 * aby sa nehlásilo „ozvať sa a dohodnúť termín“ niekomu, kto termín má.
 *
 * Zámerne úzke: spúšťa sa LEN na záveroch, ktorých overenie hovorí o dohode
 * alebo o tréningu. Záver typu „prišla odpoveď z Facebooku?“ sa kalendárom
 * overiť nedá a nesmie ním byť umlčaný.
 */
const ZAVER_O_TERMINE = /dohodn|term[ií]n|ozva[tť] sa|tr[ée]ning|objedna/i;

export function zaverUzMaTermin(
  z: { zaver?: string | null; tema?: string | null; overit?: string | null },
  menaKlientov: string[],
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null }[] | undefined,
  dnes: Date = new Date(),
): string | null {
  if (!ZAVER_O_TERMINE.test(z.overit || "")) return null;
  const text = normName(`${z.zaver || ""} ${z.tema || ""}`);
  // Krátke mená sa v texte trafia náhodou — preto aspoň päť znakov.
  const meno = menaKlientov.find((n) => normName(n).length >= 5 && text.includes(normName(n)));
  if (!meno) return null;
  const od = dnes.toISOString().slice(0, 10);
  const buduce = (udalosti || [])
    .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && !u.zmizlaAt && u.klient
      && normName(u.klient) === normName(meno) && u.zaciatok.slice(0, 10) >= od)
    .sort((a, b) => a.zaciatok.localeCompare(b.zaciatok));
  return buduce.length ? buduce[0].zaciatok : null;
}

export function deriveAnomalies(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  kal?: { udalosti?: { zaciatok: string; klient: string | null; typ: string | null }[]; zmeny?: ZmenaVKalendari[] },
): Anomaly[] {
  const out: Anomaly[] = [];
  const ack = data.anomalyAck || {};
  const push = (key: string, tone: Anomaly["tone"], label: string, detail: string, client?: string) =>
    out.push({ key, tone, label, detail, acked: !!ack[key], note: ack[key]?.note, client });

  const serviceClients = new Set(data.services.map((s) => s.client));
  const now = new Date();
  // Kalendár má rovnaké slovo ako export — a hovorí skôr.
  const posledny = poslednyTrening(clients, kal?.udalosti, kal?.zmeny, now);

  // Nový klient bez zdroja. Zdroj má vyplnený len každý druhý klient a
  // dopĺňať sa dá jedine krátko po začiatku — o pol roka si už nikto nespomenie,
  // odkiaľ človek prišiel. Preto pripomienka žije len 60 dní od prvého tréningu.
  for (const c of Object.values(clients)) {
    if (c.zdroj || c.status === "Neaktívny" || !c.firstSession) continue;
    const dni = (now.getTime() - Date.parse(c.firstSession)) / 86400000;
    if (dni >= 0 && dni <= 60) {
      push(`zdroj|${c.name}`, "blue", "Chýba zdroj",
        `${c.name}: nový klient bez zdroja — dopíš, odkiaľ prišiel, kým sa to vie`, c.name);
    }
  }

  // ── Narodeniny ───────────────────────────────────────────────────────────
  //
  // Pripomienka sa OPAKUJE: 7 dní pred, 3 dni pred, deň pred a v deň samotný.
  // Každý stupeň má vlastný kľúč, takže odloženie toho prvého neumlčí ďalšie —
  // presne o to ide. Pripomienka týždeň dopredu je na to, aby sa dal kúpiť
  // darček; pripomienka v deň je na to, aby sa naň nezabudlo.
  //
  // Kľúč nesie ROK, nie celý dátum: inak by odloženie z minulého roka umlčalo
  // aj tie tohtoročné a narodeniny by sa ohlásili raz za život.
  for (const c of Object.values(clients)) {
    if (!c.narodeniny || c.status === "Neaktívny") continue;
    const md = c.narodeniny.slice(5); // MM-DD
    if (!/^\d{2}-\d{2}$/.test(md)) continue;
    const rok = now.getUTCFullYear();
    // Narodeniny v decembri a dnešok v januári: najbližší výskyt je vlani.
    const kandidati = [rok - 1, rok, rok + 1].map((r) => Date.parse(`${r}-${md}T00:00:00Z`));
    const dnesUTC = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const najblizsie = kandidati
      .map((t) => ({ t, dni: Math.round((t - dnesUTC) / 86400000) }))
      .filter((x) => x.dni >= 0)
      .sort((a, b) => a.dni - b.dni)[0];
    if (!najblizsie) continue;
    const { dni } = najblizsie;
    const stupen = dni === 0 ? 0 : dni <= 1 ? 1 : dni <= 3 ? 3 : dni <= 7 ? 7 : null;
    if (stupen === null) continue;
    const vek = c.narodeniny.length >= 10 ? rok - Number(c.narodeniny.slice(0, 4)) : null;
    const kolky = vek !== null && dni === 0 ? ` — má ${vek}` : vek !== null ? ` (bude mať ${vek})` : "";
    push(
      `narodeniny|${c.name}|${new Date(najblizsie.t).getUTCFullYear()}|${stupen}`,
      dni === 0 ? "orange" : "blue",
      "Narodeniny",
      dni === 0
        ? `${c.name} má dnes narodeniny${kolky} — nezabudni zagratulovať`
        : `${c.name} má narodeniny ${dni === 1 ? "zajtra" : `o ${dni} dní`} (${fmtDMY(c.narodeniny)})${kolky}`,
      c.name,
    );
  }

  for (const c of Object.values(clients)) {
    // "Pauza" = agreed temporary break — silences activity/renewal anomalies.
    // But once a DATED pause is over, surface a reminder to reach out.
    if (c.status === "Pauza") {
      if (c.pauseUntil && daysBetween(c.pauseUntil, now) >= 0) {
        push(`pauzakoniec|${c.name}`, "orange", "Pauza sa skončila", `${c.name}: dohodnutá pauza sa skončila (${fmtDMY(c.pauseUntil)}) — ozvi sa a naplánujte tréning`, c.name);
      }
      continue;
    }
    if (c.status === "Neaktívny") continue;
    // Nie `c.lastSession`, ale to najnovšie, čo o ňom vieme — inak appka
    // naháňa klienta, ktorý bol včera na hodine, len ju PTminder ešte neposlal.
    const poslednyDen = posledny[c.name] || c.lastSession;
    const days = daysBetween(poslednyDen, now);

    const duch = duchOdpoved({ duch: c.duch, lastSession: poslednyDen });

    // Regular client who stopped coming — reach out before they churn.
    // Od 30 dní preberá štafetu otázka „Je toto duch?" — obe naraz by boli tá
    // istá výzva dvakrát. A keď je duch potvrdený, nenaháňa sa vôbec: vieme,
    // že odišiel, a „ozvi sa" by bol šum.
    if ((c.segment === "Anchor" || c.segment === "Stabilný") && days >= 14 && days < 30 && duch !== "ano") {
      // „Ozvi sa“ len vtedy, keď sa naozaj je o čom ozvať. Roman Jakubiček
      // mal 31. 8. 2026 štrnásť dní bez tréningu — a v kalendári termíny na
      // 1. a 8. 9. Pauza je pravdivá, výzva nie; a výzva, ktorá je zbytočná,
      // učí ignorovať aj tie, ktoré zbytočné nie sú.
      const termin = najblizsiTermin(c.name, kal?.udalosti, now);
      push(
        `gone|${c.name}`,
        termin ? "blue" : days >= 21 ? "red" : "orange",
        "Prestal chodiť",
        termin
          ? `${c.name}: ${days} dní bez tréningu (${c.segment}) — termín má ${terminSlovom(termin)}.`
          : `${c.name}: ${days} dní bez tréningu (${c.segment}) — ozvi sa`,
        c.name,
      );
    }

    // "Duch": kúpi balíček, odchodí pár hodín a prestane chodiť AJ odpisovať.
    // Jerryho najčastejší spôsob odchodu — kúpi 7 hodín, príde na 3, zvyšok
    // prepadne. Krátkodobo hotovosť za neodrobenú prácu, dlhodobo stratený
    // klient za ~27 000 Kč a blokované miesto.
    //
    // Ducha definuje TICHO, nie počet nedochodených hodín. Klient, ktorý si
    // minulý týždeň kúpil balíček a odtrénoval tri hodiny, vyzerá v dátach
    // rovnako ako ten, čo po troch hodinách zmizol — líšia sa len tým, kedy
    // naposledy prišli. Preto je jediná podmienka mesiac bez tréningu.
    //
    // A preto je to OTÁZKA, nie tvrdenie: appka nevie, či si medzitým nepísali,
    // či klient nie je na dovolenke a či sa už nedohodli na termíne. Odpoveď sa
    // uloží (duch = "ano" / "nie"), takže sa tá istá otázka nepýta dokola.
    // Keď Jerry odchod už RAZ vysvetlil — hoci pod iným kľúčom (`strata|` z čias,
    // keď tá otázka existovala) — „je toto duch?" je tá istá otázka druhýkrát.
    // 20. 8. 2026 tak svietila Leonora, ktorej odchod bol od 13. 8. zodpovedaný
    // („finančné dôvody"). Vysvetlená vec nie je otázka.
    const odchodVysvetleny = !!ack[`strata|${c.name}`];
    if (days >= 30 && !duch && !odchodVysvetleny) {
      const hodiny = c.packageRemaining > 0
        ? ` a ešte má ${c.packageRemaining} z ${c.packageTotal} zaplatených hodín`
        : "";
      push(
        `duch|${c.name}`,
        days >= 60 ? "red" : "orange",
        "Je toto duch?",
        `${c.name}: ${days} dní bez tréningu${hodiny} — je to duch, alebo to má vysvetlenie?`,
        c.name,
      );
    }
  }

  // „Po úvodnom už neprišiel" (kľúč `strata|`) tu ZÁMERNE nie je.
  //
  // Tú istú otázku kladie `pripomienkaDovodu` pod kľúčom `dovod|` a robí to
  // lepšie v oboch smeroch: pýta sa presnejšie (pozerá aj na kúpený balíček a
  // na tréning v kalendári, takže nezaradí Romana Pavlíka, ktorý pokračoval)
  // a odpovedá sa na ňu jedným klepnutím na dôvod, ktorý sa rovno zapíše ku
  // klientovi. Táto verzia mala len vetu „zapíš to v Marketingu" — a presne to
  // vidno v dátach: tri odpovede z 13. 8. („stal sa z nej duch", „finančné
  // dôvody") skončili ako poznámka pri upozornení, pole `precoNeprisiel`
  // zostalo prázdne a otázka sa mohla položiť znova.
  //
  // Dve pripomienky na tú istú vec sú horšie než jedna: register sa tým učí
  // ignorovať. Jedna zmena oproti stavu do 17. 8.: `dovod|` sa pýta 90 dní
  // dozadu, `strata|` pol roka. Na koho sa už nespýta, je v Marketing → lievik.

  // Rozhodnutie, ktorému prešiel termín overenia. Bez tohto by záver z debaty
  // žil len v Jarvisovom prompte a vrátil by sa k nemu, len keď sa naň niekto
  // sám spýta — čiže nikdy. Tu sa ozve sám.
  //
  // ALE NAJPRV SA POZRIE DO KALENDÁRA. Keď záver hovorí „ozvať sa a dohodnúť
  // termín" a ten človek termín už má, pripomienka je falošný poplach — a ten
  // je horší než zmeškaný, lebo podľa neho sa koná. Jerry, 31. 8. 2026: podľa
  // pripomienky napísal Romanovi Pavlíkovi SMS a Roman odpísal, že sú
  // dohodnutí (utorok 1. 9., 10:30). To isté platilo o Michalovi Knapčokovi,
  // ktorý mal v kalendári hneď tri termíny.
  //
  // Záver sa NEZATVÁRA, len sa nehlási. Keď sa termín z kalendára stratí,
  // pripomienka sa vráti sama — presne vtedy, keď je zase pravdivá.
  const dnes = new Date().toISOString().slice(0, 10);
  const menaKlientov = Object.keys(clients);
  for (const z of data.zavery || []) {
    if (!z.overitDo || z.overitDo > dnes) continue;
    // Keď termín už je, pripomienka NEZMIZNE — rovno odpovie.
    //
    // Prvá verzia ju umlčala. Jerry, 31. 8. 2026: chce ju vidieť aj s
    // odpoveďou — „napísal som si, že ide na dovolenku, a rovno vidím, že
    // sme dohodnutí na ten a ten termín“ — a zavrieť ju jedným klikom na
    // Vybavené. Ticho by ho pripravilo o to, že sa človek vracia.
    const termin = zaverUzMaTermin(z, menaKlientov, kal?.udalosti, now);
    push(
      `zaver|${z.id}`,
      "blue",
      "Čas overiť rozhodnutie",
      // Bodku dopĺňame len keď tam nie je — `overit` ju často už má a dve
      // za sebou vyzerajú ako preklep.
      `Z ${z.datum}: ${z.zaver}${z.overit ? ` — malo sa overiť: ${z.overit.replace(/\.\s*$/, "")}` : ""}.`
        + (termin ? ` Termín už máte dohodnutý: ${terminSlovom(termin)}.` : " Zabralo to?"),
    );
  }

  // A referral that actually converted earns the referrer a 10 % thank-you —
  // easy to forget, and forgetting it quietly kills the studio's best channel.
  // "Did they convert?" is not asked — it's read from PTminder: the referred
  // name showing up among clients IS the conversion.
  const byNorm: Record<string, string> = {};
  for (const n of Object.keys(clients)) byNorm[normName(n)] = n;
  // Pripomienka chodí od DOPYTU, nie až od premeny na klienta.
  //
  // Pôvodne sa hlásila až vtedy, keď sa odporúčaný objavil medzi klientmi.
  // Jerry 17. 8. 2026: „keď spravíme dopyt referencia, vyskočí na mňa
  // pripomienka, že treba danému klientovi dať −10 %." Má to logiku aj mimo
  // jeho slov: zľava sa dohaduje pri najbližšom stretnutí s odporúčateľom
  // a to býva skôr, než odporúčaný odtrénuje päť hodín.
  //
  // Rozdiel medzi „už trénuje" a „zatiaľ len napísal" sa ale nezahodí — je
  // v texte, aby sa dalo rozhodnúť, či zľavu dať hneď, alebo počkať.
  const OKNO_ODMENY_DNI = 90;
  for (const l of data.leads || []) {
    if (l.source !== "referencia" || !l.referrer || !l.name) continue;
    const dni = (now.getTime() - Date.parse(l.date)) / 86400000;
    // Staré odporúčania register nezaplavia; deväť naraz je to isté ako nič.
    if (!Number.isFinite(dni) || dni < 0 || dni > OKNO_ODMENY_DNI) continue;
    const ref = clients[byNorm[normName(l.referrer)] ?? l.referrer];
    // Odmena pre klienta, ktorý odišiel, nemá komu pomôcť.
    if (!ref || ref.status === "Neaktívny") continue;
    const uzTrenuje = !!byNorm[normName(l.name)];
    push(
      `referral|${l.id}`,
      "orange",
      "Odmena za odporúčanie",
      `${l.referrer} odporučil ${l.name}${uzTrenuje ? ", ktorý už trénuje" : " (zatiaľ dopyt, ešte netrénuje)"} — nezabudni na 10 % zľavu za doporučenie`,
      l.referrer,
    );
  }

  // ── prečo tu NIE JE kontrola „chodí, ale má 0 hodín" ─────────────────────
  //
  // 19. 8. 2026 tu taká kontrola pár hodín bola (`nulahodin|`) a bola zlá.
  // Vznikla po Natálii Pečkovej, ktorej chýbal import balíčka, a mala hľadať
  // rozpor: kto chodí a platí, má mať čo míňať. Lenže PSB predáva aj PAUŠÁLNE
  // ČLENSTVÁ (GOLD/SILVER/DIAMOND/ONE) a tie v exporte stoja navždy na 0/N —
  // nula hodín je pri nich NORMÁLNY, trvalý stav, nie chyba. Kontrola tak
  // hlásila Jakuba Štiguta (ČLENSTVÍ ONE) ako podozrenie na chýbajúci import,
  // hoci mu appka aj PTminder ukazovali to isté a nechýbalo nič.
  //
  // Takých klientov je 34 zo 76 — kontrola by ich postupne ohlásila všetkých.
  // Je to presne ten bug, ktorý `jeDoplnok` vyššie UŽ RAZ opravoval z druhej
  // strany („došli hodiny" u 40 zo 73 klientov, ktorým nič nekončilo); zopakoval
  // som ho, lebo som si ten komentár neprečítal.
  //
  // Poučenie, nie len história: zo zostatku hodín sa chýbajúci import poznať
  // NEDÁ. Appka nevie, koľko hodín má mať klient, ktorý platí paušálom — jediný,
  // kto to vie, je PTminder. Neúplný import sa preto chytá tam, kde vzniká:
  // pri samotnom importe (`IngestResult.chybaju` v db.server.ts), nie dodatočnou
  // dedukciou z čísel, ktoré na to nestačia.

  // ── Rešerš, ktorej prešla doba spotreby ──────────────────────────────────
  //
  // Jerry, 19. 8. 2026: „takéto veci sa často menia, nemohol by byť nejaký
  // sledovač, ktorý by to raz za pol roka alebo raz za 3 mesiace aktualizoval?"
  //
  // Vedomosť zvonku starne inak než dáta: dáta sú staré viditeľne (dátum pri
  // čísle), rešerš vyzerá rovnako presvedčivo aj rok po tom, čo prestala
  // platiť. Presne to sa stalo s pásmami hook rate — boli merané na
  // trojsekundových videniach, Meta ich zrušila a čísla ostali stáť.
  //
  // Preto sa neozve appka „raz za pol roka" naslepo, ale každá vedomosť podľa
  // vlastnej lehoty: benchmarky rýchlo, princípy pomaly.
  for (const v of data.vedomosti || []) {
    if (!v.obnovovatPoDnoch || !v.overeneAt) continue;
    const dni = Math.floor((now.getTime() - Date.parse(v.overeneAt)) / 86400000);
    if (!Number.isFinite(dni) || dni <= v.obnovovatPoDnoch) continue;
    // Kľúč nesie mesiac, nie deň: inak by sa odloženie umlčalo o deň neskôr
    // a pripomienka by prišla znova zajtra.
    push(
      `vedomost|${v.id}|${new Date().toISOString().slice(0, 7)}`,
      "blue",
      "Rešerš treba obnoviť",
      `„${v.nazov}" má ${dni} dní a mala sa obnovovať po ${v.obnovovatPoDnoch}. ${v.oCom} `
      + `Povedz Claudovi, nech ju prejde znova — čísla a odporúčania sa v tomto obore menia rýchlo.`,
    );
  }

  // Payments from a name with no sessions at all (one per client).
  const seen = new Set<string>();
  for (const p of data.payments as PaymentRow[]) {
    if (!p.client || p.amount > 50000) continue; // skip report-total rows
    if (clients[p.client] || serviceClients.has(p.client) || seen.has(p.client)) continue;
    seen.add(p.client);
    push(`orphan|${p.client}`, "orange", "Platba bez sedení", `${p.client}: má platby, ale žiadne sedenia — over meno/priradenie`, p.client);
  }

  return out.sort((a, b) => (a.acked === b.acked ? 0 : a.acked ? 1 : -1));
}

// ── unified "na čo sa pozrieť" register ──────────────────────────────────────
// One prioritised, actionable list merging 6M alerts, capacity warnings and
// anomalies. Each item can be accepted (with a note) or hidden via anomalyAck.
/**
 * Rodina z kľúča — to isté bez dátumu, mesiaca a počtu.
 *
 * `odchody|2026-07` → `odchody`, `dnes|2026-08-10|Jan` → `dnes|Jan`,
 * `nezhody|2026-07|7` → `nezhody`. Holé číslo sa zahadzuje spolu s dátumom:
 * býva to počet položiek a ten sa mení, takže by sa umlčaná vec pri ôsmich
 * rozdieloch vrátila ako nová. Mená a kategórie zostávajú — umlčať sa má
 * druh veci, nie všetko naraz.
 */
export const rodinaZKluca = (key: string) =>
  key
    .split("|")
    // Dátum sa vyhadzuje aj vtedy, keď je PRILEPENÝ na slovo. Kľúč týždenného
    // rituálu je „zapis|tyzden-2026-08-10" a „2026-08-10" v ňom nie je vlastný
    // diel — rodina preto niesla dátum a „Nehlásiť" umlčalo presne jeden
    // týždeň. Jerry ho 14. 8. stlačil a o týždeň bola vec späť.
    .map((x) => x.replace(/\d{4}-\d{2}(-\d{2})?/g, "").replace(/[-_\s]+$/, ""))
    .filter((x) => x && !/^\d+$/.test(x))
    .join("|") || key;

/**
 * Stav položky registra: vybavená, odložená, alebo umlčaná — a s akou poznámkou.
 *
 * JEDNO MIESTO, LEBO TO UŽ RAZ TICHO ZLYHALO
 *
 * Odloženie sa ukladá ako akceptácia s poznámkou „odlozene|DÁTUM|prečo" a po
 * tom dátume sa má položka vrátiť sama. Túto logiku ale poznala len obrazovka
 * (App.tsx) a týkala sa teda menšiny položiek — kontrol nad bankou, zmien
 * metrík a rituálov. Register sám (anomálie, 6M, kapacita) aj obe pripomienky
 * (SMS, dôvod odchodu) čítali holé `ack[key]`, takže „Odložiť o týždeň" ich
 * schovalo NAVŽDY: appka sľúbila, že sa ozve, a už nikdy sa neozvala.
 *
 * Tlačidlo pritom svieti na každom riadku. Preto je výpočet tu, v knižnici, a
 * volajú ho všetci — obrazovka, register aj pripomienky.
 */
/**
 * Najnovšia odpoveď na to isté z minulosti.
 *
 * Denné pripomienky nesú v kľúči dátum (`dnes|2026-08-24|Petra`), takže zajtra
 * prídu ako nová položka a odpoveď z dneška sa k nim neviaže. Terezka tak
 * odpovedala do prázdna: „poviem jej to dneska" a na druhý deň tá istá veta
 * znova, akoby sa nič nestalo. Vec sa vracať MÁ, kým platí — ale má pri sebe
 * niesť, čo sa na ňu naposledy povedalo.
 *
 * Odložené položky sa preskakujú: „odlozene|dátum" nie je odpoveď, je to termín.
 */
function poslednaOdpovedRodiny(
  ack: Record<string, { note?: string; ackedAt?: string; actor?: string } | undefined>,
  rodina: string,
  okremKluca: string,
): { text: string; kedy: string; kto?: string } | undefined {
  if (!rodina) return undefined;
  let najlepsia: { text: string; kedy: string; kto?: string } | undefined;
  for (const [k, v] of Object.entries(ack)) {
    if (!v || k === okremKluca || k.startsWith("mute|")) continue;
    const text = (v.note || "").trim();
    if (!text || text.startsWith("odlozene|")) continue;
    if (rodinaZKluca(k) !== rodina) continue;
    const kedy = v.ackedAt || "";
    if (!najlepsia || kedy > najlepsia.kedy) najlepsia = { text, kedy, kto: v.actor || undefined };
  }
  return najlepsia;
}

export function stavPolozkyRegistra(
  key: string,
  ack: Record<string, { note?: string; ackedAt?: string; actor?: string } | undefined>,
  rodinaVstup?: string,
  dnes: Date = new Date(),
): {
  acked: boolean; note?: string; rodina: string; vratene?: boolean;
  /** Kto odpoveď napísal. Prázdne pri odpovediach spred 24. 8. 2026. */
  kto?: string;
  /** Čo sa na to isté odpovedalo naposledy — pri vrátenej pripomienke. */
  predchadzajuca?: { text: string; kedy: string; kto?: string };
} {
  const rodina = rodinaVstup ?? rodinaZKluca(key);
  // Umlčaná rodina prebíja všetko: „už mi toto nehlás" platí na celý druh
  // upozornenia, nie na jeden dátum.
  const mute = rodina ? ack[`mute|${rodina}`] : undefined;
  if (mute) return { acked: true, note: mute.note || "nehlásiť", rodina };
  const z = ack[key];
  if (!z) {
    const predchadzajuca = poslednaOdpovedRodiny(ack, rodina, key);
    return predchadzajuca ? { acked: false, rodina, predchadzajuca } : { acked: false, rodina };
  }
  const m = /^odlozene\|(\d{4}-\d{2}-\d{2})\|?([\s\S]*)$/.exec(z.note || "");
  if (!m) return { acked: true, note: z.note, rodina, kto: z.actor || undefined };
  const den = dnes.toISOString().slice(0, 10);
  // Dátum už prešiel → položka sa vracia medzi živé, aj s poznámkou prečo.
  if (m[1] <= den) return { acked: false, note: `odložené na ${m[1]}${m[2] ? ` — ${m[2]}` : ""}`, vratene: true, rodina };
  return { acked: true, note: `odložené do ${m[1]}${m[2] ? ` — ${m[2]}` : ""}`, rodina };
}

/** Z kľúča na ľudskú vetu — čoho sa odpoveď týkala. */
const DRUH_KLUCA: Record<string, string> = {
  duch: "je toto duch", gone: "prestal chodiť", strata: "po úvodnom už neprišiel",
  dovod: "prečo neprišiel znova", sixm: "6M proces", narodeniny: "narodeniny",
  referral: "odmena za odporúčanie", sms: "SMS po úvodnom", odmena: "odporúčanie bez mena",
  bezdopytu: "úvodný bez dopytu", orphan: "platba bez sedení", pauzakoniec: "koniec pauzy",
  zdroj: "chýba zdroj klienta", dnes: "dnešný tréning", zmena: "skok v metrike",
  naklad: "náklad v P&L", dvojity: "možná dvojitá platba", nezhody: "nezhoda s bankou",
  prijmy: "príjmy", barter: "barterové členstvo", data: "staré dáta z PTmindera",
  web: "text webu", zapis: "chýbajúci zápis", cap: "kapacita", zaver: "záver z debaty",
  balicek: "končiaci balíček", btcbezdokladu: "bitcoin bez dokladu", odchody: "odchody klientov",
};

/**
 * Kto je čí klient — vytiahnuté z vety, ktorú Jerry napísal k upozorneniu.
 *
 * PREČO TO NIE JE NA JARVISOVI
 *
 * Jerry, 17. 8. 2026: „áno, zapisuj aj to, kto je čí klient." Dvanásteho
 * augusta odpovedal na dve upozornenia „to je klientka Terezky" a „Jakub
 * Gerrich je Terezkin klient" — obe vety si appka uložila ako poznámku a
 * primárneho trénera nezmenila. Dôsledok nie je kozmetický: podľa neho sa
 * filtruje celý register, takže Jerry ďalej dostával upozornenia na klientov,
 * ktorých netrénuje. Presne to, na čo sa 12. 8. sťažoval.
 *
 * PREČO DETERMINISTICKY A NIE MODELOM
 *
 * Zápis do dát je účtovníctvo a nesmie závisieť od toho, či dobehne odpoveď
 * jazykového modelu — to je tá istá lekcia ako pri strate odpovede o Danovi
 * Kouřilovi 9. 8. Toto je úzke pravidlo, ktoré sa dá prečítať a otestovať.
 *
 * PREČO TAK OPATRNE
 *
 * Falošný zápis je horší než žiadny: prehodí klienta cudziemu trénerovi a
 * nikto si toho nevšimne. Preto musí veta obsahovať OBOJE — meno trénera aj
 * slovo o vlastníctve („klient", „trénuje", „patrí") — a keď sú v nej mená
 * oboch trénerov, funkcia mlčí. „Terezka mi hovorila, že sa vráti" nie je
 * priradenie a nesmie ním byť.
 */
const TVARY_TRENEROV: { trener: "Jerry" | "Terezka"; re: RegExp }[] = [
  { trener: "Terezka", re: /\bterez[kč]\w*/ },   // terezka, terezky, terezkin, terezcin…
  { trener: "Jerry", re: /\bjerr\w*/ },          // jerry, jerryho, jerrymu…
];
/** Slová, ktoré z vety robia priradenie, nie zmienku. */
const VLASTNICTVO = /\b(klient\w*|trenuj\w*|trener\w*|patri\w*|prehod\w*|priradi?\w*|vedie|beri?e si|chodi k)\b/;

export function trenerZOdpovede(text: string): "Jerry" | "Terezka" | null {
  const t = normName(text || "");
  if (!t || !VLASTNICTVO.test(t)) return null;
  const najdene = TVARY_TRENEROV.filter((x) => x.re.test(t));
  // Obaja v jednej vete → nevieme, o koho ide. Radšej nič než hádanie.
  if (najdene.length !== 1) return null;
  return najdene[0].trener;
}

/**
 * Vysvetlenie zrušeného tréningu putuje z registra do Kalendára.
 *
 * PROBLÉM
 *
 * Jerry, 17. 8. 2026: „Keď odpoviem, že Josef dnes zrušil, lebo ho štípla
 * včela — pochopí to Kalendár, keď sa ma o týždeň spýta, prečo tá hodina
 * zmizla?" Nepochopil. Sú to dve tabuľky: odpoveď z registra ide do
 * `anomaly_ack`, otázka Kalendára visí na stĺpci `poznamka` v `kal_zmeny`.
 * Rovnaká veta sa preto musela napísať dvakrát — a druhýkrát, o týždeň, už
 * nikto nevedel, že to bola včela.
 *
 * PREČO ČAKAJÚCE VYSVETLENIE A NIE PRIAMY ZÁPIS
 *
 * V okamihu, keď Jerry odpovedá, zrušenie ešte NIE JE v dátach. Kalendár sa
 * sťahuje ráno a večer; udalosť zmizne až pri najbližšej synchronizácii.
 * Veta preto počká a priradí sa k zmene, keď sa objaví.
 *
 * PREČO TAK ÚZKO
 *
 * Priradiť vysvetlenie nesprávnej zmene je horšie než sa spýtať dvakrát:
 * Kalendár prestane pýtať a zrušená hodina zostane bez dôvodu navždy. Preto
 * tri podmienky naraz — veta musí znieť ako zrušenie, zmena musí byť
 * JEDINÁ nevysvetlená pre toho človeka, a musí prísť do týždňa. Inak veta
 * ticho vyprší a Kalendár sa spýta sám.
 */
export const OKNO_VYSVETLENIA_DNI = 7;

/** Znie odpoveď ako dôvod, prečo sa tréning nekonal? */
export function znieAkoZrusenie(text: string): boolean {
  return /\b(zrusil\w*|zrusen\w*|neprid\w*|neprisi?[eo]l\w*|nedorazil\w*|odriek\w*|presun\w*|posunul\w*|prelozil\w*|chor[yaáí]\w*|choroba|nemocn\w*|dovolenk\w*|zranen\w*|zranil\w*|nestih\w*|marodi\w*|stipl\w*)\b/
    .test(normName(text || ""));
}

export type CakajuceVysvetlenie = { key: string; meno: string; datum: string; text: string };

/** Vety, ktoré čakajú na zmenu v kalendári — kľúč `kalvysv|meno|dátum`. */
export function cakajuceVysvetlenia(
  ack: Record<string, { note?: string } | undefined>,
): CakajuceVysvetlenie[] {
  const out: CakajuceVysvetlenie[] = [];
  for (const [key, v] of Object.entries(ack)) {
    const m = /^kalvysv\|([\s\S]+)\|(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (!m || !v?.note?.trim()) continue;
    out.push({ key, meno: m[1], datum: m[2], text: v.note.trim() });
  }
  return out;
}

export function parujVysvetlenia(
  ack: Record<string, { note?: string } | undefined>,
  zmeny: { id: string; klient: string | null; kedy: string }[],
  dnes: Date = new Date(),
): { hotove: { id: string; poznamka: string; key: string }[]; expirovane: string[] } {
  const hotove: { id: string; poznamka: string; key: string }[] = [];
  const expirovane: string[] = [];
  for (const p of cakajuceVysvetlenia(ack)) {
    const dni = Math.floor((dnes.getTime() - Date.parse(`${p.datum}T00:00:00Z`)) / 86400_000);
    if (!Number.isFinite(dni) || dni > OKNO_VYSVETLENIA_DNI) { expirovane.push(p.key); continue; }
    const kandidati = zmeny.filter(
      (z) => z.klient && normName(z.klient) === p.meno && (z.kedy || "").slice(0, 10) >= p.datum,
    );
    // Presne jedna. Pri dvoch sa nehádа — Kalendár sa spýta na obe.
    if (kandidati.length === 1) hotove.push({ id: kandidati[0].id, poznamka: p.text, key: p.key });
  }
  return { hotove, expirovane };
}

export type OdpovedRegistra = { key: string; datum: string; oCom: string; koho: string | null; odpoved: string };

/**
 * Čo si Jerry odpovedal na upozornenia — aj potom, čo upozornenie zmizlo.
 *
 * PREČO TO VZNIKLO
 *
 * Odpoveď na položku registra sa uloží do `anomaly_ack` a odtiaľ ju číta
 * jediná vec: tá istá položka, dokým ju appka ešte generuje. Lenže väčšina
 * upozornení má okno — SMS 21 dní, odmena 60, dôvod odchodu 90. Keď okno
 * uplynie, položka sa prestane vyrábať a odpoveď zmizne z appky aj z Jarvisovho
 * kontextu. V databáze zostane riadok, ktorý nikto nečíta.
 *
 * 17. 8. 2026 tam takto ležalo dvadsať viet, ktoré appka nikde nevedela
 * povedať — vrátane „Radek Baláž ako nový majiteľ priestoru dal júl 2026
 * zadarmo", „Iva Stoklaskova je klientka Terezky" a „kvôli práci sa vráti až
 * v septembri". Presne to, na čo sa Jarvisa oplatí spýtať o mesiac.
 *
 * Odfiltrované je zametanie: „skryté", „nehlásiť" a odloženia nie sú odpovede,
 * sú to spôsoby, ako sa niečoho zbaviť. Pamätá sa len to, čo niekto napísal.
 */
export function odpovedeZRegistra(
  ack: Record<string, { note?: string; ackedAt?: string } | undefined>,
  limit = 80,
): OdpovedRegistra[] {
  const PRAZDNE = /^(skryté|skryte|nehlásiť|nehlasit|nehlásiť tento druh|odložené z karty|vybavené|ok)$/i;
  const out: OdpovedRegistra[] = [];
  for (const [key, v] of Object.entries(ack)) {
    // `kalvysv|` je tá istá veta odložená nabok pre Kalendár — v pamäti by
    // stála druhýkrát pod nezrozumiteľným kľúčom.
    // `hlasenie|` je zabalené hlásenie z obrazovky (Google Ads, GA4) — je to
    // stav ovládača, nie odpoveď na otázku. V pamäti by z neho bola veta
    // „skryté hlásenie" bez toho, čoho sa týka.
    // `project|` je dátum nastavenia Claude Projectu — poznámka o stave
    // nástroja, nie odpoveď na otázku o firme.
    if (!v || key.startsWith("mute|") || key.startsWith("kalvysv|") || key.startsWith("hlasenie|") || key.startsWith("project|")) continue;
    const raw = (v.note || "").trim();
    if (!raw || PRAZDNE.test(raw) || raw.startsWith("odlozene|")) continue;
    // „odpoveď: " je predpona, ktorú pridáva okienko na Kokpite — v pamäti je
    // to šum, veta sa tým nemení.
    const odpoved = raw.replace(/^odpoveď:\s*/i, "").trim();
    if (!odpoved) continue;
    const diely = key.split("|");
    const druh = DRUH_KLUCA[diely[0]] || diely[0];
    // Posledný diel, ktorý nie je dátum ani číslo, býva meno človeka.
    // Identifikátor nie je meno: `referral|08039e34-…` má v pamäti stáť bez
    // „koho", nie s kusom UUID, ktoré človeku ani modelu nič nepovie.
    const koho = diely.slice(1).reverse().find(
      (x) => x && !/^\d{4}-\d{2}(-\d{2})?$/.test(x) && !/^\d+$/.test(x) && !/^[0-9a-f-]{8,}$/i.test(x),
    ) || null;
    out.push({ key, datum: (v.ackedAt || "").slice(0, 10), oCom: druh, koho, odpoved });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, limit);
}

/**
 * Patrí položka registra vybranému trénerovi?
 *
 * V knižnici a nie v obrazovke preto, že sa to už raz tíško pomýlilo: filter
 * čítal pole `client`, ktoré pri časti položiek nesie cieľ prekliku
 * („klienti|rast"), nie meno klienta — a Jerry preto videl pripomienky ku
 * klientkam, ktoré trénuje Terezka. Chyba, ktorú nevidno inak než tak, že
 * si niekto všimne cudzie meno na svojom zozname.
 */
export function patriTrenerovi(
  r: Pick<RegisterItem, "category" | "title" | "client" | "oKom" | "trener">,
  clients: Record<string, Pick<ClientAgg, "primaryTrainer">>,
  trener: string,
): boolean {
  if (!trener || trener === "all") return true;
  // Priame priradenie vyhráva. Sú veci, ktoré nie sú o klientovi, a predsa
  // patria jednému človeku — prvý kontakt s dopytom je Terezkina práca a
  // zmena v kalendári patrí tomu, komu sa v kalendári stala.
  if (r.trener) return r.trener === trener;
  // Kapacita je o trénerovi, nie o klientovi — pozná sa podľa nadpisu.
  if (r.category === "Kapacita") return r.title.startsWith(trener);
  const meno = r.oKom || r.client;
  if (!meno) return true;
  const c = clients[meno];
  // Neznáme meno zostáva obom: radšej upozornenie navyše než stratené.
  if (!c) return true;
  // Klient TRETIEHO trénera zostáva tiež obom.
  //
  // Matyáš odtrénoval 151 hodín a stále je primárnym trénerom šiestich ľudí,
  // ale v prepínači nie je — filter má len Jerryho, Terezku a Obaja. Jeho
  // klienti tak prepadli medzi stoličky: pri Jerrym sa neukázali, pri Terezke
  // tiež nie, a videli sa len vtedy, keď filter nikto nepoužil. Dve pripomienky
  // na zľavu za odporúčanie takto ležali neviditeľné (17. 8. 2026).
  //
  // Neviditeľné upozornenie je horšie než upozornenie navyše — to je to isté
  // pravidlo ako o riadok vyššie, len pre iný dôvod, prečo sa meno netrafí.
  //
  // „—" sem NEPATRÍ: to neznamená tretieho trénera, ale že sa tréner nedal
  // určiť. Pri ňom platí staršie rozhodnutie — pod filtrom sa neukáže ani
  // jednému (ukázať ho obom by bolo tiché priradenie k nesprávnemu), pri
  // „Obaja" tam je.
  const t = c.primaryTrainer;
  if (t && t !== "—" && !TRAINERS.includes(t as (typeof TRAINERS)[number])) return true;
  return t === trener;
}

export type RegisterItem = {
  key: string;
  category: "6M" | "Kapacita" | "Anomália" | "Rozhodnutie" | "Zápis" | "Zmena";
  tone: "red" | "orange" | "blue";
  title: string;
  detail: string;
  acked: boolean;
  note?: string;
  priority: number; // lower = more important
  client?: string; // client this item is about → "Otvoriť" focuses them in Klienti
  /**
   * Komu položka patrí, keď to z klienta nevyplýva.
   *
   * Dopyt ešte nie je klient a zmena v kalendári nemusí mať meno — bez tohto
   * poľa by obe skončili u oboch trénerov a filter by neznamenal nič.
   */
  trener?: string;
  /**
   * O KOHO ide — výhradne na triedenie podľa trénera.
   *
   * Pole `client` sa časom preťažilo: pri niektorých položkách nesie meno
   * klienta, pri iných cieľ prekliku („klienti|rast", „udaje|"). Filter podľa
   * trénera z toho nevedel poznať, koho sa vec týka, a všetko s cieľom
   * prekliku ukazoval obom. Jerry tak videl pripomienky ku klientkam, ktoré
   * trénuje Terezka.
   *
   * `oKom` je jednoznačné: meno klienta, alebo nič. Cieľ prekliku sem nepatrí.
   */
  oKom?: string;
  /**
   * Rodina položky — čo znamená „už mi toto nehlás".
   *
   * Kľúč jednej položky nesie dátum alebo mesiac (`odchody|2026-07`,
   * `dnes|2026-08-09|Jan Kral`), takže „Skryť" umlčalo presne jeden deň
   * a zajtra bola vec späť. Rodina je ten istý kľúč bez premenlivej časti,
   * takže sa dá umlčať CELÝ druh upozornenia pre daného klienta či kategóriu.
   * Kto rodinu nemá, sa umlčať nedá — a to je zámer: pri niektorých veciach
   * (chýbajúci nájom) je ticho horšie než otrava.
   */
  rodina?: string;
  /** Kto odpoveď napísal. Prázdne pri starších odpovediach. */
  kto?: string;
  /** Odpoveď na to isté z minulosti — pri pripomienke, ktorá sa vrátila. */
  predchadzajuca?: { text: string; kedy: string; kto?: string };
};

/**
 * Informatívna položka ustúpi, keď o tom istom človeku už niečo pýta akciu.
 *
 * Jana Malinová mala 18. 8. tri notifikácie naraz: „nový klient po úvodnom",
 * „SMS po úvodnom" a „úvodný bez dopytu". Dve z nich sú úlohy, tretia je len
 * konštatovanie, že ju export ešte nepotvrdil — a to sa dá prečítať v Klientoch
 * v rámčeku „Čakajú na potvrdenie". Tri riadky o jednom človeku sú presne to
 * zaplavenie, po ktorom sa zoznam prestane čítať.
 *
 * Keď o človeku nič iné otvorené nie je (SMS sa pripomína 21 dní, dopyt 45),
 * `novy|` zostáva — inak by po uplynutí okien nezostal signál žiadny.
 */
export function novyKlientAkNicIne(polozky: RegisterItem[]): RegisterItem[] {
  const inde = new Set<string>();
  for (const p of polozky) {
    if (p.acked || p.key.startsWith("novy|")) continue;
    const meno = p.oKom || (p.client && !p.client.includes("|") ? p.client : "");
    if (meno) inde.add(normName(meno));
  }
  return polozky.filter((p) => {
    if (!p.key.startsWith("novy|") || p.acked) return true;
    const meno = p.oKom || p.client || "";
    return !inde.has(normName(meno));
  });
}

const toneRank: Record<string, number> = { red: 0, orange: 1, blue: 2 };

export function deriveRegister(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  sixM: SixMRow[],
  capacity: CapacityRow[],
  kal?: { udalosti?: { zaciatok: string; klient: string | null; typ: string | null }[]; zmeny?: ZmenaVKalendari[] },
): RegisterItem[] {
  const ack = data.anomalyAck || {};
  const items: RegisterItem[] = [];
  /**
   * Rodina odvodená z kľúča: to isté bez dátumu a mesiaca.
   *
   * `odchody|2026-07` → `odchody`, `dnes|2026-08-10|Jan` → `dnes|Jan`.
   * Vďaka tomu má rodinu KAŽDÁ položka a „Nehlásiť" sa dá použiť všade —
   * Jerry (10. 8.) to chcel na všetkých. Pôvodne som ho niektorým zámerne
   * nedal („pri nezaplatenom nájme je ticho horšie než otrava"), lenže to je
   * jeho rozhodnutie, nie moje: appka má poslúchať, nie prehovárať.
   */
  const add = (
    key: string,
    category: RegisterItem["category"],
    tone: RegisterItem["tone"],
    title: string,
    detail: string,
    basePriority: number,
    client?: string,
    rodina?: string,
    /** Komu položka patrí, keď to z klienta nevyplýva — filter podľa trénera. */
    kto?: { trener?: string | null; oKom?: string },
  ) =>
    items.push({
      key,
      category,
      tone,
      title,
      detail,
      priority: basePriority + toneRank[tone],
      client,
      trener: kto?.trener || undefined,
      oKom: kto?.oKom,
      // Umlčanie AJ odloženie sa počítajú tu, nie v komponente: register čítajú
      // tri miesta (Kokpit, Jarvisov kontext, mesačná správa) a musia platiť
      // vo všetkých rovnako.
      ...stavPolozkyRegistra(key, ack, rodina),
    });

  // Staré dáta klamú ticho — a to je horší druh klamstva než chýbajúce číslo.
  //
  // Keď sa týždeň nenahrá export z PTmindera, appka nič nehlási: dochádzka
  // každému klesne (okno 18 týždňov sa posúva, ale nové tréningy nepribúdajú),
  // lievik bežiaceho mesiaca ukáže nula nových klientov a vyzerá to ako zlý
  // mesiac namiesto prázdnej tabuľky. Preto to appka povie nahlas, kým je
  // rozdiel medzi „nič sa nedialo" a „nič sme nenahrali" ešte zistiteľný.
  const posledneData = data.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
  if (posledneData) {
    const dniStare = Math.floor(daysBetween(posledneData, new Date()));
    if (dniStare >= 4) {
      add(
        `data|${posledneData.slice(0, 10)}`,
        "Zápis",
        dniStare >= PRAH_ZASTARANIA ? "red" : "orange",
        `Dáta z PTmindera končia ${fmtDMY(posledneData)}`,
        `Posledné nahraté sedenie je z ${fmtDMY(posledneData)}, teda spred ${dniStare} dní. Kým nenahráš nový export, dochádzka klientov klesá sama a čísla za tento mesiac sú neúplné — nula nových klientov nemusí znamenať, že nikto neprišiel.`,
        1,
        // Kategória Zápis nesie cieľ prekliku v poli client ako „tab|sub“.
        // Bez neho by „Otvoriť“ viedlo na Klientov, teda nie tam, kde sa to rieši.
        "udaje|",
      );
    }
  }

  // Barterové členstvo je vzdaná tržba, nie darček — a keď na jeho započítanie
  // nikto neupozorní, ticho zmizne z Jarkovho dlhu. Appka to zachytí v mesiaci,
  // keď členstvo začalo; započítanie prebehne samo, toto je len na overenie.
  for (const p of data.packages) {
    if (!BARTER_KLIENTI.includes(p.client) || !p.payment || !p.validFrom) continue;
    const mk = p.validFrom.slice(0, 7);
    if (mk < "2026-07") continue;
    add(
      `barter|${p.client}|${mk}`,
      "Rozhodnutie",
      "blue",
      `${p.client}: nové členstvo za ${Math.round(p.payment).toLocaleString("sk-SK")} Kč`,
      `Členstvo začalo ${fmtDMY(p.validFrom)} a nie je zaplatené — appka ho započítala ako vzdanú tržbu, teda splátku Jarkovho dlhu. Skontroluj sumu vo VZAS → Jarek dlh.`,
      30,
    );
  }

  for (const c of sixM) {
    if (!c.alert) continue;
    // Klient na dohodnutej pauze nepotrebuje hodnotiaci rozhovor tento týždeň.
    // Svieti to na neho zbytočne a v zozname 33 upozornení je každé zbytočné
    // dôvodom, prečo sa zoznam prestane čítať.
    if (clients[c.client]?.status === "Pauza") continue;
    const tone = c.alertTone === "red" ? "red" : "orange";
    // Meno patrí do textu, nie len do titulku — v registri sa zobrazuje detail
    // a bez mena sa nedalo zistiť, koho sa to týka.
    add(`sixm|${c.client}|${c.phase}|${c.monthInPhase}`, "6M", tone, `${c.client} — 6M`, `${c.client}: ${c.alert}`, 0, c.client, `sixm|${c.client}`);
  }
  // Capacity signal uses the SAME real-hours utilisation the capacity card and the
  // assistant show (util = tighter of typical→29h / busy→34h), NOT the reference-only
  // effHours — that segment-weighted proxy sits far below the 24–34h zone and used to
  // flag both trainers "pod zónou" permanently. Only surface the actionable extremes:
  // genuinely at the cap (burnout risk) or a lot of free room (fill the schedule).
  for (const cap of capacity) {
    if (cap.util >= 100)
      add(`cap|${cap.trainer}|over`, "Kapacita", "red", `${cap.trainer} — na strope kapacity`, cap.advice, 10, undefined);
    else if (cap.util < 60)
      add(`cap|${cap.trainer}|under`, "Kapacita", "orange", `${cap.trainer} — veľa voľného priestoru`, cap.advice, 10, undefined);
  }
  // Kalendár tvrdí tréning, export ho nepotvrdil. Vysoká priorita: je to
  // buď nezaplatená hodina, alebo klient, ktorý prestal chodiť a appka o tom
  // podľa kalendára nevie.
  const cakajuci = cakajuciKlienti(clients, kal?.udalosti, kal?.zmeny);
  const cakajuciMena = new Set(cakajuci.map((c) => normName(c.meno)));
  for (const n of nepotvrdeneTreningy(data.sessions, kal?.udalosti, kal?.zmeny)) {
    // Pri človeku, ktorého appka ešte vôbec nepozná, je „chýba v PTminderi"
    // a „nový klient čaká na potvrdenie" tá istá veta dvakrát. Hovorí ju tá
    // druhá — je zrozumiteľnejšia a vedie k tomu istému kroku.
    if (cakajuciMena.has(normName(n.klient))) continue;
    add(
      `nepotvrdene|${n.datum}|${n.klient}`,
      "Zápis",
      "orange",
      `${n.klient} — tréning ${fmtDMY(n.datum)} nie je v PTminderi`,
      `${n.klient}: tréning ${fmtDMY(n.datum)} je v kalendári, ale v PTminderi nie — a ten deň už export pokrýva. Konal sa, alebo nie?`,
      7,
      n.klient,
      "nepotvrdene",
      { trener: n.trener, oKom: n.klient },
    );
  }

  // Človek po úvodnom, ktorého appka ešte nepozná. Profil vzniká z kalendára,
  // potvrdenie príde z exportu — a vtedy položka zmizne sama.
  for (const c of cakajuci) {
    add(
      `novy|${c.uvodny}|${c.meno}`,
      "Zápis",
      "blue",
      `${c.meno} — nový klient po úvodnom ${fmtDMY(c.uvodny)}`,
      `${c.meno}: úvodný ${fmtDMY(c.uvodny)}, v PTminderi ešte nie je. Potvrdí ho najbližší export — dovtedy nemá zostatok hodín ani dochádzku.${c.zNazvu ? " Meno je z názvu udalosti; preklep oprav v Kalendári." : ""}`,
      8,
      // Karta klienta ešte neexistuje — klik vedie na Klientov, kde stojí
      // v rámčeku „Čakajú na potvrdenie".
      "klienti|klienti",
      "novy",
      { trener: c.trener, oKom: c.meno },
    );
  }

  // Tréning bez mena. Nespočíta sa nikam a pritom je to jedno kliknutie.
  for (const u of udalostiBezMena(kal?.udalosti)) {
    add(
      `bezmena|${u.datum}|${u.nazov || u.typ}`,
      "Zápis",
      "orange",
      `${u.typ === "uvodny" ? "Úvodný" : "Tréning"} ${fmtDMY(u.datum)} bez mena klienta`,
      `${u.nazov ? `„${u.nazov}"` : `${u.typ === "uvodny" ? "Úvodný" : "Tréning"} ${fmtDMY(u.datum)}`} nemá priradeného klienta, takže sa nespočíta nikam. Prirad ho v Kalendár → neznáme názvy.`,
      7,
      "kalendar|",
      "bezmena",
      { trener: u.trener },
    );
  }

  for (const a of deriveAnomalies(data, clients, kal)) {
    // Záver z debaty nie je anomália — je to sľub, ktorý si sám pripomenul.
    add(a.key, a.key.startsWith("zaver|") ? "Rozhodnutie" : "Anomália", a.tone, a.label, a.detail, 20, a.client);
  }

  return items.sort((a, b) => {
    if (a.acked !== b.acked) return a.acked ? 1 : -1;
    return a.priority - b.priority;
  });
}

// ── earnings prediction (run-rate + prepaid, two-layer) ──────────────────────
//
// Predplatené hodiny sú najtvrdší údaj, aký o budúcnosti máme — sú zaplatené a
// niekto ich musí odchodiť. Model ich preto berie ako záruku, ale až odkedy
// poznáme dve veci, ktoré predtým ignoroval:
//
//  1. ČLENSTVÁ MAJÚ PLATNOSŤ. Päť hodín na mesačnom členstve sa nedá rozložiť
//     do troch mesiacov — buď sa odchodia, alebo prepadnú. Rozprestierať ich
//     rovnomerne znamenalo sľubovať prácu, ktorá už nemôže nastať.
//  2. TICHO ZNAMENÁ RIZIKO. Klient, ktorý mesiac nedal o sebe vedieť, má
//     zaplatené hodiny, ale nie je isté, že po ne príde — to je presne vzorec
//     „ducha". Jeho zostatok nie je záruka, je to nádej.

/** Koľko mesiacov platí členstvo podľa názvu balíčka (viď prevadzka.md). */
export function platnostMesiacov(nazovBalicka: string): number {
  const n = (nazovBalicka || "").toLowerCase();
  if (n.includes("one year")) return 12;
  if (n.includes("18 hod")) return 6;
  if (n.includes("s viazanost")) return 1;      // mesačné, max 2 h sa prenášajú
  if (n.includes("bez viazanost")) return 2;    // 8 týždňov
  if (n.includes("8 hod")) return 2;            // 8 týždňov
  if (n.includes("1 hodina")) return 1;         // 4 týždne
  return 2;                                     // doplnenie členstva a neznáme
}
export type PredMonth = { month: string; guaranteed: number; expected: number };
export type Prediction = {
  months: PredMonth[];
  guaranteedTotal: number; // 3-month revenue backed by prepaid package balances
  monthlyRunRate: number; // sum of clients' expected monthly revenue (gross)
  scenarios: { optimistic: number; realistic: number; negative: number }; // 3-month totals
  perClient: {
    name: string;
    trainer: string;
    type: string;
    remaining: number;
    burnRate: number; // sessions/month
    burnWeek: number; // sessions/week
    monthlyRevenue: number;
    guaranteed3m: number;
    confidence: number;
  }[];
};

// The next `n` FULL months, starting next month (forward-looking forecast).
// Predpoveď má začínať tam, kde končia DÁTA, nie tam, kde končí kalendár.
// Uzávierka je až prvý víkend nasledujúceho mesiaca, takže začiatkom mesiaca
// ešte nie sú nahraté žiadne tréningy — a bez tohto by aktuálny mesiac vypadol
// úplne: nebol by ani skutočnosť, ani odhad (2. 8. viedol graf júl → september).
const nextMonthKeys = (n: number, poslednyZDat?: string): string[] => {
  const out: string[] = [];
  const teraz = new Date();
  const zaciatok = poslednyZDat && poslednyZDat < `${teraz.getFullYear()}-${String(teraz.getMonth() + 1).padStart(2, "0")}`
    ? new Date(Number(poslednyZDat.slice(0, 4)), Number(poslednyZDat.slice(5, 7)) - 1, 1)
    : teraz;
  const d = zaciatok;
  d.setMonth(d.getMonth() + 1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

// ── predikcia PRIJATÝCH tržieb (peniaze, nie odpracované hodiny) ─────────────
//
// Tržby a zárobky sú dve rôzne veci a doteraz sa predpovedali rovnako naivne:
// priemerom posledných mesiacov. Lenže peniaze nechodia rovnomerne — chodia,
// keď niekomu skončí členstvo a kúpi si ďalšie. To je predvídateľné:
//   posledná platba + platnosť členstva = kedy pravdepodobne príde ďalšia.
//
// Suma sa berie z POSLEDNEJ platby klienta, nie z cenníka. Je to elegantnejšie
// aj presnejšie: posledná platba už v sebe nesie jeho zľavy — bitcoin, referral,
// Jarkových 40 %, Dominikinu pätnástku — bez toho, aby ich model musel poznať.
export type CashPred = { month: string; expected: number; lo: number; hi: number };

/**
 * Koľko hodín má klient objednaných dopredu v Google Kalendári.
 *
 * Žije to ako modulová premenná a nie ako parameter zámerne: predictCash volá
 * šesť miest (dashboard, grafy, Financie, VZAS) a keby si kalendár podávalo len
 * jedno z nich, appka by na dvoch obrazovkách ukazovala dve rôzne predikcie.
 * Napĺňa sa CENTRÁLNE v App.tsx — tá istá lekcia ako pri tržbách z PTmindera.
 */
let OBJEDNANE: Record<string, number> = {};
// Verzia — rovnaký dôvod ako vzasVerzia: OBJEDNANE sa plní async fetchom mimo
// Reactu, takže useMemo s deps [data, clients] sa o zmene nedozvie. Revízia
// našla štyri predikcie (Financie → Predikcia, Výhľad vo Výsledkoch, stĺpec
// prognózy v Zárobkoch, graf predikcie v knižnici), ktoré počítali BEZ
// objednaných hodín, kým ich náhodou neprepočítalo niečo iné — typicky import
// z Fio, ktorý dobehne o pár stoviek milisekúnd neskôr a chybu maskuje.
let OBJEDNANE_VERZIA = 0;
export const objednaneVerzia = () => OBJEDNANE_VERZIA;

/**
 * Má tento človek dohodnutý termín v kalendári?
 *
 * Jerry, 14. 8.: „a ak majú dohodnutý úvodný tréning, mám ich tiež vymazať?"
 * Nemá — a hlavne sa naňho appka nesmie spoliehať, že si to bude pamätať.
 * Filter „len nevyriešené" a tlačidlo „zapísať prečo" inak lákajú uzavrieť
 * človeka, ktorý príde zajtra.
 *
 * Meno sa páruje tolerantne (`najdiKlienta`): dopyt písaný z hlavy a názov
 * udalosti v kalendári sa v diakritike aj preklepe rozchádzajú bežne.
 */
export function maTermin(meno: string): boolean {
  if (!meno.trim()) return false;
  const kluc = najdiKlienta(Object.keys(OBJEDNANE), meno);
  return !!(kluc && OBJEDNANE[kluc] > 0);
}
export function nastavObjednaneZKalendara(m: Record<string, number>): boolean {
  const zmena = JSON.stringify(m) !== JSON.stringify(OBJEDNANE);
  OBJEDNANE = m;
  if (zmena) OBJEDNANE_VERZIA++;
  return zmena;
}

export function predictCash(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  horizon = 3,
): { months: CashPred[]; perClient: { name: string; kedy: string; suma: number; confidence: number; tyzdnov: number }[] } {
  const poslednyMesiacDat = data.payments.reduce((max, p) => (p.date.slice(0, 7) > max ? p.date.slice(0, 7) : max), "");
  const keys = nextMonthKeys(horizon, poslednyMesiacDat);
  const months: CashPred[] = keys.map((m) => ({ month: m, expected: 0, lo: 0, hi: 0 }));
  const perClient: { name: string; kedy: string; suma: number; confidence: number; tyzdnov: number }[] = [];
  const sixM = deriveSixM(data, clients);
  const sixMPhase: Record<string, SixMRow> = {};
  for (const r of sixM) sixMPhase[r.client] = r;
  const teraz = new Date();
  const mesiacKluc = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (const c of Object.values(clients)) {
    // Kalendár môže poprieť to, čo si appka myslí podľa PTmindera: kto má
    // dohodnutý termín, neodišiel — nech si o ňom história myslí čokoľvek.
    // Predikcia bez tejto opravy odpisovala ľudí, ktorí zajtra prídu.
    const objednane = OBJEDNANE[c.name] || 0;
    if (c.status === "Neaktívny" && !objednane) continue;
    if (duchOdpoved(c) === "ano" && !objednane) continue;   // potvrdený duch už nezaplatí
    // Dohodnutá pauza je to najsilnejšie, čo o budúcnosti vieme — je to jediná
    // informácia, ktorú appka nedopočítala, ale dostala od človeka. Kým beží,
    // klient nemíňa hodiny, a teda ani nekupuje ďalšie.
    //
    // Po skončení pauzy sa počíta ďalej: register vtedy ohlási „ozvi sa"
    // a odhad má opäť čo predpovedať. Klient s dohodnutým termínom v kalendári
    // je výnimka — kto má termín, tomu pauza fakticky skončila.
    if (c.status === "Pauza" && !objednane) {
      const trva = !c.pauseUntil || daysBetween(c.pauseUntil, teraz) < 0;
      if (trva) continue;
    }
    const platby = data.payments
      .filter((p) => p.client === c.name && p.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!platby.length) continue;
    const posledna = platby[platby.length - 1];
    // Kto bol LEN na úvodnom, nemá čo obnovovať.
    //
    // Podmienka znela „malá platba a zároveň viac platieb" — čo je presne
    // naopak: jediná platba za 1 100 Kč je najsilnejší znak, že to bol úvodný
    // tréning a nič viac. Roman Pavlík (úvodný 5. 8., jedno sedenie, jedna
    // platba) sa tak dostal medzi očakávané tržby augusta.
    //
    // Rozhoduje sa podľa sedení, nie podľa sumy: klient, ktorý platí po
    // jednom tréningu, má tiež platby okolo 1 100 Kč a jeho obnovy sú
    // skutočné. Je to tá istá definícia klienta ako v lieviku — kto prišiel
    // druhý raz, ten sa rozhodol.
    if (!c.sessions.some((x) => x.sessionType !== "UVODNE")) continue;

    // Tempo v hodinách za týždeň z posledných 90 dní. Bez neho sa nedá povedať
    // nič — klient bez tréningov v poslednom štvrťroku nekupuje ďalší balíček.
    const sedeni90 = c.sessions.filter((x) => daysBetween(x.date, teraz) <= 90).length;
    // Objednané hodiny sú tempo, ktoré ešte nie je v histórii. Rozpočítavajú sa
    // na dva týždne — ďalej dopredu kalendár nesiaha spoľahlivo (opakované
    // udalosti o mesiac sú zvyk, nie plán).
    const tempoTyzdenne = Math.max(sedeni90 / 13, objednane / 2);
    if (tempoTyzdenne <= 0.05) continue;

    // Koľko hodín si naposledy kúpil — z ceny, nie z názvu balíčka. Názov je
    // momentka a u klienta dochádzajúceho staré hodiny píše „Doplnenie
    // členstva" aj pri ročnom členstve za 77 tisíc.
    const cenaHodiny = c.paidAvg || 1150;
    const hodinyKupene = Math.max(1, Math.min(100, posledna.amount / cenaHodiny));

    // ── Jadro: platba nepríde podľa kalendára, ale keď dôjdu hodiny ──────────
    // Šesťhodinový balíček s dvojmesačnou platnosťou minie klient chodiaci raz
    // týždenne za šesť týždňov, nie za dva mesiace — a vtedy platí znova.
    // Preto sa termín počíta zo ZOSTATKU a TEMPA, a platnosť je len strop:
    // po nej hodiny prepadnú a ďalšia platba už nie je obnova, ale nová dohoda.
    const zostatok = Math.max(0, c.packageRemaining);
    const tyzdnovDoMinutia = zostatok / tempoTyzdenne;
    const zoZostatku = new Date(teraz.getTime() + tyzdnovDoMinutia * 7 * 86400000);

    // Ktorej kotve veriť:
    //
    //  ZOSTATOK je pravda, keď je nenulový — je to aktuálny stav a hovorí presne,
    //  koľko hodín ešte treba odchodiť. Z výšky platby sa to odvodiť NEDÁ:
    //  PSB je benevolentné a nechá klienta bežať mesiac pozadu, takže platba
    //  môže kryť aj spätný mesiac. Kaňovský 1. 7. zaplatil za jeden mesiac
    //  dozadu a jeden dopredu — z dvanástich zaplatených hodín bola polovica
    //  už odchodená a dopredu zostalo šesť, nie dvanásť.
    //
    //  PLATBA rozhoduje len vtedy, keď je zostatok nulový. Vtedy momentka nič
    //  nehovorí (u klienta dochádzajúceho staré hodiny ukazuje nulu aj deň po
    //  tom, čo si kúpil rok dopredu) a jediné vodítko je, koľko si kúpil.
    const zPlatby = new Date(posledna.date);
    zPlatby.setDate(zPlatby.getDate() + Math.round((hodinyKupene / tempoTyzdenne) * 7));
    // Nulový zostatok pri STAREJ platbe nie je momentka, je to fakt.
    //
    // Výnimka pre nulu vznikla kvôli klientovi, čo si práve kúpil rok dopredu
    // a export to ešte nezachytil. Platí ale len krátko po platbe. Panagiotis
    // Tsiolis zaplatil v novembri, odvtedy odchodil všetko a export mu ukazuje
    // nula hodín — a model ho aj tak posielal na obnovu až do októbra, lebo
    // z ceny balíčka si dopočítal, že mu ešte deväť hodín zostáva. Vlastná
    // aritmetika prebila zapísaný stav.
    const cerstvaPlatba = daysBetween(posledna.date, teraz) <= 30;
    const prvaObnova = zostatok > 0
      ? new Date(Math.max(zoZostatku.getTime(), teraz.getTime()))
      : cerstvaPlatba
        ? new Date(Math.max(zPlatby.getTime(), teraz.getTime()))
        : new Date(teraz.getTime());

    // Skutočný koniec platnosti z exportu má prednosť pred odhadom. Export
    // členstiev ho odteraz nesie ("30 Jun 2026 - 24 Aug 2026") a je to presne
    // to číslo, ktoré model dovtedy dopočítaval z názvu balíčka a poslednej
    // platby — teda hádal.
    const platnost = platnostMesiacov(c.membership);
    const expiracia = c.packageValidTo
      ? new Date(c.packageValidTo)
      : (() => { const d = new Date(posledna.date); d.setMonth(d.getMonth() + platnost); return d; })();
    // Zostatok, ktorý sa do platnosti nestihne minúť, prepadne — vtedy je
    // dátumom ďalšej platby koniec platnosti, nie dopočítané minutie.
    const kedyDatum = prvaObnova > expiracia && c.membership && !c.membership.toLowerCase().includes("doplnenie")
      ? expiracia
      : prvaObnova;

    // Dĺžka ďalšieho cyklu = koľko hodín si kupuje / ako rýchlo ich míňa.
    const cyklusTyzdnov = Math.max(2, hodinyKupene / tempoTyzdenne);

    const is6m = c.clientType === "6M Predplatné";
    let confidence = is6m ? 0.9 : c.segment === "Anchor" ? 0.8 : c.segment === "Stabilný" ? 0.6 : 0.35;
    if (sixMPhase[c.name]?.phase === "Obnova" && sixMPhase[c.name]?.monthInPhase === 5) confidence = 0.7;
    // Pravidelnosť dochádzky rozhoduje o tom, či sa dá termínu veriť. Kto chodí
    // poctivo každý týždeň, minie šesť hodín naozaj za šesť týždňov; kto chodil
    // pol roka ledabolo, to isté rozťahuje a termín je len zbožné prianie.
    confidence *= 0.6 + 0.4 * Math.min(1, c.attendance / 0.7);
    if (daysBetween(c.lastSession, teraz) >= 30) confidence *= 0.5;   // ticho = riziko

    const konfZaciatok = Math.max(0.05, Math.min(0.95, confidence));

    // Najbližšia obnova sa zapíše VŽDY — aj keď vychádza na tento mesiac.
    //
    // Doteraz sa `perClient` plnil až vnútri mesiacov grafu, a ten zámerne
    // začína budúcim mesiacom (predpoveď má začínať tam, kde končia dáta).
    // Kto mal obnovu dnes, nemal kam spadnúť: dashboard sa pýtal „kto zaplatí
    // do konca TOHTO mesiaca" a odpovedal zoznamom, v ktorom tento mesiac
    // z princípu nebol. Panagiotis Tsiolis — nula hodín, tréning pred týždňom —
    // v ňom preto chýbal.
    //
    // Graf mesiacov ostáva nedotknutý; mení sa len to, že zoznam ľudí je
    // kompletný.
    perClient.push({
      name: c.name, kedy: mesiacKluc(kedyDatum), suma: posledna.amount,
      confidence: konfZaciatok,
      tyzdnov: Math.max(0, Math.round(((kedyDatum.getTime() - teraz.getTime()) / (7 * 86400000)) * 10) / 10),
    });

    // Obnovy sa opakujú v rytme cyklu, každá ďalšia je o niečo menej istá.
    const d = new Date(kedyDatum);
    let konf = konfZaciatok;
    for (let guard = 0; guard < 24; guard++) {
      const idx = keys.indexOf(mesiacKluc(d));
      if (idx >= 0) {
        months[idx].expected += posledna.amount * konf;
        months[idx].lo += posledna.amount * Math.max(0, konf - 0.2);
        months[idx].hi += posledna.amount * Math.min(1, konf + 0.15);
        konf *= 0.85;
      }
      d.setDate(d.getDate() + Math.round(cyklusTyzdnov * 7));
      if (mesiacKluc(d) > keys[keys.length - 1]) break;
    }
  }

  for (const m of months) { m.expected = Math.round(m.expected); m.lo = Math.round(m.lo); m.hi = Math.round(m.hi); }
  perClient.sort((a, b) => b.suma * b.confidence - a.suma * a.confidence);
  return { months, perClient };
}

export function predictEarnings(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  opts: { excludeSpecial: boolean; horizon?: number } = { excludeSpecial: false },
): Prediction {
  const horizon = opts.horizon ?? 3;
  const poslednyMesiacDat = data.sessions.reduce((max, x) => (x.date.slice(0, 7) > max ? x.date.slice(0, 7) : max), "");
  const monthsArr = nextMonthKeys(horizon, poslednyMesiacDat).map((m) => ({ month: m, guaranteed: 0, expected: 0 }));
  const sixM = deriveSixM(data, clients);
  const sixMPhase: Record<string, SixMRow> = {};
  for (const r of sixM) sixMPhase[r.client] = r;

  const scenarios = { optimistic: 0, realistic: 0, negative: 0 };
  const perClient: Prediction["perClient"] = [];
  let monthlyRunRate = 0;

  for (const c of Object.values(clients)) {
    if (c.status === "Neaktívny") continue;
    if (opts.excludeSpecial && c.specialRate) continue;
    // Potvrdený duch negeneruje budúci príjem. Bez tohto by mŕtvy klient ešte
    // ~2 mesiace prispieval do run-rate (minimálne tempo 0,4 sedenia/mes.),
    // kým mu dochádzka neklesne pod prah Neaktívny.
    if (duchOdpoved(c) === "ano") continue;

    // Tempo: nedávne správanie váži viac než celoživotný priemer. Klient, ktorý
    // pred rokom chodil štyrikrát mesačne a dnes raz, nie je klient na štyri.
    const price = c.paidAvg || 1150;
    const teraz = new Date();
    const monthsActive = Math.max(1, monthsBetween(c.firstSession, teraz) + 1);
    // Len posledných 90 dní. Miešať do toho celoživotný priemer znie opatrne, ale
    // v rastúcej firme to systematicky podstreľuje: run-rate vychádzal 147k,
    // hoci posledné tri mesiace boli 176k — rozdiel ťahal nadol slabší rok 2025.
    // Kto chodí kratšie než 90 dní, delí sa počtom mesiacov, ktoré naozaj mal.
    const oknoMesiacov = Math.max(1, Math.min(3, monthsActive));
    const tempo = c.sessions.filter((x) => daysBetween(x.date, teraz) <= 90).length / oknoMesiacov;
    const burnRate = Math.max(0.4, Math.min(10, tempo));
    // Sedenia za 0 Kč (doplnenie členstva, darované tréningy) sú ~19 % všetkých.
    // Do práce sa počítajú, do tržieb nie — inak by predikcia nafúkla obe.
    const platenych = c.sessions.filter((x) => x.price > 0).length;
    const podielPlatenych = c.sessionCount ? Math.max(0.5, platenych / c.sessionCount) : 1;
    const monthlyRevenue = burnRate * price * podielPlatenych;
    if (c.status === "Aktívny" || c.status === "Sporadický") monthlyRunRate += monthlyRevenue;

    // Renewal confidence by segment / 6M phase (per spec).
    const is6m = c.clientType === "6M Predplatné";
    let confidence: number;
    if (is6m && sixMPhase[c.name]?.phase === "Obnova" && sixMPhase[c.name]?.monthInPhase === 5)
      confidence = 0.7;
    else if (is6m) confidence = 0.95;
    else if (c.segment === "Anchor" && c.serviceCount >= 2) confidence = 0.85;
    else if (c.segment === "Stabilný") confidence = 0.6;
    else if (c.serviceCount <= 1) confidence = 0.4;
    else confidence = 0.3; // Sporadický

    // Walk the next `horizon` months. While a prepaid package balance lasts the
    // month's sessions are GUARANTEED; sessions beyond the balance (or all of
    // them for clients without package data) are EXPECTED, weighted by renewal
    // confidence. This keeps totals close to the real monthly run-rate instead
    // of adding a full package price per client.
    // Ticho = riziko. Po 30 dňoch bez tréningu prestáva byť zostatok zárukou.
    const dniTicha = daysBetween(c.lastSession, new Date());
    const mlci = dniTicha >= 30;
    if (mlci) confidence = Math.max(0.1, confidence * 0.5);

    // Dokedy sa dá zostatok minúť: od poslednej platby + platnosť členstva.
    // Bez platby to nevieme, tak nechávame celý horizont (ako predtým).
    const poslednaPlatba = (data.payments || [])
      .filter((pmt) => pmt.client === c.name)
      .reduce((max, pmt) => (pmt.date > max ? pmt.date : max), "");
    const mesiacovPlatnosti = poslednaPlatba
      ? Math.max(0, platnostMesiacov(c.membership) - monthsBetween(poslednaPlatba, new Date()))
      : horizon;

    let balance = c.packageRemaining;
    let guaranteed3m = 0;
    for (let i = 0; i < horizon; i++) {
      // Po vypršaní platnosti (alebo keď klient mlčí) zostatok už nie je záruka —
      // hodiny buď prepadnú, alebo sa dochodia cez „doplnenie členstva", čo je
      // nová dohoda, nie istota.
      const zostatokPlati = i < mesiacovPlatnosti && !mlci;
      const fromBalance = zostatokPlati ? Math.min(balance, burnRate) : 0;
      balance -= fromBalance;
      const beyond = burnRate - fromBalance; // sessions needing renewal / ongoing pay
      const gRev = fromBalance * price * podielPlatenych;
      const eRev = beyond * price * podielPlatenych;
      guaranteed3m += gRev;
      monthsArr[i].guaranteed += gRev;
      monthsArr[i].expected += eRev * confidence;
      scenarios.realistic += gRev + eRev * confidence;
      scenarios.optimistic += gRev + eRev * Math.min(1, confidence + 0.15);
      scenarios.negative += gRev + eRev * Math.max(0, confidence - 0.2);
    }

    perClient.push({
      name: c.name,
      trainer: c.primaryTrainer,
      type: c.clientType,
      remaining: c.packageRemaining,
      burnRate,
      burnWeek: burnRate / 4.33,
      monthlyRevenue,
      guaranteed3m,
      confidence,
    });
  }

  const guaranteedTotal = monthsArr.reduce((a, m) => a + m.guaranteed, 0);
  perClient.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  return { months: monthsArr, guaranteedTotal, monthlyRunRate, scenarios, perClient };
}

// ── Fluktuácia: kto prišiel a kto stíchol ────────────────────────────────────
//
// Presunuté 11. 8. z Fluktuacia.tsx. Dôvod: `tokyKlientov` je označená ako
// „jediné miesto, kde sa toky počítajú", ale žila v komponente — takže keď
// ju potreboval kontext Jarvisa a karta „Koľko klientov naozaj treba",
// vznikla druhá kópia a dashboard hneď ukazoval dve rôzne čísla pre ten istý
// čistý rast. Čistá aritmetika patrí do knižnice, nie do obrazovky.
const DEN_MS = 86400000;

export type KlientTok = ClientAgg & { _zivot: number; _odisiel: boolean; _trzba: number };

function pripravKlientov(data: PSBData, clients: Record<string, ClientAgg>, hranicaDni: number) {
  const kotva = data.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
  const kotvaMs = kotva ? Date.parse(kotva) : Date.now();
  const trzbaPodla = new Map<string, number>();
  for (const p of data.payments) {
    if (!p.client) continue;
    trzbaPodla.set(p.client, (trzbaPodla.get(p.client) || 0) + p.amount);
  }
  const zoznam: KlientTok[] = Object.values(clients)
    .filter((c) => c.firstSession && c.lastSession)
    .map((c) => {
      const ticho = (kotvaMs - Date.parse(c.lastSession)) / DEN_MS;
      // Dohodnutá pauza nie je odchod. Keď sa skončí a klient nepríde, spadne
      // sem sám — ale kým beží, tvrdiť o ňom, že odišiel, je nepravda.
      const naPauze = !!(c.pauseUntil && Date.parse(c.pauseUntil) >= kotvaMs);
      return {
        ...c,
        _zivot: Math.round((Date.parse(c.lastSession) - Date.parse(c.firstSession)) / DEN_MS),
        _odisiel: ticho > hranicaDni && !naPauze,
        _trzba: trzbaPodla.get(c.name) || 0,
      };
    });
  return { zoznam, kotva };
}

/**
 * Mesačné toky klientov — jediné miesto, kde sa počítajú. Číta ich obrazovka
 * Rast a strata aj výhľad v Mesačných výsledkoch; dve kópie tej istej
 * aritmetiky by sa časom rozišli presne tak, ako sa rozišli tržby s Excelom.
 */
export function tokyKlientov(data: PSBData, clients: Record<string, ClientAgg>, hranicaDni = 60) {
  const { zoznam, kotva } = pripravKlientov(data, clients, hranicaDni);
  const m = new Map<string, { prisli: string[]; odisli: string[] }>();
  const daj = (k: string) => {
    const e = m.get(k) || { prisli: [], odisli: [] };
    m.set(k, e);
    return e;
  };
  for (const c of zoznam) {
    // Kto sa vrátil po pauze, nie je príchod. Bez toho by sa návrat počítal
    // ako nový klient a od septembra by nafukoval to, čo priniesla reklama.
    if (!c.vratenie) daj(monthKey(c.firstSession)).prisli.push(c.name);
    if (c._odisiel) daj(monthKey(c.lastSession)).odisli.push(c.name);
  }
  const mesacne = [...m.entries()]
    .map(([k, v]) => [k, { prislo: v.prisli.length, odislo: v.odisli.length, prisli: v.prisli, odisli: v.odisli }] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  // Uzavretý mesiac sa riadi KOTVOU DÁT, nie kalendárom. Keď PTminder nie je
  // nahratý mesiac dozadu, kalendárne „uzavretý" mesiac je v dátach prázdny —
  // a nula príchodov by sa čítala ako „nikto neprišiel" namiesto „nevieme".
  const beziaci = new Date().toISOString().slice(0, 7);
  const plny = kotvaDat(data).plny || beziaci;
  // Priemer sa delí KALENDÁRNYMI mesiacmi okna, nie mesiacmi prítomnými
  // v mape. Mesiac bez jediného príchodu aj odchodu (10/2025) v mape vôbec
  // nie je — a keď z priemeru vypadne, „Ø nových / mes." je nadhodnotené
  // presne o ten pomer (revízia 19. 8. 2026, ~8 % pri jednom chýbajúcom).
  const mesiacDozadu = (k: string, n: number) => {
    const [r, m] = k.split("-").map(Number);
    const d = new Date(Date.UTC(r, m - 1 - n, 1));
    return d.toISOString().slice(0, 7);
  };
  const prvyMesiac = mesacne[0]?.[0] || plny;
  const oknoOd = (koniec: string) => {
    const od = mesiacDozadu(koniec, 11);
    return od < prvyMesiac ? prvyMesiac : od;
  };
  const podlaMesiaca = new Map(mesacne);
  const kalendarne = (od: string, doVratane: string) => {
    const out: { prislo: number; odislo: number }[] = [];
    for (let k = od; k <= doVratane; k = mesiacDozadu(k, -1)) {
      const v = podlaMesiaca.get(k);
      out.push({ prislo: v?.prislo || 0, odislo: v?.odislo || 0 });
    }
    return out;
  };
  const prichodove = kalendarne(oknoOd(plny), plny);
  const zrele = kotva
    ? new Date(Date.parse(kotva) - hranicaDni * DEN_MS).toISOString().slice(0, 7)
    : beziaci;
  const poslednyZrely = mesiacDozadu(zrele, 1) <= plny ? mesiacDozadu(zrele, 1) : plny;
  const odchodove = poslednyZrely >= prvyMesiac ? kalendarne(oknoOd(poslednyZrely), poslednyZrely) : [];
  return {
    zoznam, kotva, mesacne,
    prisloMes: prichodove.length ? prichodove.reduce((a, v) => a + v.prislo, 0) / prichodove.length : 0,
    odisloMes: odchodove.length ? odchodove.reduce((a, v) => a + v.odislo, 0) / odchodove.length : 0,
  };
}


// ── Získavanie klientov: deravé vedro ────────────────────────────────────────
//
// Jerry, 11. 8.: „mám síce 18 voľných, ale koľko ľudí odíde za ten čas, čo to
// zapĺňam? 18 potrebujem teraz, ale skutočne potrebujem 30."
//
// Mal pravdu a je to jediná úvaha, ktorá z voľnej kapacity spraví rozpočet.
// Voľné miesta sú statické číslo; klientela je prietok. Kým zapĺňaš, tečie —
// takže počet klientov, ktorých treba ZÍSKAŤ, nie je počet voľných miest, ale
//
//     voľné miesta + odchod × počet mesiacov.
//
// TOKY SEM PRÍDU ZVONKU, NEPOČÍTAJÚ SA TU. Prvá verzia si príchod aj odchod
// rátala po svojom a dashboard okamžite ukazoval dve rôzne čísla pre tú istú
// vec: dlaždica „čistý rast +0,4 / mes." a karta pod ňou „+0,75". Jediné
// miesto na toky je `tokyKlientov` (Fluktuacia.tsx) — to isté číslo, aké
// vidí obrazovka Rast a strata.
export type Ziskavanie = {
  aktivnych: number;
  odchodMes: number;
  prichodMes: number;
  cistyMes: number;
  volnychMiest: number;
  /** Mesiacov na zaplnenie pri dnešnom tempe; null = pri nulovom či zápornom prírastku nikdy. */
  mesiacovNaZaplnenie: number | null;
  /** Koľko klientov treba ZÍSKAŤ, aby bolo plno o N mesiacov (vrátane tých, čo medzitým odídu). */
  trebaZiskat: (mesiacov: number) => number;
};

export function ziskavanieKlientov(
  toky: { prisloMes: number; odisloMes: number; aktivnych: number },
  volnychMiest: number,
): Ziskavanie {
  const cistyMes = toky.prisloMes - toky.odisloMes;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    aktivnych: toky.aktivnych,
    odchodMes: r2(toky.odisloMes),
    prichodMes: r2(toky.prisloMes),
    cistyMes: r2(cistyMes),
    volnychMiest,
    mesiacovNaZaplnenie: cistyMes > 0 ? Math.ceil(volnychMiest / cistyMes) : null,
    trebaZiskat: (mesiacov: number) => Math.ceil(volnychMiest + toky.odisloMes * mesiacov),
  };
}

/**
 * Nezapísané veci — jedno miesto pre všetko, čo čaká na vetu od človeka.
 *
 * PREČO TO VZNIKLO
 *
 * Jerry, 14. 8.: „na viacerých miestach mám rôzne zápisy — presuny, zrušenia
 * tréningov, dopyty, kto prišiel na úvodný a už nikdy — a chcel by som, aby
 * sa to rovnako zobrazovalo na dashboarde."
 *
 * Mal pravdu, že to bolo rozsypané. Dôvod straty pri dopyte sa dal zapísať
 * len v Marketingu, nevysvetlené zrušenie len v Kalendári, a ani o jednom
 * appka nikde nepovedala, že čaká. Kto na tú obrazovku nezašiel, nevedel.
 *
 * PREČO SÚ ZHRNUTÉ A NIE PO JEDNOM
 *
 * Dvanásť dopytov ako dvanásť riadkov by register zaplavilo a tie naozaj
 * naliehavé veci by v ňom zanikli — to je presne chyba, ktorú Jerry vytkol
 * pri anomáliách („keď svieti všetko, nesvieti nič"). Jeden riadok s počtom
 * a odkazom stačí: práca sa aj tak robí na tej obrazovke, nie tu.
 *
 * KOMU PATRIA
 *
 * Dopyty vždy Terezke — prvý kontakt s človekom je jej práca a ona jediná
 * vie, kto je kto. Zmeny v kalendári tomu, komu sa v kalendári stali.
 */
export type NezapisaneVstup = {
  leads: Pick<Lead, "name" | "date" | "dovod" | "status">[];
  /** Dnešok ako ISO deň — kvôli testovateľnosti sa neberie zo systému. */
  dnes: string;
  /** Mená klientov — dopyt, z ktorého klient vznikol, sa nerieši. */
  menaKlientov: string[];
  /** Nevysvetlené zmeny z kalendára (`vysvetlene = 0`). */
  zmeny: { druh: string; trener: string }[];
  /** Kľúčové podiely, ktoré má appka spochybniť, keď vyzerajú príliš dobre. */
  podiely?: Podiel[];
};

/**
 * Koľko dní má dohodnutý úvodný na to, aby sa stal tréningom.
 *
 * Jerry, 14. 8.: „keď dám úvodný tréning, malo by sa to vymazať — veď keď je
 * dohodnutý, prečo by som mal dopisovať, prečo neprišla."
 *
 * Má pravdu, kým je termín pred nami. Ale „Dohodnutý úvodný" z marca, na ktorý
 * nikto neprišiel, nie je rozbehnutý dopyt — je to strata so zabudnutým
 * stavom. Mesiac je hranica, po ktorej sa stav prestáva brať ako pravda o
 * budúcnosti a začína byť tvrdením o minulosti.
 */
const DOHODNUTY_PLATI_DNI = 30;

/**
 * Je dopyt ešte otvorený — teda taký, pri ktorom má zmysel pýtať sa „prečo nič"?
 *
 * NIE, keď: sa z neho stal klient · dôvod už niekto zapísal · má termín
 * v kalendári · je čerstvo dohodnutý.
 */
function zivyDopyt(
  l: Pick<Lead, "name" | "date" | "dovod" | "status">,
  menaKlientov: string[],
  dnes: string,
): boolean {
  const meno = String(l.name || "").trim();
  if (!meno) return false;
  if (String(l.dovod || "").trim()) return false;
  if (najdiKlienta(menaKlientov, meno)) return false;
  if (maTermin(meno)) return false;
  if (l.status === "dohodnuty") {
    const dni = Math.floor(daysBetween(String(l.date).slice(0, 10), new Date(`${dnes}T12:00:00Z`)));
    if (dni <= DOHODNUTY_PLATI_DNI) return false;   // ešte sa rieši
  }
  return true;
}

const DRUH_SLOVOM: Record<string, string> = {
  zrusene: "zrušené", posunute: "posunuté", pridane: "pridané", premenovane: "premenované",
};

export function nezapisaneDoRegistra(v: NezapisaneVstup): Omit<RegisterItem, "acked" | "note">[] {
  const von: Omit<RegisterItem, "acked" | "note">[] = [];

  // ── čísla, ktoré vyzerajú príliš dobre ───────────────────────────────────
  //
  // Jerry, 14. 8.: „to je presne tá otázka, ktorá by mala vyskočiť v Na čo sa
  // pozrieť." Mal pravdu — „100 % úspešnosť po úvodnom" nenašiel test ani ja,
  // našiel to on. Appka sa odteraz pýta sama.
  for (const n of podozriveCisla(v.podiely || [])) {
    von.push({
      key: `podozrive|${n.kluc}`,
      category: "Anomália",
      tone: n.zavaznost === "vysoka" ? "red" : "orange",
      title: n.nadpis,
      detail: n.detail,
      priority: n.zavaznost === "vysoka" ? 3 : 13,
    });
  }

  // ── dopyty bez odpovede prečo ────────────────────────────────────────────
  const otvorene = v.leads.filter((l) => zivyDopyt(l, v.menaKlientov, v.dnes));
  if (otvorene.length) {
    const najstarsi = [...otvorene].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    von.push({
      key: "dopyt|nevyriesene",
      category: "Zápis",
      tone: "orange",
      trener: "Terezka",
      title: `Dopyty bez odpovede prečo (${otvorene.length})`,
      detail: `${otvorene.length} ${otvorene.length === 1 ? "dopyt, z ktorého" : "dopytov, z ktorých"} sa nestal klient a nikto nezapísal prečo. Najstarší je ${najstarsi.name} z ${String(najstarsi.date).slice(8, 10)}. ${Number(String(najstarsi.date).slice(5, 7))}. Zapisuje sa v Marketing → Dopyty, prepínač „len nevyriešené".`,
      // „f:" = prepínač, ktorý sa má rovno zapnúť. Klik teda otvorí presne
      // ten zoznam, o ktorom veta hovorí, nie všetky dopyty.
      client: "marketing|dopyty|f:nevyriesene",
      priority: 12,
    });
  }

  // ── zmeny v kalendári bez vysvetlenia ────────────────────────────────────
  const podlaTrenera = new Map<string, Record<string, number>>();
  for (const z of v.zmeny) {
    const t = z.trener || "";
    const m = podlaTrenera.get(t) || {};
    m[z.druh] = (m[z.druh] || 0) + 1;
    podlaTrenera.set(t, m);
  }
  for (const [trener, druhy] of podlaTrenera) {
    const spolu = Object.values(druhy).reduce((a, n) => a + n, 0);
    const rozpis = Object.entries(druhy)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `${n}× ${DRUH_SLOVOM[d] || d}`)
      .join(", ");
    von.push({
      key: `kalendar|zmeny|${trener || "bez"}`,
      category: "Zmena",
      tone: "orange",
      // Zmena bez trénera (zdroj sa nedal určiť) zostáva obom — radšej
      // upozornenie navyše než stratené.
      trener: trener || undefined,
      title: `Zmeny v kalendári bez vysvetlenia (${spolu})`,
      detail: `${rozpis}. Bez dôvodu sa nedá povedať, či to bolo zrušenie klientom, presun po dohode, alebo chyba v zápise — a práve to rozhoduje, či ide o stratu. Vysvetľuje sa v Kalendári.`,
      client: "kalendar|",
      priority: 11,
    });
  }

  return von;
}

/**
 * Odmlčaní klienti — 14+ dní bez tréningu a bez dohodnutého termínu.
 *
 * PREČO TU A NIE V DLAŽDICI
 *
 * Definícia žila len v Dashboard.tsx. Dlaždica hlásila 3 ľudí, Jarvis na tú
 * istú otázku 17. 8. 2026 odpovedal 9 — bral ich z registra, kde sú aj otázky
 * typu „je toto duch" a klienti mimo segmentu. Dve odpovede na jedno slovo,
 * a človek nemá ako vedieť, ktorá platí.
 *
 * Prahy nie sú náhodné: klient bez tréningu 14+ dní odchádza šesťkrát častejšie
 * (48 % vs 8 %). Kalendár má právo veta — kto má dohodnutý budúci termín, nie
 * je odmlčaný, len platí obmesiac alebo je po operácii.
 */
export type OdmlcanyKlient = { meno: string; dni: number; trener: string | null; poslednySession: string };

export function odmlcaniKlienti(
  clients: Record<string, ClientAgg>,
  udalosti: { zaciatok: string; klient: string | null; typ: string | null }[],
  opts?: { trener?: (t: string | null | undefined) => boolean; dnes?: number; zmeny?: ZmenaVKalendari[] },
): OdmlcanyKlient[] {
  const teraz = opts?.dnes ?? Date.now();
  const den = new Date(teraz).toISOString().slice(0, 10);
  // Tá istá odpoveď ako v registri: kalendár vie skôr než export.
  const posledny = poslednyTrening(clients, udalosti, opts?.zmeny, new Date(teraz));
  const maTermin = new Set(
    (udalosti || [])
      .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && u.klient && u.zaciatok.slice(0, 10) >= den)
      .map((u) => u.klient as string),
  );
  const patri = opts?.trener ?? (() => true);
  return Object.values(clients)
    .filter((c) => {
      if (c.status !== "Aktívny" || !patri(c.primaryTrainer)) return false;
      if (c.segment !== "Anchor" && c.segment !== "Stabilný") return false;
      if (maTermin.has(c.name)) return false;
      return (teraz - Date.parse(posledny[c.name] || c.lastSession)) / 86400000 >= 14;
    })
    .map((c) => ({
      meno: c.name,
      dni: Math.floor((teraz - Date.parse(posledny[c.name] || c.lastSession)) / 86400000),
      trener: c.primaryTrainer || null,
      poslednySession: (posledny[c.name] || c.lastSession || "").slice(0, 10),
    }))
    .sort((a, b) => b.dni - a.dni);
}

/**
 * Dve pripomienky, ktoré appka dovtedy nevedela: SMS po úvodnom a odmena
 * za odporúčanie.
 *
 * Obe si Jerry vypýtal 17. 8. 2026 a obe majú spoločné to, že ide o SĽUB DANÝ
 * ČLOVEKU, na ktorý sa ľahko zabudne: po úvodnom tréningu chodí SMS, a kto
 * pošle známeho, má mať 10 % zľavu. Ani jedno nie je v žiadnych dátach —
 * stane sa to, alebo nie, a nikto sa nedozvie.
 *
 * PREČO Z KALENDÁRA A NIE Z PTMINDERA
 *
 * SMS sa posiela hneď po tréningu; export z PTmindera chodí s odstupom dní.
 * Kalendár to vie v ten istý deň. Zrušená udalosť (`zmizla_at`) sa neráta —
 * tréning, ktorý sa nekonal, žiadnu SMS nepotrebuje.
 */
/**
 * Tréner sa vezie s udalosťou, lebo notifikácia patrí TOMU, V KOHO KALENDÁRI
 * tá hodina stojí (Jerry, 17. 8. 2026). Odvodiť ho z klienta nejde: človek po
 * úvodnom ešte nie je klient, takže by sa meno nenašlo a pripomienka by
 * spadla obom — Jerry tak videl SMS pre Terezkinu Janu Malinovú.
 */
export type UdalostPreSms = { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null; nazov?: string; trener?: string | null };

/** Po koľkých dňoch je pripomienka na SMS už len šum. */
const SMS_OKNO_DNI = 21;
/** Ako ďaleko dozadu sa pripomína odmena za odporúčanie. */
const ODMENA_OKNO_DNI = 60;
/** Dopyt sa dá dopísať aj spätne, tak je okno dlhšie než pri SMS. */
const DOPYT_OKNO_DNI = 45;

export function pripomienkySlubov(
  udalosti: UdalostPreSms[],
  leads: { date: string; name: string; source: string; referrer?: string }[],
  ack: Record<string, { note?: string } | undefined>,
  dnes: Date = new Date(),
  zmeny?: ZmenaVKalendari[],
): RegisterItem[] {
  const out: RegisterItem[] = [];
  // Zrušený úvodný nepotrebuje SMS ani dopyt — a zrušiť sa dá aj ručne
  // v Kalendári, nielen v Google Kalendári.
  const zrusene = zruseneTreningy(zmeny);
  const jeZrusena = (u: UdalostPreSms) => {
    if (u.zmizlaAt) return true;
    const m = klientUdalosti(u);
    return !!m && zrusene.has(`${normName(m)}|${(u.zaciatok || "").slice(0, 10)}`);
  };
  // Rovnaký stav ako všade inde — vrátane odloženia. Kým to tu bolo napísané
  // druhýkrát a bez neho, „Odložiť o týždeň" pri SMS znamenalo navždy.
  const stav = (key: string, rodina: string) => stavPolozkyRegistra(key, ack, rodina, dnes);
  const den = (d: Date) => d.toISOString().slice(0, 10);
  const dnesStr = den(dnes);

  // ── SMS po úvodnom tréningu ──────────────────────────────────────────────
  const hranicaSms = den(new Date(dnes.getTime() - SMS_OKNO_DNI * 86400_000));
  for (const u of udalosti) {
    if (u.typ !== "uvodny" || jeZrusena(u)) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    // Budúci úvodný ešte SMS nepotrebuje — pripomienka príde až po ňom.
    if (!d || d > dnesStr || d < hranicaSms) continue;
    // Meno smie prísť z názvu udalosti — inak sa práve pri novom človeku,
    // teda tam, kde na SMS najviac záleží, nepripomenie nič.
    const meno = klientUdalosti(u) || "";
    if (!meno) continue;
    const key = `sms|${d}|${meno}`;
    const rodina = `sms|${meno}`;
    out.push({
      key,
      category: "Rozhodnutie",
      tone: "blue",
      title: `SMS po úvodnom — ${meno}`,
      detail: `${meno} — úvodný tréning ${fmtDMY(d)}. Po ňom posielame SMS; klikni na „Poslané", keď je odoslaná.`,
      priority: 12,
      client: meno,
      trener: u.trener || undefined,
      oKom: meno,
      ...stav(key, rodina),
    });
  }

  // ── Odporúčanie bez mena odporúčateľa ───────────────────────────────────
  //
  // Samotnú odmenu (10 %) hlási už `deriveAnomalies` pod kľúčom `referral|`
  // — dvakrát to isté by bola len otrava; 17. 8. 2026 som ju tu omylom
  // postavil druhýkrát a Jarvis si toho pri kontrole registra všimol.
  //
  // Tu zostáva prípad, ktorý tamtá pripomienka nevie ohlásiť: dopyt prišiel
  // cez odporúčanie, ale nikto nezapísal OD KOHO. Vtedy sa zľava nemá komu
  // dať a nejde o zabudnutie, ale o chýbajúci údaj.
  const hranicaOdmeny = den(new Date(dnes.getTime() - ODMENA_OKNO_DNI * 86400_000));
  for (const l of leads) {
    if (l.source !== "referencia" || (l.referrer || "").trim()) continue;
    const d = (l.date || "").slice(0, 10);
    if (!d || d < hranicaOdmeny) continue;
    const key = `odmena|${d}|${l.name}`;
    const rodina = "odmena";
    out.push({
      key,
      category: "Zápis",
      tone: "orange",
      title: `Odporúčanie bez mena — ${l.name}`,
      detail: `${l.name} prišiel ${fmtDMY(d)} cez odporúčanie, ale nie je zapísané od koho — bez mena nemá 10 % zľavu komu dať. Dopíš odporúčateľa v Marketing → Dopyty.`,
      priority: 12,
      client: "marketing|dopyty",
      // Prvý kontakt s dopytom je Terezkina práca — rovnako ako pri
      // „Dopyty bez odpovede prečo". Bez toho položka prepadla obom
      // trénerom, lebo v poli `client` je cieľ prekliku, nie meno.
      trener: "Terezka",
      ...stav(key, rodina),
    });
  }

  // ── Úvodný bez dopytu ───────────────────────────────────────────────────
  //
  // Jerry, 17. 8. 2026: „do budúcna by sa neexistujúce dopyty mali vynulovať."
  // Dnes ich je jedenásť: ľudia, ktorí prišli na úvodný tréning, ale do dopytov
  // ich nikto nezapísal — pravdepodobne prišli telefonicky alebo osobne a rovno
  // sa im založil tréning. Nie je to účtovná chyba, je to slepé miesto: bez
  // dopytu appka nevie, ODKIAĽ ten človek prišiel, takže lievik aj rozdelenie
  // podľa zdroja počítajú z menšej vzorky, než akú štúdio naozaj má.
  //
  // Pripomienka je zámerne pri KAŽDOM úvodnom bez dopytu, nielen pri novom:
  // dopyt sa dá dopísať aj spätne a hodnota (vieme, odkiaľ ľudia chodia)
  // zostáva rovnaká.
  const hranicaDopytu = den(new Date(dnes.getTime() - DOPYT_OKNO_DNI * 86400_000));
  const menaDopytov = leads.map((l) => l.name);
  for (const u of udalosti) {
    if (u.typ !== "uvodny" || jeZrusena(u)) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    if (!d || d > dnesStr || d < hranicaDopytu) continue;
    const meno = klientUdalosti(u) || "";
    if (!meno) continue;
    // najdiKlienta znesie „Prochadzka" verzus „Procházka" — hľadá sa človek,
    // nie presný reťazec. Prehodené písmená v priezvisku (Spoligova verzus
    // Sopoligová) ale neznesie ani ono; taký prípad sa ohlási ako chýbajúci
    // dopyt a je to tak lepšie než ho ticho spárovať zle.
    if (najdiKlienta(menaDopytov, meno)) continue;
    const key = `bezdopytu|${d}|${meno}`;
    const rodina = "bezdopytu";
    out.push({
      key,
      category: "Zápis",
      tone: "orange",
      title: `Úvodný bez dopytu — ${meno}`,
      detail: `${meno} — úvodný ${fmtDMY(d)}, ale v dopytoch nie je. Bez dopytu appka nevie, odkiaľ prišiel. Dopíš ho v Marketing → Dopyty, stačí meno a zdroj.`,
      priority: 11,
      // Cieľ nesie aj MENO — Dopyty ho predvyplnia do rýchleho zápisu.
      // Predtým klik doviedol na zoznam a meno, ktoré appka práve povedala,
      // si musel človek napísať sám.
      client: `marketing|dopyty|${meno}`,
      trener: u.trener || undefined,
      oKom: meno,
      ...stav(key, rodina),
    });
  }

  return out;
}

/**
 * Kto po úvodnom tréningu naozaj neprišiel — a kto len čaká na export.
 *
 * PREČO TO NESTAČÍ ČÍTAŤ ZO SEDENÍ
 *
 * Jerry, 17. 8. 2026: „Roman Pavlik bol minulý týždeň na platenom tréningu,
 * dokonca zaplatil za členstvo — ako to, že ho sem radíš?" Mal pravdu.
 * Zoznam stál na jedinej podmienke „má práve jedno sedenie a je to úvodné",
 * lenže sedenia chodia z PTmindera s odstupom dní. Roman mal 5. 8. úvodný,
 * 13. 8. zaplatil 7 790 Kč za balíček a v ten istý deň trénoval — appka ho
 * napriek tomu počítala medzi tých, čo sa nevrátili, lebo ten tréning ešte
 * nebol v exporte.
 *
 * Kúpený balíček a tréning v kalendári sú dôkaz pokračovania rovnako platný
 * ako riadok v exporte — a prichádzajú skôr. Preto sa pozerá na všetky tri.
 */
export function poUvodnomNikdy(
  clients: Record<string, ClientAgg>,
  balicky: { client_name?: string; clientName?: string; sessionsRemaining?: number; sessions_remaining?: number; validTo?: string; valid_to?: string }[],
  udalosti: { klient: string | null; zaciatok: string; typ: string | null; zmizlaAt?: string | null }[],
): { meno: string; uvodny: string; trener: string | null; preco: string | null }[] {
  const menoBalicka = (b: (typeof balicky)[number]) => b.client_name ?? b.clientName ?? "";
  const sBalickom = new Set(balicky.filter((b) => menoBalicka(b)).map((b) => normName(menoBalicka(b))));

  return Object.values(clients)
    .filter((c) => (c.sessions || []).length === 1 && c.sessions[0]?.sessionType === "UVODNE")
    .filter((c) => {
      // Balíček = zaplatil za pokračovanie. To je rozhodnutie, nie dochádzka.
      if (sBalickom.has(normName(c.name))) return false;
      // Tréning v kalendári po úvodnom (nezrušený) je to isté, len skôr.
      const uvodny = (c.sessions[0]?.date || "").slice(0, 10);
      const pokracoval = (udalosti || []).some((u) =>
        u.typ === "trening" && !u.zmizlaAt && u.klient &&
        normName(u.klient) === normName(c.name) && u.zaciatok.slice(0, 10) > uvodny);
      return !pokracoval;
    })
    .map((c) => ({
      meno: c.name,
      uvodny: (c.sessions[0]?.date || "").slice(0, 10),
      trener: c.sessions[0]?.sessionTrainer || c.primaryTrainer || null,
      preco: c.precoNeprisiel || null,
    }))
    .sort((a, b) => b.uvodny.localeCompare(a.uvodny));
}

/**
 * Prečo sa človek po úvodnom nevrátil — otázka, kým sa na ňu dá odpovedať.
 *
 * Jerry, 17. 8. 2026: dôvod odchodu je jediná vec z celého lievika, s ktorou
 * sa dá niečo urobiť — a appka ju mala pri jednom človeku z trinástich.
 * Nie preto, že by to Jerry nevedel, ale preto, že pole na to bolo schované
 * v Marketingu a nikto tam nechodí. Odpoveď musí prísť za dve sekundy tam,
 * kde sa aj tak pozerá.
 *
 * PREČO OKNO 90 DNÍ
 *
 * Dôvod sa pamätá niekoľko týždňov. Pri Vojtovi Bartoňovi zo septembra už
 * dnes nezistíš nič a otázka na neho by bola len ďalší riadok, ktorý sa
 * odklikne bez odpovede — a tým sa register učí ignorovať.
 */
const DOVOD_OKNO_DNI = 90;

export function pripomienkaDovodu(
  clients: Record<string, ClientAgg>,
  balicky: Parameters<typeof poUvodnomNikdy>[1],
  udalosti: Parameters<typeof poUvodnomNikdy>[2],
  ack: Record<string, { note?: string } | undefined>,
  dnes: Date = new Date(),
): RegisterItem[] {
  const hranica = new Date(dnes.getTime() - DOVOD_OKNO_DNI * 86400_000).toISOString().slice(0, 10);
  return poUvodnomNikdy(clients, balicky, udalosti)
    .filter((c) => !c.preco && c.uvodny >= hranica)
    .map((c) => {
      const key = `dovod|${c.uvodny}|${c.meno}`;
      const rodina = "dovod";
      return {
        key,
        category: "Rozhodnutie" as const,
        tone: "orange" as const,
        title: `Prečo neprišiel znova — ${c.meno}`,
        detail: `${c.meno} — úvodný tréning ${fmtDMY(c.uvodny)} a odvtedy nič. Vieš prečo? Jedno slovo stačí — z opakovaných dôvodov sa dá niečo urobiť, z prázdneho poľa nič.`,
        priority: 11,
        client: c.meno,
        ...stavPolozkyRegistra(key, ack, rodina, dnes),
      };
    });
}

/** Dôvody, ktoré sa v PSB opakujú. „Iné" sa dopíše rukou. */
export const DOVODY_ODCHODU = ["cena", "čas", "vzdialenosť", "výsledok neprišiel", "rozmyslel si to"] as const;

/**
 * Koho si dnes trénoval — mená na jeden klik.
 *
 * Denník klienta je v appke od začiatku a je prázdny. Nie preto, že by nebolo
 * čo písať, ale preto, že zápis začína hľadaním mena medzi 119 klientmi. Veta
 * „už ma to v krížoch nebolí, keď sedím" má životnosť pár minút; kým ju človek
 * doklikáva, je preč.
 *
 * Kalendár vie, kto dnes prišiel — a vie to v ten istý deň, kým PTminder
 * chodí s odstupom. Preto sa mená berú odtiaľ.
 *
 * Jerry, 17. 8. 2026: „chýba jediné: spôsob, ako doň niečo napísať do 20
 * sekúnd po tréningu."
 */
export function ktoDnesTrenoval(
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null; nazov?: string }[],
  opts?: { dnes?: Date; trener?: (t: string | null | undefined) => boolean; zmeny?: ZmenaVKalendari[] },
): string[] {
  const teraz = opts?.dnes ?? new Date();
  const den = teraz.toISOString().slice(0, 10);
  // Ručne zapísané zrušenie platí rovnako ako to, ktoré appka videla sama.
  // Ponúkať meno človeka, o ktorom Jerry pred hodinou zapísal, že nepríde,
  // je pozvánka zapísať si tréning, ktorý sa nekonal.
  const zrusene = zruseneTreningy(opts?.zmeny);
  const von: string[] = [];
  for (const u of udalosti || []) {
    if (u.typ !== "trening" && u.typ !== "uvodny") continue;
    if (u.zmizlaAt) continue;
    if ((u.zaciatok || "").slice(0, 10) !== den) continue;
    const meno = klientUdalosti(u) || "";
    if (meno && zrusene.has(`${normName(meno)}|${den}`)) continue;
    // Tréning, ktorý sa ešte len chystá, do denníka nepatrí — nemá sa čo
    // zapisovať o niečom, čo sa nestalo.
    if (!meno || Date.parse(u.zaciatok) > teraz.getTime()) continue;
    if (!von.includes(meno)) von.push(meno);
  }
  return von;
}
