import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Dokumenty priložené k Jarvisovým rozhovorom.
 *
 * V rozhovore leží len odkaz `psbdoc:<id>|<meno>`; obsah je tu. Dôvod je
 * v migrácii 0042: rozhovor sa ukladá po každej správe a nesie celú históriu,
 * takže base64 z 5 MB PDF by sa do databázy prepisovalo pri každej otázke.
 *
 * Obsah vydrží 30 dní. Potom sa zmažú časti a zostane riadok s menom — aby sa
 * dalo dohľadať, ČO k debate viselo, aj keď sa to už nedá prečítať.
 */

const DNI = 30;
const CAST = 700_000;          // D1 má strop ~1 MB na hodnotu; base64 sa krája
const STROP = 7_000_000;       // ~5 MB súbor

/** Zmaže obsah dokumentov starších než 30 dní. Meno a dátum zostávajú. */
async function upratanie(DB: D1Database): Promise<number> {
  const hranica = new Date(Date.now() - DNI * 86400_000).toISOString();
  const stare = await DB.prepare(
    "SELECT id FROM jarvis_dokumenty WHERE zmazane_at IS NULL AND vlozene_at < ?1 LIMIT 50",
  ).bind(hranica).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }));
  const ids = (stare.results || []).map((r) => r.id);
  if (!ids.length) return 0;
  const teraz = new Date().toISOString();
  for (const id of ids) {
    await DB.prepare("DELETE FROM jarvis_dokument_casti WHERE dok_id = ?1").bind(id).run();
    await DB.prepare("UPDATE jarvis_dokumenty SET zmazane_at = ?2 WHERE id = ?1").bind(id, teraz).run();
  }
  return ids.length;
}

/** Poskladá dokument z častí. `null` = neexistuje, `vyprsane` = obsah už zmizol. */
export async function nacitajDokument(DB: D1Database, id: string): Promise<
  { meno: string; typ: string; data: string; vyprsane: false } | { meno: string; vyprsane: true } | null
> {
  const hlavicka = await DB.prepare(
    "SELECT meno, typ, zmazane_at FROM jarvis_dokumenty WHERE id = ?1",
  ).bind(id).first<{ meno: string; typ: string; zmazane_at: string | null }>().catch(() => null);
  if (!hlavicka) return null;
  if (hlavicka.zmazane_at) return { meno: hlavicka.meno, vyprsane: true };

  const casti = await DB.prepare(
    "SELECT data FROM jarvis_dokument_casti WHERE dok_id = ?1 ORDER BY poradie",
  ).bind(id).all<{ data: string }>().catch(() => ({ results: [] as { data: string }[] }));
  const data = (casti.results || []).map((c) => c.data).join("");
  if (!data) return { meno: hlavicka.meno, vyprsane: true };
  return { meno: hlavicka.meno, typ: hlavicka.typ, data, vyprsane: false };
}

export const Route = createFileRoute("/api/jarvis-dokument")({
  server: {
    handlers: {
      // Uloženie prílohy. Vracia len id — obsah sa späť do prehliadača neposiela.
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const b = (await request.json()) as { meno?: string; typ?: string; data?: string; chatId?: string };
          const data = String(b.data || "");
          const meno = String(b.meno || "dokument").slice(0, 200);
          const typ = String(b.typ || "application/octet-stream").slice(0, 80);
          if (!data) return Response.json({ ok: false, error: "prázdny súbor" }, { status: 400 });
          if (data.length > STROP) {
            return Response.json({ ok: false, error: "Súbor je väčší než 5 MB." }, { status: 413 });
          }

          const id = crypto.randomUUID();
          await DB.prepare(
            `INSERT INTO jarvis_dokumenty (id, chat_id, meno, typ, znakov, vlozene_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          ).bind(id, String(b.chatId || ""), meno, typ, data.length, new Date().toISOString()).run();

          for (let i = 0, k = 0; i < data.length; i += CAST, k++) {
            await DB.prepare(
              "INSERT INTO jarvis_dokument_casti (dok_id, poradie, data) VALUES (?1, ?2, ?3)",
            ).bind(id, k, data.slice(i, i + CAST)).run();
          }

          // Upratovanie sa vezie so zápisom — nepotrebuje vlastný plán ani cron.
          const upratanych = await upratanie(DB).catch(() => 0);
          return Response.json({ ok: true, id, meno, upratanych });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      // Stav dokumentu — na obrazovku stačí meno a či obsah ešte žije.
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const id = new URL(request.url).searchParams.get("id") || "";
        if (!id) {
          const r = await DB.prepare(
            `SELECT COUNT(*) spolu,
                    SUM(CASE WHEN zmazane_at IS NULL THEN 1 ELSE 0 END) zivych
               FROM jarvis_dokumenty`,
          ).first<{ spolu: number; zivych: number }>().catch(() => null);
          return Response.json({ ok: true, spolu: r?.spolu ?? 0, zivych: r?.zivych ?? 0, dni: DNI });
        }
        const d = await nacitajDokument(DB, id);
        if (!d) return Response.json({ ok: false, error: "nenájdené" }, { status: 404 });
        return Response.json({ ok: true, meno: d.meno, vyprsane: d.vyprsane });
      },
    },
  },
});
