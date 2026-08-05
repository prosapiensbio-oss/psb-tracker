import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  monthlyFinance,
  predictCash,
  predictEarnings,
  TARGET_H,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type FinanceMonth,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "../../lib/psb/compute";
import { fmtCZK, fmtDMY, monthLabel, weekKey, weekLabel } from "../../lib/psb/format";
import { C, mix, S, badge, btn } from "../../lib/psb/theme";
import { nastavPrijmyZTrackera, pnlCalc, poslednyMesiacSDatami, vzasVerzia, VZAS_MONTHS } from "../../lib/psb/vzas";
import {
  centerBody, GrafyKniznica, MiniStat, SEKCIE, useExtraGrafy, VYCHODZIE, WIDGETS,
  type SekciaId, type WidgetMeta,
} from "./DashGrafy";
import { tokyKlientov } from "./Fluktuacia";
import type { PSBData } from "../../lib/psb/types";
import type { Actions, NavFocus } from "./App";
import type { AssistantChat } from "./Assistant";
import { Card, Donut, Empty, H3, Info, StatCard, StatGrid, ValueBars, ZoneBars } from "./ui";

const catTone = (c: RegisterItem["category"]) =>
  c === "6M" ? "accent" : c === "Kapacita" || c === "Rozhodnutie" || c === "Zápis" ? "blue" : "orange";  // „Zmena" padá do orange — je to výstraha, nie informácia

const TRAINER_OPTS = [
  { value: "all", label: "Obaja" },
  { value: "Jerry", label: "Jerry" },
  { value: "Terezka", label: "Terezka" },
];

