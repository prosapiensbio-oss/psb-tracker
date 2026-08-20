import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Text jednej vedomosti — rešerše alebo príručky zvonku.
 *
 * PREČO SAMOSTATNÝ ENDPOINT
 *
 * Prehľad vedomostí (názov, o čom, ako staré) chodí v `/api/data` spolu so
 * všetkým ostatným, ale TEXT nie. Jedna rešerš má 8 000 znakov a appka si dáta
 * ťahá pri každom otvorení — posielať ju zakaždým by znamenalo prenášať knihu,
 * ktorú nikto nečíta. Text sa preto pýta až vtedy, keď ho niekto naozaj chce
 * vidieť.
 *
 * To isté pravidlo platí pre Jarvisa: v kontexte má prehľad, text si vytiahne
 * SQL dopytom.
 */
export const Route = createFileRoute("/api/vedomost")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        const id = new URL(request.url).searchParams.get("id") || "";
        if (!id) return Response.json({ ok: false, error: "chyba_id" }, { status: 400 });

        const r = await DB.prepare(
          "SELECT id, nazov, o_com, text, zdroj, obnovovat_po_dnoch, overene_at FROM jarvis_vedomosti WHERE id = ?1",
        ).bind(id).first<{
          id: string; nazov: string; o_com: string; text: string;
          zdroj: string; obnovovat_po_dnoch: number; overene_at: string;
        }>();
        if (!r) return Response.json({ ok: false, error: "nenajdene" }, { status: 404 });

        return Response.json({
          ok: true,
          vedomost: {
            id: r.id, nazov: r.nazov, oCom: r.o_com || "", text: r.text || "",
            zdroj: r.zdroj || "", obnovovatPoDnoch: Number(r.obnovovat_po_dnoch) || 0,
            overeneAt: r.overene_at || "",
          },
        });
      },
    },
  },
});
