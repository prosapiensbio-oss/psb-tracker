import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { audit } from "../../lib/psb/audit.server";

/**
 * Obrázok do titulky z Workers AI.
 *
 * PREČO CLOUDFLARE A NIE HIGGSFIELD
 *
 * Nie kvôli kvalite, ale kvôli tomu, čo to stojí zapojiť. Workers AI je
 * VÄZBA, nie kľúč: beží na tom istom účte ako appka, takže tu nie je čo
 * nastavovať, čo utajovať a čo raz za čas obnovovať. Cudzie API by znamenalo
 * tajomstvo navyše a ďalšie miesto, kde sa dá pokaziť nasadenie.
 *
 * PREČO SA VOLÁ LEN NA KLIKNUTIE
 *
 * Účtuje sa za obrázok. Je to rádovo desatina centa, takže na tom nezáleží
 * pri desiatich obrázkoch — ale volanie „pre istotu pri každom otvorení okna"
 * by z toho spravilo tichý odber.
 *
 * PREČO ZÁZNAM DO AUDITU
 *
 * Je to jediná vec v appke, ktorá stojí peniaze za kus. Bez záznamu by sa
 * nedalo povedať, koľko sa ich vygenerovalo — a prvá otázka pri faktúre je
 * presne táto.
 */

/** FLUX.1 schnell — najlepšie držanie promptu z toho, čo Workers AI ponúka. */
const MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** Prompt má v modeli strop 2048 znakov; ten náš má okolo 900. */
const MAX_PROMPT = 2048;

export const Route = createFileRoute("/api/titulka-obrazok")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        }
        const { AI, DB } = bindings();
        if (!AI) {
          return Response.json(
            { ok: false, error: "Workers AI nie je pripojené — chýba väzba v konfigurácii." },
            { status: 503 },
          );
        }

        let prompt = "";
        try {
          const b = (await request.json()) as { prompt?: unknown };
          prompt = String(b.prompt ?? "").trim().slice(0, MAX_PROMPT);
        } catch {
          return Response.json({ ok: false, error: "nečitateľné telo požiadavky" }, { status: 400 });
        }
        if (prompt.length < 20) {
          return Response.json({ ok: false, error: "prompt je prikrátky" }, { status: 400 });
        }

        try {
          // `steps` je v tomto modeli najviac 8. Štyri sú východzie a rozdiel
          // pri ôsmich je menší než rozptyl medzi dvoma pokusmi s tým istým
          // promptom — platiť dvakrát za to nemá zmysel.
          const odpoved = (await AI.run(MODEL, { prompt, steps: 4 })) as { image?: string };
          const base64 = typeof odpoved?.image === "string" ? odpoved.image : "";
          if (!base64) {
            return Response.json({ ok: false, error: "model nevrátil obrázok" }, { status: 502 });
          }
          if (DB) {
            await audit(DB, {
              action: "generovanie",
              predmet: "obrázok do titulky",
              neu: prompt.slice(0, 160),
            }).catch(() => { /* záznam nesmie zhodiť samotné generovanie */ });
          }
          return Response.json({ ok: true, dataUri: `data:image/jpeg;base64,${base64}` });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});
