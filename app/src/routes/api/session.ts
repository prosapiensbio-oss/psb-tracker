import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return Response.json({ authed: await isAuthed(request) });
      },
    },
  },
});
