import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Prepis zošita hotovostných platieb z fotky.
//
// Hotovosť sa v PSB zapisuje rukou do zošita a doteraz nemala ako doraziť do
// appky — chýbala tak časť nákladov aj časť výplat. Fotka do Jarvisa síce
// funguje, ale odpoveď v chate sa nedá skontrolovať riadok po riadku ani
// potvrdiť; ide o peniaze, takže to potrebuje ten istý dvojkrok ako Fio:
// najprv NÁHĽAD na opravu, až potom zápis.
//
// Prečo samostatná trasa a nie chat: tu sa nechce rozhovor, chce sa JSON.
// Model dostane jedinú úlohu a formát, ktorý sa dá vykresliť do tabuľky.
//
// Rukopis a čísla: model má povedané, aby pri neistom znaku radšej priznal
// neistotu než tipoval. Zle prečítaná číslica v peniazoch je horšia než
// prázdne políčko — prázdne políčko človek doplní, zlé číslo prejde.

const MODEL = "claude-opus-5";

type Riadok = {
  datum: string;
  popis: string;
  suma: number;
  poznamka?: string;
  isty?: boolean;
};

const INSTRUKCIA = `Na obrázku je ručne písaný zošit hotovostných platieb štúdia osobných trénerov.
Každý riadok má dátum, meno alebo popis, sumu so znamienkom a niekedy poznámku v zátvorke.

Prepíš KAŽDÝ čitateľný riadok do JSON. Odpovedz IBA JSON poľom, bez akéhokoľvek textu okolo,
bez markdown blokov.

Formát jedného prvku:
{"datum":"YYYY-MM-DD","popis":"Terka","suma":-5000,"poznamka":"výplata","isty":true}

Pravidlá:
- "suma" je číslo. Mínus = peniaze odišli, plus = peniaze prišli. Znamienko ber z papiera.
- "datum": v zošite býva len deň a mesiac (napr. "14.5."). Rok doplň podľa poľa ROK nižšie;
  ak by mesiac vyšiel do budúcnosti oproti poslednému riadku, použi predchádzajúci rok.
- "popis" je meno alebo dôvod tak, ako je napísaný. Neprekladaj, neopravuj mená.
- "poznamka" je len to, čo je v zátvorke. Keď zátvorka nie je, pole vynechaj.
- "isty": false, keď si ktorýmkoľvek znakom v dátume alebo v sume nie si istý
  (prepisované číslo, rozmazané, nejednoznačné). RADŠEJ false než tipovať —
  človek to potom skontroluje. true len keď je riadok jednoznačný.
- Prečiarknuté a opravené čísla: ber platnú (opravenú) hodnotu a daj "isty": false.
- Riadok, ktorý sa nedá prečítať vôbec, vynechaj.
- Nepridávaj nič, čo na papieri nie je. Nedopočítavaj súčty.`;

function imageBlock(url: string) {
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) return null;
  const media_type = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  if (m[2].length > 7_000_000) return null;
  return { type: "image", source: { type: "base64", media_type, data: m[2] } };
}

export const Route = createFileRoute("/api/zosit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Chýba API kľúč." }, { status: 500 });

        let b: { obrazky?: string[]; rok?: string };
        try { b = (await request.json()) as typeof b; } catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }
        const bloky = (b.obrazky || []).map(imageBlock).filter(Boolean).slice(0, 4);
        if (!bloky.length) return Response.json({ ok: false, error: "Žiadny použiteľný obrázok (max 5 MB, JPG/PNG)." }, { status: 400 });

        const rok = /^\d{4}$/.test(b.rok || "") ? b.rok : String(new Date().getUTCFullYear());
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 8000,
            messages: [{
              role: "user",
              content: [{ type: "text", text: `${INSTRUKCIA}\n\nROK: ${rok}` }, ...bloky],
            }],
          }),
        });
        if (!resp.ok) {
          const t = await resp.text();
          return Response.json({ ok: false, error: `Model odmietol (${resp.status}): ${t.slice(0, 200)}` }, { status: 502 });
        }
        const j = (await resp.json()) as { content?: { type: string; text?: string }[] };
        const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");

        // Model občas obalí JSON do ```json — vyberie sa prvé pole v texte.
        const m = /\[[\s\S]*\]/.exec(text);
        if (!m) return Response.json({ ok: false, error: "Z odpovede sa nedal prečítať zoznam riadkov.", surove: text.slice(0, 400) }, { status: 422 });
        let riadky: Riadok[];
        try { riadky = JSON.parse(m[0]) as Riadok[]; } catch {
          return Response.json({ ok: false, error: "Odpoveď nebola platný JSON.", surove: text.slice(0, 400) }, { status: 422 });
        }
        // Poistka proti nezmyslom z modelu: bez dátumu alebo sumy riadok nemá
        // čo robiť v peniazoch, aj keby ho model vrátil.
        const cisté = riadky
          .filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.datum)) && Number.isFinite(Number(r.suma)) && Number(r.suma) !== 0)
          .map((r) => ({
            datum: String(r.datum),
            popis: String(r.popis || "").slice(0, 120),
            suma: Math.round(Number(r.suma)),
            poznamka: r.poznamka ? String(r.poznamka).slice(0, 120) : "",
            isty: r.isty !== false,
          }))
          // Chronologicky, ako je to na papieri. Náhľad sa číta proti zošitu
          // riadok po riadku — obrátené poradie sťažuje presne tú kontrolu,
          // kvôli ktorej náhľad existuje. (Hotové tabuľky v appke majú
          // najnovšie hore; tu je to naopak zámerne.)
          .sort((a, b2) => a.datum.localeCompare(b2.datum));
        return Response.json({ ok: true, riadky: cisté, zahodenych: riadky.length - cisté.length });
      },
    },
  },
});
