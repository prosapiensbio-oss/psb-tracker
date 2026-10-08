import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { jeMesiac } from "../../lib/psb/format";
import {
  BRAND_PSB, jeInaZnacka, mesacneInstagram, mesacneSiete, POLIA_POSTS, POLIA_REELS, POLIA_STORIES, POLIA_VYVOJ,
  poliaSiete, riadkyNaPrispevky, rozsahMesiaca, SIETE, type PrispevokMc,
} from "../../lib/psb/metricool";
import { adresaPripojenia, odpoj, sedenieMcp, stavPripojenia } from "../../lib/psb/metricool.server";

// Metricool jedným ťuknutím v uzávierke (Jerry, 8. 10. 2026). Pripojenie:
// GET ?akcia=pripoj → Metricool → /api/metricool-spat. Potom POST stiahni.
//   GET  ?akcia=pripoj          → presmerovanie na povolenie v Metricoole
//   POST { akcia: "stav" }      → { pripojene, od }
//   POST { akcia: "stiahni", mesiac } → príspevky, reels, stories + mesačné čísla IG
//   POST { akcia: "odpoj" }
export const Route = createFileRoute("/api/metricool")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const u = new URL(request.url);
        if (u.searchParams.get("akcia") !== "pripoj") return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
        try {
          const kam = await adresaPripojenia(DB, `${u.origin}/api/metricool-spat`);
          return new Response(null, { status: 302, headers: { location: kam, "cache-control": "no-store" } });
        } catch (e) {
          return new Response(null, { status: 302, headers: { location: `/?metricool=chyba&dovod=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "chyba")}#workspace` } });
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const b = (await request.json().catch(() => ({}))) as { akcia?: string; mesiac?: string };
        const hlavicky = { "cache-control": "no-store" };

        if (b.akcia === "stav") return Response.json({ ok: true, ...(await stavPripojenia(DB)) }, { headers: hlavicky });
        if (b.akcia === "odpoj") {
          await odpoj(DB);
          await audit(DB, { action: "metricool-odpojeny", predmet: "Metricool", actor: (await currentUser(request)) || undefined });
          return Response.json({ ok: true });
        }

        if (b.akcia === "stiahni") {
          const mesiac = String(b.mesiac || "");
          if (!jeMesiac(mesiac)) return Response.json({ ok: false, error: "Chýba mesiac (RRRR-MM)." }, { status: 400 });
          const { from, to } = rozsahMesiaca(mesiac);
          try {
            const mcp = await sedenieMcp(DB);
            // Postupne, nie naraz — jedno sedenie, štyri krátke dopyty.
            const reels = riadkyNaPrispevky("reel", await mcp.riadky(BRAND_PSB, from, to, POLIA_REELS));
            const posty = riadkyNaPrispevky("post", await mcp.riadky(BRAND_PSB, from, to, POLIA_POSTS));
            const stories = riadkyNaPrispevky("story", await mcp.riadky(BRAND_PSB, from, to, POLIA_STORIES));
            const vyvoj = await mcp.riadky(BRAND_PSB, from, to, POLIA_VYVOJ);
            const vsetky: PrispevokMc[] = [...reels, ...posty, ...stories].filter((p) => p.mesiac === mesiac);
            const kanaly = mesacneInstagram(vyvoj, vsetky, mesiac).map((k) => ({ ...k, kanal: "Instagram" }));
            // Ostatné siete: každá vlastný krátky dopyt. Sieť, ktorá zlyhá
            // (nepripojená, zmenené pole), nezhodí zvyšok — povie sa to.
            const preskocene: string[] = [];
            for (const s of SIETE) {
              try {
                const rows = await mcp.riadky(BRAND_PSB, from, to, poliaSiete(s));
                for (const k of mesacneSiete(s, rows, mesiac)) kanaly.push({ ...k, kanal: s.kanal });
              } catch (e) {
                if (jeInaZnacka(String(e))) throw e;
                preskocene.push(s.kanal);
              }
            }
            const now = new Date().toISOString();

            // Ten istý zápis ako import CSV exportu (db.server.ts → mkt_prispevky).
            const stmts = vsetky.map((x) => DB.prepare(
              `INSERT INTO mkt_prispevky (id, druh, datum, mesiac, url, hook, views, dosah, ulozenia, zdielania, komentare, lajky, spend, view_rate, watch_time, updated_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
               ON CONFLICT(id) DO UPDATE SET druh=?2, datum=?3, mesiac=?4, url=?5, hook=?6, views=?7, dosah=?8,
                 ulozenia=?9, zdielania=?10, komentare=?11, lajky=?12, spend=?13, view_rate=?14, watch_time=?15, updated_at=?16`,
            ).bind(x.id, x.druh, x.datum, x.mesiac, x.url, x.hook, x.views, x.dosah, x.ulozenia, x.zdielania, x.komentare, x.lajky, x.spend, x.viewRate, x.watchTime, now));
            // A tie isté riadky, aké zapisuje PDF zostava (kanaly_mesiace).
            for (const k of kanaly) {
              stmts.push(DB.prepare(
                `INSERT INTO kanaly_mesiace (mesiac, kanal, metrika, hodnota, zmena, poznamka, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, 'Metricool (priamo)', ?5)
                 ON CONFLICT(mesiac, kanal, metrika) DO UPDATE SET hodnota = excluded.hodnota, poznamka = excluded.poznamka, updated_at = excluded.updated_at`,
              ).bind(mesiac, k.kanal, k.metrika, k.hodnota, now));
            }
            // Záznam nahratia — krok uzávierky aj „nahraté" pri ňom sa riadia ním.
            stmts.push(DB.prepare("INSERT INTO upload_log (id, date, filename, type, added, skipped) VALUES (?1, ?2, ?3, 'metricool', ?4, 0)")
              .bind(crypto.randomUUID(), now, `metricool-priamo ${mesiac}`, vsetky.length));
            for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));

            const siete = [...new Set(kanaly.map((k) => k.kanal))];
            const vysledok = { reels: reels.length, posty: posty.length, stories: stories.length, metrik: kanaly.length, siete, preskocene };
            await audit(DB, { action: "metricool-stiahnute", predmet: mesiac, neu: `${vysledok.reels} reels, ${vysledok.posty} príspevkov, ${vysledok.stories} stories, ${vysledok.metrik} metrík`, actor: (await currentUser(request)) || undefined });
            return Response.json({ ok: true, mesiac, ...vysledok }, { headers: hlavicky });
          } catch (e) {
            const sprava = e instanceof Error ? e.message : String(e);
            // Povolenie pre inú značku je ako žiadne — treba pripojiť znova.
            if (jeInaZnacka(sprava)) {
              await odpoj(DB);
              return Response.json({ ok: false, nepripojeny: true, error: "Metricool dal Kokpitu prístup k inej značke než ProSapiens. Klikni „Pripojiť Metricool“ — Kokpit si teraz pýta ProSapiens výslovne." }, { status: 409, headers: hlavicky });
            }
            const nepripojeny = /nie je pripojený|vypršal|pripoj ho znova/i.test(sprava);
            return Response.json({ ok: false, error: sprava, nepripojeny }, { status: nepripojeny ? 409 : 502, headers: hlavicky });
          }
        }
        return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
      },
    },
  },
});
