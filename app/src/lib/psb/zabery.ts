/**
 * Úvodné zábery — katalóg pohybov kamerou pre prvú sekundu reelu.
 *
 * PREČO TO NIE JE SKILL, ALE VEDOMOSŤ V APPKE
 *
 * 23. 8. 2026 som prehľadal ekosystém Claude skillov. Všetko, čo sa tvári ako
 * „video skill“, je jedna z troch vecí: generovanie videa z kódu (Remotion),
 * formulácie do promptov pre AI generátor, alebo postprodukcia (titulky, dabing).
 * Ani jeden nehovorí človeku, ako má držať telefón. Preto to tu stojí ako dáta —
 * rovnako ako knižnica kníh, z ktorej Jarvis číta.
 *
 * PREČO NIE AI VIDEO NÁVOD
 *
 * Vygenerovať klip „ruka s telefónom robí nájazd“ vieme, ale bol by to
 * PRESVEDČIVO VYZERAJÚCI ODHAD. Návod, ktorý vyzerá správne a učí zle, je horší
 * než žiadny. Animácie sú preto kreslené — obdĺžnik telefónu na dráhe, ktorú
 * určuje `pohyb`. Je to menej efektné a je to presné.
 *
 * ODKAZY NA VIDEÁ SÚ RUČNE VYBRANÉ A JE TO ZÁMER
 *
 * Keby si adresy vymýšľal model, polovica by viedla na neexistujúce video —
 * ID na YouTube sa nedá odvodiť, dá sa len zapamätať. Preto sú tu natvrdo
 * a Jarvis má v prompte zakázané vyrábať vlastné. Nie sú overené na konkrétnu
 * minútu; sú to celé videá k téme.
 */

export type Pohyb = "dopredu" | "odhalenie" | "oblúk" | "sklopenie" | "švih" | "statický";

export type Zaber = {
  id: string;
  nazov: string;
  /** Čo to urobí divákovi — dôvod, prečo záber existuje. */
  coRobi: string;
  /** Ako to natočiť. Konkrétne, na iPhone 17. */
  akoNaTo: string;
  /** Prečo je to dobré práve pre PSB. */
  prePSB: string;
  /** Fázy nákupného cyklu, ktorým záber sedí. */
  fazy: number[];
  pohyb: Pohyb;
  zdroj?: { nazov: string; url: string };
};

