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

/**
 * Id, na ktorom sa smie operovať. Jerryho tréningy sú v Googli často
 * OPAKOVANÉ SÉRIE — DELETE či PATCH na id série by zmazal alebo posunul
 * VŠETKY výskyty naraz. Séria preto vracia id jedného výskytu, nájdeného
 * podľa aktuálneho začiatku v pražskom čase.
 */
export async function idPreZasah(klucJson: string, kalendar: string, googleId: string, zaciatok: string): Promise<{ id: string; seria: boolean }> {
  const token = await pristupovyToken(klucJson);
  const zakl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(kalendar)}/events`;
  const r = await fetch(`${zakl}/${encodeURIComponent(googleId)}`, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json() as { recurrence?: unknown; status?: string; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message || `kalendár odpovedal ${r.status}`);
  // PATCH na zrušenú udalosť Google ticho prijme (200) a nič neoživí —
  // presun by sa tváril hotový nad hrobom. Stalo sa 29. 9. 2026 pri teste.
  if (j.status === "cancelled") throw new Error("udalosť je v Googli už zrušená — stiahni kalendár, nech to vidí aj Kokpit");
  if (!j.recurrence) return { id: googleId, seria: false };

  // Okno deň pred a dva dni po začiatku — posun časového pásma nič neodreže.
  const d = new Date(`${zaciatok.slice(0, 10)}T00:00:00Z`);
  const min = new Date(d.getTime() - 86400000).toISOString();
  const max = new Date(d.getTime() + 2 * 86400000).toISOString();
  const ri = await fetch(`${zakl}/${encodeURIComponent(googleId)}/instances?timeZone=Europe%2FPrague&timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&maxResults=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const ji = await ri.json() as { items?: { id: string; start?: { dateTime?: string } }[]; error?: { message?: string } };
  if (!ri.ok) throw new Error(ji.error?.message || `kalendár odpovedal ${ri.status}`);
  const vyskyt = (ji.items || []).find((i) => (i.start?.dateTime || "").slice(0, 16) === zaciatok);
  if (!vyskyt) throw new Error("výskyt opakovanej udalosti sa v Googli nenašiel — stiahni kalendár a skús znova");
  return { id: vyskyt.id, seria: true };
}

/** Presunie udalosť na iný čas — PATCH mení len začiatok a koniec, názov zostáva. */
export async function presunUdalost(klucJson: string, kalendar: string, id: string, zaciatok: string, koniec: string): Promise<void> {
  const token = await pristupovyToken(klucJson);
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(kalendar)}/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      start: { dateTime: `${zaciatok}:00`, timeZone: "Europe/Prague" },
      end: { dateTime: `${koniec}:00`, timeZone: "Europe/Prague" },
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message || `kalendár odpovedal ${r.status}`);
  }
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
