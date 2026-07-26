import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { loadData } from "../../lib/psb/db.server";
import { EMPTY_DATA } from "../../lib/psb/types";

export const Route = createFileRoute("/api/data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json(EMPTY_DATA);
        const data = await loadData(DB);
        return Response.json(data);
      },
    },
  },
});
