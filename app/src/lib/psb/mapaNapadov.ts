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

export type Vetva = {
  id: string;
  nazov: string;
  farba: string;
  /** 1 = vpravo od kmeňa, −1 = vľavo. Mapa sa tak nezvalí na jednu stranu. */
  strana: 1 | -1;
};

/**
 * Tri vetvy na začiatok, nie päť. Prvé dve sú Jerryho dva lieviky zo 7. 9.
 * 2026 (fasciový obsah na predaj knihy, ostatný obsah na rezerváciu
 * úvodného); tretia je odkladisko. Fázy nákupného cyklu sem NEPATRIA — tie
 * sa priraďujú až pri triedení, lebo rozhodnúť fázu skôr, než je nápad
 * dopísaný, je presne to, čo Jerrymu na plánovači vadilo.
 *
 * Od 25. 9. 2026 to je len VÝCHODISKO: každá mapa si môže pridať vlastné
 * vetvy a tie sa ukladajú do `mkt_mapy.vetvy`. Jerry: „v Obsahu nie som
 * schopný vytvoriť ďalšiu novú kategóriu, iba tie, ktoré tam teraz sú."
 */
export const VETVY_ZAKLAD: Vetva[] = [
  { id: "uvodny", nazov: "→ úvodný tréning", farba: "#6EA45C", strana: 1 },
  { id: "kniha", nazov: "→ kniha", farba: "#d1854a", strana: 1 },
  { id: "nezaradene", nazov: "Zatiaľ neviem kam", farba: "#6d7560", strana: -1 },
];

/** Vetva, do ktorej padne všetko bez domova. Zmazať sa nedá. */
export const ODKLADISKO = "nezaradene";

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
export const jeVetva = (v: unknown, vetvy: Vetva[] = VETVY_ZAKLAD) => vetvy.some((x) => x.id === String(v));

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
export function vetvaUzla(id: string, uzly: Uzol[], vetvy: Vetva[] = VETVY_ZAKLAD): string {
  const podla = new Map(uzly.map((u) => [u.id, u]));
  let n = podla.get(id);
  for (let i = 0; n && i < 60; i++) {
    if (!n.rodic) return jeVetva(n.vetva, vetvy) ? n.vetva : ODKLADISKO;
    n = podla.get(n.rodic);
  }
  return ODKLADISKO;
}

export const farbaVetvy = (id: string, vetvy: Vetva[] = VETVY_ZAKLAD) =>
  vetvy.find((v) => v.id === id)?.farba ?? "#6d7560";

/** Akú farbu má bublina: vlastnú, inak tú z vetvy. */
export const farbaUzla = (u: Uzol, uzly: Uzol[], vetvy: Vetva[] = VETVY_ZAKLAD) =>
  FARBA_MAPA.get(u.farba || "")?.farba ?? farbaVetvy(vetvaUzla(u.id, uzly, vetvy), vetvy);

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

/** Medze mierky mapy. Jedno miesto — štipnutie, tlačidlá aj „zmestiť". */
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1.5;
/** Vzduch okolo mapy pri „zmestiť", aby bubliny nesedeli na hrane. */
export const OKRAJ_ZMESTIT = 40;

/**
 * Orezať mierku na medze a na celé percentá.
 *
 * `zaokruhli` je Math.floor tam, kde sa niečo má ZMESTIŤ: zaokrúhlenie nahor
 * by o kúsok presiahlo okno a mapa by opäť nebola celá vidieť.
 */
export function vMedziach(z: number, zaokruhli: (n: number) => number = Math.round): number {
  // NaN (napr. 0 / 0 z prázdnej plochy) by sa cez Math.min prešmykol a mierka
  // NaN zhasne celú mapu. Nekonečno naopak znamená „čo najviac" a orežú ho medze.
  if (Number.isNaN(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zaokruhli(z * 100) / 100));
}

