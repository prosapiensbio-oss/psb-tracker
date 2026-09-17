// Ktorý kalendár stiahnuť a čo o ňom povedať na obrazovke.
//
// VÝBER PODĽA POSLEDNÉHO POKUSU, NIE POSLEDNÉHO ÚSPECHU. Plánovač volá
// sťahovanie bez mena a appka brala zdroj, ktorý sa najdlhšie NEPODARIL.
// 10. 9. 2026 Jerryho kalendár zabil worker na limite skôr, než sa zapísal
// úspech — takže zostal „najzanedbanejší" a KAŽDÝ ďalší beh si ho vybral
// znova a znova zomrel. Tri dni sa nestiahol ani jeden kalendár (Terezkin len
// ručne), a obrazovka po 36 hodinách napísala „nesťahoval sa", čo vyzeralo
// ako odpojenie. Pokus sa preto zapisuje PRED ťažkou prácou a rotuje sa podľa
// neho: padajúci zdroj nemôže blokovať ostatné.
//
// BEH, KTORÝ ZOMREL, SA MUSÍ OHLÁSIŤ. Worker zabitý na limite nestihne zapísať
// chybu — chýbajúca chyba nie je dôkaz, že je dobre (viď CLAUDE.md). Pokus sa
// preto zapíše s textom `NEDOKONCENE` a úspech ho prepíše. Keď ho po pár
// minútach nič neprepísalo, beh sa nedokončil a obrazovka to povie.

import { fmtDMY } from "./format";

export const NEDOKONCENE = "nedokončené";
/** Kým beh reálne trvá (sťahovanie do 28 s + zápis), nie je to chyba. */
const BEZI_MS = 2 * 60 * 1000;

export type ZdrojSPokusom = { trener: string; posledny_pokus: string | null };

/** Zdroj na stiahnutie: žiadaný tréner, inak ten najdlhšie NESKÚŠANÝ. */
export function vyberZdroj<T extends ZdrojSPokusom>(zdroje: T[], ziadany?: string): T | undefined {
  if (ziadany) return zdroje.find((z) => z.trener === ziadany);
  return [...zdroje].sort((a, b) => (a.posledny_pokus || "").localeCompare(b.posledny_pokus || ""))[0];
}

export type PoslednaSnimka = { kedy: string; ok: number; chyba: string | null };

/** Čo sa má pri zdroji ukázať ako chyba — zapísaná, alebo beh, čo sa nedokončil. */
export function chybaZdroja(
  z: { posledne_ok: string | null; posledna_chyba: string | null },
  posledna: PoslednaSnimka | null,
  teraz: number,
): string | null {
  const zomrel =
    !!posledna && !posledna.ok &&
    (posledna.chyba || "").startsWith(NEDOKONCENE) &&
    teraz - Date.parse(posledna.kedy) > BEZI_MS &&
    (!z.posledne_ok || z.posledne_ok < posledna.kedy);
  if (zomrel) {
    return `Posledné sťahovanie (${fmtDMY(posledna!.kedy)} ${posledna!.kedy.slice(11, 16)}) sa nedokončilo — kalendár je na spracovanie priveľký. Adresa platí, pripájať ho netreba; skúsi sa znova pri ďalšom behu.`;
  }
  return z.posledna_chyba;
}
