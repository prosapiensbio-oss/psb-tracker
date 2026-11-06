import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { audit } from "../../lib/psb/audit.server";
import { nastavenieMailera, textPrijatehoMailu, zakazAdresu } from "../../lib/psb/mailer.server";
import { pushTrenerovi } from "../../lib/psb/ponukaTerminov.server";
import { jeAutomatickaOdpoved, overPodpis, rozoberOdosielatela } from "../../lib/psb/resendPodpis";
import { zasifruj } from "../../lib/psb/sifra.server";

/**
 * WEBHOOK Z RESENDU: doručené, otvorené, kliknuté, odrazené, sťažnosť, odpoveď.
 *
 * Tvrdé odrazenie a sťažnosť zapíšu človeka medzi tých, komu sa už nepíše: inak
 * reputácia domény klesá a maily začnú padať do spamu všetkým.
 *
 * ODPOVEDE NEIDÚ DO DOPYTOV (Jerry, 4. 11. 2026: „odpovede sa nesmú tváriť ako
 * dopyty"). Ukladajú sa zvlášť a dopyt z nich vznikne len tlačidlom. Text býva
 * o zdraví, preto je šifrovaný; bez kľúča sa nezapíše čitateľne, Resend skúsi
 * doručiť znova.
 */
const STLPCE: Record<string, { stlpec: string; pocitadlo?: string }> = {
  "email.delivered": { stlpec: "dorucene_at" },
  "email.opened": { stlpec: "otvorene_at", pocitadlo: "otvoreni" },
  "email.clicked": { stlpec: "kliknute_at", pocitadlo: "klikov" },
  "email.bounced": { stlpec: "odrazene_at" },
  "email.complained": { stlpec: "staznost_at" },
};

async function zapisUdalost(DB: D1Database, typ: string, data: any, kedy: string) {
  const s = STLPCE[typ];
  if (!s || !data?.email_id) return;
  // Resend meria aj klik na odhlásenie (6. 11. 2026 v skúšobnom maili). To nie je
  // záujem o obsah: klik na `/m/` sa do klikov nepočíta, odhlásenie zapíše stránka.
  if (typ === "email.clicked" && /\/m\/[op][A-Za-z0-9]{15}/.test(String(data?.click?.link || ""))) return;
  const p = await DB.prepare("SELECT token, email, skuska FROM mail_prijemcovia WHERE resend_id = ?1")
    .bind(String(data.email_id)).first<{ token: string; email: string; skuska: number }>();
  if (!p) return;
  const r = await DB.prepare(`UPDATE mail_prijemcovia SET ${s.stlpec} = ?2 WHERE token = ?1 AND ${s.stlpec} = ''`).bind(p.token, kedy).run();
  if (p.skuska) return;
  if (s.pocitadlo && r.meta?.changes) {
    await DB.prepare(`UPDATE mail_odberatelia SET ${s.pocitadlo} = ${s.pocitadlo} + 1 WHERE lower(email) = ?1`).bind(p.email.toLowerCase()).run();
  }
  const tvrde = typ === "email.bounced" && !/transient|soft/i.test(String(data?.bounce?.type || ""));
  if (tvrde || typ === "email.complained") {
    await zakazAdresu(DB, p.email, typ === "email.complained" ? "complained" : "bounced",
      typ === "email.complained" ? "označil mail ako spam" : "adresa nefunguje", kedy);
  }
}

async function zapisOdpoved(DB: D1Database, data: any, kluc: string, tajomstvo: string, kedy: string) {
  const id = String(data?.email_id || "");
  if (!id) return;
  const { meno, email } = rozoberOdosielatela(data?.from);
  const predmet = String(data?.subject || "").slice(0, 300);
  const text = await textPrijatehoMailu(kluc, id);
  const sifra = await zasifruj(text, tajomstvo);
  const p = await DB.prepare(
    "SELECT vydanie, meno FROM mail_prijemcovia WHERE email = ?1 AND odoslane_at <> '' ORDER BY odoslane_at DESC LIMIT 1",
  ).bind(email).first<{ vydanie: string; meno: string }>();
  const automat = jeAutomatickaOdpoved(predmet);
  await DB.prepare(
    `INSERT OR IGNORE INTO mail_odpovede (id, vydanie, email, meno, predmet, text, prijate_at, vybavene_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
  ).bind(id, p?.vydanie || "", email, meno || p?.meno || "", predmet, sifra, kedy, automat ? kedy : "").run();
  if (p && !automat) {
    await pushTrenerovi(DB, "Jerry", {
      titulok: "Odpoveď na mail",
      text: `${meno || p.meno || email} odpísal na hromadný mail.`,
      url: "/#marketing/mail",
      znacka: "mail-odpoved",
    });
  }
}

export const Route = createFileRoute("/api/mail-udalosti")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = bindings() as { DB?: D1Database; ANAMNEZA_KLUC?: string };
        const DB = env.DB;
        if (!DB) return Response.json({ ok: false }, { status: 503 });
        const telo = await request.text();
        const n = await nastavenieMailera(DB);
        const platny = await overPodpis({
          tajomstvo: n.tajomstvoWebhooku,
          id: request.headers.get("svix-id"),
          cas: request.headers.get("svix-timestamp"),
          podpisy: request.headers.get("svix-signature"),
          telo,
        });
        if (!platny) return Response.json({ ok: false }, { status: 401 });
        let u: { type?: string; created_at?: string; data?: any };
        try { u = JSON.parse(telo); } catch { return Response.json({ ok: false }, { status: 400 }); }
        const kedy = new Date().toISOString();
        try {
          if (u.type === "email.received") {
            if (!env.ANAMNEZA_KLUC) return Response.json({ ok: false, error: "bez_kluca" }, { status: 503 });
            await zapisOdpoved(DB, u.data, n.kluc, env.ANAMNEZA_KLUC, kedy);
          } else {
            await zapisUdalost(DB, String(u.type || ""), u.data, kedy);
          }
          return Response.json({ ok: true });
        } catch (e) {
          await audit(DB, { action: "mail-webhook-zlyhal", predmet: String(u.type || ""), neu: String(e).slice(0, 300), actor: "mailer" }).catch(() => {});
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
