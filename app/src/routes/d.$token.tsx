import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { NAHLAD_DOTAZNIKA, rozoberFormular } from "../lib/psb/dotaznik";
import { stavOdkazu, ulozOdpoved } from "../lib/psb/dotaznik.server";
import { dotaznikHotovo, dotaznikNeplati, dotaznikStranka } from "../lib/psb/dotaznikStranka";

/**
 * ANONYMNÝ DOTAZNÍK — stránka pre klienta `/d/<token>` (9. 10. 2026).
 *
 * Osobný odkaz slúži len na „vyplniť raz". Odpoveď sa uloží BEZ tokenu
 * a bez klienta (`dotaznik.server.ts`) — kto čo napísal, sa nedá zistiť
 * ani z databázy. Bez prihlásenia, bez JavaScriptu, v češtine.
 */
const html = (telo: string, status = 200) => new Response(telo, {
  status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" },
});

const platnyTvar = (t: string) => /^[A-Za-z0-9]{8,24}$/.test(t);

export const Route = createFileRoute("/d/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        if (token === NAHLAD_DOTAZNIKA) {
          return html(new URL(request.url).searchParams.get("hotovo") === "1" ? dotaznikHotovo({}) : dotaznikStranka({ nahlad: true }));
        }
        const { DB } = bindings();
        if (!DB || !platnyTvar(token)) return html(dotaznikNeplati({}), 404);
        const s = await stavOdkazu(DB, token);
        if (s.stav === "neplati") return html(dotaznikNeplati({}), 404);
        if (s.stav === "uzavrete") return html(dotaznikNeplati({ uzavrete: true }), 410);
        if (s.stav === "pouzity") {
          const prave = new URL(request.url).searchParams.get("hotovo") === "1";
          return html(dotaznikHotovo({ uzPredtym: !prave }));
        }
        return html(dotaznikStranka({}));
      },
      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        // Náhľad nič neukladá — len ukáže, čo uvidí klient po odoslaní.
        if (token === NAHLAD_DOTAZNIKA) {
          return new Response(null, { status: 303, headers: { location: `/d/${NAHLAD_DOTAZNIKA}?hotovo=1`, "cache-control": "no-store" } });
        }
        const { DB } = bindings();
        if (!DB || !platnyTvar(token)) return html(dotaznikNeplati({}), 404);
        const s = await stavOdkazu(DB, token);
        if (s.stav === "neplati") return html(dotaznikNeplati({}), 404);
        if (s.stav === "uzavrete") return html(dotaznikNeplati({ uzavrete: true }), 410);
        if (s.stav === "pouzity" || !s.kolo) return html(dotaznikHotovo({ uzPredtym: true }));
        const f = new URLSearchParams(await request.text().catch(() => ""));
        const v = await ulozOdpoved(DB, token, s.kolo, rozoberFormular(f)).catch(() => null);
        if (v === null) return html(dotaznikStranka({ chyba: "Odpověď se nepodařilo uložit — zkuste to prosím znovu." }), 500);
        if (v === "prazdne") return html(dotaznikStranka({ chyba: "Nevyplnili jste nic — stačí odpovědět aspoň na jednu otázku." }));
        // 303 → GET: obnovenie stránky po odoslaní neodošle formulár druhýkrát.
        return new Response(null, { status: 303, headers: { location: `/d/${encodeURIComponent(token)}?hotovo=1`, "cache-control": "no-store" } });
      },
    },
  },
});
