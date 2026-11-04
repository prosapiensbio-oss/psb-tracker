import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { jeOdPlanovaca } from "../../lib/psb/cronToken.server";
import { kontrolaTextu } from "../../lib/psb/mailSablona";
import { adresatiSkupin, cistyMail, platnyMail } from "../../lib/psb/mailSkupiny";
import {
  nastavenieMailera, novyToken, posliFrontu, posliJedenMail, skupinyZDatabazy, stavDomeny, zakazAdresu, zlozMail, zostavaDnes, type VydanieDb,
} from "../../lib/psb/mailer.server";
import { odsifruj } from "../../lib/psb/sifra.server";

/**
 * MAILER: obrazovka Marketing → Mailer. GET číta, POST robí jednu akciu.
 *
 * Odoslanie overuje všetko znova na serveri: text, skúšku, kľúč a POČET adresátov.
 * Keď sa medzitým niekto odhlásil a počet nesedí, nič nejde von a obrazovka ukáže
 * nové číslo. Na tlačidle tak nikdy nestojí iný počet, než koľko mail dostane.
 */
type Env = { DB?: D1Database; KAL_CRON_TOKEN?: string; ANAMNEZA_KLUC?: string };
const kus = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const chyba = (text: string, status = 400) => Response.json({ ok: false, error: text }, { status });

async function nacitajPrehlad(DB: D1Database, kluc?: string) {
  const vydania = (await DB.prepare(
    `SELECT v.*,
       COALESCE(SUM(p.skuska = 0), 0) adresatov,
       COALESCE(SUM(p.skuska = 0 AND p.stav = 'caka'), 0) caka,
       COALESCE(SUM(p.skuska = 0 AND p.stav = 'odoslany'), 0) odoslanych,
       COALESCE(SUM(p.skuska = 0 AND p.dorucene_at <> ''), 0) dorucenych,
       COALESCE(SUM(p.skuska = 0 AND p.otvorene_at <> ''), 0) otvorenych,
       COALESCE(SUM(p.skuska = 0 AND p.kliknute_at <> ''), 0) kliknutych,
       COALESCE(SUM(p.skuska = 0 AND p.odhlasene_at <> ''), 0) odhlasenych,
       COALESCE(SUM(p.skuska = 0 AND p.odrazene_at <> ''), 0) odrazenych,
       COALESCE(SUM(p.skuska = 0 AND p.staznost_at <> ''), 0) staznosti,
       (SELECT COUNT(*) FROM mail_odpovede o WHERE o.vydanie = v.id AND o.vybavene_at = '') odpovedi
     FROM mail_vydania v LEFT JOIN mail_prijemcovia p ON p.vydanie = v.id
     GROUP BY v.id ORDER BY v.upravene_at DESC LIMIT 60`,
  ).all()).results || [];
  const riadky = (await DB.prepare(
    "SELECT id, vydanie, email, meno, predmet, text, prijate_at, vybavene_at, lead_id FROM mail_odpovede ORDER BY prijate_at DESC LIMIT 40",
  ).all<{ id: string; vydanie: string; email: string; meno: string; predmet: string; text: string; prijate_at: string; vybavene_at: string; lead_id: string }>()).results || [];
  const odpovede = await Promise.all(riadky.map(async (r) => ({
    ...r,
    // V bete kľúč nie je: radšej to povedať než ukázať prázdno.
    text: kluc ? await odsifruj(r.text, kluc).catch(() => "(text sa nepodarilo prečítať)") : "(text sa dá prečítať len v ostrom Kokpite)",
  })));
  const n = await nastavenieMailera(DB);
  const domena = await stavDomeny(n.kluc);
  return {
    vydania, odpovede,
    nastavenie: {
      maKluc: !!n.kluc, maWebhook: !!n.tajomstvoWebhooku, odosielatel: n.odosielatel, dennyLimit: n.dennyLimit,
      darcekNazov: n.darcekNazov, darcekUrl: n.darcekUrl, skuskaAdresa: n.skuskaAdresa, domena,
      zostavaDnes: await zostavaDnes(DB, n.dennyLimit),
    },
  };
}

