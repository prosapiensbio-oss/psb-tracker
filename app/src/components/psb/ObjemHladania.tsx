import { useEffect, useState } from "react";

import { oznam } from "../../lib/psb/obnovaSignal";
import {
  REGIONY_OBJEMU, smerZaujmu, textNapadu, vyrazyZTextu,
  type ObjemVyrazu, type RegionObjemu, type UlozenyObjem,
} from "../../lib/psb/objemHladania";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

/**
 * Čo ľudia hľadajú na Googli (zoznam úloh č. 18, Jerry 20. 10. 2026).
 *
 * Odhad Googlu z plánovača kľúčových slov, nie návštevnosť. Číslo samo nič
 * nerobí — každý riadok má „+ Nápad“, ktorý tému pošle do Nápadov (tam ju
 * Jerry zaradí do plánu obsahu alebo článku). Pravidlo Kokpitu: číslo bez
 * akcie sa neukazuje.
 */
type Stav = { cz: UlozenyObjem | null; brno: UlozenyObjem | null; vyrazy: string[] };

const KONKURENCIA = { nizka: "nízka", stredna: "stredná", vysoka: "vysoká", nezname: "—" } as const;
const datum = (iso: string) => new Date(iso).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" });

/** Malý stĺpcový graf 12 mesiacov (len tvar sezóny, čísla sú v bublinke). */
function Trend({ o }: { o: ObjemVyrazu }) {
  const posl = o.trend.slice(-12);
  const max = Math.max(1, ...posl.map((x) => x.n));
  if (!posl.length) return <span style={{ color: C.textDim }}>—</span>;
  return (
    <span title={posl.map((x) => `${x.mesiac}: ${x.n}`).join("\n")} style={{ display: "inline-flex", alignItems: "flex-end", gap: 1, height: 18, verticalAlign: "middle" }}>
      {posl.map((x) => (
        <span key={x.mesiac} style={{ width: 4, height: Math.max(1, Math.round((x.n / max) * 18)), background: C.accentLight, opacity: 0.85, borderRadius: 1 }} />
      ))}
    </span>
  );
}

