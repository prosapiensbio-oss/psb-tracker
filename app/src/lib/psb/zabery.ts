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

export type Pohyb =
  | "dopredu" | "odhalenie" | "oblúk" | "sklopenie" | "švih" | "statický"
  // Pribudlo 26. 8. 2026: pri siedmich záberoch a pravidle „dva rovnaké pohyby
  // za sebou nie" sa Jarvisovi točili dokola štyri. Nové pohyby nie sú ozdoba —
  // sú to uhly, ktoré biomechanika naozaj potrebuje: chôdza zboku, chodidlá
  // zhora, reťaz zdola nahor.
  | "dozadu" | "sledovanie" | "zhora" | "zdola" | "naklon" | "prelet";

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
    id: "sledovanie",
    nazov: "Sledovanie chôdze zboku",
    coRobi: "Ide vedľa človeka a drží ho v rovnakom mieste obrazu, kým sa okolo neho hýbe pozadie. Chôdza sa dá čítať ako pohyb, nie ako séria póz.",
    akoNaTo: "Postav sa dva metre nabok od klienta, telefón na výšku panvy. Kráčaj s ním rovnakým tempom a drž ho stále v tej istej tretine obrazu. Akčný režim ZAPNI. Nechaj bežať aspoň päť krokov — kratšie sa cyklus chôdze nedá uvidieť.",
    prePSB: "Toto je záber, ktorý robí vašu prácu viditeľnou. Analýza chôdze na statickom zábere nevyzerá ako nič; tu vidno, že sa niečo deje.",
    fazy: [2, 3, 4],
    pohyb: "sledovanie",
  },
  {
    id: "chodidla-zhora",
    nazov: "Chodidlá zhora",
    coRobi: "Pohľad zvislo dole na chodidlá a ich rozloženie. Ukáže to, čo z výšky očí vidieť nie je.",
    akoNaTo: "Telefón drž nad chodidlami zhruba v úrovni pása, objektív kolmo dole. Zaber obe chodidlá aj kus podlahy okolo. Keď stojí, nechaj dve sekundy pokoj; keď prenáša váhu, natáčaj celý prenos.",
    prePSB: "Ploché nohy a rozloženie váhy sú vaša bežná téma a z profilu sa nedajú ukázať. Toto je jediný uhol, kde to divák uvidí sám.",
    fazy: [2, 3],
    pohyb: "zhora",
  },
  {
    id: "nizky-uhol",
    nazov: "Nízky uhol od zeme",
    coRobi: "Telefón takmer na podlahe. Členky a kolená dostanú váhu, akú v bežnom zábere nemajú.",
    akoNaTo: "Polož telefón na podlahu opretý o niečo, alebo ho drž pár centimetrov nad ňou. Objektív mierne hore. Nezoomuj — priblíž sa telefónom. Pozor na to, čo je za klientom: z tohto uhla je vidieť celý strop.",
    prePSB: "Keď hovoríš o základni — chodidlo, členok, koleno — tento uhol jej dáva dôležitosť, ktorú v texte tvrdíš.",
    fazy: [2, 3],
    pohyb: "zdola",
  },
  {
    id: "naklon-po-tele",
    nazov: "Naklonenie po tele",
    coRobi: "Plynulý náklon od chodidiel po hlavu. Ukáže telo ako jednu reťaz, nie ako kus, o ktorom sa práve hovorí.",
    akoNaTo: "Postav sa dva metre od klienta, telefón na chodidlá. Nakláňaj ho hore rovnomerne tri až štyri sekundy, až po hlavu. Telefón sa NEDVÍHA — otáča sa. Lakte pri tele, aby náklon nebol trhaný.",
    prePSB: "„Bolí koleno, ale začína to v panve“ sa nedá povedať lepšie než záberom, ktorý po tom tele naozaj prejde.",
    fazy: [1, 2, 3],
    pohyb: "naklon",
  },
  {
    id: "cuvanie",
    nazov: "Cúvanie pred človekom",
    coRobi: "Ide pred kráčajúcim človekom a cúva. Divák ide oproti nemu — je to najosobnejší spôsob, ako niekoho ukázať v pohybe.",
    akoNaTo: "Postav sa dva až tri metre pred klienta, telefón na výšku hrudníka. Cúvaj rovnakým tempom, ako ide on. NECHAJ SI ZA CHRBTOM VOĽNÚ CESTU a pozri sa tam skôr, než začneš. Akčný režim zapni.",
    prePSB: "Pri klientskych príbehoch a pri záveroch: človek prichádza k divákovi, nie od neho odchádza.",
    fazy: [4, 5],
    pohyb: "dozadu",
  },
  {
    id: "prelet",
    nazov: "Prechod cez popredie",
    coRobi: "Niečo blízke prejde cez obraz a odkryje, čo je za tým. Funguje ako strih bez strihu.",
    akoNaTo: "Nechaj v popredí predmet (rám dverí, stojan, rameno) asi 30 cm od objektívu. Pomaly prejdi tak, aby predmet prešiel celým obrazom a odhalil klienta. Dve sekundy stačia. Zaostri na klienta VOPRED, nie počas prechodu.",
    prePSB: "Keď potrebuješ v jednom zábere prejsť z jednej veci na druhú a nechceš strih, ktorý by rozbil tempo.",
    fazy: [3, 4],
    pohyb: "prelet",
  },
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
/**
 * Keď záber vybraný NIE JE, zadanie ponúkne katalóg pre danú fázu.
 *
 * Bez toho si ten, kto píše, zábery vymyslí — a vyzerá to presne tak.
 * Jerry, 30. 8. 2026: „tie zábery mi prídu ako náhodne generované obrázky.“
 * Mal pravdu a bola to moja chyba: katalóg pätnástich záberov s návodom, ako
 * sa točia telefónom, tu je od začiatku a ja som ho obišiel.
 */
export function zaberyProFazu(faza: number): string {
  const vhodne = ZABERY.filter((z) => z.fazy.includes(faza as never));
  if (!vhodne.length) return "";
  return [
    "ÚVODNÝ ZÁBER NIE JE VYBRANÝ. Zábery si NEVYMÝŠĽAJ — vyber jeden z tohto katalógu a povedz, prečo práve ten:",
    ...vhodne.map((z) => `• ${z.nazov} — ${z.coRobi}`),
    "Ak ti ani jeden nesedí, napíš to a nechaj výber na mne; lepšie žiadny záber než vymyslený.",
  ].join("\n");
}

export function zaberDoZadania(id: string): string {
  const z = ZABER_MAPA.get(id);
  if (!z) return "";
  return [
    `ÚVODNÝ ZÁBER: ${z.nazov} — ${z.coRobi}`,
    `AKO SA TOČÍ: ${z.akoNaTo}`,
  ].join("\n");
}
