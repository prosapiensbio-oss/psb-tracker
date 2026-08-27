import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { DLZKA_PODLA_FAZY, type Krok, ZABER_SEK } from "../../lib/psb/sekvencia";
import { ZABERY, ZABER_MAPA } from "../../lib/psb/zabery";

/**
 * Rozpis záberov k hotovému scenáru.
 *
 * PREČO TO ROBÍ JARVIS A NIE JERRY RUČNE
 *
 * Priradiť záber k vete nie je tvorivá práca — je to remeslo, ktoré má
 * pravidlá: dva rovnaké pohyby za sebou sa nesmú, dĺžka záberu je dva až päť
 * sekúnd, celková stopáž patrí k fáze. Jarvis katalóg aj pravidlá pozná, tak
 * nech to navrhne a Jerry to len prejde.
 *
 * PREČO SA VÝSLEDOK KONTROLUJE
 *
 * Model si vie vymyslieť id záberu, ktoré v katalógu nie je. Také by sa v
 * editore ukázalo ako „zatiaľ neviem" a vyzeralo by to, že appka niečo
 * stratila. Preto sa neznáme id zahodí a povie sa to nahlas.
 */

const MODEL = "claude-sonnet-5";

export const Route = createFileRoute("/api/sekvencia-navrh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return Response.json({ ok: false, error: "neprihlásený" }, { status: 401 });
        }
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Jarvis nie je pripojený." }, { status: 503 });

        let b: { scenar?: unknown; faza?: unknown };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "nečitateľné telo" }, { status: 400 }); }

        const scenar = String(b.scenar ?? "").trim().slice(0, 4000);
        const faza = Number(b.faza) || 0;
        if (scenar.length < 20) {
          return Response.json(
            { ok: false, error: "Najprv napíš scenár — bez viet niet čo k záberom priradiť." },
            { status: 400 },
          );
        }

        const d = DLZKA_PODLA_FAZY[faza];
        const katalog = ZABERY.map((z) =>
          `- ${z.id} (pohyb: ${z.pohyb}) — ${z.nazov}. ${z.coRobi} Sedí fázam: ${z.fazy.join(", ")}.`,
        ).join("\n");

        const zadanie = [
          "Rozpisuješ ZÁBERY k hotovému scenáru krátkeho videa pre ProSapiens Biomechanic.",
          "Scenár je to, čo Jerry hovorí na kameru. Tvojou úlohou je rozdeliť ho na vety",
          "a ku každej vete priradiť jeden záber z katalógu.",
          "",
          "KATALÓG ZÁBEROV — používaj IBA tieto id, iné neexistujú:",
          katalog,
          "",
          "PRAVIDLÁ, KTORÉ SA NESMÚ PORUŠIŤ:",
          `· Jeden záber trvá ${ZABER_SEK.min} až ${ZABER_SEK.max} sekúnd, ideálne ${ZABER_SEK.ideal}.`,
          "· DVA ROVNAKÉ POHYBY ZA SEBOU NIE. Pozri stĺpec „pohyb“ — nesmú nasledovať dva rovnaké.",
          "· Dva statické zábery za sebou nie. Dva švihy za sebou nie.",
          d ? `· Celková stopáž pre fázu ${faza}: ${d.min} až ${d.max} sekúnd. ${d.preco}` : "",
          "· Prvý záber je hák. Musí zastaviť palec — tam patrí najsilnejší pohyb.",
          "",
          "Odpovedz IBA týmto JSON poľom, bez akéhokoľvek ďalšieho textu:",
          '[{"zaber":"id-z-katalogu","veta":"presná veta zo scenára","co":"čo je v zábere vidieť, jedna veta","sekund":3}]',
          "",
          "· veta: DOSLOVA zo scenára, neprepisuj ju.",
          "· co: konkrétne, čo má byť v obraze. Nie „záber na Jerryho“, ale „ruka na driekovej chrbtici, telo mimo záber“.",
          "· Nevymýšľaj vety, ktoré v scenári nie sú.",
        ].filter(Boolean).join("\n");

        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: MODEL, max_tokens: 2000,
              system: zadanie,
              messages: [{ role: "user", content: scenar }],
            }),
            signal: AbortSignal.timeout(45000),
          });
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            return Response.json({ ok: false, error: `Jarvis odmietol (${r.status}): ${detail.slice(0, 160)}` }, { status: 502 });
          }
          const j = (await r.json()) as { content?: { type?: string; text?: string }[] };
          const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
          const { kroky, zahodene } = citajKroky(text);
          if (!kroky.length) {
            return Response.json({ ok: false, error: "Jarvis odpovedal, ale nie v tvare, ktorý sa dá vyplniť." }, { status: 502 });
          }
          return Response.json({ ok: true, kroky, zahodene });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 502 });
        }
      },
    },
  },
});

/**
 * Vytiahne kroky z odpovede a zahodí neznáme zábery.
 *
 * Neznáme id sa NEZAHADZUJE POTICHU — vracia sa ich zoznam, aby appka mohla
 * povedať, ktoré vety ostali bez záberu. Ticho by z toho bola diera, ktorú by
 * Jerry našiel až pri natáčaní.
 */
function citajKroky(text: string): { kroky: Krok[]; zahodene: string[] } {
  const od = text.indexOf("[");
  const po = text.lastIndexOf("]");
  if (od < 0 || po <= od) return { kroky: [], zahodene: [] };
  try {
    const p: unknown = JSON.parse(text.slice(od, po + 1));
    if (!Array.isArray(p)) return { kroky: [], zahodene: [] };
    const kroky: Krok[] = [];
    const zahodene: string[] = [];
    for (const x of p as Record<string, unknown>[]) {
      const zaber = String(x.zaber ?? "");
      const veta = String(x.veta ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!veta) continue;
      const zname = ZABER_MAPA.has(zaber);
      if (!zname && zaber) zahodene.push(zaber);
      kroky.push({
        zaber: zname ? zaber : "",
        veta,
        co: String(x.co ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        sekund: Math.min(ZABER_SEK.max, Math.max(1, Math.round(Number(x.sekund) || ZABER_SEK.ideal))),
      });
    }
    return { kroky, zahodene: [...new Set(zahodene)] };
  } catch {
    return { kroky: [], zahodene: [] };
  }
}
