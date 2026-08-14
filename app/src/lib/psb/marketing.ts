// Marketing — skeleton. The numbers below are a one-off extract from Jerry's
// Metricool exports (18 months, jan 2025 – jún 2026: 40 posts, 74 reels, 994
// stories), so the screen has something real to show before the importer exists.
// They get replaced by an upload the same way PTminder reports are.
//
// What this module deliberately does NOT claim: Instagram cannot say who became
// a client. Reach and views are inputs; the only honest bridge to money is the
// enquiry funnel plus the "odkiaľ prišiel" field, which is why the conversion
// card reads from PTminder and the funnel, never from these figures.

export type MktMesiac = {
  m: string;
  reels: number;
  posty: number;
  stories: number;
  views: number;
  dosah: number;
  ulozenia: number;
  zdielania: number;
  spend: number;
  viewRate: number;
  /** Ø čas sledovania reelu v milisekundách (Metricool). 0 = nemeralo sa. */
  watchTime?: number;
  /**
   * Mesiac, z ktorého je nahratá len časť príspevkov — mesačná zostava hlási
   * viac obsahu, než máme riadkov. Čísla za taký mesiac sú DOLNÁ hranica,
   * nie výsledok, a nesmie sa z nich čítať prepad.
   */
  neuplny?: boolean;
  chybaKusov?: number;
};

export type MktKus = { m: string; typ: "reel" | "post"; hook: string; views: number; ulozenia: number; viewRate: number; watchTime?: number };

export let MKT_MESACNE: MktMesiac[] = [
  { m: "2025-01", reels: 3, posty: 1, stories: 16, views: 3430, dosah: 3178, ulozenia: 9, zdielania: 5, spend: 700, viewRate: 34.4 },
  { m: "2025-02", reels: 2, posty: 2, stories: 66, views: 3815, dosah: 7004, ulozenia: 6, zdielania: 2, spend: 400, viewRate: 38.0 },
  { m: "2025-03", reels: 4, posty: 1, stories: 85, views: 3670, dosah: 7553, ulozenia: 9, zdielania: 5, spend: 300, viewRate: 37.0 },
  { m: "2025-04", reels: 1, posty: 3, stories: 50, views: 4229, dosah: 5739, ulozenia: 6, zdielania: 6, spend: 0, viewRate: 49.7 },
  { m: "2025-05", reels: 3, posty: 1, stories: 61, views: 3710, dosah: 6243, ulozenia: 11, zdielania: 7, spend: 400, viewRate: 40.7 },
  { m: "2025-06", reels: 2, posty: 3, stories: 75, views: 5193, dosah: 6196, ulozenia: 13, zdielania: 7, spend: 0, viewRate: 36.0 },
  { m: "2025-07", reels: 1, posty: 3, stories: 68, views: 4119, dosah: 5787, ulozenia: 3, zdielania: 4, spend: 0, viewRate: 36.4 },
  { m: "2025-08", reels: 4, posty: 2, stories: 61, views: 5221, dosah: 5323, ulozenia: 19, zdielania: 10, spend: 780, viewRate: 36.0 },
  { m: "2025-09", reels: 7, posty: 2, stories: 58, views: 7356, dosah: 6360, ulozenia: 17, zdielania: 5, spend: 919, viewRate: 34.2 },
  { m: "2025-10", reels: 4, posty: 2, stories: 60, views: 5065, dosah: 6045, ulozenia: 13, zdielania: 6, spend: 799, viewRate: 32.8 },
  { m: "2025-11", reels: 5, posty: 1, stories: 46, views: 4183, dosah: 5327, ulozenia: 11, zdielania: 6, spend: 0, viewRate: 34.5 },
  { m: "2025-12", reels: 5, posty: 2, stories: 35, views: 6070, dosah: 5113, ulozenia: 15, zdielania: 8, spend: 0, viewRate: 46.6 },
  { m: "2026-01", reels: 6, posty: 2, stories: 35, views: 6125, dosah: 5483, ulozenia: 14, zdielania: 9, spend: 1599, viewRate: 38.2 },
  { m: "2026-02", reels: 5, posty: 3, stories: 34, views: 6038, dosah: 6004, ulozenia: 18, zdielania: 18, spend: 2794, viewRate: 36.0 },
  { m: "2026-03", reels: 5, posty: 2, stories: 45, views: 4214, dosah: 5071, ulozenia: 16, zdielania: 5, spend: 2298, viewRate: 32.1 },
  { m: "2026-04", reels: 7, posty: 3, stories: 72, views: 7500, dosah: 9520, ulozenia: 14, zdielania: 34, spend: 2599, viewRate: 38.5 },
  { m: "2026-05", reels: 4, posty: 3, stories: 66, views: 4994, dosah: 5969, ulozenia: 20, zdielania: 11, spend: 1895, viewRate: 35.6 },
  { m: "2026-06", reels: 6, posty: 4, stories: 61, views: 5233, dosah: 6686, ulozenia: 16, zdielania: 7, spend: 2696, viewRate: 33.9 },
];

