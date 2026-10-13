import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * OPRAVA TEXTU (Jerry, 13. 10. 2026: „texty, ktoré napíšem k tým fotkám,
 * dať ich opraviť gramaticky — nejaké tlačidlo oprava textu").
 *
 * Opraví pravopis, diakritiku, interpunkciu a gramatiku — NIČ viac. Jazyk
 * ostane, aký je (slovenčina slovenčinou, čeština češtinou), význam aj tón
 * tiež; nič sa nepridáva ani neuhládza do „marketingu". Text ide klientovi
 * a má znieť ako tréner, nie ako stroj.
 */
const MODEL = "claude-sonnet-5";

const ZADANIE = [
  "Si korektor. Dostaneš krátky text, ktorý tréner napísal klientovi k fotkám držania tela (pred/po).",
  "Oprav v ňom LEN: pravopis, diakritiku, preklepy, veľké písmená, interpunkciu (čiarky, bodky) a gramatiku (zhoda, tvary slov).",
  "",
  "PRAVIDLÁ:",
  "· Jazyk NEMEŇ. Slovenský text ostane slovenský, český český. Keď sú zmiešané, oprav každú časť v jej jazyku.",
  "· Význam, poradie myšlienok, tón a oslovenie (tykanie/vykanie) nechaj. Nič nepridávaj, nič nevynechávaj, nevysvetľuj.",
  "· Odborné slová (kyfóza, lordóza, panva, hrudník, lopatky…) nechaj; oprav len ich pravopis.",
  "· Neuhládzaj do reklamy ani do formálneho úradného štýlu. Má to znieť ako ten istý človek, len bez chýb.",
  "· Rozdeľ príliš dlhé súvetia na vety len vtedy, keď bez toho text nedáva zmysel.",
  "· Zalomenia riadkov zachovaj.",
  "",
  "Odpovedz IBA opraveným textom. Žiadny úvod, žiadne úvodzovky, žiadny zoznam zmien.",
].join("\n");

export const Route = createFileRoute("/api/oprava-textu")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Oprava nie je pripojená (chýba kľúč)." }, { status: 503 });
        let b: { text?: unknown };
        try { b = (await request.json()) as typeof b; } catch { return Response.json({ ok: false, error: "nečitateľné telo" }, { status: 400 }); }
        const text = String(b.text ?? "").trim();
        if (text.length < 2) return Response.json({ ok: false, error: "Nie je čo opraviť." }, { status: 400 });
        if (text.length > 4000) return Response.json({ ok: false, error: "Text je dlhší než 4 000 znakov." }, { status: 400 });
        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: ZADANIE, messages: [{ role: "user", content: text }] }),
            signal: AbortSignal.timeout(30000),
          });
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            return Response.json({ ok: false, error: `Oprava odmietnutá (${r.status}): ${detail.slice(0, 160)}` }, { status: 502 });
          }
          const j = (await r.json()) as { content?: { type?: string; text?: string }[] };
          const opraveny = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("").trim();
          if (!opraveny) return Response.json({ ok: false, error: "Oprava vrátila prázdno." }, { status: 502 });
          return Response.json({ ok: true, text: opraveny.slice(0, 4500), zmenene: opraveny !== text });
        } catch (e) {
          return Response.json({ ok: false, error: `Oprava zlyhala: ${String(e).slice(0, 160)}` }, { status: 502 });
        }
      },
    },
  },
});
