/**
 * VÝPIS PRE KLIENTA — MAIL, KTORÝ SA DÁ ČÍTAŤ.
 *
 * Jerry si z piatich návrhov vybral tmavý zelený (29. 9. 2026): značka na
 * celej ploche, tri čísla o klientovi, časová os balíčka a platba ako jediná
 * svetlá vec v maili — tá má vyskočiť, lebo kvôli nej mail chodí.
 *
 * ČO V ŇOM ZÁMERNE NIE JE
 *
 *  • **Porovnanie s ostatnými.** Jerry ho pôvodne chcel, ale polovica ľudí je
 *    z definície pod priemerom — a práve tej polovici by veta „chodíš menej
 *    než ostatní" dala dôvod skončiť, nie kúpiť si ďalší balíček. V maili
 *    stoja jeho VLASTNÉ čísla.
 *  • **Bolesť.** Ponúkol som ju ako najsilnejší graf a bol to omyl:
 *    `klient_merania` je prázdna a zostane, Jerry meranie bolesti 24. 9. 2026
 *    zrušil. Nepripomínať a neponúkať.
 *  • **„Zostáva 0 h".** Jerry, 29. 9. 2026: „písať tam 0 h zostáva v balíčku
 *    mi príde zbytočné." Hovorí to nadpis.
 *  • **Zaokrúhlené tempo.** „4× mesačne" tiež odmietol; tempo sa píše na
 *    desatinu, v tom istom tvare ako v profile klienta („4,0").
 *  • **Stĺpce mesiacov.** Tri čísla hore povedia to isté kratšie.
 *
 * OBRÁZKY SÚ DVA A OBA IDÚ PRÍLOHOU S `Content-ID`.
 *
 * Logo aj QR. SVG ani dátovú adresu (`data:`) Gmail v obrázkoch nezobrazí;
 * `cid:` prejde všade. Viac obrázkov než tieto dva sem nepatrí — doména má
 * DMARC `p=none` a obrázkový mail je pre spamový filter horší.
 */
import { vokativ } from "./oslovenie";
import type { PolozkaPlatby } from "./platiZa";



/** Farby značky. Tmavá zelená je pozadie, svetlá je platba. */
/**
 * Paleta oboch mailov klientovi — výpisu aj faktúry.
 *
 * Jerry, 29. 9. 2026 pri faktúre: „vyhráva 1, nech sú rovnaké." Rovnaké
 * znamená jeden zdroj farieb: mailFaktury si ich odtiaľto importuje,
 * takže zmena odtieňa tu prefarbí oba maily naraz.
 */
export const FARBY_MAILU = {
  pozadie: "#232b1c",
  karta: "#2c3524",
  linka: "#3a4630",
  text: "#e8ead9",
  slaba: "#94a37e",
  slabsia: "#94a080",
  biela: "#ffffff",
  platba: "#d9e0c8",
  platbaText: "#232b1c",
  platbaSlaba: "#4d5940",
  minus: "#e2a07f",
} as const;
const F = FARBY_MAILU;

