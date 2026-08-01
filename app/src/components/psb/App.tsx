import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkSession,
  fetchData,
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
import { SixMTracker } from "./SixM";
import { Marketing } from "./Marketing";
import { Vysledky, Vzas } from "./Vzas";

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
  { id: "tracker", label: "Tracker", icon: "activity" },
  { id: "marketing", label: "Marketing", icon: "activity" },
  { id: "vzas", label: "VZAS", icon: "wallet" },
  { id: "vysledky", label: "Výsledky", icon: "calendar" },
];

const TRACKER_SECTIONS = [
  { id: "treningy", label: "Tréningy", icon: "calendar" },
  { id: "klienti", label: "Klienti", icon: "userCheck" },
  { id: "financie", label: "Financie", icon: "wallet" },
  { id: "6m", label: "6M Tracker", icon: "activity" },
];
const TRACKER_IDS = TRACKER_SECTIONS.map((s) => s.id);

export function PSBApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<PSBData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [trackerSection, setTrackerSection] = useState("treningy");
  const [vzasSub, setVzasSub] = useState("pnl");
  const [treningySub, setTreningySub] = useState("prehled");
  const [treningyFocus, setTreningyFocus] = useState<NavFocus | null>(null);
  const [financieFocus, setFinancieFocus] = useState<NavFocus | null>(null);
  const [klientiFocus, setKlientiFocus] = useState<NavFocus | null>(null);

  // Navigate to a tab, optionally to a focused week/month/client. Dashboard
  // click-throughs still pass the old section ids (treningy/klienti/…), so map
  // those onto the Tracker tab + its section rather than making callers change.
  const navigate = useCallback((tab: string, sub?: string, focus?: NavFocus) => {
    if (TRACKER_IDS.includes(tab)) {
      setActive("tracker");
      setTrackerSection(tab);
    } else {
      setActive(tab);
    }
    if (tab === "treningy" && sub) setTreningySub(sub);
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

  useEffect(() => {
    (async () => {
      const ok = await checkSession();
      setAuthed(ok);
      if (ok) await load();
      else setLoading(false);
    })();
  }, [load]);

  const clients = useMemo(() => deriveClients(data), [data]);
  // Latest clients for tolerant name resolution in setOverride (e.g. AI passes "Jakub Stigut" → "Jakub Štigut").
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const sixM = useMemo(() => deriveSixM(data, clients), [data, clients]);
  const capacity = useMemo(() => capacityByTrainer(clients, data.sessions), [clients, data.sessions]);
  const register = useMemo(() => deriveRegister(data, clients, sixM, capacity), [data, clients, sixM, capacity]);
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
        await load();
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

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void load(); }} />;

  const logout = async () => {
    await apiLogout();
    setAuthed(false);
    setData(EMPTY_DATA);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text }}>
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: -0.3 }}>Tracker</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: 0.2 }}>ProSapiens Biomechanic</div>
        </div>
        <button onClick={logout} style={{ marginLeft: "auto", background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}>
          Odhlásiť sa
        </button>
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
          <Dashboard data={data} clients={clients} register={register} sixM={sixM} capacity={capacity} actions={actions} onNavigate={navigate} assistantChat={chat} onClientClick={onClientClick} />
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
            {trackerSection === "treningy" && <Treningy data={data} clients={clients} sub={treningySub} onSub={setTreningySub} focus={treningyFocus} />}
            {trackerSection === "klienti" && <Klienti clients={clients} capacity={capacity} actions={actions} focus={klientiFocus} leads={data.leads} />}
            {trackerSection === "financie" && <Financie data={data} clients={clients} focus={financieFocus} />}
            {trackerSection === "6m" && <SixMTracker sixM={sixM} actions={actions} />}
          </>
        )}

        {active === "marketing" && <Marketing data={data} clients={clients} leads={data.leads} chat={chat} />}
        {active === "vzas" && <Vzas sub={vzasSub} onSub={setVzasSub} />}
        {active === "vysledky" && <Vysledky data={data} onNavigate={navigate} />}
      </div>
      <div style={{ ...S.h3, textAlign: "center", color: C.textDim, fontSize: 11, padding: "8px 0 24px", fontWeight: 400 }}>
        ProSapiens Biomechanic · interný nástroj · nezdieľať externe
      </div>
      <Assistant chat={chat} onClientClick={onClientClick} />
    </div>
  );
}
