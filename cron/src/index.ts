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

const rannePush = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/push-rano", {
      headers: { "x-cron-token": env.KAL_CRON_TOKEN },
    }),
  );

/**
 * Denné stiahnutie reklamných čísel z Meta.
 *
 * Dva dôvody naraz. Prvý je vecný: kampane sa dovtedy sťahovali len ručne,
 * takže čísla v Marketingu boli staré tak, ako dávno naň niekto klikol.
 *
 * Druhý je brána. Meta 20. 8. 2026 zamietla vyšší stupeň prístupu k Marketing
 * API s odôvodnením „nedostatočný počet volaní Ads API za posledných 15 dní" —
 * a bez neho appka nevie boostnúť existujúci príspevok, len vyrobiť jeho kópiu
 * bez lajkov a komentárov. Denné volanie je presne tá integrácia, ktorú Meta
 * žiada vidieť.
 *
 * Dve akcie, nie jedna: `kampane` sú súhrny, `reklamy` jednotlivé kusy.
 * Obe appka aj tak potrebuje.
 */
const metaReklamy = (env: Env, akcia: "kampane" | "reklamy") =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/meta", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ akcia }),
    }),
  );

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

/**
 * Dopyty zo schránky info@prosapiens.cz.
 *
 * Beží v tom istom trojhodinovom pláne ako kalendár, ale VLASTNÝM volaním:
 * IMAP spojenie je I/O, nie procesor, no keby sa prilepilo ku snímke
 * kalendára, jedno zlyhanie by zobralo oboje (29. 8. 2026).
 *
 * Mailom prichádza dopyt, ktorý formulár na webe nezachytí — a práve ten
 * rozhoduje, či cena za dopyt z reklamy vychádza pravdivo.
 */
const mailDopyty = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/mail-dopyty?cron=1", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ akcia: "stiahni" }),
    }),
  );

const push = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/push-beh", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
    }),
  );

/**
 * Nočná kontrola webu (7. 10. 2026).
 *
 * Dva kroky, a práve v tomto poradí: najprv sa pošle SYNTETICKÝ DOPYT na
 * `/api/lead-web` — tou istou cestou, akou chodí skutočný dopyt z WordPressu —
 * a až potom sa jeho kľúč odovzdá kontrole, ktorá overí, že riadok v databáze
 * naozaj vznikol, a zmaže ho.
 *
 * Prečo to posiela plánovač a nie sama appka: worker, ktorý volá sám seba cez
 * verejnú adresu, je zbytočná slučka a na workers.dev končí 404. Plánovač má
 * službové prepojenie, tak to spraví on. Tajomstvo webu pritom nepotrebuje —
 * `/api/lead-web` prijme aj token plánovača, ale vtedy smie zapísať výhradne
 * kontrolný riadok.
 */
