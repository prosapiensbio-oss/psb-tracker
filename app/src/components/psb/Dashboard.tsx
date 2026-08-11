import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { objednaneVerzia,
  doPlnehoMesiaca,
  kotvaDat,
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
import { Balicky, odtrenovaneMimoExportu, type KalUdalost } from "./Kalendar";
import { nastavPrijmyZTrackera, pnlCalc, poslednyMesiacSDatami, salaryCalc, vzasVerzia, VZAS_MONTHS } from "../../lib/psb/vzas";
import { fetchBtcReserve, fetchVzasSettings } from "../../lib/psb/client";
import { PrehladPanel, useZmenyOdMinule, type Pristroj, type Zmena } from "./Prehlad";
import {
  centerBody, GrafyKniznica, HLAVNE, hraniceObdobia, MiniStat, OBDOBIA_DASH, SEKCIE, useExtraGrafy, VYCHODZIE, WIDGETS,
  type SekciaId, type WidgetMeta,
} from "./DashGrafy";
import { tokyKlientov } from "./Fluktuacia";
import type { PSBData } from "../../lib/psb/types";
import type { Actions, NavFocus } from "./App";
import type { AssistantChat } from "./Assistant";
import { Card, Donut, Empty, H3, Info, Select, ValueBars, ZoneBars } from "./ui";

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
/**
 * Východzie poradie: HLAVNÉ grafy v Jerryho poradí, potom celá knižnica.
 *
 * Predtým to bolo poradie zápisu v registri — teda poradie, v akom karty
 * historicky pribúdali, čo nie je poradie, v akom sa čítajú. Hlavné grafy
 * teraz stoja navrchu aj v režime Usporiadať.
 */
const DEFAULT_ORDER = [...HLAVNE, ...WIDGETS.map((w) => w.id).filter((id) => !HLAVNE.includes(id))];
const DEFAULT_WIDTH: Record<string, number> = Object.fromEntries(WIDGETS.map((w) => [w.id, w.span]));
/** Vypnuté hneď po inštalácii = všetko, čo nie je medzi hlavnými. */
const DEFAULT_HIDDEN = WIDGETS.map((w) => w.id).filter((id) => !VYCHODZIE.has(id));
const ORDER_KEY = "psb-dash-order";
const HIDDEN_KEY = "psb-dash-hidden";
const WIDTH_KEY = "psb-dash-width";
const KNOWN_KEY = "psb-dash-known";
const KPI_KEY = "psb-dash-kpi";
/**
 * Verzia východzej zostavy kariet.
 *
 * Uložené rozloženie v prehliadači prebíja východzie nastavenie — a to je
 * správne, kým si ho človek sám poskladal. Lenže 10. 8. sa východzia zostava
 * prerobila od základu (zlúčené karty, zóny presunuté do grafu hodín) a Jerry
 * by z toho videl starú zostavu plus pár nových kariet navrch. Zmena verzie
 * teda uložené rozloženie RAZ zahodí a nastaví novú zostavu; kto si potom
 * niečo prepne, ostane mu to.
 */
const LAYOUT_VER_KEY = "psb-dash-ver";
// 2026-08-10b: hlavné grafy sa presťahovali z localStorage do kódu (HLAVNE) aj
// so šírkami. Nová východzia zostava je presne tá, ktorú mal Jerry poskladanú,
// takže toto zahodenie nič nestratí — len ju dostane na každý prehliadač.
const LAYOUT_VER = "2026-08-10b";

/**
 * Zapnuté karty navrch, vypnuté pod ne — poradie v rámci oboch skupín ostáva.
 * Sekcie sa filtrujú z toho istého poľa, takže to platí aj vnútri sekcie.
 */
const zoradPodlaZobrazenia = (poradie: string[], skryte: string[]) => [
  ...poradie.filter((id) => !skryte.includes(id)),
  ...poradie.filter((id) => skryte.includes(id)),
];

function useDashLayout() {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<string[]>(DEFAULT_HIDDEN);
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTH);
  /** Jednotlivé KPI riadky, ktoré si človek z karty odškrtol. */
  const [kpiSkryte, setKpiSkryte] = useState<string[]>([]);

  useEffect(() => {
    try {
      // Nová východzia zostava → uložené rozloženie sa raz zahodí.
      if (localStorage.getItem(LAYOUT_VER_KEY) !== LAYOUT_VER) {
        for (const k of [ORDER_KEY, HIDDEN_KEY, WIDTH_KEY, KNOWN_KEY]) localStorage.removeItem(k);
        localStorage.setItem(LAYOUT_VER_KEY, LAYOUT_VER);
      }
      const o = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
      // Poradie sa dorovná až po načítaní skrytých (nižšie) — bez nich sa nedá
      // povedať, čo je „zapnuté navrchu".
      const ulozenePoradie: string[] | null = Array.isArray(o)
        ? (() => {
            const known = o.filter((id: string) => DEFAULT_ORDER.includes(id));
            // Append any widget added in a later version that the saved order predates.
            return [...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))];
          })()
        : null;
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
      if (ulozenePoradie) setOrder(zoradPodlaZobrazenia(ulozenePoradie, dalej));

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
  const toggleHide = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    persistHidden(next);
    // Zapnuté karty držia poradie pred vypnutými (Jerry, 10. 8.: „keď dám
    // usporiadať, nech sú tie zobrazené navrchu a pod nimi všetky ostatné").
    // Zoraďuje sa v ULOŽENOM poradí, nie až pri kreslení: keby sa poradie
    // zobrazovalo inak, než je uložené, šípky ↑ ↓ by hýbali niečím iným, než
    // čo je pod nimi vidieť.
    persistOrder(zoradPodlaZobrazenia(order, next));
  };
  /** Zapnúť/vypnúť celú sekciu naraz — z knižnice grafov. */
  const sekciaVsetko = (sekcia: SekciaId, zapnut: boolean) => {
    const ids = WIDGETS.filter((w) => w.sekcia === sekcia).map((w) => w.id);
    const next = zapnut ? hidden.filter((x) => !ids.includes(x)) : [...new Set([...hidden, ...ids])];
    persistHidden(next);
    persistOrder(zoradPodlaZobrazenia(order, next));
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
  kalendar,
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
  /** Udalosti z Google Kalendára — predbežná vrstva, nikdy nie zápis. */
  kalendar: KalUdalost[];
}) {
  const [showAcked, setShowAcked] = useState(false);
  const [registerExpanded, setRegisterExpanded] = useState(false);
  // "prijate" = cash received (= PTminder "Payments" / tržby) — the default; "vyfakturovane" = value of trained sessions.
  const [earnMode, setEarnMode] = useState<"vyfakturovane" | "prijate">("prijate");
  const [arranging, setArranging] = useState(false);
  const [kniznica, setKniznica] = useState(false);
  // Grafy sa zobrazujú po jednej sekcii. Predtým boli všetky štyri pod sebou a
  // dashboard mal cez dva metre výšky — kto chcel marketing, skroloval cez
  // peniaze, vyťaženie aj klientov. Kotvy to neriešili: doskrolovali, ale
  // obrazovka zostala plná všetkého ostatného.
  // Filter obdobia pre grafy pod panelom. Panel prístrojov hore ho zámerne
  // NEPOČÚVA: prístroj má vždy hovoriť o tom, ako to je teraz. Kokpit, ktorý
  // sa dá prepnúť na „ukáž mi rok 2025", už nie je kokpit, ale archív.
  const [obdobie, setObdobie] = useState<string>(() => {
    try {
      return localStorage.getItem("psb-dash-obdobie") || "all";
    } catch {
      return "all";
    }
  });
  const zvolObdobie = (v: string) => {
    // „Vlastné" nesie rozsah priamo v hodnote (custom:od|do). Výber z
    // rozbaľovačky ho založí prázdny, úprava dátumov ho posiela už hotový.
    const h = v === "custom" ? "custom:|" : v;
    setObdobie(h);
    try {
      localStorage.setItem("psb-dash-obdobie", h);
    } catch {
      /* ignore */
    }
  };
  // Východzia sekcia grafov je VYŤAŽENIE (Jerry, 10. 8.). Odrobené hodiny sú
  // preňho najdôležitejší graf a zároveň jediný, ktorý hovorí o najbližších
  // dňoch; peniaze sa čítajú raz mesačne pri uzávierke.
  // Sekcia bez jedinej karty sa nekreslí. Prepínač, v ktorom polovica tlačidiel
  // neukáže nič, je zoznam sľubov — a človek si ho odvykne prekliknúť celý.
  const sekcieSKartami = useMemo(
    () => SEKCIE.filter((sk) => WIDGETS.some((w) => w.sekcia === sk.id)),
    [],
  );
  const [sekcia, setSekcia] = useState<SekciaId>(() => {
    try {
      const u = localStorage.getItem("psb-dash-sekcia");
      return (SEKCIE.some((x) => x.id === u) ? u : "vytazenie") as SekciaId;
    } catch {
      return "vytazenie";
    }
  });
  const zvolSekciu = (id: SekciaId) => {
    setSekcia(id);
    try {
      localStorage.setItem("psb-dash-sekcia", id);
    } catch {
      /* ignore */
    }
  };
  const layout = useDashLayout();
  const cols = useDashColumns();
  const telefon = useTelefon();
  const matchT = (t: string) => trainer === "all" || t === trainer;

  // Zdravá zóna pre zvoleného trénera: pri „Obaja" je to dvojnásobok, lebo
  // karta sčítava oboch.
  const zonaLo = trainer === "all" ? ZONE_LO * 2 : ZONE_LO;
  const zonaHi = trainer === "all" ? ZONE_HI * 2 : ZONE_HI;

  // Jedna kotva pre celý dashboard: posledný deň, o ktorom appka niečo vie.
  // Grafy a dlaždice končia posledným plným mesiacom — rozrobený mesiac
  // vyzeral ako prepad, ktorý sa nestal.
  const kotva = useMemo(() => kotvaDat(data), [data]);

  const stats = useMemo(() => {
    const list = Object.values(clients);
    // "Aktívny" = everyone except Neaktívny (matches the Klienti tab count).
    const active = list.filter((c) => c.status !== "Neaktívny" && matchT(c.primaryTrainer)).length;
    const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
    const lastWeek = weeks[weeks.length - 1];
    const weekHours = data.sessions
      .filter((s) => weekKey(s.date) === lastWeek && matchT(s.sessionTrainer))
      .reduce((a, s) => a + s.duration / 60, 0);
    // Po posledný PLNÝ mesiac. Predtým sa bral posledný v poli, čo je bežiaci
    // mesiac — piateho augusta teda „tržby za mesiac" znamenali tržby za 5 dní.
    const months = doPlnehoMesiaca(monthlyFinance(data), kotva, (m) => m.month);
    const lastMonth = months[months.length - 1];
    // Tržba = peniaz, ktorý prišiel. Doteraz tu bolo `revenue` — hodnota
    // odtrénovaných sedení — pod nálepkou „Zárobky". To je iné číslo a Jerry
    // sleduje tržby: čo prišlo na účet, nie čo sa odpracovalo. Tržby sa navyše
    // nedelia na trénera (platba v PTminderi trénera nemá), takže prepínač
    // trénera na tejto karte nič nerobí a nemá predstierať, že áno.
    const monthCash = lastMonth ? lastMonth.cash : 0;
    // Bežiaci mesiac zvlášť. Import z PTmindera chodí TÝŽDENNE, takže tržba za
    // rozbehnutý mesiac je živé číslo, ktoré sa dá sledovať — na rozdiel od
    // zisku, kde náklady pribudnú z Fio až raz mesačne (Jerry, 10. 8.).
    const beziaciMk = new Date().toISOString().slice(0, 7);
    const vsetkyMes = monthlyFinance(data);
    const beziaci = vsetkyMes.find((m) => m.month === beziaciMk);
    const beziaciCash = beziaci ? beziaci.cash : 0;
    const sixMCount = sixM.filter((c) => matchT(c.primaryTrainer)).length;
    return { active, weekHours, lastWeek, monthCash, lastMonth: lastMonth?.month, sixMCount, beziaciCash, beziaciMk };
  }, [clients, data, sixM, trainer, kotva]);

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
    // Posledný UZAVRETÝ mesiac, o ktorom appka niečo vie — nie posledný
    // s dátami. Deviateho augusta mal august tržby 36 965 (PTminder chodí
    // priebežne) a náklady 2 810 (dve BTC faktúry), takže „mesiac s dátami"
    // bol august a dlaždica hlásila zisk 34 155 — tržbu bežiaceho mesiaca
    // prezlečenú za zisk, presne to, čo tento komentár od začiatku zakazuje.
    // Rovnaká rodina chýb ako kotva dát: mesiac s dátami ešte nie je mesiac
    // hotový. Bežiaci mesiac sa preskočí; keby náhodou VŠETKY dáta ležali
    // v ňom (čerstvá inštalácia), vezme sa posledný s dátami ako núdza.
    let i = poslednyMesiacSDatami();
    const beziaciMk = new Date().toISOString().slice(0, 7);
    while (i > 0 && (VZAS_MONTHS[i] as string) >= beziaciMk) i--;
    if ((VZAS_MONTHS[i] as string) >= beziaciMk) i = poslednyMesiacSDatami();
    const j = salaryCalc("jerry");
    const t = salaryCalc("terezka");
    // Break-even ráta s NÁROKOM trénerov, nie s tým, čo si reálne vzali — čo si
    // niekto vezme navyše, je pôžička, nie náklad.
    const beZa = (k: number) => p.bezVyplat[k] + j.narok[k] + t.narok[k] + p.matyas[k];
    const be = beZa(i);
    const od6 = Math.max(0, i - 5);
    const idx6 = Array.from({ length: i - od6 + 1 }, (_, k) => od6 + k);
    const bePriem = idx6.reduce((a, k) => a + beZa(k), 0) / idx6.length;
    const od = Math.max(0, i - 11);
    return {
      mesiac: VZAS_MONTHS[i] as string,
      v: p.hrubyZisk[i],
      rad: p.hrubyZisk.slice(od, i + 1),
      predch: i > 0 ? p.hrubyZisk[i - 1] : null,
      be,
      bePriem,
      prijmy: p.prijmy[i],
      odstupPct: be > 0 ? ((p.prijmy[i] - be) / be) * 100 : null,
    };
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
    // Najnovší mesiac hore — čítať zoznam zdola nahor je proti zvyku a pri
    // troch riadkoch sa to nedá zachrániť ani nadpisom.
    const posledne = t.mesacne.filter(([mk]) => mk < bezici).slice(-3).reverse()
      .map(([mk, v]) => ({ mk, prislo: v.prislo, odislo: mk < zrele ? v.odislo : null }));
    return { prisloMes: t.prisloMes, odisloMes: t.odisloMes, posledne };
  }, [data, clients]);

  // Lievik: dopyty → úvodné → noví klienti za posledný PLNÝ mesiac.
  //
  // Pôvodne kreslil bežiaci mesiac, aby sa prílev dal sledovať v reálnom čase.
  // V praxi to znamenalo, že prvý týždeň v mesiaci karta hlásila samé nuly a
  // nazývala sa menom mesiaca, ktorý sa ešte nestal — porovnávať sa nedalo s
  // ničím. Uzavretý mesiac je celé číslo, ktoré niečo znamená; bežiaci mesiac
  // sa dopočíta vedľa ako priebeh, nie ako výsledok.
  const lievikMes = useMemo(() => {
    const mes = kotva.plny || new Date().toISOString().slice(0, 7);
    const zaMesiac = (mk: string) => {
      const dopyty = (data.leads || []).filter((l) => (l.date || "").slice(0, 7) === mk);
      const uvodne = new Set(data.sessions.filter((s) => s.sessionType === "UVODNE" && s.date.slice(0, 7) === mk).map((s) => s.client)).size;
      const novi = Object.values(clients).filter((c) => (c.firstSession || "").slice(0, 7) === mk).length;
      return { dopyty, uvodne, novi };
    };
    const u = zaMesiac(mes);
    const zdroje = new Map<string, number>();
    for (const l of u.dopyty) zdroje.set(l.source, (zdroje.get(l.source) || 0) + 1);
    // Bežiaci mesiac ako doplnok — nie ako hlavné číslo. Ukáže sa, len keď v
    // ňom už niečo je, nech prvý deň v mesiaci nesvieti riadok s nulami.
    const bezici = new Date().toISOString().slice(0, 7);
    const b = bezici > mes ? zaMesiac(bezici) : null;
    const priebeh = b && (b.dopyty.length || b.uvodne || b.novi)
      ? { mes: bezici, dopyty: b.dopyty.length, uvodne: b.uvodne, novi: b.novi }
      : null;
    return {
      mes, dopyty: u.dopyty.length, uvodne: u.uvodne, novi: u.novi,
      zdroje: [...zdroje.entries()].sort((a, b2) => b2[1] - a[1]),
      priebeh, kotva: kotva.den, bezDat: !kotva.plny,
    };
  }, [data, clients, kotva]);

  // Predikcia tržieb na najbližší mesiac — podľa Jerryho „to najdôležitejšie
  // číslo, aké appka počíta". Doteraz bola schovaná vo Financiách → Predikcia a
  // na dashboarde nebola vôbec.
  // Predikcia sa počíta RAZ a použijú ju dve dlaždice: odhad na ďalší mesiac
  // a „čaká sa ešte" v tržbách za bežiaci mesiac. Dve volania toho istého
  // modelu by sa raz rozišli v parametroch a nikto by si nevšimol prečo.
  const cashPredMes = useMemo(() => predictCash(data, clients, 2), [data, clients, kalendar]); // eslint-disable-line react-hooks/exhaustive-deps
  const trzbyOdhad = useMemo(() => {
    const cash = predictCash(data, clients, 1);
    return cash.months[0] || null;
    // `kalendar` je v závislostiach zámerne: objednané hodiny sa do predikcie
    // dostávajú modulovou cestou (nastavObjednaneZKalendara), takže bez tejto
    // závislosti by sa číslo prepočítalo až pri ďalšej zmene dát — teda niekedy.
  }, [data, clients, kalendar]);

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

  // Posledný týždeň býva useknutý: dáta z PTmindera končia v piatok, takže
  // sobota a nedeľa v ňom chýbajú. V grafe zostáva (aktuálna záťaž je zmyslom
  // tejto karty), ale z priemeru a z „najľahšieho týždňa" sa vyhadzuje — inak
  // by rozrobený týždeň vyhrával oboje a Ø by klesalo s každým importom.
  // Rezerva sa ťahá vždy — je to jeden z ôsmich prístrojov, nie voliteľná karta.
  const [btc, setBtc] = useState<{ czk: number | null; platby?: { klient: string | null; datum: string; czk: number | null }[] } | null>(null);
  useEffect(() => {
    // `platby=1` navyše: z nich sa počíta, koľko klientov platí bitcoinom
    // a aký podiel tržieb to je. Jerry (10. 8.) chcel jedno číslo — a ukázalo
    // sa, že nie je okrajové: v júli to bolo 41 % tržieb.
    void fetchBtcReserve(true).then((r) => setBtc(r as never));
  }, []);
  // Skutočný stav účtu a hotovosti, zapísaný ručne v Peniaze → Cashflow.
  // Bez neho hovorila dlaždica Rezerva len o bitcoine — a to je časť majetku,
  // nie majetok. Runway sa neplánuje z jednej zásuvky.
  const [stavPenazi, setStavPenazi] = useState<{ fio: number; hotovost: number; datum: string } | null>(null);
  useEffect(() => {
    void fetchVzasSettings().then((st) => {
      const v = st["stav_penazi"] as { fio: number; hotovost: number; datum: string } | undefined;
      if (v && typeof v.fio === "number") setStavPenazi(v);
    });
  }, []);

  // ── Deväť prístrojov ───────────────────────────────────────────────────────
  // Výber a prahy stoja na rešerši (2026-08-07): Few (5–9 čísel, každé s
  // referenciou), Two-Brain (~15 000 posilňovní — zisk pred tržbou, churn,
  // dĺžka spolupráce), HFA 2025 (retencia), a štúdie o odmlčaní klientov
  // (14+ dní bez tréningu = šesťnásobná pravdepodobnosť odchodu, 48 % vs 8 %).
  //
  // Delia sa na dve pásma. „Ako to dopadlo" sú uzavreté čísla — už sa nedajú
  // ovplyvniť. „Čo sa chystá" sú predstihové: keď sa pokazia, na peniazoch to
  // ešte nevidno, ale už je rozhodnuté. Miešať ich do jednej mriežky znamená,
  // že sa nedá rozoznať, kde má ešte zmysel zasahovať.
  const pristroje = useMemo(() => {
    const mesiace = doPlnehoMesiaca(monthlyFinance(data), kotva, (m) => m.month);
    const cashRad = mesiace.slice(-12).map((m) => m.cash);
    const predchCash = mesiace.length > 1 ? mesiace[mesiace.length - 2].cash : null;

    // ── KOTVA: tržby za BEŽIACI mesiac (Jerry, 10. 8.) ──────────────────────
    //
    // Kotvou bol zisk za uzavretý mesiac — najdôležitejšie číslo v podniku,
    // ale také, s ktorým sa už nedá nič spraviť. Kokpit má ukazovať to, čo sa
    // ešte dá ovplyvniť, a platby chodia z PTmindera týždenne, takže tržba
    // rozbehnutého mesiaca je živá. Zisk zostáva — v tenkom riadku pod
    // prístrojmi, lebo náklady z banky prídu raz mesačne a živý zisk by bola
    // vymyslenina (9. 8. takto ukázal august ako 34 155 Kč).
    const dnesIso2 = new Date().toISOString().slice(0, 10);
    // „Čaká sa" = obnovy, ktorých termín padne do KONCA TOHTO mesiaca.
    //
    // Prvá verzia filtrovala perClient podľa `kedy === bežiaci mesiac` — a to
    // je vždy prázdne: mesačné kľúče predikcie začínajú mesiacom PO poslednom
    // mesiaci s platbami, takže bežiaci mesiac medzi nimi nikdy nie je a
    // obnova z 20. augusta sa účtuje septembru. Riadok „čaká sa ešte" sa tak
    // nikdy nezobrazil — tichá nula, presne ten druh chyby, čo nič nepovie.
    // `tyzdnov` je skutočná vzdialenosť obnovy v týždňoch, tak sa počíta z nej.
    const dniDoKonca = (() => {
      const t = new Date();
      return new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate();
    })();
    // Kto sa do konca mesiaca chystá platiť. Zoznam a suma sú z JEDNÉHO
    // filtra — keby sa počítali zvlášť, raz by sa rozišli a klik by otvoril
    // iných ľudí, než z ktorých je poskladané číslo nad ním.
    const cakaSaKlienti = (cashPredMes?.perClient || []).filter((x) => x.tyzdnov * 7 <= dniDoKonca);
    const cakaSa = cakaSaKlienti.reduce((a, x) => a + x.suma * x.confidence, 0);
    // Klik na „čaká sa" otvorí tých ľudí (Jerry, 10. 8.): suma hovorí KOĽKO,
    // ale zavolať sa dá len konkrétnemu človeku. Zoradení podľa toho, kto má
    // obnovu najbližšie — to je poradie, v akom má zmysel ich obvolávať.
    const otvorCakajucich = () =>
      onNavigate("klienti", undefined, {
        skupina: {
          label: `Čaká sa platba do konca ${monthLabel(stats.beziaciMk)}`,
          mena: [...cakaSaKlienti].sort((a, b) => a.tyzdnov - b.tyzdnov).map((x) => x.name),
        },
        nonce: Date.now(),
      });
    const kotvaP: Pristroj = {
      id: "trzbyTeraz",
      label: "Tržby tento mesiac",
      hodnota: fmtCZK(stats.beziaciCash),
      podnadpis: `${monthLabel(stats.beziaciMk)} · k ${Number(dnesIso2.slice(8, 10))}. dňu`,
      pasmo: "ok",
      poznamka: cakaSa > 0 ? `čaká sa ešte ~${fmtCZK(cakaSa)} od ${cakaSaKlienti.length} klientov` : undefined,
      poznamkaKam: cakaSaKlienti.length ? () => otvorCakajucich() : undefined,
      vysvetlenie: "Peniaze, ktoré v tomto mesiaci UŽ prišli (účet + hotovosť + BTC) — aktualizuje sa s každým importom z PTmindera, takže sa dá sledovať priebežne. Pruh ukazuje, kam to smeruje: kde je dnes a kde bude, ak dobehnú aj očakávané obnovy. Zisk sa takto ukázať nedá — náklady chodia z banky raz mesačne a rozbehnutý mesiac by vyzeral ako rekordný. Uzavretý mesiac je v riadku pod prístrojmi.",
      seria: cashRad,
      kotva: cakaSa > 0
        ? { hodnota: stats.beziaciCash, ciel: stats.beziaciCash + cakaSa }
        : undefined,
      // Druhý pohľad (Jerry, 10. 8.): očakávané tržby chcel veľké, nie malým
      // písmom pod pruhom. Prepínač namiesto druhej dlaždice — je to to isté
      // číslo z druhej strany.
      prepinac: cakaSa > 0
        ? {
            label: "Očakávané",
            hodnota: `~${fmtCZK(stats.beziaciCash + cakaSa)}`,
            podnadpis: `${monthLabel(stats.beziaciMk)} · ak dobehnú obnovy`,
            poznamka: `prišlo ${fmtCZK(stats.beziaciCash)} · čaká sa ~${fmtCZK(cakaSa)} od ${cakaSaKlienti.length} klientov`,
            poznamkaKam: cakaSaKlienti.length ? () => otvorCakajucich() : undefined,
          }
        : undefined,
      kam: () => onNavigate("vzas", "trzby"),
    };

    // ── ČO UŽ DOPADLO ────────────────────────────────────────────────────────
    const vysledok: Pristroj[] = [];

    // ODCHODY sa z Kokpitu vypustili (Jerry, 10. 8.): „neviem, čo mám z toho,
    // že viem, koľko ľudí odchádza." Je to zaostávajúci ukazovateľ — kým ho
    // uvidíš, rozhodnutie, ktoré ho spôsobilo, je tri mesiace staré. Žije
    // ďalej v Klienti → Fluktuácia a vo Výsledkoch, kde znie otázka „zabralo
    // to, čo sme zmenili?".
    const cisty = toky.prisloMes - toky.odisloMes;
    vysledok.push({
      id: "klienti",
      label: "Aktívni klienti",
      hodnota: String(stats.active),
      podnadpis: `čistý rast ${cisty >= 0 ? "+" : ""}${cisty.toFixed(1)} / mes. · Ø ${toky.prisloMes.toFixed(1)} nových`,
      pasmo: cisty < -0.5 ? "zle" : cisty < 0 ? "pozor" : "ok",
      poznamka: cisty < 0 ? "odchádza viac, než prichádza" : undefined,
      vysvetlenie: "Počet aktívnych klientov a priemerný čistý rast za mesiac (prišlo mínus odišlo). Samotný počet je márnivé číslo — dôležitý je smer. Klesajúci čistý rast sa v tržbách prejaví až o dva-tri mesiace neskôr.",
      kam: () => onNavigate("klienti", "klienti"),
    });

    // Posledný týždeň v dátach býva useknutý — PTminder končí v piatok, takže
    // sobota a nedeľa v ňom chýbajú. Prístroj hlásil „37 h, pod zónou" za tri
    // odtrénované dni. Berie sa preto posledný CELÝ týždeň.
    const hodinyTyzdna = (r: (typeof weekRows)[number]) =>
      trainer === "all" ? r[1].Jerry + r[1].Terezka + r[1].iny : trainer === "Jerry" ? r[1].Jerry : r[1].Terezka;
    const useknuty = !!kotva.den && new Date(`${kotva.den}T00:00:00Z`).getUTCDay() !== 0;
    const uplne = useknuty ? weekRows.slice(0, -1) : weekRows;
    const poslTyzden = uplne[uplne.length - 1];
    const h = poslTyzden ? hodinyTyzdna(poslTyzden) : 0;
    // TENTO týždeň z kalendára, nie minulý z PTmindera (Jerry, 10. 8.).
    //
    // Prístroj hovoril, koľko sa odtrénovalo v poslednom UZAVRETOM týždni —
    // číslo pravdivé, ale mŕtve: s minulým týždňom sa už nedá nič spraviť.
    // Kalendár vie, čo je nachystané na tento, a to je vec, do ktorej sa dá
    // ešte zasiahnuť. Porovnanie s minulým týždňom (tiež z kalendára, aby sa
    // porovnávalo rovnaké s rovnakým) hovorí, ktorým smerom to ide.
    const pondelok = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return x;
    };
    const tenPondelok = pondelok(new Date());
    const minPondelok = new Date(tenPondelok.getTime() - 7 * 86400000);
    const hodinyZKal = (od: Date, do_: Date) =>
      kalendar
        .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && matchT(u.trener))
        .filter((u) => {
          const t = Date.parse(u.zaciatok);
          return t >= od.getTime() && t < do_.getTime();
        })
        .reduce((a, u) => {
          const min = (Date.parse(u.koniec) - Date.parse(u.zaciatok)) / 60000;
          // Udalosť bez konca (alebo s nezmyselnou dĺžkou) sa počíta ako hodina —
          // v kalendári stojí jeden tréning za jeden riadok.
          return a + (min > 5 && min < 300 ? min / 60 : 1);
        }, 0);
    const hTento = hodinyZKal(tenPondelok, new Date(tenPondelok.getTime() + 7 * 86400000));
    const hMinuly = hodinyZKal(minPondelok, tenPondelok);
    const maKal = kalendar.length > 0;
    // Bez kalendára zostáva pôvodné číslo z PTmindera — appka bez pripojeného
    // kalendára nesmie stratiť prístroj, len ukáže to, čo vie.
    const hZobraz = maKal ? hTento : h;
    const zmenaTyzdna = maKal && hMinuly > 0 ? ((hTento - hMinuly) / hMinuly) * 100 : null;
    // Bezici tyzden patri medzi 'ako to ide', nie medzi 'co sa chysta':
    // je to teraz, nie vyhlad (Jerry, 10. 8.).
    vysledok.push({
      id: "hodiny",
      label: "Hodiny / týždeň",
      hodnota: `${hZobraz.toFixed(0)} h`,
      podnadpis: maKal
        ? `tento týždeň · nachystané v kalendári`
        : poslTyzden ? `týž. ${weekLabel(poslTyzden[0])} · odtrénované` : undefined,
      pasmo: hZobraz === 0 ? "nevie" : hZobraz < zonaLo ? "pozor" : hZobraz > zonaHi ? "zle" : "ok",
      poznamka: hZobraz === 0 ? undefined
        : zmenaTyzdna !== null
          ? `${zmenaTyzdna >= 0 ? "+" : ""}${zmenaTyzdna.toFixed(0)} % oproti minulému týždňu (${hMinuly.toFixed(0)} h)`
          : hZobraz > zonaHi ? "nad zónou — riziko vyhorenia" : hZobraz < zonaLo ? "pod zónou" : `zóna ${zonaLo}–${zonaHi} h`,
      vysvetlenie: `Koľko hodín je na TENTO týždeň nachystaných v Google Kalendári — vrátane toho, čo sa už odtrénovalo. Porovnanie je s minulým týždňom z toho istého zdroja, aby sa porovnávalo rovnaké s rovnakým. Zdravá zóna je ${ZONE_LO}–${ZONE_HI} h na trénera; pri „Obaja“ sa zdvojnásobuje, lebo dlaždica sčítava oboch. Keď kalendár pripojený nie je, ukazuje sa posledný uzavretý týždeň z PTmindera. Krivka pod číslom je história odtrénovaných týždňov.`,
      seria: uplne.slice(-12).map(hodinyTyzdna),
      kam: () => onNavigate("kalendar"),
    });

    // ── ČO SA CHYSTÁ ─────────────────────────────────────────────────────────
    const varovne: Pristroj[] = [];

    const odhad = trzbyOdhad?.expected ?? null;
    const beRef = zisk?.be ?? null;
    varovne.push({
      id: "odhad",
      label: "Odhad tržieb",
      hodnota: odhad === null ? "—" : fmtCZK(odhad),
      podnadpis: trzbyOdhad ? monthLabel(trzbyOdhad.month) : undefined,
      pasmo: odhad === null || beRef === null ? "nevie" : odhad < beRef ? "zle" : odhad < beRef * 1.2 ? "pozor" : "ok",
      poznamka: odhad !== null && beRef !== null && odhad < beRef ? "pod break-even" : "z rozchodených balíčkov",
      vysvetlenie: "Koľko peňazí príde budúci mesiac podľa zostatkov balíčkov a tempa klientov — vrátane toho, čo je objednané v Google Kalendári. Kto má dohodnutý termín, počíta sa ako aktívny, aj keď ho história odpísala. Porovnáva sa s break-evenom: odhad pod ním znamená stratový mesiac, ak sa nič nepredá.",
      kam: () => onNavigate("vzas", "predikcia"),
    });

    // Odmlčaní klienti — najdrahšie číslo v appke. 14 dní nie je náhodné:
    // klient bez tréningu 14+ dní odchádza šesťkrát častejšie (48 % vs 8 %).
    // Meria sa PODIELOM z aktívnych, nie počtom — pri 20 klientoch je päť
    // odmlčaných katastrofa, pri 60 bežný týždeň.
    //
    // Kalendár má právo veta: kto má dohodnutý budúci termín, nie je odmlčaný
    // — je na dovolenke, po operácii, alebo len platí obmesiac. Toto bývala
    // samostatná karta „Odpísaní, ale majú termín" v Kalendári a s touto
    // dlaždicou sa prekrývala do protirečenia: jedna kázala volať, druhá
    // vedľa hovorila „netreba, príde v pondelok". Jedna otázka, jedna karta.
    const dnesKal = new Date().toISOString().slice(0, 10);
    const maBuduciTermin = new Set(
      kalendar
        .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && u.klient && u.zaciatok.slice(0, 10) >= dnesKal)
        .map((u) => u.klient as string),
    );
    const ohrozeni = Object.values(clients).filter((c) => {
      if (c.status !== "Aktívny" || !matchT(c.primaryTrainer)) return false;
      if (c.segment !== "Anchor" && c.segment !== "Stabilný") return false;
      if (maBuduciTermin.has(c.name)) return false;
      return (Date.now() - Date.parse(c.lastSession)) / 86400000 >= 14;
    });
    const podiel = stats.active > 0 ? (ohrozeni.length / stats.active) * 100 : 0;
    varovne.push({
      id: "ohrozeni",
      label: "Odmlčaní",
      hodnota: String(ohrozeni.length),
      podnadpis: ohrozeni.length ? `${podiel.toFixed(0)} % aktívnych · 14+ dní` : "nikto sa neodmlčal",
      pasmo: !ohrozeni.length ? "ok" : podiel > 25 ? "zle" : podiel > 15 ? "pozor" : "ok",
      poznamka: ohrozeni.length ? ohrozeni.slice(0, 2).map((c) => c.name.split(" ")[0]).join(", ") + (ohrozeni.length > 2 ? ` +${ohrozeni.length - 2}` : "") : undefined,
      dobreHore: false,
      vysvetlenie: "Pravidelní klienti (Anchor alebo Stabilný), ktorí 14 a viac dní netrénovali A nemajú v Google Kalendári žiadny budúci termín. Kto termín má, sa neráta — je na dovolenke či po operácii, nie na odchode. Hranica 14 dní nie je odhad: klient, ktorý toľko vynechá, odchádza zhruba šesťkrát častejšie než ten, čo chodí (48 % vs 8 %). Zdravé je do 15 % aktívnych, nad 25 % je to poplach. Kým je odmlčaný, dá sa ešte získať späť — potom už len ťažko. Klik otvorí zoznam presne týchto ľudí.",
      // Klik otvorí Klientov LEN s týmito ľuďmi. Doviesť na zoznam všetkých a
      // nechať človeka hľadať tých jedenásť je presne tá práca, ktorú mala
      // dlaždica ušetriť.
      kam: ohrozeni.length
        ? () => onNavigate("klienti", undefined, { skupina: { label: "Odmlčaní 14+ dní", mena: ohrozeni.map((c) => c.name) }, nonce: Date.now() })
        : () => onNavigate("klienti", "klienti"),
    });

    const dopytyRad = (() => {
      const m: Record<string, number> = {};
      for (const l of data.leads || []) {
        const k = (l.date || "").slice(0, 7);
        if (k) m[k] = (m[k] || 0) + 1;
      }
      return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).filter(([k]) => k <= (kotva.plny || "9999")).slice(-12).map(([, v]) => v);
    })();
    const priemDopyty = dopytyRad.length > 3 ? dopytyRad.slice(0, -1).reduce((a, b) => a + b, 0) / (dopytyRad.length - 1) : null;
    varovne.push({
      id: "dopyty",
      label: "Dopyty",
      hodnota: String(lievikMes.dopyty),
      podnadpis: `${monthLabel(lievikMes.mes)} · ${lievikMes.novi} nových`,
      pasmo: priemDopyty === null ? "nevie" : lievikMes.dopyty < priemDopyty * 0.5 ? "zle" : lievikMes.dopyty < priemDopyty * 0.8 ? "pozor" : "ok",
      poznamka: priemDopyty === null ? undefined : `Ø ${priemDopyty.toFixed(1)} / mes.`,
      vysvetlenie: "Nové dopyty za posledný uzavretý mesiac a koľko z nich sa stalo klientmi. Dopyty predbiehajú tržby o dva až tri mesiace — keď klesnú, na peniazoch to ešte nevidno, ale už je rozhodnuté.",
      seria: dopytyRad,
      kam: () => onNavigate("marketing", "lievik"),
    });

    // Rezerva sa delí PRIEMERNÝM break-evenom za pol roka, nie tým z posledného
    // mesiaca. Júl mal break-even o tretinu vyšší než zvyčajne (výplaty za
    // rekordný mesiac), takže rezerva vychádzala na 0,9 mesiaca namiesto 1,2 —
    // runway sa neplánuje podľa najdrahšieho mesiaca.
    // Rezerva = VŠETKO, čo firma má: účet + hotovosť + bitcoin. Kým nie je
    // zapísaný stav účtu a hotovosti, ostáva len bitcoin a dlaždica to povie —
    // inak by tvrdila, že firma vydrží mesiac, hoci má na účte ďalších sto tisíc.
    // Podiel bitcoinu na tržbách za posledný UZAVRETÝ mesiac. Nie za celú
    // históriu: podiel sa mení a číslo má hovoriť o dnešku. Klienti sa počítajú
    // za posledný rok — kto zaplatil raz vlani, dnes „neplatí v BTC".
    const btcPodiel = (() => {
      const platby = btc?.platby;
      if (!platby?.length || !stats.lastMonth || !stats.monthCash) return null;
      const rok = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const klientov = new Set(platby.filter((x) => x.klient && x.datum >= rok).map((x) => x.klient)).size;
      const zaMesiac = platby.filter((x) => x.datum.slice(0, 7) === stats.lastMonth).reduce((a, x) => a + (x.czk || 0), 0);
      if (!klientov) return null;
      return { klientov, pct: Math.round((zaMesiac / stats.monthCash) * 100) };
    })();
    const rez = btc?.czk ?? null;
    const majetok = stavPenazi ? (rez ?? 0) + stavPenazi.fio + stavPenazi.hotovost : rez;
    const mesRez = majetok !== null && zisk && zisk.bePriem > 0 ? majetok / zisk.bePriem : null;
    varovne.push({
      id: "rezerva",
      label: "Rezerva",
      hodnota: mesRez === null ? "—" : `${mesRez.toFixed(1)} mes.`,
      podnadpis: majetok === null ? "načítava sa"
        : stavPenazi ? `${fmtCZK(majetok)} — účet, hotovosť aj BTC`
        : `${fmtCZK(majetok)} — zatiaľ len BTC`,
      pasmo: mesRez === null ? "nevie" : mesRez < 1 ? "zle" : mesRez < 3 ? "pozor" : "ok",
      poznamka: btcPodiel
        ? `${btcPodiel.klientov} ${btcPodiel.klientov === 1 ? "klient platí" : btcPodiel.klientov < 5 ? "klienti platia" : "klientov platí"} v BTC · ${btcPodiel.pct} % tržieb`
        : mesRez !== null && mesRez < 3 ? "cieľ sú 3 mesiace" : undefined,
      vysvetlenie: "Koľko mesiacov by firma ustála bez jedinej tržby — všetko, čo má (účet + hotovosť + bitcoin), delené priemerným break-evenom za pol roka. Stav účtu a hotovosti sa zapisuje ručne v Peniaze → Cashflow, karta „Kde tie peniaze sú“; Fio dáva len výpis pohybov, nie aktuálny zostatok. Kým zapísaný nie je, ráta sa len bitcoin a číslo je nižšie než skutočnosť. Tvoj cieľ „120 000 Kč+“ je v korunách; toto je to isté prepočítané na čas, čo je jediné, čo v zlom mesiaci rozhoduje.",
      kam: () => onNavigate("vzas", "cashflow"),
    });

    // Tenký riadok pod prístrojmi: uzavretý mesiac. Nie dlaždica — je to
    // vysvedčenie, nie prístroj.
    const uzavrety = zisk
      ? { mesiac: monthLabel(zisk.mesiac), zisk: zisk.v, trzby: zisk.prijmy, be: zisk.be }
      : null;
    return { kotva: kotvaP, vysledok, varovne, uzavrety };
  }, [data, clients, stats, zisk, trzbyOdhad, toky, lievikMes, weekRows, btc, stavPenazi, kotva, trainer, zonaLo, zonaHi, onNavigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Čerstvosť dát. Tichý dashboard nad tri týždne starým exportom vyzerá presne
  // ako tichý dashboard nad dobrými dátami — a to je najhorší možný stav
  // prístroja. Preto je zastaranosť sama o sebe výstraha.
  const cerstvost = useMemo(() => {
    if (!kotva.den) return { text: "—", zastarane: true };
    const dni = (Date.now() - Date.parse(kotva.den)) / 86400000;
    return { text: fmtDMY(kotva.den), zastarane: dni > 10 };
  }, [kotva]);

  // Snapshot pre „čo sa zmenilo od minule". Ukladajú sa len holé čísla, nie
  // celý stav — porovnáva sa to, čo sa dá vyjadriť jednou vetou.
  const snapHodnoty = useMemo(
    () => ({ trzby: stats.monthCash, klienti: stats.active, dopyty: lievikMes.dopyty, novi: lievikMes.novi, zisk: zisk?.v ?? 0 }),
    [stats.monthCash, stats.active, lievikMes.dopyty, lievikMes.novi, zisk],
  );
  const odMinule = useZmenyOdMinule(snapHodnoty, !!stats.lastMonth);
  const zmeny = useMemo<Zmena[]>(() => {
    if (!odMinule) return [];
    const p = odMinule.predtym;
    const out: Zmena[] = [];
    const pridaj = (kluc: string, label: string, fmt: (n: number) => string, dobreHore = true) => {
      const z = p[kluc];
      const na = snapHodnoty[kluc as keyof typeof snapHodnoty];
      if (typeof z === "number" && typeof na === "number" && z !== na) out.push({ label, z, na, fmt, dobreHore });
    };
    pridaj("trzby", "tržby", (n) => fmtCZK(Math.abs(n)));
    pridaj("klienti", "klienti", (n) => String(Math.abs(n)));
    pridaj("dopyty", "dopyty", (n) => String(Math.abs(n)));
    pridaj("novi", "noví", (n) => String(Math.abs(n)));
    return out;
  }, [odMinule, snapHodnoty]);

  const poslednyTyzdenNeuplny = useMemo(
    () => !!kotva.den && new Date(`${kotva.den}T00:00:00Z`).getUTCDay() !== 0,
    [kotva],
  );

  // Filter obdobia platí aj na týždenné grafy. Bez toho sa na Vyťažení — a to
  // je teraz prvá sekcia — dal filter prepnúť a nezmenilo sa nič, čo z neho
  // robilo ozdobu. Týždeň patrí do okna podľa mesiaca, v ktorom začína.
  const okno = useMemo(
    () => hraniceObdobia(obdobie, kotva.plny || new Date().toISOString().slice(0, 7)),
    [obdobie, kotva.plny],
  );
  const vOkne = (mk: string) => mk >= okno.od && mk <= okno.do_;
  const oknoTyzdnov = useMemo(
    () => weekRows.filter(([k]) => vOkne(k.slice(0, 7))),
    [weekRows, okno], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const weeklyHours = useMemo(() => {
    const maIneho = oknoTyzdnov.some(([, v]) => v.iny > 0);
    const series = trainer === "all"
      ? [
          { name: "Jerry", color: C.accent },
          { name: "Terezka", color: C.accentLight },
          ...(maIneho ? [{ name: "Matyáš", color: C.textDim }] : []),
        ]
      : [{ name: trainer, color: C.accent }];
    const skutocne = oknoTyzdnov.map(([k, v]) => ({
      label: weekLabel(k),
      values: trainer === "all"
        ? (maIneho ? [v.Jerry, v.Terezka, v.iny] : [v.Jerry, v.Terezka])
        : [trainer === "Jerry" ? v.Jerry : v.Terezka],
    }));

    /**
     * Jeden stĺpec navyše: kam smeruje TENTO týždeň.
     *
     * Posledný skutočný stĺpec je rozrobený — ukazuje len to, čo sa do dnešného
     * dňa stihlo odtrénovať, takže v pondelok vyzerá týždeň ako katastrofa.
     * Kalendár pozná celý týždeň vrátane zvyšku, a to je to jediné číslo, ktoré
     * v stredu naozaj niečo hovorí.
     *
     * Je to ODHAD, preto ⌁ a nie ďalší rovnocenný stĺpec: do priemeru, maxima
     * ani minima nevstupuje — tie počítajú s odtrénovaným, nie s objednaným.
     */
    const p2 = (n: number) => String(n).padStart(2, "0");
    const dnesD = new Date();
    dnesD.setHours(0, 0, 0, 0);
    dnesD.setDate(dnesD.getDate() - ((dnesD.getDay() + 6) % 7)); // pondelok
    const pondelokIso = `${dnesD.getFullYear()}-${p2(dnesD.getMonth() + 1)}-${p2(dnesD.getDate())}`;
    const koniecIso = new Date(dnesD.getTime() + 6 * 86400000).toISOString().slice(0, 10);

    const tyz = { Jerry: 0, Terezka: 0, iny: 0 };
    let maKalendar = false;
    for (const u of kalendar) {
      if (u.typ === "sukromne" || u.typ === "netrening" || u.typ === "guillermo") continue;
      const d = u.zaciatok.slice(0, 10);
      if (d < pondelokIso || d > koniecIso) continue;
      maKalendar = true;
      const h = (Date.parse(`${u.koniec}:00Z`) - Date.parse(`${u.zaciatok}:00Z`)) / 3600000;
      if (u.trener === "Jerry") tyz.Jerry += h;
      else if (u.trener === "Terezka") tyz.Terezka += h;
      else tyz.iny += h;
    }

    const odhad = maKalendar
      ? [{
          label: `${weekLabel(pondelokIso)} ⌁`,
          forecast: true,
          values: trainer === "all"
            ? (maIneho ? [tyz.Jerry, tyz.Terezka, tyz.iny] : [tyz.Jerry, tyz.Terezka])
            : [trainer === "Jerry" ? tyz.Jerry : tyz.Terezka],
        }]
      : [];

    return { series, data: [...skutocne, ...odhad], odhadov: odhad.length };
  }, [oknoTyzdnov, trainer, kalendar]);

  // Ø / max / min weekly hours (basis follows the trainer pill: "all" = PSB total per week).
  const weekStats = useMemo(() => {
    const zdroj = poslednyTyzdenNeuplny ? weekRows.slice(0, -1) : weekRows;
    const pts = zdroj
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
  }, [weekRows, trainer, poslednyTyzdenNeuplny]);

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
    for (const [, v] of oknoTyzdnov) {
      for (const t of trainers) {
        const h = (v as Record<string, number>)[t];
        if (!h) continue;
        if (h >= ZONE_LO && h <= ZONE_HI) zdrava++;
        else if (h < ZONE_LO) pod++;
        else nad++;
      }
    }
    return { zdrava, pod, nad, total: zdrava + pod + nad };
  }, [oknoTyzdnov, trainer]);

  // Value of a month in the chosen earnings mode. "prijate" (cash) is studio-level
  // (payments aren't attributed to a trainer), so it ignores the trainer pill.
  const monthVal = (m: FinanceMonth) =>
    earnMode === "prijate" ? m.cash : trainer === "all" ? m.revenue : m.byTrainer[trainer]?.revenue || 0;

  const earnings = useMemo(() => {
    // Po posledný plný mesiac — rozrobený mesiac kreslil stĺpec pri zemi
    // a graf hlásil prepad. Predpoveď za ním nasleduje ako samostatný stĺpec.
    const months = doPlnehoMesiaca(monthlyFinance(data), kotva, (m) => m.month).filter((m) => vOkne(m.month));
    const bars: { label: string; value: number; forecast?: boolean }[] = months.map((m) => ({ label: monthLabel(m.month), value: monthVal(m) }));
    // Predpoveď dáva zmysel len vtedy, keď okno siaha po súčasnosť. Pri pohľade
    // na rok 2025 by stĺpec „august 2026" visel vo vzduchu.
    const doSucasnosti = okno.do_ >= (kotva.plny || "0000-00");
    if (!doSucasnosti) return bars;
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
  }, [data, clients, trainer, earnMode, kotva, okno, objednaneVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ø / max / min monthly earnings over ACTUAL months (forecast excluded), following the trainer pill + mode.
  // Len plné mesiace: rozrobený mesiac bol vždy „min" a kazil aj priemer.
  const earningStats = useMemo(() => {
    // Ø / max / min musia platiť pre to isté okno ako stĺpce nad nimi — inak
    // by graf ukazoval rok 2025 a priemer pod ním celú históriu.
    const pts = doPlnehoMesiaca(monthlyFinance(data), kotva, (m) => m.month)
      .filter((m) => vOkne(m.month))
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
  }, [data, trainer, earnMode, kotva, okno]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Triáž. Register mal 25 rozbalených položiek cez celú šírku obrazovky a
  // z toho 14 bolo „X dní bez tréningu" — čo je dôležité raz, nie
  // štrnásťkrát. Červené sú veci, kde sa niečo pokazí, ak sa nič nespraví;
  // zvyšok je pracovný zoznam a ten nemá byť prvé, čo človek na dashboarde
  // uvidí. Bez triáže bol panel presne to, čomu sa v kabíne hovorí zahltenie
  // výstrahami: keď svieti všetko, nesvieti nič.
  const kriticke = open.filter((r) => r.tone === "red");
  const bezne = open.filter((r) => r.tone !== "red");
  // "Ukázať skryté" swaps to the hidden/accepted items only (so it's obvious they appeared).

  // Click-through helpers: focus one week in Tréningy → Prehľad / one month in Financie → Zárobky.
  const openWeek = (weekLabelStr: string) => onNavigate("treningy", "prehled", { week: weekLabelStr, trainer, nonce: Date.now() });
  const openMonth = (monthKey: string) => onNavigate("vzas", "trzby", { month: monthKey, trainer, nonce: Date.now() });

  // Widget bodies, keyed by id — rendered in the user's saved order below.
  // Končiace PLATNOSTI členstiev — druhá polovica karty „koniec balíčka".
  //
  // Prvú polovicu (dochádzajúce hodiny) počíta zoznam z Kalendára: ten vie, čo
  // je objednané, a to je pravdivejšie než momentka z posledného exportu.
  // Platnosť ale kalendár nevie a končí nezávisle od hodín: klient s piatimi
  // hodinami a desiatimi dňami ich nestihne minúť a o tri príde. Preto tu.
  const platnostKonci = useMemo(() => {
    const dnes = new Date().toISOString().slice(0, 10);
    const dni = (d: string) => Math.round((Date.parse(d) - Date.parse(dnes)) / 86400000);
    const ack = data.anomalyAck || {};
    // Zostatok po hodinách, ktoré už prebehli, ale export ich ešte nevidel —
    // ten istý helper ako Balíčky. Kadličková mala v Balíčkoch 2/6 a tu 3/6:
    // dve čísla pre tú istú klientku na jednej obrazovke.
    const odtren = odtrenovaneMimoExportu(kalendar, data.sessions);
    return Object.values(clients)
      .filter((c) => c.status !== "Neaktívny" && c.status !== "Pauza" && matchT(c.primaryTrainer))
      .filter((c) => !ack[`balicek|${c.name}`])
      // Klient, ktorý má v exporte len doplnky k paušálnemu členstvu, tu nemá
      // čo robiť — jeho „0 z 3" nie je dochodený balíček, ale dokúpená hodina
      // spred roka. Toto samo o sebe brali 40 zo 73 klientov.
      .filter((c) => !c.lenDoplnky)
      .map((c) => {
        const doKonca = c.packageValidTo ? dni(c.packageValidTo) : null;
        // Frekvencia z POSLEDNÝCH 8 TÝŽDŇOV, nie za celý život klienta: v
        // celoživotnom priemere sú Vianoce, dovolenka aj rozbeh, a ten potom
        // hlási stratu hodín tam, kde žiadna nebude.
        const odkedy = Date.parse(dnes) - 8 * 7 * 86400000;
        const nedavne = c.sessions.filter((x) => Date.parse(x.date) >= odkedy).length;
        const tyzdnov = c.firstSession && c.lastSession
          ? Math.max(1, (Date.parse(c.lastSession) - Date.parse(c.firstSession)) / 604800000)
          : 1;
        // Klient s krátkou históriou nemá dosť nedávnych dát — vtedy platí celoživotný priemer.
        const frekvencia = tyzdnov >= 8 ? nedavne / 8 : c.sessionCount / tyzdnov;
        // Platnosť sa hlási len vtedy, keď z nej niečo VYPLÝVA. Kto zostávajúce
        // hodiny do konca členstva stihne minúť, nemá o čom vedieť; tolerancia
        // jednej hodiny, lebo prísť o pol hodiny nie je dôvod na upozornenie.
        // Posledný týždeň sa hlási vždy: koniec členstva je sám o sebe moment,
        // kedy sa rieši ďalší balíček.
        const tyzdnovDoKonca = doKonca !== null ? doKonca / 7 : 0;
        const zostava = Math.max(0, c.packageRemaining - (odtren[c.name] || 0));
        const stihneMinut = frekvencia > 0
          ? frekvencia * tyzdnovDoKonca >= zostava - 1
          : false;
        const konci =
          doKonca !== null && doKonca > -60 &&
          (doKonca <= 7 || (doKonca <= 21 && !stihneMinut));
        return { c, doKonca, frekvencia, konci, zostava };
      })
      .filter((x) => x.konci)
      .sort((a, b) => (a.doKonca ?? 21) - (b.doKonca ?? 21) || a.c.name.localeCompare(b.c.name));
  }, [clients, trainer, data.anomalyAck, kalendar, data.sessions]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Vyťaženie počíta Dashboard (potrebuje ho aj pre prístroje) a zlúčená karta
  // ho dostáva ako vstup — počítať to dvakrát znamená dve pravdy o tom istom.
  const vytazenieVstup = useMemo(() => ({
    graf: weeklyHours.data.length
      ? <ZoneBars data={weeklyHours.data} series={weeklyHours.series} zone={{ lo: ZONE_LO, hi: ZONE_HI }} height={150} alignEnd />
      : <Empty>Nahraj Payroll by Session.</Empty>,
    zonaPct: zones.total ? Math.round((zones.zdrava / zones.total) * 100) : null,
    tyzdnov: zones.total,
    priemerH: weekStats ? weekStats.avg : null,
    kapacitaPct: capacity.length ? Math.round(capacity.reduce((a, c) => a + c.util, 0) / capacity.length) : null,
    zvladneEste: capacity.length ? capacity.reduce((a, c) => a + c.canTake, 0) : null,
  }), [weeklyHours, zones, weekStats, capacity]);
  const extraNodes = useExtraGrafy({ data, clients, aktivne, onNavigate, kpiSkryte: layout.kpiSkryte, obdobie, vytazenie: vytazenieVstup });

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
        {weeklyHours.odhadov > 0 && (
          <div style={{ fontSize: 11, color: C.blue, marginTop: 6, lineHeight: 1.5 }}>
            Posledný stĺpec (⌁) je tento týždeň podľa Google Kalendára — čo je objednané, nie čo sa
            odtrénovalo. Do priemeru, maxima ani minima sa nepočíta.
          </div>
        )}
        {poslednyTyzdenNeuplny && weeklyHours.data.length > 0 && (
          <div style={{ fontSize: 11, color: C.orange, marginTop: 6, lineHeight: 1.5 }}>
            Posledný stĺpec je rozrobený týždeň — dáta končia {fmtDMY(kotva.den)}. Do priemeru ani do
            najľahšieho týždňa sa nepočíta.
          </div>
        )}
        {weekStats && (
          // Pri „Obaja" hovorí max a min o štúdiu ako celku a nedá sa s tým nič
          // spraviť — užitočnejšie je, ako sa tá práca delí medzi dvoch ľudí.
          // Keď je vybraný jeden tréner, delenie nemá zmysel a vracia sa max/min,
          // lebo vtedy je to jeho vlastný najťažší a najľahší týždeň.
          <>
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
          {/* Zóny rovno pod priemermi (Jerry, 10. 8.) — dovtedy to bol
              samostatný koláč vedľa. Otázka „koľko robíme" a „bolo to zdravé"
              je jedna otázka a odpoveď na ňu má byť na jednom mieste. */}
          {zones.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 8 }}>
              <MiniStat label="V zdravej zóne" value={`${zones.zdrava} · ${Math.round((zones.zdrava / zones.total) * 100)} %`} color={C.green} />
              <MiniStat label="Pod zónou" value={`${zones.pod} · ${Math.round((zones.pod / zones.total) * 100)} %`} color={C.red} />
              <MiniStat label="Nad zónou" value={`${zones.nad} · ${Math.round((zones.nad / zones.total) * 100)} %`} color={C.orange} />
            </div>
          )}
          </>
        )}
      </Card>
    ),
    zony: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info text="Koľko trénerských týždňov padlo do zdravej zóny (24–34h), pod ňu alebo nad ňu. Rešpektuje filter obdobia nad grafmi — pri „Celé obdobie“ je to celá história." label="Týždne v zdravej zóne" />
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
          // Mierilo na Financie → Cashflow — podzáložku, ktorá nikdy
          // neexistovala; klik prepol obrazovku a nechal prázdny obsah.
          <div onClick={() => onNavigate("vzas", "trzby")} style={{ cursor: "pointer" }} title="Otvoriť Peniaze → Tržby">
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
            label="Fluktuácia klientov"
          />
        </H3>
        <div style={{ ...centerBody, cursor: "pointer" }} onClick={() => onNavigate("klienti", "rast")} title="Otvoriť Klienti → Fluktuácia">
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
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>Mená a detail → Klienti → Fluktuácia</div>
        </div>
      </Card>
    ),
    lievik: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info
            text="Prílev za posledný UZAVRETÝ mesiac: koľko dopytov prišlo, koľko ľudí bolo na úvodnom a koľko sa stalo klientmi (prvé sedenie v tom mesiaci). Zámerne uzavretý mesiac — rozrobený sa nedá s ničím porovnať a v prvých dňoch ukazuje samé nuly. Priebeh bežiaceho mesiaca je pod číslami, keď už v ňom niečo je. Zadanie z fluktuácie: ~6,3 nových mesačne = rast +3 klienti/rok. Klik otvorí plný lievik s konverziami a zdrojmi."
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
              Z PTmindera zatiaľ nie je nahratý žiadny uzavretý mesiac. Dopyty sú zapísané ručne, tie platia.
            </div>
          )}
          {/* Bežiaci mesiac ako priebeh, nie ako výsledok — vizuálne slabší,
              nech sa nepletie s uzavretým číslom nad ním. */}
          {lievikMes.priebeh && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
              Zatiaľ v {monthLabel(lievikMes.priebeh.mes)}: {lievikMes.priebeh.dopyty} dopytov ·{" "}
              {lievikMes.priebeh.uvodne} úvodných · {lievikMes.priebeh.novi} nových — mesiac ešte beží.
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
            Zadanie ~6,3 nových / mes. pre rast +3 za rok · uzavretý mesiac
            {lievikMes.kotva && <> · dáta do {fmtDMY(lievikMes.kotva)}</>}
          </div>
        </div>
      </Card>
    ),
    // Zoznam sa presunul z Kalendára sem: rozhoduje ZOSTATOK PO OBJEDNANÝCH
    // hodinách, nie momentka z posledného exportu. Pod ním zostáva druhá,
    // menšia sekcia — končiace platnosti členstiev. Tie kalendár nevie: klient
    // s tromi hodinami a členstvom do budúceho týždňa o hodiny príde, aj keď
    // mu podľa zostatku nič nedochádza.
    koniecBalicka: (
      <Balicky
        udalosti={kalendar.filter((u) => matchT(u.trener))}
        clients={clients}
        sedenia={data.sessions}
        onObnov={actions.obnovKalendar}
        matchTrener={matchT}
        style={{ marginBottom: 0, height: "100%" }}
        onKlient={(meno) => onNavigate("klienti", undefined, { client: meno, nonce: Date.now() })}
      >
        {platnostKonci.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.textDim, margin: "2px 0 6px" }}>
                <Info text="Členstvo má vlastnú platnosť a tá vyprší nezávisle od toho, koľko hodín zostalo. Klient s piatimi hodinami a desiatimi dňami ich nestihne minúť a o tri príde — o tom treba vedieť. Posledný týždeň sa hlási vždy, dlhšie okno len vtedy, keď hodiny podľa tempa nestihne minúť." label={`Končí platnosť členstva (${platnostKonci.length})`} />
              </div>
              {odlozene.length > 0 && (
                <button
                  onClick={() => odlozene.forEach((n) => actions.ackAnomaly(`balicek|${n}`, "", false))}
                  style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}
                >
                  Vrátiť odložené ({odlozene.length})
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
              {platnostKonci.map(({ c, doKonca, frekvencia, zostava }) => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: mix(C.text, 4), border: `1px solid ${C.border}`, borderRadius: 9, width: "100%", minWidth: 0 }}>
                  <span style={{ ...badge(doKonca !== null && doKonca <= 7 ? "red" : "orange"), fontSize: 10, flexShrink: 0 }}>
                    {c.packageTotal > 0 ? `${zostava}/${c.packageTotal}` : "—"}
                  </span>
                  <button
                    onClick={() => onNavigate("klienti", undefined, { client: c.name, nonce: Date.now() })}
                    title={`${c.name} — ${c.membership || "—"} · ${c.primaryTrainer} · chodí ${frekvencia.toFixed(1)}× týždenne`}
                    style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: C.textDim, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doKonca === null ? `${zostava}/${c.packageTotal} hodín`
                        : doKonca < 0 ? `platnosť vypršala ${fmtDMY(c.packageValidTo)}`
                        : doKonca === 0 ? "platnosť končí dnes"
                        : `platnosť do ${fmtDMY(c.packageValidTo)} · ${doKonca} ${doKonca < 5 ? "dni" : "dní"} · hodiny nestihne minúť`}
                    </span>
                  </button>
                  {/* Odložiť, nie zmazať: keď si kúpi ďalšie členstvo, karta sa mu vráti sama. */}
                  <button
                    onClick={() => actions.ackAnomaly(`balicek|${c.name}`, "odložené z karty")}
                    title="Odložiť — už to riešim alebo má pauzu"
                    style={{ background: "none", border: "none", color: C.textDim, fontSize: 15, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Balicky>
    ),
  };

  // Výstražný panel. Pripnutý nad všetkým a mimo mriežky widgetov: toto je
  // jediná vec na obrazovke, ktorá si pýta akciu, a nemá sa dať odsunúť na
  // koniec ani skryť.
  //
  // Keď je prázdny, nie je to karta s nadpisom a vetou — je to tenký tmavý pás
  // so zeleným bodom. Pokoj má vyzerať ako pokoj: v kokpite zhasnutá kontrolka
  // nezaberá pol palubovky.
  // Register podľa leteckého ECAM: tri úrovne, prísne poradie, a čo nevyžaduje
  // zásah, nesmie ísť tým istým kanálom ako to, čo ho vyžaduje. Predtým tu
  // bolo 25 rovnako vyzerajúcich riadkov, z toho 14× „X dní bez tréningu" a
  // 6× pripomienka zľavy za odporúčanie — a to sa človek naučí ignorovať ako
  // celok, vrátane tej jednej veci, čo naozaj horela.
  //
  // Normy pre správu výstrah (EEMUA 191 / ISA-18.2) hovoria o rozdelení
  // ~80 % nízka / 15 % stredná / 5 % vysoká priorita. Preto sa červené
  // ukazujú vždy, zvyšok je za jedným klikom.
  const VIDITELNYCH = 5;
  const registerPanel = showAcked ? (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <H3><Info text="Položky, ktoré si skryl. Vrátiť sa dajú tlačidlom pri každej." label={`Skryté (${acked.length})`} /></H3>
        <button onClick={() => setShowAcked(false)} style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>← Späť na aktívne</button>
      </div>
      {acked.length
        ? acked.map((r) => <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} chat={assistantChat} />)
        : <div style={{ fontSize: 12.5, color: C.textMuted }}>Žiadne skryté položky.</div>}
    </Card>
  ) : open.length === 0 ? (
    // Nič nevyžaduje pozornosť → panel nerenderuje NIČ. Zelený pás „všetko je
    // v poriadku" je rozsvietená kontrolka normálneho stavu; stavový riadok
    // nad prístrojmi to už povedal jednou vetou drobným písmom.
    acked.length ? (
      <button onClick={() => setShowAcked(true)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", padding: 0 }}>
        Ukázať skryté ({acked.length})
      </button>
    ) : null
  ) : (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <H3>
          <Info
            text="Zoznam vecí na akciu. Červené sú tie, kde sa niečo pokazí, ak sa nič nespraví — tie sú vidieť vždy. Zvyšok je pracovný zoznam a je za jedným klikom, aby dôležité veci nezanikli v množstve bežných. Debatovať o nich vieš aj s Jarvisom."
            label={kriticke.length ? `Vyžaduje akciu (${kriticke.length})` : `Na čo sa pozrieť (${bezne.length})`}
          />
        </H3>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {acked.length > 0 && (
            <button onClick={() => setShowAcked(true)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
              Skryté ({acked.length})
            </button>
          )}
        </div>
      </div>

      {kriticke.slice(0, VIDITELNYCH).map((r) => (
        <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} chat={assistantChat} />
      ))}
      {kriticke.length > VIDITELNYCH && !registerExpanded && (
        <div style={{ fontSize: 11.5, color: C.orange, padding: "4px 2px" }}>
          …a ďalších {kriticke.length - VIDITELNYCH} naliehavých
        </div>
      )}

      {registerExpanded && (
        <>
          {kriticke.slice(VIDITELNYCH).map((r) => (
            <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} chat={assistantChat} />
          ))}
          {bezne.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 6px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: C.textDim }}>Bežný zoznam</span>
              <div style={{ flex: 1, height: 1, background: mix(C.border, 50) }} />
            </div>
          )}
          {bezne.map((r) => (
            <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} chat={assistantChat} />
          ))}
        </>
      )}

      {(bezne.length > 0 || kriticke.length > VIDITELNYCH) && (
        <button
          onClick={() => setRegisterExpanded((v) => !v)}
          style={{ marginTop: 6, background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", padding: "2px 0", fontWeight: 500 }}
        >
          {registerExpanded ? "Zbaliť" : `Zobraziť aj bežný zoznam (${bezne.length + Math.max(0, kriticke.length - VIDITELNYCH)})`}
        </button>
      )}
    </Card>
  );

  const shown = arranging ? layout.order : layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <>
      <PrehladPanel
        kotva={pristroje.kotva}
        vysledok={pristroje.vysledok}
        varovne={pristroje.varovne}
        zmeny={zmeny}
        zmenyTs={odMinule?.ts ?? null}
        vyzaduju={{ kritickych: kriticke.length }}
        uzavrety={pristroje.uzavrety}
        onUzavrety={() => onNavigate("vzas", "pnl")}
        registerPanel={
          <>
            {registerPanel}
            {/* Koniec balíčka je pripnutý hneď za registrom, nie v mriežke.
                Je to jediná karta, ktorá hovorí o PENIAZOCH, čo sa dajú získať
                zajtra — kto má dochodené hodiny, ten buď kúpi ďalší balíček,
                alebo odíde. V mriežke sa dala presunúť, skryť aj prepnúť preč
                prepínačom sekcií, a tým sa dala prehliadnuť práve vtedy, keď
                na nej najviac záležalo. */}
            {nodes.koniecBalicka}
          </>
        }
        cerstvost={cerstvost}
        vpravo={<TrainerPills value={trainer} onChange={onTrainer} />}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
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

      {/* Prepínač sekcií. Pri usporadúvaní sa vypína — presúvať karty medzi
          sekciami, z ktorých je vidieť len jedna, sa nedá. */}
      {!arranging && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {sekcieSKartami.map((sk) => {
            const pocet = WIDGETS.filter((w) => w.sekcia === sk.id && !layout.hidden.includes(w.id)).length;
            const aktivna = sekcia === sk.id;
            return (
              <button
                key={sk.id}
                onClick={() => zvolSekciu(sk.id)}
                title={sk.popis}
                style={{
                  padding: "6px 14px", borderRadius: 18, fontSize: 12.5, cursor: "pointer",
                  border: `1px solid ${aktivna ? C.accent : C.border}`,
                  background: aktivna ? C.accentBg : "transparent",
                  color: aktivna ? C.accentLight : pocet ? C.textMuted : C.textDim,
                  fontWeight: aktivna ? 600 : 400,
                }}
              >
                {sk.label} <span style={{ color: aktivna ? mix(C.accentLight, 70) : C.textDim, fontSize: 11 }}>{pocet}</span>
              </button>
            );
          })}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Obdobie grafov:</span>
            <Select
              value={obdobie.startsWith("custom") ? "custom" : obdobie}
              onChange={zvolObdobie}
              options={OBDOBIA_DASH}
            />
            {obdobie.startsWith("custom") && (
              <>
                <input type="month" value={obdobie.slice(7).split("|")[0] || ""}
                  onChange={(e) => zvolObdobie(`custom:${e.target.value}|${obdobie.slice(7).split("|")[1] || ""}`)}
                  style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }} />
                <span style={{ color: C.textDim }}>–</span>
                <input type="month" value={obdobie.slice(7).split("|")[1] || ""}
                  onChange={(e) => zvolObdobie(`custom:${obdobie.slice(7).split("|")[0] || ""}|${e.target.value}`)}
                  style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }} />
              </>
            )}
          </div>
        </div>
      )}

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


      {sekcieSKartami.filter((s) => arranging || s.id === sekcia).map((s) => {
        const ids = shown.filter((id) => WIDGETS.find((w) => w.id === id)?.sekcia === s.id);
        if (!ids.length) {
          // Prázdna sekcia by po prepnutí nechala bielu plochu bez vysvetlenia.
          return arranging ? null : (
            <div key={s.id} style={{ padding: "18px 14px", borderRadius: 10, border: `1px dashed ${mix(C.border, 80)}`, color: C.textMuted, fontSize: 12.5 }}>
              V tejto sekcii nemáš zapnutý žiadny graf. Zapni si ich cez <strong style={{ color: C.text }}>▦ Grafy</strong>.
            </div>
          );
        }
        return (
          // scrollMarginTop nechá pri zrolovaní hlavičku sekcie pod lepiacim headerom.
          <div key={s.id} id={`sekcia-${s.id}`} style={{ scrollMarginTop: 64, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: C.textDim }}>{s.label}</span>
              <div style={{ flex: 1, height: 1, background: mix(C.border, 55) }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoFlow: "row dense", gap: 12, alignItems: "stretch" }}>
              {ids.map((id, i) => {
                const meta = WIDGETS.find((w) => w.id === id);
                if (!meta) return null;
                // Čiara medzi zapnutými a vypnutými kartami. Bez nej vyzerá
                // zoznam v režime Usporiadať ako jedna kopa a nie je vidieť,
                // kde končí to, čo je naozaj na ploche.
                const prvyVypnuty = arranging && layout.hidden.includes(id) && (i === 0 || !layout.hidden.includes(ids[i - 1]));
                return (
                  <Fragment key={id}>
                    {prvyVypnuty && (
                      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, margin: "6px 0 2px" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.textDim }}>
                          vypnuté — nie sú na ploche
                        </span>
                        <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${mix(C.border, 90)}` }} />
                      </div>
                    )}
                    <WidgetShell meta={meta} cols={cols} arranging={arranging} isHidden={layout.hidden.includes(id)} layout={layout}>
                      {nodes[id]}
                    </WidgetShell>
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}

    </>
  );
}

function CapacityCard({ capacity, trainer, onNavigate }: { capacity: CapacityRow[]; trainer: string; onNavigate: (t: string, sub?: string) => void }) {
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
        <button onClick={() => onNavigate("klienti", "klienti")} style={{ ...linkBtn, fontSize: 12 }}>Detail →</button>
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

function RegisterRow({ item, actions, onNavigate, chat }: { item: RegisterItem; actions: Actions; onNavigate: (tab: string, sub?: string, focus?: NavFocus) => void; chat?: AssistantChat }) {
  /** Otvorené okienko odpovede pre túto položku. */
  const [odpoved, setOdpoved] = useState(false);
  const [text, setText] = useState("");
  const [odlozit, setOdlozit] = useState(false);

  const odloz = (dni: number) => {
    const d = new Date(Date.now() + dni * 86400000).toISOString().slice(0, 10);
    actions.ackAnomaly(item.key, `odlozene|${d}|`, true);
    setOdlozit(false);
  };
  const jump = item.category === "6M" ? "6m" : item.category === "Kapacita" ? "treningy" : "klienti";
  const jeRozhodnutie = item.category === "Rozhodnutie";
  // Niektoré položky nemajú klienta, majú miesto, kam sa ide pozrieť —
  // nesú ho v `client` ako „tab|podzáložka". Rozhoduje o tom prítomnosť
  // zvislej čiary, nie kategória: chýbajúci nájom je anomália rovnako ako
  // mlčiaci klient, ale otvoriť treba VZAS, nie kartu klienta.
  const zapisCiel = (item.client || "").includes("|") ? item.client!.split("|") : null;
  // Tretí diel cieľa je mesiac: „vysledky|mesacne|2026-07" otvorí obrazovku
  // AJ rozroluje otázky toho mesiaca. Doviesť človeka k tabuľke a nechať ho
  // hľadať riadok je polovičná práca — pripomienka má viesť až k písaniu.
  const openItem = () =>
    zapisCiel
      ? onNavigate(
          zapisCiel[0],
          zapisCiel[1] || undefined,
          // Tretie pole je buď mesiac, alebo týždeň (predpona „t:"). Bez neho
          // klik dopadol na zoznam a človek si riadok hľadal sám.
          zapisCiel[2]?.startsWith("t:")
            ? { week: weekLabel(zapisCiel[2].slice(2)), nonce: Date.now() }
            : zapisCiel[2]
              ? { month: zapisCiel[2], nonce: Date.now() }
              : undefined,
        )
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

  // Odpoveď ide Jarvisovi aj s položkou, ktorej sa týka. Bez toho by musel
  // Jerry prepisovať kontext, ktorý appka už pozná — a práve to je dôvod,
  // prečo sa takéto veci nikdy nezapíšu.
  const posliJarvisovi = () => {
    if (!chat || !text.trim()) return;
    // Odpoveď sa zapíše HNEĎ, deterministicky — nie až Jarvisovou akciou.
    //
    // 9. 8. sa presne tu stratila odpoveď o Danovi Kouřilovi: Jerry ju
    // odoslal, stream sa nedokončil, ack nevznikol a položka ticho zostala
    // otvorená. Zápis odpovede je účtovníctvo a účtovníctvo nesmie závisieť
    // od toho, či dobehne odpoveď jazykového modelu. Položka sa uzavrie
    // s odpoveďou ako poznámkou; keby sa ukázalo, že sa uzavrieť nemala,
    // „Vrátiť" ju otvorí späť a poznámka zostáva.
    actions.ackAnomaly(item.key, `odpoveď: ${text.trim()}`, true);
    chat.setFloatingOpen(true);
    void chat.ask(
      `Toto je odpoveď na položku z registra „Na čo sa pozrieť“.\n\n` +
      `key: ${item.key}\n` +
      `Položka (${item.category}): ${item.title}\n` +
      `Detail: ${item.detail}\n\n` +
      `Moja odpoveď: ${text.trim()}\n\n` +
      `Odpoveď je už zapísaná k položke a položka je uzavretá — NEZAPISUJ ju znova ` +
      `a neposielaj ack-anomaly. Tvoja práca je nadstavba: ak z odpovede vyplýva ` +
      `pripomienka do budúcnosti, zapíš záver (zapis-zaver s termínom overenia); ` +
      `ak vyplýva úprava dát, navrhni ju; ak nevyplýva nič, len krátko potvrď. ` +
      `Ak ti chýba informácia, spýtaj sa — nehádaj.`,
    );
    setText("");
    setOdpoved(false);
  };

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
          {/* „Otvoriť" ťa prepne na miesto, ale odpoveď na otázku typu „prečo
              chýba nájom" tam nikde nezapíšeš. Odpovedať sa dá rovno tu —
              text ide Jarvisovi aj s tým, čoho sa týka, takže nemusíš
              vysvetľovať kontext, ktorý appka už pozná. */}
          {chat && !item.acked && (
            <button onClick={() => setOdpoved((o) => !o)} style={{ ...linkBtn, color: odpoved ? C.accentLight : C.accent }}>
              {odpoved ? "Zavrieť" : "Odpovedať"}
            </button>
          )}
          {/* „Skryť" znamenalo navždy — jediná možnosť, ako sa zbaviť veci,
              ktorá práve nie je na rade, bola zabudnúť na ňu. Odloženie ju
              vráti samo. */}
          {!item.acked && (
            <button onClick={() => setOdlozit((o) => !o)} style={{ ...linkBtn, color: odlozit ? C.accentLight : C.textMuted }}>
              {odlozit ? "Zavrieť" : "Odložiť"}
            </button>
          )}
          {/* „Nehlásiť" umlčí CELÝ druh upozornenia, nie jeden dátum.
              Skryť rieši jednu položku — lenže kľúč nesie dátum („dnes|
              2026-08-09|Jan Kral"), takže tá istá vec bola zajtra späť
              a Skryť vyzeralo, že nefunguje. Toto je odpoveď na „niektoré
              sú irelevantné": povieš to raz a je ticho. Vrátiť sa dá
              v Skrytých. Od 10. 8. ho majú VŠETKY položky (Jerry: „nehlásiť
              mi daj na všetky udalosti") — položka bez rodiny sa umlčí podľa
              vlastného kľúča. */}
          {item.acked ? (
            <button onClick={() => { actions.ackAnomaly(item.key, "", false); if (item.rodina) actions.ackAnomaly(`mute|${item.rodina}`, "", false); }} style={linkBtn}>Vrátiť</button>
          ) : (
            <>
              <button onClick={() => actions.ackAnomaly(item.key, "skryté")} style={{ ...linkBtn, color: C.textDim }}>Skryť</button>
              <button
                onClick={() => actions.ackAnomaly(`mute|${item.rodina || item.key}`, "nehlásiť tento druh")}
                title="Už mi tento druh upozornenia nehlás — ani zajtra, ani o mesiac"
                style={{ ...linkBtn, color: C.textDim }}
              >
                Nehlásiť
              </button>
            </>
          )}
        </div>
      </div>

      {odlozit && (
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${mix(C.border, 70)}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>Pripomenúť o:</span>
          {[["3 dni", 3], ["týždeň", 7], ["2 týždne", 14], ["mesiac", 30]].map(([lbl, dni]) => (
            <button key={String(lbl)} onClick={() => odloz(Number(dni))}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 11px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {odpoved && chat && (
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${mix(C.border, 70)}` }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); posliJarvisovi(); }
              if (e.key === "Escape") setOdpoved(false);
            }}
            autoFocus
            rows={3}
            placeholder="Napíš, ako to je — napr. „nájom sa platil v hotovosti 28.7., dopíš ho do júla“."
            style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <button
              onClick={posliJarvisovi}
              disabled={!text.trim()}
              style={{ background: text.trim() ? C.accentBg : "transparent", border: `1px solid ${text.trim() ? C.accent : C.border}`, borderRadius: 7, padding: "5px 13px", color: text.trim() ? C.accentLight : C.textDim, fontSize: 12, cursor: text.trim() ? "pointer" : "default" }}
            >
              Poslať Jarvisovi
            </button>
            <span style={{ fontSize: 11, color: C.textDim }}>
              Jarvis dostane aj to, čoho sa to týka — kontext písať nemusíš. ⌘/Ctrl+Enter odošle.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

