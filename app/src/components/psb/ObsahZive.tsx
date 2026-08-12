import { useEffect, useMemo, useState } from "react";

import { KATEGORIE } from "../../lib/psb/hook";
import { monthLabel } from "../../lib/psb/format";
import { OBDOBIA_OBSAH, mesiaceVOkne } from "../../lib/psb/obdobia";
import { C, mix, S } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, RolovaciaTabulka, Select } from "./ui";

/**
 * Čo fungovalo — zo živých dát Instagram Graph API.
 *
 * PREČO POPRI STAREJ TABUĽKE A NIE MIESTO NEJ
 *
 * Ručná tabuľka (`marketing-obsah.ts`) drží 114 príspevkov z jan 2025 – jún
 * 2026 a má stĺpec, ktorý API nedáva: view rate, teda koľko ľudí pozeralo
 * aspoň tri sekundy. Zahodiť ju by znamenalo prísť o jediné číslo, ktoré
 * hovorí o pozornosti.
 *
 * Táto karta odpovedá na tú istú otázku z druhého konca: aktualizuje sa sama
 * a siaha po dnešok. Keď sa raz obe zhodnú na tom istom poradí kategórií,
 * ručná sa môže zahodiť.
 *
 * PREČO NIE PRIEMER ZO VŠETKÉHO
 *
 * Reelu s dosahom 13 000 zaplatila reklama. Keby sa miešal medzi organické,
 * priemer kategórie by hovoril o rozpočte, nie o obsahu. Preto sa dosah radí
 * podľa mediánu — jeden zaplatený príspevok ho neposunie.
 */

