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

export type Priloha = {
  meno: string;
  typ: string;
  data: ArrayBuffer;
  /**
   * Obrázok, ktorý sa má zobraziť VNÚTRI správy, nie visieť pod ňou.
   *
   * QR na platbu musí byť vidieť v tele mailu. Dátová adresa (`data:`) by
   * bola jednoduchšia, lenže Gmail ju v obrázkoch zahadzuje — jediná cesta,
   * ktorá prejde všade, je príloha s `Content-ID`, na ktorú sa HTML odkáže
   * cez `cid:`.
   */
  cid?: string;
};

export type Sprava = {
  od: string;
  odMeno?: string;
  komu: string[];
  kopiaSkryta?: string[];
  predmet: string;
  /** Čisto textová podoba — to, čo uvidí klient v čítačke bez HTML. */
  telo: string;
  /** Nepovinná HTML podoba tej istej správy. */
  html?: string;
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
  const vnutri = prilohy.filter((p) => p.cid);
  const pripojene = prilohy.filter((p) => !p.cid);

  /**
   * SPRÁVA SA SKLADÁ ZVNÚTRA VON.
   *
   *   text            — keď nie je ani HTML, ani príloha
   *   alternative     — text + HTML (čítačka si vyberie, čo vie)
   *   related         — alternative + obrázky, na ktoré sa HTML odkazuje
   *   mixed           — to všetko + prílohy, ktoré sa sťahujú (PDF faktúry)
   *
   * Každá vrstva pribudne LEN vtedy, keď má čo obaliť. Mail s holým textom
   * tak vyzerá presne ako predtým — a to je zámer, lebo tri roky fungoval.
   */
  const h = (n: number) => `${hranica}_${n}`;
  const cast = (typ: string, obsah: string, extra: string[] = []) =>
    [`Content-Type: ${typ}`, "Content-Transfer-Encoding: base64", ...extra, "", zalom(base64Text(obsah))];

  let telo: string[];
  let typTela: string;
  if (s.html) {
    typTela = `multipart/alternative; boundary="${h(1)}"`;
    telo = [
      `--${h(1)}`, ...cast('text/plain; charset="UTF-8"', s.telo),
      `--${h(1)}`, ...cast('text/html; charset="UTF-8"', s.html),
      `--${h(1)}--`,
    ];
  } else {
    typTela = 'text/plain; charset="UTF-8"';
    telo = ["Content-Transfer-Encoding: base64", "", zalom(base64Text(s.telo))];
    // Bez obalu je hlavička tela zároveň hlavičkou správy — rieši sa nižšie.
  }

  if (vnutri.length) {
    const vnutorne = telo;
    const vnutornyTyp = typTela;
    typTela = `multipart/related; type="multipart/alternative"; boundary="${h(2)}"`;
    telo = [`--${h(2)}`, `Content-Type: ${vnutornyTyp}`, ...(s.html ? [""] : []), ...vnutorne];
    for (const p of vnutri) {
      telo.push(
        `--${h(2)}`,
        `Content-Type: ${p.typ}; name="${p.meno}"`,
        "Content-Transfer-Encoding: base64",
        `Content-ID: <${p.cid}>`,
        `Content-Disposition: inline; filename="${p.meno}"`,
        "",
        zalom(base64(p.data)),
      );
    }
    telo.push(`--${h(2)}--`);
  }

  if (!pripojene.length) {
    hlavicky.push(`Content-Type: ${typTela}`);
    return `${hlavicky.join(CRLF)}${CRLF}${telo.join(CRLF)}${CRLF}`;
  }

  hlavicky.push(`Content-Type: multipart/mixed; boundary="${hranica}"`);
  const casti = [`--${hranica}`, `Content-Type: ${typTela}`, ...(s.html || vnutri.length ? [""] : []), ...telo];
  for (const p of pripojene) {
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

/**
 * Chyba servera preložená do vety, ktorá hovorí, čo s tým.
 *
 * Jerry, 27. 9. 2026 dostal na obrazovku „535 535 5.7.8 Error: authentication
 * failed: (reason unavailable)". Je to presné, ale nepovie, čo robiť.
 *
 * A NERADÍ SA PREPÍSAŤ HESLO. Tá istá faktúra o jedenásť minút neskôr odišla
 * s tým istým heslom — server ho odmietol len dočasne, presne ako Dovecot pri
 * čítaní schránky (21. 9. 2026). Prvá rada je preto skúsiť znova; heslo je až
 * druhá možnosť. Kód servera ostáva v zátvorke — kto sa pýta Websupportu,
 * potrebuje presné znenie.
 */
export function poLudsky(chyba: string): string {
  const t = chyba.slice(0, 300);
  if (/\b535\b|authentication failed|auth.*fail/i.test(t)) {
    return `schránka odmietla prihlásenie — skús o chvíľu znova, server odmieta aj správne heslo po sérii pokusov. Keď to nepôjde ani potom, prepíš heslo v Údajoch (server hovorí: ${t.slice(0, 120)})`;
  }
  if (/neodpovedal|timeout/i.test(t)) return t;
  if (/55[04]|relay|not permitted/i.test(t)) {
    return `server správu neprijal — skontroluj adresu príjemcu (server hovorí: ${t.slice(0, 120)})`;
  }
  return t.slice(0, 200);
}

/**
 * ADRESÁTI Z JEDNÉHO POĽA.
 *
 * Traja klienti majú dva maily — firemný a súkromný — a nevieme, ktorý
 * naozaj čítajú. Bohdan Klímek má v PTminderi `b.klimek@email.cz` a v appke
 * heinekenovskú adresu; Martinovi Vaškovi faktúra odišla na adresu s jedným
 * preklepom a nikto sa to nedozvedel, lebo SMTP ju prevzal. Doklad má preto
 * vedieť odísť na obe adresy naraz — nie dvakrát a nie do prázdna.
 *
 * Pokazenú adresu ticho nezahadzuje: vráti ju v `zle`, nech to obrazovka
 * povie. Inak by mail odišiel polovici ľudí a tvárilo by sa to ako úspech.
 */
export function adresyMailu(text: string): { adresy: string[]; zle: string[] } {
  const adresy: string[] = [];
  const zle: string[] = [];
  for (const kus of String(text || "").split(/[\n,;]+/)) {
    const a = kus.trim().toLowerCase();
    if (!a) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) zle.push(a);
    else if (!adresy.includes(a)) adresy.push(a);
  }
  return { adresy, zle };
}
