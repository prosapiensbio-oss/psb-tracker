import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * TRÉNING ZDARMA — hodina, ktorá sa z členstva neodpočíta.
 *
 * Jerry, 27. 9. 2026: „niekedy sa stáva, že chceme dať tréning ZDARMA. Čo keď
 * nechcem, aby sa klientovi odpočítal tréning od členstva?"
 *
 *   POST { klient, den, dovod }        → označí
 *   POST { klient, den, zrus: true }   → značku zruší
 *
 * Kľúč je klient + DEŇ, nie id sedenia: ten istý tréning príde raz z kalendára
 * a raz z exportu a značka musí platiť pre oba. Preto `INSERT OR REPLACE` nad
 * unikátnym indexom — opakované označenie prepíše dôvod, nezaloží druhý riadok.
 *
 * Zrušiť sa dá: je to rozhodnutie človeka a človek sa môže pomýliť. Do
 * `vzas_audit` ide oboje, aby bolo vidieť, kto a kedy hodinu daroval.
 */
const uid = () => crypto.randomUUID();

export const Route = createFileRoute("/api/trening-zdarma")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let telo: { klient?: string; den?: string; dovod?: string; zrus?: boolean };
        try {
          telo = (await request.json()) as typeof telo;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }

        const klient = String(telo.klient || "").trim();
        const den = String(telo.den || "").slice(0, 10);
        if (!klient || !/^\d{4}-\d{2}-\d{2}$/.test(den)) {
          return Response.json({ ok: false, error: "chyba klient alebo deň" }, { status: 400 });
        }

        const kto = (await currentUser(request)) || "";
        try {
          if (telo.zrus) {
            await DB.prepare("DELETE FROM treningy_zdarma WHERE client_name = ? AND den = ?").bind(klient, den).run();
          } else {
            await DB.prepare(
              "INSERT OR REPLACE INTO treningy_zdarma (id, client_name, den, dovod, kto) VALUES (?,?,?,?,?)",
            ).bind(uid(), klient, den, String(telo.dovod || "").slice(0, 200), kto).run();
          }
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }

        await audit(DB, {
          action: telo.zrus ? "trening-zdarma-zrusene" : "trening-zdarma",
          predmet: `${klient} ${den}`,
          month: den.slice(0, 7),
          reason: String(telo.dovod || ""),
          actor: kto,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
