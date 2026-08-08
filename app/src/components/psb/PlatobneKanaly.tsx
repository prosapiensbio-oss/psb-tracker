import { useEffect, useMemo, useState } from "react";

import { fetchBtcReserve } from "../../lib/psb/client";
import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, normName } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { Card, Donut, Empty, H3, Info, Select } from "./ui";
import { OBDOBIA_DASH, hraniceObdobia } from "./DashGrafy";

/**
 * Čím klienti platia.
 *
 * Tri cesty, ktorými peniaze do štúdia prídu: účet, hotovosť a bitcoin. Každá
 * má inú réžiu a iné riziko — hotovosť treba počítať a nosiť, bitcoin kolíše
 * a nedá sa ním zaplatiť nájom, účet je pohodlný, ale vidno ho aj inde. Bez
 * tohto rozdelenia sa nedá povedať, či je BTC okrajová zvláštnosť, alebo už
 * pätina tržieb.
 *
 * KOLÁČ UKAZUJE PENIAZE, nie počty ľudí. Je to zámer: klient môže zaplatiť
 * raz kartou a raz v hotovosti, takže súčet ľudí cez tri kanály nedá počet
 * klientov a percentá by klamali. Peniaze sa sčítať dajú a dávajú sto percent.
 * Počet ľudí je vedľa ako druhý údaj, nie ako základ koláča.
 *
 * Priradenie k človeku je ODHAD tam, kde ho banka umožní — platba sa páruje
 * podľa mena protistrany. Keď sa meno nenájde, peniaze sa do kanála započítajú
 * aj tak (vieme, ako prišli), len sa nepriradia ku klientovi. Preto môže byť
 * suma vyššia, než čo pokrývajú menovaní ľudia; karta to priznáva.
 */

type Pohyb = { datum: string; suma: number; protistrana?: string; poznamka?: string; typ?: string };
type Kanal = { id: string; label: string; farba: string; czk: number; mena: Set<string> };

