/**
 * ŠIFROVANIE ZDRAVOTNÝCH ODPOVEDÍ.
 *
 * Meno, mail a telefón sú v Kokpite čitateľné a je to v poriadku — sú to
 * bežné osobné údaje. Bolesti, operácie a lieky nie sú: podľa GDPR sú to
 * údaje osobitnej kategórie a nestačí pri nich „máme to za heslom".
 *
 * Preto sa obsah anamnézy do databázy zapisuje zašifrovaný. Praktický
 * dôsledok je dôležitejší než právny: **zdravotné odpovede neuvidí Jarvis,
 * kontrolné skripty, `naostro.sh` ani nikto, kto sa dostane k databáze** —
 * v riadku stojí `v1:…` a bez kľúča z toho nie je nič. Rozšifruje ich len
 * worker, keď ich prihlásený tréner otvorí na karte klienta.
 *
 * KĽÚČ ŽIJE LEN NA CLOUDFLARE (`ANAMNEZA_KLUC`, Worker secret). Keď sa
 * stratí, odpovede sa prečítať nedajú — ani zálohou, ani Time Travelom.
 * Doklad o súhlase sa preto NEŠIFRUJE: musí sa dať prečítať aj vtedy.
 *
 * AES-GCM, 256 bitov, nový náhodný IV pri každom zápise. Formát reťazca je
 * `v1:<iv v base64>:<šifra v base64>` — verzia je tam preto, aby sa dal
 * algoritmus raz vymeniť bez toho, aby sa staré riadky stali čitateľnými
 * omylom alebo nečitateľnými navždy.
 */

const PREDPONA = "v1:";

/** Prevedie base64 na bajty. `atob` je vo workeri, Buffer nie. */
function zBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function doBase64(b: ArrayBuffer | Uint8Array): string {
  const bajty = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = "";
  // Po kúskoch: `String.fromCharCode(...pole)` na dlhom poli prekročí
  // limit argumentov a spadne až na veľkej anamnéze, nie pri skúške.
  for (let i = 0; i < bajty.length; i += 4096) bin += String.fromCharCode(...bajty.subarray(i, i + 4096));
  return btoa(bin);
}

async function nacitajKluc(tajomstvo: string): Promise<CryptoKey> {
  const surovy = zBase64(tajomstvo);
  if (surovy.length !== 32) throw new Error("ANAMNEZA_KLUC musí byť 32 bajtov v base64");
  return crypto.subtle.importKey("raw", surovy as unknown as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Zašifruje text. Prázdny reťazec zostáva prázdny — nie je čo skrývať. */
export async function zasifruj(text: string, tajomstvo: string): Promise<string> {
  if (!text) return "";
  const kluc = await nacitajKluc(tajomstvo);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sifra = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    kluc,
    new TextEncoder().encode(text),
  );
  return `${PREDPONA}${doBase64(iv)}:${doBase64(sifra)}`;
}

/**
 * Rozšifruje. Text bez predpony vráti nezmenený — riadok zapísaný ešte
 * pred zavedením šifrovania sa tým pádom nestratí a nič nespadne.
 * Pri zlom kľúči hádže; volajúci to má ukázať, nie zhltnúť.
 */
export async function odsifruj(text: string, tajomstvo: string): Promise<string> {
  if (!text) return "";
  if (!text.startsWith(PREDPONA)) return text;
  const [, ivB64, sifraB64] = text.split(":");
  if (!ivB64 || !sifraB64) throw new Error("poškodený šifrovaný text");
  const kluc = await nacitajKluc(tajomstvo);
  const cisty = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: zBase64(ivB64) as unknown as ArrayBuffer },
    kluc,
    zBase64(sifraB64) as unknown as ArrayBuffer,
  );
  return new TextDecoder().decode(cisty);
}

/** `true` = reťazec je zašifrovaný. Na kontroly, nie na vetvenie logiky. */
export const jeZasifrovane = (text: string): boolean => String(text || "").startsWith(PREDPONA);