export type BodOsi = {
  den: string;
  /** Čas tréningu, keď ho poznáme. */
  cas?: string;
  /** Čo sa stalo — názov balíčka, „tréning", „zaplatené". */
  popis: string;
  druh: "balicekOd" | "trening" | "platba" | "balicekDo" | "dalsi";
  /** Koľká hodina balíčka to bola (stav PRED tréningom). */
  zostatok?: number | null;
  /** Koľkátý tréning bez krytia — kreslí sa ako −1, −2. */
  dlh?: number | null;
  /**
   * Hodina, ktorú tomuto tréningu dá AŽ ĎALŠÍ balíček — 6, 5, 4…
   *
   * Jerry, 3. 10. 2026: „−1 6h, −2 5h, −3 4h — podľa mňa by to malo byť
   * takto napísané." Mínus hovorí, že tréning zatiaľ balíček nemá; toto
   * číslo hovorí, koľkou hodinou sa stane, keď si klient ďalší kúpi. Je to
   * predpoveď, nie stav, preto sa kreslí tlmene a počíta sa z veľkosti
   * posledného balíčka — toho istého, ktorý stránka ponúka cez QR.
   */
  buduca?: number;
  /** Staré obdobie z PTmindera — tréning nad rámec sa nepočíta (pomlčka). */
  vyrovnane?: boolean;
  /** Tréning pokrytý doplnením členstva (zvyšok hodín po konci platnosti). */
  zDoplnenia?: boolean;
  /**
   * Koľko hodín si balíček odpísal za staršie tréningy hneď pri vzniku.
   *
   * Jerry, 2. 10. 2026 druhý raz nad Hanusom: „znovu mi tam je predplatné
   * 6 hodín, chýba tam 5 h, tá bola kedy?" Vysvetlenie som vtedy pridal len
   * na internú obrazovku — na stránku pre klienta a do mailu sa nedostalo,
   * takže skok zo 6 na 4 ďalej vyzeral ako chyba.
   *
   * Jerry sa 3. 10. 2026 spýtal TRETÍ RAZ. Samotný počet na to neodpovedá:
   * pýta sa „tá hodina bola kedy?", a to je dátum. Preto `prevzateDni`.
   */
  prevzate?: number;
  /** Dni tých tréningov (YYYY-MM-DD), v poradí, ako sa stali. */
  prevzateDni?: string[];
};

/**
 * Rozpis spoločnej platby jednou vetou — „za tebe 7 401 Kč, za Annu
 * Kadličkovou 7 401 Kč". Pri jednej položke je prázdny.
 */
function rozpisTextom(v: VypisKlienta): string {
  const p = v.platba?.polozky || [];
  if (p.length < 2) return "";
  return `\n(${p.map((x) => `${x.ja ? "za tebe" : x.klient} ${czk(x.suma)}`).join(", ")})`;
}

