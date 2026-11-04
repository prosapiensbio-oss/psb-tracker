import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { knihaZoServera, polozkyBtc, sledujFaktury } from "../../lib/psb/btcImport.server";
import { jeOdPlanovaca } from "../../lib/psb/cronToken.server";

// Sledovanie bitcoinových platieb. Plánovač (POST) sa pýta Blinku na faktúry a obnovuje
// kurz v knihe, Workspace (GET) číta, čo čaká na potvrdenie. Nič z toho nezapisuje do `platby`.
export const Route = createFileRoute("/api/btc-sledovanie")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings() as { DB?: D1Database };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 503 });
        try {
          const polozky = await polozkyBtc(DB);
          if (!polozky) return Response.json({ ok: false, error: "BTC kniha neodpovedala." }, { status: 502 });
          return Response.json({ ok: true, polozky });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const env = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        if (!jeOdPlanovaca(request, env.KAL_CRON_TOKEN || "") && !(await isAuthed(request))) return unauthorized();
        if (!env.DB) return Response.json({ ok: false, error: "no_db" }, { status: 503 });
        try {
          const faktury = await sledujFaktury(env.DB);
          // Čítanie knihy jej zároveň obnoví kurz, rezerva tak nečaká, kým ju niekto otvorí.
          const kniha = await knihaZoServera();
          if (!kniha) return Response.json({ ok: false, error: "BTC kniha neodpovedala.", faktury }, { status: 502 });
          return Response.json({ ok: true, faktury, kurzKedy: kniha.kurzKedy });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
        }
      },
    },
  },
});
