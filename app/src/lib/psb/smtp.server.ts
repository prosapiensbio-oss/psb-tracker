import { connect } from "cloudflare:sockets";

import { CRLF, base64Text, mimeSprava, type Priloha, type Sprava } from "./mime";

/**
 * ODOSLANIE MAILU CEZ SMTP — priamo z Workera.
 *
 * PREČO VLASTNÝ KLIENT A NIE SLUŽBA
 *
 * Jerry má schránku `info@prosapiens.cz` na Websupporte a Kokpit ju už pozná
 * (číta z nej dopyty). Poslať faktúru tou istou schránkou znamená žiadny nový
 * účet, žiadne zásahy do DNS a hlavne: klientovi to príde z adresy, na ktorú
 * vie odpovedať — a odpoveď padne Jerrymu do schránky, nie do appky.
 *
 * Workers nemajú SMTP knižnicu, ale majú `connect()` — TCP von na ľubovoľný
 * port okrem 25. Websupport počúva na 587, hovorí STARTTLS a `AUTH LOGIN`
 * (overené 26. 9. 2026).
 *
 * ČO JE TU KRITICKÉ
 *
 * • Odpoveď servera je jeden alebo VIAC riadkov: „250-PIPELINING" pokračuje,
 *   „250 CHUNKING" končí. Kto číta len prvý riadok, rozíde sa so serverom
 *   o niekoľko správ a skončí na nezmyselnej chybe.
 * • Heslo ide do `AUTH LOGIN` v base64 — nie je to šifrovanie. Preto sa
 *   posiela AŽ po `STARTTLS`, nikdy pred ním; inak ho vidí celá cesta.
 * • Do logu sa nesmie dostať ani heslo, ani telo správy. Chyby sa preto
 *   vracajú ako kód a text servera, nič iné.
 */

/**
 * Zásuvka tak, ako ju vracia `connect()`.
 *
 * Typy Workers nie sú v tomto projekte globálne (viď `bindings.server.ts` —
 * prebili by DOM, na ktorom stojí React), takže `startTls` treba pomenovať
 * tu. Je to popis skutočného rozhrania, nie obchádzka.
 */
type Zasuvka = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  startTls(): Zasuvka;
};

export type SmtpUcet = { host: string; port: number; pouzivatel: string; heslo: string };

/** Čítanie odpovedí po riadkoch — jeden buffer pre celé spojenie. */
class Citac {
  private zvysok = "";
  constructor(private citac: ReadableStreamDefaultReader<Uint8Array>) {}

  /**
   * Pustí prúd. Pred `startTls()` sa MUSÍ uvoľniť čítací aj zapisovací
   * zámok — inak sa nové spojenie nerozbehne a klient visí na čakaní na
   * odpoveď, ktorá nikdy nepríde (26. 9. 2026, prvý pokus o odoslanie).
   */
  pusti() { try { this.citac.releaseLock(); } catch { /* už pustené */ } }

  /** Jedna celá odpoveď servera vrátane pokračovacích riadkov. */
  async odpoved(): Promise<{ kod: number; text: string }> {
    const riadky: string[] = [];
    for (;;) {
      const koniec = this.zvysok.indexOf(CRLF);
      if (koniec < 0) {
        const { value, done } = await this.citac.read();
        if (done) break;
        this.zvysok += new TextDecoder().decode(value);
        continue;
      }
      const riadok = this.zvysok.slice(0, koniec);
      this.zvysok = this.zvysok.slice(koniec + 2);
      riadky.push(riadok);
      // Štvrtý znak je pomlčka, kým odpoveď pokračuje; medzera na konci.
      if (riadok.charAt(3) !== "-") break;
    }
    const prvy = riadky[0] || "";
    return { kod: Number(prvy.slice(0, 3)) || 0, text: riadky.join(" ") };
  }
}

/**
 * Pošle správu. Vráti `{ ok: true }` alebo dôvod od servera.
 *
 * Nehádže výnimky do volajúceho: odosielanie mailu nesmie zhodiť zápis
 * faktúry, ktorá je už vystavená.
 */
export async function posliMail(u: SmtpUcet, s: Sprava, strop = 25000): Promise<{ ok: boolean; chyba?: string }> {
  /**
   * Strop na celý rozhovor. Bez neho sa dá čakať donekonečna: keď server
   * neodpovie, `read()` sa jednoducho nevráti a visí celá požiadavka —
   * človek pozerá na „posielam…" a nedozvie sa nič.
   */
  return await Promise.race([
    rozhovor(u, s),
    new Promise<{ ok: boolean; chyba?: string }>((ok) => setTimeout(() => ok({ ok: false, chyba: `server neodpovedal do ${Math.round(strop / 1000)} s` }), strop)),
  ]);
}

async function rozhovor(u: SmtpUcet, s: Sprava): Promise<{ ok: boolean; chyba?: string }> {
  let socket: Zasuvka | null = null;
  try {
    socket = connect({ hostname: u.host, port: u.port }, { secureTransport: "starttls", allowHalfOpen: false }) as unknown as Zasuvka;
    let citac = new Citac(socket.readable.getReader());
    let zapis = socket.writable.getWriter();
    const kodovac = new TextEncoder();
    const posli = async (riadok: string) => { await zapis.write(kodovac.encode(riadok + CRLF)); };
    const cakaj = async (ocakavane: number[], kde: string) => {
      const o = await citac.odpoved();
      if (!ocakavane.includes(o.kod)) throw new Error(`${kde}: ${o.kod} ${o.text}`.slice(0, 200));
      return o;
    };

    await cakaj([220], "pripojenie");
    await posli("EHLO kokpit.prosapiens.cz");
    await cakaj([250], "EHLO");
    await posli("STARTTLS");
    await cakaj([220], "STARTTLS");

    // Od tohto miesta je spojenie šifrované — až teraz smie ísť heslo.
    citac.pusti();
    zapis.releaseLock();
    const bezpecny = socket.startTls();
    socket = bezpecny;
    citac = new Citac(bezpecny.readable.getReader());
    zapis = bezpecny.writable.getWriter();

    await posli("EHLO kokpit.prosapiens.cz");
    await cakaj([250], "EHLO po TLS");
    await posli("AUTH LOGIN");
    await cakaj([334], "AUTH");
    await posli(base64Text(u.pouzivatel));
    await cakaj([334], "meno");
    await posli(base64Text(u.heslo));
    await cakaj([235], "prihlásenie");

    await posli(`MAIL FROM:<${s.od}>`);
    await cakaj([250], "odosielateľ");
    for (const komu of [...s.komu, ...(s.kopiaSkryta || [])]) {
      await posli(`RCPT TO:<${komu}>`);
      await cakaj([250, 251], `príjemca ${komu}`);
    }
    await posli("DATA");
    await cakaj([354], "DATA");
    // Riadok so samotnou bodkou ukončuje správu, takže bodku na začiatku
    // riadku treba zdvojiť. V base64 sa stať nemôže, ale pravidlo platí.
    const telo = mimeSprava(s).split(CRLF).map((r) => (r.startsWith(".") ? `.${r}` : r)).join(CRLF);
    await posli(`${telo}${CRLF}.`);
    await cakaj([250], "prijatie správy");
    await posli("QUIT");
    return { ok: true };
  } catch (e) {
    return { ok: false, chyba: String(e instanceof Error ? e.message : e).slice(0, 200) };
  } finally {
    try { await socket?.close(); } catch { /* spojenie už spadlo */ }
  }
}
