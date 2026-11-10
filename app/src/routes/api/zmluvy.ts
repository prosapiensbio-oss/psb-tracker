import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { kanonickyTvarKlienta } from "../../lib/psb/nahodTrening.server";
import { adresyMailu } from "../../lib/psb/mime";
import { vokativ } from "../../lib/psb/oslovenie";
import { posliMail } from "../../lib/psb/smtp.server";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";
import { znenie } from "../../lib/psb/zmluva6m";
import { zmluvaMail } from "../../lib/psb/zmluvaStranka";
import { poslednyPodpis, vytvorZmluvu, zmluvaPodlaId, zoznamZmluv, zrusZmluvu } from "../../lib/psb/zmluvy.server";

/** Schránka info@ — tie isté údaje ako faktúry; heslo sa nikam nevypisuje. */
async function nastaveniaMailu(DB: import("@cloudflare/workers-types").D1Database): Promise<{ host: string; user: string; heslo: string }> {
  const rs = await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('mail_host','mail_user','mail_heslo')").all();
  const m: Record<string, string> = {};
  for (const r of (rs.results as { key: string; value: string }[]) || []) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  return { host: m.mail_host || "", user: m.mail_user || "", heslo: m.mail_heslo || "" };
}

/**
 * ZMLUVY 6M — strana trénera (10. 11. 2026).
 *
 *   GET                         → všetky zmluvy (bez podpisov) + odkaz na každú
 *   GET ?mojPodpis=1            → posledný podpis prihláseného (na opätovné použitie)
 *   POST { akcia: "vytvor", klient, podpis } → zmluva s podpisom poskytovateľa, odkaz /z/<token>
 *   POST { akcia: "zrus", id }  → zruší nepodpísanú
 *   POST { akcia: "mail", id, komu } → pošle zmluvu na prečítanie aj s odkazom na podpis
 *
 * Odkaz pre klienta ide cez prosapiens.cz/z/ (snippet 26 od 10. 11. 2026),
 * `priamy` na workera — náhľad a podpis na iPade, lebo presmerovanie zahodí
 * `?nahlad=1` a náhľad by sa rátal ako otvorenie klientom.
 */
const ns = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/zmluvy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const url = new URL(request.url);
        if (url.searchParams.get("mojPodpis")) {
          const kto = (await currentUser(request)) || "";
          return Response.json({ ok: true, podpis: kto ? await poslednyPodpis(DB, kto) : null }, { headers: ns });
        }
        const zmluvy = await zoznamZmluv(DB).catch(() => null);
        if (!zmluvy) return Response.json({ ok: false, error: "Tabuľka zmlúv chýba (migrácia 0138)." }, { status: 503 });
        return Response.json({ ok: true, zmluvy: zmluvy.map((z) => ({ ...z, odkaz: verejnyOdkaz(`/z/${z.token}`, url.origin), priamy: `${url.origin}/z/${z.token}` })) }, { headers: ns });
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const kto = (await currentUser(request)) || "";
        const b = await request.json().catch(() => ({})) as Record<string, unknown>;
        const origin = new URL(request.url).origin;
        try {
          if (b.akcia === "vytvor") {
            const klient = await kanonickyTvarKlienta(DB, String(b.klient || "").slice(0, 120));
            const r = await vytvorZmluvu(DB, { klient, podpis: String(b.podpis || ""), autor: kto });
            if (!r.ok) return Response.json(r, { status: 400 });
            await audit(DB, { action: "zmluva-vytvorena", predmet: klient, neu: { id: r.id }, actor: kto });
            return Response.json({ ok: true, id: r.id, odkaz: verejnyOdkaz(`/z/${r.token}`, origin) }, { headers: ns });
          }
          /**
           * MAIL SO ZMLUVOU NA PREČÍTANIE (10. 11. 2026). Ide len na klik
           * trénera, na adresu, ktorú vidí v políčku — appka mail sama
           * neposiela nikdy.
           */
          if (b.akcia === "mail") {
            const z = await zmluvaPodlaId(DB, String(b.id || ""));
            if (!z || z.stav !== "caka") return Response.json({ ok: false, error: "Zmluva sa nenašla alebo už nie je na podpis." }, { status: 404 });
            const zn = znenie(z.verzia);
            if (!zn) return Response.json({ ok: false, error: "Znenie zmluvy sa nenašlo." }, { status: 500 });
            const { adresy, zle } = adresyMailu(String(b.komu || "").slice(0, 300));
            if (zle.length) return Response.json({ ok: false, error: `Toto nie je e-mailová adresa: ${zle.join(", ")}` }, { status: 400 });
            if (!adresy.length) return Response.json({ ok: false, error: "Chýba e-mail klienta." }, { status: 400 });
            const n = await nastaveniaMailu(DB);
            if (!n.host || !n.user || !n.heslo) return Response.json({ ok: false, error: "Schránka nie je nastavená — doplň ju v Údajoch." }, { status: 400 });
            const krstne = z.klient.trim().split(/\s+/)[0] || "";
            const m = zmluvaMail(zn, { oslovenie: vokativ(krstne), odkaz: verejnyOdkaz(`/z/${z.token}`, origin), uvod: String(b.uvod || "").slice(0, 600) });
            const v = await posliMail(
              { host: n.host.replace(/^imap\./, "smtp."), pouzivatel: n.user, heslo: n.heslo },
              { od: n.user, odMeno: "ProSapiens Biomechanic", komu: adresy, predmet: m.predmet, telo: m.text, html: m.html },
            );
            if (!v.ok) {
              await audit(DB, { action: "zmluva-mail-zlyhal", predmet: `${z.klient} · ${adresy.join(", ")}`, old: v.chyba, actor: kto });
              return Response.json({ ok: false, error: `Mail neodišiel — ${v.chyba}` }, { status: 502 });
            }
            await audit(DB, { action: "zmluva-mail", predmet: `${z.klient} · ${adresy.join(", ")}`, actor: kto });
            return Response.json({ ok: true, komu: adresy }, { headers: ns });
          }
          if (b.akcia === "zrus") {
            const ok = await zrusZmluvu(DB, String(b.id || ""));
            if (ok) await audit(DB, { action: "zmluva-zrusena", predmet: String(b.id || ""), actor: kto });
            return Response.json(ok ? { ok: true } : { ok: false, error: "Zmluva sa nenašla alebo už je podpísaná." }, { status: ok ? 200 : 404 });
          }
          return Response.json({ ok: false, error: "Neznáma akcia." }, { status: 400 });
        } catch (e) {
          return Response.json({ ok: false, error: `Zápis zlyhal: ${String((e as Error)?.message || e).slice(0, 200)}` }, { status: 500 });
        }
      },
    },
  },
});
