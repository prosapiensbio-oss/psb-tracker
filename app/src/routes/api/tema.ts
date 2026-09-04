import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { temaDna } from "../../lib/psb/temaDna";

// Téma na dnešné hovorené video — to isté, čo ide v rannej push.
//
// Jerry, 4. 9. 2026: „ja som tam nič nevidel medzi mojimi notifikáciami nejaký
// návrh na tému." Push sa dá prehliadnuť; appka ju teraz ukáže aj v registri
// celý deň. Endpoint drží ťažký dopyt (gads_dopyty) na serveri — do klienta
// by 16 000 riadkov nepatrilo.
export const Route = createFileRoute("/api/tema")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false });
        try {
          const [hl, np] = await DB.batch([
            DB.prepare("SELECT dopyt, zobrazenia FROM gads_dopyty WHERE LENGTH(dopyt) > 14 ORDER BY zobrazenia DESC LIMIT 150"),
            DB.prepare("SELECT text, zdroj FROM mkt_napady WHERE TRIM(COALESCE(text,'')) <> '' ORDER BY id DESC LIMIT 60"),
          ]);
          const tema = temaDna({
            hladania: hl.results as unknown as { dopyt: string; zobrazenia: number }[],
            napady: (np.results as unknown as { text: string; zdroj?: string }[]).map((n) => ({ text: n.text, druh: n.zdroj })),
          });
          return Response.json({ ok: true, ...tema });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) });
        }
      },
    },
  },
});
