import { useEffect, useMemo, useState } from "react";

import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { CENA_ZA_DOPYT, hodnot } from "../../lib/psb/hodnotenie";
import { ciel, suhrnKampani, zlucKampane, type Kampan } from "../../lib/psb/kampane";
import { OBDOBIA_MESACNE, mesiaceVOkne } from "../../lib/psb/obdobia";
import { C, mix, S } from "../../lib/psb/theme";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka } from "./ui";

/**
 * Kampane z Meta Marketing API.
 *
 * PREČO JE TO V „ČO TO STÁLO" A NIE VO VLASTNEJ ZÁLOŽKE
 *
 * Tá záložka sa pýta presne túto otázku. Šiesta záložka by ju len rozriedila
 * a Jerry by mal dve miesta, kde hľadať výdavok na reklamu.
 *
 * PREČO SA UKAZUJE CIEĽ KAMPANE
 *
 * Prvé stiahnutie 19 mesiacov (31 452 Kč) ukázalo, že 99 % peňazí išlo do
 * kampaní s cieľom „interakcie", „prekliky" a „dosah". Tie o dopyt nikdy
 * nepožiadali — takže nula dopytov nie je ich zlyhanie, ale ich zadanie.
 * Keby obrazovka ukázala len cenu za dopyt, vyzeralo by to ako neschopnosť
 * kreatívy. Preto je cieľ hneď za menom a nie poznámka pod čiarou.
 *
 * PREČO TU NIE JE STUPNICA 1–10
 *
 * Bola tu a Jerry ju 12. 8. zrušil ako mätúcu. Farba čísla a veta navrchu
 * hovoria to isté bez toho, aby si musel pamätať, čo znamená sedmička.
 */

/** Farba podľa toho, ako ďaleko je cena od stropu. Bez čísla, len signál. */
export function farbaCeny(skore: number): string {
  if (skore >= 8.5) return C.green;
  if (skore >= 6.5) return C.accentLight;
  if (skore >= 4.5) return C.textMuted;
  if (skore >= 2.5) return C.orange;
  return C.red;
}

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

  const vObdobi = useMemo(() => {
    const okno = new Set(mesiaceVOkne(obdobie, kampane.map((k) => k.mesiac)));
    return kampane.filter((k) => okno.has(k.mesiac));
  }, [kampane, obdobie]);
  const podlaKampane = useMemo(() => zlucKampane(vObdobi), [vObdobi]);
  const s = useMemo(() => suhrnKampani(podlaKampane), [podlaKampane]);
  const h = hodnot(s.cena, CENA_ZA_DOPYT);

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
            text="Skutočný výdavok po kampaniach priamo z Meta Marketing API — nie súčet z Metricoolu. Cieľ kampane je hneď za menom zámerne: kampaň s cieľom „dosah“ nemá ako priniesť dopyt, takže jej nula nie je zlyhanie, ale zadanie. Cena za dopyt sa počíta len z konverzií, ktoré Meta hlási ako lead alebo registráciu; prehratia videa a zobrazenia stránky sa do toho čísla nerátajú. Zoradené podľa výdavku — najdrahšie kampane sú hore, zvyšok sa roluje."
          />
        </H3>
        <FilterObdobia hodnota={obdobie} onChange={setObdobie} moznosti={OBDOBIA_MESACNE} />
      </div>

      {/* Verdikt navrchu. Bez neho je to tabuľka, z ktorej si každý prečíta,
          čo chce — a Jerry na obrazovku pozerá pár minút mesačne. */}
      <div style={{ margin: "12px 0 4px", padding: "11px 13px", borderRadius: 8, background: mix(s.podielNaDopyt < 20 ? C.red : C.accent, 8), lineHeight: 1.6, fontSize: 12.5, color: C.textMuted }}>
        <b style={{ color: C.text }}>Čo z toho čítať:</b>{" "}
        {s.podielNaDopyt < 20 ? (
          <>
            Z {fmtCZK(s.spend)} išlo na kampane, ktoré vôbec pýtali dopyt, len{" "}
            <b style={{ color: C.red }}>{Math.round(s.podielNaDopyt)} %</b>. Zvyšok kupoval videnia,
            prekliky a interakcie. <b style={{ color: C.text }}>Nula klientov z reklamy preto nie je
            zlyhanie kreatívy — je to splnené zadanie.</b> Kým bude cieľ kampane „dosah“, žiadna
            zmena textu ani obrázka na tom nič nezmení.
          </>
        ) : (
          <>
            Na dopyt bolo namierených <b style={{ color: C.text }}>{Math.round(s.podielNaDopyt)} %</b>{" "}
            výdavku. Rozhoduje stĺpec <b style={{ color: C.text }}>za dopyt</b> proti stropu
            2 200 Kč — nad ním sa klient, čo pôjde k Terezke, nezaplatí.
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "14px 0" }}>
        <Cislo v={fmtCZK(s.spend)} p="Minuté spolu" farba={C.orange} />
        <Cislo v={String(podlaKampane.length)} p="Kampaní" farba={C.text} />
        <Cislo v={s.videnia.toLocaleString("sk")} p="Videní" farba={C.textMuted} />
        <Cislo v={String(s.dopyty)} p="Dopytov" farba={s.dopyty ? C.text : C.red} />
        <Cislo
          v={s.cena ? fmtCZK(s.cena) : "—"}
          p="Cena za dopyt"
          farba={s.cena ? farbaCeny(h.skore) : C.red}
        />
      </div>

      <RolovaciaTabulka pocet={3}>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
            <th style={{ ...S.th, textAlign: "left" }}>Cieľ</th>
            <th style={{ ...S.th, textAlign: "right" }}>Minuté</th>
            <th style={{ ...S.th, textAlign: "right" }}>Videnia</th>
            <th style={{ ...S.th, textAlign: "right" }}>Kliky</th>
            <th style={{ ...S.th, textAlign: "right" }}>Dopyty</th>
            <th style={{ ...S.th, textAlign: "right" }}>Za dopyt</th>
          </tr>
        </thead>
        <tbody>
          {podlaKampane.map((k) => {
            const c = ciel(k.ciel);
            const cena = k.vysledky > 0 ? k.spend / k.vysledky : null;
            const hk = hodnot(cena, CENA_ZA_DOPYT);
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
                <td style={{ ...S.td, textAlign: "right", color: cena ? farbaCeny(hk.skore) : C.textDim }}>
                  {cena ? fmtCZK(cena) : c.dopyt ? "—" : <span title="Cieľ tejto kampane nebol dopyt — nula tu nie je zlyhanie." style={{ fontSize: 11 }}>nepýtala dopyt</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </RolovaciaTabulka>

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
