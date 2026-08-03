import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Jarvisova pamäť — chaty aj závery. Jeden endpoint, lebo obe veci sa vždy
// načítavajú spolu pri otvorení appky a druhá požiadavka by bola zbytočná.
//
// GET  ?co=vsetko   → { chats, zavery }
// POST { akcia: "chat", ... }        uloží/prepíše rozhovor
// POST { akcia: "zaver", ... }       zapíše záver z debaty
// POST { akcia: "vyhodnot", id, stav, vysledok }
// POST { akcia: "zmaz-chat", id }

export type Zaver = {
  id: string; datum: string; tema: string; zaver: string;
  preco?: string; overit?: string; overitDo?: string;
  vysledok?: string; stav: string; chatId?: string;
};

type Row = Record<string, unknown>;

const s = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

export const Route = createFileRoute("/api/jarvis-memory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, chats: [], zavery: [] });
        try {
          // 60 chatov stačí — staršie sú archív, nie pracovný materiál.
          const ch = await DB.prepare(
            "SELECT id, title, messages, archived, updated_at FROM jarvis_chats ORDER BY updated_at DESC LIMIT 60",
          ).all();
          const zv = await DB.prepare(
            "SELECT * FROM jarvis_zavery WHERE stav != 'zrusene' ORDER BY datum DESC LIMIT 200",
          ).all();
          return Response.json({
            ok: true,
            chats: (ch.results as Row[]).map((r) => ({
              id: r.id, title: r.title, archived: !!r.archived, updatedAt: Date.parse(String(r.updated_at)) || Date.now(),
              messages: JSON.parse(String(r.messages || "[]")),
            })),
            zavery: (zv.results as Row[]).map((r) => ({
              id: r.id, datum: r.datum, tema: r.tema, zaver: r.zaver, preco: r.preco,
              overit: r.overit, overitDo: r.overit_do, vysledok: r.vysledok, stav: r.stav, chatId: r.chat_id,
            })),
          });
        } catch {
          return Response.json({ ok: false, chats: [], zavery: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const now = new Date().toISOString();
        const akcia = s(b.akcia, 20);

        if (akcia === "chat") {
          const id = s(b.id, 64);
          if (!id) return Response.json({ ok: false, error: "no_id" }, { status: 400 });
          // Obrázky sa do pamäte neukladajú — base64 by tabuľku roztrhlo a na
          // nadviazanie rozhovoru nie sú potrebné.
          const msgs = Array.isArray(b.messages) ? (b.messages as Row[]).map((m) => ({ role: m.role, text: m.text })) : [];
          await DB.prepare(
            `INSERT INTO jarvis_chats (id, title, messages, archived, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET title = ?2, messages = ?3, archived = ?4, updated_at = ?5`,
          ).bind(id, s(b.title, 120) || "Nový chat", JSON.stringify(msgs).slice(0, 400_000), b.archived ? 1 : 0, now).run();
          return Response.json({ ok: true });
        }

        if (akcia === "zmaz-chat") {
          await DB.prepare("DELETE FROM jarvis_chats WHERE id = ?1").bind(s(b.id, 64)).run();
          return Response.json({ ok: true });
        }

        if (akcia === "zaver") {
          const id = s(b.id, 64) || `z${Date.now().toString(36)}`;
          await DB.prepare(
            `INSERT INTO jarvis_zavery (id, datum, tema, zaver, preco, overit, overit_do, stav, chat_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'otvoreny', ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET tema = ?3, zaver = ?4, preco = ?5, overit = ?6, overit_do = ?7`,
          ).bind(id, s(b.datum, 10) || now.slice(0, 10), s(b.tema, 40) || "ine", s(b.zaver, 600),
            s(b.preco, 800), s(b.overit, 600), s(b.overitDo, 10) || null, s(b.chatId, 64) || null, now).run();
          await audit(DB, { action: "zapis-zaveru", predmet: s(b.tema, 40), neu: s(b.zaver, 300), actor: await currentUser(request) || undefined });
          return Response.json({ ok: true, id });
        }

        if (akcia === "vyhodnot") {
          await DB.prepare("UPDATE jarvis_zavery SET stav = ?2, vysledok = ?3 WHERE id = ?1")
            .bind(s(b.id, 64), s(b.stav, 20) || "otvoreny", s(b.vysledok, 800)).run();
          await audit(DB, { action: "vyhodnotenie-zaveru", predmet: s(b.id, 64), neu: s(b.stav, 20), reason: s(b.vysledok, 300), actor: await currentUser(request) || undefined });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
      },
    },
  },
});
