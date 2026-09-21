/**
 * Minimálny IMAP klient pre Cloudflare Worker.
 *
 * PREČO VLASTNÝ A PREČO TAKÝ MALÝ
 *
 * Jerry, 20. 9. 2026: „dopyt prišiel na info@ a v Kokpite nie je". Formulár
 * na webe posiela dopyt do Kokpitu sám, ale kto napíše rovno mailom, do
 * štatistiky nespadne — a to je práve ten dopyt, ktorý stál peniaze za
 * reklamu. Schránka je teda ďalší zdroj dopytov a Kokpit si ju musí vedieť
 * prečítať.
 *
 * Knižnice z npm sem nejdú: bežia nad `net`/`tls` z Node, ktoré Worker nemá.
 * Worker má `connect()` z `cloudflare:sockets`, čo je holý TCP s TLS — a IMAP
 * je riadkový protokol, takže stačí poslať pár príkazov a prečítať odpovede.
 * Implementované je len to, čo treba na čítanie: LOGIN, SELECT, SEARCH, FETCH
 * hlavičiek a kusa textu, LOGOUT. Nič sa nemaže, nič sa neoznačuje ako
 * prečítané (BODY.PEEK), takže príchod Kokpitu do schránky nie je vidieť.
 */

import { connect } from "cloudflare:sockets";

import { imapDatum, rozoberOdpoved } from "./imapParse";
import type { ImapSprava } from "./imapParse";

export type { ImapSprava } from "./imapParse";
export { imapDatum, rozoberOdpoved, dekoduj, dekodujTelo } from "./imapParse";

const TE = new TextEncoder();
const TD = new TextDecoder();

/**
 * Jedno spojenie, jedna dávka príkazov.
 *
 * Odpoveď servera chodí po kúskoch a hranice riadkov nesedia s hranicami
 * paketov, preto sa číta do nárazníka, kým sa v ňom neobjaví riadok
 * `<značka> OK|NO|BAD`. Bez toho by FETCH s dlhým telom skončil v polovici.
 */
class Spojenie {
  private socket: ReturnType<typeof connect>;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private zvysok = "";
  private n = 0;

  constructor(host: string, port: number) {
    this.socket = connect({ hostname: host, port }, { secureTransport: "on", allowHalfOpen: false });
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
  }

  private async citajKym(hotovo: (text: string) => boolean, limitMs = 20000): Promise<string> {
    const koniec = Date.now() + limitMs;
    let buf = this.zvysok;
    this.zvysok = "";
    while (!hotovo(buf)) {
      if (Date.now() > koniec) throw new Error("server neodpovedal včas");
      const { value, done } = await this.reader.read();
      if (done) break;
      buf += TD.decode(value, { stream: true });
    }
    return buf;
  }

  /** Privítanie servera („* OK …"). Slúži aj ako test, či sa dá spojiť. */
  async privitanie(): Promise<string> {
    const t = await this.citajKym((b) => b.includes("\r\n"), 15000);
    return t.split("\r\n")[0];
  }

  /** Pošle príkaz so značkou a vráti celú odpoveď až po riadok s výsledkom. */
  async prikaz(text: string): Promise<string> {
    const znacka = `k${++this.n}`;
    await this.writer.write(TE.encode(`${znacka} ${text}\r\n`));
    const hotovo = (b: string) => new RegExp(`^${znacka} (OK|NO|BAD)`, "m").test(b);
    const odpoved = await this.citajKym(hotovo);
    const stav = new RegExp(`^${znacka} (OK|NO|BAD)(.*)$`, "m").exec(odpoved);
    if (stav && stav[1] !== "OK") {
      // Heslo sa do hlášky nikdy nedostane — v texte príkazu býva.
      const co = text.split(" ")[0];
      throw new Error(`IMAP ${co} zlyhal:${stav[2] || ""}`.trim());
    }
    return odpoved;
  }

  async zavri(): Promise<void> {
    try { await this.prikaz("LOGOUT"); } catch { /* server už mohol zavrieť */ }
    try { await this.writer.close(); } catch { /* nevadí */ }
    try { await this.socket.close(); } catch { /* nevadí */ }
  }
}

/** Otvorí spojenie a vráti privítanie. Bez hesla — overuje len dostupnosť. */
export async function testSpojenia(host: string, port = 993): Promise<string> {
  const s = new Spojenie(host, port);
  try {
    return await s.privitanie();
  } finally {
    await s.zavri();
  }
}

const uvodzovky = (s: string) => `"${String(s).replace(/([\\"])/g, "\\$1")}"`;

/**
 * Stiahne správy doručené od daného dňa.
 *
 * `limit` je poistka proti tomu, aby prvý beh nad starou schránkou nezožral
 * celý procesorový čas workera: berú sa najnovšie správy, zvyšok počká na
 * ďalší beh.
 */
export async function stiahniSpravy(opts: {
  host: string; port?: number; user: string; heslo: string;
  odKedy: Date; priecinok?: string; limit?: number;
}): Promise<ImapSprava[]> {
  const s = new Spojenie(opts.host, opts.port || 993);
  try {
    await s.privitanie();
    await s.prikaz(`LOGIN ${uvodzovky(opts.user)} ${uvodzovky(opts.heslo)}`);
    await s.prikaz(`SELECT ${uvodzovky(opts.priecinok || "INBOX")}`);
    const hladaj = await s.prikaz(`UID SEARCH SINCE ${imapDatum(opts.odKedy)}`);
    const riadok = /^\* SEARCH([\d ]*)/m.exec(hladaj);
    const uids = (riadok?.[1] || "").trim().split(/\s+/).filter(Boolean);
    if (!uids.length) return [];
    const vybrane = uids.slice(-(opts.limit || 40));
    const out: ImapSprava[] = [];
    for (const uid of vybrane) {
      const r = await s.prikaz(
        `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE REPLY-TO)] BODY.PEEK[TEXT]<0.3000>)`,
      );
      out.push({ uid, ...rozoberOdpoved(r) });
    }
    return out;
  } finally {
    await s.zavri();
  }
}

