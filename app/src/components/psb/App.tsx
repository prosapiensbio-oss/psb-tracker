import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { nastavHodinyZTrackera, nastavNakladyZFio } from "../../lib/psb/vzas";

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
} from "../../lib/psb/client";
import {
  capacityByTrainer,
  monthlyFinance,
  deriveClients,
  deriveRegister,
  deriveSixM,
} from "../../lib/psb/compute";
import { buildAiContext } from "../../lib/psb/aiContext";
import { Assistant, useAssistantChat } from "./Assistant";
import { normName } from "../../lib/psb/format";
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
import { Financie } from "./Financie";
import { Marketing } from "./Marketing";
import { Vysledky, Vzas } from "./Vzas";
import { Udaje } from "./Udaje";
import { HladanieKlienta } from "./Hladanie";
import { ZapisButton } from "./Zapis";
import { ritualy as spocitajRitualy } from "../../lib/psb/rituals";

export type Actions = {
  setOverride: (name: string, key: keyof ClientOverride, value: unknown) => void;
  ackAnomaly: (key: string, note: string, ack?: boolean) => void;
  ingest: (files: { filename: string; text: string }[]) => Promise<IngestResult[]>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
};

// Deep-link from Dashboard click-throughs: focus one week (Tréningy → Prehľad) or one month (Financie → Zárobky).
export type NavFocus = { week?: string; month?: string; client?: string; trainer?: string; nonce?: number };

// Five top-level areas, each answering a different question, left to right as a
// story: what is happening now → the work → where the next client comes from →
// the money → how it is going against the plan. Marketing and Výsledky used to
// live inside Tracker and VZAS; both answer questions their host did not.
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  // Appka sa volá Tracker a záložka tiež — na otázku „kde to je" sa nedalo
  // odpovedať bez vysvetľovania. Obsah je prevádzka: tréningy, klienti, peniaze
  // z PTmindera, 6M.
  { id: "tracker", label: "Prevádzka", icon: "activity" },
  { id: "marketing", label: "Marketing", icon: "activity" },
  { id: "vzas", label: "VZAS", icon: "wallet" },
  { id: "vysledky", label: "Výsledky", icon: "calendar" },
  // Údaje sú posledné a zámerne mimo príbehu: nie je to pohľad na štúdio, je to
  // obsluha appky — nahrávanie, uzávierky, audit, kontá, záloha, vzhľad, reset.
  // Predtým to viselo pod Dashboardom, kde to pod aktuálnou situáciou nemá čo
  // robiť; uzávierky prišli z VZAS, lebo nie sú o peniazoch, ale o dátach.
  { id: "udaje", label: "Údaje", icon: "upload" },
];

const TRACKER_SECTIONS = [
  { id: "treningy", label: "Tréningy", icon: "calendar" },
  { id: "klienti", label: "Klienti", icon: "userCheck" },
  { id: "financie", label: "Financie", icon: "wallet" },
];
const TRACKER_IDS = TRACKER_SECTIONS.map((s) => s.id);

