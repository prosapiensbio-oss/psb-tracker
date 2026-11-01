import { createFileRoute } from "@tanstack/react-router";

import { currentUser } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser(request);
        // Mená na prihlasovaciu obrazovku. Keď sa nenačítajú, obrazovka ponúkne
        // pole na meno, takže výpadok tu nikoho nenechá bez cesty dnu.
        let pouzivatelia: { login: string; name: string }[] = [];
        try {
          const { DB } = bindings();
          const rs = await DB?.prepare("SELECT login, name FROM users WHERE active = 1 ORDER BY name").all();
          pouzivatelia = ((rs?.results || []) as { login: string; name: string }[]).map((r) => ({ login: r.login, name: r.name }));
        } catch { /* tabuľka ešte nie je */ }
        return Response.json({ authed: user !== null, user, pouzivatelia });
      },
    },
  },
});
