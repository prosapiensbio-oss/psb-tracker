// Builds a compact, accurate snapshot of the studio's data for the AI assistant.
// The same numbers the dashboard cards show — so the assistant can explain any
// value ("prečo v tejto karte vidím toto číslo") and reason over the alerts.
import {
  capacityByTrainer,
  deriveRegister,
  monthlyFinance,
  predictEarnings,
  sessionAnalysisPSB,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "./compute";
import { monthLabel } from "./format";
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
  const fin = monthlyFinance(data);
  const finActual = fin.map((m) => ({ month: monthLabel(m.month), key: m.month, revenue: r0(m.revenue), sessions: m.sessions }));
  const revVals = fin.map((m) => m.revenue).filter((v) => v > 0);
  const earnAvg = revVals.length ? r0(revVals.reduce((a, b) => a + b, 0) / revVals.length) : 0;
  const lastMonth = fin[fin.length - 1];

  const trend = sessionAnalysisPSB(data.sessions).map((m) => ({ month: monthLabel(m.month), total: m.total, offline: m.offline, online: m.onlineTc, uvodne: m.uvodne }));
  const trendAvg = trend.length ? r1(trend.reduce((a, b) => a + b.total, 0) / trend.length) : 0;

  const pred = predictEarnings(data, clients, { excludeSpecial: false, horizon: 3 });
  const tempoVals = pred.perClient.map((c) => c.burnRate).filter((n) => n > 0);
  const tempoAvg = tempoVals.length ? r1(tempoVals.reduce((a, b) => a + b, 0) / tempoVals.length) : 0;
  const confVals = pred.perClient.map((c) => c.confidence);
  const confAvg = confVals.length ? r0((confVals.reduce((a, b) => a + b, 0) / confVals.length) * 100) : 0;

  // Segment + package + modality distributions.
  const dist = (fn: (c: ClientAgg) => string) => {
    const m: Record<string, number> = {};
    for (const c of clientList) m[fn(c)] = (m[fn(c)] || 0) + 1;
    return m;
  };

  // 6M phase distribution.
  const phase = (n: number) => (n <= 6 ? "Obnova (1–6)" : n <= 18 ? "Integrácia (7–18)" : "Udržateľnosť (19+)");
  const sixMPhases: Record<string, number> = {};
  for (const c of sixM) sixMPhases[phase(c.monthInPhase)] = (sixMPhases[phase(c.monthInPhase)] || 0) + 1;

  return {
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      note: "Čísla sú za OBOCH trénerov spolu (Jerry + Terezka), ak nie je uvedené inak. Na dashboarde si vie používateľ prepnúť trénera.",
      totalClients: clientList.length,
      sixMClients: sixM.length,
    },
    zarobky: {
      poslednyMesiac: lastMonth ? { month: monthLabel(lastMonth.month), revenue: r0(lastMonth.revenue), sessions: lastMonth.sessions } : null,
      mesacne: finActual,
      priemerMesacne: earnAvg,
      poznamka: "Vyfakturované zárobky = hodnota odtrénovaných sedení (Payroll by Session). Ø/max/min sa počíta len z reálnych mesiacov, bez odhadu.",
      odhad3mes: { optimisticky: r0(pred.scenarios.optimistic), realisticky: r0(pred.scenarios.realistic), negativny: r0(pred.scenarios.negative), mesacnyRunRate: r0(pred.monthlyRunRate) },
    },
    kapacita: capacity.map((c) => ({
      trener: c.trainer,
      efektHodinTyz: r1(c.effHours),
      vytazeniePct: r0((c.effHours / 58) * 100),
      zdravaZona: `${ZONE_LO}–${ZONE_HI}h/týž na trénera`,
      odporucanie: c.advice,
    })),
    sedeniaTrend: { mesacne: trend, priemerMesacne: trendAvg },
    tempo: { priemerSedeniMes: tempoAvg, poznamka: "Priemerný počet sedení klienta za mesiac (z histórie)." },
    doveraObnovy: { priemerPct: confAvg, poznamka: "Priemerná pravdepodobnosť obnovy naprieč klientmi, vážená segmentom." },
    klienti: {
      spolu: clientList.length,
      podlaSegmentu: dist((c) => c.segment),
      podlaBalicka: dist((c) => c.membership || "Bez balíčka"),
      podlaModality: dist((c) => c.modality),
    },
    sixM: {
      spolu: sixM.length,
      podlaFazy: sixMPhases,
      poznamka: "6M proces: Obnova 1.–6. mesiac, Integrácia 7.–18., Udržateľnosť 19.+",
    },
    naCoSaPozriet: register.map((r) => ({
      key: r.key,
      kategoria: r.category,
      zavaznost: r.tone === "red" ? "vysoká" : r.tone === "orange" ? "stredná" : "nízka",
      nadpis: r.title,
      detail: r.detail,
      akceptovane: r.acked,
      poznamka: r.note || null,
    })),
  };
}
