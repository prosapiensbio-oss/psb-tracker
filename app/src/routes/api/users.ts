import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, hashPassword, novaSol, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Správa kont. Obaja majú plný prístup, takže ktokoľvek prihlásený môže konto
// založiť alebo mu zmeniť heslo — nejde o oprávnenia, ale o identitu v audite.
// Až pri treťom trénerovi bude mať zmysel riešiť roly.
export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ja = await currentUser(request);
        if (!ja) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, users: [] });
        try {
          const rs = await DB.prepare("SELECT login, name, active, last_login FROM users ORDER BY name").all();
          return Response.json({
            ok: true, ja,
            users: (rs.results as Record<string, unknown>[]).map((r) => ({
              login: r.login, name: r.name, active: !!r.active, lastLogin: r.last_login,
            })),
          });
        } catch {
          return Response.json({ ok: true, ja, users: [] });
        }
      },

      POST: async ({ request }) => {
        const ja = await currentUser(request);
        if (!ja) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { login?: string; name?: string; password?: string; active?: boolean };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const login = String(b.login || "").trim().toLowerCase().slice(0, 40);
        if (!/^[a-z0-9._-]{2,40}$/.test(login)) return Response.json({ ok: false, error: "bad_login" }, { status: 400 });
        const name = String(b.name || login).trim().slice(0, 60) || login;
        const password = String(b.password || "");
        // Osem znakov je dosť na appku za jedným zámkom a málo na to, aby si
        // niekto vymýšľal heslo, ktoré si nezapamätá a prestane appku otvárať.
        if (password && password.length < 8) return Response.json({ ok: false, error: "short_password" }, { status: 400 });

        const uz = await DB.prepare("SELECT login FROM users WHERE login = ?1").bind(login).first();
        if (!uz && !password) return Response.json({ ok: false, error: "need_password" }, { status: 400 });

        if (password) {
          const salt = novaSol();
          const hash = await hashPassword(password, salt);
          await DB.prepare(
            `INSERT INTO users (login, name, pass_hash, pass_salt, active, created_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5)
             ON CONFLICT(login) DO UPDATE SET name = ?2, pass_hash = ?3, pass_salt = ?4, active = 1`,
          ).bind(login, name, hash, salt, new Date().toISOString()).run();
        } else {
          await DB.prepare("UPDATE users SET name = ?2, active = ?3 WHERE login = ?1")
            .bind(login, name, b.active === false ? 0 : 1).run();
        }

        await audit(DB, {
          action: uz ? "uprava-konta" : "nove-konto",
          predmet: login,
          neu: password ? "zmenené heslo" : `aktívne: ${b.active === false ? "nie" : "áno"}`,
          actor: ja,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
