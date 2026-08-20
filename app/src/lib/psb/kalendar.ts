/**
 * Uhádnutie typu udalosti z jej názvu.
 *
 * PREČO TO VZNIKLO
 *
 * Mapovanie kalendára stojí na CELOM názve udalosti. „Úvodní trénink — Jana"
 * a „Úvodní trénink — Peter" sú preto dve rôzne veci a každú treba odklikať
 * zvlášť. Pri bežných tréningoch to nevadí — meno sa opakuje týždne. Pri
 * úvodnom je to naopak: každý nový človek je nový názov, teda nová práca,
 * a to práve vtedy, keď je najmenej času.
 *
 * Jerry, 14. 8.: „stačilo by iba «Úvodní»?" Odteraz áno.
 *
 * ČO TO NEROBÍ
 *
 * Neuhádne KLIENTA. Meno z názvu vytiahnuť spoľahlivo nejde („Úvodní trénink
 * — Jana K.", „uvodny Novak", „ÚT Peter 9:00") a zlé priradenie človeka je
 * horšie než žiadne: sedenie by sa pripísalo cudziemu. Typ je bezpečný, lebo
 * z neho nevyplýva nič o konkrétnom človeku.
 *
 * A nikdy neprebije to, čo si Jerry potvrdil ručne — naučené mapovanie
 * vyhráva vždy.
 */

/** Bez diakritiky a v malých písmenách — v názvoch sa píše všelijako. */
const holy = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Slová, ktoré typ prezrádzajú jednoznačne.
 *
 * Zámerne krátky zoznam. Každé ďalšie slovo je ďalšia šanca, že sa niečo
 * zaradí zle — a zle zaradená udalosť je horšia než neznáma, lebo neznámu
 * appka ukáže a zle zaradenú nie.
 */
const PODLA_SLOVA: { slovo: string; typ: string }[] = [
  { slovo: "uvodn", typ: "uvodny" },      // úvodný, úvodní, uvodny, ÚVODNÍ TRÉNINK
  { slovo: "guillermo", typ: "guillermo" },
];

/**
 * Typ uhádnutý z názvu, alebo `null` keď sa hádať nedá.
 *
 * `null` znamená „spýtaj sa" — nie „bežný tréning". Predpokladať tréning by
 * znamenalo, že sa súkromná udalosť ticho započíta do kapacity.
 */
/**
 * Meno človeka z názvu ÚVODNÉHO tréningu — a výhradne z neho.
 *
 * PREČO TO NEPROTIREČÍ PRAVIDLU VYŠŠIE
 *
 * „Klient sa nehádа" platí ďalej pre bežné tréningy: tam by zlý odhad pripísal
 * hodinu existujúcemu človeku a peniaze by sa pomýlili. Pri úvodnom je situácia
 * opačná — ten človek v appke ešte NIE JE. Nie je komu pripísať cudzie sedenie;
 * najhoršie, čo sa stane, je nepotvrdený profil s preklepom v mene, ktorý sa
 * v Kalendári opraví jedným klikom.
 *
 * Jerry, 17. 8. 2026: „ten úvodný na Janu Malinovú by sa mi mal už rovno spraviť
 * ako nový profil, aby mohla vyskočiť notifikácia, či dostala SMS po úvodnom."
 * Meno v tom názve stálo („Uvodný tréning Jana Malinová") a appka sa tvárila,
 * že tam nie je nič.
 *
 * OPATRNOSŤ JE V TOM, ČO SA ODMIETNE. Zvyšok po odstránení nálepky musí
 * vyzerať ako meno: začínať veľkým písmenom, byť bez číslic a najviac tri
 * slová. „Úvodní trénink 9:00" ani „Úvodní — volná" tým neprejdú.
 */
export function menoZNazvuUvodneho(nazov: string): string | null {
  let s = (nazov || "").trim();
  if (!s) return null;
  // Nálepka preč: úvodný/úvodní/uvodny + tréning/trénink/trening v ľubovoľnom
  // poradí a s ľubovoľnou diakritikou, plus oddeľovače okolo nej.
  // Hranica slova sa NEPÍŠE ako \b: to je ASCII pravidlo a pred „Ú" neplatí,
  // takže „Úvodní trénink" by prežilo nedotknuté a appka by z neho urobila
  // klienta menom Úvodní. Lookbehind na písmeno je unicode-bezpečný.
  s = s
    .replace(/(?<!\p{L})[úu]vodn\S*/giu, " ")
    .replace(/(?<!\p{L})tr[éeě]n\S*/giu, " ")
    .replace(/^[\s\p{Pd}:,–—-]+|[\s\p{Pd}:,–—-]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.length < 2 || s.length > 40) return null;
  if (/\d/.test(s)) return null;
  const slova = s.split(" ");
  if (slova.length > 3) return null;
  // Veľké začiatočné písmeno je posledná poistka: zvyšok vety ho nemá.
  if (s[0] !== s[0].toLocaleUpperCase("sk")) return null;
  if (!/\p{L}/u.test(s)) return null;
  return s;
}

export function typZNazvu(nazov: string): string | null {
  const n = holy(nazov || "");
  if (!n.trim()) return null;
  for (const { slovo, typ } of PODLA_SLOVA) if (n.includes(slovo)) return typ;
  return null;
}
