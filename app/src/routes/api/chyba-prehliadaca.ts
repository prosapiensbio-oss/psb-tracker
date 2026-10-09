import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";

/**
 * CHYBA Z PREHLIADAČA — zapisuje ju koreňová hranica chýb (9. 10. 2026).
 *
 * Jerry na iPhone videl „This page didn't load" a nikde nebola stopa, čo
 * spadlo; v prehliadači na počítači sa to nedalo zopakovať. Teraz ide správa,
 * prvé riadky stacku, adresa, šírka okna a prehliadač do `vzas_audit`
 * (action `chyba-prehliadaca`). Len pre prihláseného — nič citlivé v tom nie je.
 */
export const Route = createFileRoute("/api/chyba-prehliadaca")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false }, { status: 500 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
        await audit(DB, {
          action: "chyba-prehliadaca",
          predmet: s(b.adresa, 300),
          neu: { sprava: s(b.sprava, 500), stack: s(b.stack, 1500), sirka: Number(b.sirka) || 0, ua: s(b.ua, 200) },
          actor: (await currentUser(request)) || undefined,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
