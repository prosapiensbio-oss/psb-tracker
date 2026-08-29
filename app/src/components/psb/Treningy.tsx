import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { fetchWeekEntries, saveWeekEntry, type WeekEntry } from "../../lib/psb/client";
import { groupTrainings, periodInfo, kotvaDat, periodZone, sessionAnalysis, TARGET_H, type ClientAgg, type Period, type PeriodRow } from "../../lib/psb/compute";
import { fmtCZK, monthLabel, weekKey, weekLabel } from "../../lib/psb/format";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { NavFocus } from "./App";
import { SessionTrend } from "./SessionTrend";
import { Card, Donut, Empty, H3, Info, LineChart, Select, SortTh, StatCard, SubTabs, TableWrap, Toolbar, TrenerPills, useSort } from "./ui";

const PEOPLE = [
  { key: "jerry", label: "Jerry" },
  { key: "terezka", label: "Terezka" },
] as const;

export const wkScore = (p: string) => `${p}_score`;
export const wkHours = (p: string) => `${p}_hours`;
export const wkNote = (p: string) => `${p}_note`;

// Energy belongs next to the hours it has to be read against — the app only
// sees training hours, so the "iné hodiny" estimate is what makes a score
// interpretable at all. Asked weekly because by month-end you only remember
// the last week.
function WeekEnergyRow({ weekKeyIso, colSpan, entry, onSave }: {
  weekKeyIso: string; colSpan: number; entry: WeekEntry; onSave: (week: string, data: WeekEntry) => void;
}) {
  const [draft, setDraft] = useState<WeekEntry>(entry);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /**
   * Riadok sa smie otvoriť skôr, než dorazia dáta — a vtedy je `entry` prázdne.
   *
   * `useState(entry)` vezme hodnotu LEN pri prvom vykreslení, takže pri
   * otvorení cez pripomienku sa formulár nakreslil prázdny, hoci týždeň
   * zapísaný bol. Kto ho vyplnil, prepísal uloženú poznámku prázdnym
   * formulárom — presne to sa stalo 29. 8. 2026 týždňu 24. 8.
   *
   * Kým sa políčok nikto nedotkol, draft zrkadlí `entry`. Po prvom písmene
   * sa zamkne, aby dobiehajúce dáta nezmazali rozpísaný text.
   */
  const dotknute = useRef(false);
  const entryKluc = JSON.stringify(entry ?? {});
  useEffect(() => {
    if (!dotknute.current) setDraft(entry ?? {});
  }, [entryKluc]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: string) => { dotknute.current = true; setDraft((d) => ({ ...d, [k]: v })); };
  const save = async () => {
    setSaving(true);
    const ok = await saveWeekEntry(weekKeyIso, draft);
    setSaving(false);
    if (!ok) return; // tlačidlo zostane „Uložiť" — nič sa nezapísalo
    setSaved(true);
    onSave(weekKeyIso, draft);
    setTimeout(() => setSaved(false), 2000);
  };
  const field: CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 12.5, padding: "6px 9px", fontFamily: "inherit",
  };
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "12px 14px", background: mix(C.accent, 5), borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
          {PEOPLE.map((p) => {
            // Škála je RPE, nie „energia": 1 = ľahký týždeň, 10 = veľmi ťažký.
            // Pôvodne bola opačne a posuvník nemal štítok, takže Jerry aj
            // Terezka doň prirodzene písali náročnosť (ako RPE, ktoré ako
            // tréneri používajú denne) a appka to čítala ako vyhorenie.
            // Nízke je dobré, vysoké je varovanie; východzia je stredná päťka.
            const score = Number(draft[wkScore(p.key)] ?? 5);
            const col = score <= 4 ? C.green : score <= 7 ? C.orange : C.red;
            return (
              <div key={p.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", background: mix(C.accent, 4) }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: p.key === "jerry" ? C.accent : C.blue, marginBottom: 6 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>
                  Náročnosť týždňa <span style={{ color: C.textDim }}>· 1 = ľahký · 10 = veľmi ťažký</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                  <input type="range" min={1} max={10} step={1} value={score}
                    onChange={(e) => set(wkScore(p.key), e.target.value)} style={{ flex: 1, accentColor: col }} />
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 40, textAlign: "right", color: col, fontVariantNumeric: "tabular-nums" }}>{score} / 10</span>
                </div>
                <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  Iné hodiny (mimo tréningov)
                  <input type="number" min={0} max={120} value={draft[wkHours(p.key)] ?? ""}
                    onChange={(e) => set(wkHours(p.key), e.target.value)} placeholder="napr. 8" style={{ ...field, width: 78 }} />
                </label>
                {/* Kolónky „Zrušené" a „Presunuté" tu boli preto, že zrušený
                    tréning sa z kalendára zmaže a neskôr sa už nedá obnoviť —
                    musel sa zapísať, keď sa to stalo. Snímky kalendára (od
                    8/2026) ten dôvod zrušili: appka si pamätá, ako týždeň
                    vyzeral ráno a ako večer, takže zrušenie aj presun zachytí
                    sama a ešte sa aj spýta prečo. Dvakrát to isté ručne
                    prepisovať nemá zmysel. Staré zápisy zostávajú v štatistike. */}
                <input value={draft[wkNote(p.key)] ?? ""} onChange={(e) => set(wkNote(p.key), e.target.value)}
                  placeholder="jedna veta…" style={{ ...field, width: "100%" }} />
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button onClick={save} disabled={saving}
            style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12.5, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Ukladám…" : "Uložiť"}
          </button>
          {saved && <span style={{ fontSize: 12, color: C.green }}>✓ Uložené</span>}
        </div>
      </td>
    </tr>
  );
}

export function Treningy({ data, sub, onSub, focus, trainer, onTrainer }: { data: PSBData; clients: Record<string, ClientAgg>; sub: string; onSub: (s: string) => void; focus?: NavFocus | null; trainer: string; onTrainer: (t: string) => void }) {
  return (
    <>
      <SubTabs tabs={[{ id: "prehled", label: "Prehľad" }, { id: "analyza", label: "Analýza sedení" }]} value={sub} onChange={onSub} />
      {sub === "prehled" && <Prehlad data={data} focus={focus} trainer={trainer} onTrainer={onTrainer} />}
      {sub === "analyza" && <Analyza data={data} />}
    </>
  );
}

function Prehlad({ data, focus, trainer, onTrainer }: { data: PSBData; focus?: NavFocus | null; trainer: string; onTrainer: (t: string) => void }) {
  const [period, setPeriod] = useState<Period>("week");
  const trainerF = trainer;
  const setTrainerF = onTrainer;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [win, setWin] = useState("2026"); // days window over history
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort({ key: "period", dir: "desc" });

  // Deep-link from the Dashboard: focus a specific week (weekLabel is the row key).
  useEffect(() => {
    if (!focus?.week) return;
    setPeriod("week");
    setWin("all");
    setTrainerF(focus.trainer && focus.trainer !== "all" ? focus.trainer : "all");
    // Týždenná pripomienka posiela PONDELOK (RRRR-MM-DD), odkazy z dashboardu
    // posielajú štítok riadku („24.8."). Prvý treba rozbaliť, druhý zvýrazniť —
    // preto sa rozlišujú tvarom, nie ďalším parametrom.
    if (/^\d{4}-\d{2}-\d{2}$/.test(focus.week)) {
      setOpenWeek(focus.week);
      setSelectedKey(weekLabel(focus.week));
    } else {
      setSelectedKey(focus.week);
    }
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const range = useMemo(() => {
    if (period === "custom" || win === "custom") return { from, to };
    // Roky ako pevné hranice, okná ako posun od dneška. Štandard rodiny T.
    if (win === "2026" || win === "2025") return { from: `${win}-01-01`, to: `${win}-12-31` };
    const dni: Record<string, number> = { "6m": 183, "3m": 92, "1m": 31, "1t": 7 };
    if (dni[win]) return { from: new Date(Date.now() - dni[win] * 86400000).toISOString().slice(0, 10) };
    return undefined;
  }, [period, from, to, win]);

  const rows = useMemo(() => {
    const zo = groupTrainings(data.sessions, period, trainerF, range);
    // Prebiehajúci týždeň má riadok, aj keď v ňom ešte nie je ani jedno sedenie.
    //
    // Jerry, 14. 8.: „nemám nahodené tréningy z PTmindera, ale mohol by tam už
    // vzniknúť nový týždeň a doplnil by som únavu a poznámku aj bez hodín."
    //
    // Náročnosť týždňa a poznámka nezávisia od exportu — závisia od toho, že si
    // to človek pamätá. Export prichádza v nedeľu, spomienka bledne od piatku.
    // Bez tohto riadku sa nebolo kam kliknúť a pripomienka v „+ Zápis" viedla
    // na tabuľku, v ktorej ten týždeň nebol.
    // Riadok sa NEPRIDÁVA len pri „Celé obdobie" — pridá sa vždy, keď dnešok
    // do zvoleného okna PATRÍ.
    //
    // Pôvodná podmienka ho zahodila, len čo bolo nastavené akékoľvek okno —
    // a Jerry má štandardne „2026", takže prebiehajúci týždeň nevidel nikdy.
    // Pripomienka v piatok tak viedla do tabuľky, v ktorej ten týždeň nebol,
    // a do nedele, keď dorazí export, spomienka na náročnosť týždňa vyprchá.
    // Nájdené 24. 8. 2026 — funkcia z 14. 8. bola celý čas vypnutá filtrom.
    if (period !== "week") return zo;
    const teraz = new Date();
    const dnesIso = teraz.toISOString().slice(0, 10);
    if (range?.from && dnesIso < range.from) return zo;
    if (range?.to && dnesIso > range.to) return zo;
    const kluc = periodInfo(teraz.toISOString(), "week");
    if (zo.some((g) => g.key === kluc.label)) return zo;
    // Začiatok týždňa (pondelok) ako `ts` — riadok sa tým zaradí chronologicky
    // na správne miesto, nielen na koniec.
    const den = (teraz.getUTCDay() + 6) % 7;
    const pondelok = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate() - den));
    const prazdny: PeriodRow = {
      key: kluc.label,
      ts: pondelok.getTime(),
      total: { hours: 0, sessions: 0, clients: 0, revenue: 0 },
      byTrainer: {},
      score: 0,
      recommendation: "",
    };
    return [...zo, prazdny];
  }, [data.sessions, period, trainerF, range]);
  const chrono = useMemo(() => [...rows].sort((a, b) => a.ts - b.ts), [rows]);

  // Posledné obdobie býva rozrobené: dáta z PTmindera končia uprostred týždňa
  // (alebo mesiaca) a posledný bod grafu potom klesne — nie preto, že sa robilo
  // menej, ale preto, že obdobie ešte nemá všetky dni. Tu sa nezahadzuje:
  // aktuálna záťaž je zmyslom tejto obrazovky. Len sa to povie.
  const posledneNeuplne = useMemo(() => {
    const den = kotvaDat({ sessions: data.sessions }).den;
    if (!den || period === "custom") return false;
    const d = new Date(`${den}T00:00:00Z`);
    if (period === "week") return d.getUTCDay() !== 0; // nedeľa = koniec týždňa
    const dalsi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const koniecMesiaca = new Date(dalsi.getTime() - 86400000).getUTCDate();
    if (period === "month") return d.getUTCDate() !== koniecMesiaca;
    // kvartál: posledný deň marca/júna/septembra/decembra
    return !((d.getUTCMonth() + 1) % 3 === 0 && d.getUTCDate() === koniecMesiaca);
  }, [data.sessions, period]);
  const both = trainerF === "all";
  const weekly = period === "week";
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<Record<string, WeekEntry>>({});
  useEffect(() => { fetchWeekEntries().then(setWeeks); }, []);

  // Totals from the weekly log, limited to the weeks currently in the table.
  const shownWeeks = useMemo(() => new Set(rows.map((g) => weekKey(new Date(g.ts).toISOString()))), [rows]);
  const logged = useMemo(() => {
    const per: Record<string, { zrusene: number; presunute: number }> = {
      jerry: { zrusene: 0, presunute: 0 },
      terezka: { zrusene: 0, presunute: 0 },
    };
    let zrusene = 0, presunute = 0;
    for (const [wk, e] of Object.entries(weeks)) {
      if (!shownWeeks.has(wk)) continue;
      for (const p of ["jerry", "terezka"] as const) {
        const z = Number(e[`${p}_zrusene`]) || 0;
        const s = Number(e[`${p}_presunute`]) || 0;
        per[p].zrusene += z;
        per[p].presunute += s;
        zrusene += z;
        presunute += s;
      }
      // Entries written before the split were studio-level; still count them.
      zrusene += Number(e.zrusene) || 0;
      presunute += Number(e.presunute) || 0;
    }
    return { per, zrusene, presunute, any: zrusene + presunute > 0 };
  }, [weeks, shownWeeks]);
  // Úvodné tréningy over the same window — the middle step of the funnel.
  const uvodne = useMemo(() => {
    const from = range?.from, to = range?.to;
    return data.sessions.filter((s) => {
      if (s.sessionType !== "UVODNE") return false;
      if (from && s.date < from) return false;
      if (to && s.date > to + "T23:59:59.999Z") return false;
      return true;
    }).length;
  }, [data.sessions, range]);
  const sortedRows = useMemo(
    () =>
      sorted(selectedKey ? rows.filter((g) => g.key === selectedKey) : rows, {
        period: (g) => g.ts,
        jerry: (g) => g.byTrainer["Jerry"]?.hours || 0,
        terezka: (g) => g.byTrainer["Terezka"]?.hours || 0,
        total: (g) => g.total.hours,
        sessions: (g) => g.total.sessions,
        revenue: (g) => g.total.revenue,
        czk: (g) => (g.total.sessions ? g.total.revenue / g.total.sessions : 0),
        score: (g) => g.score,
      }),
    [rows, sorted, selectedKey],
  );

  const summary = useMemo(() => {
    if (!rows.length) return null;
    // Umelý riadok bežiaceho týždňa (pridaný vyššie, aby sa dal zapísať) do
    // priemerov nepatrí — jeho nula je vymyslená appkou, nie odtrénovaná.
    const realne = rows.filter((g) => g.total.sessions > 0 || g.score > 0);
    const zdroj = realne.length ? realne : rows;
    const n = zdroj.length;
    return {
      avgH: zdroj.reduce((a, g) => a + g.total.hours, 0) / n,
      avgScore: zdroj.reduce((a, g) => a + g.score, 0) / n,
      // Súčet ÷ súčet, nie priemer pomerov po riadkoch: týždeň s dvomi
      // sedeniami nemá vážiť ako týždeň s tridsiatimi. Pozor, je to cena
      // ZAPÍSANÁ PRI SEDENÍ — pri 19 % sedení je nulová (platba visí na
      // balíčku), takže je nižšia než „Ø cena sedenia" z prijatých peňazí.
      // Preto sa aj volá inak; obe čísla sú správne, len na inú otázku.
      avgCzk: (() => {
        const sed = zdroj.reduce((a, g) => a + g.total.sessions, 0);
        return sed ? zdroj.reduce((a, g) => a + g.total.revenue, 0) / sed : 0;
      })(),
    };
  }, [rows]);

  // Súčet odrobených hodín podľa trénera za zvolené obdobie. Priemer na týždeň
  // nestačí na otázku „koľko kto odrobil minulý mesiac" — a to je otázka, ktorá
  // sa pýta pri kontrole výplat. Mzdové hodiny sú bez úvodných: tie sa platia
  // zvlášť a do mzdy nevstupujú.
  const hodinyPodlaTrenera = useMemo(() => {
    const from = range?.from, to = range?.to;
    const m: Record<string, { vsetky: number; mzdove: number; sedeni: number }> = {};
    for (const s of data.sessions) {
      if (from && s.date < from) continue;
      if (to && s.date > to + "T23:59:59.999Z") continue;
      const e = (m[s.sessionTrainer] ||= { vsetky: 0, mzdove: 0, sedeni: 0 });
      e.vsetky += s.duration / 60;
      e.sedeni++;
      if (s.sessionType !== "UVODNE") e.mzdove += s.duration / 60;
    }
    return Object.entries(m).sort((a, b) => b[1].vsetky - a[1].vsetky);
  }, [data.sessions, range]);

  const zoneColor = (hours: number) => {
    const { lo, hi } = periodZone(period);
    if (hours >= lo && hours <= hi) return C.green;
    if (hours > hi) return C.orange;
    return C.red;
  };

  const chart = useMemo(
    () =>
      chrono.map((g) =>
        both
          ? { label: g.key, values: [g.byTrainer["Jerry"]?.hours || 0, g.byTrainer["Terezka"]?.hours || 0, g.total.hours] }
          : { label: g.key, values: [g.total.hours] },
      ),
    [chrono, both],
  );
  const zone = periodZone(period);
  const lineSeries = both
    ? [{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }, { name: "Spolu", color: C.blue }]
    : [{ name: trainerF, color: C.accent }];

  return (
    <Card>
      <H3>
        <Info text="Odtrénované hodiny po obdobiach, chronologicky. Zelené pásmo = zdravá zóna na jedného trénera (týždeň 24–34h). Klik na hlavičku = zoradenie." label="Odrobené hodiny" />
      </H3>
      <Toolbar>
        <Select value={period} onChange={(v) => setPeriod(v as Period)} options={[
          { value: "week", label: "Týždeň" },
          { value: "month", label: "Mesiac" },
          { value: "quarter", label: "Kvartál" },
          { value: "custom", label: "Vlastné obdobie" },
        ]} />
        <TrenerPills value={trainerF} onChange={setTrainerF} />
        {period !== "custom" && (
          <Select value={win} onChange={setWin} options={[
            { value: "all", label: "Celé obdobie" },
            { value: "2025", label: "2025" },
            { value: "2026", label: "2026" },
            { value: "6m", label: "Posledných 6 mes." },
            { value: "3m", label: "Posledné 3 mes." },
            { value: "1m", label: "Posledný mesiac" },
            { value: "1t", label: "Posledný týždeň" },
            { value: "custom", label: "Vlastné" },
          ]} />
        )}
        {(period === "custom" || win === "custom") && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
            <span style={{ color: C.textDim }}>–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
          </>
        )}
      </Toolbar>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
          <StatCard value={`${summary.avgH.toFixed(1)}h`} label={`Ø hodín / ${period === "week" ? "týždeň" : period === "quarter" ? "kvartál" : "mesiac"}`} />
          <StatCard value={summary.avgScore.toFixed(1)} label="Ø skóre (1–10)" color={summary.avgScore >= 7 ? C.green : summary.avgScore >= 4 ? C.orange : C.red} />
          <StatCard value={fmtCZK(summary.avgCzk)} label={<Info text="Cena ZAPÍSANÁ pri sedení, sčítaná a delená počtom sedení. Je nižšia než „Ø cena sedenia“ na Kokpite a v Peniazoch — tá ráta z prijatých peňazí. Rozdiel je v tom, že pri 19 % sedení je cena v PTminderi nulová, lebo platba visí na balíčku; tu tie nuly priemer stláčajú, tam sa platba za balíček započíta. Toto číslo hovorí „koľko je odtrénované ocenené v PTminderi“, to druhé „koľko peňazí prišlo na hodinu“." label="Ø zapísané / sedenie" />} />
        </div>
      )}

      {/* Kto koľko odrobil za zvolené obdobie — na overenie mzdových hodín. */}
      {hodinyPodlaTrenera.length > 0 && range && (
        <div style={{ marginBottom: 14, padding: "11px 13px", borderRadius: 11, border: `1px solid ${C.border}`, background: mix(C.accent, 4) }}>
          <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 8 }}>
            <Info
              label="Odrobené hodiny za zvolené obdobie"
              text="Mzdové hodiny sú bez úvodných tréningov — tie sa platia zvlášť a do mzdy nevstupujú. Presne tieto čísla idú do VZAS → J&T Výplaty pre mesiace od júla 2026."
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {hodinyPodlaTrenera.map(([tren, h]) => (
              <div key={tren} style={{ background: C.track, borderRadius: 9, padding: "8px 11px" }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>{tren}</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                  {h.mzdove.toFixed(1)} h
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                  {h.sedeni} sedení · {h.vsetky.toFixed(1)} h vrátane úvodných
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {weekly && logged.any && (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: mix(C.accent, 5) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 9 }}>
            Z týždenných zápisov
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <StatCard
              value={String(logged.zrusene)}
              label={<Info text={`Jerry ${logged.per.jerry.zrusene} · Terezka ${logged.per.terezka.zrusene}. Ručný zápis skončil v auguste 2026 — zrušenia odvtedy zachytáva Kalendár zo snímok, aj s dôvodom.`} label="Zrušené tréningy" />}
              color={C.red}
            />
            <StatCard
              value={String(logged.presunute)}
              label={<Info text={`Jerry ${logged.per.jerry.presunute} · Terezka ${logged.per.terezka.presunute}. Ručný zápis skončil v auguste 2026 — presuny odvtedy zachytáva Kalendár zo snímok.`} label="Presunuté" />}
              color={C.orange}
            />
            <StatCard value={String(uvodne)} label="Úvodné tréningy" color={C.accentLight} />
          </div>
          {logged.zrusene > 0 && (
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 9 }}>
              Zrušené tréningy sú stratená kapacita — pri Ø {fmtCZK(summary?.avgCzk ?? 0)} za sedenie to je zhruba{" "}
              <b style={{ color: C.red }}>{fmtCZK(logged.zrusene * (summary?.avgCzk ?? 0))}</b> nezarobených za zvolené obdobie.
            </div>
          )}
        </div>
      )}

      {period !== "custom" && chart.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <LineChart
            data={chart}
            series={lineSeries}
            zone={zone}
            height={210}
            fmt={(n) => `${Math.round(n)}h`}
            pointWidth={48}
            alignEnd
            onPoint={(i) => setSelectedKey((k) => (k === chrono[i]?.key ? null : chrono[i]?.key ?? null))}
          />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
            Trend odtrénovaných hodín — stúpa/klesá. Otvára sa na aktuálnom období, posúvaj doľava. Klik na bod = detail obdobia v tabuľke dole.
            {posledneNeuplne && (
              <> <span style={{ color: C.orange }}>Posledný bod je rozrobené obdobie — nie je celý, neporovnávaj ho s predošlými.</span></>
            )}
          </div>
        </div>
      )}

      {selectedKey && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setSelectedKey(null)} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
            Vybraté obdobie: {selectedKey} ✕
          </button>
        </div>
      )}

      <TableWrap>
        <thead>
          <tr>
            <SortTh label="Obdobie" sortKey="period" sort={sort} onSort={toggle} />
            {both ? (
              <>
                <SortTh label="Jerry h" sortKey="jerry" sort={sort} onSort={toggle} align="right" />
                {weekly && <th style={{ ...S.th, textAlign: "right" }}><Info text="Ako ťažký bol týždeň podľa Jerryho: 1 = ľahký, 10 = veľmi ťažký (rovnaká logika ako RPE). Nízke číslo je dobré. Klikni na riadok a nastav ho posuvníkom." label="Jerry N" /></th>}
                <SortTh label="Terezka h" sortKey="terezka" sort={sort} onSort={toggle} align="right" />
                {weekly && <th style={{ ...S.th, textAlign: "right" }}><Info text="Ako ťažký bol týždeň podľa Terezky: 1 = ľahký, 10 = veľmi ťažký (rovnaká logika ako RPE). Nízke číslo je dobré. Klikni na riadok a nastav ho posuvníkom." label="Terezka N" /></th>}
              </>
            ) : null}
            <SortTh label="Spolu h" sortKey="total" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Zárobky" sortKey="revenue" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Zapísané/sed." sortKey="czk" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Skóre" sortKey="score" sort={sort} onSort={toggle} align="right" info="Blízkosť k stredu zdravej zóny (29h/týž) na trénera. 10 = ideál." />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((g) => {
            const jerry = g.byTrainer["Jerry"];
            const terezka = g.byTrainer["Terezka"];
            const czk = g.total.sessions ? g.total.revenue / g.total.sessions : 0;
            const wk = weekly ? weekKey(new Date(g.ts).toISOString()) : null;
            const entry = wk ? (weeks[wk] ?? {}) : {};
            const energyCell = (person: string) => {
              const v = entry[wkScore(person)];
              if (!v) return <td style={{ ...S.td, textAlign: "right", color: C.textDim }}>—</td>;
              const n = Number(v);
              return <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: n >= 7 ? C.green : n >= 4 ? C.orange : C.red }}>{n}</td>;
            };
            const nCols = 5 + (both ? (weekly ? 4 : 2) : 0);
            return (
              <Fragment key={g.key}>
              <tr>
                <td onClick={() => wk && setOpenWeek(openWeek === wk ? null : wk)}
                  style={{ ...S.td, cursor: wk ? "pointer" : undefined, whiteSpace: "nowrap" }}>
                  {wk && <span style={{ display: "inline-block", width: 14, color: C.textDim, fontSize: 9 }}>{openWeek === wk ? "▼" : "▶"}</span>}
                  {g.key}
                </td>
                {both ? (
                  <>
                    <td style={{ ...S.td, textAlign: "right", color: jerry ? zoneColor(jerry.hours) : C.textDim }}>{jerry ? jerry.hours.toFixed(0) : "—"}</td>
                    {weekly && energyCell("jerry")}
                    <td style={{ ...S.td, textAlign: "right", color: terezka ? zoneColor(terezka.hours) : C.textDim }}>{terezka ? terezka.hours.toFixed(0) : "—"}</td>
                    {weekly && energyCell("terezka")}
                  </>
                ) : null}
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: zoneColor(g.total.hours) }}>{g.total.hours.toFixed(0)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{g.total.sessions}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(g.total.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(czk)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: g.score >= 7 ? C.green : g.score >= 4 ? C.orange : C.red }}>{g.score}</td>
              </tr>
              {wk && openWeek === wk && (
                <WeekEnergyRow weekKeyIso={wk} colSpan={nCols} entry={entry}
                  onSave={(w, d) => setWeeks((prev) => ({ ...prev, [w]: d }))} />
              )}
              </Fragment>
            );
          })}
        </tbody>
      </TableWrap>
      {!rows.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      {rows.length > 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.textDim }}>Cieľ {TARGET_H}h/týždeň na trénera · zdravá zóna 24–34h.</div>}
    </Card>
  );
}

