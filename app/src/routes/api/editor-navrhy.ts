import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { odsifruj, odsifrujBajty, zasifruj, zasifrujBajty } from "../../lib/psb/sifra.server";

/**
 * ROZROBENÉ NÁVRHY EDITORA FOTIEK NA SERVERI (Jerry, 12. 10. 2026: „prečo
 * fotky, ktoré upravím v PC, nie sú potom v iPade… ukladaj to na server").
 *
 *   GET                 → zoznam mojich návrhov (najnovšie prvé, najviac 30)
 *   GET ?id=X           → stav editora {stav, rozmery} (rozšifrovaný)
 *   GET ?nahlad=X       → náhľad (JPEG)
 *   GET ?obr=X&tok=Y    → fotka návrhu, ktorá nie je v kartotéke (z počítača…)
 *   POST multipart      → uloží návrh: id?, klient, edit (JSON; nové fotky ako
 *                         „obr:N" + súbory obrN), nahlad → { id, zdroje: {"obr:N": adresa} }
 *   POST { akcia: "zmaz", id }
 *
 * Každý tréner vidí len svoje (kto = prihlásený). Stav aj fotky sú ŠIFROVANÉ
 * kľúčom anamnézy, fotky v R2 pod editor/navrhy/<id>/….
 */
type Env = {
  DB?: import("@cloudflare/workers-types").D1Database;
  STORAGE?: import("@cloudflare/workers-types").R2Bucket;
  ANAMNEZA_KLUC?: string;
};
const MAX_NAVRHOV = 30;
const MAX_BAJTOV = 6 * 1024 * 1024;
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const platneId = (s: unknown) => /^n[a-z0-9]{6,20}$/.test(String(s || ""));
const predpona = (id: string) => `editor/navrhy/${id}/`;

async function zmazNavrh(env: Required<Pick<Env, "DB" | "STORAGE">>, id: string) {
  const zoznam = await env.STORAGE.list({ prefix: predpona(id) }).catch(() => null);
  for (const o of zoznam?.objects || []) await env.STORAGE.delete(o.key).catch(() => {});
  await env.DB.prepare("DELETE FROM editor_navrhy WHERE id = ?1").bind(id).run();
}

