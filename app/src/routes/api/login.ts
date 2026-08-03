import { createFileRoute } from "@tanstack/react-router";

import { overPouzivatela, sessionCookie, verifyPassword } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Prihlásenie v dvoch krokoch, v tomto poradí:
//
//   1. Vlastné konto (meno + heslo z tabuľky users) → session s menom.
//   2. Zdieľané heslo (PSB_PASSWORD) → záchranná brzda, session s menom, ktoré
//      človek zadal, inak „app".
//
// Poradie je dôležité: keby sa najprv skúšalo zdieľané heslo, ten, kto ho
// pozná, by sa mohol prihlásiť pod cudzím menom a audit by klamal.
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

        const { DB } = bindings();
        const u = await overPouzivatela(DB, login, password);
        if (u) {
          await DB?.prepare("UPDATE users SET last_login = ?2 WHERE login = ?1")
            .bind(u.login, new Date().toISOString()).run().catch(() => {});
          return Response.json({ ok: true, user: u.name }, { headers: { "Set-Cookie": await sessionCookie(u.name) } });
        }

        if (await verifyPassword(password)) {
          const meno = login ? login.charAt(0).toUpperCase() + login.slice(1) : "app";
          return Response.json({ ok: true, user: meno }, { headers: { "Set-Cookie": await sessionCookie(meno) } });
        }
        return Response.json({ ok: false, error: "invalid" }, { status: 401 });
      },
    },
  },
});
