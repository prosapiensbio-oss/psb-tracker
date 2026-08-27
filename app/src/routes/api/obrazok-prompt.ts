import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { PALETA } from "../../lib/psb/titulka";

/**
 * Z Jerryho vety spraví prompt na obrázok.
 *
 * PREČO TO NEPÍŠE JERRY SÁM
 *
 * Vie, čo chce vidieť. Nemá dôvod vedieť, že model potrebuje hex kódy namiesto
 * názvov farieb, že „diagram tela" je pre neho prázdne slovo a že bez zoznamu
 * zákazov domaľuje tiene a perspektívu. To je remeslo, nie zámer — a remeslo
 * má robiť appka.
 *
 * ODKIAĽ SÚ PRAVIDLÁ
 *
 * Z Jerryho vlastného návodu na Higgsfield (skill `higgsfield-prompting`):
 * buď konkrétny, popisuj vzťahy medzi prvkami, popíš aj to, čo na obrázku NIE
 * JE, farby vždy hex kódom, a nemiešaj fotorealizmus s infografikou. Nie sú to
 * moje domnienky — je to to, čo si Jerry sám odpozoroval.
 */

const MODEL = "claude-sonnet-5";

const ZADANIE = [
  "Píšeš prompt pre generátor obrázkov (Higgsfield Nano Banana Pro / Flux).",
  "Vstupom je vlastnými slovami napísané želanie. Výstupom je hotový prompt v ANGLIČTINE.",
  "",
  "Odpovedz IBA samotným promptom. Žiadny úvod, žiadne vysvetlenie, žiadne úvodzovky navyše.",
  "",
  "REMESELNÉ PRAVIDLÁ (z overenej praxe, nie z hlavy):",
  "· Buď KONKRÉTNY. Nie „diagram of the body“, ale „anatomical side-view silhouette,",
  "  thin line art, no fill, showing spine curvature“.",
  "· Popíš VZŤAHY medzi prvkami: „an arrow pointing from the pelvis to the shoulder“.",
  "· Popíš aj to, čo na obrázku NIE JE. Zákazy fungujú lepšie než prívlastky.",
  "· Farby VŽDY hex kódom, nikdy slovom.",
  "· Nemiešaj fotorealizmus s infografikou. Vyberá sa jedno — tu vždy infografika.",
  "· Vágne pokyny („make it look nice“) nefungujú. Jednoduchosť žiadaj ČÍSLOM.",
  "",
  "ČO MUSÍ BYŤ V KAŽDOM PROMPTE:",
  "· FLAT VECTOR ILLUSTRATION. Not a photograph, not a 3D render.",
  "· Thin, even line weight. Flat colour fills only.",
  "· ONE subject, at most three elements, most of the canvas empty.",
  `· Only these colours: ${Object.values(PALETA).join(", ")}.`,
  "· NO TEXT, NO LETTERS, NO NUMBERS, NO LOGOS — na obrázok sa bude sádzať nadpis, ktorý sa s písmenami z modelu bude biť.",
  "· NO shading, NO shadows, NO gradients, NO textures, NO depth, NO perspective.",
  "· NO icons, NO clipart, NO emoji, NO realistic faces.",
  "· Nechaj hornú polovicu plátna pokojnú — tam sadá nadpis.",
  "",
  "POZOR NA BEZPEČNOSTNÝ FILTER: nepíš „human bodies“ ani „naked“. Píš „a person in movement“,",
  "„an anatomical silhouette“. Overené — inak generovanie spadne (chyba 8007).",
  "",
  "Prompt drž pod 200 slovami. Jedna súvislá pasáž, riadky oddelené novým riadkom.",
].join("\n");

export const Route = createFileRoute("/api/obrazok-prompt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        }
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Jarvis nie je pripojený." }, { status: 503 });

        let b: { zelanie?: unknown; nadpis?: unknown; rezim?: unknown };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "nečitateľné telo" }, { status: 400 }); }

        const zelanie = String(b.zelanie ?? "").trim().slice(0, 1000);
        if (zelanie.length < 3) {
          return Response.json({ ok: false, error: "Napíš aspoň vetu o tom, čo chceš vidieť." }, { status: 400 });
        }

        const podklad = [
          `Želanie: ${zelanie}`,
          b.nadpis ? `Nadpis, ktorý na obrázok príde: ${String(b.nadpis).replace(/\*/g, "").slice(0, 160)}` : "",
          `Režim titulky: ${b.rezim === "tmavy" ? "tmavý (tmavé pozadie)" : "svetlý (svetlé pozadie)"}`,
        ].filter(Boolean).join("\n");

        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 700,
              system: ZADANIE,
              messages: [{ role: "user", content: podklad }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            return Response.json({ ok: false, error: `Jarvis odmietol (${r.status}): ${detail.slice(0, 160)}` }, { status: 502 });
          }
          const j = (await r.json()) as { content?: { type?: string; text?: string }[] };
          const prompt = (j.content || []).filter((c) => c.type === "text")
            .map((c) => c.text || "").join("").trim();
          if (!prompt) return Response.json({ ok: false, error: "Jarvis vrátil prázdno." }, { status: 502 });
          return Response.json({ ok: true, prompt: prompt.slice(0, 2000) });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 502 });
        }
      },
    },
  },
});
