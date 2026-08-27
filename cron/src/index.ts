/**
 * Plánovač: snímky kalendára a kontrola noviniek v algoritmoch.
 *
 * Vlastný worker, lebo hlavná appka stojí na TanStack Start a jej serverový
 * vstup exportuje len `fetch` — `scheduled` sa doň nedá pridať bez zásahu do
 * generovaného kódu, ktorý by prežil presne jeden build.
 *
 * Na Kokpit sa volá cez SLUŽOBNÉ PREPOJENIE, nie cez verejnú adresu. Worker
 * volajúci `*.workers.dev` iného workera dostane 404 — subrequest sa dovnútra
 * Cloudflare siete takto nedostane. Prepojenie ide priamo, bez cesty von.
 */
type Env = { KOKPIT: Fetcher; KAL_CRON_TOKEN: string };

const zavolaj = (env: Env, cesta = "/api/kalendar?cron=1") =>
  env.KOKPIT.fetch(
    // Adresa musí byť SKUTOČNÁ, hoci požiadavka ide prepojením a von nikdy
    // nejde: appka je SSR a na neznámy host odpovedá 404, nie svojou trasou.
    new Request("https://kokpit.prosapiensbio.workers.dev/api/kalendar?cron=1", {
      headers: { "x-cron-token": env.KAL_CRON_TOKEN },
    }),
  );

/**
 * Novinky v algoritmoch. Beží raz denne, nie dvakrát ako kalendár: oficiálne
 * blogy Googlu a Mety pridávajú pár správ týždenne a častejšie ťahanie by len
 * míňalo požiadavky.
 *
 * Prečo vôbec na pozadí: Jerry to na obrazovke nepotrebuje vidieť, ale Jarvis
 * áno — pri plánovaní obsahu rozhoduje, či algoritmus práve tlačí na uloženia,
 * zdieľania alebo na čas sledovania. Keby sa ťahalo len ručne, plán by sa
 * opieral o pol roka staré pravidlá a nikto by to nezbadal.
 */
const novinky = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/algo?cron=1", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: "{}",
    }),
  );

/**
 * Text vlastného webu — sitemapa a obsah stránok.
 *
 * Prečo to musí bežať samo: do 26. 8. 2026 sa ťahalo len ručne a naposledy
 * bežalo 17. 8. Karta „Čo publikovať ďalej" pritom rozhoduje z `web_stranky`,
 * či o téme stránka EXISTUJE — a keď je tabuľka deväť dní stará, navrhuje
 * napísať niečo, čo už napísané je. To isté platí pre Jarvisa: `web_stranky`
 * je jeho jediný zdroj o tom, čo na webe stojí.
 *
 * Endpoint spracuje 40 stránok na volanie (dlhší request na Cloudflare
 * vyprší), preto sa volá v kole, kým `zostava` nie je nula. Poistka proti
 * nekonečnu: keď kolo neprečíta ani jednu stránku, končí sa — rovnaké
 * pravidlo ako v ručnom tlačidle v Údajoch.
 */
async function textWebu(env: Env): Promise<{ kol: number; nacitane: number; chyba?: string }> {
  let nacitane = 0;
  for (let kolo = 0; kolo < 12; kolo++) {
    const r = await env.KOKPIT.fetch(
      new Request("https://kokpit.prosapiensbio.workers.dev/api/web-obsah?cron=1", {
        method: "POST",
        headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
        body: "{}",
      }),
    );
    if (!r.ok) return { kol: kolo + 1, nacitane, chyba: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const j = (await r.json()) as { error?: string; nacitane?: number; zostava?: number };
    if (j.error) return { kol: kolo + 1, nacitane, chyba: j.error };
    const pribudlo = j.nacitane ?? 0;
    nacitane += pribudlo;
    if (!j.zostava || !pribudlo) return { kol: kolo + 1, nacitane };
  }
  return { kol: 12, nacitane };
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Podľa času spustenia sa rozhodne, čo sa má robiť — jeden worker, tri
    // plány. `cron` je presne ten výraz, ktorý je vo wrangler.jsonc.
    if (event.cron === "30 3 * * *") {
      ctx.waitUntil(
        novinky(env).then(
          async (r) => console.log(`novinky v algoritmoch: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`),
          (e) => console.error("novinky v algoritmoch zlyhali:", e),
        ),
      );
      // Text webu ide v tom istom nočnom behu. Beží PO novinkách a nezávisle:
      // keď jedno spadne, druhé sa aj tak spraví.
      ctx.waitUntil(
        textWebu(env).then(
          (v) => console.log(v.chyba
            ? `text webu ZLYHAL po ${v.kol} kolách (načítaných ${v.nacitane}): ${v.chyba}`
            : `text webu: ${v.nacitane} stránok v ${v.kol} kolách`),
          (e) => console.error("text webu zlyhal:", e),
        ),
      );
      return;
    }
    ctx.waitUntil(
      zavolaj(env).then(
        async (r) => console.log(`snímka kalendára: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`),
        (e) => console.error("snímka kalendára zlyhala:", e),
      ),
    );
  },
  // Ručné spustenie na overenie, že plánovač na Kokpit naozaj dosiahne.
  // `?novinky=1` skúša druhú vetvu bez čakania na 3:30 ráno.
  async fetch(req: Request, env: Env) {
    const q = new URL(req.url).searchParams;
    // `?web=1` skúša načítanie textu webu bez čakania na 3:30 ráno.
    if (q.get("web") === "1") {
      const v = await textWebu(env);
      return new Response(v.chyba
        ? `text webu ZLYHAL po ${v.kol} kolách (načítaných ${v.nacitane}): ${v.chyba}`
        : `text webu: ${v.nacitane} stránok v ${v.kol} kolách`, { status: v.chyba ? 502 : 200 });
    }
    const r = q.get("novinky") === "1" ? await novinky(env) : await zavolaj(env);
    return new Response(`Kokpit odpovedal ${r.status}: ${(await r.text()).slice(0, 300)}`, {
      status: r.ok ? 200 : 502,
    });
  },
};
