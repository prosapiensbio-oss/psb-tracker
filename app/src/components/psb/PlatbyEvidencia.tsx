import { useCallback, useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

/**
 * Platby: banka z výpisu, hotovosť zo zošita.
 *
 * Tretia karta toho istého prechodu — vedľa „Vydrží kalendár sám?"
 * (dochádzka) a „Balíčky — vlastná evidencia" (hodiny). PTminder sa nedá
 * vypnúť, kým sa nerozhodne z celého obrazu.
 *
 * PREČO SA PRIRAĎUJE PO JEDNOM
 *
 * Balíčky sa dali naliať hromadne — v exporte klient stojí. Vo výpise
 * nestojí: je v správe, alebo v mene odosielateľa, alebo nikde
 * („Josef snyrich · Filip Stráňavský" platí niekto iný). Hromadné naliatie
 * by rozdalo peniaze cudzím ľuďom. Appka navrhne, človek potvrdí — a
 * odosielateľ sa zapamätá, takže sa ten istý platiteľ pýta raz.
 */

type Platba = { id: string; klient: string; datum: string; suma_czk: number; sposob: string; fio_id: string | null; poznamka: string | null; zrusene_at: string | null };
type Nepriradena = { fioId: string; datum: string; suma: number; text: string; kandidati: string[] };
type Mesiac = { mesiac: string; kokpit: number; ptminder: number; rozdiel: number; kokpitHotovost: number; kokpitBanka: number };
type Porovnanie = { mesiace: Mesiac[]; kokpit: number; ptminder: number; rozdiel: number; sediacich: number };

const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} Kč`;
const denKratko = (s: string) => `${Number(s.slice(8))}. ${Number(s.slice(5, 7))}.`;
const mesiacKratko = (s: string) => `${Number(s.slice(5, 7))}/${s.slice(0, 4)}`;

async function posli(telo: Record<string, unknown>) {
  const r = await fetch("/api/platby", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  return (await r.json()) as { ok: boolean; error?: string };
}

export function PlatbyEvidencia({ mena }: { mena: string[] }) {
  const [platby, setPlatby] = useState<Platba[] | null>(null);
  const [nepriradene, setNepriradene] = useState<Nepriradena[]>([]);
  const [p, setP] = useState<Porovnanie | null>(null);
  const [poExport, setPoExport] = useState("");
  const [odMesiaca, setOdMesiaca] = useState("");
  const [celkom, setCelkom] = useState(0);
  const [vyber, setVyber] = useState<Record<string, string>>({});
  const [pracujem, setPracujem] = useState("");
  const [chyba, setChyba] = useState("");
  const [pisem, setPisem] = useState(false);
  const [f, setF] = useState({ klient: "", datum: new Date().toISOString().slice(0, 10), suma: "", poznamka: "" });

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/platby", { credentials: "same-origin" });
    const j = (await r.json()) as { ok: boolean; platby?: Platba[]; nepriradene?: Nepriradena[]; porovnanie?: Porovnanie; poExport?: string; odMesiaca?: string; celkomNepriradenych?: number };
    if (j.ok) {
      setPlatby(j.platby || []); setNepriradene(j.nepriradene || []); setP(j.porovnanie || null);
      setPoExport(j.poExport || ""); setOdMesiaca(j.odMesiaca || ""); setCelkom(j.celkomNepriradenych ?? (j.nepriradene || []).length);
    }
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const akcia = async (telo: Record<string, unknown>, znacka: string) => {
    setPracujem(znacka); setChyba("");
    const j = await posli(telo).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return false; }
    await nacitaj();
    return true;
  };

  if (!platby) return null;
  const zive = platby.filter((x) => !x.zrusene_at);
  const hotovost = zive.filter((x) => x.sposob === "hotovost").length;

  return (
    <Card>
      <H3>
        <Info
          text="Kokpit si vedie vlastnú knihu platieb: bankové z výpisu Fio, hotovosť prepísanú zo zošita. Kým sa mesačné súčty rozchádzajú s PTminderom, PTminder je potrebný."
          label={`Platby — vlastná evidencia${celkom ? ` (${celkom} čaká)` : ""}`}
        />
      </H3>

      {p && p.mesiace.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "2px 0 10px", lineHeight: 1.5 }}>
            Súbežný chod sa súdi od {odMesiaca ? mesiacKratko(odMesiaca) : "tohto mesiaca"}, po {poExport ? `${denKratko(poExport)} ${poExport.slice(0, 4)}` : "dnešok"} (pokiaľ siaha export).
            Staršie mesiace v evidencii zostávajú, ale neporovnávajú sa — hotovosť z nich nikto spätne prepisovať nebude, a rozdiel by ukazoval ju, nie chybu.
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              {/* Kým čaká front nepriradených príjmov, rozdiel meria len to,
                  koľko práce zostáva — nie zhodu. Červené číslo, ktoré nič
                  nehovorí, je horšie než žiadne. */}
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: nepriradene.length ? C.textDim : p.rozdiel === 0 ? C.green : C.red }}>
                {nepriradene.length ? "—" : p.rozdiel === 0 ? "0" : kc(p.rozdiel)}
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>
                rozdiel proti PTminderu<br />
                <span style={{ color: C.textDim }}>
                  {nepriradene.length ? `najprv priraď ${celkom} príjmov` : "toto rozhoduje"}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: C.text }}>{kc(p.kokpit)}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>v Kokpite<br /><span style={{ color: C.textDim }}>{zive.length} platieb, z toho {hotovost} hotovosť</span></div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: C.textMuted }}>{kc(p.ptminder)}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>v PTminderi<br /><span style={{ color: C.textDim }}>za tie isté mesiace</span></div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 12 }}>
            <thead>
              <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "4px 6px 4px 0", fontWeight: 600 }}>mesiac</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>banka</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>hotovosť</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>Kokpit</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>PTminder</th>
                <th style={{ padding: "4px 0 4px 6px", fontWeight: 600, textAlign: "right" }}>rozdiel</th>
              </tr>
            </thead>
            <tbody>
              {p.mesiace.map((m) => (
                <tr key={m.mesiac} style={{ borderTop: `1px solid ${mix(C.border, 55)}` }}>
                  <td style={{ padding: "5px 6px 5px 0", color: C.text }}>{mesiacKratko(m.mesiac)}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.textDim }}>{kc(m.kokpitBanka)}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.textDim }}>{kc(m.kokpitHotovost)}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.text, fontWeight: 700 }}>{kc(m.kokpit)}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.textMuted }}>{kc(m.ptminder)}</td>
                  <td style={{ padding: "5px 0 5px 6px", textAlign: "right", fontWeight: 700, color: m.rozdiel === 0 ? C.green : C.red }}>
                    {m.rozdiel === 0 ? "0" : kc(m.rozdiel)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {nepriradene.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, color: C.text, fontWeight: 700, marginTop: 4 }}>
            Príjmy z výpisu, ktoré ešte nemajú klienta ({celkom}{celkom > nepriradene.length ? `, tu prvých ${nepriradene.length}` : ""})
          </div>
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "3px 0 8px", lineHeight: 1.5 }}>
            Appka navrhne podľa priezviska v texte — a platiteľa si zapamätá, takže ten istý sa pýta raz.
            Čo platba klienta nie je (nájom, vrátenie, vlastný prevod), odlož tlačidlom vpravo.
          </div>
          {nepriradene.slice(0, 30).map((n) => {
            const v = vyber[n.fioId] ?? (n.kandidati.length === 1 ? n.kandidati[0] : "");
            return (
              <div key={n.fioId} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: `1px solid ${mix(C.border, 55)}` }}>
                <div style={{ minWidth: 60, fontSize: 12, color: C.textDim }}>{denKratko(n.datum)}</div>
                <div style={{ minWidth: 86, fontSize: 13, fontWeight: 700, color: C.text, textAlign: "right" }}>{kc(n.suma)}</div>
                <div style={{ flex: "1 1 240px", fontSize: 11.5, color: C.textMuted, minWidth: 200 }}>
                  {n.text.slice(0, 90)}
                  {n.kandidati.length > 1 && <span style={{ color: C.orange }}> · {n.kandidati.length} možností</span>}
                </div>
                <input
                  list="platby-klienti"
                  value={v}
                  onChange={(e) => setVyber({ ...vyber, [n.fioId]: e.target.value })}
                  placeholder="komu patrí…"
                  style={{
                    flex: "0 1 190px", minWidth: 165, padding: "7px 9px", borderRadius: 8, fontSize: 12.5,
                    border: `1px solid ${v && !mena.includes(v) ? C.orange : C.border}`, background: C.bg, color: C.text,
                  }}
                />
                <button
                  onClick={() => void akcia({ akcia: "priradz", fioId: n.fioId, klient: v, zapamataj: true }, n.fioId)}
                  disabled={pracujem === n.fioId || v.trim().length < 3}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    cursor: v.trim().length >= 3 ? "pointer" : "not-allowed",
                    border: `1px solid ${mix(C.green, 45)}`,
                    background: v.trim().length >= 3 ? mix(C.green, 12) : "transparent",
                    color: v.trim().length >= 3 ? C.green : C.textDim,
                  }}
                >
                  {pracujem === n.fioId ? "…" : "Priradiť"}
                </button>
                <button
                  onClick={() => void akcia({ akcia: "nieKlient", fioId: n.fioId }, n.fioId)}
                  disabled={pracujem === n.fioId}
                  style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
                >
                  nie je klient
                </button>
              </div>
            );
          })}
          <datalist id="platby-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => setPisem(!pisem)}
          style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.accentLight, 45)}`, background: "transparent", color: C.accentLight }}
        >
          {pisem ? "Zavrieť" : "Zapísať hotovosť zo zošita"}
        </button>
      </div>
      {pisem && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {([
            { k: "klient" as const, l: "klient", w: 180, list: true },
            { k: "datum" as const, l: "dátum", w: 130, list: false },
            { k: "suma" as const, l: "suma Kč", w: 110, list: false },
            { k: "poznamka" as const, l: "poznámka", w: 180, list: false },
          ]).map((x) => (
            <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: C.textDim }}>
              {x.l}
              <input
                value={f[x.k]}
                list={x.list ? "platby-klienti" : undefined}
                onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
                style={{ width: x.w, padding: "7px 9px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
              />
            </label>
          ))}
          <button
            onClick={async () => { if (await akcia({ akcia: "hotovost", ...f }, "hotovost")) { setF({ ...f, klient: "", suma: "", poznamka: "" }); } }}
            disabled={pracujem === "hotovost"}
            style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green }}
          >
            {pracujem === "hotovost" ? "…" : "Uložiť"}
          </button>
        </div>
      )}
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
    </Card>
  );
}
