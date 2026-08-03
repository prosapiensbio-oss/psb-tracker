import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Nákupný zoznam náradia.
//
//   GET                              → položky
//   POST { id?, nazov, cena, link, kupene, poznamka }  → pridá alebo prepíše
//   POST { id, zmazat: true }        → zmaže
//
// Zápis do auditu je len pri pridaní, zmazaní a pri prepnutí „kúpené" —
// prepisovanie ceny počas hľadania v e-shope by audit zaplo tak, že by v ňom
// nebolo vidieť to podstatné.
const uid = () => crypto.randomUUID();

type Polozka = { id?: string; nazov?: string; cena?: number; link?: string; kupene?: boolean; poznamka?: string; zmazat?: boolean };

export const Route = createFileRoute("/api/wishlist")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, polozky: [] });
        try {
          const rs = await DB.prepare(
            "SELECT id, nazov, cena, link, kupene, kupene_at, poznamka, poradie FROM wishlist ORDER BY kupene, poradie, nazov",
          ).all();
          return Response.json({
            ok: true,
            polozky: (rs.results as Record<string, unknown>[]).map((r) => ({
              id: r.id, nazov: r.nazov, cena: Number(r.cena) || 0, link: r.link || "",
              kupene: !!r.kupene, kupeneAt: r.kupene_at || "", poznamka: r.poznamka || "",
            })),
          });
        } catch {
          return Response.json({ ok: false, polozky: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Polozka;
        try { b = (await request.json()) as Polozka; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const actor = (await currentUser(request)) || undefined;

        if (b.zmazat) {
          const id = String(b.id || "");
          if (!id) return Response.json({ ok: false, error: "no_id" }, { status: 400 });
          const stara = await DB.prepare("SELECT nazov FROM wishlist WHERE id = ?1").bind(id).first<{ nazov: string }>();
          await DB.prepare("DELETE FROM wishlist WHERE id = ?1").bind(id).run();
          await audit(DB, { action: "wishlist-zmazanie", predmet: stara?.nazov || id, actor });
          return Response.json({ ok: true });
        }

        const nazov = String(b.nazov || "").trim().slice(0, 120);
        if (!nazov) return Response.json({ ok: false, error: "no_name" }, { status: 400 });
        const cena = Math.max(0, Math.round(Number(b.cena) || 0));
        const link = String(b.link || "").trim().slice(0, 500);
        const poznamka = String(b.poznamka || "").trim().slice(0, 300);
        const kupene = b.kupene ? 1 : 0;
        const now = new Date().toISOString();

        if (b.id) {
          const stara = await DB.prepare("SELECT nazov, kupene FROM wishlist WHERE id = ?1").bind(String(b.id)).first<{ nazov: string; kupene: number }>();
          if (!stara) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
          // Dátum nákupu sa nastaví pri prepnutí a pri odškrtnutí zmizne — inak
          // by pri omylom zaškrtnutej položke zostal visieť nepravdivý dátum.
          await DB.prepare(
            `UPDATE wishlist SET nazov = ?2, cena = ?3, link = ?4, kupene = ?5, poznamka = ?6,
             kupene_at = CASE WHEN ?5 = 1 THEN COALESCE(kupene_at, ?7) ELSE NULL END WHERE id = ?1`,
          ).bind(String(b.id), nazov, cena, link, kupene, poznamka, now).run();
          if (!!stara.kupene !== !!kupene) {
            await audit(DB, {
              action: "wishlist-nakup", predmet: nazov,
              old: stara.kupene ? "kúpené" : "chce sa", neu: kupene ? "kúpené" : "chce sa",
              actor,
            });
          }
          return Response.json({ ok: true, id: b.id });
        }

        const id = uid();
        const max = await DB.prepare("SELECT COALESCE(MAX(poradie), 0) AS m FROM wishlist").first<{ m: number }>();
        await DB.prepare(
          `INSERT INTO wishlist (id, nazov, cena, link, kupene, kupene_at, poznamka, poradie, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        ).bind(id, nazov, cena, link, kupene, kupene ? now : null, poznamka, (max?.m || 0) + 1, now).run();
        await audit(DB, { action: "wishlist-pridanie", predmet: nazov, neu: cena ? `${cena} Kč` : undefined, actor });
        return Response.json({ ok: true, id });
      },
    },
  },
});
