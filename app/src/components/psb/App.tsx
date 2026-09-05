import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { nazovFazy } from "../../lib/psb/mapaCyklu";
import { BARTER_KLIENTI, PRVY_MESIAC_OTAZOK, PRVY_MESIAC_Z_FIO, vzasVerzia, nastavBtcVyplaty, nastavHodinyZTrackera, nastavJarekZTrackera, nastavNakladyZFio, nastavPnlOverrides, nastavPrijmyZTrackera, nastavRucnePrijmy, nastavVyplaty, nastavZmenyKategorii, nazovKategorie, pnlHodnota, pnlOverridesNaUlozenie } from "../../lib/psb/vzas";
import { platnySplit, rozdelPohyb, PRIJEM, type PohybSplits, type SplitCiast } from "../../lib/psb/pohybSplit";

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
  fetchPeriods,
  fetchVzasSettings,
  saveVzasSetting,
  type BtcNakup,
} from "../../lib/psb/client";
import { stavPolozkyRegistra,
  parujVysvetlenia,
  zruseneTreningy,
  cakajuciKlienti,
  odstranDuplicity,
  najdiKlienta,
  menoKluc,
  kotvaDat,
  capacityByTrainer,
  monthlyFinance,
  nastavObjednaneZKalendara,
  deriveClients,
  deriveRegister,
  dnesneTreningy,
  deriveSixM,
  nezapisaneDoRegistra,
  pripomienkySlubov,
  pripomienkaDovodu,
  ktoDnesTrenoval,
  TRAINERS,
} from "../../lib/psb/compute";
import type { BtcKnihaPlatba, RegisterItem } from "../../lib/psb/compute";
import { btcPlatbyJednotlivo, btcPodlaKlientov } from "../../lib/psb/btcKontrola";
import { polozkaZastaranaBanka, polozkyBtcNesedi } from "../../lib/psb/penazneNotifikacie";
import { breakEvenPriemer, spocitajRezervu } from "../../lib/psb/rezerva";
import { buildAiContext } from "../../lib/psb/aiContext";
import { Assistant, useAssistantChat } from "./Assistant";
import { JarvisOkno } from "./JarvisOkno";
import { fmtDMY, monthLabel, normName } from "../../lib/psb/format";
import { ObdobieCtx } from "../../lib/psb/obdobie";
import { C, S, mix, tab } from "../../lib/psb/theme";
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
import { Kalendar, type KalUdalost, type Zmena as KalZmena } from "./Kalendar";
import { krokyZa, oknoMesiacov } from "./MarketingLievik";
import { tokyKlientov } from "./Fluktuacia";
import { VYCHODZIA_TEMA } from "./ThemeSwitch";
import { Udaje } from "./Udaje";
import { CAS_BUILDU, verziaServera } from "../../lib/psb/verzia";
import { HladanieKlienta } from "./Hladanie";
import { ZapisButton } from "./Zapis";
import { ritualy as spocitajRitualy } from "../../lib/psb/rituals";
import { nastavRozpis, pridajDoRozpisu, type PohybZaBunku } from "../../lib/psb/rozpis";
import { chybajuceNaklady, dvojiteZapisy, nezhodyPrijmov, nezhodySExcelom, zastaranaBanka, type BankovyMesiac, type Pohyb } from "../../lib/psb/kontrolaNakladov";
import { MKT_MESACNE, nastavIgPrispevky, nastavMarketingZImportu, nastavWebZImportu, nastavAdsZImportu, nastavWebStranky, nastavWebRychlost, nastavKanaly } from "../../lib/psb/marketing";

export type Actions = {
  /** Vráti `false`, keď zápis na serveri neprešiel — obrazovka to nesmie zamlčať. */
  setOverride: (name: string, key: keyof ClientOverride, value: unknown) => Promise<boolean>;
  ackAnomaly: (key: string, note: string, ack?: boolean) => void;
  ingest: (files: { filename: string; text: string }[]) => Promise<IngestResult[]>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Tvrdé obnovenie kalendára: stiahne ho teraz a prepočíta zostatky. */
  obnovKalendar: () => Promise<void>;
  /**
   * Zapíše do Kalendára, že sa tréning nekonal — z ktorejkoľvek obrazovky.
   *
   * Jerry, 17. 8. 2026: „keď napíšem, že Josef nepríde na jednom mieste, bude
   * o tom vedieť aj druhé miesto." Bez tohto sa odpoveď v notifikácii ukladala
   * ako poznámka a Kalendár o nej nevedel — a naopak. Toto je ten jeden zápis,
   * ktorý vidia obe strany: notifikácie stíchnu, Kalendár má záznam aj dôvod.
   */
  zapisZrusenie: (klient: string, datum: string, poznamka: string) => Promise<void>;
  /** Priradí názov z kalendára klientovi (alebo typu) — potvrdenie návrhu z notifikácie. */
  mapujKalendar: (nazov: string, trener: string, typ: string, klient: string | null) => Promise<void>;
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
  /** Kategória v P&L („fixne.prevadzka.najom") — upozornenie o chýbajúcom
   *  nájme má otvoriť TEN riadok, nie tabuľku so štyridsiatimi. */
  kategoria?: string;
  /** Klik na dlaždicu, ktorá hovorí o SKUPINE ľudí (napr. „11 odmlčaných“),
   *  otvorí Klientov len s nimi. Predtým doviedol na zoznam všetkých a človek
   *  si tých jedenásť musel nájsť sám — čo je presne tá práca, ktorú mala
   *  dlaždica ušetriť. */
  skupina?: { label: string; mena: string[] };
  /** Prepínač, ktorý sa má na cieľovej obrazovke rovno zapnúť. Notifikácia
   *  „Dopyty bez odpovede prečo" hovorí o prepínači „len nevyriešené" — a
   *  doviesť človeka k zoznamu, kde si ho musí zapnúť sám, je polovičná
   *  práca (Terezka, 22. 8. 2026). */
  filter?: string;
  /**
   * Konkrétny slot v Mape nákupného cyklu.
   *
   * Doviesť človeka na mapu a nechať ho hľadať bunku, z ktorej pred piatimi
   * minútami odišiel, je polovičná práca — presne tá, ktorú má preklik ušetriť.
   * `napadId` je nepovinné: keď ho vieme (Jarvis práve príspevok založil),
   * otvorí sa priamo ten, inak sa otvorí prázdny slot mesiaca a fázy.
   */
  slot?: { mesiac: string; faza: number; napadId?: string };
  /**
   * Na ktorú kartu Kalendára zrolovať. „zmeny" (východisková) = Zmeny
   * v kalendári, „nezname" = Nové názvy v kalendári.
   *
   * Jerry, 3. 9. 2026: klik na „N udalostí appka nepozná" ho prekliklo na
   * Zmeny v kalendári, hoci potreboval Nové názvy — dve rôzne karty, dovtedy
   * oba prekliky viedli na tú istú.
   */
  sekcia?: "zmeny" | "nezname";
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
  // Poradie podľa toho, čo Jerry rieši najčastejšie (29. 8. 2026): ľudia
  // a peniaze pred kalendárom, ktorý si aj tak pozerá v Google.
  { id: "dashboard", label: "Kokpit", icon: "home" },
  // Obsahom je prevádzka — tréningy, klienti, 6M, fluktuácia — ale všetko
  // sú to ľudia, tak sa to tak aj volá.
  { id: "tracker", label: "Klienti", icon: "userCheck" },
  { id: "vzas", label: "Peniaze", icon: "wallet" },
  { id: "marketing", label: "Marketing", icon: "activity" },
  { id: "kalendar", label: "Kalendár", icon: "calendar" },
  // Výsledky = mesačné a kvartálne pohľady, KPI, ciele, správa mesiaca.
  // Nahrávanie dát a uzávierka odišli do záložky Upload — robili sa
  // striedavo, ale sú to dva rôzne úkony a nahrať CSV treba aj mimo
  // uzávierky. `id` zostáva „mesiac“, adresa je aj tak #vysledky/…
  { id: "mesiac", label: "Výsledky", icon: "barChart" },
  // Upload = nahrať exporty a zavrieť mesiac. `id` zostáva „udaje", lebo naň
  // visia adresy (#udaje), ciele rituálov aj Jarvisove odkazy — nápis je vec
  // pre človeka, id je vec pre kód.
  { id: "udaje", label: "Upload", icon: "upload" },
  // Jarvis ako záložka, nie ako panel v rohu.
  //
  // Panel v pravom dolnom rohu je dobrý na jednu otázku medzi prácou. Na
  // rozobranie veci — s dokumentmi, so staršími debatami po ruke — je malý.
  // Toto je ten istý Jarvis vo veľkom rozložení; keď je táto záložka otvorená,
  // plávajúci panel sa skryje, aby dve okná nedržali rozchádzajúci sa stav.
  //
  // POZOR: v rade záložiek sa NEVYKRESĽUJE — od 17. 8. 2026 stojí o riadok
  // vyššie, v hlavičke medzi „+ Zápis" a „Odhlásiť sa" (Jerry). V zozname
  // zostáva, lebo naň visí adresa #jarvis, Jarvisove vlastné ⟦odkazy⟧ aj
  // ciele z registra — a tie prechádzajú kontrolou proti TABS.
  { id: "jarvis", label: "Jarvis", icon: "sparkles" },
];

/** Záložky, ktoré majú vlastné miesto mimo radu záložiek. */
const MIMO_RAD = ["jarvis"];

/** Staré podzáložky Marketingu → nové. Nikdy sa nemažú. */
const MKT_ALIAS: Record<string, string> = { algoritmus: "kanaly", dosah: "obsah" };

/** Staré adresy tabov → nové. Nikdy sa nemažú (pravidlo z 10. 8.). */
/** Staré adresy tabov → nové. „udaje" sa 29. 8. 2026 vrátilo ako vlastná
 *  záložka (Upload), preto tu už nie je. */
const TAB_ALIAS: Record<string, string> = { vysledky: "mesiac" };

const TRACKER_SECTIONS = [
  { id: "treningy", label: "Tréningy", icon: "calendar" },
  { id: "klienti", label: "Klienti", icon: "userCheck" },
];
const TRACKER_IDS = TRACKER_SECTIONS.map((s) => s.id);

