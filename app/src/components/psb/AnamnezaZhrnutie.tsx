import { useCallback, useEffect, useState } from "react";

import { stavAnamnezy, zhrnutieAnamnezy, type RiadokZhrnutia } from "../../lib/psb/anamnezaZhrnutie";
import { C, mix } from "../../lib/psb/theme";

/**
 * ZHRNUTIE ANAMNÉZY NA KARTE KLIENTA.
 *
 * Jerry, 30. 9. 2026: „v profile klienta bude len nejaké zhrnutie anamnézy
 * s možnosťou kliku priamo do nej." Celá anamnéza žije vo vlastnej karte
 * v kope; tu je len to, čo musí byť vidieť bez otvárania — čo človeka
 * privádza, kde ho to bolí a červené vlajky.
 *
 * Zdravotné odpovede prichádzajú rozšifrované z `/api/anamneza`, ktoré ich
 * vydá len prihlásenému.
 */
export function AnamnezaZhrnutie({ meno, onOtvor }: {
  meno: string;
  /** Preklik do karty Anamnézy v kope — otvorí ju na tomto klientovi. */
  onOtvor: (meno: string) => void;
}) {
  const [riadky, setRiadky] = useState<RiadokZhrnutia[] | null>(null);
  const [stav, setStav] = useState<{ text: string; tón: "caka" | "ide" | "hotovo" } | null>(null);
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(async () => {
    const r = await fetch(`/api/anamneza?klient=${encodeURIComponent(meno)}`, { credentials: "same-origin" })
      .then((x) => x.json()).catch(() => null) as {
        ok?: boolean; error?: string;
        anamneza: { klientOdpovede: Record<string, unknown>; zapisOdpovede: Record<string, unknown>; klientVyplnilAt: string | null; zapisAt: string | null } | null;
      } | null;
    if (!r?.ok) { setChyba(r?.error || "Anamnézu sa nepodarilo načítať."); return; }
    const a = r.anamneza;
    setRiadky(a ? zhrnutieAnamnezy(a.klientOdpovede || {}, a.zapisOdpovede || {}) : []);
    setStav(stavAnamnezy({ existuje: !!a, klientVyplnilAt: a?.klientVyplnilAt || null, zapisAt: a?.zapisAt || null }));
  }, [meno]);

  useEffect(() => { setRiadky(null); setStav(null); setChyba(""); void nacitaj(); }, [nacitaj]);

  if (chyba) return <div style={{ fontSize: 12.5, color: C.red, padding: "10px 2px" }}>{chyba}</div>;
  if (!riadky || !stav) return <div style={{ fontSize: 12.5, color: C.textDim, padding: "10px 2px" }}>Načítavam…</div>;

  const farbaStavu = stav.tón === "hotovo" ? C.green : stav.tón === "ide" ? C.accentLight : C.textMuted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: farbaStavu }}>{stav.text}</span>
        <div style={{ flexGrow: 1 }} />
        <button
          onClick={() => onOtvor(meno)}
          style={{
            padding: "5px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 12), color: C.accentLight,
          }}
        >{riadky.length ? "Otvoriť anamnézu" : "Založiť anamnézu"}</button>
      </div>

      {riadky.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.6 }}>
          Zatiaľ v nej nič nie je. Otvor ju v karte Anamnézy — pošleš odkaz klientovi pred úvodným tréningom
          a zápis z tréningu napíšeš tam.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {riadky.map((r) => (
            <div key={r.popis} style={{
              display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
              padding: r.vlajka ? "7px 10px" : "0", borderRadius: 8,
              background: r.vlajka ? mix(C.orange, 10) : "transparent",
              borderLeft: r.vlajka ? `2px solid ${mix(C.orange, 60)}` : "none",
            }}>
              <span style={{ fontSize: 11, color: r.vlajka ? C.orange : C.textDim, minWidth: 108, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {r.popis}
              </span>
              <span style={{ flex: 1, minWidth: 160, fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{r.hodnota}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