type Prispevok = {
  id: string; datum: string; mesiac: string; typ: string; permalink: string;
  hook: string; kategoria: string;
  dosah: number; ulozenia: number; zdielania: number; komentare: number; lajky: number; videnia: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export function ObsahZive() {
  const [prispevky, setPrispevky] = useState<Prispevok[]>([]);
  const [obdobie, setObdobie] = useState("12m");
  const [nacitane, setNacitane] = useState(false);

  useEffect(() => {
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prispevky?: Prispevok[] }) => setPrispevky(j.prispevky || []))
      .catch(() => {})
      .finally(() => setNacitane(true));
  }, []);

  const vObdobi = useMemo(() => {
    // Okno sa počíta z mesiacov, ktoré v dátach naozaj sú — nie od kalendára.
    const okno = new Set(mesiaceVOkne(obdobie, prispevky.map((p) => p.mesiac)));
    return prispevky.filter((p) => okno.has(p.mesiac));
  }, [prispevky, obdobie]);

  const podlaKategorie = useMemo(() => {
    const m = new Map<string, Prispevok[]>();
    for (const p of vObdobi) m.set(p.kategoria || "—", [...(m.get(p.kategoria || "—") || []), p]);
    return [...m.entries()]
      .map(([k, ps]) => ({
        kategoria: k,
        ks: ps.length,
        dosah: median(ps.map((p) => p.dosah)),
        ulozenia: median(ps.map((p) => p.ulozenia)),
        zdielania: median(ps.map((p) => p.zdielania)),
      }))
      .sort((a, b) => b.dosah - a.dosah);
  }, [vObdobi]);

  const najlepsie = useMemo(
    () => [...vObdobi].sort((a, b) => (b.ulozenia + b.zdielania * 3) - (a.ulozenia + a.zdielania * 3)),
    [vObdobi],
  );

  if (!nacitane) return null;
  if (!prispevky.length) {
    return (
      <Card>
        <H3><Info label="Čo fungovalo (živé z Instagramu)" text="Napĺňa sa v Mesiac → Dáta a uzávierka → Meta → Stiahnuť Instagram." /></H3>
        <Empty>Ešte som z Instagramu nestiahol žiadny príspevok.</Empty>
      </Card>
    );
  }
  const bezKategorie = prispevky.filter((p) => !p.kategoria).length;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Čo fungovalo (živé z Instagramu)"
            text="Príspevky priamo z Instagram Graph API, zaradené podľa toho, čím začínajú. Na rozdiel od tabuľky nižšie sa aktualizuje sama pri každom stiahnutí. Dosah, uloženia aj zdieľania sú MEDIÁNY, nie priemery: jeden zaplatený reel s dosahom 13 000 by priemer kategórie posunul tak, že by hovoril o rozpočte, nie o obsahu. Zaradenie je strojové a občas sa pomýli — pri rozhodovaní, čo natáčať ďalej, to stačí, pri jednom príspevku sa pozri na text."
          />
        </H3>
        <Select value={obdobie} onChange={setObdobie} options={OBDOBIA_OBSAH} />
      </div>

      {bezKategorie > 0 && (
        <div style={{ margin: "10px 0 2px", padding: "9px 12px", borderRadius: 8, background: mix(C.orange, 8), fontSize: 12, color: C.textMuted, lineHeight: 1.55 }}>
          {bezKategorie} z {prispevky.length} príspevkov nemá text ani zaradenie — stiahli sa skôr, než appka
          text ukladala. Spusti <b style={{ color: C.text }}>Stiahnuť Instagram</b> ešte raz a doplní sa to.
        </div>
      )}

      <div style={{ fontSize: 12, color: C.textDim, margin: "10px 0 6px" }}>
        {vObdobi.length} príspevkov · {monthLabel(vObdobi[vObdobi.length - 1]?.mesiac || "")} – {monthLabel(vObdobi[0]?.mesiac || "")}
      </div>

      <RolovaciaTabulka pocet={KATEGORIE.length}>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Typ hooku</th>
            <th style={{ ...S.th, textAlign: "right" }}>Kusov</th>
            <th style={{ ...S.th, textAlign: "right" }}>Medián dosahu</th>
            <th style={{ ...S.th, textAlign: "right" }}>Medián uložení</th>
            <th style={{ ...S.th, textAlign: "right" }}>Medián zdieľaní</th>
          </tr>
        </thead>
        <tbody>
          {podlaKategorie.map((r) => (
            <tr key={r.kategoria}>
              <td style={{ ...S.td, color: C.text }}>{r.kategoria}</td>
              <td style={{ ...S.td, textAlign: "right", color: r.ks < 5 ? C.orange : C.textMuted }} title={r.ks < 5 ? "Málo kusov — rozdiel oproti iným kategóriám je v tomto rozsahu prevažne šum." : undefined}>{r.ks}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.accentLight, fontWeight: 600 }}>{r.dosah.toLocaleString("sk")}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.ulozenia}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.zdielania}</td>
            </tr>
          ))}
        </tbody>
      </RolovaciaTabulka>

      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, margin: "16px 0 4px" }}>
        Jednotlivé príspevky — najsilnejšie hore
      </div>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6, lineHeight: 1.5 }}>
        Zoradené podľa uložení a zdieľaní, nie podľa dosahu. Dosah sa dá kúpiť; uloženie znamená, že sa
        k tomu niekto chce vrátiť, a zdieľanie, že to niekomu poslal.
      </div>
      <RolovaciaTabulka pocet={3}>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Príspevok</th>
            <th style={{ ...S.th, textAlign: "left" }}>Typ hooku</th>
            <th style={{ ...S.th, textAlign: "right" }}>Dosah</th>
            <th style={{ ...S.th, textAlign: "right" }}>Uloženia</th>
            <th style={{ ...S.th, textAlign: "right" }}>Zdieľania</th>
          </tr>
        </thead>
        <tbody>
          {najlepsie.map((p) => (
            <tr key={p.id}>
              <td style={{ ...S.td, color: C.text, maxWidth: 320 }}>
                <a href={p.permalink} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: "none" }}>
                  {p.hook || "(bez textu)"}
                </a>
                <div style={{ fontSize: 10.5, color: C.textDim }}>{p.datum} · {p.typ}</div>
              </td>
              <td style={{ ...S.td, color: C.textDim }}>{p.kategoria || "—"}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{p.dosah.toLocaleString("sk")}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.accentLight, fontWeight: 600 }}>{p.ulozenia}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{p.zdielania}</td>
            </tr>
          ))}
        </tbody>
      </RolovaciaTabulka>
    </Card>
  );
}
