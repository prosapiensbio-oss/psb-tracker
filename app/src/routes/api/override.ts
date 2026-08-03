import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { setOverride } from "../../lib/psb/db.server";
import type { ClientOverride } from "../../lib/psb/types";

const ALLOWED = new Set<keyof ClientOverride>([
  "status",
  "specialRate",
  "specialRateNote",
  "trainerNote",
  "contractSigned",
  "primaryTrainer",
  "bitcoin",
  "duch",
  "zdroj",
  "zdrojKto",
]);

export const Route = createFileRoute("/api/override")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let name = "";
        let key = "";
        let value: unknown;
        try {
          const body = (await request.json()) as { name?: unknown; key?: unknown; value?: unknown };
          name = typeof body.name === "string" ? body.name : "";
          key = typeof body.key === "string" ? body.key : "";
          value = body.value;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!name || !ALLOWED.has(key as keyof ClientOverride)) {
          return Response.json({ ok: false, error: "bad_field" }, { status: 400 });
        }
        await setOverride(DB, name, key as keyof ClientOverride, value);
        await audit(DB, { action: "uprava-klienta", predmet: `${name} · ${key}`, neu: value });
        return Response.json({ ok: true });
      },
    },
  },
});
