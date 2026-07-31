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
};

export type PackageRow = {
  client: string;
  status: string; // Active Client | Inactive Client
  package: string;
  remaining: number;
  total: number;
};

export type Lead = {
  id: string;
  date: string;
  name: string;
  source: "referencia" | "mail" | "web" | "google" | "instagram" | "ine";
  referrer: string;   // existing client who sent them (source = referencia)
  status: "novy" | "neodpisal" | "uvodny" | "prisiel" | "klient";
  note: string;
};

export type ClientOverride = {
  status?: string | null;
  specialRate?: boolean;
  specialRateNote?: string;
  trainerNote?: string;
  contractSigned?: boolean;
  primaryTrainer?: string | null;
  bitcoin?: boolean;
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
};

export const EMPTY_DATA: PSBData = {
  sessions: [],
  services: [],
  payments: [],
  packages: [],
  clientOverrides: {},
  anomalyAck: {},
  uploadLog: [],
  leads: [],
};

export type CSVType = "sessions" | "services" | "payments" | "packages";
