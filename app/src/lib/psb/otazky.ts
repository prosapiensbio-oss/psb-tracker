/**
 * Koľko otázok je v jednej správe.
 *
 * Jerry sa 17. 8. 2026 spýtal „Kde v appke vidím dopyty? A čo presne píše naša
 * stránka o Lateral Line?" a dostal odpoveď len na druhú polovicu. Samostatne
 * vie Jarvis obe. Chyba je v tom, že krátka odpoveď a dvojitá otázka si
 * odporujú a vyhrá stručnosť — pokiaľ mu nikto nepovie, že tá otázka bola dve.
 *
 * Preto to appka spočíta a pri dvoch a viac pripíše do promptu príkaz
 * odpovedať na všetky. Je to ten istý spôsob, akým sa doručuje pravidlo
 * o prvej odpovedi: príkaz vtedy, keď platí, nie jedna veta medzi štyridsiatimi.
 */
export function pocetOtazok(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  // Otázniky uprostred textu + prípadný na konci. Konzervatívne: nepočíta
  // otázky bez otáznika („povedz mi, kde to nájdem a koľko to stálo").
  const vnutorne = (t.slice(0, -1).match(/\?/g) || []).length;
  return vnutorne + (t.endsWith("?") ? 1 : 0);
}
