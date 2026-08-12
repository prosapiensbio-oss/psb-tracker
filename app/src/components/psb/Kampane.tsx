import { useEffect, useMemo, useState } from "react";

import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { CENA_ZA_DOPYT, hodnot } from "../../lib/psb/hodnotenie";
import { ciel, suhrnKampani, zlucKampane, type Kampan } from "../../lib/psb/kampane";
import { C, mix, S } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, TableWrap } from "./ui";

/**
 * Kampane z Meta Marketing API.
 *
 * PREČO JE TO V „ČO TO STÁLO" A NIE VO VLASTNEJ ZÁLOŽKE
 *
 * Tá záložka sa pýta presne túto otázku. Šiesta záložka by ju len rozriedila
 * a Jerry by mal dve miesta, kde hľadať výdavok na reklamu.
 *
 * PREČO SA HODNOTÍ CIEĽ KAMPANE A NIE JEJ VÝSLEDOK
 *
 * Prvé stiahnutie 19 mesiacov (31 452 Kč) ukázalo, že 99 % peňazí išlo do
 * kampaní s cieľom „interakcie", „prekliky" a „dosah". Tie o dopyt nikdy
 * nepožiadali — takže nula dopytov nie je ich zlyhanie, ale ich zadanie.
 * Keby obrazovka ukázala len cenu za dopyt, vyzeralo by to ako neschopnosť
 * kreatívy. Preto je cieľ prvý stĺpec a nie poznámka pod čiarou.
 */

/** Farba podľa skóre. Rovnaká škála všade, aby sa dala čítať bez legendy. */
export function farbaSkore(s: number): string {
  if (s >= 8.5) return C.green;
  if (s >= 6.5) return C.accentLight;
  if (s >= 4.5) return C.textMuted;
  if (s >= 2.5) return C.orange;
  return C.red;
}

/** Odznak so skóre 1–10. Pri chýbajúcich dátach pomlčka, nie jednotka. */
export function Skore({ skore, bezDat, titulok }: { skore: number; bezDat?: boolean; titulok?: string }) {
  const f = bezDat ? C.textDim : farbaSkore(skore);
  return (
    <span title={titulok} style={{
      display: "inline-block", minWidth: 34, textAlign: "center", padding: "2px 6px",
      borderRadius: 6, background: mix(f, 14), color: f, fontWeight: 700,
      fontSize: 12, fontVariantNumeric: "tabular-nums",
    }}>
      {bezDat ? "—" : `${skore}`}
    </span>
  );
}

const OBDOBIA = [
  { value: "all", label: "Celé obdobie" },
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
];

