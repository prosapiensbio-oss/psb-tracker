import { createFileRoute } from "@tanstack/react-router";

import { jeMesiac } from "../../lib/psb/format";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Mesačná správa po zamknutí mesiaca.
//
// Čísla appka drží. Čo nedrží, sú DÔVODY: prečo nebol zaplatený nájom, prečo
// štyri platby patria do Štátu, prečo tržby vyskočili o 72 %. Tie vysvetlenia
// žijú v registri, a register sa odklikne a zmizne. O rok sa Jerry pozrie na
// júl, uvidí 312 000 Kč a nebude vedieť, či to bola nová úroveň, alebo sa
// niekomu zrazilo päť predplatieb do jedného týždňa.
//
// Zamknutie je jediný okamih, keď je o mesiaci známe všetko naraz. Preto sa
// správa píše práve vtedy.
//
// Prečo samostatná trasa a nie chat: tu sa nechce rozhovor, chce sa jeden
// text, ktorý si človek prečíta, opraví a potvrdí. Chat by ho utopil medzi
// otázkami a nedal by sa uložiť ako celok.

const MODEL = "claude-opus-5";

const INSTRUKCIA = `Si Jarvis, asistent dvojčlenného biomechanického štúdia ProSapiens Biomechanic v Brne.
Majiteľ (Jerry) práve uzavrel a zamkol mesiac. Napíš KRÁTKU mesačnú správu do kroniky.

Účel: o rok sa niekto pozrie na tento mesiac a musí pochopiť, PREČO boli čísla také, aké boli.
Samotné čísla appka drží — ty dopĺňaš dôvody a súvislosti.

Formát (bez markdown nadpisov, bez tučného písma, čistý text):
- Prvý odsek: 2–3 vety o tom, ako mesiac dopadol. Kľúčové čísla s kontextom.
- Druhý odsek: PREČO to tak dopadlo. Ak bol mesiac výnimočný, povedz, či je to
  nová úroveň, alebo jednorazové načasovanie. Toto je najdôležitejšia časť.
- Potom odrážky "· " s tým, čo sa v mesiaci stalo a vysvetlilo (z upozornení,
  odpovedí na otázky mesiaca a opráv v P&L).
- Posledný riadok "Otvorené:" s tým, čo prechádza do ďalšieho mesiaca.

Tvrdé pravidlá:
- Maximálne 160 slov. Kronika sa číta, nie študuje.
- NEVYMÝŠĽAJ SI. Píš len to, čo je v podkladoch nižšie. Keď dôvod nepoznáš,
  napíš "dôvod nezaznamenaný" — je to zápis do trvalého záznamu a nesprávny
  fakt zamrznutý v zamknutom mesiaci je horší než žiadny.
- Žiadne rady, žiadne povzbudzovanie, žiadne "odporúčam". Toto je záznam, nie porada.
- Slovensky, vecne, bez superlatívov.
- Sumy v Kč so zaokrúhlením na celé koruny.`;

export const Route = createFileRoute("/api/sprava")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Chýba API kľúč." }, { status: 500 });

        let b: { mesiac?: string; podklady?: string };
        try {
          b = (await request.json()) as typeof b;
        } catch {
          return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
        }
        const mesiac = String(b.mesiac || "");
        if (!jeMesiac(mesiac)) {
          return Response.json({ ok: false, error: "Chýba mesiac." }, { status: 400 });
        }
        const podklady = String(b.podklady || "").slice(0, 24000);

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1200,
            messages: [{ role: "user", content: `${INSTRUKCIA}\n\nMESIAC: ${mesiac}\n\nPODKLADY:\n${podklady}` }],
          }),
        });
        if (!resp.ok) {
          const t = await resp.text();
          return Response.json({ ok: false, error: `Model odmietol (${resp.status}): ${t.slice(0, 200)}` }, { status: 502 });
        }
        const j = (await resp.json()) as { content?: { type: string; text?: string }[] };
        const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("").trim();
        if (!text) return Response.json({ ok: false, error: "Model vrátil prázdnu odpoveď." }, { status: 422 });
        return Response.json({ ok: true, text });
      },
    },
  },
});
