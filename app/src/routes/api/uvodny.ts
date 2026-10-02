import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";
import { zalozAleboNajdi } from "../../lib/psb/anamneza.server";

/**
 * ODKAZ NA STRÁNKU PRED ÚVODNÝM / PO ŇOM.
 *
 *   POST { akcia: "odkaz", klient, druh: "pred"|"po", trener?, kedy?, cena? }
 *        → { ok, odkaz, token }
 *
 * Na dvojicu klient + druh je JEDEN token: opakované vyrobenie vráti ten
 * istý odkaz a len doplní, čo sa zmenilo (tréner, termín, cena). Inak by
 * klientovi po presune hodiny chodila druhá adresa a tá prvá by tvrdila
 * starý termín donekonečna.
 *
 * CENA JE PRI ODKAZE, nie v kóde. Jerry, 1. 10. 2026: „niekedy chceme dať
 * klientovi za úvodný tréning zľavu — a vtedy by sa mala upraviť aj cena
 * v tom odkaze." Nastaví sa tu, pri potvrdení termínu.
 */

const ABECEDA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const novyToken = (dlzka = 12) =>
  [...crypto.getRandomValues(new Uint8Array(dlzka))].map((x) => ABECEDA[x % ABECEDA.length]).join("");

export const Route = createFileRoute("/api/uvodny")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        if (String(b.akcia ?? "") !== "odkaz") {
          return Response.json({ ok: false, error: "Neznáma akcia." }, { status: 400 });
        }

        const klient = String(b.klient ?? "").trim().slice(0, 120);
        if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });

        const druh = String(b.druh ?? "pred") === "po" ? "po" : "pred";
        const trener = String(b.trener ?? "").trim() || (await currentUser(request)) || "Jerry";
        const kedy = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(b.kedy ?? "")) ? String(b.kedy).slice(0, 16) : null;

        /**
         * Cena: `null` = bežná, nula = zadarmo. Mimo rozsahu je to preklep
         * a preklep v cene ide ku klientovi — radšej chyba než tiché číslo.
         */
        let cena: number | null = null;
        if (b.cena !== undefined && b.cena !== null && b.cena !== "") {
          const n = Number(b.cena);
          if (!Number.isFinite(n) || n < 0 || n > 100000) {
            return Response.json({ ok: false, error: "Cena musí byť 0 až 100 000." }, { status: 400 });
          }
          cena = Math.round(n);
        }

        try {
          const token = novyToken();
          await DB.prepare(
            `INSERT INTO uvodne_odkazy (token, klient, druh, trener, kedy, cena_czk, vytvorene)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (klient, druh) DO UPDATE SET
               trener   = excluded.trener,
               kedy     = COALESCE(excluded.kedy, uvodne_odkazy.kedy),
               cena_czk = excluded.cena_czk`,
          ).bind(token, klient, druh, trener, kedy, cena, new Date().toISOString()).run();

          const r = await DB.prepare(
            "SELECT token FROM uvodne_odkazy WHERE klient = ?1 AND druh = ?2",
          ).bind(klient, druh).first<{ token: string }>();
          if (!r) return Response.json({ ok: false, error: "Odkaz sa nepodarilo vyrobiť." }, { status: 500 });

          /**
           * ANAMNÉZA VZNIKNE SPOLU S ODKAZOM PRED ÚVODNÝM.
           *
           * Stránka `/u/` kreslí tlačidlo „Vyplnit 3 otázky" len vtedy, keď
           * klient už anamnézu má — GET nemá nič zapisovať. Tu je na to
           * správny okamih: termín sa potvrdzuje rukou a od tej chvíle je
           * jasné, že ten človek na úvodný ide.
           *
           * Zlyhanie sa prehltne zámerne: keď sa anamnéza nezaloží, SMS má
           * aj tak odísť — tlačidlo sa len nenakreslí a dá sa založiť z karty.
           */
          if (druh === "pred") {
            // Bez kľúča sa anamnéza nezakladá — šifrovanie zdravotných
            // odpovedí nie je voliteľné.
            if (ANAMNEZA_KLUC) {
              await zalozAleboNajdi(DB, klient, ANAMNEZA_KLUC, (await currentUser(request)) || "app").catch(() => null);
            }
          }

          await audit(DB, {
            action: "uvodny-odkaz", predmet: klient,
            neu: `${druh === "pred" ? "pred úvodným" : "po úvodnom"}${cena == null ? "" : ` · ${cena} Kč`}`,
            actor: (await currentUser(request)) || undefined,
          });

          // Krátka adresa — v SMS je rozdiel medzi jednou a dvoma správami.
          const odkaz = verejnyOdkaz(`/u/${r.token}`, new URL(request.url).origin);
          return Response.json(
            { ok: true, token: r.token, odkaz },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
