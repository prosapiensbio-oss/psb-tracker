// Čo priniesla reklama — JEDEN výpočet pre celú appku.
//
// PREČO TO VZNIKLO
//
// Na tú istú otázku odpovedali ŠTYRI karty, každá vlastným výpočtom:
//   • „Čo to prinieslo" (lievik)   — výdavok za rok ÷ úvodné tréningy, + LTV
//   • „Čo to stálo" (náklady)      — výdavok za mesiac ÷ všetci noví klienti
//   • „Platená cesta" (v nej)      — dopyty so zdrojom reklama → klienti
//   • „Kampane"                    — to isté po kampaniach z Meta API
//
// Štyri čísla, štyri rôzne menovatele a žiadne dve sa nezhodli. Jerry sa mal
// podľa nich rozhodnúť, či pridať rozpočet.
//
// PRAVIDLO, KTORÉ TENTO SÚBOR DRŽÍ
//
// Sú to DVE otázky a appka ich musí povedať oddelene:
//   1. PLATENÁ CESTA — koľko stál klient, ktorý prišiel Z REKLAMY. Toto je
//      číslo, podľa ktorého sa rozhoduje o rozpočte. Menovateľ sú výhradne
//      dopyty so zdrojom „reklama" (alebo s kampaňou v UTM).
//   2. ZMIEŠANÁ CENA — výdavok ÷ VŠETCI noví klienti. Je nižšia a znie lepšie,
//      ale obsahuje aj ľudí z odporúčaní, ktorí by prišli aj bez reklamy.
//      Nesmie sa použiť na rozhodnutie o rozpočte, len ako strop.
//
// Definícia klienta je jedna a je v MarketingLievik (`jeKlient`): prišiel
// znova, alebo zaplatil nad rámec úvodného. Sem sa podáva ako funkcia, aby
// knižnica nezávisela od obrazovky.

import { monthKey, normName } from "./format";
import { najdiKlienta } from "./compute";

export type ReklamaVstup = {
  /** Mesiace, za ktoré sa počíta — jedno okno pre VŠETKY čísla na karte. */
  mesiace: string[];
  /** Výdavok po mesiacoch z mesačnej zostavy (Meta Ads „Spent"). */
  kanaly: { mesiac: string; metrika: string; hodnota: number }[];
  /** Výdavok po mesiacoch z Metricool exportu — použije sa, keď zostava chýba. */
  mktMesacne: { m: string; spend: number }[];
  /** Kampane z Meta API (voliteľné). */
  kampane: { id: string; nazov: string; mesiac: string; ciel: string; spend: number }[];
  dopyty: { date: string; name: string; source: string; kampan?: string }[];
  /** Mená klientov, ktorí prešli prahom `jeKlient`. */
  menaKlientov: string[];
  /** Tržba klienta v okne — počíta volajúci, knižnica nepozná platby. */
  trzbaKlienta: (meno: string) => number;
  /** Počet VŠETKÝCH nových klientov v okne (pre zmiešanú cenu). */
  novychSpolu: number;
};

export type ReklamaSuhrn = {
  spend: number;
  /** Odkiaľ výdavok pochádza — na karte sa to musí dať prečítať. */
  zdrojVydavku: "zostava" | "metricool" | "kampane" | "ziadny";
  platena: {
    dopytov: number;
    klientov: number;
    trzba: number;
    cenaZaDopyt: number | null;
    cenaZaKlienta: number | null;
    /** Tržba ÷ výdavok. `null`, keď sa neminulo nič. */
    navratnost: number | null;
    /**
     * Kto stojí za číslami — mená z tej istej slučky, v ktorej vznikli.
     * Bez toho je „3 dopyty z reklamy" neoveriteľné očami: keď sa výpočet
     * pokazí, číslo vyzerá normálne a nikto si nevšimne (revízia 19. 8. 2026).
     */
    kto: {
      dopyty: { meno: string; datum: string; klient: boolean }[];
      klienti: { meno: string; trzbaVOkne: number }[];
    };
  };
  zmiesana: { novychSpolu: number; cenaZaKlienta: number | null };
  poMesiacoch: { mesiac: string; spend: number; dopytov: number; klientov: number }[];
  poKampaniach: { id: string; nazov: string; ciel: string; spend: number; dopytov: number; klientov: number }[];
};

/** Je tento dopyt z platenej cesty? */
export const zReklamy = (l: { source: string; kampan?: string }): boolean =>
  l.source === "reklama" || !!(l.kampan || "").trim();

