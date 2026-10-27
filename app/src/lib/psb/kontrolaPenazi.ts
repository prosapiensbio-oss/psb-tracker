/**
 * KONTROLA PEŇAZÍ PATRÍ DO WORKSPACE, NIE DO NOTIFIKÁCIÍ (Jerry, 27. 10. 2026:
 * „v notifikáciách mám veľa notifikácií… z týchto platobných mi sprav kartu").
 *
 * Kontroly nad bankou (`kontrolaBanky` v App.tsx) sa pýtajú na staré mesiace
 * a zaradenia — je to sedenie nad peniazmi, nie správa na dnes. Na Dnes ich
 * nebolo vidno medzi tréningami a klientmi, vo Workspace majú vlastnú kartu.
 * Jarvis a uzávierka ich vidia ďalej (register ostáva celý).
 *
 * Zámerne MIMO: nedorazený výpis z banky, bitcoin a Guillermo — tie hovoria
 * o tom, čo treba urobiť teraz, a ostávajú notifikáciou.
 */
const PREDPONY = ["naklad|", "dvojity|", "pravidlo|", "prijmy|", "nezhody|"];

export const jeKontrolaPenazi = (kluc: string): boolean => PREDPONY.some((p) => kluc.startsWith(p));

/**
 * REKLAMY: NA DNES JEDNA NOTIFIKÁCIA, ROZHODNUTIA V DOZORE (Jerry, 27. 10. 2026:
 * „to isté sprav s reklamami — daj mi len 1 notifikáciu skontrolovať reklamy
 * a nech ma to preklikne do dozoru reklám"). Položky dozoru (`reklama|…`)
 * sa kreslia s tlačidlami v karte Dozor reklám vo Workspace.
 */
export const jeReklamaDozoru = (kluc: string): boolean => kluc.startsWith("reklama|");

/** Kľúč súhrnu: mení sa s každou novou položkou, takže „Vybavené" platí len na to, čo bolo. */
export const klucSuhrnuReklam = (kluce: string[]): string => `reklamy-suhrn|${[...kluce].sort().join(",")}`;
