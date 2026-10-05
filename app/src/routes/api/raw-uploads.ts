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
        /**
         * Zoznam súborov jedného druhu — krok „Metricool" v uzávierke ukazuje
         * jednotlivé reporty pod sebou, každý s obdobím a dátumom nahratia.
         */
        const druh = new URL(request.url).searchParams.get("druh") || "";
        if (druh) {
          const rs = await DB.prepare(
            "SELECT filename, uploaded_at FROM raw_uploads WHERE kind = ?1 ORDER BY uploaded_at DESC LIMIT 200",
          ).bind(druh).all().catch(() => ({ results: [] }));
          // Mesačná PDF zostava sa do raw_uploads neukladá — je len v upload_log.
          // `data.uploadLog` nesie posledných 40 riadkov, takže staršia zostava
          // by na obrazovke vyzerala ako nikdy nenahratá.
          const pdf = druh === "metricool"
            ? await DB.prepare("SELECT filename, date FROM upload_log WHERE type = 'kanaly' ORDER BY date DESC LIMIT 1")
              .first<{ filename: string; date: string }>().catch(() => null)
            : null;
          return Response.json({ ok: true, subory: rs.results || [], pdf }, { headers: { "cache-control": "no-store" } });
        }
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
