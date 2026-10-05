import { CENNIK } from "./cennik";
import { nazovProduktu } from "./nazvyProduktov";

/**
 * PLATBA BITCOINOM — faktúra na Lightning namiesto QR na bankový účet.
 *
 * Jerry, 5. 10. 2026: „mám časť klientov, ktorí platia v BTC — vedeli by sme
 * im namiesto QR platby na bankový účet generovať QR na LN adresu? Zaujíma
 * ma, či sa dá suma predvyplniť, aby to fungovalo ako LN invoice."
 *
 * Dá sa, ale len cez BLINK. Muun je nekustodiálna, nemá API ani Lightning
 * Address — faktúru v nej treba vyklikať v telefóne. Blink má verejné API
 * (`api.blink.sv/graphql`, hlavička `X-API-KEY`) a mutáciu `lnInvoiceCreate`,
 * ktorej sa povie suma v satoshi, popis a platnosť.
 *
 * FAKTÚRA SA VYRÁBA AŽ PRI OTVORENÍ STRÁNKY. Lightningová faktúra má
 * platnosť (tu hodinu) a po nej je mŕtva — vyrobiť ju dopredu a nechať ležať
 * by znamenalo QR, ktoré klientovi nezaplatí. Stránka sa skladá na serveri
 * pri každom otvorení, takže každé otvorenie dostane čerstvú.
 *
 * Keď Blink neodpovie, zostáva statická Lightning Address — tá nevyprší,
 * len si do nej klient sumu prepíše sám.
 */

/** Statická adresa na príjem; nevyprší, ale sumu si klient zadá sám. */
export const LIGHTNING_ADRESA = "prosapiens_bio@blink.sv";



/**
 * KATALÓGOVÁ CENA PRODUKTU — tá, z ktorej sa zľava počíta.
 *
 * Jerry, 5. 10. 2026: „prečo 19 089? Malo by to byť 21 150 Kč · sleva 5 %."
 * Mal pravdu a je to dôležitý rozdiel: v PTminderi je u bitcoinového klienta
 * zapísaná cena, ktorú NAOZAJ zaplatil — teda už po zľave (Gažo 20 092,50 Kč
 * = 21 150 − 5 %). Keď sa z nej odpočíta znova, zľava sa dá dvakrát.
 *
 * Preto sa základ berie z CENNÍKA podľa názvu produktu. Keď taký produkt
 * v cenníku nie je (staré členstvá, jednorazovky), zľava sa NEUPLATŇUJE —
 * lepšie je nedať ju, než ju dať druhý raz.
 */
export function katalogovaCena(nazov: string): number | null {
  const kluc = nazovProduktu(nazov || "").toLowerCase();
  if (!kluc) return null;
  const r = CENNIK.find((x) => x.nazov.toLowerCase() === kluc);
  return r?.cena && r.cena > 0 ? r.cena : null;
}

/** Cena po zľave, zaokrúhlená na celé koruny nahor (zľava je v percentách). */
export function cenaPoZlave(czk: number, zlava?: number | null): number {
  const z = Math.max(0, Math.min(100, Number(zlava) || 0));
  return z ? Math.ceil(czk * (1 - z / 100)) : Math.round(czk);
}

/**
 * Koruny na satoshi. Zaokrúhľuje sa NAHOR — nižšia suma by znamenala, že
 * klient zaplatil menej, než mal, a rozdiel by nikto nevidel.
 */
export function satsZaCzk(czk: number, kurzCzkZaBtc: number): number | null {
  if (!(kurzCzkZaBtc > 0) || !(czk > 0)) return null;
  return Math.ceil((czk / kurzCzkZaBtc) * 100_000_000);
}

