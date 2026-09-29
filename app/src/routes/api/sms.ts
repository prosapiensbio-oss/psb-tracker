import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { chybaOdosielatela, cisloPreBranu, dlzkaSpravy } from "../../lib/psb/sms";
import { posliSms, type BranaUcet } from "../../lib/psb/smsBrana.server";

/**
 * SMS KLIENTOVI.
 *
 *   GET                        → či je brána nastavená (kľúč sa nevracia)
 *   POST { akcia: "nastav" }   → uloží bránu, kľúč a odosielateľa
 *   POST { klient, telefon, text } → pošle jednu správu
 *
 * ODOSIELA SA NA KLIK, NIKDY SAMO. Naše číslo hodín je pri časti klientov
 * dopočítané (viď `packageOdvodeny`) a správa „dnes si mal poslednú hodinu"
 * človeku, ktorý má ešte tri, je trapas, ktorý ide von k zákazníkovi a späť
 * sa vziať nedá. Preto tu nie je žiadny cron ani dávka — len jedna správa,
 * ktorú niekto pred odoslaním videl.
 */

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function nastavenia(DB: import("@cloudflare/workers-types").D1Database): Promise<BranaUcet> {
  const rs = await DB.prepare(
    "SELECT key, value FROM vzas_settings WHERE key IN ('sms_brana','sms_kluc','sms_odosielatel')",
  ).all();
  const m: Record<string, string> = {};
  for (const r of (rs.results as { key: string; value: string }[]) || []) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  return { druh: m.sms_brana || "smsmanager", kluc: m.sms_kluc || "", odosielatel: m.sms_odosielatel || "" };
}

export const Route = createFileRoute("/api/sms")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const n = await nastavenia(DB);
        const poslane = await DB.prepare(
          "SELECT COUNT(*) n, MAX(at) posledna FROM vzas_audit WHERE action = 'sms-odoslana'",
        ).first<{ n: number; posledna: string | null }>().catch(() => null);
        // Kľúč sa von neposiela nikdy — len to, či je vyplnený.
        return Response.json({
          ok: true,
          brana: n.druh,
          odosielatel: n.odosielatel,
          kluc: n.kluc ? "uložený" : "",
          poslanych: poslane?.n ?? 0,
          posledna: poslane?.posledna ?? null,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        const kto = (await currentUser(request)) || "";

        if (b.akcia === "nastav") {
          const brana = kus(b.brana, 40) || "smsmanager";
          // Meno, ktoré brána odmietne, sa nesmie uložiť — SMS by potom ticho
          // odchádzala z čísla a nikto by nevedel prečo.
          const zle = chybaOdosielatela(kus(b.odosielatel, 40), brana);
          if (zle) return Response.json({ ok: false, error: zle }, { status: 400 });
          const ulozit: [string, string][] = [
            ["sms_brana", brana],
            ["sms_odosielatel", kus(b.odosielatel, 40)],
          ];
          // Prázdny kľúč NEPREPISUJE uložený — obrazovka ho nikdy nedostane
          // späť, takže by ho pri každom uložení nastavení zmazala.
          if (kus(b.kluc, 200)) ulozit.push(["sms_kluc", kus(b.kluc, 200)]);
          await DB.batch(ulozit.map(([k, v]) => DB.prepare(
            "INSERT INTO vzas_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          ).bind(k, JSON.stringify(v))));
          await audit(DB, { action: "sms-brana-nastavena", predmet: kus(b.brana, 40), actor: kto });
          return Response.json({ ok: true });
        }

        const klient = kus(b.klient, 120);
        const text = String(b.text ?? "").slice(0, 600).trim();
        const cislo = cisloPreBranu(kus(b.telefon, 40));
        if (!cislo) return Response.json({ ok: false, error: "Toto nie je telefónne číslo, na ktoré sa dá poslať SMS." }, { status: 400 });
        if (!text) return Response.json({ ok: false, error: "Prázdna správa." }, { status: 400 });

        const n = await nastavenia(DB);
        const v = await posliSms(n, cislo, text);
        const kolko = dlzkaSpravy(text);
        if (!v.ok) {
          await audit(DB, { action: "sms-zlyhala", predmet: `${klient} · ${cislo}`, old: v.chyba, actor: kto });
          return Response.json({ ok: false, error: `SMS neodišla — ${v.chyba}` }, { status: 502 });
        }
        await audit(DB, {
          action: "sms-odoslana",
          predmet: `${klient} · ${cislo}`,
          neu: `${kolko.sprav} ${kolko.sprav === 1 ? "správa" : "správy"}${v.id ? ` · ${v.id}` : ""}`,
          actor: kto,
        });
        return Response.json({ ok: true, cislo, sprav: kolko.sprav });
      },
    },
  },
});
