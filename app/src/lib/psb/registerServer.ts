// Register spočítaný mimo prehliadača.
//
// Do 3. 9. 2026 sa počítal LEN v App.tsx. To stačilo, kým ho čítal človek
// pozerajúci sa na obrazovku — ráno na telefóne ho ale nemá kto vykresliť.
// Jerry: „keď ráno otvorím telefón, chcem tam mať všetky notifikácie — pre
// Terezku Terezkine, pre mňa moje."
//
// Skladá sa z tých istých zdrojov a v tom istom poradí ako v appke, vrátane
// `odstranDuplicity` na konci. Keby sa to rozišlo, telefón by hlásil niečo
// iné než obrazovka — a to je horšie než keby nehlásil nič.
//
// Rituály (týždenná únava, uzávierka) sem ZÁMERNE nepatria: tie vedia, či sú
// splnené, až z `vzas_week_notes`, a ich pripomínanie má vlastný rytmus
// (piatok, prvý víkend v mesiaci). Push je o práci s klientmi.

import {
  capacityByTrainer, deriveClients, deriveRegister, deriveSixM, dnesneTreningy, nezapisaneDoRegistra,
  odstranDuplicity, patriTrenerovi, pripomienkaDovodu, pripomienkySlubov,
  stavPolozkyRegistra, type RegisterItem, type ZmenaVKalendari,
} from "./compute";
import { ritualy } from "./rituals";
import type { PSBData } from "./types";

export type KalendarPreRegister = {
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null; nazov?: string; trener?: string }[];
  zmeny: (ZmenaVKalendari & { vysvetlene?: number | boolean; trener?: string })[];
};

/**
 * Rituály ako položky registra — tá istá premena, akú robí App.tsx.
 *
 * Bez nich mala ranná správa dieru presne v tvare mesačných kontrol: 3. 9.
 * 2026 mal Jerry v appke jednu položku („Mesačná kontrola: Peniaze") a v pushi
 * nulu. Terezke sedelo 8 = 8, takže sa to dalo ľahko prehliadnuť — chýbalo len
 * to, čo patrí jednému človeku.
 */
function ritualyDoRegistra(
  weeks: Record<string, Record<string, string>>,
  mesiace: Record<string, { note?: string; answers?: Record<string, string> }>,
  ack: PSBData["anomalyAck"],
  dnes: Date,
  stavDatum?: string,
): RegisterItem[] {
  return ritualy(dnes, weeks, mesiace, { chybaju: [] }, { nacitane: true, stavDatum })
    .filter((r) => r.splatne)
    .map((r) => ({
      key: `zapis|${r.id}`,
      category: "Zápis" as const,
      tone: (r.druh === "kvartal" || r.druh === "kontrola" ? "blue" : "orange") as "blue" | "orange",
      title: r.trener && r.druh === "tyzden" ? `${r.nadpis} (${r.trener})` : r.nadpis,
      detail: `${r.nadpis} — ${r.detail}`,
      trener: r.trener,
      priority: r.druh === "tyzden" ? 5 : r.druh === "mesiac" ? 6 : r.druh === "kontrola" ? 35 : 40,
      client: `${r.ciel.tab}|${r.ciel.sub || ""}`,
      ...stavPolozkyRegistra(`zapis|${r.id}`, ack || {}, undefined, dnes),
    }));
}

/** Všetko, čo by Kokpit ukázal v registri — vrátane rituálov. Bez kontrol nad bankou. */
export function registerZoServera(
  data: PSBData,
  kal: KalendarPreRegister,
  dnes = new Date(),
  zapisy?: {
    weeks: Record<string, Record<string, string>>;
    mesiace: Record<string, { note?: string; answers?: Record<string, string> }>;
    /** Dátum posledného zapísaného stavu hotovosti — pre pripomienku na uzávierku. */
    stavDatum?: string;
  },
): RegisterItem[] {
  const clients = deriveClients(data);
  const ud = kal.udalosti;
  const zm = kal.zmeny;
  const sixM = deriveSixM(data, clients);
  return odstranDuplicity([
    ...(zapisy ? ritualyDoRegistra(zapisy.weeks, zapisy.mesiace, data.anomalyAck, dnes, zapisy.stavDatum) : []),
    // Dnešné tréningy sú v rannej správe to najdôležitejšie — veta, ktorú si
    // človek prečíta o siedmej a večer je buď vybavená, alebo prepadla.
    ...dnesneTreningy(clients, sixM, { udalosti: ud, zmeny: zm }, data.anomalyAck || {}, dnes),
    ...deriveRegister(data, clients, sixM, capacityByTrainer(clients, data.sessions), { udalosti: ud, zmeny: zm }),
    ...pripomienkySlubov(ud as never, (data.leads || []) as never, data.anomalyAck, dnes, zm as never),
    ...pripomienkaDovodu(clients, (data.packages || []) as never, ud as never, data.anomalyAck, dnes),
    // `nezapisaneDoRegistra` vracia položky BEZ stavu odpovede — doplní sa tu,
    // rovnako ako v App.tsx. Bez toho by odklepnutá vec prišla ako push.
    ...nezapisaneDoRegistra({
      leads: data.leads || [],
      menaKlientov: Object.keys(clients),
      dnes: dnes.toISOString().slice(0, 10),
      zmeny: zm.filter((z) => !z.vysvetlene).map((z) => ({ druh: z.druh, trener: String(z.trener || "") })),
      // Podozrivé podiely potrebujú celý lievik; do rannej správy nepatria,
      // sú to čísla na pozretie, nie práca na dnes.
      podiely: [],
    }).map((r) => ({ ...r, ...stavPolozkyRegistra(r.key, data.anomalyAck || {}) })),
  ]);
}

/**
 * Čo z registra patrí jednému trénerovi a ešte na to nikto neodpovedal.
 *
 * Zoradené tak, ako to appka ukazuje — najnaliehavejšie hore. Push potom
 * môže zobrať prvých pár a zvyšok spočítať.
 */
export function preTrenera(polozky: RegisterItem[], data: PSBData, trener: string): RegisterItem[] {
  const clients = deriveClients(data);
  return polozky
    .filter((r) => !r.acked)
    .filter((r) => patriTrenerovi(r, clients, trener))
    .sort((a, b) => a.priority - b.priority);
}
