import { useEffect, useMemo, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import type { AssistantChat } from "./Assistant";
import { Card, Empty, H3, Info } from "./ui";

/**
 * Marketingové nápady — zásobník surových viet.
 *
 * PREČO JE TO VEDĽA „ČO PUBLIKOVAŤ ĎALEJ“
 *
 * Tá karta počíta návrhy z dát: témy, na ktoré sa web zobrazuje a nikto
 * neklikne, články, ktoré ľudia čítajú. Vie však len to, čo sa už stalo.
 * Otázka, ktorú klient položil dnes pri drepe, v žiadnych dátach nie je —
 * a pritom je to najpresnejší jazyk, aký o svojom probléme použije.
 *
 * Dve karty vedľa seba teda nie sú duplicita: jedna hovorí, čo ľudia hľadali,
 * druhá čo sa nahlas spýtali.
 *
 * PREČO SA ZAMIETNUTÉ NEMAŽE
 *
 * Vedieť, že sa téma už raz zavrhla a prečo, je cennejšie než čistý zoznam.
 * Inak sa tá istá vec navrhne o dva mesiace znova a premýšľa sa nad ňou od nuly.
 */

export type Napad = {
  id: string; datum: string; text: string;
  zdroj: string; stav: string; poznamka: string; autor: string;
};

const ZDROJ_LABEL: Record<string, string> = {
  otazka_klienta: "otázka klienta", vlastny: "môj nápad", jarvis: "Jarvis", ine: "iné",
};

const fmtDen = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : d || "—";
};

export function Napady({ chat }: { chat?: AssistantChat }) {
  const [napady, setNapady] = useState<Napad[]>([]);
  const [nacitane, setNacitane] = useState(false);
  const [ajHotove, setAjHotove] = useState(false);

  const nacitaj = () => void fetch("/api/napady", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j: { napady?: Napad[] }) => setNapady(j.napady || []))
    .catch(() => {})
    .finally(() => setNacitane(true));
  useEffect(nacitaj, []);

  const zmen = async (id: string, zmena: Partial<Napad>) => {
    await fetch("/api/napady", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...zmena }),
    }).catch(() => {});
    nacitaj();
  };

  const otvorene = useMemo(() => napady.filter((n) => n.stav === "novy"), [napady]);
  const hotove = useMemo(() => napady.filter((n) => n.stav !== "novy"), [napady]);
  const vidno = ajHotove ? napady : otvorene;

  /**
   * Verdikt od Jarvisa. Zámerne sa pýta na obe strany naraz — či to je téma
   * a či nie — inak model prikyvuje: nápad, ktorý dostane otázku „čo z toho
   * publikovať“, sa vždy dá nejako publikovať.
   */
  const posud = (n: Napad) => {
    if (!chat) return;
    chat.setFloatingOpen(true);
    void chat.ask([
      `Posúď tento marketingový nápad: „${n.text}“`,
      `Zdroj: ${ZDROJ_LABEL[n.zdroj] || n.zdroj}, zapísaný ${fmtDen(n.datum)}.`,
      "",
      "Odpovedz v tomto poradí:",
      "1. Je to téma, alebo nie? Ak nie je, povedz to rovno a prečo — mlčať a hľadať na tom niečo dobré je horšie.",
      "2. Ak je: pre koho presne a na akú otázku odpovedá. Použi čísla z dát, ak nejaké súvisia (Search Console, obsah → dopyt).",
      "3. V akom formáte a prečo práve v tom.",
      "4. Čo by som s tým NEMAL robiť — kde je pri tejto téme hranica FP pravidiel alebo indexu brand-konfliktov.",
      "",
      "Ak by si to prepracoval, napíš ako — nie len to, že by si to prepracoval.",
    ].join("\n"), `Posúď nápad: ${n.text.slice(0, 60)}`);
  };

  if (!nacitane) return null;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label={`Nápady na obsah (${otvorene.length})`}
            text="Surové vety, z ktorých môže byť obsah — zapisujú sa v „+ Zápis“ jedným riadkom. Najcennejšie sú otázky klientov počas tréningu: to je jazyk, ktorým ľudia o svojom tele naozaj hovoria, a v žiadnych dátach nie je. Karta „Čo publikovať ďalej“ vie len to, čo sa už stalo; táto vie, čo sa nahlas spýtali. Zamietnuté sa nemažú — vedieť, že sa téma už raz zavrhla a prečo, je cennejšie než prázdny zoznam."
          />
        </H3>
        {hotove.length > 0 && (
          <button onClick={() => setAjHotove((v) => !v)}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>
            {ajHotove ? "skryť vyriešené" : `ukázať aj vyriešené (${hotove.length})`}
          </button>
        )}
      </div>

      {vidno.length === 0 ? (
        <Empty>
          Zatiaľ žiadny nápad. Zapisujú sa v <b>+ Zápis</b> hore — jeden riadok, kým to máš v hlave.
          Otázka, ktorú ti klient položí pri drepe, je o mesiac nenávratne stratená.
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {vidno.map((n) => (
            <div key={n.id} style={{
              borderLeft: `2px solid ${n.stav === "pouzity" ? C.green : n.stav === "zamietnuty" ? mix(C.text, 25) : n.zdroj === "otazka_klienta" ? C.accent : mix(C.accent, 45)}`,
              paddingLeft: 10, opacity: n.stav === "zamietnuty" ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.45, textDecoration: n.stav === "zamietnuty" ? "line-through" : undefined }}>
                {n.text}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: C.textDim }}>
                  {ZDROJ_LABEL[n.zdroj] || n.zdroj} · {fmtDen(n.datum)}
                  {n.stav === "pouzity" && <span style={{ color: C.green }}> · použité</span>}
                  {n.stav === "zamietnuty" && <span> · zamietnuté</span>}
                </span>
                {n.stav === "novy" && (
                  <>
                    {chat && (
                      <button onClick={() => posud(n)} disabled={chat.busy}
                        style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11.5, cursor: chat.busy ? "default" : "pointer", fontFamily: "inherit" }}>
                        Čo si o tom myslíš?
                      </button>
                    )}
                    <button onClick={() => void zmen(n.id, { stav: "pouzity" })}
                      style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      použité
                    </button>
                    <button onClick={() => void zmen(n.id, { stav: "zamietnuty" })}
                      style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      nie je to téma
                    </button>
                  </>
                )}
                {n.stav !== "novy" && (
                  <button onClick={() => void zmen(n.id, { stav: "novy" })}
                    style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                    vrátiť
                  </button>
                )}
              </div>
              {n.poznamka && (
                <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>{n.poznamka}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
