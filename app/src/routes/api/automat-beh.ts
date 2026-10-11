import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { zapisBeh } from "../../lib/psb/automaty.server";

/**
 * STAV AUTOMATOV — zapisuje plánovač, číta karta „Zdravie Kokpitu".
 *
 * POST (plánovač, token) { automat, ok, detail, chyba } → zapíše beh
 * GET  (prihlásený)                                     → posledný beh každého
 *
 * Prečo to zapisuje plánovač a nie samotné endpointy: pokusov je desať
 * a každý endpoint má iný tvar. Plánovač je JEDNO miesto, ktoré o všetkých
 * vie a pozná aj výsledok volania — vrátane toho, keď endpoint vôbec
 * neodpovie. Zápis vnútri endpointu by práve ten prípad nezachytil.
 */
export const Route = createFileRoute("/api/automat-beh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        const token = env.KAL_CRON_TOKEN;
        const dany = request.headers.get("x-cron-token") || "";
        if (!token || token.length !== dany.length || token !== dany) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        let b: { automat?: string; ok?: boolean; detail?: string; chyba?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        const automat = String(b.automat || "").slice(0, 60);
        if (!automat) return Response.json({ ok: false, error: "chyba_automat" }, { status: 400 });
        await zapisBeh(env.DB, automat, b.ok !== false, b.detail, b.chyba);
        return Response.json({ ok: true });
      },

      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, behy: [], chybyPrehliadaca: [] });
        try {
          // Posledný beh každého automatu + posledný ÚSPEŠNÝ zvlášť: jedna
          // chyba nie je rozbitý automat (tá istá lekcia ako pri pošte
          // a kalendári), ale týždeň bez úspechu áno.
          const rs = await DB.prepare(`
            SELECT a.automat,
                   MAX(a.kedy) AS kedy,
                   (SELECT ok FROM automaty x WHERE x.automat = a.automat ORDER BY x.kedy DESC LIMIT 1) AS ok,
                   (SELECT detail FROM automaty x WHERE x.automat = a.automat ORDER BY x.kedy DESC LIMIT 1) AS detail,
                   (SELECT chyba FROM automaty x WHERE x.automat = a.automat ORDER BY x.kedy DESC LIMIT 1) AS chyba,
                   (SELECT MAX(kedy) FROM automaty y WHERE y.automat = a.automat AND y.ok = 1) AS poslednyOk
            FROM automaty a GROUP BY a.automat ORDER BY a.automat`).all();
          // Pády v prehliadači za týždeň — o chybe na telefóne inak vie len
          // ten telefón. Ide to tým istým volaním: dve otázky o zdraví appky
          // nemajú byť dve kolá.
          const chyby = await DB.prepare(
            "SELECT at AS kedy, new_value AS sprava FROM vzas_audit WHERE action = 'chyba-prehliadaca' AND at >= ?1 ORDER BY at DESC LIMIT 20",
          ).bind(new Date(Date.now() - 7 * 86400000).toISOString()).all().catch(() => ({ results: [] }));
          return Response.json(
            { ok: true, behy: rs.results || [], chybyPrehliadaca: (chyby.results || []).map((c) => ({ kedy: String((c as { kedy?: string }).kedy || ""), sprava: String((c as { sprava?: string }).sprava || "").slice(0, 160) })) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch {
          return Response.json({ ok: false, behy: [], chybyPrehliadaca: [] });
        }
      },
    },
  },
});
