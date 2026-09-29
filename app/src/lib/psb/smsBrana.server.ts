/**
 * ODOSLANIE SMS CEZ BRÁNU.
 *
 * Kokpit nemá vlastnú SIM; SMS posiela cez službu, ktorá za to berie okolo
 * koruny za správu. Podporované sú dve:
 *
 *  • **SMS Manager** (smsmanager.cz) — český, jeden kľúč, jedno HTTP volanie.
 *    Predvolený, lebo nemá čo pokaziť. Ide cez ich JSON API v2
 *    (`api.smsmngr.com/v2`), lebo kľúč z ich administrácie patrí k nemu;
 *    staršie `http-api-lts` je síce stále živé, ale nové kľúče sa vydávajú
 *    pre v2 a odpoveď z neho sa lepšie číta.
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
  const r = await fetch("https://api.smsmngr.com/v2/message", {
    method: "POST",
    headers: { "x-api-key": u.kluc, "content-type": "application/json" },
    body: JSON.stringify({
      body: text,
      // v2 chce číslo BEZ úvodného plusu; `cisloPreBranu` ho pridáva.
      to: [{ phone_number: cislo.replace(/^\+/, "") }],
      /**
       * `transactional` nie je kozmetika. Marketingové správy brána doručuje
       * len medzi 8:00 a 20:00 — a toto je oznámenie klientovi, že dochodil
       * balíček, nie kampaň. Pod cudzie pravidlá sa dobrovoľne nedávame.
       */
      tag: "transactional",
      flow: [{ sms: {
        /**
         * `type: "utf"` MUSÍ BYŤ. Bez neho brána diakritiku ODSTRÁNI a
         * klientovi príde „v balicku ti zostavaju 2 h". Appka pritom dĺžku
         * počíta ako UCS-2 (70 znakov) — bez tohto by ukazovala jedno
         * a brána robila druhé.
         */
        type: "utf",
        // Meno odosielateľa treba v ČR predregistrovať; bez neho príde SMS z čísla.
        ...(u.odosielatel ? { sender: u.odosielatel } : {}),
      } }],
    }),
  });
  const j = await r.json().catch(() => null) as {
    request_id?: string;
    accepted?: { message_id?: string }[];
    message?: string; error?: string; detail?: string;
  } | null;
  const id = j?.accepted?.[0]?.message_id || j?.request_id || "";
  if (r.ok && id) return { ok: true, id: String(id) };
  return { ok: false, chyba: kus(j?.message || j?.error || j?.detail || `brána odpovedala ${r.status}`) };
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
