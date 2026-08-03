import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { parseKanaly } from "../../lib/psb/parse";

// Čítanie mesačnej zostavy z PDF — v appke, nie ručne v Claude.
//
// Prečo to appka nedokáže sama: text v Metricool zostave je zapísaný
// podmnožinami fontov (písmeno „A" má vnútorný kód, ktorý bez mapy z toho
// konkrétneho fontu nič neznamená) a — čo je horšie — väčšina čísel v nej vôbec
// nie je text. Sú to vykreslené grafy, 359 obrázkov na 99 stranách. Ani dokonalý
// dekodér fontov by z obrázka číslo neprečítal.
//
// Preto to číta model: API si každú stranu vykreslí a pozerá sa na ňu ako človek.
// Fonty ho nezaujímajú a graf prečíta tiež.
//
// Odpoveď chodí ako SSE. Nie kvôli efektu — čítanie 99 strán trvá aj minútu a
// obyčajný request by po ceste tichl a spadol na timeout. Takto ide každých pár
// sekúnd znak života.
const MODEL = "claude-opus-5";

const POKYN = `Toto je mesačná zostava z Metricoolu za jedno štúdio.

Vypíš z nej VŠETKY číselné metriky ako CSV s presne týmito stĺpcami:

mesiac,kanal,metrika,hodnota,zmena,poznamka

Pravidlá:
- mesiac vo formáte YYYY-MM (obdobie zostavy).
- kanal: Instagram | Facebook | TikTok | Threads | LinkedIn | YouTube | Web | Meta Ads | Google Business | Konkurencia
- metrika: krátky názov v angličtine tak, ako je v zostave (Followers, Impressions, Interactions, Posts, Spent, Clicks, CPC, CPM, CTR, Reach, Views…).
- hodnota: len číslo, bez medzier a bez meny.
- zmena: percentuálna zmena oproti predošlému obdobiu ako číslo (napr. -12.32). Ak ju zostava neuvádza, nechaj prázdne.
- poznamka: prázdne, ak je číslo v zostave VYTLAČENÉ. Ak si ho musel odčítať z grafu, napíš presne: odhad z grafu

Dôležité:
- Neprepočítavaj, nesčítavaj a nedopĺňaj nič, čo v zostave nie je. Radšej vynechaj riadok, než ho odhadni.
- Súhrnné riadky typu CELKOM vynechaj — súčty si appka spraví sama.
- Pri rebríčkoch (top stránky, kampane, konkurencia) daj názov do stĺpca poznamka a metriku pomenuj podľa toho, čo číslo znamená.

Odpovedz IBA tým CSV. Žiadny úvod, žiadne vysvetlenie, žiadne \`\`\` bloky.`;

export const Route = createFileRoute("/api/pdf-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANTHROPIC_API_KEY } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        if (!ANTHROPIC_API_KEY) return Response.json({ ok: false, error: "no_key" }, { status: 500 });

        let filename = "";
        let base64 = "";
        try {
          const b = (await request.json()) as { filename?: string; base64?: string };
          filename = String(b.filename || "zostava.pdf");
          base64 = String(b.base64 || "");
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!base64) return Response.json({ ok: false, error: "no_file" }, { status: 400 });

        const actor = (await currentUser(request)) || undefined;
        const enc = new TextEncoder();

        const stream = new ReadableStream({
          async start(ctrl) {
            const posli = (o: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
            // Znak života každých 5 sekúnd, kým sa čaká na model.
            const tik = setInterval(() => posli({ s: "Jarvis číta zostavu…" }), 5000);
            try {
              posli({ s: "Posielam zostavu na prečítanie…" });
              const resp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
                body: JSON.stringify({
                  model: MODEL,
                  max_tokens: 16000,
                  messages: [{
                    role: "user",
                    content: [
                      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
                      { type: "text", text: POKYN },
                    ],
                  }],
                }),
              });
              if (!resp.ok) {
                const d = await resp.text().catch(() => "");
                posli({ e: `Model odmietol súbor (${resp.status}). ${d.slice(0, 180)}` });
                clearInterval(tik); ctrl.close(); return;
              }
              const j = (await resp.json()) as { content?: { type: string; text?: string }[] };
              const csv = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("\n").trim()
                .replace(/^```[a-z]*\n?/i, "").replace(/```$/, "");

              const riadky = parseKanaly(csv);
              if (!riadky.length) {
                posli({ e: "Z odpovede sa nedalo prečítať ani jedno číslo. Skús to znova, alebo nahraj CSV ručne." });
                clearInterval(tik); ctrl.close(); return;
              }

              const now = new Date().toISOString();
              const stmts = riadky.map((r) =>
                DB.prepare(
                  `INSERT INTO kanaly_mesiace (mesiac, kanal, metrika, hodnota, zmena, poznamka, updated_at)
                   VALUES (?1,?2,?3,?4,?5,?6,?7)
                   ON CONFLICT(mesiac, kanal, metrika) DO UPDATE SET hodnota=?4, zmena=?5, poznamka=?6, updated_at=?7`,
                ).bind(r.mesiac, r.kanal, r.metrika, r.hodnota, r.zmena, r.poznamka, now),
              );
              for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));

              const mesiace = [...new Set(riadky.map((r) => r.mesiac))];
              const kanaly = [...new Set(riadky.map((r) => r.kanal))];
              const odhady = riadky.filter((r) => /odhad/i.test(r.poznamka)).length;
              await audit(DB, {
                action: "import-zostava-pdf",
                predmet: filename,
                neu: `${riadky.length} metrík · ${kanaly.join(", ")} · ${mesiace.join(", ")}${odhady ? ` · ${odhady} odhadnutých z grafu` : ""}`,
                actor,
              });
              posli({ hotovo: { riadkov: riadky.length, mesiace, kanaly, odhady } });
            } catch (e) {
              posli({ e: `Nepodarilo sa: ${String(e).slice(0, 160)}` });
            } finally {
              clearInterval(tik);
              ctrl.close();
            }
          },
        });

        return new Response(stream, {
          headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" },
        });
      },
    },
  },
});
