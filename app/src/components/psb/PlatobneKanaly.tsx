import { useEffect, useMemo, useState } from "react";

import { btcOznacenia, type BtcKnihaPlatba, type ClientAgg } from "../../lib/psb/compute";
import { fetchBtcReserve } from "../../lib/psb/client";
import { fmtCZK } from "../../lib/psb/format";
import type { PSBData } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { Card, Donut, Empty, H3, Info, Select } from "./ui";
import { OBDOBIA_DASH, hraniceObdobia } from "./DashGrafy";

/**
 * Čím klienti platia — z PTmindera, nie z bankových pohybov.
 *
 * Prvá verzia skladala kanály z výpisov a z BTC knihy. Revízia (2026-08-08)
 * našla, že tým miešala okná: výpisy siahajú len po január 2026, BTC kniha po
 * júl 2025, zošit po jún 2026 — a percentá počítané cez nezlučiteľné obdobia
 * klamú. Mená sa navyše hádali z textu platby, takže „Účet" priznal 34 klientov
 * z 90 skutočných.
 *
 * PTminder pritom pri každej platbe nesie payment_method (bank/cash/other)
 * a presné meno — a tržby z neho aj tak sú zdrojom pravdy celej appky. Banka,
 * zošit a BTC kniha zostávajú tým, čím majú byť: nezávislou kontrolou, že
 * peniaze naozaj prišli (kontrola príjmov v registri).
 *
 * „other" je v praxi bitcoin: v roku 2026 sedí s BTC knihou na percentá.
 * Rok 2025 v BTC knihe chýba (389 tisíc bez náprotivku) — kniha ale platí až
 * od 31.7.2025 a Jerry rok 2025 neriešil, preto rovno názov „Bitcoin".
 *
 * KOLÁČ UKAZUJE PENIAZE. Klient platiaci dvoma cestami je v počtoch oboch
 * kanálov — počty sa preto nesčítavajú na počet klientov a sú vedľa ako
 * druhý údaj, nie ako základ percent.
 */

const METODY = [
  { id: "bank", label: "Účet", farba: C.accent },
  { id: "cash", label: "Hotovosť", farba: C.blue },
  { id: "other", label: "Bitcoin", farba: C.orange },
] as const;

