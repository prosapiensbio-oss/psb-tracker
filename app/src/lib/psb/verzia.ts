// Ktorú verziu Kokpitu mám práve otvorenú.
//
// Jerry, 31. 8. 2026: „appka nikde neukazuje svoje číslo verzie, takže nemám
// ako potvrdiť, že mám tú najnovšiu." Mal pravdu a bola to praktická diera:
// na iPhone appka beží zo Safari a po návrate z pozadia môže pokračovať starý
// kód v pamäti. Bez tohto čísla sa „už je to nasadené" a „nevidím to" nedali
// od seba odlíšiť inak než hádaním.
//
// Sú tu DVE veci a každá odpovedá na inú otázku:
//
//   • čas buildu — „je to dnešné?"  Zapečie ho vite.config.ts.
//   • kontrolný súbor — „je to presne tá verzia?"  Meno balíka nesie odtlačok
//     obsahu (`index-3N94NZT3.js`) a mení sa pri každom nasadení. Je to to isté
//     meno, ktoré vypíše `nasad.sh`, takže sa dá porovnať znak po znaku.
//
// Číslo verzie z Cloudflare (840, 841…) tu zámerne nie je: worker ho zistí až
// PO nasadení, teda keď je balík dávno zostavený. Zapisovať doň niečo, čo sa
// dá vedieť až neskôr, by znamenalo klamať o jedno číslo.

declare const __KOKPIT_BUILD__: string;

/** ISO čas zostavenia balíka, alebo prázdne pri vývoji. */
export const CAS_BUILDU: string = typeof __KOKPIT_BUILD__ === "string" ? __KOKPIT_BUILD__ : "";

/**
 * Čo má SERVER — z `/verzia.json`, ktorý zapisuje nasadzovací skript.
 *
 * Toto je celá pointa: `CAS_BUILDU` hovorí, čo beží v tomto okne, tento dopyt
 * hovorí, čo je nasadené. Keď sa líšia, appka beží zo starej pamäte — na
 * iPhone najčastejšia príčina toho, že „to tam nevidím".
 *
 * Odpoveď sa NEKEŠUJE (`cache: "no-store"`). Keby sa kešovala, kontrola
 * zastaranosti by sama zastarala.
 */
export async function verziaServera(): Promise<string | null> {
  try {
    const r = await fetch("/verzia.json", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { cas?: string };
    return typeof j.cas === "string" ? j.cas : null;
  } catch {
    return null;
  }
}

/**
 * Odtlačok práve bežiaceho balíka — z mena vlastného skriptu.
 *
 * Číta sa z DOM, nie z konfigurácie: zaujíma nás, čo prehliadač NAOZAJ spustil,
 * nie čo malo byť nasadené. Práve v tom je celý úžitok.
 */
export function kontrolnySubor(): string {
  if (typeof document === "undefined") return "";
  for (const s of Array.from(document.querySelectorAll("script[src]"))) {
    const m = (s.getAttribute("src") || "").match(/\/assets\/(index-[A-Za-z0-9_-]+)\.js/);
    if (m) return m[1];
  }
  return "";
}
