import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Small key/value store for things the app lets Jerry change and expects to
// survive a redeploy — right now the KPI targets. The table already exists from
// migration 0004; this is the first thing to use it.
export const Route = createFileRoute("/api/vzas-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, settings: {} });
        try {
          const rs = await DB.prepare("SELECT key, value FROM vzas_settings").all();
          const settings: Record<string, unknown> = {};
          for (const r of rs.results as { key: string; value: string }[]) {
            try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
          }
          return Response.json({ ok: true, settings });
        } catch {
          return Response.json({ ok: false, settings: {} });
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
        const value = JSON.stringify(body.value ?? null).slice(0, 20000);
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
