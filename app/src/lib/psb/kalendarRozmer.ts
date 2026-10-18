/**
 * ROZMER TÝŽDŇA — jedna definícia pre Kalendár aj Termíny.
 *
 * Jerry, 18. 10. 2026: „môže byť formát zobrazovania kalendára rovnako
 * veľkostne, keď si spravím náhľad termínov?" Termíny mali vlastnú
 * mriežku (40 px na hodinu, na telefóne 30) vedľa kalendára so 46/58 px
 * — ten istý týždeň vyzeral na dvoch záložkách inak veľký.
 */
export function rozmerKalendara(uzke: boolean) {
  return {
    /** px na hodinu; na telefóne vyšší kvôli zalomeným menám */
    hodina: uzke ? 58 : 46,
    /** šírka stĺpca s časmi */
    pas: uzke ? 22 : 42,
    /** medzera medzi dňami */
    medzera: uzke ? 1 : 3,
    /** najmenšia šírka týždňa na monitore — užší sa roluje vodorovne */
    minSirka: uzke ? 0 : 620,
  };
}
