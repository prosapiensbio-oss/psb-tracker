import { useEffect, useMemo, useState } from "react";

import { type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel } from "../../lib/psb/format";
import { KANALY, MKT_MESACNE, marketingVerzia } from "../../lib/psb/marketing";
import { OBDOBIA_MESACNE, mesiaceVOkne } from "../../lib/psb/obdobia";
import { reklamaSuhrn, zReklamy } from "../../lib/psb/reklama";
import { coStym, holdRate, hookRate, medianHooku, pasmoCtr, pasmoFrekvencie, pasmoHook, type ReklamaRiadok } from "../../lib/psb/reklamaMetriky";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { jeKlient } from "./MarketingLievik";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka } from "./ui";

/**
 * Čo priniesla reklama — JEDNA karta namiesto štyroch.
 *
 * Do 18. 8. 2026 na túto otázku odpovedali štyri karty, každá vlastným
 * výpočtom a s vlastným prepínačom obdobia:
 *   „Čo to prinieslo" (výdavok ÷ úvodné), „Čo to stálo" (výdavok ÷ všetci
 *   noví), „Platená cesta" a „Kampane". Žiadne dve sa nezhodli — a podľa
 *   nich sa rozhodovalo o rozpočte.
 *
 * Karta hovorí dve čísla a hovorí ich oddelene, lebo odpovedajú na inú otázku:
 *   • CENA ZA KLIENTA Z REKLAMY — podľa nej sa rozhoduje o rozpočte,
 *   • ZMIEŠANÁ CENA — celý marketing ÷ všetci noví klienti; je nižšia, znie
 *     lepšie a obsahuje aj ľudí z odporúčaní, ktorí by prišli aj bez reklamy.
 *
 * Výpočet je v lib/psb/reklama.ts, aby sa dal otestovať a aby ho nemohla
 * žiadna obrazovka „mierne upraviť".
 */
