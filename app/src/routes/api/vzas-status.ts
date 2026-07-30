import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Read-only health check for the VZAS schema: confirms the migration landed and
// reports how much is in each table. Used to verify a deploy, and later by the
// Import screen to show what is still waiting for confirmation.
const TABLES = [
  "vzas_payments",
  "vzas_payment_splits",
  "vzas_rules",
  "vzas_audit",
  "vzas_periods",
  "vzas_salary_params",
  "vzas_settings",
];

export const Route = createFileRoute("/api/vzas-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" });

        const tables: Record<string, number | string> = {};
        for (const t of TABLES) {
          try {
            const r = await DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>();
            tables[t] = r?.n ?? 0;
          } catch {
            tables[t] = "missing";
          }
        }
        const pending = typeof tables.vzas_payments === "number"
          ? (await DB.prepare("SELECT COUNT(*) AS n FROM vzas_payments WHERE status = 'pending'").first<{ n: number }>())?.n ?? 0
          : 0;
        return Response.json({ ok: !Object.values(tables).includes("missing"), tables, pending });
      },
    },
  },
});