export let MKT_TOP: MktKus[] = [
  { m: "2026-05", typ: "post", hook: "Když se řekne bránice, většina lidí si představí nádech a výdech. Sval, který se pohybuje ", views: 689, ulozenia: 9, viewRate: 0 },
  { m: "2025-05", typ: "reel", hook: "Jarek je s námi od úplného začátku. Přišel ve chvíli, kdy už vyzkoušel všechno – silový tr", views: 1251, ulozenia: 8, viewRate: 50.7 },
  { m: "2025-06", typ: "post", hook: "💡 STRES a TVOJE DRŽENÍ TĚLA – VÍC SOUVISÍ, NEŽ SI MYSLÍŠ!", views: 1154, ulozenia: 6, viewRate: 0 },
  { m: "2025-08", typ: "reel", hook: "🌀 Nestačí jen protáhnout", views: 560, ulozenia: 5, viewRate: 25.9 },
  { m: "2025-12", typ: "reel", hook: "Jsme @prosapiens.biomechanic", views: 881, ulozenia: 5, viewRate: 46.2 },
  { m: "2026-02", typ: "reel", hook: "Nepřišel proto, že by chtěl víc svalů nebo lepší výkon.", views: 1065, ulozenia: 5, viewRate: 43.8 },
  { m: "2026-05", typ: "reel", hook: "Prkno. Sklapovačky. Plank s hodinami odcvičenými za život.", views: 1029, ulozenia: 5, viewRate: 40.0 },
  { m: "2025-08", typ: "post", hook: "🔥 Táhne tě mezi lopatkami?", views: 1319, ulozenia: 5, viewRate: 0 },
];

export const mktSum = (k: keyof MktMesiac) =>
  MKT_MESACNE.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);

// Web z GA4 (export „Prehľad stavu prehľadov"). Toto je jediný zdroj, ktorý
// oddeľuje PLATENÝ dosah od organického ešte pred tým, než sa niekto ozve —
// preto je tu, aj keď o klientoch nič nevie. „Hlavné udalosti" sú konverzie
// nastavené v GA4 (odoslaný formulár a podobne).
// Zatiaľ len 2025: export za 2026 v priečinku nie je.
export type Ga4Mesiac = {
  m: string;
  novi: number;
  organicSearch: number;
  paidSocial: number;
  organicSocial: number;
  direct: number;
  referral: number;
  udalosti: number;
  chyba?: boolean;      // mesiac bez merania — nie nula, ale diera
  castocne?: boolean;   // meranie sa rozbehlo v priebehu mesiaca
};

