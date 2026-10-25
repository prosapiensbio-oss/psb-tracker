/**
 * ČÍSLO Z DOPYTU, KEĎ SA MENO NEZHODUJE NA ZNAK (Jerry, 25. 10. 2026).
 *
 * Okno SMS pri anamnéze hlásilo „bez čísla" pri dvoch úvodných, hoci čísla
 * v dopytoch boli: v kalendári „Jolona Hořovská", v dopyte „Jolana
 * Hořovská"; v kalendári „Romana Prochádzková- diagnostika", v dopyte len
 * „Prochazkova". Zlučovanie kontaktov (`api/vydane-faktury`) páruje meno
 * presne — a tak to má zostať, lebo zlé číslo = správa cudziemu človeku.
 *
 * Preto len NÁVRH: okno ho ukáže s menom z dopytu a dňom a človek ho
 * potvrdí (pamäť „Kokpit sa má pýtať"). Zhoda:
 *  - priezvisko sedí do jedného písmena (preklep, chýbajúca diakritika
 *    sa stratí už normalizáciou) alebo bez prechyľovacej koncovky,
 *  - krstné sedí do jedného písmena (len pri menách od 5 písmen — Jan
 *    a Jana sú dvaja ľudia),
 *  - dopyt len s priezviskom: priezvisko do jedného písmena, bez koreňa
 *    (Procházka a Prochazkova sú dvaja ľudia).
 */
import { bezDiakritiky } from "./sms";

export type DopytKontakt = { meno: string; telefon: string; datum: string };

/** Slová mena bez diakritiky; prípona za pomlčkou („- diagnostika") nie je meno. */
function slova(meno: string): string[] {
  return bezDiakritiky(String(meno || "").split(/\s-|-\s|-(?=[a-zá-ž]*\s*(uvod|diagn|tren))/i)[0])
    .toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}

/** Levenshteinova vzdialenosť, len kým je do 1 (viac nás nezaujíma). */
function doJedneho(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, chyb = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++chyb > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return chyb + (a.length - i) + (b.length - j) <= 1;
}

const koren = (s: string) => s.replace(/(ova|a)$/, "");

function priezviskoSedi(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  return doJedneho(a, b) || (koren(a).length >= 4 && koren(a) === koren(b));
}

export function navrhyCislaZDopytu(meno: string, dopyty: DopytKontakt[], max = 3): DopytKontakt[] {
  const m = slova(meno);
  if (m.length < 2) return [];
  const krstne = m[0], priezvisko = m[m.length - 1];
  const out: DopytKontakt[] = [];
  const videne = new Set<string>();
  for (const d of [...dopyty].sort((a, b) => b.datum.localeCompare(a.datum))) {
    const t = String(d.telefon || "").replace(/\s/g, "");
    if (!t || videne.has(t)) continue;
    const s = slova(d.meno);
    if (!s.length) continue;
    const krstneSedi = s[0] === krstne || (Math.min(s[0].length, krstne.length) >= 5 && doJedneho(s[0], krstne));
    const sedi = s.length === 1
      ? priezvisko.length >= 5 && doJedneho(s[0], priezvisko)
      : priezviskoSedi(s[s.length - 1], priezvisko) && krstneSedi;
    if (!sedi) continue;
    videne.add(t);
    out.push(d);
    if (out.length >= max) break;
  }
  return out;
}
