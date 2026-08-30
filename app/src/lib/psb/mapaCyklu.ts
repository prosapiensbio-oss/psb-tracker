/**
 * Mapa nákupného cyklu — jedna definícia fáz pre celú appku.
 *
 * PREČO FÁZY A NIE KATEGÓRIE
 *
 * Kategória („Edukácia", „Klientsky príbeh") hovorí, AKO je príspevok
 * urobený. Fáza hovorí, KOMU je určený — človeku, ktorý o probléme ešte
 * nevie, alebo tomu, ktorý sa rozhoduje medzi nami a fyzioterapiou. Sú to
 * dve nezávislé osi a plánovať sa dá len podľa tej druhej: v októbri
 * nechýbajú „karusely", chýbajú dôvody ozvať sa.
 *
 * Rámec je päť stavov uvedomenia (Eugene Schwartz) — ten istý, aký má
 * Jarvis v knižnici, aby si obrazovka a jeho odpoveď neprotirečili.
 *
 * ZAČIATOK JE ODHAD
 *
 * 116 zverejnených príspevkov (03/2025 – 08/2026) zaradil 23. 8. 2026 model
 * z textu háku, nie človek. Zaradenie sa dá pri každom príspevku prepísať
 * a starších 149 kusov zostáva nezaradených zámerne — dopočítať ich spätne
 * by vyrobilo presnosť, ktorá tam nie je.
 */

import { jeMesiac } from "./format";
import { zaberDoZadania, zaberyProFazu } from "./zabery";
import { dlzkaDoZadania, sekvenciaDoZadania } from "./sekvencia";

export type Faza = 0 | 1 | 2 | 3 | 4 | 5;

export type FazaDef = {
  id: Faza;
  nazov: string;
  /** Kto to je — jedna veta, ktorú Jerry číta pri plánovaní. */
  kto: string;
  /** Čo taký obsah má urobiť. */
  uloha: string;
  farba: string;
};

export const FAZY: FazaDef[] = [
  { id: 1, nazov: "Nevie o probléme", kto: "Necíti nič, alebo to má za normál.", uloha: "Ukázať, že otázka vôbec existuje.", farba: "#3E82A8" },
  { id: 2, nazov: "Tuší problém", kto: "Vie, že ho niečo bolí. Nevie, že sa s tým dá pracovať.", uloha: "Pomenovať príznak jeho slovami.", farba: "#3D9B99" },
  { id: 3, nazov: "Hľadá riešenie", kto: "Porovnáva fyzio, posilku, strečing, YouTube.", uloha: "Vysvetliť, prečo doterajšie pokusy nezabrali.", farba: "#6EA45C" },
  { id: 4, nazov: "Vyberá dodávateľa", kto: "Vie, čo chce. Rozhoduje sa medzi nami a niekým iným.", uloha: "Ukázať, ako to u nás vyzerá a v čom sme iní.", farba: "#C08F32" },
  { id: 5, nazov: "Rozhodnutý", kto: "Je pripravený. Chýba mu dôkaz a dôvod ozvať sa dnes.", uloha: "Dať výsledok konkrétneho človeka a jasný ďalší krok.", farba: "#B45038" },
];

export const FAZA_MAPA = new Map<number, FazaDef>(FAZY.map((f) => [f.id, f]));

/**
 * Výzva na akciu podľa fázy.
 *
 * Do 30. 8. 2026 zadanie hovorilo, KOMU sa píše a ČO má obsah urobiť, ale
 * o CTA mlčalo — takže každý scenár končil úvodnou diagnostikou. Jerry:
 * „nemalo by tam byť aj nejaké CTA pre jednotlivé nákupné fázy?“ Má pravdu:
 * pýtať si tréning od človeka, ktorý ešte nevie, že má problém, je zahodená
 * výzva a zároveň dôvod, prečo pôsobí obsah tlačivo.
 *
 * Rebrík ide od „nič si nepýtaj“ po „ozvi sa dnes“. Ku každej fáze patrí to,
 * čo si od diváka v tej chvíli MÔŽEŠ pýtať — nie to, čo by sme chceli.
 * Naliehavosť a umelý nedostatok sú mimo (kánon).
 */
