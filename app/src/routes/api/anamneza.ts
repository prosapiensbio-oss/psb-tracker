import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { FORMULAR } from "../../lib/psb/anamnezaFormular";
import { podlaKlienta, predvyplnZapisu, ulozZapis, zalozAleboNajdi } from "../../lib/psb/anamneza.server";

/**
 * ANAMNÉZA — strana trénera.
 *
 *   GET  ?klient=X          → definícia formulára, uložené odpovede,
 *                             predvyplnené hodnoty a odkaz pre klienta
 *   POST { akcia: "odkaz" } → založí anamnézu a vráti odkaz /a/<token>
 *   POST { akcia: "zapis" } → uloží zápis z úvodného tréningu
 *
 * Odpovede sú v databáze ŠIFROVANÉ (`sifra.server.ts`); rozšifruje ich až
 * tento endpoint, a to len prihlásenému. Bez `ANAMNEZA_KLUC` sa nedá ani
 * čítať, ani zapisovať — a je to lepšie než ticho zapísať čitateľný
 * zdravotný záznam.
 */

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const Route = createFileRoute("/api/anamneza")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        if (!ANAMNEZA_KLUC) return Response.json({ ok: false, error: "Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC)." }, { status: 503 });

        const klient = kus(new URL(request.url).searchParams.get("klient"), 120);
        if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });

        const a = await podlaKlienta(DB, klient, ANAMNEZA_KLUC);
        // Dopyt klienta nesie test postury aj zdroj — obe sa predvypĺňajú.
        const lead = await DB.prepare(
          "SELECT note, date FROM leads WHERE lower(trim(name)) = lower(trim(?1)) ORDER BY date DESC LIMIT 1",
        ).bind(klient).first<{ note: string | null; date: string | null }>();
        const ov = await DB.prepare(
          "SELECT zdroj, zdroj_kto FROM client_overrides WHERE name = ?1",
        ).bind(klient).first<{ zdroj: string | null; zdroj_kto: string | null }>();

        const predvyplnene = predvyplnZapisu({
          klientOdpovede: a?.klientOdpovede || {},
          klientVyplnilAt: a?.klientVyplnilAt || null,
          lead, zdroj: ov?.zdroj, zdrojKto: ov?.zdroj_kto,
        });

        return Response.json({
          ok: true,
          formular: FORMULAR,
          anamneza: a && {
            stav: a.stav, token: a.token,
            klientOdpovede: a.klientOdpovede, zapisOdpovede: a.zapisOdpovede,
            suhlasy: a.suhlasy, klientVyplnilAt: a.klientVyplnilAt, zapisAt: a.zapisAt,
          },
          predvyplnene,
          odkaz: a ? `${new URL(request.url).origin}/a/${a.token}` : null,
        }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        if (!ANAMNEZA_KLUC) return Response.json({ ok: false, error: "Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC)." }, { status: 503 });

        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        const kto = (await currentUser(request)) || "";
        const klient = kus(b.klient, 120);
        if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });

        if (b.akcia === "odkaz") {
          const a = await zalozAleboNajdi(DB, klient, ANAMNEZA_KLUC, kto);
          return Response.json({ ok: true, odkaz: `${new URL(request.url).origin}/a/${a.token}`, stav: a.stav });
        }

        if (b.akcia === "zapis") {
          const odpovede = (b.odpovede || {}) as Record<string, unknown>;
          // Zápis vzniká aj vtedy, keď klient nevyplnil nič — Jerry ho píše
          // pri tréningu a anamnéza dovtedy existovať nemusí.
          await zalozAleboNajdi(DB, klient, ANAMNEZA_KLUC, kto);
          const ok = await ulozZapis(DB, klient, odpovede, ANAMNEZA_KLUC);
          if (!ok) return Response.json({ ok: false, error: "Zápis sa neuložil." }, { status: 500 });
          await audit(DB, { action: "anamneza-zapis", predmet: klient, actor: kto });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "Neznáma akcia." }, { status: 400 });
      },
    },
  },
});
