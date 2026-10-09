import { useCallback, useEffect, useState } from "react";

import type { VysledkyDotazniku } from "../../lib/psb/dotaznik";
import { fmtDMY } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

/**
 * VÝSLEDKY ANONYMNÉHO DOTAZNÍKA — Výsledky → Dotazník (9. 10. 2026).
 *
 * Jedna obrazovka: koľko odkazov odišlo, koľko ľudí odpovedalo, a od piatich
 * odpovedí výsledky. Pod piatimi sa neukazuje NIČ z obsahu — prvá odpoveď
 * by bola skoro podpísaná. Posiela sa vo Workspace → 2 · SMS → Hromadná
 * správa (tlačidlo „+ odkaz na anonymný dotazník").
 */
type Stav = {
  ok: boolean;
  error?: string;
  kola: { id: string; nazov: string; created_at: string; uzavrete_at: string | null }[];
  kolo: { id: string; nazov: string; created_at: string; uzavrete_at: string | null } | null;
  odislo?: number;
  odpovedalo?: number;
  minOdpovedi?: number;
  neodpovedali?: string[];
  vysledky?: VysledkyDotazniku;
};

const Pruh = ({ podiel, farba }: { podiel: number; farba: string }) => (
  <div style={{ height: 8, borderRadius: 4, background: mix(C.border, 60), overflow: "hidden", flex: 1 }}>
    <div style={{ width: `${Math.max(0, Math.min(100, podiel * 100))}%`, height: "100%", background: farba }} />
  </div>
);

