import { useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { jeNehmotny, popisNehmotnych, rozdelDoklad } from "../../lib/psb/fakturaRiadky";
import { rychleVolby } from "../../lib/psb/kategorieRychle";
import { C, mix } from "../../lib/psb/theme";
import { VyberKategorie } from "./VyberKategorie";

/**
 * FAKTÚRY AKO ÚČTENKA — návrh A, zatiaľ len v bete (Jerry, 10. 10. 2026).
 *
 * Za september mal doklad 42 riadkov. Devätnásť z nich bol tovar; zvyšných
 * dvadsaťtri bola doprava a zľavy, ktoré dokopy stáli −338 Kč. Triedenie
 * dvadsiatich troch riadkov, čo spolu nerobia ani polovicu ceny jedného noža.
 *
 * Účtenka nechá na obrazovke tovar a šum zbalí pod jeden riadok, ktorý povie,
 * koľko ten šum spolu robí. Rozbaliť sa dá; zmazať tiež — Jerry: „to by som
 * mal rád možnosť vykrížikovať."
 *
 * Mazanie nie je všade rovnako lacné a obrazovka to musí vedieť:
 *   • doprava a zľava na dopravné sa vynulujú → × zmaže hneď,
 *   • TOVAR a ZĽAVA K POLOŽKE sú peniaze → pýta sa.
 * Pozor: beta píše do ostrej databázy, takže zmazané je naozaj zmazané
 * (dohľadať sa dá v audite, action `faktura-polozka-zmazana`).
 */
export type PolozkaDokladu = { id: string; nazov: string; cena: number; kategoria: string };
export type DokladUctenky = {
  cislo: string;
  datum: string;
  dodavatel: string;
  celkom: number;
  polozky: PolozkaDokladu[];
  sparovana: boolean;
  platba?: { platba: { datum: string; czk: number }; isto: boolean } | null;
  /** Kedy ho Jerry označil za vybavený — potom sa v uzávierke nekreslí. */
  potvrdene?: string | null;
};

export function FakturyUctenka({
  doklady, uklada, onKategoria, onZmaz, onPotvrd,
}: {
  doklady: DokladUctenky[];
  /** id položky, ktorá sa práve ukladá — tlačidlá sa na ten čas zamknú. */
  uklada: string;
  onKategoria: (p: PolozkaDokladu, kategoria: string) => void;
  onZmaz: (ids: string[]) => void;
  /** Doklad je vybavený (alebo sa vracia späť do práce). */
  onPotvrd: (cislo: string, potvrdit: boolean) => void;
}) {
  const [rozbalene, setRozbalene] = useState<Set<string>>(new Set());
  const volby = rychleVolby();
  /**
   * VYBAVENÉ DOKLADY SA NEKRESLIA (Jerry, 10. 10. 2026: „tým, že to potvrdím,
   * sa to zapíše a schová, aby som mal uzávierku pekne čistú — podobne ako
   * zápisy z účtu").
   *
   * Zoznam sa nezahadzuje: zbalí sa do jedného riadku s počtom. Prázdna
   * obrazovka po vybavení tvrdí, že práca neexistuje — to isté pravidlo ako
   * pri odporúčaniach a pri registri.
   */
  const [vybaveneOtvorene, setVybaveneOtvorene] = useState(false);
  const zive = doklady.filter((d) => !d.potvrdene);
  const vybavene = doklady.filter((d) => d.potvrdene);
  const prepni = (cislo: string) =>
    setRozbalene((p) => {
      const n = new Set(p);
      if (n.has(cislo)) n.delete(cislo); else n.add(cislo);
      return n;
    });

  const krizik = (p: PolozkaDokladu) => (
    <button
      aria-label={`Zmazať ${p.nazov}`}
      disabled={uklada === p.id}
      onClick={() => {
        // Šum sa maže hneď; o peniaze sa pýtame.
        if (jeNehmotny(p.nazov) || confirm(`Zmazať „${p.nazov}" za ${fmtCZK(p.cena)}?`)) onZmaz([p.id]);
      }}
      style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "2px 4px", fontFamily: "inherit" }}
    >
      ×
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {zive.map((d) => {
        const r = rozdelDoklad(d.polozky);
        const otvorene = rozbalene.has(d.cislo);
        return (
          <div key={d.cislo} style={{ border: `1px solid ${mix(C.border, 70)}`, borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{fmtDMY(d.datum)} · {d.dodavatel || "faktúra"}</span>
              <span style={{ fontSize: 11, color: C.textDim }}>{d.cislo}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{fmtCZK(d.celkom)}</span>
              <span style={{ fontSize: 11, color: d.sparovana ? C.green : d.platba ? C.orange : C.textDim, marginLeft: "auto" }}>
                {d.platba
                  ? `${d.sparovana ? "✓ spárovaná" : "₿ zrejme"} · platba ${fmtDMY(d.platba.platba.datum)} ${fmtCZK(Math.round(d.platba.platba.czk))}${d.platba.isto ? "" : " (viac platieb sedí)"}`
                  : d.sparovana ? "✓ spárovaná s platbou bitcoinom" : "bez platby bitcoinom — z účtu alebo kartou"}
              </span>
              <button onClick={() => onPotvrd(d.cislo, true)} disabled={!!uklada}
                style={{ padding: "3px 11px", borderRadius: 12, fontSize: 11, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.green}`, background: "transparent", color: C.green }}>
                Potvrdiť
              </button>
            </div>

            {r.tovar.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0", borderTop: `1px solid ${mix(C.border, 45)}` }}>
                <span style={{ fontSize: 12, color: C.text, flex: "1 1 220px", minWidth: 0 }}>{p.nazov}</span>
                <span style={{ fontSize: 12, color: C.text, minWidth: 74, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCZK(p.cena)}</span>
                {volby.map((x) => (
                  <button key={x.kat} disabled={uklada === p.id} onClick={() => onKategoria(p, x.kat)}
                    style={{ padding: "3px 9px", borderRadius: 12, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                      border: `1px solid ${p.kategoria === x.kat ? C.accent : C.border}`, background: p.kategoria === x.kat ? C.accentBg : "transparent",
                      color: p.kategoria === x.kat ? C.accentLight : C.textMuted }}>
                    {x.text}
                  </button>
                ))}
                <VyberKategorie hodnota={p.kategoria} sirka={200} onZmena={(k) => onKategoria(p, k)} />
                {krizik(p)}
              </div>
            ))}

            {r.nehmotne.length > 0 && (
              <div style={{ borderTop: `1px solid ${mix(C.border, 45)}`, paddingTop: 4, marginTop: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => prepni(d.cislo)}
                    style={{ border: "none", background: "transparent", color: C.textDim, fontSize: 11.5, cursor: "pointer", padding: "2px 0", fontFamily: "inherit", textAlign: "left", flex: 1 }}>
                    {otvorene ? "▾" : "▸"} {popisNehmotnych(r)}
                    {r.maZlavuKPolozke && <span style={{ color: C.orange }}> · je v tom zľava k tovaru</span>}
                  </button>
                  <button
                    disabled={!!uklada}
                    onClick={() => {
                      const veta = r.maZlavuKPolozke
                        ? `Medzi nimi je zľava k tovaru — zmazaním bude nákup o ${fmtCZK(Math.abs(r.nehmotneSuma))} drahší. Zmazať ${r.nehmotne.length} riadkov?`
                        : `Zmazať ${r.nehmotne.length} riadkov dopravy a zliav (${fmtCZK(r.nehmotneSuma)})?`;
                      if (confirm(veta)) onZmaz(r.nehmotne.map((p) => p.id));
                    }}
                    style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, borderRadius: 10, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                    zmazať
                  </button>
                </div>
                {otvorene && r.nehmotne.map((p) => (
                  <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0 3px 14px", fontSize: 11.5, color: C.textDim }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{p.nazov}</span>
                    <span style={{ minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCZK(p.cena)}</span>
                    {krizik(p)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {vybavene.length > 0 && (
        <div style={{ borderTop: `1px solid ${mix(C.border, 45)}`, paddingTop: 8 }}>
          <button onClick={() => setVybaveneOtvorene((x) => !x)}
            style={{ border: "none", background: "transparent", color: C.textDim, fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            {vybaveneOtvorene ? "▾" : "▸"} vybavené · {vybavene.length} {vybavene.length === 1 ? "doklad" : vybavene.length < 5 ? "doklady" : "dokladov"} · {fmtCZK(vybavene.reduce((a, d) => a + d.celkom, 0))}
          </button>
          {vybaveneOtvorene && vybavene.map((d) => (
            <div key={d.cislo} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0 3px 14px", fontSize: 11.5, color: C.textDim }}>
              <span style={{ flex: 1, minWidth: 0 }}>{fmtDMY(d.datum)} · {d.dodavatel || "faktúra"} · {d.cislo}</span>
              <span style={{ minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCZK(d.celkom)}</span>
              <button onClick={() => onPotvrd(d.cislo, false)} disabled={!!uklada}
                style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, borderRadius: 10, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}>
                vrátiť
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
