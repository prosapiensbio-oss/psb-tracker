// Odosielanie web push notifikácií priamo z Workera.
//
// PREČO RUČNE A NIE KNIŽNICOU
//
// Balík `web-push` je písaný pre Node (potrebuje `crypto` a `https`) a vo
// Workeri nebeží. Všetko, čo treba, je ale vo Web Crypto — je to dvesto
// riadkov a žiadna závislosť navyše.
//
// ČO SA TU DEJE
//
// Push servery Apple aj Google obsah notifikácie NEVIDIA a nesmú vidieť.
// Prehliadač pri prihlásení na odber vydá dva kľúče (`p256dh`, `auth`)
// a správa sa nimi zašifruje (RFC 8291, aes128gcm). Server navyše musí
// dokázať, kto je — na to je VAPID: podpísaný JWT (RFC 8292).
//
// Poradie krokov je dané normou a je citlivé na bajt: prehodené `ua_public`
// a `as_public` v `key_info` dá platný, ale nedešifrovateľný obsah — push
// server ho prijme (201) a na telefóne sa neobjaví nič. Preto je v testoch
// spätné dešifrovanie, nie len „prešlo to".

const enc = new TextEncoder();

export const b64uNaBajty = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

export const bajtyNaB64u = (b: Uint8Array | ArrayBuffer): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const spoj = (...casti: Uint8Array[]): Uint8Array => {
  const n = casti.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(n);
  let i = 0;
  for (const c of casti) { out.set(c, i); i += c.length; }
  return out;
};

const hmac = async (kluc: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const k = await crypto.subtle.importKey("raw", kluc as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
};

/** HKDF v tvare, v akom ho používa RFC 8291 — vždy jeden blok, teda 0x01 na konci. */
const hkdf = async (sol: Uint8Array, ikm: Uint8Array, info: Uint8Array, dlzka: number): Promise<Uint8Array> =>
  (await hmac(await hmac(sol, ikm), spoj(info, new Uint8Array([1])))).slice(0, dlzka);

/**
 * Zašifruje obsah notifikácie pre jedného príjemcu (RFC 8291, aes128gcm).
 *
 * `efemerne` a `sol` sa dajú vložiť zvonku LEN kvôli testom — v prevádzke sa
 * generujú náhodne pri každej správe, ako norma káže.
 */
export async function zasifruj(
  obsah: string,
  p256dhB64: string,
  authB64: string,
  test?: { efemerne: CryptoKeyPair; sol: Uint8Array },
): Promise<{ telo: Uint8Array; asPublic: Uint8Array }> {
  const uaPublic = b64uNaBajty(p256dhB64);
  const authSecret = b64uNaBajty(authB64);
  const sol = test?.sol ?? crypto.getRandomValues(new Uint8Array(16));

  const efemerne = test?.efemerne ?? (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", efemerne.publicKey));

  const prijemca = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const zdielane = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: prijemca }, efemerne.privateKey, 256));

  // Poradie v key_info je PRIJÍMAJÚCI, potom ODOSIELAJÚCI. Prehodenie je
  // najčastejšia chyba v ručných implementáciách a nedá sa spoznať inak než
  // tým, že notifikácia nedorazí.
  const keyInfo = spoj(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, zdielane, keyInfo, 32);

  const cek = await hkdf(sol, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sol, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // 0x02 je oddeľovač konca obsahu (padding delimiter) pre poslednú dávku.
  const otvorene = spoj(enc.encode(obsah), new Uint8Array([2]));
  const k = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const sifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, k, otvorene as BufferSource));

  // Hlavička: soľ(16) | veľkosť dávky(4, big-endian) | dĺžka kľúča(1) | kľúč(65)
  const hlavicka = new Uint8Array(21);
  hlavicka.set(sol, 0);
  new DataView(hlavicka.buffer).setUint32(16, 4096);
  hlavicka[20] = asPublic.length;

  return { telo: spoj(hlavicka, asPublic, sifra), asPublic };
}

/** Podpísaný VAPID JWT — dôkaz, že správu posiela ten, komu odber patrí. */
export async function vapidHlavicka(endpoint: string, verejnyB64: string, sukromnyD: string, kontakt: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const hlavicka = bajtyNaB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  // 12 hodín je stred povoleného rozsahu; Apple odmieta JWT platný dlhšie
  // než 24 h a Google čokoľvek s časom v minulosti.
  const telo = bajtyNaB64u(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: kontakt,
  })));

  const verejny = b64uNaBajty(verejnyB64);
  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256", d: sukromnyD,
    x: bajtyNaB64u(verejny.slice(1, 33)),
    y: bajtyNaB64u(verejny.slice(33, 65)),
    ext: true,
  };
  const kluc = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const podpis = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kluc, enc.encode(`${hlavicka}.${telo}`));

  return `vapid t=${hlavicka}.${telo}.${bajtyNaB64u(podpis)}, k=${verejnyB64}`;
}

export type Odber = { endpoint: string; p256dh: string; auth: string };

/**
 * Pošle jednu notifikáciu. Vracia stavový kód push servera — 201 znamená
 * prijaté, 404 a 410 znamenajú MŔTVY ODBER a ten sa má zmazať, inak sa bude
 * odosielať do nekonečna na zariadenie, ktoré už appku nemá.
 */
export async function posli(
  odber: Odber,
  obsah: { titulok: string; text: string; url?: string; znacka?: string },
  kluce: { verejny: string; sukromny: string; kontakt: string },
): Promise<{ ok: boolean; status: number; mrtvy: boolean; chyba?: string }> {
  try {
    const { telo } = await zasifruj(JSON.stringify(obsah), odber.p256dh, odber.auth);
    const autorizacia = await vapidHlavicka(odber.endpoint, kluce.verejny, kluce.sukromny, kluce.kontakt);
    const r = await fetch(odber.endpoint, {
      method: "POST",
      headers: {
        Authorization: autorizacia,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
      },
      body: telo as BodyInit,
    });
    // Telo chyby je jediná stopa, prečo push server odmietol — bez neho
    // zostane len číslo, na ktorom sa pátranie zastaví.
    const chyba = r.ok ? undefined : (await r.text().catch(() => "")).slice(0, 300);
    return { ok: r.ok, status: r.status, mrtvy: r.status === 404 || r.status === 410, chyba };
  } catch (e) {
    return { ok: false, status: 0, mrtvy: false, chyba: String(e).slice(0, 300) };
  }
}
