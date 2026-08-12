/**
 * Zaradenie príspevku podľa toho, ČÍM ZAČÍNA.
 *
 * PREČO PODĽA ZAČIATKU
 *
 * Hook je jediná vec, ktorá rozhoduje, či to niekto dopozerá — a zároveň
 * jediné, čo sa dá triediť. Podľa hashtagov to nejde, v každom príspevku sú
 * skoro všetky.
 *
 * PREČO STROJOVO A NIE RUČNE
 *
 * Doteraz bolo 114 príspevkov zatriedených ručne (`marketing-obsah.ts`,
 * jan 2025 – jún 2026). Je to fotka: čo pribudlo v júli, tam nie je, a nikto
 * to nedoplní. Odkedy príspevky chodia z Graph API aj s textom, môže sa
 * zaradenie robiť pri každom stiahnutí.
 *
 * ČO TO NIE JE
 *
 * Nie je to porozumenie textu. Sú to pravidlá nad prvou vetou a občas sa
 * pomýlia — príspevok, ktorý začne menom klienta a pokračuje anatómiou, tu
 * skončí ako klientsky príbeh. Pri rozhodovaní „čo natáčať ďalej" to stačí;
 * pri jednotlivom príspevku sa treba pozrieť na text.
 *
 * PORADIE PRAVIDIEL JE VÝZNAMOVÉ
 *
 * Príspevok „Michal cvičil deset let. A přesto ho bolela záda. Proč?" spĺňa
 * tri pravidlá naraz. Vyhráva to najužšie: meno klienta je konkrétnejší
 * signál než otáznik a otáznik je konkrétnejší než „všetko ostatné".
 */

export const KATEGORIE = [
  "Klientsky príbeh",
  "Vyvrátenie mýtu",
  "Staccato výpočet",
  "Otázka",
  "Edukácia",
] as const;

export type Kategoria = (typeof KATEGORIE)[number];

/** Diakritika dolu, aby „přesto" a „presto" boli to isté slovo. */
const bezDiakritiky = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Slová, ktorými sa v týchto textoch popiera bežné presvedčenie.
 *
 * Vytiahnuté z reálnych prvých viet, nie vymyslené: „Absence bolesti není
 * zdraví", „Proč klasická rehabilitace prostě nestačí", „metod jsou desítky.
 * A přesto většina lidí…".
 */
const MYTUS = /\b(neni|nestaci|nefunguje|nemusi|nejde o|nezname|myt(us|y)|omyl|ve skutecnosti|a presto|přesto|prestoze|vetsina lidi si mysli|zapomente)\b/;

/** Prvá veta. Emodži a odrážky na začiatku sa nepočítajú. */
function prvaVeta(text: string): string {
  const t = text.replace(/^[\s\p{Extended_Pictographic}\p{So}📌🔍🔥🧬🧍☝•\-–—]+/gu, "").trim();
  const m = t.match(/^[^.!?\n]{1,300}[.!?]?/);
  return (m ? m[0] : t).trim();
}

/**
 * Staccato: tri krátke vety hneď za sebou („Prkno. Sklapovačky. Plank.").
 * Hranica je 40 znakov na vetu — dlhšia veta už nie je úder, je to výklad.
 */
function jeStaccato(text: string): boolean {
  const vety = text.slice(0, 220).split(/(?<=[.!?])\s+/).map((v) => v.trim()).filter(Boolean);
  if (vety.length < 3) return false;
  return vety.slice(0, 3).every((v) => v.length <= 40);
}

/**
 * Zaradenie. `krstneMena` sú krstné mená klientov z PTmindera — bez nich sa
 * klientsky príbeh nedá spoznať, lebo „Michal" je inak obyčajné slovo.
 */
export function kategoriaHooku(text: string, krstneMena: Set<string> = new Set()): Kategoria {
  const t = (text || "").trim();
  if (!t) return "Edukácia";
  const veta = prvaVeta(t);
  const bez = bezDiakritiky(veta);

  // 1 · Klientsky príbeh — meno klienta medzi prvými tromi slovami. Ďalej už
  //     nie: „…a proto Michal přišel" je edukácia s príkladom, nie príbeh.
  const slova = bez.split(/[^\p{L}]+/u).filter(Boolean).slice(0, 3);
  if (slova.some((s) => krstneMena.has(s))) return "Klientsky príbeh";

  // 2 · Vyvrátenie mýtu — popiera bežné presvedčenie. Hľadá sa LEN v prvej
  //     vete, kým staccato nižšie sa pozerá na celý úvod. Nie je to nedôslednosť:
  //     „Prkno. Sklapovačky. Plank. A přesto tě bolí záda." je staccato, ktoré
  //     vrcholí popretím — a to, čo sa z neho dá zopakovať pri natáčaní, je tá
  //     forma. Keby sa mýtus hľadal v celom úvode, zjedol by staccato skoro vždy.
  if (MYTUS.test(bez)) return "Vyvrátenie mýtu";

  // 3 · Staccato výpočet.
  if (jeStaccato(t)) return "Staccato výpočet";

  // 4 · Otázka — prvá veta končí otáznikom. Aj tým v emodži (❓).
  if (/[?？❓]\s*$/.test(veta) || /[?？❓]/.test(veta.slice(0, 120))) return "Otázka";

  return "Edukácia";
}

/** Krstné mená z mien klientov, pripravené pre `kategoriaHooku`. */
export function krstneMenaKlientov(mena: string[]): Set<string> {
  const s = new Set<string>();
  for (const m of mena) {
    const prve = bezDiakritiky(m).split(/\s+/)[0];
    // Dvojpísmenové „mená" sú skratky a chytali by pol Instagramu.
    if (prve && prve.length >= 3) s.add(prve);
  }
  return s;
}
