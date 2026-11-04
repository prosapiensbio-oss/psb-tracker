import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../lib/bindings.server";
import { audit } from "../lib/psb/audit.server";
import {
  strankaNeplati, strankaOdhlasit, strankaOdhlaseny, strankaPotvrdene, strankaPotvrdit, strankaSpat,
} from "../lib/psb/mailStranky";
import { nastavenieMailera, zakazAdresu } from "../lib/psb/mailer.server";

/**
 * `/m/<token>` — odkaz z mailu (Jerry, 4. 11. 2026).
 *   token o…: odhlásenie, token je riadok v `mail_prijemcovia`
 *   token p…: potvrdenie prihlásenia z webu a darček
 * V adrese nie je e-mail ani meno. POST s `List-Unsubscribe=One-Click` je
 * odhlásenie priamo z poštovej appky (RFC 8058).
 */
const HLAVICKY = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" };
const html = (t: string, status = 200) => new Response(t, { status, headers: HLAVICKY });
const platny = (t: string) => /^[op][A-Za-z0-9]{15}$/.test(t);

async function potvrdenie(DB: D1Database, token: string) {
  return DB.prepare("SELECT id, email FROM mail_odberatelia WHERE potvrdenie_token = ?1").bind(token).first<{ id: string; email: string }>();
}
async function prijemca(DB: D1Database, token: string) {
  return DB.prepare("SELECT token, email, skuska, vydanie, odhlasene_at FROM mail_prijemcovia WHERE token = ?1").bind(token)
    .first<{ token: string; email: string; skuska: number; vydanie: string; odhlasene_at: string }>();
}

export const Route = createFileRoute("/m/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings() as { DB?: D1Database };
        if (!DB || !platny(token)) return html(strankaNeplati(), 404);
        if (token.startsWith("p")) {
          if (!(await potvrdenie(DB, token))) return html(strankaNeplati(), 404);
          const n = await nastavenieMailera(DB);
          return html(strankaPotvrdit(n.darcekNazov));
        }
        const p = await prijemca(DB, token);
        if (!p) return html(strankaNeplati(), 404);
        return html(p.odhlasene_at ? strankaOdhlaseny(!!p.skuska) : strankaOdhlasit(token));
      },
      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings() as { DB?: D1Database };
        if (!DB || !platny(token)) return html(strankaNeplati(), 404);
        const f = await request.formData().catch(() => null);
        const kedy = new Date().toISOString();

        if (token.startsWith("p")) {
          const o = await potvrdenie(DB, token);
          if (!o) return html(strankaNeplati(), 404);
          await DB.prepare("UPDATE mail_odberatelia SET status = 'active', potvrdene_at = ?2, dovod = '', odhlaseny_at = '', updated_at = ?2 WHERE id = ?1").bind(o.id, kedy).run();
          await audit(DB, { action: "mail-potvrdene", predmet: o.id, actor: "odberateľ" }).catch(() => {});
          const n = await nastavenieMailera(DB);
          return html(strankaPotvrdene(n.darcekNazov, n.darcekUrl));
        }

        const p = await prijemca(DB, token);
        if (!p) return html(strankaNeplati(), 404);
        const akcia = String(f?.get("akcia") || "odhlasit");
        if (akcia === "spat" && !p.skuska) {
          await DB.batch([
            DB.prepare("UPDATE mail_prijemcovia SET odhlasene_at = '' WHERE token = ?1").bind(token),
            DB.prepare("UPDATE mail_odberatelia SET status = 'active', dovod = '', odhlaseny_at = '', updated_at = ?2 WHERE lower(email) = ?1").bind(p.email.toLowerCase(), kedy),
          ]);
          await audit(DB, { action: "mail-prihlaseny-spat", predmet: p.vydanie, actor: "odberateľ" }).catch(() => {});
          return html(strankaSpat());
        }
        await DB.prepare("UPDATE mail_prijemcovia SET odhlasene_at = ?2 WHERE token = ?1 AND odhlasene_at = ''").bind(token, kedy).run();
        if (!p.skuska) {
          await zakazAdresu(DB, p.email, "unsubscribed", "odkaz v maili", kedy);
          await audit(DB, { action: "mail-odhlaseny", predmet: p.vydanie, actor: "odberateľ" }).catch(() => {});
        }
        return html(strankaOdhlaseny(!!p.skuska));
      },
    },
  },
});
