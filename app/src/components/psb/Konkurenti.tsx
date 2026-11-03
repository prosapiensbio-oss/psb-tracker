import { useEffect, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import type { Konkurenti as Data } from "../../lib/psb/konkurenti";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

/**
 * MARKETING → KONKURENTI (presunuté zo Strižne, Jerry 3. 11. 2026). Metricool
 * o cudzích účtoch nedáva zhliadnutia ani dosah, preto sa radí podľa interakcií
 * a zrovnanie s PSB je len orientačné. Rozbor jedného videa ostáva v Strižni.
 */
export function Konkurenti() {
  const [d, setD] = useState<Data | null>(null);
  const [nacitane, setNacitane] = useState(false);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");

  const posli = (telo: Record<string, unknown>) => fetch("/api/metricool", {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
  }).then(async (r) => {
    const t = await r.text();
    try { return JSON.parse(t) as { ok?: boolean; error?: string; konkurenti?: Data | null; upozornenie?: string }; }
    catch { return { ok: false, error: `Server odpovedal ${r.status}: ${t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}` }; }
  }).catch((e) => ({ ok: false, error: `Spojenie zlyhalo: ${String(e).slice(0, 160)}`, konkurenti: null, upozornenie: "" }));

  useEffect(() => {
    void posli({ akcia: "konkurenti" }).then((j) => {
      if (j.ok) setD(j.konkurenti ?? null); else setChyba(j.error || "Prehľad sa nenačítal.");
      setNacitane(true);
    });
  }, []);
  const nacitaj = async (dni: number) => {
    setBezi(true); setChyba(""); setHlaska("");
    const j = await posli({ akcia: "konkurenti-nacitaj", dni });
    setBezi(false);
    if (!j.ok) { setChyba(j.error || "Čítanie zlyhalo."); return; }
    setD(j.konkurenti ?? null);
    setHlaska(j.upozornenie || "");
  };
  const tl = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: bezi ? "default" : "pointer", opacity: bezi ? 0.5 : 1 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <H3><Info label="Konkurenti na Instagrame" text="Účty, ktoré máš v Metricoole pridané medzi konkurentov. Pridávajú sa tam, nie tu. Metricool o nich nedáva zhliadnutia ani dosah, preto sa radí podľa interakcií. Rozbor jedného videa, ako je nastrihané, je v Strižni → Analyzátor." /></H3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          {[30, 60, 90].map((n) => <button key={n} type="button" disabled={bezi} onClick={() => void nacitaj(n)} style={tl}>{bezi ? "čítam…" : `Načítať ${n} dní`}</button>)}
          {d && <span style={{ fontSize: 12, color: C.textDim }}>naposledy {fmtDMY(d.nacitane.slice(0, 10))} · obdobie {fmtDMY(d.od)} – {fmtDMY(d.do)}</span>}
        </div>
        {chyba && <div style={{ fontSize: 12.5, color: C.red, marginTop: 8, lineHeight: 1.5 }}>{chyba}</div>}
        {hlaska && <div style={{ fontSize: 12.5, color: C.orange, marginTop: 8, lineHeight: 1.5 }}>{hlaska}</div>}
      </Card>

      {nacitane && !d && !chyba && <Empty>Zatiaľ nič nenačítané. Stlač Načítať; treba na to API kľúč v Upload → Napojenia.</Empty>}
      {d && d.ucty.length === 0 && <Empty>V Metricoole nie je pridaný žiadny konkurent.</Empty>}

      {d && d.ucty.length > 0 && (
        <Card>
          <H3>Účty</H3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {d.ucty.map((u) => (
              <div key={u.ucet} style={{ fontSize: 13, color: C.text, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <b>@{u.ucet}</b>
                <span style={{ color: C.textMuted }}>{u.sledovatelia != null ? `${u.sledovatelia.toLocaleString("sk-SK")} sledovateľov` : "sledovatelia neznámi"} · {u.prispevky} príspevkov · {u.reels} reels{u.engagement != null ? ` · engagement ${u.engagement.toFixed(1).replace(".", ",")} %` : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {d?.vzory && (
        <Card>
          <H3>Čo sa v ich popisoch opakuje</H3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {d.vzory.vzory.map((v, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.text }}>
                <b>{v.vzor}</b>{v.priklad ? <span style={{ color: C.textMuted }}> · „{v.priklad}“</span> : null}
                {v.preco && <div style={{ fontSize: 12, color: C.textDim }}>{v.preco}</div>}
              </div>
            ))}
          </div>
          {d.vzory.prePsb.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, margin: "12px 0 4px" }}>Čo z toho pre PSB</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: C.text }}>
                {d.vzory.prePsb.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </>
          )}
        </Card>
      )}

      {d && d.prispevky.length > 0 && (
        <Card>
          <H3>Príspevky podľa interakcií ({d.prispevky.length})</H3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {d.prispevky.slice(0, 30).map((p, i) => (
              <div key={i} style={{ fontSize: 12.5, lineHeight: 1.45, paddingBottom: 8, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
                <div style={{ color: C.textMuted, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ color: C.text }}>{p.interakcie} interakcií</b>
                  <span>{p.lajky} lajkov · {p.komentare} komentárov</span>
                  <span>@{p.ucet}{p.datum ? ` · ${fmtDMY(p.datum)}` : ""}</span>
                  {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ color: C.accentLight }}>otvoriť</a>}
                </div>
                <div style={{ color: C.text, marginTop: 2 }}>{p.text.length > 220 ? `${p.text.slice(0, 220)}…` : p.text}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
