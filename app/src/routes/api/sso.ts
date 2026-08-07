import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, sessionCookie } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Prechod medzi Kokpitom a bitcoinovou knihou bez druhého prihlasovania.
//
// Dve appky, dve heslá. Na cudzom počítači to znamenalo prihlásiť sa dvakrát
// a druhé heslo mať po ruke. Obe appky ale už zdieľajú jedno tajomstvo
// (BTC_RESERVE_TOKEN / RESERVE_TOKEN), ktorým si dnes podpisujú dopyt na
// rezervu — a tým istým sa dá podpísať aj „tento človek je overený".
//
// Čo ide po drôte je PODPIS, nie heslo. Kto ho zachytí, má šesťdesiat sekúnd
// a potom je bezcenný; heslo z neho nevyčíta.
//
// GET  ?exp&sig       — príchod Z bitcoinovej knihy: overí podpis, založí
//                       session Kokpitu a presmeruje na hlavnú stránku.
// GET  ?vytvor=1      — odchod DO knihy: prihlásený človek si vypýta podpísaný
//                       odkaz. Podpis sa mintuje na serveri, token teda
//                       prehliadač nikdy neuvidí.
//
// Správy sú pre každý smer INÉ (`sso-kokpit=` vs `sso-btc=`) a obe sa líšia od
// `exp=` použitého pri rezerve. Podpis z jedného účelu tak nejde použiť na
// druhý — inak by odkaz na čítanie rezervy odomykal appku.
const BTC_APP = "https://prosapiens-btc.higgsfield.app";
const TTL_MS = 60_000;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

function rovnake(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const Route = createFileRoute("/api/sso")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = bindings().BTC_RESERVE_TOKEN;
        if (!token) return Response.json({ ok: false, error: "no_token" }, { status: 503 });
        const q = new URL(request.url).searchParams;

        // ── Odchod do knihy ────────────────────────────────────────────────
        if (q.get("vytvor") === "1") {
          if (!(await isAuthed(request))) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          const exp = Date.now() + TTL_MS;
          const sig = await sign(token, `sso-btc=${exp}`);
          return Response.json({ ok: true, url: `${BTC_APP}/?sso=1&exp=${exp}&sig=${sig}` });
        }

        // ── Príchod z knihy ────────────────────────────────────────────────
        const exp = Number(q.get("exp") ?? 0);
        const sig = q.get("sig") ?? "";
        if (!exp || !sig || exp <= Date.now()) {
          return Response.redirect(new URL("/", request.url).toString(), 302);
        }
        const ocakavany = await sign(token, `sso-kokpit=${exp}`);
        if (!rovnake(sig, ocakavany)) {
          return Response.redirect(new URL("/", request.url).toString(), 302);
        }
        // Identita „btc" — v audite je potom vidieť, že človek prišiel
        // prechodom z knihy a nie vlastným prihlásením.
        return new Response(null, {
          status: 302,
          headers: { Location: new URL("/", request.url).toString(), "Set-Cookie": await sessionCookie("btc") },
        });
      },
    },
  },
});
