/**
 * ZÁPIS DO GOOGLE KALENDÁRA — SERVISNÝ ÚČET.
 *
 * Jerry, 29. 9. 2026: „je možné nahadzovať tréningy priamo v Google
 * kalendári z Kokpitu?" Čítanie ostáva na tajnej iCal adrese (snímky);
 * zápis ide cez Calendar API v mene servisného účtu
 * kokpit-kalendar@evident-catcher-510117-k6.iam.gserviceaccount.com,
 * ktorému tréner svoj kalendár zdieľal s právom „robiť zmeny".
 *
 * Kľúč účtu je secret `GCAL_SA_KLUC` (celý JSON z Google Cloud) — zaobchádza
 * sa s ním ako s heslom schránky: nikdy sa neloguje ani neposiela von.
 *
 * Prístupový token sa drží v pamäti izolátu do vypršania; Worker ich má
 * viac, takže občas sa vypýta nový — to je v poriadku, výmena JWT→token
 * je jedno volanie.
 */

type SaKluc = { client_email: string; private_key: string };

let cache: { token: string; do_: number } | null = null;

const b64url = (data: ArrayBuffer | string): string => {
  const s = typeof data === "string" ? data : String.fromCharCode(...new Uint8Array(data));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function pristupovyToken(klucJson: string): Promise<string> {
  if (cache && cache.do_ > Date.now() + 60_000) return cache.token;
  const k = JSON.parse(klucJson) as SaKluc;
  const teraz = Math.floor(Date.now() / 1000);
  const hlava = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const telo = b64url(JSON.stringify({
    iss: k.client_email,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: teraz,
    exp: teraz + 3600,
  }));
  const pem = k.private_key.replace(/-----[A-Z ]+-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const kl = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const podpis = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kl, new TextEncoder().encode(`${hlava}.${telo}`));
  const jwt = `${hlava}.${telo}.${b64url(podpis)}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const j = await r.json() as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`token: ${j.error_description || j.error || r.status}`);
  cache = { token: j.access_token, do_: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.token;
}

export type NovaUdalost = {
  /** Kalendár = adresa trénera (jerrystranavsky@gmail.com / teres.zat@gmail.com). */
  kalendar: string;
  nazov: string;
  /** Pražský čas bez zóny: `2026-10-02T10:00`. */
  zaciatok: string;
  koniec: string;
};

/** Vráti id udalosti (bez @google.com). Chybu hádže — volajúci ju má ukázať. */
export async function vlozUdalost(klucJson: string, u: NovaUdalost): Promise<string> {
  const token = await pristupovyToken(klucJson);
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(u.kalendar)}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: u.nazov,
      start: { dateTime: `${u.zaciatok}:00`, timeZone: "Europe/Prague" },
      end: { dateTime: `${u.koniec}:00`, timeZone: "Europe/Prague" },
    }),
  });
  const j = await r.json() as { id?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(j.error?.message || `kalendár odpovedal ${r.status}`);
  return j.id;
}

export async function zrusUdalost(klucJson: string, kalendar: string, id: string): Promise<void> {
  const token = await pristupovyToken(klucJson);
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(kalendar)}/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  // 410 = už zmazaná — cieľ je splnený.
  if (!r.ok && r.status !== 410) {
    const j = await r.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message || `kalendár odpovedal ${r.status}`);
  }
}
