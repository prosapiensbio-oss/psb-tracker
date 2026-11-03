import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { jeOdPlanovaca } from "../../lib/psb/cronToken.server";
import { jeMesiac } from "../../lib/psb/format";
import {
  BRAND_PSB, jeInaZnacka, mesacneInstagram, mesacneSiete, POLIA_POSTS, POLIA_REELS, POLIA_STORIES, POLIA_VYVOJ,
  poliaSiete, riadkyNaPrispevky, rozsahMesiaca, SIETE, vyzeraAkoKluc, type PrispevokMc,
} from "../../lib/psb/metricool";
import { adresaPripojenia, odpoj, sedenieMcp, stavPripojenia } from "../../lib/psb/metricool.server";
import { citajKonkurentov, nacitajKonkurentovApi, prehladApi, stavKluca, stiahniMesiacApi, ulozKluc, ulozKonkurentov, zmazKluc } from "../../lib/psb/metricoolApi.server";
import { vzoryZOdpovede, zadanieVzorov } from "../../lib/psb/konkurenti";

// Metricool jedným ťuknutím v uzávierke (Jerry, 8. 10. 2026). Pripojenie:
// GET ?akcia=pripoj → Metricool → /api/metricool-spat. Potom POST stiahni.
//   GET  ?akcia=pripoj          → presmerovanie na povolenie v Metricoole
//   POST { akcia: "stav" }      → { pripojene, od }
//   POST { akcia: "stiahni", mesiac } → príspevky, reels, stories + mesačné čísla IG
//   POST { akcia: "odpoj" }
// API (plán Advanced, kľúč vkladá Jerry v Upload → Napojenia):
//   POST { akcia: "api-stav" } → { ulozeny, od, kto }
//   POST { akcia: "api-uloz", token } → uloží, len keď ho Metricool prijme
//   POST { akcia: "api-prehlad" } → čo z API účet dáva, len počty
//   POST { akcia: "api-zmaz" }
//   POST { akcia: "konkurenti" } → uložený prehľad; { akcia: "konkurenti-nacitaj", dni } → nové čítanie a zhrnutie vzorov
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
        // Nočný sťah (Jerry, 8. 10. 2026: „áno, nastav to každú noc") ide
        // z plánovača kokpit-cron s tokenom — a smie LEN sťahovať.
        const cronToken = (bindings() as { KAL_CRON_TOKEN?: string }).KAL_CRON_TOKEN || "";
        const odPlanovaca = jeOdPlanovaca(request, cronToken);
        if (!odPlanovaca && !(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const b = (await request.json().catch(() => ({}))) as { akcia?: string; mesiac?: string; token?: string; dni?: number };
        if (odPlanovaca && b.akcia !== "stiahni") return unauthorized();
        const kto = odPlanovaca ? "kokpit-cron" : (await currentUser(request)) || undefined;
        const hlavicky = { "cache-control": "no-store" };

        if (b.akcia === "stav") return Response.json({ ok: true, ...(await stavPripojenia(DB)) }, { headers: hlavicky });
        if (b.akcia === "api-stav") return Response.json({ ok: true, ...(await stavKluca(DB)) }, { headers: hlavicky });
        if (b.akcia === "api-uloz") {
          const token = String(b.token || "").trim();
          if (!vyzeraAkoKluc(token)) return Response.json({ ok: false, error: "Toto nevyzerá ako kľúč. Skopíruj ho celý z Metricoolu: Nastavenia účtu → API." }, { status: 400 });
          const v = await ulozKluc(DB, token, kto);
          if (!v.ok) return Response.json({ ok: false, error: v.chyba }, { status: 400, headers: hlavicky });
          await audit(DB, { action: "metricool-api-kluc", predmet: "Metricool", neu: "uložený", actor: kto });
          return Response.json({ ok: true, ...(await stavKluca(DB)) }, { headers: hlavicky });
        }
        if (b.akcia === "api-prehlad") {
          const riadky = await prehladApi(DB);
          if (!riadky) return Response.json({ ok: false, error: "API kľúč nie je uložený." }, { status: 409, headers: hlavicky });
          return Response.json({ ok: true, riadky }, { headers: hlavicky });
        }
        if (b.akcia === "konkurenti") return Response.json({ ok: true, konkurenti: await citajKonkurentov(DB) }, { headers: hlavicky });
        if (b.akcia === "konkurenti-nacitaj") {
          const dni = [30, 60, 90].includes(Number(b.dni)) ? Number(b.dni) : 60;
          try {
            const k = await nacitajKonkurentovApi(DB, dni);
            // Zhrnutie je nadstavba: keď Claude neodpovie, čísla sa uložia a povie sa to.
            let vzory = null;
            let upozornenie = "";
            const kluc = bindings().ANTHROPIC_API_KEY;
            if (k.prispevky.length && kluc) {
              try {
                const r = await fetch("https://api.anthropic.com/v1/messages", {
                  method: "POST",
                  headers: { "content-type": "application/json", "x-api-key": kluc, "anthropic-version": "2023-06-01" },
                  body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1500, messages: [{ role: "user", content: zadanieVzorov(k.prispevky) }] }),
                  signal: AbortSignal.timeout(60000),
                });
                const j = (await r.json().catch(() => null)) as { content?: { type?: string; text?: string }[] } | null;
                vzory = vzoryZOdpovede((j?.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join(""));
                if (!vzory) upozornenie = `Čísla sú uložené, zhrnutie vzorov nevyšlo (Claude ${r.status}).`;
              } catch (e) {
                upozornenie = `Čísla sú uložené, zhrnutie vzorov nevyšlo: ${String(e).slice(0, 120)}`;
              }
            }
            const konkurenti = { ...k, vzory };
            await ulozKonkurentov(DB, konkurenti);
            await audit(DB, { action: "konkurenti-nacitani", predmet: "Metricool", neu: `${k.ucty.length} účtov, ${k.prispevky.length} príspevkov, ${dni} dní`, actor: kto });
            return Response.json({ ok: true, konkurenti, upozornenie }, { headers: hlavicky });
          } catch (e) {
            return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502, headers: hlavicky });
          }
        }
        if (b.akcia === "api-zmaz") {
          await zmazKluc(DB);
          await audit(DB, { action: "metricool-api-kluc", predmet: "Metricool", neu: "zmazaný", actor: kto });
          return Response.json({ ok: true }, { headers: hlavicky });
        }
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
            // API, keď je kľúč; inak alebo pri jeho zlyhaní cesta cez MCP, aby noc neostala bez čísel.
            let zApi: Awaited<ReturnType<typeof stiahniMesiacApi>> = null;
            let chybaApi = "";
            try { zApi = await stiahniMesiacApi(DB, mesiac); }
            catch (e) { chybaApi = e instanceof Error ? e.message : String(e); }
            const cezMcp = async () => {
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
              return { reels, posty, stories, vsetky, kanaly, preskocene };
            };
            const { reels, posty, stories, vsetky, kanaly, preskocene } = zApi
              ? { ...zApi, vsetky: [...zApi.reels, ...zApi.posty, ...zApi.stories] as PrispevokMc[] }
              : await cezMcp();
            const zdroj = zApi ? "API" : "MCP";
            if (chybaApi) await audit(DB, { action: "metricool-api-zlyhalo", predmet: mesiac, neu: chybaApi.slice(0, 300), actor: kto });
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
            const vysledok = { reels: reels.length, posty: posty.length, stories: stories.length, metrik: kanaly.length, siete, preskocene, zdroj };
            await audit(DB, { action: "metricool-stiahnute", predmet: mesiac, neu: `${vysledok.reels} reels, ${vysledok.posty} príspevkov, ${vysledok.stories} stories, ${vysledok.metrik} metrík · cez ${zdroj}`, actor: kto });
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
