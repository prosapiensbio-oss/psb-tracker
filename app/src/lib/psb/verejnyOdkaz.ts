/**
 * KRÁTKA ADRESA PRE ODKAZY V SMS.
 *
 * Jerry, 1. 10. 2026: „sprav tú krátku adresu prosapiens.cz/u/ — a sprav to
 * pre všetky správy, aj pre posielanie končiaceho členstva."
 *
 * Adresa workera má 46 znakov (`kokpit.prosapiensbio.workers.dev/u/<token>`)
 * a celá uvítacia správa s ňou mala 172 znakov, teda DVE SMS. Cez vlastnú
 * doménu má 28 a správa sa zmestí do jednej. Pri 56 úvodných ročne je to 56
 * správ zadarmo — len za dĺžku adresy.
 *
 * Presmerovanie robí WordPress (snippet „Krátky odkaz pre SMS", id 26):
 * `/u/`, `/v/`, `/t/`, `/k/` a `/d/` (dotazník, 9. 10.) + token pošle 302 na workera a všetko ostatné
 * nechá na webe. `/t/` (ponuka termínov) a `/k/` (kalendár v mobile)
 * pribudli 9. 10. 2026 (Jerry: „zmeň to, sprav snippet"). Feed `/k/<token>/
 * kalendar.ics` cez doménu NEJDE — stránka /k/ ho skladá z adresy workera,
 * na ktorú klient po presmerovaní dorazí, a odber v telefóne tak 302 nečaká. Doména NIE JE na Cloudflare (DNS je na Websupporte), takže
 * vlastná doména workera ani Workers Route neprichádzajú do úvahy.
 *
 * `bez www`: `prosapiens.cz` sa 301-kou presmeruje na `www`, ale v SMS sa
 * počíta každý znak a štyri navyše sú štyri navyše.
 */
export const VEREJNA_DOMENA = "https://prosapiens.cz";

/**
 * Verejný odkaz pre klienta. `cesta` je `/u/`, `/v/`, `/t/`, `/k/` alebo `/d/` + token.
 *
 * `zaloha` je adresa workera — keď sa presmerovanie na webe raz rozbije,
 * zmení sa JEDNA konštanta tu a odkazy začnú znova chodiť priamo. Bez tohto
 * jedného miesta by sa to muselo hľadať v troch súboroch.
 */
export function verejnyOdkaz(cesta: string, zaloha?: string): string {
  const c = cesta.startsWith("/") ? cesta : `/${cesta}`;
  if (!/^\/(u|v|t|k|d)\/[A-Za-z0-9]{8,24}$/.test(c)) {
    // Čo presmerovanie na webe nepozná, musí ísť priamo na workera —
    // inak by klient dostal odkaz, ktorý končí na 404.
    return `${(zaloha || "").replace(/\/+$/, "")}${c}`;
  }
  return `${VEREJNA_DOMENA}${c}`;
}
