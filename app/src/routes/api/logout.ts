import { createFileRoute } from "@tanstack/react-router";

import { clearCookie } from "../../lib/psb/auth.server";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
      },
    },
  },
});