export function Reklama({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [obdobie, setObdobie] = useState("12m");
  const kanaly = useMemo(() => KANALY, [marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kampane, setKampane] = useState<{ id: string; nazov: string; mesiac: string; ciel: string; spend: number }[]>([]);
  const [reklamy, setReklamy] = useState<ReklamaRiadok[]>([]);
  const [nacitane, setNacitane] = useState(false);

  useEffect(() => {
    // Kanály idú zo skladu (App.tsx ich načíta pri štarte); tu sa ťahá už len
    // Meta, ktorá v /api/marketing nie je.
    void fetch("/api/meta", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}))
      .then((meta) => {
        setKampane((meta as { kampane?: typeof kampane }).kampane || []);
        setReklamy((meta as { reklamy?: ReklamaRiadok[] }).reklamy || []);
      }).finally(() => setNacitane(true));
  }, []);

  // Okno mesiacov sa počíta rovnako ako v súhrne — tabuľka kreatívy musí
  // hovoriť o tom istom období ako čísla nad ňou.
  const oknoMesiacov = useMemo(() => new Set(mesiaceVOkne(obdobie, [...new Set([
    ...kanaly.map((k) => k.mesiac),
    ...kampane.map((k) => k.mesiac),
    ...reklamy.map((k) => k.mesiac),
    ...MKT_MESACNE.map((r) => r.m),
    ...data.leads.map((l) => monthKey(l.date)),
  ])].filter(Boolean).sort())), [kanaly, kampane, reklamy, obdobie, data.leads, marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => {
    // Mesiace, ktoré appka o reklame vôbec pozná — z nich sa vyberá okno.
    const vsetky = [...new Set([
      ...kanaly.map((k) => k.mesiac),
      ...kampane.map((k) => k.mesiac),
      ...MKT_MESACNE.map((r) => r.m),
      ...data.leads.map((l) => monthKey(l.date)),
    ])].filter(Boolean).sort();
    const mesiace = mesiaceVOkne(obdobie, vsetky);
    const okno = new Set(mesiace);

    const menaKlientov = Object.values(clients)
      .filter((c) => jeKlient(c, data.payments))
      .map((c) => c.name);
    // Noví klienti v okne — tá istá definícia (jeKlient), bez vrátených.
    const novychSpolu = Object.values(clients).filter((c) =>
      c.firstSession && !c.vratenie && okno.has(monthKey(c.firstSession)) && jeKlient(c, data.payments)).length;

    return reklamaSuhrn({
      mesiace, kanaly, kampane,
      mktMesacne: MKT_MESACNE.map((r) => ({ m: r.m, spend: r.spend })),
      dopyty: data.leads.map((l) => ({ date: l.date, name: l.name, source: l.source, kampan: l.kampan })),
      menaKlientov,
      // Tržba V OKNE, nie celoživotná — menovateľ (výdavok) je z okna, tak aj
      // čitateľ. Revízia 19. 8.: pri okne „3 mesiace" sa delila celoživotná
      // tržba klienta trojmesačným výdavkom a návratnosť vychádzala
      // nadhodnotená. Dnes latentné (0 dopytov so source='reklama'), prvý
      // reklamný dopyt by to zapol.
      trzbaKlienta: (meno) => data.payments
        .filter((p) => p.client === meno && okno.has(monthKey(p.date)))
        .reduce((a, p) => a + p.amount, 0),
      novychSpolu,
    });
    // marketingVerzia(): MKT_MESACNE plní import mimo Reactu.
  }, [data, clients, kanaly, kampane, obdobie, marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const zdroj = {
    kampane: "z kampaní v Meta API",
    zostava: "z mesačnej zostavy",
    metricool: "z Metricool exportu",
    ziadny: "—",
  }[v.zdrojVydavku];

  const cislo = (x: number | null, f = fmtCZK) => (x == null ? "—" : f(x));
  /**
   * Každé hlavičkové číslo otvorí zoznam riadkov, z ktorých vzniklo.
   * Metrika bez prekliku je nebezpečná aj keď je správna — keď sa pokazí,
   * nikto si nevšimne (revízia 19. 8. 2026). Zoznamy sú z `reklamaSuhrn`,
   * z TEJ ISTEJ slučky ako čísla — nie druhý výpočet.
   */
  const [zoznam, setZoznam] = useState<string | null>(null);
  const fmtDen = (d: string) => { const [r, m, dd] = (d || "").slice(0, 10).split("-"); return dd ? `${Number(dd)}. ${Number(m)}. ${r}` : d; };
  const zoznamy: Record<string, { nadpis: string; riadky: { meno: string; vpravo: string }[] }> = {
    minute: {
      nadpis: `Výdavok po mesiacoch ${zdroj} — čitateľ ceny za dopyt aj za klienta`,
      riadky: v.poMesiacoch.filter((r) => r.spend > 0).map((r) => ({ meno: r.mesiac, vpravo: fmtCZK(r.spend) })),
    },
    dopyty: {
      nadpis: `Dopyty so zdrojom „reklama“ alebo s kampaňou — ${v.platena.dopytov} ľudí (jeden človek = jeden dopyt, aj keď napísal dvakrát)`,
      riadky: v.platena.kto.dopyty.map((x) => ({ meno: x.meno || "(bez mena)", vpravo: `${fmtDen(x.datum)}${x.klient ? " · stal sa klientom" : ""}` })),
    },
    klienti: {
      nadpis: `Z reklamných dopytov klientmi (jeKlient: prišiel znova alebo zaplatil nad úvodný) — ${v.platena.klientov} z ${v.platena.dopytov}`,
      riadky: v.platena.kto.klienti.map((x) => ({ meno: x.meno, vpravo: `tržba v okne ${fmtCZK(x.trzbaVOkne)}` })),
    },
    cena: {
      nadpis: `Cena za klienta = ${fmtCZK(v.spend)} (výdavok, zoznam „Minuté“) ÷ ${v.platena.klientov} klientov (zoznam „Z nich klientov“)`,
      riadky: v.platena.kto.klienti.map((x) => ({ meno: x.meno, vpravo: `tržba v okne ${fmtCZK(x.trzbaVOkne)}` })),
    },
    navratnost: {
      nadpis: `Návratnosť = tržba v okne od klientov z reklamy ${fmtCZK(v.platena.trzba)} ÷ výdavok ${fmtCZK(v.spend)}`,
      riadky: v.platena.kto.klienti.map((x) => ({ meno: x.meno, vpravo: fmtCZK(x.trzbaVOkne) })),
    },
  };
  const stat = (kluc: string, hodnota: string, label: string, farba: string, info: string) => {
    const z = zoznamy[kluc];
    const je = zoznam === kluc;
    return (
      <div style={{ minWidth: 128 }}>
        <button onClick={() => setZoznam(je ? null : kluc)}
          title={z.riadky.length ? `Ukázať, z čoho číslo vzniklo (${z.riadky.length})` : "Za týmto číslom nie je žiadny riadok"}
          style={{ display: "flex", alignItems: "baseline", gap: 6, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: farba, fontVariantNumeric: "tabular-nums" }}>{hodnota}</span>
          <span style={{ fontSize: 10.5, color: C.textDim }}>{je ? "▾" : "▸"} {z.riadky.length}</span>
        </button>
        <div style={{ fontSize: 11.5, color: C.textMuted }}><Info text={info} label={label} /></div>
      </div>
    );
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <H3>
          <Info
            label="Čo priniesla reklama"
            text="Jedna karta na jednu otázku. Výdavok sa berie z jedného zdroja (nikdy sa nesčítavajú — popisujú tie isté peniaze) a reťaz ide až po tržbu. Platená cesta počíta LEN dopyty so zdrojom reklama alebo s kampaňou v UTM; zmiešaná cena delí výdavok všetkými novými klientmi vrátane tých z odporúčaní. Prvé číslo je na rozhodnutie o rozpočte, druhé je strop."
          />
        </H3>
        <FilterObdobia hodnota={obdobie} onChange={setObdobie} moznosti={OBDOBIA_MESACNE} />
      </div>

      {!nacitane ? (
        <Empty>Načítavam…</Empty>
      ) : v.spend === 0 && v.platena.dopytov === 0 ? (
        <Empty>Za toto obdobie nemám ani výdavok, ani dopyt z reklamy.</Empty>
      ) : (
        <>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "10px 0 6px" }}>
            {stat("minute", fmtCZK(v.spend), "Minuté", C.orange, `Výdavok na reklamu za zvolené obdobie, ${zdroj}. Zdroje sa nesčítavajú — mesačná zostava aj Metricool popisujú tie isté peniaze.`)}
            {stat("dopyty", String(v.platena.dopytov), "Dopytov z reklamy", C.blue, "Dopyty so zdrojom „reklama” alebo s vyplnenou kampaňou. Jeden človek, ktorý napísal dvakrát, je jeden dopyt.")}
            {stat("klienti", String(v.platena.klientov), "Z nich klientov", C.accentLight, "Klient = prišiel znova alebo zaplatil nad rámec úvodného. Úvodný tréning je platený, takže „má platbu” by splnil každý, kto naň prišiel.")}
            {stat("cena", cislo(v.platena.cenaZaKlienta), "Cena za klienta", v.platena.klientov ? C.text : C.textDim, "TOTO je číslo na rozhodnutie o rozpočte: výdavok ÷ klienti, ktorí prišli z reklamy. Strop je 2 200 Kč (hodnota klienta u Terezky).")}
            {stat("navratnost", v.platena.navratnost == null ? "—" : `${(v.platena.navratnost * 100).toFixed(0)} %`, "Návratnosť", v.platena.navratnost && v.platena.navratnost >= 1 ? C.green : C.textMuted, "Tržba od klientov z reklamy ÷ výdavok. Sto percent znamená, že sa reklama zaplatila.")}
          </div>

          {zoznam && zoznamy[zoznam] && (
            <div style={{ margin: "4px 0 10px", padding: "10px 13px", borderRadius: 9, background: mix(C.text, 4), border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.textMuted }}>{zoznamy[zoznam].nadpis}</span>
                <button onClick={() => setZoznam(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>zavrieť</button>
              </div>
              {zoznamy[zoznam].riadky.length === 0
                ? <div style={{ fontSize: 12, color: C.textDim }}>Za týmto číslom nie je ani jeden riadok — presne preto je „—“ alebo nula.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 300, overflowY: "auto" }}>
                  {zoznamy[zoznam].riadky.map((r, i) => (
                    <div key={`${r.meno}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                      <span style={{ color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meno}</span>
                      <span style={{ color: C.textDim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.vpravo}</span>
                    </div>
                  ))}
                </div>}
            </div>
          )}

          <div style={{ padding: "8px 12px", borderRadius: 9, background: mix(C.blue, 8), border: `1px solid ${mix(C.blue, 22)}`, fontSize: 12, color: C.textMuted, lineHeight: 1.55, margin: "8px 0 14px" }}>
            <b style={{ color: C.text }}>Zmiešaná cena {cislo(v.zmiesana.cenaZaKlienta)}</b> — ten istý výdavok delený
            všetkými {v.zmiesana.novychSpolu} novými klientmi v období. Je nižšia, ale obsahuje aj ľudí z odporúčaní,
            ktorí by prišli aj bez reklamy. Na rozhodnutie o rozpočte sa nehodí; je to strop, nie cena.
          </div>

          {v.poKampaniach.length > 0 && (
            <>
              {/* ── Čo robí kreatíva ──────────────────────────────────────
                  Kampaň povie, koľko to stálo; reklama povie prečo. Hook rate
                  pod 25 % znamená, že video nezastaví palec — a vtedy sa
                  rozpočtom nedá spraviť nič (rešerš 19. 8. 2026). */}
              {(() => {
                const vOkne = reklamy.filter((x) => oknoMesiacov.has(x.mesiac) && x.impressions > 0);
                if (!vOkne.length) return null;
                const podlaId = new Map<string, ReklamaRiadok>();
                for (const x of vOkne) {
                  const p2 = podlaId.get(x.id);
                  podlaId.set(x.id, p2 ? {
                    ...p2, spend: p2.spend + x.spend, impressions: p2.impressions + x.impressions,
                    clicks: p2.clicks + x.clicks, videnia2s: p2.videnia2s + x.videnia2s,
                    thruplay: p2.thruplay + x.thruplay,
                    ctr: (p2.clicks + x.clicks) / (p2.impressions + x.impressions) * 100,
                    cpm: (p2.spend + x.spend) / ((p2.impressions + x.impressions) / 1000),
                    // Vážený priemer zobrazeniami, nie maximum — stĺpec tvrdí
                    // „koľkokrát to ten istý človek videl" a maximum z dvoch
                    // mesiacov by trestalo reklamu za jeden zlý týždeň
                    // (revízia 19. 8. 2026).
                    frekvencia: (p2.frekvencia * p2.impressions + x.frekvencia * x.impressions) / (p2.impressions + x.impressions),
                  } : { ...x });
                }
                const zoradene = [...podlaId.values()].sort((a, b2) => b2.impressions - a.impressions).slice(0, 8);
                // Medián vlastných reklám — proti nemu sa hook porovnáva.
                const median = medianHooku([...podlaId.values()].map((x) => hookRate(x)));
                const farba = (p2: ReturnType<typeof pasmoHook>) => p2 === "dobre" ? C.green : p2 === "hranica" ? C.orange : p2 === "zle" ? C.red : C.textDim;
                return (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, margin: "4px 0 6px" }}>
                      <Info label="Čo robí kreatíva" text="Hook rate = koľko ľudí zastavilo aspoň na dve sekundy (dvojsekundové videnia ÷ zobrazenia; trojsekundové Meta zrušila). Porovnáva sa s MEDIÁNOM tvojich vlastných reklám, nie s benchmarkom z internetu: tie sú merané na trojsekundových videniach, ktoré Meta zrušila, a proti nim by vychádzalo všetko výborne. Hold rate hovorí, koľko z tých, čo zastavili, aj dopozeralo; vysoký hook s nízkym holdom znamená, že prácu urobila prvá sekunda a telo videa nedoručilo. CTR sa meria proti mediánu 2,19 % naprieč odvetviami (2026), frekvencia nad 3 pri malom publiku znamená únavu." />
                    </div>
                    <RolovaciaTabulka pocet={4}>
                      <thead>
                        <tr>
                          <th style={{ ...S.th, textAlign: "left" }}>Reklama</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Hook</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Hold</th>
                          <th style={{ ...S.th, textAlign: "right" }}>CTR</th>
                          <th style={{ ...S.th, textAlign: "right" }}>CPM</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Frekv.</th>
                          <th style={{ ...S.th, textAlign: "left" }}>Čo s tým</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zoradene.map((x) => {
                          const h = hookRate(x); const ho = holdRate(x);
                          return (
                            <tr key={x.id}>
                              <td style={{ ...S.td, color: C.text }}>{x.nazov || x.kampan}</td>
                              <td style={{ ...S.td, textAlign: "right", color: farba(pasmoHook(h, median)) }}>{h === null ? "—" : `${String(h).replace(".", ",")} %`}</td>
                              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{ho === null ? "—" : `${String(ho).replace(".", ",")} %`}</td>
                              <td style={{ ...S.td, textAlign: "right", color: farba(pasmoCtr(x.ctr)) }}>{x.ctr ? `${x.ctr.toFixed(2).replace(".", ",")} %` : "—"}</td>
                              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{x.cpm ? fmtCZK(x.cpm) : "—"}</td>
                              <td style={{ ...S.td, textAlign: "right", color: farba(pasmoFrekvencie(x.frekvencia)) }}>{x.frekvencia ? x.frekvencia.toFixed(1).replace(".", ",") : "—"}</td>
                              {/* Pri kampani na dosah či prehratia nie je klik cieľ —
                                  veta „ľudia neklikajú" by tam bola nezmysel. */}
                              <td style={{ ...S.td, color: C.textDim, fontSize: 11.5 }}>
                                {(() => {
                                  const veta = coStym(x, median);
                                  const ciel = kampane.find((k) => k.nazov === x.kampan)?.ciel || "";
                                  const naDosah = /AWARENESS|ENGAGEMENT|VIDEO/i.test(ciel);
                                  return naDosah && veta.includes("neklikajú") ? "" : veta;
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </RolovaciaTabulka>
                    <div style={{ fontSize: 11.5, color: C.textDim, margin: "6px 0 14px", lineHeight: 1.55 }}>
                      Hook sa porovnáva s mediánom tvojich vlastných reklám ({median ? `${String(median).replace(".", ",")} %` : "zatiaľ ich je málo"}),
                      nie s benchmarkom z internetu — tie sú merané na trojsekundových videniach, ktoré Meta zrušila.
                      CTR a frekvencia sa merajú proti odvetviu (medián 2,19 %, únava nad 3). Prázdny hook znamená, že reklama nebola video.
                    </div>
                  </>
                );
              })()}

              <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, margin: "4px 0 6px" }}>Po kampaniach</div>
              <RolovaciaTabulka pocet={4}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
                    <th style={{ ...S.th, textAlign: "left" }}>Cieľ</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Minuté</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Dopytov</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                  </tr>
                </thead>
                <tbody>
                  {v.poKampaniach.map((k) => (
                    <tr key={k.id}>
                      <td style={{ ...S.td, color: C.text }}>{k.nazov}</td>
                      <td style={{ ...S.td, color: C.textDim }}>{k.ciel}</td>
                      <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(k.spend)}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>{k.dopytov || "—"}</td>
                      <td style={{ ...S.td, textAlign: "right", color: k.klientov ? C.accentLight : C.textDim }}>{k.klientov || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </RolovaciaTabulka>
              <div style={{ fontSize: 11.5, color: C.textDim, margin: "8px 0 14px", lineHeight: 1.55 }}>
                Dopyt sa ku kampani priradí len cez UTM v odkaze. Prázdny stĺpec preto neznamená, že kampaň nič
                nepriviedla — znamená, že sa to nedá dokázať. Rozpočítať dopyty medzi kampane podľa výdavku by
                vyrobilo čísla, ktoré vyzerajú presne a nie sú ničím podložené.
              </div>
            </>
          )}

          {v.poMesiacoch.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, margin: "4px 0 6px" }}>Po mesiacoch</div>
              <RolovaciaTabulka pocet={4}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, textAlign: "left" }}>Mesiac</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Minuté</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Dopytov z reklamy</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Cena za klienta</th>
                  </tr>
                </thead>
                <tbody>
                  {[...v.poMesiacoch].reverse().map((r) => (
                    <tr key={r.mesiac}>
                      <td style={S.td}>{monthLabel(r.mesiac)}</td>
                      <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(r.spend)}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>{r.dopytov || "—"}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>{r.klientov || "—"}</td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: r.klientov ? C.text : C.textDim }}>
                        {r.klientov ? fmtCZK(r.spend / r.klientov) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </RolovaciaTabulka>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.55 }}>
                Mesiac bez klienta má prázdnu cenu, nie nulu — reklama v ňom nebola zadarmo, len sa nekúpila.
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
