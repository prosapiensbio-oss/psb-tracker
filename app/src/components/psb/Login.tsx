import { useState } from "react";

import { login } from "../../lib/psb/client";
import { C, S, btn } from "../../lib/psb/theme";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await login(password);
    setBusy(false);
    if (ok) onSuccess();
    else setError(true);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ ...S.card, maxWidth: 360, width: "100%", marginBottom: 0, padding: 28 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.accent, letterSpacing: -0.4 }}>Tracker</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>ProSapiens Biomechanic</div>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 20 }}>interná evidencia</div>
        <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Heslo</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...S.input, marginBottom: 12, borderColor: error ? C.red : C.border }}
          placeholder="Spoločné heslo"
        />
        {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>Nesprávne heslo</div>}
        <button type="submit" disabled={busy} style={{ ...btn("accent"), width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
      </form>
    </div>
  );
}
