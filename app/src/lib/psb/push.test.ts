// Šifrovanie web push správ.
//
// „Push server vrátil 201" NIE JE dôkaz, že notifikácia dorazí — server obsah
// nevidí a nekontroluje ho. Keď sa v odvodení kľúča prehodia dva bloky,
// odpoveď je stále 201 a na telefóne sa neobjaví nič. Preto sa tu správa
// rozšifruje SPÄŤ, nezávislou cestou, ktorá robí presne to, čo robí
// prehliadač príjemcu.
import { describe, expect, it } from "bun:test";

import { b64uNaBajty, bajtyNaB64u, vapidHlavicka, zasifruj } from "./push.server";

const enc = new TextEncoder();
const dec = new TextDecoder();

const spoj = (...c: Uint8Array[]) => {
  const out = new Uint8Array(c.reduce((a, x) => a + x.length, 0));
  let i = 0; for (const x of c) { out.set(x, i); i += x.length; }
  return out;
};
const hmac = async (k: Uint8Array, d: Uint8Array) => {
  const key = await crypto.subtle.importKey("raw", k as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, d as BufferSource));
};
const hkdf = async (sol: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
  (await hmac(await hmac(sol, ikm), spoj(info, new Uint8Array([1])))).slice(0, n);

/** Príjemca: to, čo robí prehliadač, keď mu príde push. */
async function rozsifruj(telo: Uint8Array, uaPrivate: CryptoKey, uaPublic: Uint8Array, authSecret: Uint8Array) {
  const sol = telo.slice(0, 16);
  const idlen = telo[20];
  const asPublic = telo.slice(21, 21 + idlen);
  const sifra = telo.slice(21 + idlen);

  const odosielatel = await crypto.subtle.importKey("raw", asPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const zdielane = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: odosielatel }, uaPrivate, 256));

  const ikm = await hkdf(authSecret, zdielane, spoj(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(sol, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sol, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const k = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  const otvorene = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, k, sifra as BufferSource));
  // posledný bajt je oddeľovač 0x02
  expect(otvorene[otvorene.length - 1]).toBe(2);
  return dec.decode(otvorene.slice(0, -1));
}

const prijemca = async () => {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { kp, pub, auth, p256dh: bajtyNaB64u(pub), authB64: bajtyNaB64u(auth) };
};

describe("šifrovanie obsahu (RFC 8291)", () => {
  it("zašifrovanú správu vie príjemca rozšifrovať späť", async () => {
    const p = await prijemca();
    const sprava = JSON.stringify({ titulok: "Kokpit", text: "Robin nemá termín" });
    const { telo } = await zasifruj(sprava, p.p256dh, p.authB64);
    expect(await rozsifruj(telo, p.kp.privateKey, p.pub, p.auth)).toBe(sprava);
  });

  it("hlavička má tvar, aký norma predpisuje", async () => {
    const p = await prijemca();
    const { telo } = await zasifruj("x", p.p256dh, p.authB64);
    expect(new DataView(telo.buffer, telo.byteOffset).getUint32(16)).toBe(4096); // veľkosť dávky
    expect(telo[20]).toBe(65);                                                   // dĺžka kľúča
    expect(telo.length).toBeGreaterThan(21 + 65 + 16);                            // + GCM značka
  });

  it("každá správa má inú soľ aj iný efemérny kľúč", async () => {
    const p = await prijemca();
    const a = await zasifruj("rovnaký text", p.p256dh, p.authB64);
    const b = await zasifruj("rovnaký text", p.p256dh, p.authB64);
    expect(bajtyNaB64u(a.telo.slice(0, 16))).not.toBe(bajtyNaB64u(b.telo.slice(0, 16)));
    expect(bajtyNaB64u(a.asPublic)).not.toBe(bajtyNaB64u(b.asPublic));
  });

  it("diakritika prejde nepoškodená", async () => {
    const p = await prijemca();
    const sprava = "Daniela Šašinkova — chodí raz za týždeň, ďalší termín nemá";
    const { telo } = await zasifruj(sprava, p.p256dh, p.authB64);
    expect(await rozsifruj(telo, p.kp.privateKey, p.pub, p.auth)).toBe(sprava);
  });

  it("cudzím kľúčom sa rozšifrovať NEDÁ", async () => {
    const p = await prijemca();
    const cudzi = await prijemca();
    const { telo } = await zasifruj("tajné", p.p256dh, p.authB64);
    await expect(rozsifruj(telo, cudzi.kp.privateKey, cudzi.pub, cudzi.auth)).rejects.toThrow();
  });
});

describe("VAPID podpis (RFC 8292)", () => {
  const KLUC = async () => {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    return { verejny: bajtyNaB64u(pub), sukromny: jwk.d as string, overovaci: kp.publicKey };
  };

  it("podpis sedí na verejný kľúč", async () => {
    const k = await KLUC();
    const h = await vapidHlavicka("https://web.push.apple.com/abc", k.verejny, k.sukromny, "mailto:a@b.cz");
    const [, jwt] = h.match(/t=([^,]+)/) as RegExpMatchArray;
    const [hl, telo, podpis] = jwt.split(".");
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, k.overovaci,
      b64uNaBajty(podpis) as BufferSource, enc.encode(`${hl}.${telo}`) as BufferSource,
    );
    expect(ok).toBe(true);
  });

  it("audience je pôvod push servera, nie celá adresa odberu", async () => {
    const k = await KLUC();
    const h = await vapidHlavicka("https://web.push.apple.com/abc/def?x=1", k.verejny, k.sukromny, "mailto:a@b.cz");
    const telo = JSON.parse(new TextDecoder().decode(b64uNaBajty((h.match(/t=([^,]+)/) as RegExpMatchArray)[1].split(".")[1])));
    expect(telo.aud).toBe("https://web.push.apple.com");
    expect(telo.sub).toBe("mailto:a@b.cz");
  });

  it("platnosť je v budúcnosti a kratšia než 24 hodín (Apple dlhšie odmieta)", async () => {
    const k = await KLUC();
    const h = await vapidHlavicka("https://fcm.googleapis.com/x", k.verejny, k.sukromny, "mailto:a@b.cz");
    const telo = JSON.parse(new TextDecoder().decode(b64uNaBajty((h.match(/t=([^,]+)/) as RegExpMatchArray)[1].split(".")[1])));
    const teraz = Math.floor(Date.now() / 1000);
    expect(telo.exp).toBeGreaterThan(teraz);
    expect(telo.exp - teraz).toBeLessThan(24 * 3600);
  });

  it("hlavička nesie aj verejný kľúč v k=", async () => {
    const k = await KLUC();
    const h = await vapidHlavicka("https://x.cz/y", k.verejny, k.sukromny, "mailto:a@b.cz");
    expect(h).toContain(`k=${k.verejny}`);
    expect(h.startsWith("vapid t=")).toBe(true);
  });
});

describe("base64url", () => {
  it("prežije okrúhlu cestu vrátane dopĺňania", async () => {
    for (const n of [1, 2, 3, 16, 32, 65]) {
      const b = crypto.getRandomValues(new Uint8Array(n));
      expect([...b64uNaBajty(bajtyNaB64u(b))]).toEqual([...b]);
    }
  });

  it("neobsahuje +, / ani =", () => {
    const b = new Uint8Array([251, 255, 254, 253, 0, 1]);
    expect(bajtyNaB64u(b)).not.toMatch(/[+/=]/);
  });
});
