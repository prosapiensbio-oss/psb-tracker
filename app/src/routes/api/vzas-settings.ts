import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { rozdelNastavenia } from "../../lib/psb/tajneKluce";
import { bindings } from "../../lib/bindings.server";

// Small key/value store for things the app lets Jerry change and expects to
// survive a redeploy — right now the KPI targets. The table already exists from
// migration 0004; this is the first thing to use it.
//
// Tajomstvá (tajneKluce.ts) tu ležia tiež, ale GET ich nevracia: `settings` ich
// nemá a `nastavene` hovorí len áno/nie. Zapísať sa dajú ďalej cez POST, audit
// ich skryje sám. Server si ich číta priamo z D1.
export const Route = createFileRoute("/api/vzas-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, settings: {}, nastavene: {} });
        try {
          const rs = await DB.prepare("SELECT key, value FROM vzas_settings").all();
          return Response.json({ ok: true, ...rozdelNastavenia(rs.results as { key: string; value: string }[]) });
        } catch {
          return Response.json({ ok: false, settings: {}, nastavene: {} });
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let body: { key?: string; value?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        const key = typeof body.key === "string" ? body.key.slice(0, 64) : "";
        if (!/^[a-z0-9_]+$/.test(key)) return Response.json({ ok: false, error: "bad_key" }, { status: 400 });
        // Radšej odmietnuť než ticho odrezať (nález z testu Jarvisa 11. 8.).
        // `.slice(0, 20000)` reže JSON uprostred reťazca — uloží sa nevalidný
        // JSON, GET ho neparsne a vráti holý string, `Array.isArray` je false,
        // kód si založí prázdne pole a NASLEDUJÚCI zápis to prepíše. Inými
        // slovami: jedno prekročenie limitu = ticho zmazané všetky ciele alebo
        // všetky opravy P&L, bez jedinej hlášky. Tu ide o `ciele` (dnes 4,3 kB
        // a rastie), `pnl_overrides` aj `mkt_znacky`.
        const value = JSON.stringify(body.value ?? null);
        if (value.length > 20000) {
          return Response.json({ ok: false, error: "too_large", limit: 20000, velkost: value.length }, { status: 413 });
        }
        const stare = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(key).first<{ value: string }>();
        await audit(DB, { action: "nastavenie", predmet: key, old: stare?.value, neu: value, actor: await currentUser(request) || undefined });
        await DB.prepare(
          `INSERT INTO vzas_settings (key, value, updated_at) VALUES (?,?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        )
          .bind(key, value, new Date().toISOString())
          .run();
        return Response.json({ ok: true });
      },
    },
  },
});
