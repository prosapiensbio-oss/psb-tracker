import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { TRENERI } from "../lib/psb/mailFaktury";

/**
 * STRÁNKA „KALENDÁŘ DO MOBILU" — `/k/<token>` (náčrt B1, Jerry 7. 10. 2026).
 *
 * Jedno tlačidlo. iPhone (a Mac) dostane `webcal://` — telefón sa sám spýta
 * „Odebírat kalendář?"; Android dostane odkaz do Google Kalendára, ktorý
 * odber pridá. Pod tlačidlom je druhá cesta pre opačný telefón — rozpoznanie
 * z hlavičky sa vie pomýliť. Bez JavaScriptu (otvára sa z SMS), sadzba webu.
 *
 * iPhone pri odbere často zapne „Odstranit upozornění" — preto rada priamo
 * pod tlačidlom; bez nej by kalendár bol, ale pripomienka nie.
 */
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (telo: string, status = 200) => new Response(`<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Tréninky v kalendáři — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Raleway:wght@600;700&display=swap">
<style>
body{margin:0;background:#fff;color:#1A2E24;font-family:'Open Sans',Arial,sans-serif}
.obal{max-width:460px;margin:0 auto;padding:26px 22px 40px}
.logo{height:26px;display:block}
h1{font-family:'Raleway',sans-serif;font-weight:700;font-size:28px;line-height:1.15;margin:22px 0 10px}
p{margin:0 0 12px;font-size:15px;line-height:1.55;color:#5b6b63}
.btn{display:block;margin-top:18px;padding:16px;border-radius:32px;background:#2D7D5A;color:#fff;font:700 16px 'Open Sans',Arial,sans-serif;text-align:center;text-decoration:none}
.druha{display:block;margin-top:12px;text-align:center;color:#2D7D5A;font-size:14px;font-weight:600;text-decoration:none}
.rada{margin-top:18px;padding:12px 14px;border-radius:16px;background:#fff7e8;color:#7a5a14;font-size:13.5px;line-height:1.5}
.mala{margin-top:22px;font-size:13px;color:#7c8a83}
</style></head><body><div class="obal">${telo}</div></body></html>`, {
  status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});

export const Route = createFileRoute("/k/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return html("<p>Tento odkaz neplatí.</p>", 404);
        const r = await DB.prepare(
          `SELECT k.klient, k.zrusene_at,
                  (SELECT trener FROM kal_udalosti u WHERE u.klient = k.klient AND u.zmizla_at IS NULL ORDER BY u.zaciatok DESC LIMIT 1) AS trener
             FROM klient_kalendar k WHERE k.token = ?1`,
        ).bind(token).first<{ klient: string; zrusene_at: string | null; trener: string | null }>().catch(() => null);
        const url = new URL(request.url);
        const logo = `<img class="logo" src="${url.origin}/znacka-napis-tmava.svg" alt="ProSapiens Biomechanic">`;
        if (!r || r.zrusene_at) return html(`${logo}<h1>Tento odkaz už neplatí</h1><p>Napište nám a pošleme nový.</p>`, 404);

        const t = TRENERI[r.trener || ""] || TRENERI.Jerry;
        const komu = r.trener === "Terezka" ? "Terezce" : "Filipovi";
        const feed = `${url.host}/k/${token}/kalendar.ics`;
        const webcal = `webcal://${feed}`;
        const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
        const android = /Android/i.test(request.headers.get("user-agent") || "");
        const krstne = r.klient.trim().split(/\s+/)[0] || "";
        return html(`${logo}
<h1>Vaše tréninky v kalendáři</h1>
<p>${krstne ? `${esc(krstne)}, j` : "J"}edním klepnutím se vám tréninky objeví v kalendáři v mobilu. Když se termín změní, změní se i u vás — sám.</p>
<a class="btn" href="${esc(android ? google : webcal)}">Přidat do kalendáře</a>
<a class="druha" href="${esc(android ? webcal : google)}">${android ? "Máte iPhone? Přidat sem" : "Máte Android? Přidat přes Google Kalendář"}</a>
<p class="mala">Telefon se zeptá „Odebírat kalendář?" — stačí potvrdit. V kalendáři uvidíte jen své tréninky.</p>
${android ? "" : `<div class="rada">iPhone: v dalším okně vypněte <b>„Odstranit upozornění"</b>, jinak vás telefon na trénink neupozorní.</div>`}
<a class="druha" href="sms:${esc(t.telefon.replace(/[^\d+]/g, ""))}">Nejde to? Napsat ${esc(komu)}</a>`);
      },
    },
  },
});