export type VypisKlienta = {
  klient: string;
  /** Ďalší balíček je zaplatený vopred a vznikne prvým tréningom (9. 11. 2026). */
  dalsiZaplateny?: boolean;
  /** Oslovenie — krstné meno. */
  oslovenie: string;
  trener: string;
  /** Osobná veta na začiatok; keď je prázdna, mail začne rovno vecou. */
  odkaz?: string;
  /** Os času od začiatku posledného balíčka po dnešok. */
  os: BodOsi[];
  /** Koľko hodín zostáva; `null` = appka to nevie povedať. */
  zostatok: number | null;
  /** Balíček ukončený s vrátením peňazí a odvtedy nič nové (`ClientAgg.ukonceny`). */
  ukonceny?: boolean;
  /** Nula preto, že posledný balíček skončil — nie preto, že sa dochodil (`priebehBalickov`). */
  platnostSkoncila?: boolean;
  /** Odtrénované hodiny spolu a odkedy klient chodí. */
  hodinSpolu: number;
  odkedy: string;
  /** Tréningov mesačne — ten istý výpočet a tvar ako v profile („4,0"). */
  tempo?: number;
  /** Koľko mesiacov u nás chodí. */
  mesiacov?: number;
  /**
   * Platba za ďalší balíček; bez nej sa QR ani suma nekreslia.
   *
   * `sprava` je to, čo má klient napísať do poznámky pre príjemcu — a je to
   * jeho MENO, nie variabilný symbol. Kokpit páruje bankové príjmy podľa
   * mena v texte platby.
   */
  platba?: {
    popis: string; suma: number; ucet: string; sprava: string;
    /**
     * Rozpis — za koho koľko. Pri bežnej platbe je položka jedna; keď klient
     * platí aj za niekoho druhého (`client_overrides.plati_za`), je ich viac
     * a suma je ich súčet. Viď `lib/psb/platiZa.ts`.
     */
    polozky?: PolozkaPlatby[];
    /** Koľko hodín sa z nového balíčka hneď odpíše (tréningy nad rámec). */
    odpocet?: number;
    /**
     * Platí sa OTVORENÁ FAKTÚRA (29. 10. 2026): variabilný symbol = jej číslo
     * a QR je to isté, aké je na doklade. Kokpit podľa čísla platbu spáruje
     * a pri faktúre za viacerých ju aj rozdelí.
     */
    vs?: string;
    /** Splatnosť faktúry (ISO deň), keď sa platí faktúra. */
    splatnost?: string;
    /**
     * `true` = je to ponuka ĎALŠIEHO balíčka, nie dlh za starý.
     *
     * Samostatný príznak, nie odvodenie z `odpocet > 0`: klient, ktorý
     * dochodil presne na nulu, má odpočet nula a stále je to nový balíček.
     */
    novy?: boolean;
  };
  /**
   * Za koho platí niekto iný — jeho meno. Vtedy sa platobný blok ani QR
   * nekreslia (zaplatiť dvakrát sa nedá vrátiť), len sa to povie.
   */
  platiZaNeho?: string;
  /**
   * Platba BITCOINOM namiesto prevodu na účet.
   *
   * Jerry, 5. 10. 2026: časť klientov platí v BTC a chce im namiesto QR na
   * bankový účet ukázať lightningovú faktúru. `bolt11` je faktúra so sumou,
   * vyrobená pri otvorení stránky cez LNURL-pay; keď ju nemáme, zostane
   * statická adresa a sumu si klient zadá sám.
   */
  lightning?: {
    /** Suma v satoshi, už po zľave. */
    sats: string;
    /** Tá istá suma v korunách a pôvodná cena pred zľavou. */
    czk: number;
    plnaCena: number;
    zlava: number;
    /** Kurz, ktorým sa to prepočítalo, a kedy platil — číslo má byť overiteľné. */
    kurz: string;
    kurzKedy: string;
    adresa: string;
    bolt11?: string;
  };

  /**
   * Celá história na vyžiadanie klienta.
   *
   * Jerry, 29. 9. 2026: „možnosť pre klienta na vyžiadanie — celá história
   * hodín aj platieb do mailu." Je to ten istý mail, len sa inak volá
   * („Celá história", nie „Balíček dochodený" — klient si pýtal prehľad,
   * nie upomienku), v dlaždiciach je namiesto tempa zaplatená suma a os
   * nesie všetko od prvého tréningu vrátane platieb.
   */
  uplna?: boolean;
  /**
   * Koľko posledných balíčkov os ukazuje (1 = len ten posledný).
   *
   * Nie je to počet na spočítanie, je to NÁZOV toho, čo klient vidí: podľa
   * neho sa píše „Poslední balíček" alebo „Poslední dva balíčky". Rozsah
   * vyberá Jerry v okne pred odoslaním SMS — klientovi, ktorému sa mínus
   * prenáša, jeden balíček nestačí (Hanus, 3. 10. 2026).
   */
  balickov?: number;
  /** Zaplatené spolu (Kč) — dlaždica pri úplnej histórii. */
  zaplateneSpolu?: number;

  /**
   * Dnešný dátum (YYYY-MM-DD).
   *
   * Mail pôvodne písal „dnes si mal poslednú hodinu" vždy, keď bol zostatok
   * nula — aj Vítězslavovi, ktorý dochodil 15. 9. a píše sa mu 29. Veta
   * o dnešku v maili, ktorý príde o dva týždne, je nepravda o tom, čo sa
   * stalo. Bez tohto poľa sa na dnešok nikde neodvoláva.
   */
  dnes?: string;
  /**
   * Najbližší dohodnutý termín z kalendára (ISO `2026-10-06T10:30`).
   *
   * Jerry, 29. 9. 2026: „môže tam byť aj poznámka typu a najbližšie ste
   * dohodnutý na tento termín." Mail hovorí o tom, čo sa minulo, a končí
   * výzvou zaplatiť — bez tejto vety je to účet. S ňou je to prehľad:
   * tu si bol, toto zostalo, tu sa vidíme. Keď termín dohodnutý nie je,
   * nepíše sa nič a je to samo osebe informácia.
   */
  dalsi?: string;
  /** `cid` obrázkov — vkladá ich odosielateľ. */
  qrCid?: string;
  logoCid?: string;
  /** Namiesto cid: — pre verejnú stránku /v/<token>, kde prílohy nie sú. */
  qrUrl?: string;
  logoUrl?: string;
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const denSK = (iso: string) => {
  const d = (iso || "").slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}. ${Number(d[1])}. ${d[0]}` : iso;
};
const denKratko = (iso: string) => {
  const d = (iso || "").slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}. ${Number(d[1])}.` : iso;
};
/**
 * „2 h padly na tréninky 24. 7. a 26. 7." — s DÁTUMAMI, nie len s počtom.
 *
 * Jerry sa na tú chýbajúcu hodinu pýtal trikrát (2. a 3. 10. 2026) a zakaždým
 * tou istou vetou: „tá bola kedy?" Počet hovorí, koľko ich padlo; dátum
 * hovorí, ktoré to boli.
 *
 * ZO STRÁNKY KLIENTA A Z MAILU JE VETA PREČ (3. 10. 2026). Odkedy tréning
 * nesie obe čísla — mínus aj hodinu, ktorú z balíčka dostal — hovorila to
 * isté druhýkrát. Jerry: „týmto zápiskom je tá veta zbytočná." Zostáva na
 * stole klienta, kde je os pracovná a dátumy šetria klikanie.
 *
 * Nad tri dátumy sa vypíšu prvé dva a zvyšok sa zhrnie.
 */
