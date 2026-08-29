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
        /**
         * Zápis ZLUČUJE, neprepisuje celý riadok.
         *
         * Doteraz sa uložil presne ten objekt, ktorý prišiel z formulára —
         * takže neúplný formulár zmazal všetko ostatné. Kľúč, ktorý klient
         * neposlal, zostáva; prázdny reťazec je platná hodnota (vymazanie
         * políčka), lebo ten klient pošle výslovne.
         */
        const stare = await DB.prepare("SELECT data FROM vzas_week_notes WHERE week = ?").bind(week).first<{ data?: string }>();
        let povodne: Record<string, unknown> = {};
        try { povodne = stare?.data ? JSON.parse(stare.data) : {}; } catch { povodne = {}; }
        const zluc = { ...povodne, ...data };
        const novy = JSON.stringify(zluc).slice(0, 6000);
        await DB.prepare(
          `INSERT INTO vzas_week_notes (week, data, updated_at) VALUES (?,?,?)
           ON CONFLICT(week) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
        )
          .bind(week, novy, new Date().toISOString())
          .run();
        /**
         * Predchádzajúca podoba sa odkladá do auditu, nech sa dá vrátiť krok
         * späť. Bez toho sa 29. 8. 2026 prepísaná poznámka nedala obnoviť
         * odnikiaľ — D1 Time Travel vracia celú databázu, nie jeden riadok.
         */
        if (stare?.data && stare.data !== novy) {
          await DB.prepare(
            "INSERT INTO vzas_audit (id, at, actor, action, month, old_value, new_value) VALUES (?,?,?,?,?,?,?)",
          ).bind(crypto.randomUUID(), new Date().toISOString(), "app", "tyzden", week, stare.data, novy).run();
        }
        return Response.json({ ok: true });
      },
    },
  },
});
