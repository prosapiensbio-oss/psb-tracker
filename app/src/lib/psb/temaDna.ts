// Téma na dnešné hovorené video.
//
// Jerry, 3. 9. 2026: „mnoho dní robím krátke hovorené videá do 60 sekúnd —
// postavím sa pred kameru a poviem to. Chcel by som, aby mi každý deň
// vyskakoval nejaký nápad, otázka alebo téma. Neznamená to, že to naozaj
// urobím, ale keď mám čas a priestor, nemusím nič vymýšľať."
//
// PREČO SA TÉMA NEVYMÝŠĽA, ALE VYBERÁ
//
// Vymyslená téma znie ako vymyslená — to je presne tá „AI príchuť", ktorú
// Jerry na textoch poznal (`docs/textar-psb.md`). Zdroj je preto vždy niečo,
// čo niekto NAOZAJ napísal alebo povedal: 16 587 viet, ktoré ľudia napísali
// do Googlu predtým, než klikli na reklamu, otázky klientov z „+ Zápis",
// články na webe. Jazyk publika sa vymyslieť nedá.
//
// PREČO ROTÁCIA A NIE NAJLEPŠIA TÉMA
//
// Keby sa vyberalo vždy „to najsilnejšie", päť dní po sebe by prišlo päť
// variácií na bolesť bedrovej chrbtice — tá istá jednotvárnosť, ktorou trpeli
// scenáre v auguste. Druh témy sa preto strieda po dňoch a v rámci druhu sa
// vyberá podľa dňa, nie podľa poradia.
//
// PREČO DETERMINISTICKY PODĽA DÁTUMU
//
// Aby sa téma počas dňa nemenila. Keď si ju Jerry ráno prečíta a poobede
// otvorí appku znova, musí tam byť tá istá — inak sa nedá „nechať uležať".

import { DOKUMENTY, FAZY } from "./mapaCyklu";

export type TemaDna = {
  /** Krátka veta do notifikácie. */
  tema: string;
  /** Odkiaľ sa vzala — bez toho je to len veta odnikiaľ. */
  odkial: string;
  druh: "hladanie" | "otazka" | "dokument" | "tvrdenie" | "faza";
};

/**
 * Tvrdenia, ktoré počuť všade a ktoré má PSB čím vyvrátiť.
 *
 * Nie je to zoznam „mýtov" na zosmiešnenie — každé z nich niekto myslí
 * vážne a väčšinou má na to dôvod. Formát „Vyvrátenie tvrdenia" z mapy cyklu
 * hovorí: vecne, bez posmechu, a povedz, čím to nahradiť.
 */
const TVRDENIA = [
  "Na bolesť chrbta pomôže strečing.",
  "Musíš si posilniť core, potom to prestane bolieť.",
  "Keď ťa bolí koleno, problém je v kolene.",
  "Bolesť znamená, že sa máš šetriť.",
  "Držanie tela je o tom, aby si sa narovnal.",
  "Na to potrebuješ operáciu, cvičenie už nepomôže.",
  "Stačí chodiť do posilňovne, telo sa spraví samo.",
  "Za bolesť môže sedavé zamestnanie — nič s tým neurobíš.",
];

/** Deň od epochy — jednotka rotácie. */
const denCislo = (d: Date) => Math.floor(Date.parse(`${d.toISOString().slice(0, 10)}T00:00:00Z`) / 86400000);

/**
 * Poradie druhov. Päť druhov znamená, že ten istý sa vráti raz za päť dní —
 * dosť na to, aby sa neopakoval tvar, a málo na to, aby sa zdroj vyčerpal.
 */
const PORADIE: TemaDna["druh"][] = ["hladanie", "otazka", "tvrdenie", "dokument", "faza"];