export function vetaPrevzatych(b: { prevzate?: number; prevzateDni?: string[] }, hodina = "h"): string {
  const n = b.prevzate || 0;
  if (!n) return "";
  const dni = (b.prevzateDni || []).map(denKratko);
  if (!dni.length) return `${n} ${hodina} padly na starší tréninky`;
  const zoznam = dni.length <= 3
    ? dni.length === 1 ? dni[0] : `${dni.slice(0, -1).join(", ")} a ${dni[dni.length - 1]}`
    : `${dni.slice(0, 2).join(", ")} a ${dni.length - 2 < 5 ? "další" : "dalších"} ${dni.length - 2}`;
  return `${n} ${hodina} ${n === 1 ? "padla" : "padly"} na tréninky ${zoznam}`;
}

export const czk = (n: number) => `${Math.round(n).toLocaleString("sk-SK").replace(/ /g, " ")} Kč`;

/**
 * Tempo na desatinu — ten istý tvar, aký stojí v profile klienta.
 *
 * Jerry, 29. 9. 2026: „4× mesačne mi príde zbytočné, páči sa mi, ako je to
 * vyjadrené v profile — 3,9 mesačne." Zaokrúhlenie na celé robí z čísla
 * dojem odhadu; desatina hovorí, že sa to naozaj počítalo.
 */
export const tempoSK = (zaMesiac: number): string => zaMesiac.toFixed(1).replace(".", ",");

const mesiacovCZ = (n: number) => `${n} ${n === 1 ? "měsíc" : n < 5 ? "měsíce" : "měsíců"}`;

/**
 * Posledná slovenčina na povrchu. Popisy riadkov nesú názvy produktov
 * z PTmindera a tie sú miešané — „Doplnenie členstva" prechádza
 * `nazovProduktu` zámerne nezmenené (je to interný presun zostatku, nie
 * predaj). Na českej stránke aj v maili to klient čítal po slovensky, takže tu
 * stojí slovníček pre POVRCH: v dátach ani v appke sa nič neprepisuje.
 *
 * Bez `\b` zámerne: v JS regexe nie je medzi „é" a medzerou hranica slova
 * (é nie je `\w`), takže `/\bzaplatené\b/` nenašlo nič.
 */
