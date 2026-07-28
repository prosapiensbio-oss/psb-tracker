import { useCallback, useEffect, useMemo, useState } from "react";

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

export type Actions = {
  setOverride: (name: string, key: keyof ClientOverride, value: unknown) => void;
  ackAnomaly: (key: string, note: string, ack?: boolean) => void;
  ingest: (files: { filename: string; text: string }[]) => Promise<IngestResult[]>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
};

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "treningy", label: "Tréningy", icon: "calendar" },
  { id: "klienti", label: "Klienti", icon: "userCheck" },
  { id: "financie", label: "Financie", icon: "wallet" },
  { id: "6m", label: "6M Tracker", icon: "activity" },
];

export function PSBApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<PSBData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [treningySub, setTreningySub] = useState("prehled");

  // Navigate to a tab, optionally to a specific Tréningy sub-tab.
  const navigate = useCallback((tab: string, sub?: string) => {
    setActive(tab);
    if (tab === "treningy" && sub) setTreningySub(sub);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchData());
    setLoading(false);
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
  const sixM = useMemo(() => deriveSixM(data, clients), [data, clients]);
  const capacity = useMemo(() => capacityByTrainer(clients, data.sessions), [clients, data.sessions]);
  const register = useMemo(() => deriveRegister(data, clients, sixM, capacity), [data, clients, sixM, capacity]);

  const actions = useMemo<Actions>(
    () => ({
      setOverride: (name, key, value) => {
        // Optimistic local update, then persist.
        setData((prev) => ({
          ...prev,
          clientOverrides: { ...prev.clientOverrides, [name]: { ...prev.clientOverrides[name], [key]: value } },
        }));
        void saveOverride(name, key, value);
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
      refresh: load,
    }),
    [load],
  );

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
          <Dashboard data={data} clients={clients} register={register} sixM={sixM} capacity={capacity} actions={actions} onNavigate={navigate} />
        )}
        {active === "treningy" && <Treningy data={data} clients={clients} sub={treningySub} onSub={setTreningySub} />}
        {active === "klienti" && <Klienti clients={clients} capacity={capacity} actions={actions} />}
        {active === "financie" && <Financie data={data} clients={clients} />}
        {active === "6m" && <SixMTracker sixM={sixM} actions={actions} />}
      </div>
      <div style={{ ...S.h3, textAlign: "center", color: C.textDim, fontSize: 11, padding: "8px 0 24px", fontWeight: 400 }}>
        ProSapiens Biomechanic · interný nástroj · nezdieľať externe
      </div>
    </div>
  );
}
