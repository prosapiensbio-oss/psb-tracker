import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import {
  h1ZHtml, metaPopisZHtml, sitemapUrls, textZHtml, titulokZHtml, typZoSitemapy,
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

          // „obnov" vynúti prečítanie celého webu odznova — po prepísaní
          // titulkov je to jediný spôsob, ako sa nová verzia dostane dovnútra.
          if (b.akcia === "obnov") {
            await DB.prepare("UPDATE web_stranky SET nacitane_at = NULL, text = ''").run();
          }

          // 1 · adresy zo sitemapy. Lacné a robí sa vždy, aby nová stránka
          // na webe pribudla aj bez toho, aby si to niekto pamätal.
          let pribudlo = 0;
          for (const s of SITEMAPY) {
            let xml = "";
            try { xml = await stiahni(ZAKLAD + s); } catch { continue; }
            const typ = typZoSitemapy(s);
            const urly = sitemapUrls(xml);
            for (let i = 0; i < urly.length; i += 50) {
              const kus = urly.slice(i, i + 50);
              await DB.batch(kus.map((u) => DB.prepare(
                `INSERT INTO web_stranky (url, typ) VALUES (?1, ?2)
                 ON CONFLICT(url) DO UPDATE SET typ = excluded.typ`,
              ).bind(u, typ)) as never);
              pribudlo += kus.length;
            }
          }
          if (!pribudlo) {
            return Response.json(
              { ok: false, error: "Sitemapa sa nedá prečítať — bez nej neviem, ktoré stránky web má." },
              { status: 502 },
            );
          }

          // 2 · text tam, kde ešte nie je. Po dávkach; zvyšok dobehne druhým klikom.
          const chybajuce = await DB.prepare(
            `SELECT url, typ FROM web_stranky WHERE text = '' OR nacitane_at IS NULL LIMIT ?1`,
          ).bind(DAVKA).all<{ url: string; typ: string }>();

          let nacitane = 0;
          const chyby: string[] = [];
          for (const s of chybajuce.results || []) {
            let html = "";
            try { html = await stiahni(s.url); }
            catch (e) { chyby.push(`${s.url.replace(ZAKLAD, "")}: ${String(e).slice(0, 60)}`); continue; }
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
            "SELECT COUNT(*) n FROM web_stranky WHERE text = '' OR nacitane_at IS NULL",
          ).first<{ n: number }>().catch(() => ({ n: 0 }));

          await audit(DB, {
            action: "import", predmet: "text webu",
            neu: `${nacitane} stránok, zostáva ${zostava?.n ?? 0}`,
            actor: (await currentUser(request)) || undefined,
          });

          const zvysok = zostava?.n ?? 0;
          return Response.json({
            ok: chyby.length === 0,
            sprava: `Prečítané: ${nacitane} stránok.`
              + (zvysok > 0 ? ` Zostáva ${zvysok} — klikni znova, pokračuje tam, kde skončil.` : " Web je celý vnútri."),
            chyby, nacitane, zostava: zvysok,
          }, chyby.length ? { status: 207 } : undefined);
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 400) }, { status: 500 });
        }
      },
    },
  },
});
