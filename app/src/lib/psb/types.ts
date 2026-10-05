// Shared PSB Tracker data types (used both server- and client-side; keep pure).

export type SessionRow = {
  date: string; // ISO
  time: string;
  client: string;
  sessionTrainer: string;
  sessionName: string;
  sessionType: "OFFLINE" | "ONLINE" | "TRUECOACH" | "UVODNE";
  duration: number; // 60 | 90
  price: number;
};

export type ServiceRow = {
  date: string;
  client: string;
  serviceType: string;
  description: string;
  price: number;
  is6m: boolean;
  trainer: string;
};

export type PaymentRow = {
  date: string;
  client: string;
  amount: number;
  method: string; // bank | cash | other
  /** Surový popis riadku z PTmindera — môže obsahovať kód zľavy. */
  note?: string;
};

export type PackageRow = {
  client: string;
  status: string; // Active Client | Inactive Client
  package: string;
  remaining: number;
  total: number;
  /** Kedy bol balíček pridaný (ISO deň). */
  added?: string;
  /** Obdobie platnosti — pri členstvách je v exporte ako rozsah. */
  validFrom?: string;
  validTo?: string;
  /** Koľko klient za TENTO balíček zaplatil — nesie v sebe jeho zľavy. */
  payment?: number;
  kind?: string; // package | membership
  /** Stav riadku v exporte (stĺpec Status): `active` | `expired`. */
  stav?: string;
  /**
   * Hodín na obdobie členstva podľa PTmindera („8 per month") — vrátane
   * prenesených. 0 = export to nepovedal (balíčky, staré exporty).
   */
  naObdobie?: number;
};

export type Lead = {
  id: string;
  date: string;
  name: string;
  source: "referencia" | "reklama" | "mail" | "web" | "google" | "instagram" | "instagram_osobny" | "telefon" | "ine";
  referrer: string;   // existing client who sent them (source = referencia)
  status: "novy" | "neodpisal" | "dohodnuty" | "zruseny";
  note: string;
  email: string;
  telefon: string;
  /** utm_campaign z odkazu v reklame — prázdne pri organickom príchode. */
  kampan: string;
  /** Celé utm_* v čitateľnej podobe, na dohľadanie keď kampaň nesedí. */
  utm: string;
  /** Adresa, na ktorej človek formulár odoslal. */
  stranka: string;
  /**
   * Kedy sme sa OZVALI, nie kedy dopyt prišiel.
   *
   * V službách je rýchlosť odpovede najsilnejšia páka na konverziu — silnejšia
   * než cena aj než text reklamy. Doteraz sa nemerala vôbec: všetkých 37
   * dopytov od januára 2026 malo stav „nový" a dvanásť z nich netrénovalo bez
   * toho, aby ktokoľvek vedel prečo.
   */
  odpovedaneAt: string;
  /** Prečo sa z dopytu nestal klient. Bez toho sa reklama nedá vyhodnotiť. */
  dovod: string;
  /**
   * Kedy dopyt naozaj pribudol, aj s hodinou.
   *
   * `date` je len deň, takže bez tohto by sa čas odpovede meral od POLNOCI:
   * dopyt o 18:00 a odpoveď o 20:00 by vyšla ako dvadsať hodín. Pri dopytoch
   * z webu je to presný čas odoslania formulára.
   */
  createdAt: string;
  /**
   * Čo to je: `dopyt` = pýta sa na úvodný tréning, `magnet` = stiahol lead
   * magnet. Do počtu dopytov, ceny za dopyt a lievika ide LEN `dopyt`
   * (Jerry, 24. 9. 2026). Magnet je e-mail do zoznamu, nie otázka na tréning.
   */
  druh: "dopyt" | "magnet";
};

