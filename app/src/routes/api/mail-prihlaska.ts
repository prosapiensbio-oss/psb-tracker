import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { audit } from "../../lib/psb/audit.server";
import { mailHtml, mailText } from "../../lib/psb/mailSablona";
import { cistyMail, platnyMail } from "../../lib/psb/mailSkupiny";
import { AKTUALNA_VERZIA, STROP_CAKAJUCICH, WEBY_PRIHLASENIA, ZNENIA_SUHLASU } from "../../lib/psb/mailSuhlas";
import { nastavenieMailera, novyToken, posliJedenMail, ZAKLAD_ODKAZOV } from "../../lib/psb/mailer.server";

/**
 * PRIHLÁSENIE Z WEBU: zaškrtnuté políčko pri formulári (Jerry, 4. 11. 2026).
 *
 * Človek ešte nie je v zozname. Dostane potvrdzovací mail s darčekom a do zoznamu
 * sa dostane až klikom. Je to odpoveď na jeho vlastnú žiadosť, nie hromadný mail,
 * preto nečaká na Jerryho kliknutie. Vďaka potvrdeniu sa nedá prihlásiť cudzia
 * adresa a v doklade je políčko aj klik.
 */
const hlavicky = (origin: string | null): Record<string, string> =>
  origin && WEBY_PRIHLASENIA.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" }
    : {};
const kus = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export function mailPotvrdenia(token: string, meno: string, darcekNazov: string) {
  const url = `${ZAKLAD_ODKAZOV}/m/${token}`;
  const telo = `Ahoj {oslovení},

díky za zájem o e-maily od ProSapiens Biomechanic. Stačí jeden klik, kterým potvrdíš, že tahle adresa je tvoje${darcekNazov ? `, a hned si stáhneš ${darcekNazov}` : ""}.

[${darcekNazov ? "Potvrdit a stáhnout dárek" : "Potvrdit odběr"}](${url})

Píšeme zhruba jednou za měsíc, a jen když je o čem. Odhlásit se můžeš jedním klikem v každém e-mailu.

Filip`;
  const vstup = {
    druh: "darcek", nadpis: darcekNazov ? "Ještě jeden klik a dárek je tvůj." : "Ještě jeden klik.",
    telo, meno, odhlasitUrl: url, bezOznacenia: true,
    pataText: "Pokud o nic takového nestojíš, tento e-mail ignoruj. Bez potvrzení ti nic dalšího nepošleme.",
    predmet: darcekNazov ? "Potvrď odběr a stáhni si dárek" : "Potvrď odběr",
  };
  return { subject: vstup.predmet, html: mailHtml(vstup), text: mailText(vstup) };
}

export const Route = createFileRoute("/api/mail-prihlaska")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: hlavicky(request.headers.get("origin")) }),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const h = hlavicky(origin);
        const odpoved = (o: unknown, status = 200) => Response.json(o, { status, headers: h });
        if (!Object.keys(h).length) return odpoved({ ok: false }, 403);
        const { DB } = bindings() as { DB?: D1Database };
        if (!DB) return odpoved({ ok: false }, 503);
        const b = await request.json().catch(() => ({})) as Record<string, unknown>;
        // Pasca: neviditeľné pole vyplní len robot. Tvári sa ako úspech.
        if (kus(b["psb-web"], 10)) return odpoved({ ok: true });
        const email = cistyMail(b.email);
        if (!platnyMail(email) || email.length > 200) return odpoved({ ok: false, error: "email" }, 400);
        const verzia = kus(b.verzia, 8) || AKTUALNA_VERZIA;
        if (!ZNENIA_SUHLASU[verzia]) return odpoved({ ok: false, error: "verzia" }, 400);
        const meno = kus(b.meno, 120);
        const stranka = kus(b.stranka, 300);
        const teraz = new Date();
        const iso = teraz.toISOString();
        const od = new Date(teraz.getTime() - 86400000).toISOString();

        const pocet = await DB.prepare("SELECT COUNT(*) n FROM mail_odberatelia WHERE status = 'caka_potvrdenie' AND suhlas_at >= ?1").bind(od).first<{ n: number }>();
        if (Number(pocet?.n || 0) >= STROP_CAKAJUCICH) {
          await audit(DB, { action: "mail-prihlaska-strop", predmet: stranka, neu: email, actor: "web" }).catch(() => {});
          return odpoved({ ok: false, error: "strop" }, 429);
        }

        const n = await nastavenieMailera(DB);
        const znenie = ZNENIA_SUHLASU[verzia].replace("{darcek}", n.darcekNazov || "dárek");
        const token = novyToken("p");
        const riadok = await DB.prepare("SELECT id, status, suhlas_at, potvrdene_at, meno FROM mail_odberatelia WHERE lower(email) = ?1 LIMIT 1")
          .bind(email).first<{ id: string; status: string; suhlas_at: string; potvrdene_at: string; meno: string }>();
        if (riadok?.suhlas_at && riadok.suhlas_at >= new Date(teraz.getTime() - 600000).toISOString()) return odpoved({ ok: true });

        if (riadok) {
          // Aktívny ostáva aktívny, odhlásený čaká na svoj nový klik.
          await DB.prepare(
            `UPDATE mail_odberatelia SET suhlas_at = ?2, suhlas_zdroj = ?3, suhlas_znenie = ?4, potvrdenie_token = ?5,
               status = CASE WHEN status = 'active' THEN status ELSE 'caka_potvrdenie' END,
               meno = CASE WHEN meno = '' THEN ?6 ELSE meno END, updated_at = ?2 WHERE id = ?1`,
          ).bind(riadok.id, iso, stranka, znenie, token, meno).run();
        } else {
          await DB.prepare(
            `INSERT INTO mail_odberatelia (id, email, meno, prihlaseny, status, suhlas_at, suhlas_zdroj, suhlas_znenie, potvrdenie_token, updated_at)
             VALUES (?1,?2,?3,?4,'caka_potvrdenie',?5,?6,?7,?8,?5)`,
          ).bind(`w_${crypto.randomUUID()}`, email, meno, iso.slice(0, 10), iso, stranka, znenie, token).run();
        }
        if (n.kluc) {
          const m = mailPotvrdenia(token, meno || riadok?.meno || "", n.darcekNazov);
          const r = await posliJedenMail(n.kluc, { from: n.odosielatel, to: [email], reply_to: /<([^>]+)>/.exec(n.odosielatel)?.[1], ...m });
          if (!r.ok) await audit(DB, { action: "mail-potvrdenie-zlyhalo", predmet: stranka, neu: r.chyba, actor: "web" }).catch(() => {});
        }
        return odpoved({ ok: true });
      },
    },
  },
});
