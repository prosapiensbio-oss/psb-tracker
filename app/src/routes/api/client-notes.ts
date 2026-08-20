import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Denník klienta — append-only.
//
//   GET  ?name=…        → zápisy klienta, najnovší prvý
//   POST { name, note } → pridá zápis (autor = prihlásený)
//
// Mazanie zámerne neexistuje. Denník, z ktorého sa dá mazať, nie je denník —
// je to len pomalšie prepisovateľné pole.
const uid = () => crypto.randomUUID();

export const Route = createFileRoute("/api/client-notes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, zapisy: [] });
        const name = new URL(request.url).searchParams.get("name") || "";
        if (!name) return Response.json({ ok: false, zapisy: [] });
        try {
          const rs = await DB.prepare(
            "SELECT id, note, author, created_at FROM client_notes WHERE client_name = ?1 ORDER BY created_at DESC LIMIT 100",
          ).bind(name).all();
          return Response.json({
            ok: true,
            zapisy: (rs.results as Record<string, unknown>[]).map((r) => ({
              id: r.id, note: r.note, autor: r.author, kedy: r.created_at,
            })),
          });
        } catch {
          return Response.json({ ok: false, zapisy: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { name?: string; note?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const name = String(b.name || "").trim();
        const note = String(b.note || "").trim().slice(0, 2000);
        if (!name || !note) return Response.json({ ok: false, error: "empty" }, { status: 400 });

        const autor = (await currentUser(request)) || "app";
        const now = new Date().toISOString();
        // try/catch ako ostatné POST handlery (merania, napady): výnimka z D1
        // by inak vyletela ako neJSON 500 a klientov r.json() by ju prehltol —
        // zápis by zmizol úplne bez stopy (revízia 19. 8. 2026).
        try {
          await DB.prepare(
            "INSERT INTO client_notes (id, client_name, note, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
          ).bind(uid(), name, note, autor, now).run();
        } catch (e) {
          return Response.json({ ok: false, error: `Zápis sa neuložil: ${String(e).slice(0, 200)}` }, { status: 500 });
        }
        await audit(DB, { action: "dennik-zapis", predmet: name, neu: note.slice(0, 120), actor: autor });
        return Response.json({ ok: true });
      },
    },
  },
});
