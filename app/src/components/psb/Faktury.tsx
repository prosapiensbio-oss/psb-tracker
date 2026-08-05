import { useMemo, useState } from "react";

import { fmtCZK } from "../../lib/psb/format";
import { sediSucet, type Faktura } from "../../lib/psb/faktura";
import { C, mix, S } from "../../lib/psb/theme";
import { kategorieZoznam } from "./Banka";
import { Card, H3, Info, TableWrap } from "./ui";

// Rozpis faktúr — náhľad pred zápisom, rovnako ako pri banke.
//
// Na jednom doklade z Alzy býva granule pre psa, prostěradlo domov a niečo do
// štúdia. V banke z toho vidno jedinú sumu, takže sa celá zaradila do jedného
// koša a niekomu sa pripísalo, čo mu nepatrí.
//
// Editovať sa dá VŠETKO — názov aj suma, nielen kategória. Parser číta z PDF
// dobre, ale nie neomylne, a čo sa dá prečítať zle, sa raz zle prečíta. Kto
// vidí chybu a nemôže ju opraviť, prestane nástroju veriť.

export function FakturyNahlad({
  faktury, onZmena, onHotovo,
}: {
  faktury: Faktura[];
  onZmena: (i: number, f: Faktura) => void;
  onHotovo: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [vysledok, setVysledok] = useState("");
  const KAT = useMemo(kategorieZoznam, []);

  const spolu = faktury.reduce((a, f) => a + f.polozky.reduce((x, p) => x + p.cena, 0), 0);
  const nezaradene = faktury.reduce((a, f) => a + f.polozky.filter((p) => !p.kategoria).length, 0);
  const polozekSpolu = faktury.reduce((a, f) => a + f.polozky.length, 0);

  const uprav = (fi: number, pi: number, zmena: Partial<Faktura["polozky"][0]>) => {
    const f = faktury[fi];
    onZmena(fi, { ...f, polozky: f.polozky.map((p, i) => (i === pi ? { ...p, ...zmena } : p)) });
  };
  const zmazPolozku = (fi: number, pi: number) => {
    const f = faktury[fi];
    onZmena(fi, { ...f, polozky: f.polozky.filter((_, i) => i !== pi) });
  };
  const pridajPolozku = (fi: number) => {
    const f = faktury[fi];
    onZmena(fi, { ...f, polozky: [...f.polozky, { kod: "", nazov: "", ks: 1, cena: 0, kategoria: "" }] });
  };

  const zapis = async () => {
    setBusy(true);
    const riadky = faktury.flatMap((f) =>
      f.polozky.filter((p) => p.nazov.trim() && p.cena).map((p) => ({
        faktura: f.cislo, dodavatel: f.dodavatel, datum: f.datum,
        nazov: p.nazov, kod: p.kod, ks: p.ks, cena: p.cena, kategoria: p.kategoria,
      })),
    );
    const r = await fetch("/api/faktury", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ polozky: riadky }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) { setVysledok(`Zapísané: ${r.pridane} položiek, naučených pravidiel ${r.pravidla}.`); onHotovo(); }
    else setVysledok("Zápis sa nepodaril.");
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <H3>
          <Info
            label={`Faktúry — ${faktury.length} ${faktury.length === 1 ? "doklad" : "doklady"}, ${polozekSpolu} položiek`}
            text="Rozpis dokladu na jednotlivé veci, aby sa dala každá zaradiť zvlášť. Opraviť sa dá názov aj suma — parser číta dobre, ale nie neomylne. Čo zaradíš, appka si zapamätá podľa prvých troch slov názvu, takže ďalšie granule sa zaradia samy."
          />
        </H3>
        <button onClick={() => void zapis()} disabled={busy || !polozekSpolu}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: polozekSpolu ? C.accent : C.border, color: C.onAccent, fontSize: 12.5, fontWeight: 600, cursor: polozekSpolu ? "pointer" : "default" }}>
          Zapísať {polozekSpolu} položiek
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 12 }}>
        Spolu <b style={{ color: C.orange }}>{fmtCZK(spolu)}</b>
        {nezaradene > 0 && <> · <b style={{ color: C.orange }}>{nezaradene} nezaradených</b></>}
      </div>
      {vysledok && <div style={{ marginBottom: 10, padding: "9px 12px", borderRadius: 8, background: mix(C.green, 12), color: C.text, fontSize: 12.5 }}>{vysledok}</div>}

      {faktury.map((f, fi) => {
        const sucet = f.polozky.reduce((a, p) => a + p.cena, 0);
        const sedi = sediSucet(f);
        return (
          <div key={`${f.cislo}-${fi}`} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.dodavatel || "Faktúra"} · {f.cislo || "bez čísla"}</span>
              <span style={{ fontSize: 12, color: C.textDim }}>{f.datum}</span>
              {/* Kontrola proti dokladu. Keď sa súčet položiek nezhoduje s tým,
                  čo je na faktúre napísané, niečo sa prečítalo zle — a je lepšie
                  to povedať teraz než hľadať chýbajúcu stovku v P&L. */}
              <span style={{ fontSize: 11.5, color: sedi ? C.green : C.red }}>
                {sedi
                  ? `✓ ${fmtCZK(sucet)} sedí s dokladom`
                  : `✗ položky ${fmtCZK(sucet)}, doklad ${fmtCZK(f.celkom)} — chýba ${fmtCZK(f.celkom - sucet)}`}
              </span>
            </div>
            <TableWrap>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                    {["Položka", "Ks", "Cena", "Kategória", ""].map((h) => (
                      <th key={h} style={{ ...S.th, textAlign: h === "Cena" || h === "Ks" ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.polozky.map((p, pi) => (
                    <tr key={pi}>
                      <td style={{ ...S.td, padding: "3px 6px" }}>
                        <input
                          value={p.nazov}
                          onChange={(e) => uprav(fi, pi, { nazov: e.target.value })}
                          placeholder="Názov položky"
                          style={{ width: "100%", minWidth: 220, background: C.bg, border: `1px solid ${p.nazov ? C.border : mix(C.orange, 40)}`, borderRadius: 5, color: C.text, fontSize: 12, padding: "4px 6px" }}
                        />
                      </td>
                      <td style={{ ...S.td, padding: "3px 6px", textAlign: "right" }}>
                        <input type="number" value={p.ks}
                          onChange={(e) => uprav(fi, pi, { ks: Number(e.target.value) || 1 })}
                          style={{ width: 46, textAlign: "right", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 12, padding: "4px 5px" }} />
                      </td>
                      <td style={{ ...S.td, padding: "3px 6px", textAlign: "right" }}>
                        <input type="number" step="0.01" value={p.cena}
                          onChange={(e) => uprav(fi, pi, { cena: Number(e.target.value) || 0 })}
                          style={{ width: 88, textAlign: "right", background: C.bg, border: `1px solid ${p.cena ? C.border : mix(C.orange, 40)}`, borderRadius: 5, color: C.text, fontSize: 12, padding: "4px 5px", fontVariantNumeric: "tabular-nums" }} />
                      </td>
                      <td style={{ ...S.td, padding: "3px 6px" }}>
                        <select
                          value={p.kategoria}
                          onChange={(e) => uprav(fi, pi, { kategoria: e.target.value })}
                          style={{ background: p.kategoria ? C.cardHover : mix(C.orange, 12), color: C.text, border: `1px solid ${p.kategoria ? C.border : mix(C.orange, 40)}`, borderRadius: 6, fontSize: 11.5, padding: "3px 5px", maxWidth: 250, cursor: "pointer" }}
                        >
                          {[...new Set(KAT.map((k) => k.skupina))].map((sk) =>
                            sk === ""
                              ? KAT.filter((k) => k.skupina === "").map((k) => <option key={k.value} value={k.value}>{k.label}</option>)
                              : (
                                <optgroup key={sk} label={sk}>
                                  {KAT.filter((k) => k.skupina === sk).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                                </optgroup>
                              ))}
                        </select>
                      </td>
                      <td style={{ ...S.td, padding: "3px 4px" }}>
                        <button onClick={() => zmazPolozku(fi, pi)} title="Zmazať položku"
                          style={{ background: "none", border: "none", color: C.textDim, fontSize: 14, cursor: "pointer" }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <button onClick={() => pridajPolozku(fi)}
              style={{ marginTop: 6, background: "none", border: `1px dashed ${mix(C.accent, 40)}`, borderRadius: 7, color: C.accentLight, fontSize: 11.5, padding: "4px 11px", cursor: "pointer" }}>
              + položka
            </button>
          </div>
        );
      })}
    </Card>
  );
}