export let GA4_MESACNE: Ga4Mesiac[] = [
  { m: "2025-01", novi: 306, organicSearch: 106, paidSocial: 74, organicSocial: 41, direct: 60, referral: 20, udalosti: 182 },
  { m: "2025-02", novi: 275, organicSearch: 133, paidSocial: 10, organicSocial: 44, direct: 69, referral: 14, udalosti: 75 },
  { m: "2025-03", novi: 284, organicSearch: 152, paidSocial: 0, organicSocial: 40, direct: 49, referral: 11, udalosti: 44 },
  { m: "2025-04", novi: 694, organicSearch: 139, paidSocial: 197, organicSocial: 135, direct: 66, referral: 7, udalosti: 143 },
  { m: "2025-05", novi: 1224, organicSearch: 138, paidSocial: 427, organicSocial: 345, direct: 78, referral: 6, udalosti: 186 },
  { m: "2025-06", novi: 716, organicSearch: 130, paidSocial: 231, organicSocial: 247, direct: 78, referral: 18, udalosti: 72 },
  { m: "2025-07", novi: 501, organicSearch: 151, paidSocial: 109, organicSocial: 41, direct: 52, referral: 9, udalosti: 122 },
  { m: "2025-08", novi: 271, organicSearch: 123, paidSocial: 0, organicSocial: 33, direct: 108, referral: 7, udalosti: 48 },
  { m: "2025-09", novi: 285, organicSearch: 126, paidSocial: 1, organicSocial: 46, direct: 101, referral: 8, udalosti: 51 },
  { m: "2025-10", novi: 315, organicSearch: 148, paidSocial: 0, organicSocial: 35, direct: 106, referral: 19, udalosti: 46 },
  { m: "2025-11", novi: 272, organicSearch: 142, paidSocial: 0, organicSocial: 54, direct: 61, referral: 11, udalosti: 57 },
  { m: "2025-12", novi: 350, organicSearch: 165, paidSocial: 0, organicSocial: 36, direct: 139, referral: 8, udalosti: 61 },
  { m: "2026-01", novi: 441, organicSearch: 219, paidSocial: 0, organicSocial: 25, direct: 182, referral: 13, udalosti: 68 },
  { m: "2026-02", novi: 380, organicSearch: 214, paidSocial: 0, organicSocial: 54, direct: 87, referral: 17, udalosti: 123 },
  { m: "2026-03", novi: 149, organicSearch: 69, paidSocial: 0, organicSocial: 4, direct: 68, referral: 8, udalosti: 448 },
  // Apríl a máj 2026: GA4 bolo odpojené, dáta neexistujú (nie sú nulové — chýbajú).
  // Jún je z rovnakého dôvodu len čiastočný, meranie sa rozbehlo 25.6.
  { m: "2026-04", novi: 0, organicSearch: 0, paidSocial: 0, organicSocial: 0, direct: 0, referral: 0, udalosti: 0, chyba: true },
  { m: "2026-05", novi: 0, organicSearch: 0, paidSocial: 0, organicSocial: 0, direct: 0, referral: 0, udalosti: 0, chyba: true },
  { m: "2026-06", novi: 21, organicSearch: 13, paidSocial: 3, organicSocial: 0, direct: 5, referral: 0, udalosti: 1, castocne: true },
];

// Vyhľadávanie — Google Search Console (export Performance on Search,
// 31.3.2025 – 30.6.2026). GA4 povie, že „Organic Search" je najväčší kanál;
// toto povie, NA ČO. Je to jediný zdroj, ktorý ukazuje aj dopyty, kde sa web
// zobrazuje, ale nikto neklikne — čiže kde je práca, ktorá sa ešte nezaplatila.
export type GscMesiac = { m: string; kliky: number; zobrazenia: number; ctr: number };
export type GscDopyt = { dopyt: string; kliky: number; zobrazenia: number; ctr: number; pozicia: number };
export type GscStrana = { url: string; kliky: number; zobrazenia: number; ctr: number; pozicia: number };

export let GSC_MESACNE: GscMesiac[] = [
  { m: "2025-03", kliky: 11, zobrazenia: 166, ctr: 6.63 },
  { m: "2025-04", kliky: 115, zobrazenia: 5427, ctr: 2.12 },
  { m: "2025-05", kliky: 108, zobrazenia: 5611, ctr: 1.92 },
  { m: "2025-06", kliky: 95, zobrazenia: 4357, ctr: 2.18 },
  { m: "2025-07", kliky: 113, zobrazenia: 3880, ctr: 2.91 },
  { m: "2025-08", kliky: 96, zobrazenia: 3092, ctr: 3.1 },
  { m: "2025-09", kliky: 110, zobrazenia: 4030, ctr: 2.73 },
  { m: "2025-10", kliky: 117, zobrazenia: 4274, ctr: 2.74 },
  { m: "2025-11", kliky: 121, zobrazenia: 5367, ctr: 2.25 },
  { m: "2025-12", kliky: 155, zobrazenia: 6281, ctr: 2.47 },
  { m: "2026-01", kliky: 179, zobrazenia: 8618, ctr: 2.08 },
  { m: "2026-02", kliky: 167, zobrazenia: 7586, ctr: 2.2 },
  { m: "2026-03", kliky: 251, zobrazenia: 10500, ctr: 2.39 },
  { m: "2026-04", kliky: 235, zobrazenia: 9725, ctr: 2.42 },
  { m: "2026-05", kliky: 235, zobrazenia: 9745, ctr: 2.41 },
  { m: "2026-06", kliky: 239, zobrazenia: 10085, ctr: 2.37 },
];

