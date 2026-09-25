import { useEffect, useMemo, useState } from "react";

import { kotvaDat, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel } from "../../lib/psb/format";
import { CENA_ZA_DOPYT, DOPYTOV_MESACNE, KONVERZIA_DOPYTU, hodnot } from "../../lib/psb/hodnotenie";
import { KANALY, MKT_MESACNE, marketingVerzia } from "../../lib/psb/marketing";
import { diagnozaLievika, pasmoZoSkore } from "../../lib/psb/prehladPasma";
import { reklamaSuhrn } from "../../lib/psb/reklama";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { jeKlient, krokyZa, oknoMesiacov } from "./MarketingLievik";
import { SOURCES } from "./Klienti";
import { PristrojeMriezka, type Pristroj } from "./Prehlad";
import { Card, H3, Info } from "./ui";

/**
 * MARKETING NA JEDNEJ OBRAZOVKE — skúška v bete.
 *
 * Jerry, 25. 9. 2026: „vedel by si mi v bete navrhnúť nejaký dashboard
 * najzákladnejších a najdôležitejších štatistík pre marketing?"
 *
 * Marketing má deväť záložiek a v každej je pravda o jednom kanáli. Chýbala
 * odpoveď na otázku, ktorú si človek kladie ako prvú: BEŽÍ TO, ALEBO NIE?
 * Na tú sa dnes odpovedá tak, že sa preklikajú štyri karty a výsledok si
 * človek poskladá v hlave — čiže zakaždým inak.
 *
 * ČO JE TU A PREČO PRÁVE TOTO
 *
 * Lievik má štyri stupne (dopyt → úvodný → klient → tržba) a každý z nich má
 * vlastnú príčinu, keď sa pokazí. Dashboard preto nie je zoznam čísel, ale
 * tie štyri stupne v poradí, plus dve čísla o peniazoch (čo to stálo, čo to
 * prinieslo) a jeden zoznam (odkiaľ klienti naozaj prišli).
 *
 * KAŽDÉ ČÍSLO MÁ VETU, ČO S NÍM
 *
 * Jerryho vlastné meradlo: číslo bez akcie je zbytočné. Preto má každá
 * dlaždica poznámku, ktorá nehovorí, aké je to číslo, ale čo z neho plynie —
 * a preklik na miesto, kde sa s tým dá niečo urobiť.
 *
 * ŽIADNY NOVÝ VÝPOČET
 *
 * Všetko volá to, čo už v appke je: `krokyZa` (lievik), `reklamaSuhrn`
 * (peniaze za reklamu), `hodnot` (pásma). Druhá kópia ktoréhokoľvek z nich by
 * znamenala dve obrazovky s dvoma odpoveďami na tú istú otázku — presne tú
 * chorobu, ktorú appka opakovane liečila.
 */

/**
 * Koľko dopytov mesačne treba. Číslo z marketingového plánu (18 miest za pol
 * roka) — to isté, na ktorom stojí pásmo DOPYTOV_MESACNE v hodnotenie.ts.
 */
const CIEL_DOPYTOV = 10.5;

const pct = (cast: number, celok: number): number | null => (celok > 0 ? (cast / celok) * 100 : null);
const cislo1 = (x: number) => x.toFixed(1).replace(".", ",");

