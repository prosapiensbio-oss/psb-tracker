import { createFileRoute } from "@tanstack/react-router";
import { terazPraha } from "../lib/psb/cas";

import { audit } from "../lib/psb/audit.server";
import { bindings } from "../lib/bindings.server";
import { FORMULAR } from "../lib/psb/anamnezaFormular";
import { UKAZKA_KLIENT, jeUkazka } from "../lib/psb/ukazka";
import { podlaTokenu, ulozKlienta } from "../lib/psb/anamneza.server";
import { strankaHtml } from "../lib/psb/anamnezaStranka";

/**
 * ANAMNÉZA PRE KLIENTA — verejná stránka za tokenom.
 *
 * Jerry, 30. 9. 2026: „klient musí mať max do 6 otázok, ideálne nejaké 3 —
 * v úvodnej správe posielame aj video na YouTube a 60 % si ho nepozrie."
 * Preto je tu naozaj len bezpečnostný minimálny súbor: čo ho privádza,
 * a podľa toho buď bolesť s červenými vlajkami, alebo cieľ. Zvyšok
 * anamnézy vypĺňa tréner pri tréningu.
 *
 * Bez prihlásenia, preto:
 *   • token je náhodných 14 znakov a nedá sa uhádnuť ani odvodiť z mena,
 *   • stránka je `noindex` a `no-store`,
 *   • v adrese nie je nič okrem tokenu — žiadne meno, žiadny mail,
 *   • odpovede idú do databázy ŠIFROVANÉ (`sifra.server.ts`),
 *   • súhlasy sa ukladajú NEŠIFROVANE: doklad o súhlase musí byť čitateľný
 *     aj vtedy, keby sa kľúč stratil.
 */

const hlavicky = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };

/** Krátka stránka na prípady, keď formulár ukázať nejde. */
const odkaz = (text: string, status: number) => new Response(
  `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens</title></head>
<body style="margin:0;background:#232b1c;color:#e8ead9;font:15px/1.6 Arial,Helvetica,sans-serif">
<div style="max-width:420px;margin:80px auto;padding:0 20px;text-align:center">${text}
<div style="margin-top:18px;font-size:12px;color:#8a9a72">ProSapiens Biomechanic · +420 702 090 289</div></div></body></html>`,
  { status, headers: hlavicky },
);

