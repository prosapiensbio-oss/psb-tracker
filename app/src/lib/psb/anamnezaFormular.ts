/**
 * ANAMNÉZA AKO DÁTA, NIE AKO KÓD.
 *
 * Formulár je definícia, ktorú číta verejná stránka pre klienta, zápis
 * v Kokpite aj editor. Jedna definícia — inak by sa otázka premenovala na
 * jednom mieste a na druhom by zostala stará.
 *
 * PREČO JE KLIENTSKA ČASŤ TAKÁ KRÁTKA
 *
 * Jerry, 30. 9. 2026: „klient musí mať max do 6 otázok, ideálne nejaké 3 —
 * v úvodnej správe posielame aj video na YouTube a podľa mňa 60 % si ho
 * nepozrie, a to má 3 minúty." Dáta mu dali za pravdu tvrdšie, než čakal:
 * z 56 vyplnených anamnéz je 48 písaných po slovensky a 33 v tretej osobe
 * („chce zit aktivny zivot bez bolesti"). Dotazník nikdy nevypĺňali
 * klienti — vypĺňal ho tréner. Preto klient dostane jednu mäkkú otázku
 * a podľa nej buď bolesť, alebo cieľ; zvyšok je zápis trénera.
 *
 * Rozdelenie podľa ostrých dát: zo 56 klientov by 46 kliklo „něco mě bolí",
 * 2 „konkrétní diagnóza" a 8 „nic mě nebolí". Dlhšia vetva je teda hlavná
 * cesta a smie byť dlhšia; krátka slúži tým ôsmim.
 */

export type TypOtazky =
  | "text" | "dlhy" | "cislo" | "datum"
  | "jedna" | "viac" | "skala" | "oblasti" | "ano-nie" | "len-citat";

export type Otazka = {
  /** Strojový kľúč odpovede. NIKDY sa nemení — visia na ňom uložené dáta. */
  id: string;
  text: string;
  typ: TypOtazky;
  moznosti?: string[];
  povinna?: boolean;
  /** Ukáž otázku len vtedy, keď iná otázka má jednu z týchto hodnôt. */
  vetva?: { otazka: string; hodnoty: string[] };
  /** Vysvetlivka pod otázkou — pre klienta aj pre trénera. */
  pomoc?: string;
  /** Odkiaľ sa predvypĺňa v zápise trénera. */
  zdroj?: "klient" | "test-postury" | "kokpit";
};

export type Sekcia = { id: string; nazov: string; pozn?: string; otazky: Otazka[] };
export type Formular = { verzia: number; klient: Sekcia[]; zapis: Sekcia[] };

/** Oblasti tela — tá istá množina, akou sa pýta test postury na webe. */
export const OBLASTI = [
  "krk", "ramena", "hrudní páteř", "bedra", "kyčle",
  "kolena", "kotníky", "lokty / zápěstí", "jinde",
] as const;

/**
 * Preklad oblastí z testu postury do názvov anamnézy.
 *
 * Test posiela `OBLASTI BOLESTI: koleno, bedro, krc` — jednotné číslo a bez
 * diakritiky. Bez tejto mapy by sa predvyplnenie ticho netrafilo a Jerry by
 * klikal to, čo appka už vedela.
 */
export const OBLAST_Z_TESTU: Record<string, string> = {
  krc: "krk", krk: "krk", sija: "krk",
  rameno: "ramena", ramena: "ramena",
  hrudnik: "hrudní páteř", "hrudni-pater": "hrudní páteř",
  bedro: "bedra", bedra: "bedra", kriz: "bedra",
  kycel: "kyčle", kycle: "kyčle", panev: "kyčle",
  koleno: "kolena", kolena: "kolena",
  kotnik: "kotníky", kotniky: "kotníky", chodidlo: "kotníky",
  loket: "lokty / zápěstí", zapesti: "lokty / zápěstí",
};

export const CIELE = [
  "Zbavit se chronické bolesti",
  "Zlepšit držení těla a způsob pohybu",
  "Předcházet zraněním",
  "Zlepšit výkon ve sportu",
  "Řešit konkrétní diagnózu (skolióza, výhřez, asymetrie…)",
  "Dlouhověkost a kvalita pohybu",
  "Zvýšit sílu nebo výdrž",
  "Jiné",
];

