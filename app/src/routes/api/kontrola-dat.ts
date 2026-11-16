import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { jeOdPlanovaca } from "../../lib/psb/cronToken.server";
import { spustiKontroluDat, zapisKontroluDat } from "../../lib/psb/nocnaKontrola.server";

/**
 * Nočná kontrola dát (Jerry, 16. 11. 2026) — pravidlá v `nocnaKontrola.ts`.
 *
 * Plánovač ju púšťa s tokenom a výsledok sa zapíše (`kontrola_dat`), odkiaľ
 * ho číta register. Prihlásený človek smie len skúšku (`?skuska=1`): spočíta
 * a vráti nálezy, nič nezapíše.
 */
export const Route = createFileRoute("/api/kontrola-dat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        const skuska = new URL(request.url).searchParams.get("skuska") === "1";
        const odPlanovaca = jeOdPlanovaca(request, env.KAL_CRON_TOKEN);
        if (!odPlanovaca && !(await isAuthed(request))) return unauthorized();
        const DB = env.DB;
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const v = await spustiKontroluDat(DB);
          // Prihlásený človek bez `skuska` smie tiež zapísať — tlačidlo
          // „skontrolovať teraz" po oprave mena nemusí čakať do rána.
          if (!skuska) await zapisKontroluDat(DB, v);
          return Response.json({ ok: true, skuska, beh: v.beh, pocet: v.nalezy.length, nalezy: v.nalezy }, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          return Response.json({ ok: false, error: `Kontrola dát spadla: ${String(e instanceof Error ? e.message : e).slice(0, 300)}` }, { status: 500 });
        }
      },
    },
  },
});
