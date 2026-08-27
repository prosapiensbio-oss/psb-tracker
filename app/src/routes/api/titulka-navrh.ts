import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * Návrh textov na titulku.
 *
 * PREČO VLASTNÁ ADRESA A NIE ROZHOVOR S JARVISOM
 *
 * Okno titulky je formulár. Keby sa návrh vypísal v konverzácii, Jerry by ho
 * musel prepisovať späť do polí — a to je presne tá práca, ktorú má návrh
 * ušetriť. Preto sa pýtame na JEDNU odpoveď v pevnom tvare a rovno ju
 * vyplníme.
 *
 * PREČO KRÁTKA ODPOVEĎ A NIE ROZBOR
 *
 * Nadpis na titulke má tri až šesť slov. Model, ktorý dostane priestor,
 * napíše odsek — a z odseku sa titulka nedá spraviť. Preto je strop nízky
 * a inštrukcia doslovná.
 */

const MODEL = "claude-sonnet-5";

/**
 * Čo sa od modelu chce.
 *
 * Zistené pri prvom ostrom behu (25. 8. 2026): appka navrhla ako nadpis prvú
 * vetu captionu — „Plank. Sklapovačky. Mrtvý tah" — čo trafí TÉMU, ale nie
 * NAPÄTIE. Titulka žije z napätia, tak sa oň pýta výslovne.
 */
const ZADANIE = [
  "Si marketingový riaditeľ ProSapiens Biomechanic, štúdia biomechaniky v Brne.",
  "Navrhni texty na TITULKU jedného príspevku. Titulka je obrázok 1080×1920, ktorý",
  "človek uvidí vo feede skôr, než si prečíta čokoľvek iné.",
  "",
  "Odpovedz IBA týmto JSON, bez akéhokoľvek ďalšieho textu:",
  '{"stitok":"…","nadpis":"…","podnadpis":"…"}',
  "",
  "PRAVIDLÁ:",
  "· Všetko PO ČESKY. Písané texty PSB sú české, hovorené slovenské — toto je písané.",
  "· stitok: JEDNO slovo, VEĽKÝMI písmenami. Téma, nie značka. Napr. BIOMECHANIKA, DÝCHÁNÍ, CHŮZE.",
  "· nadpis: TRI AŽ ŠESŤ SLOV. Nie zhrnutie príspevku — NAPÄTIE, kvôli ktorému sa človek zastaví.",
  "  Dobré: „Roky odcvičené. Záda stejná.“ Zlé: „Plank. Sklapovačky. Mrtvý tah.“ — to je výpočet, nie napätie.",
  "· V nadpise smieš JEDNO slovo alebo jednu časť obaliť do *hviezdičiek* — to sa vysádže tenkým rezom.",
  "  Použi to na tú polovicu vety, ktorá je pointa. Nie na spojku.",
  "· podnadpis: JEDNA veta, najviac osem slov. Smie byť prázdna, keď nadpis stačí.",
  "· Žiadne hashtagy, žiadne emoji, žiadne úvodzovky navyše, žiadna výzva na akciu.",
  "· Nevymýšľaj fakty. Stavaj len na tom, čo je v podklade nižšie.",
].join("\n");

export const Route = createFileRoute("/api/titulka-navrh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        }
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Jarvis nie je pripojený." }, { status: 503 });

        let b: { koncept?: unknown; hotovyText?: unknown; scenar?: unknown; styl?: unknown; faza?: unknown };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "nečitateľné telo" }, { status: 400 }); }

        const podklad = [
          b.faza ? `Fáza nákupného cyklu: ${String(b.faza)}` : "",
          b.styl ? `Štýl titulky: ${String(b.styl)}` : "",
          b.koncept ? `O čom príspevok je: ${String(b.koncept).slice(0, 900)}` : "",
          b.scenar ? `Scenár (čo sa hovorí na kameru): ${String(b.scenar).slice(0, 1200)}` : "",
          b.hotovyText ? `Caption pod príspevkom: ${String(b.hotovyText).slice(0, 1500)}` : "",
        ].filter(Boolean).join("\n\n");

        if (!podklad.trim()) {
          return Response.json(
            { ok: false, error: "Nie je z čoho vychádzať — najprv vyplň koncept alebo caption." },
            { status: 400 },
          );
        }

        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: MODEL,
              // Nízky strop je časť zadania: nadpis má tri až šesť slov, nie odsek.
              max_tokens: 400,
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
          const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
          const navrh = citajNavrh(text);
          if (!navrh) {
            return Response.json({ ok: false, error: "Jarvis odpovedal, ale nie v tvare, ktorý sa dá vyplniť." }, { status: 502 });
          }
          return Response.json({ ok: true, ...navrh });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 502 });
        }
      },
    },
  },
});

/**
 * Vytiahne JSON z odpovede.
 *
 * Model občas obalí odpoveď vetou alebo blokom ```json — hoci sa mu to
 * zakázalo. Zhodiť kvôli tomu celý návrh by bola škoda, tak sa hľadá prvá
 * zložená zátvorka.
 */
function citajNavrh(text: string): { stitok: string; nadpis: string; podnadpis: string } | null {
  const od = text.indexOf("{");
  const po = text.lastIndexOf("}");
  if (od < 0 || po <= od) return null;
  try {
    const o = JSON.parse(text.slice(od, po + 1)) as Record<string, unknown>;
    const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const nadpis = kus(o.nadpis, 120);
    if (!nadpis) return null;
    return {
      stitok: kus(o.stitok, 40).toUpperCase(),
      nadpis,
      podnadpis: kus(o.podnadpis, 160),
    };
  } catch {
    return null;
  }
}