/**
 * Odkiaľ klienti naozaj chodia — podľa 56 odpovedí a 120 klientov v appke.
 *
 * LinkedIn ani Facebook v ponuke nie sú: za celý čas ich neuviedol nikto
 * (Jerry ich 30. 9. 2026 obidva vyhodil). Leták/billboard a AI naopak
 * v odpovediach sú („letaček za barefoot", „vonkajší bilboard", „AI, a
 * potom cez googlu") a v ponuke chýbali.
 */
export const ZDROJE = [
  "Doporučení",
  "Instagram",
  "Google",
  "Functional Patterns",
  "Leták nebo billboard",
  "AI (ChatGPT a spol.)",
  "Jiné",
];

const PRIVADZA = ["Něco mě bolí", "Konkrétní diagnóza — skolióza, výhřez, asymetrie…", "Nic mě nebolí, chci se líp hýbat"];
/** Vetva „niečo ma bolí" — sem patrí aj diagnóza, tá bolesť obvykle sprevádza. */
const BOLI = [PRIVADZA[0], PRIVADZA[1]];

export const FORMULAR: Formular = {
  verzia: 1,

  // ── ČO VYPLNÍ KLIENT PRED ÚVODNÝM ────────────────────────────────────
  klient: [
    {
      id: "uvod",
      nazov: "Než přijdete",
      pozn: "Pár otázek, ať víme, s čím přicházíte. Minuta času.",
      otazky: [
        { id: "privadza", text: "Co vás k nám přivádí?", typ: "jedna", moznosti: PRIVADZA, povinna: true },

        // ── vetva A: bolesť alebo diagnóza ──
        {
          id: "oblasti", text: "Kde to cítíte?", typ: "oblasti", povinna: true,
          vetva: { otazka: "privadza", hodnoty: BOLI },
          pomoc: "Zaškrtněte všechno, co sedí. U každé oblasti se pak zeptáme, jak silné to je.",
        },
        {
          id: "vlajky", text: "Zaškrtněte, co se vás týká — teď nebo v minulosti", typ: "viac", povinna: true,
          vetva: { otazka: "privadza", hodnoty: BOLI },
          moznosti: [
            "bolest vyzařuje do ruky nebo nohy",
            "mravenčení, brnění nebo necitlivost",
            "slabost v ruce nebo noze",
            "bolest budí v noci",
            "závratě nebo mdloby",
            "bolest na hrudi nebo bušení srdce při zátěži",
            "vysoký krevní tlak",
            "nic z toho",
          ],
        },
        {
          id: "vlajky_popis", text: "Popište to krátce — kdy to začalo a co to spouští.", typ: "dlhy",
          vetva: { otazka: "vlajky", hodnoty: ["*"] },
          pomoc: "Stačí pár vět.",
        },
        {
          id: "lieky", text: "Berete pravidelně nějaké léky nebo se s něčím léčíte?", typ: "dlhy", povinna: true,
          vetva: { otazka: "privadza", hodnoty: BOLI },
          pomoc: "Když nic, napište „ne“.",
        },

        // ── vetva B: nič ma nebolí ──
        {
          id: "ciel", text: "Co je váš hlavní cíl v pohybu nebo sportu?", typ: "viac", povinna: true,
          vetva: { otazka: "privadza", hodnoty: [PRIVADZA[2]] },
          moznosti: CIELE,
        },

        // ── obe cesty ──
        {
          id: "zakaz", text: "Zakázal vám lékař nějaký pohyb nebo zátěž?", typ: "ano-nie", povinna: true,
          pomoc: "Když ano, napište prosím co.",
        },
      ],
    },
  ],

  // ── ČO ZAPÍŠE TRÉNER PRI ÚVODNOM ─────────────────────────────────────
  zapis: [
    {
      id: "trapi", nazov: "Co ho trápí",
      pozn: "Časť je vyplnená z toho, čo klient odklikol, a z testu postury.",
      otazky: [
        { id: "vyska", text: "Výška (cm)", typ: "cislo" },
        { id: "vaha", text: "Váha (kg)", typ: "cislo" },
        { id: "obtiz", text: "Hlavní obtíž — co ho trápí a jak dlouho to trvá", typ: "dlhy" },
        { id: "oblasti", text: "Kde to cítí? A jak silné, když je to nejhorší?", typ: "oblasti", zdroj: "klient" },
        {
          id: "kedy", text: "Kdy je to nejhorší?", typ: "viac",
          moznosti: ["ráno po probuzení", "po delším sezení", "při sportu", "po sportu", "večer", "v noci", "nahodile"],
        },
        { id: "test_postury", text: "Co ukázal test postury", typ: "len-citat", zdroj: "test-postury" },
        { id: "zranenia", text: "Závažné zranění, operace (jizvy) nebo hospitalizace", typ: "dlhy" },
        { id: "pristupy", text: "Jaké odborné přístupy už zkoušel? Co pomohlo a co ne?", typ: "dlhy" },
        {
          id: "preco_nevydrzalo", text: "A proč to podle něj dlouhodobě nevydrželo?", typ: "dlhy",
          pomoc: "Jeho vlastná diagnóza, nie zoznam toho, čím prešiel — to je otázka nad ňou.",
        },
        { id: "tehotna", text: "Těhotná?", typ: "jedna", moznosti: ["Ano", "Ne"] },
        { id: "tehotenstvo", text: "Kolikátý trimestr a jak probíhá?", typ: "dlhy", vetva: { otazka: "tehotna", hodnoty: ["Ano"] } },
      ],
    },
    {
      id: "ciele", nazov: "Motivace a cíle",
      otazky: [
        { id: "ciel", text: "Hlavní cíl v pohybu nebo sportu", typ: "viac", moznosti: CIELE, zdroj: "klient" },
        { id: "uspech", text: "Co by pro něj znamenal úspěch po 6 měsících?", typ: "dlhy" },
      ],
    },
    {
      id: "praca", nazov: "Práce a denní návyky",
      otazky: [
        { id: "zivi", text: "Čím se živí", typ: "text" },
        {
          id: "poloha", text: "Pracuje vsedě, ve stoje, nebo je práce pohybová?", typ: "jedna",
          moznosti: ["Převážně vsedě", "Převážně ve stoje", "Pohybová / variabilní", "Kombinace"],
        },
        {
          id: "sedenie", text: "Kolik hodin denně prosedí?", typ: "jedna",
          moznosti: ["méně než 4", "4–6", "6–8", "8–10", "více než 10"],
        },
        { id: "spanok", text: "Kolik hodin spí a jak se budí?", typ: "dlhy" },
        {
          id: "vonku", text: "Kolik času denně tráví venku?", typ: "jedna",
          moznosti: ["takřka vůbec", "15–30 min", "30–60 min", "1–2 hodiny", "více než 2 hodiny"],
        },
        { id: "stres", text: "Jak stresující je jeho práce? (0–10)", typ: "skala" },
        { id: "meditacia", text: "Zkušenost s meditací nebo dechovými technikami", typ: "jedna", moznosti: ["Ne", "Zkoušel(a)", "Pravidelně"] },
      ],
    },
    {
      id: "sport", nazov: "Sport a pohyb",
      otazky: [
        { id: "sport_detstvo", text: "Jaký sport dělal jako dítě nebo dospívající", typ: "dlhy" },
        { id: "sport_teraz", text: "Jaké sporty dělá aktuálně — a jak často", typ: "dlhy" },
        { id: "trener", text: "Měl v minulosti trenéra?", typ: "jedna", moznosti: ["Ano", "Ne"] },
        { id: "trener_fungovalo", text: "Co mu u něj fungovalo?", typ: "dlhy", vetva: { otazka: "trener", hodnoty: ["Ano"] } },
        { id: "trener_koniec", text: "Co vedlo k ukončení spolupráce?", typ: "dlhy", vetva: { otazka: "trener", hodnoty: ["Ano"] } },
      ],
    },
    {
      id: "odkial", nazov: "Jak nás našel",
      otazky: [
        { id: "zdroj", text: "Jak se o nás dozvěděl?", typ: "jedna", moznosti: ZDROJE, zdroj: "kokpit" },
        { id: "zdroj_kto", text: "Kdo ho poslal?", typ: "text", zdroj: "kokpit", vetva: { otazka: "zdroj", hodnoty: ["Doporučení"] } },
        { id: "zaujalo", text: "V čem ho nabídka nebo trénink zaujaly nejvíc?", typ: "dlhy" },
      ],
    },
  ],
};

