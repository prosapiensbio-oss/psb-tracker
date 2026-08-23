/**
 * Mapa nákupného cyklu — jedna definícia fáz pre celú appku.
 *
 * PREČO FÁZY A NIE KATEGÓRIE
 *
 * Kategória („Edukácia", „Klientsky príbeh") hovorí, AKO je príspevok
 * urobený. Fáza hovorí, KOMU je určený — človeku, ktorý o probléme ešte
 * nevie, alebo tomu, ktorý sa rozhoduje medzi nami a fyzioterapiou. Sú to
 * dve nezávislé osi a plánovať sa dá len podľa tej druhej: v októbri
 * nechýbajú „karusely", chýbajú dôvody ozvať sa.
 *
 * Rámec je päť stavov uvedomenia (Eugene Schwartz) — ten istý, aký má
 * Jarvis v knižnici, aby si obrazovka a jeho odpoveď neprotirečili.
 *
 * ZAČIATOK JE ODHAD
 *
 * 116 zverejnených príspevkov (03/2025 – 08/2026) zaradil 23. 8. 2026 model
 * z textu háku, nie človek. Zaradenie sa dá pri každom príspevku prepísať
 * a starších 149 kusov zostáva nezaradených zámerne — dopočítať ich spätne
 * by vyrobilo presnosť, ktorá tam nie je.
 */

export type Faza = 0 | 1 | 2 | 3 | 4 | 5;

export type FazaDef = {
  id: Faza;
  nazov: string;
  /** Kto to je — jedna veta, ktorú Jerry číta pri plánovaní. */
  kto: string;
  /** Čo taký obsah má urobiť. */
  uloha: string;
  farba: string;
};

export const FAZY: FazaDef[] = [
  { id: 1, nazov: "Nevie o probléme", kto: "Necíti nič, alebo to má za normál.", uloha: "Ukázať, že otázka vôbec existuje.", farba: "#3E82A8" },
  { id: 2, nazov: "Tuší problém", kto: "Vie, že ho niečo bolí. Nevie, že sa s tým dá pracovať.", uloha: "Pomenovať príznak jeho slovami.", farba: "#3D9B99" },
  { id: 3, nazov: "Hľadá riešenie", kto: "Porovnáva fyzio, posilku, strečing, YouTube.", uloha: "Vysvetliť, prečo doterajšie pokusy nezabrali.", farba: "#6EA45C" },
  { id: 4, nazov: "Vyberá dodávateľa", kto: "Vie, čo chce. Rozhoduje sa medzi nami a niekým iným.", uloha: "Ukázať, ako to u nás vyzerá a v čom sme iní.", farba: "#C08F32" },
  { id: 5, nazov: "Rozhodnutý", kto: "Je pripravený. Chýba mu dôkaz a dôvod ozvať sa dnes.", uloha: "Dať výsledok konkrétneho človeka a jasný ďalší krok.", farba: "#B45038" },
];

export const FAZA_MAPA = new Map<number, FazaDef>(FAZY.map((f) => [f.id, f]));

export const jeFaza = (v: unknown): v is Faza => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 5;

/** Názov fázy pre výpisy — aj pre nezaradené, nech nikde nesvieti holá nula. */
export const nazovFazy = (f: number) => FAZA_MAPA.get(f)?.nazov ?? "Nezaradené";

/**
 * Os mapy: `dozadu` mesiacov histórie po kotvu a `dopredu` mesiacov na plán.
 *
 * Kotva je posledný mesiac s dátami (nie kalendár) — to je pravidlo, ktoré
 * v appke platí pre všetky grafy. Plánovacia časť ide ZA dnešok zámerne:
 * bez budúcich stĺpcov je mapa len prehliadka minulosti a plánovať sa v nej
 * nedá.
 */
