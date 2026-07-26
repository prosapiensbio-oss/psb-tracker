import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { ackAnomaly, unackAnomaly } from "../../lib/psb/db.server";

export const Route = createFileRoute("/api/anomaly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let key = "";
        let note = "";
        let ack = true;
        try {
          const body = (await request.json()) as { key?: unknown; note?: unknown; ack?: unknown };
          key = typeof body.key === "string" ? body.key : "";
          note = typeof body.note === "string" ? body.note : "";
          ack = body.ack !== false;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!key) return Response.json({ ok: false, error: "bad_field" }, { status: 400 });
        if (ack) await ackAnomaly(DB, key, note);
        else await unackAnomaly(DB, key);
        return Response.json({ ok: true });
      },
    },
  },
});
