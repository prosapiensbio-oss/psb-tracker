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

const BLINK = "https://api.blink.sv/graphql";

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

async function blink<T>(apiKey: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(BLINK, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": apiKey, accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: T; errors?: unknown[] };
    return j?.errors?.length ? null : (j.data ?? null);
  } catch {
    return null;
  }
}

/** Id bitcoinovej peňaženky účtu — faktúra musí vedieť, kam má prísť. */
export async function btcPenazenka(apiKey: string): Promise<string | null> {
  const d = await blink<{ me?: { defaultAccount?: { wallets?: { id: string; walletCurrency: string }[] } } }>(
    apiKey,
    "query Me { me { defaultAccount { wallets { id walletCurrency } } } }",
    {},
  );
  return d?.me?.defaultAccount?.wallets?.find((w) => w.walletCurrency === "BTC")?.id || null;
}

/**
 * Id peňaženky sa pýta raz za deň, nie pri každom otvorení stránky — je to
 * druhé volanie do Blinku a mení sa raz za nikdy.
 */
export async function penazenkaZKesu(
  DB: import("@cloudflare/workers-types").D1Database, apiKey: string, dnesMs = Date.now(),
): Promise<string | null> {
  const ulozene = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'blink_penazenka'")
    .first<{ value: string }>().catch(() => null);
  if (ulozene?.value) {
    try {
      const k = JSON.parse(ulozene.value) as { id: string; kedy: string };
      if (k?.id && dnesMs - Date.parse(k.kedy) < 24 * 3600_000) return k.id;
    } catch { /* pokazený zápis sa prepíše */ }
  }
  const id = await btcPenazenka(apiKey);
  if (!id) return null;
  await DB.prepare(
    "INSERT INTO vzas_settings (key, value) VALUES ('blink_penazenka', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
  ).bind(JSON.stringify({ id, kedy: new Date(dnesMs).toISOString() })).run().catch(() => null);
  return id;
}

export type Faktura = { bolt11: string; sats: number; platiDo: string };

/**
 * Faktúra na danú sumu v satoshi. `minut` je platnosť — hodina stačí na to,
 * aby klient otvoril peňaženku, a nenechá po sebe QR, ktoré o týždeň nikam
 * nevedie.
 */
export async function vytvorFakturu(
  apiKey: string, penazenka: string, sats: number, popis: string, minut = 60,
): Promise<Faktura | null> {
  const d = await blink<{ lnInvoiceCreate?: { invoice?: { paymentRequest?: string; satoshis?: number }; errors?: { message: string }[] } }>(
    apiKey,
    `mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
       lnInvoiceCreate(input: $input) { invoice { paymentRequest satoshis } errors { message } }
     }`,
    { input: { walletId: penazenka, amount: Math.round(sats), memo: popis.slice(0, 120), expiresIn: minut } },
  );
  const inv = d?.lnInvoiceCreate?.invoice;
  if (!inv?.paymentRequest) return null;
  return {
    bolt11: inv.paymentRequest,
    sats: Number(inv.satoshis) || Math.round(sats),
    platiDo: new Date(Date.now() + minut * 60_000).toISOString(),
  };
}
