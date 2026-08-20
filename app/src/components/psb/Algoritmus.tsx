import { useEffect, useState, type ReactNode } from "react";

import ALGORITMY from "../../lib/psb/algoritmy.md?raw";
import { fmtDMY } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

// Ako fungujú algoritmy — a čo sa v nich práve zmenilo.
//
// Dokument je datovaný a zastaráva; platformy menia váhy signálov priebežne.
// Preto sú tu dve veci vedľa seba: čo platí (text, ktorý sa raz za pol roka
// prejde ručne) a čo pribudlo (oficiálne zdroje, ktoré appka číta sama).
//
// Instagram medzi automatickými zdrojmi chýba a nie je to prehliadnutie: Adam
// Mosseri oznamuje zmeny videami na svojom profile a na Threads, oficiálny feed
// Instagram nemá. Najdôležitejší zdroj je zároveň jediný, ktorý sa nedá
// automatizovať — a appka to radšej povie, než by predstierala úplnosť.

const PLATI_OD = "2026-08-03";
const POL_ROKA = 183;

type Novinka = { id: string; zdroj: string; titulok: string; url: string; datum: string; relevantne: boolean; precitane: boolean };

// Markdown je tu krátky a známy — nadpisy, tučné, tabuľky, odrážky. Plný parser
// by kvôli jednému dokumentu pritiahol závislosť.
function Text({ md }: { md: string }) {
  const bloky: ReactNode[] = [];
  let tabulka: string[][] = [];
  const zavriTabulku = (k: number) => {
    if (!tabulka.length) return;
    const [hlav, ...telo] = tabulka;
    bloky.push(
      <div key={`t${k}`} style={{ overflowX: "auto", margin: "6px 0 12px" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
          <thead><tr>{hlav.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "5px 9px", color: C.textMuted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{telo.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: "5px 9px", borderBottom: `1px solid ${mix(C.border, 45)}`, color: C.text }} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}</tr>)}</tbody>
        </table>
      </div>,
    );
    tabulka = [];
  };
  const inline = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, `<b style="color:${C.text}">$1</b>`)
      .replace(/`([^`]+)`/g, `<code style="background:${C.bg};padding:1px 4px;border-radius:4px;font-size:11.5px">$1</code>`)
      .replace(/\*([^*]+)\*/g, "<i>$1</i>");

  md.split("\n").forEach((r, i) => {
    const t = r.trim();
    if (t.startsWith("|")) {
      if (/^\|[\s:-]+\|/.test(t)) return;
      tabulka.push(t.split("|").slice(1, -1).map((c) => c.trim()));
      return;
    }
    zavriTabulku(i);
    if (!t) return;
    if (t === "---") { bloky.push(<div key={i} style={{ height: 1, background: C.border, margin: "16px 0" }} />); return; }
    if (t.startsWith("### ")) { bloky.push(<div key={i} style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "12px 0 5px" }}>{t.slice(4)}</div>); return; }
    if (t.startsWith("## ")) { bloky.push(<div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.accentLight, margin: "18px 0 6px" }}>{t.slice(3)}</div>); return; }
    if (t.startsWith("# ")) { bloky.push(<div key={i} style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: "4px 0 10px" }}>{t.slice(2)}</div>); return; }
    if (t.startsWith("- ")) {
      bloky.push(<div key={i} style={{ display: "flex", gap: 8, margin: "3px 0" }}><span style={{ color: C.accentLight }}>·</span><span style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: inline(t.slice(2)) }} /></div>);
      return;
    }
    bloky.push(<p key={i} style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.65, margin: "0 0 8px" }} dangerouslySetInnerHTML={{ __html: inline(t) }} />);
  });
  zavriTabulku(9999);
  return <>{bloky}</>;
}

export function Algoritmus() {
  const [novinky, setNovinky] = useState<Novinka[]>([]);
  const [kontrolovane, setKontrolovane] = useState("");
  const [busy, setBusy] = useState(false);
  const [sprava, setSprava] = useState("");
  const [vsetky, setVsetky] = useState(false);

  const nacitaj = () => {
    void fetch("/api/algo", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { novinky?: Novinka[]; kontrolovane?: string }) => {
        setNovinky(j.novinky || []);
        setKontrolovane(j.kontrolovane || "");
      })
      .catch(() => {});
  };
  useEffect(nacitaj, []);

  const skontroluj = async () => {
    setBusy(true); setSprava("");
    try {
      const j = await fetch("/api/algo", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json());
      setSprava(j.pridane ? `Pribudlo ${j.pridane} nových správ${j.chybne ? ` (${j.chybne} zdrojov neodpovedalo)` : ""}.` : `Nič nové${j.chybne ? ` (${j.chybne} zdrojov neodpovedalo)` : ""}.`);
      nacitaj();
    } catch {
      setSprava("Kontrola sa nepodarila.");
    }
    setBusy(false);
  };

  // Optimisticky označí hneď, ale keď server zápis neprijme, vráti stav
  // späť — inak by novinka zmizla z obrazovky a po reloade sa vrátila ako
  // neprečítaná, bez stopy prečo (revízia 19. 8. 2026: bol tu fetch bez
  // čakania na odpoveď).
  const oznacPrecitane = (id: string) => {
    setNovinky((p) => p.map((n) => (n.id === id ? { ...n, precitane: true } : n)));
    void fetch("/api/algo", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
      .then((r) => r.json().catch(() => ({ ok: r.ok })))
      .then((j: { ok?: boolean }) => { if (!j.ok) setNovinky((p) => p.map((n) => (n.id === id ? { ...n, precitane: false } : n))); })
      .catch(() => setNovinky((p) => p.map((n) => (n.id === id ? { ...n, precitane: false } : n))));
  };

  const dniOdRevizie = Math.round((Date.now() - Date.parse(PLATI_OD)) / 86400000);
  const zastarane = dniOdRevizie > POL_ROKA;
  const neprecitane = novinky.filter((n) => n.relevantne && !n.precitane).length;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <H3><Info text="Zhrnutie toho, ako jednotlivé platformy rozhodujú o dosahu, s číslami PSB priamo pri každom signáli. Jarvis má ten istý text v znalostiach, takže sa naň dá pýtať." label="Ako to funguje (stav k 3. 8. 2026)" /></H3>
          <span style={{ fontSize: 11.5, color: zastarane ? C.orange : C.textDim }}>
            {zastarane ? `Text má ${dniOdRevizie} dní — čas prejsť ho znova.` : `Prejsť znova o ${POL_ROKA - dniOdRevizie} dní.`}
          </span>
        </div>
        <Text md={ALGORITMY} />
      </Card>

      {/* Sledovanie oficiálnych kanálov zostalo, ale zmenšené na jeden riadok.
          Prvý ostrý beh prešiel 50 správ a ako dôležitú vypichol jednu — novú
          spam politiku Googlu o „back button hijacking", ktorá sa PSB netýka.
          To je odpoveď na otázku, či to má byť karta: nemá. Meta zmeny
          hodnotenia vo feedoch neoznamuje (Mosseri ich hovorí do videa), takže
          práve ten kanál, kvôli ktorému to vzniklo, sa sledovať nedá.

          A hlavne: appka nepotrebuje vedieť, že sa algoritmus zmenil.
          Potrebuje si všimnúť, že sa zmenili JEJ čísla — a tie už má. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 13px", borderRadius: 9, background: mix(C.text, 3), border: `1px solid ${mix(C.border, 70)}` }}>
        <span style={{ fontSize: 11.5, color: C.textDim, flex: "1 1 260px", lineHeight: 1.5 }}>
          Oficiálne kanály (Google Search Central, Meta Newsroom, Facebook Developers, YouTube):{" "}
          {kontrolovane ? `naposledy kontrolované ${fmtDMY(kontrolovane)}` : "zatiaľ nekontrolované"}
          {neprecitane > 0 && <span style={{ color: C.accentLight }}> · {neprecitane} nových na pozretie</span>}
          {sprava && <span style={{ color: C.accentLight }}> · {sprava}</span>}
        </span>
        {novinky.length > 0 && (
          <button onClick={() => setVsetky((v) => !v)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>
            {vsetky ? "skryť" : "ukázať"}
          </button>
        )}
        <button
          onClick={() => void skontroluj()} disabled={busy}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, color: C.textMuted, fontSize: 11.5, padding: "4px 10px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1, whiteSpace: "nowrap" }}
        >
          {busy ? "kontrolujem…" : "skontrolovať"}
        </button>
      </div>

      {vsetky && (
        <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
          {novinky.map((n) => (
            <div key={n.id} style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${mix(C.border, 40)}`, fontSize: 11.5, flexWrap: "wrap", opacity: n.precitane ? 0.45 : 1 }}>
              <span style={{ color: C.textDim, minWidth: 70, fontVariantNumeric: "tabular-nums" }}>{n.datum ? fmtDMY(n.datum) : "—"}</span>
              <span style={{ color: n.relevantne ? C.accentLight : C.textDim, minWidth: 124 }}>{n.zdroj}</span>
              <a href={n.url} target="_blank" rel="noreferrer" style={{ color: n.relevantne ? C.text : C.textMuted, flex: "1 1 200px", minWidth: 0, textDecoration: "none" }}>{n.titulok}</a>
              {!n.precitane && <button onClick={() => oznacPrecitane(n.id)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11, cursor: "pointer" }}>ok</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