export const cesky = (t: string) =>
  t
    .replace(/doplnenie\s+členstva/gi, "Doplnění hodin")
    .replace(/prenesené z minulého balíčka/gi, "Přeneseno z minulého balíčku")
    .replace(/prenesené\s+hodiny/gi, "Přenesené hodiny")
    .replace(/zaplatené/g, "zaplaceno")
    .replace(/vrátené/g, "vráceno")
    .replace(/koniec\s+platnosti/gi, "konec platnosti")
    .replace(/tréning/g, "trénink")
    .replace(/hodín/g, "hodin");

/**
 * „zbývá 1 h", „zbývají 2 h", „zbývá 5 h".
 *
 * Sloveso sa v češtine pri dvoch až štyroch mení a mail, ktorý číta
 * zákazník, si to nemôže dovoliť zle.
 */
export const zostavaHodin = (n: number): string => `${n >= 2 && n <= 4 ? "zbývají" : "zbývá"} ${n} h`;

/**
 * Predmet žiadosti o históriu — podľa NEHO Kokpit žiadosť spozná pri čítaní
 * schránky (`jeZiadostOHistoriu` v mailDopyt.ts). Meniť ich treba spolu — a tá
 * musí poznať aj staré slovenské znenie z mailov, ktoré už u klientov sú.
 */
export const PREDMET_HISTORIE = "Celá historie tréninků a plateb";
export const ADRESA_HISTORIE = "info@prosapiens.cz";

const mailtoHistoria = (klient: string): string => {
  const subject = encodeURIComponent(`${PREDMET_HISTORIE} — ${klient}`);
  const body = encodeURIComponent("Ahoj, prosím o celou historii mých tréninků a plateb.");
  return `mailto:${ADRESA_HISTORIE}?subject=${subject}&amp;body=${body}`;
};