// Štandard rodiny T — roky nemajú days, hranice sa počítajú z hodnoty.
const WINDOWS = [
  { value: "all", label: "Celé obdobie", days: 0 },
  { value: "2025", label: "2025", days: 0 },
  { value: "2026", label: "2026", days: 0 },
  { value: "6m", label: "Posledných 6 mes.", days: 183 },
  { value: "3m", label: "Posledné 3 mes.", days: 92 },
  { value: "1m", label: "Posledný mesiac", days: 31 },
  { value: "1t", label: "Posledný týždeň", days: 7 },
  { value: "custom", label: "Vlastné", days: -1 },
];

function Analyza({ data }: { data: PSBData }) {
  const [trainerF, setTrainerF] = useState("all");
  const [win, setWin] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Najnovší mesiac hore, rovnako ako v ostatných mesačných tabuľkách.
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "desc" });

  const filtered = useMemo(() => {
    let lo = 0;
    let hi = Infinity;
    if (win === "custom") {
      lo = from ? new Date(from).getTime() : 0;
      hi = to ? new Date(to).getTime() + 86400000 : Infinity;
    } else if (win === "2026" || win === "2025") {
      // Rok = pevné hranice, nie posun od dneška.
      lo = Date.parse(`${win}-01-01`);
      hi = Date.parse(`${win}-12-31`) + 86400000;
    } else {
      const days = Number(WINDOWS.find((w) => w.value === win)?.days || 0);
      if (days > 0) lo = Date.now() - days * 86400000;
    }
    return data.sessions.filter((s) => {
      if (trainerF !== "all" && s.sessionTrainer !== trainerF) return false;
      const t = new Date(s.date).getTime();
      return t >= lo && t <= hi;
    });
  }, [data.sessions, trainerF, win, from, to]);

  const donut = useMemo(() => {
    let off = 0, onTc = 0, uvod = 0;
    for (const s of filtered) {
      if (s.sessionType === "OFFLINE") off++;
      else if (s.sessionType === "UVODNE") uvod++;
      else onTc++;
    }
    return [
      { label: "Offline", value: off, color: C.accent },
      { label: "Online + TrueCoach", value: onTc, color: C.blue },
      { label: "Úvodné", value: uvod, color: C.orange },
    ];
  }, [filtered]);

  const detail = useMemo(
    () =>
      sorted(sessionAnalysis(filtered), {
        month: (r) => r.month,
        trainer: (r) => r.trainer,
        uvodne: (r) => r.UVODNE,
        offline: (r) => r.OFFLINE,
        online: (r) => r.ONLINE + r.TRUECOACH,
        total: (r) => r.total,
      }),
    [filtered, sorted],
  );

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <H3>Pomer typov sedení</H3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TrenerPills value={trainerF} onChange={setTrainerF} />
            <Select value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
            {win === "custom" && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
                <span style={{ color: C.textDim, alignSelf: "center" }}>–</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
              </>
            )}
          </div>
        </div>
        {filtered.length ? <Donut data={donut} size={160} centerLabel={String(filtered.length)} /> : <Empty>Žiadne sedenia pre tento filter.</Empty>}
      </Card>

      <SessionTrend sessions={filtered} />

      <Card>
        <H3>Detail po mesiacoch a trénerovi</H3>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
              <SortTh label="Úvodné" sortKey="uvodne" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Offline" sortKey="offline" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Online" sortKey="online" sort={sort} onSort={toggle} align="right" info="Online sedenia vrátane TrueCoach (počítajú sa spolu)." />
              <SortTh label="Celkom" sortKey="total" sort={sort} onSort={toggle} align="right" />
            </tr>
          </thead>
          <tbody>
            {detail.map((r, i) => (
              <tr key={i}>
                <td style={S.td}>{monthLabel(r.month)}</td>
                <td style={S.td}>{r.trainer}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.UVODNE}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.OFFLINE}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.ONLINE + r.TRUECOACH}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!detail.length && <Empty>Žiadne dáta pre tento filter.</Empty>}
      </Card>
    </>
  );
}
