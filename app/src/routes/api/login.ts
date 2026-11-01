import { createFileRoute } from "@tanstack/react-router";

import { loginPost } from "../../lib/psb/loginApi.server";

// Prihlásenie vlastným kontom. Logika: `lib/psb/loginApi.server.ts`.
export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => loginPost(request),
    },
  },
});
