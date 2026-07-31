import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// The bitcoin reserve lives in a second app (prosapiens-btc). This does NOT
// fetch it — worker-to-worker calls inside the platform time out (522). Instead
// it mints a short-lived HMAC signature and hands back a URL the BROWSER can
// call. The shared token never leaves this server, and the link expires in a
// minute, so a copied URL is worthless almost immediately.
const SOURCE = "https://prosapiens-btc.higgsfield.app/api/reserve";
const TTL_MS = 60_000;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

export const Route = createFileRoute("/api/btc-reserve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const token = bindings().BTC_RESERVE_TOKEN;
        if (!token) return Response.json({ ok: false, error: "no_token" });
        const exp = Date.now() + TTL_MS;
        const sig = await sign(token, `exp=${exp}`);
        return Response.json({ ok: true, url: `${SOURCE}?exp=${exp}&sig=${sig}` });
      },
    },
  },
});
