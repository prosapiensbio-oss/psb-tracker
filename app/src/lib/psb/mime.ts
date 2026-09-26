/**
 * SKLADANIE MAILU (MIME) — bez siete, aby sa to dalo otestovať.
 *
 * Oddelené od `smtp.server.ts` zámerne: ten importuje `cloudflare:sockets`,
 * ktoré mimo Workera neexistuje, takže by sa test ani nespustil. Tu je len
 * text — a práve v ňom sú chyby, ktoré klient uvidí: kaša v predmete alebo
 * rozsypaná príloha.
 */

export const CRLF = "\r\n";

export const base64 = (b: ArrayBuffer | Uint8Array): string => {
  const bajty = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < bajty.length; i += 0x8000) s += String.fromCharCode(...bajty.subarray(i, i + 0x8000));
  return btoa(s);
};
export const base64Text = (s: string) => base64(new TextEncoder().encode(s));

/** Base64 zalomený na 76 znakov — tak to žiada MIME. */
const zalom = (s: string) => (s.match(/.{1,76}/g) || []).join(CRLF);
/** Hlavička s diakritikou musí ísť zakódovaná, inak z nej bude kaša. */
const hlavicka = (s: string) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${base64Text(s)}?=`);
/** Meno pred adresou; zakódované, keď má diakritiku. */
const adresa = (mail: string, meno?: string) => (meno ? `${hlavicka(meno)} <${mail}>` : mail);

export type Priloha = { meno: string; typ: string; data: ArrayBuffer };

export type Sprava = {
  od: string;
  odMeno?: string;
  komu: string[];
  kopiaSkryta?: string[];
  predmet: string;
  telo: string;
  prilohy?: Priloha[];
};

/** Zostaví MIME správu. Text aj prílohy idú v base64 — žiadne prekvapenia. */
export function mimeSprava(s: Sprava, hranica = `psb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`): string {
  const hlavicky = [
    `From: ${adresa(s.od, s.odMeno)}`,
    `To: ${s.komu.join(", ")}`,
    `Subject: ${hlavicka(s.predmet)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${s.od.split("@")[1] || "localhost"}>`,
    "MIME-Version: 1.0",
  ];
  const prilohy = s.prilohy || [];
  if (!prilohy.length) {
    hlavicky.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64");
    return `${hlavicky.join(CRLF)}${CRLF}${CRLF}${zalom(base64Text(s.telo))}`;
  }
  hlavicky.push(`Content-Type: multipart/mixed; boundary="${hranica}"`);
  const casti = [
    `--${hranica}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    zalom(base64Text(s.telo)),
  ];
  for (const p of prilohy) {
    casti.push(
      `--${hranica}`,
      `Content-Type: ${p.typ}; name="${p.meno}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${p.meno}"`,
      "",
      zalom(base64(p.data)),
    );
  }
  casti.push(`--${hranica}--`, "");
  return `${hlavicky.join(CRLF)}${CRLF}${CRLF}${casti.join(CRLF)}`;
}
