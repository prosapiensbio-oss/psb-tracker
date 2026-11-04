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
import { rovnakyToken } from "../../app/src/lib/psb/cronToken.server";
import { jeCasRannejDavky } from "../../app/src/lib/psb/tichyCas";
import { vyhodnotBeh } from "../../app/src/lib/psb/vysledokBehu";

type Env = { KOKPIT: Fetcher; KAL_CRON_TOKEN: string };

const rannePush = (env: Env, vynutit = false) =>
  env.KOKPIT.fetch(
    new Request(`https://kokpit.prosapiensbio.workers.dev/api/push-rano${vynutit ? "?vynutit=1" : ""}`, {
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
const metaReklamy = (env: Env, akcia: "kampane" | "reklamy" | "dozor") =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/meta", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ akcia }),
    }),
  );

/**
 * Pohyby z banky (14. 10. 2026). Dovtedy sa výdavky sťahovali len tlačidlom
 * a P&L bežiaceho mesiaca mal tržby bez nákladov. Appka stiahne posledných
 * 35 dní a zapíše nové pohyby nepotvrdené — potvrdzuje ich Jerry v Banke.
 */
// Bitcoin: spýta sa Blinku na zaplatené faktúry a obnoví kurz v knihe. Faktúra platí
// hodinu, tak častejšie než banka. Do platieb nič nezapisuje, tie potvrdzuje človek.
const btcSledovanie = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/btc-sledovanie", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
    }),
  );

const fioBanka = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/fio", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ akcia: "auto" }),
    }),
  );

/**
 * Automatické balíčky (1. 11. 2026). Dovtedy vznikali len pri otvorení appky,
 * takže klient bez balíčka čakal, kým niekto otvorí Kokpit. Beží raz denne po
 * banke, vlastným spúšťačom: je to tá istá práca, akú robí prehliadač, a ťažká
 * práca patrí do vlastnej požiadavky (limit CPU, 29. 8. 2026). Stav zapisuje
 * `ohlas` do automaty; opakovať je to bezpečné (index z migrácie 0130).
 */
const automatickeBalicky = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/balicky?cron=1", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ akcia: "automaticky" }),
    }),
  );