/** „73 450" — satoshi sa píšu po tisícoch, inak sa nedajú prečítať. */
export const satsText = (s: number) => String(Math.round(s)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

type Kurz = { czkZaBtc: number; kedy: string };

/**
 * KURZ Z VEREJNÉHO ZDROJA, SCHOVANÝ NA DESAŤ MINÚT.
 *
 * Z bitcoinovej appky sa vziať nedá — volanie worker→worker vnútri platformy
 * padá na timeout (viď `api/btc-reserve`). CoinGecko vracia CZK priamo.
 * Bez kešu by sa volalo pri každom otvorení stránky a brána by nás odstrihla.
 */
export async function kurzBtc(
  DB: import("@cloudflare/workers-types").D1Database,
  dnesMs = Date.now(),
): Promise<Kurz | null> {
  const ulozeny = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'btc_kurz'")
    .first<{ value: string }>().catch(() => null);
  if (ulozeny?.value) {
    try {
      const k = JSON.parse(ulozeny.value) as Kurz;
      if (k?.czkZaBtc > 0 && dnesMs - Date.parse(k.kedy) < 10 * 60_000) return k;
    } catch { /* pokazený zápis sa prepíše novým */ }
  }
  /**
   * TRI ZDROJE, NIE JEDEN.
   *
   * CoinGecko na voľnom pláne obmedzuje podľa IP a Cloudflare chodí von
   * zdieľanými adresami — z Workera sa tak dá ľahko naraziť na odmietnutie,
   * hoci z notebooku to ide. Keď prvý zdroj mlčí, skúsi sa ďalší; kurz je
   * číslo, bez ktorého sa platba bitcoinom nedá ukázať vôbec.
   */
  const zdroje: { url: string; vyber: (j: unknown) => number }[] = [
    {
      url: "https://api.coinbase.com/v2/exchange-rates?currency=BTC",
      vyber: (j) => Number((j as { data?: { rates?: { CZK?: string } } })?.data?.rates?.CZK) || 0,
    },
    {
      url: "https://blockchain.info/ticker",
      vyber: (j) => Number((j as { CZK?: { last?: number } })?.CZK?.last) || 0,
    },
    {
      url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=czk",
      vyber: (j) => Number((j as { bitcoin?: { czk?: number } })?.bitcoin?.czk) || 0,
    },
  ];
  try {
    let czkZaBtc = 0;
    for (const z of zdroje) {
      const r = await fetch(z.url, {
        headers: { accept: "application/json", "user-agent": "Kokpit/1.0 (ProSapiens Biomechanic)" },
      }).catch(() => null);
      if (!r?.ok) continue;
      const j = await r.json().catch(() => null);
      czkZaBtc = z.vyber(j);
      if (czkZaBtc > 0) break;
    }
    if (!(czkZaBtc > 0)) return null;
    const kurz: Kurz = { czkZaBtc, kedy: new Date(dnesMs).toISOString() };
    await DB.prepare(
      "INSERT INTO vzas_settings (key, value) VALUES ('btc_kurz', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
    ).bind(JSON.stringify(kurz)).run().catch(() => null);
    return kurz;
  } catch {
    return null;
  }
}

/**
 * FAKTÚRA PRIAMO Z LIGHTNING ADRESY — bez kľúča, bez účtu, bez tajomstva.
 *
 * Jerry sa 5. 10. 2026 nevedel prihlásiť do Blink dashboardu (overovací kód
 * z mailu nikdy neprišiel), takže API kľúč nebol. Ukázalo sa, že ho netreba:
 * Lightning Address JE verejné LNURL-pay rozhranie a na faktúru s presnou
 * sumou stačia dva dotazy, ktoré smie spraviť ktokoľvek:
 *
 *   1. `https://<doména>/.well-known/lnurlp/<meno>` → `callback`
 *   2. `callback?amount=<milisatoshi>` → `{ "pr": "lnbc…" }`
 *
 * Je to štandard (LUD-06/16), nie vlastnosť Blinku — keď Jerry raz prejde
 * k inej peňaženke, stačí vymeniť adresu. Pozor na jednotku: suma sa posiela
 * v MILISATOSHI, nie v satoshi; so stonásobkom brána odpovie „amount out of
 * range" a stránka zostane bez QR.
 *
 * Odpoveď nesie aj `verify` — odkaz, cez ktorý sa dá neskôr zistiť, či bola
 * faktúra zaplatená. Zatiaľ sa len odkladá.
 */
type LnurlPay = { callback?: string; minSendable?: number; maxSendable?: number; commentAllowed?: number };

async function lnurlPay(adresa: string): Promise<LnurlPay | null> {
  const [meno, domena] = adresa.split("@");
  if (!meno || !domena) return null;
  try {
    const r = await fetch(`https://${domena}/.well-known/lnurlp/${encodeURIComponent(meno)}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as LnurlPay;
    return j?.callback ? j : null;
  } catch {
    return null;
  }
}

export type Faktura = { bolt11: string; sats: number; overit?: string };

/**
 * Faktúra na presnú sumu. `komentar` sa posiela, keď ho adresa dovolí —
 * v peňaženke tak pri platbe stojí meno klienta a nemusí sa hádať zo sumy.
 */
export async function vytvorFakturu(
  adresa: string, sats: number, komentar = "",
): Promise<Faktura | null> {
  const p = await lnurlPay(adresa);
  if (!p?.callback) return null;
  const msat = Math.round(sats) * 1000;
  if ((p.minSendable && msat < p.minSendable) || (p.maxSendable && msat > p.maxSendable)) return null;
  try {
    const url = new URL(p.callback);
    url.searchParams.set("amount", String(msat));
    if (p.commentAllowed && komentar) url.searchParams.set("comment", komentar.slice(0, p.commentAllowed));
    const r = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { pr?: string; verify?: string };
    return j?.pr ? { bolt11: j.pr, sats: Math.round(sats), overit: j.verify } : null;
  } catch {
    return null;
  }
}