export function DotaznikVysledky() {
  const [stav, setStav] = useState<Stav | null>(null);
  const [kolo, setKolo] = useState("");
  const [uzavri, setUzavri] = useState(false);
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(async () => {
    const j = await fetch(`/api/dotaznik${kolo ? `?kolo=${encodeURIComponent(kolo)}` : ""}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setStav(j as Stav);
  }, [kolo]);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const uzavriKolo = async () => {
    setChyba("");
    const j = await fetch("/api/dotaznik", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ akcia: "uzavri" }) })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setUzavri(false);
    if (!j?.ok) { setChyba(j?.error || "Nepodarilo sa uzavrieť."); return; }
    await nacitaj();
  };

  if (!stav) return <Card><div style={{ fontSize: 12.5, color: C.textDim }}>načítavam dotazník…</div></Card>;
  if (!stav.ok) return <Card><div style={{ fontSize: 12.5, color: C.red }}>{stav.error || "Dotazník sa nepodarilo načítať."}</div></Card>;

  const ako = (
    <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
      Posiela sa vo <b style={{ color: C.text }}>Workspace → 2 · SMS → Hromadná správa</b> tlačidlom „+ odkaz na anonymný dotazník". Každý klient dostane vlastný odkaz, ktorý sa dá použiť raz;
      odpovede sa ukladajú bez mena aj bez väzby na odkaz. Po týždni sa tam dá vybrať filter „Neodpovedali na dotazník" na jednu pripomienku.
    </div>
  );

  if (!stav.kolo) {
    return (
      <Card>
        <H3><Info text="Anonymný dotazník o ProSapiens — 7 otázok, odkaz cez SMS, výsledky až od piatich odpovedí." label="Dotazník" /></H3>
        <div style={{ fontSize: 13, color: C.text, margin: "6px 0 10px" }}>Dotazník ešte neodišiel nikomu.</div>
        {ako}
      </Card>
    );
  }

  const v = stav.vysledky;
  const k = stav.kolo;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <H3><Info text="Anonymný dotazník o ProSapiens — 7 otázok, odkaz cez SMS, výsledky až od piatich odpovedí." label={`Dotazník · ${k.nazov}`} /></H3>
          {stav.kola.length > 1 && (
            <select value={k.id} onChange={(e) => setKolo(e.target.value)} style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 8px", fontSize: 12 }}>
              {stav.kola.map((x) => <option key={x.id} value={x.id}>{x.nazov}{x.uzavrete_at ? " (uzavreté)" : ""}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "8px 0 12px" }}>
          <div><div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>{stav.odpovedalo}</div><div style={{ fontSize: 11.5, color: C.textMuted }}>odpovedalo</div></div>
          <div><div style={{ fontSize: 26, fontWeight: 800, color: C.textMuted }}>{stav.odislo}</div><div style={{ fontSize: 11.5, color: C.textMuted }}>odkazov odišlo</div></div>
          <div><div style={{ fontSize: 26, fontWeight: 800, color: C.textMuted }}>{(stav.neodpovedali || []).length}</div><div style={{ fontSize: 11.5, color: C.textMuted }}>ešte neodpovedalo</div></div>
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>
          kolo od {fmtDMY(k.created_at.slice(0, 10))}{k.uzavrete_at ? ` · uzavreté ${fmtDMY(k.uzavrete_at.slice(0, 10))}` : " · otvorené"}
        </div>
        {ako}
        {!k.uzavrete_at && (
          <div style={{ marginTop: 10 }}>
            {!uzavri
              ? <button onClick={() => setUzavri(true)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 11px", color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Uzavrieť kolo</button>
              : (
                <span style={{ fontSize: 12, color: C.text }}>
                  Uzavrieť? Odkazy z tohto kola prestanú platiť a ďalšia SMS založí nové kolo.{" "}
                  <button onClick={() => void uzavriKolo()} style={{ background: "none", border: "none", color: C.orange, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Áno, uzavrieť</button>
                  <button onClick={() => setUzavri(false)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontFamily: "inherit" }}>Späť</button>
                </span>
              )}
            {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{chyba}</div>}
          </div>
        )}
      </Card>

      {v?.skryte ? (
        <Card>
          <div style={{ fontSize: 13, color: C.text }}>
            Výsledky sa ukážu od <b>{stav.minOdpovedi}</b> odpovedí — zatiaľ {stav.odpovedalo}. Pri menšom počte by sa dalo tipnúť, kto čo napísal.
          </div>
        </Card>
      ) : v && (
        <>
          {v.nps && (
            <Card>
              <H3><Info text="Net Promoter Score: podiel tých, čo dali 9–10, mínus podiel tých, čo dali 0–6. Od −100 do +100; nad 50 je výborné. Opakovať každý polrok a sledovať zmenu." label="Odporučili by nás?" /></H3>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: v.nps.skore >= 50 ? C.green : v.nps.skore >= 0 ? C.text : C.orange }}>{v.nps.skore > 0 ? "+" : ""}{v.nps.skore}</div>
                <div style={{ fontSize: 12.5, color: C.textMuted }}>
                  priemer {v.nps.priemer.toLocaleString("cs-CZ")} / 10 · {v.nps.propagatori}× 9–10 · {v.nps.pasivni}× 7–8 · {v.nps.kritici}× 0–6
                </div>
              </div>
            </Card>
          )}
          <Card>
            <H3>Hodnotenie (1–5)</H3>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {v.skaly.map((q) => (
                <div key={q.id}>
                  <div style={{ fontSize: 12.5, color: C.text, marginBottom: 4 }}>{q.text}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Pruh podiel={(q.priemer - 1) / 4} farba={q.priemer >= 4 ? C.green : q.priemer >= 3 ? C.accent : C.orange} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 34, textAlign: "right" }}>{q.priemer.toLocaleString("cs-CZ")}</span>
                    <span style={{ fontSize: 11, color: C.textDim, minWidth: 60 }}>{q.odpovedi} odpovedí</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {v.vybery.map((q) => (
            <Card key={q.id}>
              <H3>{q.text}</H3>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {q.moznosti.map((m) => (
                  <div key={m.text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: C.text, minWidth: 190 }}>{m.text}</span>
                    <Pruh podiel={q.odpovedi ? m.pocet / q.odpovedi : 0} farba={C.accent} />
                    <span style={{ fontSize: 12, color: C.textMuted, minWidth: 28, textAlign: "right" }}>{m.pocet}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {v.texty.map((q) => (
            <Card key={q.id}>
              <H3>{q.text}</H3>
              {q.odpovede.length ? (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {q.odpovede.map((t, i) => (
                    <div key={i} style={{ fontSize: 13, color: C.text, lineHeight: 1.55, padding: "6px 10px", borderLeft: `2px solid ${mix(C.accent, 60)}` }}>„{t}"</div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6 }}>Nikto nenapísal nič.</div>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
