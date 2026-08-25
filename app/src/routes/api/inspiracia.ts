import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";

/**
 * Čo sa dá zistiť o cudzom príspevku z holého odkazu.
 *
 * PREČO TO IDE, KEĎ oEmbED NEJDE
 *
 * Instagram odmieta oEmbed bez schválenia od Mety a adresu videa v stránke
 * nemá vôbec. Otvorené metadáta pre náhľady (open graph) ale vydá — sú na to,
 * aby si každá appka vedela vykresliť náhľad odkazu. Overené 24. 8. 2026:
 * popis v plnom znení, autor, počet lajkov a komentárov, dátum a titulný záber.
 *
 * ČO TO NEVIE
 *
 * Titulný záber je PRVÁ SEKUNDA, nie priebeh. Na otázku „ako pohli kamerou"
 * neodpovie — na to treba záznam obrazovky. Appka to musí povedať, nie
 * predstierať, že video videla.
 */

const UA = "facebookexternalhit/1.1";

function og(html: string, kluc: string): string {
  const m = new RegExp(`property="${kluc}"\\s+content="([^"]*)"`).exec(html)
    || new RegExp(`${kluc}"\\s+content="([^"]*)"`).exec(html);
  if (!m) return "";
  // Metadáta sú HTML-escapované; bez rozkódovania by v texte boli &quot; a &#x161;
  return m[1]
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** „125 likes, 439 comments - synviiai on August 21, 2026: …" → čísla a dátum. */
function ciselka(popis: string) {
  const l = /([\d\s,.]+)\s*likes?/i.exec(popis);
  const k = /([\d\s,.]+)\s*comments?/i.exec(popis);
  const d = /on ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(popis);
  const cislo = (s?: string) => (s ? Number(s.replace(/[\s,.]/g, "")) || null : null);
  return { lajky: cislo(l?.[1]), komentare: cislo(k?.[1]), datum: d?.[1] || "" };
}

export const Route = createFileRoute("/api/inspiracia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        let url = "";
        try { url = String(((await request.json()) as { url?: unknown }).url || ""); }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        if (!/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) {
          return Response.json({ ok: false, error: "Zatiaľ viem čítať len odkazy z Instagramu." }, { status: 400 });
        }

        try {
          const r = await fetch(url, {
            headers: { "user-agent": UA, "accept-language": "sk,cs;q=0.9,en;q=0.8" },
            signal: AbortSignal.timeout(12000),
          });
          if (!r.ok) return Response.json({ ok: false, error: `Instagram vrátil HTTP ${r.status}.` }, { status: 502 });
          const html = await r.text();

          const titulok = og(html, "og:title");
          const popisRaw = og(html, "og:description");
          if (!titulok && !popisRaw) {
            // Dôležité rozlíšenie: prázdno neznamená „príspevok neexistuje",
            // ale „Instagram nám tentokrát metadáta nedal".
            return Response.json({
              ok: false,
              error: "Instagram tentokrát metadáta nevydal — skús to o chvíľu, alebo prilož snímku obrazovky.",
            }, { status: 502 });
          }

          // V titulku je „Meno on Instagram: \"popis\"" — popis je za dvojbodkou.
          const uvodz = titulok.indexOf(': "');
          const autor = uvodz > 0 ? titulok.slice(0, uvodz).replace(/ on Instagram$/, "") : "";
          const popis = uvodz > 0 ? titulok.slice(uvodz + 3).replace(/"$/, "") : titulok;
          const { lajky, komentare, datum } = ciselka(popisRaw);

          // Titulný záber. Adresa je podpísaná a vyprší, preto sa sťahuje hneď
          // a posiela ako dáta — odložená adresa by o hodinu nefungovala.
          let obrazok = "";
          const imgUrl = og(html, "og:image");
          if (imgUrl) {
            try {
              const ri = await fetch(imgUrl, { signal: AbortSignal.timeout(12000) });
              const typ = ri.headers.get("content-type") || "";
              if (ri.ok && typ.startsWith("image/")) {
                const buf = new Uint8Array(await ri.arrayBuffer());
                // Strop je kvôli Jarvisovi (5 MB po dekódovaní) aj kvôli pamäti
                // workera; náhľad z Instagramu má bežne 30 kB.
                if (buf.byteLength <= 3_000_000) {
                  let bin = "";
                  for (let i = 0; i < buf.length; i += 8192) {
                    bin += String.fromCharCode(...buf.subarray(i, i + 8192));
                  }
                  obrazok = `data:${typ.split(";")[0]};base64,${btoa(bin)}`;
                }
              }
            } catch { /* bez náhľadu sa dá žiť, bez popisu nie */ }
          }

          return Response.json({ ok: true, autor, popis, lajky, komentare, datum, obrazok });
        } catch (e) {
          return Response.json({ ok: false, error: `Nepodarilo sa načítať: ${String(e).slice(0, 120)}` }, { status: 502 });
        }
      },
    },
  },
});
