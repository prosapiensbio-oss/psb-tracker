import { createFileRoute } from "@tanstack/react-router";

import { audit, jeZamknuty, zamknuteMesiace } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { ZDVOJENIA_KLUC } from "../../lib/psb/zositZdvojenia";
import { vybaveneZdvojenia, zdvojeniaZoServera } from "../../lib/psb/zositZdvojenia.server";
import { oznacZosit, type HotovostVDb, type VkladVBanke } from "../../lib/psb/zositNahlad";
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
      /** Možné zdvojenia, na ktoré sa ešte nikto neodpovedal (`zositZdvojenia.ts`). */
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 503 });
        try {
          return Response.json({ ok: true, podozrenia: await zdvojeniaZoServera(DB) });
        } catch (e) {
          return Response.json({ ok: false, error: `Zdvojenia sa nedali overiť: ${String(e instanceof Error ? e.message : e)}` }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();

        let b: { obrazky?: string[]; rok?: string; akcia?: string; kluc?: string; odpoved?: string; zahodit?: string };
        try { b = (await request.json()) as typeof b; } catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }

        /**
         * ODPOVEĎ NA MOŽNÉ ZDVOJENIE. Zoznam sa počíta znova na serveri: platí
         * len dvojica, ktorá ešte naozaj je podozrivá, nie to, čo pošle obrazovka.
         *
         *  • „dve“ — nič sa nemení, len sa to už nepýta.
         *  • príjem — riadok sa spojí s ručnou platbou (`fio_id`), z nepriradených
         *    zmizne a druhá platba nevznikne. Suma platby sa nemení.
         *  • ostatné — riadok ide mimo P&L s poznámkou prečo. Nemaže sa: z obálky
         *    tie peniaze odišli raz a keď príde tá istá strana znova, náhľad ho
         *    musí spoznať, inak by sa zapísal tretíkrát.
         */
        if (b.akcia === "zdvojenie") {
          const { DB } = bindings();
          if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 503 });
          const p = (await zdvojeniaZoServera(DB)).find((x) => x.kluc === b.kluc);
          if (!p) return Response.json({ ok: false, error: "Táto otázka už neplatí — obnov stránku." }, { status: 409 });
          const kto = (await currentUser(request)) || "";
          const prikazy = [];
          if (b.odpoved === "ista") {
            if (p.druh === "prijem") {
              const zmena = await DB.prepare("UPDATE platby SET fio_id = ?1 WHERE id = ?2 AND fio_id IS NULL AND zrusene_at IS NULL")
                .bind(p.riadok.id, p.druhy.id).run();
              if (!zmena.meta.changes) return Response.json({ ok: false, error: "Platba sa medzitým zmenila — obnov stránku." }, { status: 409 });
            } else {
              const zahodit = p.druh === "dvaRiadky" && b.zahodit === p.druhy.id ? p.druhy : p.riadok;
              const ostava = zahodit === p.riadok ? p.druhy : p.riadok;
              const poznamka = `zdvojené s ${ostava.popis} ${ostava.suma} Kč z ${ostava.datum} · zo zošita`.slice(0, 400);
              prikazy.push(DB.prepare("UPDATE fio_transactions SET category = 'mimo', note = ?2, potvrdene_at = ?3, potvrdil = ?4 WHERE id = ?1")
                .bind(zahodit.id, poznamka, new Date().toISOString(), kto || null));
            }
          } else if (b.odpoved !== "dve") {
            return Response.json({ ok: false, error: "Neznáma odpoveď." }, { status: 400 });
          }
          const vybavene = [...new Set([...(await vybaveneZdvojenia(DB)), p.kluc])];
          prikazy.push(DB.prepare("INSERT INTO vzas_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(ZDVOJENIA_KLUC, JSON.stringify(vybavene)));
          await DB.batch(prikazy);
          await audit(DB, { action: "zosit-zdvojenie", predmet: p.kluc, neu: `${b.odpoved}: ${p.riadok.popis} ${p.riadok.suma} ↔ ${p.druhy.popis} ${p.druhy.suma}`, actor: kto });
          return Response.json({ ok: true });
        }

        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "Chýba API kľúč." }, { status: 500 });
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
        // Čo z toho už v Kokpite je — strana zošita nesie aj staré mesiace.
        // Bez tohto vyzerali zapísané a zaradené riadky z júna až augusta
        // ako nezaradené a zápis by ich vložil druhýkrát (viď zositNahlad.ts).
        const { DB } = bindings();
        let oznacene = cisté.map((x) => ({ ...x, uzMame: false, kategoriaVDb: "", kategoria: "", zamknuty: false }));
        /**
         * BEZ OVERENIA NIČ NOVÉ (21. 10. 2026). Kontrola „toto už v Kokpite
         * je“ a „tento vklad už má banka“ padala pri chybe na prázdny zoznam
         * — a prázdny zoznam znamená „nič z toho nemáme“: každý riadok strany
         * by sa ukázal ako nový a zápis by ho vložil druhýkrát. Keď sa to
         * overiť nedá, náhľad sa nevráti vôbec. Pravidlá kategórií sú len
         * návrh, tie smú chýbať.
         */
        const neoverene = "Nepodarilo sa overiť, čo z tejto strany už v Kokpite je — riadky by sa mohli zapísať dvakrát. Skús to znova o chvíľu.";
        if (!DB && cisté.length) return Response.json({ ok: false, error: neoverene }, { status: 503 });
        if (DB && cisté.length) {
          const od = new Date(Date.parse(`${cisté[0].datum}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
          const doDna = new Date(Date.parse(`${cisté[cisté.length - 1].datum}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
          let vDb: HotovostVDb[], vklady: VkladVBanke[];
          try {
            [vDb, vklady] = await Promise.all([
              DB.prepare("SELECT date, amount_czk, counterparty, category FROM fio_transactions WHERE typ = 'hotovosť' AND date BETWEEN ?1 AND ?2")
                .bind(od, doDna).all().then((x) => (x.results || []) as unknown as HotovostVDb[]),
              // Vklady hotovosti, ktoré už má BANKA. Presun na účet je v zošite
              // aj vo výpise — zapísať oboje by tie peniaze započítalo dvakrát.
              DB.prepare(`SELECT date, amount_czk, counterparty FROM fio_transactions
                           WHERE typ <> 'hotovosť' AND date BETWEEN ?1 AND ?2
                             AND (lower(counterparty) LIKE '%vklad%' OR lower(note) LIKE '%vklad hotovosti%')`)
                .bind(od, doDna).all().then((x) => (x.results || []) as unknown as VkladVBanke[]),
            ]);
          } catch {
            return Response.json({ ok: false, error: neoverene }, { status: 503 });
          }
          const [pr, zamky] = await Promise.all([
            DB.prepare("SELECT text_pattern, category FROM vzas_rules WHERE active = 1 ORDER BY priority").all()
              .then((x) => ((x.results || []) as { text_pattern: string; category: string }[]).map((y) => ({ vzor: String(y.text_pattern || ""), kategoria: String(y.category || "") })))
              .catch(() => []),
            zamknuteMesiace(DB),
          ]);
          oznacene = oznacZosit(cisté, vDb, pr, vklady).map((x) => ({ ...x, poznamka: x.poznamka || "", isty: x.isty !== false, zamknuty: jeZamknuty(zamky, x.datum) }));
        }
        return Response.json({ ok: true, riadky: oznacene, zahodenych: riadky.length - cisté.length });
      },
    },
  },
});