export function Kampane() {
  const [kampane, setKampane] = useState<Kampan[]>([]);
  const [obdobie, setObdobie] = useState("all");
  const [nacitane, setNacitane] = useState(false);

  useEffect(() => {
    void fetch("/api/meta", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kampane?: Kampan[] }) => setKampane(j.kampane || []))
      .catch(() => {})
      .finally(() => setNacitane(true));
  }, []);

  const vObdobi = useMemo(
    () => (obdobie === "all" ? kampane : kampane.filter((k) => k.mesiac.startsWith(obdobie))),
    [kampane, obdobie],
  );

  const podlaKampane = useMemo(() => zlucKampane(vObdobi), [vObdobi]);
  const s = useMemo(() => suhrnKampani(podlaKampane), [podlaKampane]);
  const h = hodnot(s.cena, CENA_ZA_DOPYT);
  const podielNaDopyt = s.podielNaDopyt;

  if (!nacitane) return null;
  if (kampane.length === 0) {
    return (
      <Card>
        <H3><Info label="Kampane z Mety" text="Sťahuje sa v Mesiac → Dáta a uzávierka → Meta — reklama a Instagram. Kým sa nestiahne, tu nie je čo ukázať." /></H3>
        <Empty>Ešte som z Mety nestiahol žiadnu kampaň. Choď do Mesiac → Dáta a uzávierka → Meta a klikni „Stiahnuť kampane od 2025“.</Empty>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Kampane z Mety"
            text="Skutočný výdavok po kampaniach priamo z Meta Marketing API — nie súčet z Metricoolu. Cieľ kampane je prvý stĺpec zámerne: kampaň s cieľom „dosah“ nemá ako priniesť dopyt, takže jej nula nie je zlyhanie, ale zadanie. Cena za dopyt sa počíta len z konverzií, ktoré Meta hlási ako lead alebo registráciu; prehratia videa a zobrazenia stránky sa do toho čísla nerátajú."
          />
        </H3>
        <select value={obdobie} onChange={(e) => setObdobie(e.target.value)} style={{ ...S.input, width: 150, marginBottom: 0 }}>
          {OBDOBIA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Verdikt navrchu. Bez neho je to tabuľka, z ktorej si každý prečíta,
          čo chce — a Jerry na obrazovku pozerá pár minút mesačne. */}
      <div style={{ margin: "12px 0 4px", padding: "11px 13px", borderRadius: 8, background: mix(podielNaDopyt < 20 ? C.red : C.accent, 8), lineHeight: 1.6, fontSize: 12.5, color: C.textMuted }}>
        <b style={{ color: C.text }}>Čo z toho čítať:</b>{" "}
        {podielNaDopyt < 20 ? (
          <>
            Z {fmtCZK(s.spend)} išlo na kampane, ktoré vôbec pýtali dopyt, len{" "}
            <b style={{ color: C.red }}>{Math.round(podielNaDopyt)} %</b>. Zvyšok kupoval videnia,
            prekliky a interakcie. <b style={{ color: C.text }}>Nula klientov z reklamy preto nie je
            zlyhanie kreatívy — je to splnené zadanie.</b> Kým bude cieľ kampane „dosah“, žiadna
            zmena textu ani obrázka na tom nič nezmení.
          </>
        ) : (
          <>
            Na dopyt bolo namierených <b style={{ color: C.text }}>{Math.round(podielNaDopyt)} %</b>{" "}
            výdavku. Rozhoduje stĺpec <b style={{ color: C.text }}>cena za dopyt</b> proti stropu
            2 200 Kč — nad ním sa klient, čo pôjde k Terezke, nezaplatí.
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "14px 0" }}>
        <Cislo v={fmtCZK(s.spend)} p="Minuté spolu" farba={C.orange} />
        <Cislo v={String(podlaKampane.length)} p="Kampaní" farba={C.text} />
        <Cislo v={s.videnia.toLocaleString("sk")} p="Videní" farba={C.textMuted} />
        <Cislo v={String(s.dopyty)} p="Dopytov" farba={s.dopyty ? C.text : C.red} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.cena ? farbaSkore(h.skore) : C.red, fontVariantNumeric: "tabular-nums" }}>
              {s.cena ? fmtCZK(s.cena) : "—"}
            </span>
            <Skore skore={h.skore} bezDat={h.bezDat} titulok="10 = pod 250 Kč za dopyt · 7 = 1 000 Kč · 4 = 2 200 Kč (strop u Terezky) · 2 = 5 700 Kč" />
          </div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>Cena za dopyt</div>
        </div>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
            <th style={{ ...S.th, textAlign: "left" }}>Cieľ</th>
            <th style={{ ...S.th, textAlign: "right" }}>Minuté</th>
            <th style={{ ...S.th, textAlign: "right" }}>Videnia</th>
            <th style={{ ...S.th, textAlign: "right" }}>Kliky</th>
            <th style={{ ...S.th, textAlign: "right" }}>Dopyty</th>
            <th style={{ ...S.th, textAlign: "right" }}>Za dopyt</th>
            <th style={{ ...S.th, textAlign: "right" }}>1–10</th>
          </tr>
        </thead>
        <tbody>
          {podlaKampane.map((k) => {
            const c = ciel(k.ciel);
            const cena = k.vysledky > 0 ? k.spend / k.vysledky : null;
            const hk = hodnot(cena, CENA_ZA_DOPYT);
            // Kampaň, ktorá o dopyt nikdy nepožiadala, sa nehodnotí ako
            // zlyhaná. Jednotka by tvrdila, že kreatíva bola zlá — pritom sa
            // len kupovalo niečo iné. Toto rozlíšenie je celý zmysel stĺpca.
            const neHodnotene = !c.dopyt && k.vysledky === 0;
            return (
              <tr key={k.id}>
                <td style={{ ...S.td, color: C.text }}>
                  {k.nazov || k.id}
                  <div style={{ fontSize: 10.5, color: C.textDim }}>
                    {k.od === k.do ? monthLabel(k.od) : `${monthLabel(k.od)} – ${monthLabel(k.do)}`}
                  </div>
                </td>
                <td style={{ ...S.td, color: c.dopyt ? C.accentLight : C.textDim }} title={c.co}>{c.label}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(k.spend)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{k.impressions.toLocaleString("sk")}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{k.clicks.toLocaleString("sk")}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: k.vysledky ? C.text : C.textDim }}>{k.vysledky || "—"}</td>
                <td style={{ ...S.td, textAlign: "right", color: cena ? farbaSkore(hk.skore) : C.textDim }}>{cena ? fmtCZK(cena) : "—"}</td>
                <td style={{ ...S.td, textAlign: "right" }}>
                  {neHodnotene
                    ? <span title="Cieľ tejto kampane nebol dopyt — nula tu nie je zlyhanie." style={{ color: C.textDim, fontSize: 11.5 }}>nehodnotí sa</span>
                    : <Skore skore={hk.skore} bezDat={hk.bezDat} titulok="10 = pod 250 Kč za dopyt · 7 = 1 000 Kč · 4 = 2 200 Kč · 2 = 5 700 Kč" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>

      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
        „Dopyty“ sú konverzie tak, ako ich hlási Meta — teda aj stiahnutie dokumentu, ak bola
        kampaň naň mierená. Nie je to to isté ako dopyt na tréning v záložke Dopyty a rozdiel je
        podstatný: 525 stiahnutí príručky z jari 2025 stálo 4,60 Kč za kus a ani jedno sa nestalo
        klientom. Lacná konverzia bez ponuky, čo naň nadviaže, je stále len lacná konverzia.
      </div>
    </Card>
  );
}

function Cislo({ v, p, farba }: { v: string; p: string; farba: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: farba, fontVariantNumeric: "tabular-nums" }}>{v}</div>
      <div style={{ fontSize: 11.5, color: C.textMuted }}>{p}</div>
    </div>
  );
}
