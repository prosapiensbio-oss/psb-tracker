var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var zavolaj = /* @__PURE__ */ __name((env, cesta = "/api/kalendar?cron=1") => env.KOKPIT.fetch(
  // Adresa musí byť SKUTOČNÁ, hoci požiadavka ide prepojením a von nikdy
  // nejde: appka je SSR a na neznámy host odpovedá 404, nie svojou trasou.
  new Request("https://kokpit.prosapiensbio.workers.dev/api/kalendar?cron=1", {
    headers: { "x-cron-token": env.KAL_CRON_TOKEN }
  })
), "zavolaj");
var index_default = {
  async scheduled(event, env, ctx) {
    const jeZaloha = event.cron === "0 2 * * *";
    const cesta = jeZaloha ? "/api/zaloha?cron=1" : "/api/kalendar?cron=1";
    const co = jeZaloha ? "z\xE1loha" : "sn\xEDmka kalend\xE1ra";
    ctx.waitUntil(
      zavolaj(env, cesta).then(
        async (r) => console.log(`${co}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`),
        (e) => console.error(`${co} zlyhala:`, e)
      )
    );
  },
  // Ručné spustenie na overenie, že plánovač na Kokpit naozaj dosiahne.
  // ?co=zaloha spustí zálohu mimo nočného času — aby sa dalo overiť, že beží,
  // bez čakania do druhého rána.
  async fetch(req, env) {
    const co = new URL(req.url).searchParams.get("co");
    const r = await zavolaj(env, co === "zaloha" ? "/api/zaloha?cron=1" : "/api/kalendar?cron=1");
    return new Response(`Kokpit odpovedal ${r.status}: ${(await r.text()).slice(0, 300)}`, {
      status: r.ok ? 200 : 502
    });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
