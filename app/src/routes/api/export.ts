import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Kompletná záloha databázy ako jeden JSON na stiahnutie.
//
// Existuje z jediného dôvodu: pred prvým importom z banky musí byť čo vrátiť.
// Zámky a audit hovoria, ČO sa stalo; záloha je jediná vec, ktorá dovolí vrátiť
// stav späť, keď sa import pokazí spôsobom, na ktorý sme nemysleli. Sťahuje sa
// ručne a schválne to nie je automatické — súbor má byť u Jerryho, nie v tej
// istej databáze, ktorú zálohuje.
const TABULKY = [
  "sessions", "services", "payments", "packages", "leads",
  "client_overrides", "anomaly_ack", "upload_log",
  "vzas_settings", "vzas_month_notes", "vzas_week_notes", "vzas_periods", "vzas_audit",
  "vzas_payments", "vzas_payment_splits", "vzas_rules", "vzas_salary_params",
  "jarvis_chats", "jarvis_zavery",
  // Pribudli po prvom nasadení zálohy — bez nich by obnova stratila bankové
  // pohyby a surové marketingové exporty, teda presne to, čo sa nedá stiahnuť
  // znova.
  "fio_transactions", "raw_uploads",
  // A znova to isté o pol roka neskôr: kontá, nákupný zoznam, marketingové
  // tabuľky a algo novinky vznikli po poslednom rozšírení zálohy. Zoznam
  // treba dopĺňať pri KAŽDEJ novej tabuľke — záloha, ktorá potichu nezachytáva
  // časť databázy, je nebezpečnejšia než žiadna, lebo sa na ňu človek spolieha.
  "users", "wishlist", "mkt_prispevky", "kanaly_mesiace",
  "ga4_mesiace", "gsc_mesiace", "gsc_dopyty", "gsc_strany", "algo_novinky",
];

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        const data: Record<string, unknown[]> = {};
        for (const t of TABULKY) {
          try {
            const rs = await DB.prepare(`SELECT * FROM ${t}`).all();
            data[t] = rs.results as unknown[];
          } catch {
            data[t] = [];   // tabuľka ešte neexistuje (staršia migrácia)
          }
        }

        const den = new Date().toISOString().slice(0, 10);
        await audit(DB, {
          action: "zaloha",
          predmet: `psb-zaloha-${den}.json`,
          neu: `${Object.values(data).reduce((a, r) => a + r.length, 0)} riadkov`,
          actor: await currentUser(request) || undefined,
        });

        return new Response(JSON.stringify({ verzia: 1, vytvorene: new Date().toISOString(), data }, null, 1), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="psb-zaloha-${den}.json"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
