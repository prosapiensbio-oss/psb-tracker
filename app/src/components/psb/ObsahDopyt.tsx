import { useEffect, useMemo, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import { MALO_DAT, obsahPredDopytmi } from "../../lib/psb/obsahDopyt";
import { OBDOBIA_OBSAH, vOknePodlaDna } from "../../lib/psb/obdobia";
import { C, mix, S } from "../../lib/psb/theme";
import type { Lead } from "../../lib/psb/types";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka } from "./ui";

/**
 * Po čom nám niekto napísal.
 *
 * PREČO TO NIE JE „KTORÝ HOOK MÁ ULOŽENIA"
 *
 * Uloženie je náhrada za výsledok — hovorí, že sa príspevok páčil. Dopyt je
 * výsledok sám. Toto je jediná karta v Marketingu, ktorá spája obsah priamo
 * s tým, kvôli čomu sa robí.
 *
 * PREČO JE PRI KAŽDOM PODIELE AJ ZÁKLAD
 *
 * Publikuje sa 5–7 kusov mesačne, takže v ľubovoľných štrnástich dňoch takmer
 * vždy niečo vyšlo. Bez porovnania by karta hlásila „pred 95 % dopytov bola
 * edukácia" — čo je pravda a zároveň nezmysel: edukácia je aj pred 95 % dní,
 * keď nikto nenapísal. Rozhoduje jedine ROZDIEL medzi tými dvomi číslami.
 *
 * PREČO JE VŠADE POČET VEDĽA PERCENTA
 *
 * Pri 35 dopytoch za rok a piatich kategóriách vyjde na kategóriu pár
 * prípadov. „O 20 bodov častejšie" je pri siedmich dopytoch jeden človek.
 * Percento bez počtu by tu bolo klamstvo s jedným desatinným miestom.
 */

type Obsah = { datum: string; kategoria: string; hook: string; dosah: number; zdroj: string };

const OKNO = 14;

/**
 * Zdroje, ktoré obsah nespôsobil.
 *
 * Dopyt z odporúčania priviedol ČLOVEK. Nejaký príspevok pred ním vyšiel tak
 * či tak — publikuje sa 5–7 mesačne — takže sa správa presne ako náhodný deň
 * a ťahá každú kategóriu k základu. Pri 37 dopytoch je desať odporúčaní dosť
 * na to, aby prekryli slabý signál.
 *
 * Nie je to ale jednoznačné: komu ťa niekto odporučí, ten si často otvorí
 * profil a až potom napíše — vtedy obsah rolu má. Preto sa dajú zapnúť späť
 * a nie sú vyhodené natvrdo.
 */
const ZDROJE_BEZ_OBSAHU = ["referencia"];

