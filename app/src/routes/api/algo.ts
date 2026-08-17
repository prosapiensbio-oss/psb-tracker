import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Čo sa mení v algoritmoch — z oficiálnych zdrojov, nie z blogov o marketingu.
//
//   GET            → uložené novinky + kedy sa naposledy kontrolovalo
//   POST { }       → prejde feedy a uloží, čo pribudlo
//   POST { id }    → označí správu ako prečítanú
//
// Prečo len tieto zdroje: sú oficiálne a strojovo čitateľné. Instagram medzi
// nimi chýba a nie je to prehliadnutie — Adam Mosseri oznamuje zmeny videami na
// svojom profile a na Threads a Instagram oficiálny feed nemá. Preto appka
// pripomína aj ručnú polročnú kontrolu.
const ZDROJE: { nazov: string; url: string }[] = [
  { nazov: "Google Search Central", url: "https://developers.google.com/search/blog/feed.xml" },
  { nazov: "Meta Newsroom", url: "https://about.fb.com/news/feed/" },
  { nazov: "Facebook Developers", url: "https://developers.facebook.com/blog/feed/" },
  { nazov: "YouTube Blog", url: "https://blog.youtube/rss/" },
  // Changelog Graph API. NIE je to o algoritme — je to o rozhraní, cez ktoré
  // Kokpit s Metou hovorí. Práve tu sa dopredu oznamuje, ktorá verzia sa
  // vypína a ktoré pole zaniká; bez toho sa to zistí až tak, že appka jedného
  // rána prestane sťahovať kampane a nikto nevie prečo. Jerry na to upozornil
  // 13. 8. — mal pravdu, len to nie je zmena algoritmu, ale zmena API.
  { nazov: "Meta Graph API changelog", url: "https://developers.facebook.com/blog/feed/?tags=graph-api" },
  // Google Ads. Jerry, 17. 8. 2026: „postavili sme pre Jarvisa, ako funguje
  // algoritmus aj Meta prostredie — nemali by sme spraviť podobnú vec pre
  // Google Ads?" Mal pravdu a je to naliehavejšie než pri Mete: reklama sa
  // spúšťa v septembri a Kokpit z Google Ads API sťahuje kampane, takže platí
  // oboje — mení sa, ako sa inzeruje, aj rozhranie, cez ktoré appka číta dáta.
  //
  // Hneď v prvom sťahu tam bola vec, ktorú Jerry potrebuje vedieť dopredu:
  // „Google Ads language targeting changes starting September 2026".
  { nazov: "Google Ads produkty", url: "https://blog.google/products/ads-commerce/rss/" },
  // Vývojársky blog má atom.xml — /feeds/posts/default bez presmerovania
  // vracia prázdno, overené 17. 8.
  { nazov: "Google Ads API", url: "https://ads-developers.googleblog.com/atom.xml" },
];

// Slová, ktoré v titulku znamenajú „toto sa môže týkať dosahu".
//
// Prvá verzia mala medzi nimi „creator" a „feed" a hneď pri prvej kontrole
// označila ako dôležité tri správy o YouTube FIFA Creator Cupe. To je presne
// tá cesta, ktorou karta prestane niečo znamenať: keď svieti na futbal, človek
// ju za týždeň prestane čítať. Radšej užší zoznam a občas prehliadnutá správa
// (celý zoznam je aj tak na jeden klik) než signál, ktorý nikto neberie vážne.
const KLUCOVE = [
  "algorithm", "ranking", "core update", "search update", "spam polic",
  "recommendation", "how we recommend", "distribution", "reach",
  // „for you" samo o sebe chytalo vety typu „for your first Short" — musí to
  // byť názov plochy, nie predložka.
  "for you page", "for you feed", "visibility", "helpful content", "content policy",
  // Zmeny rozhrania. Netýkajú sa dosahu, ale toho, či appka zajtra ešte
  // dostane dáta — a to je rovnako naliehavé.
  "deprecat", "breaking change", "sunset", "api version", "will be removed",
  // Google Ads. Zámerne úzke a bez slov ako „budget" či „targeting" samých
  // o sebe — tie sa v marketingovom feede vyskytnú v každom druhom titulku
  // a karta by prestala niečo znamenať. Ostávajú názvy vecí, ktoré menia,
  // ako sa reklama nakupuje alebo meria.
  "smart bidding", "bidding strateg", "performance max", "broad match",
  "match type", "ad rank", "quality score", "conversion tracking",
  "enhanced conversions", "consent mode", "keyword planner",
  "language targeting", "policy update",
];

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `a${(h >>> 0).toString(36)}`;
};