const zavolaj = (env: Env, cesta = "/api/kalendar?cron=1") =>
  env.KOKPIT.fetch(
    // Adresa musí byť SKUTOČNÁ, hoci požiadavka ide prepojením a von nikdy
    // nejde: appka je SSR a na neznámy host odpovedá 404, nie svojou trasou.
    new Request(`https://kokpit.prosapiensbio.workers.dev${cesta}`, {
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

// Strážca výberov pre Peniaze manažér — po stiahnutí banky (4:10) a rannej dávke.
// O 6:45 UTC (7:45 v zime, 8:45 v lete): môže poslať notifikáciu a nesmie budiť.
const strazcaVyberu = (env: Env) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/strazca-vyberu", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
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
const kontrolaWebu = async (env: Env, cast: "formulare" | "stranky" | "meranie" | "reklamy" = "formulare") => {
  const zac = Date.now();
  let dopyt: { ok: boolean; id?: string; detail: string; trvanie: number } | undefined;
  // Dopyt sa posiela LEN s časťou „formulare" — je to kontrola tej istej
  // cesty. Pri ostatných častiach by to bol zbytočný zápis a mazanie.
  if (cast === "formulare") {
  dopyt = { ok: false, detail: "syntetický dopyt sa neodoslal", trvanie: 0 };
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
  }
  return env.KOKPIT.fetch(
    new Request(`https://kokpit.prosapiensbio.workers.dev/api/web-kontrola?cron=1&cast=${cast}`, {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify(dopyt ? { dopyt } : {}),
    }),
  );
};

/**
 * Metricool každú noc (Jerry, 8. 10. 2026: „áno, nastav to každú noc").
 * Kokpit drží prístup do Metricoolu sám (MCP, bez plánu Advanced), takže
 * plánovač len povie „stiahni". Bežiaci mesiac každú noc; prvý týždeň mesiaca
 * aj ten predošlý, aby uzávierka dostala úplné čísla. Každý mesiac je vlastná
 * požiadavka — jedna je ~10 krátkych dopytov na Metricool.
 */
const metricoolMesiac = (env: Env, mesiac: string) =>
  env.KOKPIT.fetch(
    new Request("https://kokpit.prosapiensbio.workers.dev/api/metricool", {
      method: "POST",
      headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ akcia: "stiahni", mesiac }),
    }),
  );

/** Mesiac v Prahe (RRRR-MM), s posunom o n mesiacov. */
const mesiacPraha = (n = 0) => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Prague" }));
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const denPraha = () => Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Prague", day: "numeric" }));

/**
 * OHLÁSENIE BEHU — do konzoly aj do databázy.
 *
 * Jerry, 10. 10. 2026: „kontrolu si predstavujem ako kontrolu appky — či
 * všetko funguje." Pri hľadaní, z čoho ju postaviť, vyšlo najavo, že z
 * desiatich automatov si stav zapisovali DVA (kalendár a pošta). Ostatné
 * písali len do konzoly workera, kam sa z appky nedá pozrieť — mohli mlčky
 * nebežať týždne.
 *
 * Zapisuje sa KAŽDÝ pokus, nielen úspech: chýbajúci riadok potom znamená
 * „nespustilo sa", čo je iná porucha než „spustilo sa a spadlo". Samotný
 * zápis nesmie zhodiť automat, preto je celý v catch.
 */
const zapisBeh = async (env: Env, automat: string, ok: boolean, detail: string, chyba?: string) => {
  try {
    await env.KOKPIT.fetch(
      new Request("https://kokpit.prosapiensbio.workers.dev/api/automat-beh", {
        method: "POST",
        headers: { "x-cron-token": env.KAL_CRON_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({ automat, ok, detail: detail.slice(0, 200), chyba: (chyba || "").slice(0, 200) }),
      }),
    );
  } catch { /* stav behu nie je dôležitejší než samotný beh */ }
};

/**
 * Obalí volanie automatu: zapíše výsledok a nechá správu aj v konzole.
 *
 * Úspech nie je len HTTP 200 — rozhoduje `vyhodnotBeh` (čistá funkcia
 * s testami v appke). Zámerne preskočený beh (mimo okna, tichý čas) sa
 * nezapisuje: ako ok=1 by do hodín zakryl chybu z ostrého behu.
 */
const ohlas = (env: Env, automat: string, p: Promise<Response>): Promise<void> =>
  p.then(
    async (r) => {
      const celok = await r.text();
      const t = celok.slice(0, 300);
      const v = vyhodnotBeh(r.status, celok);
      if (!v.preskocene) await zapisBeh(env, automat, v.ok, t, v.chyba);
      console.log(`${automat}: HTTP ${r.status}${v.ok ? "" : " ZLYHAL"}${v.preskocene ? " (preskočené)" : ""} ${t}`);
    },
    async (e) => {
      await zapisBeh(env, automat, false, "", String(e).slice(0, 200));
      console.error(`${automat} zlyhal:`, e);
    },
  );

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Dobeh kalendára: každú hodinu znova len ten, čo naposledy zlyhal —
    // Google odmieta adresy Cloudflaru aj hodiny (HTTP 429, 20. 10. 2026).
    // Nočná práca (3:30–5:30 UTC) má minúty obsadené, a dva behy v tej istej
    // minúte sú presne to, čo 29. 8. 2026 zhodilo workera. Dobeh tam preto ide
    // v dvoch voľných oknách — 3:15 a 5:00 — namiesto xx:30.
    if (event.cron === "30 0-2,6-23 * * *" || event.cron === "15 3 * * *" || event.cron === "0 5 * * *") {
      ctx.waitUntil(ohlas(env, "kalendar", zavolaj(env, "/api/kalendar?cron=1&dobeh=1")));
      return;
    }
    if (event.cron === "40 4 * * *") {  // 06:40 v lete, 05:40 v zime — po kontrole webu a reklamách
      ctx.waitUntil((async () => {
        const mesiace = denPraha() <= 7 ? [mesiacPraha(-1), mesiacPraha()] : [mesiacPraha()];
        for (const m of mesiace) {
          try {
            await ohlas(env, "metricool", metricoolMesiac(env, m));
          } catch (e) {
            console.error(`metricool ${m} zlyhal:`, e);
          }
        }
      })());
      return;
    }
    // Banka PRED rannou dávkou, aby notifikácie ráno nehlásili „výdavky
    // chýbajú" nad stavom zo včera. Vlastný spúšťač — ťažká práca patrí do
    // vlastnej požiadavky (limit CPU, 29. 8. 2026).
    if (event.cron === "7,37 * * * *") {
      ctx.waitUntil(ohlas(env, "btc-sledovanie", btcSledovanie(env)));
      return;
    }
    if (event.cron === "10 4 * * *") {  // 06:10 v lete, 05:10 v zime
      ctx.waitUntil(ohlas(env, "fio-banka", fioBanka(env)));
      return;
    }
    if (event.cron === "15 4 * * *") {  // po banke (4:10), pred rannou dávkou
      ctx.waitUntil(ohlas(env, "balicky-automaticky", automatickeBalicky(env)));
      return;
    }
    if (event.cron === "45 6 * * *") {  // 08:45 v lete, 07:45 v zime — po banke a rannej dávke
      ctx.waitUntil(ohlas(env, "strazca-vyberu", strazcaVyberu(env)));
      return;
    }
    // Ranná dávka: 6:30 v Prahe celý rok. Cron pásmo nepozná, tak sú spúšťače
    // dva (4:30 = 6:30 v lete, 5:30 = 6:30 v zime) a pustí sa ten, čo padol do
    // pražskej hodiny 6. Oba sú po banke (4:10) a reklamách (4:20).
    if (event.cron === "30 4 * * *" || event.cron === "30 5 * * *") {
      if (!jeCasRannejDavky(new Date(event.scheduledTime))) return;
      ctx.waitUntil(
        ohlas(env, "ranne-push", rannePush(env)),
      );
      return;
    }
    // Podľa času spustenia sa rozhodne, čo sa má robiť — jeden worker, tri
    // plány. `cron` je presne ten výraz, ktorý je vo wrangler.jsonc.
    // Reklamy sa sťahujú ráno o 4:20 UTC, mimo ostatných behov — každý ťažký
    // dopyt patrí do vlastnej požiadavky (limit CPU, 29. 8. 2026).
    if (event.cron === "20 4 * * *") {
      ctx.waitUntil((async () => {
        // `dozor` (10. 10. 2026): bežiace kampane, dni a problémy pre
        // notifikácie dozoru — pred rannou dávkou o 4:30, aby čísla v nej
        // boli z rána, nie zo včera.
        for (const akcia of ["kampane", "reklamy", "dozor"] as const) {
          try {
            await ohlas(env, `meta-${akcia}`, metaReklamy(env, akcia));
          } catch (e) {
            console.error(`meta ${akcia} zlyhalo:`, e);
          }
        }
      })());
      return;
    }
    // Kontrola webu — ŠTYRI ČASTI, ŠTYRI BEHY, päť minút od seba.
    //
    // Dokopy je to ~15 podžiadostí a desiatky zápisov; v jednom volaní je to
    // presne ten tvar práce, ktorý 29. 8. 2026 zabil workera na limite CPU
    // a Kokpit vracal 503 na všetko. Každá časť má preto vlastný spúšťač.
    // Všetky bežia PRED rannou dávkou push, takže čo sa v noci pokazí, je
    // ráno v registri.
    {
      const casti: Record<string, "formulare" | "stranky" | "meranie" | "reklamy"> = {
        "50 3 * * *": "formulare",
        "55 3 * * *": "stranky",
        "0 4 * * *": "meranie",
        "5 4 * * *": "reklamy",
      };
      const cast = casti[event.cron];
      if (cast) {
        ctx.waitUntil(
          ohlas(env, `kontrola-webu-${cast}`, kontrolaWebu(env, cast)),
        );
        return;
      }
    }
    if (event.cron === "30 3 * * *") {
      ctx.waitUntil(
        ohlas(env, "novinky-algoritmy", novinky(env)),
      );
      // Text webu ide v tom istom nočnom behu. Beží PO novinkách a nezávisle:
      // keď jedno spadne, druhé sa aj tak spraví.
      ctx.waitUntil(
        textWebu(env).then(
          async (v) => {
            await zapisBeh(env, "text-webu", !v.chyba, `${v.nacitane} stránok v ${v.kol} kolách`, v.chyba ? String(v.chyba) : undefined);
            console.log(v.chyba
              ? `text webu ZLYHAL po ${v.kol} kolách (načítaných ${v.nacitane}): ${v.chyba}`
              : `text webu: ${v.nacitane} stránok v ${v.kol} kolách`);
          },
          async (e) => { await zapisBeh(env, "text-webu", false, "", String(e).slice(0, 200)); console.error("text webu zlyhal:", e); },
        ),
      );
      return;
    }
    ctx.waitUntil(
      ohlas(env, "kalendar", zavolaj(env)),
    );
    // Notifikácie na telefón. Zámerne VLASTNÉ volanie, nie prílepok ku snímke
    // kalendára: 29. 8. 2026 pridaná práca v jednom endpointe prekročila limit
    // CPU a appka vracala 503 na všetko. Keď spadne toto, spadne len toto.
    ctx.waitUntil(
      ohlas(env, "push", push(env)),
    );
    // Schránka. Tiež vlastné volanie — keď je poštový server nedostupný,
    // nesmie to zhodiť ani kalendár, ani notifikácie.
    ctx.waitUntil(
      ohlas(env, "mail-dopyty", mailDopyty(env)),
    );
  },
  // Ručné spustenie na overenie, že plánovač na Kokpit naozaj dosiahne.
  // `?novinky=1` skúša druhú vetvu bez čakania na 3:30 ráno.
  //
  // Každá vetva tu niečo spúšťa (banka, syntetický dopyt, notifikácie), preto
  // bez tokenu nič: do 1. 11. 2026 to vedel ktokoľvek s adresou. Verejná adresa
  // je navyše vypnutá (`workers_dev: false`), toto je druhá poistka.
  async fetch(req: Request, env: Env) {
    if (!env.KAL_CRON_TOKEN || !rovnakyToken(env.KAL_CRON_TOKEN, req.headers.get("x-cron-token") || "")) {
      return new Response("unauthorized", { status: 401 });
    }
    const q = new URL(req.url).searchParams;
    // `?kontrola=1` pustí všetky štyri časti za sebou (na overenie po zásahu),
    // `?kontrola=stranky` len jednu. Za sebou, nie naraz — dôvod je ten istý,
    // prečo majú vlastné spúšťače.
    const ktoraKontrola = q.get("kontrola");
    if (ktoraKontrola) {
      const vsetky = ["formulare", "stranky", "meranie", "reklamy"] as const;
      const zoznam = ktoraKontrola === "1"
        ? vsetky
        : vsetky.filter((c) => c === ktoraKontrola);
      if (!zoznam.length) {
        return Response.json({ ok: false, chyba: `neznáma časť „${ktoraKontrola}" — poznám ${vsetky.join(", ")}` }, { status: 400 });
      }
      const von: unknown[] = [];
      for (const cast of zoznam) {
        const r = await kontrolaWebu(env, cast);
        const t = await r.text();
        try { von.push(JSON.parse(t)); } catch { von.push({ cast, stav: r.status, telo: t.slice(0, 300) }); }
      }
      return Response.json(zoznam.length === 1 ? von[0] : von);
    }
    // `?web=1` skúša načítanie textu webu bez čakania na 3:30 ráno.
    // `?push=1` pošle rannú dávku hneď — inak by sa overovalo až zajtra ráno.
    // V tichom čase ju Kokpit odmietne; `&vynutit=1` je vedomá skúška.
    // `?pushbeh=1` spustí bežné notifikácie z trojhodinového plánu.
    // `?meta=1` spustí sťahovanie reklám hneď — na overenie bez čakania na ráno.
    if (q.get("meta") === "1") {
      const out: string[] = [];
      for (const akcia of ["kampane", "reklamy"] as const) {
        const r = await metaReklamy(env, akcia);
        out.push(`${akcia}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
      return new Response(out.join("\n"), { status: 200 });
    }
    if (q.get("btc") === "1") {
      let text = "";
      await ohlas(env, "btc-sledovanie", btcSledovanie(env).then(async (r) => {
        text = `${r.status} ${(await r.clone().text()).slice(0, 400)}`;
        return r;
      }));
      return new Response(`BTC: ${text}`, { status: 200 });
    }
    // `?fio=1` stiahne pohyby z banky hneď — a zapíše beh do Zdravia Kokpitu
    // rovnako ako nočný, aby overenie nebolo len v konzole.
    if (q.get("fio") === "1") {
      let text = "";
      await ohlas(env, "fio-banka", fioBanka(env).then(async (r) => {
        text = `${r.status} ${(await r.clone().text()).slice(0, 400)}`;
        return r;
      }));
      return new Response(`Fio: ${text}`, { status: 200 });
    }
    // `?balicky=1` založí automatické balíčky hneď a zapíše beh ako nočný.
    if (q.get("balicky") === "1") {
      let text = "";
      await ohlas(env, "balicky-automaticky", automatickeBalicky(env).then(async (r) => {
        text = `${r.status} ${(await r.clone().text()).slice(0, 400)}`;
        return r;
      }));
      return new Response(`Automatické balíčky: ${text}`, { status: 200 });
    }
    if (q.get("push") === "1") {
      const r = await rannePush(env, q.get("vynutit") === "1");
      return new Response(`Push: ${r.status} ${(await r.text()).slice(0, 400)}`, { status: r.ok ? 200 : 502 });
    }
    if (q.get("web") === "1") {
      const v = await textWebu(env);
      return new Response(v.chyba
        ? `text webu ZLYHAL po ${v.kol} kolách (načítaných ${v.nacitane}): ${v.chyba}`
        : `text webu: ${v.nacitane} stránok v ${v.kol} kolách`, { status: v.chyba ? 502 : 200 });
    }
    if (q.get("pushbeh") === "1") {
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