export let GSC_DOPYTY: GscDopyt[] = [
  { dopyt: "prosapiens", kliky: 157, zobrazenia: 228, ctr: 68.86, pozicia: 3.3 },
  { dopyt: "functional patterns", kliky: 67, zobrazenia: 1163, ctr: 5.76, pozicia: 7.5 },
  { dopyt: "functional patterns praha", kliky: 50, zobrazenia: 128, ctr: 39.06, pozicia: 2.2 },
  { dopyt: "mechanotransdukce", kliky: 35, zobrazenia: 330, ctr: 10.61, pozicia: 1.5 },
  { dopyt: "biotensegrita", kliky: 33, zobrazenia: 100, ctr: 33.0, pozicia: 1.1 },
  { dopyt: "pro sapiens", kliky: 24, zobrazenia: 37, ctr: 64.86, pozicia: 2.8 },
  { dopyt: "předsunutá hlava", kliky: 17, zobrazenia: 228, ctr: 7.46, pozicia: 2.1 },
  { dopyt: "rib flare", kliky: 15, zobrazenia: 453, ctr: 3.31, pozicia: 4.1 },
  { dopyt: "subokcipitální svaly", kliky: 8, zobrazenia: 804, ctr: 1.0, pozicia: 2.3 },
  { dopyt: "predsunuta hlava", kliky: 7, zobrazenia: 85, ctr: 8.24, pozicia: 3.4 },
  { dopyt: "spiral line", kliky: 5, zobrazenia: 139, ctr: 3.6, pozicia: 30.9 },
  { dopyt: "jak vyzivit fascie", kliky: 3, zobrazenia: 439, ctr: 0.68, pozicia: 5.7 },
];

export const GSC_PRILEZITOSTI: GscDopyt[] = [
  { dopyt: "fasce", kliky: 2, zobrazenia: 3959, ctr: 0.05, pozicia: 4.8 },
  { dopyt: "laterální", kliky: 0, zobrazenia: 1365, ctr: 0.0, pozicia: 7.9 },
  { dopyt: "posturální svaly", kliky: 0, zobrazenia: 1022, ctr: 0.0, pozicia: 1.4 },
  { dopyt: "fascia", kliky: 0, zobrazenia: 821, ctr: 0.0, pozicia: 9.6 },
  { dopyt: "subokcipitální svaly", kliky: 8, zobrazenia: 804, ctr: 1.0, pozicia: 2.3 },
  { dopyt: "scm sval", kliky: 0, zobrazenia: 659, ctr: 0.0, pozicia: 4.6 },
  { dopyt: "fascie", kliky: 0, zobrazenia: 592, ctr: 0.0, pozicia: 29.1 },
  { dopyt: "thorakolumbální fascie", kliky: 1, zobrazenia: 572, ctr: 0.17, pozicia: 1.7 },
  { dopyt: "laterální strana", kliky: 1, zobrazenia: 441, ctr: 0.23, pozicia: 5.4 },
  { dopyt: "jak vyzivit fascie", kliky: 3, zobrazenia: 439, ctr: 0.68, pozicia: 5.7 },
];

