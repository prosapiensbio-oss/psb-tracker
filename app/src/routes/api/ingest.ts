import { createFileRoute } from "@tanstack/react-router";

import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { ingest, type IngestResult } from "../../lib/psb/db.server";

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let files: { filename: string; text: string }[] = [];
        try {
          const body = (await request.json()) as { files?: unknown };
          if (Array.isArray(body.files)) {
            files = body.files
              .filter(
                (f): f is { filename: string; text: string } =>
                  !!f && typeof f.filename === "string" && typeof f.text === "string",
              )
              .slice(0, 12);
          }
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!files.length) return Response.json({ ok: false, error: "no_files" }, { status: 400 });

        const results: IngestResult[] = [];
        for (const f of files) {
          if (f.text.length > 5_000_000) {
            results.push({ filename: f.filename, type: null, added: 0, skipped: 0, error: "Súbor je príliš veľký" });
            continue;
          }
          results.push(await ingest(DB, f.filename, f.text, (await currentUser(request)) || undefined));
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
