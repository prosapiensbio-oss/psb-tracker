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
};

export type ClientOverride = {
  status?: string | null;
  specialRate?: boolean;
  specialRateNote?: string;
  trainerNote?: string;
  contractSigned?: boolean;
  primaryTrainer?: string | null;
  bitcoin?: boolean;
  /** Odpoveď na otázku „je duch?" — "" = nepýtané, "ano", "nie". */
  duch?: string;
  /** Odkiaľ sa o nás dozvedel — pevný zoznam, viď ZDROJE. */
  zdroj?: string;
  /** Pri referencii: kto konkrétne ho poslal. */
  zdrojKto?: string;
  /** Dátum narodenia (YYYY-MM-DD). PTminder ho neexportuje, dopĺňa sa ručne. */
  narodeniny?: string;
  /** Ručná oprava príslušnosti k 6M: "" = appka rozhoduje, "ano" / "nie". */
  v6m?: string;
};

export type UploadLogEntry = {
  date: string;
  filename: string;
  type: string;
  added: number;
  skipped: number;
};

export type AnomalyAck = { note?: string; ackedAt?: string };

export type PSBData = {
  sessions: SessionRow[];
  services: ServiceRow[];
  payments: PaymentRow[];
  packages: PackageRow[];
  clientOverrides: Record<string, ClientOverride>;
  anomalyAck: Record<string, AnomalyAck>;
  uploadLog: UploadLogEntry[];
  leads: Lead[];
  /** Závery z debát s Jarvisom — do registra sa dostanú tie po termíne overenia. */
  zavery: ZaverRow[];
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

export const EMPTY_DATA: PSBData = {
  zavery: [],
  sessions: [],
  services: [],
  payments: [],
  packages: [],
  clientOverrides: {},
  anomalyAck: {},
  uploadLog: [],
  leads: [],
};

export type CSVType = "sessions" | "services" | "payments" | "packages" | "cennik" | "metricool" | "ga4" | "gsc" | "anamneza" | "kanaly";
