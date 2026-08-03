import { useEffect, useMemo, useState } from "react";

import { C, mix, S } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, Select, TableWrap } from "./ui";

// Všetky kanály, nie len Instagram.
//
// Appka poznala Instagram (CSV z Metricoolu), web (GA4) a vyhľadávanie (Search
// Console). Facebook, TikTok, Threads, LinkedIn, YouTube, Meta Ads a Google
// Business v nej neboli vôbec — pritom Facebook má viac impresií než Instagram
// a Meta Ads míňajú reálne peniaze.
//
// Dáta sem chodia z mesačnej zostavy Metricoolu, ktorú appka sama prečítať
// nevie (PDF s vykreslenými grafmi). Preto sa nekreslí graf, ale tabuľka: číslo
// a zmena oproti minulému mesiacu, presne ako v zostave. Kým sa nič nenahrá,
// obrazovka povie, čo treba spraviť — nepredstiera, že dáta má.

export type KanalRiadok = { mesiac: string; kanal: string; metrika: string; hodnota: number; zmena: number | null; poznamka: string };

const cislo = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("cs-CZ") : n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

// Poradie kanálov podľa toho, koľko z nich reálne ide — nie abecedne.
const PORADIE = ["Instagram", "Facebook", "TikTok", "Threads", "YouTube", "LinkedIn", "Google Business", "Web", "Meta Ads", "Google Ads", "Konkurencia"];
const poradieKanala = (k: string) => {
  const i = PORADIE.indexOf(k);
  return i < 0 ? PORADIE.length : i;
};

const sipka = (z: number | null) => (z == null ? "" : z > 1 ? "▲" : z < -1 ? "▼" : "►");
const farbaZmeny = (z: number | null) => (z == null ? C.textDim : z > 1 ? C.green : z < -1 ? C.red : C.textMuted);

export function Kanaly() {
  const [riadky, setRiadky] = useState<KanalRiadok[]>([]);
  const [mesiac, setMesiac] = useState("");
  const [nacitava, setNacitava] = useState(true);

  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kanaly?: KanalRiadok[] }) => {
        const k = j.kanaly || [];
        setRiadky(k);
        if (k.length) setMesiac(k[0].mesiac);
        setNacitava(false);
      })
      .catch(() => setNacitava(false));
  }, []);

  const mesiace = useMemo(() => [...new Set(riadky.map((r) => r.mesiac))].sort().reverse(), [riadky]);
  const vMesiaci = useMemo(() => riadky.filter((r) => r.mesiac === mesiac), [riadky, mesiac]);
  const skupiny = useMemo(() => {
    const m = new Map<string, KanalRiadok[]>();
    for (const r of vMesiaci) m.set(r.kanal, [...(m.get(r.kanal) || []), r]);
    return [...m.entries()].sort((a, b) => poradieKanala(a[0]) - poradieKanala(b[0]) || a[0].localeCompare(b[0]));
  }, [vMesiaci]);

  if (nacitava) return <Card><div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div></Card>;

  if (!riadky.length) {
    return (
      <Card>
        <H3><Info text="Mesačná zostava z Metricoolu pokrýva všetky kanály naraz — Facebook, TikTok, Threads, LinkedIn, YouTube, Meta Ads aj Google Business. Appka ju vie prečítať, keď má tvar tabuľky." label="Kanály" /></H3>
        <Empty>Zatiaľ nič nahraté.</Empty>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 10, lineHeight: 1.6 }}>
          Metricool posiela mesačnú zostavu ako PDF a to appka prečítať nevie — text je v podmnožinách fontov a
          čísla sú vykreslené do grafov. Daj to PDF Claudovi (ten sa na strany pozerá ako na obrázky) a vypýtaj si
          CSV s piatimi stĺpcami:
          <pre style={{ margin: "8px 0", padding: "9px 11px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 11.5, color: C.textDim, overflowX: "auto" }}>
{`mesiac,kanal,metrika,hodnota,zmena
2026-07,Instagram,Followers,1518,2.02
2026-07,Facebook,Impressions,82810,120.91
2026-07,Meta Ads,Spent,4795.91,154.96`}
          </pre>
          Ten súbor sa nahráva rovnako ako ostatné, v <b style={{ color: C.text }}>Údaje → Upload CSV</b>.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3><Info text="Mesačné čísla za všetky kanály z Metricoolu. Zmena je oproti predošlému mesiacu tak, ako ju uvádza zostava — appka ju neprepočítava, aby sa nelíšila od toho, čo vidíš v Metricoole. Instagram je tu v súhrne; príspevok po príspevku je v ostatných kartách, ktoré čítajú CSV export." label="Kanály — mesačný súhrn" /></H3>
        {mesiace.length > 1 && (
          <Select value={mesiac} onChange={setMesiac} options={mesiace.map((m) => ({ value: m, label: m }))} />
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {skupiny.map(([kanal, rs]) => (
          <div key={kanal} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.accentLight, padding: "4px 0 6px", borderBottom: `1px solid ${mix(C.accent, 30)}` }}>
              {kanal}
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: "left" }}>Metrika</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Hodnota</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Zmena</th>
                  <th style={{ ...S.th, textAlign: "left" }}>Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={`${r.kanal}|${r.metrika}`}>
                    <td style={S.td}>{r.metrika}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{cislo(r.hodnota)}</td>
                    <td style={{ ...S.td, textAlign: "right", color: farbaZmeny(r.zmena), fontVariantNumeric: "tabular-nums" }}>
                      {r.zmena == null ? "—" : `${sipka(r.zmena)} ${r.zmena.toFixed(1)} %`}
                    </td>
                    <td style={{ ...S.td, color: C.textDim, fontSize: 11.5 }}>{r.poznamka}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.55 }}>
        Zdroj: mesačná zostava Metricoolu prečítaná Claudom. Čísla vytlačené v zostave sú presné; čo je v nej len
        nakreslené v grafe, je odhad — preto tu nie sú vedľa čísel z CSV exportu, ktoré sú presné vždy.
      </div>
    </Card>
  );
}
