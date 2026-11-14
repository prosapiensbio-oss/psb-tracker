import { useCallback, useEffect, useMemo, useState } from "react";

import { posunDen } from "../../lib/psb/cas";
import { dlhKc, hodinyZaSumu, patri, stavAktivity, type Aktivita, type Nakup, type RucnyTrening, type StavAktivity, type UdalostDochadzky } from "../../lib/psb/mojaDochadzka";
import { C, mix } from "../../lib/psb/theme";
import { useUzke } from "./useUzke";

/**
 * MOJA DOCHÁDZKA — karta vo Workspace (Jerry, 14. 11. 2026: „spojíme to…
 * B dlaždice budú na vrchu, C kalendár bude pod nimi, D dole to zapisovanie
 * novej platby a počtu hodín“). Každý profil vidí len svoje aktivity.
 * Výpočet je v lib/psb/mojaDochadzka.ts — ten istý pre notifikácie.
 */

type Odpoved = {
  ok: boolean; error?: string; kto: string; teraz: string;
  aktivity: Aktivita[]; nakupy: Nakup[]; udalosti: UdalostDochadzky[]; rucne?: RucnyTrening[];
  kandidati: { nazov: string; pocet: number; guillermo: boolean }[];
};

const tl = { padding: "5px 11px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted } as const;
const tlHlavne = { ...tl, background: C.accent, color: C.onAccent, border: `1px solid ${C.accent}`, fontWeight: 700 } as const;
const pole = { padding: "6px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "inherit", fontSize: 13 } as const;
const DNI = ["ne", "po", "ut", "st", "št", "pi", "so"];

const den = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return `${DNI[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`; };
const czk = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
const pondelok = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return posunDen(iso, -((d.getUTCDay() + 6) % 7)); };

function Nadpis({ children }: { children: string }) {
  return <div style={{ fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700, margin: "18px 0 8px" }}>{children}</div>;
}

