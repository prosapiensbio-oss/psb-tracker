/**
 * ZOSTATOK HODÍN AKO TEXT — jedno miesto pre každú obrazovku.
 *
 * 1. 11. 2026: tá istá Monika Čechova mala na Dnes „0/6 · hodiny minuté",
 * v profile aj vo Workspace „−2 h" a Jakub Kaňovský „0/1" proti „−2". Karta
 * číslo orezávala na nulu (`Math.max(0, …)`), zvyšok nie. Záporný zostatok sa
 * neoreže nikde, lebo práve on hovorí, koľko tréningov ešte nemá krytie, a nový
 * balíček ho prepíše na hodiny (odpočet 6, 5, 4 … je pevný rad).
 *
 * „2 h nad rámec" namiesto „−2/6": zlomok so záporným čitateľom sa nedá prečítať
 * (Kaňovský by mal „−2/1") a mínus by sa dal vziať za dlh v korunách.
 */
export function nadRamec(zostava: number): number {
  return zostava < 0 ? Math.round(-zostava * 100) / 100 : 0;
}

export function textNadRamec(h: number): string {
  return `${String(h).replace(".", ",")} h nad rámec`;
}

export function textZostatku(v: { zostava: number; spolu?: number | null; odvodene?: boolean }): string {
  const nad = nadRamec(v.zostava);
  if (nad > 0) return textNadRamec(nad);
  const znak = v.odvodene ? "≈" : "";
  return v.spolu ? `${znak}${v.zostava}/${v.spolu}` : `${znak}${v.zostava}`;
}

/** Veta do profilu: „3 h zostáva" alebo „2 h nad rámec". */
export function vetaZostatku(zostava: number, odvodene = false): string {
  const nad = nadRamec(zostava);
  return nad > 0 ? textNadRamec(nad) : `${odvodene ? "≈" : ""}${zostava} h zostáva`;
}
