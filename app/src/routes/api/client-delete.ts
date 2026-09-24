import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Zmazanie jedného klienta zo všetkých tabuliek.
//
// Vzniklo z konkrétnej diery: appka vedela dáta iba pridávať. Keď sa do nej
// omylom dostal riadok — preklep v mene pri importe, testovací záznam, klient
// zapísaný dvakrát pod dvoma zápismi mena — nedalo sa s tým spraviť nič.
// Jediná existujúca možnosť bolo vymazať VŠETKO a nahrať znova, čo je pri
// jednom zlom riadku absurdné.
//
// Zámerne sa maže podľa presného mena a zámerne to nie je v UI ako tlačidlo pri
// každom klientovi: je to oprava dát, nie bežná operácia. Zostáva po tom
// záznam v audite vrátane počtu zmazaných riadkov.
export const Route = createFileRoute("/api/client-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { name?: string; reason?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const name = String(b.name || "").trim();
        if (!name) return Response.json({ ok: false, error: "no_name" }, { status: 400 });

        const zmazane: Record<string, number> = {};
        // Zoznam musí rásť s appkou. Pribudli tabuľky, ktoré v pôvodnom
        // zozname neboli — vlastná evidencia balíčkov a kniha platieb (obe
        // 22. 9. 2026), poplatky, denník, merania a mapovanie z kalendára —
        // a bez nich by po „zmazanom" klientovi zostali riadky, ktoré ho
        // z appky vrátia späť.
        for (const [tabulka, stlpec] of [
          ["sessions", "client_name"],
          ["payments", "client_name"],
          ["packages", "client_name"],
          ["services", "client_name"],
          ["poplatky", "client_name"],
          ["client_notes", "client_name"],
          ["klient_merania", "klient"],
          ["balicky", "klient"],
          ["platby", "klient"],
          ["kal_mapovanie", "klient"],
          ["client_overrides", "name"],
        ] as const) {
          try {
            const r = await DB.prepare(`DELETE FROM ${tabulka} WHERE ${stlpec} = ?1`).bind(name).run();
            zmazane[tabulka] = r.meta?.changes ?? 0;
          } catch {
            zmazane[tabulka] = 0;
          }
        }

        await audit(DB, {
          action: "zmazanie-klienta",
          predmet: name,
          neu: Object.entries(zmazane).map(([t, n]) => `${t}: ${n}`).join(", "),
          reason: b.reason ? String(b.reason).slice(0, 300) : undefined,
          actor: await currentUser(request) || undefined,
        });
        return Response.json({ ok: true, zmazane });
      },
    },
  },
});
