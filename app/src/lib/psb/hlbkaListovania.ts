/**
 * Hĺbka listovania — dokiaľ ľudia na webe dolistujú.
 *
 * PREČO TO VZNIKLO
 *
 * Web je vodorovné listovanie, takže „čas na stránke" ani scroll nemerajú nič.
 * 11. 10. 2026 povedal klient Jerrymu, že textu je na weboch veľa a dnes to
 * nikto nečíta; protiargument znel, že kto si rezervuje úvodný tréning po
 * štyroch fyzioterapeutoch, ten číta. Ani jedno sa nedalo overiť. Preto `web`
 * posiela pri každom posune hlbšie udalosť `obrazovka` s číslom obrazovky,
 * ich počtom a názvom; vlastné rozmery k nej pribudli v GA4 27. 10. 2026.
 *
 * 10. 11. 2026 dali prvé dva týždne odpoveď: na článkoch ľudia listujú až na
 * koniec, na úvodnej stránke odpadne po prvej obrazovke 83 % — a rozpad podľa
 * zariadenia ukázal, že to nie je obsahom: na telefóne listuje väčšina, na
 * počítači z 36 ľudí pokračoval jeden.
 *
 * TU JE LEN POČÍTANIE
 *
 * Dáta sťahuje `/api/google` akcia `hlbka` (GA4 runReport). Tento modul ich
 * len preskladá, aby sa to isté číslo dalo ukázať na obrazovke aj poslať
 * Jarvisovi bez druhého výpočtu.
 */

/** Riadok z GA4 runReport, ako ho vracia `/api/google` akcia `hlbka`. */
export type RiadokGa4 = {
  dimensionValues?: ({ value?: string } | undefined)[];
  metricValues?: ({ value?: string } | undefined)[];
};

export type Zariadenie = "pc" | "telefon" | "ine";

export type StrankaHlbky = {
  cesta: string;
  /** Koľko ľudí stránku otvorilo (menovateľ). 0 = nevie sa. */
  ludia: number;
  /** Koľko ľudí videlo 1., 2., … obrazovku. */
  krivka: number[];
  /** Názvy obrazoviek v tom istom poradí; prázdne, keď GA4 meno nemá. */
  nazvy: string[];
  /** Tie isté čísla podľa zariadenia — bez nich sa nedá povedať, čo opravovať. */
  podlaZariadenia: Record<Zariadenie, number[]>;
  /** Udalosti bez čísla obrazovky (spred registrácie rozmerov). */
  bezRozmeru: number;
  /** Posledná obrazovka, ktorú videla aspoň polovica najsilnejšej. */
  dokial: number;
  /** Najväčší pád: `od` je číslo obrazovky (1 = prvá), `podiel` 0–1. */
  pad: { od: number; podiel: number } | null;
};

const cislo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const text = (r: RiadokGa4, i: number): string => String(r.dimensionValues?.[i]?.value ?? "");

/** GA4 vracia „(not set)" ako hodnotu, nie ako prázdno. */
const chyba = (s: string): boolean => !s || s === "(not set)";

export function zariadenieZGa4(s: string): Zariadenie {
  const v = s.toLowerCase();
  if (v === "desktop") return "pc";
  if (v === "mobile") return "telefon";
  return "ine";
}

/**
 * Najväčší RELATÍVNY pád medzi susednými obrazovkami.
 *
 * Relatívny, nie absolútny: pád zo 41 na 7 a zo 6 na 1 je ten istý problém,
 * len na stránke s inou návštevnosťou. Obrazovka s nulou pred sebou sa
 * preskakuje — delenie nulou by vyrobilo „pád o nekonečno" tam, kde predtým
 * nebol nikto.
 */
export function najvacsiPad(krivka: number[]): { od: number; podiel: number } | null {
  let naj: { od: number; podiel: number } | null = null;
  for (let i = 1; i < krivka.length; i++) {
    const pred = krivka[i - 1] ?? 0;
    if (pred <= 0) continue;
    const podiel = (pred - (krivka[i] ?? 0)) / pred;
    if (podiel > 0 && (!naj || podiel > naj.podiel)) naj = { od: i, podiel };
  }
  return naj;
}

/**
 * Dokiaľ vydrží polovica.
 *
 * Meria sa od NAJSILNEJŠEJ obrazovky, nie od prvej: na /sluzby/ sa chodí
 * odkazom na `#cenik`, takže tretia obrazovka má viac ľudí než prvá a „od
 * prvej" by vyšlo, že neprežil nikto.
 */
export function dokialVydrzi(krivka: number[]): number {
  const max = Math.max(0, ...krivka);
  if (!max) return 0;
  let posledna = 1;
  for (let i = 0; i < krivka.length; i++) if ((krivka[i] ?? 0) >= max / 2) posledna = i + 1;
  return posledna;
}