export function MojaDochadzkaKarta() {
  const uzke = useUzke();
  const [d, setD] = useState<Odpoved | null>(null);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [tyzden, setTyzden] = useState<string | null>(null);
  const [novaAkt, setNovaAkt] = useState("");
  const [form, setForm] = useState({ aktivitaId: "", datum: "", hodiny: "10", suma: "", poznamka: "" });
  const [bezi, setBezi] = useState(false);
  const [pridavam, setPridavam] = useState(false);
  const [sPoznamkou, setSPoznamkou] = useState(false);
  const [rucnyTrening, setRucnyTrening] = useState<string | null>(null);

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/moja-dochadzka", { cache: "no-store" }).then((x) => x.json()).catch(() => null) as Odpoved | null;
    if (!r?.ok) { setChyba(r?.error || "Dochádzka sa nenačítala."); return; }
    setChyba(""); setD(r);
    setForm((f) => ({ ...f, datum: f.datum || r.teraz.slice(0, 10), aktivitaId: f.aktivitaId || r.aktivity[0]?.id || "" }));
    setTyzden((t) => t || pondelok(r.teraz.slice(0, 10)));
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);
  useEffect(() => { if (!hlaska) return; const t = setTimeout(() => setHlaska(""), 6000); return () => clearTimeout(t); }, [hlaska]);

  const posli = async (telo: Record<string, unknown>, ok: string) => {
    setBezi(true); setChyba("");
    const r = await fetch("/api/moja-dochadzka", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(telo) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; error?: string } | null;
    setBezi(false);
    if (!r?.ok) { setChyba(r?.error || "Zápis zlyhal."); return false; }
    setHlaska(ok); await nacitaj(); return true;
  };

  const stavy: StavAktivity[] = useMemo(() => (d ? d.aktivity.map((a) => stavAktivity(a, d.nakupy, d.udalosti, d.teraz)) : []), [d]);

  if (!d) return <div style={{ color: chyba ? C.red : C.textDim, fontSize: 13, padding: 12 }}>{chyba || "Načítavam…"}</div>;

  // ── B · dlaždice ───────────────────────────────────────────────
  const dlazdica = (s: StavAktivity) => {
    const balik = s.poslednyNakup?.hodiny || 0;
    const farba = s.zostatok <= 0 ? C.red : s.zostatok <= 2 ? C.orange : C.green;
    const minute = Math.max(0, balik - Math.max(0, s.zostatok));
    const kc = dlhKc(s.aktivita, s.zostatok);
    const nastavCenu = () => {
      const v = prompt(`Cena jednej hodiny — ${s.aktivita.nazov} (Kč, prázdne = bez ceny):`, s.aktivita.cenaHodiny ? String(s.aktivita.cenaHodiny) : "");
      if (v !== null) void posli({ akcia: "aktivita-cena", id: s.aktivita.id, cenaHodiny: v }, "Cena hodiny uložená.");
    };
    return (
      <div key={s.aktivita.id} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, background: C.card }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <div style={{ fontSize: 12, color: C.textDim, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 700, flex: 1 }}>{s.aktivita.nazov}</div>
          <button title="Zrušiť sledovanie" onClick={() => { if (confirm(`Prestať sledovať ${s.aktivita.nazov}? Zmažú sa aj jej zapísané platby.`)) void posli({ akcia: "aktivita-zmaz", id: s.aktivita.id }, "Aktivita zmazaná."); }}
            style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 13 }}>×</button>
        </div>
        {s.poslednyNakup ? (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, color: farba }}>{s.zostatok} <span style={{ fontSize: 14, color: C.textDim, fontWeight: 500 }}>{s.zostatok === 1 ? "hodina" : "h"} zostáva</span></div>
            {kc != null && <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginTop: 2 }}>doplatiť {czk(kc)}</div>}
            <div style={{ height: 8, borderRadius: 9, background: C.track, overflow: "hidden", margin: "10px 0 6px" }}>
              <i style={{ display: "block", height: "100%", width: `${balik ? Math.min(100, (minute / balik) * 100) : 100}%`, background: farba }} />
            </div>
            <div style={{ fontSize: 12.5, color: C.text }}>
              {s.dojde ? <><b style={{ color: C.orange }}>dôjde {den(s.dojde)}</b> · v kalendári ešte {s.naplanovane}</>
                : s.naplanovane ? <>v kalendári {s.naplanovane} — zaplatené pokryje</> : <span style={{ color: C.textDim }}>v kalendári nič naplánované</span>}
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
              posledná platba {den(s.poslednyNakup.datum)} · {s.poslednyNakup.hodiny} h{s.poslednyNakup.sumaKc != null ? ` · ${czk(s.poslednyNakup.sumaKc)}` : ""}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: C.textMuted, margin: "6px 0" }}>Zatiaľ bez platby — zapíš prvú dole a odpočet sa rozbehne od jej dňa.</div>
        )}
        <button onClick={nastavCenu} title="Cena jednej hodiny — z platby sa dopočítajú hodiny"
          style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: "6px 0 0", display: "block" }}>
          {s.aktivita.cenaHodiny ? `${czk(s.aktivita.cenaHodiny)} / h · zmeniť` : "+ cena za hodinu"}
        </button>
        <button onClick={() => { setForm((f) => ({ ...f, aktivitaId: s.aktivita.id })); document.getElementById("dochadzka-formular")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
          style={{ ...tl, marginTop: 10, color: C.green, borderColor: mix(C.green, 45) }}>+ zapísať platbu</button>
      </div>
    );
  };

  // Nová aktivita: „+“ pri nadpise, nie vlastný štvorec (Jerry, 14. 11. 2026).
  const pridatPanel = (
    <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {d.kandidati.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {d.kandidati.map((k) => (
            <button key={k.nazov} disabled={bezi} onClick={() => void posli({ akcia: "aktivita-pridaj", nazov: k.nazov, nazvy: [k.nazov], guillermo: k.guillermo }, `Sledujem ${k.nazov}.`).then((ok) => { if (ok) setPridavam(false); })}
              style={{ ...tl, color: C.accentLight, borderColor: mix(C.accent, 45) }}>
              {k.nazov} <span style={{ color: C.textDim }}>· {k.pocet}× v kalendári</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={novaAkt} onChange={(e) => setNovaAkt(e.target.value)} placeholder="názov udalosti v kalendári" style={{ ...pole, flex: 1, minWidth: 0 }} />
        <button disabled={bezi || !novaAkt.trim()} onClick={() => void posli({ akcia: "aktivita-pridaj", nazov: novaAkt.trim(), nazvy: [novaAkt.trim()] }, `Sledujem ${novaAkt.trim()}.`).then((ok) => { if (ok) { setNovaAkt(""); setPridavam(false); } })} style={tl}>pridať</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.textDim }}>Ráta sa tvoj kalendár, udalosti s presne týmto názvom. Guillermo sa ráta z oboch kalendárov a prevezme platby zo starej karty.</div>
    </div>
  );

  // ── C · týždeň z kalendára ─────────────────────────────────────
  const tyzdenOd = tyzden || pondelok(d.teraz.slice(0, 10));
  const dniTyzdna = Array.from({ length: 7 }, (_, i) => posunDen(tyzdenOd, i));
  const bodyTyzdna = stavy.flatMap((s) => {
    const podlaUid = new Map(s.body.map((b) => [b.uid, b]));
    return d.udalosti.filter((u) => podlaUid.has(u.uid) && dniTyzdna.includes(u.zaciatok.slice(0, 10)))
      .map((u) => ({ u, b: podlaUid.get(u.uid)!, a: s.aktivita }));
  });
  // Udalosti pred prvou platbou tiež ukázať — bez odznaku, nech je vidno, čo kalendár ráta.
  const mimo = d.udalosti.filter((u) => dniTyzdna.includes(u.zaciatok.slice(0, 10)) && !bodyTyzdna.some((x) => x.u.uid === u.uid)
    && d.aktivity.some((a) => patri(a, u)));
  const nazovPre = (u: UdalostDochadzky) => d.aktivity.find((a) => patri(a, u))?.nazov || u.nazov || "";
  const blok = (zaciatok: string, nazov: string, b: { poradie: number | null; zBalika: number | null; minus: number | null; posledna: boolean; minule: boolean } | null) => {
    const znak = !b ? "bez platby" : b.minus ? `−${b.minus}` : `${b.poradie}/${b.zBalika}${b.posledna ? " · posledná" : ""}`;
    const farba = !b ? C.textDim : b.minus ? C.red : b.posledna ? C.orange : C.blue;
    return (
      <div key={zaciatok + nazov} style={{ borderRadius: 8, padding: "5px 7px", marginBottom: 4, background: mix(farba, 12), borderLeft: `3px solid ${farba}`, opacity: b && !b.minule ? 0.75 : 1, fontSize: 12 }}>
        <div style={{ color: C.text, fontWeight: 600 }}>{zaciatok.slice(11, 16)} {nazov}</div>
        <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 800, padding: "0 6px", borderRadius: 99, background: farba, color: "#14180f", marginTop: 2 }}>{znak}</span>
      </div>
    );
  };
  const kalendar = (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setTyzden(posunDen(tyzdenOd, -7))} style={tl}>‹</button>
        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{den(tyzdenOd)} – {den(posunDen(tyzdenOd, 6))}</span>
        <button onClick={() => setTyzden(posunDen(tyzdenOd, 7))} style={tl}>›</button>
        <button onClick={() => setTyzden(pondelok(d.teraz.slice(0, 10)))} style={{ ...tl, border: "none" }}>tento týždeň</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: uzke ? "1fr" : "repeat(7, minmax(0, 1fr))", gap: 6 }}>
        {dniTyzdna.map((dd) => {
          const tu = [...bodyTyzdna.filter((x) => x.u.zaciatok.slice(0, 10) === dd).map((x) => ({ z: x.u.zaciatok, el: blok(x.u.zaciatok, x.a.nazov, x.b) })),
            ...mimo.filter((u) => u.zaciatok.slice(0, 10) === dd).map((u) => ({ z: u.zaciatok, el: blok(u.zaciatok, nazovPre(u), null) }))].sort((x, y) => x.z.localeCompare(y.z));
          if (uzke && !tu.length) return null;
          const dnes = dd === d.teraz.slice(0, 10);
          return (
            <div key={dd} style={{ minHeight: uzke ? undefined : 70, borderRadius: 10, padding: 6, background: dnes ? mix(C.accent, 8) : C.track }}>
              <div style={{ fontSize: 11, color: dnes ? C.accentLight : C.textDim, fontWeight: 700, marginBottom: 4 }}>{den(dd)}</div>
              {tu.map((x) => x.el)}
            </div>
          );
        })}
      </div>
      {uzke && !bodyTyzdna.length && !mimo.length && <div style={{ fontSize: 12.5, color: C.textDim }}>Tento týždeň nič.</div>}
    </div>
  );

  // ── D · zápis platby + zošit ───────────────────────────────────
  const riadky = stavy.flatMap((s) => {
    const nak = d.nakupy.filter((n) => n.aktivitaId === s.aktivita.id).map((n) => ({ datum: n.datum, poradie: 0, s, nakup: n as Nakup | null, bod: null as null | (typeof s.body)[number] }));
    const tr = s.body.filter((b) => b.minule).map((b) => ({ datum: b.zaciatok, poradie: 1, s, nakup: null, bod: b }));
    let zost = 0;
    return [...nak, ...tr].sort((x, y) => x.datum.slice(0, 10).localeCompare(y.datum.slice(0, 10)) || x.poradie - y.poradie || x.datum.localeCompare(y.datum))
      .map((r) => { zost += r.nakup ? r.nakup.hodiny : -1; return { ...r, zost }; });
  }).sort((x, y) => y.datum.localeCompare(x.datum)).slice(0, 40);

  const zapis = (
    <div id="dochadzka-formular" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", padding: 12, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
      <label style={{ fontSize: 11.5, color: C.textDim, display: "flex", flexDirection: "column", gap: 3 }}>aktivita
        <select value={form.aktivitaId} onChange={(e) => setForm({ ...form, aktivitaId: e.target.value })} style={{ ...pole, minWidth: 130 }}>
          {d.aktivity.map((a) => <option key={a.id} value={a.id}>{a.nazov}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 11.5, color: C.textDim, display: "flex", flexDirection: "column", gap: 3 }}>dátum platby
        <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} style={pole} />
      </label>
      <label style={{ fontSize: 11.5, color: C.textDim, display: "flex", flexDirection: "column", gap: 3 }}>hodín
        <input type="number" min={1} max={500} value={form.hodiny} onChange={(e) => setForm({ ...form, hodiny: e.target.value })} style={{ ...pole, width: 80 }} />
      </label>
      <label style={{ fontSize: 11.5, color: C.textDim, display: "flex", flexDirection: "column", gap: 3 }}>zaplatené Kč
        <input inputMode="numeric" value={form.suma} onChange={(e) => {
          // Pri známej cene hodiny sa hodiny dopočítajú zo sumy (4 000 Kč pri 800 Kč/h = 5 h).
          const h = hodinyZaSumu(d.aktivity.find((a) => a.id === form.aktivitaId), Number(e.target.value.replace(/\s/g, "").replace(",", ".")));
          setForm({ ...form, suma: e.target.value, ...(h ? { hodiny: String(h) } : {}) });
        }} placeholder="nepovinné" style={{ ...pole, width: 110 }} />
      </label>
      {sPoznamkou ? (
        <label style={{ fontSize: 11.5, color: C.textDim, display: "flex", flexDirection: "column", gap: 3, flex: "1 1 140px" }}>poznámka
          <input autoFocus value={form.poznamka} onChange={(e) => setForm({ ...form, poznamka: e.target.value })} style={pole} />
        </label>
      ) : (
        <button onClick={() => setSPoznamkou(true)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: "0 0 8px" }}>+ poznámka</button>
      )}
      <button disabled={bezi || !form.aktivitaId || !form.datum || !(Number(form.hodiny) > 0)}
        onClick={() => void posli({ akcia: "nakup-pridaj", aktivitaId: form.aktivitaId, datum: form.datum, hodiny: Number(form.hodiny), sumaKc: form.suma.trim(), poznamka: form.poznamka }, "Platba zapísaná.").then((ok) => { if (ok) { setForm((f) => ({ ...f, suma: "", poznamka: "" })); setSPoznamkou(false); } })}
        style={tlHlavne}>{bezi ? "Zapisujem…" : "Zapísať platbu"}</button>
    </div>
  );

  const rucnyPre = (uid?: string) => (uid?.startsWith("rucne:") ? (d.rucne || []).find((x) => uid.endsWith(`:${x.id}`)) : undefined);
  const pridatRucny = (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      {rucnyTrening === null ? (
        <button onClick={() => setRucnyTrening(`${d.teraz.slice(0, 10)}T12:00`)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0 }}>+ tréning, ktorý nie je v kalendári</button>
      ) : (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input type="datetime-local" value={rucnyTrening} onChange={(e) => setRucnyTrening(e.target.value)} style={pole} />
          <button disabled={bezi || !form.aktivitaId} onClick={() => void posli({ akcia: "trening-pridaj", aktivitaId: form.aktivitaId, zaciatok: rucnyTrening.slice(0, 16) }, "Tréning zapísaný.").then((ok) => { if (ok) setRucnyTrening(null); })} style={tl}>zapísať tréning ({d.aktivity.find((a) => a.id === form.aktivitaId)?.nazov || "—"})</button>
          <button onClick={() => setRucnyTrening(null)} style={{ ...tl, border: "none" }}>zrušiť</button>
        </span>
      )}
    </div>
  );

  const zosit = (
    <div style={{ marginTop: 10 }}>
      {riadky.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.8 }}>
            <thead><tr style={{ color: C.textDim, fontSize: 11.5, textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>dátum</th><th style={{ padding: "4px 6px" }}>aktivita</th><th style={{ padding: "4px 6px" }}>čo</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>hodiny</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Kč</th><th style={{ padding: "4px 6px", textAlign: "right" }}>zostatok</th><th />
            </tr></thead>
            <tbody>
              {riadky.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: r.nakup ? mix(C.green, 6) : undefined }}>
                  <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{den(r.datum)}</td>
                  <td style={{ padding: "5px 6px" }}>{r.s.aktivita.nazov}</td>
                  <td style={{ padding: "5px 6px", color: r.nakup ? C.text : C.textMuted }}>{r.nakup ? `platba${r.nakup.poznamka ? ` · ${r.nakup.poznamka}` : ""}` : `tréning ${r.datum.slice(11, 16)}${rucnyPre(r.bod?.uid)?.poznamka ? ` · ${rucnyPre(r.bod?.uid)!.poznamka}` : rucnyPre(r.bod?.uid) ? " · zapísaný ručne" : ""}`}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color: r.nakup ? C.green : C.textMuted }}>{r.nakup ? `+${r.nakup.hodiny}` : "−1"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right" }}>{r.nakup?.sumaKc != null ? czk(r.nakup.sumaKc) : ""}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color: r.zost < 0 ? C.red : r.zost === 0 ? C.orange : C.text }}>{r.zost}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right" }}>
                    {r.nakup && <button onClick={() => { if (confirm("Zmazať túto platbu?")) void posli({ akcia: "nakup-zmaz", id: r.nakup!.id }, "Platba zmazaná."); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}>×</button>}
                    {rucnyPre(r.bod?.uid) && <button onClick={() => { if (confirm("Zmazať tento ručne zapísaný tréning?")) void posli({ akcia: "trening-zmaz", id: rucnyPre(r.bod?.uid)!.id }, "Tréning zmazaný."); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ fontSize: 12.5, color: C.textDim }}>Zatiaľ žiadna platba ani odtrénovaná hodina.</div>}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.textDim }}>{d.kto} · súkromné — do firmy, tržieb ani výplat nevstupuje nič. Odpočet beží z tvojho kalendára od dňa platby.</div>
      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginTop: 6 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12.5, color: C.green, marginTop: 6 }}>{hlaska}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 8px" }}>
        <span style={{ fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700 }}>Moje aktivity</span>
        <button onClick={() => setPridavam((x) => !x)} title="Pridať aktivitu" aria-label="Pridať aktivitu"
          style={{ width: 24, height: 24, borderRadius: 99, border: `1px solid ${mix(C.accent, 55)}`, background: pridavam ? C.accentBg : "transparent", color: C.accentLight, cursor: "pointer", fontSize: 15, lineHeight: "20px", padding: 0, fontFamily: "inherit" }}>
          {pridavam ? "×" : "+"}
        </button>
      </div>
      {(pridavam || !d.aktivity.length) && pridatPanel}
      {d.aktivity.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {stavy.map(dlazdica)}
        </div>
      )}

      {d.aktivity.length > 0 && <><Nadpis>Kalendár</Nadpis>{kalendar}</>}

      {d.aktivity.length > 0 && <><Nadpis>Nová platba a zošit</Nadpis>{zapis}{pridatRucny}{zosit}</>}
    </div>
  );
}
