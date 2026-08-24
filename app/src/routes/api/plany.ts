import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { METRIKA_MAPA, jeStav, mesiacePlanu } from "../../lib/psb/plan";
import { jeMesiac } from "../../lib/psb/format";

/**
 * Marketingové plány.
 *
 * PREČO SA NIČ NEMAŽE NATVRDO BEZ VYŽIADANIA
 *
 * Vyhodnotený plán je záznam o tom, čo sme skúsili a ako to dopadlo — to je
 * cennejšie než čistý zoznam. Mazať sa dá, ale musí sa o to poprosiť.
 */

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);


/** Metriky prídu ako JSON. Neznáme kľúče sa ODMIETAJÚ, nezahadzujú sa ticho. */
function metrikyZTela(v: unknown): { ok: true; json: string } | { ok: false; chyba: string } {
  if (v === undefined) return { ok: true, json: "" };
  let pole: unknown;
  try { pole = typeof v === "string" ? JSON.parse(v || "[]") : v; }
  catch { return { ok: false, chyba: "Metriky sa nedajú prečítať." }; }
  if (!Array.isArray(pole)) return { ok: false, chyba: "Metriky musia byť zoznam." };
  const out: { kluc: string; cielova: number }[] = [];
  for (const m of pole) {
    const o = m as { kluc?: unknown; cielova?: unknown };
    const kluc = String(o?.kluc ?? "");
    if (!METRIKA_MAPA.has(kluc)) return { ok: false, chyba: `Neznáma metrika „${kluc}".` };
    const cielova = Number(o?.cielova);
    if (!Number.isFinite(cielova)) return { ok: false, chyba: `Metrika „${kluc}" nemá platnú cieľovú hodnotu.` };
    out.push({ kluc, cielova });
  }
  return { ok: true, json: JSON.stringify(out) };
}

export const Route = createFileRoute("/api/plany")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const r = await DB.prepare(
            `SELECT id, nazov, od, do_ AS do, ciel, preco, metriky, pristup, rozpocet,
                    stav, vyhodnotenie, autor, created_at, updated_at
               FROM mkt_plany ORDER BY od DESC, created_at DESC LIMIT 100`,
          ).all();
          return Response.json({ ok: true, plany: r.results || [] });
        } catch {
          // Tabuľka ešte nie je (staršia migrácia) — obrazovka si vystačí s prázdnym.
          return Response.json({ ok: true, plany: [] });
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
            const r = await DB.prepare("DELETE FROM mkt_plany WHERE id = ?1").bind(id).run();
            if (!r.meta.changes) return Response.json({ ok: false, error: "Plán sa nenašiel." }, { status: 404 });
            // Sloty osirotia, nezmiznú — obsah je hotová práca a plán bol len obal.
            await DB.prepare("UPDATE mkt_napady SET plan_id = '' WHERE plan_id = ?1").bind(id).run();
            return Response.json({ ok: true });
          }

          if (b.od !== undefined && !jeMesiac(b.od)) {
            return Response.json({ ok: false, error: "Od má tvar RRRR-MM." }, { status: 400 });
          }
          if (b.do !== undefined && !jeMesiac(b.do)) {
            return Response.json({ ok: false, error: "Do má tvar RRRR-MM." }, { status: 400 });
          }
          if (b.od !== undefined && b.do !== undefined && !mesiacePlanu(String(b.od), String(b.do)).length) {
            return Response.json({ ok: false, error: "Obdobie nedáva zmysel — do je pred od alebo je príliš dlhé." }, { status: 400 });
          }
          if (b.stav !== undefined && !jeStav(b.stav)) {
            return Response.json({ ok: false, error: "Neplatný stav." }, { status: 400 });
          }
          const met = metrikyZTela(b.metriky);
          if (!met.ok) return Response.json({ ok: false, error: met.chyba }, { status: 400 });
          const rozpocet = b.rozpocet === undefined ? null : Math.max(0, Math.round(Number(b.rozpocet) || 0));

          const teraz = new Date().toISOString();
          const autor = (await currentUser(request)) || "";

          if (id) {
            const r = await DB.prepare(
              `UPDATE mkt_plany SET
                 nazov = COALESCE(?2, nazov), od = COALESCE(?3, od), do_ = COALESCE(?4, do_),
                 ciel = COALESCE(?5, ciel), preco = COALESCE(?6, preco),
                 metriky = COALESCE(?7, metriky), pristup = COALESCE(?8, pristup),
                 rozpocet = COALESCE(?9, rozpocet), stav = COALESCE(?10, stav),
                 vyhodnotenie = COALESCE(?11, vyhodnotenie), updated_at = ?12
               WHERE id = ?1`,
            ).bind(
              id,
              b.nazov === undefined ? null : kus(b.nazov, 120),
              b.od === undefined ? null : String(b.od),
              b.do === undefined ? null : String(b.do),
              b.ciel === undefined ? null : text(b.ciel, 1000),
              b.preco === undefined ? null : text(b.preco, 1000),
              b.metriky === undefined ? null : met.json,
              b.pristup === undefined ? null : text(b.pristup, 4000),
              rozpocet,
              b.stav === undefined ? null : String(b.stav),
              b.vyhodnotenie === undefined ? null : text(b.vyhodnotenie, 4000),
              teraz,
            ).run();
            // UPDATE nad neexistujúcim id prejde s nulou zmien a obrazovka by
            // ohlásila uložené nad ničím (revízia 19. 8.).
            if (!r.meta.changes) return Response.json({ ok: false, error: "Plán sa nenašiel." }, { status: 404 });
            return Response.json({ ok: true, id });
          }

          const nazov = kus(b.nazov, 120);
          if (nazov.length < 2) return Response.json({ ok: false, error: "Plán potrebuje názov." }, { status: 400 });
          if (!jeMesiac(b.od) || !jeMesiac(b.do)) {
            return Response.json({ ok: false, error: "Plán potrebuje obdobie od a do." }, { status: 400 });
          }
          const novy = `pl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          await DB.prepare(
            `INSERT INTO mkt_plany (id, nazov, od, do_, ciel, preco, metriky, pristup, rozpocet,
                                    stav, vyhodnotenie, autor, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '', ?11, ?12, ?12)`,
          ).bind(
            novy, nazov, String(b.od), String(b.do), text(b.ciel, 1000), text(b.preco, 1000),
            met.json, text(b.pristup, 4000), rozpocet ?? 0,
            jeStav(b.stav) ? String(b.stav) : "navrh", autor, teraz,
          ).run();

          await audit(DB, { action: "zapis", predmet: "marketingový plán", neu: nazov, actor: autor || undefined });
          return Response.json({ ok: true, id: novy });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
