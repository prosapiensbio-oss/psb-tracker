/**
 * OVERENIE WEBHOOKU Z RESENDU (Svix). Bez neho by ktokoľvek vedel poslať „tento
 * človek sa odhlásil" alebo vymyslenú odpoveď. Čisté a bez siete, aby sa dalo
 * otestovať na známom podpise.
 *
 * Podpis: HMAC-SHA256 nad `id.timestamp.telo`, kľúč je base64 za `whsec_`.
 * Hlavička môže niesť viac podpisov oddelených medzerou. Starší než 5 minút sa
 * odmieta, aby sa nedal prehrať znova.
 */
const POVOLENY_POSUN_S = 300;

const zBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const doBase64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

export async function vypocitajPodpis(tajomstvo: string, id: string, cas: string, telo: string): Promise<string> {
  const kluc = await crypto.subtle.importKey(
    "raw", zBase64(tajomstvo.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return doBase64(await crypto.subtle.sign("HMAC", kluc, new TextEncoder().encode(`${id}.${cas}.${telo}`)));
}

export async function overPodpis(vstup: {
  tajomstvo: string; id: string | null; cas: string | null; podpisy: string | null; telo: string; terazS?: number;
}): Promise<boolean> {
  const { tajomstvo, id, cas, podpisy, telo } = vstup;
  if (!tajomstvo || !id || !cas || !podpisy) return false;
  const t = Number(cas);
  const teraz = vstup.terazS ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(t) || Math.abs(teraz - t) > POVOLENY_POSUN_S) return false;
  let spravny: string;
  try { spravny = await vypocitajPodpis(tajomstvo, id, cas, telo); } catch { return false; }
  return podpisy.split(" ").some((p) => {
    const v = p.includes(",") ? p.split(",")[1] : p;
    if (v.length !== spravny.length) return false;
    let rozdiel = 0;
    for (let i = 0; i < v.length; i++) rozdiel |= v.charCodeAt(i) ^ spravny.charCodeAt(i);
    return rozdiel === 0;
  });
}

/** „Jana Nová <jana@x.cz>" → meno a adresa malými. */
export function rozoberOdosielatela(v: unknown): { meno: string; email: string } {
  const s = String(v ?? "").trim();
  const m = /^(.*)<([^>]+)>\s*$/.exec(s);
  const email = (m ? m[2] : s).trim().toLowerCase();
  const meno = (m ? m[1] : "").replace(/^["'\s]+|["'\s]+$/g, "");
  return { meno, email };
}

/** Automatická odpoveď nie je človek, čo odpísal. */
export const jeAutomatickaOdpoved = (predmet: unknown) =>
  /^(automatic|auto[- ]?reply|out of office|nepřítomn|nepritomn|automatick|mimo kancelář|dovolená)/i.test(String(predmet ?? "").trim());