/**
 * Prúžok „Aktualizovať", keď je na serveri novšia verzia než tá v pamäti.
 *
 * Jerry, 4. 9. 2026: „keď nasadíš niečo nové a ja som v appke, musím ju
 * vypnúť a zapnúť, aby sa to prepísalo — nedalo by sa priamo tlačidlo?"
 * Dalo. Číslo verzie appka porovnávať vedela už dole v Upmarke (`Verzia`),
 * ale kontrolovala len raz pri načítaní (dole v Upload) a nechala to schované. Toto ju
 * postaví navrch a hlavne ju spustí ZNOVA pri návrate z pozadia — na iPhone
 * je to presne tá chvíľa, keď v pamäti pokračuje starý kód a človek nevie, že
 * je zastaraný. Reload nič neuloží a nič nepokazí — len stiahne nový balík
 * (má iné meno súboru pri každom nasadení), takže nahradí presne to, čo treba.
 */
function NovaVerziaPas() {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    // Vo vývoji je `CAS_BUILDU` prázdny — nič sa neporovnáva a prúžok nesvieti.
    if (!CAS_BUILDU) return;
    let zrusene = false;
    const skontroluj = async () => {
      const s = await verziaServera();
      // Raz zapnuté necháme zapnuté — keby ďalší dopyt zlyhal (telefón chvíľu
      // bez siete po prebudení), prúžok nesmie zmiznúť.
      if (!zrusene && s && s !== CAS_BUILDU) setNova(true);
    };
    void skontroluj();
    const priNavrate = () => { if (document.visibilityState === "visible") void skontroluj(); };
    document.addEventListener("visibilitychange", priNavrate);
    window.addEventListener("focus", priNavrate);
    // Aj počas otvorenej appky — keby nasadenie prišlo, kým sa Jerry pozerá.
    const t = setInterval(() => { void skontroluj(); }, 5 * 60 * 1000);
    return () => {
      zrusene = true;
      document.removeEventListener("visibilitychange", priNavrate);
      window.removeEventListener("focus", priNavrate);
      clearInterval(t);
    };
  }, []);
  if (!nova) return null;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 61, padding: "8px 16px", background: mix(C.accent, 20), borderBottom: `1px solid ${mix(C.accent, 55)}`, color: C.text, fontSize: 12.5, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
      <span>Je pripravená novšia verzia Kokpitu.</span>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: "4px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `1px solid ${mix(C.accent, 60)}`, background: mix(C.accent, 30), color: C.text, whiteSpace: "nowrap" }}
      >
        Aktualizovať
      </button>
    </div>
  );
}

