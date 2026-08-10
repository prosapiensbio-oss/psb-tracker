import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BARTER_KLIENTI, PRVY_MESIAC_OTAZOK, PRVY_MESIAC_Z_FIO, vzasVerzia, nastavBtcVyplaty, nastavHodinyZTrackera, nastavJarekZTrackera, nastavNakladyZFio, nastavPnlOverrides, nastavPrijmyZTrackera, nastavVyplaty, nastavZmenyKategorii, nazovKategorie, pnlHodnota, pnlOverridesNaUlozenie } from "../../lib/psb/vzas";

import {
  checkSession,
  fetchData,
  fetchMonthNotes,
  fetchWeekEntries,
  ingestFiles,
  logout as apiLogout,
  resetAll as apiReset,
  saveAnomaly,
  saveOverride,
  fetchBtcReserve,
  fetchVzasSettings,
  saveVzasSetting,
  type BtcNakup,
} from "../../lib/psb/client";
import { rodinaZKluca,
  kotvaDat,
  capacityByTrainer,
  monthlyFinance,
  nastavObjednaneZKalendara,
  deriveClients,
  deriveRegister,
  deriveSixM,
} from "../../lib/psb/compute";
import { buildAiContext } from "../../lib/psb/aiContext";
import { Assistant, useAssistantChat } from "./Assistant";
import { fmtDMY, monthLabel, normName } from "../../lib/psb/format";
import { ObdobieCtx } from "../../lib/psb/obdobie";
import { C, S, tab } from "../../lib/psb/theme";
import type { ClientOverride, PSBData } from "../../lib/psb/types";
import { EMPTY_DATA } from "../../lib/psb/types";
import type { IngestResult } from "../../lib/psb/db.server";
import { Icon } from "./ui";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { Treningy } from "./Treningy";
import { Klienti } from "./Klienti";
import { Marketing } from "./Marketing";
import { VYSLEDKY_LISTY, Vysledky, Vzas } from "./Vzas";
import { Kalendar, type KalUdalost } from "./Kalendar";
import { tokyKlientov } from "./Fluktuacia";
import { Udaje } from "./Udaje";
import { HladanieKlienta } from "./Hladanie";
import { ZapisButton } from "./Zapis";
import { ritualy as spocitajRitualy } from "../../lib/psb/rituals";
import { nastavRozpis, pridajDoRozpisu, type PohybZaBunku } from "../../lib/psb/rozpis";
import { chybajuceNaklady, dvojiteZapisy, nezhodyPrijmov, nezhodySExcelom, type BankovyMesiac, type Pohyb } from "../../lib/psb/kontrolaNakladov";
import { MKT_MESACNE } from "../../lib/psb/marketing";

export type Actions = {
  setOverride: (name: string, key: keyof ClientOverride, value: unknown) => void;
  ackAnomaly: (key: string, note: string, ack?: boolean) => void;
  ingest: (files: { filename: string; text: string }[]) => Promise<IngestResult[]>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Tvrdé obnovenie kalendára: stiahne ho teraz a prepočíta zostatky. */
  obnovKalendar: () => Promise<void>;
};

// Deep-link from Dashboard click-throughs: focus one week (Tréningy → Prehľad) or one month (Financie → Zárobky).
/** Jeden krok mesačnej uzávierky. */
export type KrokUzavierky = {
  id: string;
  label: string;
  hotovo: boolean;
  /** Krátka veta o stave — „658 pohybov" alebo „chýba výpis". */
  detail: string;
  tab?: string;
  sub?: string;
  /** Čo na cieľovej obrazovke otvoriť — inak človek dopadne na zoznam. */
  focus?: NavFocus;
};

export type NavFocus = {
  week?: string; month?: string; client?: string; trainer?: string; nonce?: number;
  /** Klik na dlaždicu, ktorá hovorí o SKUPINE ľudí (napr. „11 odmlčaných“),
   *  otvorí Klientov len s nimi. Predtým doviedol na zoznam všetkých a človek
   *  si tých jedenásť musel nájsť sám — čo je presne tá práca, ktorú mala
   *  dlaždica ušetriť. */
  skupina?: { label: string; mena: string[] };
};

// Five top-level areas, each answering a different question, left to right as a
// story: what is happening now → the work → where the next client comes from →
// the money → how it is going against the plan. Marketing and Výsledky used to
// live inside Tracker and VZAS; both answer questions their host did not.
/** Druhá appka — bitcoinová evidencia. Kokpit z nej už ťahá rezervu
 *  (podpísaným odkazom cez /api/btc-reserve); táto konštanta je to isté
 *  miesto pre ľudí. */
export const BTC_APP = "https://btc.prosapiensbio.workers.dev";

const TABS = [
  // ── Šesť záložiek namiesto ôsmich (Jerry, 10. 8. 2026) ────────────────────
  //
  // Triedené podľa toho, ako často tam človek chodí, nie podľa oblastí:
  // denne Kokpit a Kalendár, týždenne Klienti, mesačne Peniaze a Mesiac.
  //
  // Vnútorné `id` zostávajú NEZMENENÉ, hoci sa nápisy menia. Visia na nich
  // adresy (#vzas/pnl), cieľové odkazy v registri, Jarvisove ⟦odkazy⟧ aj
  // uložené rozloženia — premenovať id znamená potichu odpojiť desiatky
  // miest. Nápis je vec, ktorú vidí človek; id je vec, ktorú vidí kód.
  { id: "dashboard", label: "Kokpit", icon: "home" },
  { id: "kalendar", label: "Kalendár", icon: "calendar" },
  // Obsahom je prevádzka — tréningy, klienti, 6M, fluktuácia — ale všetko
  // sú to ľudia, tak sa to tak aj volá.
  { id: "tracker", label: "Klienti", icon: "userCheck" },
  { id: "vzas", label: "Peniaze", icon: "wallet" },
  { id: "marketing", label: "Marketing", icon: "activity" },
  // Mesiac = mesačný rituál na jednom mieste: nahrať dáta, zavrieť mesiac,
  // pozrieť výsledky, napísať správu. Boli to dve záložky (Údaje a Výsledky)
  // a robili sa striedavo v jednom sedení.
  { id: "mesiac", label: "Mesiac", icon: "upload" },
];

/** Staré adresy tabov → nové. Nikdy sa nemažú (pravidlo z 10. 8.). */
const TAB_ALIAS: Record<string, string> = { vysledky: "mesiac", udaje: "mesiac" };

const TRACKER_SECTIONS = [
  { id: "treningy", label: "Tréningy", icon: "calendar" },
  { id: "klienti", label: "Klienti", icon: "userCheck" },
];
const TRACKER_IDS = TRACKER_SECTIONS.map((s) => s.id);

