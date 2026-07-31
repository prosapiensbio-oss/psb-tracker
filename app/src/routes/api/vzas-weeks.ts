import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

export type WeekEntry = Record<string, string>;

export const Route = createFileRoute("/api/vzas-weeks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, weeks: {} });
        try {
          const rs = await DB.prepare("SELECT * FROM vzas_week_notes").all();
          const weeks: Record<string, WeekEntry> = {};
          for (const r of rs.results as any[]) {
            try { weeks[r.week] = r.data ? JSON.parse(r.data) : {}; } catch { weeks[r.week] = {}; }
          }
          return Response.json({ ok: true, weeks });
        } catch {
          return Response.json({ ok: false, weeks: {} });
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let body: { week?: string; data?: WeekEntry };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        const week = typeof body.week === "string" ? body.week.slice(0, 10) : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return Response.json({ ok: false, error: "bad_week" }, { status: 400 });
        const data = body.data && typeof body.data === "object" ? body.data : {};
        await DB.prepare(
          `INSERT INTO vzas_week_notes (week, data, updated_at) VALUES (?,?,?)
           ON CONFLICT(week) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
        )
          .bind(week, JSON.stringify(data).slice(0, 6000), new Date().toISOString())
          .run();
        return Response.json({ ok: true });
      },
    },
  },
});
