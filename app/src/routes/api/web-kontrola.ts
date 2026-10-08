import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { UCET_REKLAM } from "../../lib/psb/kampanPlan";
import { type NalezKontroly, skontrolujStranku } from "../../lib/psb/webKontrola";
import {
  adresySitemap, cestaZAdresy, type MedzeStranok, type Nacitaj,
  skontrolujZivostWebu, stiahniStranky,
} from "../../lib/psb/webKontrolaStranky";
import { skontrolujMeranie } from "../../lib/psb/webKontrolaMeranie";
import { stiahniMeranie } from "../../lib/psb/webKontrolaMeranie.server";
import {
  jeBeziacouPodlaSad, type ReklamaNaKontrolu, skontrolujReklamy, stiahniStrankyReklam,
} from "../../lib/psb/webKontrolaReklamy";

/**
 * Nočná kontrola webu — či sa dá dopyt vôbec odoslať a či za reklamu niečo stojí.
 *
 * PREČO PO ČASTIACH
 *
 * Kontrola má štyri časti a dokopy je to ~15 podžiadostí a desiatky zápisov.
 * Presne takýto tvar práce už raz appku zhodil: dva iCal kalendáre v jednom
 * volaní prekročili limit workera a Kokpit vracal 503 na všetko. Každá časť
 * preto beží vo VLASTNEJ požiadavke (`?cast=`) a vo vlastnom čase; keď spadne
 * jedna, ostatné tri sa stále zapíšu.
 *
 * ZNAČKA BEHU SA ZAPISUJE PRED PRÁCOU, NIE PO NEJ
 *
 * Najhoršie, čo kontrola môže spraviť, je mlčať: keby sa zapisovalo až na
 * konci, worker, ktorý zomrie uprostred, nenechá v tabuľke nič — a obrazovka
 * aj register by ďalej ukazovali zelené riadky z predvčera. Preto sa riadok
 * `kontrola:<cast>` zapíše ako PRVÝ so stavom „chyba" a na „ok" sa prepíše až
 * vtedy, keď časť naozaj dobehne. Nedokončený beh tak svieti sám od seba.
 */

const ZAKLAD = "https://www.prosapiens.cz";

const DEFAULT_STRANKY = [
  `${ZAKLAD}/uvodni-trenink/`,
  `${ZAKLAD}/test-postury/`,
  `${ZAKLAD}/kontakt/`,
];

const UA = "Mozilla/5.0 (compatible; KokpitKontrola/1.0; +https://prosapiens.cz)";

/** Koľko znakov detailu sa zmestí do tabuľky. Dlhší sa oreže a POVIE to. */
const DLZKA_DETAILU = 1800;

const CASTI = ["formulare", "stranky", "meranie", "reklamy"] as const;
type Cast = (typeof CASTI)[number];

const NAZVY_CASTI: Record<Cast, string> = {
  formulare: "Kontrola formulárov dobehla",
  stranky: "Kontrola stránok dobehla",
  meranie: "Kontrola merania dobehla",
  reklamy: "Kontrola reklamných adries dobehla",
};

async function nastavenie(DB: D1Database, kluc: string): Promise<string> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(kluc).first<{ value: string }>();
  if (!r?.value) return "";
  try { return String(JSON.parse(r.value)); } catch { return r.value; }
}

async function zoznamStranok(DB: D1Database): Promise<string[]> {
  // Jeden zoznam pre VŠETKY časti. Dva by sa rozišli a kontrola formulárov by
  // sledovala inú stránku než kontrola dostupnosti.
  try {
    const p = JSON.parse((await nastavenie(DB, "web_kontrola_stranky")) || "[]");
    if (Array.isArray(p) && p.length) return p.map(String);
  } catch { /* ostane predvolený */ }
  return DEFAULT_STRANKY;
}

/** Adresa `formulare.js` sa berie zo stránky — aj s `?ver=`, nech sa číta to, čo beží. */
function adresaMosta(html: string): string {
  const m = /<script[^>]+src=["']([^"']*formulare\.js[^"']*)["']/i.exec(html);
  return m ? m[1] : "";
}

const nacitaj: Nacitaj = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<Nacitaj>;

async function zapis(DB: D1Database, beh: string, nalezy: (NalezKontroly & { trvanie?: number })[]) {
  const now = new Date().toISOString();
  for (const n of nalezy) {
    const detail = n.detail.length > DLZKA_DETAILU
      ? `${n.detail.slice(0, DLZKA_DETAILU - 40)}… (detail je dlhší, orezané)`
      : n.detail;
    await DB.prepare(
      `INSERT INTO web_kontroly (id, beh, kluc, nazov, stav, detail, trvanie_ms, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
       ON CONFLICT(id) DO UPDATE SET stav = excluded.stav, detail = excluded.detail, trvanie_ms = excluded.trvanie_ms`,
    ).bind(`${beh}|${n.kluc}`, beh, n.kluc, n.nazov, n.stav, detail, n.trvanie || 0, now).run();
  }
}

