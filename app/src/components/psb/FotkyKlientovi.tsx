import { useState } from "react";
import { otvorNahlad } from "../../lib/psb/nahladOkno";

import { vychodiskovaSprava, type CisloKarty } from "../../lib/psb/fotkyStranka";
import { doSchranky } from "../../lib/psb/kopirovanie";
import { krstne, TRENERI } from "../../lib/psb/mailFaktury";
import { nazovPohladu, type Fotka } from "../../lib/psb/kartoteka";
import { C, mix } from "../../lib/psb/theme";
import { OpravitText } from "./OpravitText";
import { SmsKlientovi } from "./SmsKlientovi";

/**
 * POSLAŤ FOTKY KLIENTOVI (Jerry, 12. 10. 2026) — odkaz `/f/<token>`.
 *
 * V kartotéke sa označia porovnania z editora; tu sa dopíše správa (predvolená
 * je všeobecná, platí aj pre klienta po troch rokoch), voliteľné čísla
 * „pred → po" (nevyplnené sa na stránke neukážu) a body „na čom budeme
 * pracovať". Odkaz vznikne až na tlačidlo a SMS odíde len cez SmsKlientovi
 * — nič sa neposiela samo.
 */

export type OdkazFotiek = {
  token: string; url: string; pocet: number; trener: string | null; kto: string | null;
  vytvorene: string; platiDo: string; zrusene: string | null; otvorene: string | null; suhlas: string | null; suhlasKedy: string | null;
};
export type OdpovedFotky = { id: number; token: string; text: string; kedy: string };