export function PSBApp() {
  // Zvolená paleta sa musí nasadiť pri ŠTARTE appky.
  //
  // Doteraz to robil až komponent prepínača — a ten žije len na obrazovke
  // Údaje. Kým tam človek nezašiel, appka bežala vo východzej palete, a po
  // načítaní stránky sa vrátila späť: vyzeralo to, že sa výber neuloží, hoci
  // v localStorage celý čas bol. Nastavenie vzhľadu nesmie závisieť od toho,
  // ktorú obrazovku si otvoril.
  useEffect(() => {
    try {
      const ulozena = localStorage.getItem("psb-theme");
      if (ulozena) document.documentElement.setAttribute("data-psb-theme", ulozena);
    } catch { /* prehliadač bez localStorage — zostane východzia paleta */ }
  }, []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [ktoSom, setKtoSom] = useState<string | null>(null);
  const [data, setData] = useState<PSBData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [trackerSection, setTrackerSection] = useState("treningy");
  // Tržby, nie P&L: Peniaze sa otvárajú na tom, čo Jerry sleduje denne.
  const [vzasSub, setVzasSub] = useState("trzby");
  /** Ktorá polovica Mesiaca je otvorená: dáta a uzávierka, alebo výsledky. */
  const [mesiacSub, setMesiacSub] = useState<"udaje" | "vysledky">("udaje");
  const [vysledkySub, setVysledkySub] = useState("kvartalne");
  const [vysledkyFocus, setVysledkyFocus] = useState<NavFocus | null>(null);
  const [marketingSub, setMarketingSub] = useState("lievik");
  // Filter trénera a obdobia žije tu, nie na každej obrazovke zvlášť.
  //
  // Doteraz mal svoj vlastný Dashboard, Tréningy, Klienti, Financie aj 6M — a
  // vo VZAS dokonca každá záložka svoj vlastný. Prepnutie na Terezku na jednej
  // obrazovke teda neznamenalo nič na druhej a človek si musel pamätať, čo kde
  // nastavil. To je presne opak jednej pravdy na jeden údaj.
  const [trainer, setTrainer] = useState("all");
  const [obdobie, setObdobie] = useState("2026");
  // Týždenné zápisy a mesačné poznámky nie sú v PSBData — majú vlastné tabuľky
  // a doteraz sa čítali až na obrazovke, kde sa píšu. Lenže pripomienka musí
  // vedieť, či je to vyplnené, skôr než tam človek príde.
  const [zapisy, setZapisy] = useState<{ weeks: Record<string, Record<string, string>>; mesiace: Record<string, { note?: string; answers?: Record<string, string> }> }>({ weeks: {}, mesiace: {} });
  const [treningySub, setTreningySub] = useState("prehled");
  const [klientiSub, setKlientiSub] = useState("klienti");
  const [treningyFocus, setTreningyFocus] = useState<NavFocus | null>(null);
  const [vzasFocus, setVzasFocus] = useState<NavFocus | null>(null);
  const [klientiFocus, setKlientiFocus] = useState<NavFocus | null>(null);

  // Kde som — v adrese, nie len v hlave appky.
  //
  // Doteraz appka po obnovení stránky vždy skončila na Dashboarde. Znamenalo to,
  // že sa nedal poslať odkaz („pozri sa na Jarkov dlh"), nefungovalo tlačidlo
  // späť a po každom nasadení sa človek musel preklikať tam, kde bol. Adresa je
  // najlacnejšia pamäť, akú prehliadač má.
  //
  // Formát je #zalozka/podzalozka, napr. #tracker/klienti alebo #vzas/jarek.
  const cestaZoStavu = () => {
    if (active === "tracker") {
      const pod = trackerSection === "treningy" ? treningySub : trackerSection === "klienti" ? klientiSub : "";
      return `#tracker/${trackerSection}${pod ? `/${pod}` : ""}`;
    }
    if (active === "vzas") return `#vzas/${vzasSub}`;
    if (active === "mesiac") return mesiacSub === "udaje" ? "#udaje" : `#vysledky/${vysledkySub}`;
    if (active === "marketing") return `#marketing/${marketingSub}`;
    return `#${active}`;
  };

  const nastavZCesty = useCallback((hash: string) => {
    const [zal, pod, pod2] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!zal) return;
    if (!TABS.some((t) => t.id === zal) && !TAB_ALIAS[zal]) return;
    setActive(TAB_ALIAS[zal] || zal);
    if (zal === "udaje") setMesiacSub("udaje");
    if (zal === "vysledky") setMesiacSub("vysledky");
    if (zal === "tracker" && pod && TRACKER_IDS.includes(pod)) {
      setTrackerSection(pod);
      if (pod === "treningy" && pod2) setTreningySub(pod2);
      if (pod === "financie" && pod2) { setActive("vzas"); setVzasSub(pod2 === "klienti" ? "predikcia" : pod2); }
      if (pod === "klienti" && pod2) setKlientiSub(pod2);
    }
    if (zal === "vzas" && pod) setVzasSub(pod);
    if (zal === "vysledky" && pod) setVysledkySub(pod);
    if (zal === "marketing" && pod) setMarketingSub(pod);
  }, []);

  // Pri štarte a pri tlačidle späť čítame z adresy.
  useEffect(() => {
    nastavZCesty(window.location.hash);
    const h = () => nastavZCesty(window.location.hash);
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, [nastavZCesty]);

  // Pri prepínaní zapisujeme. replaceState, nie pushState: každé kliknutie na
  // podzáložku by inak pridalo krok do histórie a tlačidlo späť by sa muselo
  // stláčať desaťkrát, kým by človek opustil appku.
  useEffect(() => {
    const c = cestaZoStavu();
    if (window.location.hash !== c) window.history.replaceState(null, "", c);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to a tab, optionally to a focused week/month/client. Dashboard
  // click-throughs still pass the old section ids (treningy/klienti/…), so map
  // those onto the Tracker tab + its section rather than making callers change.
  const navigate = useCallback((tab: string, sub?: string, focus?: NavFocus) => {
    // „6m" už nie je sekcia — je to pohľad v Klientoch. Staré odkazy (register,
    // karta na dashboarde) tým pádom vedú tam, kde 6M dnes žije.
    if (tab === "6m") {
      setActive("tracker");
      setTrackerSection("klienti");
      setKlientiSub("6m");
      // Revízia 2026-08-08: skorý return zahadzoval focus — register „Lukáš:
      // 5. mesiac" otvoril 6M zoznam, ale Lukáša v ňom nezvýraznil a človek
      // ho hľadal sám medzi dvadsiatimi menami.
      if (focus) setKlientiFocus(focus);
      return;
    }
    // Bývalá sekcia Prevádzka → Financie žije v Peniazoch. Staré odkazy
    // (register, dashboard, Jarvisove ciele, uložené hash cesty) sa nemažú —
    // mapujú sa. „klienti" bývala štvrtá podzáložka Financií a jej obsah
    // (tempo a hodnota klientov) je dnes v Predikcii; „cashflow" vo Financiách
    // nikdy neexistoval, ale dva odkazy naň mierili.
    // Referencie sa presťahovali z Marketingu ku klientom.
    if (tab === "marketing" && sub === "referencie") {
      setActive("tracker");
      setTrackerSection("klienti");
      setKlientiSub("referencie");
      return;
    }
    if (tab === "financie") {
      const mapa: Record<string, string> = { trzby: "trzby", sedenia: "sedenia", predikcia: "predikcia", klienti: "predikcia", cashflow: "trzby" };
      setActive("vzas");
      setVzasSub(mapa[sub || ""] || "trzby");
      if (focus) setVzasFocus(focus);
      return;
    }
    if (TRACKER_IDS.includes(tab)) {
      setActive("tracker");
      setTrackerSection(tab);
    } else {
      // Staré id („vysledky", „udaje") vedú na Mesiac a rovno na tú správnu
      // polovicu. Odkazy z registra, Jarvisa aj uložené adresy tak fungujú
      // ďalej — presmerovanie, nie mazanie.
      setActive(TAB_ALIAS[tab] || tab);
      if (tab === "udaje") setMesiacSub("udaje");
      if (tab === "vysledky") setMesiacSub("vysledky");
    }
    if (tab === "treningy" && sub) setTreningySub(sub);
    if (tab === "klienti" && sub) setKlientiSub(sub);
    // Revízia 2026-08-08: PENIAZE tu chýbali úplne. Sub sa nastavoval pre
    // tréningy, klientov, výsledky aj marketing — ale nie pre vzas, takže
    // KAŽDÝ odkaz do Peňazí (dlaždica Zisk → P&L, Rezerva → Cashflow, kroky
    // uzávierky, Jarvisove ⟦odkazy⟧) pristál na naposledy otvorenej
    // podzáložke a vyzeralo to, že klik nefunguje. To isté s focusom —
    // nastavoval sa len v legacy vetve „financie", takže klik na „Max · júl"
    // v grafe tržieb mesiac nikdy neotvoril.
    if (tab === "vzas" && sub) setVzasSub(sub);
    if (tab === "vzas" && focus) setVzasFocus(focus);
    // Podzáložka Výsledkov sa nikdy nenastavovala — pripomienka „Mesačná
    // uzávierka" tak doviedla človeka na Kvartálne a vyzeralo to, že klik
    // nefunguje. Rovnaká mechanika ako pri ostatných, len chýbala.
    if (tab === "vysledky" && sub) setVysledkySub(sub);
    if (tab === "marketing" && sub) setMarketingSub(sub);
    // Fokus na klienta má zmysel len v zozname klientov. Keď bol človek práve
    // v Dopytoch alebo v Raste a strate a klikol na meno vo vyhľadávaní,
    // zameranie sa nastavilo do podzáložky, ktorú nevidno — a nič sa nestalo.
    // …a SKUPINA (dlaždica Odmlčaní, koláč platieb) rovnako: filter žije
    // v zozname klientov, takže bez vynútenia podzáložky sa čip nastavil
    // v pozadí a človek pozeral na Rast a stratu bez známky filtra.
    if (tab === "klienti" && !sub && (focus?.client || focus?.skupina)) setKlientiSub("klienti");
    if (tab === "treningy" && focus) setTreningyFocus(focus);
    if (tab === "klienti" && focus) setKlientiFocus(focus);
    if (tab === "vysledky" && focus) setVysledkyFocus(focus);
    // Zápisy mesiaca sa načítavajú raz pri štarte, ale odpovede na otázky sa
    // ukladajú v inom komponente s vlastným stavom. Kto vyplní otázky a prejde
    // do Údajov zamknúť mesiac, narazil by na zámok tvrdiaci, že otázky
    // chýbajú — appka by ho poslala späť robiť, čo práve dokončil. Obnoviť
    // pri príchode na Údaje je lacné a rieši presne tento prechod.
    if (tab === "udaje") void nacitajZapisy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // `silent` keeps the full-screen "Načítavam…" away on background refreshes —
  // it unmounts the whole tree, which threw the user out of whatever sub-tab
  // they were editing (e.g. every keystroke in Dopyty bounced back to Klienti).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setData(await fetchData());
    if (!silent) setLoading(false);
  }, []);

  const nacitajZapisy = useCallback(async () => {
    const [weeks, mesiace] = await Promise.all([fetchWeekEntries(), fetchMonthNotes()]);
    setZapisy({ weeks, mesiace });
  }, []);

  useEffect(() => {
    (async () => {
      const s = await checkSession();
      setAuthed(s.authed);
      setKtoSom(s.user);
      if (s.authed) { await load(); void nacitajZapisy(); }
      else setLoading(false);
    })();
  }, [load, nacitajZapisy]);

  const clients = useMemo(() => deriveClients(data), [data]);
  // Latest clients for tolerant name resolution in setOverride (e.g. AI passes "Jakub Stigut" → "Jakub Štigut").
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const sixM = useMemo(() => deriveSixM(data, clients), [data, clients]);
  const capacity = useMemo(() => capacityByTrainer(clients, data.sessions), [clients, data.sessions]);
  const register = useMemo(() => deriveRegister(data, clients, sixM, capacity), [data, clients, sixM, capacity]);
  // Metrické zmeny — „prístroj si všimne, že sa zmenili jeho čísla".
  // Ohlásenia platforiem sú hypotézy o internete; prepad vlastných klikov je
  // fakt o nás. Pravidlo: posledný uzavretý mesiac vs priemer troch pred ním,
  // hlási sa až prepad o ≥30 % a len pri aspoň štyroch mesiacoch dát — menej
  // je šum, nie signál.
  const [webMetriky, setWebMetriky] = useState<{ gsc: { m: string; kliky: number }[]; ga4: { m: string; udalosti: number }[] }>({ gsc: [], ga4: [] });
  // Marketing má dva nezávislé zdroje: CSV exporty z Metricoolu (príspevok po
  // príspevku → MKT_MESACNE) a mesačnú zostavu v PDF, ktorú prečíta Jarvis
  // (→ kanaly_mesiace). Kontrola dokladov pozerala len na prvý, takže hlásila
  // „chýba Metricool" aj keď bola nahratá zostava. Stačí ktorýkoľvek.
  const [kanalyMesiace, setKanalyMesiace] = useState<string[]>([]);
  // Mzdové hodiny pre mesiace, ktoré Excel nemá — priamo z PTmindera, bez
  // úvodných tréningov (tie sa platia zvlášť a do mzdových hodín nepatria).
  useEffect(() => {
    const podlaMesiaca: Record<string, { jerry: number; terezka: number }> = {};
    for (const s of data.sessions) {
      if (s.sessionType === "UVODNE") continue;
      const mk = s.date.slice(0, 7);
      const e = (podlaMesiaca[mk] ||= { jerry: 0, terezka: 0 });
      if (s.sessionTrainer === "Jerry") e.jerry += s.duration / 60;
      else if (s.sessionTrainer === "Terezka") e.terezka += s.duration / 60;
    }
    if (nastavHodinyZTrackera(podlaMesiaca)) setFioTik((x) => x + 1);
  }, [data.sessions]);

  // Živé tržby z PTmindera do P&L — CENTRÁLNE. Pôvodne to volali len
  // Dashboard, DashGrafy a karta Peniaze; keď sa appka otvorila rovno na
  // Výsledkoch (pamätá si poslednú kartu), júl mal v kvartáloch tržby 0.
  // Funkcia, ktorá sa spúšťa len ako vedľajší účinok návštevy inej karty,
  // zlyhá presne vtedy, keď tú kartu nikto nenavštívi.
  useEffect(() => {
    const cash: Record<string, number> = {};
    for (const m of monthlyFinance(data)) cash[m.month] = m.cash;
    if (nastavPrijmyZTrackera(cash)) setFioTik((x) => x + 1);
  }, [data]);

  // Výplaty v bitcoine. Časť výplaty neodíde z účtu, ale z BTC rezervy — na
  // bankovom výpise nie sú, takže bez nich by mesiac vyzeral, akoby si tréner
  // vzal menej, než naozaj vzal.
  useEffect(() => {
    void fetchBtcReserve(true, true, true).then((r) => {
      // Platby klientov v bitcoine sú TRŽBA, ktorá cez účet nikdy neprejde.
      // Bez nich kontrola príjmov hlásila, že za júl chýba 132 000 Kč — a
      // pritom 130 000 z toho prišlo v BTC.
      if (r?.platby?.length) {
        const bt: Record<string, number> = {};
        const podlaKlienta: Record<string, number> = {};
        for (const x of r.platby) {
          bt[String(x.datum).slice(0, 7)] = (bt[String(x.datum).slice(0, 7)] || 0) + (x.czk || 0);
          // Sats po klientoch — profil ukáže, koľko kto celkovo zaplatil v BTC.
          // Meno sa normalizuje, appky sa líšia v diakritike.
          if (x.klient) podlaKlienta[normName(x.klient)] = (podlaKlienta[normName(x.klient)] || 0) + (x.sats || 0);
        }
        setBtcPrijmy(bt);
        setBtcSatsKlienti(podlaKlienta);
      }
      // Nákupy platené bitcoinom sa do P&L NEPÍŠU.
      //
      // Prvá verzia ich tam písala ako náklad — bola zlá. Jerry nahráva faktúry
      // (Alza a spol.) do Kokpitu a do bitcoinovej knihy zapisuje výpis
      // z peňaženky. Ten istý nákup teda existuje dvakrát: raz ako doklad, raz
      // ako výber. Doklad je náklad, výber je len spôsob úhrady — importovať
      // oboje znamená zaplatiť to v P&L dvakrát.
      //
      // Je to tá istá logika, akú už má appka pri PLATBÁCH klientov: zdrojom
      // pravdy o tržbách je PTminder, bitcoinová kniha len ukazuje, či platba
      // naozaj dorazila. Pri nákladoch je zdrojom pravdy faktúra a kniha
      // ukazuje, či a čím sa zaplatilo.
      if (r?.nakupy?.length) {
        const zoznam: Record<string, BtcNakup[]> = {};
        for (const x of r.nakupy) (zoznam[String(x.datum).slice(0, 7)] ||= []).push(x);
        setBtcNakupy(zoznam);
      }
      if (!r?.vyplaty?.length) return;
      const podlaMesiaca: Record<string, { jerry: number; terezka: number; jerryFp: number }> = {};
      for (const v of r.vyplaty) {
        const mk = v.datum.slice(0, 7);
        const e = (podlaMesiaca[mk] ||= { jerry: 0, terezka: 0, jerryFp: 0 });
        const czk = v.czk || 0;
        // „FP spain" nie je bežná výplata — v Exceli má vlastný riadok.
        if (/fp\s*spain/i.test(v.poznamka)) e.jerryFp += czk;
        else if (v.kto === "terezka") e.terezka += czk;
        else if (v.kto === "jerry") e.jerry += czk;
        // Poznámka bez mena („Vyplata") sa delí na polovicu — ROVNAKO ako
        // neurčená výplata z banky o pár riadkov nižšie. Predtým padla celá
        // Jerrymu, takže tá istá neurčitosť sa v dvoch zdrojoch čítala
        // dvoma spôsobmi a dlhy sa líšili podľa toho, ktorou cestou peniaz
        // odišiel. V knihe je zatiaľ jediná taká (jún 2026, 997 Kč — mesiac
        // z Excelu, ten sa importom neprepisuje), takže sa tým nič nehýbe.
        else { e.jerry += czk / 2; e.terezka += czk / 2; }
      }
      if (nastavBtcVyplaty(podlaMesiaca)) setFioTik((x) => x + 1);
    }).catch(() => {});
  }, []);

  // Barterové členstvá (Sofia) sa započítavajú ako splátka Jarkovho dlhu —
  // cenu balíčka vie PTminder, takže sa neprepisuje ručne.
  useEffect(() => {
    const podlaMesiaca: Record<string, number> = {};
    for (const p of data.packages) {
      if (!BARTER_KLIENTI.includes(p.client) || !p.payment || !p.validFrom) continue;
      const mk = p.validFrom.slice(0, 7);
      podlaMesiaca[mk] = (podlaMesiaca[mk] || 0) + p.payment;
    }
    if (nastavJarekZTrackera(podlaMesiaca)) setFioTik((x) => x + 1);
  }, [data.packages]);

  // Náklady z banky sa načítajú raz pre celú appku — model je modulový, takže
  // ich potrebuje aj dlaždica Zisk na dashboarde, nielen obrazovka VZAS.
  const [, setFioTik] = useState(0);
  const [bankaSumy, setBankaSumy] = useState<BankovyMesiac>({});
  const [bankaPohyby, setBankaPohyby] = useState<Record<string, Record<string, Pohyb[]>>>({});
  /** Nákupy z BTC po mesiacoch — pre rozpis bunky aj pre kontrolu dvojitého zápisu. */
  const [btcNakupy, setBtcNakupy] = useState<Record<string, BtcNakup[]>>({});
  /** Výbery z BTC peňaženky, ku ktorým sa nenašla faktúra — náklad chýba v P&L. */
  const [btcBezDokladu, setBtcBezDokladu] = useState<BtcNakup[]>([]);
  /** Platby s ručne potvrdeným párom — patria na obrazovku párovania, nie medzi výstrahy. */
  const [btcSparovane, setBtcSparovane] = useState<BtcNakup[]>([]);
  /**
   * Ručne potvrdené páry: id výberu z knihy → čísla faktúr.
   *
   * Automatika páruje podľa sumy, lenže suma v Kč sa z bitcoinu odvodzuje
   * kurzom a platobná brána si berie spread — 3,5 % rozdiel je bežný, nie
   * chyba. Žiadna tolerancia to nespraví spoľahlivo: úzka nenájde nič, široká
   * spáruje nesprávne. Preto posledné slovo má človek a jeho rozhodnutie sa
   * pamätá; automatika sa doň už nemieša.
   */
  const [btcParovanie, setBtcParovanie] = useState<Record<string, string[]>>({});
  /** Posledný zapísaný stav hotovosti — jeden z krokov uzávierky. */
  const [stavHotovosti, setStavHotovosti] = useState<{ hotovost: number; datum: string } | null>(null);
  /** Faktúry, ktoré zatiaľ nemajú platbu — ponuka pri ručnom párovaní. */
  const [volneFaktury, setVolneFaktury] = useState<{ cislo: string; datum: string; celkom: number; dodavatel: string }[]>([]);
  useEffect(() => {
    void fetchVzasSettings().then((st) => {
      const p = st["btc_parovanie"];
      if (p && typeof p === "object") setBtcParovanie(p as Record<string, string[]>);
      const h = st["stav_penazi"] as { hotovost: number; datum: string } | undefined;
      if (h && typeof h.hotovost === "number") setStavHotovosti(h);
      // Uložené opravy P&L, kategórie a mzdové nastavenia patria do modelu
      // CENTRÁLNE — pôvodne ich načítavali až karty Peniaze→P&L a Mzdy pri
      // svojom otvorení, takže Kvartálne otvorené rovno po štarte počítalo
      // bez Jerryho opráv. Rovnaká trieda chyby ako tržby nižšie.
      let zmena = false;
      const o = st["pnl_overrides"];
      if (o && typeof o === "object" && nastavPnlOverrides(o as never)) zmena = true;
      const kat = st["pnl_kategorie"];
      if (kat && typeof kat === "object" && nastavZmenyKategorii(kat as never)) zmena = true;
      const sal = st["salary_personal"];
      if (sal && typeof sal === "object" && nastavVyplaty(sal as never)) zmena = true;
      if (zmena) setFioTik((x) => x + 1);
    });
  }, []);
  /** Uloží pár a hneď prepočíta náklady. */
  const sparujBtc = useCallback((idVyberu: number, faktury: string[]) => {
    setBtcParovanie((prev) => {
      const next = { ...prev };
      if (faktury.length) next[String(idVyberu)] = faktury;
      else delete next[String(idVyberu)];
      void saveVzasSetting("btc_parovanie", next);
      return next;
    });
  }, []);
  /**
   * Udalosti z Google Kalendára — predbežná vrstva pre grafy.
   *
   * Načítava sa TU, nie v karte Kalendár: predikcie ich potrebujú aj vtedy, keď
   * na tú kartu nikto nešiel. Je to tá istá lekcia ako pri tržbách — čo sa
   * spúšťa len ako vedľajší účinok návštevy obrazovky, chýba presne vtedy, keď
   * tú obrazovku nikto neotvorí.
   */
  const [kalUdalosti, setKalUdalosti] = useState<KalUdalost[]>([]);
  useEffect(() => {
    void fetch("/api/kalendar", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; udalosti?: KalUdalost[] }) => {
        if (!j.ok || !Array.isArray(j.udalosti)) return;
        setKalUdalosti(j.udalosti);
        // Objednané hodiny idú do predikcie tržieb — centrálne, aby dashboard,
        // grafy, Financie aj VZAS počítali z toho istého.
        const dnes = new Date().toISOString().slice(0, 10);
        const objednane: Record<string, number> = {};
        for (const u of j.udalosti) {
          if ((u.typ !== "trening" && u.typ !== "uvodny") || !u.klient) continue;
          if (u.zaciatok.slice(0, 10) < dnes) continue;
          objednane[u.klient] = (objednane[u.klient] || 0) + 1;
        }
        if (nastavObjednaneZKalendara(objednane)) setFioTik((x) => x + 1);
      })
      .catch(() => {});
  }, []);

  const [bankaPrijmy, setBankaPrijmy] = useState<Record<string, number>>({});
  const [btcPrijmy, setBtcPrijmy] = useState<Record<string, number>>({});
  const [btcSatsKlienti, setBtcSatsKlienti] = useState<Record<string, number>>({});
  const [hotovostMesiace, setHotovostMesiace] = useState<Set<string>>(new Set());
  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { gscMesacne?: { m: string; kliky: number }[]; ga4?: { m: string; udalosti: number }[]; kanaly?: { mesiac: string }[] }) => {
        setWebMetriky({ gsc: j.gscMesacne || [], ga4: j.ga4 || [] });
        setKanalyMesiace([...new Set((j.kanaly || []).map((k) => String(k.mesiac)))]);
      })
      .catch(() => {});
  }, []);

