import { useCallback, useEffect, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { jeFioCerstve, vetaFio, type StavFio } from "../../lib/psb/fioStav";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import { C, mix } from "../../lib/psb/theme";

/**
 * STIAHNUTIE Z FIO — jedna komponenta pre krok 3 aj Kontrolu peňazí.
 *
 * Banka sa sťahuje sama každú noc; tlačidlo je na „klient práve zaplatil".
 * Preto je po čerstvom behu len veta s časom a tichý odkaz, a výrazné
 * tlačidlo sa ukáže, až keď je stav starý alebo nočný beh zlyhal.
 *
 * Akcia je `auto` — tá istá ako v noci: 35 dní, zapíše len nové pohyby,
 * nepotvrdené, kategória z pravidiel, pravidlá sa neučia. Banka pustí jedno
 * volanie za 30 s; jej odmietnutie ostane stáť ako veta (nezmizne).
 */
type Vysledok = { ok?: boolean; chyba?: string; error?: string; vydavky?: number; prijmy?: number; novePrijmy?: { datum: string; suma: number; kto: string }[] };

const pocetSlov = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n > 1 && n < 5 ? b : c);

export function FioStiahnutie({ onZapisane }: {
  /** Po stiahnutí, v ktorom pribudlo niečo nové. */
  onZapisane?: () => void;
}) {
  const [stav, setStav] = useState<StavFio | null>(null);
  const [chybaStavu, setChybaStavu] = useState(false);
  const [bezi, setBezi] = useState(false);
  const [vysledok, setVysledok] = useState<Vysledok | null>(null);
  const [chyba, setChyba] = useState("");

  const nacitajStav = useCallback(async () => {
    const j = await fetch("/api/fio?nahrate=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).catch(() => null) as (StavFio & { ok?: boolean }) | null;
    if (!j?.ok) { setChybaStavu(true); return; }
    setChybaStavu(false);
    setStav(j);
  }, []);
  useEffect(() => { void nacitajStav(); }, [nacitajStav]);
  // Stiahnutie z druhej obrazovky (karty Workspace ostávajú načítané).
  useEffect(() => pocuvaj("peniaze", () => { void nacitajStav(); }), [nacitajStav]);

  const stiahni = async () => {
    if (bezi) return;
    setBezi(true); setChyba(""); setVysledok(null);
    let r: Vysledok;
    try {
      const res = await fetch("/api/fio", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "auto" }),
      });
      const text = await res.text();
      try { r = JSON.parse(text) as Vysledok; }
      catch { r = { ok: false, chyba: `Server odpovedal ${res.status}: ${text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}` }; }
    } catch (e) {
      r = { ok: false, chyba: `Nepodarilo sa spojiť so serverom: ${e instanceof Error ? e.message : String(e)}` };
    }
    setBezi(false);
    if (!r.ok) { setChyba(`Fio sa nestiahlo — ${r.chyba || r.error || "neznáma chyba"}`); return; }
    setVysledok(r);
    await nacitajStav();
    if ((r.vydavky || 0) + (r.prijmy || 0) > 0) { onZapisane?.(); oznam("peniaze"); }
  };

  const cerstve = !!stav && jeFioCerstve(stav);
  const v = vysledok?.vydavky || 0, p = vysledok?.prijmy || 0;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {stav && <span style={{ fontSize: 12, color: cerstve ? C.textMuted : C.orange }}>{vetaFio(stav)}</span>}
        {chybaStavu && <span style={{ fontSize: 12, color: C.orange }}>Čas posledného stiahnutia sa nenačítal.</span>}
        {cerstve ? (
          <button onClick={(e) => { e.stopPropagation(); void stiahni(); }} disabled={bezi}
            title="Stiahne pohyby za posledných 35 dní — to isté, čo Kokpit robí každú noc. Na klienta, ktorý práve zaplatil."
            style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: bezi ? "default" : "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
            {bezi ? "sťahujem…" : "stiahnuť teraz"}
          </button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); void stiahni(); }} disabled={bezi}
            title="Stiahne pohyby za posledných 35 dní — to isté, čo Kokpit robí každú noc"
            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: bezi ? "default" : "pointer", fontFamily: "inherit", border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 12), color: C.accentLight, fontWeight: 600, opacity: bezi ? 0.5 : 1 }}>
            {bezi ? "sťahujem…" : "↻ Stiahnuť z Fio"}
          </button>
        )}
      </div>
      {chyba && <div style={{ fontSize: 12, color: C.red }}>{chyba}</div>}
      {vysledok && (
        <div style={{ fontSize: 12, color: C.green }}>
          {v || p
            ? `Stiahnuté: ${v} ${pocetSlov(v, "nový výdavok", "nové výdavky", "nových výdavkov")}, ${p} ${pocetSlov(p, "príjem", "príjmy", "príjmov")}.`
            : "Stiahnuté — nič nové, všetko už je v Kokpite."}
        </div>
      )}
      {!!vysledok?.novePrijmy?.length && (
        <div style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: mix(C.card, 70) }}>
          {vysledok.novePrijmy.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, padding: "2px 0" }}>
              <span style={{ color: C.textDim, minWidth: 70 }}>{fmtDMY(r.datum)}</span>
              <span style={{ fontWeight: 700, minWidth: 80, textAlign: "right" }}>{fmtCZK(r.suma)}</span>
              <span style={{ color: C.textMuted }}>{r.kto || "bez textu"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