export const CTA_FAZY: Record<number, string> = {
  1: "ŽIADNY odkaz a žiadna ponuka. Kto nevie, že má problém, nemá dôvod nikam klikať — a prosba oň znehodnotí aj to, čo si práve ukázal. Namiesto toho daj vec, ktorú si divák overí na sebe HNEĎ počas pozerania (postav sa, urob krok, všimni si X). Ak už niečo pýtaš, tak uloženie príspevku na neskôr.",
  2: "Test postury na prosapiens.cz/test-postury — zadarmo, tri minúty, výsledok do 24 hodín. Presne to, čo človek s príznakom potrebuje: premeniť „niečo ma bolí“ na pomenovanie. Nepýtaj tréning.",
  3: "Odkáž na JEDNU konkrétnu stránku, nikdy na rozcestník — kto si má vybrať z ôsmich tém, nevyberie ani jednu. Je to stránka toho dokumentu, na ktorom si kus postavil (viď zoznam vyššie), a v texte ju POMENUJ: nie „osem tém“, ale názov tej jednej. Každý dokument je aj podcast, takže sa dá ponúknuť na prečítanie aj na vypočutie. Príručku /dychani ponúkni LEN pri téme o dychu.",
  4: "Ukáž, ako to u nás vyzerá: prosapiens.cz/jak-to-funguje, /co-je-functional-patterns, a keď téma dovolí, prosapiens.cz/online-trenink. Tu má zmysel aj overená certifikácia. Stále je to „pozri sa“, nie „objednaj sa“ — rozhoduje sa medzi nami a niekým iným a potrebuje podklady.\nONLINE JE ZÁMER: Kokpit ho meria ako KPI „Online podiel“ s cieľom 10–15 % odtrénovaných hodín a skutočnosť je hlboko pod ním. Kedykoľvek obsah nie je viazaný na Brno, spomeň, že sa dá trénovať online — je to jediné CTA, ktoré nemá strop v kapacite štúdia.",
  5: "Úvodná diagnostika — odkaz v biu alebo správa. Toto je jediná fáza, kde sa priamo pýta o stretnutie, a preto to tu má vyznieť samozrejme, nie naliehavo.",
};

/**
 * Dokumenty, z ktorých sa dá stavať obsah.
 *
 * Deväť tém z prosapiens.cz/pochopte-sve-telo, každá ako text AJ ako podcast.
 * Jerry, 30. 8. 2026: „verím, že na každý z tých dokumentov sa dá spraviť
 * príspevok, reel aj infografika na každú fázu.“ Deväť dokumentov × päť fáz
 * je 45 kusov obsahu — pri tempe 7,6 príspevku mesačne je to zásoba na roky,
 * a to sú len tieto; sú k tomu ešte články, Naudiho streamy a kniha o fasciách.
 *
 * DVA ÚČELY NARAZ: dokument dáva látku (fakty, ktoré sa nedajú vymyslieť)
 * a zároveň je CTA — kus postavený na Strečingu končí odkazom na Strečing.
 * Tým sa rieši aj to, že odkaz na rozcestník s ôsmimi témami je odkaz na nič.
 *
 * ADRESY: osem tém žije POD rozcestníkom (/pochopte-sve-telo/<téma>),
 * protokol o myofasciálnom uvoľňovaní na koreni. Overené 30. 8. 2026 —
 * bez presmerovania. Prvý raz som ich napísal na koreň a fungovali len
 * cez presmerovanie; test s `redirect: "follow"` to zamaskoval.
 *
 * NIE KAŽDÁ BUNKA MATICE STOJÍ ZA VYPLNENIE. Výživa vo fáze „vyberá
 * dodávateľa“ nepovie, prečo si vybrať nás. Matica je zásoba, nie plán.
 */
