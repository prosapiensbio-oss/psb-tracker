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
  ciel: { tab: string; sub?: string; mesiac?: string; tyzden?: string };
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

export function ritualy(
  dnes: Date,
  weeks: Record<string, Record<string, string>>,
  monthNotes: Record<string, { note?: string; answers?: Record<string, string> }>,
  /** Čo ešte nie je nahraté — pripomienka na zápis čaká, kým je zoznam prázdny. */
  doklady?: { chybaju: string[] },
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
    // Bez týždňa dopadol klik na zoznam a človek si musel nájsť riadok sám.
    ciel: { tab: "treningy", sub: "prehled", tyzden: tw },
    splatne: !vyplneny && den >= 5,
    hotove: vyplneny,
  });

  // ── Mesačný ─────────────────────────────────────────────────────────────
  // Uzávierka je prvý víkend nasledujúceho mesiaca — ale pripomienka NEZHASÍNA
  // kalendárom, iba zápisom. Prvá verzia zhasla po tom víkende a presne to sa
  // stalo: 4. augusta odznak zmizol, hoci júl bol stále prázdny. Pripomienka,
  // ktorá zmizne skôr než práca, je horšia než žiadna — tvári sa, že je
  // hotovo. Jeden trvalý riadok za jeden chýbajúci mesiac nie je tapeta.
  const minuly = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const mk = mesiacKluc(minuly);
  const zapis = monthNotes[mk];
  // Mesiac je zapísaný, keď naň odpovedal ČLOVEK.
  //
  // Fakty, ktoré do poznámky zapíše Jarvis cez kroniku ("Radek Baláž sa stal
  // majiteľom priestoru"), sú užitočné, ale nie sú uzávierka — a keďže sa
  // ukladajú do toho istého poľa, jeden takýto riadok by pripomienku zhasol a
  // Jerry by otázky mesiaca nikdy nezodpovedal. Kronikové riadky sa preto
  // z kontroly vynímajú podľa podpisu, ktorý si za sebou nechávajú.
  const ludskaPoznamka = (zapis?.note || "")
    .split("\n")
    .filter((r) => !/\(zapísal Jarvis \d{4}-\d{2}-\d{2}\)\s*$/.test(r.trim()))
    .join("")
    .trim();
  const maMesiac = !!(zapis && (ludskaPoznamka || Object.values(zapis.answers || {}).some((v) => String(v).trim())));
  // Odpovedať na otázky mesiaca má zmysel až nad úplnými číslami. Kým chýba
  // banka alebo PTminder, odpoveď by sa písala k neúplnému mesiacu a musela by
  // sa prepisovať — pripomienka preto čaká, kým sú doklady nahraté, a dovtedy
  // hovorí, čo chýba. Bez `doklady` (staré volania) sa správa ako predtým.
  const chybaju = doklady?.chybaju ?? [];
  const mozeZapisovat = chybaju.length === 0;
  out.push({
    id: `mesiac-${mk}`,
    druh: "mesiac",
    nadpis: "Mesačná uzávierka",
    detail: maMesiac
      ? `Mesiac ${mk} je zapísaný.`
      : mozeZapisovat
        ? `Mesiac ${mk} má nahraté všetky doklady, ale nie sú zodpovedané otázky mesiaca. Klik otvorí rovno ne.`
        : `Mesiac ${mk} ešte nemá zápis. Najprv treba doplniť: ${chybaju.join(", ")}.`,
    ciel: mozeZapisovat
      ? { tab: "vysledky", sub: "mesacne", mesiac: mk }
      : { tab: "udaje" },
    splatne: !maMesiac,
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
