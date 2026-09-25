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
  /** Stav nápadu z karty Nápady: novy | pouzity | zamietnuty. */
  stav?: string;
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

/** Výška jedného riadku mapy. Kreslí z nej rozloženie, čiary aj trafenie cieľa. */
export const RIADOK = 52;

export type Miesto = { x: number; y: number; w: number; hlbka: number };
export type Rozlozenie = { poz: Record<string, Miesto>; vyska: number; sirka: number };

/** Šírka bubliny podľa textu. Jedno miesto — kreslí sa z nej aj čiara. */
export const sirkaUzla = (text: string, hlbka: number) =>
  Math.max(hlbka <= 1 ? 200 : 150, Math.min(360, (text || "").length * 8.4 + (hlbka === 0 ? 118 : 104)));

/** Stred pracovnej plochy. Plátno je pevné, aby ručné súradnice platili. */
export const PLATNO = { sirka: 2600, vyska: 1800 };
export const STRED = { x: PLATNO.sirka / 2, y: PLATNO.vyska / 2 };
/** O koľko ďalej od stredu leží každá ďalšia úroveň. */
export const KROK = 300;

const TAU = Math.PI * 2;

/**
 * RADIÁLNE ROZLOŽENIE: kmeň v strede, vetvy do všetkých strán.
 *
 * Jerry, 25. 9. 2026: „obsah daj na stred pracovnej plochy a z nej môžu do
 * všetkých smerov vyrastať ďalšie bubliny." Je to aj klasický tvar
 * myšlienkovej mapy — strom doprava bol kompromis, ktorý sa na šírku
 * obrazovky rýchlo minul.
 *
 * Každá vetva dostane výsek kruhu podľa toho, koľko listov pod ňou visí:
 * konár s desiatimi nápadmi má desaťkrát širší výsek než konár s jedným,
 * takže sa bubliny neprekrývajú bez toho, aby sa museli odtláčať.
 *
 * RUČNÁ POZÍCIA PREBÍJA VÝPOČET. Kto bublinu posunie, ju posunul; appka mu
 * ju nemá kam vrátiť. Potomkovia posunutej bubliny sa počítajú od nej, takže
 * sa presunie celý konár — inak by čiary viedli cez pol plochy.
 */
export type RucnePozicie = Record<string, { x: number; y: number }>;

export function rozlozMapu(
  uzly: Uzol[],
  koren: { text: string } = { text: "" },
  /** Ručné miesta kmeňa a vetiev — kľúče "koren" a "vetva:<id>". */
  rucne: RucnePozicie = {},
): Rozlozenie {
  const deti = detiPodla(uzly);
  const poz: Record<string, Miesto> = {};

  const listov = (id: string, strop = 0): number => {
    if (strop > 40) return 1;
    const ds = deti.get(id) || [];
    if (!ds.length) return 1;
    return ds.reduce((a, d) => a + listov(d.id, strop + 1), 0);
  };

  const uloz = (kluc: string, sx: number, sy: number, text: string, hlbka: number) => {
    const w = sirkaUzla(text, hlbka);
    poz[kluc] = { x: sx - w / 2, y: sy - RIADOK / 2, w, hlbka };
  };

  const chod = (u: Uzol, od: number, do_: number, r: number, hlbka: number, ox: number, oy: number) => {
    const uhol = (od + do_) / 2;
    const rucne = u.posX != null && u.posY != null;
    const sx = rucne ? (u.posX as number) : ox + Math.cos(uhol) * r;
    const sy = rucne ? (u.posY as number) : oy + Math.sin(uhol) * r;
    uloz(u.id, sx, sy, u.text, hlbka);
    const ds = u.zbalene ? [] : (deti.get(u.id) || []);
    if (!ds.length) return;
    // Potomkovia posunutej bubliny vyrastajú od NEJ a smerom od stredu —
    // inak by sa po presune vrátili k pôvodnému konáru a čiary by sa krížili.
    const zaklad = rucne ? Math.atan2(sy - STRED.y, sx - STRED.x) : uhol;
    const rozpatie = rucne ? Math.PI * 0.8 : (do_ - od);
    const zac = rucne ? zaklad - rozpatie / 2 : od;
    const celkom = ds.reduce((a, d) => a + listov(d.id), 0) || 1;
    let u0 = zac;
    for (const d of ds) {
      const podiel = listov(d.id) / celkom;
      const u1 = u0 + rozpatie * podiel;
      chod(d, u0, u1, rucne ? KROK : r + KROK, hlbka + 1, rucne ? sx : ox, rucne ? sy : oy);
      u0 = u1;
    }
  };

  const stredKmena = rucne["koren"] || STRED;
  uloz("koren", stredKmena.x, stredKmena.y, koren.text, 0);

  // Tri vetvy dookola. Začína sa vľavo hore, aby prvá (úvodný tréning)
  // sedela tam, kam oko na obrazovke chodí ako prvé.
  const vahy = VETVY.map((v) => {
    const korene = (deti.get("") || []).filter((u) => (jeVetva(u.vetva) ? u.vetva : "nezaradene") === v.id);
    return { v, korene, vaha: Math.max(1, korene.reduce((a, u) => a + listov(u.id), 0)) };
  });
  const suma = vahy.reduce((a, x) => a + x.vaha, 0);
  let uhol0 = -Math.PI * 0.85;
  for (const { v, korene, vaha } of vahy) {
    const uhol1 = uhol0 + TAU * (vaha / suma);
    const stredUseku = (uhol0 + uhol1) / 2;
    const rucnaVetva = rucne["vetva:" + v.id];
    const vx = rucnaVetva ? rucnaVetva.x : stredKmena.x + Math.cos(stredUseku) * KROK;
    const vy = rucnaVetva ? rucnaVetva.y : stredKmena.y + Math.sin(stredUseku) * KROK;
    uloz("vetva:" + v.id, vx, vy, v.nazov, 1);
    // Presunutá vetva ťahá svoj konár za sebou — rovnako ako presunutý nápad.
    const zaklad = rucnaVetva ? Math.atan2(vy - stredKmena.y, vx - stredKmena.x) : stredUseku;
    const rozpatie = rucnaVetva ? Math.PI * 0.9 : (uhol1 - uhol0);
    const zac = rucnaVetva ? zaklad - rozpatie / 2 : uhol0;
    const celkom = korene.reduce((a, u) => a + listov(u.id), 0) || 1;
    let u0 = zac;
    for (const u of korene) {
      const u1 = u0 + rozpatie * (listov(u.id) / celkom);
      chod(u, u0, u1, rucnaVetva ? KROK : KROK * 2, 2, rucnaVetva ? vx : stredKmena.x, rucnaVetva ? vy : stredKmena.y);
      u0 = u1;
    }
    uhol0 = uhol1;
  }

  // Plátno sa roztiahne na to, čo doň ručné posuny vytlačili.
  let maxX = PLATNO.sirka;
  let maxY = PLATNO.vyska;
  for (const m of Object.values(poz)) {
    maxX = Math.max(maxX, m.x + m.w + 120);
    maxY = Math.max(maxY, m.y + RIADOK + 120);
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
