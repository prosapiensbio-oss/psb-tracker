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
// Zoznam tabuliek sa NEPÍŠE RUČNE — číta sa z databázy.
//
// Predtým to bolo pole mien, ktoré sa muselo dopĺňať pri každej novej tabuľke.
// V komentári nad ním stálo doslova, že záloha, ktorá potichu nezachytáva časť
// databázy, je nebezpečnejšia než žiadna — a presne to sa stalo: tabuľka
// `faktura_polozky` pribudla neskôr a do zoznamu sa nikdy nedostala. Záloha
// teda mesiace vynechávala všetky faktúry a tvárila sa ako kompletná.
//
// Opravovať to doplnením ďalšieho mena by chybu len odložilo o jednu tabuľku.
// Databáza vie, čo v nej je; nech to teda povie ona.
const SYSTEMOVE = /^(sqlite_|_cf_|d1_)/;


export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        const zoznam = await DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        ).all<{ name: string }>();
        const tabulky = (zoznam.results || [])
          .map((r) => r.name)
          .filter((n) => !SYSTEMOVE.test(n));

        const data: Record<string, unknown[]> = {};
        for (const t of tabulky) {
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
          neu: `${tabulky.length} tabuliek, ${Object.values(data).reduce((a, r) => a + r.length, 0)} riadkov`,
          actor: await currentUser(request) || undefined,
        });

        // `tabulky` je v súbore zámerne: pri obnove je hneď vidieť, čo záloha
        // obsahovala, bez lúštenia kľúčov v `data`.
        return new Response(JSON.stringify({ verzia: 2, vytvorene: new Date().toISOString(), tabulky, data }, null, 1), {
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