export const GSC_LOKALNE: GscDopyt[] = [
  { dopyt: "skolióza a posilování", kliky: 0, zobrazenia: 111, ctr: 0.0, pozicia: 31.2 },
  { dopyt: "online trenink", kliky: 0, zobrazenia: 18, ctr: 0.0, pozicia: 25.7 },
  { dopyt: "skolioza a posilování", kliky: 0, zobrazenia: 16, ctr: 0.0, pozicia: 18.8 },
  { dopyt: "trener brno", kliky: 0, zobrazenia: 9, ctr: 0.0, pozicia: 14.2 },
  { dopyt: "bolesti kloubů a svalů terapie brno", kliky: 0, zobrazenia: 9, ctr: 0.0, pozicia: 33.8 },
  { dopyt: "individuální trénink", kliky: 0, zobrazenia: 9, ctr: 0.0, pozicia: 56.0 },
  { dopyt: "osobní trenér brno", kliky: 2, zobrazenia: 8, ctr: 25.0, pozicia: 23.5 },
  { dopyt: "fitness trenér brno", kliky: 0, zobrazenia: 6, ctr: 0.0, pozicia: 22.5 },
  { dopyt: "pro pain brno", kliky: 0, zobrazenia: 4, ctr: 0.0, pozicia: 9.2 },
  { dopyt: "propain brno", kliky: 0, zobrazenia: 3, ctr: 0.0, pozicia: 3.7 },
];

export let GSC_STRANY: GscStrana[] = [
  { url: "/", kliky: 405, zobrazenia: 3851, ctr: 10.52, pozicia: 6.3 },
  { url: "/co-je-functional-patterns/", kliky: 262, zobrazenia: 3015, ctr: 8.69, pozicia: 7.2 },
  { url: "/padajici-kolena-dovnitr/", kliky: 160, zobrazenia: 5924, ctr: 2.7, pozicia: 6.1 },
  { url: "/anatomicke-vlaky/", kliky: 148, zobrazenia: 962, ctr: 15.38, pozicia: 4.2 },
  { url: "/odstavajici-lopatky/", kliky: 140, zobrazenia: 5508, ctr: 2.54, pozicia: 6.0 },
  { url: "/spiral-line/", kliky: 120, zobrazenia: 8477, ctr: 1.42, pozicia: 7.6 },
  { url: "/lateral-line/", kliky: 97, zobrazenia: 14690, ctr: 0.66, pozicia: 5.5 },
  { url: "/biotensegrita/", kliky: 94, zobrazenia: 1141, ctr: 8.24, pozicia: 6.6 },
  { url: "/anterior-pelvic-tilt/", kliky: 90, zobrazenia: 3245, ctr: 2.77, pozicia: 5.0 },
  { url: "/predsunuta-hlava/", kliky: 90, zobrazenia: 2611, ctr: 3.45, pozicia: 5.1 },
];

export let GSC_ZARIADENIA: { zariadenie: string; kliky: number; zobrazenia: number }[] = [
  { zariadenie: "Mobil", kliky: 1459, zobrazenia: 57035 },
  { zariadenie: "Stolný počítač", kliky: 861, zobrazenia: 40348 },
  { zariadenie: "Tablet", kliky: 27, zobrazenia: 1361 },
];

// kliky spolu 2347, z toho Česko 2057 (88 %), Slovensko 208


// Články, ktoré ľudia na webe reálne čítajú (GA4, zobrazenia stránok). Servisné
// stránky (Domov, Služby, Kontakt…) sú vynechané — zaujíma nás obsah, nie menu.
export type MktClanok = { rok: string; nazov: string; zobrazenia: number };

