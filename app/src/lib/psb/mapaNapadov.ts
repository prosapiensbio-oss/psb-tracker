/**
 * MYŠLIENKOVÁ MAPA NÁPADOV — čisté časti.
 *
 * Jerry, 7. 9. 2026: „znovu otváram nápad tvorby jednoduchej myšlienkovej
 * mapy, ktorá by sa potom previedla do textu, ktorý by som mohol s Jarvisom
 * prehodnotiť." Vtedy sám rozhodol počkať; postavené 25. 9. 2026.
 *
 * PREČO MAPA A NIE FORMULÁR
 *
 * Plánovač ho nútil vyplniť štruktúru skôr, než premyslel. On myslí opačne:
 * najprv vysype, potom usporadúva. Mapa je presne to — a preto má tretiu
 * vetvu „Zatiaľ neviem kam": miesto, kam nápad padne bez rozhodovania.
 *
 * ČO SME SI POŽIČALI OD SKUTOČNÝCH MINDMAP (MindMeister, MindMup, Miro)
 *
 * Kmeň, z ktorého všetko vyrastá; klávesnica namiesto myši (Tab = vetva
 * nižšie, Enter = ďalšia vedľa); rozloženie, ktoré sa počíta a neťahá sa
 * myšou; farba dedená z vetvy; zbaľovanie s počtom. A jedno pravidlo
 * z MindMupu, ktoré sa ľahko prehliadne: PRÁZDNY UZOL SA SÁM ZAHODÍ — inak
 * po každom omylom stlačenom Tabe zostane v dátach prázdny riadok.
 *
 * Tu žije len to, čo sa dá otestovať: vetvy, strom, rozloženie a preklad do
 * textu. Obrazovka je v `components/psb/MapaNapadov.tsx`.
 */

export type Vetva = { id: string; nazov: string; farba: string };

/**
 * Tri vetvy, nie päť. Prvé dve sú Jerryho dva lieviky zo 7. 9. 2026
 * (fasciový obsah na predaj knihy, ostatný obsah na rezerváciu úvodného);
 * tretia je odkladisko. Fázy nákupného cyklu sem NEPATRIA — tie sa priraďujú
 * až pri triedení, lebo rozhodnúť fázu skôr, než je nápad dopísaný, je presne
 * to, čo Jerrymu na plánovači vadilo.
 */
export const VETVY: Vetva[] = [
  { id: "uvodny", nazov: "→ úvodný tréning", farba: "#6EA45C" },
  { id: "kniha", nazov: "→ kniha", farba: "#d1854a" },
  { id: "nezaradene", nazov: "Zatiaľ neviem kam", farba: "#6d7560" },
];

export const VETVA_MAPA = new Map(VETVY.map((v) => [v.id, v]));
export const jeVetva = (v: unknown) => VETVA_MAPA.has(String(v));

export type Uzol = {
  id: string;
  text: string;
  /** Id nadradeného nápadu; prázdne = visí priamo na vetve. */
  rodic: string;
  /** Len pri koreňových (rodic === ""). */
  vetva: string;
  poradie: number;
  zbalene: boolean;
  /** Fáza nákupného cyklu, 0 = nezaradené. */
  faza: number;
};

/**
 * Do ktorej vetvy uzol patrí. Vetva sa NEUKLADÁ na každý uzol, len na
 * koreňový — inak by sa dve kópie tej istej pravdy raz rozišli a potomok by
 * svietil inou farbou než jeho vlastný rodič.
 *
 * Cyklus (rodič sám na seba, alebo kruh po presune) mapu nezacyklí: strop
 * zastaví hľadanie a vráti odkladisko.
 */
export function vetvaUzla(id: string, uzly: Uzol[]): string {
  const podla = new Map(uzly.map((u) => [u.id, u]));
  let n = podla.get(id);
  for (let i = 0; n && i < 60; i++) {
    if (!n.rodic) return jeVetva(n.vetva) ? n.vetva : "nezaradene";
    n = podla.get(n.rodic);
  }
  return "nezaradene";
}

export const farbaVetvy = (id: string) => VETVA_MAPA.get(id)?.farba ?? "#6d7560";

