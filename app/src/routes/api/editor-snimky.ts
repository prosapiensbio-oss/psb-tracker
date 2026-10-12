import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { odsifrujBajty, zasifrujBajty } from "../../lib/psb/sifra.server";

/**
 * SNÍMKY Z EDITORA VIDEA NA SERVERI (12. 10. 2026) — zásobník, z ktorého si
 * ich berie editor fotiek. Doteraz IndexedDB prehliadača, teraz rovnaké na
 * PC aj iPade. Každý tréner má svoje; obrázky v R2 zašifrované.
 *
 *   GET            → zoznam mojich snímok
 *   GET ?id=N      → obrázok
 *   POST multipart → { subor, den, cas, zdroj, oznacenie } → { id }
 *   POST { akcia: "zmaz", id }
 */
type Env = {
  DB?: import("@cloudflare/workers-types").D1Database;
  STORAGE?: import("@cloudflare/workers-types").R2Bucket;
  ANAMNEZA_KLUC?: string;
};
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const MAX_SNIMOK = 120;

export const Route = createFileRoute("/api/editor-snimky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB || !STORAGE || !ANAMNEZA_KLUC) return chyba("Úložisko alebo kľúč nie je nastavené.", 503);
        const kto = (await currentUser(request)) || "";
        const id = Number(new URL(request.url).searchParams.get("id") || 0);
        if (id) {
          // Obrázok vydá každému prihlásenému — snímka môže byť v porovnaní
          // alebo návrhu a tá adresa v jeho stave ostane.
          const r = await DB.prepare("SELECT kluc FROM editor_snimky WHERE id = ?1").bind(id).first<{ kluc: string }>();
          if (!r) return new Response("Nenájdené", { status: 404 });
          const obj = await STORAGE.get(r.kluc);
          if (!obj) return new Response("Nenájdené", { status: 404 });
          return new Response(await odsifrujBajty(await obj.arrayBuffer(), ANAMNEZA_KLUC) as unknown as ArrayBuffer, {
            headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable", "x-robots-tag": "noindex" },
          });
        }
        const rows = await DB.prepare("SELECT id, den, cas, zdroj, oznacenie, vytvorene_at FROM editor_snimky WHERE kto = ?1 ORDER BY id").bind(kto).all()
          .then((x) => x.results as Record<string, unknown>[]).catch(() => null);
        if (!rows) return chyba("Tabuľka snímok chýba (migrácia 0116).", 500);
        return Response.json({
          ok: true,
          snimky: rows.map((r) => ({ id: Number(r.id), den: r.den || "", cas: Number(r.cas) || 0, zdroj: r.zdroj || "", oznacenie: r.oznacenie || "", vytvorene: r.vytvorene_at, url: `/api/editor-snimky?id=${r.id}` })),
        }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB || !STORAGE || !ANAMNEZA_KLUC) return chyba("Úložisko alebo kľúč nie je nastavené.", 503);
        const kto = (await currentUser(request)) || "";
        if (!kto) return chyba("Neviem, kto je prihlásený.", 401);
        if (!(request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
          const b = (await request.json().catch(() => ({}))) as { akcia?: string; id?: number };
          if (b.akcia !== "zmaz") return chyba("neznáma akcia");
          const r = await DB.prepare("SELECT kluc FROM editor_snimky WHERE id = ?1 AND kto = ?2").bind(Number(b.id) || 0, kto).first<{ kluc: string }>();
          if (!r) return chyba("Taká snímka nie je.", 404);
          await STORAGE.delete(r.kluc).catch(() => {});
          await DB.prepare("DELETE FROM editor_snimky WHERE id = ?1").bind(Number(b.id)).run();
          return Response.json({ ok: true });
        }
        const form = await request.formData();
        const f = form.get("subor");
        if (!f || typeof f === "string") return chyba("Chýba súbor.");
        const x = f as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
        if (!/^image\/(jpeg|png|webp)$/.test((x.type || "").split(";")[0]) || x.size > 6 * 1024 * 1024) return chyba("Toto nie je fotka do 6 MB.");
        const kluc = `editor/snimky/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await STORAGE.put(kluc, await zasifrujBajty(await x.arrayBuffer(), ANAMNEZA_KLUC), { httpMetadata: { contentType: "application/octet-stream" } });
        const s = (k: string, n = 120) => String(form.get(k) ?? "").trim().slice(0, n);
        const r = await DB.prepare("INSERT INTO editor_snimky (kto, den, cas, zdroj, oznacenie, kluc, vytvorene_at) VALUES (?1,?2,?3,?4,?5,?6,?7) RETURNING id")
          .bind(kto, s("den", 10) || null, Number(form.get("cas")) || 0, s("zdroj"), s("oznacenie", 40), kluc, new Date().toISOString()).first<{ id: number }>();
        // Najviac MAX_SNIMOK na trénera — najstaršie odchádzajú.
        const stare = (await DB.prepare("SELECT id, kluc FROM editor_snimky WHERE kto = ?1 ORDER BY id DESC LIMIT -1 OFFSET ?2").bind(kto, MAX_SNIMOK).all()).results as { id: number; kluc: string }[];
        for (const o of stare) { await STORAGE.delete(o.kluc).catch(() => {}); await DB.prepare("DELETE FROM editor_snimky WHERE id = ?1").bind(o.id).run(); }
        return Response.json({ ok: true, id: r?.id });
      },
    },
  },
});