/**
 * ZOZNAM VETIEV ULOŽENÝ PRI MAPE.
 *
 * Vetvy boli do 25. 9. 2026 natvrdo v kóde. Odvtedy si ich mapa nesie vo
 * vlastnom stĺpci — ale číta sa cez toto, lebo v stĺpci je JSON a ten môže
 * byť prázdny, starý alebo pokazený. Nepoužiteľný vstup nesmie zhasnúť mapu,
 * len sa vráti k východisku.
 *
 * Odkladisko musí zostať VŽDY: každý nápad, ktorého vetva sa nenájde, padá
 * doň, a keby chýbalo, zmizol by z mapy úplne.
 */
export function vetvyMapy(ulozene: unknown): Vetva[] {
  let pole: unknown = ulozene;
  if (typeof pole === "string") {
    if (!pole.trim()) return VETVY_ZAKLAD;
    try { pole = JSON.parse(pole); } catch { return VETVY_ZAKLAD; }
  }
  if (!Array.isArray(pole) || !pole.length) return VETVY_ZAKLAD;
  const von: Vetva[] = [];
  const videne = new Set<string>();
  for (const x of pole) {
    const v = x as Partial<Vetva>;
    const id = String(v?.id ?? "").trim().slice(0, 40);
    const nazov = String(v?.nazov ?? "").trim().slice(0, 60);
    // Id je prísne obmedzené na písmená, číslice a pomlčku: chodí do SQL
    // podmienky `vetva IN (...)` a ide do adresy uloženej pozície. Názov si
    // človek píše, ako chce — id si z neho vyrobí `idVetvy`.
    if (!id || !nazov || videne.has(id) || !/^[a-z0-9-]+$/.test(id)) continue;
    videne.add(id);
    von.push({
      id,
      nazov,
      farba: /^#[0-9a-fA-F]{6}$/.test(String(v?.farba)) ? String(v?.farba) : "#6d7560",
      strana: Number(v?.strana) === -1 ? -1 : 1,
    });
  }
  if (!von.length) return VETVY_ZAKLAD;
  if (!videne.has(ODKLADISKO)) von.push(VETVY_ZAKLAD[2]);
  return von;
}

/** Id novej vetvy z jej názvu — čitateľné, bez diakritiky, vždy jedinečné. */
export function idVetvy(nazov: string, vetvy: Vetva[]): string {
  const zaklad = nazov.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "vetva";
  let id = zaklad;
  for (let i = 2; vetvy.some((v) => v.id === id); i++) id = `${zaklad}-${i}`;
  return id;
}

/**
 * Nová vetva do mapy.
 *
 * Farba sa berie prvá voľná z palety — dve rovnaké vetvy vedľa seba by
 * zrušili zmysel farby. Strana je tá, kde je vetiev menej, aby sa mapa
 * nezvalila na jednu stranu kmeňa.
 */
