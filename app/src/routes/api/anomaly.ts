import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { ackAnomaly, unackAnomaly } from "../../lib/psb/db.server";

export const Route = createFileRoute("/api/anomaly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let key = "";
        let note = "";
        let ack = true;
        try {
          const body = (await request.json()) as { key?: unknown; note?: unknown; ack?: unknown };
          key = typeof body.key === "string" ? body.key : "";
          note = typeof body.note === "string" ? body.note : "";
          ack = body.ack !== false;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!key) return Response.json({ ok: false, error: "bad_field" }, { status: 400 });
        // Autor sa berie z prihlásenia, nie z tela požiadavky — kto odpovedal,
        // nemá byť vec toho, čo pošle prehliadač.
        const kto = (await currentUser(request)) || "";
        if (ack) await ackAnomaly(DB, key, note, kto);
        else await unackAnomaly(DB, key);
        /*
         * ZÁVER Z DEBATY: odpoveď ho zavrie aj v Jarvisovej pamäti (9. 10. 2026).
         * Dovtedy „Vybavené" len schovalo riadok a v `jarvis_zavery` záver
         * ostal otvorený — Jarvis ho viedol ako nevyriešený a zavretie záviselo
         * od toho, či zareaguje na tichú správu. Odloženie záver nezatvára;
         * vrátenie odpovede ho znova otvorí.
         */
        if (key.startsWith("zaver|")) {
          const id = key.slice(6);
          const realna = ack && note && !note.startsWith("odlozene|");
          if (realna) {
            await DB.prepare("UPDATE jarvis_zavery SET stav = 'vybavene', vysledok = COALESCE(NULLIF(vysledok, ''), ?2) WHERE id = ?1 AND stav = 'otvoreny'")
              .bind(id, note.slice(0, 800)).run().catch(() => null);
          } else if (!ack) {
            await DB.prepare("UPDATE jarvis_zavery SET stav = 'otvoreny' WHERE id = ?1 AND stav = 'vybavene'").bind(id).run().catch(() => null);
          }
        }
        await audit(DB, { action: ack ? "skrytie-signalu" : "vratenie-signalu", predmet: key, reason: note || undefined, actor: kto || undefined });
        return Response.json({ ok: true });
      },
    },
  },
});