export function temaDna(
  zdroje: {
    /** Skutočné vety z Googlu, najčastejšie prvé. */
    hladania?: { dopyt: string; zobrazenia: number }[];
    /** Otázky, ktoré Jerry zapísal v „+ Zápis". */
    napady?: { text: string; druh?: string }[];
  },
  dnes: Date = new Date(),
): TemaDna {
  const den = denCislo(dnes);
  // Poradie sa posúva o deň, výber v rámci druhu o iné číslo — inak by sa
  // pri každom návrate toho istého druhu vybrala tá istá položka.
  const druh = PORADIE[((den % PORADIE.length) + PORADIE.length) % PORADIE.length];
  const vyber = <T,>(pole: T[], posun = 0): T | null =>
    pole.length ? pole[(((Math.floor(den / PORADIE.length) + posun) % pole.length) + pole.length) % pole.length] : null;

  if (druh === "hladanie") {
    const h = vyber((zdroje.hladania || []).filter((x) => x.dopyt.trim().length > 8));
    if (h) return {
      druh, tema: `„${h.dopyt}“ — toto ľudia napísali do Googlu ${h.zobrazenia}×. Odpovedz im na to.`,
      odkial: "skutočné vyhľadávania z Google Ads",
    };
  }

  if (druh === "otazka") {
    // Odkaz nie je téma. `mkt_napady` slúži aj ako odkladisko inšpirácie
    // („Inšpirácia: https://instagram.com/…"), a taký riadok sa pred kamerou
    // povedať nedá — 3. 9. 2026 by tak vyšla téma na 10. 9.
    const otazky = (zdroje.napady || [])
      .map((n) => ({ ...n, text: (n.text || "").trim() }))
      .filter((n) => n.text.length > 20)
      .filter((n) => !/^https?:\/\//i.test(n.text))
      .filter((n) => !/^(inšpirácia|inspiracia|odkaz|link)\s*[:\-]/i.test(n.text))
      // Veta, ktorá je z polovice odkaz, tiež nie.
      .filter((n) => !/https?:\/\/\S+/i.test(n.text) || n.text.replace(/https?:\/\/\S+/gi, "").trim().length > 30);
    const o = vyber(otazky);
    if (o) return {
      druh, tema: `„${o.text.trim()}“ — tvoj vlastný zápis. Rozober to pred kamerou.`,
      odkial: o.druh === "otazka klienta" ? "otázka klienta z + Zápis" : "tvoj nápad z + Zápis",
    };
  }

  if (druh === "tvrdenie") {
    const t = vyber(TVRDENIA);
    if (t) return {
      druh, tema: `„${t}“ — povedz, prečo to nesedí a čím to nahradiť. Vecne, bez posmechu.`,
      odkial: "časté tvrdenie, formát Vyvrátenie tvrdenia",
    };
  }

  if (druh === "dokument") {
    const d = vyber(DOKUMENTY);
    if (d) return {
      druh, tema: `${d.nazov} — vytiahni z toho JEDNU myšlienku (${d.dava}) a povedz ju za 60 sekúnd.`,
      odkial: `váš článok na webe: ${d.slug}`,
    };
  }

  // Fáza sa NEHOVORÍ tak, ako je popísaná. „Fáza 5 — Rozhodnutý: je pripravený,
  // chýba mu dôkaz" je opis kategórie, nie téma — pred kameru sa s tým postaviť
  // nedá. Preto má každá fáza vlastné zadanie v druhej osobe, ktoré hovorí,
  // ČO POVEDAŤ, nie komu.
  const ZADANIA: Record<number, string> = {
    1: "Povedz jednu vec, ktorú ľudia považujú za normálnu, a ona normálna nie je. Bez strašenia — len ukáž, že sa to dá riešiť.",
    2: "Pomenuj príznak ich slovami — tak, ako ti to hovoria klienti na tréningu. A povedz, čo za tým býva.",
    3: "Vysvetli, prečo im doteraz nezabralo to, čo skúšali. Vecne, bez zhadzovania fyzia ani masáží.",
    4: "Ukáž, ako to u vás vyzerá — čo sa deje na prvej hodine a v čom je to inde než inde.",
    5: "Povedz výsledok JEDNÉHO konkrétneho človeka a na konci jasný ďalší krok.",
  };
  const f = vyber(FAZY);
  if (f) return {
    druh: "faza",
    tema: `${ZADANIA[f.id] || f.uloha} (fáza ${f.id} — ${f.nazov.toLowerCase()})`,
    odkial: "mapa nákupného cyklu",
  };

  // Posledná záchrana. Nikdy by sem nemalo dôjsť — FAZY sú konštanta v kóde —
  // ale prázdna notifikácia je horšia než všeobecná.
  return {
    druh: "faza",
    tema: "Vezmi otázku, ktorú ti tento týždeň niekto položil na tréningu, a odpovedz na ňu pred kamerou.",
    odkial: "záložná téma",
  };
}