export function PlatobneKanaly({
  clients,
  onNavigate,
}: {
  clients: Record<string, ClientAgg>;
  onNavigate: (tab: string, sub?: string, focus?: { skupina?: { label: string; mena: string[] }; nonce?: number }) => void;
}) {
  const [pohyby, setPohyby] = useState<Pohyb[] | null>(null);
  const [btc, setBtc] = useState<{ klient: string | null; datum: string; czk: number | null }[] | null>(null);
  const [obdobie, setObdobie] = useState("12m");

  useEffect(() => {
    void fetch("/api/fio", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { pohyby?: Pohyb[] }) => setPohyby(j.pohyby || []))
      .catch(() => setPohyby([]));
    void fetchBtcReserve(true).then((r) => setBtc(r?.platby || []));
  }, []);

  const kanaly = useMemo<Kanal[] | null>(() => {
    if (!pohyby || !btc) return null;
    // Meno klienta v texte platby. Banka píše „VERONIKA STOKLÁSKOVÁ", appka
    // „Veronika Stoklaskova" — porovnáva sa po slovách bez diakritiky, aby
    // sedelo aj obrátené poradie a druhé meno navyše.
    const mena = Object.values(clients).map((c) => ({ meno: c.name, casti: normName(c.name).split(" ").filter((x) => x.length > 2) }));
    const najdi = (text: string): string | null => {
      const t = normName(text || "");
      if (!t) return null;
      const hit = mena.find((m) => m.casti.length >= 2 && m.casti.every((c) => t.includes(c)));
      return hit ? hit.meno : null;
    };

    const posledny = [...pohyby.map((p) => String(p.datum).slice(0, 7)), ...btc.map((b) => String(b.datum).slice(0, 7))]
      .filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 7);
    const okno = hraniceObdobia(obdobie === "12m" ? "all" : obdobie, posledny);
    const vOkne = (d: string) => {
      const mk = String(d).slice(0, 7);
      if (obdobie === "12m") {
        const od = new Date(Date.parse(`${posledny}-01T00:00:00Z`));
        od.setUTCMonth(od.getUTCMonth() - 11);
        return mk >= od.toISOString().slice(0, 7) && mk <= posledny;
      }
      return mk >= okno.od && mk <= okno.do_;
    };

    const k: Record<string, Kanal> = {
      banka: { id: "banka", label: "Účet", farba: C.accent, czk: 0, mena: new Set() },
      hotovost: { id: "hotovost", label: "Hotovosť", farba: C.blue, czk: 0, mena: new Set() },
      btc: { id: "btc", label: "Bitcoin", farba: C.orange, czk: 0, mena: new Set() },
    };

    for (const p of pohyby) {
      // Len PRÍCHODZIE. „mimo" je pri príjme duplicita PTmindera, nie tržba.
      if (p.suma <= 0 || !vOkne(p.datum)) continue;
      const cielK = p.typ === "hotovosť" ? k.hotovost : k.banka;
      cielK.czk += p.suma;
      const meno = najdi(`${p.protistrana || ""} ${p.poznamka || ""}`);
      if (meno) cielK.mena.add(meno);
    }
    for (const b of btc) {
      if (!vOkne(b.datum)) continue;
      k.btc.czk += b.czk || 0;
      if (b.klient) {
        const meno = najdi(b.klient) || b.klient;
        if (clients[meno] || najdi(b.klient)) k.btc.mena.add(najdi(b.klient) || meno);
      }
    }
    return Object.values(k).filter((x) => x.czk > 0);
  }, [pohyby, btc, clients, obdobie]);

  if (!kanaly) {
    return (
      <Card>
        <H3><Info text="Rozdelenie tržieb podľa toho, ako peniaze prišli." label="Čím klienti platia" /></H3>
        <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div>
      </Card>
    );
  }
  if (!kanaly.length) {
    return (
      <Card>
        <H3><Info text="Rozdelenie tržieb podľa toho, ako peniaze prišli." label="Čím klienti platia" /></H3>
        <Empty>Za zvolené obdobie nie sú žiadne príjmy.</Empty>
      </Card>
    );
  }

  const spolu = kanaly.reduce((a, x) => a + x.czk, 0);
  const otvor = (label: string) => {
    const kan = kanaly.find((x) => x.label === label);
    if (!kan || !kan.mena.size) return;
    onNavigate("klienti", undefined, {
      skupina: { label: `Platia cez: ${kan.label}`, mena: [...kan.mena] },
      nonce: Date.now(),
    });
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <H3>
          <Info
            text="Koľko peňazí prišlo ktorou cestou. Koláč ukazuje PENIAZE, nie počty ľudí — klient môže zaplatiť raz kartou a raz v hotovosti, takže súčet ľudí cez tri kanály nedá počet klientov a percentá by klamali. Počet ľudí je vedľa ako druhý údaj. Priradenie platby ku konkrétnemu človeku je odhad podľa mena protistrany; keď sa meno nenájde, peniaze sa do kanála započítajú aj tak, len sa nepriradia. Klik na výsek otvorí tých klientov."
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
                title={x.mena.size ? `Otvoriť ${x.mena.size} klientov, ktorí takto platili` : "K tomuto kanálu sa nepodarilo priradiť mená"}
                style={{
                  display: "flex", width: "100%", alignItems: "baseline", gap: 9, padding: "8px 6px",
                  borderBottom: `1px solid ${mix(C.border, 55)}`, background: "transparent", border: "none",
                  borderTop: "none", borderLeft: "none", borderRight: "none",
                  cursor: x.mena.size ? "pointer" : "default", textAlign: "left",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: x.farba, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600, minWidth: 74 }}>{x.label}</span>
                <span style={{ fontSize: 13.5, color: C.text, fontVariantNumeric: "tabular-nums", minWidth: 96 }}>{fmtCZK(x.czk)}</span>
                <span style={{ fontSize: 12.5, color: x.farba, fontWeight: 700, minWidth: 46 }}>{pct.toFixed(1)} %</span>
                <span style={{ fontSize: 11.5, color: C.textDim, flex: 1 }}>
                  {x.mena.size ? `${x.mena.size} ${x.mena.size === 1 ? "klient" : x.mena.size < 5 ? "klienti" : "klientov"} →` : "bez priradených mien"}
                </span>
              </button>
            );
          })}
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Percentá sú z peňazí. Počet klientov je informatívny — kto zaplatí dvoma cestami, je v oboch.
          </div>
        </div>
      </div>
    </Card>
  );
}