// ── jednotlivé časti ────────────────────────────────────────────────────────

async function castFormulare(DB: D1Database, telo: Record<string, unknown>) {
  const nalezy: (NalezKontroly & { trvanie: number })[] = [];
  const stranky = await zoznamStranok(DB);
  let js = "";
  for (const adresa of stranky) {
    const zac = Date.now();
    const cesta = cestaZAdresy(adresa);
    try {
      const r = await fetch(`${adresa}${adresa.includes("?") ? "&" : "?"}kokpit=kontrola-${zac}`, { headers: { "user-agent": UA } });
      if (!r.ok) {
        // Kľúč musí mať TEN ISTÝ tvar ako pri úspechu — inak má tá istá
        // stránka v histórii dva riadky a otázka „odkedy to nejde" sa rozpadne.
        nalezy.push({ kluc: `formular:${cesta}`, nazov: `Formulár na ${cesta}`, stav: "chyba",
          detail: `stránka vrátila HTTP ${r.status} — reklama aj odkazy vedú na niečo, čo sa nenačíta`, trvanie: Date.now() - zac });
        continue;
      }
      const html = await r.text();
      if (!js) {
        const src = adresaMosta(html);
        if (src) {
          const rj = await fetch(src.startsWith("http") ? src : new URL(src, adresa).toString(), { headers: { "user-agent": UA } });
          js = rj.ok ? await rj.text() : "";
        }
      }
      if (!js) {
        nalezy.push({ kluc: "most", nazov: "Most na formuláre (formulare.js)", stav: "chyba",
          detail: "stránka ho nenačítava alebo sa súbor nedá stiahnuť — formuláre sa neodošlú vôbec", trvanie: Date.now() - zac });
        break;
      }
      nalezy.push({ ...skontrolujStranku(adresa, html, js), trvanie: Date.now() - zac });
    } catch (e) {
      nalezy.push({ kluc: `formular:${cesta}`, nazov: `Formulár na ${cesta}`, stav: "chyba",
        detail: `stránka sa nedá stiahnuť: ${String(e).slice(0, 150)}`, trvanie: Date.now() - zac });
    }
  }

  // Bod 3: syntetický dopyt poslal plánovač, sem prišiel jeho výsledok.
  // Dôkazom nie je odpoveď endpointu (tú by vrátil aj endpoint, ktorý nič
  // nezapíše), ale RIADOK v databáze — overí sa a hneď sa maže.
  const d = (telo.dopyt || {}) as { ok?: boolean; id?: string; detail?: string; trvanie?: number };
  if (telo.dopyt) {
    const zac = Date.now();
    let stav: NalezKontroly["stav"] = "chyba";
    let detail = String(d.detail || "").slice(0, 300);
    if (d.ok && d.id) {
      const r = await DB.prepare("SELECT id, druh FROM leads WHERE id = ?1").bind(String(d.id)).first<{ id: string; druh: string }>();
      if (r) {
        await DB.prepare("DELETE FROM leads WHERE id = ?1 AND druh = 'kontrola'").bind(String(d.id)).run();
        const po = await DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(String(d.id)).first();
        stav = po ? "varovanie" : "ok";
        detail = po
          ? `dopyt prešiel, ale kontrolný riadok sa nepodarilo zmazať (${d.id}) — zmaž ho v Dopytoch ručne`
          : `dopyt prešiel celou cestou: tajomstvo, endpoint, zápis do Dopytov${r.druh === "kontrola" ? "" : ` (pozor, druh = ${r.druh})`}`;
      } else {
        detail = `/api/lead-web ohlásil úspech, ale v Dopytoch po ňom NIE JE RIADOK (${d.id}) — dopyty z webu sa strácajú`;
      }
    } else if (!detail) {
      detail = "syntetický dopyt neprešiel cez /api/lead-web";
    }
    nalezy.push({ kluc: "dopyt-do-kokpitu", nazov: "Dopyt z webu dôjde do Kokpitu", stav, detail, trvanie: d.trvanie || (Date.now() - zac) });
  }
  return nalezy;
}

