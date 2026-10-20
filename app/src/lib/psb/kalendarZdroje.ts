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
  // Prechodné odmietnutie Googlom pri čerstvých dátach nie je červená
  // porucha: obrazovka ukáže „pripojený · naposledy …" a ďalší beh to doženie.
  // Keď sa nedarí deň, je to už chyba a ukáže sa aj s vysvetlením.
  if (z.posledna_chyba && /^HTTP (429|5\d\d)/.test(z.posledna_chyba)) {
    const cerstve = !!z.posledne_ok && teraz - Date.parse(z.posledne_ok) < ODMIETNUTIE_V_PORIADKU_MS;
    if (cerstve) return null;
    return `Google opakovane odmieta stiahnutie (${z.posledna_chyba}). Adresa platí, pripájať ho netreba — skúša sa každých pár hodín.`;
  }
  return z.posledna_chyba;
}

// GOOGLE OBČAS ODMIETNE (HTTP 429). Za 6.–20. 10. 2026 skončilo 9 zo 125
// sťahovaní na „HTTP 429" — Google tak odpovedá aj na tajnú adresu iCalu,
// keď sa naň z rovnakých adries Cloudflaru pýta priveľa ľudí naraz. Kalendár
// sa sťahuje raz za 6 hodín (plánovač každé 3 h, zdroje sa striedajú), takže
// jedno odmietnutie znamenalo pol dňa starý kalendár a červenú chybu —
// Jerry: „môj Google kalendár často vypadáva". Odmietnutie je prechodné:
// o pár sekúnd neskôr ten istý dopyt prejde. Opakuje sa preto len na
// prechodné kódy, nie na timeout (ten by beh natiahol na minúty).
const PRECHODNE = new Set([429, 500, 502, 503, 504]);
const PAUZY_MS = [4000, 12000];
/** Najdlhšia pauza, akú sme ochotní čakať podľa hlavičky Retry-After. */
const MAX_PAUZA_MS = 20000;

export type StiahniMoznosti = {
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  cakaj?: (ms: number) => Promise<void>;
};

/** Text iCalu; pri prechodnom odmietnutí skúsi ešte dvakrát. Chyba = `HTTP <kód>`. */
export async function stiahniIcal(url: string, m: StiahniMoznosti = {}): Promise<string> {
  const f = m.fetchFn ?? ((u: string, i: RequestInit) => fetch(u, i));
  const cakaj = m.cakaj ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let pokus = 0; ; pokus++) {
    // 28 s na pokus — Jerryho kalendár (~2,5 MB) generuje Google rôzne dlho (8. 9. 2026).
    const r = await f(url, { headers: { "user-agent": "psb-kokpit-kalendar" }, signal: AbortSignal.timeout(28000) });
    if (r.ok) return await r.text();
    if (!PRECHODNE.has(r.status) || pokus >= PAUZY_MS.length) {
      throw new Error(pokus ? `HTTP ${r.status} (${pokus + 1}× za sebou)` : `HTTP ${r.status}`);
    }
    const ra = Number(r.headers.get("retry-after"));
    await cakaj(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, MAX_PAUZA_MS) : PAUZY_MS[pokus]);
  }
}

/** Odmietnutie Googlom do takejto doby od posledného úspechu nie je porucha. */
const ODMIETNUTIE_V_PORIADKU_MS = 24 * 3600 * 1000;

// DOBEH PO ODMIETNUTÍ. 20. 10. 2026 Google odmietal Jerryho kalendár
// z Cloudflaru tri pokusy za sebou, hoci z Macu prešiel na prvý raz —
// odmieta adresy Cloudflaru, nie kalendár, a nepustí ani o pár sekúnd.
// Bez dobehu by ďalší pokus prišiel až o 6 h. Plánovač preto každú hodinu
// (o pol) skúsi ZNOVA len zdroj, ktorému posledný pokus zlyhal; keď je
// všetko v poriadku, neurobí nič a Google sa nepýta navyše.
const DOBEH_PO_MS = 40 * 60 * 1000;

export type ZdrojNaDobeh = { trener: string; posledny_pokus: string | null; posledny_ok: number | null };

/** Zdroj, ktorému posledný pokus zlyhal (a nebeží práve teraz), inak nič. */
export function zdrojNaDobeh<T extends ZdrojNaDobeh>(zdroje: T[], teraz: number): T | undefined {
  return [...zdroje]
    .filter((z) => !!z.posledny_pokus && z.posledny_ok === 0 && teraz - Date.parse(z.posledny_pokus) > DOBEH_PO_MS)
    .sort((a, b) => (a.posledny_pokus || "").localeCompare(b.posledny_pokus || ""))[0];
}
