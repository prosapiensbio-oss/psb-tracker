import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1500;

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

const SYSTEM = `Si "PSB Asistent" — dátový analytik zabudovaný do interného nástroja štúdia osobných trénerov ProSapiens Biomechanic (PSB), tréneri Jerry a Terezka. Komunikuj po slovensky, stručne, vecne a priateľsky. Používaj terminológiu štúdia.

Máš k dispozícii JSON snapshot reálnych dát štúdia (nižšie v <data>). Odpovedaj VÝHRADNE z týchto dát — nikdy si nevymýšľaj čísla, ktoré tam nie sú. Ak niečo v dátach nie je, povedz to a navrhni, čo by používateľ mohol nahrať alebo kde to nájde.

Vieš pomáhať s:
- vysvetlením ktoréhokoľvek údaja na karte ("prečo tu vidím toto číslo") — vysvetli aj metodiku výpočtu,
- rozborom položiek v "Na čo sa pozrieť" (naCoSaPozriet) — anomálie, kapacita, 6M signály,
- odporúčaniami na zlepšenie dát alebo prevádzky štúdia.

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
- "status": "Aktívny" | "Sporadický" | "Pauza" | "Neaktívny" | "" (prázdny reťazec = späť na automatický výpočet). Letná pauza → "Pauza".
- "trainerNote": text poznámky (upload CSV ju neprepíše).
- "primaryTrainer": "Jerry" | "Terezka" | "".
- "specialRate": true/false; "specialRateNote": text; "contractSigned": true/false.
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

        const system = [
          {
            type: "text",
            text: `${SYSTEM}\n\n<data>\n${context}\n</data>`,
            cache_control: { type: "ephemeral" },
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
              system,
              messages: messages.map((m) => ({ role: m.role, content: toContent(m) })),
            }),
          });
        } catch (e) {
          return Response.json({ ok: false, error: "fetch_failed", detail: String(e) }, { status: 200 });
        }

        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          return Response.json({ ok: false, error: "api_error", status: resp.status, detail: detail.slice(0, 500) }, { status: 200 });
        }

        const json = (await resp.json()) as { content?: { type: string; text?: string }[] };
        const reply = (json.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("\n").trim();
        return Response.json({ ok: true, reply });
      },
    },
  },
});
