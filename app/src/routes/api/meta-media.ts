import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { UCET_REKLAM } from "../../lib/psb/kampanPlan";

/**
 * Nahranie obrázka alebo videa do reklamného účtu.
 *
 * PREČO SAMOSTATNÝ ENDPOINT
 *
 * `/api/meta` prijíma JSON — binárny súbor by sa doň musel zabaliť do base64
 * a narásť o tretinu. Tu ide `multipart/form-data` priamo z prehliadača do
 * Mety, bez medzikroku.
 *
 * ČO VRACIA A PREČO NIE HNEĎ REKLAMU
 *
 * Len `hash` (obrázok) alebo `videoId`. Kampaň sa zakladá druhým volaním —
 * nahranie súboru je najpomalší a najkrehkejší krok, a keby padol až uprostred
 * zakladania, zostali by v účte prázdne kampane. Takto sa najprv v pokoji
 * nahrá médium a až potom stavia to ostatné.
 *
 * VIDEO SA NEČAKÁ
 *
 * Meta vracia video v stave `processing` a kreatíva z neho prejde aj tak
 * (zmerané 19. 8. 2026). Čakanie by request predĺžilo o desiatky sekúnd —
 * v Cloudflare Workeri zbytočné riziko.
 */
const V = "v21.0";
/** Meta berie obrázky do 30 MB a videá do 4 GB; Worker má vlastné stropy. */
const MAX_MB = 100;

async function token(DB: D1Database): Promise<string> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'meta_token'").first<{ value: string }>();
  if (!r?.value) return "";
  try { return String(JSON.parse(r.value)); } catch { return r.value; }
}

export const Route = createFileRoute("/api/meta-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        const tok = await token(DB);
        if (!tok) return Response.json({ ok: false, error: "V nastavení chýba token pre Metu." }, { status: 400 });

        let subor: File | null = null;
        try {
          const fd = await request.formData();
          const f = fd.get("subor");
          if (f instanceof File) subor = f;
        } catch {
          return Response.json({ ok: false, error: "Súbor sa nepodarilo prečítať." }, { status: 400 });
        }
        if (!subor || !subor.size) return Response.json({ ok: false, error: "Chýba súbor." }, { status: 400 });
        if (subor.size > MAX_MB * 1024 * 1024) {
          return Response.json({ ok: false, error: `Súbor má ${Math.round(subor.size / 1024 / 1024)} MB, strop je ${MAX_MB} MB.` }, { status: 400 });
        }

        const jeVideo = (subor.type || "").startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(subor.name || "");
        const ucet = `act_${UCET_REKLAM}`;
        const fd2 = new FormData();
        fd2.append("access_token", tok);
        // Obrázok chce pole `filename`, video `source` — Meta to má naozaj inak.
        fd2.append(jeVideo ? "source" : "filename", subor, subor.name || (jeVideo ? "video.mp4" : "obrazok.jpg"));

        const odp = await fetch(`https://graph.facebook.com/${V}/${ucet}/${jeVideo ? "advideos" : "adimages"}`, {
          method: "POST", body: fd2,
        }).then((r) => r.json() as Promise<{
          id?: string; images?: Record<string, { hash?: string }>; error?: { message?: string; error_user_msg?: string };
        }>).catch(() => null);

        if (!odp || odp.error) {
          return Response.json({
            ok: false,
            error: `Meta súbor neprijala: ${odp?.error?.error_user_msg || odp?.error?.message || "spojenie zlyhalo"}`,
          }, { status: 502 });
        }

        if (jeVideo) {
          const videoId = String(odp.id || "");
          if (!videoId) return Response.json({ ok: false, error: "Meta nevrátila id videa." }, { status: 502 });
          // Náhľad je pri video kreatíve povinný a Meta ho vracia hneď,
          // ešte pred dokončením spracovania.
          const nah = await fetch(
            `https://graph.facebook.com/${V}/${videoId}?fields=picture&access_token=${encodeURIComponent(tok)}`,
          ).then((r) => r.json() as Promise<{ picture?: string }>).catch(() => null);
          return Response.json({ ok: true, typ: "video", videoId, nahlad: String(nah?.picture || ""), meno: subor.name || "" });
        }

        const hash = odp.images ? Object.values(odp.images)[0]?.hash || "" : "";
        if (!hash) return Response.json({ ok: false, error: "Meta nevrátila odtlačok obrázka." }, { status: 502 });
        return Response.json({ ok: true, typ: "obrazok", hash, meno: subor.name || "" });
      },
    },
  },
});
