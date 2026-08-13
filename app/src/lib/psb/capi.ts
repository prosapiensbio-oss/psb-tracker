/**
 * Udalosť `Lead` pre Meta Conversions API — zo servera, nie z prehliadača.
 *
 * PREČO VÔBEC
 *
 * K 13. 8. 2026 nemal pixel ani jednu funkčnú konverziu. Osem vlastných
 * konverzií: sedem visí na mŕtvom pixeli (posledná udalosť pred 160–407 dňami)
 * a tá jediná na živom — „Objednávka úvodného tréningu" — nedostala za celý čas
 * ANI JEDNU udalosť. Kampaň s cieľom „dopyt" by teda nemala na čo mieriť.
 *
 * PREČO ZO SERVERA A NIE Z PIXELA
 *
 * Pixel na webe je za súhlasom s cookies — kto ho odmietne, ten pre Metu
 * neexistuje. A vlastná konverzia postavená na adrese ďakovnej stránky padne
 * vždy, keď sa adresa zmení alebo ju človek nedočká. Server má dopyt v ruke
 * priamo od formulára: buď prišiel, alebo neprišiel.
 *
 * A hlavne má E-MAIL. Kvalita spárovania pixela bola 5,1/10 — Meta nevedela
 * priradiť návštevy k ľuďom, lebo s nimi nechodil žiadny identifikátor.
 * E-mail je najsilnejší, aký existuje.
 *
 * ČO SA POSIELA A ČO NIE
 *
 * Meta chce osobné údaje ZAHAŠOVANÉ (SHA-256) a inak ich neprijme. Odchádza
 * teda odtlačok e-mailu a telefónu, nie samotný e-mail. Meno sa neposiela
 * vôbec: pri jednom mene na dedinu je odtlačok priezviska bližšie k identite
 * než k štatistike a na spárovanie ho netreba.
 */

const V = "v21.0";

export type LeadUdalost = {
  /** Kľúč dopytu z Kokpitu — slúži aj ako `event_id` na odstránenie duplicít. */
  id: string;
  email: string;
  telefon: string;
  /** Adresa, na ktorej sa formulár odoslal. */
  stranka: string;
  /** `_fbc` a `_fbp` z prehliadača, ak ich web pošle — zdvíhajú spárovanie. */
  fbc?: string;
  fbp?: string;
  ip?: string;
  userAgent?: string;
  /** Sekundy, nie milisekundy — Meta iné neberie. */
  cas?: number;
};

/** SHA-256 v hex podobe. Web Crypto je vo Workers dostupné bez závislosti. */
export async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalizácia pred hašovaním. Meta ju predpisuje a nie je to formalita:
 * „Jan@Novak.CZ " a „jan@novak.cz" dajú iný odtlačok a druhý sa nespáruje.
 */
export const normEmail = (s: string) => s.trim().toLowerCase();

/**
 * Telefón musí ísť v medzinárodnom tvare bez znamienok a medzier. České
 * a slovenské čísla sa píšu na deväť číslic bez predvoľby — tie by Meta
 * nespárovala s ničím, preto sa predvoľba dopĺňa.
 */
export function normTelefon(s: string, predvolba = "420"): string {
  const cif = s.replace(/\D/g, "");
  if (!cif) return "";
  if (cif.startsWith("00")) return cif.slice(2);
  if (cif.length === 9) return predvolba + cif;
  return cif;
}

/** Telo požiadavky. Oddelené od odoslania, aby sa dalo overiť testom. */
export async function telo(u: LeadUdalost, testKod?: string) {
  const user_data: Record<string, unknown> = {};
  if (u.email) user_data.em = [await hash(normEmail(u.email))];
  const tel = normTelefon(u.telefon || "");
  if (tel) user_data.ph = [await hash(tel)];
  // Tieto Meta chce NEZAHAŠOVANÉ — sú to technické údaje, nie osobné.
  if (u.fbc) user_data.fbc = u.fbc;
  if (u.fbp) user_data.fbp = u.fbp;
  if (u.ip) user_data.client_ip_address = u.ip;
  if (u.userAgent) user_data.client_user_agent = u.userAgent;

  return {
    data: [{
      event_name: "Lead",
      event_time: u.cas ?? Math.floor(Date.now() / 1000),
      // Rovnaké `event_id` pri opakovanom odoslaní → Meta si udalosť započíta
      // raz. Chráni to aj pred dvojklikom na tlačidlo vo formulári.
      event_id: u.id,
      action_source: "website",
      ...(u.stranka ? { event_source_url: u.stranka } : {}),
      user_data,
    }],
    ...(testKod ? { test_event_code: testKod } : {}),
  };
}

/**
 * Odoslanie. Chyby sa VRACAJÚ, nehádžu — dopyt už je zapísaný v Kokpite a
 * zlyhanie hlásenia Mete ho nesmie zhodiť. Radšej dopyt bez konverzie než
 * konverzia bez dopytu.
 */
export async function posliLead(
  pixelId: string, token: string, u: LeadUdalost, testKod?: string,
): Promise<{ ok: boolean; chyba?: string }> {
  if (!pixelId || !token) return { ok: false, chyba: "chýba pixel alebo token" };
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await telo(u, testKod)),
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const e = (j.error || {}) as Record<string, unknown>;
      return { ok: false, chyba: String(e.message || `HTTP ${r.status}`).slice(0, 300) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}
