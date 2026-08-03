import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Mesačné marketingové čísla z nahratých Metricool exportov.
//
// Agreguje sa až tu, z jednotlivých príspevkov — v databáze zostáva vždy riadok
// na príspevok. Keby sa ukladal rovno mesačný súčet, už by sa z neho nedalo
// zistiť, ktorý reel mesiac ťahal, a presne to je otázka, ktorú si Jerry
// kladie.
//
// View rate sa priemeruje len cez reels, ktoré ho majú. Priemerovať ho cez
// posty (ktoré ho nemajú a hlásia nulu) by ho ťahalo k nule a vyzeralo by to
// ako prepad dosahu.
export const Route = createFileRoute("/api/marketing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, mesacne: [], top: [] });
        try {
          const [mes, top, ga4, gscM, gscD, gscS, kan] = await Promise.all([
            DB.prepare(
              `SELECT mesiac,
                      SUM(CASE WHEN druh = 'reel'  THEN 1 ELSE 0 END) AS reels,
                      SUM(CASE WHEN druh = 'post'  THEN 1 ELSE 0 END) AS posty,
                      SUM(CASE WHEN druh = 'story' THEN 1 ELSE 0 END) AS stories,
                      SUM(views) AS views, SUM(dosah) AS dosah,
                      SUM(ulozenia) AS ulozenia, SUM(zdielania) AS zdielania,
                      SUM(spend) AS spend,
                      AVG(CASE WHEN druh = 'reel' AND view_rate > 0 THEN view_rate END) AS view_rate
                 FROM mkt_prispevky GROUP BY mesiac ORDER BY mesiac`,
            ).all(),
            DB.prepare(
              `SELECT mesiac, druh, hook, views, ulozenia, view_rate
                 FROM mkt_prispevky WHERE druh <> 'story'
                ORDER BY ulozenia DESC, views DESC LIMIT 12`,
            ).all(),
            DB.prepare("SELECT * FROM ga4_mesiace ORDER BY mesiac").all().catch(() => ({ results: [] })),
            DB.prepare("SELECT * FROM gsc_mesiace ORDER BY mesiac").all().catch(() => ({ results: [] })),
            DB.prepare("SELECT * FROM gsc_dopyty ORDER BY kliky DESC LIMIT 60").all().catch(() => ({ results: [] })),
            DB.prepare("SELECT * FROM gsc_strany ORDER BY kliky DESC LIMIT 40").all().catch(() => ({ results: [] })),
            DB.prepare("SELECT mesiac, kanal, metrika, hodnota, zmena, poznamka FROM kanaly_mesiace ORDER BY mesiac DESC, kanal, metrika").all().catch(() => ({ results: [] })),
          ]);
          return Response.json({
            ok: true,
            mesacne: (mes.results as Record<string, unknown>[]).map((r) => ({
              m: r.mesiac,
              reels: Number(r.reels) || 0,
              posty: Number(r.posty) || 0,
              stories: Number(r.stories) || 0,
              views: Number(r.views) || 0,
              dosah: Number(r.dosah) || 0,
              ulozenia: Number(r.ulozenia) || 0,
              zdielania: Number(r.zdielania) || 0,
              spend: Number(r.spend) || 0,
              viewRate: Math.round((Number(r.view_rate) || 0) * 10) / 10,
            })),
            top: (top.results as Record<string, unknown>[]).map((r) => ({
              m: r.mesiac, typ: r.druh, hook: r.hook,
              views: Number(r.views) || 0, ulozenia: Number(r.ulozenia) || 0,
              viewRate: Number(r.view_rate) || 0,
            })),
            ga4: (ga4.results as Record<string, unknown>[]).map((r) => ({
              m: r.mesiac, novi: Number(r.novi) || 0,
              organicSearch: Number(r.organic_search) || 0, paidSocial: Number(r.paid_social) || 0,
              organicSocial: Number(r.organic_social) || 0, direct: Number(r.direct) || 0,
              referral: Number(r.referral) || 0, udalosti: Number(r.udalosti) || 0,
            })),
            gscMesacne: (gscM.results as Record<string, unknown>[]).map((r) => {
              const k = Number(r.kliky) || 0, z = Number(r.zobrazenia) || 0;
              return { m: r.mesiac, kliky: k, zobrazenia: z, ctr: z ? Math.round((k / z) * 1000) / 10 : 0 };
            }),
            gscDopyty: (gscD.results as Record<string, unknown>[]).map((r) => ({
              dopyt: r.dopyt, kliky: Number(r.kliky) || 0, zobrazenia: Number(r.zobrazenia) || 0,
              ctr: Number(r.ctr) || 0, pozicia: Number(r.pozicia) || 0,
            })),
            gscStrany: (gscS.results as Record<string, unknown>[]).map((r) => ({
              url: r.url, kliky: Number(r.kliky) || 0, zobrazenia: Number(r.zobrazenia) || 0,
              ctr: Number(r.ctr) || 0, pozicia: Number(r.pozicia) || 0,
            })),
            kanaly: (kan.results as Record<string, unknown>[]).map((r) => ({
              mesiac: r.mesiac, kanal: r.kanal, metrika: r.metrika,
              hodnota: Number(r.hodnota) || 0,
              zmena: r.zmena == null ? null : Number(r.zmena),
              poznamka: r.poznamka || "",
            })),
          });
        } catch {
          // Tabuľka ešte nie je (staršia migrácia) — obrazovka si vystačí s tým,
          // čo má v kóde.
          return Response.json({ ok: false, mesacne: [], top: [], ga4: [], gscMesacne: [], gscDopyty: [], gscStrany: [], kanaly: [] });
        }
      },
    },
  },
});