function TrainerPills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.textMuted }}>Tréner:</span>
      {TRAINER_OPTS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: `1px solid ${value === o.value ? C.accent : C.border}`,
            background: value === o.value ? C.accentBg : "transparent",
            color: value === o.value ? C.accentLight : C.textMuted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Reorderable dashboard layout (persisted in localStorage) ──────────────────
// Karty sú zoskupené do štyroch sekcií — štyri otázky pilota: máme peniaze?
// nezabíjame sa? rastú klienti? funguje prílev? Sekcia je vlastnosť karty,
// nie poradia — presúvanie a skrývanie (⠿) funguje ďalej, ale karta zostáva
// vo svojej sekcii. Kotvy vedľa prepínača trénerov na sekciu zrolujú.
//
// Katalóg všetkých grafov (aj tých, ktoré sa kreslia v DashGrafy.tsx) žije
// tam — tu sa len skladá to, čo je zapnuté.
// Preč odtiaľto šli aj „Ø tempo klienta" a „Ø dôvera obnovy". Priemer cez
// všetkých klientov neriadi nič — tempo aj dôvera majú zmysel pri konkrétnom
// človeku a tam obe sú, vo Financie → Predikcia. Na displeji zaberali miesto
// číslu, ktoré sa nedá použiť.
// Trend typov sedení a donut balíčkov tu boli tiež — a boli to presné kópie
// grafov z Tréningov → Analýza a z Klientov. Dashboard odpovedá na „čo sa deje
// teraz": tento týždeň, kapacita, peniaze tento mesiac, komu sa končí balíček.
// „Ako sa za rok menil pomer typov sedení" je analýza a patrí tam, kde sa s ňou
// dá pracovať — nie dvakrát, zakaždým s trochu iným filtrom.
// „register" a „asistent" tu zámerne nie sú. Register je pripnutý nad celým
// dashboardom — je to výstražný panel, nie kartička, ktorú si človek omylom
// presunie na koniec alebo skryje. Inline chat zmizol úplne: Jarvis je stále
// o klik ďaleko cez plávajúce tlačidlo a dve okná toho istého chatu vedľa seba
// boli len dve miesta, kde hľadať tú istú konverzáciu.
const DEFAULT_ORDER = WIDGETS.map((w) => w.id);
const DEFAULT_WIDTH: Record<string, number> = Object.fromEntries(WIDGETS.map((w) => [w.id, w.span]));
/** Vypnuté hneď po inštalácii = všetko, čo nie je vo východzej zostave. */
const DEFAULT_HIDDEN = WIDGETS.filter((w) => !w.vychodzi).map((w) => w.id);
const ORDER_KEY = "psb-dash-order";
const HIDDEN_KEY = "psb-dash-hidden";
const WIDTH_KEY = "psb-dash-width";
const KNOWN_KEY = "psb-dash-known";
const KPI_KEY = "psb-dash-kpi";

function useDashLayout() {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<string[]>(DEFAULT_HIDDEN);
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTH);
  /** Jednotlivé KPI riadky, ktoré si človek z karty odškrtol. */
  const [kpiSkryte, setKpiSkryte] = useState<string[]>([]);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
      if (Array.isArray(o)) {
        const known = o.filter((id: string) => DEFAULT_ORDER.includes(id));
        // Append any widget added in a later version that the saved order predates.
        setOrder([...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))]);
      }
      // Graf, ktorý appka pozná až od dnešnej verzie, sa nesmie objaviť sám —
      // inak by po nasadení knižnice vyskočilo na dashboard dvadsať nových
      // kariet. Preto zoznam „už videných" ID: čo v ňom nie je a nie je vo
      // východzej zostave, sa pridá medzi vypnuté a od tej chvíle si to riadi
      // človek. (Bez uloženého zoznamu = prvý štart → východzia zostava.)
      const videne: string[] = JSON.parse(localStorage.getItem(KNOWN_KEY) || "null") || [];
      const h = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "null");
      const ulozeneHidden: string[] = Array.isArray(h) ? h.filter((id: string) => DEFAULT_ORDER.includes(id)) : [];
      const nove = DEFAULT_ORDER.filter((id) => !videne.includes(id) && !VYCHODZIE.has(id) && !ulozeneHidden.includes(id));
      // Prvé spustenie (nič uložené) berie východzie skryté; inak sa k uloženým
      // pridajú len tie naozaj nové. Výsledok sa MUSÍ uložiť spolu so zoznamom
      // známych ID — inak by pri ďalšom otvorení bolo „všetko už videné" proti
      // prázdnemu zoznamu skrytých a dashboard by sa zaplnil všetkými grafmi.
      const dalej = Array.isArray(h) || videne.length ? [...ulozeneHidden, ...nove] : DEFAULT_HIDDEN;
      setHidden(dalej);
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(dalej));
      localStorage.setItem(KNOWN_KEY, JSON.stringify(DEFAULT_ORDER));

      const kp = JSON.parse(localStorage.getItem(KPI_KEY) || "null");
      if (Array.isArray(kp)) setKpiSkryte(kp);

      const w = JSON.parse(localStorage.getItem(WIDTH_KEY) || "null");
      if (w && typeof w === "object") {
        const merged: Record<string, number> = { ...DEFAULT_WIDTH };
        for (const id of DEFAULT_ORDER) if (w[id] === 1 || w[id] === 2) merged[id] = w[id];
        setWidths(merged);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistOrder = (o: string[]) => {
    setOrder(o);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(o));
    } catch {
      /* ignore */
    }
  };
  // Berie aj funkciu, nie len hodnotu. Dva klikni-hneď-po-sebe (napr. „všetko"
  // vo viacerých sekciách) by inak obidva vychádzali z toho istého starého
  // zoznamu a druhý by prvý prepísal — presne to isté, čo kedysi zožralo
  // rýchle zápisy v client_overrides.
  const persistHidden = (h: string[] | ((p: string[]) => string[])) => {
    setHidden((prev) => {
      const next = typeof h === "function" ? h(prev) : h;
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const persistWidths = (w: Record<string, number>) => {
    setWidths(w);
    try {
      localStorage.setItem(WIDTH_KEY, JSON.stringify(w));
    } catch {
      /* ignore */
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persistOrder(next);
  };
  const dropOn = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    const next = order.filter((x) => x !== dragId);
    const at = next.indexOf(targetId);
    next.splice(at, 0, dragId);
    persistOrder(next);
  };
  const toggleHide = (id: string) =>
    persistHidden((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  /** Zapnúť/vypnúť celú sekciu naraz — z knižnice grafov. */
  const sekciaVsetko = (sekcia: SekciaId, zapnut: boolean) => {
    const ids = WIDGETS.filter((w) => w.sekcia === sekcia).map((w) => w.id);
    persistHidden((p) => (zapnut ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]));
  };
  const setWidth = (id: string, w: 1 | 2) => persistWidths({ ...widths, [id]: w });
  const toggleKpi = (id: string) =>
    setKpiSkryte((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      try {
        localStorage.setItem(KPI_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  const reset = () => {
    persistOrder(DEFAULT_ORDER);
    persistHidden(DEFAULT_HIDDEN);
    persistWidths(DEFAULT_WIDTH);
    setKpiSkryte([]);
    try {
      localStorage.removeItem(KPI_KEY);
    } catch {
      /* ignore */
    }
  };

  return { order, hidden, widths, kpiSkryte, move, dropOn, toggleHide, sekciaVsetko, setWidth, toggleKpi, reset };
}

// 2 columns on wide screens, 1 on narrow — inline styles can't hold media queries.
function useDashColumns() {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setCols(mq.matches ? 1 : 2);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return cols;
}

// Telefón. Nie je to to isté ako „jeden stĺpec": na 375 px má dashboard aj po
// zúžení cez dva metre výšky a človek sa k registru hore vráti len scrollovaním
// späť. Preto sa na telefóne grafy zbalia a rozbalia sa klikom — čísla a
// signály zostanú, tvary si vyžiada ten, kto ich chce.
function useTelefon() {
  const [je, setJe] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 560px)");
    const apply = () => setJe(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return je;
}

/** Na telefóne sa graf skryje za klik; na väčšom displeji sa nič nemení. */
function Zbalitelny({ telefon, popis, children }: { telefon: boolean; popis: string; children: ReactNode }) {
  const [otvorene, setOtvorene] = useState(false);
  if (!telefon) return <>{children}</>;
  if (otvorene) return <>{children}</>;
  return (
    <button
      onClick={() => setOtvorene(true)}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 9, cursor: "pointer",
        border: `1px dashed ${mix(C.accent, 35)}`, background: "transparent",
        color: C.textMuted, fontSize: 12, textAlign: "left",
      }}
    >
      {popis} — <span style={{ color: C.accentLight }}>ukázať graf</span>
    </button>
  );
}

// Wrapper that gives a widget its grid span and, in arrange mode, the drag/move/hide chrome.
function WidgetShell({
  meta,
  cols,
  arranging,
  isHidden,
  layout,
  children,
}: {
  meta: WidgetMeta;
  cols: number;
  arranging: boolean;
  isHidden: boolean;
  layout: ReturnType<typeof useDashLayout>;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const storedW = layout.widths[meta.id] ?? meta.span;
  const span = Math.min(storedW, cols);
  // Grid gap handles spacing; the item stretches to its row height (equal-height rows).
  // noStretch widgets (register, chat) size to their own content instead of
  // filling the row height — so an empty register collapses to its header.
  const wrap: CSSProperties = { gridColumn: `span ${span}`, minWidth: 0, display: "flex", flexDirection: "column", alignSelf: meta.noStretch ? "start" : undefined };

  if (!arranging) return <div style={wrap}>{children}</div>;

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", meta.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) layout.dropOn(id, meta.id); }}
      style={{
        ...wrap,
        border: `2px dashed ${over ? C.accent : mix(C.accent, 30)}`,
        borderRadius: 12,
        padding: 6,
        background: over ? C.accentBg : "transparent",
        opacity: isHidden ? 0.45 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "2px 4px" }}>
        <span style={{ cursor: "grab", color: C.textDim, fontSize: 15, lineHeight: 1 }} title="Ťahaj myšou">⠿</span>
        <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{meta.label}</span>
        {cols > 1 && (
          <button
            onClick={() => layout.setWidth(meta.id, storedW === 2 ? 1 : 2)}
            title={storedW === 2 ? "Zúžiť na 1 stĺpec" : "Rozšíriť na 2 stĺpce"}
            style={{ ...arrBtn, minWidth: 34 }}
          >
            {storedW === 2 ? "▭▭" : "▭"}
          </button>
        )}
        <button onClick={() => layout.move(meta.id, -1)} title="Posunúť vyššie" style={arrBtn}>↑</button>
        <button onClick={() => layout.move(meta.id, 1)} title="Posunúť nižšie" style={arrBtn}>↓</button>
        <button onClick={() => layout.toggleHide(meta.id)} title={isHidden ? "Zobraziť" : "Skryť"} style={{ ...arrBtn, color: isHidden ? C.textDim : C.accentLight }}>
          {isHidden ? "🚫" : "👁"}
        </button>
      </div>
      <div style={{ pointerEvents: "none", flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

const arrBtn: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.textMuted,
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
  padding: "4px 7px",
};

export function Dashboard({
  data,
  clients,
  register: registerVsetky,
  sixM,
  capacity,
  actions,
  onNavigate,
  assistantChat,
  onClientClick,
  trainer,
  onTrainer,
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  register: RegisterItem[];
  sixM: SixMRow[];
  capacity: CapacityRow[];
  actions: Actions;
  onNavigate: (tab: string, sub?: string, focus?: NavFocus) => void;
  assistantChat: AssistantChat;
  onClientClick: (name: string) => void;
  trainer: string;
  onTrainer: (t: string) => void;
}) {
  const [showAcked, setShowAcked] = useState(false);
  const [registerExpanded, setRegisterExpanded] = useState(false);
  // "prijate" = cash received (= PTminder "Payments" / tržby) — the default; "vyfakturovane" = value of trained sessions.
  const [earnMode, setEarnMode] = useState<"vyfakturovane" | "prijate">("prijate");
  const [arranging, setArranging] = useState(false);
  const [kniznica, setKniznica] = useState(false);
  const layout = useDashLayout();
  const cols = useDashColumns();
  const telefon = useTelefon();
  const matchT = (t: string) => trainer === "all" || t === trainer;

  // Zdravá zóna pre zvoleného trénera: pri „Obaja" je to dvojnásobok, lebo
  // karta sčítava oboch.
  const zonaLo = trainer === "all" ? ZONE_LO * 2 : ZONE_LO;
  const zonaHi = trainer === "all" ? ZONE_HI * 2 : ZONE_HI;

  const stats = useMemo(() => {
    const list = Object.values(clients);
    // "Aktívny" = everyone except Neaktívny (matches the Klienti tab count).
    const active = list.filter((c) => c.status !== "Neaktívny" && matchT(c.primaryTrainer)).length;
    const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
    const lastWeek = weeks[weeks.length - 1];
    const weekHours = data.sessions
      .filter((s) => weekKey(s.date) === lastWeek && matchT(s.sessionTrainer))
      .reduce((a, s) => a + s.duration / 60, 0);
    const months = monthlyFinance(data);
    const lastMonth = months[months.length - 1];
    // Tržba = peniaz, ktorý prišiel. Doteraz tu bolo `revenue` — hodnota
    // odtrénovaných sedení — pod nálepkou „Zárobky". To je iné číslo a Jerry
    // sleduje tržby: čo prišlo na účet, nie čo sa odpracovalo. Tržby sa navyše
    // nedelia na trénera (platba v PTminderi trénera nemá), takže prepínač
    // trénera na tejto karte nič nerobí a nemá predstierať, že áno.
    const monthCash = lastMonth ? lastMonth.cash : 0;
    const sixMCount = sixM.filter((c) => matchT(c.primaryTrainer)).length;
    return { active, weekHours, lastWeek, monthCash, lastMonth: lastMonth?.month, sixMCount };
  }, [clients, data, sixM, trainer]);

  // Zisk za posledný mesiac, ktorý má kompletný P&L — teda aj náklady.
  // Tržby za júl máme, ale náklady prídu až s Fio; ukázať „zisk" bez nich by
  // znamenalo vydávať tržbu za zisk. Preto sa berie posledný mesiac VZAS a
  // v popisku je jeho meno, nech je jasné, o ktorom mesiaci karta hovorí.
  // Pred výpočtom sa do VZAS pretlačia živé tržby (idempotentné).
  const zisk = useMemo(() => {
    const cash: Record<string, number> = {};
    for (const m of monthlyFinance(data)) cash[m.month] = m.cash;
    nastavPrijmyZTrackera(cash);
    const p = pnlCalc();
    // Posledný mesiac, o ktorom appka niečo vie — nie posledný v zozname.
    // Mesiace rastú dopredu, takže ten posledný býva prázdny.
    const i = poslednyMesiacSDatami();
    return { mesiac: VZAS_MONTHS[i] as string, v: p.hrubyZisk[i] };
    // `vzasVerzia()` je tu zámerne: model sa mení mimo Reactu (import z banky),
    // takže bez nej by dlaždica ukazovala zisk spočítaný pred načítaním nákladov.
  }, [data, vzasVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rast a strata v malom — Ø príchody/odchody za rok + posledné mesiace.
  // Odchod „dozrieva": posledné ~2 mesiace sa ešte nedá povedať, kto odišiel,
  // preto sa tam namiesto nuly ukazuje „?" — nula by klamala smerom k dobrému.
  const toky = useMemo(() => {
    const t = tokyKlientov(data, clients);
    const bezici = new Date().toISOString().slice(0, 7);
    const zrele = t.kotva ? new Date(Date.parse(t.kotva) - 60 * 86400000).toISOString().slice(0, 7) : bezici;
    const posledne = t.mesacne.filter(([mk]) => mk < bezici).slice(-3)
      .map(([mk, v]) => ({ mk, prislo: v.prislo, odislo: mk < zrele ? v.odislo : null }));
    return { prisloMes: t.prisloMes, odisloMes: t.odisloMes, posledne };
  }, [data, clients]);

  // Lievik bežiaceho mesiaca: dopyty → úvodné → noví klienti. Zámerne bežiaci
  // mesiac (nie uzavretý) — toto je prístroj na sledovanie prílevu v reálnom
  // čase, od septembra hlavný displej pre reklamu.
  const lievikMes = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    const dopyty = (data.leads || []).filter((l) => (l.date || "").slice(0, 7) === mes);
    const zdroje = new Map<string, number>();
    for (const l of dopyty) zdroje.set(l.source, (zdroje.get(l.source) || 0) + 1);
    const uvodne = new Set(data.sessions.filter((s) => s.sessionType === "UVODNE" && s.date.slice(0, 7) === mes).map((s) => s.client)).size;
    const novi = Object.values(clients).filter((c) => (c.firstSession || "").slice(0, 7) === mes).length;
    // Nula úvodných môže znamenať dve úplne odlišné veci: nikto neprišiel, alebo
    // sa mesiac ešte nenahral. Bez tohto rozdielu je karta v prvých dňoch mesiaca
    // vždy „katastrofa", a človek ju prestane brať vážne práve vtedy, keď má.
    const kotva = data.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
    const bezDat = !!kotva && kotva.slice(0, 7) < mes;
    return { mes, dopyty: dopyty.length, zdroje: [...zdroje.entries()].sort((a, b) => b[1] - a[1]), uvodne, novi, bezDat, kotva };
  }, [data, clients]);

  // Predikcia tržieb na najbližší mesiac — podľa Jerryho „to najdôležitejšie
  // číslo, aké appka počíta". Doteraz bola schovaná vo Financiách → Predikcia a
  // na dashboarde nebola vôbec.
  const trzbyOdhad = useMemo(() => {
    const cash = predictCash(data, clients, 1);
    return cash.months[0] || null;
  }, [data, clients]);

  // All weeks (chronological) — the chart scrolls horizontally.
  const weekRows = useMemo(() => {
    const map: Record<string, { Jerry: number; Terezka: number; iny: number }> = {};
    for (const s of data.sessions) {
      const k = weekKey(s.date);
      const e = (map[k] ||= { Jerry: 0, Terezka: 0, iny: 0 });
      if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
      else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
      // Matyáš odtrénoval 89 hodín (jan–aug 2025). Padali mimo grafu, hoci inde
      // v appke sa počítajú — pri „Obaja" tak chýbala celá jedna tretia osoba.
      else e.iny += s.duration / 60;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.sessions]);

  const weeklyHours = useMemo(() => {
    const maIneho = weekRows.some(([, v]) => v.iny > 0);
    const series = trainer === "all"
      ? [
          { name: "Jerry", color: C.accent },
          { name: "Terezka", color: C.accentLight },
          ...(maIneho ? [{ name: "Matyáš", color: C.textDim }] : []),
        ]
      : [{ name: trainer, color: C.accent }];
    return {
      series,
      data: weekRows.map(([k, v]) => ({
        label: weekLabel(k),
        values: trainer === "all"
          ? (maIneho ? [v.Jerry, v.Terezka, v.iny] : [v.Jerry, v.Terezka])
          : [trainer === "Jerry" ? v.Jerry : v.Terezka],
      })),
    };
  }, [weekRows, trainer]);

  // Ø / max / min weekly hours (basis follows the trainer pill: "all" = PSB total per week).
  const weekStats = useMemo(() => {
    const pts = weekRows
      .map(([k, v]) => ({
        label: weekLabel(k),
        h: trainer === "all" ? v.Jerry + v.Terezka + v.iny : trainer === "Jerry" ? v.Jerry : v.Terezka,
      }))
      .filter((p) => p.h > 0);
    if (!pts.length) return null;
    let max = pts[0], min = pts[0];
    let sum = 0;
    for (const p of pts) {
      sum += p.h;
      if (p.h > max.h) max = p;
      if (p.h < min.h) min = p;
    }
    return { avg: sum / pts.length, max, min, n: pts.length };
  }, [weekRows, trainer]);

  // Priemerné týždenné hodiny každého trénera zvlášť — počíta sa len z týždňov,
  // v ktorých daný tréner naozaj trénoval, inak by dovolenka jedného stiahla
  // priemer druhého.
  const podlaTrenera = useMemo(() => {
    const out = { Jerry: 0, Terezka: 0 } as Record<string, number>;
    for (const t of ["Jerry", "Terezka"] as const) {
      const h = weekRows.map(([, v]) => v[t]).filter((x) => x > 0);
      out[t] = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
    }
    return out;
  }, [weekRows]);

  // Kliknutie na kartu trénera prepne globálny filter — je to najrýchlejšia
  // cesta z „koľko kto odrobil" na „a čo z toho vyplýva".
  const setTrainerLocal = (t: string) => onTrainer(t);

  // How many trainer-weeks landed in / below / above the healthy zone.
  const zones = useMemo(() => {
    let zdrava = 0, pod = 0, nad = 0;
    const trainers = trainer === "all" ? (["Jerry", "Terezka"] as const) : [trainer];
    for (const [, v] of weekRows) {
      for (const t of trainers) {
        const h = (v as Record<string, number>)[t];
        if (!h) continue;
        if (h >= ZONE_LO && h <= ZONE_HI) zdrava++;
        else if (h < ZONE_LO) pod++;
        else nad++;
      }
    }
    return { zdrava, pod, nad, total: zdrava + pod + nad };
  }, [weekRows, trainer]);

  // Value of a month in the chosen earnings mode. "prijate" (cash) is studio-level
  // (payments aren't attributed to a trainer), so it ignores the trainer pill.
  const monthVal = (m: FinanceMonth) =>
    earnMode === "prijate" ? m.cash : trainer === "all" ? m.revenue : m.byTrainer[trainer]?.revenue || 0;

  const earnings = useMemo(() => {
    const months = monthlyFinance(data); // all months, from Sep 2025 — chart scrolls
    const bars: { label: string; value: number; forecast?: boolean }[] = months.map((m) => ({ label: monthLabel(m.month), value: monthVal(m) }));
    const pred = predictEarnings(data, clients, { excludeSpecial: false });
    const next2 = pred.months.slice(0, 1);
    if (earnMode === "prijate") {
      // Tržby chodia, keď niekomu skončí členstvo a kúpi si ďalšie — nie
      // rovnomerne. Priemer posledných mesiacov to rozmazal na plocho.
      // Jeden mesiac dopredu, nie dva — rovnako ako na obrazovke Predikcia.
      // Druhý stĺpec bol z väčšej časti dohad o obnovách, ktoré sa ešte nestali.
      const cash = predictCash(data, clients, 1);
      for (const cm of cash.months) bars.push({ label: monthLabel(cm.month), value: cm.expected, forecast: true });
    } else if (trainer === "all") {
      // Vyfakturované forecast = run-rate model (only for both trainers combined).
      for (const pm of next2) bars.push({ label: monthLabel(pm.month), value: Math.round(pm.guaranteed + pm.expected), forecast: true });
    }
    return bars;
  }, [data, clients, trainer, earnMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ø / max / min monthly earnings over ACTUAL months (forecast excluded), following the trainer pill + mode.
  const earningStats = useMemo(() => {
    const pts = monthlyFinance(data)
      .map((m) => ({ key: m.month, label: monthLabel(m.month), v: monthVal(m) }))
      .filter((p) => p.v > 0);
    if (!pts.length) return null;
    let max = pts[0], min = pts[0];
    let sum = 0;
    for (const p of pts) {
      sum += p.v;
      if (p.v > max.v) max = p;
      if (p.v < min.v) min = p;
    }
    return { avg: sum / pts.length, max, min, n: pts.length };
  }, [data, trainer, earnMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const sixMPhases = useMemo(() => {
    const f = sixM.filter((c) => matchT(c.primaryTrainer));
    const n = (p: string) => f.filter((c) => c.phase === p).length;
    return { total: f.length, data: [
      { label: "Obnova (1–6)", value: n("Obnova"), color: C.green },
      { label: "Integrácia (7–18)", value: n("Integrácia"), color: C.orange },
      { label: "Udržateľnosť (19+)", value: n("Udržateľnosť"), color: C.bark },
    ] };
  }, [sixM, trainer]);

  // Register sa riadi prepínačom trénera. Predtým ukazoval všetkých 33
  // upozornení bez ohľadu na to, koho si vybral — pri dvoch tréneroch to
  // znamená, že polovica z toho nie je tvoja starosť.
  //
  // Položka bez klienta (kapacita, zápisy) zostáva vždy: kapacita jedného
  // trénera sa týka oboch a pripomienka zápisu tiež.
  const patriTrenerovi = (r: RegisterItem) => {
    if (trainer === "all") return true;
    if (r.category === "Kapacita") return r.title.startsWith(trainer);
    if (!r.client) return true;
    const c = clients[r.client];
    return !c || c.primaryTrainer === trainer;
  };
  const register = registerVsetky.filter(patriTrenerovi);
  const open = register.filter((r) => !r.acked);
  const acked = register.filter((r) => r.acked);
  // "Ukázať skryté" swaps to the hidden/accepted items only (so it's obvious they appeared).
  const visible = showAcked ? acked : open;

  // Click-through helpers: focus one week in Tréningy → Prehľad / one month in Financie → Zárobky.
  const openWeek = (weekLabelStr: string) => onNavigate("treningy", "prehled", { week: weekLabelStr, trainer, nonce: Date.now() });
  const openMonth = (monthKey: string) => onNavigate("financie", undefined, { month: monthKey, trainer, nonce: Date.now() });

  // Widget bodies, keyed by id — rendered in the user's saved order below.
  // Clients down to their last session (or 0) on their active package — renewal cues.
  // Balíček sa končí dvoma spôsobmi a doteraz sme videli len jeden.
  //
  // Hodiny dôjdu (0/6) — to karta ukazovala. Ale členstvo má aj PLATNOSŤ a tá
  // vyprší nezávisle od toho, koľko hodín zostalo: klient s 3/6 hodinami, ktorému
  // o týždeň končí členstvo, potrebuje ozvanie rovnako naliehavo — a v starej
  // karte nebol. Naopak človek, ktorý si práve dokúpil ďalší balíček, tam ostával
  // svietiť na 0/6, hoci už dávno nič nekončí.
  //
  // Preto teraz: došli hodiny ALEBO platnosť končí do 21 dní. Dvadsaťjeden dní
  // preto, že členstvá sa obnovujú na mesiac — kratšie okno by nedávalo čas sa
  // ozvať, dlhšie by kartu zaplavilo ľuďmi, ktorí ešte majú pokoj.
  const packageEnding = useMemo(() => {
    const dnes = new Date().toISOString().slice(0, 10);
    const dni = (d: string) => Math.round((Date.parse(d) - Date.parse(dnes)) / 86400000);
    const ack = data.anomalyAck || {};
    return Object.values(clients)
      .filter((c) => c.status !== "Neaktívny" && c.status !== "Pauza" && matchT(c.primaryTrainer))
      .filter((c) => !ack[`balicek|${c.name}`])
      // Klient, ktorý má v exporte len doplnky k paušálnemu členstvu, tu nemá
      // čo robiť — jeho „0 z 3" nie je dochodený balíček, ale dokúpená hodina
      // spred roka. Toto samo o sebe brali 40 zo 73 klientov.
      .filter((c) => !c.lenDoplnky)
      .map((c) => {
        const doKonca = c.packageValidTo ? dni(c.packageValidTo) : null;
        // Prah podľa toho, ako často klient reálne chodí.
        //
        // Anna Kadličkova chodí raz za týždeň. Pri prahu „zostávajú 3 hodiny"
        // by na ňu karta svietila tri týždne — a to je presne to, čo z 33
        // upozornení robí tapetu. Kto chodí častejšie než raz týždenne, minie
        // dve hodiny za týždeň, takže má zmysel ozvať sa pri dvoch. Kto chodí
        // menej často, má zmysel až pri poslednej.
        // Frekvencia z POSLEDNÝCH 8 TÝŽDŇOV, nie za celý život klienta.
        //
        // Anna Kadličkova má za 47 týždňov 38 sedení, čo je 0,81 týždenne — lenže
        // v tom priemere sú Vianoce, dovolenka aj rozbeh. Posledné mesiace chodí
        // raz týždenne a podľa toho sa má počítať, či zostávajúce hodiny stihne
        // minúť. Celoživotný priemer podhodnotí tempo a appka potom hlási stratu
        // hodín tam, kde žiadna nebude.
        const odkedy = Date.parse(dnes) - 8 * 7 * 86400000;
        const nedavne = c.sessions.filter((x) => Date.parse(x.date) >= odkedy).length;
        const tyzdnov = c.firstSession && c.lastSession
          ? Math.max(1, (Date.parse(c.lastSession) - Date.parse(c.firstSession)) / 604800000)
          : 1;
        // Klient s krátkou históriou nemá dosť nedávnych dát — vtedy platí celoživotný priemer.
        const frekvencia = tyzdnov >= 8 ? nedavne / 8 : c.sessionCount / tyzdnov;
        const prah = frekvencia > 1 ? 2 : 1;
        const hodinyDosli = c.packageTotal > 0 && c.packageRemaining <= prah;
        // Platnosť sa hlási len vtedy, keď z nej niečo VYPLÝVA.
        //
        // Anna Kadličkova má 3 hodiny a členstvo do 24. 8. Pri jednom tréningu
        // týždenne ich do vtedy stihne minúť — nič sa nedeje a upozornenie je
        // šum. Klient s piatimi hodinami a desiatimi dňami ich nestihne a o tri
        // hodiny príde; to je vec, o ktorej treba vedieť.
        //
        // Posledný týždeň sa hlási vždy, bez ohľadu na hodiny: koniec členstva
        // je sám o sebe moment, kedy sa rieši ďalší balíček.
        const tyzdnovDoKonca = doKonca !== null ? doKonca / 7 : 0;
        // Tolerancia jednej hodiny: prísť o pol hodiny nie je dôvod na
        // upozornenie, prísť o dve je.
        const stihneMinut = frekvencia > 0
          ? frekvencia * tyzdnovDoKonca >= c.packageRemaining - 1
          : false;
        const platnostKonci =
          doKonca !== null && doKonca > -60 &&
          (doKonca <= 7 || (doKonca <= 21 && !stihneMinut));
        return { c, doKonca, hodinyDosli, platnostKonci, prah, frekvencia };
      })
      .filter((x) => x.hodinyDosli || x.platnostKonci)
      // Najprv došlé hodiny (predaj, ktorý sa dá spraviť dnes), potom končiace
      // členstvá; v rámci skupiny podľa naliehavosti. Jeden porovnávač, nie dva
      // reťazené — dva by sa prebili a zoradilo by to presne naopak.
      .sort((a, b) => {
        if (a.hodinyDosli !== b.hodinyDosli) return a.hodinyDosli ? -1 : 1;
        const ka = a.doKonca ?? (a.c.packageRemaining <= 0 ? -1 : 21);
        const kb = b.doKonca ?? (b.c.packageRemaining <= 0 ? -1 : 21);
        return ka - kb || a.c.name.localeCompare(b.c.name);
      });
  }, [clients, trainer, data.anomalyAck]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mená, ktoré si niekto odložil — aby sa dali vrátiť jedným klikom.
  const odlozene = Object.keys(data.anomalyAck || {})
    .filter((k) => k.startsWith("balicek|"))
    .map((k) => k.slice("balicek|".length));

  // Grafy z knižnice — kreslia sa v DashGrafy.tsx a dáta z API si ťahajú len
  // tie, ktoré sú práve zapnuté.
  const aktivne = useMemo(
    () => new Set(WIDGETS.map((w) => w.id).filter((id) => !layout.hidden.includes(id))),
    [layout.hidden],
  );
  const extraNodes = useExtraGrafy({ data, clients, aktivne, onNavigate, kpiSkryte: layout.kpiSkryte });

  const nodes: Record<string, ReactNode> = {
    ...extraNodes,
    hodiny: (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3>
          <Info text="Odtrénované hodiny za týždeň. Otvára sa na najnovšom týždni — posúvaj doľava do minulosti. Zelené pásmo 24–34h je zdravá zóna na jedného trénera." label="Odrobené hodiny / týždeň" />
        </H3>
        {weeklyHours.data.length ? (
          <div onClick={() => onNavigate("treningy", "prehled")} style={{ cursor: "pointer" }} title="Otvoriť Tréningy → Prehľad">
            <Zbalitelny telefon={telefon} popis={`${weeklyHours.data.length} týždňov`}>
              <ZoneBars data={weeklyHours.data} series={weeklyHours.series} zone={{ lo: ZONE_LO, hi: ZONE_HI }} height={116} alignEnd />
            </Zbalitelny>
          </div>
        ) : (
          <Empty>Nahraj Payroll by Session.</Empty>
        )}
        {weekStats && (
          // Pri „Obaja" hovorí max a min o štúdiu ako celku a nedá sa s tým nič
          // spraviť — užitočnejšie je, ako sa tá práca delí medzi dvoch ľudí.
          // Keď je vybraný jeden tréner, delenie nemá zmysel a vracia sa max/min,
          // lebo vtedy je to jeho vlastný najťažší a najľahší týždeň.
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
            <MiniStat label={`Ø / týždeň (${weekStats.n})`} value={`${weekStats.avg.toFixed(1)}h`} onClick={() => onNavigate("treningy", "prehled")} />
            {trainer === "all" ? (
              <>
                <MiniStat label="Jerry · Ø / týždeň" value={`${podlaTrenera.Jerry.toFixed(1)}h`} color={C.accent} onClick={() => setTrainerLocal("Jerry")} />
                <MiniStat label="Terezka · Ø / týždeň" value={`${podlaTrenera.Terezka.toFixed(1)}h`} color={C.accentLight} onClick={() => setTrainerLocal("Terezka")} />
              </>
            ) : (
              <>
                <MiniStat label={`Max · ${weekStats.max.label}`} value={`${weekStats.max.h.toFixed(0)}h`} color={C.orange} onClick={() => openWeek(weekStats.max.label)} />
                <MiniStat label={`Min · ${weekStats.min.label}`} value={`${weekStats.min.h.toFixed(0)}h`} color={C.blue} onClick={() => openWeek(weekStats.min.label)} />
              </>
            )}
          </div>
        )}
      </Card>
    ),
    zony: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info text="Koľko trénerských týždňov padlo do zdravej zóny (24–34h), pod ňu alebo nad ňu — za celé obdobie." label="Týždne v zdravej zóne" />
        </H3>
        <div
          style={{ ...centerBody, cursor: zones.total ? "pointer" : "default" }}
          onClick={() => zones.total && onNavigate("treningy", "prehled")}
          title="Otvoriť Tréningy → Prehľad"
        >
          {zones.total ? (
            <Donut
              size={140}
              centerLabel={`${Math.round((zones.zdrava / zones.total) * 100)}%`}
              data={[
                { label: "Zdravá zóna", value: zones.zdrava, color: C.green },
                { label: "Pod zónou", value: zones.pod, color: C.red },
                { label: "Nad zónou", value: zones.nad, color: C.orange },
              ]}
            />
          ) : (
            <Empty>Nahraj Payroll by Session.</Empty>
          )}
        </div>
      </Card>
    ),
    kapacita: <CapacityCard capacity={capacity} trainer={trainer} onNavigate={onNavigate} />,
    "6m": (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info text="Rozdelenie 6M klientov podľa fázy procesu: Obnova (1.–6. mesiac), Integrácia (7.–18.), Udržateľnosť (19+). Mení sa podľa prepínača trénera hore." label="6M klienti podľa fázy" />
        </H3>
        <div
          style={{ ...centerBody, cursor: sixMPhases.total ? "pointer" : "default" }}
          onClick={() => sixMPhases.total && onNavigate("klienti", "6m")}
          title="Otvoriť Klienti → 6M proces"
        >
          {sixMPhases.total ? (
            <Donut size={140} centerLabel={String(sixMPhases.total)} data={sixMPhases.data} />
          ) : (
            <Empty>{trainer === "all" ? "Žiadni 6M klienti." : `${trainer} nemá 6M klientov.`}</Empty>
          )}
        </div>
      </Card>
    ),
    zarobky: (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <H3>
            <Info
              text={earnMode === "vyfakturovane"
                ? "VYFAKTUROVANÉ = hodnota odtrénovaných sedení za mesiac (Payroll by Session) — koľko si reálne odpracoval. Posledné 2 svetlé stĺpce (⌁) sú odhad. Priemer/max/min bez odhadu. POZOR: sú v tom aj Sofiine hodiny (barter proti Jarkovmu dlhu, ~2 600 Kč/mes), ktoré nie sú tržba — v „Prijaté“ správne nie sú. A posledné dni mesiaca bývajú neúplné: uzávierka je až prvý víkend nasledujúceho mesiaca."
                : "PRIJATÉ PLATBY (tržby) = peniaze reálne prijaté za mesiac (Payments Recorded) — presne to, čo vidíš v PTminderi ako Payments. Skáče, keď si niekto kúpi väčší balíček dopredu. Za celé štúdio (nedelí sa na trénera)."}
              label={earnMode === "prijate" ? "Mesačné tržby (prijaté)" : trainer === "all" ? "Mesačné zárobky + odhad" : `Mesačné zárobky — ${trainer}`}
            />
          </H3>
          <div style={{ display: "flex", gap: 3 }}>
            {([["vyfakturovane", "Vyfakturované"], ["prijate", "Prijaté (tržby)"]] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setEarnMode(id)} style={{ padding: "4px 9px", borderRadius: 7, border: `1px solid ${earnMode === id ? C.accent : C.border}`, background: earnMode === id ? C.accentBg : "transparent", color: earnMode === id ? C.accentLight : C.textMuted, fontSize: 10.5, cursor: "pointer", whiteSpace: "nowrap" }}>{lbl}</button>
            ))}
          </div>
        </div>
        {earnings.length ? (
          <div onClick={() => onNavigate("financie", "cashflow")} style={{ cursor: "pointer" }} title="Otvoriť Financie → Cashflow">
            <Zbalitelny telefon={telefon} popis={`${earnings.length} mesiacov`}>
              <ValueBars data={earnings} color={earnMode === "prijate" ? C.blue : C.accent} forecastColor={C.blue} fmt={(n) => `${Math.round(n / 1000)}k`} height={180} alignEnd />
            </Zbalitelny>
          </div>
        ) : <Empty>Nahraj Payroll.</Empty>}
        {earningStats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
            <MiniStat label={`Ø / mes. (${earningStats.n})`} value={`${Math.round(earningStats.avg / 1000)}k`} />
            <MiniStat label={`Max · ${earningStats.max.label}`} value={`${Math.round(earningStats.max.v / 1000)}k`} color={C.green} onClick={() => openMonth(earningStats.max.key)} />
            <MiniStat label={`Min · ${earningStats.min.label}`} value={`${Math.round(earningStats.min.v / 1000)}k`} color={C.orange} onClick={() => openMonth(earningStats.min.key)} />
          </div>
        )}
      </Card>
    ),
    rastStrata: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info
            text="Prišiel = prvé sedenie v mesiaci, odišiel = posledné sedenie a odvtedy ticho. Posledné ~2 mesiace odchod ešte „nedozrel“ — namiesto čísla je „?“, nula by klamala. Klik otvorí plnú verziu s menami."
            label="Rast a strata klientov"
          />
        </H3>
        <div style={{ ...centerBody, cursor: "pointer" }} onClick={() => onNavigate("klienti", "rast")} title="Otvoriť Klienti → Rast a strata">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Prišlo Ø / mes." value={`+${toky.prisloMes.toFixed(1)}`} color={C.green} />
            <MiniStat label="Odišlo Ø / mes." value={`−${toky.odisloMes.toFixed(1)}`} color={C.red} />
            <MiniStat
              label="Čistý rast / mes."
              value={`${toky.prisloMes - toky.odisloMes >= 0 ? "+" : ""}${(toky.prisloMes - toky.odisloMes).toFixed(1)}`}
              color={toky.prisloMes - toky.odisloMes >= 0 ? C.green : C.red}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            {toky.posledne.map((r) => (
              <div key={r.mk} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 2px", borderBottom: `1px solid ${mix(C.border, 40)}`, fontSize: 12 }}>
                <span style={{ color: C.textMuted, flex: 1 }}>{monthLabel(r.mk)}</span>
                <span style={{ color: C.green, fontVariantNumeric: "tabular-nums" }}>+{r.prislo}</span>
                <span style={{ color: r.odislo == null ? C.textDim : C.red, fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "right" }}>
                  {r.odislo == null ? "?" : `−${r.odislo}`}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>Mená a detail → Klienti → Rast a strata</div>
        </div>
      </Card>
    ),
    lievik: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info
            text="Prílev bežiaceho mesiaca: koľko dopytov prišlo, koľko ľudí bolo na úvodnom a koľko sa stalo klientmi (prvé sedenie tento mesiac). Zadanie z fluktuácie: ~6,3 nových mesačne = rast +3 klienti/rok. Klik otvorí plný lievik s konverziami a zdrojmi."
            label={`Lievik — ${monthLabel(lievikMes.mes)}`}
          />
        </H3>
        <div style={{ ...centerBody, cursor: "pointer" }} onClick={() => onNavigate("marketing", "lievik")} title="Otvoriť Marketing → Lievik">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Dopyty" value={String(lievikMes.dopyty)} color={C.blue} />
            <MiniStat label="Úvodné" value={lievikMes.bezDat ? "—" : String(lievikMes.uvodne)} color={C.accentLight} />
            <MiniStat label="Noví klienti" value={lievikMes.bezDat ? "—" : String(lievikMes.novi)} color={!lievikMes.bezDat && lievikMes.novi >= 6 ? C.green : undefined} />
          </div>
          {lievikMes.bezDat && (
            <div style={{ fontSize: 11, color: C.orange, marginTop: 8, lineHeight: 1.5 }}>
              Úvodné a noví klienti sa rátajú z PTmindera a ten je nahratý len do {fmtDMY(lievikMes.kotva)} — za tento mesiac zatiaľ nie sú dáta. Dopyty sú zapísané ručne, tie platia.
            </div>
          )}
          {lievikMes.zdroje.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
              {lievikMes.zdroje.map(([z, n]) => (
                <span key={z} style={{ fontSize: 11, color: C.textMuted, background: C.track, borderRadius: 12, padding: "3px 9px" }}>{z} {n}</span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Zadanie ~6,3 nových / mes. pre rast +3 za rok · mesiac ešte beží
          </div>
        </div>
      </Card>
    ),
    koniecBalicka: (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info text="Klienti, ktorým sa balíček končí. Prah sa riadi tým, ako často kto chodí: kto chodí viac než raz týždenne, objaví sa pri posledných dvoch hodinách (minie ich za týždeň), kto chodí menej, až pri poslednej — inak by na neho karta svietila tri týždne. Druhý dôvod je platnosť členstva do 21 dní. Platnosť je vlastný dátum z exportu a končí nezávisle od hodín: klient s 3/6 hodinami a členstvom do budúceho týždňa potrebuje ozvanie rovnako. Čas poslať ponuku na obnovu. Mení sa podľa prepínača trénera." label="Blíži sa koniec balíčka" />
        </H3>
        {odlozene.length > 0 && (
          <button
            onClick={() => odlozene.forEach((n) => actions.ackAnomaly(`balicek|${n}`, "", false))}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}
          >
            Vrátiť odložené ({odlozene.length})
          </button>
        )}
        </div>
        {packageEnding.length ? (
          <>
          {/* Dva dôvody, dva nadpisy. Predtým to bol jeden zoznam a človek
              čítal odznak „3/8" ako „zostávajú tri hodiny, prečo tu je?" —
              pritom Vaško je tam za končiace členstvo, nie za hodiny. */}
          {(["hodiny", "platnost"] as const).map((skupina) => {
            const riadky = packageEnding.filter((x) => (skupina === "hodiny" ? x.hodinyDosli : !x.hodinyDosli));
            if (!riadky.length) return null;
            return (
              <div key={skupina} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.textDim, margin: "2px 0 6px" }}>
                  {skupina === "hodiny"
                    ? `Došli hodiny — čas na ďalší balíček (${riadky.length})`
                    : `Končí platnosť členstva (${riadky.length})`}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
                  {riadky.map(({ c, doKonca, hodinyDosli, frekvencia }) => {
              const naliehave = (doKonca !== null && doKonca <= 7) || c.packageRemaining <= 0;
              // Dôvod má hovoriť, PREČO tu klient je. Predtým sa ukazovala
              // platnosť vždy, keď existoval dátum — aj u klienta s 0/6, ktorý
              // je v zozname kvôli dochodeným hodinám, nie kvôli členstvu.
              const dovod = hodinyDosli
                ? `zostáva ${c.packageRemaining} z ${c.packageTotal} — čas na ďalší balíček`
                : doKonca === null ? `${c.packageRemaining}/${c.packageTotal} hodín`
                : doKonca < 0 ? `platnosť vypršala ${fmtDMY(c.packageValidTo)}`
                : doKonca === 0 ? "platnosť končí dnes"
                : `platnosť do ${fmtDMY(c.packageValidTo)} · ${doKonca} ${doKonca < 5 ? "dni" : "dní"} · hodiny nestihne minúť`;
              return (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: mix(C.text, 4), border: `1px solid ${C.border}`, borderRadius: 9, width: "100%", minWidth: 0 }}>
                  <span style={{ ...badge(naliehave ? "red" : "orange"), fontSize: 10, flexShrink: 0 }}>
                    {c.packageTotal > 0 ? `${c.packageRemaining}/${c.packageTotal}` : "—"}
                  </span>
                  <button
                    onClick={() => onNavigate("klienti", undefined, { client: c.name, nonce: Date.now() })}
                    title={`${c.name} — ${c.membership || "—"} · ${c.primaryTrainer} · chodí ${frekvencia.toFixed(1)}× týždenne`}
                    style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: C.textDim, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {dovod}
                    </span>
                  </button>
                  {/* Odložiť, nie zmazať: klient, ktorý má pauzu alebo sa už
                      ozval, nemá svietiť — ale keď si kúpi ďalší balíček, karta
                      sa mu vráti sama. Vrátiť sa dá cez „Ukázať odložené". */}
                  <button
                    onClick={() => actions.ackAnomaly(`balicek|${c.name}`, "odložené z karty")}
                    title="Odložiť — už to riešim alebo má pauzu"
                    style={{ background: "none", border: "none", color: C.textDim, fontSize: 15, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              );
                  })}
                </div>
              </div>
            );
          })}
          </>
        ) : (
          <Empty>Nikomu sa balíček nekončí 🌿</Empty>
        )}
      </Card>
    ),
  };

  // Výstražný panel. Pripnutý nad všetkým a mimo mriežky widgetov: toto je
  // jediná vec na obrazovke, ktorá si pýta akciu, a nemá sa dať odsunúť na
  // koniec ani skryť.
  //
  // Keď je prázdny, nie je to karta s nadpisom a vetou — je to tenký tmavý pás
  // so zeleným bodom. Pokoj má vyzerať ako pokoj: v kokpite zhasnutá kontrolka
  // nezaberá pol palubovky.
  const registerPanel = visible.length === 0 && !showAcked ? (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        padding: "10px 14px", borderRadius: 10,
        background: mix(C.green, 6), border: `1px solid ${mix(C.green, 20)}`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flex: "0 0 auto" }} />
      <span style={{ fontSize: 12.5, color: C.textMuted }}>Nič nevyžaduje pozornosť.</span>
      {acked.length > 0 && (
        <button onClick={() => setShowAcked(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>
          Ukázať skryté ({acked.length})
        </button>
      )}
    </div>
  ) : (
    <Card style={{ marginBottom: 12 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <H3>
            <Info
              text="Zoznam vecí na akciu: 6M upozornenia, kapacita, klienti čo prestali chodiť, koniec pauzy. Skryť ich odstráni zo zoznamu (vieš ich vrátiť cez „Ukázať skryté“). Debatovať o nich vieš aj s AI asistentom."
              label={`Na čo sa pozrieť (${open.length})`}
            />
          </H3>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {visible.length > 3 && (
              <button onClick={() => setRegisterExpanded((v) => !v)} style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                {registerExpanded ? "Zbaliť" : `Rozbaliť všetky (${visible.length})`}
              </button>
            )}
            {(acked.length > 0 || showAcked) && (
              <button onClick={() => setShowAcked((v) => !v)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
                {showAcked ? "← Späť na aktívne" : `Ukázať skryté (${acked.length})`}
              </button>
            )}
          </div>
        </div>
        {visible.length ? (
          // Content-height, capped at ~3 rows then scrolls; grows only as items appear. Expanded: full list.
          <div style={registerExpanded ? { overflowY: "visible" } : { maxHeight: 192, overflowY: "auto", paddingRight: 2 }}>
            {visible.map((r) => <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} />)}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.textMuted, padding: "2px 2px 4px" }}>Žiadne skryté položky.</div>
        )}
    </Card>
  );

  const shown = arranging ? layout.order : layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <>
      {registerPanel}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <TrainerPills value={trainer} onChange={onTrainer} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {arranging && (
            <button onClick={layout.reset} style={{ ...btn("ghost"), fontSize: 12, padding: "6px 12px" }}>Obnoviť rozloženie</button>
          )}
          <button
            onClick={() => setKniznica(true)}
            title="Všetky grafy z celej appky — zapni si, čo chceš mať na ploche"
            style={{ ...btn("outline"), fontSize: 12, padding: "6px 14px" }}
          >
            ▦ Grafy <span style={{ color: C.textDim }}>{aktivne.size}/{WIDGETS.length}</span>
          </button>
          <button
            onClick={() => setArranging((v) => !v)}
            style={{
              ...btn(arranging ? "accent" : "outline"),
              fontSize: 12,
              padding: "6px 14px",
            }}
          >
            {arranging ? "Hotovo" : "⠿ Usporiadať"}
          </button>
        </div>
      </div>

      {/* Kotvy sekcií vo vlastnom riadku — klik zroluje, nič neprepína ani
          nefiltruje. Vedľa prepínača trénerov splývali s ním do jedného pásu,
          hoci robia niečo úplne iné. Sekcia, ktorá nemá zapnutý ani jeden graf,
          tu nie je — kotva do prázdna je len sklamanie. */}
      <div style={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", marginBottom: 12, paddingBottom: 2 }}>
        {SEKCIE.filter((s) => WIDGETS.some((w) => w.sekcia === s.id && !layout.hidden.includes(w.id))).map((s, i) => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span style={{ color: mix(C.textDim, 70), fontSize: 11, margin: "0 3px" }}>·</span>}
            <button
              onClick={() => document.getElementById(`sekcia-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              title={s.popis}
              style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12.5, cursor: "pointer", padding: "3px 7px" }}
            >
              {s.label}
            </button>
          </span>
        ))}
      </div>

      {kniznica && (
        <GrafyKniznica
          hidden={layout.hidden}
          onToggle={layout.toggleHide}
          onSekciaVsetko={layout.sekciaVsetko}
          onReset={layout.reset}
          onClose={() => setKniznica(false)}
          kpiSkryte={layout.kpiSkryte}
          onKpi={layout.toggleKpi}
        />
      )}

      {arranging && (
        <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: C.accentBg, border: `1px solid ${mix(C.accent, 33)}`, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          Ťahaj karty myšou alebo použi šípky <strong style={{ color: C.text }}>↑ ↓</strong>. Tlačidlom <strong style={{ color: C.text }}>▭ / ▭▭</strong> prepneš šírku karty (1 alebo 2 stĺpce) — široký graf zúž a vedľa neho daj malý. <strong style={{ color: C.text }}>👁</strong> kartu skryje. Karty v riadku sa výškovo zarovnajú a obsah vycentruje. Uloží sa v tomto prehliadači.
        </div>
      )}

      <StatGrid>
        <StatCard value={stats.active} label="Aktívnych klientov" onClick={() => onNavigate("klienti")} />
        <StatCard
          value={`${stats.weekHours.toFixed(0)}h`}
          label={stats.lastWeek ? `Odrobené (týž. ${weekLabel(stats.lastWeek)})` : "Týždenné hodiny"}
          // Farba znamená odchýlku, nie „toto je karta". Keď svietilo všetko,
          // nesvietilo nič — v kokpite je zelená rovnako informácia ako červená
          // len vtedy, keď nie je všade.
          color={
            stats.weekHours === 0 ? undefined
              : stats.weekHours < zonaLo ? C.orange
              : stats.weekHours > zonaHi ? C.red
              : undefined
          }
          onClick={() => onNavigate("treningy")}
        />
        <StatCard
          value={zisk ? fmtCZK(zisk.v) : "—"}
          label={zisk ? `Zisk ${monthLabel(zisk.mesiac)}` : "Zisk (čaká na P&L)"}
          color={zisk && zisk.v < 0 ? C.red : undefined}
          onClick={() => onNavigate("vzas")}
        />
        <StatCard
          value={trzbyOdhad ? fmtCZK(trzbyOdhad.expected) : "—"}
          label={trzbyOdhad ? `Odhad tržieb ${monthLabel(trzbyOdhad.month)}` : "Odhad tržieb"}
          color={C.blue}
          onClick={() => onNavigate("financie", "predikcia")}
        />
      </StatGrid>

      {SEKCIE.map((s) => {
        const ids = shown.filter((id) => WIDGETS.find((w) => w.id === id)?.sekcia === s.id);
        if (!ids.length) return null;
        return (
          // scrollMarginTop nechá pri zrolovaní hlavičku sekcie pod lepiacim headerom.
          <div key={s.id} id={`sekcia-${s.id}`} style={{ scrollMarginTop: 64, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: C.textDim }}>{s.label}</span>
              <div style={{ flex: 1, height: 1, background: mix(C.border, 55) }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoFlow: "row dense", gap: 12, alignItems: "stretch" }}>
              {ids.map((id) => {
                const meta = WIDGETS.find((w) => w.id === id);
                if (!meta) return null;
                return (
                  <WidgetShell key={id} meta={meta} cols={cols} arranging={arranging} isHidden={layout.hidden.includes(id)} layout={layout}>
                    {nodes[id]}
                  </WidgetShell>
                );
              })}
            </div>
          </div>
        );
      })}

    </>
  );
}

function CapacityCard({ capacity, trainer, onNavigate }: { capacity: CapacityRow[]; trainer: string; onNavigate: (t: string) => void }) {
  const jerry = capacity.find((c) => c.trainer === "Jerry");
  const terezka = capacity.find((c) => c.trainer === "Terezka");

  // Follows the trainer pill: Obaja = Spolu PSB, else the selected trainer.
  const BUSY = ZONE_HI; // 34h
  let name: string, clients: number, avg: number, busy: number, canTake: number, util: number;
  if (trainer === "all") {
    name = "Spolu (PSB)";
    clients = (jerry?.clients || 0) + (terezka?.clients || 0);
    avg = (jerry?.recentWeekly || 0) + (terezka?.recentWeekly || 0);
    busy = (jerry?.busyWeekly || 0) + (terezka?.busyWeekly || 0);
    canTake = (jerry?.canTake || 0) + (terezka?.canTake || 0);
    util = Math.round(Math.max(avg / (TARGET_H * 2), busy / (BUSY * 2)) * 100);
  } else {
    const c = trainer === "Jerry" ? jerry : terezka;
    name = trainer;
    clients = c?.clients || 0;
    avg = c?.recentWeekly || 0;
    busy = c?.busyWeekly || 0;
    canTake = c?.canTake || 0;
    util = c?.util || 0;
  }
  const color = util <= 100 ? C.green : util <= 113 ? C.orange : C.red;

  return (
    <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info
            text={`Vyťaženie z REÁLNYCH hodín – „dvojitý strop". Rastie sa, kým buď typický týždeň (priemer) nedosiahne ideál ${TARGET_H}h, ALEBO rušný týždeň (80. percentil, nie jednorazová špička) nenarazí na strop ${BUSY}h – čo príde skôr. 100 % = jeden z týchto stropov je naplnený. „Zvládne ešte N" = koľko priemerných klientov pridať do tohto stropu. Mení sa podľa prepínača trénera.`}
            label={`Kapacita & vyťaženie — ${name}`}
          />
        </H3>
        <button onClick={() => onNavigate("klienti")} style={{ ...linkBtn, fontSize: 12 }}>Detail →</button>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flex: 1, marginTop: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1 }}>{util.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>vyťaženie (ideál {trainer === "all" ? TARGET_H * 2 : TARGET_H}h)</div>
        </div>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMuted, marginBottom: 4 }}>
            <span>Klienti</span>
            <strong style={{ color: C.text }}>{clients}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMuted, marginBottom: 4 }}>
            <span>Typický / rušný týždeň</span>
            <strong style={{ color: C.text }}>{avg.toFixed(0)}h / {busy.toFixed(0)}h</strong>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: util >= 100 ? C.orange : C.accentLight }}>
            {util >= 100 ? "Na strope kapacity" : `Zvládne ešte ~${canTake} klientov`}
          </div>
        </div>
      </div>
    </Card>
  );
}

const linkBtn = { background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 12, padding: 0 } as const;

function RegisterRow({ item, actions, onNavigate }: { item: RegisterItem; actions: Actions; onNavigate: (tab: string, sub?: string, focus?: NavFocus) => void }) {
  const jump = item.category === "6M" ? "6m" : item.category === "Kapacita" ? "treningy" : "klienti";
  const jeRozhodnutie = item.category === "Rozhodnutie";
  // Pripomienka zápisu nesie cieľ v sebe (klient|tab|sub) — nemá klienta, má
  // miesto, kam sa ide písať.
  const zapisCiel = item.category === "Zápis" || item.category === "Zmena" ? (item.client || "").split("|") : null;
  const openItem = () =>
    zapisCiel
      ? onNavigate(zapisCiel[0], zapisCiel[1] || undefined)
      : onNavigate(jump, undefined, item.client ? { client: item.client, nonce: Date.now() } : undefined);
  // Otázka „je toto duch?" sa dá zodpovedať rovno tu. Odpoveď sa uloží ku
  // klientovi, takže sa už nepýta znova — a duchov konečne vieme spočítať.
  const jeOtazkaDuch = item.key.startsWith("duch|") && !!item.client;
  // Dve odpovede, lebo mesiac ticha má v praxi presne dva významy: buď klient
  // zmizol (duch), alebo je to dohodnutá prestávka. „Pauza" nastaví stav
  // klienta, čím sa stíšia aj ostatné upozornenia — nie je to len odškrtnutie.
  const odpovedzDuch = () => {
    if (!item.client) return;
    // Dátum v odpovedi viaže odpoveď na TÚTO epizódu ticha — keď sa klient
    // vráti a o rok znova stíchne, otázka sa položí znova.
    actions.setOverride(item.client, "duch" as never, `ano|${new Date().toISOString().slice(0, 10)}`);
    // A odpoveď spraví aj to, čo z nej vyplýva. Doteraz sa len zapísala: klient
    // zostal medzi aktívnymi, počítal sa do počtu klientov a jeho neminuté
    // hodiny visel v appke ako záväzok, ktorý nikto nevyužije. Potvrdiť ducha
    // a nechať ho v tabuľke aktívnych je to isté ako nepotvrdiť ho.
    //
    // Vrátiť sa to dá vždy — v karte klienta (Klienti → ✎) je na to tlačidlo a
    // zruší oboje naraz.
    actions.setOverride(item.client, "status" as never, "Neaktívny");
  };
  const odpovedzPauza = () => { if (item.client) actions.setOverride(item.client, "status" as never, "Pauza"); };
  return (
    <div style={{ padding: "9px 11px", marginBottom: 5, borderRadius: 8, background: item.acked ? C.track : item.tone === "red" ? C.redBg : item.tone === "blue" ? C.blueBg : C.orangeBg, opacity: item.acked ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <span style={badge(catTone(item.category))}>{item.category}</span>
        <span style={{ color: C.text }}>{item.detail}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {jeOtazkaDuch && !item.acked && (
            <>
              <button onClick={odpovedzDuch} style={{ ...linkBtn, color: C.red }}>Áno, duch</button>
              <button onClick={odpovedzPauza} style={{ ...linkBtn, color: C.blue }}>Pauza</button>
            </>
          )}
          {!item.acked && !jeRozhodnutie && <button onClick={openItem} style={linkBtn}>Otvoriť →</button>}
          {item.acked ? (
            <button onClick={() => actions.ackAnomaly(item.key, "", false)} style={linkBtn}>Vrátiť</button>
          ) : (
            <button onClick={() => actions.ackAnomaly(item.key, "skryté")} style={{ ...linkBtn, color: C.textDim }}>Skryť</button>
          )}
        </div>
      </div>
    </div>
  );
}

