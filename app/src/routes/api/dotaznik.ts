import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { MIN_ODPOVEDI, vysledkyDotazniku, type OdpovedDotazniku } from "../../lib/psb/dotaznik";
import { otvoreneKolo } from "../../lib/psb/dotaznik.server";

/**
 * ANONYMNÝ DOTAZNÍK — stav kola a výsledky pre Kokpit (9. 10. 2026).
 *
 *   GET                       → kolá, koľko odkazov odišlo, koľko odpovedalo,
 *                               výsledky (až od 5 odpovedí), kto NEODPOVEDAL
 *                               (pre pripomienku — kto čo napísal sa nevie)
 *   POST { akcia: "uzavri" }  → uzavrie otvorené kolo; ďalšia SMS založí nové
 *
 * Odkazy sa nezakladajú tu, ale pri odoslaní SMS (`/api/sms` s `dotaznik`):
 * odkaz bez odoslanej správy by v počte „odišlo" klamal.
 */
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

export const Route = createFileRoute("/api/dotaznik")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const kola = await DB.prepare("SELECT id, nazov, created_at, uzavrete_at FROM dotaznik_kola ORDER BY created_at DESC LIMIT 12")
          .all<{ id: string; nazov: string; created_at: string; uzavrete_at: string | null }>().catch(() => null);
        if (!kola) return chyba("Chýba tabuľka dotazníka (migrácia 0106).", 500);
        const ziadane = new URL(request.url).searchParams.get("kolo");
        const kolo = (kola.results || []).find((k) => k.id === ziadane) || (kola.results || [])[0] || null;
        if (!kolo) return Response.json({ ok: true, kola: [], kolo: null }, { headers: { "cache-control": "no-store" } });
        const [odkazy, odpovede] = await Promise.all([
          DB.prepare("SELECT klient, pouzity FROM dotaznik_odkazy WHERE kolo = ?1").bind(kolo.id).all<{ klient: string; pouzity: number }>(),
          DB.prepare("SELECT odpovede_json FROM dotaznik_odpovede WHERE kolo = ?1").bind(kolo.id).all<{ odpovede_json: string }>(),
        ]);
        const o: OdpovedDotazniku[] = [];
        for (const r of odpovede.results || []) { try { o.push(JSON.parse(r.odpovede_json)); } catch { /* poškodený riadok sa preskočí */ } }
        const odk = odkazy.results || [];
        return Response.json({
          ok: true,
          kola: kola.results,
          kolo,
          odislo: odk.length,
          odpovedalo: o.length,
          minOdpovedi: MIN_ODPOVEDI,
          // Kto ešte NEODPOVEDAL — na pripomienku. Kto odpovedal ČO, sa nedá zistiť.
          neodpovedali: odk.filter((r) => !r.pouzity).map((r) => r.klient).sort((a, b) => a.localeCompare(b, "cs")),
          vysledky: vysledkyDotazniku(o),
        }, { headers: { "cache-control": "no-store" } });
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const b = (await request.json().catch(() => ({}))) as { akcia?: string };
        if (b.akcia === "uzavri") {
          const k = await otvoreneKolo(DB);
          if (!k) return chyba("Žiadne otvorené kolo.");
          await DB.prepare("UPDATE dotaznik_kola SET uzavrete_at = ?2 WHERE id = ?1").bind(k.id, new Date().toISOString()).run();
          const kto = (await currentUser(request)) || "";
          await audit(DB, { action: "dotaznik-uzavrety", predmet: k.id, neu: k.nazov, actor: kto });
          return Response.json({ ok: true });
        }
        return chyba("Neznáma akcia.");
      },
    },
  },
});