export function ObsahDopyt({ leads }: { leads: Lead[] }) {
  const [obsah, setObsah] = useState<Obsah[]>([]);
  const [obdobie, setObdobie] = useState("all");
  const [ajOdporucania, setAjOdporucania] = useState(false);
  const [nacitane, setNacitane] = useState(false);
  // Prázdna karta má povedať, ČI zlyhalo načítanie, alebo naozaj nie sú dáta.
  // Prvá verzia chybu prehltla a vyzeralo to, akoby chýbali príspevky.
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    void fetch("/api/meta?co=obsah", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`server odpovedal ${r.status}`);
        return r.json();
      })
      .then((j: { obsah?: Obsah[] }) => setObsah(j.obsah || []))
      .catch((e) => setChyba(String(e?.message || e).slice(0, 120)))
      .finally(() => setNacitane(true));
  }, []);

  const vObdobi = useMemo(() => {
    const patri = vOknePodlaDna(obdobie, leads.map((l) => l.date));
    return leads.filter((l) => l.date && patri(l.date)
      && (ajOdporucania || !ZDROJE_BEZ_OBSAHU.includes(l.source)));
  }, [leads, obdobie, ajOdporucania]);

  // Koľko odporúčaní práve nepočítame — nech je vidieť, čo prepínač robí.
  const odporucani = useMemo(() => {
    const patri = vOknePodlaDna(obdobie, leads.map((l) => l.date));
    return leads.filter((l) => l.date && patri(l.date) && ZDROJE_BEZ_OBSAHU.includes(l.source)).length;
  }, [leads, obdobie]);

  const v = useMemo(() => obsahPredDopytmi(vObdobi, obsah, OKNO), [vObdobi, obsah]);

  // Jednotlivé dopyty aj s tým, čo im predchádzalo — najnovšie hore.
  const podrobne = useMemo(() => {
    const zoradene = [...vObdobi].sort((a, b) => b.date.localeCompare(a.date));
    return zoradene.map((l) => {
      const den = l.date.slice(0, 10);
      const od = new Date(Date.parse(`${den}T00:00:00Z`) - OKNO * 86400000).toISOString().slice(0, 10);
      const pred = obsah
        .filter((o) => o.datum < den && o.datum >= od)
        .sort((a, b) => b.dosah - a.dosah);
      return { lead: l, pred };
    });
  }, [vObdobi, obsah]);

  if (!nacitane) return null;
  if (!obsah.length) {
    return (
      <Card>
        <H3><Info label="Po čom nám niekto napísal" text="Spája dopyty s obsahom, ktorý vyšiel v predchádzajúcich dvoch týždňoch." /></H3>
        <Empty>
          {chyba
            ? `Nepodarilo sa načítať obsah: ${chyba}. Skús obnoviť stránku (Cmd + Shift + R).`
            : "Nemám žiadny príspevok s textom — bez textu sa nedá zaradiť. Nahraj Metricool alebo stiahni Instagram."}
        </Empty>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Po čom nám niekto napísal"
            text={`Ku každému dopytu obsah, ktorý vyšiel v predchádzajúcich ${OKNO} dňoch. Stĺpec „pred dopytmi" hovorí, pri koľkých % dopytov tá kategória v okne bola; stĺpec „pred bežným dňom" to isté pri náhodnom dni toho istého obdobia. Rozhoduje ich ROZDIEL — bez neho by vyhrala kategória, ktorá vychádza najčastejšie, nie tá, ktorá niečo spôsobí. A ani rozdiel nie je dôkaz: obsah pred dopytom mohol s tým dopytom nesúvisieť vôbec.`}
          />
        </H3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.textMuted, cursor: "pointer" }}
            title="Dopyt z odporúčania priviedol človek, nie príspevok — v priemere sa správa ako náhodný deň a rozdiely stláča k nule. Zapni, ak chceš vidieť, či obsah aspoň potvrdzuje odporúčanie.">
            <input type="checkbox" checked={ajOdporucania} onChange={(e) => setAjOdporucania(e.target.checked)} />
            počítať aj odporúčania{odporucani > 0 && ` (${odporucani})`}
          </label>
          <FilterObdobia hodnota={obdobie} onChange={setObdobie} moznosti={OBDOBIA_OBSAH} />
        </div>
      </div>

      {v.riadky.length === 0 ? (
        <Empty>V tomto období nemám dopyty, ku ktorým by existoval obsah s dátumom.</Empty>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C.textDim, margin: "10px 0 8px" }}>
            {v.dopytov} dopytov · základ počítaný z {v.dniZakladu} dní · okno {OKNO} dní
            {!ajOdporucania && odporucani > 0 && (
              <span style={{ color: C.textMuted }}> · {odporucani} odporúčaní nepočítaných</span>
            )}
          </div>

          <RolovaciaTabulka pocet={5}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Typ hooku</th>
                <th style={{ ...S.th, textAlign: "right" }}>Pred dopytmi</th>
                <th style={{ ...S.th, textAlign: "right" }}>Pred bežným dňom</th>
                <th style={{ ...S.th, textAlign: "right" }}>Rozdiel</th>
                <th style={{ ...S.th, textAlign: "right" }}>Kusov v období</th>
              </tr>
            </thead>
            <tbody>
              {v.riadky.map((r) => {
                const slabe = MALO_DAT(r);
                return (
                  <tr key={r.kategoria}>
                    <td style={{ ...S.td, color: C.text }}>
                      {r.kategoria}
                      {slabe && (
                        <div style={{ fontSize: 10.5, color: C.orange }}
                          title="Pri takomto počte je rozdiel v podstate náhoda — jeden človek sem alebo tam.">
                          málo prípadov, neber vážne
                        </div>
                      )}
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: C.text }}>
                      {Math.round(r.podielDopytov)} %
                      <span style={{ color: C.textDim, fontSize: 11 }}> ({r.dopytov})</span>
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{Math.round(r.zaklad)} %</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600,
                      color: slabe ? C.textDim : r.rozdiel > 5 ? C.green : r.rozdiel < -5 ? C.red : C.textMuted }}>
                      {r.rozdiel > 0 ? "+" : ""}{Math.round(r.rozdiel)} b.
                    </td>
                    <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.kusov}</td>
                  </tr>
                );
              })}
            </tbody>
          </RolovaciaTabulka>

          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: mix(C.accent, 6), fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            <b style={{ color: C.text }}>Ako to čítať:</b> rozdiel v percentuálnych bodoch hovorí, o koľko
            častejšie tá kategória vyšla pred dopytom než pred obyčajným dňom. Kladné číslo je stopa, nie dôkaz —
            človek mohol napísať kvôli odporúčaniu a príspevok si ani nevšimnúť. Za dôkaz sa to dá brať až vtedy,
            keď to isté vyjde tri obdobia po sebe.
          </div>
        </>
      )}

      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, margin: "18px 0 6px" }}>
        Dopyt po dopyte — čo mu predchádzalo
      </div>
      <RolovaciaTabulka pocet={3}>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Dopyt</th>
            <th style={{ ...S.th, textAlign: "left" }}>Obsah za predchádzajúcich {OKNO} dní</th>
          </tr>
        </thead>
        <tbody>
          {podrobne.map(({ lead, pred }) => (
            <tr key={lead.id}>
              <td style={{ ...S.td, color: C.text, whiteSpace: "nowrap", verticalAlign: "top" }}>
                {lead.name || "?"}
                <div style={{ fontSize: 10.5, color: C.textDim }}>{fmtDMY(lead.date)} · {lead.source}</div>
              </td>
              <td style={{ ...S.td, color: C.textMuted, fontSize: 12 }}>
                {pred.length === 0 ? <span style={{ color: C.textDim }}>nič nevyšlo</span> : pred.slice(0, 4).map((o, i) => (
                  <div key={i} title={o.hook} style={{ marginBottom: 2 }}>
                    <span style={{ color: C.textDim }}>{o.datum.slice(5)} · {o.kategoria} · </span>
                    {o.hook ? (o.hook.length > 100 ? `${o.hook.slice(0, 100)}…` : o.hook) : "(bez textu)"}
                  </div>
                ))}
                {pred.length > 4 && <div style={{ color: C.textDim, fontSize: 11 }}>a ďalších {pred.length - 4}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </RolovaciaTabulka>
    </Card>
  );
}
