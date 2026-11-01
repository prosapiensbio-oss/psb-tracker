import { createFileRoute } from "@tanstack/react-router";

import { kontaGet, kontaPost } from "../../lib/psb/kontaApi.server";

// Správa kont. Kto smie čo: `lib/psb/kontaPrava.ts`.
export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => kontaGet(request),
      POST: async ({ request }) => kontaPost(request),
    },
  },
});