export type ClientOverride = {
  /** Kedy sa override naposledy zapísal — ručný stav je snímka, nie pravidlo. */
  updatedAt?: string;
  status?: string | null;
  specialRate?: boolean;
  specialRateNote?: string;
  trainerNote?: string;
  contractSigned?: boolean;
  primaryTrainer?: string | null;
  bitcoin?: boolean;
  /**
   * Zľava pre platbu bitcoinom v percentách; `null` = žiadna.
   *
   * Jerry, 5. 10. 2026: pred 2025 mali všetci 10 %, od 2025 je prvá platba
   * 20 % a každá ďalšia 5 %. Výnimky existujú (Knapčok 30 % — 10 % za bitcoin
   * a 20 % kamarátska), preto je to číslo pri klientovi, nie pravidlo z kódu.
   */
  btcZlava?: number | null;
  /** Odpoveď na otázku „je duch?" — "" = nepýtané, "ano", "nie". */
  duch?: string;
  /** Odkiaľ sa o nás dozvedel — pevný zoznam, viď ZDROJE. */
  zdroj?: string;
  /** Pri referencii: kto konkrétne ho poslal. */
  zdrojKto?: string;
  /** Dátum narodenia (YYYY-MM-DD). PTminder ho neexportuje, dopĺňa sa ručne. */
  narodeniny?: string;
  /**
   * Dátum PRVÉHO kontaktu, keď je skorší než prvé sedenie v dátach.
   *
   * Klient, čo sa vrátil po rokoch, nie je nový klient — a od septembra sa
   * podľa počtu nových klientov meria, čo priniesla reklama.
   */
  prvyKontakt?: string;
  /** Ručná oprava príslušnosti k 6M: "" = appka rozhoduje, "ano" / "nie". */
  v6m?: string;
  /**
   * Prečo človek po úvodnom tréningu už neprišiel.
   *
   * Osem ľudí za rok 2026 zaplatilo za úvodný a nevrátilo sa. Kým sa dôvod
   * nezapíše v ten deň, keď je ešte v hlave, o mesiac ho nikto nezopakuje —
   * a osem jednotlivých príbehov sa nikdy nespojí do vzorca.
   *
   * Zapísaný dôvod zároveň znamená „vybavené": položka z registra zmizne.
   * Preto sa nezapisuje do `trainerNote`, ktorá je o klientovi ako takom.
   */
  precoNeprisiel?: string;
  /**
   * Zostatok balíčka odpísaný z PTmindera a deň, ku ktorému platil.
   * Appka od neho ďalej odpočítava odtrénované hodiny — pozri
   * `deriveClients`. Bez dátumu je číslo bezcenné, preto chodia v páre.
   */
  balicekZostatok?: number | null;
  balicekKDatumu?: string;
};

export type UploadLogEntry = {
  date: string;
  filename: string;
  type: string;
  added: number;
  skipped: number;
};

export type AnomalyAck = {
  note?: string;
  ackedAt?: string;
  /** Kto odpovedal. Prázdne pri odpovediach spred 24. 8. 2026 — vtedy sa autor nezapisoval. */
  actor?: string;
};

export type PSBData = {
  sessions: SessionRow[];
  services: ServiceRow[];
  payments: PaymentRow[];
  packages: PackageRow[];
  /**
   * História balíčkov a členstiev z PTmindera (stav Finished aj Active,
   * tabuľka `ptminder_historia`). Os času z nej berie SKUTOČNÉ hodiny
   * a koniec platnosti minulých období — kniha predajov nesie len názov.
   */
  historiaBalickov?: PackageRow[];
  /**
   * Balíčky z Kokpitu, ktoré platby nepokryli (`nezaplateneZKokpitu`).
   * Hodiny nedávajú, kým sa nezaplatí — karta aj os ich berú ako
   * nezaplatené, rovnako ako otvorený poplatok z PTmindera.
   */
  nezaplateneKokpit?: { klient: string; den: string; cena: number; nazov: string; doplatit?: number }[];
  /**
   * Dlh za balíčky z Kokpitu podľa klienta (kľúč `normName`) — súčet
   * `nezaplateneKokpit`. Jediný zdroj pre kartu dlžníkov, profil aj QR.
   */
  dlhKokpit?: Record<string, { dlzi: number; pocet: number }>;
  clientOverrides: Record<string, ClientOverride>;
  anomalyAck: Record<string, AnomalyAck>;
  uploadLog: UploadLogEntry[];
  leads: Lead[];
  /**
   * Stiahnutia lead magnetu. Sú to e-maily do zoznamu, nie otázky na tréning,
   * takže do `leads` nepatria a do počtu dopytov sa nerátajú — ale stratiť sa
   * nesmú, mailing z nich žije.
   */
  magnety: LeadMagnet[];
  /** Závery z debát s Jarvisom — do registra sa dostanú tie po termíne overenia. */
  zavery: ZaverRow[];
  /** Nezaplatené poplatky z PTminderu — čo je v exporte, je otvorené. */
  poplatky: PoplatokZaznam[];
  /** Tréningy zadarmo — hodina sa odtrénovala, z členstva sa nestrhla. */
  treningyZdarma: TreningZdarma[];
  /** Pocitovka — čo si klient sám klepol na stupnici 1–10 (viď pocitovka.ts). */
  merania: MeranieRow[];
  /**
   * Tréningy z PTmindera od KOKPIT_OD (1. 10. 2026) — len na kontrolu.
   * Pre výpočty platí `sessions`, ktoré sú od toho dňa z kalendára.
   */
  sessionsPtminder?: SessionRow[];
  /**
   * Balíčky zapísané v Kokpite (vrátane naliatych z PTmindera). Od 1. 10.
   * 2026 sa z nich počíta zostatok na karte klienta (`zostatokKokpitu`).
   */
  balickyKokpit?: import("./zostatokKokpitu").BalicekPreZostatok[];
  /** Koľko hodín pridalo „Doplnenie členstva" — kľúč `klient|deň`. */
  doplneniaHodiny?: Record<string, number>;
  /**
   * Dohodnuté úvodné tréningy, ktoré sa ešte neodohrali.
   *
   * Jerry, 1. 10. 2026: „najdôležitejšie je, aby keď je úvodný tréning,
   * vznikol jeho profil rovno." Klient v Kokpite dovtedy vznikal zo SEDENÍ,
   * a sedenie z budúcej udalosti nevzniká — Josef Pávek mal úvodný
   * nasledujúce ráno a v appke neexistoval vôbec.
   */
  objednaneUvodne?: { klient: string; den: string; trener: string }[];
  /** Vedomosti zvonku (rešerše, príručky). Text sa do kontextu neposiela — len prehľad. */
  vedomosti: VedomostRow[];
};