async function castStranky(DB: D1Database) {
  const adresy = await zoznamStranok(DB);
  const zac = Date.now();
  // Stránky sa čítajú CEZ KEŠ — kontrola sa pýta, čo dostane návštevník.
  // Sitemapy naopak bez nej: import obsahu webu ju tiež obchádza, takže by sa
  // inak overovala iná kópia, než akú číta Kokpit.
  const stranky = await stiahniStranky(adresy, nacitaj, { ua: UA, timeoutMs: 20000, bezKese: false, drzatTelo: true });
  const sitemapy = await stiahniStranky(adresySitemap(ZAKLAD), nacitaj, { ua: UA, timeoutMs: 20000, bezKese: true, drzatTelo: true });

  /**
   * Značky obsahu. Bez nich je kontrola obsahu vypnutá a stránka, z ktorej
   * zmizne formulár, prejde ako živá — to je presne ten tichý zelený riadok,
   * pred ktorým má kontrola chrániť. Predvolené značky preto nie sú prázdne.
   */
  let naCeste: Record<string, string[]> = {
    "/uvodni-trenink/": ["data-form", "psb-skryte"],
    "/test-postury/": ["data-form", "psb-skryte"],
    "/kontakt/": ["data-form", "psb-skryte"],
  };
  try {
    const p = JSON.parse((await nastavenie(DB, "web_kontrola_znacky")) || "null");
    if (p && typeof p === "object") {
      naCeste = Object.fromEntries(Object.entries(p as Record<string, unknown>)
        .map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(String)]));
    }
  } catch { /* ostanú predvolené */ }

  const medze: MedzeStranok = { musiObsahovatNaCeste: naCeste };
  const nalezy = skontrolujZivostWebu({ stranky, sitemapy }, medze);
  // Trvanie sa páruje podľa cesty, nie podľa poradia — poradie sa pri výpadku
  // jednej stránky posunie a čísla by sedeli na cudzích riadkoch.
  const casy = new Map(stranky.map((o) => [`stranka:${cestaZAdresy(o.url)}`, o.trvanieMs || 0]));
  return nalezy.map((n) => ({ ...n, trvanie: casy.get(n.kluc) || (Date.now() - zac) }));
}

async function castMeranie(DB: D1Database) {
  const zac = Date.now();
  const data = await stiahniMeranie(DB, {});
  return skontrolujMeranie(data).map((n) => ({ ...n, trvanie: Date.now() - zac }));
}

async function castReklamy(DB: D1Database) {
  const zac = Date.now();
  const token = await nastavenie(DB, "meta_token");
  if (!token) {
    return [{ kluc: "reklama:bezi", nazov: "Reklamy majú kam viesť", stav: "varovanie" as const,
      detail: "v Údajoch nie je uložený token pre Metu, takže sa adresy z reklám nedajú overiť — nie je to to isté ako „všetko je v poriadku“", trvanie: Date.now() - zac }];
  }
  const polia = "id,name,effective_status,adset{effective_status,end_time},creative{url_tags,object_story_spec{link_data{link}},asset_feed_spec{link_urls}}";
  const adresa = `https://graph.facebook.com/v20.0/act_${UCET_REKLAM}/ads?fields=${encodeURIComponent(polia)}&limit=200&access_token=${encodeURIComponent(token)}`;
  let reklamy: ReklamaNaKontrolu[] = [];
  try {
    const r = await fetch(adresa);
    const t = await r.text();
    let j: { data?: Record<string, unknown>[]; error?: { message?: string } } = {};
    try { j = JSON.parse(t) as typeof j; } catch { /* nižšie sa ukáže telo */ }
    if (!r.ok || j.error) {
      return [{ kluc: "reklama:bezi", nazov: "Reklamy majú kam viesť", stav: "varovanie" as const,
        detail: `Meta neodpovedala použiteľne (HTTP ${r.status}): ${String(j.error?.message || t).slice(0, 200)}`, trvanie: Date.now() - zac }];
    }
    reklamy = (j.data || []).map((a) => {
      const kreativa = (a.creative || {}) as Record<string, unknown>;
      const oss = (kreativa.object_story_spec || {}) as Record<string, unknown>;
      const linkData = (oss.link_data || {}) as Record<string, unknown>;
      const feed = (kreativa.asset_feed_spec || {}) as { link_urls?: { website_url?: string }[] };
      const sada = (a.adset || {}) as { effective_status?: string; end_time?: string };
      return {
        id: String(a.id || ""),
        nazov: String(a.name || ""),
        // Stav sa NEBERIE zo surového effective_status reklamy: Meta necháva
        // ACTIVE aj na sade s uplynutým koncom (19. 8. 2026 ich tak bolo 32
        // s nulovým výdavkom). Rozhoduje sada.
        stav: jeBeziacouPodlaSad([sada]) && String(a.effective_status || "") === "ACTIVE" ? "bezi" : "pozastavena",
        odkaz: String(linkData.link || feed.link_urls?.[0]?.website_url || ""),
        utm: String(kreativa.url_tags || ""),
      };
    });
  } catch (e) {
    return [{ kluc: "reklama:bezi", nazov: "Reklamy majú kam viesť", stav: "varovanie" as const,
      detail: `spojenie s Metou zlyhalo: ${String(e).slice(0, 200)}`, trvanie: Date.now() - zac }];
  }
  const mapa = await stiahniStrankyReklam(reklamy, nacitaj, { znacka: String(zac), ua: UA, timeoutMs: 20000 });
  return skontrolujReklamy(reklamy, mapa).map((n) => ({ ...n, trvanie: Date.now() - zac }));
}