export function osMapy(kotvaMesiac: string, dozadu = 12, dopredu = 4): string[] {
  if (!/^\d{4}-\d{2}$/.test(kotvaMesiac)) return [];
  const [r, m] = kotvaMesiac.split("-").map(Number);
  const out: string[] = [];
  for (let i = -dozadu + 1; i <= dopredu; i++) {
    const d = new Date(Date.UTC(r, m - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Krátky tvar mesiaca pre hlavičku stĺpca: „9." a rok len pri januári. */
export function popisMesiaca(m: string): { mesiac: string; rok: string } {
  const [r, mm] = m.split("-");
  return { mesiac: `${Number(mm)}.`, rok: mm === "01" ? r : "" };
}

export type SlotPlanu = {
  id: string;
  faza: number;
  mesiac: string;
  /** O čom to bude — návrh captionu alebo popis. */
  koncept: string;
  /** Kto v tom vystupuje: klient, Jerry, Terezka. */
  kto: string;
  /** Pôvodná veta nápadu. */
  text: string;
  zdroj: string;
  stav: string;
};

export type ZverejnenyKus = {
  datum: string;
  mesiac: string;
  faza: number;
  hook: string;
  dosah: number;
  ulozenia: number;
};

export type Bunka = {
  mesiac: string;
  faza: number;
  /** Čo v tom mesiaci a fáze už vyšlo. */
  vyslo: ZverejnenyKus[];
  /** Čo je na ten mesiac a fázu naplánované. */
  plan: SlotPlanu[];
};

/**
 * Mriežka mesiac × fáza. Prázdna bunka je informácia, preto sa vyrábajú
 * všetky — nie len tie, kde niečo je.
 */
export function mriezka(os: string[], vyslo: ZverejnenyKus[], plan: SlotPlanu[]): Map<string, Bunka> {
  const out = new Map<string, Bunka>();
  for (const m of os) for (const f of FAZY) out.set(`${m}|${f.id}`, { mesiac: m, faza: f.id, vyslo: [], plan: [] });
  for (const p of vyslo) {
    const b = out.get(`${p.mesiac}|${p.faza}`);
    if (b) b.vyslo.push(p);
  }
  for (const s of plan) {
    const b = out.get(`${s.mesiac}|${s.faza}`);
    if (b) b.plan.push(s);
  }
  return out;
}

/**
 * Koľko toho v danej fáze za posledných `okno` mesiacov vyšlo — podklad pre
 * vetu „na túto fázu si za pol roka nedal nič".
 */
export function tempoFaz(os: string[], vyslo: ZverejnenyKus[], kotva: string, okno = 6): Map<number, number> {
  const od = os.filter((m) => m <= kotva).slice(-okno);
  const set = new Set(od);
  const out = new Map<number, number>(FAZY.map((f) => [f.id, 0]));
  for (const p of vyslo) if (set.has(p.mesiac)) out.set(p.faza, (out.get(p.faza) || 0) + 1);
  return out;
}

/**
 * Text, ktorý si Jerry skopíruje do Claude Projectu.
 *
 * PREČO NIE LEN KONCEPT
 *
 * Project nevidí do Kokpitu. Keď mu pošleš holú vetu „reel o tom, že úľava
 * po fyziu vydrží tri dni", nevie, komu je určená ani čo má urobiť — a napíše
 * text pre niekoho iného. Fáza, publikum a úloha sú tri riadky, ktoré z toho
 * robia zadanie namiesto námetu.
 *
 * PREČO SA PRIPOMÍNA MENO KLIENTA
 *
 * V appke je pole „kto v tom vystupuje" a býva v ňom meno. Do textu, ktorý
 * pôjde von, meno ani zdravotný detail nepatria — v Zadaní je to pravidlo od
 * začiatku a tu sa naň dá zabudnúť práve preto, že sa kopíruje jedným klikom.
 */
export function zadanieProProject(s: {
  mesiac: string; faza: number; koncept: string; kto: string;
}): string {
  const f = FAZA_MAPA.get(s.faza);
  const riadky = [
    `Obsah pre PSB na ${s.mesiac || "neurčený mesiac"}.`,
    "",
    `FÁZA NÁKUPNÉHO CYKLU: ${f?.nazov ?? nazovFazy(s.faza)}`,
    `KTO TO ČÍTA: ${f?.kto ?? "—"}`,
    `ČO MÁ OBSAH UROBIŤ: ${f?.uloha ?? "—"}`,
    "",
    "O ČOM TO BUDE:",
    s.koncept.trim() || "(koncept nie je vyplnený)",
  ];
  if (s.kto.trim()) riadky.push("", `KTO V TOM VYSTUPUJE: ${s.kto.trim()}`);
  riadky.push(
    "",
    "ČO CHCEM SPÄŤ: hotový text príspevku v češtine — hák, telo, záver.",
    "Meno klienta ani zdravotný detail do textu nedávaj; použi opis typu: klient, ktorý…",
  );
  return riadky.join("\n");
}
