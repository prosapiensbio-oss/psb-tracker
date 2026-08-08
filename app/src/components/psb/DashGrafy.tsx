import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { fetchBtcReserve, fetchVzasSettings, fetchWeekEntries } from "../../lib/psb/client";
import { membershipBucket, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { GA4_MESACNE, GSC_MESACNE, MKT_MESACNE, nastavMarketingZImportu, nastavWebZImportu, type Ga4Mesiac, type GscDopyt, type GscMesiac, type GscStrana, type MktKus, type MktMesiac } from "../../lib/psb/marketing";
import { C, MEMBERSHIP_COLORS, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import {
  byCommitment, commitmentTotal, computeKpis, jarekCalc, kpiDefs, KPI_GROUP_LABELS, nastavPrijmyZTrackera,
  pnlCalc, QUARTERS, salaryCalc, VZAS_MONTH_LABELS, VZAS_MONTHS, VZAS_TARGETS_BY_YEAR, vzasVerzia,
  type KpiGroup, type KpiOverrides, poslednyMesiacSDatami,} from "../../lib/psb/vzas";
import { kpiFmt } from "./Vzas";
import { doPlnehoMesiaca, kotvaDat, monthlyFinance, predictCash, predictEarnings } from "../../lib/psb/compute";
import type { KanalRiadok } from "./Kanaly";
import { ZDROJE } from "./Klienti";
import { tokyKlientov } from "./Fluktuacia";
import { PlatobneKanaly } from "./PlatobneKanaly";
import { BarRow, Card, Donut, Empty, H3, Info, LineChart, Modal, ValueBars } from "./ui";

// Knižnica grafov.
//
// Dashboard mal šesť kariet a zvyšok appky ďalších dvadsať grafov, ku ktorým sa
// človek dostal len tak, že vedel, na ktorej obrazovke bývajú. Jerry to
// pomenoval ako pilot: na jednu plochu sa pozriem a viem, čo sa deje vnútri aj
// vonku. Lenže „všetko naraz" nie je kokpit, to je hluk — preto katalóg:
// všetky grafy z celej appky sú tu, roztriedené do štyroch sekcií, a každý si
// zapneš alebo vypneš. Východzia zostava je tá, ktorú treba týždenne; zvyšok
// čaká v knižnici, kým ho niekto nezavolá.
//
// Grafy sú skutočné, nie odkazy — počítajú sa z tých istých funkcií ako na
// svojich domovských obrazovkách (jedna aritmetika, jedna pravda). Klik na
// kartu vedie tam, kde sa s číslom dá pracovať.

export type SekciaId = "peniaze" | "vytazenie" | "klienti" | "marketing" | "vysledky";
// Poradie podľa Jerryho (2026-08-07): vyťaženie → klienti → peniaze →
// marketing → výsledky. Je to poradie príčiny a následku, nie dôležitosti —
// odrobené hodiny vyrobia klientov, klienti vyrobia peniaze. Peniaze sú
// výsledok tých dvoch a v paneli prístrojov hore sú aj tak prvé.
export const SEKCIE: { id: SekciaId; label: string; popis: string }[] = [
  { id: "vytazenie", label: "Vyťaženie", popis: "Koľko robíme a koľko ešte zvládneme." },
  { id: "klienti", label: "Klienti", popis: "Pribúdajú, alebo len rotujú?" },
  { id: "peniaze", label: "Peniaze", popis: "Zarábame? A vydržíme?" },
  { id: "marketing", label: "Marketing", popis: "Odkiaľ chodia noví ľudia." },
  { id: "vysledky", label: "Výsledky", popis: "KPI proti cieľom — každé číslo sa dá vypnúť zvlášť." },
];

// KPI sa neberú ako jeden veľký graf, ale ako štyri karty podľa skupín z
// Výsledkov — a v knižnici si v každej karte odškrtneš, ktoré riadky chceš
// vidieť. Deväť KPI naraz je tabuľka; tri, ktoré práve riešiš, sú prístroj.
const KPI_ROK = (() => {
  const r = new Date().toISOString().slice(0, 4);
  return r === "2025" ? "2025" : "2026";
})();
export const KPI_KARTY: { id: string; group: KpiGroup }[] = [
  { id: "kpiPeniaze", group: "peniaze" },
  { id: "kpiLievik", group: "lievik" },
  { id: "kpiKapacita", group: "kapacita" },
  { id: "kpiCena", group: "cena" },
];
/** Definície KPI pre knižnicu (bez hodnôt — tie potrebujú dáta). */
export const kpiVSkupine = (g: KpiGroup) => kpiDefs(KPI_ROK).filter((d) => d.group === g);

export type WidgetMeta = {
  id: string;
  label: string;
  span: 1 | 2;
  sekcia: SekciaId;
  /** Východzia zostava — čo je v kokpite hneď po otvorení. */
  vychodzi?: boolean;
  popis: string;
  /** Domovská obrazovka grafu (kam vedie klik). */
  doma?: string;
  /** Karta si drží vlastnú výšku namiesto natiahnutia na riadok. */
  noStretch?: boolean;
};

export const WIDGETS: WidgetMeta[] = [
  // ── Peniaze ────────────────────────────────────────────────────────────────
  { id: "zarobky", label: "Mesačné tržby", span: 1, sekcia: "peniaze", vychodzi: true, popis: "Prijaté platby po mesiacoch + odhad ďalších dvoch.", doma: "Financie" },
  { id: "zdravieFirmy", label: "Zdravie firmy", span: 1, sekcia: "peniaze", vychodzi: true, popis: "Break-even, rezerva nad ním, podiel miezd, koľko sa dá škrtnúť.", doma: "VZAS" },
  { id: "pasmoZisku", label: "Pásmo zisku", span: 1, sekcia: "peniaze", popis: "Hrubý zisk po mesiacoch — kedy firma zarábala a kedy nie.", doma: "VZAS" },
  { id: "prijmyNaklady", label: "Príjmy vs. náklady", span: 1, sekcia: "peniaze", popis: "Obe krivky vedľa seba — kde sa rozchádzajú.", doma: "VZAS" },
  { id: "prebytok", label: "Kumulovaný prebytok", span: 1, sekcia: "peniaze", popis: "Súčet ziskov a strát od začiatku — čo firma reálne vytvorila.", doma: "VZAS" },
  { id: "dlhTreneri", label: "Dlh voči trénerom", span: 1, sekcia: "peniaze", popis: "Kumulovaný rozdiel medzi nárokom a poslaným, Jerry aj Terezka.", doma: "VZAS → Mzdy" },
  { id: "dlhJarek", label: "Dlh voči Jarkovi", span: 1, sekcia: "peniaze", popis: "Zostatok investorského dlhu a tempo splácania.", doma: "VZAS → Dlhy" },
  { id: "kvartaly", label: "Kvartálne tržby", span: 1, sekcia: "peniaze", popis: "Tržby a marža po kvartáloch — sezónnosť na jeden pohľad.", doma: "Výsledky" },
  { id: "ciele", label: "Ciele roka", span: 1, sekcia: "peniaze", popis: "Tržby a marža proti cieľu 2026, prepočítané na uplynulé mesiace.", doma: "Výsledky" },
  { id: "btc", label: "Bitcoinová rezerva", span: 1, sekcia: "peniaze", popis: "Hodnota rezervy a koľko mesiacov prevádzky pokryje.", doma: "VZAS → Rezerva" },

  // ── Vyťaženie ──────────────────────────────────────────────────────────────
  { id: "hodiny", label: "Odrobené hodiny / týždeň", span: 1, sekcia: "vytazenie", vychodzi: true, popis: "Týždenné hodiny so zdravou zónou 24–34 h.", doma: "Tréningy" },
  { id: "zony", label: "Týždne v zdravej zóne", span: 1, sekcia: "vytazenie", vychodzi: true, popis: "Koľko týždňov padlo do zóny, pod ňu a nad ňu.", doma: "Tréningy" },
  { id: "kapacita", label: "Kapacita & vyťaženie", span: 1, sekcia: "vytazenie", vychodzi: true, popis: "Koľko klientov ešte zvládnete pri zdravom týždni.", doma: "Klienti" },
  { id: "hodinyMes", label: "Hodiny po mesiacoch", span: 1, sekcia: "vytazenie", popis: "Dlhší horizont než týždne — sezónnosť práce a vyhorenie.", doma: "Výsledky" },
  { id: "sedeniaMes", label: "Počet sedení / mesiac", span: 1, sekcia: "vytazenie", popis: "Objem práce v kusoch — predstih pred tržbami.", doma: "Financie" },
  { id: "typySedeni", label: "Pomer typov sedení", span: 1, sekcia: "vytazenie", popis: "Offline, online a úvodné — z čoho sa skladá prevádzka.", doma: "Tréningy" },
  { id: "zrusene", label: "Zrušené a presunuté", span: 1, sekcia: "vytazenie", popis: "Stratená kapacita z týždenných zápisov, po trénerovi.", doma: "Tréningy" },

  // ── Klienti ────────────────────────────────────────────────────────────────
  { id: "rastStrata", label: "Rast a strata klientov", span: 1, sekcia: "klienti", vychodzi: true, popis: "Prišlo, odišlo a čistý rast za mesiac.", doma: "Klienti → Rast a strata" },
  { id: "6m", label: "6M klienti podľa fázy", span: 1, sekcia: "klienti", vychodzi: true, popis: "Obnova, integrácia, udržateľnosť — kde v procese ľudia sú.", doma: "Klienti → 6M proces" },
  { id: "balicky", label: "Klienti podľa balíčka", span: 1, sekcia: "klienti", popis: "Rozdelenie podľa členstva — na čom stojí príjem.", doma: "Klienti" },
  { id: "kdeTecie", label: "Kde to tečie", span: 1, sekcia: "klienti", popis: "Ako dlho vydržali tí, čo odišli — odchod v prvých mesiacoch má inú príčinu než po roku.", doma: "Klienti → Rast a strata" },
  { id: "prezitie", label: "Kto vydrží (kohorty)", span: 1, sekcia: "klienti", popis: "Koľko z každého mesiaca príchodov je tu po 3, 6 a 12 mesiacoch.", doma: "Klienti → Rast a strata" },
  { id: "hodnotaZdroj", label: "Čo klient prinesie podľa zdroja", span: 1, sekcia: "klienti", popis: "Priemerná tržba na klienta podľa toho, odkiaľ prišiel.", doma: "Klienti → Rast a strata" },

  // ── Marketing ──────────────────────────────────────────────────────────────
  { id: "lievik", label: "Lievik — tento mesiac", span: 1, sekcia: "marketing", vychodzi: true, popis: "Dopyty → úvodné → noví klienti v bežiacom mesiaci.", doma: "Marketing → Lievik" },
  { id: "konverziaZdroj", label: "Konverzia dopytov podľa zdroja", span: 1, sekcia: "marketing", popis: "Ktorý zdroj dopytov sa naozaj mení na klientov.", doma: "Klienti → Dopyty" },
  { id: "dosahIG", label: "Dosah Instagramu", span: 1, sekcia: "marketing", popis: "Zobrazenia a dosah po mesiacoch z Metricoolu.", doma: "Marketing → Dosah" },
  { id: "web", label: "Web (GA4)", span: 1, sekcia: "marketing", popis: "Noví návštevníci a kľúčové udalosti po mesiacoch.", doma: "Marketing → Dosah" },
  { id: "vyhladavanie", label: "Vyhľadávanie (Search Console)", span: 1, sekcia: "marketing", popis: "Kliky z Googlu a miera prekliku po mesiacoch.", doma: "Marketing → Dosah" },
  { id: "kanaly", label: "Kanály — mesačný súhrn", span: 1, sekcia: "marketing", popis: "Facebook, TikTok, YouTube a ďalšie z mesačnej zostavy.", doma: "Marketing → Dosah" },

  // Doplnené 2026-08-07 na Jerryho pokyn „dopln fakt všetky, aj tie čo sú len
  // zvýraznené čísla". Karty bez grafu sú rovnocenné — súhrn P&L alebo cena
  // sedenia je číslo, ktoré sa číta rýchlejšie než akákoľvek krivka.
  { id: "breakEven", label: "Tržby vs. break-even", span: 1, sekcia: "peniaze", vychodzi: true, popis: "Kde je zelená pod oranžovou, mesiac nezarobil ani na vlastnú prevádzku.", doma: "Peniaze → Zisky a straty" },
  { id: "predikciaTrzieb", label: "Predikcia tržieb", span: 1, sekcia: "peniaze", vychodzi: true, popis: "Tri mesiace dopredu s pásmom istoty — od zaručeného po optimistický.", doma: "Peniaze → Predikcia" },
  { id: "predikciaScen", label: "Scenáre na 3 mesiace", span: 1, sekcia: "peniaze", popis: "Zaručené z balíčkov, realistický a negatívny scenár.", doma: "Peniaze → Predikcia" },
  { id: "pnlSuhrn", label: "Súhrn P&L", span: 1, sekcia: "peniaze", popis: "Príjmy, náklady, hrubý zisk a marža — priemer na mesiac.", doma: "Peniaze → Zisky a straty" },
  { id: "naklady", label: "Fixné vs. variabilné", span: 1, sekcia: "peniaze", popis: "Z čoho sa skladajú náklady a ktorá časť rastie.", doma: "Peniaze → Zisky a straty" },
  { id: "runRate", label: "Run-rate a odhad zisku", span: 1, sekcia: "peniaze", popis: "Tempo posledných troch mesiacov prepočítané na rok.", doma: "Peniaze → Predikcia" },
  { id: "h1", label: "H1 2025 vs. H1 2026", span: 1, sekcia: "peniaze", popis: "Prvý polrok proti prvému polroku — rast bez sezónnosti.", doma: "Výsledky" },

  { id: "cenaSedenia", label: "Ø cena sedenia", span: 1, sekcia: "vytazenie", popis: "Koľko priemerne prinesie jedno odtrénované sedenie.", doma: "Peniaze → Sedenia & cena" },
  { id: "narocnost", label: "Náročnosť týždňov", span: 1, sekcia: "vytazenie", popis: "Vlastné hodnotenie 1–10 z týždenných zápisov — predstih pred vyhorením.", doma: "Tréningy → Prehľad" },
  { id: "suhrnSedeni", label: "Súhrn sedení", span: 1, sekcia: "vytazenie", popis: "Offline, online a úvodné v kusoch za posledný rok.", doma: "Tréningy → Analýza" },

  { id: "segmenty", label: "Segmenty klientov", span: 1, sekcia: "klienti", popis: "Koľko je Anchorov, Stabilných a Sporadických — na kom firma stojí.", doma: "Klienti" },
  { id: "dochadzka", label: "Dochádzka", span: 1, sekcia: "klienti", popis: "Priemerná dochádzka a koľko ľudí je pod hranicou.", doma: "Klienti" },
  { id: "referencny", label: "Referenčný motor", span: 1, sekcia: "klienti", popis: "Koľko klientov prišlo na odporúčanie a čo priniesli.", doma: "Klienti → Referencie" },
  { id: "platobneKanaly", label: "Čím klienti platia", span: 1, sekcia: "klienti", popis: "Účet, hotovosť a bitcoin — koľko tržieb ide ktorou cestou.", doma: "Peniaze → Po mesiacoch" },
  { id: "zdrojeKlientov", label: "Odkiaľ klienti prišli", span: 1, sekcia: "klienti", popis: "Rozdelenie aktívnych klientov podľa zdroja.", doma: "Klienti" },

  { id: "cenaUvodneho", label: "Čo stojí úvodný", span: 1, sekcia: "marketing", popis: "Marketingové náklady delené počtom úvodných tréningov.", doma: "Marketing → Lievik" },
  { id: "ltvZdroj", label: "Hodnota klienta (LTV)", span: 1, sekcia: "marketing", popis: "Koľko klient priemerne zaplatí za celý čas spolupráce.", doma: "Klienti → Rast a strata" },
  { id: "kohortyDopytov", label: "Kohorty dopytov", span: 1, sekcia: "marketing", popis: "Z koľkých dopytov daného mesiaca sa nakoniec stali klienti.", doma: "Marketing → Lievik" },

  // ── Výsledky (KPI) ─────────────────────────────────────────────────────────
  { id: "kpiPeniaze", label: `KPI ${KPI_ROK} — Peniaze`, span: 1, sekcia: "vysledky", popis: "Tržby, marža, odstup od break-evenu, rezerva v mesiacoch.", doma: "Výsledky → KPI" },
  { id: "kpiLievik", label: `KPI ${KPI_ROK} — Lievik`, span: 1, sekcia: "vysledky", popis: "Úvodné tréningy a úspešnosť po úvodnom.", doma: "Výsledky → KPI" },
  { id: "kpiKapacita", label: `KPI ${KPI_ROK} — Kapacita a klienti`, span: 1, sekcia: "vysledky", popis: "Aktívni klienti, odtrénované hodiny, dĺžka spolupráce.", doma: "Výsledky → KPI" },
  { id: "kpiCena", label: `KPI ${KPI_ROK} — Cena a mix`, span: 1, sekcia: "vysledky", popis: "Hodinovka, hodnota klienta, online podiel, marketing z tržieb.", doma: "Výsledky → KPI" },
];

export const VYCHODZIE = new Set(WIDGETS.filter((w) => w.vychodzi).map((w) => w.id));

// ── Zdieľané drobnosti (Dashboard ich používa tiež) ──────────────────────────
export const centerBody: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" };

export function MiniStat({ label, value, color, onClick }: { label: ReactNode; value: string; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.track, borderRadius: 8, padding: "8px 10px",
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${onClick ? mix(C.accent, 22) : "transparent"}`, minWidth: 0,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? C.accentLight, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 3, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
        {onClick && <span style={{ color: C.textDim }}>→</span>}
      </div>
    </div>
  );
}

/** Obal karty, ktorá sa dá otvoriť na svojej domovskej obrazovke. */
function Klik({ kam, onNavigate, children }: { kam?: () => void; onNavigate?: string; children: ReactNode }) {
  return (
    <div onClick={kam} title={onNavigate ? `Otvoriť ${onNavigate}` : undefined} style={{ ...centerBody, cursor: kam ? "pointer" : "default" }}>
      {children}
    </div>
  );
}

// ── Knižnica (modálne okno) ──────────────────────────────────────────────────
export function GrafyKniznica({
  hidden, onToggle, onSekciaVsetko, onReset, onClose, kpiSkryte, onKpi,
}: {
  hidden: string[];
  onToggle: (id: string) => void;
  onSekciaVsetko: (sekcia: SekciaId, zapnut: boolean) => void;
  onReset: () => void;
  onClose: () => void;
  /** Jednotlivé KPI riadky, ktoré sa v karte nemajú ukazovať. */
  kpiSkryte: string[];
  onKpi: (id: string) => void;
}) {
  const zapnutych = WIDGETS.filter((w) => !hidden.includes(w.id)).length;
  return (
    <Modal title={`Knižnica grafov — zapnutých ${zapnutych} z ${WIDGETS.length}`} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55, marginBottom: 14 }}>
        Všetky grafy z celej appky. Zapnuté sa objavia na dashboarde vo svojej sekcii, vypnuté tu počkajú.
        Poradie a šírku kariet meníš cez <b style={{ color: C.textMuted }}>⠿ Usporiadať</b>. Uloží sa v tomto prehliadači.
      </div>

      {SEKCIE.map((s) => {
        const vSekcii = WIDGETS.filter((w) => w.sekcia === s.id);
        const zap = vSekcii.filter((w) => !hidden.includes(w.id)).length;
        return (
          <div key={s.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: C.accentLight }}>{s.label}</span>
              <span style={{ fontSize: 11.5, color: C.textDim, flex: 1 }}>{s.popis} · {zap}/{vSekcii.length}</span>
              <button onClick={() => onSekciaVsetko(s.id, true)} style={maliBtn}>všetko</button>
              <button onClick={() => onSekciaVsetko(s.id, false)} style={maliBtn}>nič</button>
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {vSekcii.map((w) => {
                const zapnute = !hidden.includes(w.id);
                const kpiKarta = KPI_KARTY.find((k) => k.id === w.id);
                return (
                  <div key={w.id}>
                  <button
                    onClick={() => onToggle(w.id)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", width: "100%", cursor: "pointer",
                      padding: "9px 11px", borderRadius: 9,
                      border: `1px solid ${zapnute ? mix(C.accent, 40) : C.border}`,
                      background: zapnute ? mix(C.accent, 7) : "transparent",
                    }}
                  >
                    {/* Prepínač — vidieť stav bez čítania textu. */}
                    <span style={{
                      flexShrink: 0, marginTop: 2, width: 30, height: 17, borderRadius: 10, position: "relative",
                      background: zapnute ? mix(C.accent, 65) : C.track, border: `1px solid ${zapnute ? C.accent : C.border}`,
                    }}>
                      <span style={{
                        position: "absolute", top: 1.5, left: zapnute ? 14 : 2, width: 12, height: 12, borderRadius: "50%",
                        background: zapnute ? C.onAccent : C.textDim, transition: "left .12s",
                      }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: zapnute ? C.text : C.textMuted }}>
                        {w.label}
                        {w.vychodzi && <span style={{ fontSize: 10, color: C.textDim, fontWeight: 400 }}> · východzí</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: C.textDim, marginTop: 2, lineHeight: 1.45 }}>
                        {w.popis}{w.doma && <span style={{ color: mix(C.textDim, 80) }}> · doma v: {w.doma}</span>}
                      </span>
                    </span>
                  </button>

                  {/* KPI karta má vlastné riadky — tu sa vyberá, ktoré z nich
                      má ukazovať. Bez toho by karta bola tabuľka deviatich
                      čísel, čo je presne to, čo dashboard nemá byť. */}
                  {kpiKarta && zapnute && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "7px 11px 2px 51px" }}>
                      {kpiVSkupine(kpiKarta.group).map((d) => {
                        const von = kpiSkryte.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            onClick={() => onKpi(d.id)}
                            title={d.why}
                            style={{
                              fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: "pointer",
                              border: `1px solid ${von ? C.border : mix(C.accent, 45)}`,
                              background: von ? "transparent" : mix(C.accent, 12),
                              color: von ? C.textDim : C.accentLight,
                              textDecoration: von ? "line-through" : "none",
                            }}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button onClick={onReset} style={{ ...maliBtn, width: "100%", padding: "8px 12px", fontSize: 12 }}>
        Vrátiť východziu zostavu ({VYCHODZIE.size} grafov)
      </button>
    </Modal>
  );
}

const maliBtn: CSSProperties = {
  background: "none", border: `1px solid ${C.border}`, borderRadius: 7,
  color: C.textMuted, fontSize: 11.5, padding: "3px 10px", cursor: "pointer", whiteSpace: "nowrap",
};

// ── Grafy, ktoré nežijú v Dashboard.tsx ──────────────────────────────────────
const MES_LAB = VZAS_MONTHS.map((_, i) => VZAS_MONTH_LABELS[i]);

// Mesiace VZAS rastú dopredu (dnešný + jeden), takže posledné jeden-dva sú
// prázdne. Kreslené ako nula ich krivka zisku aj dlhu ťahala k zemi a graf
// hlásil prepad, ktorý sa nestal. Grafy preto končia posledným mesiacom, o
// ktorom model niečo vie.
const mesiaceSDatami = () => MES_LAB.slice(0, poslednyMesiacSDatami() + 1);

/**
 * Štandard rodiny P, rovnaký ako všade inde v appke.
 * „Vlastné" nesie rozsah priamo v hodnote (`custom:2026-01|2026-04`).
 */
export const OBDOBIA_DASH = [
  { value: "all", label: "Celé obdobie" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
  { value: "6m", label: "Posledných 6 mes." },
  { value: "3m", label: "Posledné 3 mes." },
  { value: "1m", label: "Posledný mesiac" },
  { value: "custom", label: "Vlastné" },
];

/**
 * Hranice okna ako kľúče mesiacov. Horná hranica je vždy najviac posledný
 * PLNÝ mesiac — filter nesmie vrátiť rozrobený mesiac, ktorý by v grafe
 * vyzeral ako prepad. Rok, ktorý ešte beží, sa preto oreže.
 */
export function hraniceObdobia(obdobie: string, poslMK: string): { od: string; do_: string } {
  const posun = (n: number) => {
    const [y, m] = poslMK.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - (n - 1), 1)).toISOString().slice(0, 7);
  };
  if (obdobie.startsWith("custom:")) {
    const [a, b] = obdobie.slice(7).split("|");
    return { od: a || "0000-01", do_: b && b < poslMK ? b : poslMK };
  }
  if (obdobie === "2025" || obdobie === "2026") {
    const koniec = `${obdobie}-12`;
    return { od: `${obdobie}-01`, do_: koniec < poslMK ? koniec : poslMK };
  }
  if (obdobie === "6m") return { od: posun(6), do_: poslMK };
  if (obdobie === "3m") return { od: posun(3), do_: poslMK };
  if (obdobie === "1m") return { od: posun(1), do_: poslMK };
  return { od: "0000-01", do_: poslMK };
}
const kcK = (n: number) => `${Math.round(n / 1000)}k`;

export function useExtraGrafy({
  data, clients, aktivne, onNavigate, kpiSkryte = [], obdobie = "all",
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  /** Zapnuté karty — dáta z API sa ťahajú len pre ne. */
  aktivne: Set<string>;
  onNavigate: (tab: string, sub?: string, focus?: { skupina?: { label: string; mena: string[] }; nonce?: number }) => void;
  kpiSkryte?: string[];
  /** Filter obdobia z hlavičky dashboardu (štandard rodiny P). */
  obdobie?: string;
}): Record<string, ReactNode> {
  // Živé tržby do VZAS pred každým výpočtom (idempotentné, rovnako ako pri Zisku).
  const vzas = useMemo(() => {
    const cash: Record<string, number> = {};
    for (const m of monthlyFinance(data)) cash[m.month] = m.cash;
    nastavPrijmyZTrackera(cash);
    const p = pnlCalc();
    const j = salaryCalc("jerry");
    const t = salaryCalc("terezka");
    const be = VZAS_MONTHS.map((_, i) => p.bezVyplat[i] + j.narok[i] + t.narok[i] + p.matyas[i]);
    return { p, j, t, be, jarek: jarekCalc() };
    // Verzia modelu: importy menia rady mimo Reactu, bez nej by karty ukazovali
    // stav spred načítania nákladov z banky.
  }, [data, vzasVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const toky = useMemo(() => tokyKlientov(data, clients), [data, clients]);

  // Posledný plný mesiac. Bez neho každý mesačný graf končil rozrobeným
  // mesiacom a posledný bod padal k zemi — vyzeralo to ako prepad.
  const kotva = useMemo(() => kotvaDat(data), [data]);

  // ── Dáta z API, len keď je príslušná karta zapnutá ──────────────────────────
  const [weeks, setWeeks] = useState<Record<string, Record<string, unknown>> | null>(null);
  useEffect(() => {
    if (!(aktivne.has("zrusene") || aktivne.has("narocnost")) || weeks) return;
    void fetchWeekEntries().then((w) => setWeeks(w as never));
  }, [aktivne, weeks]);

  // Rezervu potrebuje aj KPI „rezerva v mesiacoch prevádzky", nielen karta BTC.
  const chceKpi = KPI_KARTY.some((k) => aktivne.has(k.id));
  const [btc, setBtc] = useState<{ czk: number | null; sats: number } | null>(null);
  const [btcStav, setBtcStav] = useState<"load" | "ok" | "err">("load");
  useEffect(() => {
    if (!(aktivne.has("btc") || chceKpi) || btc) return;
    void fetchBtcReserve().then((r) => { setBtc(r); setBtcStav(r ? "ok" : "err"); });
  }, [aktivne, chceKpi, btc]);

  // Ciele, ktoré si Jerry posunul, žijú v DB — bez nich by karta merala proti
  // pôvodným číslam z hárku a ukazovala iný stav než obrazovka Výsledky.
  const [kpiOverrides, setKpiOverrides] = useState<KpiOverrides>({});
  const [kpiNacitane, setKpiNacitane] = useState(false);
  useEffect(() => {
    if (!chceKpi || kpiNacitane) return;
    void fetchVzasSettings().then((s) => {
      const t = s["kpi_targets"];
      if (t && typeof t === "object") setKpiOverrides(t as KpiOverrides);
      setKpiNacitane(true);
    }).catch(() => setKpiNacitane(true));
  }, [chceKpi, kpiNacitane]);

  const [kanaly, setKanaly] = useState<KanalRiadok[]>([]);
  const [mktTik, setMktTik] = useState(0);
  const chceMkt = aktivne.has("dosahIG") || aktivne.has("web") || aktivne.has("vyhladavanie") || aktivne.has("kanaly");
  useEffect(() => {
    if (!chceMkt || mktTik) return;
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { mesacne?: MktMesiac[]; top?: MktKus[]; ga4?: Ga4Mesiac[]; gscMesacne?: GscMesiac[]; gscDopyty?: GscDopyt[]; gscStrany?: GscStrana[]; kanaly?: KanalRiadok[] }) => {
        nastavMarketingZImportu(j.mesacne || [], j.top || []);
        nastavWebZImportu(j.ga4 || [], j.gscMesacne || [], j.gscDopyty || [], j.gscStrany || []);
        setKanaly(j.kanaly || []);
        setMktTik(1);
      })
      .catch(() => setMktTik(1));
  }, [chceMkt, mktTik]);

  return useMemo(() => {
    const { p, j, t, be, jarek } = vzas;

    // Okno filtra obdobia. `idxOkno` sú indexy do VZAS_MONTHS, `vMes` je to
    // isté pre grafy, ktoré rátajú z kľúčov mesiacov (tržby, hodiny, dosah).
    // Jedno miesto pre obe podoby — inak by tá istá voľba znamenala na dvoch
    // kartách iný rozsah.
    const poslI = poslednyMesiacSDatami();
    const { od: odMK, do_: doMK } = hraniceObdobia(obdobie, VZAS_MONTHS[poslI] || "9999-12");
    const idxOkno = VZAS_MONTHS.map((m, i) => [m, i] as const)
      .filter(([m, i]) => i <= poslI && m >= odMK && m <= doMK)
      .map(([, i]) => i);
    const vMes = (mk: string) => mk >= odMK && mk <= doMK;

    // ── Peniaze ──────────────────────────────────────────────────────────────
    // Posledných šesť mesiacov S DÁTAMI, nie posledných šesť slotov v poli.
    // VZAS má mesiace nadopred, takže sa do priemeru počítal aj rozrobený
    // (a prázdny) august — break-even tým klesol o desatinu a „mesiace
    // prevádzky z rezervy" vychádzali na 1,2 namiesto 1,0. Tá istá rodina
    // chýb ako kotvaDat: kód, ktorý predpokladá, že dáta siahajú tam, kam
    // siaha kalendár. Dotýkalo sa to všetkých štyroch čísel v „Zdravie firmy"
    // aj karty bitcoinovej rezervy.
    const posl = poslednyMesiacSDatami();
    const dlzka = Math.min(6, posl + 1);
    const idx6 = Array.from({ length: dlzka }, (_, k) => posl - dlzka + 1 + k);
    const beAvg = idx6.reduce((a, i) => a + be[i], 0) / idx6.length;
    const prAvg = idx6.reduce((a, i) => a + p.prijmy[i], 0) / idx6.length;
    const rezerva = beAvg > 0 ? ((prAvg - beAvg) / beAvg) * 100 : 0;
    const mzdy = idx6.reduce((a, i) => a + j.narok[i] + t.narok[i] + p.matyas[i], 0);
    const trzby6 = idx6.reduce((a, i) => a + p.prijmy[i], 0);
    const mzdyPct = trzby6 > 0 ? (mzdy / trzby6) * 100 : 0;
    const bk = byCommitment();
    const volitelne = idx6.reduce((a, i) => a + commitmentTotal(bk.volitelne)[i], 0) / idx6.length;
    const zavazne = idx6.reduce((a, i) => a + commitmentTotal(bk.zavazne)[i], 0) / idx6.length;
    const skrtPct = zavazne + volitelne > 0 ? (volitelne / (zavazne + volitelne)) * 100 : 0;

    const nodes: Record<string, ReactNode> = {};

    nodes.zdravieFirmy = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Zdravie firmy" text="Štyri čísla za posledných 6 mesiacov P&L. Break-even ráta s NÁROKOM trénerov (nie s tým, čo si reálne vzali) — to, čo si niekto vezme navyše, je pôžička, nie náklad. Rezerva pod 20 % znamená, že jeden slabý mesiac stačí na stratu." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS → Zdravie firmy">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Break-even / mes." value={fmtCZK(beAvg)} color={C.orange} />
            <MiniStat label="Rezerva nad ním" value={`${rezerva > 0 ? "+" : ""}${rezerva.toFixed(1)} %`} color={rezerva >= 20 ? C.green : rezerva >= 0 ? C.orange : C.red} />
            <MiniStat label="Mzdy z tržieb" value={`${mzdyPct.toFixed(0)} %`} color={mzdyPct <= 50 ? C.green : mzdyPct <= 60 ? C.orange : C.red} />
            <MiniStat label="Viem škrtnúť / mes." value={fmtCZK(volitelne)} color={skrtPct >= 30 ? C.green : C.orange} />
          </div>
        </Klik>
      </Card>
    );

    nodes.pasmoZisku = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Pásmo zisku" text="Hrubý zisk po mesiacoch (tržby mínus všetky náklady vrátane nárokov na výplaty). Čiara nula je hranica — pod ňou mesiac zožral viac, než priniesol. Tržby bez tejto krivky nehovoria nič." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [p.hrubyZisk[i]] }))}
            series={[{ name: "Hrubý zisk", color: C.green }]}
            refLine={{ value: 0, label: "nula", color: C.red }}
            height={190} fmt={kcK} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    nodes.prijmyNaklady = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Príjmy vs. náklady" text="Obe krivky vedľa seba. Zaujímavá nie je ich výška, ale medzera medzi nimi — a či sa rozširuje alebo zužuje." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [p.prijmy[i], p.celkoveNaklady[i]] }))}
            series={[{ name: "Príjmy", color: C.green }, { name: "Náklady", color: C.red }]}
            height={190} fmt={kcK} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    nodes.prebytok = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Kumulovaný prebytok" text="Súčet všetkých ziskov a strát od januára 2025. Ukazuje, čo firma za celý čas naozaj vytvorila — jeden dobrý mesiac nezmaže pol roka v mínuse." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS → Cashflow">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [p.hrubyZisk.slice(0, i + 1).reduce((a, v) => a + v, 0)] }))}
            series={[{ name: "Kumulovaný zisk", color: C.accent }]}
            refLine={{ value: 0, label: "nula", color: C.red }}
            height={190} fmt={kcK} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    nodes.dlhTreneri = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Dlh voči trénerom" text="Kumulovaný rozdiel medzi nárokom (Fix + variabil) a tým, čo si tréner reálne vybral. Kladné číslo = firma dlží trénerovi." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS → Mzdy">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [j.cumDebt[i], t.cumDebt[i]] }))}
            series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]}
            height={190} fmt={kcK} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    nodes.dlhJarek = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Dlh voči Jarkovi" text="Zostatok investorského dlhu po mesiacoch — vklady nahor, splátky nadol. Splácané je aj tréningami a zľavou na členstvo, nielen peniazmi." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS → Dlhy">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [jarek.stav[i]] }))}
            series={[{ name: "Zostatok dlhu", color: C.orange }]}
            refLine={{ value: 0, label: "splatené", color: C.green }}
            height={190} fmt={kcK} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    // Kvartál, ktorý ešte neskončil, sa nesmie postaviť vedľa hotových ako
    // rovnocenný stĺpec — vyzeral by ako prepad. Buď je celý pokrytý dátami,
    // alebo je označený ako neúplný; kvartál bez jediného plného mesiaca sa
    // nekreslí vôbec.
    const poslednyIdx = poslednyMesiacSDatami();
    const kvartaly = QUARTERS
      .filter((q) => q.idx.length && q.idx[0] <= poslednyIdx)
      .map((q) => {
        const cely = q.idx[q.idx.length - 1] <= poslednyIdx;
        return {
          label: cely ? q.label : `${q.label} *`,
          value: q.idx.reduce((a, i) => a + (i <= poslednyIdx ? p.prijmy[i] || 0 : 0), 0),
        };
      });
    const kvartalNeuplny = kvartaly.some((k) => k.label.endsWith("*"));
    nodes.kvartaly = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Kvartálne tržby" text="Tržby po kvartáloch — sezónnosť, ktorú mesačný graf rozdrobí. Posledný kvartál býva neúplný, kým sa neskončí." /></H3>
        <Klik kam={() => onNavigate("vysledky", "kvartalne")} onNavigate="Výsledky">
          {kvartaly.length ? <ValueBars data={kvartaly} color={C.accent} fmt={kcK} height={170} alignEnd /> : <Empty>Zatiaľ bez dát.</Empty>}
          {kvartalNeuplny && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>* kvartál ešte neskončil — obsahuje len uzavreté mesiace</div>
          )}
        </Klik>
      </Card>
    );

    // Ciele sú ročné — porovnávať ich s neúplným rokom je najľahší spôsob, ako
    // spraviť z dobrého roka neúspech. Preto sa prepočítajú na uplynulé mesiace.
    const rok = new Date().toISOString().slice(0, 4);
    const ciel = VZAS_TARGETS_BY_YEAR[rok] || VZAS_TARGETS_BY_YEAR["2026"];
    // Len uplynulé mesiace roka. Predtým sa počítali všetky, ktoré sú v poli —
    // vrátane prázdnych dopredu. Cieľ sa tak delil na viac mesiacov, než koľko
    // reálne prebehlo, a plnenie vychádzalo nižšie, než v skutočnosti bolo.
    const idxRok = VZAS_MONTHS
      .map((m, i) => (m.startsWith(rok) ? i : -1))
      .filter((i) => i >= 0 && i <= poslednyMesiacSDatami());
    const trzbyRok = idxRok.reduce((a, i) => a + p.prijmy[i], 0);
    const zisksRok = idxRok.reduce((a, i) => a + p.hrubyZisk[i], 0);
    const marzaRok = trzbyRok > 0 ? (zisksRok / trzbyRok) * 100 : 0;
    const cielKMes = idxRok.length ? (ciel.rocneTrzby / 12) * idxRok.length : 0;
    nodes.ciele = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label={`Ciele ${rok}`} text="Tržby a marža proti ročnému cieľu. Cieľ tržieb je prepočítaný na počet mesiacov, ktoré rok zatiaľ má — inak by aj skvelý rok vyzeral v marci na 25 %." /></H3>
        <Klik kam={() => onNavigate("vysledky", "ciele")} onNavigate="Výsledky → Ciele">
          <div style={{ marginTop: 6 }}>
            <BarRow
              label={`Tržby (${idxRok.length} mes.)`} value={trzbyRok} max={Math.max(cielKMes, trzbyRok)}
              color={trzbyRok >= cielKMes ? C.green : C.orange}
              sub={`${fmtCZK(trzbyRok)} z ${fmtCZK(cielKMes)}`}
            />
            <BarRow
              label="Marža" value={Math.max(0, marzaRok)} max={Math.max(ciel.marzaPct, marzaRok, 1)}
              color={marzaRok >= ciel.marzaPct ? C.green : C.red}
              sub={`${marzaRok.toFixed(1)} % · cieľ ${ciel.marzaPct} %`}
            />
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
              Ročný cieľ {fmtCZK(ciel.rocneTrzby)} · projektové ciele a ďalší krok → Výsledky
            </div>
          </div>
        </Klik>
      </Card>
    );

    nodes.btc = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Bitcoinová rezerva" text="Načítava sa priamo z appky PSB Bitcoin (len na čítanie). Nie je to príjem ani náklad — je to majetok, preto nie je v P&L. Mesiace prevádzky rátajú s break-even vrátane nárokov na výplaty." /></H3>
        <Klik kam={() => onNavigate("vzas")} onNavigate="VZAS → Rezerva">
          {btcStav === "load" && <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam z BTC appky…</div>}
          {btcStav === "err" && <Empty>BTC appka je nedostupná — skús to o chvíľu.</Empty>}
          {btcStav === "ok" && btc && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <MiniStat label="Hodnota rezervy" value={fmtCZK(btc.czk || 0)} color={C.orange} />
              <MiniStat
                label="Mesiacov prevádzky"
                value={`${(beAvg > 0 ? (btc.czk || 0) / beAvg : 0).toFixed(1)}`}
                color={(beAvg > 0 ? (btc.czk || 0) / beAvg : 0) >= 3 ? C.green : (beAvg > 0 ? (btc.czk || 0) / beAvg : 0) >= 1 ? C.orange : C.red}
              />
            </div>
          )}
        </Klik>
      </Card>
    );

    // ── Doplnené karty: peniaze ──────────────────────────────────────────────
    const labs = mesiaceSDatami();
    const predikcia = predictCash(data, clients, 3);
    const predEarn = predictEarnings(data, clients);
    // Priemer aj súčet rátajú cez OKNO FILTRA, nie cez celé obdobie — inak by
    // sa filter prepol a karta by ukazovala to isté číslo.
    const nMes = idxOkno.length;
    const priem = (v: number[]) => (nMes ? idxOkno.reduce((a, i) => a + v[i], 0) / nMes : 0);

    // Marža sa NESMIE počítať ako priemer mesačných percent — slabý mesiac
    // s malými tržbami by mal v priemere rovnakú váhu ako rekordný a výsledok
    // je nižší než skutočnosť (3,3 % namiesto 8,0 %). Správne je súčet ziskov
    // delený súčtom tržieb.
    const sucet = (v: number[]) => idxOkno.reduce((a, i) => a + v[i], 0);
    const marzaSpolu = sucet(p.prijmy) > 0 ? (sucet(p.hrubyZisk) / sucet(p.prijmy)) * 100 : 0;
    nodes.breakEven = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Tržby vs. break-even" text="Zelená sú tržby, oranžová je bod, kde firma pokryje prevádzku aj NÁROKY na výplaty. Kde je zelená pod oranžovou, mesiac nezarobil ani na vlastnú prevádzku — a to, čo si tréner v takom mesiaci vezme, je pôžička, nie mzda. Break-even sa hýbe: rastie s fixnými nákladmi a s odrobenými hodinami (nárok na výplatu je ich funkcia)." /></H3>
        <Klik kam={() => onNavigate("vzas", "pnl")} onNavigate="Peniaze → Zisky a straty">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [p.prijmy[i], be[i]] }))}
            series={[{ name: "Tržby", color: C.green }, { name: "Break-even", color: C.orange }]}
            height={190} fmt={kcK} autoY alignEnd
          />
          <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 5 }}>
            Pod break-even: <b style={{ color: C.red }}>{idxOkno.filter((i) => p.prijmy[i] < be[i]).length}</b> z {nMes} mesiacov.
          </div>
        </Klik>
      </Card>
    );

    // Predikcia s pásmom istoty. Jedno číslo by predstieralo presnosť, ktorú
    // model nemá — spodná hranica je to, čo je zaplatené v balíčkoch, horná
    // ráta s tým, že si klienti dokúpia ako doteraz.
    nodes.predikciaTrzieb = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Predikcia tržieb" text="Tri mesiace dopredu. Spodná hranica je opatrný odhad (blízko toho, čo je už zaplatené v balíčkoch), horná ráta s tým, že si klienti dokupujú ako doteraz. Stredná krivka je najpravdepodobnejší priebeh. Jedno číslo by predstieralo presnosť, ktorú model nemá — preto pásmo. Model berie tempo z posledných 90 dní, takže klienti, čo prestali chodiť, ho ťahajú dole správne." /></H3>
        <Klik kam={() => onNavigate("vzas", "predikcia")} onNavigate="Peniaze → Predikcia">
          {predikcia.months.length === 0 ? <Empty>Na predikciu zatiaľ nie je dosť dát.</Empty> : (
            <LineChart
              data={predikcia.months.map((m) => ({ label: monthLabel(m.month), values: [m.lo, m.expected, m.hi] }))}
              series={[{ name: "Opatrne", color: C.textDim }, { name: "Očakávané", color: C.blue }, { name: "Optimisticky", color: C.green }]}
              height={190} fmt={kcK} autoY alignEnd
            />
          )}
        </Klik>
      </Card>
    );

    nodes.predikciaScen = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Scenáre na 3 mesiace" text="Zaručené = peniaze, ktoré sú už zaplatené v balíčkoch a klientom zostáva ich odchodiť; tie prídu, aj keby sa nič nepredalo. Realistický ráta s obvyklým dokupovaním, negatívny s tým, že časť klientov odíde. Run-rate je mesačné tempo portfólia, ak klienti chodia ako TERAZ — nie priemer za posledné mesiace, ten obsahuje aj ľudí, ktorí medzitým prestali chodiť." /></H3>
        <Klik kam={() => onNavigate("vzas", "predikcia")} onNavigate="Peniaze → Predikcia">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Zaručené (3 mes.)" value={fmtCZK(predEarn.guaranteedTotal)} color={C.textMuted} />
            <MiniStat label="Realistický (3 mes.)" value={fmtCZK(predEarn.scenarios.realistic)} color={C.blue} />
            <MiniStat label="Optimistický" value={fmtCZK(predEarn.scenarios.optimistic)} color={C.green} />
            <MiniStat label="Run-rate / mes." value={fmtCZK(predEarn.monthlyRunRate)} color={C.accent} />
          </div>
        </Klik>
      </Card>
    );

    nodes.pnlSuhrn = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Súhrn P&L" text="Príjmy, náklady, hrubý zisk a marža — priemer na mesiac za CELÉ obdobie s dátami. Na obrazovke Peniaze → Zisky a straty vidíš to isté, ale za obdobie, ktoré si tam nastavíš — preto sa čísla líšia; obdobie je napísané pod nadpisom tejto karty. Náklady zahŕňajú NÁROKY na výplaty, nie to, čo si tréner reálne vzal. Marža sa počíta ako celkový zisk delený celkovými tržbami, nie ako priemer mesačných percent — inak by slabý mesiac vážil rovnako ako rekordný. Cieľ 12–15 % ako medzikrok, dlhodobo 20 %." /></H3>
        {/* Obdobie priamo na karte. Bez neho sa to isté číslo na dvoch
            obrazovkách líši a nedá sa zistiť prečo — to je presne to, čo
            Jerryho vyviedlo z miery pri rezerve. */}
        <div style={{ fontSize: 10.5, color: C.textDim, margin: "-6px 0 8px" }}>
          {MES_LAB[idxOkno[0]]} – {MES_LAB[idxOkno[nMes - 1]]} · {nMes} {nMes === 1 ? "mesiac" : nMes < 5 ? "mesiace" : "mesiacov"}
        </div>
        <Klik kam={() => onNavigate("vzas", "pnl")} onNavigate="Peniaze → Zisky a straty">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Príjmy · Ø / mes." value={fmtCZK(priem(p.prijmy))} color={C.green} />
            <MiniStat label="Náklady · Ø / mes." value={fmtCZK(priem(p.celkoveNaklady))} color={C.red} />
            <MiniStat label="Hrubý zisk · Ø / mes." value={fmtCZK(priem(p.hrubyZisk))} color={priem(p.hrubyZisk) >= 0 ? C.green : C.red} />
            <MiniStat label="Marža za obdobie" value={`${marzaSpolu.toFixed(1)} %`} color={marzaSpolu >= 15 ? C.green : marzaSpolu >= 0 ? C.orange : C.red} />
          </div>
        </Klik>
      </Card>
    );

    nodes.naklady = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Fixné vs. variabilné" text="Fixné náklady bežia, aj keď sa netrénuje (nájom, aplikácie, účtovníctvo). Variabilné rastú s prevádzkou. Výplaty sú v oboch prípadoch mimo — tie sú vlastná kategória. Keď rastú fixné rýchlejšie než tržby, break-even sa dvíha a nedá sa to odtrénovať." /></H3>
        <Klik kam={() => onNavigate("vzas", "pnl")} onNavigate="Peniaze → Zisky a straty">
          <LineChart
            data={idxOkno.map((i) => ({ label: MES_LAB[i], values: [p.fixneTotal[i], p.varTotal[i]] }))}
            series={[{ name: "Fixné", color: C.orange }, { name: "Variabilné", color: C.blue }]}
            height={190} fmt={kcK} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    // Run-rate = tempo posledných troch mesiacov s dátami prepočítané na rok.
    // Nie priemer za celé obdobie — ten hovorí o minulosti, run-rate o tom,
    // ako to beží TERAZ.
    const idx3 = Array.from({ length: Math.min(3, posl + 1) }, (_, k) => posl - Math.min(3, posl + 1) + 1 + k);
    const rrTrzby = idx3.reduce((a, i) => a + p.prijmy[i], 0) / (idx3.length || 1);
    const rrNaklady = idx3.reduce((a, i) => a + p.celkoveNaklady[i], 0) / (idx3.length || 1);
    nodes.runRate = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Run-rate a odhad zisku" text="Tempo posledných troch mesiacov s dátami prepočítané na mesiac a na rok. Nie je to predikcia z balíčkov (tá je v Predikcii) — je to jednoduchá otázka: keby to takto bežalo ďalej, koľko by z toho bolo za rok? Priemer za celé obdobie hovorí o minulosti, run-rate o tom, ako to beží teraz." /></H3>
        <Klik kam={() => onNavigate("vzas", "predikcia")} onNavigate="Peniaze → Predikcia">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Tržby · run-rate / mes." value={fmtCZK(rrTrzby)} color={C.green} />
            <MiniStat label="Zisk · run-rate / mes." value={fmtCZK(rrTrzby - rrNaklady)} color={rrTrzby - rrNaklady >= 0 ? C.green : C.red} />
            <MiniStat label="Tržby · ročné tempo" value={fmtCZK(rrTrzby * 12)} />
            <MiniStat label="Zisk · ročné tempo" value={fmtCZK((rrTrzby - rrNaklady) * 12)} color={rrTrzby - rrNaklady >= 0 ? undefined : C.red} />
          </div>
        </Klik>
      </Card>
    );

    // H1 proti H1. Porovnávať posledný polrok s predošlým je pri sezónnom
    // biznise klam — leto a jeseň sa nedajú porovnať. Rovnaké mesiace áno.
    const polrok = (rok: string) => {
      const idx = VZAS_MONTHS.map((m, i) => [m, i] as const).filter(([m]) => m.startsWith(rok) && m.slice(5) <= "06").map(([, i]) => i).filter((i) => i <= posl);
      return {
        n: idx.length,
        trzby: idx.reduce((a, i) => a + p.prijmy[i], 0),
        zisk: idx.reduce((a, i) => a + p.hrubyZisk[i], 0),
      };
    };
    const h25 = polrok("2025");
    const h26 = polrok("2026");
    const rast = h25.trzby > 0 ? ((h26.trzby - h25.trzby) / h25.trzby) * 100 : 0;
    nodes.h1 = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="H1 2025 vs. H1 2026" text="Prvý polrok proti prvému polroku. Porovnávať posledný polrok s predošlým je pri sezónnom biznise klam — leto a jeseň sa nedajú porovnať. Rovnaké mesiace áno: to, čo zostane, je skutočný rast." /></H3>
        <Klik kam={() => onNavigate("vysledky")} onNavigate="Výsledky">
          {h26.n === 0 ? <Empty>Rok 2026 ešte nemá prvý polrok uzavretý.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <MiniStat label={`Tržby H1 2025 (${h25.n} mes.)`} value={fmtCZK(h25.trzby)} />
              <MiniStat label={`Tržby H1 2026 (${h26.n} mes.)`} value={fmtCZK(h26.trzby)} color={C.green} />
              <MiniStat label="Rast tržieb" value={`${rast > 0 ? "+" : ""}${rast.toFixed(0)} %`} color={rast >= 0 ? C.green : C.red} />
              <MiniStat label="Zisk H1 2026" value={fmtCZK(h26.zisk)} color={h26.zisk >= 0 ? C.green : C.red} />
            </div>
          )}
        </Klik>
      </Card>
    );

    // ── Vyťaženie ────────────────────────────────────────────────────────────
    const mesHodiny = new Map<string, { Jerry: number; Terezka: number }>();
    const mesSedenia = new Map<string, number>();
    let offline = 0, online = 0, uvodne = 0;
    for (const s of data.sessions) {
      const mk = s.date.slice(0, 7);
      const e = mesHodiny.get(mk) || { Jerry: 0, Terezka: 0 };
      if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
      else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
      mesHodiny.set(mk, e);
      mesSedenia.set(mk, (mesSedenia.get(mk) || 0) + 1);
      if (s.sessionType === "UVODNE") uvodne++;
      else if (s.sessionType === "ONLINE") online++;
      else offline++;
    }
    // Len plné mesiace — rozrobený by ukázal hodiny za pár dní ako mesačné.
    const plne = (m: Map<string, unknown>) =>
      [...m.entries()].filter(([mk]) => (!kotva.plny || mk <= kotva.plny) && vMes(mk)).sort((a, b) => a[0].localeCompare(b[0]));
    const mesiaceHod = (plne(mesHodiny) as [string, { Jerry: number; Terezka: number }][]).slice(-18);

    nodes.hodinyMes = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Hodiny po mesiacoch" text="Odtrénované hodiny za mesiac, zvlášť pre každého trénera. Týždenný graf ukazuje záťaž, tento sezónnosť — leto a Vianoce sú vidieť tu, nie tam." /></H3>
        <Klik kam={() => onNavigate("treningy", "prehled")} onNavigate="Tréningy">
          <LineChart
            data={mesiaceHod.map(([mk, v]) => ({ label: monthLabel(mk), values: [v.Jerry, v.Terezka] }))}
            series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]}
            height={190} fmt={(n) => `${Math.round(n)}h`} alignEnd
          />
        </Klik>
      </Card>
    );

    nodes.sedeniaMes = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Počet sedení / mesiac" text="Objem práce v kusoch. Padá skôr než tržby — balíčky sa platia dopredu, takže pokles sedení je predzvesť poklesu peňazí o mesiac či dva neskôr." /></H3>
        {/* Druhý odkaz na neexistujúci financie|cashflow — karta je o sedeniach,
        tak vedie na Sedenia & cena. */}
        <Klik kam={() => onNavigate("vzas", "sedenia")} onNavigate="Peniaze → Sedenia & cena">
          <ValueBars
            data={(plne(mesSedenia) as [string, number][]).slice(-18).map(([mk, n]) => ({ label: monthLabel(mk), value: n }))}
            color={C.accent} fmt={(n) => String(Math.round(n))} height={170} alignEnd
          />
        </Klik>
      </Card>
    );

    nodes.typySedeni = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Pomer typov sedení" text="Z čoho sa skladá prevádzka za celú históriu: offline v štúdiu, online (vrátane TrueCoach) a úvodné tréningy." /></H3>
        <Klik kam={() => onNavigate("treningy", "analyza")} onNavigate="Tréningy → Analýza">
          {offline + online + uvodne > 0 ? (
            <Donut
              size={140} centerLabel={String(offline + online + uvodne)}
              data={[
                { label: "Offline", value: offline, color: C.accent },
                { label: "Online", value: online, color: C.blue },
                { label: "Úvodné", value: uvodne, color: C.orange },
              ]}
            />
          ) : <Empty>Nahraj Payroll by Session.</Empty>}
        </Klik>
      </Card>
    );

    const zr = { jerry: { z: 0, p: 0 }, terezka: { z: 0, p: 0 }, spolu: { z: 0, p: 0 } };
    if (weeks) {
      for (const e of Object.values(weeks)) {
        for (const os of ["jerry", "terezka"] as const) {
          zr[os].z += Number((e as Record<string, unknown>)[`${os}_zrusene`]) || 0;
          zr[os].p += Number((e as Record<string, unknown>)[`${os}_presunute`]) || 0;
        }
        zr.spolu.z += Number((e as Record<string, unknown>).zrusene) || 0;
        zr.spolu.p += Number((e as Record<string, unknown>).presunute) || 0;
      }
    }
    const zrusenychSpolu = zr.jerry.z + zr.terezka.z + zr.spolu.z;
    nodes.zrusene = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Zrušené a presunuté" text="Z týždenných zápisov za celú históriu. Zrušený tréning je stratená kapacita — hodina, ktorú už nikto nezaplatí. Presunutý sa väčšinou vráti." /></H3>
        <Klik kam={() => onNavigate("treningy", "prehled")} onNavigate="Tréningy">
          {weeks === null ? <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div> : zrusenychSpolu + zr.jerry.p + zr.terezka.p + zr.spolu.p === 0 ? (
            <Empty>Zatiaľ žiadne týždenné zápisy so zrušeniami.</Empty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <MiniStat label="Zrušené spolu" value={String(zrusenychSpolu)} color={C.red} />
              <MiniStat label="Presunuté spolu" value={String(zr.jerry.p + zr.terezka.p + zr.spolu.p)} color={C.orange} />
              <MiniStat label="Jerry · zrušené" value={String(zr.jerry.z)} />
              <MiniStat label="Terezka · zrušené" value={String(zr.terezka.z)} />
            </div>
          )}
        </Klik>
      </Card>
    );

    // ── Klienti ──────────────────────────────────────────────────────────────
    const balicky = new Map<string, number>();
    for (const c of Object.values(clients)) {
      if (c.status === "Neaktívny") continue;
      const b = membershipBucket(c.membership || "");
      balicky.set(b, (balicky.get(b) || 0) + 1);
    }
    const balickyData = [...balicky.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([l, v], i) => ({ label: l, value: v, color: MEMBERSHIP_COLORS[l] || [C.accent, C.blue, C.orange, C.green, C.accentLight][i % 5] }));
    nodes.balicky = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Klienti podľa balíčka" text="Na čom stojí príjem: koľko ľudí má viazanosť, koľko voľné balíčky a koľko chodí bez členstva. Neaktívni sa nerátajú." /></H3>
        <Klik kam={() => onNavigate("klienti", "klienti")} onNavigate="Klienti">
          {balickyData.length ? (
            <Donut size={140} centerLabel={String(balickyData.reduce((a, d) => a + d.value, 0))} data={balickyData} />
          ) : <Empty>Žiadni klienti.</Empty>}
        </Klik>
      </Card>
    );

    const odisli = toky.zoznam.filter((c) => c._odisiel);
    const kose = [
      { label: "Prišli raz a nikdy viac", n: odisli.filter((c) => c.sessionCount <= 1).length },
      { label: "Do 90 dní", n: odisli.filter((c) => c.sessionCount > 1 && c._zivot < 90).length },
      { label: "3 – 6 mesiacov", n: odisli.filter((c) => c._zivot >= 90 && c._zivot < 180).length },
      { label: "6 – 12 mesiacov", n: odisli.filter((c) => c._zivot >= 180 && c._zivot < 365).length },
      { label: "Viac ako rok", n: odisli.filter((c) => c._zivot >= 365).length },
    ];
    const maxKos = Math.max(1, ...kose.map((k) => k.n));
    nodes.kdeTecie = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Kde to tečie" text="Ako dlho vydržali tí, čo odišli. Odchod v prvých mesiacoch a odchod po roku majú inú príčinu aj inú cenu opravy — prvý je o onboardingu, druhý o výsledkoch alebo o živote klienta." /></H3>
        <Klik kam={() => onNavigate("klienti", "rast")} onNavigate="Klienti → Rast a strata">
          {odisli.length ? (
            <div style={{ marginTop: 8 }}>
              {kose.map((k) => (
                <BarRow key={k.label} label={k.label} value={k.n} max={maxKos}
                  color={k.n / (odisli.length || 1) >= 0.4 ? C.red : mix(C.accent, 60)}
                  sub={`${k.n} · ${Math.round((k.n / odisli.length) * 100)} %`} />
              ))}
            </div>
          ) : <Empty>Zatiaľ nikto neodišiel.</Empty>}
        </Klik>
      </Card>
    );

    const kohorty = (() => {
      const m = new Map<string, typeof toky.zoznam>();
      for (const c of toky.zoznam) {
        const k = c.firstSession.slice(0, 7);
        m.set(k, [...(m.get(k) || []), c]);
      }
      // Predtým sa slepo zahodil najnovší mesiac („ten beží"). Keď PTminder
      // mešká, zahodil sa uzavretý mesiac a bežiaci zostal. Teraz rozhoduje
      // kotva dát, nie poradie.
      return [...m.entries()]
        .filter(([mk]) => !kotva.plny || mk <= kotva.plny)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 6);
    })();
    nodes.prezitie = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Kto vydrží (kohorty)" text="Z každého mesiaca príchodov: koľko ľudí chodilo ešte po 3, 6 a 12 mesiacoch. Bežiaci mesiac je vynechaný — nemá sa ako prejaviť." /></H3>
        <Klik kam={() => onNavigate("klienti", "rast")} onNavigate="Klienti → Rast a strata">
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", fontSize: 10.5, color: C.textDim, padding: "0 2px 4px" }}>
              <span style={{ flex: 1 }}>Prišli</span>
              <span style={{ width: 34, textAlign: "right" }}>ks</span>
              <span style={{ width: 34, textAlign: "right" }}>3 m</span>
              <span style={{ width: 34, textAlign: "right" }}>6 m</span>
              <span style={{ width: 40, textAlign: "right" }}>12 m</span>
            </div>
            {kohorty.map(([mk, cs]) => {
              // Kohorta stará dva mesiace nemôže mať nikoho „ešte tu po pol
              // roku" — nula by tam bola nepravda, nie výsledok. Nezrelé okno
              // preto ukazuje pomlčku, rovnako ako odchody v Raste a strate.
              const vek = toky.kotva ? (Date.parse(toky.kotva) - Date.parse(`${mk}-01`)) / 86400000 : 0;
              const bunka = (dni: number, farba: string, sirka: number) => (
                <span style={{ width: sirka, textAlign: "right", color: vek >= dni ? farba : C.textDim }}>
                  {vek >= dni ? cs.filter((c) => c._zivot >= dni).length : "–"}
                </span>
              );
              return (
                <div key={mk} style={{ display: "flex", fontSize: 12, padding: "5px 2px", borderBottom: `1px solid ${mix(C.border, 40)}`, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ flex: 1, color: C.textMuted }}>{monthLabel(mk)}</span>
                  <span style={{ width: 34, textAlign: "right", color: C.text }}>{cs.length}</span>
                  {bunka(90, C.green, 34)}
                  {bunka(180, C.accentLight, 34)}
                  {bunka(365, C.blue, 40)}
                </div>
              );
            })}
          </div>
        </Klik>
      </Card>
    );

    const podlaZdroja = (() => {
      const m = new Map<string, typeof toky.zoznam>();
      for (const c of toky.zoznam) m.set(c.zdroj || "", [...(m.get(c.zdroj || "") || []), c]);
      return [...m.entries()]
        .map(([z, cs]) => ({
          // Prázdny zdroj má v číselníku label „—", čo na najväčšom stĺpci
          // nehovorí nič. Pomenovať dieru je pol opravy.
          z: z ? ZDROJE.find((x) => x.value === z)?.label || z : "nevyplnené",
          n: cs.length,
          trzba: Math.round(cs.reduce((a, c) => a + c._trzba, 0) / cs.length),
        }))
        .sort((a, b) => b.trzba - a.trzba)
        .slice(0, 6);
    })();
    nodes.hodnotaZdroj = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Čo klient prinesie podľa zdroja" text="Priemerná tržba na klienta za celý čas, čo chodí, podľa toho odkiaľ prišiel. Toto je číslo, proti ktorému má zmysel držať cenu za získaného klienta. Pozor: zdroj sa zapisuje až od júna 2025, staršie mená sedia v „nevyplnené“." /></H3>
        <Klik kam={() => onNavigate("klienti", "rast")} onNavigate="Klienti → Rast a strata">
          <div style={{ marginTop: 8 }}>
            {podlaZdroja.map((r) => (
              <BarRow key={r.z} label={r.z} value={r.trzba} max={Math.max(1, ...podlaZdroja.map((x) => x.trzba))}
                color={C.accent} sub={`${fmtCZK(r.trzba)} · ${r.n} kl.`} />
            ))}
          </div>
        </Klik>
      </Card>
    );

    // ── Marketing ────────────────────────────────────────────────────────────
    const konv = (() => {
      const m = new Map<string, { dopyty: number; klienti: number }>();
      const menaKlientov = new Set(Object.values(clients).filter((c) => c.firstSession).map((c) => c.name.toLowerCase().trim()));
      for (const l of data.leads || []) {
        const e = m.get(l.source) || { dopyty: 0, klienti: 0 };
        e.dopyty++;
        if (menaKlientov.has((l.name || "").toLowerCase().trim())) e.klienti++;
        m.set(l.source, e);
      }
      return [...m.entries()].map(([z, v]) => ({ z, ...v })).sort((a, b) => b.dopyty - a.dopyty);
    })();
    nodes.konverziaZdroj = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Konverzia dopytov podľa zdroja" text="Koľko z dopytov daného zdroja sa stalo klientmi (meno dopytu sa našlo medzi klientmi s odtrénovaným sedením). Zdroj s desiatimi dopytmi a nulou klientov je drahší než zdroj s dvomi a dvomi." /></H3>
        <Klik kam={() => onNavigate("klienti", "dopyty")} onNavigate="Klienti → Dopyty">
          {konv.length ? (
            <div style={{ marginTop: 8 }}>
              {konv.map((r) => (
                <BarRow key={r.z} label={r.z} value={r.klienti} max={Math.max(1, ...konv.map((x) => x.dopyty))}
                  color={r.klienti > 0 ? C.green : C.red}
                  sub={`${r.klienti} z ${r.dopyty}${r.dopyty ? ` · ${Math.round((r.klienti / r.dopyty) * 100)} %` : ""}`} />
              ))}
            </div>
          ) : <Empty>Zatiaľ žiadne zapísané dopyty.</Empty>}
        </Klik>
      </Card>
    );

    const ig = (MKT_MESACNE.slice(-12)).filter((r) => vMes(r.m));
    nodes.dosahIG = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Dosah Instagramu" text="Zobrazenia a dosah po mesiacoch z Metricoolu. Dosah = koľko rôznych ľudí príspevky videlo, zobrazenia = koľkokrát sa zobrazili. Dáta pribúdajú s importom CSV v Údajoch." /></H3>
        <Klik kam={() => onNavigate("marketing", "dosah")} onNavigate="Marketing → Dosah">
          {ig.length ? (
            <LineChart
              data={ig.map((r) => ({ label: monthLabel(r.m), values: [r.views, r.dosah] }))}
              series={[{ name: "Zobrazenia", color: C.accent }, { name: "Dosah", color: C.blue }]}
              height={190} fmt={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))} alignEnd
            />
          ) : <Empty>Nahraj export z Metricoolu.</Empty>}
        </Klik>
      </Card>
    );

    const ga4 = (GA4_MESACNE.filter((r) => !r.chyba).slice(-12)).filter((r) => vMes(r.m));
    nodes.web = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Web (GA4)" text="Noví návštevníci webu a kľúčové udalosti (odoslaný formulár, klik na kontakt) po mesiacoch. Mesiace bez merania sú vynechané — diera nie je nula." /></H3>
        <Klik kam={() => onNavigate("marketing", "dosah")} onNavigate="Marketing → Dosah">
          {ga4.length ? (
            <LineChart
              data={ga4.map((r) => ({ label: monthLabel(r.m), values: [r.novi, r.udalosti] }))}
              series={[{ name: "Noví návštevníci", color: C.accent }, { name: "Kľúčové udalosti", color: C.green }]}
              height={190} fmt={(n) => String(Math.round(n))} alignEnd
            />
          ) : <Empty>Nahraj export z GA4.</Empty>}
        </Klik>
      </Card>
    );

    const gsc = (GSC_MESACNE.slice(-12)).filter((r) => vMes(r.m));
    nodes.vyhladavanie = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Vyhľadávanie (Search Console)" text="Kliky z Googlu po mesiacoch. Toto je jediný kanál, kde ľudia hľadajú sami — rastie pomaly, ale neplatí sa zaň." /></H3>
        <Klik kam={() => onNavigate("marketing", "dosah")} onNavigate="Marketing → Dosah">
          {gsc.length ? (
            <ValueBars data={gsc.map((r) => ({ label: monthLabel(r.m), value: r.kliky }))} color={C.blue} fmt={(n) => String(Math.round(n))} height={170} alignEnd />
          ) : <Empty>Nahraj export zo Search Console.</Empty>}
        </Klik>
      </Card>
    );

    const poslednyKanalMes = kanaly.length ? kanaly.map((r) => r.mesiac).sort().reverse()[0] : "";
    const kanalySucet = (() => {
      const m = new Map<string, number>();
      for (const r of kanaly.filter((x) => x.mesiac === poslednyKanalMes)) {
        if (!/dosah|zobrazen|impres/i.test(r.metrika)) continue;
        m.set(r.kanal, (m.get(r.kanal) || 0) + r.hodnota);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    })();
    nodes.kanaly = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Kanály — mesačný súhrn" text="Dosah/zobrazenia všetkých kanálov (Facebook, TikTok, YouTube, Threads…) z poslednej nahratej mesačnej zostavy Metricoolu. Facebook má často viac impresií než Instagram — bez tohto to nie je vidieť." /></H3>
        <Klik kam={() => onNavigate("marketing", "dosah")} onNavigate="Marketing → Dosah">
          {kanalySucet.length ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>{monthLabel(poslednyKanalMes)}</div>
              {kanalySucet.map(([k, v]) => (
                <BarRow key={k} label={k} value={v} max={Math.max(1, ...kanalySucet.map((x) => x[1]))} color={C.accent}
                  sub={v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
              ))}
            </div>
          ) : <Empty>Nahraj mesačnú zostavu (PDF) v Údajoch.</Empty>}
        </Klik>
      </Card>
    );

    // ── Výsledky (KPI) ───────────────────────────────────────────────────────
    // Rovnaké čísla ako obrazovka Výsledky → KPI (tá istá computeKpis, tie isté
    // ciele z DB) — len bez posuvníkov. Cieľ sa mení tam, kde sa o ňom
    // rozhoduje; dashboard ho ukazuje.
    const kpis = computeKpis(KPI_ROK, data.sessions, data.payments, kpiOverrides, btc?.czk ?? null);
    for (const karta of KPI_KARTY) {
      const riadky = kpis.filter((k) => k.def.group === karta.group && !kpiSkryte.includes(k.def.id));
      const vsetkyVSkupine = kpis.filter((k) => k.def.group === karta.group).length;
      nodes[karta.id] = (
        <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
          <H3>
            <Info
              label={`KPI ${KPI_ROK} — ${KPI_GROUP_LABELS[karta.group]}`}
              text="Počítané z dát v Kokpite, nie prepisované ručne. Ročné ciele sú prepočítané na uplynulé mesiace — polrok proti celoročnému cieľu by vyzeral ako zaostávanie, aj keby si bol na pláne. Ktoré riadky tu chceš, vyberáš v knižnici grafov; cieľ sa posúva vo Výsledkoch."
            />
          </H3>
          <Klik kam={() => onNavigate("vysledky", "kpi")} onNavigate="Výsledky → KPI">
            {riadky.length === 0 ? (
              <Empty>{vsetkyVSkupine ? "Všetky riadky tejto skupiny sú v knižnici odškrtnuté." : "Zatiaľ bez dát."}</Empty>
            ) : (
              <div>
                {riadky.map((k) => {
                  const col = k.status === "ok" ? C.green : k.status === "blizko" ? C.orange : k.status === "mimo" ? C.red : C.textMuted;
                  const pct = k.target ? (k.value / k.target) * 100 : null;
                  return (
                    <div key={k.def.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 2px", borderBottom: `1px solid ${mix(C.border, 40)}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: col, flex: "0 0 auto" }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.def.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {kpiFmt(k.value, k.def.unit)}
                      </span>
                      {k.target != null && (
                        <span style={{ flex: "0 0 46px", height: 5, borderRadius: 999, background: mix(C.border, 70), overflow: "hidden" }}>
                          <span style={{ display: "block", width: `${Math.min(100, Math.max(3, pct!))}%`, height: "100%", background: col }} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Klik>
        </Card>
      );
    }

    // ── Doplnené karty: vyťaženie ────────────────────────────────────────────
    const finMes = doPlnehoMesiaca(monthlyFinance(data), kotva, (m) => m.month).filter((m) => vMes(m.month));
    nodes.cenaSedenia = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Ø cena sedenia" text="Prijaté peniaze delené počtom odtrénovaných sedení v tom mesiaci. Je to jediná páka, ktorá dvíha tržby bez toho, aby dvíhala odrobené hodiny — a v dvojčlennom štúdiu je to dôležitejšie než počet klientov, lebo hodín je konečne veľa. Mesiac, v ktorom prišla veľká predplatba, vyskočí; krivku treba čítať ako trend, nie ako cenník." /></H3>
        <Klik kam={() => onNavigate("vzas", "sedenia")} onNavigate="Peniaze → Sedenia & cena">
          <LineChart
            data={finMes.slice(-18).map((m) => ({ label: monthLabel(m.month), values: [m.sessions > 0 ? m.cash / m.sessions : 0] }))}
            series={[{ name: "Ø CZK / sedenie", color: C.accent }]}
            height={190} fmt={(n) => `${Math.round(n)}`} autoY alignEnd
          />
        </Klik>
      </Card>
    );

    // Náročnosť: nízke číslo je dobré. Rastúca krivka pri rastúcich hodinách je
    // varovanie skôr, než sa to prejaví na výkone.
    const skore = { jerry: [] as number[], terezka: [] as number[] };
    if (weeks) {
      for (const e of Object.values(weeks)) {
        for (const os of ["jerry", "terezka"] as const) {
          const v = Number((e as Record<string, unknown>)[`${os}_score`]);
          if (v > 0) skore[os].push(v);
        }
      }
    }
    const priemSkore = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const farbaSkore = (v: number) => (v === 0 ? undefined : v <= 4 ? C.green : v <= 7 ? C.orange : C.red);
    nodes.narocnost = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Náročnosť týždňov" text="Vlastné hodnotenie 1–10 z týždenných zápisov (rovnaká logika ako RPE, ktoré ako tréneri používate denne): 1 = ľahký týždeň, 10 = veľmi ťažký. NÍZKE číslo je dobré. Zadáva sa v Tréningy → Prehľad vedľa odtrénovaných hodín. Rastúce hodnotenie pri rastúcich hodinách je varovanie skôr, než sa vyhorenie prejaví na výkone alebo na klientoch." /></H3>
        <Klik kam={() => onNavigate("treningy", "prehled")} onNavigate="Tréningy → Prehľad">
          {weeks === null ? <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div>
            : !skore.jerry.length && !skore.terezka.length ? <Empty>Zatiaľ žiadne týždenné hodnotenia náročnosti.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <MiniStat label={`Jerry · Ø (${skore.jerry.length} týž.)`} value={`${priemSkore(skore.jerry).toFixed(1)} / 10`} color={farbaSkore(priemSkore(skore.jerry))} />
              <MiniStat label={`Terezka · Ø (${skore.terezka.length} týž.)`} value={`${priemSkore(skore.terezka).toFixed(1)} / 10`} color={farbaSkore(priemSkore(skore.terezka))} />
              <MiniStat label="Jerry · najťažší týždeň" value={skore.jerry.length ? `${Math.max(...skore.jerry)} / 10` : "—"} />
              <MiniStat label="Terezka · najťažší týždeň" value={skore.terezka.length ? `${Math.max(...skore.terezka)} / 10` : "—"} />
            </div>
          )}
        </Klik>
      </Card>
    );

    const sedeniaRok = data.sessions.filter((x) => Date.parse(x.date) >= Date.now() - 365 * 86400000);
    // Online sedenie je ONLINE aj TRUECOACH — sú to dva názvy pre to isté
    // (TrueCoach je aplikácia, cez ktorú online tréning beží).
    const poctyTypov = {
      offline: sedeniaRok.filter((x) => x.sessionType === "OFFLINE").length,
      online: sedeniaRok.filter((x) => x.sessionType === "ONLINE" || x.sessionType === "TRUECOACH").length,
      uvodne: sedeniaRok.filter((x) => x.sessionType === "UVODNE").length,
    };
    nodes.suhrnSedeni = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Súhrn sedení" text="Počty sedení za posledných 12 mesiacov podľa typu. Úvodný tréning je iná položka než bežné sedenie — je to náklad na získanie klienta, nie tržba, a preto sa počíta zvlášť." /></H3>
        <Klik kam={() => onNavigate("treningy", "analyza")} onNavigate="Tréningy → Analýza">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Spolu (12 mes.)" value={String(sedeniaRok.length)} color={C.accent} />
            <MiniStat label="Offline" value={String(poctyTypov.offline)} />
            <MiniStat label="Online" value={String(poctyTypov.online)} color={C.blue} />
            <MiniStat label="Úvodné" value={String(poctyTypov.uvodne)} color={C.orange} />
          </div>
        </Klik>
      </Card>
    );

    // ── Doplnené karty: klienti ──────────────────────────────────────────────
    const aktivni = Object.values(clients).filter((c) => c.status !== "Neaktívny");
    const segPocty = { Anchor: 0, "Stabilný": 0, "Sporadický": 0 } as Record<string, number>;
    for (const c of aktivni) if (segPocty[c.segment] !== undefined) segPocty[c.segment]++;
    nodes.segmenty = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Segmenty klientov" text="Anchor chodí aspoň 84 % týždňov, Stabilný aspoň 50 %, Sporadický menej — z posledných 18 týždňov. Anchori sú základ, na ktorom firma stojí: sú predvídateľní, chodia aj v lete a odporúčajú ďalej. Klesajúci počet Anchorov je varovanie aj vtedy, keď celkový počet klientov rastie." /></H3>
        <Klik kam={() => onNavigate("klienti")} onNavigate="Klienti">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Anchor" value={String(segPocty.Anchor)} color={C.green} />
            <MiniStat label="Stabilný" value={String(segPocty["Stabilný"])} color={C.accent} />
            <MiniStat label="Sporadický" value={String(segPocty["Sporadický"])} color={C.orange} />
            <MiniStat label="Aktívnych spolu" value={String(aktivni.length)} />
          </div>
        </Klik>
      </Card>
    );

    const priemDoch = aktivni.length ? (aktivni.reduce((a, c) => a + c.attendance, 0) / aktivni.length) * 100 : 0;
    const podPolovicou = aktivni.filter((c) => c.attendance < 0.5).length;
    nodes.dochadzka = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Dochádzka" text="Podiel týždňov s aspoň jedným tréningom za posledných 18 týždňov, priemer cez aktívnych klientov. Dochádzka je mechanizmus za udržaním: kto chodí dvakrát týždenne, odchádza podstatne menej než ten, kto chodí raz za čas. Preto je pokles dochádzky varovanie skôr, než sa niekto naozaj odhlási." /></H3>
        <Klik kam={() => onNavigate("klienti")} onNavigate="Klienti">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Ø dochádzka" value={`${priemDoch.toFixed(0)} %`} color={priemDoch >= 70 ? C.green : priemDoch >= 50 ? C.orange : C.red} />
            <MiniStat label="Pod 50 %" value={String(podPolovicou)} color={podPolovicou > aktivni.length * 0.25 ? C.red : C.orange} />
            <MiniStat label="Anchor (≥84 %)" value={String(segPocty.Anchor)} color={C.green} />
            <MiniStat label="Aktívnych" value={String(aktivni.length)} />
          </div>
        </Klik>
      </Card>
    );

    // Referenčný motor: klienti, ktorí prišli na odporúčanie. Najlacnejší kanál,
    // aký firma má — nestojí nič a konvertuje najlepšie.
    const zRef = Object.values(clients).filter((c) => (c.zdroj || "").toLowerCase().includes("refer") || (c.zdroj || "").toLowerCase().includes("odporu"));
    const refTrzba = zRef.reduce((a, c) => a + c.totalPrice, 0);
    const vsetciSoZdrojom = Object.values(clients).filter((c) => c.zdroj);
    nodes.referencny = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Referenčný motor" text="Klienti, ktorí prišli na odporúčanie iného klienta. Najlacnejší kanál, aký firma má — nestojí nič a konvertuje lepšie než čokoľvek platené, lebo človek prichádza už s dôverou. Podiel na všetkých so zapísaným zdrojom hovorí, či motor beží, alebo či firma stojí na reklame." /></H3>
        <Klik kam={() => onNavigate("klienti", "referencie")} onNavigate="Klienti → Referencie">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            <MiniStat label="Z odporúčania" value={String(zRef.length)} color={C.green} />
            <MiniStat label="Podiel (so zdrojom)" value={vsetciSoZdrojom.length ? `${((zRef.length / vsetciSoZdrojom.length) * 100).toFixed(0)} %` : "—"} color={C.accent} />
            <MiniStat label="Priniesli spolu" value={fmtCZK(refTrzba)} />
            <MiniStat label="Ø na klienta" value={zRef.length ? fmtCZK(refTrzba / zRef.length) : "—"} />
          </div>
        </Klik>
      </Card>
    );

    const podlaZdrojaD = new Map<string, number>();
    for (const c of aktivni) podlaZdrojaD.set(c.zdroj || "", (podlaZdrojaD.get(c.zdroj || "") || 0) + 1);
    const zdrojRiadkyD = [...podlaZdrojaD.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    // Karta si dáta ťahá sama (banka + BTC appka), takže v mriežke funguje
    // rovnako ako na svojej domovskej obrazovke.
    nodes.platobneKanaly = <PlatobneKanaly clients={clients} onNavigate={onNavigate} />;

    nodes.zdrojeKlientov = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Odkiaľ klienti prišli" text="Rozdelenie AKTÍVNYCH klientov podľa zapísaného zdroja. Toto je jediné miesto, kde sa marketing spája s peniazmi — bez neho je každé číslo o návratnosti kanála odhad. Prázdny zdroj sa dá doplniť v Klientoch cez ✎, ale len krátko po začiatku: o pol roka si už nikto nespomenie." /></H3>
        <Klik kam={() => onNavigate("klienti")} onNavigate="Klienti">
          {zdrojRiadkyD.length === 0 ? <Empty>Zatiaľ nie je vyplnený žiadny zdroj.</Empty> : (
            <div>
              {zdrojRiadkyD.map(([z, n]) => (
                <BarRow key={z || "prazdne"} label={z ? (ZDROJE.find((x) => x.value === z)?.label || z) : "nevyplnené"} value={n} max={zdrojRiadkyD[0][1]} color={z ? C.accent : C.textDim} sub={`${n}`} />
              ))}
            </div>
          )}
        </Klik>
      </Card>
    );

    // ── Doplnené karty: marketing ────────────────────────────────────────────
    const mkt12 = MKT_MESACNE.slice(-12);
    const spend12 = mkt12.reduce((a, m) => a + (m.spend || 0), 0);
    const uvodne12 = new Set(sedeniaRok.filter((x) => x.sessionType === "UVODNE").map((x) => `${x.client}|${x.date}`)).size;
    const novi12 = Object.values(clients).filter((c) => c.firstSession && Date.parse(c.firstSession) >= Date.now() - 365 * 86400000).length;
    nodes.cenaUvodneho = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Čo stojí úvodný" text="Marketingové výdaje za posledných 12 mesiacov delené počtom úvodných tréningov a počtom nových klientov. Druhé číslo je to podstatné: úvodný, ktorý sa nezmenil na klienta, je zaplatená hodina bez tržby. Ráta sa len z toho, čo je v Metricoole zapísané ako výdaj — organický dosah tu nie je a nedá sa oceniť." /></H3>
        <Klik kam={() => onNavigate("marketing", "lievik")} onNavigate="Marketing → Lievik">
          {spend12 === 0 ? <Empty>Za posledný rok nie sú zapísané žiadne marketingové výdaje.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <MiniStat label="Výdaje (12 mes.)" value={fmtCZK(spend12)} color={C.orange} />
              <MiniStat label="Úvodných" value={String(uvodne12)} />
              <MiniStat label="Cena za úvodný" value={uvodne12 ? fmtCZK(spend12 / uvodne12) : "—"} color={C.accent} />
              <MiniStat label="Cena za klienta" value={novi12 ? fmtCZK(spend12 / novi12) : "—"} color={C.accent} />
            </div>
          )}
        </Klik>
      </Card>
    );

    // LTV: koľko klient zaplatí za celý čas spolupráce. Strop na to, koľko sa
    // oplatí minúť na jeho získanie.
    const odisliD = Object.values(clients).filter((c) => c.status === "Neaktívny" && c.totalPrice > 0);
    const ltvOdislych = odisliD.length ? odisliD.reduce((a, c) => a + c.totalPrice, 0) / odisliD.length : 0;
    const mesiacovSpolu = odisliD.length
      ? odisliD.reduce((a, c) => a + Math.max(1, (Date.parse(c.lastSession) - Date.parse(c.firstSession)) / (30 * 86400000)), 0) / odisliD.length
      : 0;
    nodes.ltvZdroj = (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3><Info label="Hodnota klienta (LTV)" text="Koľko klient priemerne zaplatí za celý čas spolupráce a ako dlho vydrží. Ráta sa z ODÍDENÝCH klientov — u tých, čo stále chodia, sa nedá povedať, koľko ešte zaplatia, a priemer by bol nepravdivo nízky. LTV je strop na to, koľko sa oplatí minúť na získanie jedného klienta." /></H3>
        <Klik kam={() => onNavigate("klienti", "rast")} onNavigate="Klienti → Rast a strata">
          {odisliD.length === 0 ? <Empty>Zatiaľ nie sú odídení klienti s platbami.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <MiniStat label="Ø hodnota klienta" value={fmtCZK(ltvOdislych)} color={C.green} />
              <MiniStat label="Ø dĺžka spolupráce" value={`${mesiacovSpolu.toFixed(1)} mes.`} color={mesiacovSpolu >= 12 ? C.green : mesiacovSpolu >= 6 ? C.orange : C.red} />
              <MiniStat label="Z koľkých odídených" value={String(odisliD.length)} />
              <MiniStat label="Ø / mesiac spolupráce" value={mesiacovSpolu > 0 ? fmtCZK(ltvOdislych / mesiacovSpolu) : "—"} />
            </div>
          )}
        </Klik>
      </Card>
    );

    // Kohorty dopytov: z dopytov KTORÉHO mesiaca sa stali klienti. Priradenie
    // podľa mena — dopyt a klient sa spájajú menom, nič iné spoločné nemajú.
    const menaKlientov = new Set(Object.values(clients).map((c) => c.name.trim().toLowerCase()));
    const dopytyPodlaMes = new Map<string, { n: number; z: number }>();
    for (const l of data.leads || []) {
      const mk = (l.date || "").slice(0, 7);
      if (!mk) continue;
      const e = dopytyPodlaMes.get(mk) || { n: 0, z: 0 };
      e.n++;
      if (menaKlientov.has((l.name || "").trim().toLowerCase())) e.z++;
      dopytyPodlaMes.set(mk, e);
    }
    const kohortyD = [...dopytyPodlaMes.entries()].filter(([mk]) => vMes(mk)).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    nodes.kohortyDDopytov = (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3><Info label="Kohorty dopytov" text="Z koľkých dopytov daného mesiaca sa nakoniec stali klienti. Dopyt a klient sa spájajú menom — ak je meno zapísané inak, dvojica sa nenájde a konverzia vyzerá horšie, než bola. Posledné dva mesiace čítaj opatrne: časť ľudí sa ešte len rozhoduje." /></H3>
        <Klik kam={() => onNavigate("marketing", "lievik")} onNavigate="Marketing → Lievik">
          {kohortyD.length === 0 ? <Empty>Zatiaľ žiadne zapísané dopyty.</Empty> : (
            <LineChart
              data={kohortyD.map(([mk, v]) => ({ label: monthLabel(mk), values: [v.n, v.z] }))}
              series={[{ name: "Dopyty", color: C.blue }, { name: "Stali sa klientmi", color: C.green }]}
              height={190} fmt={(n) => String(Math.round(n))} autoY alignEnd
            />
          )}
        </Klik>
      </Card>
    );

    return nodes;
  }, [vzas, toky, data, clients, weeks, btc, btcStav, kanaly, mktTik, kpiOverrides, kpiSkryte, onNavigate]);
}
