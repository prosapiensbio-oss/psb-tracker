// Zostatok sedení u Guillerma (FP Spain) — JEDNA definícia pre kartu aj pre
// Jarvisov kontext.
//
// Do 9. 9. 2026 to počítala len karta `GuillermoKarta` inline a Jarvis to
// nemal v kontexte vôbec — chat.ts mu hovoril, nech si to poskladá z
// `guillermo_hodiny` + `kal_udalosti` sám. To je ten istý druh chyby ako pri
// výplatách: číslo z obrazovky, ktoré Jarvis nevidí a musí ho odvodzovať —
// a odvodí ho ľahko zle (počítanie „odtrénované od kotvy" je jemné a citlivé
// na okno udalostí, viď fix z 8. 9. 2026, keď guillermo tréning starší než
// okno z počtu vypadol). Preto spoločná funkcia a hotové číslo v kontexte.
//
// KOTVA = posledný ručný záznam „zostatok" (stav účtu k dňu). Od nej sa ráta:
// + kúpené sedenia PO kotve, − guillermo tréningy PO kotve do dnes.

export type GuillermoZaznam = { datum: string; druh: string; hodiny: number };
export type GuillermoUdalost = { typ: string | null; zaciatok: string };

export type GuillermoStav = {
  zostatok: number;
  kotvaHodiny: number;
  kotvaDatum: string | null;
  kupene: number;
  odtrenovane: number;
};

export function guillermoZostatok(
  zaznamy: GuillermoZaznam[],
  udalosti: GuillermoUdalost[],
  dnesISO: string = new Date().toISOString().slice(0, 10),
): GuillermoStav {
  const kotva = zaznamy
    .filter((z) => z.druh === "zostatok")
    .sort((a, b) => b.datum.localeCompare(a.datum))[0] || null;
  const odKedy = kotva?.datum || "0000-00-00";
  const kupene = zaznamy
    .filter((z) => z.druh === "nakup" && z.datum > odKedy)
    .reduce((a, z) => a + z.hodiny, 0);
  // VŠETKY guillermo udalosti (nie len z okna kalendára) — inak by starší
  // tréning z počtu vypadol a zostatok by ticho narástol späť.
  const odtrenovane = udalosti.filter(
    (u) => u.typ === "guillermo" && u.zaciatok.slice(0, 10) > odKedy && u.zaciatok.slice(0, 10) <= dnesISO,
  ).length;
  return {
    zostatok: (kotva?.hodiny ?? 0) + kupene - odtrenovane,
    kotvaHodiny: kotva?.hodiny ?? 0,
    kotvaDatum: kotva?.datum ?? null,
    kupene,
    odtrenovane,
  };
}
