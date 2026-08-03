import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Prehľad uložených marketingových exportov — bez obsahu, len čo a kedy.
// Slúži na jedinú vec: aby bolo v zozname zdrojov vidieť, či niečo prišlo a
// pokiaľ sú dáta. Samotné súbory sa zatiaľ nespracúvajú.
export const Route = createFileRoute("/api/raw-uploads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, subory: [] });
        try {
          const rs = await DB.prepare(
            "SELECT kind, COUNT(*) n, MAX(uploaded_at) posledny, SUM(bytes) bajtov FROM raw_uploads GROUP BY kind",
          ).all();
          return Response.json({
            ok: true,
            subory: (rs.results as Record<string, unknown>[]).map((r) => ({
              druh: r.kind, pocet: r.n, posledny: r.posledny, bajtov: r.bajtov,
            })),
          });
        } catch {
          return Response.json({ ok: false, subory: [] });
        }
      },
    },
  },
});