/** Predmet, textová aj HTML podoba tej istej správy. */
export function mailKlientovi(v: VypisKlienta): { predmet: string; text: string; html: string } {
  const treningy = v.os.filter((b) => b.druh === "trening");
  const posledny = treningy[treningy.length - 1]?.den || "";
  const doslo = v.zostatok !== null && v.zostatok <= 0;
  // „Dochodený" by bola nepravda, keď hodiny prepadli alebo balíček len skončil.
  const skoncil = doslo && !!v.platnostSkoncila;

  const predmet = v.uplna
    ? "Tvoje tréninky a platby — ProSapiens"
    : skoncil ? "Balíček skončil — výpis" : doslo ? "Balíček dochozený — výpis a platba" : "Tvoje docházka v ProSapiens";
  const nadpis = v.uplna ? "Celá historie" : skoncil ? "Balíček skončil" : doslo ? "Balíček dochozený" : "Tvoje docházka";
  const dnesnaHodina = !!v.dnes && !!posledny && posledny.slice(0, 10) === v.dnes;
  /**
   * Hodiny NAD RÁMEC balíčka. Tie sa nesmú schovať za „dochodený": klient
   * ich odtrénoval a sú v ďalšej platbe. Povedať to rovno je slušnejšie
   * než nechať ho zistiť to z čísla na faktúre.
   */
  const navyse = v.zostatok !== null && v.zostatok < 0 ? -v.zostatok : 0;
  // Pri úplnej histórii sa nehovorí o dochodenom balíčku — klient si pýtal
  // prehľad; stav balíčka aj tak vidí na konci osi.
  const uvod = v.uplna
    ? "posílám celou historii tréninků i plateb."
    : navyse
    ? `${dnesnaHodina ? "i s dneškem máš" : "máš"} ${navyse === 1 ? "hodinu" : navyse < 5 ? `${navyse} hodiny` : `${navyse} hodin`} nad rámec balíčka — ${navyse === 1 ? "je" : "jsou"} v další platbě.`
    : skoncil
      ? "tvůj poslední balíček už skončil."
    : doslo
      ? dnesnaHodina
        ? "dnes proběhla poslední hodina z balíčka."
        : posledny
          ? `balíček máš dochozený — poslední hodina byla ${denSK(posledny)}.`
          : "balíček máš dochozený."
      : v.zostatok !== null ? `v balíčku ti ${zostavaHodin(v.zostatok)}.` : "posílám ti přehled tréninků.";

  /**
   * OS KONČÍ TÝM, ČO KLIENTA ZAUJÍMA — koľko mu zostáva.
   *
   * Obrazovka posiela len to, čo sa naozaj stalo (balíček, tréningy, platby);
   * poslednú bodku dopĺňa mail, lebo je to odpoveď, nie udalosť — a nemá
   * dátum, aby nevyzerala ako ďalší tréning. Keď appka zostatok nevie
   * (`null`), bodka tam nie je; vymyslené číslo ide von k zákazníkovi.
   */
  const os = [
    ...(v.zostatok === null || v.os[v.os.length - 1]?.druh === "balicekDo"
      ? v.os
      : [...v.os, {
        den: "",
        popis: skoncil ? "Balíček skončil" : v.zostatok <= 0 ? "Balíček dochozený" : zostavaHodin(v.zostatok).replace(/^./, (z) => z.toUpperCase()),
        druh: "balicekDo" as const,
      }]),
    // Najbližší termín je posledný bod osi, lebo ňou naozaj je — os ide
    // ďalej, nekončí účtom.
    ...(v.dalsi ? [{
      den: v.dalsi.slice(0, 10),
      cas: v.dalsi.length > 10 ? v.dalsi.slice(11, 16) : undefined,
      popis: "Nejbližší trénink",
      druh: "dalsi" as const,
    }] : []),
  ];

  /** Tri čísla, ktoré o klientovi niečo hovoria. „0 h zostáva" medzi ne nepatrí. */
  const staty: [string, string][] = [
    [`${v.hodinSpolu} h`, "odtrénováno celkem"],
    // Úplná história je odpoveď aj na „koľko som u vás nechal" — tempo by tu
    // bolo vata, zaplatená suma je to, čo si klient pýtal.
    ...(v.uplna && v.zaplateneSpolu
      ? [[czk(v.zaplateneSpolu), "zaplaceno celkem"] as [string, string]]
      : v.tempo ? [[tempoSK(v.tempo), "tréninků měsíčně"] as [string, string]] : []),
    ...(v.mesiacov ? [[mesiacovCZ(v.mesiacov), v.odkedy ? `chodíš od ${denSK(v.odkedy)}` : "chodíš u nás"] as [string, string]] : []),
  ];

  // ── textová podoba: to isté, len bez ozdôb ────────────────────────────
  /**
   * `null` = časť, ktorá tam teraz nie je (odkaz, platba); prázdny reťazec je
   * naschvál prázdny riadok. Pôvodne sa filtrovalo na `!== ""` a vypadli aj
   * tie — textová podoba bola jeden zlepenec bez medzier.
   */
  const text = [
    `Ahoj${vokativ(v.oslovenie) ? ` ${vokativ(v.oslovenie)}` : ""},`,
    "",
    v.odkaz || null,
    uvod,
    "",
    v.uplna ? "Tréninky a platby:" : "Jak se čerpal balíček:",
    ...os.map((b) => {
      const cislo = b.druh !== "trening" ? "" : [
        b.zostatok != null ? `${b.zostatok} h${b.zDoplnenia ? " · doplnění" : ""}` : "",
        b.dlh ? `−${b.dlh}` : "",
      ].filter(Boolean).join(", ");
      const kedy = b.den ? `${denSK(b.den)}${b.cas ? ` · ${b.cas}` : ""} — ` : "";
      return `  ${kedy}${cesky(b.popis)}${cislo ? ` (${cislo})` : ""}`;
    }),
    "",
    ...staty.map(([cislo, popis]) => `${popis}: ${cislo}`),
    v.platba
      ? `\n${cesky(v.platba.popis)}: ${czk(v.platba.suma)}${rozpisTextom(v)}\nÚčet ${v.platba.ucet}, ${v.platba.vs ? `variabilní symbol ${v.platba.vs}` : `do poznámky uveď: ${v.platba.sprava}`}`
      : null,
    v.uplna ? null : `\nChceš celou historii tréninků a plateb? Napiš na ${ADRESA_HISTORIE}.`,
    "",
    v.trener,
    "ProSapiens Biomechanic",
  ].filter((x) => x !== null).join("\n");

  /**
   * ČASOVÁ OS S ČIAROU.
   *
   * Jerry, 29. 9. 2026: „pridaj mi tam tú časovú os." Bodky bez čiary sú
   * zoznam s odrážkami; čiara z nich robí os, na ktorej je vidieť, že medzi
   * dvoma tréningami niečo bolo — napríklad platba.
   *
   * Čiara je `border-left` na ľavej bunke, bodka na nej sedí cez záporný
   * okraj. Outlook záporné okraje ani zaoblenie nepozná, takže tam z bodky
   * bude malý štvorček vedľa čiary — čitateľné to zostane.
   */
  const riadkyOsi = os.map((b, i) => {
    const posledna = i === os.length - 1;
    const velka = b.druh !== "trening";
    const cislo = b.druh !== "trening" ? "" : [
      b.zostatok != null ? `<b>${b.zostatok} h</b>${b.zDoplnenia ? ` <span style="color:${F.slaba}">doplnění</span>` : ""}` : "",
      b.dlh ? `<span style="color:${F.minus};font-weight:700">−${b.dlh}</span>` : "",
    ].filter(Boolean).join(" ");
    /**
     * Posledná bodka čiaru KONČÍ. Keby aj pod ňou pokračovala, os by vyzerala
     * useknutá uprostred — akoby ďalšie body boli a len sa nezmestili.
     * Preto tam namiesto rámika ide kúsok čiary nad bodkou.
     */
    const bodka = `<div style="width:${velka ? 11 : 8}px;height:${velka ? 11 : 8}px;background:${velka ? F.text : F.slaba};border-radius:50%`;
    const lavy = posledna
      ? `<td width="20" valign="top" style="padding:0">
        <div style="width:2px;height:${velka ? 5 : 7}px;background:${F.linka};font-size:0;line-height:0">&nbsp;</div>
        ${bodka};margin:0 0 0 ${velka ? -4 : -3}px"></div>
      </td>`
      : `<td width="20" valign="top" style="border-left:2px solid ${F.linka};padding:0">
        ${bodka};margin:${velka ? 5 : 7}px 0 0 ${velka ? -6 : -5}px"></div>
      </td>`;
    return `<tr>
      ${lavy}
      <td style="padding:0 0 ${posledna ? 0 : 13}px 6px">
        <div style="font-size:14px;color:${velka ? F.biela : F.text};line-height:1.35">${esc(cesky(b.popis))}</div>
        ${b.den ? `<div style="font-size:12px;color:${F.slabsia};line-height:1.35">${denKratko(b.den)}${b.cas ? ` · ${esc(b.cas)}` : ""}</div>` : ""}
      </td>
      <td width="56" valign="top" style="padding:0 0 ${posledna ? 0 : 13}px 8px;text-align:right;font-size:14px;color:${F.text};white-space:nowrap">${cislo}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${F.pozadie}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.pozadie}">
<tr><td align="center" style="padding:30px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

  <tr><td align="center" style="padding-bottom:24px">
    ${v.logoCid || v.logoUrl
    ? `<img src="${v.logoCid ? `cid:${esc(v.logoCid)}` : esc(v.logoUrl || "")}" width="200" alt="ProSapiens Biomechanic" style="display:block;border:0">`
    : `<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${F.slaba}">ProSapiens Biomechanic</div>`}
  </td></tr>

  <tr><td style="text-align:center;font-size:32px;font-weight:700;color:${F.biela};line-height:1.15;padding-bottom:8px">${esc(nadpis)}</td></tr>
  <tr><td style="text-align:center;font-size:15px;color:${F.slaba};line-height:1.6;padding-bottom:24px">
    ${esc(vokativ(v.oslovenie) || "Ahoj")}, ${esc(v.odkaz || uvod)}
  </td></tr>

  ${staty.length ? `<tr><td style="padding-bottom:20px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${staty.map(([cislo, popis], i) => `${i ? '<td width="10"></td>' : ""}<td width="33%" style="padding:16px 8px;background:${F.karta};border-radius:12px;text-align:center">
        <div style="font-size:23px;font-weight:700;color:${F.biela};line-height:1.1">${esc(cislo)}</div>
        <div style="font-size:11px;color:${F.slaba};margin-top:5px;line-height:1.4">${esc(popis)}</div>
      </td>`).join("")}
    </tr></table>
  </td></tr>` : ""}

  <tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.karta};border-radius:14px">
      <tr><td style="padding:20px 22px">
        <div style="font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:${F.slaba};padding-bottom:14px">${v.uplna ? "Tréninky a platby" : "Jak se čerpal balíček"}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${riadkyOsi}</table>
      </td></tr>
    </table>
  </td></tr>

  ${v.platba ? `<tr><td style="padding:22px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.platba};border-radius:14px">
      <tr>
        <td style="padding:20px 22px;font-size:14px;color:${F.platbaText};line-height:1.7">
          ${esc(cesky(v.platba.popis))}<br><b style="font-size:24px">${czk(v.platba.suma)}</b><br>
          ${esc(rozpisTextom(v).trim())}${rozpisTextom(v) ? "<br>" : ""}
          <span style="color:${F.platbaSlaba}">${esc(v.platba.ucet)}<br>${v.platba.vs ? `variabilní symbol: ${esc(v.platba.vs)}` : `do poznámky: ${esc(v.platba.sprava)}`}</span>
        </td>
        ${v.qrCid || v.qrUrl ? `<td width="128" style="padding:20px 22px 20px 0;text-align:right">
          <img src="${v.qrCid ? `cid:${esc(v.qrCid)}` : esc(v.qrUrl || "")}" width="110" height="110" alt="QR platba" style="display:block;background:#fff;padding:5px;border-radius:8px;margin-left:auto;border:0">
        </td>` : ""}
      </tr>
    </table>
  </td></tr>` : ""}

  ${v.uplna ? "" : `<tr><td align="center" style="padding:26px 0 2px">
    <!--
      Tlačidlo pre KLIENTA (Jerry, 29. 9. 2026: „aby na neho mohol klient
      kliknúť"). Je to mailto, nie odkaz na server: klik otvorí klientovi
      rozpísaný mail na info@ s predmetom, podľa ktorého žiadosť spozná
      Kokpit pri čítaní schránky. Verejná adresa s históriou klienta by
      musela byť podpísaná a aj tak by ju otvárali antivírusy — mailto
      nič neposiela, kým klient sám nestlačí Odoslať.
    -->
    <a href="${mailtoHistoria(v.klient)}" style="display:inline-block;background:${F.karta};border:1px solid ${F.linka};border-radius:10px;padding:11px 20px;font-size:13px;font-weight:600;color:${F.text};text-decoration:none">Chci celou historii tréninků a plateb</a>
  </td></tr>
  <tr><td align="center" style="font-size:11px;color:${F.slabsia};padding-bottom:2px">jedním klikem si ji vyžádáš mailem — pošleme ti ji ve stejném přehledu</td></tr>`}

  <tr><td style="padding:24px 4px 0;font-size:15px;color:${F.biela}">${esc(v.trener)}</td></tr>
  <tr><td style="padding:16px 4px 0;font-size:11.5px;color:${F.slabsia}">
    ProSapiens Biomechanic${posledny ? ` · poslední trénink ${denSK(posledny)}` : ""}
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { predmet, text, html };
}