export const DOKUMENTY: { nazov: string; slug: string; dava: string }[] = [
  { nazov: "Principy biomechaniky", slug: "pochopte-sve-telo/principy-biomechaniky", dava: "ako telo prenáša silu — základ pod všetko ostatné" },
  { nazov: "Fascie: Skrytá síť v těle", slug: "pochopte-sve-telo/fascie-voda-v-nas-2", dava: "prečo bolí inde, než je príčina" },
  { nazov: "Mechanotransdukce", slug: "pochopte-sve-telo/mechanotransdukce-jak-sily-formuji-vase-telo", dava: "ako záťaž prestavuje tkanivo — argument pre trpezlivosť" },
  { nazov: "Strečink: Mýty a legendy", slug: "pochopte-sve-telo/strecink-myty-a-legend", dava: "prečo naťahovanie nedrží; najlepší materiál na vyvracanie" },
  { nazov: "Postura — základ zdravého těla", slug: "pochopte-sve-telo/postura-drzeni-tela", dava: "držanie tela ako výsledok, nie ako poloha" },
  { nazov: "Výživa pro pohyb a regeneraci", slug: "pochopte-sve-telo/vyziva-k-lepsi-regeneraci", dava: "prostredie, v ktorom sa telo mení; Terezkina téma" },
  { nazov: "Ideální přístup k tréninku", slug: "pochopte-sve-telo/idealni-pristup-2", dava: "ako má tréning vyzerať a prečo" },
  { nazov: "Co očekávat od biomechanického tréninku", slug: "pochopte-sve-telo/co-ocekavat-od-biomechanickeho-treninku", dava: "časový rámec a čo sa deje kedy — proti falošným očakávaniam" },
  { nazov: "Myofasciální uvolňování — protokol", slug: "protokol-o-myofascialnim-uvolnovani", dava: "praktický postup, ktorý si divák môže skúsiť sám" },
];

/** Katalóg dokumentov do zadania — látka aj cieľ odkazu v jednom. */
export function dokumentyDoZadania(): string {
  return [
    "POSTAV TO NA JEDNOM DOKUMENTE. Na začiatku odpovede napíš, ktorý si zvolil; jeho stránka je zároveň CTA (platí pre fázu 3, v ostatných fázach sa CTA riadi svojím pravidlom).",
    ...DOKUMENTY.map((d) => `• ${d.nazov} — ${d.dava} · prosapiens.cz/${d.slug}`),
    "Každý z nich je aj podcast, takže sa dá ponúknuť na počúvanie. Ak téma zadania nesedí ani na jeden, povedz to a stav na tom, čo je v zadaní — dokument si NEVYMÝŠĽAJ.",
  ].join("\n");
}

/**
 * Tvary obsahu — aby nebol každý kus príbeh klienta.
 *
 * Jerry, 30. 8. 2026: „stala sa z toho jednotvárnosť, buď je to príbeh toho
 * alebo onoho.“ Mal pravdu. Zákon „píš, čo sa stalo jednému človeku“ je dobrý
 * ako zdroj konkrétnosti, ale zlý ako jediný formát — päť po sebe idúcich
 * scenárov vyzeralo ako päť prípadových štúdií. Príbeh je JEDEN z tvarov,
 * nie ten jediný.
 */
export const FORMATY: { nazov: string; co: string }[] = [
  { nazov: "Rozbor jedného cviku", co: "Ukáž, ako ho ľudia robia, a čo sa pri tom deje inde v tele. Bez klienta, bez príbehu — stačí telo a kamera." },
  { nazov: "Otázka od klienta", co: "Vezmi vetu, ktorú ti niekto povedal na tréningu, a odpovedz na ňu. Jazyk otázky je jazyk publika a nedá sa vymyslieť." },
  { nazov: "Vyvrátenie tvrdenia", co: "Vec, ktorú počuť všade („strečing na to pomôže“). Povedz, prečo to nesedí, a čím to nahradiť. Vecne, bez posmechu." },
  { nazov: "Pozorovanie z praxe", co: "„Tento týždeň prišli traja ľudia s tým istým.“ Nie príbeh jedného, ale vzorec, ktorý vidíš opakovane." },
  { nazov: "Demonštrácia bez slov", co: "Rozdiel, ktorý je vidieť. Text na obrazovke, minimum hovoreného. Najsilnejšie tam, kde sa pohyb dá porovnať pred a po." },
  { nazov: "Príbeh klienta", co: "Čo sa stalo jednému človeku. Najsilnejší tvar — a preto sa vyčerpá najrýchlejšie, keď sa použije na všetko." },
];

