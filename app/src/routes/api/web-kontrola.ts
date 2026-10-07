import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { type NalezKontroly, skontrolujStranku } from "../../lib/psb/webKontrola";

/**
 * Nočná kontrola webu — bod 1 a 3 zo zadania zo 7. 10. 2026.
 *
 * 1. FORMULÁRE SA DAJÚ ODOSLAŤ. Stiahne stránky a `formulare.js` a porovná,
 *    čo formulár na obrazovke posiela, s tým, čo plugin žiada. Nevolá
 *    prehliadač a NEPOSIELA POŠTU — na otázku „sedia polia?" to stačí.
 * 3. DOPYT DÔJDE AŽ DO KOKPITU. Syntetický dopyt posiela plánovač (má
 *    službové prepojenie na Kokpit), sem príde jeho výsledok aj kľúč riadku;
 *    tu sa overí, že riadok v databáze NAOZAJ je, a hneď sa zmaže.
 *
 * Prečo to neposiela dopyt samo: worker, ktorý volá sám seba cez verejnú
 * adresu, je zbytočná slučka a na workers.dev končí 404 (to isté platilo pre
 * kalendár). Plánovač má na to službové prepojenie, tak to robí on.
 */

const DEFAULT_STRANKY = [
  "https://www.prosapiens.cz/uvodni-trenink/",
  "https://www.prosapiens.cz/test-postury/",
  "https://www.prosapiens.cz/kontakt/",
];

const UA = "Mozilla/5.0 (compatible; KokpitKontrola/1.0; +https://prosapiens.cz)";

async function nastavenie(DB: D1Database, kluc: string): Promise<string> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(kluc).first<{ value: string }>();
  if (!r?.value) return "";
  try { return String(JSON.parse(r.value)); } catch { return r.value; }
}

/** Adresa `formulare.js` sa berie zo stránky — aj s `?ver=`, nech sa číta to, čo beží. */
function adresaMosta(html: string): string {
  const m = /<script[^>]+src=["']([^"']*formulare\.js[^"']*)["']/i.exec(html);
  return m ? m[1] : "";
}

export const Route = createFileRoute("/api/web-kontrola")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const posledny = await DB.prepare("SELECT MAX(beh) b FROM web_kontroly").first<{ b: string }>();
        const riadky = posledny?.b
          ? (await DB.prepare("SELECT kluc, nazov, stav, detail, trvanie_ms FROM web_kontroly WHERE beh = ?1 ORDER BY kluc").bind(posledny.b).all()).results
          : [];
        // História len pre to, čo niekedy padlo — zelený riadok z pred mesiaca
        // nikoho nezaujíma, ale „odkedy to nefunguje" je prvá otázka.
        const padlo = (await DB.prepare(
          `SELECT kluc, MIN(beh) od, MAX(beh) do, COUNT(*) kolko FROM web_kontroly
            WHERE stav <> 'ok' AND beh >= datetime('now','-30 days') GROUP BY kluc`,
        ).all()).results;
        return Response.json({ ok: true, beh: posledny?.b || "", riadky, padlo });
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

        const beh = new Date().toISOString();
        const nalezy: (NalezKontroly & { trvanie: number })[] = [];

        // ── 1. Formuláre ───────────────────────────────────────────────────
        const zoznam = await nastavenie(DB, "web_kontrola_stranky");
        let stranky = DEFAULT_STRANKY;
        try { const p = JSON.parse(zoznam || "[]"); if (Array.isArray(p) && p.length) stranky = p.map(String); } catch { /* ostane predvolený */ }

        let js = "";
        let jsOdkial = "";
        for (const adresa of stranky) {
          const zac = Date.now();
          try {
            const r = await fetch(`${adresa}${adresa.includes("?") ? "&" : "?"}kokpit=kontrola`, { headers: { "user-agent": UA } });
            if (!r.ok) {
              nalezy.push({ kluc: `formular:${new URL(adresa).pathname}`, nazov: `Formulár na ${new URL(adresa).pathname}`,
                stav: "chyba", detail: `stránka vrátila HTTP ${r.status} — reklama aj odkazy vedú na niečo, čo sa nenačíta`, trvanie: Date.now() - zac });
              continue;
            }
            const html = await r.text();
            if (!js) {
              const src = adresaMosta(html);
              if (src) {
                jsOdkial = src.startsWith("http") ? src : new URL(src, adresa).toString();
                const rj = await fetch(jsOdkial, { headers: { "user-agent": UA } });
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
            nalezy.push({ kluc: `formular:${adresa}`, nazov: `Formulár na ${adresa}`, stav: "chyba",
              detail: `stránka sa nedá stiahnuť: ${String(e).slice(0, 150)}`, trvanie: Date.now() - zac });
          }
        }

        // ── 3. Dopyt dôjde až do Kokpitu ──────────────────────────────────
        //
        // Plánovač poslal syntetický dopyt na /api/lead-web. Dôkaz nie je jeho
        // odpoveď (tú by vrátil aj endpoint, ktorý nič nezapíše), ale RIADOK
        // v databáze. Overí sa a hneď sa maže — v Dopytoch po ňom nesmie nič
        // ostať, inak si Jerry ráno myslí, že prišiel dopyt.
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

        const now = new Date().toISOString();
        for (const n of nalezy) {
          await DB.prepare(
            `INSERT INTO web_kontroly (id, beh, kluc, nazov, stav, detail, trvanie_ms, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(id) DO UPDATE SET stav = excluded.stav, detail = excluded.detail, trvanie_ms = excluded.trvanie_ms`,
          ).bind(`${beh}|${n.kluc}`, beh, n.kluc, n.nazov, n.stav, n.detail.slice(0, 900), n.trvanie, now).run();
        }

        const zle = nalezy.filter((n) => n.stav !== "ok");
        return Response.json({
          ok: true, beh, most: jsOdkial,
          kontrol: nalezy.length, chyb: zle.length,
          nalezy: nalezy.map((n) => ({ kluc: n.kluc, stav: n.stav, detail: n.detail })),
        });
      },
    },
  },
});