const kontrolaWebu = async (env: Env) => {
  const zac = Date.now();
  let dopyt: { ok: boolean; id?: string; detail: string; trvanie: number } = {
    ok: false, detail: "syntetický dopyt sa neodoslal", trvanie: 0,
  };
  try {
    const r = await env.KOKPIT.fetch(
      new Request("https://kokpit.prosapiensbio.workers.dev/api/lead-web", {
        method: "POST",
        headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({
          kontrola: true,
          name: "Nočná kontrola Kokpitu",
          email: "kontrola@prosapiens.cz",
          phone: "000000000",
          message: "Syntetický dopyt nočnej kontroly. Ak toto vidíš v Dopytoch, mazanie zlyhalo.",
          page: "https://www.prosapiens.cz/uvodni-trenink/",
        }),
      }),
    );
    const t = await r.text();
    let j: { ok?: boolean; id?: string } = {};
    try { j = JSON.parse(t) as typeof j; } catch { /* telo sa nedá rozobrať — ukáže sa nižšie */ }
    dopyt = {
      ok: r.ok && !!j.ok && !!j.id,
      id: j.id,
      // Nikdy nehlás len stavový kód: nerozobrané telo je stále stopa.
      detail: r.ok && j.ok ? "" : `HTTP ${r.status}: ${t.slice(0, 200)}`,
      trvanie: Date.now() - zac,
    };
  } catch (e) {
    dopyt = { ok: false, detail: `spojenie zlyhalo: ${String(e).slice(0, 200)}`, trvanie: Date.now() - zac };
  }
  return env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/web-kontrola?cron=1", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ dopyt }),
    }),
  );
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Ranná dávka notifikácií na telefón. 5:10 UTC = 7:10 u nás v lete,
    // 6:10 v zime — teda vtedy, keď človek berie telefón do ruky, nie keď
    // ešte spí. Beží PRED snímkou kalendára z toho istého behu by sa nezmestila
    // do jednej požiadavky (limit CPU, 29. 8.), preto vlastný plán.
    if (event.cron === "30 4 * * *") {  // 06:30 lokál — ranná dávka
      ctx.waitUntil(
        rannePush(env).then(
          async (r) => console.log(`ranné push: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`),
          (e) => console.error("ranné push zlyhalo:", e),
        ),
      );
      return;
    }
    // Podľa času spustenia sa rozhodne, čo sa má robiť — jeden worker, tri
    // plány. `cron` je presne ten výraz, ktorý je vo wrangler.jsonc.
    // Reklamy sa sťahujú ráno o 4:20 UTC, mimo ostatných behov — každý ťažký
    // dopyt patrí do vlastnej požiadavky (limit CPU, 29. 8. 2026).
    if (event.cron === "20 4 * * *") {
      ctx.waitUntil((async () => {
        for (const akcia of ["kampane", "reklamy"] as const) {
          try {
            const r = await metaReklamy(env, akcia);
            console.log(`meta ${akcia}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
          } catch (e) {
            console.error(`meta ${akcia} zlyhalo:`, e);
          }
        }
      })());
      return;
    }
    // Kontrola webu beží o 3:50 UTC, teda PRED nočným sťahovaním textu webu
    // aj pred rannou dávkou push. Keď sa formulár cez deň pokazí, Jerry sa to
    // dozvie ráno — nie o dva týždne, ako pri teste postury (23. 9. – 7. 10.).
    if (event.cron === "50 3 * * *") {
      ctx.waitUntil(
        kontrolaWebu(env).then(
          async (r) => console.log(`kontrola webu: HTTP ${r.status} ${(await r.text()).slice(0, 400)}`),
          (e) => console.error("kontrola webu zlyhala:", e),
        ),
      );
      return;
    }
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
    // Notifikácie na telefón. Zámerne VLASTNÉ volanie, nie prílepok ku snímke
    // kalendára: 29. 8. 2026 pridaná práca v jednom endpointe prekročila limit
    // CPU a appka vracala 503 na všetko. Keď spadne toto, spadne len toto.
    ctx.waitUntil(
      push(env).then(
        async (r) => console.log(`push na telefón: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`),
        (e) => console.error("push na telefón zlyhal:", e),
      ),
    );
    // Schránka. Tiež vlastné volanie — keď je poštový server nedostupný,
    // nesmie to zhodiť ani kalendár, ani notifikácie.
    ctx.waitUntil(
      mailDopyty(env).then(
        async (r) => console.log(`dopyty z mailu: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`),
        (e) => console.error("dopyty z mailu zlyhali:", e),
      ),
    );
  },
  // Ručné spustenie na overenie, že plánovač na Kokpit naozaj dosiahne.
  // `?novinky=1` skúša druhú vetvu bez čakania na 3:30 ráno.
  async fetch(req: Request, env: Env) {
    const q = new URL(req.url).searchParams;
    // `?kontrola=1` spustí nočnú kontrolu webu hneď.
    if (q.get("kontrola") === "1") {
      const r = await kontrolaWebu(env);
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
    }
    // `?web=1` skúša načítanie textu webu bez čakania na 3:30 ráno.
    // `?push=1` pošle rannú dávku hneď — inak by sa overovalo až zajtra ráno.
    // `?meta=1` spustí sťahovanie reklám hneď — na overenie bez čakania na ráno.
    if (q.get("meta") === "1") {
      const out: string[] = [];
      for (const akcia of ["kampane", "reklamy"] as const) {
        const r = await metaReklamy(env, akcia);
        out.push(`${akcia}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
      return new Response(out.join("\n"), { status: 200 });
    }
    if (q.get("push") === "1") {
      const r = await rannePush(env);
      return new Response(`Push: ${r.status} ${(await r.text()).slice(0, 400)}`, { status: r.ok ? 200 : 502 });
    }
    if (q.get("web") === "1") {
      const v = await textWebu(env);
      return new Response(v.chyba
        ? `text webu ZLYHAL po ${v.kol} kolách (načítaných ${v.nacitane}): ${v.chyba}`
        : `text webu: ${v.nacitane} stránok v ${v.kol} kolách`, { status: v.chyba ? 502 : 200 });
    }
    // `?push=1` skúša notifikácie bez čakania na celú hodinu.
    if (q.get("push") === "1") {
      const r = await push(env);
      return new Response(`push: ${r.status} ${(await r.text()).slice(0, 400)}`, { status: r.ok ? 200 : 502 });
    }
    // `?mail=1` prečíta schránku hneď — na overenie bez čakania na celú hodinu.
    if (q.get("mail") === "1") {
      const r = await mailDopyty(env);
      return new Response(`dopyty z mailu: ${r.status} ${(await r.text()).slice(0, 600)}`, { status: r.ok ? 200 : 502 });
    }
    const r = q.get("novinky") === "1" ? await novinky(env) : await zavolaj(env);
    return new Response(`Kokpit odpovedal ${r.status}: ${(await r.text()).slice(0, 300)}`, {
      status: r.ok ? 200 : 502,
    });
  },
};
