import { createFileRoute } from "@tanstack/react-router";

import { currentUser, unauthorized } from "../../lib/psb/auth.server";
import { cestaKniznice, MAX_SUBOR_KNIZNICE, PREFIX_KNIZNICE } from "../../lib/psb/striznaKniznica";
import { chyba, envNahrate, ok } from "../../lib/psb/striznaNahrate.server";

/**
 * SPOLOČNÁ KNIŽNICA STRIŽNE – všetko v jednej splat route (holú cestu chytí aj `$`).
 *
 *   GET                 → { ok, polozky: [{ cesta, velkost }] }
 *   GET  subor?cesta=…  → bajty súboru
 *   PUT  subor?cesta=…  → telo = bajty, content-length povinný → { ok }
 *
 * Mazanie zámerne nie je: čo jeden Mac pridá, druhému nezmizne, a zmazanie na jednom
 * Macu si pamätá Strižňa sama (nestiahne to znova).
 */
export const Route = createFileRoute("/api/strizna/kniznica/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!(await currentUser(request))) return unauthorized();
        const { STORAGE } = envNahrate();
        if (!STORAGE) return chyba("Úložisko nie je zapnuté.", 503);
        const splat = String((params as { _splat?: string })._splat || "");
        if (!splat) {
          const polozky: { cesta: string; velkost: number }[] = [];
          let cursor: string | undefined;
          do {
            const z = await STORAGE.list({ prefix: PREFIX_KNIZNICE, ...(cursor ? { cursor } : {}) });
            for (const o of z.objects) polozky.push({ cesta: o.key.slice(PREFIX_KNIZNICE.length), velkost: o.size });
            cursor = z.truncated ? z.cursor : undefined;
          } while (cursor);
          return ok({ polozky });
        }
        if (splat !== "subor") return chyba("Neznáma cesta.", 404);
        const cesta = cestaKniznice(new URL(request.url).searchParams.get("cesta") ?? "");
        if (!cesta) return chyba("Neplatná cesta v knižnici.");
        const obj = await STORAGE.get(PREFIX_KNIZNICE + cesta);
        if (!obj) return chyba("Taký súbor v knižnici nie je.", 404);
        return new Response(obj.body as never, { headers: { "content-type": "application/octet-stream", "content-length": String(obj.size), "cache-control": "no-store" } });
      },
      PUT: async ({ request, params }) => {
        if (!(await currentUser(request))) return unauthorized();
        const { STORAGE } = envNahrate();
        if (!STORAGE) return chyba("Úložisko nie je zapnuté.", 503);
        if (String((params as { _splat?: string })._splat || "") !== "subor") return chyba("Neznáma cesta.", 404);
        const cesta = cestaKniznice(new URL(request.url).searchParams.get("cesta") ?? "");
        if (!cesta) return chyba("Neplatná cesta v knižnici.");
        const dlzka = Number(request.headers.get("content-length"));
        if (!Number.isFinite(dlzka) || dlzka <= 0) return chyba("Chýba veľkosť súboru.", 411);
        if (dlzka > MAX_SUBOR_KNIZNICE) return chyba("Súbor je väčší ako 95 MB.", 413);
        if (!request.body) return chyba("Prázdne telo.");
        await STORAGE.put(PREFIX_KNIZNICE + cesta, request.body as never);
        return ok();
      },
    },
  },
});
