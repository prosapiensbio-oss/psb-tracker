import { useCallback, useEffect, useRef, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { OBLASTI, viditelne, type Formular, type Otazka } from "../../lib/psb/anamnezaFormular";
import { C, mix } from "../../lib/psb/theme";

/**
 * ANAMNÉZA NA KARTE KLIENTA.
 *
 * Dve veci naraz: odkaz, ktorý sa pošle klientovi pred úvodným tréningom,
 * a zápis, ktorý Jerry píše pri tréningu.
 *
 * ČO PRIŠLO OD KLIENTA, JE UŽ VYPLNENÉ. Jerry, 30. 9. 2026: „keď klient
 * nejaké veci vyplní pred úvodným, mali by sa automaticky zobraziť
 * v anamnéze, ktorú s ním budem vypĺňať ja." Nestojí to bokom ako citát —
 * je to predvyplnená odpoveď v tej otázke, ktorú by inak písal on sám,
 * a nad ňou vetička, odkiaľ sa vzala.
 *
 * Zdravotné odpovede sú v databáze šifrované; sem prichádzajú rozšifrované
 * z `/api/anamneza`, ktoré ich vydá len prihlásenému.
 */

type Oblast = { oblast: string; sila: number | null };
type Odpovede = Record<string, unknown>;

type Stav = {
  formular: Formular;
  anamneza: {
    stav: string; token: string;
    klientOdpovede: Odpovede; zapisOdpovede: Odpovede;
    suhlasy: Record<string, unknown>;
    klientVyplnilAt: string | null; zapisAt: string | null;
  } | null;
  predvyplnene: {
    hodnoty: Odpovede;
    odkial: Record<string, string>;
    test: { oblasti: string[]; odchylky: string[]; vzorec: string; kedy: string } | null;
  };
  odkaz: string | null;
};

const jeOblasti = (x: unknown): x is Oblast[] =>
  Array.isArray(x) && x.every((o) => o && typeof o === "object" && "oblast" in (o as object));

const denCz = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}` : "");

export function AnamnezaPanel({ meno }: { meno: string }) {
  const [stav, setStav] = useState<Stav | null>(null);
  const [odp, setOdp] = useState<Odpovede>({});
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");
  const [skopirovane, setSkopirovane] = useState(false);
  /**
   * Kým sa políčok nikto nedotkol, draft zrkadlí prichádzajúce dáta.
   * Bez toho by neskoršia odpoveď z fetchu prepísala rozpísaný zápis —
   * tá istá pasca ako pri týždenných poznámkach (29. 8. 2026).
   */
  const dotknute = useRef(false);

  const nacitaj = useCallback(async () => {
    const r = await fetch(`/api/anamneza?klient=${encodeURIComponent(meno)}`, { credentials: "same-origin" })
      .then((x) => x.json())
      .catch(() => null) as (Stav & { ok?: boolean; error?: string }) | null;
    if (!r?.ok) { setChyba(r?.error || "Anamnézu sa nepodarilo načítať."); return; }
    setStav(r);
    if (!dotknute.current) {
      // Predvyplnené prebíja len tam, kde zápis ešte nič nemá — raz
      // prepísanú odpoveď trénera nesmie prepísať nič.
      setOdp({ ...r.predvyplnene.hodnoty, ...(r.anamneza?.zapisOdpovede || {}) });
    }
  }, [meno]);

  useEffect(() => { dotknute.current = false; setStav(null); setOdp({}); setHlaska(""); setChyba(""); void nacitaj(); }, [nacitaj]);

  const zmen = (id: string, v: unknown) => { dotknute.current = true; setOdp((p) => ({ ...p, [id]: v })); };

  const uloz = async () => {
    setBezi(true); setChyba(""); setHlaska("");
    const r = await fetch("/api/anamneza", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "zapis", klient: meno, odpovede: odp }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setBezi(false);
    if (!r?.ok) { setChyba(r?.error || "Zápis sa neuložil."); return; }
    setHlaska("Zapísané.");
    dotknute.current = false;
    await nacitaj();
  };

  const vyrobOdkaz = async () => {
    setBezi(true); setChyba("");
    const r = await fetch("/api/anamneza", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "odkaz", klient: meno }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setBezi(false);
    if (!r?.ok) { setChyba(r?.error || "Odkaz sa nepodarilo vyrobiť."); return; }
    await nacitaj();
  };

  if (chyba && !stav) return <div style={{ fontSize: 12.5, color: C.red, padding: "10px 2px" }}>{chyba}</div>;
  if (!stav) return <div style={{ fontSize: 12.5, color: C.textDim, padding: "10px 2px" }}>Načítavam…</div>;

  const a = stav.anamneza;
  const test = stav.predvyplnene.test;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── odkaz pre klienta ── */}
      <div style={{ padding: "12px 14px", borderRadius: 10, background: mix(C.border, 40), border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.textDim }}>Pred úvodným tréningom</div>
        {!stav.odkaz ? (
          <>
            <div style={{ fontSize: 12.5, color: C.textMuted, margin: "7px 0 9px", lineHeight: 1.55 }}>
              Tri otázky o zdraví, ktoré si klient odklikne sám. Odkaz patrí do úvodnej správy — nad video, nie pod neho.
            </div>
            <button onClick={() => void vyrobOdkaz()} disabled={bezi} style={tlacidlo(C.green)}>
              {bezi ? "…" : "Vyrobiť odkaz pre klienta"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <code style={{
                flex: 1, minWidth: 200, fontSize: 11.5, color: C.text, background: C.bg,
                border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 9px", overflowX: "auto", whiteSpace: "nowrap",
              }}>{stav.odkaz}</code>
              <button
                onClick={() => void doSchranky(stav.odkaz || "").then((ok) => { setSkopirovane(ok); if (!ok) setChyba("Skopíruj to prosím ručne — schránka odmietla."); })}
                style={tlacidlo(C.accent)}
              >{skopirovane ? "skopírované" : "Kopírovať"}</button>
            </div>
            <div style={{ fontSize: 11.5, color: a?.klientVyplnilAt ? C.green : C.textDim, marginTop: 8 }}>
              {a?.klientVyplnilAt
                ? `Klient vyplnil ${denCz(a.klientVyplnilAt)}. Súhlasy má odklepnuté.`
                : "Klient zatiaľ nevyplnil."}
            </div>
          </>
        )}
      </div>

      {/* ── čo ukázal test postury ── */}
      {test && (test.oblasti.length > 0 || test.vzorec) && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: mix(C.accent, 8), borderLeft: `3px solid ${C.accent}` }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.accentLight }}>
            Z testu postury{test.kedy ? ` · ${denCz(test.kedy)}` : ""}
          </div>
          <div style={{ fontSize: 12.5, color: C.text, marginTop: 6, lineHeight: 1.65 }}>
            {test.odchylky.length > 0 && <>Odchýlky: <b>{test.odchylky.join(", ")}</b><br /></>}
            {test.vzorec && <>Vzorec: <b>{test.vzorec}</b></>}
          </div>
        </div>
      )}

      {/* ── zápis z úvodného ── */}
      {stav.formular.zapis.map((s) => {
        const otazky = viditelne(s, odp);
        if (!otazky.length) return null;
        return (
          <div key={s.id}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: C.textDim, textTransform: "uppercase", paddingBottom: 8, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
              {s.nazov}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {otazky.map((o) => (
                <PoleOtazky
                  key={o.id}
                  o={o}
                  hodnota={odp[o.id]}
                  odkial={stav.predvyplnene.odkial[o.id]}
                  test={o.id === "test_postury" ? test : null}
                  onZmen={(v) => zmen(o.id, v)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => void uloz()} disabled={bezi} style={{ ...tlacidlo(C.green), fontWeight: 700, padding: "8px 16px" }}>
          {bezi ? "Ukladám…" : "Uložiť zápis"}
        </button>
        {hlaska && <span style={{ fontSize: 12, color: C.green }}>{hlaska}</span>}
        {chyba && <span style={{ fontSize: 12, color: C.red }}>{chyba}</span>}
        {a?.zapisAt && !hlaska && <span style={{ fontSize: 11.5, color: C.textDim }}>naposledy {denCz(a.zapisAt)}</span>}
      </div>

      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
        Zdravotné odpovede sú v databáze zašifrované — neuvidí ich Jarvis ani kontrolné skripty, len prihlásený tréner tu.
      </div>
    </div>
  );
}

function PoleOtazky({ o, hodnota, odkial, test, onZmen }: {
  o: Otazka;
  hodnota: unknown;
  odkial?: string;
  test: { oblasti: string[]; odchylky: string[]; vzorec: string; kedy: string } | null;
  onZmen: (v: unknown) => void;
}) {
  const vstup = {
    width: "100%", boxSizing: "border-box" as const, padding: "7px 9px", borderRadius: 7, fontSize: 12.5,
    border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit",
  };

  // Otázka len na čítanie — výstup, ktorý appka klientovi sama poslala.
  if (o.typ === "len-citat") {
    if (!test || (!test.odchylky.length && !test.vzorec)) return null;
    return (
      <div style={{ fontSize: 12, color: C.textMuted }}>
        <div style={{ color: C.textDim, marginBottom: 3 }}>{o.text}</div>
        {test.vzorec || test.odchylky.join(", ")}
      </div>
    );
  }

  const popis = (
    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
      {o.text}
      {odkial && (
        <span style={{ fontSize: 10.5, color: C.green, marginLeft: 7, whiteSpace: "nowrap" }}>✓ {odkial}</span>
      )}
    </div>
  );

  if (o.typ === "oblasti") {
    const vybrane: Oblast[] = jeOblasti(hodnota) ? hodnota : [];
    const prepni = (m: string) => {
      const je = vybrane.some((x) => x.oblast === m);
      onZmen(je ? vybrane.filter((x) => x.oblast !== m) : [...vybrane, { oblast: m, sila: null }]);
    };
    const nastavSilu = (m: string, s: number) =>
      onZmen(vybrane.map((x) => (x.oblast === m ? { ...x, sila: s } : x)));
    return (
      <div>
        {popis}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {OBLASTI.map((m) => {
            const je = vybrane.some((x) => x.oblast === m);
            return (
              <button key={m} onClick={() => prepni(m)} style={{
                padding: "3px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${je ? mix(C.accent, 55) : C.border}`,
                background: je ? mix(C.accent, 16) : "transparent",
                color: je ? C.accentLight : C.textMuted, fontWeight: je ? 600 : 400,
              }}>{m}</button>
            );
          })}
        </div>
        {/* Jedna oblasť = jedna stupnica. Tri zaškrtnuté = tri stupnice. */}
        {vybrane.map((x) => (
          <div key={x.oblast} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 4 }}>{x.oblast} — ako silné, keď je to najhoršie?</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} onClick={() => nastavSilu(x.oblast, i)} style={{
                  width: 26, height: 24, borderRadius: 6, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
                  border: `1px solid ${x.sila === i ? mix(C.accent, 55) : C.border}`,
                  background: x.sila === i ? mix(C.accent, 20) : "transparent",
                  color: x.sila === i ? C.accentLight : C.textDim, fontWeight: x.sila === i ? 700 : 400,
                }}>{i}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (o.typ === "viac") {
    const vybrane = Array.isArray(hodnota) ? (hodnota as string[]) : [];
    return (
      <div>
        {popis}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(o.moznosti || []).map((m) => {
            const je = vybrane.includes(m);
            return (
              <button key={m} onClick={() => onZmen(je ? vybrane.filter((x) => x !== m) : [...vybrane, m])} style={{
                padding: "3px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${je ? mix(C.accent, 55) : C.border}`,
                background: je ? mix(C.accent, 16) : "transparent",
                color: je ? C.accentLight : C.textMuted, fontWeight: je ? 600 : 400,
              }}>{m}</button>
            );
          })}
        </div>
      </div>
    );
  }

  if (o.typ === "jedna") {
    return (
      <div>
        {popis}
        <select value={String(hodnota ?? "")} onChange={(e) => onZmen(e.target.value)} style={vstup}>
          <option value="">—</option>
          {(o.moznosti || []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    );
  }

  if (o.typ === "skala") {
    const n = typeof hodnota === "number" ? hodnota : null;
    return (
      <div>
        {popis}
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} onClick={() => onZmen(i)} style={{
              width: 26, height: 24, borderRadius: 6, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${n === i ? mix(C.accent, 55) : C.border}`,
              background: n === i ? mix(C.accent, 20) : "transparent",
              color: n === i ? C.accentLight : C.textDim, fontWeight: n === i ? 700 : 400,
            }}>{i}</button>
          ))}
        </div>
      </div>
    );
  }

  if (o.typ === "dlhy") {
    return (
      <div>
        {popis}
        <textarea value={String(hodnota ?? "")} onChange={(e) => onZmen(e.target.value)} rows={2} style={{ ...vstup, resize: "vertical" }} />
        {o.pomoc && <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 3 }}>{o.pomoc}</div>}
      </div>
    );
  }

  return (
    <div>
      {popis}
      <input
        type={o.typ === "cislo" ? "number" : "text"}
        value={String(hodnota ?? "")}
        onChange={(e) => onZmen(o.typ === "cislo" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        style={{ ...vstup, width: o.typ === "cislo" ? 90 : "100%" }}
      />
    </div>
  );
}

const tlacidlo = (farba: string) => ({
  padding: "6px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${mix(farba, 45)}`, background: mix(farba, 12), color: farba,
});
