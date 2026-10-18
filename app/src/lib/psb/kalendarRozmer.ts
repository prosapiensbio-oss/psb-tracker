/**
 * ROZMER TÝŽDŇA — jedna definícia pre Kalendár aj Termíny.
 *
 * Jerry, 18. 10. 2026: „chcel som, aby ten formát, ktorý mali Termíny, mal aj
 * Kalendár." Termíny mali menšiu hodinu (40 px, na telefóne 30) a súvislú
 * mriežku s čiarami; Kalendár 46/58 px a oddelené dlaždice dní, takže ten
 * istý týždeň vyzeral na dvoch záložkách inak veľký. Teraz platí formát
 * Termínov pre obe.
 */
export function rozmerKalendara(uzke: boolean) {
  return {
    /** px na hodinu */
    hodina: uzke ? 30 : 40,
    /** šírka stĺpca s časmi */
    pas: uzke ? 26 : 38,
  };
}
