import { useEffect, useState } from "react";

import { normName } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";

/**
 * ZMLUVA V PROFILE KLIENTA (10. 11. 2026: „zmluva sa priradí potom
 * k profilu po podpise"). Podpísané aj čakajúce zmluvy toho klienta
 * s odkazom na otvorenie; staršie z DocuSeal sa otvoria ako PDF.
 */
type Riadok = { id: string; klient: string; stav: string; zdroj?: string; vytvorene: string; podpisane: string | null; otvorene: string | null; odkaz: string };

const den = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};

export function ZmluvaKlienta({ meno, onOtvorKartu }: { meno: string; onOtvorKartu?: () => void }) {
  const [rows, setRows] = useState<Riadok[] | null>(null);
  const [chyba, setChyba] = useState("");
  useEffect(() => {
    let zive = true;
    void fetch("/api/zmluvy", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).then((r: { ok?: boolean; zmluvy?: Riadok[]; error?: string }) => {
      if (!zive) return;
      if (!r?.ok) { setChyba(r?.error || "Zmluvy sa nepodarilo načítať."); return; }
      setRows((r.zmluvy || []).filter((z) => normName(z.klient) === normName(meno) && z.stav !== "zrusena"));
    }).catch(() => zive && setChyba("Zmluvy sa nepodarilo načítať."));
    return () => { zive = false; };
  }, [meno]);

  if (chyba) return <div style={{ color: C.red, fontSize: 12.5 }}>{chyba}</div>;
  if (!rows) return <div style={{ color: C.textDim, fontSize: 12.5 }}>Načítavam…</div>;
  return (
    <div>
      {!rows.length && (
        <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.6 }}>
          V Kokpite zatiaľ žiadna zmluva. Pripraviť ju môžeš vo Workspace → Zmluvy.
        </div>
      )}
      {rows.map((z) => (
        <div key={z.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", padding: "9px 0", borderBottom: `1px solid ${mix(C.border, 45)}` }}>
          <b style={{ fontSize: 13.5 }}>Podmínky 6M</b>
          <span style={{ fontSize: 12, color: z.stav === "podpisana" ? C.green : C.accentLight }}>
            {z.stav === "podpisana"
              ? `podpísaná ${den(z.podpisane)}${z.zdroj === "docuseal" ? " · DocuSeal" : ""}`
              : z.otvorene ? `čaká na podpis · otvoril(a) ${den(z.otvorene)}` : `čaká na podpis · pripravená ${den(z.vytvorene)}`}
          </span>
          <div style={{ flexGrow: 1 }} />
          <a href={z.odkaz} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.accentLight }}>
            {z.stav === "podpisana" ? (z.zdroj === "docuseal" ? "otvoriť PDF" : "otvoriť zmluvu") : "otvoriť na podpis"}
          </a>
        </div>
      ))}
      {onOtvorKartu && <button onClick={onOtvorKartu} style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Workspace → Zmluvy</button>}
    </div>
  );
}
