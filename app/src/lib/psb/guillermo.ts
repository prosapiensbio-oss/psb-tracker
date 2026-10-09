import { dnesPraha } from "./cas";
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
  dnesISO: string = dnesPraha(),
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

/**
 * NOTIFIKÁCIA: SEDENIA U GUILLERMA SÚ MINUTÉ.
 *
 * Jerry, 9. 10. 2026: „guillermo −1 mi nevyskakuje." Zostatok sa počítal len
 * na karte v Kalendári a nikde inde — kto kartu neotvoril, o mínuse nevedel.
 * Hlási sa pri NULE aj mínuse (nula = ďalšie sedenie už nie je zaplatené).
 *
 * Kľúč nesie dátum posledného nákupu alebo kotvy: po dokúpení sedení sa zmení,
 * takže „Vybavené" umlčí tento výpadok, nie upozornenie navždy — a keď po
 * dokúpení ešte stále zostane mínus, otázka príde nanovo.
 *
 * Volá ju appka (register) aj ranná správa na telefón — jedna funkcia, aby
 * telefón nehlásil niečo iné než obrazovka.
 */
export function polozkaGuillermo(
  zaznamy: GuillermoZaznam[],
  udalosti: GuillermoUdalost[],
  dnesISO: string = dnesPraha(),
): { key: string; title: string; detail: string; zostatok: number } | null {
  if (!zaznamy.length) return null;
  const s = guillermoZostatok(zaznamy, udalosti, dnesISO);
  if (s.zostatok > 0) return null;
  const posledny = zaznamy.map((z) => z.datum).sort().pop() || "";
  return {
    key: `guillermo|${posledny}`,
    zostatok: s.zostatok,
    title: s.zostatok < 0 ? `Guillermo: ${s.zostatok} sedenie` : "Guillermo: zaplatené sedenia sú minuté",
    detail: s.zostatok < 0
      ? `U Guillerma si v mínuse (${s.zostatok}) — odtrénoval si viac sedení, než je zaplatených. Keď platbu pošleš, zapíš v Kalendári → Guillermo, koľko sedení kúpila.`
      : "Zaplatené sedenia u Guillerma sú minuté — ďalšie už nie je zaplatené. Po platbe zapíš v Kalendári → Guillermo, koľko sedení kúpila.",
  };
}
