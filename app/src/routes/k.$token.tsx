import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { jeNahladOdkazu, platformaStranky, telefonZAdresy, teloStrankyKalendara } from "../lib/psb/kalendarMobil";
import { TRENERI } from "../lib/psb/mailFaktury";
import { oslovenieKlienta } from "../lib/psb/oslovenie";
import { verejnyOdkaz } from "../lib/psb/verejnyOdkaz";

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
 *
 * OD 15. 10. 2026 SA PÝTA „Jaký máte telefon?" (Jerry) a podľa voľby ukáže
 * cestu — telo skladá `teloStrankyKalendara`. Android má vlastnú: Google
 * Kalendár v telefóne odber z odkazu NEPRIDÁ (Michal Knapčok), funguje
 * počítač (zdarma) alebo appka ICSx⁵ (platená). Tlačidlo podľa hlavičky
 * prehliadača tu už nie je — Michalovi poslalo Android do Google appky.
 *
 * Každé otvorenie človekom sa zapíše (kedy, z čoho) — profil tak vie povedať
 * „otvoril z Androidu, kalendár si nepridal". Náhľad odkazu sa nepočíta.
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
h2{font-family:'Raleway',sans-serif;font-weight:700;font-size:18px;margin:26px 0 8px}
.adresa{margin:4px 0 0;padding:12px 14px;border-radius:16px;background:#eef5f1;color:#1A2E24;font:700 17px 'Open Sans',Arial,sans-serif;text-align:center;user-select:all;-webkit-user-select:all;word-break:break-all}
.btn.svetle{background:#fff;color:#2D7D5A;border:2px solid #2D7D5A;padding:14px;margin-top:12px}
.otazka{margin:22px 0 4px;font:700 16px 'Raleway',sans-serif;color:#1A2E24}
.volby{display:flex;gap:10px;margin-top:10px}
.volba{flex:1;display:block;padding:16px 10px;border-radius:20px;border:2px solid #d5e4dc;background:#fff;color:#1A2E24;text-align:center;text-decoration:none;font:700 16px 'Open Sans',Arial,sans-serif}
.volba small{display:block;margin-top:2px;font-weight:400;font-size:12.5px;color:#7c8a83}
.volba.zvolena{border-color:#2D7D5A;background:#eef5f1;color:#2D7D5A}
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
        const ua = request.headers.get("user-agent") || "";
        const platforma = platformaStranky(ua);
        const telefon = telefonZAdresy(url.searchParams.get("telefon"));
        if (r && !r.zrusene_at && !jeNahladOdkazu(ua)) {
          // Ťuknutie na voľbu je to isté otvorenie — počíta sa len voľba.
          await (telefon
            ? DB.prepare("UPDATE klient_kalendar SET zvoleny_telefon = ?2, otvorene_at = ?3, otvorene_platforma = ?4 WHERE token = ?1")
              .bind(token, telefon, new Date().toISOString(), platforma)
            : DB.prepare("UPDATE klient_kalendar SET otvorene_at = ?2, otvorene_pocet = otvorene_pocet + 1, otvorene_platforma = ?3 WHERE token = ?1")
              .bind(token, new Date().toISOString(), platforma)
          ).run().catch(() => null);
        }
        const logo = `<img class="logo" src="${url.origin}/znacka-napis-tmava.svg" alt="ProSapiens Biomechanic">`;
        if (!r || r.zrusene_at) return html(`${logo}<h1>Tento odkaz už neplatí</h1><p>Napište nám a pošleme nový.</p>`, 404);

        const t = TRENERI[r.trener || ""] || TRENERI.Jerry;
        const webcal = `webcal://${url.host}/k/${token}/kalendar.ics`;
        return html(teloStrankyKalendara({
          logo, oslovenie: oslovenieKlienta(r.klient), telefon,
          webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
          kratka: verejnyOdkaz(`/k/${token}`, url.origin),
          telefonTrenera: t.telefon, komu: r.trener === "Terezka" ? "Terezce" : "Filipovi",
        }));
      },
    },
  },
});