export const Route = createFileRoute("/api/mailer-vydania")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB) return chyba("no_db", 503);
        try {
          if (new URL(request.url).searchParams.get("skupiny")) {
            return Response.json({ ok: true, skupiny: await skupinyZDatabazy(DB) });
          }
          return Response.json({ ok: true, ...(await nacitajPrehlad(DB, ANAMNEZA_KLUC)) });
        } catch (e) {
          return chyba(String(e).slice(0, 300), 500);
        }
      },

      POST: async ({ request }) => {
        const { DB, KAL_CRON_TOKEN } = bindings() as Env;
        if (!DB) return chyba("no_db", 503);
        const zPlanovaca = jeOdPlanovaca(request, KAL_CRON_TOKEN || "");
        if (!zPlanovaca && !(await isAuthed(request))) return unauthorized();
        const b = await request.json().catch(() => ({})) as Record<string, unknown>;
        const akcia = String(b.akcia || "");
        const teraz = new Date().toISOString();

        // Automat smie iba dokončiť to, na čo Jerry už klikol.
        if (akcia === "fronta") {
          const v = await posliFrontu(DB);
          return Response.json({ ok: !v.chyba, ...v }, { status: v.chyba ? 502 : 200 });
        }
        if (zPlanovaca) return unauthorized();
        const actor = (await currentUser(request).catch(() => null)) || "kokpit";

        try {
          if (akcia === "uloz") {
            const id = kus(b.id, 40) || `v_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
            const stary = await DB.prepare("SELECT stav, predmet, nadpis, predhlavicka, telo, druh, skuska_at FROM mail_vydania WHERE id = ?1").bind(id).first<VydanieDb>();
            if (stary && stary.stav !== "rozpisane") return chyba("Odoslaný mail sa už nedá upraviť.", 409);
            const pole = {
              druh: kus(b.druh, 20) || "bolest", tema: kus(b.tema, 300), preco: kus(b.preco, 1000), predmet: kus(b.predmet, 200),
              nadpis: kus(b.nadpis, 200), predhlavicka: kus(b.predhlavicka, 200), telo: kus(b.telo, 20000),
              skupiny: JSON.stringify(Array.isArray(b.skupiny) ? b.skupiny.map((x) => kus(x, 30)) : []),
            };
            // Skúška platí len pre to znenie, ktoré Jerry videl.
            const textSaZmenil = !stary || stary.predmet !== pole.predmet || stary.nadpis !== pole.nadpis
              || stary.predhlavicka !== pole.predhlavicka || stary.telo !== pole.telo || stary.druh !== pole.druh;
            await DB.prepare(
              `INSERT INTO mail_vydania (id, druh, tema, preco, predmet, nadpis, predhlavicka, telo, skupiny, stav, vytvorene_at, upravene_at, autor)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'rozpisane',?10,?10,?11)
               ON CONFLICT(id) DO UPDATE SET druh=?2, tema=?3, preco=?4, predmet=?5, nadpis=?6, predhlavicka=?7, telo=?8, skupiny=?9, upravene_at=?10,
                 skuska_at = CASE WHEN ?12 = 1 THEN '' ELSE skuska_at END`,
            ).bind(id, pole.druh, pole.tema, pole.preco, pole.predmet, pole.nadpis, pole.predhlavicka, pole.telo, pole.skupiny, teraz, actor, textSaZmenil ? 1 : 0).run();
            return Response.json({ ok: true, id, skuskaPlati: !textSaZmenil && !!stary?.skuska_at });
          }

          if (akcia === "zmaz") {
            const id = kus(b.id, 40);
            const r = await DB.prepare("DELETE FROM mail_vydania WHERE id = ?1 AND stav = 'rozpisane'").bind(id).run();
            if (!r.meta?.changes) return chyba("Mazať sa dá len rozpísaný mail.", 409);
            await DB.prepare("DELETE FROM mail_prijemcovia WHERE vydanie = ?1 AND skuska = 1").bind(id).run();
            return Response.json({ ok: true });
          }

          if (akcia === "skuska") {
            const id = kus(b.id, 40);
            const v = await DB.prepare("SELECT * FROM mail_vydania WHERE id = ?1").bind(id).first<VydanieDb>();
            if (!v) return chyba("Mail sa nenašiel.", 404);
            const chyby = kontrolaTextu(v);
            if (chyby.length) return chyba(chyby.join(" "));
            const adresa = cistyMail(b.adresa);
            if (!platnyMail(adresa)) return chyba("Skúšobná adresa nie je platná.");
            const n = await nastavenieMailera(DB);
            if (!n.kluc) return chyba("Chýba kľúč Resendu. Zadaj ho v nastavení nižšie.");
            const token = novyToken("o");
            const meno = kus(b.meno, 80) || "Filip Stráňavský";
            const m = zlozMail(v, { token, email: adresa, meno, skupina: "trenuje" }, n.odosielatel);
            const r = await posliJedenMail(n.kluc, { ...m, subject: `[Skúška] ${m.subject}` });
            if (!r.ok) return chyba(`Resend odmietol: ${r.chyba}`, 502);
            await DB.batch([
              DB.prepare("DELETE FROM mail_prijemcovia WHERE vydanie = ?1 AND email = ?2 AND skuska = 1").bind(id, adresa),
              DB.prepare(
                `INSERT INTO mail_prijemcovia (token, vydanie, email, meno, skupina, skuska, stav, resend_id, odoslane_at) VALUES (?1,?2,?3,?4,'trenuje',1,'odoslany',?5,?6)`,
              ).bind(token, id, adresa, meno, String(r.data?.id || ""), teraz),
              DB.prepare("UPDATE mail_vydania SET skuska_at = ?2 WHERE id = ?1").bind(id, teraz),
              DB.prepare(
                `INSERT INTO vzas_settings (key, value, updated_at) VALUES ('mail_skuska_adresa', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2`,
              ).bind(JSON.stringify(adresa), teraz),
            ]);
            return Response.json({ ok: true, skuska_at: teraz });
          }

          if (akcia === "odosli") {
            const id = kus(b.id, 40);
            const v = await DB.prepare("SELECT * FROM mail_vydania WHERE id = ?1").bind(id).first<VydanieDb>();
            if (!v) return chyba("Mail sa nenašiel.", 404);
            if (v.stav !== "rozpisane") return chyba("Tento mail už odišiel.", 409);
            if (!v.preco.trim()) return chyba("Chýba odpoveď, prečo to ten človek chce dostať.");
            const chyby = kontrolaTextu(v);
            if (chyby.length) return chyba(chyby.join(" "));
            if (!v.skuska_at) return chyba("Najprv si pošli skúšobný mail. Po úprave textu treba novú skúšku.");
            const n = await nastavenieMailera(DB);
            if (!n.kluc) return chyba("Chýba kľúč Resendu.");
            const vybrane = (() => { try { return JSON.parse(v.skupiny) as string[]; } catch { return []; } })();
            const adresati = adresatiSkupin(await skupinyZDatabazy(DB), vybrane);
            if (!adresati.length) return chyba("Vo vybraných skupinách nie je komu napísať.");
            if (Number(b.potvrdeny_pocet) !== adresati.length) {
              return Response.json({ ok: false, error: `Počet sa medzitým zmenil na ${adresati.length}. Pozri si skupinu a potvrď znova.`, pocet: adresati.length }, { status: 409 });
            }
            // Dvojklik: odosiela len ten, kto stav naozaj prepol.
            const z = await DB.prepare("UPDATE mail_vydania SET stav = 'odosiela', odoslane_at = ?2 WHERE id = ?1 AND stav = 'rozpisane'").bind(id, teraz).run();
            if (!z.meta?.changes) return chyba("Tento mail už odišiel.", 409);
            for (let i = 0; i < adresati.length; i += 50) {
              await DB.batch(adresati.slice(i, i + 50).map((a) => DB.prepare(
                "INSERT OR IGNORE INTO mail_prijemcovia (token, vydanie, email, meno, klient, skupina) VALUES (?1,?2,?3,?4,?5,?6)",
              ).bind(novyToken("o"), id, a.email, a.meno, a.klient, a.skupina)));
            }
            await audit(DB, { action: "mail-odoslany", predmet: id, neu: `${v.predmet} · ${adresati.length} adresátov · ${vybrane.join(", ")}`, actor });
            const f = await posliFrontu(DB);
            return Response.json({ ok: !f.chyba, adresatov: adresati.length, ...f, error: f.chyba || undefined }, { status: f.chyba ? 502 : 200 });
          }

          if (akcia === "nepisat") {
            const email = cistyMail(b.email);
            if (!platnyMail(email)) return chyba("Neplatná adresa.");
            await zakazAdresu(DB, email, "unsubscribed", kus(b.dovod, 200) || "ručne v Kokpite", teraz);
            await audit(DB, { action: "mail-nepisat", predmet: email, actor });
            return Response.json({ ok: true });
          }

          if (akcia === "odpoved-vybavena") {
            await DB.prepare("UPDATE mail_odpovede SET vybavene_at = ?2 WHERE id = ?1").bind(kus(b.id, 80), teraz).run();
            return Response.json({ ok: true });
          }

          // Dopyt z odpovede vzniká len týmto tlačidlom (Jerry, 4. 11. 2026).
          if (akcia === "odpoved-dopyt") {
            const o = await DB.prepare("SELECT id, email, meno, predmet, lead_id FROM mail_odpovede WHERE id = ?1").bind(kus(b.id, 80))
              .first<{ id: string; email: string; meno: string; predmet: string; lead_id: string }>();
            if (!o) return chyba("Odpoveď sa nenašla.", 404);
            if (o.lead_id) return Response.json({ ok: true, lead_id: o.lead_id });
            const leadId = `mail-odp-${o.id}`.slice(0, 64);
            await DB.batch([
              DB.prepare(
                `INSERT OR IGNORE INTO leads (id,date,name,source,referrer,status,note,created_at,email,telefon,kampan,utm,stranka)
                 VALUES (?1,?2,?3,'mail','','novy',?4,?5,?6,'','','','')`,
              ).bind(leadId, teraz.slice(0, 10), o.meno || o.email, `Odpoveď na hromadný mail: ${o.predmet}`.slice(0, 500), teraz, o.email),
              DB.prepare("UPDATE mail_odpovede SET lead_id = ?2, vybavene_at = ?3 WHERE id = ?1").bind(o.id, leadId, teraz),
            ]);
            await audit(DB, { action: "mail-odpoved-dopyt", predmet: leadId, actor });
            return Response.json({ ok: true, lead_id: leadId });
          }

          if (akcia === "nastav") {
            const zapis: [string, string][] = [];
            if (kus(b.kluc, 200).trim()) zapis.push(["mail_resend_api_key", JSON.stringify(kus(b.kluc, 200).trim())]);
            if (kus(b.webhook, 200).trim()) zapis.push(["mail_resend_webhook_secret", JSON.stringify(kus(b.webhook, 200).trim())]);
            if (typeof b.odosielatel === "string" && b.odosielatel.trim()) zapis.push(["mail_odosielatel", JSON.stringify(kus(b.odosielatel, 200).trim())]);
            if (b.dennyLimit !== undefined && Number(b.dennyLimit) > 0) zapis.push(["mail_denny_limit", JSON.stringify(Math.min(100, Math.round(Number(b.dennyLimit))))]);
            if (b.darcekNazov !== undefined || b.darcekUrl !== undefined) {
              const url = kus(b.darcekUrl, 500).trim();
              if (url && !/^https:\/\//.test(url)) return chyba("Odkaz na darček musí začínať https://.");
              zapis.push(["mail_darcek", JSON.stringify({ nazov: kus(b.darcekNazov, 120).trim(), url })]);
            }
            if (zapis.length) {
              await DB.batch(zapis.map(([k, v]) => DB.prepare(
                "INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
              ).bind(k, v, teraz)));
              await audit(DB, { action: "nastavenie", predmet: "mailer", neu: zapis.map(([k]) => k).join(", "), actor });
            }
            return Response.json({ ok: true });
          }

          return chyba("Neznáma akcia.");
        } catch (e) {
          return chyba(String(e).slice(0, 300), 500);
        }
      },
    },
  },
});
