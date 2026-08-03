import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

const SOURCES = ["referencia", "mail", "web", "google", "instagram", "ine"];
const STATUSES = ["novy", "neodpisal", "dohodnuty", "zruseny"];

export const Route = createFileRoute("/api/leads")({
  server: {
    handlers: {
      // Upsert one enquiry (id supplied by the client so edits are idempotent).
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try {
          b = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        const id = typeof b.id === "string" && b.id ? b.id.slice(0, 64) : crypto.randomUUID();
        if (b.remove === true) {
          await DB.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
          await audit(DB, { action: "zmazanie-dopytu", predmet: id, actor: await currentUser(request) || undefined });
          return Response.json({ ok: true, id });
        }
        const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10);
        const source = SOURCES.includes(String(b.source)) ? String(b.source) : "ine";
        const status = STATUSES.includes(String(b.status)) ? String(b.status) : "novy";
        await DB.prepare(
          `INSERT INTO leads (id,date,name,source,referrer,status,note,created_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET date=excluded.date, name=excluded.name, source=excluded.source,
             referrer=excluded.referrer, status=excluded.status, note=excluded.note`,
        )
          .bind(
            id,
            date,
            String(b.name ?? "").slice(0, 120),
            source,
            String(b.referrer ?? "").slice(0, 120),
            status,
            String(b.note ?? "").slice(0, 500),
            new Date().toISOString(),
          )
          .run();
        return Response.json({ ok: true, id });
      },
    },
  },
});