/**
 * Má sa otázka ukázať? `"*"` v hodnotách znamená „čokoľvek okrem prázdna
 * a okrem `nic z toho`" — tak sa pýta doplnenie k červeným vlajkám.
 */
export function zobrazit(o: Otazka, odpovede: Record<string, unknown>): boolean {
  if (!o.vetva) return true;
  const v = odpovede[o.vetva.otazka];
  const hodnoty = Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)];
  if (o.vetva.hodnoty.includes("*")) return hodnoty.some((x) => x && x !== "nic z toho");
  return hodnoty.some((x) => o.vetva!.hodnoty.includes(x));
}

/** Otázky sekcie, ktoré sa pri týchto odpovediach majú ukázať. */
export const viditelne = (s: Sekcia, odpovede: Record<string, unknown>): Otazka[] =>
  s.otazky.filter((o) => zobrazit(o, odpovede));

/**
 * Prečíta oblasti bolesti a posturálne odchýlky z poznámky testu postury.
 *
 * Test chodí do `leads.note` ako text s hlavičkami („OBLASTI BOLESTI:",
 * „POSTURÁLNÍ ODCHYLKY:", „IDENTIFIKOVANÝ VZOREC:"). Anamnéza sa pýta na to
 * isté, takže je to predvyplnenie, nie druhá evidencia.
 */