/** Deň a čas úvodného tréningu po česky — z kalendára, keď ho appka pozná. */
function popisUvodneho(zaciatok: string | null): string | null {
  if (!zaciatok) return null;
  const DNI = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  const d = new Date(`${zaciatok}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `${DNI[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}. v ${zaciatok.slice(11, 16)}`;
}

async function kontext(DB: import("@cloudflare/workers-types").D1Database, klient: string) {
  const fa = await DB.prepare("SELECT email, telefon FROM klient_fakturacia WHERE klient = ?1")
    .bind(klient).first<{ email: string | null; telefon: string | null }>();
  const u = await DB.prepare(
    "SELECT MIN(zaciatok) z FROM kal_udalosti WHERE zmizla_at IS NULL AND klient = ?1 AND typ IN ('trening','uvodny') AND zaciatok > ?2",
  ).bind(klient, terazPraha()).first<{ z: string | null }>();
  return { kontakt: { email: fa?.email, telefon: fa?.telefon }, uvodny: popisUvodneho(u?.z || null) };
}

export const Route = createFileRoute("/a/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!/^[A-Za-z0-9]{10,30}$/.test(token)) return odkaz("Tento odkaz neplatí.", 404);

        /**
         * UKÁŽKA — formulár s vymyslenými dátami, nič sa neukladá.
         *
         * Jerry, 3. 10. 2026: „v SMS pred úvodným je Vyplnit 3 otázky a to
         * nikam nevedie." Tlačidlo na ukážkovej stránke mierilo na token,
         * ktorý routa nepoznala, takže končilo na „Tento odkaz neplatí".
         */
        if (jeUkazka(token)) {
          return new Response(strankaHtml({
            formular: FORMULAR, klient: UKAZKA_KLIENT,
            kontakt: { email: "ukazka@prosapiens.cz", telefon: "+420 000 000 000", narodeniny: null },
            uvodny: "pátek 9. 10. v 9:00",
          }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
        }

        if (!DB || !ANAMNEZA_KLUC) return odkaz("Tento odkaz neplatí.", 404);

        const a = await podlaTokenu(DB, token, ANAMNEZA_KLUC);
        if (!a) return odkaz("Tento odkaz neplatí. Ozvěte se nám a pošleme vám nový.", 404);

        const k = await kontext(DB, a.klient);
        return new Response(strankaHtml({
          formular: FORMULAR, klient: a.klient, ...k,
          hotovo: !!a.klientVyplnilAt,
        }), { headers: hlavicky });
      },

      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!DB || !ANAMNEZA_KLUC || !/^[A-Za-z0-9]{10,30}$/.test(token)) return odkaz("Tento odkaz neplatí.", 404);

        const a = await podlaTokenu(DB, token, ANAMNEZA_KLUC);
        if (!a) return odkaz("Tento odkaz neplatí.", 404);

        const fd = await request.formData();
        const pole = (n: string) => fd.getAll(n).map((x) => String(x).slice(0, 2000)).filter((x) => x.trim());
        const jedno = (n: string) => (pole(n)[0] || "");

        // Bez oboch povinných súhlasov sa NEUKLADÁ nič — ani zdravotné
        // odpovede. Prehliadač ich síce vyžaduje, ale `required` je len
        // prosba; rozhoduje server.
        if (!jedno("suhlas_podmienky") || !jedno("suhlas_gdpr")) {
          const k = await kontext(DB, a.klient);
          return new Response(strankaHtml({
            formular: FORMULAR, klient: a.klient, ...k,
            chyba: "Bez souhlasu s podmínkami a se zpracováním údajů formulář odeslat nejde.",
          }), { status: 400, headers: hlavicky });
        }

        const odpovede: Record<string, unknown> = {};
        for (const s of FORMULAR.klient) {
          for (const o of s.otazky) {
            if (o.typ === "oblasti") {
              // Oblasť si nesie vlastnú silu — preto dvojica, nie dve polia.
              const vybrane = pole(o.id).map((oblast) => ({ oblast, sila: Number(jedno(`sila_${oblast}`)) || null }));
              if (vybrane.length) odpovede[o.id] = vybrane;
            } else if (o.typ === "jedna" || o.typ === "ano-nie") {
              const v = jedno(o.id);
              if (v) odpovede[o.id] = v;
              const popis = jedno(`${o.id}_popis`);
              if (popis) odpovede[`${o.id}_popis`] = popis;
            } else if (o.typ === "viac") {
              const v = pole(o.id);
              if (v.length) odpovede[o.id] = v;
            } else {
              const v = jedno(o.id);
              if (v) odpovede[o.id] = v;
            }
          }
        }

        const suhlasy = {
          podmienky: { dano: true, dokument: "https://www.prosapiens.cz/obchodni-podminky/" },
          gdpr: { dano: true, dokument: "https://www.prosapiens.cz/gdpr/", zdravotneUdaje: true, fotky: true },
          newsletter: !!jedno("suhlas_newsletter"),
          kedy: new Date().toISOString(),
          verziaFormulara: FORMULAR.verzia,
        };

        const ok = await ulozKlienta(DB, token, odpovede, suhlasy, ANAMNEZA_KLUC);
        if (!ok) return odkaz("Odeslání se nepodařilo. Zkuste to prosím znovu.", 500);

        // Do auditu ide LEN meno a čas — nikdy obsah odpovedí.
        await audit(DB, { action: "anamneza-klient", predmet: a.klient, actor: "klient" });

        const k = await kontext(DB, a.klient);
        return new Response(strankaHtml({ formular: FORMULAR, klient: a.klient, ...k, hotovo: true }), { headers: hlavicky });
      },
    },
  },
});