/** Deti uzla v poradí. Kľúč "" znamená korene danej vetvy. */
export function detiPodla(uzly: Uzol[]): Map<string, Uzol[]> {
  const m = new Map<string, Uzol[]>();
  for (const u of uzly) {
    const k = u.rodic || "";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(u);
  }
  for (const zoznam of m.values()) {
    zoznam.sort((a, b) => (a.poradie - b.poradie) || a.id.localeCompare(b.id));
  }
  return m;
}

/** Je uzol viditeľný, alebo ho zakrýva zbalený predok? */
export function viditelny(id: string, uzly: Uzol[]): boolean {
  const podla = new Map(uzly.map((u) => [u.id, u]));
  let n = podla.get(podla.get(id)?.rodic || "");
  for (let i = 0; n && i < 60; i++) {
    if (n.zbalene) return false;
    n = podla.get(n.rodic || "");
  }
  return true;
}

/** Všetci potomkovia uzla, do hĺbky. */
export function potomkovia(id: string, uzly: Uzol[]): Set<string> {
  const deti = detiPodla(uzly);
  const von = new Set<string>();
  const front = [id];
  for (let i = 0; i < front.length && i < 4000; i++) {
    for (const d of deti.get(front[i]) || []) {
      if (von.has(d.id)) continue;
      von.add(d.id);
      front.push(d.id);
    }
  }
  return von;
}

/**
 * Smie sa uzol zavesiť pod tento cieľ?
 *
 * Ťahanie myšou dovolí pustiť nápad kamkoľvek — aj pod jeho vlastného
 * potomka. Tým by v strome vznikol kruh: konár by sa odpojil od kmeňa,
 * z mapy by zmizol a rozloženie by sa točilo dovtedy, kým ho strop
 * nezastaví. Preto sa cieľ kontroluje PRED zápisom, nie potom.
 */
export function smiePresunut(id: string, cielId: string, uzly: Uzol[]): boolean {
  if (!id || id === cielId) return false;
  const u = uzly.find((x) => x.id === id);
  if (!u) return false;
  if (u.rodic === cielId) return false;          // už tam visí
  return !potomkovia(id, uzly).has(cielId);
}

export type Miesto = { x: number; y: number; w: number; hlbka: number };
export type Rozlozenie = { poz: Record<string, Miesto>; vyska: number };

/** Šírka bubliny podľa textu. Jedno miesto — kreslí sa z nej aj čiara. */
export const sirkaUzla = (text: string, hlbka: number) =>
  Math.max(hlbka <= 1 ? 200 : 150, Math.min(360, (text || "").length * 8.4 + (hlbka === 0 ? 118 : 104)));

/**
 * Rozloženie stromu zľava doprava.
 *
 * Rodič sedí v strede svojich detí, súrodenci pod sebou; nič sa neprekrýva
 * a nič sa neťahá myšou. Toto je celý rozdiel medzi mapou a nálepkovou
 * stenou: pozície sa POČÍTAJÚ, nepamätajú.
 */
export function rozlozMapu(uzly: Uzol[], koren = { x: 38, y: 28, text: "" }): Rozlozenie {
  const deti = detiPodla(uzly);
  const poz: Record<string, Miesto> = {};
  const RIADOK = 52;
  const MEDZERA = 76;

  const chod = (u: Uzol, x: number, yHore: number, hlbka: number): number => {
    const w = sirkaUzla(u.text, hlbka);
    const ds = u.zbalene ? [] : (deti.get(u.id) || []);
    if (!ds.length) {
      poz[u.id] = { x, y: yHore, w, hlbka };
      return RIADOK;
    }
    let y = yHore;
    let spolu = 0;
    for (const d of ds) {
      const h = chod(d, x + w + MEDZERA, y, hlbka + 1);
      y += h;
      spolu += h;
    }
    poz[u.id] = { x, y: yHore + spolu / 2 - RIADOK / 2, w, hlbka };
    return spolu;
  };

  // Vetvy sú tri pevné uzly medzi kmeňom a nápadmi; kreslia sa rovnako,
  // len nemajú riadok v databáze.
  const sirkaKmena = sirkaUzla(koren.text, 0);
  let y = koren.y;
  let spolu = 0;
  for (const v of VETVY) {
    const korene = (deti.get("") || []).filter((u) => (jeVetva(u.vetva) ? u.vetva : "nezaradene") === v.id);
    const xVetvy = koren.x + sirkaKmena + MEDZERA;
    const wVetvy = sirkaUzla(v.nazov, 1);
    let yv = y;
    let vSpolu = 0;
    for (const u of korene) {
      const h = chod(u, xVetvy + wVetvy + MEDZERA, yv, 2);
      yv += h;
      vSpolu += h;
    }
    if (!korene.length) vSpolu = RIADOK;
    poz["vetva:" + v.id] = { x: xVetvy, y: y + vSpolu / 2 - RIADOK / 2, w: wVetvy, hlbka: 1 };
    y += vSpolu;
    spolu += vSpolu;
  }
  poz["koren"] = { x: koren.x, y: koren.y + spolu / 2 - RIADOK / 2, w: sirkaKmena, hlbka: 0 };
  return { poz, vyska: koren.y + spolu + 60 };
}