export let MKT_CLANKY: MktClanok[] = [
  { rok: "2025", nazov: "Fascie – Voda v nás", zobrazenia: 1829 },
  { rok: "2025", nazov: "Spiral Line (SPL) - Spiralní Línie", zobrazenia: 380 },
  { rok: "2025", nazov: "Postura – Základ fyzické i psychické rovnováhy", zobrazenia: 261 },
  { rok: "2025", nazov: "Lateral Line (LL) - Boční Línie", zobrazenia: 215 },
  { rok: "2025", nazov: "Biotensegrita: Budoucnost chápání toho, jak tělo funguje", zobrazenia: 180 },
  { rok: "2025", nazov: "Superficial Back Line (SBL) - Povrchová zadní linie", zobrazenia: 166 },
  { rok: "2025", nazov: "Víc než jen zakřivení: Skolióza a její komplexní řešení", zobrazenia: 141 },
  { rok: "2025", nazov: "Superficial Front Line (SFL) - Povrchová Přední Linie", zobrazenia: 139 },
  { rok: "2025", nazov: "Beyond Fitness, Beyond Money", zobrazenia: 76 },
  { rok: "2025", nazov: "1. díl: Anatomické vlaky", zobrazenia: 71 },
  { rok: "2026", nazov: "Odstávající lopatky: proč problém nezačíná na zádech?", zobrazenia: 104 },
  { rok: "2026", nazov: "analyza drzani", zobrazenia: 76 },
  { rok: "2026", nazov: "Padající kolena dovnitř: Proč se to děje – a jak to skutečně řeš", zobrazenia: 74 },
  { rok: "2026", nazov: "Spiral Line (SPL) - Spiralní Línie", zobrazenia: 74 },
  { rok: "2026", nazov: "Předsunutá hlava – když hlavu držíme proti tělu, ne s ním", zobrazenia: 64 },
  { rok: "2026", nazov: "Superficial Back Line (SBL) - Povrchová zadní linie", zobrazenia: 64 },
  { rok: "2026", nazov: "1. díl: Anatomické vlaky", zobrazenia: 57 },
  { rok: "2026", nazov: "Lateral Line (LL) - Boční Línie", zobrazenia: 51 },
  { rok: "2026", nazov: "Mechanotransdukce – Jak síly formují vaše tělo", zobrazenia: 51 },
  { rok: "2026", nazov: "Superficial Front Line (SFL) - Povrchová Přední Linie", zobrazenia: 49 },
];


// ── Živé dáta z importu ──────────────────────────────────────────────────────
//
// Čísla vyššie sú jednorazový prepis z Metricoolu — appka o marketingu vedela
// presne toľko, koľko som do nej raz prepísal, a každý ďalší mesiac by musel
// niekto prepísať znova.
//
// Keď sa nahrá export, nahradia sa. Prepisuje sa premenná modulu a nie stav
// komponentu zámerne: MKT_MESACNE číta desať miest naprieč obrazovkou Marketing
// a preťahovať to všade cez props by znamenalo prepísať celý súbor kvôli jednej
// vete. ESM export je živá väzba, takže priradenie tu vidia všetci.
//
// Kým sa nič nenahrá, zostáva pôvodný prepis — obrazovka nikdy nie je prázdna.
export let MKT_ZDROJ: "kod" | "import" = "kod";

/** Mesiace, ktoré prišli z importu — v tabuľkách sa dajú odlíšiť od prepisu. */
export const MKT_IMPORTOVANE = new Set<string>();

import { clanky } from "./google";

export function nastavMarketingZImportu(mesacne: MktMesiac[], top: MktKus[]): boolean {
  if (!mesacne.length) return false;
  // Zlučuje sa po mesiacoch, nenahrádza sa celá séria. Keby sa nahradila, jeden
  // nahratý súbor za júl by zmazal osemnásť mesiacov histórie z grafu — a keby
  // sa naopak sčítavali, ten istý mesiac by mal dva zdroje a číslo by bolo
  // nezmyselné. Takto má každý mesiac práve jeden zdroj a nahratý vyhráva.
  const podla = new Map(MKT_MESACNE.map((m) => [m.m, m]));
  for (const m of mesacne) {
    podla.set(m.m, m);
    MKT_IMPORTOVANE.add(m.m);
  }
  MKT_MESACNE = [...podla.values()].sort((a, b) => a.m.localeCompare(b.m));
  if (top.length) MKT_TOP = top;
  MKT_ZDROJ = "import";
  return true;
}