export function zTestuPostury(poznamka: string): { oblasti: string[]; odchylky: string[]; vzorec: string } | null {
  const t = String(poznamka || "");
  if (!/TEST POSTURY/i.test(t)) return null;

  // Hodnota končí až pred ĎALŠOU hlavičkou, nie po dvoch medzerách.
  // V ostrom texte je medzi „krc" a „POSTURÁLNÍ ODCHYLKY" jediná medzera,
  // takže rez podľa medzier zhltol pol sekcie a oblasť „krk" sa stratila.
  // Dve pasce naraz, obe tichéa obe stáli jeden pokus:
  //
  // 1. BEZ príznaku „i“. Hlavičky sú veľkými písmenami, ale slovo
  //    „posturální“ je aj v TEXTE vzorca („Vzorec globální posturální
  //    dysbalance“) — necitlivé porovnanie hodnotu orezalo na „08 — Vzorec
  //    globální“.
  // 2. ŽIADNE `\b`. V JavaScripte je hranica slova ASCII, takže za „Í“
  //    v „POSTURÁLNÍ“ ju nevidí a lookahead nesadol vôbec: do oblastí
  //    bolesti sa tým pádom natiahol celý zvyšok správy a „krk“ sa stratil.
  //    Preto sa hlavičky vypisujú celé a končia dvojbodkou.
  const DALSIA = "(?=\\s+(?:OBLASTI BOLESTI|POSTUR[ÁA]LN[ÍI] ODCHYLKY|IDENTIFIKOVAN[ÝY] VZOREC|POZN[ÁA]MKA OD KLIENTA|Odesl[áa]no z|Jm[ée]no|E-mail|Telefon|Hovor)\\s*:|$)";
  const hodnota = (hlavicka: string): string => {
    const m = t.match(new RegExp(`${hlavicka}:\\s*([\\s\\S]*?)${DALSIA}`));
    return (m?.[1] || "").trim();
  };
  const zoznam = (hlavicka: string): string[] =>
    hodnota(hlavicka).split(",").map((x) => x.trim()).filter(Boolean);

  const oblasti: string[] = [];
  for (const o of zoznam("OBLASTI BOLESTI")) {
    const k = OBLAST_Z_TESTU[o.toLowerCase()];
    if (k && !oblasti.includes(k)) oblasti.push(k);
  }
  return {
    oblasti,
    odchylky: zoznam("POSTUR[ÁA]LN[ÍI] ODCHYLKY"),
    vzorec: hodnota("IDENTIFIKOVAN[ÝY] VZOREC"),
  };
}