/**
 * Vedomosť zvonku — rešerš alebo príručka, ktorú Jarvis pozná.
 *
 * Má dobu spotreby: benchmarky zastarajú, Meta premenúva úrovne prístupu,
 * odporúčané rozpočty sa hýbu. Keď `overene_at` zostarne o viac než
 * `obnovovatPoDnoch`, ozve sa register — inak by sa z rešerše ticho stala
 * povera (Jerry, 19. 8. 2026).
 */
export type VedomostRow = {
  id: string;
  nazov: string;
  oCom: string;
  zdroj: string;
  obnovovatPoDnoch: number;
  overeneAt: string;
  /** Znakov v texte. Samotný text sa načítava až na vyžiadanie. */
  znakov: number;
};

/** Rozhodnutie z debaty, ktoré má dátum, kedy sa má overiť, či zabralo. */
export type ZaverRow = {
  id: string;
  datum: string;
  tema: string;
  zaver: string;
  overit?: string;
  overitDo?: string;
  stav: string;
};

export type LeadMagnet = {
  id: string; date: string; name: string; email: string;
  stranka: string; kampan: string; source: string;
};

export type PoplatokZaznam = { id: string; datum: string; klient: string; popis: string; suma: number };

/**
 * Tréning, ktorý sa z členstva neodpočíta.
 *
 * Kľúč je klient + deň, nie id sedenia: ten istý tréning príde raz z kalendára
 * a raz z exportu a značka musí platiť pre oba.
 */
export type TreningZdarma = { id: string; klient: string; den: string; dovod: string; kto: string };

/**
 * Jeden deň hodnotenia. `zdroj` rozlišuje, KTO to povedal — klient na svojej
 * stránke, alebo tréner. Bez toho sa po roku nedá povedať, čie je to číslo,
 * a sú to dve rôzne veci.
 */
export type MeranieRow = {
  klient: string; datum: string;
  /** Oblasti z jeho vlastnej anamnézy a sila 0–10 (nižšie je lepšie). */
  oblasti: { oblast: string; sila: number | null }[];
  /** 1 vôbec · 2 trochu · 3 veľmi — nie stupnica, tri možnosti. */
  posun: number | null;
  poznamka: string;
  zdroj: string;
};

export const EMPTY_DATA: PSBData = {
  zavery: [],
  poplatky: [],
  treningyZdarma: [],
  merania: [],
  doplneniaHodiny: {},
  vedomosti: [],
  sessions: [],
  services: [],
  payments: [],
  packages: [],
  clientOverrides: {},
  anomalyAck: {},
  uploadLog: [],
  leads: [],
  objednaneUvodne: [],
  magnety: [],
};

export type CSVType = "sessions" | "services" | "payments" | "packages" | "transakcie" | "cennik" | "idoklad" | "klienti" | "metricool" | "ga4" | "gsc" | "anamneza" | "kanaly";
