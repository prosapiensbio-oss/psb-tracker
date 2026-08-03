import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    return [...extra, ...register].sort((a, b) => a.priority - b.priority);
  }, [rituals, register, data.anomalyAck]);

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
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: -0.3 }}>Tracker</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: 0.2 }}>ProSapiens Biomechanic</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <HladanieKlienta clients={clients} onPick={(meno) => navigate("klienti", undefined, { client: meno, nonce: Date.now() })} />
          <ZapisButton ritualy={rituals} onNavigate={(t, sub) => { navigate(t, sub); void nacitajZapisy(); }} />
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
            {trackerSection === "klienti" && <Klienti clients={clients} capacity={capacity} actions={actions} focus={klientiFocus} leads={data.leads} trainer={trainer} onTrainer={setTrainer} sixM={sixM} sub={klientiSub} onSub={setKlientiSub} />}
            {trackerSection === "financie" && <Financie data={data} clients={clients} focus={financieFocus} sub={financieSub} onSub={setFinancieSub} />}
              </>
        )}

        {active === "marketing" && <Marketing data={data} clients={clients} leads={data.leads} chat={chat} />}
        {active === "vzas" && <Vzas sub={vzasSub} onSub={setVzasSub} />}
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
