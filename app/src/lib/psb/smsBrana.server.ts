/**
 * ODOSLANIE SMS CEZ BRÁNU.
 *
 * Kokpit nemá vlastnú SIM; SMS posiela cez službu, ktorá za to berie okolo
 * koruny za správu. Podporované sú dve:
 *
 *  • **SMS Manager** (smsmanager.cz) — český, jeden kľúč, jedno HTTP volanie.
 *    Predvolený, lebo nemá čo pokaziť.
 *  • **Twilio** — keby Jerry raz potreboval aj zahraničie alebo doručenky.
 *
 * Pridať tretiu je pár riadkov: celé rozhranie je „vezmi číslo a text, vráť
 * ok alebo dôvod". Zámerne sa tu nič nerieši okolo — žiadne fronty, žiadne
 * opakovanie. SMS sa posiela na klik človeka a keď neprejde, povie to.
 *
 * KĽÚČ SA NIKAM NEVYPISUJE. Do chyby ide odpoveď brány, nie to, čím sme sa
 * prihlásili — tá istá zásada ako pri hesle do schránky.
 */

export type BranaUcet = {
  /** „smsmanager" | „twilio" */
  druh: string;
  /** API kľúč alebo (pri Twilio) `SID:token`. */
  kluc: string;
  /** Odosielateľ — meno alebo číslo. Pri Twilio je povinné. */
  odosielatel: string;
};

export type VysledokSms = { ok: boolean; chyba?: string; id?: string };

/** Odpoveď brány skrátená na to, čo sa zmestí do hlášky. */
const kus = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

async function smsManager(u: BranaUcet, cislo: string, text: string): Promise<VysledokSms> {
  const telo = new URLSearchParams({ apikey: u.kluc, number: cislo, message: text });
  // Odosielateľ je nepovinný — bez neho príde správa z čísla brány.
  if (u.odosielatel) telo.set("sender", u.odosielatel);
  const r = await fetch("https://http-api-lts.smsmanager.cz", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: telo.toString(),
  });
  const odpoved = kus(await r.text());
  // „OK|932125742|420777111222" alebo „ERROR|102".
  if (r.ok && /^OK\b/i.test(odpoved)) return { ok: true, id: odpoved.split("|")[1] || "" };
  return { ok: false, chyba: odpoved || `brána odpovedala ${r.status}` };
}

async function twilio(u: BranaUcet, cislo: string, text: string): Promise<VysledokSms> {
  const [sid, token] = u.kluc.split(":");
  if (!sid || !token) return { ok: false, chyba: "kľúč pre Twilio má tvar SID:token" };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: cislo, From: u.odosielatel, Body: text }).toString(),
  });
  const j = await r.json().catch(() => null) as { sid?: string; message?: string } | null;
  if (r.ok && j?.sid) return { ok: true, id: j.sid };
  return { ok: false, chyba: kus(j?.message || `brána odpovedala ${r.status}`) };
}

/**
 * Pošle jednu SMS. Nehádže výnimky: odoslanie SMS nesmie zhodiť obrazovku,
 * z ktorej sa posiela.
 */
export async function posliSms(u: BranaUcet, cislo: string, text: string): Promise<VysledokSms> {
  if (!u.kluc) return { ok: false, chyba: "brána nie je nastavená — doplň kľúč v Údajoch" };
  if (!text.trim()) return { ok: false, chyba: "prázdna správa" };
  try {
    if (u.druh === "twilio") return await twilio(u, cislo, text);
    return await smsManager(u, cislo, text);
  } catch (e) {
    return { ok: false, chyba: kus(String(e instanceof Error ? e.message : e)) };
  }
}