export function ObjemHladania() {
  const [stav, setStav] = useState<Stav | null>(null);
  const [region, setRegion] = useState<RegionObjemu>("cz");
  const [bezi, setBezi] = useState(false);
  const [sprava, setSprava] = useState<{ text: string; chyba?: boolean } | null>(null);
  const [uprava, setUprava] = useState<string | null>(null);
  const [pridane, setPridane] = useState<Set<string>>(new Set());

  useEffect(() => {
    let zive = true;
    fetch("/api/google-ads", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; objem?: Stav; error?: string }) => {
        if (!zive) return;
        if (j.ok && j.objem) setStav(j.objem);
        else setSprava({ text: `Nenačítalo sa: ${j.error || "bez dôvodu"}`, chyba: true });
      })
      .catch(() => zive && setSprava({ text: "Nenačítalo sa – spojenie.", chyba: true }));
    return () => {
      zive = false;
    };
  }, []);

  const zisti = async (vyrazy?: string[]) => {
    setBezi(true);
    setSprava(null);
    try {
      const r = await fetch("/api/google-ads", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "objem", region, ...(vyrazy ? { vyrazy } : {}) }),
      });
      const j = (await r.json()) as { ok?: boolean; sprava?: string; error?: string; objem?: UlozenyObjem };
      if (!j.ok || !j.objem) throw new Error(j.error || "Google nevrátil výsledok");
      setStav((s) => ({ ...(s ?? { cz: null, brno: null, vyrazy: [] }), [region]: j.objem!, ...(vyrazy ? { vyrazy } : {}) }));
      setSprava({ text: j.sprava || "Zistené" });
      setUprava(null);
    } catch (e) {
      setSprava({ text: e instanceof Error ? e.message : String(e), chyba: true });
    } finally {
      setBezi(false);
    }
  };

  const doNapadov = async (o: ObjemVyrazu) => {
    try {
      const r = await fetch("/api/napady", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: textNapadu(o, region), zdroj: "inspiracia" }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error || "nezapísalo sa");
      setPridane((p) => new Set(p).add(`${region}|${o.vyraz}`));
      // Nápady a mapa cyklu si zoznam ťahajú samy – bez signálu by nový nápad nevideli
      oznam("marketing");
    } catch (e) {
      setSprava({ text: `Nápad sa nezapísal: ${e instanceof Error ? e.message : String(e)}`, chyba: true });
    }
  };

  const data = stav?.[region] ?? null;
  const tlacidlo = (o: ObjemVyrazu) => {
    const uz = pridane.has(`${region}|${o.vyraz}`);
    return (
      <button
        onClick={() => void doNapadov(o)}
        disabled={uz}
        title="Pošle tému do Nápadov – odtiaľ ju zaradíš do plánu obsahu alebo článku"
        style={{ background: "none", border: `1px solid ${uz ? C.border : C.accentLight}`, color: uz ? C.textDim : C.accentLight, borderRadius: 8, padding: "2px 8px", fontSize: 11.5, cursor: uz ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
      >
        {uz ? "v Nápadoch ✓" : "+ Nápad"}
      </button>
    );
  };
  const riadok = (o: ObjemVyrazu, sledovany: boolean) => {
    const smer = smerZaujmu(o.trend);
    return (
      <tr key={o.vyraz} style={{ borderTop: `1px solid ${mix(C.text, 8)}` }}>
        <td style={{ padding: "5px 6px", color: C.text }}>{o.vyraz}</td>
        <td style={{ padding: "5px 6px", textAlign: "right", color: o.mesacne ? C.text : C.textDim, fontWeight: sledovany ? 600 : 400, whiteSpace: "nowrap" }}
          title={o.bezDat ? "Google pri tomto tvare hlási 0 – hľadanie pripisuje inému tvaru (napr. „bolest zad“ 0, ale „bolesti zad“ 2 400). Skús iný tvar výrazu." : undefined}>
          {o.bezDat ? "0 – skús iný tvar" : o.mesacne.toLocaleString("sk-SK")}
        </td>
        <td style={{ padding: "5px 6px" }}><Trend o={o} /></td>
        <td style={{ padding: "5px 6px", color: smer ? (smer.zmena > 0 ? C.green : smer.zmena < 0 ? C.red : C.textMuted) : C.textDim, fontSize: 11.5, whiteSpace: "nowrap" }}>
          {smer ? smer.text : "—"}
        </td>
        <td style={{ padding: "5px 6px", color: C.textMuted, fontSize: 11.5 }}>{KONKURENCIA[o.konkurencia]}</td>
        <td style={{ padding: "5px 6px", textAlign: "right" }}>{tlacidlo(o)}</td>
      </tr>
    );
  };
  const tabulka = (riadky: ObjemVyrazu[], sledovane: boolean) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
        <thead>
          <tr style={{ color: C.textDim, fontSize: 11.5 }}>
            <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 500 }}>výraz</th>
            <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 500 }}>mesačne</th>
            <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 500 }}>12 mesiacov</th>
            <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 500 }}>záujem</th>
            <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 500 }}>konkurencia v reklame</th>
            <th />
          </tr>
        </thead>
        <tbody>{riadky.map((o) => riadok(o, sledovane))}</tbody>
      </table>
    </div>
  );

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Čo ľudia hľadajú na Googli"
            text="Odhad Googlu z plánovača kľúčových slov: koľko ľudí mesačne napíše výraz do vyhľadávania (priemer za 12 mesiacov, zaokrúhlený do pásiem). Nie je to návštevnosť ani zákazníci. Nula pri výraze zvyčajne znamená, že Google hľadanie pripísal inému tvaru slova (napr. „bolesti zad“ namiesto „bolest zad“). Záujem porovnáva posledné 3 mesiace s rovnakými mesiacmi pred rokom, aby sezóna nevyzerala ako rast. Konkurencia je o reklame (koľko inzerentov o výraz súperí), nie o tom, ako ťažko sa dostať do výsledkov."
          />
        </H3>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {(Object.keys(REGIONY_OBJEMU) as RegionObjemu[]).map((r) => (
            <button key={r} onClick={() => setRegion(r)} aria-pressed={region === r}
              style={{ border: `1px solid ${region === r ? C.accent : C.border}`, background: region === r ? C.accentBg : "transparent", color: region === r ? C.accent : C.textMuted, borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {REGIONY_OBJEMU[r]}
            </button>
          ))}
          <button onClick={() => void zisti()} disabled={bezi}
            style={{ border: "none", background: C.accent, color: "var(--c-onAccent)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: bezi ? "default" : "pointer", fontFamily: "inherit", opacity: bezi ? 0.6 : 1 }}>
            {bezi ? "Pýtam sa Googlu…" : data ? "Zistiť znova" : "Zistiť"}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 1.55 }}>
        Na výber tém: čo hľadá veľa ľudí a ešte o tom nemáš video ani článok, pošli cez „+ Nápad“ do Nápadov.
        {data && ` Zistené ${datum(data.zistene)} pre ${REGIONY_OBJEMU[data.region]}.`}
      </div>
      {sprava && <div style={{ fontSize: 12, marginTop: 8, color: sprava.chyba ? C.red : C.accentLight }}>{sprava.text}</div>}

      {!data ? (
        <Empty>
          Pre {REGIONY_OBJEMU[region]} sa ešte nezisťovalo. Stlač „Zistiť“ – Google vráti, koľko ľudí hľadá
          {" "}{(stav?.vyrazy ?? []).length || 12} sledovaných výrazov a aké podobné výrazy ešte ľudia píšu. Nič sa neplatí.
        </Empty>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>{tabulka([...data.vyrazy].sort((a, b) => Number(!!a.bezDat) - Number(!!b.bezDat) || b.mesacne - a.mesacne), true)}</div>
          {data.vyrazy.some((v) => v.bezDat) && (
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
              „0 – skús iný tvar“ neznamená, že to nikto nehľadá: Google hľadanie pripíše jednému tvaru slova a ostatné dostanú 0
              („bolest zad“ 0, „bolesti zad“ 2 400). Zmeň tvar v „Upraviť sledované výrazy“ alebo vezmi podobný výraz zo zoznamu nižšie.
            </div>
          )}
          {data.napady.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4 }}>
                <Info label="Ľudia hľadajú aj" text="Podobné výrazy, ktoré Google navrhol k sledovaným (z prvých 10). Najhľadanejšie hore; tie, čo už sleduješ, tu nie sú." />
              </div>
              {tabulka(data.napady.slice(0, 15), false)}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 12 }}>
        {uprava === null ? (
          <button onClick={() => setUprava((stav?.vyrazy ?? []).join("\n"))}
            style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
            Upraviť sledované výrazy ({(stav?.vyrazy ?? []).length})
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea value={uprava} onChange={(e) => setUprava(e.target.value)} rows={8}
              placeholder={"bolest zad\nosobní trenér brno"}
              style={{ width: "100%", fontFamily: "inherit", fontSize: 12.5, padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--c-surface)", color: C.text, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: C.textDim }}>Jeden výraz na riadok, česky (tak ako ho ľudia píšu), najviac 20.</span>
              <button onClick={() => setUprava(null)} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: C.textMuted }}>Zrušiť</button>
              <button onClick={() => void zisti(vyrazyZTextu(uprava))} disabled={bezi || !vyrazyZTextu(uprava).length}
                style={{ border: "none", background: C.accent, color: "var(--c-onAccent)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Uložiť a zistiť
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
