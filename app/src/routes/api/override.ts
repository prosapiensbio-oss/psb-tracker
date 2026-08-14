import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
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
  "narodeniny",
  "prvyKontakt",
  "v6m",
  "precoNeprisiel",
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
        // Stála poznámka sa prepisuje — ale poznámky v čase sú príbeh klienta,
        // nie smetisko. Pred prepisom sa stará verzia odloží do denníka
        // (client_notes), takže sa nedá nič stratiť ani nechtiac.
        if (key === "trainerNote") {
          try {
            const stara = await DB.prepare("SELECT trainer_note FROM client_overrides WHERE name = ?1")
              .bind(name).first<{ trainer_note: string | null }>();
            const stary = (stara?.trainer_note || "").trim();
            const novy = String(value ?? "").trim();
            if (stary && stary !== novy) {
              await DB.prepare(
                "INSERT INTO client_notes (id, client_name, note, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
              ).bind(crypto.randomUUID(), name, `Stála poznámka predtým: ${stary}`, (await currentUser(request)) || "app", new Date().toISOString()).run();
            }
          } catch { /* denník je poistka — jeho výpadok nesmie zablokovať uloženie */ }
        }
        await setOverride(DB, name, key as keyof ClientOverride, value);
        await audit(DB, { action: "uprava-klienta", predmet: `${name} · ${key}`, neu: value, actor: await currentUser(request) || undefined });
        return Response.json({ ok: true });
      },
    },
  },
});
