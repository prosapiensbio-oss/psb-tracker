import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Marketingové nápady.
 *
 * Surové vety, z ktorých sa raz stane obsah — najčastejšie otázka, ktorú
 * klient položí počas tréningu. Zapisujú sa v „+ Zápis" jedným riadkom, lebo
 * o mesiac si ich nikto nepamätá a obchádzka na inú obrazovku by ich zabila.
 *
 * PREČO SA NIČ NEMAŽE
 *
 * Zamietnutý nápad zostáva so zdôvodnením. Vedieť, že sa téma už raz zavrhla
 * a prečo, je cennejšie než čistý zoznam — inak sa tá istá vec navrhne znova
 * a znova sa nad ňou premýšľa od nuly.
 */

const STAVY = new Set(["novy", "pouzity", "zamietnuty"]);
const ZDROJE = new Set(["otazka_klienta", "vlastny", "jarvis", "ine"]);

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const Route = createFileRoute("/api/napady")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const r = await DB.prepare(
            "SELECT id, datum, text, zdroj, stav, poznamka, autor, odkaz, pouzite_at FROM mkt_napady ORDER BY datum DESC, created_at DESC LIMIT 200",
          ).all();
          return Response.json({ ok: true, napady: r.results || [] });
        } catch {
          // Tabuľka ešte nie je (staršia migrácia) — obrazovka si vystačí s prázdnym.
          return Response.json({ ok: true, napady: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        try {
          const id = kus(b.id, 40);

          if (b.zmaz === true && id) {
            await DB.prepare("DELETE FROM mkt_napady WHERE id = ?1").bind(id).run();
            return Response.json({ ok: true });
          }

          // Úprava stavu alebo poznámky pri existujúcom nápade.
          if (id) {
            const stav = STAVY.has(String(b.stav)) ? String(b.stav) : null;
            const poznamka = b.poznamka === undefined ? null : kus(b.poznamka, 600);
            // Odkaz na hotový príspevok — tým sa kruh uzatvára. Prázdny
            // reťazec je platná hodnota (odkaz sa dá odobrať), preto sa
            // rozlišuje `undefined` od `""`.
            const odkaz = b.odkaz === undefined ? null : kus(b.odkaz, 500);
            if (stav === null && poznamka === null && odkaz === null) {
              return Response.json({ ok: false, error: "nič na zmenu" }, { status: 400 });
            }
            // Deň použitia sa zapíše sám pri prechode na „použitý" — nikto ho
            // nebude vypĺňať ručne a bez neho sa nedá povedať, za ako dlho sa
            // nápad premení na obsah.
            const pouzite = stav === "pouzity" ? new Date().toISOString().slice(0, 10) : null;
            await DB.prepare(
              `UPDATE mkt_napady SET stav = COALESCE(?2, stav), poznamka = COALESCE(?3, poznamka),
                 odkaz = COALESCE(?4, odkaz),
                 pouzite_at = CASE WHEN ?5 IS NOT NULL AND pouzite_at = '' THEN ?5 ELSE pouzite_at END
               WHERE id = ?1`,
            ).bind(id, stav, poznamka, odkaz, pouzite).run().then((r) => {
              // UPDATE s neexistujúcim id prejde „úspešne" s nulou zmien —
              // a obrazovka by ohlásila uložené nad ničím (revízia 19. 8.).
              if (!r.meta.changes) throw new Error("nenajdene");
            });
            return Response.json({ ok: true, id });
          }

          const text = kus(b.text, 600);
          if (text.length < 3) return Response.json({ ok: false, error: "Nápad je prázdny." }, { status: 400 });
          const zdroj = ZDROJE.has(String(b.zdroj)) ? String(b.zdroj) : "vlastny";
          const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(b.datum))
            ? String(b.datum)
            : new Date().toISOString().slice(0, 10);
          const novy = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const autor = (await currentUser(request)) || "";

          await DB.prepare(
            `INSERT INTO mkt_napady (id, datum, text, zdroj, stav, poznamka, autor, created_at)
             VALUES (?1, ?2, ?3, ?4, 'novy', '', ?5, ?6)`,
          ).bind(novy, datum, text, zdroj, autor, new Date().toISOString()).run();

          await audit(DB, { action: "zapis", predmet: "marketingový nápad", neu: text.slice(0, 120), actor: autor || undefined });
          return Response.json({ ok: true, id: novy });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