export const Route = createFileRoute("/api/web-kontrola")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        /**
         * POSLEDNÝ STAV KAŽDEJ KONTROLY, nie posledný beh.
         *
         * Časti bežia každá vo vlastnom čase, takže „posledný beh" by ukázal
         * len tú, ktorá bežala naposledy, a zvyšok by zmizol z obrazovky —
         * čo vyzerá ako „nekontroluje sa", hoci sa kontroluje.
         */
        const riadky = (await DB.prepare(
          `SELECT w.kluc, w.nazov, w.stav, w.detail, w.trvanie_ms, w.beh
             FROM web_kontroly w
             JOIN (SELECT kluc, MAX(beh) beh FROM web_kontroly GROUP BY kluc) p
               ON p.kluc = w.kluc AND p.beh = w.beh
            ORDER BY w.kluc`,
        ).all()).results;
        const padlo = (await DB.prepare(
          `SELECT kluc, MIN(beh) od, MAX(beh) do, COUNT(*) kolko FROM web_kontroly
            WHERE stav <> 'ok' AND beh >= datetime('now','-30 days') GROUP BY kluc`,
        ).all()).results;
        const beh = (await DB.prepare("SELECT MAX(beh) b FROM web_kontroly").first<{ b: string }>())?.b || "";
        return Response.json({ ok: true, beh, riadky, padlo, casti: CASTI });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("cron") === "1") {
          const token = (bindings() as { KAL_CRON_TOKEN?: string }).KAL_CRON_TOKEN;
          const dany = request.headers.get("x-cron-token") || "";
          if (!token || token.length !== dany.length || token !== dany) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }
        } else if (!(await isAuthed(request))) {
          return unauthorized();
        }
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let telo: Record<string, unknown> = {};
        try { telo = (await request.json()) as Record<string, unknown>; } catch { telo = {}; }

        const dana = String(url.searchParams.get("cast") || "formulare");
        const cast = (CASTI as readonly string[]).includes(dana) ? (dana as Cast) : "formulare";
        const beh = new Date().toISOString();
        const zac = Date.now();
        const klucBehu = `kontrola:${cast}`;

        // Značka PRED prácou — nedokončený beh musí svietiť sám od seba.
        await zapis(DB, beh, [{
          kluc: klucBehu, nazov: NAZVY_CASTI[cast], stav: "chyba",
          detail: "beh sa začal a nedobehol — worker zrejme spadol na limite alebo na výnimke; čísla vedľa môžu byť staré",
          trvanie: 0,
        }]);

        let nalezy: (NalezKontroly & { trvanie?: number })[] = [];
        let chyba = "";
        try {
          if (cast === "formulare") nalezy = await castFormulare(DB, telo);
          else if (cast === "stranky") nalezy = await castStranky(DB);
          else if (cast === "meranie") nalezy = await castMeranie(DB);
          else nalezy = await castReklamy(DB);
        } catch (e) {
          chyba = String(e).slice(0, 300);
        }
        if (nalezy.length) await zapis(DB, beh, nalezy);

        const zle = nalezy.filter((n) => n.stav !== "ok");
        await zapis(DB, beh, [{
          kluc: klucBehu, nazov: NAZVY_CASTI[cast],
          stav: chyba ? "chyba" : "ok",
          detail: chyba
            ? `beh spadol: ${chyba}`
            : `${nalezy.length} kontrol za ${Math.round((Date.now() - zac) / 100) / 10} s, ${zle.length ? `${zle.length} nie je v poriadku` : "všetky v poriadku"}`,
          trvanie: Date.now() - zac,
        }]);

        return Response.json({
          ok: !chyba, cast, beh, chyba: chyba || undefined,
          kontrol: nalezy.length, chyb: zle.length,
          nalezy: nalezy.map((n) => ({ kluc: n.kluc, stav: n.stav, detail: n.detail })),
        });
      },
    },
  },
});
