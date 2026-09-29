/**
 * AKO SA PRODUKTY VOLAJÚ SMEROM VON.
 *
 * Jerry, 29. 9. 2026: „musíme zmeniť názvy balíkov — nemôže to byť bez
 * viazanosti a s viazanosťou, ale Balíček a Předplatné."
 *
 * „BEZ viazanosti" a „S viazanostou" sú pohľad zvnútra: hovoria o tom, čo
 * klient podpísal, nie o tom, čo si kúpil. Klient si kupuje **balíček hodín**
 * alebo **předplatné**, a tak to má stáť aj na faktúre, v maili aj v appke.
 *
 * PREČO SA DÁTA NEPREPISUJÚ
 *
 * Názvy prichádzajú z PTmindera a sú v 133 + 89 riadkoch exportu. Prepísať
 * ich v databáze by znamenalo rozísť sa so zdrojom: najbližší import by ich
 * priniesol späť a appka by mala od každého balíčka dve verzie. Preklad je
 * preto na POVRCHU — pod ním zostáva pôvodný názov a všetko, čo z neho appka
 * číta (počet hodín, platnosť, príslušnosť k 6M), funguje ďalej.
 *
 * Nové balíčky už vznikajú rovno s novými názvami (`cennik.ts`), takže sa
 * slovník časom zjednotí sám.
 *
 * STARÉ PRODUKTY SA NEPREMENÚVAJÚ. SILVER, BRONZ, GOLD, ČLENSTVÍ ONE
 * a spol. sú z roku 2025 a už sa nepredávajú; prekladať ich by znamenalo
 * prepisovať históriu na niečo, čo nikdy nekúpili.
 */

/** Je to předplatné (mesačné, s viazanosťou), alebo jednorazový balíček? */
export function jePredplatne(nazov: string): boolean {
  const n = (nazov || "").toLowerCase();
  return n.includes("s viazanost") || n.includes("předplatn") || n.includes("predplatn");
}

/** Počet hodín z názvu — „OFF - 6h", „8 hodín", „Balíček 6 h". */
const hodinyZNazvu = (n: string): number =>
  Number(/(\d+)\s*(?:h\b|hodin|hodiny|hodín)/i.exec(n || "")?.[1] || 0);

/**
 * Názov, ktorý vidí človek.
 *
 * Preloží sa LEN rodina „OFF - …" a „ON - …" (aktuálne produkty). Čokoľvek
 * iné prejde nezmenené — vrátane „Doplnenie členstva", ktoré je zrozumiteľné
 * samo, a starých stupňov, ktoré patria minulosti.
 */
export function nazovProduktu(nazov: string): string {
  const raw = (nazov || "").trim();
  const m = /^(OFF|ON|TC)\s*-\s*/i.exec(raw);
  if (!m) return raw;

  const hodin = hodinyZNazvu(raw);
  if (!hodin) return raw;

  const kanal = m[1].toUpperCase();
  const druh = jePredplatne(raw) ? "Předplatné" : "Balíček";
  const kde = kanal === "ON" ? " online" : kanal === "TC" ? " TrueCoach" : "";
  return `${druh} ${hodin} h${kde}`;
}

/**
 * Skupina pre grafy a filtre — krátke a v tom istom slovníku.
 *
 * Nie je to `nazovProduktu`: ten rozlišuje počet hodín, lebo klient kupuje
 * konkrétny balíček. Skupina má byť hrubšia, inak má donut dvanásť dielikov.
 */
export function skupinaProduktu(nazov: string): string {
  const raw = (nazov || "").trim();
  if (!raw) return "Bez balíčka";
  if (/doplnenie/i.test(raw)) return "Doplnenie";
  if (!/^(OFF|ON|TC)\s*-\s*/i.test(raw)) return "Staršie členstvo";
  const hodin = hodinyZNazvu(raw);
  const druh = jePredplatne(raw) ? "Předplatné" : "Balíček";
  return hodin ? `${druh} ${hodin} h` : druh;
}
