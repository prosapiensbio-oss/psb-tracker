import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { odoberaKalendar } from "../../lib/psb/kalendarMobil";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";

/**
 * KALENDÁR V MOBILE — Kokpit (profil klienta, dlaždica A1), 7. 10. 2026.
 *
 *   GET ?klient=X              → platný odkaz klienta a či kalendár odoberá
 *   POST { akcia: "odkaz", klient }  → odkaz (existujúci, inak nový)
 *   POST { akcia: "novy", klient }   → starý zneplatní, vyrobí nový
 *
 * Klient otvára `/k/<token>` (stránka B1); telefón si sťahuje
 * `/k/<token>/kalendar.ics` — len jeho tréningy, nie kalendár trénera.
 */
type Riadok = { token: string; klient: string; created_at: string; posledne_stiahnutie: string | null; pocet: number; platforma: string | null };
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const novyToken = () => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(12))].map((x) => abc[x % abc.length]).join("");
};

export const Route = createFileRoute("/api/kalendar-mobil")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const klient = String(new URL(request.url).searchParams.get("klient") || "").trim();
        if (!klient) return chyba("chýba klient");
        const r = await DB.prepare("SELECT * FROM klient_kalendar WHERE klient = ?1 AND zrusene_at IS NULL ORDER BY created_at DESC LIMIT 1")
          .bind(klient).first<Riadok>().catch(() => undefined);
        if (r === undefined) return chyba("Chýba tabuľka (migrácia 0101).", 500);
        const origin = new URL(request.url).origin;
        return Response.json({
          ok: true,
          odkaz: r ? {
            token: r.token, url: verejnyOdkaz(`/k/${r.token}`, origin), createdAt: r.created_at,
            posledne: r.posledne_stiahnutie, pocet: r.pocet, platforma: r.platforma, odobera: odoberaKalendar(r.posledne_stiahnutie),
          } : null,
        }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const kto = (await currentUser(request)) || "";
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const klient = String(b.klient || "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (!klient) return chyba("chýba klient");
        const origin = new URL(request.url).origin;
        if (b.akcia !== "odkaz" && b.akcia !== "novy") return chyba("neznáma akcia");

        if (b.akcia === "odkaz") {
          const r = await DB.prepare("SELECT token FROM klient_kalendar WHERE klient = ?1 AND zrusene_at IS NULL ORDER BY created_at DESC LIMIT 1")
            .bind(klient).first<{ token: string }>();
          if (r) return Response.json({ ok: true, token: r.token, url: verejnyOdkaz(`/k/${r.token}`, origin) });
        } else {
          // Nový odkaz = starý prestane platiť (napr. odkaz sa dostal k niekomu inému).
          await DB.prepare("UPDATE klient_kalendar SET zrusene_at = ?2 WHERE klient = ?1 AND zrusene_at IS NULL")
            .bind(klient, new Date().toISOString()).run();
        }
        const token = novyToken();
        await DB.prepare("INSERT INTO klient_kalendar (token, klient, created_at, kto, pocet) VALUES (?1,?2,?3,?4,0)")
          .bind(token, klient, new Date().toISOString(), kto).run();
        await audit(DB, { action: b.akcia === "novy" ? "kalendar-mobil-novy" : "kalendar-mobil-odkaz", predmet: klient, actor: kto || undefined });
        return Response.json({ ok: true, token, url: verejnyOdkaz(`/k/${token}`, origin) });
      },
    },
  },
});
