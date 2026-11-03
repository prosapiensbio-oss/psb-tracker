import { useCallback, useEffect, useState } from "react";

import type { PolozkaBtc } from "../../lib/psb/btcImport.server";
import type { DielPlatby } from "../../lib/psb/btcSledovanie";
import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import { C, mix } from "../../lib/psb/theme";

/** Čo čaká na potvrdenie. Číta sa pri otvorení, po zápise a pri návrate do okna. */
export function useBtcNaPotvrdenie() {
  const [polozky, setPolozky] = useState<PolozkaBtc[]>([]);
  const [chyba, setChyba] = useState("");
  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/btc-sledovanie", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ ok?: boolean; polozky?: PolozkaBtc[]; error?: string }>).catch(() => null);
    if (j?.ok) { setPolozky(j.polozky || []); setChyba(""); }
    else setChyba(j?.error || "BTC kniha sa nenačítala.");
  }, []);
  useEffect(() => {
    let naposledy = Date.now();
    void nacitaj();
    const priNavrate = () => {
      if (document.visibilityState !== "visible" || Date.now() - naposledy < 2 * 60 * 1000) return;
      naposledy = Date.now();
      void nacitaj();
    };
    document.addEventListener("visibilitychange", priNavrate);
    window.addEventListener("focus", priNavrate);
    const zrus = pocuvaj("peniaze", () => void nacitaj());
    return () => {
      document.removeEventListener("visibilitychange", priNavrate);
      window.removeEventListener("focus", priNavrate);
      zrus();
    };
  }, [nacitaj]);
  return { polozky, chyba };
}

/**
 * BITCOINOVÉ PLATBY NA POTVRDENIE, ako platby z banky (Jerry, 3. 11. 2026:
 * „nech to nie je automatické spárovanie, chcem to spraviť ručne"). Kokpit
 * platbu nájde a predvyplní klienta aj dohodnutú sumu z odkazu v SMS;
 * zapíše ju až tlačidlo, a obe polia sa dajú prepísať.
 */
