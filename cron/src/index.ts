/**
 * Plánovač snímok kalendára.
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

const zavolaj = (env: Env) =>
  env.KOKPIT.fetch(
    // Adresa musí byť SKUTOČNÁ, hoci požiadavka ide prepojením a von nikdy
    // nejde: appka je SSR a na neznámy host odpovedá 404, nie svojou trasou.
    new Request("https://kokpit.prosapiensbio.workers.dev/api/kalendar?cron=1", {
      headers: { "x-cron-token": env.KAL_CRON_TOKEN },
    }),
  );

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      zavolaj(env).then(
        (r) => console.log(`snímka kalendára: HTTP ${r.status}`),
        (e) => console.error("snímka kalendára zlyhala:", e),
      ),
    );
  },
  // Ručné spustenie na overenie, že plánovač na Kokpit naozaj dosiahne.
  async fetch(_req: Request, env: Env) {
    const r = await zavolaj(env);
    return new Response(`Kokpit odpovedal ${r.status}: ${(await r.text()).slice(0, 300)}`, {
      status: r.ok ? 200 : 502,
    });
  },
};
