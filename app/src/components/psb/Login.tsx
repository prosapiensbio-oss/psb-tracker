import { useEffect, useState } from "react";

import { checkSession, login } from "../../lib/psb/client";
import { C, S, btn } from "../../lib/psb/theme";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [meno, setMeno] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  // Mená sa ponúkajú, len keď nejaké kontá existujú. Kým ich niet, obrazovka
  // vyzerá presne ako predtým a zdieľané heslo funguje ďalej.
  const [kontá, setKontá] = useState<{ login: string; name: string }[]>([]);
  useEffect(() => {
    void checkSession().then((s) => {
      setKontá(s.pouzivatelia);
      if (s.pouzivatelia.length) setMeno(s.pouzivatelia[0].login);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await login(password, meno);
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
        {kontá.length > 0 && (
          <>
            <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Kto si</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {kontá.map((k) => {
                const aktivny = meno === k.login;
                return (
                  <button
                    key={k.login} type="button" onClick={() => setMeno(k.login)}
                    style={{
                      flex: "1 1 0", padding: "9px 12px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600,
                      border: `1px solid ${aktivny ? C.accent : C.border}`,
                      background: aktivny ? C.accentBg : "transparent",
                      color: aktivny ? C.accentLight : C.textMuted,
                    }}
                  >
                    {k.name}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <label style={{ fontSize: 12, color: C.textMuted, display: "block", marginBottom: 6 }}>Heslo</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...S.input, marginBottom: 12, borderColor: error ? C.red : C.border }}
          placeholder={kontá.length ? "Tvoje heslo" : "Spoločné heslo"}
        />
        {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>Nesprávne meno alebo heslo</div>}
        <button type="submit" disabled={busy} style={{ ...btn("accent"), width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
      </form>
    </div>
  );
}
