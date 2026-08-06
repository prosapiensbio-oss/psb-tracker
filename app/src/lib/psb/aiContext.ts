// Builds a compact, accurate snapshot of the studio's data for the AI assistant.
// The numbers here must match what the dashboard cards show — so the assistant
// can explain any value ("prečo v tejto karte vidím toto číslo") and reason over
// the alerts. Where a card recomputes something (zones, weekly hours, capacity
// util, top KPIs), we mirror that exact logic below rather than reuse a
// deprecated field (e.g. capacity.effHours is reference-only, NOT what the card shows).
import {
  monthlyFinance,
  predictEarnings,
  sessionAnalysisPSB,
  TARGET_H,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "./compute";
import { monthLabel, weekKey, weekLabel } from "./format";
import type { PSBData } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

export type AiContext = ReturnType<typeof buildAiContext>;

export function buildAiContext(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  sixM: SixMRow[],
  capacity: CapacityRow[],
  register: RegisterItem[],
) {
  const clientList = Object.values(clients);

  // ── Weekly hours per trainer (same source as the "Odrobené hodiny/týždeň" card) ──
  const weekMap: Record<string, { Jerry: number; Terezka: number }> = {};
  for (const s of data.sessions) {
    const k = weekKey(s.date);
    const e = (weekMap[k] ||= { Jerry: 0, Terezka: 0 });
    if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
    else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
  }
  const weekRows = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0]));

  const perWeekTotal = weekRows.map(([k, v]) => ({ label: weekLabel(k), h: v.Jerry + v.Terezka })).filter((p) => p.h > 0);
  let wMax = perWeekTotal[0], wMin = perWeekTotal[0], wSum = 0;
  for (const p of perWeekTotal) {
    wSum += p.h;
    if (wMax && p.h > wMax.h) wMax = p;
    if (wMin && p.h < wMin.h) wMin = p;
  }
  const tyzdenneHodiny = perWeekTotal.length
    ? { priemer: r1(wSum / perWeekTotal.length), max: { tyzden: wMax.label, hodiny: r0(wMax.h) }, min: { tyzden: wMin.label, hodiny: r0(wMin.h) }, pocetTyzdnov: perWeekTotal.length, zdravaZona: `${ZONE_LO}–${ZONE_HI}h na trénera` }
    : null;
  // Full weekly history split by trainer — lets the bot answer "koľko urobil Jerry vs Terezka v týždni X".
  const tyzdennePodlaTrenera = weekRows.map(([k, v]) => ({ tyzden: weekLabel(k), jerry: r1(v.Jerry), terezka: r1(v.Terezka), spolu: r1(v.Jerry + v.Terezka) }));

  // ── Zdravá zóna donut: trainer-weeks in / below / above the zone ──
  let zdrava = 0, pod = 0, nad = 0;
  for (const [, v] of weekRows) {
    for (const t of ["Jerry", "Terezka"] as const) {
      const h = v[t];
      if (!h) continue;
      if (h >= ZONE_LO && h <= ZONE_HI) zdrava++;
      else if (h < ZONE_LO) pod++;
      else nad++;
    }
  }
  const zTotal = zdrava + pod + nad || 1;
  const zdravaZona = {
    zdrava: { pocet: zdrava, pct: r0((zdrava / zTotal) * 100) },
    podZonou: { pocet: pod, pct: r0((pod / zTotal) * 100) },
    nadZonou: { pocet: nad, pct: r0((nad / zTotal) * 100) },
    poznamka: "Počíta koľko trénerských týždňov (Jerry aj Terezka zvlášť) padlo do zdravej zóny 24–34h, pod ňu alebo nad ňu, za celé obdobie. Nie je to percento hodín, ale percento týždňov.",
  };

  // ── Top KPIs (the 4 big cards) ──
  const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
  const lastWeek = weeks[weeks.length - 1];
  const weekHours = data.sessions.filter((s) => weekKey(s.date) === lastWeek).reduce((a, s) => a + s.duration / 60, 0);

  const fin = monthlyFinance(data);
  const lastMonth = fin[fin.length - 1];
  const kpi = {
    aktivnychKlientov: clientList.filter((c) => c.status !== "Neaktívny").length,
    odrobeneTentoTyzden: { hodiny: r0(weekHours), tyzden: lastWeek ? weekLabel(lastWeek) : null },
    zarobkyPoslednyMesiac: lastMonth ? { mesiac: monthLabel(lastMonth.month), czk: r0(lastMonth.revenue) } : null,
    klientov6M: sixM.length,
  };

  // ── Earnings ──
  const finActual = fin.map((m) => ({ mesiac: monthLabel(m.month), vyfakturovane: r0(m.revenue), prijateTrzby: r0(m.cash), jerry: r0(m.byTrainer["Jerry"]?.revenue || 0), terezka: r0(m.byTrainer["Terezka"]?.revenue || 0), sedeni: m.sessions }));
  const revVals = fin.map((m) => m.revenue).filter((v) => v > 0);
  const earnAvg = revVals.length ? r0(revVals.reduce((a, b) => a + b, 0) / revVals.length) : 0;
  const earnMax = revVals.length ? r0(Math.max(...revVals)) : 0;
  const earnMin = revVals.length ? r0(Math.min(...revVals)) : 0;
  const pred = predictEarnings(data, clients, { excludeSpecial: false, horizon: 3 });

  // ── Session trend ──
  const trend = sessionAnalysisPSB(data.sessions).map((m) => ({ mesiac: monthLabel(m.month), celkovo: m.total, offline: m.offline, online: m.onlineTc, uvodne: m.uvodne }));
  const trendAvg = trend.length ? r1(trend.reduce((a, b) => a + b.celkovo, 0) / trend.length) : 0;

  // ── Tempo + dôvera (same averaging as the dashboard cards) ──
  const pc = pred.perClient;
  const tempoAvg = pc.length ? r1(pc.reduce((a, c) => a + c.burnRate, 0) / pc.length) : 0;
  const confAvg = pc.length ? r0((pc.reduce((a, c) => a + c.confidence, 0) / pc.length) * 100) : 0;

  // ── Capacity ("Dvojitý strop" — use the SAME fields the card shows, not effHours) ──
  const capPerTrainer = capacity.map((c) => ({
    trener: c.trainer,
    typickyTyzden: r0(c.recentWeekly),
    rusnyTyzden: r0(c.busyWeekly),
    vytazeniePct: r0(c.util),
    zvladneEste: c.canTake,
    odporucanie: c.advice,
  }));
  const avgAll = capacity.reduce((a, c) => a + c.recentWeekly, 0);
  const busyAll = capacity.reduce((a, c) => a + c.busyWeekly, 0);
  const capSpolu = {
    typickyTyzden: r0(avgAll),
    rusnyTyzden: r0(busyAll),
    idealSpolu: `${TARGET_H * 2}h (2×${TARGET_H}h)`,
    vytazeniePct: r0(Math.max(avgAll / (TARGET_H * 2), busyAll / (ZONE_HI * 2)) * 100),
    zvladneEste: capacity.reduce((a, c) => a + c.canTake, 0),
    poznamka: `Vyťaženie z reálnych hodín, "dvojitý strop": rastie kým typický týždeň (priemer) nedosiahne ideál ${TARGET_H}h ALEBO rušný týždeň (80. percentil) nenarazí na ${ZONE_HI}h — čo príde skôr. 100 % = jeden strop naplnený.`,
  };

  // Distributions.
  const dist = (fn: (c: ClientAgg) => string) => {
    const m: Record<string, number> = {};
    for (const c of clientList) m[fn(c)] = (m[fn(c)] || 0) + 1;
    return m;
  };
  const phase = (n: number) => (n <= 6 ? "Obnova (1–6)" : n <= 18 ? "Integrácia (7–18)" : "Udržateľnosť (19+)");
  const sixMPhases: Record<string, number> = {};
  for (const c of sixM) sixMPhases[phase(c.monthInPhase)] = (sixMPhases[phase(c.monthInPhase)] || 0) + 1;

  // Per-client detail (compact) — lets the assistant reason about and edit a
  // specific client (status, note, trainer…). Sorted by most recent session.
  const klientiDetail = clientList
    .slice()
    .sort((a, b) => (b.lastSession || "").localeCompare(a.lastSession || ""))
    .map((c) => ({
      meno: c.name,
      segment: c.segment,
      status: c.status,
      statusAuto: c.statusAuto,
      statusManual: c.statusOverride,
      pauzaDo: c.pauseUntil || null,
      trener: c.primaryTrainer,
      trenerManual: c.primaryTrainerOverride,
      balicek: c.membership || "Bez balíčka",
      zostatokSedeni: c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : null,
      stavBalicka: c.packageStatus || null,
      typ: c.clientType,
      is6m: c.is6m,
      modalita: c.modality,
      zmluvaPodpisana: c.contractSigned,
      platiBitcoin: c.bitcoin,
      specialnaSadzba: c.specialRate,
      pozn_specialnaSadzba: c.specialRateNote || null,
      poznamkaTrenera: c.trainerNote || null,
      pocetSedeni: c.sessionCount,
      hodinySpolu: r1(c.totalHours),
      priemCenaSedenia: r0(c.paidAvg),
      dochadzkaPct: r0(c.attendance * 100),
      prveSedenie: c.firstSession || null,
      posledneSedenie: c.lastSession || null,
    }));

  return {
    // Register je PRVÝ zámerne. Kontext sa na serveri reže na pevnú dĺžku a
    // rez ide odzadu — kým bol register posledný, pri 60+ klientoch z neho
    // nezostalo nič a Jarvis na „zruš to upozornenie o nájme" odpovedal, že
    // ho nenašiel. Malé a dôležité veci patria dopredu, dlhé zoznamy dozadu.
    naCoSaPozriet: register.map((r) => ({
      key: r.key,
      kategoria: r.category,
      zavaznost: r.tone === "red" ? "vysoká" : r.tone === "orange" ? "stredná" : "nízka",
      nadpis: r.title,
      detail: r.detail,
      akceptovane: r.acked,
      poznamka: r.note || null,
    })),
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      note: "Súhrnné čísla sú za OBOCH trénerov spolu (Jerry + Terezka), ak nie je uvedené inak. Rozpisy po trénerovi máš v zarobky.mesacne (jerry/terezka), tyzdennePodlaTrenera a kapacita.podlaTrenera. Detail každého klienta (aj editovateľné polia) je v klientiDetail.",
      totalClients: clientList.length,
    },
    kpi,
    tyzdenneHodiny,
    tyzdennePodlaTrenera,
    zdravaZona,
    kapacita: { spolu: capSpolu, podlaTrenera: capPerTrainer },
    zarobky: {
      poslednyMesiac: lastMonth ? { mesiac: monthLabel(lastMonth.month), revenue: r0(lastMonth.revenue), sedeni: lastMonth.sessions } : null,
      mesacne: finActual,
      priemerMesacne: earnAvg,
      maxMesacne: earnMax,
      minMesacne: earnMin,
      poznamka: "Vyfakturované zárobky = hodnota odtrénovaných sedení (Payroll by Session). Ø/max/min len z reálnych mesiacov, bez odhadu.",
      odhad3mes: { optimisticky: r0(pred.scenarios.optimistic), realisticky: r0(pred.scenarios.realistic), negativny: r0(pred.scenarios.negative), mesacnyRunRate: r0(pred.monthlyRunRate) },
    },
    sedeniaTrend: { mesacne: trend, priemerMesacne: trendAvg },
    tempo: { priemerSedeniMes: tempoAvg, poznamka: "Priemerný počet sedení klienta za mesiac (z histórie)." },
    doveraObnovy: { priemerPct: confAvg, poznamka: "Priemerná pravdepodobnosť obnovy naprieč klientmi, vážená segmentom." },
    klienti: {
      spolu: clientList.length,
      podlaSegmentu: dist((c) => c.segment),
      podlaBalicka: dist((c) => c.membership || "Bez balíčka"),
      podlaModality: dist((c) => c.modality),
    },
    sixM: { spolu: sixM.length, podlaFazy: sixMPhases, poznamka: "6M proces: Obnova 1.–6. mesiac, Integrácia 7.–18., Udržateľnosť 19.+" },
    klientiDetail,
  };
}