/**
 * Z mapy zadanie vetami.
 *
 * Toto je dôvod, prečo mapa vzniká — nie obrázok, ale text, ktorý sa dá
 * podať Jarvisovi a nechať si doň rýpať. Preto tu nie je zoznam odrážok, ale
 * vety: čo sa chystá, koľko toho je, a hlavne ČO CHÝBA. Prázdna fáza je
 * v tomto texte to najcennejšie — na obrazovke sa dá prehliadnuť, vo vete nie.
 */
export function mapaNaText(uzly: Uzol[], v: {
  mesiac: string;
  kadenciaTyzdenne: number;
  nazovFazy: (f: number) => string;
}): string {
  const listy = uzly.filter((u) => (u.text || "").trim());
  const treba = Math.round(v.kadenciaTyzdenne * 4);
  const sFazou = listy.filter((u) => u.faza > 0);
  const riadky: string[] = [];

  riadky.push(`PLÁN OBSAHU · ${v.mesiac} · ${sFazou.length} ${sFazou.length === 1 ? "kus" : sFazou.length < 5 ? "kusy" : "kusov"} so zaradením`);
  riadky.push("");
  const podlaVetvy = VETVY.map((vt) => ({
    vetva: vt,
    kusy: listy.filter((u) => vetvaUzla(u.id, uzly) === vt.id),
  }));
  const doLievikov = podlaVetvy
    .filter((x) => x.vetva.id !== "nezaradene" && x.kusy.length)
    .map((x) => `${x.kusy.length} do „${x.vetva.nazov.replace("→ ", "")}“`);
  riadky.push(
    `Kadencia ${v.kadenciaTyzdenne} kusy do týždňa, teda ${treba} za mesiac. `
    + (doLievikov.length ? `Z toho ${doLievikov.join(" a ")}.` : "Zatiaľ nič nemieri do lievika."),
  );

  for (let f = 1; f <= 5; f++) {
    const kusy = listy.filter((u) => u.faza === f);
    if (!kusy.length) continue;
    riadky.push("");
    riadky.push(`Fáza ${f} · ${v.nazovFazy(f)} — ` + kusy.map((u) => {
      const vt = VETVA_MAPA.get(vetvaUzla(u.id, uzly));
      return `„${u.text.trim()}“${vt && vt.id !== "nezaradene" ? ` (${vt.nazov.replace("→ ", "")})` : ""}`;
    }).join(", ") + ".");
  }

  const chybajuce = [1, 2, 3, 4, 5].filter((f) => !listy.some((u) => u.faza === f));
  const bezFazy = listy.filter((u) => !u.faza);
  if (chybajuce.length || bezFazy.length || sFazou.length < treba) {
    riadky.push("");
    riadky.push("ČO CHÝBA");
    for (const f of chybajuce) {
      riadky.push(`· Fáza ${f} (${v.nazovFazy(f)}) nemá ani jeden kus.`);
    }
    if (sFazou.length < treba) {
      riadky.push(`· Do mesiaca chýba ${treba - sFazou.length} zaradených kusov.`);
    }
    if (bezFazy.length) {
      riadky.push(`· Bez fázy leží ${bezFazy.length}: ` + bezFazy.map((u) => `„${u.text.trim()}“`).join(", ") + ".");
    }
  }
  return riadky.join("\n");
}
