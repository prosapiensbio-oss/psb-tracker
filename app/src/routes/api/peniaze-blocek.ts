import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../../lib/bindings.server";

// Bloček z fotky pre Peniaze manažér (Jerryho súkromná appka, worker `peniaze`).
//
// POST { obrazok: "data:image/jpeg;base64,…", kategorie: ["Bývanie", …] }
//   → { ok, obchod, datum, suma, kategoria, polozky: [{ nazov, suma }], istota }
//
// Prečo cez Kokpit: kľúč ku Claude API má Kokpit (Jarvis, zošit); súkromná appka
// vlastný nemá. Prístup len tokenom PENIAZE_TOKEN ako /api/peniaze-manazer —
// nič sa neukladá, fotka ide len modelu a odpoveď späť do appky, kde ju Jerry
// pred uložením skontroluje (návrh, nie zápis).

const MODEL = "claude-sonnet-5-5";
const MAX_OBRAZOK = 4 * 1024 * 1024;

function rovnake(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const INSTRUKCIA = `Na fotke je pokladničný bloček (účtenka) z Česka alebo Slovenska.
Vráť LEN JSON objekt, nič iné:
{"obchod": "názov obchodu, ako ho pozná človek (napr. Albert, Lidl, Kavárna Mondieu)",
 "datum": "RRRR-MM-DD alebo null",
 "suma": celková zaplatená suma v Kč ako číslo (napr. 248.5),
 "kategoria": "jedna z KATEGÓRIÍ nižšie, ktorá sedí na väčšinu nákupu",
 "polozky": [{"nazov": "…", "suma": číslo}],
 "istota": "vysoka" | "nizka"}
Pravidlá: celková suma je to, čo sa naozaj zaplatilo (CELKEM / K ÚHRADĚ / SPOLU), nie medzisúčet.
Keď číslicu nevieš prečítať s istotou, nastav "istota": "nizka" — zle prečítaná suma je horšia než priznaná neistota.
Keď na fotke nie je bloček, vráť {"chyba": "nie je to bloček"}.`;

export const Route = createFileRoute("/api/peniaze-blocek")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = bindings() as unknown as { PENIAZE_TOKEN?: string; ANTHROPIC_API_KEY?: string };
        const token = request.headers.get("x-peniaze-token") || "";
        if (!env.PENIAZE_TOKEN || env.PENIAZE_TOKEN.length < 32 || !rovnake(token, env.PENIAZE_TOKEN)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (!env.ANTHROPIC_API_KEY) return Response.json({ ok: false, error: "Kokpit nemá kľúč ku Claude API." }, { status: 503 });
        let b: { obrazok?: string; kategorie?: string[] };
        try { b = await request.json(); } catch { return Response.json({ ok: false, error: "Zlý formát." }, { status: 400 }); }
        const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(b.obrazok || "");
        if (!m) return Response.json({ ok: false, error: "Chýba fotka bločku." }, { status: 400 });
        if (m[2].length > MAX_OBRAZOK) return Response.json({ ok: false, error: "Fotka je príliš veľká." }, { status: 413 });
        const kategorie = (Array.isArray(b.kategorie) ? b.kategorie : []).map(String).slice(0, 40);

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: `${INSTRUKCIA}\n\nKATEGÓRIE: ${kategorie.join(", ") || "Domácnosť, Jedlo vonku"}` },
                { type: "image", source: { type: "base64", media_type: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] } },
              ],
            }],
          }),
        });
        if (!resp.ok) {
          const t = await resp.text();
          return Response.json({ ok: false, error: `Model odmietol (${resp.status}): ${t.slice(0, 200)}` }, { status: 502 });
        }
        const j = (await resp.json()) as { content?: { type: string; text?: string }[] };
        const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
        const o = /\{[\s\S]*\}/.exec(text);
        if (!o) return Response.json({ ok: false, error: "Z odpovede sa nedal prečítať bloček.", surove: text.slice(0, 300) }, { status: 422 });
        let r: { chyba?: string; obchod?: string; datum?: string | null; suma?: number; kategoria?: string; polozky?: { nazov: string; suma: number }[]; istota?: string };
        try { r = JSON.parse(o[0]); } catch { return Response.json({ ok: false, error: "Odpoveď nebola platný JSON.", surove: text.slice(0, 300) }, { status: 422 }); }
        if (r.chyba) return Response.json({ ok: false, error: `Na fotke ${r.chyba}.` }, { status: 422 });
        const suma = Number(r.suma);
        return Response.json({
          ok: true,
          obchod: String(r.obchod || "").slice(0, 80),
          datum: /^\d{4}-\d{2}-\d{2}$/.test(String(r.datum || "")) ? r.datum : null,
          suma: Number.isFinite(suma) && suma > 0 ? Math.round(suma * 100) / 100 : null,
          kategoria: kategorie.includes(String(r.kategoria)) ? r.kategoria : null,
          polozky: (Array.isArray(r.polozky) ? r.polozky : []).slice(0, 40).map((p) => ({ nazov: String(p.nazov || "").slice(0, 60), suma: Number(p.suma) || 0 })),
          istota: r.istota === "nizka" ? "nizka" : "vysoka",
        }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
