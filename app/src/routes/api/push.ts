import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { posli, type Odber } from "../../lib/psb/push.server";

// Odbery notifikácií na telefón.
//
//   GET                       → verejný VAPID kľúč (potrebuje ho prehliadač
//                               pri prihlásení na odber) + počet mojich odberov
//   POST { subscription }     → zapíše odber tohto zariadenia
//   POST { test: true }       → pošle skúšobnú notifikáciu na moje zariadenia
//   DELETE ?endpoint=…        → odhlási zariadenie
//
// Súkromný kľúč neopustí server ani raz — GET vracia výhradne verejný.

const KONTAKT = "mailto:prosapiensbio@gmail.com";

async function kluce(DB: D1Database) {
  const rs = await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all();
  const m: Record<string, string> = {};
  for (const r of rs.results as { key: string; value: string }[]) m[r.key] = r.value;
  return { verejny: m.vapid_public || "", sukromny: m.vapid_private || "", kontakt: KONTAKT };
}

export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false });
        const k = await kluce(DB);
        const kto = (await currentUser(request)) || "";
        const rs = await DB.prepare("SELECT COUNT(*) n FROM push_odbery WHERE kto = ?1").bind(kto).first<{ n: number }>();
        return Response.json({ ok: !!k.verejny, verejnyKluc: k.verejny, mojich: rs?.n ?? 0 });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; zariadenie?: string; test?: boolean };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const kto = (await currentUser(request)) || "app";

        // Skúšobná notifikácia. Je to jediný spôsob, ako si človek overí, že
        // mu to naozaj chodí — bez nej sa to zistí až tým, že raz niečo
        // nepríde, a vtedy sa už nedá povedať, či je chyba v odbere alebo
        // sa len nič nedialo.
        if (b.test) {
          const k = await kluce(DB);
          if (!k.verejny || !k.sukromny) return Response.json({ ok: false, error: "chybaju_kluce" }, { status: 500 });
          const rs = await DB.prepare("SELECT endpoint, p256dh, auth FROM push_odbery WHERE kto = ?1").bind(kto).all();
          const odbery = rs.results as unknown as Odber[];
          if (!odbery.length) return Response.json({ ok: false, error: "ziadne_odbery" });
          const vysledky = await Promise.all(odbery.map(async (o) => {
            const v = await posli(o, { titulok: "Kokpit", text: "Skúšobná notifikácia — funguje to.", url: "/#dashboard", znacka: "test" }, k);
            await uprac(DB, o.endpoint, v);
            return { status: v.status, ok: v.ok, chyba: v.chyba };
          }));
          return Response.json({ ok: vysledky.some((v) => v.ok), poslane: vysledky.length, vysledky });
        }

        const s = b.subscription;
        const endpoint = String(s?.endpoint || "").trim();
        const p256dh = String(s?.keys?.p256dh || "").trim();
        const auth = String(s?.keys?.auth || "").trim();
        if (!endpoint || !p256dh || !auth) return Response.json({ ok: false, error: "neuplny_odber" }, { status: 400 });

        try {
          await DB.prepare(
            `INSERT INTO push_odbery (endpoint, p256dh, auth, kto, zariadenie, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
               kto = excluded.kto, zariadenie = excluded.zariadenie, chyba = NULL`,
          ).bind(endpoint, p256dh, auth, kto, String(b.zariadenie || "").slice(0, 120), new Date().toISOString()).run();
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false });
        const endpoint = new URL(request.url).searchParams.get("endpoint") || "";
        if (!endpoint) return Response.json({ ok: false, error: "chyba_endpoint" }, { status: 400 });
        await DB.prepare("DELETE FROM push_odbery WHERE endpoint = ?1").bind(endpoint).run();
        return Response.json({ ok: true });
      },
    },
  },
});

/** Mŕtvy odber zmaž, živému zapíš, kedy naposledy prešiel. */
export async function uprac(DB: D1Database, endpoint: string, v: { ok: boolean; mrtvy: boolean; chyba?: string }) {
  if (v.mrtvy) { await DB.prepare("DELETE FROM push_odbery WHERE endpoint = ?1").bind(endpoint).run(); return; }
  await DB.prepare("UPDATE push_odbery SET posledne_ok = ?2, chyba = ?3 WHERE endpoint = ?1")
    .bind(endpoint, v.ok ? new Date().toISOString() : null, v.ok ? null : (v.chyba || "chyba")).run();
}