export function novaVetva(nazov: string, vetvy: Vetva[]): Vetva {
  const pouzite = new Set(vetvy.map((v) => v.farba.toLowerCase()));
  const volna = FARBY.find((f) => !pouzite.has(f.farba.toLowerCase()));
  const vpravo = vetvy.filter((v) => v.strana === 1).length;
  const vlavo = vetvy.length - vpravo;
  return {
    id: idVetvy(nazov, vetvy),
    nazov: nazov.trim().slice(0, 60),
    farba: volna ? volna.farba : FARBY[vetvy.length % FARBY.length].farba,
    strana: vlavo < vpravo ? -1 : 1,
  };
}

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
  vetvy: Vetva[] = VETVY_ZAKLAD,
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
    const naStrane = vetvy.filter((v) => v.strana === strana);
    const bloky = naStrane.map((v) => {
      const korene = (deti.get("") || []).filter((u) => (jeVetva(u.vetva, vetvy) ? u.vetva : ODKLADISKO) === v.id);
      const h = korene.reduce((a, u) => a + blok(u), 0) || KROK_Y;
      return { v, korene, h };
    });
    // Ručne položená vetva si miesto v stĺpci NEDRŽÍ — stojí, kam ju človek
    // dal. Keby sa s ňou v stohu rátalo, nová vetva by dostala jej starý slot
    // a pristála by presne na nej (25. 9. 2026: prvá vlastná vetva padla na
    // „Zatiaľ neviem kam", ktorú mal Jerry odsunutú).
    const spolu = bloky.filter((b) => !rucne["vetva:" + b.v.id]).reduce((a, b) => a + b.h, 0);
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
      if (!rucnaVetva) y += h;
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
}, vetvy: Vetva[] = VETVY_ZAKLAD): string {
  // Do plánu sa počíta len to, čo sa ešte len chystá. Publikovaný nápad
  // v zásobníku by inak vyhlásil mesiac za pokrytý obsahom, ktorý už vyšiel.
  const listy = uzly.filter(jeNaPlan);
  const treba = kusovNaMesiac(v.kadenciaTyzdenne);
  const sFazou = listy.filter((u) => u.faza > 0);
  const riadky: string[] = [];

  riadky.push(`PLÁN OBSAHU · ${v.mesiac} · ${sFazou.length} ${sFazou.length === 1 ? "kus" : sFazou.length < 5 ? "kusy" : "kusov"} so zaradením`);
  riadky.push("");
  const podlaVetvy = vetvy.map((vt) => ({
    vetva: vt,
    kusy: listy.filter((u) => vetvaUzla(u.id, uzly, vetvy) === vt.id),
  }));
  const doLievikov = podlaVetvy
    .filter((x) => x.vetva.id !== ODKLADISKO && x.kusy.length)
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
      const vt = vetvy.find((x) => x.id === vetvaUzla(u.id, uzly, vetvy));
      return `„${u.text.trim()}“${vt && vt.id !== ODKLADISKO ? ` (${vt.nazov.replace("→ ", "")})` : ""}`;
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
 * ČIARA MEDZI DVOMA BUBLINAMI.
 *
 * Jerry, 25. 9. 2026: „tie čiary nemusia ísť na stred bubliny, ale na jej
 * okraj." Prvá verzia hľadala priesečník priamky so stenou obdĺžnika — na
 * prvej vrstve to vyzeralo dobre, ale hlbšie, kde dieťa leží vysoko nad
 * rodičom, priamka vyšla HORNOU stenou a oblúk s vodorovnými dotyčnicami sa
 * potom vrátil späť cez bublinu. Jerry, 25. 9.: „čiary zasahujú do textu
 * a to je veľmi nepríjemné."
 *
 * Preto sa nehľadá priesečník, ale strana:
 *
 * • Bubliny stoja vedľa seba (medzi stĺpcami je medzera) — čiara ide z BOKU
 *   do boku a riadiace body sedia v polovici medzery. Celý oblúk tak leží
 *   medzi stĺpcami, kde žiadna bublina nie je.
 * • Bubliny sa vodorovne prekrývajú (jedna nad druhou, typicky po ručnom
 *   posunutí) — čiara ide z VRCHU do spodku so zvislými dotyčnicami.
 *
 * V oboch prípadoch platí to isté: oblúk neopustí obdĺžnik medzi bublinami,
 * takže do textu nemá ako zasiahnuť.
 */
export function spojnica(a: Miesto, b: Miesto): string {
  const ay = a.y + RIADOK / 2;
  const by = b.y + RIADOK / 2;
  const doprava = b.x + b.w / 2 >= a.x + a.w / 2;
  // Medzera medzi obdĺžnikmi vo vodorovnom smere; záporná = prekrývajú sa.
  const medzera = doprava ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
  if (medzera > 0) {
    const zx = doprava ? a.x + a.w : a.x;
    const dox = doprava ? b.x : b.x + b.w;
    const mx = (zx + dox) / 2;
    return `M ${zx} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${dox} ${by}`;
  }
  const dole = b.y >= a.y;
  const zx = a.x + a.w / 2;
  const dox = b.x + b.w / 2;
  const zy = dole ? a.y + RIADOK : a.y;
  const doy = dole ? b.y : b.y + RIADOK;
  const my = (zy + doy) / 2;
  return `M ${zx} ${zy} C ${zx} ${my}, ${dox} ${my}, ${dox} ${doy}`;
}