/** Riadok o formáte do zadania — s pripomienkou, že sa nemá opakovať. */
export function formatyDoZadania(): string {
  return [
    "TVAR OBSAHU — vyber jeden a napíš na začiatku odpovede, ktorý si zvolil:",
    ...FORMATY.map((f) => `• ${f.nazov} — ${f.co}`),
    "Dva rovnaké tvary za sebou nie sú obsahový plán, ale šablóna. Keď v zadaní vidíš, že predošlý kus bol príbeh klienta, siahni po inom.",
  ].join("\n");
}

/** Riadok o CTA do zadania. Bez fázy sa nepridáva — hádať by sa nemalo. */
export function ctaDoZadania(faza: number): string {
  const cta = CTA_FAZY[faza];
  if (!cta) return "";
  return [
    `VÝZVA NA AKCIU (CTA) PRE TÚTO FÁZU: ${cta}`,
    "Jedno CTA na jeden kus obsahu, nie tri. Formu striedaj (odkaz v biu, správa, link sticker, uloženie) — tá istá veta pod každým príspevkom prestane fungovať. V Stories NEPOUŽÍVAJ „odkaz v biu“, tam je link sticker alebo správa.",
  ].join("\n");
}


export const jeFaza = (v: unknown): v is Faza => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 5;

/** Názov fázy pre výpisy — aj pre nezaradené, nech nikde nesvieti holá nula. */
export const nazovFazy = (f: number) => FAZA_MAPA.get(f)?.nazov ?? "Nezaradené";

/**
 * Os mapy: `dozadu` mesiacov histórie po kotvu a `dopredu` mesiacov na plán.
 *
 * Kotva je posledný mesiac s dátami (nie kalendár) — to je pravidlo, ktoré
 * v appke platí pre všetky grafy. Plánovacia časť ide ZA dnešok zámerne:
 * bez budúcich stĺpcov je mapa len prehliadka minulosti a plánovať sa v nej
 * nedá.
 */
/**
 * Koľko mesiacov dopredu má mapa siahať.
 *
 * Po december BUDÚCEHO roka. Jerry plánuje obsah dopredu a keď sa mu os končí
 * o štyri mesiace, nemá kam klikať — v auguste 2026 mu mapa dovolila plánovať
 * len do decembra 2026 (26. 8. 2026). Takto je vždy k dispozícii zvyšok
 * tohto roka a celý ten nasledujúci, a s prelomom roka pribudne ďalší celý
 * rok sám. Nič sa nemusí prestavovať v januári.
 */
export function mesiacovDopredu(mesiac: string): number {
  if (!jeMesiac(mesiac)) return 4;
  return 24 - Number(mesiac.slice(5, 7));
}