export function PSBApp() {
  // Zvolená paleta sa musí nasadiť pri ŠTARTE appky.
  //
  // Doteraz to robil až komponent prepínača — a ten žije len na obrazovke
  // Údaje. Kým tam človek nezašiel, appka bežala vo východzej palete, a po
  // načítaní stránky sa vrátila späť: vyzeralo to, že sa výber neuloží, hoci
  // v localStorage celý čas bol. Nastavenie vzhľadu nesmie závisieť od toho,
  // ktorú obrazovku si otvoril.
  //
  // Bez uloženej voľby sa nastaví VYCHODZIA_TEMA (sklo), nie to, čo je v CSS
  // ako `:root` — inak by nový prehliadač či mobil ukázal starý vzhľad.
  useEffect(() => {
    try {
      const ulozena = localStorage.getItem("psb-theme");
      document.documentElement.setAttribute("data-psb-theme", ulozena || VYCHODZIA_TEMA);
    } catch {
      document.documentElement.setAttribute("data-psb-theme", VYCHODZIA_TEMA);
    }
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
  const [vysledkySub, setVysledkySub] = useState("kvartalne");
  const [vysledkyFocus, setVysledkyFocus] = useState<NavFocus | null>(null);
  /** Marketing sa doteraz zamerať nedal — notifikácia „úvodný bez dopytu"
   *  doviedla na zoznam dopytov a meno si musel človek napísať sám. */
  const [marketingFocus, setMarketingFocus] = useState<NavFocus | null>(null);
  /**
   * Odkiaľ sa odišlo do Jarvisa a kam sa treba vrátiť.
   *
   * Jerry otvorí slot v Mape nákupného cyklu, pošle ho Jarvisovi a dostane
   * návrh. Bez tohto by sa musel preklikať späť cez Marketing → Čo publikovať
   * a nájsť tú istú bunku medzi šesťdesiatimi.
   */
  const [navratDoMapy, setNavratDoMapy] = useState<{ mesiac: string; faza: number; napadId?: string } | null>(null);
  /** Neúspešný zápis do dát — hlási sa raz pre celú appku, viď setOverride. */
  const [chybaZapisu, setChybaZapisu] = useState("");
  const [marketingSub, setMarketingSub] = useState("lievik");
  // Filter trénera a obdobia žije tu, nie na každej obrazovke zvlášť.
  //
  // Doteraz mal svoj vlastný Dashboard, Tréningy, Klienti, Financie aj 6M — a
  // vo VZAS dokonca každá záložka svoj vlastný. Prepnutie na Terezku na jednej
  // obrazovke teda neznamenalo nič na druhej a človek si musel pamätať, čo kde
  // nastavil. To je presne opak jednej pravdy na jeden údaj.
  /**
   * Filter trénera sa pri prvom otvorení nastaví na TOHO, KTO JE PRIHLÁSENÝ.
   *
   * Kým sa všetci hlásili jedným heslom, nebolo z čoho vychádzať a „Obaja" bolo
   * jediná možnosť. Od 24. 8. 2026 majú Jerry aj Terezka vlastné konto, takže
   * appka vie, kto sa pozerá — a Terezke nemá zmysel otvárať Jerryho klientov.
   *
   * Mapuje sa cez PRIHLASOVACIE MENO, nie cez zobrazované: Terezkino konto sa
   * volá „Terka" a porovnanie s TRAINERS („Terezka") by nesadlo.
   *
   * Vlastná voľba prebíja a pamätá sa — kto si raz prepne na „Obaja", nechce to
   * robiť po každom načítaní.
   */
  // Uložená voľba sa PREČÍTA RAZ, pri prvom vykreslení, a drží sa v stave.
  // Čítať ju v efekte sa nedá: efekt, ktorý voľbu ukladá, je deklarovaný vyššie,
  // takže sa spustí prvý a zapíše „all" ešte predtým, než sa stihne zistiť, kto
  // je prihlásený — appka sa tak vždy otvorila na „Obaja" (nájdené 24. 8. 2026).
  const [ulozenaVolba] = useState<string | null>(() => {
    try { return localStorage.getItem("psb-trainer"); } catch { return null; }
  });
  const [trainer, setTrainer] = useState(ulozenaVolba || "all");
  useEffect(() => {
    try { localStorage.setItem("psb-trainer", trainer); } catch { /* nevadí */ }
  }, [trainer]);
  // Prihlásený človek sa dozvie až z odpovede servera; keď si voľbu ešte nikto
  // nespravil, nastaví sa podľa neho.
  useEffect(() => {
    let zrusene = false;
    if (ulozenaVolba) return;
    void fetch("/api/users", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ja?: string; users?: { login: string; name: string }[] }) => {
        if (zrusene || !j.ja) return;
        const konto = (j.users || []).find((u) => u.login === j.ja || u.name === j.ja);
        if (!konto) return;
        // Naviazané na TRAINERS, nie na natvrdo napísanú dvojicu — pri treťom
        // konte by zoznam v kóde nikto neaktualizoval. Porovnáva sa
        // prihlasovacie meno malými písmenami: konto „terezka" sadne na
        // trénerku „Terezka", hoci sa zobrazuje ako „Terka".
        const t = TRAINERS.find((x) => x.toLowerCase() === konto.login.toLowerCase());
        if (t) setTrainer(t);
      })
      .catch(() => {});
    return () => { zrusene = true; };
  }, [ulozenaVolba]);
  const [obdobie, setObdobie] = useState("2026");
  // Týždenné zápisy a mesačné poznámky nie sú v PSBData — majú vlastné tabuľky
  // a doteraz sa čítali až na obrazovke, kde sa píšu. Lenže pripomienka musí
  // vedieť, či je to vyplnené, skôr než tam človek príde.
  const [zapisy, setZapisy] = useState<{ weeks: Record<string, Record<string, string>>; mesiace: Record<string, { note?: string; answers?: Record<string, string> }>; nacitane: boolean }>({ weeks: {}, mesiace: {}, nacitane: false });
  const [treningySub, setTreningySub] = useState("prehled");
  const [klientiSub, setKlientiSub] = useState("klienti");
  const [treningyFocus, setTreningyFocus] = useState<NavFocus | null>(null);
  const [vzasFocus, setVzasFocus] = useState<NavFocus | null>(null);
  const [klientiFocus, setKlientiFocus] = useState<NavFocus | null>(null);
  const [kalendarFocus, setKalendarFocus] = useState<NavFocus | null>(null);

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
    if (active === "mesiac") return `#vysledky/${vysledkySub}`;
    if (active === "marketing") return `#marketing/${marketingSub}`;
    return `#${active}`;
  };

  const nastavZCesty = useCallback((hash: string) => {
    const [zal, pod, pod2] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!zal) return;
    if (!TABS.some((t) => t.id === zal) && !TAB_ALIAS[zal]) return;
    setActive(TAB_ALIAS[zal] || zal);
    if (zal === "tracker" && pod && TRACKER_IDS.includes(pod)) {
      setTrackerSection(pod);
      if (pod === "treningy" && pod2) setTreningySub(pod2);
      if (pod === "financie" && pod2) { setActive("vzas"); setVzasSub(pod2 === "klienti" ? "predikcia" : pod2); }
      if (pod === "klienti" && pod2) setKlientiSub(pod2);
    }
    if (zal === "vzas" && pod) setVzasSub(pod);
    if (zal === "vysledky" && pod) setVysledkySub(pod);
    // Staré adresy sa nemažú, len presmerujú (pravidlo z 10. 8.).
    // „algoritmus" prestal byť záložkou, „dosah" sa rozdelil na tri.
    if (zal === "marketing" && pod) setMarketingSub(MKT_ALIAS[pod] || pod);
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
    // Dopyty sa 12. 8. presťahovali z Klientov do Marketingu (Jerry: „prečo sú
    // v Klientoch, keď to súvisí s marketingom?"). Staré odkazy sa nemažú, len
    // presmerujú — v registri, v Jarvisových cieľoch aj v uložených cestách
    // ich je plno a odkaz, ktorý vyzerá funkčne a neurobí nič, je horší než
    // žiadny.
    if (tab === "klienti" && sub === "dopyty") {
      setActive("marketing");
      setMarketingSub("dopyty");
      if (focus) setMarketingFocus(focus);
      return;
    }
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
    // Preklik z Dashboardu „Kalendár: N zmien →" nesie trénera — Kalendár sa
    // otvorí s tým istým filtrom a zroluje na tabuľku zmien.
    if (tab === "kalendar" && focus) setKalendarFocus(sub ? { ...focus, sekcia: sub as NavFocus["sekcia"] } : focus);
    // Podzáložka Výsledkov sa nikdy nenastavovala — pripomienka „Mesačná
    // uzávierka" tak doviedla človeka na Kvartálne a vyzeralo to, že klik
    // nefunguje. Rovnaká mechanika ako pri ostatných, len chýbala.
    if (tab === "vysledky" && sub) setVysledkySub(sub);
    if (tab === "marketing" && sub) setMarketingSub(MKT_ALIAS[sub] || sub);
    if (tab === "marketing" && focus) setMarketingFocus(focus);
    // Dopyty sa presťahovali z Klientov — preklik na ne chodí oboma cestami.
    if (tab === "klienti" && sub === "dopyty" && focus) setMarketingFocus(focus);
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
    // do Uploadu zamknúť mesiac, narazil by na zámok tvrdiaci, že otázky
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
    setZapisy({ weeks, mesiace, nacitane: true });
  }, []);

  useEffect(() => {
    (async () => {
      const s = await checkSession();
      setAuthed(s.authed);
      setKtoSom(s.user);
      if (s.authed) { await load(); setDataHotove(true); void nacitajZapisy(); }
      else setLoading(false);
    })();
  }, [load, nacitajZapisy]);

  const clients = useMemo(() => deriveClients(data), [data]);
  // Latest clients for tolerant name resolution in setOverride (e.g. AI passes "Jakub Stigut" → "Jakub Štigut").
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  // Pre návratku optimistického zápisu v ackAnomaly — akcie sú v useMemo
  // a stav v closure by bol zastaraný.
  const dataRef = useRef(data);
  dataRef.current = data;
  const sixM = useMemo(() => deriveSixM(data, clients), [data, clients]);
  const capacity = useMemo(() => capacityByTrainer(clients, data.sessions), [clients, data.sessions]);
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
  // Téma na dnešné hovorené video — do registra, aby ju Jerry našiel aj
  // v appke, nielen v rannej push (Jerry, 4. 9. 2026).
  const [temaDna, setTemaDna] = useState<{ tema: string; odkial: string } | null>(null);
  useEffect(() => {
    void fetch("/api/tema", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; tema?: string; odkial?: string }) => {
        if (j?.ok && j.tema) setTemaDna({ tema: j.tema, odkial: j.odkial || "" });
      })
      .catch(() => {});
  }, []);
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

  /**
   * Rezerva pre Jarvisa.
   *
   * Dlaždica na Kokpite hlásila „1,2 mes. · 219 371 Kč", ale číslo žilo len
   * v nej. Jarvis na otázku „aká je rezerva" 16. 8. odpovedal, že appka
   * rezervu nepočíta, a ponúkol miesto nej stav pokladne. Dve odpovede na to
   * isté, a tá horšia znela istejšie.
   */
  const [btcCelkom, setBtcCelkom] = useState<number | null>(null);
  /** Účet z hlavičky výpisu (`fio_zostatok`), hotovosť z ručného zápisu. */
  const [ucetStav, setUcetStav] = useState<{ suma: number; datum: string } | null>(null);
  const [hotovostStav, setHotovostStav] = useState<{ suma: number; datum: string } | null>(null);

  // Výplaty v bitcoine. Časť výplaty neodíde z účtu, ale z BTC rezervy — na
  // bankovom výpise nie sú, takže bez nich by mesiac vyzeral, akoby si tréner
  // vzal menej, než naozaj vzal.
  useEffect(() => {
    void fetchBtcReserve(true, true, true).then((r) => {
      if (typeof r?.czk === "number") setBtcCelkom(r.czk);
      setBtcKurz({ kurz: r?.rateCzkPerBtc ?? null, kedy: r?.rateUpdatedAt ?? null });
      setBtcKniha({
        vyplaty: (r?.vyplaty || []) as never,
        nakupy: (r?.nakupy || []) as never,
        cielSats: r?.goalSats ?? null,
      });
      // Platby klientov v bitcoine sú TRŽBA, ktorá cez účet nikdy neprejde.
      // Bez nich kontrola príjmov hlásila, že za júl chýba 132 000 Kč — a
      // pritom 130 000 z toho prišlo v BTC.
      if (r?.platby?.length) {
        const bt: Record<string, number> = {};
        // Sats po klientoch — profil ukáže, koľko kto celkovo zaplatil v BTC.
        // Kľúčom je menoKluc, nie normName: „Procházka" (BTC kniha) vs
        // „Prochadzka" (PTminder) prežije normName ako dve rôzne mená
        // a klientov profil by jeho satoshi nikdy neukázal. Fuzzy kľúč
        // (priezvisko-5 + meno-3) spojí obe podoby.
        const podlaKluca: Record<string, number> = {};
        for (const x of r.platby) {
          bt[String(x.datum).slice(0, 7)] = (bt[String(x.datum).slice(0, 7)] || 0) + (x.czk || 0);
          if (x.klient) podlaKluca[menoKluc(x.klient)] = (podlaKluca[menoKluc(x.klient)] || 0) + (x.sats || 0);
        }
        setBtcPrijmy(bt);
        setBtcSatsKlienti(podlaKluca);
        setBtcPlatby(r.platby as BtcKnihaPlatba[]);
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
  //
  // RAZ VIDENÝ BARTER JE ZÁZNAM V DLHOVEJ KNIHE, NIE SNÍMKA.
  //
  // `data.packages` je momentka aktuálnych balíčkov: keď Sofiin balíček
  // (20. 7. – 13. 9., 7 790 Kč) po skončení platnosti vypadne z exportu,
  // júl by zo vstupu zmizol a setter by ho vynuloval — Jarkov dlh by SPÄTNE
  // narástol o 7 790 Kč (revízia 19. 8. 2026). Splátka dlhu sa ale nedá
  // „odstať": čo sa raz započítalo, je história. Preto sa videné mesiace
  // ukladajú do vzas_settings a vstup pre setter je zjednotenie — snímka má
  // prednosť (kým balíček v exporte JE, oprava ceny sa prenesie), uložené
  // mesiace prežijú jej koniec. Oprava starého záznamu = ručne v nastaveniach.
  useEffect(() => {
    void (async () => {
      const podlaMesiaca: Record<string, number> = {};
      for (const p of data.packages) {
        if (!BARTER_KLIENTI.includes(p.client) || !p.payment || !p.validFrom) continue;
        const mk = p.validFrom.slice(0, 7);
        podlaMesiaca[mk] = (podlaMesiaca[mk] || 0) + p.payment;
      }
      const nastavenia = await fetchVzasSettings().catch(() => ({} as Record<string, unknown>));
      const ulozene = (nastavenia["barter_jarek"] || {}) as Record<string, number>;
      const spolu: Record<string, number> = { ...ulozene, ...podlaMesiaca };
      const pribudlo = Object.keys(spolu).some((mk) => spolu[mk] !== ulozene[mk]);
      if (pribudlo) void saveVzasSetting("barter_jarek", spolu);
      if (nastavJarekZTrackera(spolu)) setFioTik((x) => x + 1);
    })();
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
  /** Rozdelenie/priradenie pohybov — split telefónov, ručný príjem, vrátenia.
   *  Kľúč = dedup_key pohybu (viď pohybSplit.pohybKluc). */
  const [pohybSplits, setPohybSplits] = useState<PohybSplits>({});
  /** Posledný zapísaný stav hotovosti — jeden z krokov uzávierky. */
  const [stavHotovosti, setStavHotovosti] = useState<{ hotovost: number; datum: string } | null>(null);
  /** Faktúry, ktoré zatiaľ nemajú platbu — ponuka pri ručnom párovaní. */
  const [volneFaktury, setVolneFaktury] = useState<{ cislo: string; datum: string; celkom: number; dodavatel: string }[]>([]);
  useEffect(() => {
    void fetchVzasSettings().then((st) => {
      const p = st["btc_parovanie"];
      if (p && typeof p === "object") setBtcParovanie(p as Record<string, string[]>);
      const sp = st["pohyb_splits"];
      if (sp && typeof sp === "object") setPohybSplits(sp as PohybSplits);
      const h = st["stav_penazi"] as { hotovost: number; fio?: number; datum: string } | undefined;
      if (h && typeof h.hotovost === "number") {
        setStavHotovosti(h);
        setHotovostStav({ suma: h.hotovost, datum: h.datum });
      }
      // Účet: automatický zostatok z výpisu má prednosť; ručný `stav_penazi.fio`
      // zostáva len ako náhrada pre stav spred prvého importu s hlavičkou.
      const fz = st["fio_zostatok"] as { suma: number; datum: string } | undefined;
      if (fz && typeof fz.suma === "number") setUcetStav({ suma: fz.suma, datum: fz.datum });
      else if (h && typeof h.fio === "number") setUcetStav({ suma: h.fio, datum: h.datum });
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
  /** Uloží rozdelenie/priradenie jedného pohybu a prepočíta P&L. Prázdny
   *  zoznam = priradenie zrušené (pohyb sa vráti k svojmu bežnému správaniu). */
  const nastavPohybSplit = useCallback((kluc: string, casti: SplitCiast[]) => {
    setPohybSplits((prev) => {
      const next = { ...prev };
      if (casti.length) next[kluc] = casti;
      else delete next[kluc];
      void saveVzasSetting("pohyb_splits", next);
      return next;
    });
    setFioTik((x) => x + 1);
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
  // Zmeny v kalendári si App drží kvôli Jarvisovi. Test 11. 8.: na „kde vidím
  // zrušené tréningy" odpovedal, že ich appka nesleduje — pritom ich sleduje
  // od 31. 7. a v tej chvíli ich mala v databáze 18. Nevidel ich, lebo
  // kalendár si sťahovala len obrazovka Kalendár, do kontextu nešiel.
  const [kalZmeny, setKalZmeny] = useState<KalZmena[]>([]);
  /** Zmeny, ktoré ešte nikto nevysvetlil — `vysvetlene = 0`. */
  const [kalNevysvetlene, setKalNevysvetlene] = useState<KalZmena[]>([]);
  // Ktoré mesiace sú uzavreté. Jarvis to potrebuje vedieť, aby nenavrhoval
  // opravy v zamknutom mesiaci a vedel povedať „júl sa už dá zamknúť".
  /** Hlavné dáta sú načítané — až potom sa smú spustiť ďalšie ťažké dopyty. */
  const [dataHotove, setDataHotove] = useState(false);
  const [zamknuteMesiace, setZamknuteMesiace] = useState<string[]>([]);
  useEffect(() => {
    void fetchPeriods().then(({ periods }) => setZamknuteMesiace(periods.filter((p) => p.locked).map((p) => p.month)));
  }, []);
  /**
   * Kalendár čaká na /api/data. NIE je to kozmetika, je to oprava výpadku.
   *
   * 1. 9. 2026 appka ukazovala nulu klientov a „dáta len k — —". Nebola to
   * chyba v dátach ani v prihlásení: `/api/data` (928 kB) a `/api/kalendar`
   * vyštartovali NARAZ a worker na oboch vrátil 500. Zmerané v prehliadači —
   * samostatne `/api/data` vráti 200, spolu s kalendárom padnú obe.
   *
   * A padne to ticho: `fetchData()` pri neúspechu vráti EMPTY_DATA, takže
   * appka nevyzerá rozbito, len prázdno — a to sa nedá odlíšiť od „ešte nič
   * nemáš nahraté".
   *
   * Je to tá istá lekcia ako pri sťahovaní dvoch kalendárov 29. 8.: ťažká
   * práca patrí do jednej požiadavky na jeden zdroj, nie do dvoch naraz.
   */
  useEffect(() => {
    if (!dataHotove) return;
    void fetch("/api/kalendar", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; udalosti?: KalUdalost[]; zmenyHistoria?: KalZmena[]; zmeny?: KalZmena[] }) => {
        if (!j.ok || !Array.isArray(j.udalosti)) return;
        setKalUdalosti(j.udalosti);
        if (Array.isArray(j.zmenyHistoria)) setKalZmeny(j.zmenyHistoria);
        // Nevysvetlené zmeny idú do registra — dovtedy o nich vedel len ten,
        // kto sám zašiel do Kalendára.
        if (Array.isArray(j.zmeny)) setKalNevysvetlene(j.zmeny);
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
  }, [dataHotove]);

  /**
   * Vysvetlenie z registra sa doručí Kalendáru.
   *
   * Jerry odpovie „dnes zrušil, štípla ho včela" na upozornenie o dnešnom
   * tréningu — a Kalendár sa o dva dni pýta, prečo tá hodina zmizla. Sú to
   * dve tabuľky a nič ich nespájalo, takže tú istú vetu musel napísať dvakrát.
   *
   * Veta počká pod kľúčom `kalvysv|meno|dátum`, lebo v okamihu odpovede
   * zrušenie ešte v dátach nie je — kalendár sa sťahuje ráno a večer. Tento
   * efekt beží po každom načítaní zmien a priradí ju, keď sa objaví.
   *
   * Podmienky sú v `parujVysvetlenia` a sú zámerne prísne: jediná nevysvetlená
   * zmena pre toho človeka, do týždňa od odpovede. Priradiť vetu k nesprávnemu
   * zrušeniu je horšie než sa spýtať dvakrát — Kalendár by prestal pýtať a
   * hodina by zostala bez dôvodu navždy.
   */
  useEffect(() => {
    const { hotove, expirovane } = parujVysvetlenia(data.anomalyAck || {}, kalNevysvetlene);
    if (!hotove.length && !expirovane.length) return;
    // Vypršané vety sa mažú — inak by sa v tabuľke hromadili navždy.
    for (const key of expirovane) actions.ackAnomaly(key, "", false);
    if (!hotove.length) return;
    void (async () => {
      for (const h of hotove) {
        // Veta sa z fronty maže AŽ PO potvrdenom zápise. Predtým ju zmazal aj
        // neúspešný POST — vysvetlenie bolo preč nadobro a Kalendár sa pýtal
        // na zmenu, ktorú Jerry už raz vysvetlil.
        const r = await fetch("/api/kalendar", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ akcia: "vysvetli", id: h.id, poznamka: h.poznamka }),
        }).then((x) => x.json()).catch(() => null);
        if (r?.ok) actions.ackAnomaly(h.key, "", false);
      }
      const j = await fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
      if (j?.ok && Array.isArray(j.zmeny)) setKalNevysvetlene(j.zmeny);
      if (j?.ok && Array.isArray(j.zmenyHistoria)) setKalZmeny(j.zmenyHistoria);
    })();
  }, [kalNevysvetlene, data.anomalyAck]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kalendár ide do registra spolu s dátami: bez neho appka verí len exportu
  // z PTmindera a hlási „14 dní bez tréningu" na klienta, ktorý bol včera.
  const register = useMemo(
    () => deriveRegister(data, clients, sixM, capacity, { udalosti: kalUdalosti, zmeny: kalZmeny }),
    [data, clients, sixM, capacity, kalUdalosti, kalZmeny],
  );
  /**
   * Ľudia po úvodnom, ktorých export ešte nepotvrdil.
   *
   * Držia sa MIMO `clients` zámerne: ten zoznam živí kapacitu, 6M, lievik aj
   * predikciu tržieb a nepotvrdený človek by ticho posunul všetky tie čísla.
   * Obrazovka Klienti ich ukáže nad tabuľkou ako „nepotvrdená".
   */
  const cakajuci = useMemo(
    () => cakajuciKlienti(clients, kalUdalosti, kalZmeny),
    [clients, kalUdalosti, kalZmeny],
  );

  const [bankaPrijmy, setBankaPrijmy] = useState<Record<string, number>>({});
  const [btcPrijmy, setBtcPrijmy] = useState<Record<string, number>>({});
  // Surový zoznam BTC platieb, nielen mesačné súčty. Kontrola proti PTminderu
  // potrebuje jednotlivé platby — a odkedy z nej chodia notifikácie, potrebuje
  // ich aj register, nielen karta vo Financiách.
  const [btcPlatby, setBtcPlatby] = useState<BtcKnihaPlatba[]>([]);
  /** Dnešný kurz z BTC appky — bez neho sa dnešná hodnota netvrdí. */
  const [btcKurz, setBtcKurz] = useState<{ kurz: number | null; kedy: string | null }>({ kurz: null, kedy: null });
  /**
   * Výplaty, nákupy a cieľ z BTC appky — surové, pre Jarvisov kontext.
   *
   * Kokpit ich sťahoval už predtým, ale rozpúšťal si ich do mesačných súčtov
   * pre P&L a jednotlivé riadky zahodil. Jarvis tak o rezerve vedel len
   * celkovú sumu. Jerry, 3. 9. 2026: „je možné, aby Jarvis videl aj do BTC
   * appky?" Vidí — celá kniha má 99 riadkov a zmestí sa do kontextu celá,
   * takže netreba ani nový nástroj, ani dopyt navyše.
   */
  const [btcKniha, setBtcKniha] = useState<{
    vyplaty: { datum: string; sats: number; czk: number | null; poznamka?: string; kto?: string }[];
    nakupy: { datum: string; sats: number; czk: number | null; poznamka?: string }[];
    cielSats: number | null;
  }>({ vyplaty: [], nakupy: [], cielSats: null });
  const [btcSatsKlienti, setBtcSatsKlienti] = useState<Record<string, number>>({});
  const [hotovostMesiace, setHotovostMesiace] = useState<Set<string>>(new Set());
  // Kedy sa naposledy čítal text webu. Sťahovanie musí spustiť človek (nočná
  // úloha už raz workera zhodila, je to napísané vo wrangler.jsonc), ale
  // PAMÄTAŤ si to nemusí — po mesiaci sa pripomenie samo.
  const [webNaposledy, setWebNaposledy] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/web-obsah", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { naposledy?: string | null }) => setWebNaposledy(j?.naposledy ?? null))
      .catch(() => {});
  }, []);
  // Príspevky z Instagramu — ŽIVÝ zdroj pre Jarvisov kontext. Dovtedy sa
  // kategórie brali zo statického súboru, ktorý sa so živou tabuľkou zhodol
  // na 62 % a končil júnom.
  // `igVerzia` je v závislostiach kontextu nižšie zámerne: príspevky prídu
  // až po prvom vykreslení a bez nej by Jarvis dostal kontext spočítaný
  // z prázdneho zoznamu — teda zo statického súboru, ktorý má nahradiť.
  const [igVerzia, setIgVerzia] = useState(0);
  const [mktVerzia, setMktVerzia] = useState(0);
  useEffect(() => {
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prispevky?: { mesiac: string; typ: string; kategoria: string; hook: string; ulozenia: number; videnia: number; zdielania: number; viewRate: number; permalink: string }[] }) => {
        if (nastavIgPrispevky(j.prispevky || [])) setIgVerzia((x) => x + 1);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: Record<string, never[]> & { gadsValuta?: string }) => {
        setWebMetriky({ gsc: (j.gscMesacne as never[]) || [], ga4: (j.ga4 as never[]) || [] });
        setKanalyMesiace([...new Set(((j.kanaly as { mesiac: string }[]) || []).map((k) => String(k.mesiac)))]);
        // Marketingové moduly napĺňala DOTERAZ len obrazovka Marketing.
        //
        // Dôsledok: kto otvoril Kokpit rovno na Jarvisovi, dostal kontext bez
        // stránok webu — 17. 8. 2026 tvrdil, že „text webu je natiahnutý na 0
        // stránkach", hoci ich bolo 77. Neplatilo to teda podľa dát, ale podľa
        // toho, na ktorú záložku človek predtým klikol. Appka to teraz načíta
        // sama pri štarte a `mktVerzia` prepočíta Jarvisov kontext.
        nastavMarketingZImportu((j.mesacne as never[]) || [], (j.top as never[]) || []);
        nastavWebZImportu((j.ga4 as never[]) || [], (j.gscMesacne as never[]) || [], (j.gscDopyty as never[]) || [], (j.gscStrany as never[]) || [], (j.ga4Strany as never[]) || [], (j.gscZariadenia as never[]) || []);
        nastavAdsZImportu((j.gadsKampane as never[]) || [], (j.gadsDopyty as never[]) || [], j.gadsValuta || "");
        nastavWebStranky((j.webStranky as never[]) || []);
        nastavWebRychlost((j.webRychlost as never[]) || []);
        nastavKanaly((j.kanaly as never[]) || []);
        setMktVerzia((x) => x + 1);
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
      .then(async (j: { pohyby?: { datum: string; suma: number; kategoria: string; protistrana?: string; poznamka?: string; typ?: string; kluc?: string }[] }) => {
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
        // Ručný príjem (úvodný v hotovosti) — plní ho split s cieľom `prijem`.
        const rucnePrijmy: Record<string, number> = {};
        // Zaradí JEDNU časť pohybu (rozdeleného alebo priradeného) na jej cieľ.
        // `ciastka` je so znamienkom: záporná = výdavok, kladná = príjem/vrátenie.
        // Vďaka tomu vrátenie (kladná časť na nákladový cieľ) ten náklad odčíta.
        const zaradCiast = (mk: string, ciel: string, ciastka: number, meta: { datum: string; popis: string }) => {
          if (!ciel || ciel === "mimo") return;                 // osobné mimo P&L
          if (ciel.startsWith(PRIJEM)) { rucnePrijmy[mk] = (rucnePrijmy[mk] || 0) + ciastka; return; }
          if (ciel.startsWith("vyplaty")) {
            const v = (vyplaty[mk] ||= { jerry: 0, terezka: 0 });
            const suma = -ciastka;                              // výdavok → +, vrátenie → −
            if (ciel === "vyplaty.jerry") v.jerry += suma;
            else if (ciel === "vyplaty.terezka") v.terezka += suma;
            else { v.jerry += suma / 2; v.terezka += suma / 2; }
            return;
          }
          (sumy[mk] ||= {});
          sumy[mk][ciel] = (sumy[mk][ciel] || 0) + -ciastka;    // výdavok → +náklad, vrátenie → −náklad
          pridajDoRozpisu(rozpis, mk, ciel, { datum: meta.datum, popis: meta.popis, suma: -ciastka, zdroj: "banka" });
        };
        for (const p of j.pohyby || []) {
          // Rozdelený/priradený pohyb má prednosť pred bežným zaradením:
          // split telefónu (50/50), ručný príjem, vrátenie od Alzy. Je to
          // VÝSLOVNÝ opt-in podľa dedup_key, takže sa netýka pohybov, ktorých
          // sa Jerry nedotkol — automatická kategória na kladnom riadku P&L
          // ticho nemení.
          const split = p.kluc ? pohybSplits[p.kluc] : undefined;
          if (platnySplit(split)) {
            const mk = String(p.datum).slice(0, 7);
            // Príchodzí pohyb (vrátenie) aj tak patrí do kontrolného súčtu.
            if (p.suma > 0) prijmyBanka[mk] = (prijmyBanka[mk] || 0) + p.suma;
            const popis = [p.protistrana, p.poznamka].filter(Boolean).join(" · ") || (p.suma > 0 ? "vrátenie / príjem" : "bankový pohyb");
            for (const c of rozdelPohyb(p.suma, split)) zaradCiast(mk, c.ciel, c.ciastka, { datum: String(p.datum).slice(0, 10), popis });
            continue;
          }
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
            // Tolerancia 5 % (Jerry, 5. 9. 2026): pri BTC sa suma prepočítava
            // kurzom v čase nákupu a spread býva 3–4 %, takže 2 % tesné trafenia
            // (napr. platba 2 284 Kč proti faktúre 2 202) prepadávali do „bez
            // dokladu" a museli sa párovať ručne. ±7 dní okno drží falošné páry
            // na uzde aj pri širšej tolerancii.
            const skupina = skupinaFaktur(kandidati, czk, Math.max(50, czk * 0.05));
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

        if (nastavRozpis(rozpis)) setFioTik((x) => x + 1);
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
        // Rozpis má odteraz vlastnú verziu (nastavRozpis vyššie), takže sa
        // netreba spoliehať na tik „pre istotu".
        if (nastavNakladyZFio(sumy, vyplaty)) setFioTik((x) => x + 1);
        // Ručný príjem berie CELÝ obraz z tohto prechodu — mesiac bez neho sa
        // vynuluje, takže zrušené priradenie nenechá po sebe starú sumu.
        if (nastavRucnePrijmy(rucnePrijmy)) setFioTik((x) => x + 1);
      })
      .catch(() => {});
  }, [btcNakupy, btcParovanie, pohybSplits]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Výpočet je v lib/psb/compute.ts, lebo ho potrebuje aj register sám a obe
  // pripomienky. Kým žil len tu, „Odložiť" fungovalo na menšine položiek a na
  // zvyšku znamenalo navždy — hoci tlačidlo svietilo na každom riadku.
  const stavPolozky = useCallback(
    (key: string, rodinaVstup?: string) => stavPolozkyRegistra(key, data.anomalyAck || {}, rodinaVstup),
    [data.anomalyAck],
  );

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
    // (0) Nedorazil samotný VÝPIS. Musí to stáť pred kontrolou uzavretých
    // mesiacov, a to nie je detail: keď výpis nedorazí, chýbajúci mesiac nie
    // je uzavretý, takže by ho `chybajuceNaklady` preskočili a appka by o tom
    // mlčala tým hlasnejšie, čím väčšia je diera. Pri prázdnej banke sa navyše
    // o riadok nižšie vyskakuje z celej kontroly.
    //
    // Hotovosť sa nepočíta — tá sa zapisuje ručne v zošite a o tom, či prišiel
    // výpis z Fio, nehovorí nič.
    const poslednyPohybBanky = Object.values(bankaPohyby)
      .flatMap((mes) => Object.values(mes).flat())
      .filter((x) => !x.hotovost)
      .reduce((m, x) => (x.datum > m ? x.datum : m), "");
    // Text aj kľúč sú v lib/psb/penazneNotifikacie.ts — tú istú funkciu
    // volá ranná dávka notifikácií na telefón.
    const polozkaBanka = polozkaZastaranaBanka(poslednyPohybBanky, data.anomalyAck || {});
    if (polozkaBanka) out.push(polozkaBanka);

    // (0b) Bitcoinové platby, ktoré nesedia s PTminderom.
    //
    // Dovtedy o nich vedela len karta „Kontrola bitcoinových platieb" vo
    // Financiách — a nikto sa to nedozvedel, kým na ňu nešiel. Jerry, 31. 8.
    // 2026: „to by mala byť notifikácia pre Jerryho, peniaze má na starosti
    // on." Preto sem, a preto s `trener: "Jerry"`.
    //
    // Hlási sa LEN `nesedi`, nie `ciastocne`: čiastočná platba v bitcoine je
    // bežná vec (zvyšok prišiel inou cestou) a upozornenie by z nej urobilo
    // problém, ktorý neexistuje.
    // Bitcoinové platby, ktoré nesedia s PTminderom. Text aj kľúč sú
    // v lib/psb/penazneNotifikacie.ts — tú istú funkciu volá ranná dávka
    // notifikácií na telefón, takže sa obrazovka a telefón nemôžu rozísť.
    out.push(...polozkyBtcNesedi(data.payments, btcPlatby, data.anomalyAck || {}));

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
        // Peniaze má na starosti Jerry (31. 8. 2026).
        trener: "Jerry",
        ...stavPolozky(key, `naklad|${n.kategoria}`),
        // Cieľ nesie mesiac aj kategóriu: P&L sa otvorí, riadok rozbalí,
        // zvýrazní a odroluje sa k nemu. Predtým to bola správna obrazovka
        // so štyridsiatimi riadkami a hľadaním od začiatku.
        priority: n.druh === "chyba" ? 3 : 7, client: `vzas|pnl|${n.mesiac}|${n.kategoria}`,
      });
    }

    // (1a2) Bitcoinové výbery bez faktúry sa v registri NEHLÁSIA (Jerry,
    // 21. 8. 2026: „tento druh notifikácií ma nezaujíma"). Párovanie dokladov
    // k platbám zostáva v Upload → Bitcoin, kde si ho pozrie, keď chce.

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
        // Cieľ nesie mesiac aj kategóriu: v P&L sa zvýrazní riadok a Zapísané
        // pohyby pod ním sa nafiltrujú presne na tie dva pohyby, o ktorých
        // upozornenie hovorí. Predtým to viedlo na Údaje a hľadalo sa
        // v sedemsto riadkoch (revízia 18. 8. 2026).
        // Peniaze má na starosti Jerry (31. 8. 2026).
        trener: "Jerry",
        ...stavPolozky(key, `dvojity|${d.kategoria}`), priority: 2, client: `vzas|pnl|${d.mesiac}|${d.kategoria}`,
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
        // Peniaze má na starosti Jerry (31. 8. 2026).
        trener: "Jerry",
        title: `${monthLabel(n.mesiac)}: banka a PTminder sa v príjmoch líšia o ${n.rozdiel.toLocaleString("cs-CZ")} Kč`,
        detail: n.bankaViac
          ? `Za ${monthLabel(n.mesiac)} prišlo tromi cestami (účet + zošit + BTC) ${n.banka.toLocaleString("cs-CZ")} Kč, ale PTminder hlási tržby ${n.ptminder.toLocaleString("cs-CZ")} Kč — o ${n.rozdiel.toLocaleString("cs-CZ")} Kč MENEJ. Buď chýba platba v PTminderi, alebo časť príjmu nie je tržba (vklad, vratka, preplatok) a patrí do koša „mimo".`
          : `Za ${monthLabel(n.mesiac)} hlási PTminder tržby ${n.ptminder.toLocaleString("cs-CZ")} Kč, ale tromi cestami (účet + zošit + BTC) prišlo len ${n.banka.toLocaleString("cs-CZ")} Kč — o ${n.rozdiel.toLocaleString("cs-CZ")} Kč menej. Buď časť platieb ešte nedorazila, alebo prišla ďalšou cestou, o ktorej appka nevie, alebo je to barter.`,
        // Mesiac stačí — príjmy nemajú kategóriu; Zapísané pohyby sa naň
        // nafiltrujú a je vidieť, čo v ten mesiac naozaj prišlo.
        ...stavPolozky(key), priority: 6, client: `vzas|pnl|${n.mesiac}`,
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
        // Peniaze má na starosti Jerry (31. 8. 2026).
        trener: "Jerry",
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
        // Jedna položka na TRÉNERA, nie na mesiac.
        //
        // Predtým to bol jeden riadok so všetkými menami — a Jerry v ňom
        // čítal mená klientok, ktoré trénuje Terezka. Meno v texte sa filtrom
        // orezať nedá; orezať sa dá len položka, takže musí byť rozdelená už
        // pri vzniku. Kto nemá určeného trénera, ostáva v spoločnej skupine.
        const podlaTrenera = new Map<string, string[]>();
        for (const meno of bezDovodu) {
          const t = clients[meno]?.primaryTrainer;
          const k = t === "Jerry" || t === "Terezka" ? t : "";
          podlaTrenera.set(k, [...(podlaTrenera.get(k) || []), meno]);
        }
        for (const [trener, mena] of podlaTrenera) {
          const key = `odchody|${mk}${trener ? `|${trener}` : ""}`;
          out.push({
            key, category: "Rozhodnutie", tone: "orange",
            title: `${monthLabel(mk)}: ${mena.length === 1 ? "odišiel klient" : `odišli ${mena.length} klienti`} a nevieme prečo${trener ? ` (${trener})` : ""}`,
            detail: `${mena.join(", ")} — ${mena.length === 1 ? "prestal" : "prestali"} chodiť v ${monthLabel(mk)} a dôvod nikde nie je. Dôvod je jediná vec, ktorú appka o odchode nezistí, a o rok sa naň už nikto nespýta. Doplň ho v Klienti → Fluktuácia, po rozkliknutí mesiaca.`,
            ...stavPolozky(key, "odchody"), priority: 5, client: "klienti|rast",
            // Filter podľa trénera potrebuje meno, nie cieľ prekliku. Stačí
            // jedno — všetci v skupine majú toho istého trénera.
            oKom: mena[0],
          });
        }
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
    // Dnešné tréningy — výpočet je v lib/psb/compute.ts, aby ho okrem
    // obrazovky videla aj ranná dávka notifikácií na telefón.
    out.push(...dnesneTreningy(clients, sixM, { udalosti: kalUdalosti, zmeny: kalZmeny }, data.anomalyAck || {}));

    return out;
  }, [bankaSumy, bankaPohyby, bankaPrijmy, btcPrijmy, btcPlatby, btcBezDokladu, data.payments, data.anomalyAck, kalUdalosti, clients, sixM, zapisy]); // eslint-disable-line react-hooks/exhaustive-deps

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
    () => spocitajRitualy(new Date(), zapisy.weeks, zapisy.mesiace, chybajuceDoklady, { nacitane: zapisy.nacitane }),
    [zapisy, chybajuceDoklady],
  );
  // Veci, ktoré čakajú na vetu od človeka — dopyty bez dôvodu a nevysvetlené
  // zmeny v kalendári. Sú v jednom rade s ostatnými, aby sa na dashboarde
  // nemuselo hľadať na troch obrazovkách.
  const nezapisane = useMemo(
    () => nezapisaneDoRegistra({
      leads: data.leads || [],
      menaKlientov: Object.keys(clients),
      dnes: new Date().toISOString().slice(0, 10),
      zmeny: kalNevysvetlene.map((z) => ({ druh: z.druh, trener: z.trener })),
      // Lievik za posledných 12 mesiacov — tie isté čísla, aké vidno
      // v Marketingu. Keby sa počítali zvlášť, appka by spochybňovala niečo
      // iné, než ukazuje.
      podiely: (() => {
        const kotva = kotvaDat(data);
        const mesiace = oknoMesiacov(data, "12m").filter((m) => !kotva.plny || m <= kotva.plny);
        const k = krokyZa(data, clients, mesiace);
        return [
          {
            nazov: "Po úvodnom klient", zo: k.uvodne, preslo: k.klienti,
            coOverit: "Over, čo appka počíta za klienta: úvodný tréning je platený, takže „má platbu“ splní každý, kto naň prišiel. Klient je ten, kto prišiel ZNOVA.",
          },
          {
            nazov: "Z dopytu klient", zo: k.dopyty, preslo: k.zDopytu,
            coOverit: "Over, či sa konvertujú DOPYTY, nie klienti — klienti z odporúčaní nemajú zapísaný dopyt a podiel potom presiahne sto percent.",
          },
        ];
      })(),
    }).map((r: ReturnType<typeof nezapisaneDoRegistra>[number]) => ({ ...r, ...stavPolozky(r.key) })),
    [data.leads, clients, kalNevysvetlene, stavPolozky],
  );

  /**
   * Text webu je starší než mesiac.
   *
   * Jerry, 16. 8.: „súhlasím s tichou pripomienkou, ale daj to na 30 dní."
   * Bez nej Jarvis odpovedá na otázky o webe zo starej kópie — a to je horšie
   * než nevedieť, lebo to vyzerá ako odpoveď.
   */
  const kontrolaWebu = useMemo(() => {
    if (!webNaposledy) return [] as RegisterItem[];
    const dni = Math.floor((Date.now() - new Date(webNaposledy).getTime()) / 86400_000);
    if (!Number.isFinite(dni) || dni < 30) return [] as RegisterItem[];
    // Kľúč nesie MESIAC, nie deň: inak by sa položka po skrytí vrátila zajtra
    // s novým kľúčom a „Skryť" by vyzeralo ako pokazené.
    const key = `web|text|${new Date().toISOString().slice(0, 7)}`;
    return [{
      key, category: "Anomália" as const, tone: "blue" as const,
      title: `Text webu sa nečítal ${dni} dní`,
      detail: `Kópia webu v appke je z ${fmtDMY(webNaposledy.slice(0, 10))}. Nové články a prepísané titulky v nej nie sú, takže Jarvis o nich nevie a odpovedá zo starého. Údaje → Napojenia → „Prečítať web“ — nové adresy zo sitemapy pribudnú samé a text sa stiahne len tam, kde sa naozaj zmenil.`,
      ...stavPolozky(key),
      client: "udaje|",
      priority: 60,
    }];
  }, [webNaposledy, stavPolozky]);

  /**
   * Sľuby dané človeku: SMS po úvodnom a 10 % za odporúčanie.
   *
   * Jerry si ich vypýtal 17. 8. 2026. Obe majú spoločné to, že sa nedajú
   * odvodiť zo žiadneho čísla — buď sa to spraví, alebo nie, a nikto sa
   * nedozvie. Kalendár vie o úvodnom v ten istý deň, PTminder až o pár dní
   * neskôr; SMS sa posiela hneď, tak sa berie kalendár.
   */
  /**
   * Otázka „prečo sa nevrátil" tam, kde sa Jerry aj tak pozerá.
   *
   * Pole na dôvod existovalo v Marketingu a bolo prázdne pri šiestich z trinástich
   * ľudí. Register je jediné miesto, ktoré otvára denne.
   */
  const dovody = useMemo(
    () => pripomienkaDovodu(
      clients,
      data.packages || [],
      kalUdalosti.map((u) => ({ klient: u.klient, zaciatok: u.zaciatok, typ: u.typ, zmizlaAt: (u as { zmizlaAt?: string | null }).zmizlaAt ?? null })),
      data.anomalyAck || {},
    ),
    [clients, data.packages, kalUdalosti, data.anomalyAck],
  );

  const pripomienky = useMemo(
    () => pripomienkySlubov(
      kalUdalosti.map((u) => ({ zaciatok: u.zaciatok, klient: u.klient, typ: u.typ, nazov: u.nazov, trener: u.trener, zmizlaAt: (u as { zmizlaAt?: string | null }).zmizlaAt ?? null })),
      (data.leads || []).map((l) => ({ date: l.date, name: l.name, source: l.source, referrer: l.referrer })),
      data.anomalyAck || {},
      new Date(),
      kalZmeny,
    ),
    [kalUdalosti, kalZmeny, data.leads, data.anomalyAck],
  );

  const registerAll = useMemo(() => {
    const ack = data.anomalyAck || {};
    const extra = rituals
      .filter((r) => r.splatne)
      .map((r) => ({
        key: `zapis|${r.id}`,
        category: "Zápis" as const,
        tone: (r.druh === "kvartal" || r.druh === "kontrola" ? "blue" : "orange") as "blue" | "orange",
        // Meno v titulku len pri TÝŽDENNOM zápise. Tam ho oba tréneri majú
        // každý svoje a bez mena by sa dva riadky nedali rozoznať. Mesačná
        // kontrola je Jerryho a nikto iný ju nevidí — „(Jerry)" by tam bolo
        // len šumom, ktorý nič nehovorí.
        title: r.trener && r.druh === "tyzden" ? `${r.nadpis} (${r.trener})` : r.nadpis,
        // Meno patrí aj do detailu — riadok registra kreslí DETAIL, nie titulok,
        // takže bez toho by Terezka nevidela, že tá pripomienka je jej.
        detail: `${r.trener && r.druh === "tyzden" ? `${r.nadpis} — ${r.trener}` : r.nadpis} — ${r.detail}`,
        // Bez trénera by týždenná únava svietila obom a filter by pri nej
        // neznamenal nič — Terezka by videla Jerryho zápis a naopak.
        trener: r.trener,
        ...stavPolozky(`zapis|${r.id}`),
        // Cieľ navigácie sa vezie v `client` — register nemá vlastné pole na
        // odkaz a zaviesť ho kvôli trom položkám by bolo viac kódu než úžitku.
        client: `${r.ciel.tab}|${r.ciel.sub || ""}${r.ciel.mesiac ? `|${r.ciel.mesiac}` : r.ciel.tyzden ? `|t:${r.ciel.tyzden}` : ""}`,
        priority: r.druh === "tyzden" ? 5 : r.druh === "mesiac" ? 6 : r.druh === "kontrola" ? 35 : 40,
      }));
    // Až tu, keď sú všetky zdroje pokope: „nový klient" je len konštatovanie
    // a ustúpi úlohám o tom istom človeku (SMS, chýbajúci dopyt). Kontext
    // o nepotvrdenom klientovi je v Klientoch, nie v treťom riadku notifikácií.
    // Téma dňa — Jerryho, úplne dole (priorita 90), modrá, informatívna.
    // Kľúč nesie DEŇ, takže „Skryť" ju umlčí len na dnes a zajtra príde nová.
    const temaPolozka = temaDna ? [{
      key: `tema|${new Date().toISOString().slice(0, 10)}`,
      category: "Zápis" as const,
      tone: "blue" as const,
      title: "🎥 Téma na hovorené video",
      // Samotná téma ide do DETAILU — riadok registra kreslí detail, nie
      // titulok, takže v titulku ju Jerry nevidel (4. 9. 2026).
      detail: `${temaDna.tema} · zdroj: ${temaDna.odkial}. Nemusíš to nakrútiť — je to inšpirácia na deň, keď máš čas a priestor.`,
      trener: "Jerry",
      priority: 90,
      ...stavPolozky(`tema|${new Date().toISOString().slice(0, 10)}`),
    }] : [];
    return odstranDuplicity(
      [...extra, ...nezapisane, ...kontrolaBanky, ...zmenyMetrik, ...kontrolaWebu, ...pripomienky, ...dovody, ...register, ...temaPolozka],
    ).sort((a, b) => a.priority - b.priority);
  }, [rituals, register, kontrolaBanky, zmenyMetrik, kontrolaWebu, pripomienky, dovody, nezapisane, temaDna, data.anomalyAck]);

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
    /**
     * Kto mal v tomto mesiaci úvodný tréning a nemá zapísaný zdroj.
     *
     * Zdroj sa plní SÁM z dopytov: zapíšeš dopyt so zdrojom, a keď z človeka
     * bude klient, appka mu ho doplní. Za apríl–júl 2026 to vyšlo na sto
     * percent, takže tento krok bude väčšinou hneď odškrtnutý.
     *
     * Zmysel má pre ten jeden prípad, ktorý prekĺzne: človek, čo prišiel bez
     * zapísaného dopytu (Zuzana Spoligova, úvodný v auguste). Bez tejto
     * kontroly sa o ňom nedozvieš nikdy — v marketingu proste ticho spadne
     * do „nevyplnené" a skreslí porovnanie zdrojov.
     *
     * Anamnéza tu ZÁMERNE nie je podmienkou. Bola jednorazovým dobehnutím
     * histórie (46 zo 47 v auguste 2026); ako mesačný rituál by pridala prácu
     * za informáciu, ktorú appka už má.
     */
    const bezZdroja = (() => {
      const uvodniVMesiaci = new Set(
        data.sessions
          .filter((s) => s.sessionType === "UVODNE" && s.date.slice(0, 7) === mk)
          .map((s) => s.client),
      );
      const mena = Object.values(clients).map((c) => c.name);
      const chyba: string[] = [];
      for (const meno of uvodniVMesiaci) {
        const kanonicke = najdiKlienta(mena, meno);
        const c = kanonicke ? clients[kanonicke] : undefined;
        // Kto v Klientoch vôbec nie je (jednorazový úvodný), zdroj mať nemôže —
        // hlásiť ho by bola otrava bez akcie.
        if (c && !c.zdroj) chyba.push(c.name);
      }
      return chyba.sort((a, b) => a.localeCompare(b, "sk"));
    })();
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
        id: "zdroje",
        label: "Odkiaľ prišli",
        hotovo: bezZdroja.length === 0,
        detail: bezZdroja.length === 0
          ? "všetci úvodní majú zdroj"
          : `${bezZdroja.length}× chýba zdroj: ${bezZdroja.slice(0, 4).join(", ")}${bezZdroja.length > 4 ? "…" : ""}`,
        tab: "tracker",
        sub: "klienti",
        focus: bezZdroja.length ? { skupina: { label: `Úvodný ${mk} bez zdroja`, mena: bezZdroja }, nonce: Date.now() } : undefined,
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
  }, [data, clients, bankaSumy, bankaPohyby, kanalyMesiace, hotovostMesiace, zapisy, registerAll, stavHotovosti]);

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

  // Uzávierka pre mesiac, ktorý sa práve zatvára — posledný PLNÝ podľa kotvy.
  // Bežiaci mesiac sa nezatvára, takže jeho kroky by boli len šum.
  const uzavierkaPreAi = useMemo(() => {
    const mk = kotvaDat(data).plny;
    if (!mk) return undefined;
    const kroky = krokyZamku(mk).map((k) => ({ id: k.id, label: k.label, hotovo: k.hotovo, detail: k.detail }));
    return { mesiac: mk, zamknuty: zamknuteMesiace.includes(mk), kroky, prekazky: prekazkyZamku(mk) };
  }, [data, krokyZamku, prekazkyZamku, zamknuteMesiace]);

  const aiContext = useMemo(
    () => buildAiContext(data, clients, sixM, capacity, registerAll, { udalosti: kalUdalosti, zmeny: kalZmeny }, uzavierkaPreAi,
      // Rezerva sa počíta v lib/psb/rezerva.ts — tým istým výpočtom ako
      // dlaždica na Kokpite. Dve odpovede na to isté číslo boli 16. 8. reálny
      // stav appky a tá horšia znela istejšie.
      spocitajRezervu({ btcCzk: btcCelkom, ucet: ucetStav, hotovost: hotovostStav, bePriem: breakEvenPriemer().bePriem }),
      // Bitcoin po klientoch — ten istý výpočet, aký kŕmi kartu klienta.
      {
        kurzCzkZaBtc: btcKurz.kurz, kurzKedy: btcKurz.kedy,
        klienti: btcPodlaKlientov(btcPlatby, btcKurz.kurz, Object.keys(clients)),
        platby: btcPlatbyJednotlivo(btcPlatby, btcKurz.kurz, Object.keys(clients)),
        vyplaty: btcKniha.vyplaty, nakupy: btcKniha.nakupy, cielSats: btcKniha.cielSats,
      }),
    [data, clients, sixM, capacity, registerAll, kalUdalosti, kalZmeny, uzavierkaPreAi, btcCelkom, btcKurz, btcKniha, btcPlatby, ucetStav, hotovostStav, igVerzia, mktVerzia, vzasVerzia()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const actions = useMemo<Actions>(
    () => ({
      setOverride: async (name, key, value) => {
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
        const predtym = dataRef.current.clientOverrides[canonical];
        setData((prev) => ({
          ...prev,
          clientOverrides: { ...prev.clientOverrides, [canonical]: { ...prev.clientOverrides[canonical], [key]: value } },
        }));
        const ok = await saveOverride(canonical, key, value);
        if (!ok) {
          // Karta klienta má štrnásť polí a každé volá tento setter. Obaliť
          // ich po jednom by znamenalo pätnáste miesto, na ktoré sa zabudne —
          // preto sa neúspech hlási TU, raz pre všetkých: pole sa vráti do
          // pôvodného stavu a appka to povie nahlas (revízia 18. 8. 2026).
          setData((prev) => ({
            ...prev,
            clientOverrides: { ...prev.clientOverrides, [canonical]: predtym ?? {} },
          }));
          setChybaZapisu(`Zmena pri klientovi ${canonical} sa NEZAPÍSALA — hodnota je späť. Skús znova.`);
        }
        return ok;
      },
      ackAnomaly: (key, note, ack = true) => {
        const predtym = dataRef.current.anomalyAck[key];
        setData((prev) => {
          const next = { ...prev, anomalyAck: { ...prev.anomalyAck } };
          if (ack) next.anomalyAck[key] = { note, ackedAt: new Date().toISOString() };
          else delete next.anomalyAck[key];
          return next;
        });
        // Optimizmus s návratkou: keď server zápis odmietne, položka sa vráti
        // do stavu pred klikom — inak by „vybavené" vydržalo len do reloadu
        // a napísaná odpoveď by sa stratila bez stopy.
        void saveAnomaly(key, note, ack).then((ok) => {
          if (ok) return;
          setData((prev) => {
            const next = { ...prev, anomalyAck: { ...prev.anomalyAck } };
            if (predtym) next.anomalyAck[key] = predtym;
            else delete next.anomalyAck[key];
            return next;
          });
        });
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
      zapisZrusenie: async (klient, datum, poznamka) => {
        const r = await fetch("/api/kalendar", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ akcia: "zmena-rucne", druh: "zrusene", klient, datum, poznamka }),
        }).then((x) => x.json()).catch(() => null);
        // Server vie vrátiť {ok:false} aj s HTTP 200 — hlásiť úspech smie až
        // potvrdený zápis; volajúci (tlačidlo Netrénoval) na tom stavia text.
        if (!r?.ok) throw new Error("zápis zrušenia neprešiel");
        const j = await fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
        if (j?.ok && Array.isArray(j.zmeny)) setKalNevysvetlene(j.zmeny);
        if (j?.ok && Array.isArray(j.zmenyHistoria)) setKalZmeny(j.zmenyHistoria);
      },
      mapujKalendar: async (nazov, trener, typ, klient) => {
        // Tá istá akcia ako karta Nové názvy v Kalendári — jeden zápis, jedno
        // miesto. Notifikácia „Priradiť X → Y?" ju volá po potvrdení.
        const r = await fetch("/api/kalendar", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ akcia: "mapuj", nazov, trener, typ, klient }),
        }).then((x) => x.json()).catch(() => null);
        if (!r?.ok) throw new Error("priradenie neprešlo");
        // Kalendár sa znovu načíta — udalosti dostanú typ/klienta a notifikácia
        // zmizne sama, lebo názov už appka pozná.
        const j = await fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
        if (j?.ok && Array.isArray(j.udalosti)) setKalUdalosti(j.udalosti);
      },
      obnovKalendar: async () => {
        // Sťahovanie je ZÁPIS (kal_udalosti/kal_zmeny). Prehltnutá chyba
        // znamenala, že spinner zhasol nad STAROU snímkou a vyzeralo to ako
        // „nič sa nezmenilo" (revízia 19. 8. 2026). Výnimka letí ďalej —
        // volajúci ju cez .finally zloží a používateľ vidí, že klik zlyhal.
        const odp = await fetch("/api/kalendar", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ akcia: "stiahni" }),
        }).then((r) => r.json() as Promise<{ ok?: boolean; error?: string }>);
        if (odp?.ok === false) throw new Error(odp.error || "Kalendár sa nestiahol.");
        const j = await fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
        if (j?.ok && Array.isArray(j.udalosti)) {
          setKalUdalosti(j.udalosti);
          if (Array.isArray(j.zmenyHistoria)) setKalZmeny(j.zmenyHistoria as KalZmena[]);
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
    // najdiKlienta: presná zhoda, potom fuzzy — ale fuzzy len pri JEDNOM
    // kandidátovi, lebo tu sa podľa výsledku ZAPISUJE zdroj do overrides
    // a falošná zhoda by označkovala cudzieho klienta.
    const menaVsetkych = Object.values(clients).map((c) => c.name);
    for (const l of data.leads) {
      if (!l.name) continue;
      const meno = najdiKlienta(menaVsetkych, l.name);
      const c = meno ? clients[meno] : undefined;
      if (!c || c.zdroj) continue;
      actions.setOverride(c.name, "zdroj", MAPA[l.source] || "ine");
      if (l.source === "referencia" && l.referrer && !c.zdrojKto) actions.setOverride(c.name, "zdrojKto", l.referrer);
    }
  }, [data.leads, clients, actions]);


  // One shared chat brain for both the floating panel and the inline dashboard widget.
  // Keď Jarvis založí príspevok, návrat sa spresní naň — inak by tlačidlo
  // otvorilo prázdny slot tej bunky a Jerry by si nový návrh hľadal sám.
  const chat = useAssistantChat(aiContext, actions, (mesiac, faza, napadId) =>
    setNavratDoMapy({ mesiac, faza, napadId }));
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
      {/* Nová verzia nasadená → ponuka reloadu navrchu. Rieši „musím appku
          vypnúť a zapnúť". */}
      <NovaVerziaPas />
      {/* Neúspešný zápis nesmie zapadnúť. Pás je nad všetkým, aby ho človek
          videl aj vtedy, keď je práve inde na obrazovke. */}
      {chybaZapisu && (
        <div
          onClick={() => setChybaZapisu("")}
          title="Kliknutím zavrieš"
          style={{ position: "sticky", top: 0, zIndex: 60, cursor: "pointer", padding: "8px 16px", background: mix(C.red, 22), borderBottom: `1px solid ${mix(C.red, 55)}`, color: C.text, fontSize: 12.5, textAlign: "center" }}
        >
          {chybaZapisu} <span style={{ color: C.textDim }}>· zavrieť</span>
        </div>
      )}
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 1200, margin: "0 auto", flexWrap: "wrap" }}>
        {/* Logo je zároveň cesta domov — najstarší weborý zvyk a jediné miesto,
            kde ho každý hľadá inštinktívne. */}
        <button onClick={() => navigate("dashboard")} style={{ lineHeight: 1.1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: -0.3 }}>Kokpit</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: 0.2 }}>ProSapiens Biomechanic</div>
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <HladanieKlienta clients={clients} leads={data.leads} onPick={(meno) => navigate("klienti", undefined, { client: meno, nonce: Date.now() })} onPickLead={() => navigate("klienti", "dopyty")} />
          <ZapisButton ritualy={rituals} onNavigate={(t, sub, tyzden) => {
            navigate(t, sub, tyzden ? { week: tyzden, nonce: Date.now() } : undefined);
            void nacitajZapisy();
          }} onRefresh={() => void actions.refresh()} klienti={zapisKlienti} dnesTrenoval={ktoDnesTrenoval(kalUdalosti, { zmeny: kalZmeny })} onDennikZapis={chat.spracujDennik} />
          {/* Jarvis stojí vedľa „+ Zápis", nie v rade záložiek (Jerry, 17. 8.).
              Sú to dve tlačidlá toho istého druhu: obe sa dajú stlačiť kdekoľvek
              v appke a obe nie sú miesto, kam sa ide — sú to veci, ktoré sa
              robia. Rad záložiek je mapa obrazoviek; toto tam robilo zmätok.
              Tvar aj rozmery kopírujú „+ Zápis", aby dvojica držala spolu. */}
          <button
            onClick={() => navigate("jarvis")}
            title="Otvoriť Jarvisa vo veľkom — s dokumentmi a staršími debatami"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${active === "jarvis" ? mix(C.accent, 55) : C.border}`,
              background: active === "jarvis" ? mix(C.accent, 12) : "transparent",
              color: active === "jarvis" ? C.accentLight : C.textMuted,
            }}
          >
            <Icon name="sparkles" /> Jarvis
          </button>
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
        {TABS.filter((t) => !MIMO_RAD.includes(t.id)).map((t) => (
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
          <Dashboard trainer={trainer} onTrainer={setTrainer} data={data} clients={clients} kalendar={kalUdalosti} kalZmeny={kalZmeny} kalNevysvetlene={kalNevysvetlene} register={registerAll} sixM={sixM} capacity={capacity} actions={actions} onNavigate={navigate} assistantChat={chat} onClientClick={onClientClick} />
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
            {trackerSection === "klienti" && <Klienti clients={clients} capacity={capacity} actions={actions} focus={klientiFocus} leads={data.leads} trainer={trainer} onTrainer={setTrainer} sixM={sixM} sub={klientiSub} onSub={setKlientiSub} data={data} btcSatsKlienti={btcSatsKlienti} onDennikZapis={chat.spracujDennik} cakajuci={cakajuci} />}
              </>
        )}

        {active === "marketing" && <Marketing data={data} clients={clients} leads={data.leads} chat={chat} sub={marketingSub} onSub={setMarketingSub} focus={marketingFocus} onOdchodKJarvisovi={(mesiac, faza, napadId) => setNavratDoMapy({ mesiac, faza, napadId })} onKlient={(m) => navigate("klienti", undefined, { client: m, nonce: Date.now() })} refresh={actions.refresh} onPoznamkaStrata={(m, t) => actions.setOverride(m, "precoNeprisiel", t)} onNavigate={navigate} onAck={(k, zapnut, poznamka) => actions.ackAnomaly(k, zapnut ? (poznamka || "skryté hlásenie") : "", zapnut)} />}
        {active === "vzas" && <Vzas sub={vzasSub} onSub={setVzasSub} data={data} clients={clients} focus={vzasFocus} onNavigate={navigate} pohybSplits={pohybSplits} nastavPohybSplit={nastavPohybSplit} />}
        {active === "kalendar" && <Kalendar clients={clients} data={data} focus={kalendarFocus} ktoSom={ktoSom} />}

        {active === "jarvis" && (
          <JarvisOkno
            chat={chat}
            onClientClick={onClientClick}
            onNavigate={(t, sub) => navigate(t, sub)}
            navrat={navratDoMapy ? {
              popis: `mapy — ${navratDoMapy.mesiac} · ${nazovFazy(navratDoMapy.faza)}`,
              spat: () => {
                navigate("marketing", "navrhy", { slot: navratDoMapy, nonce: Date.now() });
                setNavratDoMapy(null);
              },
            } : null}
          />
        )}

        {/* MESIAC — mesačné výsledky. Nahrávanie a uzávierka sú vo vlastnej
            záložke Upload; tu zostalo to, čo sa mesiac ČÍTA, nie zapisuje. */}
        {active === "mesiac" && (
          <Vysledky data={data} onNavigate={navigate} clients={clients} sixM={sixM} capacity={capacity} register={register} sub={vysledkySub} onSub={setVysledkySub} focus={vysledkyFocus} />
        )}

        {/* UPLOAD — nahrať exporty a zavrieť mesiac. Vlastná záložka od
            29. 8. 2026; `id` zostalo „udaje" kvôli adresám a odkazom. */}
        {active === "udaje" && (
          <Udaje data={data} actions={actions} chat={chat} prekazky={prekazkyZamku} kroky={krokyZamku} podklady={podkladyMesiaca} onNavigate={navigate} btc={{ platby: [...btcBezDokladu, ...btcSparovane], faktury: volneFaktury, parovanie: btcParovanie, onSparuj: sparujBtc }} pohybSplits={pohybSplits} nastavPohybSplit={nastavPohybSplit} />
        )}

      </div>
      <div style={{ ...S.h3, textAlign: "center", color: C.textDim, fontSize: 11, padding: "8px 0 24px", fontWeight: 400 }}>
        ProSapiens Biomechanic · interný nástroj · nezdieľať externe
      </div>
      {/*
        Plávajúci panel sa v záložke Jarvis skryje. Nie je to obmedzenie —
        obidve okná zdieľajú ten istý stav, takže dve naraz by ukazovali to
        isté dvakrát a rozišli by sa pri rolovaní a písaní.
      */}
      {active !== "jarvis" && (
        <Assistant chat={chat} onClientClick={onClientClick} onNavigate={(tab2, sub) => navigate(tab2, sub)} />
      )}
    </div>
    </ObdobieCtx.Provider>
  );
}