const denCz = (d: string) => {
  const [r, m, dd] = d.slice(0, 10).split("-");
  return `${Number(dd)}. ${Number(m)}. ${r}`;
};
const pole = { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 };
const nadpis = { fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase" as const, color: C.textDim, marginBottom: 8 };

export function PoslatKlientovi({ meno, trener, fotky, onZrus, onHotovo, onOtvorFotku }: {
  meno: string;
  trener: string;
  fotky: Fotka[];
  onZrus: () => void;
  onHotovo: () => void;
  onOtvorFotku: (f: Fotka) => void;
}) {
  const [sprava, setSprava] = useState(() => vychodiskovaSprava(krstne(meno)));
  const [cisla, setCisla] = useState<Record<string, CisloKarty[]>>({});
  const [dalej, setDalej] = useState("");
  // „Na čem budeme pracovat dál" sa pýta až tesne pred odoslaním (Jerry, 13. 10. 2026).
  const [poslednyKrok, setPoslednyKrok] = useState(false);
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");
  const [hotovo, setHotovo] = useState<{ url: string; nahlad: string } | null>(null);

  const zmenCislo = (id: string, i: number, kluc: keyof CisloKarty, h: string) =>
    setCisla((c) => ({ ...c, [id]: (c[id] || []).map((x, j) => (j === i ? { ...x, [kluc]: h } : x)) }));

  const vytvor = async (body = dalej) => {
    setPracujem(true);
    setChyba("");
    const j = await fetch("/api/fotky", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "odkaz", klient: meno, trener, sprava, dalej: body, fotky: fotky.map((f) => ({ id: f.id, cisla: cisla[f.id] || [] })) }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!j?.ok) { setChyba(j?.error || "Odkaz nevznikol."); return; }
    setHotovo({ url: j.url, nahlad: j.nahlad });
    onHotovo();
  };

  if (hotovo) {
    const podpis = TRENERI[trener]?.krstne || "";
    return (
      <div style={{ padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${C.accent}` }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Odkaz je pripravený</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 12.5 }}>
          <code style={{ padding: "4px 8px", borderRadius: 6, background: C.bg, color: C.text, wordBreak: "break-all" }}>{hotovo.url}</code>
          <button type="button" onClick={() => void doSchranky(hotovo.url)} style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>kopírovať</button>
          <a href={hotovo.nahlad} target="_blank" rel="noreferrer" onClick={(e) => otvorNahlad(e, hotovo.nahlad)} style={{ color: C.accentLight }}>pozrieť, čo uvidí</a>
        </div>
        <div style={{ marginTop: 12 }}>
          <SmsKlientovi
            meno={meno} trener={trener} vlozene druhAuditu="fotky"
            predvolenyText={`Ahoj ${krstne(meno)}, posílám ti srovnání tvých fotek: ${hotovo.url}${podpis ? ` ${podpis}` : ""}`}
          />
        </div>
        <button type="button" onClick={onZrus} style={{ marginTop: 10, background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zavrieť</button>
      </div>
    );
  }

  const tlacidlo = { padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 18), color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: pracujem ? "default" : "pointer", opacity: pracujem ? 0.6 : 1 } as const;
  const odkazTl = { background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" } as const;

  if (poslednyKrok) {
    return (
      <div style={{ padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${C.accent}`, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Na čem budeme pracovat dál?</div>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>
          Každý bod na nový riadok — na stránke bude pod fotkami ako očíslovaný zoznam. Nechceš? Vytvor odkaz bez toho.
        </div>
        <textarea autoFocus value={dalej} onChange={(e) => setDalej(e.target.value)} rows={4}
          placeholder={"Pravá kyčel — stabilita ve stoji na jedné noze\nUdržet hrudník otevřený i při práci u počítače\nDalší focení za 12 týdnů"}
          style={{ ...pole, resize: "vertical" }} />
        {dalej.trim() && <div style={{ marginTop: -4 }}><OpravitText maly text={dalej} onOpravene={setDalej} /></div>}
        {chyba && <div style={{ fontSize: 12.5, color: C.red }}>{chyba}</div>}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" disabled={pracujem || !dalej.trim()} onClick={() => void vytvor()} style={{ ...tlacidlo, opacity: pracujem || !dalej.trim() ? 0.5 : 1 }}>
            {pracujem ? "Vytváram…" : "Vytvoriť odkaz"}
          </button>
          <button type="button" disabled={pracujem} onClick={() => void vytvor("")} style={{ ...odkazTl, color: C.accentLight }}>bez toho — vytvoriť odkaz</button>
          <button type="button" disabled={pracujem} onClick={() => setPoslednyKrok(false)} style={odkazTl}>← späť</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${C.accent}`, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Poslať klientovi</span>
        <span style={{ fontSize: 12, color: C.textDim }}>{fotky.length} {fotky.length === 1 ? "porovnanie" : fotky.length < 5 ? "porovnania" : "porovnaní"} · klient uvidí stránku v češtine</span>
      </div>
      <label style={{ fontSize: 12, color: C.textMuted }}>
        správa navrchu
        <textarea value={sprava} onChange={(e) => setSprava(e.target.value)} rows={3} style={{ ...pole, marginTop: 4, resize: "vertical" }} />
      </label>
      <div style={{ marginTop: -6 }}><OpravitText maly text={sprava} onOpravene={setSprava} /></div>

      {fotky.map((f) => (
        <div key={f.id} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 10, alignItems: "start" }}>
          <button type="button" onClick={() => onOtvorFotku(f)} title="Zväčšiť a upraviť popis" style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: C.bg, cursor: "zoom-in" }}>
            <img src={`/api/fotky?id=${encodeURIComponent(f.id)}`} alt="" style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: f.popis ? C.text : C.textDim, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {f.popis || "bez popisu — klikni na fotku a dopíš ho"}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>
              {nazovPohladu(f.pohlad)} · {denCz(f.den)}{f.maCiste ? " · klient si prepne aj čistú podobu" : ""}
            </div>
            {(cisla[f.id] || []).map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr auto", gap: 6, marginTop: 6 }}>
                <input placeholder="čo (napr. pánev)" value={c.nazov} onChange={(e) => zmenCislo(f.id, i, "nazov", e.target.value)} style={pole} />
                <input placeholder="pred" value={c.pred} onChange={(e) => zmenCislo(f.id, i, "pred", e.target.value)} style={pole} />
                <input placeholder="po" value={c.po} onChange={(e) => zmenCislo(f.id, i, "po", e.target.value)} style={pole} />
                <button type="button" aria-label="Odstrániť číslo" onClick={() => setCisla((x) => ({ ...x, [f.id]: (x[f.id] || []).filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setCisla((x) => ({ ...x, [f.id]: [...(x[f.id] || []), { nazov: "", pred: "", po: "" }] }))}
              style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
            >+ číslo „pred → po" (nevyplnené sa neukáže)</button>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.5 }}>
        Pred vytvorením sa ešte spýtam, na čom budete pracovať ďalej. Na stránke bude aj „Chceš se na něco zeptat?" (odpoveď príde {trener || "trénerovi"} do notifikácií a do profilu), súhlas so zverejnením a stiahnutie. Odkaz platí 30 dní.
      </div>
      {chyba && <div style={{ fontSize: 12.5, color: C.red }}>{chyba}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={() => { setChyba(""); setPoslednyKrok(true); }} style={tlacidlo}>
          Ďalej →
        </button>
        <button type="button" onClick={onZrus} style={{ background: "none", border: "none", color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zrušiť</button>
      </div>
    </div>
  );
}

/** Poslané odkazy a odpovede klienta — kedy, či otvoril, súhlas, čo napísal. */
export function PoslaneKlientovi({ odkazy, odpovede, onZmena }: { odkazy: OdkazFotiek[]; odpovede: OdpovedFotky[]; onZmena: () => void }) {
  const [chyba, setChyba] = useState("");
  if (!odkazy.length) return null;
  const zrus = async (o: OdkazFotiek) => {
    if (!window.confirm(`Zrušiť odkaz z ${denCz(o.vytvorene)}? Klient ho už neotvorí.`)) return;
    const j = await fetch("/api/fotky", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ akcia: "zrus-odkaz", token: o.token }) })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    if (!j?.ok) { setChyba(j?.error || "Nezrušilo sa."); return; }
    setChyba("");
    onZmena();
  };
  return (
    <div>
      <div style={nadpis}>Poslané klientovi</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {odkazy.map((o) => {
          const odp = odpovede.filter((x) => x.token === o.token).sort((a, b) => a.kedy.localeCompare(b.kedy));
          const neplati = !!o.zrusene || o.platiDo < new Date().toISOString().slice(0, 10);
          return (
            <div key={o.token} style={{ padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${mix(C.border, 120)}`, opacity: neplati ? 0.65 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5 }}>
                <b style={{ fontSize: 13.5 }}>{denCz(o.vytvorene)}</b>
                <span style={{ color: C.textMuted }}>{o.pocet} {o.pocet === 1 ? "fotka" : o.pocet < 5 ? "fotky" : "fotiek"}{o.kto ? ` · ${o.kto}` : ""}</span>
                <span style={{ color: o.otvorene ? C.green : C.textDim }}>{o.otvorene ? `otvoril ${denCz(o.otvorene)}` : "zatiaľ neotvoril"}</span>
                {o.suhlas && <span style={{ color: o.suhlas === "ano" ? C.green : C.textMuted }}>{o.suhlas === "ano" ? "súhlasí so zverejnením" : "nesúhlasí so zverejnením"}</span>}
                <span style={{ flexGrow: 1 }} />
                {o.zrusene ? <span style={{ color: C.textDim }}>zrušený</span> : neplati ? <span style={{ color: C.textDim }}>po platnosti</span> : (
                  <>
                    <button type="button" onClick={() => void doSchranky(o.url)} style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>kopírovať</button>
                    <a href={`${o.url.replace(/^https:\/\/prosapiens\.cz/, "")}?nahlad=1`} target="_blank" rel="noreferrer" onClick={(e) => otvorNahlad(e, `${o.url.replace(/^https:\/\/prosapiens\.cz/, "")}?nahlad=1`)} style={{ color: C.accentLight, fontSize: 12 }}>náhľad</a>
                    <button type="button" onClick={() => void zrus(o)} style={{ background: "none", border: "none", padding: 0, color: C.red, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>zrušiť</button>
                  </>
                )}
              </div>
              {odp.map((x) => (
                <div key={x.id} style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: C.bg, borderLeft: `3px solid ${C.accent}`, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 3 }}>klient napísal {denCz(x.kedy)}</div>
                  {x.text}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginTop: 6 }}>{chyba}</div>}
    </div>
  );
}