/**
 * Ktoré faktúry dokopy tvoria jednu platbu.
 *
 * Jeden nákup sa často rozpadne na viac dokladov — Alza rozdelí objednávku
 * podľa skladov a z 2 588 Kč zaplatených naraz sú tri faktúry (2 202 + 175 +
 * 199). Párovanie jedna platba = jedna faktúra ich nikdy nenájde a náklad
 * zostane mimo výkazu.
 *
 * Hľadá sa najmenšia skupina, ktorá sa do tolerancie trafí. Prehľadáva sa
 * úplne, ale len medzi dokladmi v okne ±7 dní a najviac po štvoriciach —
 * väčšia objednávka sa rozpadne zriedka a kombinácií by inak boli tisíce.
 */
function skupinaFaktur(
  kandidati: { cislo: string; celkom: number; datum: string; dodavatel: string }[],
  ciel: number,
  tolerancia: number,
): string[] | null {
  // Skupina smie vzniknúť LEN z jednej objednávky: rovnaký dodávateľ, rovnaký
  // deň. To je totiž jediné, čo rozdelená objednávka naozaj znamená — Alza
  // rozseká jeden nákup podľa skladov, nie naprieč týždňami a obchodmi.
  //
  // Bez tohto pravidla vznikajú náhodné súčty. Bankový pohyb 759 Kč z 27. 7.
  // si takto vzal faktúry 399 Kč z 1. 8. a 359 Kč z 21. 7. — dokopy 758 Kč,
  // do koruny presne, a pritom spolu nemajú nič. Tá 399 patrila platbe
  // bitcoinom a tá zostala bez dokladu. Pri dvoch stovkách pohybov a hŕstke
  // faktúr je taká zhoda skôr pravidlom než výnimkou.
  const jednaObjednavka = (c: typeof kandidati) =>
    c.length < 2 || c.every((x) => x.datum === c[0].datum && x.dodavatel === c[0].dodavatel);
  // Rozhoduje ODCHÝLKA, až potom počet faktúr.
  //
  // Prvá verzia uprednostňovala menšiu skupinu a mýlila sa: platba 2 588 Kč
  // z 25. 7. si vybrala dvojicu 359 + 2 202 (odchýlka 27) namiesto správnej
  // trojice 2 202 + 175 + 199 (odchýlka 12), lebo dvojica je „menšia".
  // Tá 359 pritom patrila k inej platbe, ktorá potom zostala nespárovaná.
  // Suma je tvrdý údaj, počet dokladov je len tvar objednávky.
  let najlepsia: { cisla: string[]; odchylka: number } | null = null;
  const zvaz = (polozky: typeof kandidati, sucet: number) => {
    const odchylka = Math.abs(sucet - ciel);
    if (odchylka > tolerancia) return;
    if (!jednaObjednavka(polozky)) return;
    const cisla = polozky.map((x) => x.cislo);
    if (!najlepsia || odchylka < najlepsia.odchylka - 0.005 || (Math.abs(odchylka - najlepsia.odchylka) <= 0.005 && cisla.length < najlepsia.cisla.length)) {
      najlepsia = { cisla, odchylka };
    }
  };
  const n = Math.min(kandidati.length, 12);
  const K = kandidati;
  for (let i = 0; i < n; i++) {
    zvaz([K[i]], K[i].celkom);
    for (let j = i + 1; j < n; j++) {
      zvaz([K[i], K[j]], K[i].celkom + K[j].celkom);
      for (let k = j + 1; k < n; k++) {
        zvaz([K[i], K[j], K[k]], K[i].celkom + K[j].celkom + K[k].celkom);
        for (let l = k + 1; l < n; l++) {
          zvaz([K[i], K[j], K[k], K[l]], K[i].celkom + K[j].celkom + K[k].celkom + K[l].celkom);
        }
      }
    }
  }
  return najlepsia ? (najlepsia as { cisla: string[] }).cisla : null;
}

  // Náklady od júla 2026 tečú z banky — Excel končí júnom. Sčítajú sa výdavky
  // podľa kategórie a mesiaca a zapíšu sa do P&L; staršie mesiace zostávajú
  // z Excelu, aby sa dali oboje porovnať.
  useEffect(() => {
    void fetch("/api/fio", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(async (j: { pohyby?: { datum: string; suma: number; kategoria: string; protistrana?: string; poznamka?: string; typ?: string }[] }) => {
        // Faktúry ROZPISUJÚ bankový pohyb, nenahrádzajú ho. Nákup z Alzy je
        // v banke ako jedna suma a na faktúre ako trinásť položiek — keby sa
        // pripočítalo oboje, náklad by bol dvojnásobný. Preto sa spárovaný
        // pohyb do P&L nezapočíta a namiesto neho idú položky faktúry.
        type FaPol = { faktura: string; dodavatel: string; datum: string; cena: number; kategoria: string; nazov?: string };
        const fa: FaPol[] = await fetch("/api/faktury", { credentials: "same-origin" })
          .then((r) => r.json())
          .then((x: { polozky?: FaPol[] }) => x.polozky || [])
          .catch(() => [] as FaPol[]);
        const doklady = new Map<string, { datum: string; celkom: number; polozky: FaPol[] }>();
        for (const p of fa) {
          const e = doklady.get(p.faktura) || { datum: p.datum, celkom: 0, polozky: [] as FaPol[] };
          e.celkom += p.cena;
          e.polozky.push(p);
          doklady.set(p.faktura, e);
        }
        // Položka bez kategórie dedí prevažujúcu kategóriu svojho dokladu.
        //
        // Alza píše zľavy a dopravu ako samostatné riadky („Sleva 15 % k
        // položce…", −104,85 Kč) a tie pri kategorizácii ľahko zostanú prázdne.
        // Zahodiť ich znamená zapísať tovar za cenu PRED zľavou: augustové
        // faktúry tak boli v P&L o 145 Kč drahšie, než koľko z peňaženky
        // naozaj odišlo. Zľava patrí k tovaru, ktorý zlacnela — teda do jeho
        // kategórie. Doklad, ktorý nemá kategorizované vôbec nič, sa nemení:
        // tam nie je od čoho dediť a mlčať je čestnejšie než hádať.
        for (const d of doklady.values()) {
          const vahy: Record<string, number> = {};
          for (const p of d.polozky) if (p.kategoria && p.kategoria !== "mimo") vahy[p.kategoria] = (vahy[p.kategoria] || 0) + Math.abs(p.cena);
          const hlavna = Object.entries(vahy).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (!hlavna) continue;
          for (const p of d.polozky) if (!p.kategoria) p.kategoria = hlavna;
        }
        const pouzite = new Set<string>();

        /**
         * Jedna položka faktúry → správna kopa.
         *
         * Revízia našla, že položky s kategóriou `vyplaty.*` sa vo VŠETKÝCH
         * troch párovacích slučkách ticho zahadzovali — neboli náklad, neboli
         * výplata, neboli nič. Terezkina kozmetika na júlových faktúrach
         * (1 242,27 Kč) tak zmizla z výkazu úplne: zisk bol o toľko vyšší
         * a jej vybraté o toľko nižšie. Nákup osobnej veci na firemnú kartu
         * je pritom výplata v naturáliách a patrí do „poslané".
         */
        const zapocitajPolozku = (mk: string, pol: FaPol, popis: string, doklad: string) => {
          if (!pol.kategoria || pol.kategoria === "mimo") return;
          if (pol.kategoria.startsWith("vyplaty")) {
            const v = (vyplaty[mk] ||= { jerry: 0, terezka: 0 });
            if (pol.kategoria === "vyplaty.jerry") v.jerry += pol.cena;
            else if (pol.kategoria === "vyplaty.terezka") v.terezka += pol.cena;
            else { v.jerry += pol.cena / 2; v.terezka += pol.cena / 2; }
            return;
          }
          (sumy[mk] ||= {});
          sumy[mk][pol.kategoria] = (sumy[mk][pol.kategoria] || 0) + pol.cena;
          pridajDoRozpisu(rozpis, mk, pol.kategoria, { datum: String(pol.datum).slice(0, 10), popis, suma: pol.cena, zdroj: "faktura", doklad });
        };

        const sumy: Record<string, Record<string, number>> = {};
        // Súčty nestačia na kontrolu dvojitého zápisu — tá potrebuje vedieť,
        // koľko pohybov za tým číslom stojí a odkiaľ prišli.
        const pohybyPodla: Record<string, Record<string, Pohyb[]>> = {};
        const vyplaty: Record<string, { jerry: number; terezka: number }> = {};
        // Rozpis sa plní pri tom istom prechode ako súčty — inak by sa to, čo
        // tabuľka ukáže po rozkliknutí, mohlo rozísť s číslom nad ním.
        const rozpis: Record<string, PohybZaBunku[]> = {};
        const prijmyBanka: Record<string, number> = {};
        for (const p of j.pohyby || []) {
          // Príchodzie pohyby sa do nákladov nerátajú, ale sčítať ich treba —
          // sú jediné nezávislé svedectvo o tom, čo naozaj prišlo, a jediný
          // spôsob, ako skontrolovať PTminder.
          if (p.suma > 0) {
            // VŠETKY príchodzie pohyby, bez ohľadu na kategóriu.
            //
            // Pôvodne som vynechával kôš „mimo" v domnienke, že sa tým dá
            // kontrola umlčať. To bolo naopak: pri VÝDAVKU znamená „mimo"
            // súkromný nákup, ktorý do P&L nepatrí, ale pri PRÍJME znamená
            // „toto je duplicita PTmindera, nerátaj to druhýkrát ako tržbu".
            // Peniaze na účet aj tak prišli. Keď Jerry tých 31 júlových
            // platieb zaradil, kontrola prestala vidieť banku úplne a ohlásila
            // dieru 181 962 Kč, ktorá neexistuje.
            const mkP = String(p.datum).slice(0, 7);
            prijmyBanka[mkP] = (prijmyBanka[mkP] || 0) + p.suma;
            continue;
          }
          if (p.suma >= 0 || !p.kategoria || p.kategoria === "mimo") continue;
          const mk = String(p.datum).slice(0, 7);
          if (p.kategoria.startsWith("vyplaty")) {
            const v = (vyplaty[mk] ||= { jerry: 0, terezka: 0 });
            // Výplata bez určenia a spoločná sa delí na polovicu — inak by celá
            // pristála jednému a dlh druhého by sa rozišiel s realitou.
            if (p.kategoria === "vyplaty.jerry") v.jerry += -p.suma;
            else if (p.kategoria === "vyplaty.terezka") v.terezka += -p.suma;
            else { v.jerry += -p.suma / 2; v.terezka += -p.suma / 2; }
            continue;
          }
          // Sedí tento pohyb na niektorý doklad? Suma do koruny, dátum do
          // siedmich dní — karta sa zúčtuje o pár dní neskôr než nákup.
          //
          // Aj tu môže jedna platba pokrývať VIAC faktúr: Alza rozdelí
          // objednávku podľa skladov a z jedného stiahnutia z karty sú tri
          // doklady. Tolerancia zostáva korunová — skupina, ktorá dá presne
          // zaplatenú sumu, je takmer isto tá správna.
          let rozpisany = false;
          const kandidatiB = [...doklady.entries()]
            .filter(([c, d]) => !pouzite.has(c) && Math.abs(Date.parse(p.datum) - Date.parse(d.datum)) / 86400000 <= 7)
            .map(([c, d]) => ({ cislo: c, celkom: d.celkom, datum: d.datum, dodavatel: d.polozky[0]?.dodavatel || "" }));
          const skupinaB = skupinaFaktur(kandidatiB, -p.suma, 1);
          for (const cislo of skupinaB || []) {
            const d = doklady.get(cislo);
            if (!d) continue;
            pouzite.add(cislo);
            for (const pol of d.polozky) zapocitajPolozku(mk, pol, `${pol.dodavatel ? `${pol.dodavatel} — ` : ""}${pol.nazov || "položka faktúry"}`, cislo);
            rozpisany = true;
          }
          if (rozpisany) continue;
          (sumy[mk] ||= {});
          sumy[mk][p.kategoria] = (sumy[mk][p.kategoria] || 0) + -p.suma;
          pridajDoRozpisu(rozpis, mk, p.kategoria, {
            datum: String(p.datum).slice(0, 10),
            // Protistrana je meno, poznámka je text platby — spolu dávajú riadok,
            // v ktorom sa Jerry vie orientovať bez otvárania banky.
            popis: [p.protistrana, p.poznamka].filter(Boolean).join(" · ") || "bankový pohyb",
            suma: -p.suma, zdroj: "banka",
          });
          // Aj jednotlivé pohyby, nielen súčet — kontrola dvojitého zápisu
          // potrebuje vedieť, koľko ich za tým číslom stojí a odkiaľ prišli.
          ((pohybyPodla[mk] ||= {})[p.kategoria] ||= []).push({
            datum: String(p.datum).slice(0, 10),
            suma: -p.suma,
            hotovost: p.typ === "hotovosť",
            popis: [p.protistrana, p.poznamka].filter(Boolean).join(" · ") || "",
          });
        }
        // ── Faktúry zaplatené bitcoinom ──────────────────────────────────
        //
        // Až doteraz sa náklad z faktúry dostal do P&L jedine tak, že sa
        // faktúra spárovala s BANKOVÝM pohybom. Faktúra zaplatená z peňaženky
        // žiadny bankový pohyb nemá — takže sa nikdy nenavštívila a jej náklad
        // do výkazu nedorazil. Doklad v appke bol, číslo v P&L nie.
        //
        // Zdrojom pravdy zostáva FAKTÚRA (má položky aj kategórie); výber
        // z peňaženky je len dôkaz, že sa zaplatilo, a kedy. Preto sa páruje
        // rovnako ako bankový pohyb, len s väčšou toleranciou: suma v Kč sa
        // prepočítava kurzom v čase transakcie, takže na korunu sedieť nemusí.
        const bezDokladu: BtcNakup[] = [];
        // Ručne potvrdené páry sa spracujú PRVÉ a ich faktúry sa zamknú —
        // automatika ich potom nemá ako priradiť inam.
        const rucne = new Set<string>();
        for (const [idStr, cisla] of Object.entries(btcParovanie)) {
          const nak = Object.values(btcNakupy).flat().find((x) => String(x.id) === idStr);
          if (!nak) continue;
          const mk = String(nak.datum).slice(0, 7);
          if (mk < PRVY_MESIAC_Z_FIO) continue;
          rucne.add(idStr);
          for (const cislo of cisla) {
            const d = doklady.get(cislo);
            if (!d || pouzite.has(cislo)) continue;
            pouzite.add(cislo);
            for (const pol of d.polozky) zapocitajPolozku(mk, pol, `${pol.nazov || pol.dodavatel || "položka"} · zaplatené bitcoinom (spárované ručne)`, cislo);
          }
        }
        // CHRONOLOGICKY, od najstaršej platby.
        //
        // Kniha vracia platby od najnovšej a v tomto poradí sa aj párovali —
        // platba z 1. augusta si tak stihla vziať faktúry z 25. júla (sú v okne
        // ±7 dní), júlová platba potom siahla po faktúre z 21. 7. a tá
        // najstaršia zostala bez dokladu. Reťaz posunutých priradení.
        //
        // Od najstaršej to nenastane: každá platba si najprv nájde svoje
        // vlastné doklady a ďalšia berie až to, čo naozaj zostalo.
        const vsetkyNakupy = Object.values(btcNakupy).flat()
          .slice()
          .sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
        {
          for (const nakup of vsetkyNakupy) {
            const czk = nakup.czk || 0;
            if (!czk) continue;
            if (rucne.has(String(nakup.id))) continue; // človek už rozhodol
            const mk = String(nakup.datum).slice(0, 7);
            if (mk < PRVY_MESIAC_Z_FIO) continue;
            // Kandidáti: nepoužité doklady v okne ±7 dní. Jedna platba môže
            // pokryť viac faktúr — Alza rozdelí objednávku podľa skladov.
            const kandidati = [...doklady.entries()]
              .filter(([c, d]) => !pouzite.has(c) && Math.abs(Date.parse(nakup.datum) - Date.parse(d.datum)) / 86400000 <= 7)
              .map(([c, d]) => ({ cislo: c, celkom: d.celkom, datum: d.datum, dodavatel: d.polozky[0]?.dodavatel || "" }));
            const skupina = skupinaFaktur(kandidati, czk, Math.max(50, czk * 0.02));
            if (!skupina) { bezDokladu.push(nakup); continue; }
            for (const cislo of skupina) {
              const d = doklady.get(cislo);
              if (!d) continue;
              pouzite.add(cislo);
              for (const pol of d.polozky) zapocitajPolozku(mk, pol, `${pol.nazov || pol.dodavatel || "položka"} · zaplatené bitcoinom${skupina.length > 1 ? ` (${skupina.length} faktúry naraz)` : ""}`, cislo);
            }
          }
        }
        // Ktoré výbery z peňaženky nenašli doklad — zoznam sa plní priamo pri
        // párovaní, nie dodatočným hľadaním. Predtým sa to skúšalo znova a
        // s inou logikou, takže výsledky sa mohli rozísť.
        // POZOR na rozdiel: `btcBezDokladu` je zoznam platieb, ktoré doklad
        // naozaj nemajú — z neho sa robí upozornenie a podmienka uzávierky.
        // Ručne spárované idú zvlášť: na obrazovku párovania patria (inak sa
        // raz potvrdený pár nedá opraviť), ale medzi „bez faktúry" nie.
        //
        // Prvá verzia ich zlievala do jedného poľa a uzávierka potom hlásila
        // „2× platba bez faktúry", hoci tá istá obrazovka o riadok nižšie
        // tvrdila, že každá platba svoj doklad má. Dva protichodné údaje
        // z jedného zdroja sú horšie než jeden chýbajúci.
        const rucneNakupy = Object.keys(btcParovanie)
          .map((id) => Object.values(btcNakupy).flat().find((x) => String(x.id) === id))
          .filter((x): x is BtcNakup => !!x && String(x.datum).slice(0, 7) >= PRVY_MESIAC_Z_FIO);
        setBtcBezDokladu(bezDokladu);
        setBtcSparovane(rucneNakupy.sort((a, b) => String(b.datum).localeCompare(String(a.datum))));
        // Doklady, ktoré nikto nepoužil — ponuka pre ručné spárovanie.
        // Do ponuky patria aj doklady, ktoré drží niektorý ručný pár — inak by
        // sa z už potvrdeného spárovania nedalo nič odobrať ani doplniť.
        const drziRucne = new Set(Object.values(btcParovanie).flat());
        setVolneFaktury(
          [...doklady.entries()]
            .filter(([c]) => !pouzite.has(c) || drziRucne.has(c))
            .map(([c, d]) => ({ cislo: c, datum: d.datum, celkom: Math.round(d.celkom * 100) / 100, dodavatel: d.polozky[0]?.dodavatel || "" }))
            .sort((a, b) => b.datum.localeCompare(a.datum)),
        );

        nastavRozpis(rozpis);
        // Zošit sa pozná podľa typu pohybu — mesiac netreba pýtať, vyplýva z
        // dátumov, ktoré sa pri prepise potvrdzujú.
        setHotovostMesiace(new Set(
          (j.pohyby || []).filter((x) => x.typ === "hotovosť").map((x) => String(x.datum).slice(0, 7)),
        ));
        // Sumy si drží aj React — register z nich robí kontrolu „čo nedorazilo"
        // a „čo nesedí s Excelom". Bez toho by o nich vedel len model.
        setBankaSumy(sumy);
        setBankaPohyby(pohybyPodla);
        setBankaPrijmy(prijmyBanka);
        if (nastavNakladyZFio(sumy, vyplaty)) setFioTik((x) => x + 1);
        else setFioTik((x) => x + 1); // rozpis pribudol aj bez zmeny súm
      })
      .catch(() => {});
  }, [btcNakupy, btcParovanie]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kontroly nad bankovými sumami. Register je jediné miesto, kam sa človek
  // pozerá, keď hľadá „čo mám spraviť" — ďalšia karta vedľa neho by znamenala
  // dve miesta na tú istú otázku.
  // Odloženie („pripomeň mi to o týždeň") nie je to isté ako vybavenie.
  // Appka poznala len „skryť navždy", takže odložiť sa dalo iba tak, že vec
  // zmizla — a s ňou aj pripomienka. Odložená položka sa vráti sama.
  //
  // Skladuje sa v tom istom poli ako poznámka k akceptácii, s predponou
  // „odlozene|DÁTUM|" — vlastnú tabuľku by si to nezaslúžilo a migrácia
  // existujúcich zápisov by bola drahšia než tento prefix.
  const stavPolozky = useCallback((key: string, rodinaVstup?: string) => {
    // Bez zadanej rodiny sa odvodí z kľúča (to isté bez dátumu/mesiaca), takže
    // „Nehlásiť" má KAŽDÁ položka — Jerry, 10. 8.
    const rodina = rodinaVstup ?? rodinaZKluca(key);
    // Umlčaná rodina prebíja všetko: „už mi toto nehlás" platí na celý druh
    // upozornenia, nie na jeden dátum. Bez toho sa vec vrátila zajtra s novým
    // kľúčom a Skryť pôsobilo, akoby nefungovalo.
    const mute = rodina ? (data.anomalyAck || {})[`mute|${rodina}`] : undefined;
    if (mute) return { acked: true, note: mute.note || "nehlásiť", rodina };
    const z = (data.anomalyAck || {})[key];
    if (!z) return { acked: false, note: undefined as string | undefined, rodina };
    const m = /^odlozene\|(\d{4}-\d{2}-\d{2})\|?([\s\S]*)$/.exec(z.note || "");
    if (!m) return { acked: true, note: z.note, rodina };
    const dnes = new Date().toISOString().slice(0, 10);
    // Dátum už prešiel → položka sa vracia medzi živé, aj s poznámkou prečo.
    if (m[1] <= dnes) return { acked: false, note: `odložené na ${m[1]}${m[2] ? ` — ${m[2]}` : ""}`, vratene: true, rodina };
    return { acked: true, note: `odložené do ${m[1]}${m[2] ? ` — ${m[2]}` : ""}`, rodina };
  }, [data.anomalyAck]);

  const kontrolaBanky = useMemo(() => {
    const out: typeof register = [];
    const ack = data.anomalyAck || {};
    // Posledný UZAVRETÝ mesiac, nie posledný v dátach.
    //
    // Siedmeho augusta hlásila appka „za aug 26 nedorazil nájom" — a pritom
    // august ešte len začal a nájom sa platí okolo desiateho. Kontrola sa
    // pozerala na posledný mesiac v banke, čo je vždy ten rozbehnutý. Rovnaká
    // rodina chýb ako kotva dát: kód, ktorý predpokladá, že mesiac s dátami je
    // mesiac hotový.
    const beziaci = new Date().toISOString().slice(0, 7);
    const mesiace = Object.keys(bankaSumy).filter((m) => m < beziaci).sort();
    if (!mesiace.length) return out;
    const posledny = mesiace[mesiace.length - 1];

    // (1) Pravidelný náklad, ktorý nedorazil. Toto je jediná kontrola v appke,
    // ktorá sa pozerá na to, čo v dátach NIE JE — a preto ako jediná vie
    // zachytiť nezaplatený nájom.
    for (const n of chybajuceNaklady(bankaSumy, posledny)) {
      const key = `naklad|${n.kluc}`;
      const meno = nazovKategorie(n.kategoria);
      out.push({
        key, category: "Anomália", tone: n.druh === "chyba" ? "red" : "orange",
        title: n.druh === "chyba"
          ? `${meno}: v ${monthLabel(n.mesiac)} nedorazil`
          : `${meno}: v ${monthLabel(n.mesiac)} výrazne nižší`,
        // Rozbalený register ukazuje detail, nie titulok — bez mena na jeho
        // začiatku sa z položky nedá zistiť, ČO vlastne chýba.
        detail: n.druh === "chyba"
          ? `${meno} — platilo sa ${n.zMesiacov} zo 4 predošlých mesiacov, obvykle ${Math.round(n.obvykle).toLocaleString("cs-CZ")} Kč, ale za ${monthLabel(n.mesiac)} v banke nie je nič. Buď je pohyb zaradený inde, platilo sa v hotovosti, alebo faktúra nie je uhradená. Zisk za ten mesiac je zatiaľ o túto sumu vyšší, než bude.`
          : `${meno} — obvykle ${Math.round(n.obvykle).toLocaleString("cs-CZ")} Kč, za ${monthLabel(n.mesiac)} len ${Math.round(n.teraz).toLocaleString("cs-CZ")} Kč. Buď je časť zaradená inde, alebo sa platilo menej.`,
        ...stavPolozky(key, `naklad|${n.kategoria}`),
        priority: n.druh === "chyba" ? 3 : 7, client: "vzas|pnl",
      });
    }

    // (1a2) Výber z bitcoinovej peňaženky bez faktúry.
    //
    // Náklad sa do P&L dostane z FAKTÚRY, nie z výberu — výber je len dôkaz
    // úhrady. Keď k výberu doklad nie je, náklad vo výkaze chýba a zisk je
    // o tú sumu vyšší, než v skutočnosti bol. Alebo to bol súkromný nákup
    // a potom je všetko v poriadku — to appka rozhodnúť nevie, preto sa pýta.
    const bezDokladuPodlaMes: Record<string, BtcNakup[]> = {};
    for (const x of btcBezDokladu) (bezDokladuPodlaMes[String(x.datum).slice(0, 7)] ||= []).push(x);
    for (const [mk, zoznam] of Object.entries(bezDokladuPodlaMes)) {
      const spolu = zoznam.reduce((a, x) => a + (x.czk || 0), 0);
      if (spolu < 500) continue; // drobné nemá zmysel naháňať
      const key = `btcbezdokladu|${mk}`;
      out.push({
        key, category: "Anomália", tone: "orange",
        title: `${zoznam.length}× platba bitcoinom bez faktúry v ${monthLabel(mk)} — ${Math.round(spolu).toLocaleString("cs-CZ")} Kč`,
        detail: `Z bitcoinovej peňaženky odišlo ${Math.round(spolu).toLocaleString("cs-CZ")} Kč v ${zoznam.length} platbách (${zoznam.slice(0, 4).map((x) => `${fmtDMY(x.datum)} ${Math.round(x.czk || 0).toLocaleString("cs-CZ")} Kč${x.poznamka ? ` — ${x.poznamka}` : ""}`).join(", ")}${zoznam.length > 4 ? ` a ďalších ${zoznam.length - 4}` : ""}), ale nenašla sa k nim faktúra. Cez účet neprešli, takže import z Fio ich nevidel — ak to boli firemné nákupy, ten náklad v P&L chýba a zisk za ${monthLabel(mk)} je o toľko vyšší, než bol. Nahraj doklad v Údajoch a spáruje sa sám. Ak to bol súkromný nákup, odklepni.`,
        ...stavPolozky(key, "btcbezdokladu"), priority: 4, client: "udaje|",
      });
    }

    // (1b) Ten istý výdavok dvoma cestami — z banky aj zo zošita. Vyzerá
    // úplne normálne z oboch strán a nájde sa len tak, že sa niekto pozrie.
    for (const d of dvojiteZapisy(bankaPohyby)) {
      const key = `dvojity|${d.kluc}`;
      const meno = nazovKategorie(d.kategoria);
      const zdroje = d.pohyby.some((x) => x.hotovost) && d.pohyby.some((x) => !x.hotovost);
      out.push({
        key, category: "Anomália", tone: "red",
        title: `${meno}: ${d.pohyby.length} platby v ${monthLabel(d.mesiac)}`,
        detail: `${meno} — za ${monthLabel(d.mesiac)} sú zapísané ${d.pohyby.length} platby (${d.pohyby.map((x) => `${fmtDMY(x.datum)} ${Math.round(x.suma).toLocaleString("cs-CZ")} Kč${x.hotovost ? " zo zošita" : " z banky"}`).join(", ")}), spolu ${Math.round(d.spolu).toLocaleString("cs-CZ")} Kč. Inokedy tam býva jedna.` +
          (zdroje ? " Jedna je z banky a jedna zo zošita — vyzerá to, že ten istý výdavok dorazil dvoma cestami." : "") +
          " Ak je to naozaj dvakrát, oprav to v Údaje → Zapísané pohyby (kategória mimo ten pohyb vylúči).",
        ...stavPolozky(key, `dvojity|${d.kategoria}`), priority: 2, client: "udaje|",
      });
    }

    // (1c) Čo prišlo na účet vs. čo hovorí PTminder. Tržby sa z banky nikdy
    // nepočítajú, takže bez tejto kontroly by zabudnutá platba v PTminderi
    // nemala ako vyjsť najavo.
    const ptPodlaMesiaca: Record<string, number> = {};
    for (const m of monthlyFinance(data)) ptPodlaMesiaca[m.month] = m.cash;
    // Banka + zošit + BTC. Tri cesty, ktorými peniaze reálne prídu.
    const prijmySpolu: Record<string, number> = { ...bankaPrijmy };
    for (const [mk, v] of Object.entries(btcPrijmy)) prijmySpolu[mk] = (prijmySpolu[mk] || 0) + v;
    for (const n of nezhodyPrijmov(prijmySpolu, ptPodlaMesiaca)) {
      const key = `prijmy|${n.mesiac}`;
      out.push({
        key, category: "Zmena", tone: "orange",
        title: `${monthLabel(n.mesiac)}: banka a PTminder sa v príjmoch líšia o ${n.rozdiel.toLocaleString("cs-CZ")} Kč`,
        detail: n.bankaViac
          ? `Za ${monthLabel(n.mesiac)} prišlo tromi cestami (účet + zošit + BTC) ${n.banka.toLocaleString("cs-CZ")} Kč, ale PTminder hlási tržby ${n.ptminder.toLocaleString("cs-CZ")} Kč — o ${n.rozdiel.toLocaleString("cs-CZ")} Kč MENEJ. Buď chýba platba v PTminderi, alebo časť príjmu nie je tržba (vklad, vratka, preplatok) a patrí do koša „mimo".`
          : `Za ${monthLabel(n.mesiac)} hlási PTminder tržby ${n.ptminder.toLocaleString("cs-CZ")} Kč, ale tromi cestami (účet + zošit + BTC) prišlo len ${n.banka.toLocaleString("cs-CZ")} Kč — o ${n.rozdiel.toLocaleString("cs-CZ")} Kč menej. Buď časť platieb ešte nedorazila, alebo prišla ďalšou cestou, o ktorej appka nevie, alebo je to barter.`,
        ...stavPolozky(key), priority: 6, client: "udaje|",
      });
    }

    // (2) Excel vs. banka za mesiace, ktoré import neprepisuje. Doteraz sa dal
    // rozdiel nájsť len rozkliknutím jednej bunky po druhej — sto klikov,
    // ktoré nikto neurobí. Zhrnú sa do JEDNEJ položky: register má povedať, že
    // je čo riešiť, nie vysypať štyridsať riadkov.
    const nezhody = nezhodySExcelom(bankaSumy, pnlHodnota, PRVY_MESIAC_Z_FIO);
    if (nezhody.length) {
      const key = `nezhody|${PRVY_MESIAC_Z_FIO}|${nezhody.length}`;
      const top = nezhody.slice(0, 3)
        .map((n) => `${nazovKategorie(n.kategoria)} ${monthLabel(n.mesiac)}: Excel ${Math.round(n.excel).toLocaleString("cs-CZ")} vs banka ${Math.round(n.banka).toLocaleString("cs-CZ")}`)
        .join(" · ");
      out.push({
        key, category: "Zmena", tone: "orange",
        title: `Excel a banka sa rozchádzajú v ${nezhody.length} ${nezhody.length === 1 ? "položke" : nezhody.length < 5 ? "položkách" : "položkách"}`,
        detail: `Mesiace do jún 2026 berú číslo z Excelu, banka slúži na kontrolu. Najväčšie rozdiely — ${top}. Celý zoznam je vo VZAS → Zisky a straty, klikom na číslo.`,
        ...stavPolozky(key), priority: 9, client: "vzas|pnl",
      });
    }
    // ── Odchody bez dôvodu ────────────────────────────────────────────────
    //
    // Appka vidí, že človek prestal chodiť. Nevidí prečo — a to je jediná vec,
    // ktorú sa nedá dopočítať a o rok už ani spýtať. Kým dôvod chýba, položka
    // visí v registri; keď sa vo Fluktuácii doplní, zmizne sama.
    //
    // Pýta sa len na uzavreté mesiace. Kto stíchol tento mesiac, sa ešte môže
    // vrátiť a otázka „prečo odišiel" by bola predčasná — presne ten omyl, na
    // ktorý sme narazili pri anomáliách bežiaceho mesiaca.
    //
    // A pýta sa len na mesiace OD PRVÉHO ŽIVÉHO (júl 2026). Jerry: „čo sa stalo
    // pred júlom už nechcem riešiť." Je to správne rozhodnutie, nie lenivosť:
    // dôvod odchodu spred roka si nikto verne nespomenie a vymyslený dôvod je
    // horší než chýbajúci. Register mal pritom osem takých mesiacov naraz —
    // osem položiek, ktoré sa nedali vybaviť, len prehliadať.
    {
      const beziaci = new Date().toISOString().slice(0, 7);
      const toky = tokyKlientov(data, clients).mesacne;
      for (const [mk, v] of toky) {
        if (mk < PRVY_MESIAC_OTAZOK || mk >= beziaci || !v.odisli.length) continue;
        const odpovede = zapisy.mesiace?.[mk]?.answers || {};
        const bezDovodu = v.odisli.filter((meno) => !(odpovede[`odchod__${meno}`] || "").trim());
        if (!bezDovodu.length) continue;
        const key = `odchody|${mk}`;
        out.push({
          key, category: "Rozhodnutie", tone: "orange",
          title: `${monthLabel(mk)}: ${bezDovodu.length === 1 ? "odišiel klient" : `odišli ${bezDovodu.length} klienti`} a nevieme prečo`,
          detail: `${bezDovodu.join(", ")} — ${bezDovodu.length === 1 ? "prestal" : "prestali"} chodiť v ${monthLabel(mk)} a dôvod nikde nie je. Dôvod je jediná vec, ktorú appka o odchode nezistí, a o rok sa naň už nikto nespýta. Doplň ho v Klienti → Fluktuácia, po rozkliknutí mesiaca.`,
          ...stavPolozky(key, "odchody"), priority: 5, client: "klienti|rast",
        });
      }
    }

    // ── Koho dnes uvidíš a čo mu treba povedať ────────────────────────────
    //
    // Všetky tieto veci appka vedela už včera — narodeniny, dochádzajúci
    // balíček, piaty mesiac. Chýbal jediný údaj: KEDY toho človeka naozaj
    // stretneš. Ten prináša kalendár, a tým sa z evidencie stáva pripomienka
    // v okamihu, keď sa s ňou dá niečo spraviť.
    //
    // Zámerne len na dnešok. Zoznam „tento týždeň" by sa čítal ako plán a
    // strácal by naliehavosť; toto je veta, ktorú si prečítaš ráno a večer je
    // buď vybavená, alebo prepadla.
    {
      const dnesIso = new Date().toISOString().slice(0, 10);
      const dnesne = kalUdalosti
        .filter((u) => u.zaciatok.slice(0, 10) === dnesIso && u.klient && (u.typ === "trening" || u.typ === "uvodny"))
        .sort((a, b) => a.zaciatok.localeCompare(b.zaciatok));
      for (const u of dnesne) {
        const c = clients[u.klient as string];
        if (!c) continue;
        const dovody: string[] = [];

        if (c.narodeniny) {
          const [, m, d] = c.narodeniny.split("-");
          if (m && d && `${m}-${d}` === dnesIso.slice(5)) dovody.push("má dnes narodeniny");
        }
        if (c.packageRemaining != null && c.packageTotal != null && c.packageRemaining <= 1) {
          dovody.push(
            c.packageRemaining <= 0
              ? "balíček má vyčerpaný — dnes je posledná hodina, ktorú mu appka pozná"
              : "v balíčku mu zostáva posledná hodina",
          );
        }
        // 6M: upozornenie si nesie sám riadok procesu — netreba ho odvodzovať
        // z fázy a mesiaca druhýkrát a inak než Prevádzka.
        const s6 = sixM.find((x) => x.client === u.klient);
        if (s6?.alert) dovody.push(s6.alert.replace(/^⚠️\s*/, "").toLowerCase());
        // Nepodpísaná zmluva ZOSTÁVA (Jerry, 9. 8.) — je to vec, ktorú treba
        // vybaviť práve vtedy, keď človeka vidíš. Šum, na ktorý sa sťažoval,
        // nerobila samotná pripomienka, ale to, že vyskočila aj u niekoho, kto
        // v 6M procese nie je. Na to je prepínač na karte klienta; keď ho tam
        // označíš ako mimo 6M, zmizne aj táto veta. A keď obťažuje inak,
        // umlčí ju „Nehlásiť" pre toho klienta.
        if (s6 && !s6.contractSigned) dovody.push("nemá podpísanú zmluvu");
        if (u.typ === "uvodny") dovody.push("je to úvodný tréning — po ňom sa rozhoduje o pokračovaní");

        if (!dovody.length) continue;
        const key = `dnes|${dnesIso}|${u.klient}`;
        out.push({
          key, category: "6M", tone: "blue",
          title: `${u.zaciatok.slice(11, 16)} ${u.klient}: ${dovody[0]}`,
          detail: `Dnes o ${u.zaciatok.slice(11, 16)} máš tréning s ${u.klient}. ${dovody.map((x) => x[0].toUpperCase() + x.slice(1)).join(". ")}.`,
          ...stavPolozky(key, `dnes|${u.klient}`), priority: 1, client: `klienti|klienti`,
        });
      }
    }

    return out;
  }, [bankaSumy, bankaPohyby, bankaPrijmy, btcPrijmy, btcBezDokladu, data.anomalyAck, kalUdalosti, clients, sixM, zapisy]); // eslint-disable-line react-hooks/exhaustive-deps

  const zmenyMetrik = useMemo(() => {
    const ack = data.anomalyAck || {};
    const beziaci = new Date().toISOString().slice(0, 7);
    const out: typeof register = [];
    const over = (rad: { m: string; v: number }[], kluc: string, nazov: string, ciel: string) => {
      const uzavrete = rad.filter((r) => r.m < beziaci && r.v > 0).sort((a, b) => a.m.localeCompare(b.m));
      if (uzavrete.length < 4) return;
      const posledny = uzavrete[uzavrete.length - 1];
      const zaklad = uzavrete.slice(-4, -1).reduce((a, r) => a + r.v, 0) / 3;
      if (zaklad > 0 && posledny.v < zaklad * 0.7) {
        const key = `zmena|${kluc}|${posledny.m}`;
        out.push({
          key, category: "Zmena", tone: "orange",
          title: `${nazov} klesli`,
          detail: `${nazov} za ${posledny.m}: ${Math.round(posledny.v).toLocaleString("cs-CZ")} — o ${Math.round((1 - posledny.v / zaklad) * 100)} % pod priemerom predošlých 3 mesiacov`,
          ...stavPolozky(key), priority: 8, client: ciel,
        });
      }
    };
    over(monthlyFinance(data).map((m) => ({ m: m.month, v: m.cash })), "trzby", "Prijaté tržby", "financie|trzby");
    over(webMetriky.gsc.map((g) => ({ m: g.m, v: g.kliky })), "gsc", "Kliky z Googlu", "marketing|dosah");
    over(webMetriky.ga4.map((g) => ({ m: g.m, v: g.udalosti })), "ga4", "Odoslané formuláre", "marketing|lievik");
    return out;
  }, [data, webMetriky]);

  // Zoznam pre quick-poznámku v „+ Zápis": meno + existujúca poznámka, nech
  // sa edituje celá a nič sa slepo neprepíše.
  const zapisKlienti = useMemo(
    () => Object.values(clients).map((c) => ({ meno: c.name, poznamka: c.trainerNote || "" })).sort((a, b) => a.meno.localeCompare(b.meno)),
    [clients],
  );

  // Rituály: čo sa má zapísať a či je to zapísané. Doplnia sa do registra ako
  // ďalšie položky — nie ako samostatná karta. Register je jediné miesto, kam
  // sa človek pozerá, keď hľadá „čo mám spraviť"; druhý zoznam vedľa neho by
  // znamenal dve miesta na tú istú otázku.
  // Čo za uzatváraný mesiac ešte chýba. Odpovedať na otázky mesiaca nad
  // neúplnými číslami znamená písať odpoveď, ktorú bude treba prepísať —
  // pripomienka preto čaká a dovtedy hovorí, čo doplniť.
  const chybajuceDoklady = useMemo(() => {
    const dnes = new Date();
    const min = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
    const mk = `${min.getFullYear()}-${String(min.getMonth() + 1).padStart(2, "0")}`;
    const chybaju: string[] = [];
    const k = kotvaDat(data);
    if (!k.plny || k.plny < mk) chybaju.push("PTminder (sedenia a platby)");
    if (!bankaSumy[mk]) chybaju.push("výpis z Fio");
    if (!MKT_MESACNE.some((r) => r.m === mk) && !kanalyMesiace.includes(mk)) chybaju.push("Metricool");
    // Bez zošita chýba hotovosť — a s ňou časť nákladov aj výplat. Mesiac,
    // ktorý sa uzavrie bez nej, vyzerá ziskovejší, než bol.
    if (!hotovostMesiace.has(mk)) chybaju.push("zošit (hotovostné platby)");
    return { mesiac: mk, chybaju };
  }, [data, bankaSumy, hotovostMesiace, kanalyMesiace]);

  const rituals = useMemo(
    () => spocitajRitualy(new Date(), zapisy.weeks, zapisy.mesiace, chybajuceDoklady),
    [zapisy, chybajuceDoklady],
  );
  const registerAll = useMemo(() => {
    const ack = data.anomalyAck || {};
    const extra = rituals
      .filter((r) => r.splatne)
      .map((r) => ({
        key: `zapis|${r.id}`,
        category: "Zápis" as const,
        tone: (r.druh === "kvartal" ? "blue" : "orange") as "blue" | "orange",
        title: r.nadpis,
        detail: `${r.nadpis} — ${r.detail}`,
        ...stavPolozky(`zapis|${r.id}`),
        // Cieľ navigácie sa vezie v `client` — register nemá vlastné pole na
        // odkaz a zaviesť ho kvôli trom položkám by bolo viac kódu než úžitku.
        client: `${r.ciel.tab}|${r.ciel.sub || ""}${r.ciel.mesiac ? `|${r.ciel.mesiac}` : r.ciel.tyzden ? `|t:${r.ciel.tyzden}` : ""}`,
        priority: r.druh === "tyzden" ? 5 : r.druh === "mesiac" ? 6 : 40,
      }));
    return [...extra, ...kontrolaBanky, ...zmenyMetrik, ...register].sort((a, b) => a.priority - b.priority);
  }, [rituals, register, kontrolaBanky, zmenyMetrik, data.anomalyAck]);

  // Jarvis dostáva CELÝ register vrátane kontrol nad bankou — inak by nevedel
  // o chýbajúcom nájme a na otázku „čo mi uniká" by odpovedal, že nič.
  // `vzasVerzia()` je v závislostiach zámerne: P&L sa napĺňa importom z banky
  // MIMO Reactu, takže bez nej by Jarvis dostal súhrn spočítaný ešte pred
  // načítaním nákladov — a odpovedal by na zisk z prázdnych čísel.
  // Čo bráni zamknutiu daného mesiaca. Jedno miesto, z ktorého číta aj
  // pripomienka na uzávierku, aj samotný zámok — dva rôzne zoznamy toho, čo
  // je „hotové", by sa časom rozišli.
  /**
   * Šesť krokov uzávierky ako STAV, nie ako odmietnutie.
   *
   * Predtým sa ten istý zoznam počítal len vtedy, keď Jerry klikol na zámok,
   * a vrátil sa ako veta „nedá sa, lebo…". To znamená, že sa dalo zistiť, čo
   * chýba, jedine pokusom o zamknutie — ako keby pilot robil predletovú
   * kontrolu tak, že sa pokúsi vzlietnuť a lietadlo mu povie, čo zabudol.
   * Teraz je to zoznam krokov s fajkami, ktorý sa dá pozerať kedykoľvek.
   */
  const krokyZamku = useCallback((mk: string): KrokUzavierky[] => {
    const k = kotvaDat(data);
    const z = zapisy.mesiace?.[mk];
    const odpovedane = Object.values(z?.answers || {}).filter((v) => String(v).trim()).length;
    const nevybavene = registerAll.filter((r) => r.key.includes(mk) && !r.acked && r.category !== "Zápis");
    // bankaPohyby[mesiac] je mapa KATEGÓRIA → pohyby, nie pole. `.length` na
    // nej dávalo „undefined pohybov v mesiaci"; treba spočítať cez kategórie.
    const pohybovMes = Object.values(bankaPohyby[mk] || {}).reduce((a, v) => a + v.length, 0);
    return [
      {
        id: "ptminder",
        label: "PTminder",
        hotovo: !!k.plny && k.plny >= mk,
        detail: k.den ? `nahratý po ${fmtDMY(k.den)}` : "nič nie je nahraté",
        tab: "udaje",
      },
      {
        id: "fio",
        label: "Výpis z Fio",
        hotovo: !!bankaSumy[mk],
        detail: bankaSumy[mk] ? (pohybovMes ? `${pohybovMes} pohybov, všetky zaradené` : "nahratý") : "chýba výpis",
        tab: "udaje",
      },
      {
        id: "zosit",
        label: "Zošit (hotovosť)",
        hotovo: hotovostMesiace.has(mk),
        detail: hotovostMesiace.has(mk) ? "nahratý" : "chýba — nahraj fotku zošita",
        tab: "udaje",
      },
      {
        id: "metricool",
        label: "Metricool",
        hotovo: MKT_MESACNE.some((r) => r.m === mk) || kanalyMesiace.includes(mk),
        detail: MKT_MESACNE.some((r) => r.m === mk) || kanalyMesiace.includes(mk) ? "nahratý" : "chýba export",
        tab: "udaje",
      },
      {
        id: "otazky",
        label: "Otázky mesiaca",
        hotovo: odpovedane > 0,
        detail: odpovedane > 0 ? `${odpovedane} zodpovedaných` : "žiadna odpoveď",
        // Otázky mesiaca žijú vo Výsledky → Mesačné, nie v Peniazoch. Prvá
        // verzia mierila na tabuľku tržieb: správna obrazovka na pohľad, ale
        // nie tá, kde sa odpovedá. Focus riadok rozbalí a doskroluje k otázkam.
        tab: "vysledky",
        sub: "mesacne",
        focus: { month: mk, nonce: Date.now() },
      },
      {
        // Stav hotovosti k uzávierke. Zošit hovorí, čo cez obálku pretieklo;
        // toto hovorí, čo v nej zostalo — a bez toho sa nedá povedať, koľko
        // firma naozaj má. Účet sa doplní sám z výpisu, bitcoin z druhej
        // appky; hotovosť je jediné číslo, ktoré musí opísať človek.
        id: "hotovostStav",
        label: "Stav hotovosti",
        hotovo: !!stavHotovosti && stavHotovosti.datum >= mk,
        detail: stavHotovosti
          ? (stavHotovosti.datum >= mk
              ? `${Math.round(stavHotovosti.hotovost).toLocaleString("cs-CZ")} Kč k ${fmtDMY(stavHotovosti.datum)}`
              : `naposledy ${fmtDMY(stavHotovosti.datum)} — prepíš na koniec mesiaca`)
          : "nezapísaný — spočítaj obálku",
        tab: "vzas",
        sub: "cashflow",
      },
      {
        id: "upozornenia",
        label: "Upozornenia mesiaca",
        hotovo: nevybavene.length === 0,
        detail: nevybavene.length
          ? nevybavene.map((r) => r.title).join(" · ")
          : "všetky vysvetlené",
        // Kam viesť: tam, kde sa TO KONKRÉTNE upozornenie rieši, nie na
        // dashboard. Každá položka registra si svoj cieľ nesie v `client`
        // (napr. „udaje|" pri platbe bez faktúry); klik na dashboard človeka
        // len vysypal medzi dvadsať iných riadkov a hľadal si to sám.
        ...(() => {
          const c = nevybavene[0]?.client || "";
          const [t, sub] = c.includes("|") ? c.split("|") : ["", ""];
          return t ? { tab: t, sub: sub || undefined } : { tab: "dashboard" };
        })(),
      },
    ];
  }, [data, bankaSumy, bankaPohyby, kanalyMesiace, hotovostMesiace, zapisy, registerAll, stavHotovosti]);

  /**
   * Všetko, čo appka o mesiaci vie, ako text pre mesačnú správu.
   *
   * Zámerne sem ide aj to, čo sa v appke inde „spotrebuje": vysvetlenia
   * z registra (tie sa odkliknú a zmiznú), odpovede na otázky mesiaca a ručné
   * opravy v P&L. Presne tie dôvody o rok chýbajú, keď sa človek pozrie na
   * číslo a nevie, prečo je také.
   */
  const podkladyMesiaca = useCallback((mk: string): string => {
    const r: string[] = [];
    const kc = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n).toLocaleString("sk-SK")} Kč`);
    const predch = (() => {
      const [y, m] = mk.split("-").map(Number);
      return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    })();

    r.push("== ČÍSLA ==");
    r.push(`Tržby: ${kc(pnlHodnota("prijmy", mk))} (predchádzajúci mesiac ${kc(pnlHodnota("prijmy", predch))})`);
    r.push(`Celkové náklady: ${kc(pnlHodnota("celkoveNaklady", mk))}`);
    r.push(`Hrubý zisk: ${kc(pnlHodnota("hrubyZisk", mk))}`);

    const sedeniaMes = data.sessions.filter((x) => x.date.slice(0, 7) === mk);
    const hodinyMes = sedeniaMes.reduce((a, x) => a + x.duration / 60, 0);
    r.push(`Odtrénované: ${sedeniaMes.length} sedení, ${Math.round(hodinyMes)} hodín`);
    const noviMes = Object.values(clients).filter((c) => (c.firstSession || "").slice(0, 7) === mk);
    r.push(`Noví klienti: ${noviMes.length}${noviMes.length ? ` (${noviMes.map((c) => c.name).join(", ")})` : ""}`);
    const dopytyMes = (data.leads || []).filter((l) => (l.date || "").slice(0, 7) === mk).length;
    r.push(`Dopyty: ${dopytyMes}`);
    r.push(`Aktívnych klientov teraz: ${Object.values(clients).filter((c) => c.status !== "Neaktívny").length}`);

    // Ručné opravy v P&L — čo sa v mesiaci prepísalo oproti importu a prečo.
    const opravy = Object.entries(pnlOverridesNaUlozenie())
      .filter(([, m]) => (m as Record<string, number>)[mk] !== undefined)
      .map(([kat, m]) => `${nazovKategorie(kat)}: ${kc((m as Record<string, number>)[mk])}`);
    if (opravy.length) {
      r.push("", "== RUČNÉ OPRAVY V P&L ==");
      for (const o of opravy) r.push(`- ${o}`);
    }

    // Vysvetlenia z registra — vybavené aj nevybavené, aj s poznámkou.
    const polozky = registerAll.filter((x) => x.key.includes(mk));
    if (polozky.length) {
      r.push("", "== UPOZORNENIA MESIACA ==");
      for (const x of polozky) {
        const pozn = (x.note || "").replace(/^odlozene\|[^|]*\|/, "").trim();
        r.push(`- ${x.title}${x.acked ? " [vybavené]" : " [NEVYBAVENÉ]"}${pozn ? ` — vysvetlenie: ${pozn}` : ""}`);
      }
    }

    // Odpovede na otázky mesiaca — Jerryho vlastné slová o tom, čo sa dialo.
    const odp = zapisy.mesiace?.[mk]?.answers || {};
    const odpText = Object.entries(odp).filter(([, v]) => String(v).trim());
    if (odpText.length) {
      r.push("", "== ODPOVEDE NA OTÁZKY MESIACA ==");
      for (const [otazka, v] of odpText) r.push(`- ${otazka}: ${String(v).trim()}`);
    }

    const stara = zapisy.mesiace?.[mk]?.note;
    if (stara) {
      r.push("", "== ČO UŽ JE V KRONIKE (neopakuj to) ==", String(stara).slice(0, 2000));
    }
    return r.join("\n");
  }, [data, clients, registerAll, zapisy]);

  // Textová podoba pre zámok a pre Jarvisa — jeden zdroj, dve podoby.
  const prekazkyZamku = useCallback((mk: string): string[] => {
    const out: string[] = [];
    for (const kr of krokyZamku(mk)) {
      if (kr.hotovo) continue;
      if (kr.id === "upozornenia") continue; // vypíšu sa nižšie menom aj s kľúčom
      out.push(`${kr.label}: ${kr.detail}`);
    }
    // Nevybavené upozornenia za ten mesiac — MENOM, nie počtom.
    //
    // Prvá verzia hlásila „2 nevysvetlené upozornenia" a Jarvis sa musel pýtať,
    // ktoré to sú. Vedieť to mal: register má v kontexte celý. Lenže počet
    // sa z neho spätne odvodiť nedá, a tak hádal. Čo appka už spočítala,
    // nemá nikoho nútiť odvodzovať znova.
    //
    // Pripomienka na uzávierku sa vynecháva — jej kľúč tiež obsahuje mesiac,
    // takže sa počítala druhýkrát pod iným menom hneď vedľa „nie sú
    // zodpovedané otázky mesiaca".
    const nevybavene = registerAll.filter((r) => r.key.includes(mk) && !r.acked && r.category !== "Zápis");
    for (const r of nevybavene) out.push(`nevysvetlené upozornenie „${r.title}" (key: ${r.key})`);
    return out;
  }, [krokyZamku, registerAll]);

  const aiContext = useMemo(
    () => buildAiContext(data, clients, sixM, capacity, registerAll),
    [data, clients, sixM, capacity, registerAll, vzasVerzia()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const actions = useMemo<Actions>(
    () => ({
      setOverride: (name, key, value) => {
        // Resolve to the real client name (diacritics/case/whitespace-insensitive)
        // so an AI-proposed "Jakub Stigut" still edits "Jakub Štigut".
        const all = clientsRef.current;
        let canonical = name;
        if (!all[name]) {
          const target = normName(name);
          const hit = Object.keys(all).find((n) => normName(n) === target);
          if (hit) canonical = hit;
        }
        // Optimistic local update, then persist.
        setData((prev) => ({
          ...prev,
          clientOverrides: { ...prev.clientOverrides, [canonical]: { ...prev.clientOverrides[canonical], [key]: value } },
        }));
        void saveOverride(canonical, key, value);
      },
      ackAnomaly: (key, note, ack = true) => {
        setData((prev) => {
          const next = { ...prev, anomalyAck: { ...prev.anomalyAck } };
          if (ack) next.anomalyAck[key] = { note, ackedAt: new Date().toISOString() };
          else delete next.anomalyAck[key];
          return next;
        });
        void saveAnomaly(key, note, ack);
      },
      ingest: async (files) => {
        const res = await ingestFiles(files);
        // Ticho. Neticho by zaplo celoobrazovkové „Načítavam…", ktoré odmontuje
        // celý strom — a s ním aj kartu uploadu, jej rozbalený stav a pozíciu
        // scrollu. Po nahratí to vyzeralo, akoby appka skočila na začiatok a
        // upload sa sám zabalil; pritom sa len prekreslila od nuly.
        await load(true);
        return res;
      },
      reset: async () => {
        await apiReset();
        await load();
      },
      refresh: () => load(true),
      // Stiahne kalendár TERAZ a hneď načíta jeho udalosti aj dáta z PTmindera.
      // Cron beží ráno a večer; toto je pre chvíľu, keď človek práve dotrénoval
      // a chce vidieť zostatok bez čakania do večera.
      obnovKalendar: async () => {
        await fetch("/api/kalendar", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ akcia: "stiahni" }),
        }).catch(() => {});
        const j = await fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
        if (j?.ok && Array.isArray(j.udalosti)) {
          setKalUdalosti(j.udalosti);
          const dnesK = new Date().toISOString().slice(0, 10);
          const obj: Record<string, number> = {};
          for (const u of j.udalosti as KalUdalost[]) {
            if ((u.typ !== "trening" && u.typ !== "uvodny") || !u.klient) continue;
            if (u.zaciatok.slice(0, 10) < dnesK) continue;
            obj[u.klient] = (obj[u.klient] || 0) + 1;
          }
          if (nastavObjednaneZKalendara(obj)) setFioTik((x) => x + 1);
        }
        await load(true);
      },
    }),
    [load],
  );

  // Zdroj klienta sa dopĺňa z dopytu sám. Keď sa dopyt premení na klienta,
  // tá istá informácia sa doteraz zapisovala druhýkrát ručne — a väčšinou
  // nezapisovala vôbec. Beží po každom načítaní; klient s už vyplneným zdrojom
  // sa preskočí, takže sa nič neprepisuje a druhé kolo je no-op.
  useEffect(() => {
    const MAPA: Record<string, string> = {
      referencia: "referencia", reklama: "reklama", instagram: "instagram",
      instagram_osobny: "instagram", google: "google", web: "web", mail: "web",
      telefon: "ine", ine: "ine",
    };
    const podlaNorm = new Map(Object.values(clients).map((c) => [normName(c.name), c]));
    for (const l of data.leads) {
      if (!l.name) continue;
      const c = podlaNorm.get(normName(l.name));
      if (!c || c.zdroj) continue;
      actions.setOverride(c.name, "zdroj", MAPA[l.source] || "ine");
      if (l.source === "referencia" && l.referrer && !c.zdrojKto) actions.setOverride(c.name, "zdrojKto", l.referrer);
    }
  }, [data.leads, clients, actions]);


  // One shared chat brain for both the floating panel and the inline dashboard widget.
  const chat = useAssistantChat(aiContext, actions);
  // Clicking a client name in a bot reply → open that client in Klienti + pop the
  // floating chat open (so the conversation follows you onto the new tab).
  const onClientClick = (name: string) => {
    navigate("klienti", undefined, { client: name, nonce: Date.now() });
    chat.setFloatingOpen(true);
  };

  if (authed === null || (authed && loading)) {
    return (
      <div style={{ minHeight: "100dvh", background: C.bg, color: C.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: C.textMuted }}>Načítavam…</p>
      </div>
    );
  }

  // Po prihlásení sa stránka NAČÍTA ZNOVA, nie prepne stavom.
  //
  // Efekty v tomto komponente bežia už pri prvom vykreslení — teda aj vtedy,
  // keď je pred nimi prihlasovacia obrazovka. Bez cookie vrátia všetky 401
  // (banka, faktúry, marketing, nastavenia, bitcoin) a keďže majú prázdne
  // závislosti, po prihlásení sa už nikdy nezopakujú. Prepnutie stavom teda
  // vpustí človeka dnu do appky, ktorá má polovicu dát prázdnu: júl bez
  // nákladov, rezerva bez bitcoinu, uzávierka hlásiaca „chýba výpis".
  //
  // Na Higgsfielde to nikdy nevyskočilo, lebo tam bola cookie stále platná a
  // prihlasovacia obrazovka sa nezobrazila. Objavilo sa to až pri prvom
  // prihlásení na Cloudflare.
  //
  // Reload je zámerne hrubý nástroj: dovoľuje pribudnúť ďalšiemu efektu bez
  // toho, aby si naň niekto musel spomenúť. Zoznam závislostí by sa raz
  // zabudol doplniť a chyba by sa vrátila v tichosti.
  if (!authed) return <Login onSuccess={() => window.location.reload()} />;

  const logout = async () => {
    await apiLogout();
    setAuthed(false);
    setKtoSom(null);
    setData(EMPTY_DATA);
  };

  return (
    <ObdobieCtx.Provider value={{ obdobie, setObdobie }}>
    {/* `psb-app` existuje kvôli palete Živé sklo: mesh sa kreslí na <body>
        a tento kontajner ho svojím nepriehľadným pozadím prekryl — appka
        potom vyzerala len ako iné farby, nie ako sklo. V klasických paletách
        trieda nič nerobí. */}
    <div className="psb-app" style={{ minHeight: "100dvh", color: C.text }}>
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 1200, margin: "0 auto", flexWrap: "wrap" }}>
        {/* Logo je zároveň cesta domov — najstarší weborý zvyk a jediné miesto,
            kde ho každý hľadá inštinktívne. */}
        <button onClick={() => navigate("dashboard")} style={{ lineHeight: 1.1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: -0.3 }}>Kokpit</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: 0.2 }}>ProSapiens Biomechanic</div>
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <HladanieKlienta clients={clients} leads={data.leads} onPick={(meno) => navigate("klienti", undefined, { client: meno, nonce: Date.now() })} onPickLead={() => navigate("klienti", "dopyty")} />
          <ZapisButton ritualy={rituals} onNavigate={(t, sub) => { navigate(t, sub); void nacitajZapisy(); }} onRefresh={() => void actions.refresh()} klienti={zapisKlienti} onDennikZapis={chat.spracujDennik} />
          {ktoSom && ktoSom !== "app" && (
            <span style={{ fontSize: 12, color: C.textMuted }} title="Pod týmto menom sa zapisujú zmeny do auditu">
              {ktoSom.charAt(0).toUpperCase() + ktoSom.slice(1)}
            </span>
          )}
          <button onClick={logout} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
            Odhlásiť sa
          </button>
        </div>
      </div>
      <nav
        style={{
          display: "flex",
          gap: 4,
          padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`,
          overflowX: "auto",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        {TABS.map((t) => (
          <button key={t.id} style={{ ...tab(active === t.id), display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => setActive(t.id)}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
        {/* Bitcoin nie je záložka, je to odkaz do druhej appky — a odkaz
            v rade záložiek vyzerá ako obsah, ktorý tam nie je. Stojí preto
            napravo, oddelene, a otvára sa v NOVEJ karte: BTC appka má vlastné
            prihlásenie a keby sa Kokpit zavrel, prišiel by človek o rozrobený
            stav (filtre, rozbalený register, návrh uzávierky). */}
        <a
          href="/api/sso?prejst=1"
          target="_blank"
          rel="noopener noreferrer"
          title="Otvoriť bitcoinovú evidenciu v novej karte (prihlási sa sama)"
          style={{ ...tab(false), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", flexShrink: 0 }}
        >
          <Icon name="bitcoin" /> Bitcoin
          <span style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
        </a>
        {/* Bitcoin žije vo vlastnej appke (prosapiens-btc) a táto karta tam
            len vedie — nie je to obsah Kokpitu. Otvára sa v NOVEJ karte
            prehliadača zámerne: BTC appka má vlastné prihlásenie a keby sa
            Kokpit zavrel, človek by po návrate prišiel o rozpracovaný stav
            (filtre, rozbalený register, návrh uzávierky).
            Šípka ↗ je jediné miesto v hlavičke, ktoré hovorí „toto vedie von". */}
      </nav>
      <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
        {active === "dashboard" && (
          <Dashboard trainer={trainer} onTrainer={setTrainer} data={data} clients={clients} kalendar={kalUdalosti} register={registerAll} sixM={sixM} capacity={capacity} actions={actions} onNavigate={navigate} assistantChat={chat} onClientClick={onClientClick} />
        )}

        {active === "tracker" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {TRACKER_SECTIONS.map((s) => {
                const on = trackerSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setTrackerSection(s.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: `1px solid ${on ? C.accent : C.border}`,
                      background: on ? C.accentBg : "transparent",
                      color: on ? C.accentLight : C.textMuted,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icon name={s.icon} /> {s.label}
                  </button>
                );
              })}
            </div>
            {trackerSection === "treningy" && <Treningy data={data} clients={clients} sub={treningySub} onSub={setTreningySub} focus={treningyFocus} trainer={trainer} onTrainer={setTrainer} />}
            {trackerSection === "klienti" && <Klienti clients={clients} capacity={capacity} actions={actions} focus={klientiFocus} leads={data.leads} trainer={trainer} onTrainer={setTrainer} sixM={sixM} sub={klientiSub} onSub={setKlientiSub} data={data} btcSatsKlienti={btcSatsKlienti} onDennikZapis={chat.spracujDennik} />}
              </>
        )}

        {active === "marketing" && <Marketing data={data} clients={clients} leads={data.leads} chat={chat} sub={marketingSub} onSub={setMarketingSub} onKlient={(m) => navigate("klienti", undefined, { client: m, nonce: Date.now() })} />}
        {active === "vzas" && <Vzas sub={vzasSub} onSub={setVzasSub} data={data} clients={clients} focus={vzasFocus} onNavigate={navigate} />}
        {active === "kalendar" && <Kalendar clients={clients} data={data} />}

        {/* MESIAC — mesačný rituál na jednom mieste. Prvá podzáložka je to,
            čím sa začína (nahrať dáta, zavrieť mesiac), zvyšok je to, čím sa
            končí (pozrieť výsledky, napísať správu). Boli to dve záložky a
            robili sa striedavo v jednom sedení. */}
        {active === "mesiac" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {[{ id: "udaje", label: "Dáta a uzávierka" }, ...VYSLEDKY_LISTY].map((l) => {
                const on = l.id === "udaje" ? mesiacSub === "udaje" : mesiacSub !== "udaje" && vysledkySub === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => { if (l.id === "udaje") setMesiacSub("udaje"); else { setMesiacSub("vysledky"); setVysledkySub(l.id); } }}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                      border: `1px solid ${on ? C.accent : C.border}`,
                      background: on ? C.accentBg : "transparent",
                      color: on ? C.accentLight : C.textMuted,
                    }}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
            {mesiacSub === "udaje"
              ? <Udaje data={data} actions={actions} chat={chat} prekazky={prekazkyZamku} kroky={krokyZamku} podklady={podkladyMesiaca} onNavigate={navigate} btc={{ platby: [...btcBezDokladu, ...btcSparovane], faktury: volneFaktury, parovanie: btcParovanie, onSparuj: sparujBtc }} />
              : <Vysledky data={data} onNavigate={navigate} clients={clients} sixM={sixM} capacity={capacity} register={register} sub={vysledkySub} onSub={setVysledkySub} focus={vysledkyFocus} skryVlastneTaby />}
          </>
        )}

      </div>
      <div style={{ ...S.h3, textAlign: "center", color: C.textDim, fontSize: 11, padding: "8px 0 24px", fontWeight: 400 }}>
        ProSapiens Biomechanic · interný nástroj · nezdieľať externe
      </div>
      <Assistant chat={chat} onClientClick={onClientClick} onNavigate={(tab, sub) => navigate(tab, sub)} />
    </div>
    </ObdobieCtx.Provider>
  );
}
