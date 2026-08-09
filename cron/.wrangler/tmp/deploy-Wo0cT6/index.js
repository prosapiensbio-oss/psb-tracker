var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var zavolaj = /* @__PURE__ */ __name((env) => env.KOKPIT.fetch(
  // Adresa musí byť SKUTOČNÁ, hoci požiadavka ide prepojením a von nikdy
  // nejde: appka je SSR a na neznámy host odpovedá 404, nie svojou trasou.
  new Request("https://kokpit.prosapiensbio.workers.dev/api/kalendar?cron=1", {
    headers: { "x-cron-token": env.KAL_CRON_TOKEN }
  })
), "zavolaj");
var index_default = {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      zavolaj(env).then(
        (r) => console.log(`sn\xEDmka kalend\xE1ra: HTTP ${r.status}`),
        (e) => console.error("sn\xEDmka kalend\xE1ra zlyhala:", e)
      )
    );
  },
  // Ručné spustenie na overenie, že plánovač na Kokpit naozaj dosiahne.
  async fetch(_req, env) {
    const r = await zavolaj(env);
    return new Response(`Kokpit odpovedal ${r.status}: ${(await r.text()).slice(0, 300)}`, {
      status: r.ok ? 200 : 502
    });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
