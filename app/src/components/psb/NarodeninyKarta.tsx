import { useCallback, useEffect, useState } from "react";

import { zapisPoJednom } from "../../lib/psb/workspaceKarty";
import { C, mix } from "../../lib/psb/theme";
import type { RiadokNarodenin } from "../../lib/psb/narodeninyOdkaz.server";

/**
 * KOMU CHÝBA DÁTUM NARODENIA (Jerry, 2. 11. 2026). Odkaz sa posiela na klik,
 * nikdy sám. Kto vyplnil, zo zoznamu zmizne; za deti ide SMS rodičovi.
 */
export function NarodeninyKarta() {
  const [zoznam, setZoznam] = useState<RiadokNarodenin[] | null>(null);
  const [otvorene, setOtvorene] = useState(false);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");

  const nacitaj = useCallback(async () => {
    type Odpoved = { ok?: boolean; zoznam?: RiadokNarodenin[]; error?: string };
    const j = await fetch("/api/sms", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "narodeniny" }),
    }).then((r) => r.json() as Promise<Odpoved>).catch((): Odpoved => ({ ok: false, error: "spojenie zlyhalo" }));
    if (!j.ok) { setChyba(j.error || "Zoznam sa nenačítal."); return; }
    setChyba("");
    setZoznam(j.zoznam || []);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const posli = async (r: RiadokNarodenin) => {
    const j = await fetch("/api/sms", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: r.klient, telefon: r.telefon, text: r.text, druh: "narodeniny", prijemca: r.prijemca === r.klient ? undefined : r.prijemca }),
    }).then((x) => x.json() as Promise<{ ok?: boolean; error?: string }>).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    if (!j.ok) throw new Error(j.error || "SMS neodišla");
  };

  const posliViac = async (rady: RiadokNarodenin[]) => {
    setBezi(true); setChyba(""); setHlaska("");
    const v = await zapisPoJednom(rady, posli);
    setBezi(false);
    setHlaska(`Odišlo ${v.hotovo} z ${rady.length}.`);
    if (v.chyby.length) setChyba(v.chyby.map((c) => `${c.polozka.klient}: ${c.chyba}`).join(" · "));
    await nacitaj();
  };

  if (!zoznam && !chyba) return null;
  const rady = zoznam || [];
  if (!rady.length && !chyba) return null;
  const naOdoslanie = rady.filter((r) => !r.odoslane && r.telefon);
  const bezCisla = rady.filter((r) => !r.telefon).length;
  const tlacidlo = { padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: bezi ? "wait" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontFamily: "inherit" } as const;

  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 9, border: `1px solid ${mix(C.accent, 40)}`, background: mix(C.accent, 6) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13, color: C.text }}>Chýba dátum narodenia: {rady.length}</b>
        {naOdoslanie.length > 0 && (
          <button disabled={bezi} style={tlacidlo}
            onClick={() => { if (window.confirm(`Poslať SMS s odkazom ${naOdoslanie.length} ľuďom?`)) void posliViac(naOdoslanie); }}>
            {bezi ? "Posielam…" : `Poslať odkaz všetkým (${naOdoslanie.length})`}
          </button>
        )}
        <button onClick={() => setOtvorene(!otvorene)} style={{ ...tlacidlo, border: "none", color: C.textMuted }}>{otvorene ? "skryť zoznam" : "ukázať zoznam"}</button>
        {bezCisla > 0 && <span style={{ fontSize: 11.5, color: C.orange }}>bez čísla: {bezCisla}</span>}
      </div>
      {hlaska && <div style={{ fontSize: 12, color: C.green, marginTop: 6 }}>{hlaska}</div>}
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{chyba}</div>}
      {otvorene && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 6 }}>{rady[0]?.text}</div>
          {rady.map((r) => (
            <div key={r.klient} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "5px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
              <b style={{ minWidth: 170, color: C.text }}>{r.klient}</b>
              <span style={{ color: C.textMuted, flex: "1 1 170px" }}>
                {r.prijemca !== r.klient ? `pošle sa: ${r.prijemca} · ` : ""}{r.telefon || "bez čísla"}{r.odoslane ? " · odoslané, čaká sa" : ""}
              </span>
              <a href={r.nahlad} target="_blank" rel="noreferrer" style={{ color: C.accentLight, fontSize: 12 }}>náhľad</a>
              {r.telefon && (
                <button disabled={bezi} style={tlacidlo} onClick={() => void posliViac([r])}>{r.odoslane ? "Poslať znova" : "Poslať"}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