export const ZABERY: Zaber[] = [
  {
    id: "detail-celok",
    nazov: "Z detailu na celok",
    coRobi: "Začne na malom mieste, ktoré bolí, a odhalí, že príčina je inde. Divák dostane otázku skôr, než mu ju položíš slovami.",
    akoNaTo: "Začni v tesnom detaile (chodidlo, rebro, rameno) asi 20 cm od tela. Cúvaj plynulo dva kroky dozadu a súčasne dvíhaj telefón do úrovne hrudníka. Nech to trvá 2–3 sekundy. Zapni Akčný režim, aby chôdza nebola cítiť.",
    prePSB: "Toto je celá vaša veta o tele povedaná obrazom: bolí to tu, ale začína to inde. Žiadny iný záber nerobí presne to.",
    fazy: [2, 3],
    pohyb: "sklopenie",
    zdroj: { nazov: "12 Camera Movements for Cinematic Footage", url: "https://www.youtube.com/watch?v=mXR571pR4Og" },
  },
  {
    id: "najazd",
    nazov: "Nájazd (push-in)",
    coRobi: "Pomalý pohyb dopredu. Nenápadne hovorí „pozri sa bližšie“ a udrží pozornosť bez strihu.",
    akoNaTo: "Telefón drž oboma rukami pri tele, lakte pri rebrách. Prejdi pol metra dopredu za dve sekundy — chodidlo za chodidlo, nie krok. NEPOUŽÍVAJ zoom prstami; ten len oreže obraz a stratí hĺbku.",
    prePSB: "Sadne na moment, keď ukazuješ chybu v postoji: divák sa priblíži spolu s tebou a uvidí ju sám.",
    fazy: [1, 2],
    pohyb: "dopredu",
    zdroj: { nazov: "The Best iPhone Camera Movements", url: "https://www.youtube.com/watch?v=-qJzQwXNERE" },
  },
  {
    id: "odhalenie",
    nazov: "Odhalenie spoza prekážky",
    coRobi: "Obraz je najprv zakrytý — dverami, stojanom, ramenom — a pohybom sa odkryje. Zvedavosť vzniká skôr, než mozog stihne rozhodnúť o odscrollovaní.",
    akoNaTo: "Postav telefón tak, aby v prvom okamihu vypĺňala záber blízka plocha (zárubňa, činka, tvoje rameno). Posuň sa vodorovne asi 40 cm doprava alebo doľava, aby sa scéna odkryla. Pomaly — jedna sekunda na odkrytie.",
    prePSB: "Dobré pri záberoch v štúdiu: prekážka dá priestoru hĺbku a zároveň naznačí, že tu ide o miesto, nie o cvik.",
    fazy: [1, 2, 3],
    pohyb: "odhalenie",
    zdroj: { nazov: "How to Shoot Better B-Roll on iPhone", url: "https://www.youtube.com/watch?v=1SpC0tcLw3E" },
  },
  {
    id: "oblúk",
    nazov: "Oblúk okolo človeka",
    coRobi: "Kamera obíde subjekt po krivke. Ukáže telo priestorovo — divák uvidí to, čo na statickej fotke nevidno.",
    akoNaTo: "Stoj asi dva metre od človeka, telefón v úrovni jeho hrudníka. Choď bokom po oblúku okolo neho a stred záberu drž stále na tom istom mieste tela. Štvrťkruh za tri sekundy stačí. Akčný režim zapnutý.",
    prePSB: "Najsilnejší záber na držanie tela — rotácia panvy alebo predsunuté rameno sú z jedného uhla neviditeľné a z oblúka zjavné.",
    fazy: [2, 3, 4],
    pohyb: "oblúk",
    zdroj: { nazov: "Camera Movement Basics: Pan, Tilt, Truck, Dolly", url: "https://www.youtube.com/watch?v=87e4DN-86NE" },
  },
  {
    id: "švih",
    nazov: "Švih (whip pan)",
    coRobi: "Rýchle otočenie s rozmazaním. Používa sa na zlom — bolo takto, teraz je takto — a schová strih.",
    akoNaTo: "Toč pri 4K a vyššej snímkovej frekvencii, nech je rozmazanie čisté. Otoč telefón vodorovne tak rýchlo, ako vieš, a druhý záber ZAČNI tým istým smerom otáčania. V strihu ich spoj v okamihu najväčšieho rozmazania.",
    prePSB: "Používaj striedmo. Sedí na porovnanie pred/po; na edukačný záber pôsobí ako trik a berie vážnosť.",
    fazy: [3, 4],
    pohyb: "švih",
    zdroj: { nazov: "Ultimate Guide to Camera Movement", url: "https://www.youtube.com/watch?v=IiyBo-qLDeM" },
  },
  {
    id: "vysledok-hned",
    nazov: "Výsledok hneď",
    coRobi: "V prvej sekunde je vidieť telo, ktoré sa UŽ zmenilo — nie problém, ale jeho konec. Nepopisuje problém, dokazuje, že sa dá vyriešiť.",
    akoNaTo: "Prvý záber je zmenený pohyb alebo postoj, bez úvodu a bez tváre: chôdza zboku, rameno v novej polohe, rebrá v pokoji. Statický alebo veľmi pomalý pohyb, aby oko malo čo čítať. Pôvodný stav ukáž až POTOM, nie naopak — obrátené poradie z toho urobí bežné pred/po.",
    prePSB: "Doplnené 23. 8. 2026 z výskumu: z 34 635 analyzovaných klipov je najvýkonnejší typ hooku práve ukázanie výsledku v prvých dvoch sekundách. Sedí to aj na Kaneov princíp „popíš problém lepšie než zákazník“ — nič ho nepopíše presnejšie než telo, ktoré ho už nemá.",
    fazy: [3, 4, 5],
    pohyb: "statický",
    zdroj: { nazov: "9 Creative Shot Ideas — Cinematic Camera Movements", url: "https://www.youtube.com/watch?v=Ky3OGTLDVO0" },
  },
  {
    id: "statický",
    nazov: "Statický, pohyb je v zábere",
    coRobi: "Kamera stojí. Pohybuje sa iba to, o čom hovoríš. Pôsobí to pokojne a dôveryhodne — a to je samo osebe posolstvo.",
    akoNaTo: "Telefón na statív alebo opretý o pevnú vec, v úrovni očí. Žiadny pohyb kamerou, žiadny zoom. Celý pohyb spraví človek v zábere. Nech je za ním čistý priestor, aby oko nemalo kam ujsť.",
    prePSB: "Toto patrí k fázam, kde sa človek rozhoduje. Nájazdy a švihy tam pôsobia ako reklama; nehybný záber ako práca.",
    fazy: [4, 5],
    pohyb: "statický",
  },
];

export const ZABER_MAPA = new Map(ZABERY.map((z) => [z.id, z]));

/** Zábery vhodné pre fázu, v poradí katalógu. */
export const zaberyPreFazu = (faza: number) => ZABERY.filter((z) => z.fazy.includes(faza));

/**
 * Riadok o zábere do zadania pre Claude Project.
 *
 * Prázdny reťazec, keď záber nie je vybraný — Project potom o ňom nepíše
 * a nevymyslí si vlastný.
 */
export function zaberDoZadania(id: string): string {
  const z = ZABER_MAPA.get(id);
  if (!z) return "";
  return [
    `ÚVODNÝ ZÁBER: ${z.nazov} — ${z.coRobi}`,
    `AKO SA TOČÍ: ${z.akoNaTo}`,
  ].join("\n");
}
