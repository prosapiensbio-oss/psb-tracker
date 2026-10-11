import { useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import {
  suhrnZdravia, zdravieKokpitu,
  type BehAutomatu, type SekciaZdravia, type StavZdravia,
} from "../../lib/psb/zdravieKokpitu";

/**
 * KARTA „ZDRAVIE KOKPITU" — kontrola appky, nie dát.
 *
 * Jerry, 10. 10. 2026: „kontrolu si predstavujem ako kontrolu appky celkovo —
 * či všetko funguje, či je všetko správne prepojené." Mesačné kontroly
 * overujú DÁTA a väčšinu z toho dnes robí register priebežne; toto je to
 * druhé a dovtedy to v appke nebolo vôbec.
 */
export function ZdravieKokpitu({ rozpory }: {
  /** Porovnania dvoch zdrojov, ktoré appka už počíta inde. */
  rozpory: { nazov: string; pocet: number | null; detail?: string }[];
}) {
  const [behy, setBehy] = useState<BehAutomatu[] | null>(null);
  const [chyby, setChyby] = useState<{ kedy: string; sprava: string }[]>([]);
  const [otvorene, setOtvorene] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetch("/api/automat-beh", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { behy?: BehAutomatu[]; chybyPrehliadaca?: { kedy: string; sprava: string }[] }) => {
        setBehy(j.behy || []);
        setChyby(j.chybyPrehliadaca || []);
      })
      .catch(() => setBehy([]));
  }, []);

  if (behy === null) return <div style={{ fontSize: 12, color: C.textDim }}>pozerám sa, čo appke beží…</div>;

  const sekcie = zdravieKokpitu({ teraz: new Date().toISOString(), behy, chybyPrehliadaca: chyby, rozpory });
  const suhrn = suhrnZdravia(sekcie);
  const farba = (s: StavZdravia) => (s === "pozor" ? C.orange : s === "nevie" ? C.textDim : C.green);
  const znak = (s: StavZdravia) => (s === "pozor" ? "!" : s === "nevie" ? "?" : "✓");
  const prepni = (n: string) =>
    setOtvorene((p) => { const x = new Set(p); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12.5, color: farba(suhrn.stav) }}>
        {znak(suhrn.stav)} Zdravie Kokpitu — {suhrn.veta}
      </div>
      {sekcie.map((s: SekciaZdravia) => {
        // Sekcia, v ktorej je všetko v poriadku, sa zbalí do jedného riadku.
        // Zoznam dvanástich zelených fajok sa po druhom mesiaci prestane čítať.
        const otv = otvorene.has(s.nadpis) || s.stav !== "ok";
        return (
          <div key={s.nadpis} style={{ border: `1px solid ${mix(C.border, 70)}`, borderRadius: 10, padding: "7px 10px" }}>
            <button onClick={() => prepni(s.nadpis)}
              style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left" }}>
              <span style={{ color: farba(s.stav), fontSize: 12 }}>{otv ? "▾" : "▸"} {znak(s.stav)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, flex: 1 }}>{s.nadpis}</span>
              <span style={{ fontSize: 11, color: C.textDim }}>
                {s.riadky.filter((r) => r.stav === "ok").length} z {s.riadky.length} v poriadku
              </span>
            </button>
            {otv && (
              <div style={{ display: "grid", gap: 1, marginTop: 5 }}>
                {s.riadky.map((r) => (
                  <div key={r.nazov} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 10, color: farba(r.stav) }}>{znak(r.stav)}</span>
                    <span style={{ flex: "1 1 180px", minWidth: 0, color: r.stav === "ok" ? C.textMuted : C.text }}>{r.nazov}</span>
                    <span style={{ color: farba(r.stav) }}>{r.hodnota}</span>
                    {r.detail && <span style={{ flexBasis: "100%", color: C.textDim, paddingLeft: 18 }}>{r.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
