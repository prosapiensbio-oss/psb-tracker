import { useCallback, useEffect, useMemo, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { pocuvaj } from "../../lib/psb/obnovaSignal";
import { filtrujPohyby, jeNesparovany, jeZBanky, type DruhPohybov, type PohybFio } from "../../lib/psb/pohybyFio";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

/**
 * POHYBY NA ÚČTE FIO — náhľad v Evidencii (Jerry, 29. 10. 2026).
 *
 * Len číta to, čo Kokpit z banky už má (`GET /api/fio`), a pri príjme povie,
 * komu je priradený. Nič sa tu nepáruje — na to je krok Platby a balíčky;
 * druhé miesto na tú istú prácu by sa s ním skôr či neskôr rozišlo.
 */

const NARAZ = 40;

const DRUHY: { id: DruhPohybov; nazov: string }[] = [
  { id: "vsetko", nazov: "všetko" },
  { id: "prijmy", nazov: "príjmy" },
  { id: "nesparovane", nazov: "nespárované" },
  { id: "vydavky", nazov: "výdavky" },
];

export function PohybyFio() {
  const [pohyby, setPohyby] = useState<PohybFio[] | null>(null);
  const [chyba, setChyba] = useState("");
  const [hladaj, setHladaj] = useState("");
  const [druh, setDruh] = useState<DruhPohybov>("vsetko");
  const [kolko, setKolko] = useState(NARAZ);

  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/fio", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setChyba("Pohyby z Fio sa nenačítali."); return; }
    setChyba("");
    setPohyby(((j.pohyby || []) as Record<string, unknown>[]).map((r) => ({
      datum: String(r.datum || "").slice(0, 10), suma: Number(r.suma) || 0,
      protistrana: String(r.protistrana || ""), poznamka: String(r.poznamka || ""),
      typ: String(r.typ || ""), kategoria: String(r.kategoria || ""), kluc: String(r.kluc || ""),
      klienti: String(r.klienti || ""), nieKlient: !!r.nieKlient,
    })));
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);
  // Spárovanie v inej karte zmení, komu príjem patrí.
  useEffect(() => pocuvaj("peniaze", () => void nacitaj()), [nacitaj]);

  const banka = useMemo(() => (pohyby || []).filter(jeZBanky), [pohyby]);
  const vysledok = useMemo(() => filtrujPohyby(pohyby || [], hladaj, druh), [pohyby, hladaj, druh]);
  const nesparovanych = useMemo(() => banka.filter(jeNesparovany).length, [banka]);
  const posledny = banka[0]?.datum || "";

  return (
    <Card>
      <H3>
        <Info
          label="Pohyby na účte Fio"
          text="Všetko, čo Kokpit stiahol z banky (každú noc samo a tlačidlom v kroku Platby a balíčky). Pri príjme vidno, komu je priradený. Hľadá sa podľa mena, textu správy aj sumy. Párovanie sa robí v kroku Platby a balíčky, tu sa len pozerá."
        />
      </H3>

      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8 }}>{chyba}</div>}
      {!pohyby && !chyba && <div style={{ fontSize: 12.5, color: C.textMuted }}>načítavam…</div>}

      {pohyby && (
        <>
          <div style={{ fontSize: 12, color: C.textMuted, margin: "2px 0 10px" }}>
            {banka.length} pohybov{posledny ? ` · posledný ${fmtDMY(posledny)}` : ""}
            {nesparovanych > 0 && <> · <span style={{ color: C.orange }}>{nesparovanych} príjmov bez klienta</span></>}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <input
              value={hladaj}
              onChange={(e) => { setHladaj(e.target.value); setKolko(NARAZ); }}
              placeholder="meno, text alebo suma…"
              autoComplete="off" autoCorrect="off" spellCheck={false} name="psb-pohyby"
              style={{ padding: "6px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, minWidth: 200, flex: "1 1 200px", fontFamily: "inherit" }}
            />
            {DRUHY.map((d) => (
              <button
                key={d.id} type="button"
                onClick={() => { setDruh(d.id); setKolko(NARAZ); }}
                style={{
                  padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  border: `1px solid ${druh === d.id ? mix(C.accent, 60) : C.border}`,
                  background: druh === d.id ? mix(C.accent, 14) : "transparent",
                  color: druh === d.id ? C.text : C.textMuted,
                }}
              >
                {d.nazov}
              </button>
            ))}
          </div>

          {vysledok.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.textMuted, padding: "6px 0" }}>Nič také na účte nie je.</div>
          ) : (
            <div>
              {vysledok.slice(0, kolko).map((p) => (
                <div key={p.kluc} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", padding: "6px 0", borderTop: `1px solid ${mix(C.border, 60)}`, fontSize: 12.5 }}>
                  <span style={{ color: C.textDim, minWidth: 74 }}>{fmtDMY(p.datum)}</span>
                  <span style={{ fontWeight: 700, minWidth: 86, textAlign: "right", color: p.suma > 0 ? C.green : C.text }}>
                    {p.suma > 0 ? "+" : ""}{fmtCZK(p.suma)}
                  </span>
                  <span style={{ flex: "1 1 220px", color: C.text, minWidth: 0, overflowWrap: "anywhere" }}>
                    {p.protistrana || p.poznamka || "bez textu"}
                    {p.protistrana && p.poznamka && p.poznamka !== p.protistrana && <span style={{ color: C.textDim }}> · {p.poznamka}</span>}
                  </span>
                  <span style={{ fontSize: 12, minWidth: 120, textAlign: "right" }}>
                    {p.suma > 0
                      ? p.klienti
                        ? <span style={{ color: C.green }}>→ {p.klienti}</span>
                        : p.nieKlient
                          ? <span style={{ color: C.textDim }}>nie je klient</span>
                          : <span style={{ color: C.orange }}>bez klienta</span>
                      : <span style={{ color: C.textDim }}>{p.kategoria || "bez kategórie"}</span>}
                  </span>
                </div>
              ))}
              {vysledok.length > kolko && (
                <button
                  type="button"
                  onClick={() => setKolko((k) => k + NARAZ * 2)}
                  style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  ukázať ďalšie ({vysledok.length - kolko})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
