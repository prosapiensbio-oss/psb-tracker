import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { PSB_KNOWLEDGE } from "../../lib/psb/knowledge";
import { bindings } from "../../lib/bindings.server";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 3000;

type InMsg = { role: "user" | "assistant"; content: string; images?: string[] };

// Turn a data: URL into an Anthropic image block; null if not a supported image.
function imageBlock(url: string) {
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) return null;
  const media_type = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  if (m[2].length > 7_000_000) return null; // ~5MB decoded cap
  return { type: "image", source: { type: "base64", media_type, data: m[2] } };
}

// Build the Anthropic message content: plain string, or text + image blocks.
function toContent(m: InMsg): string | unknown[] {
  const blocks = (m.images || []).map(imageBlock).filter(Boolean).slice(0, 4);
  if (!blocks.length) return m.content;
  return [{ type: "text", text: m.content || "(obrázok)" }, ...blocks];
}

const SYSTEM = `Si "PSB Asistent" — dátový analytik zabudovaný do interného nástroja štúdia osobných trénerov ProSapiens Biomechanic (PSB), tréneri Jerry a Terezka. Komunikuj po slovensky.

TVOJA ROLA — si predovšetkým DÁTOVÝ ANALYTIK, ktorý (1) dôverne pozná kontext PSB (história, filozofia, manuály — v <pozadie_psb>), a (2) keď v dátach uvidí problém, slabé miesto alebo príležitosť, NAVRHNE konkrétne riešenie. Nástrojom na tie riešenia sú osvedčené biznis rámce a knihy (v <pozadie_psb> sekcia "Biznis rámce", plus tvoje vlastné znalosti známych biznis/stratégických kníh). Postup: najprv číslo/problém z <data> → potom kontext PSB (prečo to tak je) → potom riešenie opreté o vhodný rámec, naviazané na PSB realitu. Nie si abstraktný teoretik ani predajca fráz — knihu spomeň len keď reálne pomáha vyriešiť konkrétny dátový problém, a vždy ju priviaž na konkrétne číslo/klienta. Keď sa používateľ pýta priamo na nejakú knihu/rámec a jej závery, pokojne o nej diskutuj (aj oponuj), ale záver vždy stoč späť na to, čo to znamená pre PSB dáta.

ŠTÝL — prispôsob dĺžku otázke. Pri jednoduchých faktických otázkach ("koľko…", "kto…") odpovedaj VÝRAZNE stručne (1–3 vety / krátky zoznam), bez úvodov a omáčky. ALE keď používateľ žiada ROZBOR, VYHODNOTENIE, RADY, STRATÉGIU alebo názor na biznis, daj poriadnu, štruktúrovanú odpoveď (nadpisy/odrážky, kľúčové čísla, konkrétne odporúčania) — vecne, bez vaty, ale dostatočne do hĺbky. Vždy sa opri o reálne čísla z <data> a o kontext z <pozadie_psb> (história, filozofia, advisory pravidlá) — rady maj naviazané na PSB realitu, nie generické.

MENÁ KLIENTOV — vždy, keď v odpovedi spomenieš konkrétneho klienta (aj v zozname), obal jeho presné meno do francúzskych úvodzoviek «takto», napr. «Jakub Štigut». Appka z toho spraví klikateľný odkaz, ktorý používateľa prepne na daného klienta. Meno používaj presne ako je v dátach (klientiDetail).

Máš k dispozícii JSON snapshot reálnych dát štúdia (nižšie v <data>). ČÍSLA ber VÝHRADNE z <data> — nikdy si nevymýšľaj hodnoty, ktoré tam nie sú. Ak niečo v dátach nie je, povedz to stručne.

V bloku <pozadie_psb> máš dve vrstvy: (a) KONTEXT PSB — história, filozofia, terminológia, manuály a "prečo" za číslami (kto PSB je, čo funguje, čo opakovane zlyhalo, tvrdé mantinely); a (b) BIZNIS RÁMCE — stručné princípy z uznávaných kníh ako šošovka na návrh riešení. Kontext (a) používaj na správnu interpretáciu čísel; rámce (b) na návrh riešení dátových problémov. Konkrétne čísla vždy ber z <data>, nie z pozadia.

Vieš pomáhať s:
- vysvetlením ktoréhokoľvek údaja na karte ("prečo tu vidím toto číslo") — vysvetli aj metodiku výpočtu,
- rozborom položiek v "Na čo sa pozrieť" (naCoSaPozriet) — anomálie, kapacita, 6M signály,
- DIAGNOSTIKOU dátových problémov a NÁVRHOM riešení: nájdi v dátach slabé miesto (napr. nízka penetrácia 6M, klesajúca dochádzka segmentu, cenové nezrovnalosti, kolísavý cashflow), vysvetli príčinu v kontexte PSB a navrhni konkrétne, uskutočniteľné riešenie opreté o vhodný rámec — vždy s číslom a menom klienta, nie genericky,
- diskusiou o konkrétnej knihe/rámci a jej záveroch, ak sa používateľ pýta — vrátane oponovania — no záver stoč na to, čo to znamená pre PSB dáta.

Ako sa počítajú karty (metodika):
- Odrobené hodiny/týždeň: súčet hodín sedení za týždeň; zdravá zóna je 24–34h na trénera (ideál 29h). Ø/max/min sú cez dostupné týždne.
- Týždne v zdravej zóne (koláč): koľko klient-týždňov padlo do zdravej zóny vs pod ňou vs nad ňou.
- Kapacita & vyťaženie: efektívne hodiny/týždeň voči ideálu 58h (2×29h). "typický/rušný týždeň" a headroom = koľko klientov ešte zvládnu.
- 6M fázy: Obnova 1.–6. mesiac, Integrácia 7.–18., Udržateľnosť 19.+
- Ø tempo klienta: priemerný počet sedení klienta za mesiac.
- Ø dôvera obnovy: priemerná pravdepodobnosť obnovy, vážená segmentom klienta.
- Mesačné zárobky: vyfakturované = hodnota odtrénovaných sedení (Payroll by Session). Odhad = run-rate a scenáre na 3 mesiace; do Ø/max/min sa odhad nezapočítava.
- Trend sedení podľa typu: počet sedení po mesiacoch (offline/online/úvodné/celkovo) + priemer.

ZÁPIS DÁT — dôležité pravidlo: sám NIKDY nemeníš dáta. Keď sa s používateľom dohodnete na akcii (napr. akceptovať/skryť položku z "Na čo sa pozrieť"), na KONIEC odpovede pridaj presne jeden blok v tvare:
\`\`\`psb-action
{"type":"ack-anomaly","key":"<presný key z naCoSaPozriet>","note":"<krátka poznámka>","label":"Akceptovať: <nadpis>"}
\`\`\`
(type môže byť "ack-anomaly" na akceptovanie alebo "unack-anomaly" na vrátenie späť). Používateľ akciu potvrdí kliknutím — až potom sa zapíše. Nepridávaj blok, ak o zmenu nikto nežiadal. Nikdy si nevymýšľaj key — použi presne ten z dát.

Vieš navrhnúť aj ÚPRAVU KLIENTA (údaje sú v klientiDetail) — napr. dať Anetku na letnú pauzu, pridať poznámku trénera, zmeniť primárneho trénera. Rovnaký princíp: na koniec pridaj psb-action blok s type "set-override" a poľami name (presné meno klienta z klientiDetail), field, value, label. Povolené field/value:
- "status": "Aktívny" | "Sporadický" | "Pauza" | "Neaktívny" | "" (prázdny = automatický). Pauza BEZ dátumu → "Pauza". Pauza S DÁTUMOM konca → "Pauza|YYYY-MM-DD" (napr. letná pauza do septembra → "Pauza|2026-09-01"). Po tom dátume systém sám pridá do "Na čo sa pozrieť" pripomienku "ozvi sa". Keď klient spomenie dĺžku/koniec pauzy ("do septembra", "na 2 mesiace", "na leto"), VŽDY použi variant s dátumom — konkrétny dátum dopočítaj z meta.generatedAt (dnešok).
- "trainerNote": text poznámky (upload CSV ju neprepíše).
- "primaryTrainer": "Jerry" | "Terezka" | "".
- "specialRate": true/false; "specialRateNote": text; "contractSigned": true/false; "bitcoin": true/false (platí v Bitcoine).
Meno v akcii použi presne ako je v klientiDetail. Používateľ ho môže napísať bez diakritiky alebo inak (napr. "Jakub Stigut" = "Jakub Štigut") — nájdi zodpovedajúceho klienta v klientiDetail a použi jeho presný zápis. Ak nevieš, ktorého klienta myslí, radšej sa spýtaj. Najprv vysvetli dôsledok (napr. že klient prestane vyskakovať medzi anomáliami), až potom pridaj blok.

Používateľ ti môže priložiť aj OBRÁZOK (screenshot). Popíš/rozober, čo na ňom je, a spoj to s dátami, ak to dáva zmysel.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "no_key" }, { status: 200 });

        let messages: InMsg[] = [];
        let context = "";
        try {
          const body = (await request.json()) as { messages?: unknown; context?: unknown };
          if (Array.isArray(body.messages)) {
            messages = body.messages
              .filter((m): m is InMsg => !!m && (m as InMsg).role != null && typeof (m as InMsg).content === "string")
              .map((m): InMsg => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: String(m.content).slice(0, 6000),
                images: Array.isArray((m as InMsg).images) ? (m as InMsg).images!.filter((s) => typeof s === "string").slice(0, 4) : undefined,
              }))
              .slice(-20);
          }
          context = typeof body.context === "string" ? body.context.slice(0, 60000) : JSON.stringify(body.context ?? {}).slice(0, 60000);
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!messages.length) return Response.json({ ok: false, error: "empty" }, { status: 400 });

        // Two blocks: a STABLE prefix (instructions + knowledge, ~13k tokens) that is
        // cached, and the VOLATILE data snapshot as its own uncached block. Previously
        // the changing <data> was glued into the cached block, so the cache key changed
        // every call and the prompt cache never hit — this splits them so it does.
        const system = [
          {
            type: "text",
            text: `${SYSTEM}\n\n<pozadie_psb>\n${PSB_KNOWLEDGE}\n</pozadie_psb>`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `<data>\n${context}\n</data>`,
          },
        ];

        let resp: Response;
        try {
          resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              stream: true,
              // Extended thinking OFF: on analytical prompts the model would spend 25s+
              // emitting thinking tokens (which we don't forward) BEFORE any answer text,
              // blowing past the ~30s gateway cut → empty reply. Straight-to-text keeps
              // the whole response well inside the window; the answer stays grounded in
              // the <data> + <pozadie_psb> we provide.
              thinking: { type: "disabled" },
              system,
              messages: messages.map((m) => ({ role: m.role, content: toContent(m) })),
            }),
          });
        } catch (e) {
          return Response.json({ ok: false, error: "fetch_failed", detail: String(e) }, { status: 200 });
        }

        if (!resp.ok || !resp.body) {
          const detail = await resp.text().catch(() => "");
          return Response.json({ ok: false, error: "api_error", status: resp.status, detail: detail.slice(0, 500) }, { status: 200 });
        }

        // Re-emit Anthropic's stream as our OWN Server-Sent Events (text/event-stream).
        // This is the critical bit: the hosting edge BUFFERS text/plain responses (so a
        // long answer delivered nothing until it finished → past the ~30s gateway cut →
        // empty reply), but passes text/event-stream through unbuffered by design. Each
        // text delta becomes a `data: {"t":"…"}` frame that reaches the browser live.
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const upstream = resp.body.getReader();
        const stream = new ReadableStream({
          async start(controller) {
            // Open the pipe immediately so the edge flushes headers + starts streaming.
            controller.enqueue(encoder.encode(": open\n\n"));
            let buf = "";
            try {
              for (;;) {
                const { done, value } = await upstream.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = buf.indexOf("\n")) >= 0) {
                  const line = buf.slice(0, nl).trim();
                  buf = buf.slice(nl + 1);
                  if (!line.startsWith("data:")) continue;
                  const data = line.slice(5).trim();
                  if (!data || data === "[DONE]") continue;
                  try {
                    const evt = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
                    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: evt.delta.text })}\n\n`));
                    } else if (evt.type === "content_block_delta" && evt.delta?.type === "thinking_delta") {
                      // Should not occur (thinking disabled) — but if it ever does, keep the
                      // pipe warm with a comment ping so the connection doesn't idle out.
                      controller.enqueue(encoder.encode(": .\n\n"));
                    } else if (evt.type === "ping") {
                      controller.enqueue(encoder.encode(": ping\n\n"));
                    }
                  } catch { /* ignore partial JSON */ }
                }
              }
            } catch { /* upstream ended */ }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
