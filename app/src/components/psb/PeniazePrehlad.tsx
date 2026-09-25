import { useEffect, useMemo, useState } from "react";

import { fetchBtcReserve, fetchVzasSettings } from "../../lib/psb/client";
import { fmtCZK } from "../../lib/psb/format";
import { CIEL_MESIACOV, breakEvenPriemer, chybaDoCiela, poslednyUzavretyIdx, spocitajRezervu } from "../../lib/psb/rezerva";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import {
  MATYAS, VZAS_MONTHS, VZAS_MONTH_LABELS, VZAS_TARGETS,
  breakEvenRad, byCommitment, jarekCalc, pnlCalc, salaryCalc, vzasVerzia,
} from "../../lib/psb/vzas";
import { popisPoplatku, smerDlhu } from "../../lib/psb/prehladPasma";
import { PristrojeMriezka, type Pasmo, type Pristroj } from "./Prehlad";
import { Card, H3, Info } from "./ui";

/**
 * PENIAZE NA JEDNEJ OBRAZOVKE — skúška v bete.
 *
 * Jerry, 25. 9. 2026: „vedel by si mi v bete navrhnúť nejaký dashboard
 * najzákladnejších a najdôležitejších štatistík pre peniaze?"
 *
 * PREČO TO NIE JE DRUHÉ „DNES"
 *
 * Obrazovka Dnes hovorí o BEŽIACOM mesiaci — o tom, čo sa ešte dá ovplyvniť.
 * Táto hovorí o UZAVRETÝCH: ako to dopadlo, či to tak vyzerá dlhodobo, kam
 * peniaze naozaj odtekajú a čo ešte visí. Sú to dve rôzne otázky a preto sú
 * to dve obrazovky; zlúčiť ich by znamenalo miešať čísla, s ktorými sa dá
 * pohnúť, s tými, ktoré sú už napísané.
 *
 * PREČO UZAVRETÝ MESIAC, A NIE POSLEDNÝ S DÁTAMI
 *
 * Bežiaci mesiac má tržby priebežne a náklady až s bankovým výpisom. Zisk
 * z neho je tržba prezlečená za zisk — 9. 8. 2026 takto august vyzeral na
 * 34 155 Kč. `poslednyUzavretyIdx()` je jedno miesto, odkiaľ si to berú
 * všetky obrazovky.
 *
 * ŽIADNY NOVÝ VÝPOČET
 *
 * `pnlCalc`, `breakEvenRad`, `spocitajRezervu`, `byCommitment`, `salaryCalc`
 * a `jarekCalc` sú tie isté funkcie, ktoré kŕmia P&L, dlaždicu Rezerva aj
 * Jarvisov kontext. Break-even mal do 18. 8. 2026 šesť kópií a žiadne dve
 * obrazovky sa nezhodli; druhá kópia čohokoľvek odtiaľto by to zopakovala.
 */

