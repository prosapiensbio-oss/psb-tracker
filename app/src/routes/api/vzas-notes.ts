import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

export type MonthNote = { month: string; note: string; answers: Record<string, string>; updatedAt?: string };

export const Route = createFileRoute("/api/vzas-notes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, notes: {} });
        try {
          const rs = await DB.prepare("SELECT * FROM vzas_month_notes").all();
          const notes: Record<string, MonthNote> = {};
          for (const r of rs.results as any[]) {
            let answers: Record<string, string> = {};
            try { answers = r.answers ? JSON.parse(r.answers) : {}; } catch { /* keep empty */ }
            notes[r.month] = { month: r.month, note: r.note || "", answers, updatedAt: r.updated_at };
          }
          return Response.json({ ok: true, notes });
        } catch {
          return Response.json({ ok: false, notes: {} });
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let body: { month?: string; note?: string; answers?: Record<string, string>; actor?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        const month = typeof body.month === "string" ? body.month.slice(0, 7) : "";
        if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ ok: false, error: "bad_month" }, { status: 400 });
        const note = typeof body.note === "string" ? body.note.slice(0, 8000) : "";
        const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
        await DB.prepare(
          `INSERT INTO vzas_month_notes (month, note, answers, updated_by, updated_at)
           VALUES (?,?,?,?,?)
           ON CONFLICT(month) DO UPDATE SET note=excluded.note, answers=excluded.answers,
             updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
        )
          .bind(month, note, JSON.stringify(answers).slice(0, 12000), body.actor ?? null, new Date().toISOString())
          .run();
        return Response.json({ ok: true });
      },
    },
  },
});
