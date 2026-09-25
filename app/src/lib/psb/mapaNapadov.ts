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

/**
 * Farby, ktoré si bublina môže vziať na seba.
 *
 * Krátky zoznam, nie paleta: každá voľba navyše je rozhodnutie urobené
 * namiesto napísania ďalšieho nápadu. Prázdna („podľa vetvy") je prvá, lebo
 * je to predvolený a najčastejší stav.
 */
export const FARBY: { id: string; nazov: string; farba: string }[] = [
  { id: "zlta", nazov: "žltá", farba: "#C9A227" },
  { id: "zelena", nazov: "zelená", farba: "#6EA45C" },
  { id: "modra", nazov: "modrá", farba: "#3E82A8" },
  { id: "fialova", nazov: "fialová", farba: "#8A6FB0" },
  { id: "cervena", nazov: "červená", farba: "#B45038" },
  { id: "siva", nazov: "sivá", farba: "#8A9180" },
];
export const FARBA_MAPA = new Map(FARBY.map((f) => [f.id, f]));
export const jeFarba = (v: unknown) => FARBA_MAPA.has(String(v));
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
  /** Stav nápadu z karty Nápady: novy | pouzity | zamietnuty. */
  stav?: string;
  /** Vlastná farba bubliny; prázdne = podľa vetvy. */
  farba?: string;
  /** Ručne posunutá bublina. `null` = nechaj to na výpočet. */
  posX?: number | null;
  posY?: number | null;
};

/** Nápad, ktorý sa ešte len chystá — publikovaný sa do plánu nepočíta. */
export const jeNaPlan = (u: Uzol) => !!(u.text || "").trim() && u.stav !== "pouzity" && u.stav !== "zamietnuty";

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

/** Akú farbu má bublina: vlastnú, inak tú z vetvy. */
export const farbaUzla = (u: Uzol, uzly: Uzol[]) =>
  FARBA_MAPA.get(u.farba || "")?.farba ?? farbaVetvy(vetvaUzla(u.id, uzly));

