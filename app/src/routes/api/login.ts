import { createFileRoute } from "@tanstack/react-router";

import { sessionCookie, verifyPassword } from "../../lib/psb/auth.server";

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let password = "";
        try {
          const body = (await request.json()) as { password?: unknown };
          password = typeof body.password === "string" ? body.password : "";
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!(await verifyPassword(password))) {
          return Response.json({ ok: false, error: "invalid" }, { status: 401 });
        }
        return Response.json({ ok: true }, { headers: { "Set-Cookie": await sessionCookie() } });
      },
    },
  },
});