export function MarketingPrehlad({ data, clients, onNavigate }: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  onNavigate?: (tab: string, sub?: string) => void;
}) {
  const [kampane, setKampane] = useState<{ id: string; nazov: string; mesiac: string; ciel: string; spend: number }[]>([]);
  useEffect(() => {
    void fetch("/api/meta", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kampane?: typeof kampane }) => setKampane(j.kampane || []))
      .catch(() => {});
  }, []);

  const v = useMemo(() => {
    // Okno končí posledným PLNÝM mesiacom — bežiaci má napočítanú polovicu
    // dopytov a stiahol by každý priemer nadol (kotva dát, tá istá zásada
    // ako vo vrchnom páse Marketingu).
    const kotva = kotvaDat(data);
    const mesiace = oknoMesiacov(data, "12m").filter((x) => !kotva.plny || x <= kotva.plny);
    const okno = new Set(mesiace);
    const mes = Math.max(1, mesiace.length);
    const k = krokyZa(data, clients, mesiace);

    // Rady pre sparkliny — mesiac po mesiaci v poradí okna.
    const dopytyRad = mesiace.map((m) => data.leads.filter((l) => monthKey(l.date) === m).length);
    const noviPodlaMesiaca = new Map<string, number>();
    const noviKlienti = Object.values(clients).filter((c) =>
      c.firstSession && !c.vratenie && okno.has(monthKey(c.firstSession)) && jeKlient(c, data.payments));
    for (const c of noviKlienti) {
      const m = monthKey(c.firstSession);
      noviPodlaMesiaca.set(m, (noviPodlaMesiaca.get(m) || 0) + 1);
    }
    const noviRad = mesiace.map((m) => noviPodlaMesiaca.get(m) || 0);

    const menaKlientov = Object.values(clients).filter((c) => jeKlient(c, data.payments)).map((c) => c.name);
    const reklama = reklamaSuhrn({
      mesiace, kanaly: KANALY, kampane,
      mktMesacne: MKT_MESACNE.map((r) => ({ m: r.m, spend: r.spend })),
      dopyty: data.leads.map((l) => ({ date: l.date, name: l.name, source: l.source, kampan: l.kampan })),
      menaKlientov,
      trzbaKlienta: (meno) => data.payments
        .filter((p) => p.client === meno && okno.has(monthKey(p.date)))
        .reduce((a, p) => a + p.amount, 0),
      novychSpolu: noviKlienti.length,
    });

    // Odkiaľ noví klienti prišli. Zdroj sa vypĺňa ručne pri dopyte, takže
    // „nevyplnené" je samostatný riadok — bez neho by rebríček tvrdil, že
    // Instagram je silnejší, než v skutočnosti vieme.
    const podlaZdroja = new Map<string, number>();
    for (const c of noviKlienti) {
      const z = (c.zdroj || "").trim() || "—";
      podlaZdroja.set(z, (podlaZdroja.get(z) || 0) + 1);
    }
    const zdroje = [...podlaZdroja.entries()]
      .map(([kluc, pocet]) => ({
        kluc,
        label: kluc === "—" ? "nevyplnené" : (SOURCES.find((s) => s.value === kluc)?.label || kluc),
        pocet,
      }))
      .sort((a, b) => b.pocet - a.pocet || a.label.localeCompare(b.label));

    return { mesiace, mes, k, dopytyRad, noviRad, reklama, zdroje, noviKlienti, kotva };
    // marketingVerzia(): KANALY a MKT_MESACNE plní import mimo Reactu.
  }, [data, clients, kampane, marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const { k, mes, reklama } = v;
  const naDopyt = pct(k.zDopytuUvodny, k.dopyty);
  const naKlienta = pct(k.zUvodnehoKlient, k.uvodne);
  const zDopytuPct = pct(k.zDopytu, k.dopyty);
  const noviMes = v.noviKlienti.length / mes;
  const trzbaNaKlienta = v.noviKlienti.length ? k.trzba / v.noviKlienti.length : null;

  // Diagnóza sa najprv pýta na VSTUP a až potom na prechody — inak pri
  // zdravom lieviku posiela opravovať to, čo funguje (prehladPasma.ts).
  const diagnoza = diagnozaLievika({
    dopytyMes: k.dopyty / mes,
    cielDopytov: CIEL_DOPYTOV,
    naUvodny: naDopyt,
    naKlienta,
    dopytov: k.dopyty,
    klientov: v.noviKlienti.length,
  });

  const hDopyty = hodnot(k.dopyty / mes, DOPYTOV_MESACNE);
  const hKonverzia = hodnot(zDopytuPct, KONVERZIA_DOPYTU);
  const hCenaDopyt = hodnot(reklama.platena.cenaZaDopyt, CENA_ZA_DOPYT);
  const hCenaKlient = hodnot(reklama.platena.cenaZaKlienta, CENA_ZA_DOPYT);

  const obdobie = v.mesiace.length
    ? `${monthLabel(v.mesiace[0])} – ${monthLabel(v.mesiace[v.mesiace.length - 1])}`
    : "—";

  const lievik: Pristroj[] = [
    {
      id: "mp-dopyty",
      label: "Dopyty / mesiac",
      hodnota: cislo1(k.dopyty / mes),
      podnadpis: `${k.dopyty} za ${mes} mes.`,
      pasmo: pasmoZoSkore(hDopyty.skore, hDopyty.bezDat),
      poznamka: "Na zaplnenie 18 miest za pol roka treba 10,5 mesačne.",
      vysvetlenie: "Vstup do lievika. Keď je tu málo, nič ďalej v marketingu nepomôže — ostatné čísla len delia menšie číslo.",
      seria: v.dopytyRad,
      kam: onNavigate ? () => onNavigate("marketing", "dopyty") : undefined,
    },
    {
      id: "mp-uvodny",
      label: "Dopyt → úvodný",
      hodnota: naDopyt === null ? "—" : `${Math.round(naDopyt)} %`,
      podnadpis: `${k.zDopytuUvodny} z ${k.dopyty} dopytov`,
      pasmo: naDopyt === null ? "nevie" : naDopyt >= 60 ? "ok" : naDopyt >= 40 ? "pozor" : "zle",
      poznamka: "Kto sa ozve a nepríde, spadol na odpovedi alebo na termíne.",
      vysvetlenie: "Podiel dopytov, ktoré došli na úvodný tréning. Úvodný sa hľadá v celej histórii — dopyt z konca okna má termín pokojne o dva týždne neskôr.",
      kam: onNavigate ? () => onNavigate("marketing", "lievik") : undefined,
    },
    {
      id: "mp-klient",
      label: "Úvodný → klient",
      hodnota: naKlienta === null ? "—" : `${Math.round(naKlienta)} %`,
      podnadpis: `${k.zUvodnehoKlient} z ${k.uvodne} úvodných`,
      pasmo: naKlienta === null ? "nevie" : naKlienta >= 60 ? "ok" : naKlienta >= 40 ? "pozor" : "zle",
      poznamka: "Kto príde a nekúpi, rozhodol sa na tréningu — nie v reklame.",
      vysvetlenie: "Podiel úvodných tréningov, z ktorých sa stal platiaci klient (definícia jeKlient: prišiel znova, alebo zaplatil nad úvodný viac než 500 Kč).",
      kam: onNavigate ? () => onNavigate("marketing", "lievik") : undefined,
    },
    {
      id: "mp-novi",
      label: "Noví klienti / mes.",
      hodnota: cislo1(noviMes),
      podnadpis: `${v.noviKlienti.length} za ${mes} mes.`,
      pasmo: "ok",
      poznamka: "Výstup celého marketingu. Odchody sú v Klienti → Fluktuácia.",
      vysvetlenie: "Noví platiaci klienti, ktorí prišli prvýkrát v okne. Vrátení po pauze sa nepočítajú — tých marketing nepriviedol.",
      seria: v.noviRad,
      kam: onNavigate ? () => onNavigate("marketing", "lievik") : undefined,
    },
  ];

  const peniaze: Pristroj[] = [
    {
      id: "mp-cena-dopyt",
      label: "Cena za dopyt",
      hodnota: reklama.platena.cenaZaDopyt === null ? "—" : fmtCZK(reklama.platena.cenaZaDopyt),
      podnadpis: `${fmtCZK(reklama.spend)} ÷ ${reklama.platena.dopytov} dopytov z reklamy`,
      pasmo: pasmoZoSkore(hCenaDopyt.skore, hCenaDopyt.bezDat),
      poznamka: reklama.platena.dopytov === 0
        ? `Za ${mes} mesiacov sa ani jeden dopyt nezapísal ako z reklamy — bez toho sa cena nedá počítať. Zdroj sa vypĺňa v Dopytoch.`
        : "Cieľ je pod 1 000 Kč. Nad 2 200 Kč sa klient od Terezky nezaplatí.",
      vysvetlenie: "Iba PLATENÁ cesta: výdavok delený dopytmi, ktoré prišli z reklamy. Organické dopyty sem nepatria — nič nestáli.",
      dobreHore: false,
      kam: onNavigate ? () => onNavigate("marketing", "naklady") : undefined,
    },
    {
      id: "mp-cena-klient",
      label: "Cena za klienta",
      hodnota: reklama.platena.cenaZaKlienta === null ? "—" : fmtCZK(reklama.platena.cenaZaKlienta),
      podnadpis: `${reklama.platena.klientov} klientov z reklamy`,
      pasmo: pasmoZoSkore(hCenaKlient.skore, hCenaKlient.bezDat),
      poznamka: reklama.platena.klientov === 0
        ? "Z reklamy sa zatiaľ nezapísal ani jeden klient — rozpočet tak nemá podľa čoho rásť ani klesať."
        : "Podľa TOHTO čísla sa rozhoduje o rozpočte, nie podľa ceny za dopyt.",
      vysvetlenie: "Výdavok na reklamu delený klientmi, ktorí z nej prišli. Zmiešaná cena (celý výdavok ÷ všetci noví) je nižšia, ale obsahuje aj ľudí z odporúčaní — tí by prišli aj bez reklamy.",
      dobreHore: false,
      kam: onNavigate ? () => onNavigate("marketing", "naklady") : undefined,
    },
    {
      id: "mp-trzba",
      label: "Tržba od nových",
      hodnota: fmtCZK(k.trzba),
      podnadpis: trzbaNaKlienta === null ? `za ${mes} mes.` : `${fmtCZK(trzbaNaKlienta)} na klienta`,
      pasmo: "ok",
      poznamka: "Len od nových klientov v okne — obnovy starých marketing nepriviedol.",
      vysvetlenie: "Súčet PLATIEB nových klientov v okne. Nie súčet cien sedení: pri každom piatom sedení je cena nulová, lebo platba visí na balíčku.",
      kam: onNavigate ? () => onNavigate("marketing", "lievik") : undefined,
    },
    {
      id: "mp-vydaj",
      label: "Výdaj na reklamu",
      hodnota: fmtCZK(reklama.spend),
      podnadpis: `za ${mes} mes.`,
      pasmo: "ok",
      poznamka: reklama.spend > 0 && k.trzba > 0
        ? `Tržba od nových je ${cislo1(k.trzba / reklama.spend)}× výdaj — ale väčšina z nich neprišla z reklamy.`
        : "Bez výdaja sa cena za dopyt ani za klienta nedá počítať.",
      vysvetlenie: "Z Meta Marketing API, nie z Metricool exportu — ten pozná len boostnuté kusy z nahratého súboru a v mesiaci bez exportu je nula.",
      dobreHore: false,
      kam: onNavigate ? () => onNavigate("marketing", "naklady") : undefined,
    },
  ];

  const najvacsi = v.zdroje[0]?.pocet || 0;

  return (
    <>
      <div style={{ fontSize: 11.5, color: C.textDim, margin: "0 0 12px", lineHeight: 1.5 }}>
        Všetko na tejto obrazovke je za <b style={{ color: C.textMuted }}>{obdobie}</b> — posledných {mes} PLNÝCH
        mesiacov. Bežiaci mesiac sa nepočíta: má napočítanú polovicu dopytov a stiahol by každý priemer nadol.
      </div>

      <PristrojeMriezka
        titulok="Lievik"
        popis="štyri stupne v poradí — každý sa kazí z inej príčiny"
        pristroje={lievik}
        stlpcov={4}
      />

      {diagnoza && (
        <Card style={{ padding: "12px 14px", marginBottom: 12, borderColor: diagnoza.vazne ? mix(C.orange, 35) : C.border }}>
          <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
            <b style={{ color: diagnoza.vazne ? C.text : C.textMuted }}>{diagnoza.nadpis}</b>
            <br />
            {diagnoza.veta}
          </div>
        </Card>
      )}

      <PristrojeMriezka
        titulok="Čo to stálo a čo to prinieslo"
        popis="platená cesta zvlášť — organické dopyty nič nestáli"
        pristroje={peniaze}
        stlpcov={4}
      />

      <Card>
        <H3>
          <Info
            label="Odkiaľ noví klienti prišli"
            text="Zdroj sa vypĺňa ručne pri dopyte a pri klientovi. Riadok „nevyplnené“ je tu zámerne: bez neho by rebríček tvrdil, že kanál je silnejší, než o ňom v skutočnosti vieme."
          />
        </H3>
        {v.zdroje.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.textDim }}>V okne nepribudol ani jeden nový klient.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {v.zdroje.map((z) => (
              <div key={z.kluc} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 12.5, color: z.kluc === "—" ? C.textDim : C.textMuted }}>
                  {z.label}
                </span>
                <div style={{ flex: 1, height: 10, background: mix(C.border, 45), borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${najvacsi ? (z.pocet / najvacsi) * 100 : 0}%`,
                    height: "100%",
                    background: z.kluc === "—" ? mix(C.textDim, 45) : C.accent,
                  }} />
                </div>
                <span style={{ width: 62, textAlign: "right", fontSize: 12.5, color: C.text, fontWeight: 600 }}>
                  {z.pocet}
                  <span style={{ color: C.textDim, fontWeight: 400 }}>
                    {" "}· {Math.round((z.pocet / Math.max(1, v.noviKlienti.length)) * 100)} %
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
