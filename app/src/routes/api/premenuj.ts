import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Premenovanie klienta naprieč celou databázou.
 *
 * PREČO TO NIE JE JEDEN UPDATE
 *
 * Meno klienta nie je v jednej tabuľke — je v siedmich. A v troch z nich je
 * navyše zapečené v `dedup_key`, kľúči, ktorým import rozoznáva, či riadok už
 * má. Premenovať len `client_name` znamená, že najbližší export príde s novým
 * kľúčom, nič ho nespáruje a klient bude v appke dvakrát.
 *
 * Presne to hrozilo 14. 8. pri Alexejovi Bajkalovovi: sedem tréningov a dve
 * platby by sa zdvojili na štrnásť a 17 780 Kč.
 *
 * PREČO SA NEZLUČUJE
 *
 * Keď cieľové meno už existuje, ide o ZLÚČENIE dvoch ľudí do jedného — a to je
 * iná operácia s inými rizikami (dva balíčky, dve histórie, možný omyl
 * v identite). Táto cesta ho odmietne a povie prečo.
 *
 * PREČO NEMENÍ PTMINDER
 *
 * Nemá ako. Zdroj pravdy je export a ten sa opravuje tam. Toto zosúladí, čo
 * už v appke je, aby sa nová a stará podoba mena stretli namiesto minutia.
 */

const TABULKY: { tab: string; stlpec: string; kluc: boolean }[] = [
  { tab: "sessions", stlpec: "client_name", kluc: true },
  { tab: "payments", stlpec: "client_name", kluc: true },
  { tab: "services", stlpec: "client_name", kluc: true },
  { tab: "packages", stlpec: "client_name", kluc: false },
  { tab: "client_overrides", stlpec: "name", kluc: false },
  { tab: "client_notes", stlpec: "client_name", kluc: false },
  { tab: "leads", stlpec: "name", kluc: false },
  // Kalendár tu chýbal a bola to tichá diera. Premenovanie klienta prešlo
  // siedmimi tabuľkami, ale meno v Google Kalendári zostalo staré — a práve
  // z neho appka počíta pripomienku na SMS po úvodnom, upozornenie „úvodný
  // bez dopytu", zrušené tréningy aj právo veta pri odmlčaných („má
  // dohodnutý termín"). Klient premenovaný v Kokpite tak zostal v kalendári
  // niekým iným. Odhalilo sa to 17. 8. 2026 na Zuzane Sopoligovej: appka ju
  // po zlúčení stále hlásila ako úvodný bez dopytu, lebo kalendár o novom
  // mene nevedel.
  { tab: "kal_udalosti", stlpec: "klient", kluc: false },
  { tab: "kal_mapovanie", stlpec: "klient", kluc: false },
];

async function pocet(DB: D1Database, tab: string, stlpec: string, meno: string): Promise<number> {
  const r = await DB.prepare(`SELECT COUNT(*) n FROM ${tab} WHERE ${stlpec} = ?1`)
    .bind(meno).first<{ n: number }>().catch(() => ({ n: 0 }));
  return r?.n ?? 0;
}

export const Route = createFileRoute("/api/premenuj")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let zo = "";
        let na = "";
        let naozaj = false;
        try {
          const b = (await request.json()) as Record<string, unknown>;
          zo = String(b.zo ?? "").trim();
          na = String(b.na ?? "").trim();
          naozaj = b.naozaj === true;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }

        if (!zo || !na) return Response.json({ ok: false, error: "Chýba pôvodné alebo nové meno." }, { status: 400 });
        if (zo === na) return Response.json({ ok: false, error: "Mená sú rovnaké." }, { status: 400 });
        if (na.length > 120) return Response.json({ ok: false, error: "Meno je príliš dlhé." }, { status: 400 });

        try {
          // Cieľ už existuje → je to zlúčenie, nie premenovanie. Nerobíme ho:
          // dvaja ľudia s jedným menom sa oddeliť naspäť nedajú.
          const kolizia = await pocet(DB, "sessions", "client_name", na)
            + await pocet(DB, "client_overrides", "name", na);
          if (kolizia > 0) {
            return Response.json({
              ok: false,
              error: `Meno „${na}" už v appke existuje. Zlúčiť dvoch klientov do jedného appka zámerne nevie — späť by sa to oddeliť nedalo. Ak je to naozaj ten istý človek, ozvi sa.`,
            }, { status: 409 });
          }

          // Najprv len spočítať, čoho sa to týka. Jerry to uvidí a potvrdí.
          const dotknute: Record<string, number> = {};
          let spolu = 0;
          for (const t of TABULKY) {
            const n = await pocet(DB, t.tab, t.stlpec, zo);
            if (n) { dotknute[t.tab] = n; spolu += n; }
          }
          if (!spolu) return Response.json({ ok: false, error: `Pod menom „${zo}" nič nie je.` }, { status: 404 });
          if (!naozaj) return Response.json({ ok: true, nahlad: true, dotknute, spolu });

          // Kľúč sa mení spolu s menom — inak by najbližší import založil
          // druhého klienta namiesto toho, aby doplnil tohto.
          const prikazy = TABULKY.map((t) =>
            t.kluc
              ? DB.prepare(
                `UPDATE ${t.tab} SET ${t.stlpec} = ?1, dedup_key = REPLACE(dedup_key, ?2, ?1) WHERE ${t.stlpec} = ?2`,
              ).bind(na, zo)
              : DB.prepare(`UPDATE ${t.tab} SET ${t.stlpec} = ?1 WHERE ${t.stlpec} = ?2`).bind(na, zo),
          );
          await DB.batch(prikazy);

          await audit(DB, {
            action: "premenovanie",
            predmet: `klient ${zo}`,
            neu: `${na} · ${spolu} riadkov (${Object.entries(dotknute).map(([t, n]) => `${t}:${n}`).join(", ")})`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, spolu, dotknute });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
