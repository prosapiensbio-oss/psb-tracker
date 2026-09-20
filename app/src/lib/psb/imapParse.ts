/**
 * Čítanie IMAP odpovedí — bez socketov, aby sa dalo testovať.
 *
 * `imap.ts` importuje `cloudflare:sockets`, ktorý existuje len v runtime
 * workera; testy pod bunom ho nenačítajú a celý súbor by bol pre ne
 * neviditeľný. Rozobratie odpovede je pritom presne tá časť, ktorá sa môže
 * pokaziť ticho — dekódovaný predmet sa nemá ako „skoro podariť".
 */

const TD = new TextDecoder();

export type ImapSprava = {
  uid: string;
  od: string;
  predmet: string;
  datum: string;
  komu: string;
  text: string;
};

/** Mesiace v tvare, aký chce IMAP SEARCH SINCE (01-Jan-2026). */
const MESIACE = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function imapDatum(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}-${MESIACE[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** Z odpovede FETCH vytiahne hlavičky a začiatok textu. */
export function rozoberOdpoved(r: string): Omit<ImapSprava, "uid"> {
  const hlavicka = (meno: string) => {
    const m = new RegExp(`^${meno}:\\s*(.*(?:\\r\\n[ \\t].*)*)`, "im").exec(r);
    return m ? dekoduj(m[1].replace(/\r\n[ \t]+/g, " ").trim()) : "";
  };
  // Telo je posledný literál v odpovedi; hlavičky sú v tom prvom.
  const casti = r.split(/\{\d+\}\r?\n/);
  let text = casti.length > 2 ? casti[casti.length - 1] : "";
  // Server za telo dopíše uzatváraciu zátvorku a riadok „k4 OK FETCH…".
  // Bez odstránenia by sa vlastná odpoveď servera stala poznámkou k dopytu.
  text = text.replace(/\r?\n\)?\r?\n?[A-Za-z]\d+ (OK|NO|BAD)[\s\S]*$/, "").replace(/\r?\n\)\s*$/, "");
  return {
    od: hlavicka("From"),
    komu: hlavicka("To"),
    predmet: hlavicka("Subject"),
    datum: hlavicka("Date"),
    text: dekodujTelo(text).slice(0, 3000),
  };
}

/**
 * Dekóduje `=?UTF-8?B?…?=` a `=?UTF-8?Q?…?=` v hlavičkách.
 *
 * Bez toho by z „Dotaz na úvodní trénink" bola v Kokpite šifra a dopyt by sa
 * nedal prečítať.
 */
export function dekoduj(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _kod, druh, data) => {
    try {
      if (druh.toUpperCase() === "B") return zBajtov(atob(data));
      const bajty = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      return zBajtov(bajty);
    } catch { return data; }
  }).replace(/\s+/g, " ").trim();
}

/** Z reťazca, kde jeden znak = jeden bajt, spraví text v UTF-8. */
function zBajtov(s: string): string {
  try { return TD.decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); } catch { return s; }
}

/**
 * Telo správy na jednu čitateľnú poznámku.
 *
 * PREČO SA BAJTY PREKLÁDAJÚ LEN NIEKEDY
 *
 * Zo socketu prichádza text už dekódovaný ako UTF-8. Keď je telo v
 * quoted-printable, je celé v ASCII a diakritika je schovaná v `=C3=A9` —
 * tie treba po rozbalení prečítať ešte raz ako bajty. Keď v tele žiadne `=XX`
 * nie sú, je už hotové a druhý preklad by z „Dobrý" spravil „Dobr?".
 */
export function dekodujTelo(s: string): string {
  let t = String(s || "");

  // Celé telo v base64 (Content-Transfer-Encoding: base64) — jeden blok
  // bez medzier a bez diakritiky, ktorý by inak skončil v poznámke ako šifra.
  const cisty = t.replace(/\s+/g, "");
  if (cisty.length > 40 && /^[A-Za-z0-9+/=]+$/.test(cisty)) {
    try { t = zBajtov(atob(cisty)); } catch { /* nebol to base64 */ }
  }

  if (/=[0-9A-Fa-f]{2}/.test(t) || /=\r?\n/.test(t)) {
    t = t.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    t = zBajtov(t);
  }

  if (/<\/?(p|div|br|html|table)\b/i.test(t)) {
    t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }

  return t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'")
    .replace(/\r/g, "")
    .split("\n").map((r) => r.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}
