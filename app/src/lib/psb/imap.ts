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

import { imapDatum, kosZoZoznamu, rozoberOdpoved, uidValidity, vyberUidy } from "./imapParse";
import type { ImapSprava, KurzorSchranky } from "./imapParse";

export type { ImapSprava, KurzorSchranky } from "./imapParse";
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
 * celý procesorový čas workera. Čo sa nezmestí, počká na ďalší beh: `kurzor`
 * hovorí, kam až sa čítalo (`vyberUidy`), a volajúci si ten vrátený uloží až
 * po spracovaní správ — beh, ktorý spadol, sa zopakuje od toho istého miesta.
 */
export async function stiahniSpravy(opts: {
  host: string; port?: number; user: string; heslo: string;
  odKedy: Date; priecinok?: string; limit?: number; kurzor?: KurzorSchranky | null;
}): Promise<{ spravy: ImapSprava[]; kurzor: KurzorSchranky; zostava: number }> {
  const s = new Spojenie(opts.host, opts.port || 993);
  try {
    await s.privitanie();
    await s.prikaz(`LOGIN ${uvodzovky(opts.user)} ${uvodzovky(opts.heslo)}`);
    const validity = uidValidity(await s.prikaz(`SELECT ${uvodzovky(opts.priecinok || "INBOX")}`));
    // Iné UIDVALIDITY = server prečísloval schránku, starý kurzor neznamená nič.
    const odUid = opts.kurzor && opts.kurzor.validity === validity ? opts.kurzor.uid : 0;
    const hladaj = await s.prikaz(`UID SEARCH SINCE ${imapDatum(opts.odKedy)}`);
    const riadok = /^\* SEARCH([\d ]*)/m.exec(hladaj);
    const uids = (riadok?.[1] || "").trim().split(/\s+/).filter(Boolean);
    const { vybrane, zostava, novyKurzor } = vyberUidy(uids, opts.limit || 40, odUid);
    const out: ImapSprava[] = [];
    for (const uid of vybrane) {
      const r = await s.prikaz(
        `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE REPLY-TO)] BODY.PEEK[TEXT]<0.3000>)`,
      );
      out.push({ uid, ...rozoberOdpoved(r) });
    }
    return { spravy: out, kurzor: { uid: novyKurzor, validity }, zostava };
  } finally {
    await s.zavri();
  }
}


/**
 * CELÉ TELÁ VYBRANÝCH SPRÁV — karta Email (12. 11. 2026). Jedno prihlásenie
 * na všetky (Dovecot po sérii prihlásení odmieta aj správne heslo). Len
 * čítanie (`BODY.PEEK`), v schránke sa nič neoznačí. Keď sa schránka medzitým
 * prečíslovala (iné UIDVALIDITY), nevráti nič — UID by ukazovali na iné maily.
 */
export async function stiahniTela(opts: {
  host: string; port?: number; user: string; heslo: string; uids: number[]; validity: string; maxZnakov?: number;
}): Promise<{ spravy: ImapSprava[]; platnost: boolean }> {
  const s = new Spojenie(opts.host, opts.port || 993);
  try {
    await s.privitanie();
    await s.prikaz(`LOGIN ${uvodzovky(opts.user)} ${uvodzovky(opts.heslo)}`);
    const validity = uidValidity(await s.prikaz(`SELECT "INBOX"`));
    if (opts.validity && validity && validity !== opts.validity) return { spravy: [], platnost: false };
    const max = opts.maxZnakov || 20000;
    const out: ImapSprava[] = [];
    for (const uid of opts.uids.slice(0, 8)) {
      const r = await s.prikaz(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE REPLY-TO)] BODY.PEEK[TEXT]<0.${max * 2}>)`);
      // Len skutočná odpoveď „* N FETCH“ — „k3 OK Fetch completed“ príde aj
      // vtedy, keď správa v schránke už nie je (12. 11. 2026: zmazaný
      // podvodný mail sa tváril ako prázdny).
      if (!/^\* \d+ FETCH/im.test(r)) continue;
      out.push({ uid: String(uid), ...rozoberOdpoved(r, max) });
    }
    return { spravy: out, platnost: true };
  } finally {
    await s.zavri();
  }
}


/**
 * ODSTRÁNIŤ = PRESUN DO KOŠA (Jerry, 12. 11. 2026: „treba tam pridať
 * odstrániť“). Jediný zásah Kokpitu do schránky; navždy sa nemaže nič —
 * mail ostane v Koši vo webmaili a dá sa vrátiť. Bez koša sa neurobí nič.
 * Správa, ktorá v schránke už nie je, sa hlási ako `nebola`, nie chyba.
 */
export async function presunDoKosa(opts: {
  host: string; port?: number; user: string; heslo: string; uid: number; validity: string;
}): Promise<{ ok: true; kos: string; nebola?: boolean } | { ok: false; chyba: string }> {
  const s = new Spojenie(opts.host, opts.port || 993);
  try {
    await s.privitanie();
    await s.prikaz(`LOGIN ${uvodzovky(opts.user)} ${uvodzovky(opts.heslo)}`);
    const kos = kosZoZoznamu(await s.prikaz(`LIST "" "*"`));
    if (!kos) return { ok: false, chyba: "v schránke som nenašiel Kôš — nič som nezmazal" };
    const validity = uidValidity(await s.prikaz(`SELECT "INBOX"`));
    if (opts.validity && validity && validity !== opts.validity) return { ok: false, chyba: "schránka sa medzitým prečíslovala — načítaj ju znova" };
    if (!/^\* \d+ FETCH/im.test(await s.prikaz(`UID FETCH ${opts.uid} (UID)`))) return { ok: true, kos, nebola: true };
    try {
      await s.prikaz(`UID MOVE ${opts.uid} ${uvodzovky(kos)}`);
    } catch {
      // Server bez MOVE: skopírovať do koša, až potom v INBOXe zmazať.
      await s.prikaz(`UID COPY ${opts.uid} ${uvodzovky(kos)}`);
      await s.prikaz(`UID STORE ${opts.uid} +FLAGS.SILENT (\\Deleted)`);
      await s.prikaz(`UID EXPUNGE ${opts.uid}`);
    }
    return { ok: true, kos };
  } catch (e) {
    return { ok: false, chyba: String((e as Error)?.message || e).slice(0, 200) };
  } finally {
    await s.zavri();
  }
}
