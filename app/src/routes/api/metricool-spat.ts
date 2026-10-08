import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { dokonciPripojenie } from "../../lib/psb/metricool.server";

// Návrat z povolenia v Metricoole. Vymení kód za tokeny a vráti človeka
// do Workspace s vetou, ako to dopadlo (`?metricool=ok|chyba`).
export const Route = createFileRoute("/api/metricool-spat")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        const u = new URL(request.url);
        const spat = (q: string) => new Response(null, { status: 302, headers: { location: `/?${q}#workspace`, "cache-control": "no-store" } });
        if (!DB) return spat("metricool=chyba&dovod=no_db");
        const chyba = u.searchParams.get("error");
        if (chyba) return spat(`metricool=chyba&dovod=${encodeURIComponent((u.searchParams.get("error_description") || chyba).slice(0, 200))}`);
        try {
          await dokonciPripojenie(DB, u.searchParams.get("code") || "", u.searchParams.get("state") || "");
          await audit(DB, { action: "metricool-pripojeny", predmet: "Metricool", actor: (await currentUser(request)) || undefined });
          return spat("metricool=ok");
        } catch (e) {
          return spat(`metricool=chyba&dovod=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "chyba")}`);
        }
      },
    },
  },
});
