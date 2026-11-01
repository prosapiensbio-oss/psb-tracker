import { createFileRoute } from "@tanstack/react-router";

import { maTajomstvo, overPouzivatela, sessionCookie, stavKonta, verifyPassword } from "../../lib/psb/auth.server";
import { vymazPokusy, zapisZlyhanie, zostavaBlok } from "../../lib/psb/loginLimit.server";
import { identitaZdielaneho } from "../../lib/psb/sessionToken";
import { bindings } from "../../lib/bindings.server";

// Prihlásenie v dvoch krokoch, v tomto poradí:
//
//   1. Vlastné konto (meno + heslo z tabuľky users) → session s menom.
//   2. Zdieľané heslo (PSB_PASSWORD) → záchranná brzda, session „app". Na meno,
//      ktoré má konto, neplatí: kto heslo poznal, sa inak mohol prihlásiť ako
//      Jerry a audit by klamal. Prihlasovacia obrazovka má na to „spoločné heslo".
export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let password = "";
        let login = "";
        try {
          const body = (await request.json()) as { password?: unknown; login?: unknown };
          password = typeof body.password === "string" ? body.password : "";
          login = typeof body.login === "string" ? body.login.trim().toLowerCase().slice(0, 40) : "";
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }

        if (!maTajomstvo()) return Response.json({ ok: false, error: "bez_tajomstva" }, { status: 503 });

        const { DB } = bindings();
        const ip = request.headers.get("cf-connecting-ip") || "neznama";
        const zostava = await zostavaBlok(DB, ip, login);
        if (zostava > 0) {
          const minut = Math.ceil(zostava / 60_000);
          return Response.json(
            { ok: false, error: "prilis_vela_pokusov", sprava: `Priveľa neúspešných pokusov. Skús to znova o ${minut} min.` },
            { status: 429, headers: { "retry-after": String(Math.ceil(zostava / 1000)) } },
          );
        }

        const u = await overPouzivatela(DB, login, password);
        if (u) {
          await vymazPokusy(DB, ip, login);
          await DB?.prepare("UPDATE users SET last_login = ?2 WHERE login = ?1")
            .bind(u.login, new Date().toISOString()).run().catch(() => {});
          return Response.json({ ok: true, user: u.name }, { headers: { "Set-Cookie": await sessionCookie(u.name, u.sessionVer) } });
        }

        if (await verifyPassword(password)) {
          const meno = identitaZdielaneho(await stavKonta(DB, login));
          if (meno) return Response.json({ ok: true, user: meno }, { headers: { "Set-Cookie": await sessionCookie(meno) } });
        }
        await zapisZlyhanie(DB, ip, login);
        return Response.json({ ok: false, error: "invalid" }, { status: 401 });
      },
    },
  },
});
