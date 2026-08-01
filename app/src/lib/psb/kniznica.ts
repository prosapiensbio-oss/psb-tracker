// Jerryho knižnica — 30 kníh v podobe jeho vlastných poznámok.
//
// Prečo NIE sú všetky v prompte: spolu majú ~379 000 znakov (~95k tokenov). Nacpať
// ich do každej správy by znamenalo posielať sto tisíc tokenov aj na otázku
// "koľko máme klientov". Namiesto toho je v prompte trvalo len REGISTER nižšie
// (~2k tokenov) a plné poznámky si Jarvis vypýta nástrojom `otvor_knihu`, keď
// téma naozaj sadne. Môže si ich vypýtať aj viac za sebou — presne ako človek,
// ktorý po prvej knihe zistí, že odpoveď je inde.
//
// Registrácia rastie lineárne: pri 100 knihách má register ~6k tokenov, čo je
// stále menej než jedna otvorená kniha. Tento model škáluje, ten predošlý nie.
//
// Pridanie knihy: hoď poznámky do kniznica/<id>.md a dopíš riadok do KNIHY.
// Nič iné netreba — glob nižšie ich načíta sám.

const suborY = import.meta.glob("./kniznica/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export type Kategoria =
  | "Referencie a slovo z úst"
  | "Pozícia a odlíšenie"
  | "Príbeh a obsah"
  | "Udržanie klienta"
  | "Cena a peniaze"
  | "Firma bez zakladateľa"
  | "Ľudia a nábor"
  | "Presviedčanie a rozhodovanie"
  | "Predaj a vyjednávanie";

export type Kniha = {
  id: string;
  nazov: string;
  autor: string;
  kat: Kategoria;
  /** O čom kniha je — jedna veta. */
  oCom: string;
  /** KEDY po nej siahnuť. Toto je to, čo rozhoduje o výbere, nie názov. */
  kedy: string;
};

// Poradie = poradie v registri. Kategórie držia pokope, aby si Jarvis vedel
// vybrať aj vtedy, keď nepozná konkrétny titul.
export const KNIHY: Kniha[] = [
  { id: "referral_engine", nazov: "The Referral Engine", autor: "John Jantsch", kat: "Referencie a slovo z úst",
    oCom: "Ako postaviť systém, ktorý generuje odporúčania zámerne, nie náhodou.",
    kedy: "Keď je téma referencie, odmena za doporučenie, „prečo o nás ľudia nehovoria“, alebo ako o odporúčanie požiadať bez trápnosti. PRE PSB NAJDÔLEŽITEJŠIA — 55–71 % klientov chodí odtiaľto." },
  { id: "contagious", nazov: "Contagious: Why Things Catch On", autor: "Jonah Berger", kat: "Referencie a slovo z úst",
    oCom: "Šesť dôvodov (STEPPS), prečo sa niečo šíri: sociálna mena, spúšťače, emócia, viditeľnosť, praktická hodnota, príbeh.",
    kedy: "Keď riešiš, prečo sa jeden príspevok zdieľa a druhý nie, alebo ako spraviť niečo prerozprávateľné." },
  { id: "influence", nazov: "Influence: The Psychology of Persuasion", autor: "Robert Cialdini", kat: "Presviedčanie a rozhodovanie",
    oCom: "Sedem pák vplyvu: reciprocita, sympatie, sociálny dôkaz, autorita, konzistencia, vzácnosť, jednota.",
    kedy: "Keď ide o to, prečo ľudia povedia áno alebo nie — pri cene, pri predĺžení balíčka, pri odporúčaní." },
  { id: "nudge", nazov: "Nudge", autor: "Thaler & Sunstein", kat: "Presviedčanie a rozhodovanie",
    oCom: "Architektúra voľby — ako nastavenie predvolieb mení rozhodnutia bez toho, aby čokoľvek zakazovalo.",
    kedy: "Keď navrhuješ, ako ponúknuť balíček, viazanosť alebo termín — čo má byť predvolené a čo výnimka." },
  { id: "made_to_stick", nazov: "Made to Stick", autor: "Chip & Dan Heath", kat: "Príbeh a obsah",
    oCom: "SUCCESs — prečo si niektoré myšlienky pamätáme a iné nie.",
    kedy: "Keď formuluješ vetu, ktorú má klient povedať doma, hook reelu alebo nadpis článku." },

  { id: "positioning", nazov: "Positioning: The Battle for Your Mind", autor: "Ries & Trout", kat: "Pozícia a odlíšenie",
    oCom: "Pozícia sa nevytvára v produkte, ale v hlave zákazníka — a vždy voči niečomu inému.",
    kedy: "Keď je otázka „ako sa máme predstavovať“, „sme fyzio alebo tréning“, alebo ako obsadiť kategóriu. Obsahuje aj pasce v názvoch a rebríčky v hlave." },
  { id: "different", nazov: "Different: Escaping the Competitive Herd", autor: "Youngme Moon", kat: "Pozícia a odlíšenie",
    oCom: "Byť lepší je slabšie než byť iný; kategórie, kde všetci súťažia na tej istej osi, splynú.",
    kedy: "Keď sa porovnávaš s fyzioterapiou alebo inými trénermi a chceš vedieť, či to má vôbec zmysel." },
  { id: "this_is_marketing", nazov: "This Is Marketing", autor: "Seth Godin", kat: "Pozícia a odlíšenie",
    oCom: "Marketing je zmena pre najmenší životaschopný trh — a odmietanie je jeho súčasťou.",
    kedy: "Keď je otázka „komu vlastne slúžime“ a „koho máme odmietať“." },
  { id: "building_storybrand", nazov: "Building a StoryBrand", autor: "Donald Miller", kat: "Príbeh a obsah",
    oCom: "SB7: klient je hrdina, ty sprievodca; vonkajší, vnútorný a filozofický problém.",
    kedy: "Keď píšeš text na web, do reklamy alebo na stránku služby a nevieš, čím začať." },
  { id: "stories_that_stick", nazov: "Stories That Stick", autor: "Kindra Hall", kat: "Príbeh a obsah",
    oCom: "Štyri príbehy, ktoré firma potrebuje: hodnota, zakladateľ, účel, zákazník.",
    kedy: "Keď robíš klientsky príbeh alebo rozprávaš, prečo ste prešli na FP a presťahovali sa do Brna." },
  { id: "they_ask_you_answer", nazov: "They Ask, You Answer", autor: "Marcus Sheridan", kat: "Príbeh a obsah",
    oCom: "Píš odpovede na otázky, ktoré klienti reálne kladú — vrátane nepohodlných (cena, porovnania, pre koho to nie je).",
    kedy: "Keď hľadáš tému článku alebo reelu. Najrýchlejšia cesta od „o čom písať“ k hotovému zoznamu." },
  { id: "content_chemistry", nazov: "Content Chemistry", autor: "Andy Crestodina", kat: "Príbeh a obsah",
    oCom: "Praktická mechanika obsahu na webe: zdroje návštevnosti, konverzie, formáty, SEO.",
    kedy: "Keď riešiš konkrétnu stránku, nadpis, mieru prekliku alebo prečo článok neprináša dopyty." },
  { id: "content_inc", nazov: "Content Inc.", autor: "Joe Pulizzi", kat: "Príbeh a obsah",
    oCom: "Najprv vybuduj publikum, až potom mu predávaj — sweet spot, content tilt, jedna platforma.",
    kedy: "Keď je otázka, či a ako stavať obsah dlhodobo, a na akú jednu vec sa zúžiť." },
  { id: "epic_content_marketing", nazov: "Epic Content Marketing", autor: "Pulizzi & Piper", kat: "Príbeh a obsah",
    oCom: "Obsahová stratégia, proces a distribúcia vo väčšom rozsahu.",
    kedy: "Keď už obsah beží a ide o systém, kalendár a znovupoužitie, nie o prvý krok." },
  { id: "digital_marketing", nazov: "Digital Marketing: Strategy, Implementation and Practice", autor: "Chaffey & Ellis-Chadwick", kat: "Príbeh a obsah",
    oCom: "Učebnicový prehľad digitálnych kanálov, meraní a plánovania.",
    kedy: "Keď treba názvoslovie alebo rámec na kanály a atribúciu. Najmenej „PSB“ z celej knižnice — používaj striedmo." },

  { id: "never_lose", nazov: "Never Lose a Customer Again", autor: "Joey Coleman", kat: "Udržanie klienta",
    oCom: "Osem fáz prvých 100 dní; väčšina ľudí odchádza pre pocit, nie pre výsledok.",
    kedy: "Keď riešiš prvých 30 dní klienta, odchody, „duchov“ alebo onboarding. Druhá najdôležitejšia kniha pre PSB." },
  { id: "loyalty_effect", nazov: "The Loyalty Effect", autor: "Frederick Reichheld", kat: "Udržanie klienta",
    oCom: "Ekonomika lojality — malý nárast retencie zdvíha zisk neúmerne veľa; platí pre klientov aj zamestnancov.",
    kedy: "Keď treba obhájiť, prečo sa oplatí udržať klienta namiesto zháňania nového, alebo pri fluktuácii trénerov." },
  { id: "trusted_advisor", nazov: "The Trusted Advisor", autor: "Maister, Green, Galford", kat: "Udržanie klienta",
    oCom: "Rovnica dôvery: (dôveryhodnosť + spoľahlivosť + blízkosť) / vlastný záujem.",
    kedy: "Keď ide o vzťah s klientom, o to, ako neznieť ako predajca, alebo prečo im ľudia veria." },
  { id: "pumpkin_plan", nazov: "The Pumpkin Plan", autor: "Mike Michalowicz", kat: "Firma bez zakladateľa",
    oCom: "Nájdi najlepších klientov, znásob to, čo im dávaš, a zvyšok odstrihni.",
    kedy: "Keď je otázka, na ktorých klientov sa sústrediť a ktorých pustiť. Priamo súvisí s ich „obrími tekvicami“." },

  { id: "impact_pricing", nazov: "Impact Pricing", autor: "Mark Stiving", kat: "Cena a peniaze",
    oCom: "Cenová segmentácia, portfólio cien a ako cena súvisí s vnímanou hodnotou.",
    kedy: "Keď meníš cenník, zvažuješ balíčky alebo zľavy (vrátane BTC a referral zliav)." },
  { id: "vbp", nazov: "Value-Based Pricing", autor: "Macdivitt & Wilkinson", kat: "Cena a peniaze",
    oCom: "Cena sa odvodzuje od hodnoty pre klienta, nie od odpracovaného času.",
    kedy: "Keď narazíš na rozpor „klient platí za zmenu života, ale cenník je v hodinách“." },
  { id: "profit_first", nazov: "Profit First", autor: "Mike Michalowicz", kat: "Cena a peniaze",
    oCom: "Zisk sa neplánuje ako zvyšok, ale odkladá ako prvý; systém účtov a percent.",
    kedy: "Keď je otázka cashflow, rezervy alebo „kam sa podeli peniaze“." },
  { id: "money_models", nazov: "$100M Money Models", autor: "Alex Hormozi", kat: "Cena a peniaze",
    oCom: "Ponuky, ktoré financujú akvizíciu: attraction, upsell, downsell, continuity.",
    kedy: "Keď navrhuješ štruktúru ponuky — úvodný tréning, balíčky, viazanosť, online. Moderné a agresívne; over voči ich hodnotám." },
  { id: "measure_what_matters", nazov: "Measure What Matters (OKR)", autor: "John Doerr", kat: "Firma bez zakladateľa",
    oCom: "OKR — ciele s merateľnými výsledkami, committed vs aspirational, CFR namiesto ročných hodnotení.",
    kedy: "Keď sa stavajú alebo triedia ciele. Toto je jediný súbor, ktorý je už napísaný ako PSB analýza, nie ako čisté poznámky." },

  { id: "emyth", nazov: "The E-Myth Revisited", autor: "Michael Gerber", kat: "Firma bez zakladateľa",
    oCom: "Firma, ktorá stojí na zakladateľovi, nie je firma, ale práca; systematizuj to, čo sa opakuje.",
    kedy: "Keď je téma delegovanie, manuály, alebo ako odovzdať tréning novému trénerovi." },
  { id: "built_to_sell", nazov: "Built to Sell", autor: "John Warrillow", kat: "Firma bez zakladateľa",
    oCom: "Sprav z opakovanej služby produkt s jasným procesom, aby nezávisela na tebe.",
    kedy: "Keď riešiš štandardizáciu tréningového procesu alebo hodnotu firmy bez Jerryho." },
  { id: "company_of_one", nazov: "Company of One", autor: "Paul Jarvis", kat: "Firma bez zakladateľa",
    oCom: "Rast nie je jediná odpoveď — menší, ale slobodnejší podnik je legitímny cieľ.",
    kedy: "Keď návrh tlačí na rast a treba pripomenúť, že Jerry chce pracovať MENEJ. Protiváha k Hormozimu." },
  { id: "good_to_great", nazov: "Good to Great", autor: "Jim Collins", kat: "Firma bez zakladateľa",
    oCom: "Level 5 líder, najprv kto potom čo, ježkov koncept, brutálne fakty.",
    kedy: "Keď je otázka dlhodobého smerovania alebo priorít — a keď treba pomenovať nepríjemnú pravdu." },
  { id: "who", nazov: "Who: The A Method for Hiring", autor: "Smart & Street", kat: "Ľudia a nábor",
    oCom: "Scorecard, zdroje kandidátov, štyri pohovory, referencie — metóda na prijímanie ľudí.",
    kedy: "Keď ide o hľadanie ďalšieho TRÉNERA. To je úzke hrdlo PSB, takže táto kniha je dôležitejšia, než sa zdá." },
  { id: "never_split", nazov: "Never Split the Difference", autor: "Chris Voss", kat: "Predaj a vyjednávanie",
    oCom: "Taktická empatia, zrkadlenie, pomenovanie, kalibrované otázky, pozor na „áno“.",
    kedy: "Keď ide o rozhovor s klientom o cene, o nájme s prenajímateľom alebo o dohodu s Jarkom." },
];

/** Register do systémového promptu — kompaktný, aby sa vošiel a dal čítať. */
export function registerKniznice(): string {
  const podlaKat = new Map<string, Kniha[]>();
  for (const k of KNIHY) {
    const zoz = podlaKat.get(k.kat) || [];
    zoz.push(k);
    podlaKat.set(k.kat, zoz);
  }
  const casti: string[] = [];
  for (const [kat, knihy] of podlaKat) {
    casti.push(`### ${kat}`);
    for (const k of knihy) casti.push(`- **${k.id}** — ${k.nazov} (${k.autor}). ${k.oCom} KEDY: ${k.kedy}`);
  }
  return casti.join("\n");
}

/** Plné poznámky ku knihe, alebo null. */
export function textKnihy(id: string): string | null {
  const s = suborY[`./kniznica/${id}.md`];
  return typeof s === "string" ? s : null;
}

export const IDS_KNIH = KNIHY.map((k) => k.id);