const pct1 = (x: number) => `${x.toFixed(1).replace(".", ",")} %`;
const priemer = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function PeniazePrehlad({ data, onNavigate }: {
  data: PSBData;
  onNavigate?: (tab: string, sub?: string, focus?: { client?: string; nonce?: number }) => void;
}) {
  /**
   * Zoznam nezaplatených je ZABALENÝ a otvára ho klik na dlaždicu.
   *
   * Jerry, 25. 9. 2026: „tú tabuľku schovaj, daj ju úplne preč — ale keď
   * kliknem na Nezaplatené, nech sa objaví presne tam, kde je." Dvanásť
   * riadkov mien a súm je tu otvorených zbytočne: prehľad má odpovedať
   * číslom a rozpad si má vypýtať ten, kto ho práve potrebuje. Preto sa
   * vykresľuje NA MIESTE, hneď pod dlaždicami — nikam to neskočí.
   */
  const [nezaplateneOtvorene, setNezaplateneOtvorene] = useState(false);
  const [btcCzk, setBtcCzk] = useState<number | null>(null);
  const [ucet, setUcet] = useState<{ suma: number; datum: string } | null>(null);
  const [hotovost, setHotovost] = useState<{ suma: number; datum: string } | null>(null);

  useEffect(() => {
    void fetchBtcReserve(true).then((r) => setBtcCzk((r as { czk?: number } | null)?.czk ?? null)).catch(() => {});
    // Rovnaké čítanie ako na Dnes: účet z hlavičky výpisu, ručný zápis len
    // ako náhrada pre mesiace spred importu. Dva zostatky na dvoch
    // obrazovkách boli reálny stav appky do 27. 8. 2026.
    void fetchVzasSettings().then((st) => {
      const v = st["stav_penazi"] as { hotovost?: number; fio?: number; datum: string } | undefined;
      if (v && typeof v.hotovost === "number") setHotovost({ suma: v.hotovost, datum: v.datum });
      const fz = st["fio_zostatok"] as { suma?: number; datum: string } | undefined;
      if (fz && typeof fz.suma === "number") setUcet({ suma: fz.suma, datum: fz.datum });
      else if (v && typeof v.fio === "number") setUcet({ suma: v.fio, datum: v.datum });
    }).catch(() => {});
  }, []);

  const v = useMemo(() => {
    const p = pnlCalc();
    const be = breakEvenRad();
    const i = poslednyUzavretyIdx();
    const od = Math.max(0, i - 11);
    const idx = Array.from({ length: i - od + 1 }, (_, n) => od + n);

    const zisk12 = idx.map((n) => p.hrubyZisk[n]);
    const trzby12 = idx.map((n) => p.prijmy[n]);
    const naklady12 = idx.map((n) => p.celkoveNaklady[n]);
    const podBe = idx.filter((n) => p.prijmy[n] < be[n]).length;

    const trzbySpolu = trzby12.reduce((a, b) => a + b, 0);
    const marza12 = trzbySpolu > 0 ? (zisk12.reduce((a, b) => a + b, 0) / trzbySpolu) * 100 : 0;

    // Kam idú peniaze: výplaty sú najväčšia položka a v P&L riadkoch nie sú,
    // takže zoznam bez nich by tvrdil, že najviac stojí nájom.
    const suma = (rad: number[]) => idx.reduce((a, n) => a + (rad[n] || 0), 0);
    const polozky: { label: string; skupina: string; spolu: number }[] = [
      { label: "Výplata Jerry", skupina: "Výplaty", spolu: suma(p.poslaneJerry) },
      { label: "Výplata Terezka", skupina: "Výplaty", spolu: suma(p.poslaneTerezka) },
      { label: "Matyáš (DPP)", skupina: "Výplaty", spolu: suma(MATYAS) },
    ];
    for (const b of Object.values(byCommitment()))
      for (const it of b.items) polozky.push({ label: it.label, skupina: it.group, spolu: suma(it.values) });
    const vydajeSpolu = polozky.reduce((a, x) => a + x.spolu, 0);
    const top = polozky.filter((x) => x.spolu > 0).sort((a, b) => b.spolu - a.spolu).slice(0, 8);

    const dlhJerry = salaryCalc("jerry").cumDebt[i] || 0;
    const dlhTerezka = salaryCalc("terezka").cumDebt[i] || 0;
    const jk = jarekCalc().stav;
    const dlhJarek = jk[jk.length - 1] || 0;

    return {
      i, idx, p, be, zisk12, trzby12, naklady12, podBe, marza12,
      top, vydajeSpolu, mesiacov: idx.length,
      dlhJerry, dlhTerezka, dlhJarek,
      mesiac: VZAS_MONTH_LABELS[i] || VZAS_MONTHS[i] || "—",
      odDo: `${VZAS_MONTH_LABELS[od] || VZAS_MONTHS[od]} – ${VZAS_MONTH_LABELS[i] || VZAS_MONTHS[i]}`,
    };
    // vzasVerzia(): P&L aj výplaty plnia importy mimo Reactu.
  }, [vzasVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const rezerva = useMemo(
    () => spocitajRezervu({ btcCzk, ucet, hotovost, bePriem: breakEvenPriemer().bePriem }),
    [btcCzk, ucet, hotovost, vzasVerzia()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const nezaplatene = (data.poplatky || []).reduce((a, x) => a + x.suma, 0);
  const zisk = v.p.hrubyZisk[v.i];
  const trzby = v.p.prijmy[v.i];
  const beMes = v.be[v.i];
  const nadBe = trzby - beMes;
  const marzaMes = trzby > 0 ? (zisk / trzby) * 100 : 0;
  const chyba = chybaDoCiela(rezerva);
  const pasmoRezervy: Pasmo = rezerva.mesiace === null ? "nevie" : rezerva.mesiace >= CIEL_MESIACOV ? "ok" : rezerva.mesiace >= 1 ? "pozor" : "zle";

  const uzavrety: Pristroj[] = [
    {
      id: "pp-zisk",
      label: "Zisk",
      hodnota: fmtCZK(zisk),
      podnadpis: `marža ${pct1(marzaMes)}`,
      pasmo: zisk >= 0 ? "ok" : "zle",
      poznamka: nadBe >= 0
        ? `Tržby boli ${fmtCZK(nadBe)} nad break-evenom.`
        : `Tržby boli ${fmtCZK(-nadBe)} POD break-evenom — mesiac sa dotoval z rezervy.`,
      vysvetlenie: "Tržby mínus všetky náklady vrátane výplat. Jediné číslo, ktoré hovorí, či mesiac firmu posunul dopredu alebo dozadu.",
      seria: v.zisk12,
      kam: onNavigate ? () => onNavigate("vzas", "pnl") : undefined,
    },
    {
      id: "pp-trzby",
      label: "Tržby",
      hodnota: fmtCZK(trzby),
      podnadpis: "prijaté peniaze",
      pasmo: trzby >= beMes ? "ok" : "zle",
      poznamka: `Break-even mesiaca je ${fmtCZK(beMes)}.`,
      vysvetlenie: "Prijaté platby, nie súčet cien sedení. Pri každom piatom sedení je cena nulová, lebo platba visí na balíčku zaplatenom dopredu.",
      seria: v.trzby12,
      kam: onNavigate ? () => onNavigate("vzas", "trzby") : undefined,
    },
    {
      id: "pp-naklady",
      label: "Náklady",
      hodnota: fmtCZK(v.p.celkoveNaklady[v.i]),
      podnadpis: `z toho výplaty ${fmtCZK(v.p.vyplatySpolu[v.i])}`,
      pasmo: "ok",
      poznamka: "Výplaty sú najväčšia položka — preto sú v zozname nižšie zvlášť.",
      vysvetlenie: "Fixné aj variabilné náklady plus to, čo si tréneri reálne vzali. Break-even počíta s NÁROKOM, nie s vybratým — čo si niekto vezme navyše, je pôžička, nie náklad.",
      seria: v.naklady12,
      dobreHore: false,
      kam: onNavigate ? () => onNavigate("vzas", "pnl") : undefined,
    },
    {
      id: "pp-rezerva",
      label: "Rezerva",
      hodnota: rezerva.mesiace === null ? "—" : `${rezerva.mesiace.toFixed(1).replace(".", ",")} mes.`,
      podnadpis: rezerva.majetok === null ? "bez údajov" : fmtCZK(rezerva.majetok),
      pasmo: pasmoRezervy,
      poznamka: chyba !== null && chyba > 0
        ? `Do ${CIEL_MESIACOV} mesiacov chýba ${fmtCZK(chyba)}.`
        : `Cieľ ${CIEL_MESIACOV} mesiace je splnený.`,
      vysvetlenie: rezerva.uplna
        ? "Účet + hotovosť + bitcoin, delené PRIEMERNÝM break-evenom za pol roka. Nie tým z posledného mesiaca — runway sa neplánuje podľa najdrahšieho mesiaca."
        : "Pozor: chýba stav účtu alebo hotovosti, takže majetok je neúplný. Dopĺňa sa v Peniaze → Cashflow.",
      kam: onNavigate ? () => onNavigate("vzas", "cashflow") : undefined,
    },
  ];

  const dlhodobo: Pristroj[] = [
    {
      id: "pp-zisk12",
      label: `Ø zisk / mes.`,
      hodnota: fmtCZK(priemer(v.zisk12)),
      podnadpis: `${v.mesiacov} uzavretých mesiacov`,
      pasmo: priemer(v.zisk12) >= 0 ? "ok" : "zle",
      poznamka: v.podBe === 0
        ? "Ani jeden mesiac neskončil pod break-evenom."
        : `${v.podBe} z ${v.mesiacov} mesiacov skončilo POD break-evenom.`,
      vysvetlenie: "Jeden mesiac môže byť náhoda. Priemer za rok hovorí, či firma zarába, alebo len občas vyjde.",
      kam: onNavigate ? () => onNavigate("vzas", "pnl") : undefined,
    },
    {
      id: "pp-marza",
      label: "Marža (rok)",
      hodnota: pct1(v.marza12),
      podnadpis: `cieľ ${VZAS_TARGETS.marzaPct} %`,
      pasmo: v.marza12 >= VZAS_TARGETS.marzaPct ? "ok" : v.marza12 >= VZAS_TARGETS.marzaPct / 2 ? "pozor" : "zle",
      poznamka: "Medzikrok je 12–15 %, dlhodobý cieľ 20 %.",
      vysvetlenie: "Zisk za celé obdobie delený tržbami za celé obdobie — nie priemer mesačných marží. Ten by dal slabému mesiacu rovnakú váhu ako silnému.",
      kam: onNavigate ? () => onNavigate("vzas", "pnl") : undefined,
    },
    {
      id: "pp-nezaplatene",
      label: "Nezaplatené",
      hodnota: fmtCZK(nezaplatene),
      podnadpis: `${(data.poplatky || []).length} poplatkov · obaja tréneri`,
      pasmo: nezaplatene === 0 ? "ok" : nezaplatene > 30000 ? "zle" : "pozor",
      poznamka: nezaplatene === 0
        ? "Nikto nič nedlhuje."
        : `Predané balíčky a úvodné tréningy, ktoré PTminder eviduje ako nezaplatené. Klik ${nezaplateneOtvorene ? "zoznam zavrie" : "ukáže, kto a za čo"}.`,
      vysvetlenie: "Otvorené položky z PTminderu (Transactions). Po zaplatení sa tam mažú, takže čo je v zozname, je podľa PTmindera otvorené — ale platba a balíček sa nemusia stretnúť: kto poslal peniaze na účet a v PTminderi sa to nespárovalo, tu stále visí. Na Dnes je tá istá karta filtrovaná prepínačom trénera; tu sú zámerne obaja, lebo peniaze firmy sú jedny.",
      dobreHore: false,
      // Preklik viedol na Dnes a človek pristál hore na dashboarde — číslo
      // teda poslalo hľadať. Teraz rozbalí zoznam pod sebou a druhý klik ho
      // zase zavrie.
      kam: nezaplatene ? () => setNezaplateneOtvorene((x) => !x) : undefined,
    },
    {
      id: "pp-jarek",
      label: "Dlh voči Jarekovi",
      hodnota: fmtCZK(Math.abs(v.dlhJarek)),
      podnadpis: "zostáva splatiť z vkladu",
      pasmo: "ok",
      // Sčítať Jerryho a Terezkin zostatok nejde — majú opačný smer. Preto
      // veta, nie súčet (smerDlhu v prehladPasma.ts).
      poznamka: `Výplaty: ${smerDlhu("Jerry", "Jerrymu", v.dlhJerry, fmtCZK)} · ${smerDlhu("Terezka", "Terezke", v.dlhTerezka, fmtCZK)}.`,
      vysvetlenie: "Zostatok toho, čo Jarek do firmy vložil. Vedľa neho stoja zostatky výplat: kladný znamená, že firma dlží trénerovi, záporný, že si tréner vzal viac, než mu podľa nároku patrilo. Sú to dva opačné smery, preto sa nesčítavajú.",
      dobreHore: false,
      kam: onNavigate ? () => onNavigate("vzas", "jarek") : undefined,
    },
  ];

  return (
    <>
      <div style={{ fontSize: 11.5, color: C.textDim, margin: "0 0 12px", lineHeight: 1.5 }}>
        Posledný uzavretý mesiac je <b style={{ color: C.textMuted }}>{v.mesiac}</b>; dlhodobé čísla sú
        za <b style={{ color: C.textMuted }}>{v.odDo}</b>. Bežiaci mesiac tu nie je: má tržby priebežne
        a náklady až s bankovým výpisom, takže zisk z neho je tržba prezlečená za zisk.
      </div>

      <PristrojeMriezka
        titulok={`Ako dopadol ${v.mesiac}`}
        popis="uzavreté — už sa s tým nedá pohnúť"
        pristroje={uzavrety}
        stlpcov={4}
      />

      <PristrojeMriezka
        titulok="Ako to vyzerá dlhodobo"
        popis="jeden mesiac môže byť náhoda"
        pristroje={dlhodobo}
        stlpcov={4}
      />

      {nezaplatene > 0 && nezaplateneOtvorene && (
        <Card id="pp-zoznam-nezaplatene">
          <H3>
            <Info
              label={`Nezaplatené · ${(data.poplatky || []).length} položiek · ${fmtCZK(nezaplatene)}`}
              text="Zoznam je presne to, čo v PTminderi stojí ako otvorená transakcia — predaný balíček alebo úvodný tréning, ku ktorému sa nepripísala platba. Klik na riadok otvorí profil klienta, kde sú jeho platby a dá sa priradiť aj bankový prevod."
            />
            <button
              onClick={() => setNezaplateneOtvorene(false)}
              style={{ marginLeft: 10, background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}
            >
              zavrieť
            </button>
          </H3>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[...(data.poplatky || [])].sort((a, b) => b.datum.localeCompare(a.datum)).map((x) => (
              <button
                key={x.id}
                onClick={onNavigate ? () => onNavigate("klienti", undefined, { client: x.klient, nonce: Date.now() }) : undefined}
                style={{
                  display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left",
                  background: "none", border: "none", borderBottom: `1px solid ${mix(C.border, 40)}`,
                  padding: "7px 2px", margin: 0, cursor: onNavigate ? "pointer" : "default", fontFamily: "inherit",
                }}
              >
                <span style={{ width: 64, flexShrink: 0, fontSize: 11.5, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {`${Number(x.datum.slice(8, 10))}. ${Number(x.datum.slice(5, 7))}.`}
                </span>
                <span style={{ width: 170, flexShrink: 0, fontSize: 12.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x.klient}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {popisPoplatku(x.popis)}
                </span>
                <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtCZK(x.suma)}
                </span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Ten istý klient môže mať dva riadky — sú to dva predané balíčky, nie chyba. A riadok tu môže
            visieť aj po zaplatení, keď platba prišla na účet a v PTminderi sa k balíčku nepripísala.
          </div>
        </Card>
      )}

      <Card>
        <H3>
          <Info
            label={`Kam idú peniaze · ${v.odDo}`}
            text="Osem najväčších výdavkov za obdobie. Výplaty sú medzi nimi zámerne — sú najväčšia položka a v riadkoch P&L nie sú, takže zoznam bez nich by tvrdil, že najviac stojí nájom."
          />
        </H3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {v.top.map((x) => (
            <div key={`${x.skupina}|${x.label}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 190, flexShrink: 0, fontSize: 12.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {x.label}
                <span style={{ color: C.textDim }}> · {x.skupina}</span>
              </span>
              <div style={{ flex: 1, height: 10, background: mix(C.border, 45), borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${v.top[0].spolu ? (x.spolu / v.top[0].spolu) * 100 : 0}%`, height: "100%", background: C.accent }} />
              </div>
              <span style={{ width: 132, textAlign: "right", fontSize: 12.5, color: C.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {fmtCZK(x.spolu / v.mesiacov)}<span style={{ color: C.textDim, fontWeight: 400 }}>/mes</span>
                <span style={{ color: C.textDim, fontWeight: 400 }}> · {Math.round((x.spolu / Math.max(1, v.vydajeSpolu)) * 100)} %</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
