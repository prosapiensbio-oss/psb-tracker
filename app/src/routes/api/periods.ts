import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Uzávierky mesiacov + čítanie auditu.
//
// GET  → { periods: [...], audit: [...] }
// POST { month: "2026-07", locked: true, note?: "" }
//
// Zamykanie samo o sebe nič nepočíta — je to sľub, že sa s tým mesiacom už
// nehýbe. Vymáha ho import (ingest), ktorý riadky z uzavretých mesiacov
// preskočí a povie o tom.
export const Route = createFileRoute("/api/periods")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, periods: [], audit: [] });
        try {
          const [p, a] = await Promise.all([
            DB.prepare("SELECT month, locked, locked_at, note FROM vzas_periods ORDER BY month DESC").all(),
            DB.prepare(
              "SELECT at, actor, action, payment_id, month, old_value, new_value, reason FROM vzas_audit ORDER BY at DESC LIMIT 200",
            ).all(),
          ]);
          return Response.json({
            ok: true,
            periods: (p.results as Record<string, unknown>[]).map((r) => ({
              month: r.month, locked: !!r.locked, lockedAt: r.locked_at, note: r.note || "",
            })),
            audit: (a.results as Record<string, unknown>[]).map((r) => ({
              at: r.at, actor: r.actor, action: r.action, predmet: r.payment_id,
              month: r.month, old: r.old_value, neu: r.new_value, reason: r.reason,
            })),
          });
        } catch {
          return Response.json({ ok: false, periods: [], audit: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { month?: string; locked?: boolean; note?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const month = String(b.month || "");
        if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ ok: false, error: "bad_month" }, { status: 400 });
        const locked = b.locked ? 1 : 0;
        const note = String(b.note || "").slice(0, 400);
        const now = new Date().toISOString();

        const stare = await DB.prepare("SELECT locked FROM vzas_periods WHERE month = ?1").bind(month).first<{ locked: number }>();
        await DB.prepare(
          `INSERT INTO vzas_periods (month, locked, locked_by, locked_at, note) VALUES (?1, ?2, 'app', ?3, ?4)
           ON CONFLICT(month) DO UPDATE SET locked = ?2, locked_at = ?3, note = ?4`,
        ).bind(month, locked, now, note).run();

        await audit(DB, {
          action: locked ? "zamknutie-obdobia" : "odomknutie-obdobia",
          predmet: month, month,
          old: stare ? (stare.locked ? "zamknuté" : "otvorené") : "otvorené",
          neu: locked ? "zamknuté" : "otvorené",
          reason: note || undefined,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
