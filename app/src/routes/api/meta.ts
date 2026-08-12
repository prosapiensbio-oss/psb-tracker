import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";

/**
 * Meta Graph API — reklama a Instagram.
 *
 * PREČO TO STOJÍ ZA TO
 *
 * Ads Manager vie povedať cenu za preklik a za odoslaný formulár. NIKDY
 * nepovie cenu za klienta, ktorý zostal pol roka — nevie, kto sa ním stal.
 * Kokpit má oba konce: výdavok z Mety a klienta z PTmindera. Toto je miesto,
 * kde sa tie dve polovice stretnú.
 *
 * TOKEN NEOPÚŠŤA SERVER
 *
 * Leží v `vzas_settings` pod kľúčom `meta_token` a číta ho len tento súbor.
 * Do prehliadača sa nikdy neposiela — ani skrátený. Jerry ho vloží cez pole
 * v Údajoch, appka si ho uloží a odvtedy ho nikto nevidí.
 *
 * PREČO SÚ INSTAGRAMOVÉ ČÍSLA V INEJ TABUĽKE NEŽ METRICOOLOVÉ
 *
 * Merajú sa mierne inak — iné okno, iné zaokrúhlenie, iná definícia dosahu.
 * Keby sa miešali do `mkt_prispevky`, nedalo by sa povedať, ktorý zdroj ktoré
 * číslo dal, a pri prvom rozpore by sa nedalo rozhodnúť, ktorému veriť.
 */

/**
 * Verzia Graph API.
 *
 * Meta staré verzie po čase vypína. Keď endpoint začne vracať chybu o verzii,
 * stačí zdvihnúť toto číslo — nikde inde sa verzia nepíše.
 */
const V = "v21.0";

type Nastavenie = { token: string; adAccount: string; igUser: string };

async function nacitajNastavenie(DB: D1Database): Promise<Nastavenie> {
  const rs = await DB.prepare(
    "SELECT key, value FROM vzas_settings WHERE key IN ('meta_token','meta_ad_account','meta_ig_user')",
  ).all();
  const m: Record<string, string> = {};
  for (const r of rs.results as { key: string; value: string }[]) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  return { token: m.meta_token || "", adAccount: m.meta_ad_account || "", igUser: m.meta_ig_user || "" };
}

/** Volanie Graphu. Chyby vracia ako text, nie ako výnimku — nech ich vidí človek. */
async function graph(cesta: string, token: string): Promise<{ ok: boolean; data?: unknown; chyba?: string }> {
  const spojka = cesta.includes("?") ? "&" : "?";
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${cesta}${spojka}access_token=${encodeURIComponent(token)}`);
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const e = (j.error || {}) as Record<string, unknown>;
      return { ok: false, chyba: `${e.type || "chyba"}: ${e.message || `HTTP ${r.status}`}` };
    }
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

export const Route = createFileRoute("/api/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const n = await nacitajNastavenie(DB);
        // Token sa nevracia ani skrátený — len či existuje.
        return Response.json({
          ok: true,
          maToken: !!n.token,
          adAccount: n.adAccount,
          igUser: n.igUser,
          kampani: ((await DB.prepare("SELECT COUNT(*) n FROM mkt_kampane").first<{ n: number }>())?.n) ?? 0,
          igPrispevkov: ((await DB.prepare("SELECT COUNT(*) n FROM ig_prispevky").first<{ n: number }>())?.n) ?? 0,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const akcia = String(b.akcia || "");
        const now = new Date().toISOString();
        const uloz = async (k: string, v: string) =>
          DB.prepare(
            `INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1,?2,?3)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
          ).bind(k, JSON.stringify(v), now).run();

        if (akcia === "uloz-token") {
          const token = String(b.token || "").trim();
          if (token.length < 20) return Response.json({ ok: false, error: "token_prilis_kratky" }, { status: 400 });
          await uloz("meta_token", token);
          // Do auditu ide len fakt, že sa token zmenil — nikdy jeho hodnota.
          await audit(DB, { action: "nastavenie", predmet: "meta_token", neu: "token nastavený", actor: await currentUser(request) || undefined });
          return Response.json({ ok: true });
        }

        if (akcia === "uloz-ucty") {
          await uloz("meta_ad_account", String(b.adAccount || "").trim());
          await uloz("meta_ig_user", String(b.igUser || "").trim());
          return Response.json({ ok: true });
        }

        const n = await nacitajNastavenie(DB);
        if (!n.token) return Response.json({ ok: false, error: "chyba_token" }, { status: 400 });

        // Skúška spojenia + čo token vôbec vidí. Toto je prvá vec, ktorá sa
        // púšťa po vložení tokenu — bez nej sa hľadá chyba naslepo.
        if (akcia === "test") {
          const ucty = await graph("me/adaccounts?fields=id,name,account_status&limit=25", n.token);
          const ig = await graph("me/accounts?fields=id,name,instagram_business_account{id,username}&limit=25", n.token);
          return Response.json({ ok: true, reklamneUcty: ucty, instagram: ig });
        }

        // Kampane po mesiacoch. `time_increment=monthly` necháva sčítanie na
        // Mete — vlastné sčítavanie dní by sa rozišlo s tým, čo vidí v Ads
        // Manageri, a prvý rozpor by stál hodinu hľadania.
        if (akcia === "kampane") {
          const od = String(b.od || "2025-01-01").slice(0, 10);
          const doD = String(b.do || new Date().toISOString().slice(0, 10)).slice(0, 10);
          if (!n.adAccount) return Response.json({ ok: false, error: "chyba_ad_ucet" }, { status: 400 });
          const ucet = n.adAccount.startsWith("act_") ? n.adAccount : `act_${n.adAccount}`;
          const r = await graph(
            `${ucet}/insights?level=campaign&time_increment=monthly&limit=200` +
            `&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,date_start` +
            `&time_range=${encodeURIComponent(JSON.stringify({ since: od, until: doD }))}`,
            n.token,
          );
          if (!r.ok) return Response.json({ ok: false, error: r.chyba }, { status: 502 });
          const riadky = ((r.data as { data?: Record<string, unknown>[] }).data) || [];
          const stmts = riadky.map((x) => {
            const akcie = (x.actions as { action_type: string; value: string }[]) || [];
            // „Výsledok" = konverzia, nie preklik. Pri lead kampaniach to Meta
            // vracia pod viacerými menami podľa toho, ako je cieľ nastavený.
            const vysl = akcie
              .filter((a) => /lead|complete_registration|submit_application|offsite_conversion/.test(a.action_type))
              .reduce((s, a) => s + (Number(a.value) || 0), 0);
            return DB.prepare(
              `INSERT INTO mkt_kampane (id, mesiac, nazov, stav, spend, impressions, clicks, vysledky, updated_at)
               VALUES (?1,?2,?3,'',?4,?5,?6,?7,?8)
               ON CONFLICT(id, mesiac) DO UPDATE SET nazov=?3, spend=?4, impressions=?5, clicks=?6, vysledky=?7, updated_at=?8`,
            ).bind(
              String(x.campaign_id || ""), String(x.date_start || "").slice(0, 7), String(x.campaign_name || ""),
              Number(x.spend) || 0, Number(x.impressions) || 0, Number(x.clicks) || 0, vysl, now,
            );
          });
          for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
          return Response.json({ ok: true, riadkov: stmts.length });
        }

        return Response.json({ ok: false, error: "nezname_akcia" }, { status: 400 });
      },
    },
  },
});
