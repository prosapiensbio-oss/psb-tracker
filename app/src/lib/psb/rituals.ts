// Rituály — kedy sa čo zapisuje a čo z toho ešte chýba.
//
// Jerryho odpoveď na otázku, prečo sú týždenné zápisy prázdne, nebola „je to
// zbytočné", ale „je to úplne nový zvyk". Appka teda nemá pridať ďalšie
// políčko, má pripomenúť — a pripomenúť vtedy, kedy sa to naozaj robí:
//
//   • týždenný zápis — cez víkend (piatok až nedeľa)
//   • mesačný — prvý víkend nasledujúceho mesiaca (viď prevadzka.md)
//   • kvartálny — v prvých dňoch po skončení kvartálu
//
// Zámerne to NIE je „každý deň, kým to nevyplníš". Pripomienka, ktorá svieti
// stále, prestane byť pripomienkou a stane sa tapetou; presne tak zomrel
// pôvodný zámer týždenných zápisov.

import { weekKey } from "./format";

export type Ritual = {
  id: string;
  /** "tyzden" | "mesiac" | "kvartal" */
  druh: "tyzden" | "mesiac" | "kvartal";
  nadpis: string;
  detail: string;
  /** Kam to zapísať — dvojica pre navigáciu. */
  ciel: { tab: string; sub?: string };
  /** true = práve teraz je čas to spraviť a nie je to spravené */
  splatne: boolean;
  /** true = už je to za dané obdobie vyplnené */
  hotove: boolean;
};

const PEOPLE = ["jerry", "terezka"] as const;

const dvoj = (n: number) => String(n).padStart(2, "0");
const mesiacKluc = (d: Date) => `${d.getFullYear()}-${dvoj(d.getMonth() + 1)}`;

/** Poradie dňa v týždni s pondelkom ako 1 a nedeľou ako 7. */
const denVTyzdni = (d: Date) => d.getDay() || 7;

/** Koľký deň v mesiaci pripadá na prvú nedeľu — hranica „prvého víkendu". */
const prvaNedela = (rok: number, mesiac: number) => {
  const prvy = new Date(rok, mesiac, 1);
  return 1 + ((7 - denVTyzdni(prvy)) % 7);
};

export function ritualy(
  dnes: Date,
  weeks: Record<string, Record<string, string>>,
  monthNotes: Record<string, { note?: string; answers?: Record<string, string> }>,
): Ritual[] {
  const out: Ritual[] = [];
  const den = denVTyzdni(dnes);
  const denVMesiaci = dnes.getDate();

  // ── Týždenný ────────────────────────────────────────────────────────────
  // Zapisuje sa za PREBIEHAJÚCI týždeň, cez víkend. Piatok je najskorší deň,
  // kedy má zmysel sa pýtať „aký bol týždeň" — v stredu to človek nevie.
  const tw = weekKey(dnes.toISOString());
  const zaznam = weeks[tw] || {};
  const vyplneny = PEOPLE.some((p) => String(zaznam[`${p}_score`] ?? "").trim() !== "");
  out.push({
    id: `tyzden-${tw}`,
    druh: "tyzden",
    nadpis: "Týždenný zápis",
    detail: vyplneny
      ? "Tento týždeň je zapísaný."
      : "Náročnosť týždňa a iné hodiny — kým to máš v hlave. V pondelok si to už nikto nepamätá.",
    ciel: { tab: "treningy", sub: "prehled" },
    splatne: !vyplneny && den >= 5,
    hotove: vyplneny,
  });

  // ── Mesačný ─────────────────────────────────────────────────────────────
  // Uzávierka je prvý víkend nasledujúceho mesiaca. Pripomíname od prvého dňa
  // mesiaca do konca toho víkendu — potom sa už len tvárime, že je to hotové,
  // a mesiac zostane navždy prázdny.
  const minuly = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const mk = mesiacKluc(minuly);
  const zapis = monthNotes[mk];
  const maMesiac = !!(zapis && ((zapis.note || "").trim() || Object.values(zapis.answers || {}).some((v) => String(v).trim())));
  const koniecOkna = prvaNedela(dnes.getFullYear(), dnes.getMonth()) + 1;
  out.push({
    id: `mesiac-${mk}`,
    druh: "mesiac",
    nadpis: "Mesačná uzávierka",
    detail: maMesiac
      ? `Mesiac ${mk} je zapísaný.`
      : `Mesiac ${mk} ešte nemá zápis — otázky mesiaca a poznámku. Potom sa dá zamknúť.`,
    ciel: { tab: "vysledky", sub: "mesacne" },
    splatne: !maMesiac && denVMesiaci <= koniecOkna,
    hotove: maMesiac,
  });

  // ── Kvartálny ───────────────────────────────────────────────────────────
  // Len v prvých desiatich dňoch po skončení kvartálu a s najnižšou
  // naliehavosťou — Jerry sám hovorí, že kvartál ho zaujíma najmenej.
  const mesiac = dnes.getMonth();
  const poKvartali = mesiac % 3 === 0 && denVMesiaci <= 10;
  const kvartal = `Q${Math.floor(((mesiac + 11) % 12) / 3) + 1}`;
  out.push({
    id: `kvartal-${dnes.getFullYear()}-${kvartal}`,
    druh: "kvartal",
    nadpis: `Kvartálny pohľad ${kvartal}`,
    detail: "Prejdi ciele a KPI za kvartál — čo sa pohlo a čo sa nepohlo.",
    ciel: { tab: "vysledky", sub: "kvartalne" },
    splatne: poKvartali,
    hotove: false,
  });

  return out;
}
