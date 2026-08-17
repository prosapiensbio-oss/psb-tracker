import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import {
  h1ZHtml, metaPopisZHtml, naZmazanie, sitemapZapisy, textZHtml, titulokZHtml, typZoSitemapy,
} from "../../lib/psb/webObsah";

/**
 * Stiahnutie textu vlastného webu.
 *
 * PREČO PO DÁVKACH A NIE NARAZ
 *
 * Web má 79 stránok a článkov. Worker má strop podžiadostí na jedno volanie
 * a osemdesiat fetchov ho na slabšej tarife prerazí — a zlyhalo by to
 * v polovici, takže by v tabuľke zostala náhodná polovica webu bez toho, aby
 * to niekto poznal. Preto sa najprv uložia VŠETKY adresy zo sitemapy (tri
 * podžiadosti) a text sa dopĺňa po dávkach: v tabuľke je vždy vidieť, koľko
 * ešte chýba, a druhý klik pokračuje tam, kde prvý skončil.
 *
 * PREČO NIE CEZ JARVISOV `web_fetch`
 *
 * Ten číta jednu stránku na požiadanie v jednom rozhovore. Toto je zásoba,
 * ktorú má k dispozícii vždy a dá sa spojiť so Search Console — čo je celý
 * dôvod, prečo to existuje.
 */

const SITEMAPY = ["page-sitemap.xml", "post-sitemap.xml"];
const DAVKA = 40;
const ZAKLAD = "https://www.prosapiens.cz/";