/** RSS aj Atom majú <item> alebo <entry>; oboje nás zaujíma rovnako. */
const polozky = (xml: string) => {
  const out: { titulok: string; url: string; datum: string }[] = [];
  const bloky = xml.split(/<(?:item|entry)[\s>]/).slice(1);
  for (const b of bloky.slice(0, 25)) {
    const t = b.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    // Atom dáva odkaz atribútom, RSS textom — skúšame oboje.
    const l = b.match(/<link[^>]*href=["']([^"']+)["']/) || b.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const d = b.match(/<(?:pubDate|updated|published)[^>]*>([\s\S]*?)<\//);
    if (!t) continue;
    const titulok = t[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (!titulok) continue;
    const dat = d ? new Date(d[1].trim()) : null;
    out.push({
      titulok: titulok.slice(0, 300),
      url: (l ? l[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "").slice(0, 500),
      datum: dat && !isNaN(dat.getTime()) ? dat.toISOString().slice(0, 10) : "",
    });
  }
  return out;
};

export const Route = createFileRoute("/api/algo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, novinky: [] });
        try {
          const rs = await DB.prepare(
            "SELECT id, zdroj, titulok, url, datum, relevantne, precitane FROM algo_novinky ORDER BY relevantne DESC, datum DESC LIMIT 60",
          ).all();
          const posl = await DB.prepare("SELECT MAX(ulozene_at) AS k FROM algo_novinky").first<{ k: string }>();
          return Response.json({
            ok: true,
            kontrolovane: posl?.k || "",
            novinky: (rs.results as Record<string, unknown>[]).map((r) => ({
              id: r.id, zdroj: r.zdroj, titulok: r.titulok, url: r.url, datum: r.datum,
              relevantne: !!r.relevantne, precitane: !!r.precitane,
            })),
          });
        } catch {
          return Response.json({ ok: false, novinky: [], kontrolovane: "" });
        }
      },

      POST: async ({ request }) => {
        // Plánovač beží bez prihlásenej relácie, takže sa preukazuje tokenom.
        // Je to ten istý tajný kľúč ako pri snímkach kalendára — jeden
        // plánovač, jeden kľúč; druhý by len znamenal ďalšie miesto, kde sa
        // dá zabudnúť ho nastaviť.
        const jeCron = new URL(request.url).searchParams.get("cron") === "1"
          && !!(bindings() as { KAL_CRON_TOKEN?: string }).KAL_CRON_TOKEN
          && request.headers.get("x-cron-token") === (bindings() as { KAL_CRON_TOKEN?: string }).KAL_CRON_TOKEN;
        if (!jeCron && !(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { id?: string };
        try { b = (await request.json()) as typeof b; } catch { b = {}; }

        if (b.id) {
          await DB.prepare("UPDATE algo_novinky SET precitane = 1 WHERE id = ?1").bind(String(b.id)).run();
          return Response.json({ ok: true });
        }

        const now = new Date().toISOString();
        // Staršie než rok nezaujímajú — zmena algoritmu spred roka už buď
        // zafungovala, alebo ju prevalcovala ďalšia.
        const hranica = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
        let pridane = 0, chybne = 0;

        for (const z of ZDROJE) {
          try {
            const r = await fetch(z.url, { headers: { "user-agent": "PSB-Tracker/1.0" }, signal: AbortSignal.timeout(12000) });
            if (!r.ok) { chybne++; continue; }
            const xml = await r.text();
            for (const p of polozky(xml)) {
              if (!p.url || (p.datum && p.datum < hranica)) continue;
              const low = p.titulok.toLowerCase();
              const rel = KLUCOVE.some((k) => low.includes(k)) ? 1 : 0;
              const res = await DB.prepare(
                `INSERT OR IGNORE INTO algo_novinky (id, zdroj, titulok, url, datum, relevantne, precitane, ulozene_at)
                 VALUES (?1,?2,?3,?4,?5,?6,0,?7)`,
              ).bind(hash(p.url), z.nazov, p.titulok, p.url, p.datum || now.slice(0, 10), rel, now).run();
              if (res.meta?.changes) pridane++;
            }
          } catch {
            chybne++;
          }
        }
        // Zoznam kľúčových slov sa časom upresňuje. Keby sa prehodnotili len
        // nové správy, staré by naveky nosili označenie podľa pravidiel, ktoré
        // už neplatia — a karta by tvrdila, že futbalový turnaj je zmena
        // algoritmu. Preto sa pri každej kontrole prejdú aj uložené.
        const vsetky = (await DB.prepare("SELECT id, titulok, relevantne FROM algo_novinky").all())
          .results as { id: string; titulok: string; relevantne: number }[];
        for (const r of vsetky) {
          const low = String(r.titulok).toLowerCase();
          const rel = KLUCOVE.some((k) => low.includes(k)) ? 1 : 0;
          if (rel !== r.relevantne) {
            await DB.prepare("UPDATE algo_novinky SET relevantne = ?2 WHERE id = ?1").bind(r.id, rel).run();
          }
        }

        return Response.json({ ok: true, pridane, chybne, zdrojov: ZDROJE.length });
      },
    },
  },
});