export function reklamaSuhrn(v: ReklamaVstup): ReklamaSuhrn {
  const okno = new Set(v.mesiace);
  const vOkne = (d: string) => okno.has(monthKey(d));

  // ── Výdavok ────────────────────────────────────────────────────────────
  // Zdroje sa NESČÍTAVAJÚ: mesačná zostava aj Metricool popisujú tie isté
  // peniaze, len inak podrobne. Sčítať ich by výdavok zdvojnásobilo.
  const zoZostavy = new Map<string, number>();
  for (const r of v.kanaly) {
    if (!/spent|spend/i.test(r.metrika) || !okno.has(r.mesiac)) continue;
    zoZostavy.set(r.mesiac, (zoZostavy.get(r.mesiac) || 0) + r.hodnota);
  }
  const zMetricoolu = new Map<string, number>();
  for (const r of v.mktMesacne) {
    if (!okno.has(r.m) || !r.spend) continue;
    zMetricoolu.set(r.m, (zMetricoolu.get(r.m) || 0) + r.spend);
  }
  const zKampani = new Map<string, number>();
  for (const k of v.kampane) {
    if (!okno.has(k.mesiac)) continue;
    zKampani.set(k.mesiac, (zKampani.get(k.mesiac) || 0) + k.spend);
  }
  // Poradie dôvery: kampane z API (najpodrobnejšie a najčerstvejšie) →
  // mesačná zostava → Metricool export.
  const [spendPoMes, zdrojVydavku]: [Map<string, number>, ReklamaSuhrn["zdrojVydavku"]] =
    zKampani.size ? [zKampani, "kampane"]
      : zoZostavy.size ? [zoZostavy, "zostava"]
        : zMetricoolu.size ? [zMetricoolu, "metricool"]
          : [new Map(), "ziadny"];
  const spend = [...spendPoMes.values()].reduce((a, x) => a + x, 0);

  // ── Platená cesta ──────────────────────────────────────────────────────
  const dopytyOkno = v.dopyty.filter((l) => l.date && vOkne(l.date));
  const platene = dopytyOkno.filter(zReklamy);
  // Deduplikácia mien: jeden človek, ktorý napísal dvakrát, nie je dva dopyty.
  const videne = new Set<string>();
  let klientov = 0, trzba = 0, dopytov = 0;
  const ktoDopyty: { meno: string; datum: string; klient: boolean }[] = [];
  const ktoKlienti: { meno: string; trzbaVOkne: number }[] = [];
  for (const l of platene) {
    const kluc = normName(l.name || "");
    if (!kluc || videne.has(kluc)) continue;
    videne.add(kluc);
    dopytov++;
    // Fuzzy párovanie — „Lukáš Hanus" z dopytu a „Lukas Hanus" z PTmindera
    // je jeden človek (rovnako ako v lieviku a v Jarvisovom kontexte).
    const meno = najdiKlienta(v.menaKlientov, l.name || "");
    ktoDopyty.push({ meno: l.name || "", datum: l.date, klient: !!meno });
    if (!meno) continue;
    klientov++;
    const t = v.trzbaKlienta(meno);
    trzba += t;
    ktoKlienti.push({ meno, trzbaVOkne: t });
  }

  const podiel = (a: number, b: number) => (b > 0 ? a / b : null);

  // ── Rozpady — tie isté súčty, len inak pokrájané ───────────────────────
  const poMesiacoch = v.mesiace.map((m) => {
    const d = platene.filter((l) => monthKey(l.date) === m);
    const menaVidene = new Set<string>();
    let dk = 0, kk = 0;
    for (const l of d) {
      const kluc = normName(l.name || "");
      if (!kluc || menaVidene.has(kluc)) continue;
      menaVidene.add(kluc);
      dk++;
      if (najdiKlienta(v.menaKlientov, l.name || "")) kk++;
    }
    return { mesiac: m, spend: spendPoMes.get(m) || 0, dopytov: dk, klientov: kk };
  }).filter((r) => r.spend > 0 || r.dopytov > 0);

  const poKampaniach = (() => {
    const m = new Map<string, { id: string; nazov: string; ciel: string; spend: number; dopytov: number; klientov: number }>();
    for (const k of v.kampane) {
      if (!okno.has(k.mesiac)) continue;
      const e = m.get(k.id) || { id: k.id, nazov: k.nazov, ciel: k.ciel, spend: 0, dopytov: 0, klientov: 0 };
      e.spend += k.spend;
      m.set(k.id, e);
    }
    // Dopyt sa páruje na kampaň cez UTM. Bez UTM sa spárovať NEDÁ a je
    // čestnejšie nechať nulu než ho rozpočítať medzi kampane pomerom.
    // Deduplikácia menom AJ TU — hlavičkové „Dopytov z reklamy" ju má a bez
    // nej by súčet stĺpca vedel prevýšiť číslo nad ním (revízia 19. 8. 2026).
    const videneKampan = new Set<string>();
    for (const l of platene) {
      const kluc = (l.kampan || "").trim().toLowerCase();
      if (!kluc) continue;
      const menoKluc = `${kluc}|${normName(l.name || "")}`;
      if (normName(l.name || "") && videneKampan.has(menoKluc)) continue;
      videneKampan.add(menoKluc);
      for (const e of m.values()) {
        if (e.nazov.trim().toLowerCase() !== kluc) continue;
        e.dopytov++;
        if (najdiKlienta(v.menaKlientov, l.name || "")) e.klientov++;
      }
    }
    return [...m.values()].sort((a, b) => b.spend - a.spend);
  })();

  return {
    spend,
    zdrojVydavku,
    platena: {
      dopytov, klientov, trzba,
      cenaZaDopyt: podiel(spend, dopytov),
      cenaZaKlienta: podiel(spend, klientov),
      navratnost: podiel(trzba, spend),
      kto: { dopyty: ktoDopyty, klienti: ktoKlienti },
    },
    zmiesana: { novychSpolu: v.novychSpolu, cenaZaKlienta: podiel(spend, v.novychSpolu) },
    poMesiacoch,
    poKampaniach,
  };
}