async function stiahni(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "user-agent": "PSB-Kokpit/1.0 (interny nastroj)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

export const Route = createFileRoute("/api/web-obsah")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const r = await DB.prepare(
            `SELECT COUNT(*) vsetky,
                    SUM(CASE WHEN text <> '' THEN 1 ELSE 0 END) sText,
                    MAX(nacitane_at) naposledy
               FROM web_stranky`,
          ).first<{ vsetky: number; sText: number; naposledy: string | null }>()
            .catch(() => null);
          return Response.json({
            ok: true,
            vsetky: r?.vsetky ?? 0,
            sText: r?.sText ?? 0,
            naposledy: r?.naposledy ?? null,
          });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown> = {};
        try { b = (await request.json()) as Record<string, unknown>; } catch { /* prázdne telo je v poriadku */ }

        try {
          const teraz = new Date().toISOString();

          // „obnov" vynúti prečítanie celého webu odznova. Bežne to netreba:
          // zmenu stránky poznať z `lastmod` v sitemape a text sa natiahne sám.
          // Je to na prípad, keď sa text zmenil bez posunu `lastmod` — napríklad
          // po zmene šablóny WordPressu, ktorá sa stránok formálne netýka.
          if (b.akcia === "obnov") {
            await DB.prepare("UPDATE web_stranky SET nacitane_at = NULL, text = ''").run();
          }

          // 1 · adresy zo sitemapy. Lacné a robí sa vždy, aby nová stránka
          // na webe pribudla aj bez toho, aby si to niekto pamätal.
          let pribudlo = 0;
          const vSitemape: string[] = [];
          let precitanychSitemap = 0;
          for (const s of SITEMAPY) {
            let xml = "";
            try { xml = await stiahni(ZAKLAD + s); } catch { continue; }
            precitanychSitemap++;
            const typ = typZoSitemapy(s);
            const zapisy = sitemapZapisy(xml);
            for (const z of zapisy) vSitemape.push(z.url);
            for (let i = 0; i < zapisy.length; i += 50) {
              const kus = zapisy.slice(i, i + 50);
              // Keď sa `lastmod` posunul, stránka sa označí za neprečítanú a text
              // sa natiahne znova. Bez toho by tu ležala stará kópia a Jarvis by
              // navrhoval prepísať titulok, ktorý Jerry práve prepísal.
              await DB.batch(kus.map((z) => DB.prepare(
                `INSERT INTO web_stranky (url, typ, zmenene) VALUES (?1, ?2, ?3)
                 ON CONFLICT(url) DO UPDATE SET
                   typ = excluded.typ,
                   nacitane_at = CASE WHEN ?3 <> '' AND IFNULL(web_stranky.zmenene, '') <> ?3
                                      THEN NULL ELSE web_stranky.nacitane_at END,
                   text = CASE WHEN ?3 <> '' AND IFNULL(web_stranky.zmenene, '') <> ?3
                               THEN '' ELSE web_stranky.text END,
                   zmenene = excluded.zmenene`,
              ).bind(z.url, typ, z.zmenene)) as never);
              pribudlo += kus.length;
            }
          }
          if (!pribudlo) {
            return Response.json(
              { ok: false, error: "Sitemapa sa nedá prečítať — bez nej neviem, ktoré stránky web má." },
              { status: 502 },
            );
          }

          // 1b · adresy, ktoré web už nemá. Sitemapa je pravda o tom, čo web
          // obsahuje; zrušená stránka z nej zmizne, ale riadok po nej zostával
          // navždy a appka donekonečna hlásila „chýba 2". Maže sa LEN keď sa
          // podarilo prečítať všetky sitemapy — a `naZmazanie` má navyše strop,
          // aby sa pri orezanej sitemape nezmazal celý web.
          let zmazanych = 0;
          {
            const vDb = await DB.prepare("SELECT url FROM web_stranky").all<{ url: string }>()
              .catch(() => ({ results: [] as { url: string }[] }));
            const von = naZmazanie(
              (vDb.results || []).map((r) => r.url),
              vSitemape,
              precitanychSitemap === SITEMAPY.length,
            );
            for (const url of von) {
              await DB.prepare("DELETE FROM web_stranky WHERE url = ?1").bind(url).run();
              zmazanych++;
            }
          }

          // 2 · text tam, kde ešte nie je. Po dávkach; zvyšok dobehne druhým klikom.
          const chybajuce = await DB.prepare(
            // Len to, čo sa ešte neskúšalo. Stránka, ktorá vráti 404 (zrušená,
            // ale visí v sitemape), sa nižšie označí za vybavenú — inak zaberá
            // miesto v každej dávke a „zostáva 41" nikdy neklesne na nulu.
            `SELECT url, typ FROM web_stranky WHERE nacitane_at IS NULL LIMIT ?1`,
          ).bind(DAVKA).all<{ url: string; typ: string }>();

          let nacitane = 0;
          const chyby: string[] = [];
          for (const s of chybajuce.results || []) {
            let html = "";
            try { html = await stiahni(s.url); }
            catch (e) {
              chyby.push(`${s.url.replace(ZAKLAD, "")}: ${String(e).slice(0, 60)}`);
              // Pokus sa zapíše, text zostáva prázdny. Keď sa stránka vráti
              // k životu, sitemapa posunie lastmod, `nacitane_at` sa vynuluje
              // a skúsi sa znova. „Prečítať odznova" ju skúsi hneď.
              await DB.prepare("UPDATE web_stranky SET nacitane_at = ?2 WHERE url = ?1").bind(s.url, teraz).run();
              continue;
            }
            const text = textZHtml(html);
            await DB.prepare(
              `UPDATE web_stranky SET titulok = ?2, meta_popis = ?3, h1 = ?4,
                      text = ?5, znakov = ?6, nacitane_at = ?7 WHERE url = ?1`,
            ).bind(
              s.url, titulokZHtml(html), metaPopisZHtml(html), h1ZHtml(html),
              text, text.length, teraz,
            ).run();
            nacitane++;
          }

          const zostava = await DB.prepare(
            "SELECT COUNT(*) n FROM web_stranky WHERE nacitane_at IS NULL",
          ).first<{ n: number }>().catch(() => ({ n: 0 }));

          await audit(DB, {
            action: "import", predmet: "text webu",
            neu: `${nacitane} stránok, zostáva ${zostava?.n ?? 0}`,
            actor: (await currentUser(request)) || undefined,
          });

          const zvysok = zostava?.n ?? 0;
          return Response.json({
            ok: chyby.length === 0,
            sprava: `Prečítané: ${nacitane} stránok.${zmazanych ? ` Zrušených stránok odstránených: ${zmazanych}.` : ""}`
              + (zvysok > 0 ? ` Zostáva ${zvysok} — klikni znova, pokračuje tam, kde skončil.` : " Web je celý vnútri."),
            chyby, nacitane, zostava: zvysok, zmazanych,
          }, chyby.length ? { status: 207 } : undefined);
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 400) }, { status: 500 });
        }
      },
    },
  },
});
