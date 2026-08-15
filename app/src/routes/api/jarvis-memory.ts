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
          //
          // KÓD A DATABÁZA SA MÔŽU NA CHVÍĽU ROZÍSŤ
          //
          // Stĺpec `kategoria` pribudol migráciou 0039 a migrácie sa NEPÚŠŤAJÚ
          // samy. Keby dopyt na chýbajúci stĺpec spadol, `catch` nižšie vráti
          // prázdny zoznam chatov AJ záverov — a Jarvisova pamäť by vyzerala
          // vymazaná. To je horšie než chýbajúci príznak, tak sa pri chybe
          // skúsi raz bez neho.
          const chaty = async () => {
            const zoStlpcom = "SELECT id, title, messages, archived, kategoria, updated_at FROM jarvis_chats ORDER BY updated_at DESC LIMIT 60";
            const bezNeho = "SELECT id, title, messages, archived, '' AS kategoria, updated_at FROM jarvis_chats ORDER BY updated_at DESC LIMIT 60";
            try { return await DB.prepare(zoStlpcom).all(); }
            catch { return await DB.prepare(bezNeho).all(); }
          };
          const ch = await chaty();
          const zv = await DB.prepare(
            "SELECT * FROM jarvis_zavery WHERE stav != 'zrusene' ORDER BY datum DESC LIMIT 200",
          ).all();
          return Response.json({
            ok: true,
            // Každý chat sa parsuje SÁM. Kým bol JSON.parse v spoločnom try,
            // jeden poškodený riadok znamenal prázdny zoznam chatov AJ záverov
            // — pamäť Jarvisa vyzerala, že sa vymazala. Pokazený chat teraz
            // stratí seba, nie zvyšok.
            chats: (ch.results as Row[]).map((r) => {
              let messages: unknown = [];
              try { messages = JSON.parse(String(r.messages || "[]")); } catch { messages = []; }
              return { id: r.id, title: r.title, archived: !!r.archived, kategoria: String(r.kategoria || ""), updatedAt: Date.parse(String(r.updated_at)) || Date.now(), messages };
            }),
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
          // Keď je chat pridlhý, zahoď NAJSTARŠIE správy — nerež JSON uprostred
          // (nález z testu Jarvisa 11. 8.). `.slice(0, 400_000)` uložil nevalidný
          // JSON a čítanie chatov robí JSON.parse v jednom spoločnom try: jeden
          // taký riadok zhodil celú odpoveď a z appky zmizli VŠETKY chaty aj
          // všetky závery naraz. Radšej kratšia história než žiadna.
          let ulozene = msgs;
          while (ulozene.length > 1 && JSON.stringify(ulozene).length > 400_000) ulozene = ulozene.slice(1);
          // Zápis bez zamerania je stále zápis.
          //
          // Migrácia 0039 pridala `kategoria` a migrácie sa nepúšťajú samy.
          // Keby zápis na chýbajúci stĺpec spadol, rozhovor by sa NEULOŽIL
          // vôbec — a to je tá istá trieda chyby ako 13. 8., keď sa dôvody
          // strát ukládali do neexistujúceho poľa a Jerry stratil večer práce.
          // Radšej rozhovor bez príznaku než žiadny rozhovor.
          const nazov = s(b.title, 120) || "Nový chat";
          const telo = JSON.stringify(ulozene).slice(0, 400_000);
          const arch = b.archived ? 1 : 0;
          try {
            await DB.prepare(
              `INSERT INTO jarvis_chats (id, title, messages, archived, kategoria, updated_at) VALUES (?1, ?2, ?3, ?4, ?6, ?5)
               ON CONFLICT(id) DO UPDATE SET title = ?2, messages = ?3, archived = ?4, kategoria = ?6, updated_at = ?5`,
            ).bind(id, nazov, telo, arch, now, s(b.kategoria, 20)).run();
          } catch {
            await DB.prepare(
              `INSERT INTO jarvis_chats (id, title, messages, archived, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT(id) DO UPDATE SET title = ?2, messages = ?3, archived = ?4, updated_at = ?5`,
            ).bind(id, nazov, telo, arch, now).run();
          }
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