/** GA4 a Search Console z importu — rovnaké pravidlo ako pri Metricoole. */
export function nastavWebZImportu(
  ga4: Ga4Mesiac[],
  gscMes: GscMesiac[],
  dopyty: GscDopyt[],
  strany: GscStrana[],
  ga4Strany: { url: string; zobrazenia: number }[] = [],
  zariadenia: { zariadenie: string; kliky: number; zobrazenia: number }[] = [],
): boolean {
  let zmena = false;
  if (ga4.length) {
    const m = new Map(GA4_MESACNE.map((x) => [x.m, x]));
    for (const x of ga4) {
      const stary = m.get(x.m);
      // Značky „nemerané" a „čiastočné" musia import PREŽIŤ.
      //
      // GA4 o sebe nevie, že nemeralo — pošle mesiac s nulami alebo ho
      // nepošle vôbec, a v obidvoch prípadoch to vyzerá ako „nikto neprišiel".
      // Prvá verzia importu tie značky prepísala a jún 2026 (21 ľudí za celý
      // mesiac, meranie sa rozbehlo v jeho priebehu) sa začal počítať do
      // priemerov ako plnohodnotný mesiac.
      //
      // `castocne` sa nesie ďalej vždy — je to úsudok o mesiaci, ktorý z dát
      // vyčítať nejde. `chyba` naopak zmizne, keď import prinesie skutočné
      // čísla: to je dôkaz, že mesiac meraný bol.
      const chyba = stary?.chyba && x.novi === 0 ? true : undefined;
      m.set(x.m, { ...x, ...(stary?.castocne ? { castocne: true } : {}), ...(chyba ? { chyba: true } : {}) });
    }
    GA4_MESACNE = [...m.values()].sort((a, b) => a.m.localeCompare(b.m));
    zmena = true;
  }
  if (gscMes.length) {
    const m = new Map(GSC_MESACNE.map((x) => [x.m, x]));
    for (const x of gscMes) m.set(x.m, x);
    GSC_MESACNE = [...m.values()].sort((a, b) => a.m.localeCompare(b.m));
    zmena = true;
  }
  // Rebríčky sa nezlučujú — nahrádzajú sa celé. Dopyt z júla a dopyt z mája
  // vedľa seba v jednej tabuľke by tvrdili, že ide o to isté obdobie, a
  // priemerná pozícia by neznamenala nič.
  if (dopyty.length) { GSC_DOPYTY = dopyty; zmena = true; }
  if (strany.length) { GSC_STRANY = strany; zmena = true; }
  // Články a zariadenia boli do 13. 8. napísané natvrdo a import ich obchádzal
  // — vyzerali živo a boli z jari 2025. Rok sa pri článkoch stráca (GA4 dáva
  // rebríček za obdobie, nie po rokoch), preto ide do jedného vedra.
  if (ga4Strany.length) {
    MKT_CLANKY = clanky(ga4Strany.map((x) => ({ ...x, kliky: 0 })))
      .map((x) => ({ rok: "", nazov: x.url, zobrazenia: x.zobrazenia }));
    zmena = true;
  }
  if (zariadenia.length) { GSC_ZARIADENIA = zariadenia; zmena = true; }
  return zmena;
}

// ── Google Ads ────────────────────────────────────────────────────────────
//
// PREČO TU NIE SÚ NAPÍSANÉ ŽIADNE ČÍSLA
//
// GA4 a Search Console tu majú ručne vpísané mesiace z exportov, lebo tak sa
// začínali. Google Ads takú minulosť nemá — prišli až cez API a preto sú
// prázdne, kým sa nestiahnu. Prázdny graf je čitateľnejší než graf s číslami,
// o ktorých nikto nevie, odkiaľ sú.

export type GadsKampan = {
  campaignId: string; nazov: string; typ: string; stav: string; mesiac: string;
  naklad: number; kliky: number; zobrazenia: number; konverzie: number;
};

export type GadsDopyt = {
  mesiac: string; dopyt: string; kliky: number; zobrazenia: number; naklad: number; konverzie: number;
};

export let GADS_KAMPANE: GadsKampan[] = [];
export let GADS_DOPYTY: GadsDopyt[] = [];

/**
 * Google Ads z API.
 *
 * Prázdne pole neprepisuje to, čo už je: keď stiahnutie čiastočne zlyhá,
 * polovica dát by ticho zmizla a obrazovka by tvrdila, že sa nič nedeje.
 */
export function nastavAdsZImportu(kampane: GadsKampan[], dopyty: GadsDopyt[]): boolean {
  let zmena = false;
  if (kampane.length) {
    GADS_KAMPANE = [...kampane].sort((a, b) => a.mesiac.localeCompare(b.mesiac));
    zmena = true;
  }
  if (dopyty.length) {
    GADS_DOPYTY = [...dopyty].sort((a, b) => b.zobrazenia - a.zobrazenia);
    zmena = true;
  }
  return zmena;
}
