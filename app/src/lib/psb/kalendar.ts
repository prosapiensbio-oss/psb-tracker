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
export function typZNazvu(nazov: string): string | null {
  const n = holy(nazov || "");
  if (!n.trim()) return null;
  for (const { slovo, typ } of PODLA_SLOVA) if (n.includes(slovo)) return typ;
  return null;
}
