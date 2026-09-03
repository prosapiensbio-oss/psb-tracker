import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { loadData } from "../../lib/psb/db.server";
import { capacityByTrainer, deriveClients, deriveRegister, deriveSixM, patriTrenerovi, type RegisterItem } from "../../lib/psb/compute";
import { posli, type Odber } from "../../lib/psb/push.server";

// Beh plánovača: pozri, čo je otvorené, a čo je nové, pošli na telefón.
//
// PREČO SAMOSTATNÁ POŽIADAVKA
//
// 29. 8. 2026 som pridal prácu do endpointu, ktorý už prácu robil, a
// Cloudflare zabil workera na limit CPU — appka vracala 503 na KAŽDÚ
// požiadavku, nielen na ten endpoint. Preto má toto vlastnú adresu a plánovač
// ju volá zvlášť: keď to raz prekročí limit, spadne len notifikácia.
//
// Kalendár sa tu NEPARSUJE — udalosti sú už v D1 zo snímky. To bola tá drahá
// časť; čítanie z databázy a odvodenie registra je rádovo lacnejšie.

const OKNO_DNI = 21;

/** Meno prihláseného („jerry") na meno trénera („Jerry"). */
const naTrenera = (kto: string) => {
  const k = kto.trim().toLowerCase();
  return k === "jerry" ? "Jerry" : k === "terezka" ? "Terezka" : "";
};

export const Route = createFileRoute("/api/push-beh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        const token = env.KAL_CRON_TOKEN;
        const dany = request.headers.get("x-cron-token") || "";
        if (!token || token.length !== dany.length || token !== dany) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const DB = env.DB;
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const zaciatok = Date.now();

        const [data, kluceRs, odberyRs, udalostiRs, zmenyRs] = await Promise.all([
          loadData(DB),
          DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all(),
          DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all(),
          DB.prepare("SELECT zaciatok, koniec, nazov, klient, typ, trener, zmizla_at FROM kal_udalosti WHERE zmizla_at IS NULL AND zaciatok >= date('now', ?1)").bind(`-${OKNO_DNI} days`).all(),
          DB.prepare("SELECT id, kedy, druh, klient, pred, po, trener, poznamka FROM kal_zmeny ORDER BY kedy DESC LIMIT 300").all(),
        ]);

        const odbery = odberyRs.results as unknown as (Odber & { kto: string })[];
        if (!odbery.length) return Response.json({ ok: true, poslane: 0, dovod: "nikto nie je prihlásený" });

        const m: Record<string, string> = {};
        for (const r of kluceRs.results as { key: string; value: string }[]) m[r.key] = r.value;
        if (!m.vapid_public || !m.vapid_private) return Response.json({ ok: false, error: "chybaju_kluce" }, { status: 500 });
        const kluce = { verejny: m.vapid_public, sukromny: m.vapid_private, kontakt: "mailto:prosapiensbio@gmail.com" };

        const udalosti = (udalostiRs.results as Record<string, unknown>[]).map((u) => ({
          zaciatok: String(u.zaciatok), koniec: String(u.koniec || ""), nazov: String(u.nazov || ""),
          klient: (u.klient as string) || null, typ: (u.typ as string) || null, trener: String(u.trener || ""), zmizlaAt: null,
        }));
        const zmeny = (zmenyRs.results as Record<string, unknown>[]).map((z) => ({
          id: z.id as string, kedy: String(z.kedy), druh: String(z.druh), klient: (z.klient as string) || null,
          pred: (z.pred as string) || null, po: (z.po as string) || null,
          trener: String(z.trener || ""), poznamka: (z.poznamka as string) || null,
        }));

        const clients = deriveClients(data);
        const sixM = deriveSixM(data, clients);
        const kapacita = capacityByTrainer(clients, data.sessions);
        const register = deriveRegister(data, clients, sixM, kapacita, { udalosti, zmeny });

        // Na telefón ide LEN to, čo si pýta akciu a ešte nikto ju neurobil.
        // Modré („nový klient po úvodnom") sú konštatovania a na zamknutej
        // obrazovke by boli šum.
        const otvorene = register.filter((r) => !r.acked && (r.tone === "red" || r.tone === "orange"));

        const uzPoslaneRs = await DB.prepare("SELECT kluc FROM push_poslane").all();
        const uzPoslane = new Set((uzPoslaneRs.results as { kluc: string }[]).map((r) => r.kluc));
        const nove = otvorene.filter((r) => !uzPoslane.has(r.key));
        if (!nove.length) {
          return Response.json({ ok: true, poslane: 0, otvorenych: otvorene.length, dovod: "nič nové", ms: Date.now() - zaciatok });
        }

        // Jedna notifikácia za beh, nie osem. Keď je nových viac, prvá nesie
        // text a zvyšok je počet — kto chce podrobnosti, otvorí Kokpit.
        const preClena = (kto: string): RegisterItem[] => {
          const t = naTrenera(kto);
          return t ? nove.filter((r) => patriTrenerovi(r, clients, t)) : nove;
        };

        let poslanych = 0;
        const chyby: string[] = [];
        for (const o of odbery) {
          const moje = preClena(o.kto);
          if (!moje.length) continue;
          const prva = moje[0];
          const v = await posli(o, {
            titulok: moje.length > 1 ? `Kokpit — ${moje.length} nové veci` : "Kokpit",
            text: prva.detail.slice(0, 180),
            url: "/#dashboard",
            znacka: "register",
          }, kluce);
          if (v.mrtvy) await DB.prepare("DELETE FROM push_odbery WHERE endpoint = ?1").bind(o.endpoint).run();
          else await DB.prepare("UPDATE push_odbery SET posledne_ok = ?2, chyba = ?3 WHERE endpoint = ?1")
            .bind(o.endpoint, v.ok ? new Date().toISOString() : null, v.ok ? null : (v.chyba || "chyba")).run();
          if (v.ok) poslanych++; else chyby.push(`${v.status}: ${v.chyba || ""}`.slice(0, 120));
        }

        // Zapíše sa VŽDY, aj keď odoslanie zlyhalo. Inak by sa pri trvalej
        // chybe (mŕtvy push server) skúšalo to isté každé tri hodiny donekonečna.
        const teraz = new Date().toISOString();
        await DB.batch(nove.map((r) => DB.prepare("INSERT OR REPLACE INTO push_poslane (kluc, kedy) VALUES (?1, ?2)").bind(r.key, teraz)));
        // Staré kľúče sa upratujú, aby tabuľka nerástla donekonečna. 60 dní je
        // ďaleko za životnosťou ktorejkoľvek položky registra.
        await DB.prepare("DELETE FROM push_poslane WHERE kedy < datetime('now','-60 days')").run();

        return Response.json({ ok: true, poslane: poslanych, nove: nove.length, otvorenych: otvorene.length, chyby, ms: Date.now() - zaciatok });
      },
    },
  },
});