/** Deti uzla v poradí. Kľúč "" znamená korene danej vetvy. */
export function detiPodla(uzly: Uzol[]): Map<string, Uzol[]> {
  const m = new Map<string, Uzol[]>();
  const su = new Set(uzly.map((u) => u.id));
  for (const u of uzly) {
    // SIROTA: rodič, ktorý v zozname nie je (zamietnutý v karte Nápady,
    // zmazaný slot, odrezaný stropom dopytu). Bez tejto vetvy by uzol
    // nedostal pozíciu, z mapy by zmizol — a keďže sa nekreslí, nedal by sa
    // ani vrátiť späť. Visí teda na vetve ako koreň a je vidieť.
    const k = u.rodic && su.has(u.rodic) ? u.rodic : "";
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
export type Rozlozenie = { poz: Record<string, Miesto>; vyska: number; sirka: number };

/** Šírka bubliny podľa textu. Jedno miesto — kreslí sa z nej aj čiara. */
export const sirkaUzla = (text: string, hlbka: number) =>
  Math.max(hlbka <= 1 ? 200 : 150, Math.min(360, (text || "").length * 8.4 + (hlbka === 0 ? 118 : 104)));

/** Výška jedného riadku mapy. Kreslí z nej rozloženie, čiary aj trafenie cieľa. */
export const RIADOK = 52;
export type RucnePozicie = Record<string, { x: number; y: number }>;

/** Stred pracovnej plochy. Plátno je pevné, aby ručné súradnice platili. */
export const PLATNO = { sirka: 3200, vyska: 2200 };
export const STRED = { x: PLATNO.sirka / 2, y: PLATNO.vyska / 2 };
/** Medzera medzi stĺpcami a medzi riadkami. */
export const MEDZERA_X = 74;
export const MEDZERA_Y = 14;
/** Výška jedného riadku aj s medzerou pod ním. */
export const KROK_Y = RIADOK + MEDZERA_Y;

/**
 * Na ktorú stranu kmeňa vetva rastie. Dve vpravo, jedna vľavo — tak, ako to
 * robia klasické mindmapy: kmeň v strede, konáre na obe strany.
 */
export const STRANA_VETVY: Record<string, 1 | -1> = { uvodny: 1, kniha: 1, nezaradene: -1 };

/**
 * ROZLOŽENIE V STĹPCOCH, NIE DOKOLA.
 *
 * Jerry, 25. 9. 2026: „z hlavnej bubliny ide prvá vrstva, z nej ďalšia, ale
 * hneď pod ňu a hneď ďalšia pod ňu; keď chcem rozšíriť túto, rozšíri sa
 * o radu ďalej — a nové bubliny sa zoraďujú pod seba a nie dokolečka, aby
 * myšlienky ostali pri sebe."
 *
 * Radiálne rozloženie z prvej verzie rozhádzalo súrodencov po oblúku a dva
 * nápady, ktoré patria k sebe, skončili na opačných koncoch výseku. Tu je
 * každá úroveň jeden STĹPEC a súrodenci stoja pod sebou — presne tak, ako to
 * má MindMeister aj XMind.
 *
 * Konár si drží vlastný blok výšky: rodič sedí v strede svojich detí, takže
 * sa nič neprekrýva a otvorenie vetvy odsunie susedov nadol, nie cez seba.
 */
export function rozlozMapu(
  uzly: Uzol[],
  koren: { text: string } = { text: "" },
  /** Ručné miesta kmeňa a vetiev — kľúče "koren" a "vetva:<id>". */
  rucne: RucnePozicie = {},
): Rozlozenie {
  const deti = detiPodla(uzly);
  const poz: Record<string, Miesto> = {};

  const uloz = (kluc: string, sx: number, sy: number, text: string, hlbka: number) => {
    const w = sirkaUzla(text, hlbka);
    poz[kluc] = { x: sx - w / 2, y: sy - RIADOK / 2, w, hlbka };
  };

  /** Koľko miesta zvisle zaberie uzol aj so svojím otvoreným konárom. */
  const blok = (u: Uzol, strop = 0): number => {
    const ds = u.zbalene || strop > 40 ? [] : (deti.get(u.id) || []);
    if (!ds.length) return KROK_Y;
    return ds.reduce((a, d) => a + blok(d, strop + 1), 0);
  };

  /**
   * Položí uzol na stred svojho bloku a jeho deti do ďalšieho stĺpca.
   * `x` je stred bubliny, `yHore` vrch prideleného bloku.
   */
  const chod = (u: Uzol, x: number, yHore: number, strana: 1 | -1, hlbka: number) => {
    const w = sirkaUzla(u.text, hlbka);
    const rucneTu = u.posX != null && u.posY != null;
    const h = blok(u);
    const sx = rucneTu ? (u.posX as number) : x;
    const sy = rucneTu ? (u.posY as number) : yHore + h / 2;
    uloz(u.id, sx, sy, u.text, hlbka);
    const ds = u.zbalene ? [] : (deti.get(u.id) || []);
    if (!ds.length) return;
    // Deti začínajú v ďalšom stĺpci a stoja pod sebou. Pri ručne posunutom
    // rodičovi sa počítajú od neho — konár ide s ním.
    let y = rucneTu ? sy - ds.reduce((a, d) => a + blok(d), 0) / 2 : yHore;
    for (const d of ds) {
      const hd = blok(d);
      const wd = sirkaUzla(d.text, hlbka + 1);
      chod(d, sx + strana * (w / 2 + MEDZERA_X + wd / 2), y, strana, hlbka + 1);
      y += hd;
    }
  };

  const stredKmena = rucne["koren"] || STRED;
  const wKoren = sirkaUzla(koren.text, 0);
  uloz("koren", stredKmena.x, stredKmena.y, koren.text, 0);

  // Každá strana sa zvisle vycentruje na kmeň, aby mapa nevisela nadol.
  for (const strana of [1, -1] as const) {
    const naStrane = VETVY.filter((v) => (STRANA_VETVY[v.id] ?? 1) === strana);
    const bloky = naStrane.map((v) => {
      const korene = (deti.get("") || []).filter((u) => (jeVetva(u.vetva) ? u.vetva : "nezaradene") === v.id);
      const h = korene.reduce((a, u) => a + blok(u), 0) || KROK_Y;
      return { v, korene, h };
    });
    const spolu = bloky.reduce((a, b) => a + b.h, 0);
    let y = stredKmena.y - spolu / 2;
    for (const { v, korene, h } of bloky) {
      const wv = sirkaUzla(v.nazov, 1);
      const rucnaVetva = rucne["vetva:" + v.id];
      const vx = rucnaVetva ? rucnaVetva.x : stredKmena.x + strana * (wKoren / 2 + MEDZERA_X + wv / 2);
      const vy = rucnaVetva ? rucnaVetva.y : y + h / 2;
      uloz("vetva:" + v.id, vx, vy, v.nazov, 1);
      let yd = rucnaVetva ? vy - (korene.reduce((a, u) => a + blok(u), 0) || KROK_Y) / 2 : y;
      for (const u of korene) {
        const wu = sirkaUzla(u.text, 2);
        chod(u, vx + strana * (wv / 2 + MEDZERA_X + wu / 2), yd, strana, 2);
        yd += blok(u);
      }
      y += h;
    }
  }

  // Plátno sa roztiahne na to, čo doň konáre a ručné posuny vytlačili.
  let maxX = PLATNO.sirka;
  let maxY = PLATNO.vyska;
  for (const m of Object.values(poz)) {
    maxX = Math.max(maxX, m.x + m.w + 160);
    maxY = Math.max(maxY, m.y + RIADOK + 160);
  }
  return { poz, vyska: maxY, sirka: maxX };
}

/** Koľko kusov obsahu je mesiac pri danej týždennej kadencii. Jedno miesto. */
export const kusovNaMesiac = (kadenciaTyzdenne: number) => Math.round(kadenciaTyzdenne * 4);

export function mapaNaText(uzly: Uzol[], v: {
  mesiac: string;
  kadenciaTyzdenne: number;
  nazovFazy: (f: number) => string;
}): string {
  // Do plánu sa počíta len to, čo sa ešte len chystá. Publikovaný nápad
  // v zásobníku by inak vyhlásil mesiac za pokrytý obsahom, ktorý už vyšiel.
  const listy = uzly.filter(jeNaPlan);
  const treba = kusovNaMesiac(v.kadenciaTyzdenne);
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

/**
 * HROMADNÉ VYSYPANIE: jeden riadok = jeden nápad.
 *
 * Jerryho vlastná veta znie „najprv vysypem, potom usporiadam" — a vysypanie
 * dvadsiatich nápadov po jednom Tabe je presne tá práca, ktorej sa mal
 * zbaviť. Toto je to isté, čo má Miro ako Bulk mode a XMind pri vložení
 * textu zo schránky: text z poznámok v telefóne sa vloží naraz.
 *
 * ODSADENIE DRŽÍ HIERARCHIU. Riadok odsadený tabulátorom alebo dvoma
 * medzerami je potomkom predošlého plytšieho riadku — tak, ako si človek
 * píše poznámky. Bez toho by sa z odsadeného zoznamu stala plochá kopa
 * a usporiadanie by sa muselo urobiť znova.
 *
 * Odrážky na začiatku (`-`, `*`, `•`, `1.`) sa zahadzujú: sú to znaky
 * zoznamu, nie súčasť nápadu.
 */
export type VysypRiadok = { text: string; uroven: number };

export function rozparsujVysyp(vstup: string): VysypRiadok[] {
  const von: VysypRiadok[] = [];
  for (const surovy of (vstup || "").split(/\r?\n/)) {
    if (!surovy.trim()) continue;
    const odsadenie = /^[\t ]*/.exec(surovy)?.[0] ?? "";
    // Tabulátor je jedna úroveň, dve medzery tiež — obe sa v poznámkach bežne
    // miešajú a rozlišovať ich by znamenalo hádať, čo mal človek na mysli.
    const uroven = (odsadenie.match(/\t/g)?.length ?? 0) + Math.floor(odsadenie.replace(/\t/g, "").length / 2);
    const text = surovy.trim().replace(/^(?:[-*•–]|\d+[.)])\s*/, "").trim();
    if (text) von.push({ text, uroven: Math.min(uroven, 6) });
  }
  // Prvý riadok je vždy na nule, nech je odsadený akokoľvek — inak by celý
  // vložený blok visel na nepočujúcom rodičovi.
  if (von.length) {
    const posun = von[0].uroven;
    for (const r of von) r.uroven = Math.max(0, r.uroven - posun);
  }
  return von;
}

/**
 * Bod na OKRAJI bubliny v smere k druhej bubline.
 *
 * Jerry, 25. 9. 2026: „tie čiary nemusia ísť na stred bubliny, ale na jej
 * okraj, a ten sa prispôsobuje na základe pozície od bodu, z ktorého
 * vychádza." Na snímke bolo vidieť, prečo: čiary vedené do stredu prechádzali
 * cez text a krížili susedné bubliny.
 *
 * Bublina sa počíta ako obdĺžnik — zaoblenie je len o pár pixelov a hľadať
 * priesečník s kapsulou by pridalo matematiku bez viditeľného rozdielu.
 */
export function okrajBubliny(m: Miesto, kamX: number, kamY: number): { x: number; y: number } {
  const cx = m.x + m.w / 2;
  const cy = m.y + RIADOK / 2;
  const dx = kamX - cx;
  const dy = kamY - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const tx = dx ? (m.w / 2) / Math.abs(dx) : Infinity;
  const ty = dy ? (RIADOK / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}
