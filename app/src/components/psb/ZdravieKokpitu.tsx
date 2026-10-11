import { useEffect, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { promptSKontextom } from "../../lib/psb/kontrolnePrompty";
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
/**
 * Štyri oblasti, ktoré sa dajú dať Claudovi na kontrolu. Jerry, 11. 10. 2026:
 * „to, čo by mi malo vypľuť prompty pre teba, aby si prekontroloval program —
 * peniaze, grafy, marketing, či všetko funguje… chcel by som to zjednotiť na
 * tomto mieste."
 *
 * Prompty existovali už predtým, ale viseli na štyroch notifikáciách
 * v registri a tie sú zrušené. Tu sú na jednom mieste a nesú kontext: mesiac,
 * čo appka sama našla a čo sa našlo minule.
 */
const OBLASTI: { id: string; nazov: string }[] = [
  { id: "peniaze", nazov: "Peniaze" },
  { id: "klienti", nazov: "Klienti a register" },
  { id: "marketing", nazov: "Marketing a web" },
  { id: "jarvis", nazov: "Jarvis a dáta" },
];

export function ZdravieKokpitu({ rozpory, mesiac }: {
  /** Porovnania dvoch zdrojov, ktoré appka už počíta inde. */
  rozpory: { nazov: string; pocet: number | null; detail?: string }[];
  /** Mesiac, ktorý sa uzatvára — ide do promptu. */
  mesiac: string;
}) {
  const [kopia, setKopia] = useState("");
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

  // Do promptu ide to, čo appka sama našla — Claude tak nezačína od nuly.
  const nalezy = sekcie.flatMap((s2) => s2.riadky.filter((r) => r.stav === "pozor").map((r) => `${r.nazov}: ${r.hodnota}${r.detail ? ` (${r.detail})` : ""}`));

  const skopiruj = async (id: string) => {
    const t = promptSKontextom(id, { mesiac, nalezy, minule: null });
    if (!t) return;
    const ok = await doSchranky(t);
    setKopia(ok ? id : `chyba:${id}`);
    setTimeout(() => setKopia(""), 2500);
  };

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

      {/* DAŤ TO CLAUDOVI. Appka vie, že niečo škrípe; nájsť PREČO je práca
          nad kódom a databázou, na ktorú Jerry nástroje nemá. Prompt nesie
          mesiac aj nálezy, takže kontrola nezačína od nuly. */}
      <div style={{ borderTop: `1px solid ${mix(C.border, 45)}`, paddingTop: 8 }}>
        <div style={{ fontSize: 10.5, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
          dať Claudovi na kontrolu
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {OBLASTI.map((o) => (
            <button key={o.id} onClick={() => void skopiruj(o.id)}
              style={{ padding: "4px 11px", borderRadius: 12, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${kopia === o.id ? C.green : C.border}`, background: "transparent",
                color: kopia === o.id ? C.green : kopia === `chyba:${o.id}` ? C.orange : C.textMuted }}>
              {kopia === o.id ? "skopírované" : kopia === `chyba:${o.id}` ? "schránka odmietla" : o.nazov}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 5 }}>
          Skopíruje zadanie aj s mesiacom a s tým, čo appka našla — vloží sa do Claude Code v repe.
        </div>
      </div>
    </div>
  );
}