export const Route = createFileRoute("/api/editor-navrhy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB || !STORAGE || !ANAMNEZA_KLUC) return chyba("Úložisko alebo kľúč nie je nastavené.", 503);
        const kto = (await currentUser(request)) || "";
        const q = new URL(request.url).searchParams;

        const obraz = async (kluc: string) => {
          const obj = await STORAGE.get(kluc);
          if (!obj) return new Response("Nenájdené", { status: 404 });
          const cista = await odsifrujBajty(await obj.arrayBuffer(), ANAMNEZA_KLUC);
          return new Response(cista as unknown as ArrayBuffer, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable", "x-robots-tag": "noindex" } });
        };
        const nahlad = q.get("nahlad");
        if (nahlad) {
          if (!platneId(nahlad)) return chyba("zlé id");
          const r = await DB.prepare("SELECT id FROM editor_navrhy WHERE id = ?1 AND kto = ?2").bind(nahlad, kto).first();
          if (!r) return new Response("Nenájdené", { status: 404 });
          const res = await obraz(`${predpona(nahlad)}nahlad`);
          res.headers.set("cache-control", "private, no-cache");
          return res;
        }
        const obr = q.get("obr"), tok = q.get("tok") || "";
        if (obr) {
          // Fotku návrhu môže zobraziť každý prihlásený — z návrhu sa môže stať
          // porovnanie v kartotéke (a tá adresa v jeho stave ostane).
          if (!platneId(obr) || !/^[a-z0-9]{6,16}$/.test(tok)) return chyba("zlé id");
          return obraz(`${predpona(obr)}obr-${tok}`);
        }
        const id = q.get("id");
        if (id) {
          if (!platneId(id)) return chyba("zlé id");
          const r = await DB.prepare("SELECT id, klient, stav, upravene_at FROM editor_navrhy WHERE id = ?1 AND kto = ?2").bind(id, kto)
            .first<{ id: string; klient: string | null; stav: string; upravene_at: string }>();
          if (!r) return chyba("Taký návrh nie je.", 404);
          try {
            return Response.json({ ok: true, id: r.id, klient: r.klient || "", upravene: r.upravene_at, edit: JSON.parse(await odsifruj(r.stav, ANAMNEZA_KLUC)) }, { headers: { "cache-control": "no-store" } });
          } catch (e) {
            return chyba(`Návrh sa nepodarilo prečítať: ${String(e).slice(0, 120)}`, 500);
          }
        }
        const zoznam = (await DB.prepare("SELECT id, klient, ma_nahlad, upravene_at FROM editor_navrhy WHERE kto = ?1 ORDER BY upravene_at DESC LIMIT ?2")
          .bind(kto, MAX_NAVRHOV).all().then((x) => x.results as Record<string, unknown>[]).catch(() => null));
        if (!zoznam) return chyba("Tabuľka návrhov chýba (migrácia 0116).", 500);
        return Response.json({ ok: true, navrhy: zoznam.map((r) => ({ id: r.id, klient: r.klient || "", maNahlad: !!r.ma_nahlad, upravene: r.upravene_at })) }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB || !STORAGE || !ANAMNEZA_KLUC) return chyba("Úložisko alebo kľúč nie je nastavené.", 503);
        const kto = (await currentUser(request)) || "";
        if (!kto) return chyba("Neviem, kto je prihlásený.", 401);

        if (!(request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
          const b = (await request.json().catch(() => ({}))) as { akcia?: string; id?: string };
          if (b.akcia === "zmaz" && platneId(b.id)) {
            const r = await DB.prepare("SELECT id FROM editor_navrhy WHERE id = ?1 AND kto = ?2").bind(b.id, kto).first();
            if (!r) return chyba("Taký návrh nie je.", 404);
            await zmazNavrh({ DB, STORAGE }, String(b.id));
            return Response.json({ ok: true });
          }
          return chyba("neznáma akcia");
        }

        const form = await request.formData();
        let id = String(form.get("id") || "");
        if (id) {
          if (!platneId(id)) return chyba("zlé id");
          const r = await DB.prepare("SELECT kto FROM editor_navrhy WHERE id = ?1").bind(id).first<{ kto: string }>();
          if (r && r.kto !== kto) return chyba("Tento návrh patrí inému trénerovi.", 403);
        } else {
          id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        }
        let edit = String(form.get("edit") || "");
        if (!edit || edit.length > 400_000) return chyba("Chýba stav editora.");
        const subor = (k: string) => {
          const f = form.get(k);
          if (!f || typeof f === "string") return null;
          const x = f as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
          return /^image\/(jpeg|png|webp)$/.test((x.type || "").split(";")[0]) && x.size <= MAX_BAJTOV ? x : null;
        };
        const zdroje: Record<string, string> = {};
        for (let n = 0; n < 2; n++) {
          const f = subor(`obr${n}`);
          if (!f || !edit.includes(`"obr:${n}"`)) continue;
          const tok = Math.random().toString(36).slice(2, 12).padEnd(8, "0");
          await STORAGE.put(`${predpona(id)}obr-${tok}`, await zasifrujBajty(await f.arrayBuffer(), ANAMNEZA_KLUC), { httpMetadata: { contentType: "application/octet-stream" } });
          const url = `/api/editor-navrhy?obr=${id}&tok=${tok}`;
          zdroje[`obr:${n}`] = url;
          edit = edit.split(`"obr:${n}"`).join(JSON.stringify(url));
        }
        const nahlad = subor("nahlad");
        if (nahlad) await STORAGE.put(`${predpona(id)}nahlad`, await zasifrujBajty(await nahlad.arrayBuffer(), ANAMNEZA_KLUC), { httpMetadata: { contentType: "application/octet-stream" } });
        // Fotky návrhu, na ktoré už stav neodkazuje, preč.
        const zoznam = await STORAGE.list({ prefix: `${predpona(id)}obr-` }).catch(() => null);
        for (const o of zoznam?.objects || []) {
          const t = o.key.slice(`${predpona(id)}obr-`.length);
          if (!edit.includes(`tok=${t}`)) await STORAGE.delete(o.key).catch(() => {});
        }
        const teraz = new Date().toISOString();
        const klient = String(form.get("klient") || "").trim().slice(0, 120) || null;
        await DB.prepare(
          `INSERT INTO editor_navrhy (id, kto, klient, stav, ma_nahlad, vytvorene_at, upravene_at) VALUES (?1,?2,?3,?4,?5,?6,?6)
           ON CONFLICT(id) DO UPDATE SET klient = excluded.klient, stav = excluded.stav, ma_nahlad = MAX(editor_navrhy.ma_nahlad, excluded.ma_nahlad), upravene_at = excluded.upravene_at`,
        ).bind(id, kto, klient, await zasifruj(edit, ANAMNEZA_KLUC), nahlad ? 1 : 0, teraz).run();
        // Najviac MAX_NAVRHOV na trénera — najstarší odchádzajú aj s fotkami.
        const stare = (await DB.prepare("SELECT id FROM editor_navrhy WHERE kto = ?1 ORDER BY upravene_at DESC LIMIT -1 OFFSET ?2").bind(kto, MAX_NAVRHOV).all()).results as { id: string }[];
        for (const s of stare) await zmazNavrh({ DB, STORAGE }, s.id);
        return Response.json({ ok: true, id, zdroje, upravene: teraz });
      },
    },
  },
});