/**
 * Preskladá odpoveď GA4 na stránky.
 *
 * `hlbka` má rozmery pagePath, cislo, nazov, deviceCategory a metriky
 * eventCount, totalUsers; `navstevy` pagePath, deviceCategory a
 * screenPageViews, totalUsers. Počíta sa z ĽUDÍ, nie z udalostí: jeden človek
 * sa vie na tú istú obrazovku vrátiť a krivka by potom rástla tam, kde ľudia
 * ubúdajú.
 */
export function hlbkaZoGa4(hlbka: RiadokGa4[], navstevy: RiadokGa4[] = []): StrankaHlbky[] {
  type Zber = {
    obrazovky: Map<number, number>;
    nazvy: Map<number, string>;
    zariadenia: Map<Zariadenie, Map<number, number>>;
    bezRozmeru: number;
  };
  const podlaStranky = new Map<string, Zber>();

  for (const r of Array.isArray(hlbka) ? hlbka : []) {
    const cesta = text(r, 0);
    if (!cesta) continue;
    const zber = podlaStranky.get(cesta) ?? {
      obrazovky: new Map<number, number>(),
      nazvy: new Map<number, string>(),
      zariadenia: new Map<Zariadenie, Map<number, number>>(),
      bezRozmeru: 0,
    };
    podlaStranky.set(cesta, zber);

    const ludia = cislo(r.metricValues?.[1]?.value);
    const surovecislo = text(r, 1);
    if (chyba(surovecislo)) {
      zber.bezRozmeru += ludia;
      continue;
    }
    const n = Math.round(Number(surovecislo));
    if (!Number.isFinite(n) || n < 1 || n > 200) continue;

    zber.obrazovky.set(n, (zber.obrazovky.get(n) ?? 0) + ludia);
    const nazov = text(r, 2);
    if (!chyba(nazov) && !zber.nazvy.has(n)) zber.nazvy.set(n, nazov);

    const z = zariadenieZGa4(text(r, 3));
    const rad = zber.zariadenia.get(z) ?? new Map<number, number>();
    rad.set(n, (rad.get(n) ?? 0) + ludia);
    zber.zariadenia.set(z, rad);
  }

  const ludiaNaStranke = new Map<string, number>();
  for (const r of Array.isArray(navstevy) ? navstevy : []) {
    const cesta = text(r, 0);
    if (!cesta) continue;
    ludiaNaStranke.set(cesta, (ludiaNaStranke.get(cesta) ?? 0) + cislo(r.metricValues?.[1]?.value));
  }

  const rad = (m: Map<number, number>, dlzka: number): number[] =>
    Array.from({ length: dlzka }, (_, i) => m.get(i + 1) ?? 0);

  const out: StrankaHlbky[] = [];
  for (const [cesta, zber] of podlaStranky) {
    const posledna = Math.max(0, ...zber.obrazovky.keys());
    if (!posledna) continue;
    const krivka = rad(zber.obrazovky, posledna);
    out.push({
      cesta,
      ludia: ludiaNaStranke.get(cesta) ?? 0,
      krivka,
      nazvy: Array.from({ length: posledna }, (_, i) => zber.nazvy.get(i + 1) ?? ""),
      podlaZariadenia: {
        pc: rad(zber.zariadenia.get("pc") ?? new Map(), posledna),
        telefon: rad(zber.zariadenia.get("telefon") ?? new Map(), posledna),
        ine: rad(zber.zariadenia.get("ine") ?? new Map(), posledna),
      },
      bezRozmeru: zber.bezRozmeru,
      dokial: dokialVydrzi(krivka),
      pad: najvacsiPad(krivka),
    });
  }

  // Najnavštevovanejšie hore: podľa ľudí na stránke, a keď ich GA4 nevie,
  // podľa najsilnejšej obrazovky — inak by stránka bez menovateľa spadla dole
  // bez ohľadu na to, koľko ľudí ňou prešlo.
  const vaha = (s: StrankaHlbky) => s.ludia || Math.max(0, ...s.krivka);
  return out.sort((a, b) => vaha(b) - vaha(a) || a.cesta.localeCompare(b.cesta));
}

/** Veta pod krivkou: čo sa na tej stránke deje. */
export function vetaOStranke(s: StrankaHlbky): string {
  const prva = s.krivka[0] ?? 0;
  const max = Math.max(0, ...s.krivka);
  if (prva < max) {
    const kde = s.krivka.indexOf(max) + 1;
    return `na túto stránku sa chodí odkazom rovno na ${kde}. obrazovku, tak sa krivka číta od nej`;
  }
  if (!s.pad) return "nikto neodpadol";
  const meno = s.nazvy[s.pad.od - 1] || `${s.pad.od}. obrazovka`;
  return `najväčší pád je ${s.pad.od}. → ${s.pad.od + 1}. (−${Math.round(s.pad.podiel * 100)} %) — ${meno} nepresvedčila listovať ďalej`;
}