export function BtcPrijmyKarta({ polozky, chyba, mena, onZapisane }: { polozky: PolozkaBtc[]; chyba: string; mena: string[]; onZapisane: () => void }) {
  if (!polozky.length && !chyba) return null;
  return (
    <div style={{ margin: "4px 0 12px", padding: "10px 12px", borderRadius: 10, border: `1px solid ${mix(C.orange, 45)}`, background: mix(C.orange, 6) }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Bitcoinové platby na potvrdenie{polozky.length ? ` (${polozky.length})` : ""}</div>
      {chyba && <div style={{ marginTop: 6, fontSize: 12, color: C.red }}>{chyba}</div>}
      <datalist id="btc-klienti">{[...mena].sort((a, b) => a.localeCompare(b, "sk")).map((m) => <option key={m} value={m} />)}</datalist>
      {polozky.map((p) => <Riadok key={p.kluc} p={p} mena={mena} onZapisane={onZapisane} />)}
    </div>
  );
}

function Riadok({ p, mena, onZapisane }: { p: PolozkaBtc; mena: string[]; onZapisane: () => void }) {
  const [diely, setDiely] = useState<{ klient: string; suma: string }[]>(
    () => (p.diely.length ? p.diely : [{ klient: "", suma: "" }]).map((d) => ({ klient: d.klient, suma: d.suma ? String(d.suma) : p.czk ? String(p.czk) : "" })),
  );
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");
  const vyber = (nove: DielPlatby[]) => setDiely(nove.map((d) => ({ klient: d.klient, suma: String(d.suma) })));
  const uprav = (i: number, zmena: Partial<{ klient: string; suma: string }>) => setDiely((s) => s.map((d, j) => (j === i ? { ...d, ...zmena } : d)));
  const pripravene = diely.every((d) => mena.includes(d.klient.trim()) && Number(d.suma) > 0);

  const zapis = async (telo: Record<string, unknown>) => {
    setPracujem(true);
    setChyba("");
    const j = await fetch("/api/platby", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify(telo),
    }).then((r) => r.json() as Promise<{ ok?: boolean; error?: string }>).catch(() => null);
    setPracujem(false);
    if (!j?.ok) { setChyba(j?.error || "Nepodarilo sa to zapísať, skús to znova."); return; }
    oznam("peniaze");
    onZapisane();
  };
  const tlacidlo = (hlavne: boolean, aktivne = true) => ({
    padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: aktivne ? "pointer" : "default", opacity: aktivne ? 1 : 0.5,
    border: `1px solid ${hlavne ? mix(C.green, 50) : C.border}`, background: hlavne ? mix(C.green, 12) : "transparent", color: hlavne ? C.green : C.textMuted,
  });
  const pole = { padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" as const };

  return (
    <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${mix(C.border, 55)}` }}>
      <div style={{ fontSize: 12.5, color: C.text }}>
        <b>{p.sats.toLocaleString("cs-CZ")} sats</b>
        <span style={{ color: C.textMuted }}> · {fmtDMY(p.datum)}{p.zdroj !== "faktura" && p.czk ? ` · kurzom ${fmtCZK(p.czk)}` : ""}{p.klientKnihy ? ` · v knihe ${p.klientKnihy}` : ""}{p.poznamka ? ` · ${p.poznamka}` : ""}</span>
      </div>
      {p.zdroj === "faktura" && <div style={{ fontSize: 11.5, color: C.green, marginTop: 2 }}>Blink hlási zaplatenú faktúru z odkazu.</div>}
      {p.zOdkazu && <div style={{ fontSize: 11.5, color: C.green, marginTop: 2 }}>Predvyplnená suma je z odkazu v SMS.</div>}
      {!p.zOdkazu && !!p.diely.length && <div style={{ fontSize: 11.5, color: C.orange, marginTop: 2 }}>Suma nesedí na odkaz, predvyplnené je to, čo prišlo. Skontroluj ju.</div>}
      {!!p.navrhy.length && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {p.navrhy.map((n) => (
            <button key={n.klienti.join("|")} onClick={() => vyber(n.diely)} style={tlacidlo(false)}>
              {n.diely.map((d) => `${d.klient} ${fmtCZK(d.suma)}`).join(" + ")}
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        {diely.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <input list="btc-klienti" value={d.klient} placeholder="komu patrí…" aria-label="Klient" onChange={(e) => uprav(i, { klient: e.target.value })} style={{ ...pole, flex: "1 1 170px", minWidth: 0 }} />
            <input value={d.suma} inputMode="numeric" aria-label="Suma v korunách" onChange={(e) => uprav(i, { suma: e.target.value.replace(/[^\d]/g, "") })} style={{ ...pole, width: 90, textAlign: "right" }} />
            {diely.length > 1 && <button onClick={() => setDiely((s) => s.filter((_, j) => j !== i))} aria-label="Odobrať diel" style={tlacidlo(false)}>✕</button>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button disabled={pracujem || !pripravene} onClick={() => void zapis({
          akcia: "btc-potvrd", zdroj: p.zdroj, datum: p.datum, sats: p.sats, czk: p.czk, klientKnihy: p.klientKnihy, idKnihy: p.idKnihy, idFaktury: p.idFaktury,
          diely: diely.map((d) => ({ klient: d.klient.trim(), suma: Number(d.suma) })),
        })} style={tlacidlo(true, !pracujem && pripravene)}>
          {pracujem ? "…" : "Priradiť"}
        </button>
        <button onClick={() => setDiely((s) => [...s, { klient: "", suma: "" }])} style={tlacidlo(false)}>+ ďalší klient</button>
        <button disabled={pracujem} onClick={() => void zapis({ akcia: "btc-skry", kluc: p.kluc })} title="Napríklad duplicitný riadok. V knihe ostane, ako je." style={tlacidlo(false)}>Nie je platba klienta</button>
      </div>
      {chyba && <div style={{ marginTop: 6, fontSize: 12, color: C.red }}>{chyba}</div>}
    </div>
  );
}
