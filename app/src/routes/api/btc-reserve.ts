import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// The bitcoin reserve lives in a second app (prosapiens-btc). This proxies its
// read-only /api/reserve so the Tracker's browser never sees the shared token
// and the two apps stay independent — if the BTC app is down, the card simply
// says so instead of breaking the page.
const SOURCE = "https://prosapiens-btc.higgsfield.app/api/reserve";

export type BtcReserve = {
  sats: number;
  czk: number | null;
  rateCzkPerBtc: number | null;
  rateUpdatedAt: string | null;
  goalSats: number | null;
  generatedAt: string;
};

export const Route = createFileRoute("/api/btc-reserve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const token = bindings().BTC_RESERVE_TOKEN;
        if (!token) return Response.json({ ok: false, error: "no_token" });
        try {
          const r = await fetch(SOURCE, { headers: { authorization: `Bearer ${token}` } });
          if (!r.ok) return Response.json({ ok: false, error: `source_${r.status}` });
          const j = (await r.json()) as BtcReserve & { ok?: boolean };
          return Response.json({ ok: true, reserve: j });
        } catch (e) {
          return Response.json({ ok: false, error: "unreachable", detail: String(e).slice(0, 200) });
        }
      },
    },
  },
});
