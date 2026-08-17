// All derived analytics for the PSB Tracker. Pure functions over PSBData —
// no browser globals. Reused across every module.
import { daysBetween, fmtDMY, monthKey, monthLabel, monthsBetween, normName, quarterKey, quarterLabel, weekKey, weekLabel } from "./format";
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
  if (/doplnenie|za protokol|členství/.test(s)) return "Členstvo (bez balíčka hodín)";
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
    const autoPrimary =
      Object.entries(c.trainers).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
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
    const jeDoplnok = (p: string) => /doplnenie|za protokol|členství/i.test(p || "");
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
  const OKNO_DNI = 10;
  const TOL_KC = 400;
  const TOL_PCT = 0.03;
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

// Practical, client-centric signals — one item per client per type (deduped),
// the actionable things a trainer should follow up on this week.
export function deriveAnomalies(data: PSBData, clients: Record<string, ClientAgg>): Anomaly[] {
  const out: Anomaly[] = [];
  const ack = data.anomalyAck || {};
  const push = (key: string, tone: Anomaly["tone"], label: string, detail: string, client?: string) =>
    out.push({ key, tone, label, detail, acked: !!ack[key], note: ack[key]?.note, client });

  const serviceClients = new Set(data.services.map((s) => s.client));
  const now = new Date();

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
    const days = daysBetween(c.lastSession, now);

    const duch = duchOdpoved(c);

    // Regular client who stopped coming — reach out before they churn.
    // Od 30 dní preberá štafetu otázka „Je toto duch?" — obe naraz by boli tá
    // istá výzva dvakrát. A keď je duch potvrdený, nenaháňa sa vôbec: vieme,
    // že odišiel, a „ozvi sa" by bol šum.
    if ((c.segment === "Anchor" || c.segment === "Stabilný") && days >= 14 && days < 30 && duch !== "ano") {
      push(`gone|${c.name}`, days >= 21 ? "red" : "orange", "Prestal chodiť", `${c.name}: ${days} dní bez tréningu (${c.segment}) — ozvi sa`, c.name);
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
    if (days >= 30 && !duch) {
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

  // Prišiel na úvodný, zaplatil zaň a už nikdy.
  //
  // Osem takých bolo v roku 2026 a appka o nich mlčala: „X dní bez tréningu"
  // sa ich netýka, lebo tá otázka platí pre klienta, ktorý mal rytmus a stratil
  // ho. Tu žiadny rytmus nebol — bol jeden tréning a ticho.
  //
  // Hlási sa až po troch týždňoch: kto bol na úvodnom minulý týždeň, ešte len
  // hľadá termín, a naháňať ho je horšie než mlčať. A zmizne, keď sa zapíše
  // dôvod — nie preto, že sa niečo vyriešilo, ale preto, že otázka „prečo?"
  // dostala odpoveď a druhýkrát ju klásť netreba.
  //
  // Horná hranica je pol roka. Bez nej by register dostal desať položiek naraz,
  // vrátane ľudí z augusta 2025 — a na tých si už nikto nespomenie. To je tá
  // istá chyba, akú Jerry našiel pri kontrole dát: „prečo by ma toto malo
  // zaujímať?" Staršie prípady zostávajú v lieviku, kde sa dajú pozrieť, keď
  // ich niekto hľadá; register je na to, čo sa dá spraviť teraz.
  for (const c of Object.values(clients)) {
    if (c.precoNeprisiel) continue;
    const sedeni = c.sessions || [];
    if (sedeni.length !== 1 || sedeni[0].sessionType !== "UVODNE") continue;
    // Kto si po úvodnom kúpil balíček, sa nestratil — len ešte nestihol
    // prísť. Rozhodnutie padlo peniazmi. (Roman Pavlík, 13. 8.)
    const zaplatil = data.payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
    if (zaplatil - (sedeni[0].price || 0) > 500) continue;
    const dni = Math.floor(daysBetween(sedeni[0].date, new Date()));
    if (dni < 21 || dni > 180) continue;
    push(
      `strata|${c.name}`,
      "orange",
      "Po úvodnom už neprišiel",
      `${c.name}: úvodný pred ${dni} dňami a odvtedy nič${sedeni[0].sessionTrainer ? ` (${sedeni[0].sessionTrainer})` : ""}. Vieš prečo? Zapíš to v Marketing → Odkiaľ prišli klienti → klik na percento pri úvodných.`,
      c.name,
    );
  }

  // Rozhodnutie, ktorému prešiel termín overenia. Bez tohto by záver z debaty
  // žil len v Jarvisovom prompte a vrátil by sa k nemu, len keď sa naň niekto
  // sám spýta — čiže nikdy. Tu sa ozve sám.
  const dnes = new Date().toISOString().slice(0, 10);
  for (const z of data.zavery || []) {
    if (!z.overitDo || z.overitDo > dnes) continue;
    push(
      `zaver|${z.id}`,
      "blue",
      "Čas overiť rozhodnutie",
      `Z ${z.datum}: ${z.zaver}${z.overit ? ` — malo sa overiť: ${z.overit}` : ""}. Zabralo to?`,
    );
  }

  // A referral that actually converted earns the referrer a 10 % thank-you —
  // easy to forget, and forgetting it quietly kills the studio's best channel.
  // "Did they convert?" is not asked — it's read from PTminder: the referred
  // name showing up among clients IS the conversion.
  const byNorm: Record<string, string> = {};
  for (const n of Object.keys(clients)) byNorm[normName(n)] = n;
  for (const l of data.leads || []) {
    if (l.source !== "referencia" || !l.referrer || !l.name) continue;
    if (!byNorm[normName(l.name)]) continue;
    const ref = clients[byNorm[normName(l.referrer)] ?? l.referrer];
    if (!ref || ref.status === "Neaktívny") continue;
    push(
      `referral|${l.id}`,
      "orange",
      "Odmena za odporúčanie",
      `${l.referrer} odporučil${l.name ? ` ${l.name}` : "a nového klienta"} — nezabudni na 10 % zľavu za doporučenie`,
      l.referrer,
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
  key.split("|").filter((x) => !/^\d{4}-\d{2}(-\d{2})?$/.test(x) && !/^\d+$/.test(x)).join("|") || key;

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
  return !c || c.primaryTrainer === trener;
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
};

const toneRank: Record<string, number> = { red: 0, orange: 1, blue: 2 };

export function deriveRegister(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  sixM: SixMRow[],
  capacity: CapacityRow[],
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
  ) =>
    items.push({
      key,
      category,
      tone,
      title,
      detail,
      // Umlčaná rodina = umlčaná položka. Kontroluje sa tu, nie v komponente:
      // register čítajú tri miesta (Kokpit, Jarvisov kontext, mesačná správa)
      // a umlčanie musí platiť vo všetkých rovnako.
      acked: !!ack[key] || !!ack[`mute|${rodina ?? rodinaZKluca(key)}`],
      note: ack[key]?.note || ack[`mute|${rodina ?? rodinaZKluca(key)}`]?.note,
      priority: basePriority + toneRank[tone],
      client,
      rodina: rodina ?? rodinaZKluca(key),
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
  for (const a of deriveAnomalies(data, clients)) {
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
  const uzavrete = mesacne.filter(([mk]) => mk <= plny);
  const prichodove = uzavrete.slice(-12);
  const zrele = kotva
    ? new Date(Date.parse(kotva) - hranicaDni * DEN_MS).toISOString().slice(0, 7)
    : beziaci;
  const odchodove = uzavrete.filter(([mk]) => mk < zrele).slice(-12);
  return {
    zoznam, kotva, mesacne,
    prisloMes: prichodove.length ? prichodove.reduce((a, [, v]) => a + v.prislo, 0) / prichodove.length : 0,
    odisloMes: odchodove.length ? odchodove.reduce((a, [, v]) => a + v.odislo, 0) / odchodove.length : 0,
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
      client: "marketing|dopyty",
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
  opts?: { trener?: (t: string | null | undefined) => boolean; dnes?: number },
): OdmlcanyKlient[] {
  const teraz = opts?.dnes ?? Date.now();
  const den = new Date(teraz).toISOString().slice(0, 10);
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
      return (teraz - Date.parse(c.lastSession)) / 86400000 >= 14;
    })
    .map((c) => ({
      meno: c.name,
      dni: Math.floor((teraz - Date.parse(c.lastSession)) / 86400000),
      trener: c.primaryTrainer || null,
      poslednySession: (c.lastSession || "").slice(0, 10),
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
export type UdalostPreSms = { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null };

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
): RegisterItem[] {
  const out: RegisterItem[] = [];
  const stav = (key: string, rodina: string) => ({
    acked: !!ack[key] || !!ack[`mute|${rodina}`],
    note: ack[key]?.note || ack[`mute|${rodina}`]?.note,
    rodina,
  });
  const den = (d: Date) => d.toISOString().slice(0, 10);
  const dnesStr = den(dnes);

  // ── SMS po úvodnom tréningu ──────────────────────────────────────────────
  const hranicaSms = den(new Date(dnes.getTime() - SMS_OKNO_DNI * 86400_000));
  for (const u of udalosti) {
    if (u.typ !== "uvodny" || u.zmizlaAt) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    // Budúci úvodný ešte SMS nepotrebuje — pripomienka príde až po ňom.
    if (!d || d > dnesStr || d < hranicaSms) continue;
    const meno = (u.klient || "").trim();
    if (!meno) continue;
    const key = `sms|${d}|${meno}`;
    const rodina = `sms|${meno}`;
    out.push({
      key,
      category: "Rozhodnutie",
      tone: "blue",
      title: `SMS po úvodnom — ${meno}`,
      detail: `${meno} mal ${fmtDMY(d)} úvodný tréning. Po ňom posielame SMS — klikni na „Poslané", keď je odoslaná.`,
      priority: 12,
      client: meno,
      ...stav(key, rodina),
    });
  }

  // ── Odmena za odporúčanie ────────────────────────────────────────────────
  const hranicaOdmeny = den(new Date(dnes.getTime() - ODMENA_OKNO_DNI * 86400_000));
  for (const l of leads) {
    if (l.source !== "referencia") continue;
    const d = (l.date || "").slice(0, 10);
    if (!d || d < hranicaOdmeny) continue;
    const kto = (l.referrer || "").trim();
    const key = `odmena|${d}|${l.name}`;
    const rodina = "odmena";
    out.push({
      key,
      category: "Rozhodnutie",
      tone: "blue",
      title: kto ? `Odmena za odporúčanie — ${kto}` : `Odporúčanie bez mena — ${l.name}`,
      detail: kto
        ? `${l.name} prišiel ${fmtDMY(d)} na odporúčanie od ${kto}. ${kto} má za to nárok na 10 % zľavu. Klikni na „Zľava daná", keď je vybavená.`
        : `${l.name} prišiel ${fmtDMY(d)} cez odporúčanie, ale nie je zapísané od koho — bez mena sa odmena nedá dať nikomu. Dopíš odporúčateľa v Marketing → Dopyty.`,
      priority: 12,
      // Odmenu dostáva ODPORÚČATEĽ, takže „Otvoriť" má viesť na jeho kartu.
      client: kto || l.name,
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
    if (u.typ !== "uvodny" || u.zmizlaAt) continue;
    const d = (u.zaciatok || "").slice(0, 10);
    if (!d || d > dnesStr || d < hranicaDopytu) continue;
    const meno = (u.klient || "").trim();
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
      detail: `${meno} bol ${fmtDMY(d)} na úvodnom tréningu, ale v dopytoch nie je. Bez neho appka nevie, odkiaľ prišiel — a to je jediné miesto, z ktorého sa dá zistiť, čo klientov naozaj privádza. Dopíš ho v Marketing → Dopyty, stačí meno a zdroj.`,
      priority: 11,
      // Kategória Zápis nesie cieľ prekliku v poli client ako „tab|sub".
      client: "marketing|dopyty",
      ...stav(key, rodina),
    });
  }

  return out;
}