export function osMapy(kotvaMesiac: string, dozadu = 12, dopredu = 4): string[] {
  if (!jeMesiac(kotvaMesiac)) return [];
  const [r, m] = kotvaMesiac.split("-").map(Number);
  const out: string[] = [];
  for (let i = -dozadu + 1; i <= dopredu; i++) {
    const d = new Date(Date.UTC(r, m - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Krátky tvar mesiaca pre hlavičku stĺpca: „9." a rok len pri januári. */
export function popisMesiaca(m: string): { mesiac: string; rok: string } {
  const [r, mm] = m.split("-");
  return { mesiac: `${Number(mm)}.`, rok: mm === "01" ? r : "" };
}

export type SlotPlanu = {
  id: string;
  faza: number;
  mesiac: string;
  /** O čom to bude — návrh captionu alebo popis. */
  koncept: string;
  /** Kto v tom vystupuje: klient, Jerry, Terezka. */
  kto: string;
  /** Pôvodná veta nápadu. */
  text: string;
  /** Hotové vety z Claude Projectu — to, čo naozaj pôjde von. */
  hotovyText: string;
  /** Id úvodného záberu z katalógu ZABERY. */
  zaber: string;
  /** Sekvencia záberov ako JSON (pole Krok). Prázdne = ešte nerozpísané. */
  sekvencia: string;
  /** Čo Jerry HOVORÍ na kameru — iný text než popis pod príspevkom. */
  scenar: string;
  /**
   * Alternatívne úvodné vety, jedna na riadok.
   *
   * Project ich navrhuje ku každému textu. Nesedia v scenári preto, že scenár
   * je JEDNA verzia — toto sú tie, ktoré sa dajú skúsiť, keď prvá nesadne.
   */
  uvodneVety: string;
  /** Hashtagy pod príspevok. Bez nich sa nedá zverejniť. */
  hashtagy: string;
  /**
   * Nastavenie titulky ako JSON — skladba, režim, texty, ručné úpravy.
   * Fotka tu NIE JE: je to súbor z Jerryho počítača a ako `data:` URI by
   * nafúkla každú odpoveď plánovača o stovky kilobajtov.
   */
  titulka: string;
  zdroj: string;
  stav: string;
};

export type ZverejnenyKus = {
  datum: string;
  mesiac: string;
  faza: number;
  hook: string;
  dosah: number;
  ulozenia: number;
};

export type Bunka = {
  mesiac: string;
  faza: number;
  /** Čo v tom mesiaci a fáze už vyšlo. */
  vyslo: ZverejnenyKus[];
  /** Čo je na ten mesiac a fázu naplánované. */
  plan: SlotPlanu[];
};

/**
 * Mriežka mesiac × fáza. Prázdna bunka je informácia, preto sa vyrábajú
 * všetky — nie len tie, kde niečo je.
 */
export function mriezka(os: string[], vyslo: ZverejnenyKus[], plan: SlotPlanu[]): Map<string, Bunka> {
  const out = new Map<string, Bunka>();
  for (const m of os) for (const f of FAZY) out.set(`${m}|${f.id}`, { mesiac: m, faza: f.id, vyslo: [], plan: [] });
  for (const p of vyslo) {
    const b = out.get(`${p.mesiac}|${p.faza}`);
    if (b) b.vyslo.push(p);
  }
  for (const s of plan) {
    const b = out.get(`${s.mesiac}|${s.faza}`);
    if (b) b.plan.push(s);
  }
  return out;
}

/**
 * Koľko toho v danej fáze za posledných `okno` mesiacov vyšlo — podklad pre
 * vetu „na túto fázu si za pol roka nedal nič".
 */
export function tempoFaz(os: string[], vyslo: ZverejnenyKus[], kotva: string, okno = 6): Map<number, number> {
  const od = os.filter((m) => m <= kotva).slice(-okno);
  const set = new Set(od);
  const out = new Map<number, number>(FAZY.map((f) => [f.id, 0]));
  for (const p of vyslo) if (set.has(p.mesiac)) out.set(p.faza, (out.get(p.faza) || 0) + 1);
  return out;
}

/**
 * Text, ktorý si Jerry skopíruje do Claude Projectu.
 *
 * PREČO NIE LEN KONCEPT
 *
 * Project nevidí do Kokpitu. Keď mu pošleš holú vetu „reel o tom, že úľava
 * po fyziu vydrží tri dni", nevie, komu je určená ani čo má urobiť — a napíše
 * text pre niekoho iného. Fáza, publikum a úloha sú tri riadky, ktoré z toho
 * robia zadanie namiesto námetu.
 *
 * PREČO SA PRIPOMÍNA MENO KLIENTA
 *
 * V appke je pole „kto v tom vystupuje" a býva v ňom meno. Do textu, ktorý
 * pôjde von, meno ani zdravotný detail nepatria — v Zadaní je to pravidlo od
 * začiatku a tu sa naň dá zabudnúť práve preto, že sa kopíruje jedným klikom.
 */
export function zadanieProProject(s: {
  mesiac: string; faza: number; koncept: string; kto: string;
  hotovyText?: string; zaber?: string; sekvencia?: string; scenar?: string; uvodneVety?: string;
}): string {
  const f = FAZA_MAPA.get(s.faza);
  const riadky = [
    `Obsah pre PSB na ${s.mesiac || "neurčený mesiac"}.`,
    "",
    `FÁZA NÁKUPNÉHO CYKLU: ${f?.nazov ?? nazovFazy(s.faza)}`,
    `KTO TO ČÍTA: ${f?.kto ?? "—"}`,
    `ČO MÁ OBSAH UROBIŤ: ${f?.uloha ?? "—"}`,
    "",
    "O ČOM TO BUDE:",
    s.koncept.trim() || "(koncept nie je vyplnený)",
  ];
  if (s.kto.trim()) riadky.push("", `KTO V TOM VYSTUPUJE: ${s.kto.trim()}`);
  // Hák nie je len veta — v reeli rozhoduje prvá sekunda obrazu. Keď je záber
  // vybraný, Project ho má rozpísať, nie si vymyslieť vlastný.
  const zab = zaberDoZadania(s.zaber || "");
  if (zab) riadky.push("", zab);
  // Keď záber vybraný nie je, ide do zadania katalóg — inak si ho pisateľ
  // vymyslí a vyzerá to ako náhodné obrázky (Jerry, 30. 8. 2026).
  else {
    const kat = zaberyProFazu(s.faza);
    if (kat) riadky.push("", kat);
  }
  // Dĺžka ide do zadania VŽDY. Bez nej Project napíše text na minútu a pol
  // a Jerry ho bude škrtať — pritom publikum PSB pozerá 12,7 sekundy.
  const dl = dlzkaDoZadania(s.faza);
  if (dl) riadky.push("", dl);
  // CTA ide do zadania VŽDY, keď je fáza známa. Bez neho Project končí každý
  // scenár úvodnou diagnostikou, aj keď divák ešte nevie, že má problém.
  const cta = ctaDoZadania(s.faza);
  if (cta) riadky.push("", cta);
  // Tvar obsahu ide do zadania VŽDY. Bez neho vyjde z každého zadania príbeh
  // klienta — najsilnejší tvar, ktorý sa opakovaním vyčerpá najrýchlejšie.
  // Dokument je látka aj cieľ odkazu. Bez neho stojí každý kus na tom, čo si
  // pisateľ pamätá — a to je presne cesta k jednotvárnosti.
  riadky.push("", dokumentyDoZadania());
  riadky.push("", formatyDoZadania());
  // Keď je sekvencia rozpísaná, ide do zadania celá — Project ju má
  // pripomienkovať, nie navrhovať znova od nuly.
  const sek = sekvenciaDoZadania(s.sekvencia || "");
  if (sek) riadky.push("", sek);
  // Keď text už raz vznikol, druhé kolo má byť ÚPRAVA, nie nový pokus od
  // nuly — inak sa zahodí všetko, čo na ňom už bolo dobré.
  if ((s.scenar || "").trim()) {
    riadky.push("", "TERAJŠÍ SCENÁR (uprav ho, nepíš odznova):", (s.scenar || "").trim());
  }
  if ((s.uvodneVety || "").trim()) {
    riadky.push("", "TERAJŠIE ÚVODNÉ VETY (uprav ich, nepíš odznova):", (s.uvodneVety || "").trim());
  }
  if ((s.hotovyText || "").trim()) {
    riadky.push("", "TERAJŠÍ CAPTION AJ S HASHTAGMI (uprav ho, nepíš odznova):", (s.hotovyText || "").trim());
  }
  riadky.push(
    "",
    "ČO CHCEM SPÄŤ — TRI VECI, každú pod svoj nadpis:",
    "1. SCENÁR — čo hovorím na kameru, PO SLOVENSKY. Na kameru hovorím po slovensky, písané texty sú české; nemieš to. Hovorená veta znie inak než písaná: krátke vety, žiadne odkazy na to, čo je vidieť.",
    "2. TRI ALTERNATÍVNE ÚVODNÉ VETY, každú na samostatný riadok, PO SLOVENSKY. " +
    "Sú to varianty PRVEJ vety scenára — to, čo skúsim, keď prvá nesadne pred kamerou. " +
    "Nie parafrázy tej istej vety: každá má chytiť iným koncom (otázka, tvrdenie, číslo).",
    "3. CAPTION AJ S HASHTAGMI ako JEDEN BLOK, PO ČESKY. Nie je to prepis scenára ani jeho preklad; má povedať to, čo v hovorenom slove nezaznelo. Na konci captionu, po prázdnom riadku, pridaj 8 až 12 hashtagov malými písmenami VŠETKY NA JEDNOM RIADKU za sebou oddelené medzerou. Kopírujem to do Metricoolu jedným ťahom, takže hashtagy NEDÁVAJ ako samostatnú sekciu s vlastným nadpisom.",
    ...(zab ? ["K úvodnému záberu napíš, ČO má byť v prvej sekunde vidieť a ako to nadväzuje na prvú vetu."] : []),
    "Meno klienta ani zdravotný detail do textu nedávaj; použi opis typu: klient, ktorý…",
  );
  return riadky.join("\n");
}

/**
 * Odporúčaný pomer obsahu medzi fázami.
 *
 * TOTO NIE SÚ DÁTA. Zvyšné dva koláče v mape merajú skutočnosť; tento je
 * NÁZOR a musí sa dať poraziť. Preto tu stojí, z čoho vznikol — aby sa dal
 * prehodnotiť, keď sa niektorý z predpokladov ukáže ako nepravdivý.
 *
 * NA ČOM STOJÍ
 *
 * 1. Chet Holmes, pyramída kupujúcich: v každom publiku je zlomok ľudí
 *    pripravených kúpiť teraz a drvivá väčšina nie. Obsah mierený len na
 *    rozhodnutých hovorí k pár percentám a zvyšok ignoruje.
 * 2. Vlastné meranie PSB: najsilnejší formát je konkrétny príznak spárovaný
 *    s protiintuitívnym vysvetlením (najviac uložení a zdieľaní). To je presne
 *    fáza 2 a 3 — pomenuj, čo človek cíti, a vysvetli, prečo doterajšie pokusy
 *    nezabrali. Preto majú stred pyramídy najväčšiu váhu.
 * 3. Kapacita ~60–70 klientov. PSB nepotrebuje záplavu dopytov, potrebuje tých
 *    správnych — to drží fázu 5 nízko. Zároveň nesmie byť nulová: bez obsahu
 *    pre rozhodnutých sa z teplého publika nestane dopyt a za 9 mesiacov
 *    prišlo z Instagramu 7 dopytov z 39.
 * 4. Fáza 1 je najdrahšia na dosah — človek, ktorý o probléme nevie, nemá
 *    dôvod na príspevok kliknúť. Preto má najmenší podiel, nie najväčší,
 *    hoci by to pyramída sama o sebe naznačovala.
 *
 * Skutočné rozloženie za 03/2025–08/2026 je takmer rovnomerné (26/21/20/26/23
 * kusov zo 116). Rozdiel oproti tomuto pomeru je návrh na posun, nie chyba.
 * Percentá sem nepíš — koláč ich počíta zaokrúhlením na súčet 100 a natvrdo
 * napísané číslo by sa s ním rozišlo.
 */
export const POMER_IDEAL: Record<number, number> = {
  1: 15, 2: 25, 3: 25, 4: 20, 5: 15,
};

/**
 * Podiely fáz v percentách, zaokrúhlené tak, aby dávali presne 100.
 *
 * Naivné zaokrúhľovanie každej hodnoty zvlášť vyrobí 99 alebo 101 % a koláč,
 * ktorý sa nerovná stovke, spochybní všetko ostatné na obrazovke. Zvyšok sa
 * preto pridá tam, kde bolo orezanie najväčšie (najväčší zvyšok).
 */
export function podielFaz(pocty: Map<number, number>): Record<number, number> {
  const spolu = FAZY.reduce((a, f) => a + (pocty.get(f.id) || 0), 0);
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!spolu) return out;
  const presne = FAZY.map((f) => ({ id: f.id, v: ((pocty.get(f.id) || 0) * 100) / spolu }));
  let dane = 0;
  for (const p of presne) { out[p.id] = Math.floor(p.v); dane += out[p.id]; }
  const podlaZvysku = [...presne].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let i = 0; dane < 100; i++, dane++) out[podlaZvysku[i % podlaZvysku.length].id] += 1;
  return out;
}

/** Spočíta kusy podľa fáz — spoločný vstup pre koláče. */
export function poctyFaz(kusy: { faza: number }[]): Map<number, number> {
  const m = new Map<number, number>(FAZY.map((f) => [f.id, 0]));
  for (const k of kusy) if (m.has(k.faza)) m.set(k.faza, (m.get(k.faza) || 0) + 1);
  return m;
}