export function PlatobneKanaly({
  data,
  clients,
  onNavigate,
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  onNavigate: (tab: string, sub?: string, focus?: { skupina?: { label: string; mena: string[] }; nonce?: number }) => void;
}) {
  const [obdobie, setObdobie] = useState("2026");

  // BTC kniha ako zdroj pravdy o bitcoinových platbách (poistka z 11. 8.).
  // Kaňovský zaplatil 1. 7. bitcoinom, ale v PTminderi bol klik „bank" —
  // a tento koláč ho radil do banky. Metóda z PTmindera sa preto podriaďuje
  // BTC knihe: čo sa s ňou spáruje, JE bitcoin, nech je klik akýkoľvek.
  const [btcPlatby, setBtcPlatby] = useState<BtcKnihaPlatba[]>([]);
  useEffect(() => {
    void fetchBtcReserve(true).then((r) => { if (r?.platby) setBtcPlatby(r.platby); });
  }, []);
  const { jeBtc } = useMemo(() => btcOznacenia(data.payments, btcPlatby), [data.payments, btcPlatby]);

  const kanaly = useMemo(() => {
    const platby = data.payments.filter((p) => p.client);
    const posledny = platby.reduce((m, p) => (p.date.slice(0, 7) > m ? p.date.slice(0, 7) : m), "");
    if (!posledny) return [];
    let od = "0000-01", doM = posledny;
    if (obdobie === "12m") {
      const d = new Date(Date.parse(`${posledny}-01T00:00:00Z`));
      d.setUTCMonth(d.getUTCMonth() - 11);
      od = d.toISOString().slice(0, 7);
    } else {
      ({ od, do_: doM } = hraniceObdobia(obdobie, posledny));
    }
    const podla: Record<string, { czk: number; mena: Set<string> }> = {};
    for (const p of platby) {
      const mk = p.date.slice(0, 7);
      if (mk < od || mk > doM) continue;
      // Bitcoin rozhoduje BTC kniha, nie klik pri zápise v PTminderi.
      const metoda = jeBtc(p) ? "other" : (p.method || "bank");
      const e = (podla[metoda] ||= { czk: 0, mena: new Set() });
      e.czk += p.amount;
      // Meno z PTmindera nemusí sedieť na diakritiku agregátu — ale agregáty
      // vznikajú z tých istých exportov, takže tu je zhoda presná.
      e.mena.add(p.client);
    }
    return METODY
      .map((m) => ({ ...m, czk: podla[m.id]?.czk || 0, mena: podla[m.id]?.mena || new Set<string>() }))
      .filter((m) => m.czk > 0);
  }, [data.payments, obdobie, jeBtc]);

  if (!kanaly.length) {
    return (
      <Card>
        <H3><Info text="Rozdelenie tržieb podľa platobnej metódy z PTmindera." label="Čím klienti platia" /></H3>
        <Empty>Za zvolené obdobie nie sú žiadne platby.</Empty>
      </Card>
    );
  }

  const spolu = kanaly.reduce((a, x) => a + x.czk, 0);
  const otvor = (label: string) => {
    const kan = kanaly.find((x) => x.label === label);
    if (!kan || !kan.mena.size) return;
    // Skupina dostane len mená, ktoré agregát klientov pozná — platby od
    // ľudí mimo Trackera (odídení pred históriou) by v Klientoch aj tak
    // nemali riadok.
    const mena = [...kan.mena].filter((m) => clients[m]);
    if (!mena.length) return;
    onNavigate("klienti", undefined, { skupina: { label: `Platia cez: ${kan.label}`, mena }, nonce: Date.now() });
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <H3>
          <Info
            text="Z PTmindera — každá platba tam nesie metódu (bank/cash/other) a presné meno. „other“ je v praxi bitcoin: v roku 2026 sedí s BTC knihou na percentá; rok 2025 v BTC knihe chýba. Koláč ukazuje PENIAZE — klient platiaci dvoma cestami je v počtoch oboch kanálov, preto sa počty nesčítavajú. Či peniaze naozaj prišli, stráži nezávisle kontrola príjmov (účet + zošit + BTC vs PTminder). Klik na výsek otvorí tých klientov."
            label="Čím klienti platia"
          />
        </H3>
        <Select value={obdobie} onChange={setObdobie} options={[{ value: "12m", label: "Posledných 12 mes." }, ...OBDOBIA_DASH.filter((o) => o.value !== "custom")]} />
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <Donut
          size={168}
          data={kanaly.map((x) => ({ label: x.label, value: x.czk, color: x.farba }))}
          centerLabel={fmtCZK(spolu)}
          onSlice={otvor}
        />
        <div style={{ flex: 1, minWidth: 230 }}>
          {kanaly.map((x) => {
            const pct = spolu > 0 ? (x.czk / spolu) * 100 : 0;
            return (
              <button
                key={x.id}
                onClick={() => otvor(x.label)}
                disabled={!x.mena.size}
                title={x.mena.size ? `Otvoriť klientov, ktorí takto platili` : ""}
                style={{
                  display: "flex", width: "100%", alignItems: "baseline", gap: 9, padding: "8px 6px",
                  borderBottom: `1px solid ${mix(C.border, 55)}`, background: "transparent",
                  border: "none", cursor: x.mena.size ? "pointer" : "default", textAlign: "left",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: x.farba, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600, minWidth: 104 }}>{x.label}</span>
                <span style={{ fontSize: 13.5, color: C.text, fontVariantNumeric: "tabular-nums", minWidth: 96 }}>{fmtCZK(x.czk)}</span>
                <span style={{ fontSize: 12.5, color: x.farba, fontWeight: 700, minWidth: 46 }}>{pct.toFixed(1)} %</span>
                <span style={{ fontSize: 11.5, color: C.textDim, flex: 1 }}>
                  {x.mena.size} {x.mena.size === 1 ? "klient" : x.mena.size < 5 ? "klienti" : "klientov"} →
                </span>
              </button>
            );
          })}
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Percentá sú z peňazí. Kto platí viacerými cestami, je v počtoch všetkých svojich kanálov.
          </div>
        </div>
      </div>
    </Card>
  );
}
