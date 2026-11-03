import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { dnesPraha } from "../../lib/psb/cas";

/**
 * ČO VIE KOKPIT A STRIŽŇA NIE (Jerry, 3. 11. 2026: „Strižňa by mala byť
 * oboznámená so štatistikami"). Strižňa si výsledky príspevkov berie z Metricoolu
 * sama. Odtiaľto dostane to, čo vidí len firma: dopyty, reklamu, hľadania na
 * Googli a vzory konkurentov. Len ProSapiens; osobné účty v Kokpite nie sú.
 * Prístup tokenom Strižne (x-strizna-token), bez mien a kontaktov.
 */
export const Route = createFileRoute("/api/strizna/statistiky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const dnes = dnesPraha();
        const mesiac = (spat: number) => {
          const [r, m] = dnes.split("-").map(Number);
          const d = new Date(Date.UTC(r, m - 1 - spat, 1));
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        };
        const riadky = async (sql: string, ...p: unknown[]) =>
          ((await DB.prepare(sql).bind(...p).all().catch(() => null))?.results || []) as Record<string, unknown>[];
        const [dopyty, reklama, hladania, kanaly, konk] = await Promise.all([
          riadky("SELECT substr(date,1,7) mesiac, source zdroj, COUNT(*) pocet FROM leads WHERE date >= ?1 GROUP BY 1,2 ORDER BY 1 DESC, 3 DESC", `${mesiac(5)}-01`),
          riadky("SELECT mesiac, ROUND(SUM(spend)) vydaj FROM mkt_kampane WHERE mesiac >= ?1 GROUP BY 1 ORDER BY 1 DESC", mesiac(5)),
          riadky("SELECT dopyt, kliky, zobrazenia, pozicia FROM gsc_dopyty ORDER BY zobrazenia DESC LIMIT 15"),
          riadky("SELECT mesiac, metrika, hodnota FROM kanaly_mesiace WHERE kanal = 'Instagram' AND mesiac >= ?1 AND metrika IN ('Followers','Followers balance','Views','Reach','Saved','Shares') ORDER BY mesiac DESC", mesiac(2)),
          riadky("SELECT value FROM vzas_settings WHERE key = 'mkt_konkurenti'"),
        ]);
        let vzoryKonkurentov: unknown = null;
        try { vzoryKonkurentov = (JSON.parse(String(konk[0]?.value || "null")) as { vzory?: unknown } | null)?.vzory ?? null; } catch { /* bez vzorov */ }
        return Response.json({ ok: true, zistene: new Date().toISOString(), dopyty, reklama, hladania, instagram: kanaly, vzoryKonkurentov }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
