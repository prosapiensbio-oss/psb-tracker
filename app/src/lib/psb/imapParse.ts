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
  /** Reply-To. Formulár na webe posiela mail zo SVOJEJ adresy a človeka dá sem. */
  odpovedat: string;
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
    odpovedat: hlavicka("Reply-To"),
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
 * PREČO CELÝ MIME A NIE LEN ODSTRÁNENIE ZNAČIEK
 *
 * `BODY[TEXT]` vráti telo tak, ako je v schránke — a to je pri väčšine pošty
 * viacdielna zásielka: oddeľovače `--b1=…`, hlavičky každého dielu a až potom
 * text, často zakódovaný v base64. Prvý pokus 21. 9. 2026 to bral ako jeden
 * reťazec a z dopytu Josefa Pávka sa stala poznámka
 * „--b1=_l6zOgx… Content-Type: text/plain … NOV? TEST POSTURY … Jm?no".
 * Nečitateľná poznámka je pritom to jediné, čo o dopyte zostane.
 *
 * Preto: nájdi diely, vezmi ten textový, dekóduj ho podľa JEHO hlavičky
 * a hlavičky dielu zahoď.
 */
export function dekodujTelo(s: string): string {
  const raw = String(s || "");
  const diely = mimeDiely(raw);
  const textovy = diely.find((d) => /text\/plain/i.test(d.typ)) || diely.find((d) => /text\/html/i.test(d.typ)) || diely[0];
  if (!textovy) return "";
  let t = dekodujObsah(textovy.telo, textovy.kodovanie);

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

type Diel = { typ: string; kodovanie: string; telo: string };

/**
 * Rozdelí telo na MIME diely. Keď žiadne oddeľovače nie sú, je to jeden diel.
 *
 * Posledný diel býva odrezaný — sťahuje sa len prvých 3 000 znakov, aby sa
 * z jednej správy nestala stránka textu. To je v poriadku: do poznámky ide
 * aj tak len začiatok.
 */
export function mimeDiely(raw: string): Diel[] {
  const hranica = /^--([A-Za-z0-9'()+_,\-./:=?]{6,})\s*$/m.exec(raw);
  if (!hranica) return [{ ...hlavickyDielu(raw), telo: bezHlaviciek(raw) }];
  const kusy = raw.split(new RegExp(`^--${hranica[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(--)?\\s*$`, "m"));
  const out: Diel[] = [];
  for (const k of kusy.slice(1)) {
    if (!k || !k.trim() || k.trim() === "--") continue;
    out.push({ ...hlavickyDielu(k), telo: bezHlaviciek(k) });
  }
  return out.length ? out : [{ ...hlavickyDielu(raw), telo: bezHlaviciek(raw) }];
}

function hlavickyDielu(k: string): { typ: string; kodovanie: string } {
  const hlava = k.split(/\r?\n\r?\n/)[0] || "";
  const typ = /content-type:\s*([^;\r\n]+)/i.exec(hlava)?.[1]?.trim() || "text/plain";
  const kodovanie = /content-transfer-encoding:\s*([^;\r\n]+)/i.exec(hlava)?.[1]?.trim().toLowerCase() || "";
  return { typ, kodovanie };
}

/** Diel má vlastné hlavičky oddelené prázdnym riadkom — tie do poznámky nepatria. */
function bezHlaviciek(k: string): string {
  const m = /\r?\n\r?\n/.exec(k);
  if (m && /^(\s*[A-Za-z-]+:\s)/.test(k.trimStart())) return k.slice(m.index + m[0].length);
  return k;
}

/**
 * Dekóduje obsah dielu podľa jeho hlavičky.
 *
 * Bez hlavičky sa háda podľa obsahu — ale opatrne: zo socketu prichádza text
 * UŽ dekódovaný ako UTF-8 a druhý preklad by z „Dobrý" spravil „Dobr?".
 * Preto sa preklad z bajtov robí len tam, kde sú naozaj `=XX` značky.
 */
function dekodujObsah(t: string, kodovanie: string): string {
  if (kodovanie === "base64") {
    try { return zBajtov(atob(t.replace(/\s+/g, ""))); } catch { return t; }
  }
  if (kodovanie === "quoted-printable" || (!kodovanie && /=[0-9A-Fa-f]{2}/.test(t))) {
    const rozbalene = t.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    return /[\u0080-\u00ff]/.test(rozbalene) ? zBajtov(rozbalene) : rozbalene;
  }
  return t;
}