export function PSBApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [ktoSom, setKtoSom] = useState<string | null>(null);
  const [data, setData] = useState<PSBData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [trackerSection, setTrackerSection] = useState("treningy");
  const [vzasSub, setVzasSub] = useState("pnl");
  const [vysledkySub, setVysledkySub] = useState("kvartalne");
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
  const [financieSub, setFinancieSub] = useState("trzby");
  const [klientiSub, setKlientiSub] = useState("klienti");
  const [treningyFocus, setTreningyFocus] = useState<NavFocus | null>(null);
  const [financieFocus, setFinancieFocus] = useState<NavFocus | null>(null);
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
      const pod = trackerSection === "treningy" ? treningySub : trackerSection === "financie" ? financieSub : trackerSection === "klienti" ? klientiSub : "";
      return `#tracker/${trackerSection}${pod ? `/${pod}` : ""}`;
    }
    if (active === "vzas") return `#vzas/${vzasSub}`;
    if (active === "vysledky") return `#vysledky/${vysledkySub}`;
    if (active === "marketing") return `#marketing/${marketingSub}`;
    return `#${active}`;
  };

  const nastavZCesty = useCallback((hash: string) => {
    const [zal, pod, pod2] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!zal) return;
    if (!TABS.some((t) => t.id === zal)) return;
    setActive(zal);
    if (zal === "tracker" && pod && TRACKER_IDS.includes(pod)) {
      setTrackerSection(pod);
      if (pod === "treningy" && pod2) setTreningySub(pod2);
      if (pod === "financie" && pod2) setFinancieSub(pod2);
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
      return;
    }
    if (TRACKER_IDS.includes(tab)) {
      setActive("tracker");
      setTrackerSection(tab);
    } else {
      setActive(tab);
    }
    if (tab === "treningy" && sub) setTreningySub(sub);
    if (tab === "financie" && sub) setFinancieSub(sub);
    if (tab === "klienti" && sub) setKlientiSub(sub);
    // Podzáložka Výsledkov sa nikdy nenastavovala — pripomienka „Mesačná
    // uzávierka" tak doviedla človeka na Kvartálne a vyzeralo to, že klik
    // nefunguje. Rovnaká mechanika ako pri ostatných, len chýbala.
    if (tab === "vysledky" && sub) setVysledkySub(sub);
    if (tab === "marketing" && sub) setMarketingSub(sub);
    // Fokus na klienta má zmysel len v zozname klientov. Keď bol človek práve
    // v Dopytoch alebo v Raste a strate a klikol na meno vo vyhľadávaní,
    // zameranie sa nastavilo do podzáložky, ktorú nevidno — a nič sa nestalo.
    if (tab === "klienti" && !sub && focus?.client) setKlientiSub("klienti");
    if (tab === "treningy" && focus) setTreningyFocus(focus);
    if (tab === "financie" && focus) setFinancieFocus(focus);
    if (tab === "klienti" && focus) setKlientiFocus(focus);
  }, []);

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

  // Náklady z banky sa načítajú raz pre celú appku — model je modulový, takže
  // ich potrebuje aj dlaždica Zisk na dashboarde, nielen obrazovka VZAS.
  const [, setFioTik] = useState(0);
  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { gscMesacne?: { m: string; kliky: number }[]; ga4?: { m: string; udalosti: number }[] }) =>
        setWebMetriky({ gsc: j.gscMesacne || [], ga4: j.ga4 || [] }))
      .catch(() => {});
  }, []);

  // Náklady od júla 2026 tečú z banky — Excel končí júnom. Sčítajú sa výdavky
  // podľa kategórie a mesiaca a zapíšu sa do P&L; staršie mesiace zostávajú
  // z Excelu, aby sa dali oboje porovnať.
  useEffect(() => {
    void fetch("/api/fio", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { pohyby?: { datum: string; suma: number; kategoria: string }[] }) => {
        const sumy: Record<string, Record<string, number>> = {};
        const vyplaty: Record<string, { jerry: number; terezka: number }> = {};
        for (const p of j.pohyby || []) {
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
          (sumy[mk] ||= {});
          sumy[mk][p.kategoria] = (sumy[mk][p.kategoria] || 0) + -p.suma;
        }
        if (nastavNakladyZFio(sumy, vyplaty)) setFioTik((x) => x + 1);
      })
      .catch(() => {});
  }, []);

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
          acked: !!ack[key], note: ack[key]?.note, priority: 8, client: ciel,
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
  const rituals = useMemo(() => spocitajRitualy(new Date(), zapisy.weeks, zapisy.mesiace), [zapisy]);
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
        acked: !!ack[`zapis|${r.id}`],
        // Cieľ navigácie sa vezie v `client` — register nemá vlastné pole na
        // odkaz a zaviesť ho kvôli trom položkám by bolo viac kódu než úžitku.
        client: `${r.ciel.tab}|${r.ciel.sub || ""}`,
        priority: r.druh === "tyzden" ? 5 : r.druh === "mesiac" ? 6 : 40,
      }));
    return [...extra, ...zmenyMetrik, ...register].sort((a, b) => a.priority - b.priority);
  }, [rituals, register, zmenyMetrik, data.anomalyAck]);

  const aiContext = useMemo(() => buildAiContext(data, clients, sixM, capacity, register), [data, clients, sixM, capacity, register]);

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

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void checkSession().then((s) => setKtoSom(s.user)); void load(); }} />;

  const logout = async () => {
    await apiLogout();
    setAuthed(false);
    setKtoSom(null);
    setData(EMPTY_DATA);
  };

  return (
    <ObdobieCtx.Provider value={{ obdobie, setObdobie }}>
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text }}>
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 1200, margin: "0 auto", flexWrap: "wrap" }}>
        {/* Logo je zároveň cesta domov — najstarší weborý zvyk a jediné miesto,
            kde ho každý hľadá inštinktívne. */}
        <button onClick={() => navigate("dashboard")} style={{ lineHeight: 1.1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: -0.3 }}>Kokpit</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: 0.2 }}>ProSapiens Biomechanic</div>
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <HladanieKlienta clients={clients} leads={data.leads} onPick={(meno) => navigate("klienti", undefined, { client: meno, nonce: Date.now() })} onPickLead={() => navigate("klienti", "dopyty")} />
          <ZapisButton ritualy={rituals} onNavigate={(t, sub) => { navigate(t, sub); void nacitajZapisy(); }} onRefresh={() => void actions.refresh()} klienti={zapisKlienti} />
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
      </nav>
      <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
        {active === "dashboard" && (
          <Dashboard trainer={trainer} onTrainer={setTrainer} data={data} clients={clients} register={registerAll} sixM={sixM} capacity={capacity} actions={actions} onNavigate={navigate} assistantChat={chat} onClientClick={onClientClick} />
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
            {trackerSection === "klienti" && <Klienti clients={clients} capacity={capacity} actions={actions} focus={klientiFocus} leads={data.leads} trainer={trainer} onTrainer={setTrainer} sixM={sixM} sub={klientiSub} onSub={setKlientiSub} data={data} />}
            {trackerSection === "financie" && <Financie data={data} clients={clients} focus={financieFocus} sub={financieSub} onSub={setFinancieSub} />}
              </>
        )}

        {active === "marketing" && <Marketing data={data} clients={clients} leads={data.leads} chat={chat} sub={marketingSub} onSub={setMarketingSub} onKlient={(m) => navigate("klienti", undefined, { client: m, nonce: Date.now() })} />}
        {active === "vzas" && <Vzas sub={vzasSub} onSub={setVzasSub} data={data} />}
        {active === "vysledky" && <Vysledky data={data} onNavigate={navigate} clients={clients} sixM={sixM} capacity={capacity} register={register} sub={vysledkySub} onSub={setVysledkySub} />}
        {active === "udaje" && <Udaje data={data} actions={actions} />}
      </div>
      <div style={{ ...S.h3, textAlign: "center", color: C.textDim, fontSize: 11, padding: "8px 0 24px", fontWeight: 400 }}>
        ProSapiens Biomechanic · interný nástroj · nezdieľať externe
      </div>
      <Assistant chat={chat} onClientClick={onClientClick} />
    </div>
    </ObdobieCtx.Provider>
  );
}
