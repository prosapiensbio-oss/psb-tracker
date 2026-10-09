import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { jeMesiac } from "../../lib/psb/format";
import { STAVY_PLNENIA } from "../../lib/psb/mesacnyReport";

/**
 * NÁVRHY Z REPORTU A ICH PLNENIE (9. 10. 2026).
 *
 *   GET ?od=RRRR-MM&do=RRRR-MM          → uložené návrhy a odpovede
 *   POST { akcia: "navrhy", mesiac, navrhy: [{ otazka, text }] }
 *        → snímka pri zamknutí mesiaca; existujúce sa NEPREPISUJÚ
 *   POST { akcia: "stav", mesiac, otazka, stav, navrh? }
 *        → áno / čiastočne / nie (prázdne = späť na neodpovedané)
 */
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
type Riadok = { mesiac: string; otazka: string; navrh: string; stav: string | null; stav_at: string | null; kto: string | null };

export const Route = createFileRoute("/api/report-akcie")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const u = new URL(request.url);
        const od = String(u.searchParams.get("od") || ""), dd = String(u.searchParams.get("do") || "");
        if (!jeMesiac(od) || !jeMesiac(dd)) return chyba("Chýba obdobie.");
        const r = await DB.prepare("SELECT mesiac, otazka, navrh, stav, stav_at, kto FROM report_akcie WHERE mesiac >= ?1 AND mesiac <= ?2")
          .bind(od, dd).all<Riadok>().catch(() => null);
        if (!r) return chyba("Chýba tabuľka (migrácia 0107).", 500);
        return Response.json({ ok: true, riadky: r.results || [] }, { headers: { "cache-control": "no-store" } });
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const b = (await request.json().catch(() => ({}))) as { akcia?: string; mesiac?: string; otazka?: string; stav?: string; navrh?: string; navrhy?: { otazka?: string; text?: string }[] };
        const mesiac = String(b.mesiac || "");
        if (!jeMesiac(mesiac)) return chyba("Neplatný mesiac.");
        const teraz = new Date().toISOString();
        if (b.akcia === "navrhy") {
          const navrhy = (b.navrhy || []).map((n) => ({ otazka: String(n.otazka || "").slice(0, 40), text: String(n.text || "").slice(0, 600) })).filter((n) => n.otazka && n.text);
          if (!navrhy.length) return Response.json({ ok: true, ulozene: 0 });
          await DB.batch(navrhy.map((n) => DB.prepare("INSERT OR IGNORE INTO report_akcie (mesiac, otazka, navrh, created_at) VALUES (?1, ?2, ?3, ?4)").bind(mesiac, n.otazka, n.text, teraz)));
          return Response.json({ ok: true, ulozene: navrhy.length });
        }
        if (b.akcia === "stav") {
          const otazka = String(b.otazka || "").slice(0, 40);
          const stav = String(b.stav || "");
          if (!otazka) return chyba("Chýba otázka.");
          if (stav && !(STAVY_PLNENIA as readonly string[]).includes(stav)) return chyba("Neplatný stav.");
          const kto = (await currentUser(request)) || "";
          // Návrh, ktorý pri zamknutí uložený nebol, sa uloží teraz — s textom,
          // ktorý Jerry práve hodnotí.
          const navrh = String(b.navrh || "").slice(0, 600);
          if (navrh) await DB.prepare("INSERT OR IGNORE INTO report_akcie (mesiac, otazka, navrh, created_at) VALUES (?1, ?2, ?3, ?4)").bind(mesiac, otazka, navrh, teraz).run();
          const r = await DB.prepare("UPDATE report_akcie SET stav = ?3, stav_at = ?4, kto = ?5 WHERE mesiac = ?1 AND otazka = ?2")
            .bind(mesiac, otazka, stav || null, stav ? teraz : null, stav ? kto : null).run();
          if (!r.meta?.changes) return chyba("Návrh neexistuje.", 404);
          await audit(DB, { action: "report-plnenie", predmet: `${mesiac} · ${otazka}`, month: mesiac, neu: stav || "neodpovedané", actor: kto });
          return Response.json({ ok: true });
        }
        return chyba("Neznáma akcia.");
      },
    },
  },
});
