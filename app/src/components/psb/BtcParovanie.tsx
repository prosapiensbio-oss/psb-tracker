import { useMemo, useState } from "react";

import type { BtcNakup } from "../../lib/psb/client";
import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

/**
 * Ručné spárovanie platby bitcoinom s faktúrou.
 *
 * Automatika páruje podľa sumy a pri bitcoine to nikdy nebude spoľahlivé:
 * koruny sa odvodzujú kurzom a platobná brána si berie spread, takže tri
 * a pol percenta rozdielu je bežný stav, nie chyba. Úzka tolerancia nenájde
 * nič, široká spáruje nesprávne — a pri nesprávnom spárovaní chýba náklad
 * na jednom mieste a prebýva na druhom.
 *
 * Preto tu má posledné slovo človek. Faktúra je zdroj pravdy o sume aj
 * o kategóriách; platba len hovorí, že sa zaplatilo. Kto k čomu patrí, vie
 * najlepšie ten, kto to kupoval.
 */
export function BtcParovanie({
  platby,
  faktury,
  parovanie,
  onSparuj,
}: {
  /** Výbery z peňaženky, ku ktorým automatika doklad nenašla. */
  platby: BtcNakup[];
  /** Faktúry, ktoré zatiaľ nemajú platbu. */
  faktury: { cislo: string; datum: string; celkom: number; dodavatel: string }[];
  parovanie: Record<string, string[]>;
  onSparuj: (idVyberu: number, faktury: string[]) => void;
}) {
  const [otvorena, setOtvorena] = useState<number | null>(null);
  const [vyber, setVyber] = useState<string[]>([]);

  const otvor = (p: BtcNakup) => {
    setOtvorena(p.id);
    setVyber(parovanie[String(p.id)] || []);
  };

  const sucet = useMemo(
    () => vyber.reduce((a, c) => a + (faktury.find((f) => f.cislo === c)?.celkom || 0), 0),
    [vyber, faktury],
  );

  const bezDokladu = platby.filter((p) => !(parovanie[String(p.id)] || []).length);
  if (!platby.length) {
    return (
      <Card>
        <H3><Info text="Výbery z bitcoinovej peňaženky, ku ktorým sa nenašla faktúra. Náklad z faktúry sa do P&L dostane len vtedy, keď sa vie, čím sa zaplatilo — a pri bitcoine to automatika podľa sumy nezvládne vždy, lebo kurz sa hýbe a platobná brána si berie spread." label="Platby bitcoinom bez dokladu" /></H3>
        <Empty>Každá platba z peňaženky má svoju faktúru. Niet čo párovať.</Empty>
      </Card>
    );
  }

  return (
    <Card>
      <H3><Info text="Automatika páruje podľa sumy, lenže koruny sa z bitcoinu odvodzujú kurzom a platobná brána si berie spread — tri a pol percenta rozdielu je bežné. Tu rozhodneš ty a tvoje rozhodnutie sa pamätá; automatika sa doň už nemieša. Faktúra zostáva zdrojom pravdy o sume aj kategóriách." label={`Platby bitcoinom — doklady (${bezDokladu.length} bez dokladu)`} /></H3>
      <div style={{ fontSize: 11.5, color: C.textDim, margin: "4px 0 12px", lineHeight: 1.55 }}>
        Kým platba nemá doklad, jej náklad v P&L chýba a zisk za ten mesiac je o toľko vyšší, než bol.
        Ak to bol súkromný nákup, nechaj to tak — do výkazu ani nepatrí.
      </div>

      {platby.map((p) => {
        const zvolene = parovanie[String(p.id)] || [];
        const jeOtvorena = otvorena === p.id;
        // Kandidáti: čo je v okne mesiaca okolo platby. Širšie než automatika,
        // lebo tu vyberá človek a ten nesprávnu dvojicu nespáruje.
        const kandidati = faktury.filter(
          (f) => Math.abs(Date.parse(p.datum) - Date.parse(f.datum)) / 86400000 <= 31,
        );
        return (
          <div key={p.id} style={{ borderTop: `1px solid ${mix(C.border, 55)}`, padding: "10px 2px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600, minWidth: 82 }}>{fmtDMY(p.datum)}</span>
              <span style={{ fontSize: 13.5, color: C.orange, fontWeight: 700, minWidth: 92 }}>{fmtCZK(p.czk || 0)}</span>
              <span style={{ fontSize: 11.5, color: C.textDim, flex: 1, minWidth: 120 }}>{p.poznamka || "bez poznámky"}</span>
              {zvolene.length > 0 && !jeOtvorena && (
                <span style={{ fontSize: 11.5, color: C.green }}>
                  ✓ ručne spárované ({zvolene.length}{zvolene.length === 1 ? " faktúra" : zvolene.length < 5 ? " faktúry" : " faktúr"})
                </span>
              )}
              <button
                onClick={() => (jeOtvorena ? setOtvorena(null) : otvor(p))}
                style={{ background: "none", border: `1px solid ${mix(C.accent, 40)}`, borderRadius: 7, padding: "3px 11px", color: C.accentLight, fontSize: 11.5, cursor: "pointer" }}
              >
                {jeOtvorena ? "Zavrieť" : zvolene.length ? "Upraviť" : "Spárovať"}
              </button>
            </div>

            {jeOtvorena && (
              <div style={{ marginTop: 10, paddingLeft: 2 }}>
                {kandidati.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.textMuted }}>
                    V okolí tohto dátumu nie je žiadna voľná faktúra. Nahraj doklad v hornej časti obrazovky a vráť sa sem.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>
                      Zaškrtni všetky faktúry, ktoré táto platba pokrýva — objednávka sa často rozpadne na viac dokladov.
                    </div>
                    {kandidati.map((f) => {
                      const on = vyber.includes(f.cislo);
                      return (
                        <label
                          key={f.cislo}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 7px", borderRadius: 7, cursor: "pointer", background: on ? mix(C.accent, 9) : "transparent", fontSize: 12 }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setVyber((v) => (on ? v.filter((x) => x !== f.cislo) : [...v, f.cislo]))}
                            style={{ accentColor: C.accent }}
                          />
                          <span style={{ color: C.textMuted, minWidth: 74 }}>{fmtDMY(f.datum)}</span>
                          <span style={{ color: C.text, flex: 1, minWidth: 90 }}>{f.dodavatel || f.cislo}</span>
                          <span style={{ color: C.textDim, fontSize: 11 }}>{f.cislo}</span>
                          <span style={{ color: C.text, fontWeight: 600, minWidth: 82, textAlign: "right" }}>{fmtCZK(f.celkom)}</span>
                        </label>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => { onSparuj(p.id, vyber); setOtvorena(null); }}
                        style={{ padding: "6px 15px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.green, 55)}`, background: mix(C.green, 13), color: C.green }}
                      >
                        Potvrdiť
                      </button>
                      {zvolene.length > 0 && (
                        <button
                          onClick={() => { onSparuj(p.id, []); setOtvorena(null); }}
                          style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}
                        >
                          Zrušiť spárovanie
                        </button>
                      )}
                      {/* Rozdiel sa ukáže, ale nebráni — spread brány je normálny.
                          Číslo je informácia, nie podmienka. */}
                      {vyber.length > 0 && (
                        <span style={{ fontSize: 11.5, color: Math.abs(sucet - (p.czk || 0)) > (p.czk || 0) * 0.08 ? C.orange : C.textDim }}>
                          Faktúry {fmtCZK(sucet)} · platba {fmtCZK(p.czk || 0)} · rozdiel {fmtCZK(Math.abs(sucet - (p.czk || 0)))}
                          {(p.czk || 0) > 0 && ` (${(Math.abs(sucet - (p.czk || 0)) / (p.czk || 1) * 100).toFixed(1)} %)`}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
