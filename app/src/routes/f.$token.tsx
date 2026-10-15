import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { audit } from "../lib/psb/audit.server";
import { dniZEditu, fotkyNeplati, fotkyStranka, parZEditu, type CisloKarty, type KartaFotky } from "../lib/psb/fotkyStranka";
import { TRENERI } from "../lib/psb/mailFaktury";
import { pushTrenerovi } from "../lib/psb/ponukaTerminov.server";
import { odsifruj, odsifrujBajty, zasifruj } from "../lib/psb/sifra.server";

/**
 * FOTKY PRE KLIENTA — `/f/<token>` (Jerry, 12. 10. 2026).
 *
 *   GET              stránka s porovnaniami, správou trénera a odpoveďou
 *   GET ?foto=<id>   samotná fotka (&ciste=1 bez čiar a kresby, &stahnout=1 na stiahnutie)
 *   POST akcia=odpoved  správa klienta → šifrovane do fotky_odpovede + push trénerovi
 *   POST akcia=suhlas   súhlas so zverejnením porovnania bez tváre (ano | ne)
 *
 * BEZPEČNOSŤ: token je náhodných 14 znakov, stránka je noindex a bez keše.
 * Fotka sa vydá LEN ak je v zozname tohto odkazu a patrí tomu istému
 * klientovi — token nedáva prístup ku kartotéke, len k tomu, čo tréner poslal.
 * Odkaz platí do `plati_do` a tréner ho môže zrušiť.
 */

type Env = {
  DB?: import("@cloudflare/workers-types").D1Database;
  STORAGE?: import("@cloudflare/workers-types").R2Bucket;
  ANAMNEZA_KLUC?: string;
};
type Odkaz = {
  token: string; klient: string; fotky_json: string; sprava: string | null; dalej: string | null; trener: string | null;
  vytvorene_at: string; plati_do: string; zrusene_at: string | null; otvorene_at: string | null; suhlas: string | null;
};
type PolozkaOdkazu = { id: string; cisla?: CisloKarty[] };

const HLAVICKY = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" };
const html = (telo: string, status = 200) => new Response(telo, { status, headers: HLAVICKY });
const platnyTvar = (t: string) => /^[A-Za-z0-9]{10,30}$/.test(t);
const dnes = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
const polozky = (o: Odkaz): PolozkaOdkazu[] => {
  try { return (JSON.parse(o.fotky_json) as PolozkaOdkazu[]).filter((p) => p && typeof p.id === "string"); } catch { return []; }
};

async function nacitaj(DB: NonNullable<Env["DB"]>, token: string): Promise<{ o: Odkaz } | { neplati: "neexistuje" | "zruseny" | "vyprsal" }> {
  const o = await DB.prepare("SELECT token, klient, fotky_json, sprava, dalej, trener, vytvorene_at, plati_do, zrusene_at, otvorene_at, suhlas FROM fotky_odkazy WHERE token = ?1")
    .bind(token).first<Odkaz>().catch(() => null);
  if (!o) return { neplati: "neexistuje" };
  if (o.zrusene_at) return { neplati: "zruseny" };
  if (o.plati_do < dnes()) return { neplati: "vyprsal" };
  return { o };
}

export const Route = createFileRoute("/f/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB || !platnyTvar(token)) return html(fotkyNeplati("neexistuje"), 404);
        const x = await nacitaj(DB, token);
        if ("neplati" in x) return html(fotkyNeplati(x.neplati), 404);
        const o = x.o;
        const q = new URL(request.url).searchParams;
        const zoznam = polozky(o);

        // ── Samotná fotka ──
        const fotoId = q.get("foto");
        if (fotoId) {
          if (!STORAGE || !ANAMNEZA_KLUC || !zoznam.some((p) => p.id === fotoId)) return new Response("Nenalezeno", { status: 404 });
          const r = await DB.prepare("SELECT kluc, kluc_ciste, typ FROM klient_fotky WHERE id = ?1 AND klient = ?2")
            .bind(fotoId, o.klient).first<{ kluc: string; kluc_ciste: string | null; typ: string | null }>();
          if (!r) return new Response("Nenalezeno", { status: 404 });
          const obj = await STORAGE.get(q.get("ciste") === "1" && r.kluc_ciste ? r.kluc_ciste : r.kluc);
          if (!obj) return new Response("Nenalezeno", { status: 404 });
          const cista = await odsifrujBajty(await obj.arrayBuffer(), ANAMNEZA_KLUC);
          return new Response(cista as unknown as ArrayBuffer, {
            headers: {
              "content-type": r.typ || "image/jpeg",
              "cache-control": "private, no-cache",
              "x-robots-tag": "noindex",
              ...(q.get("stahnout") === "1" ? { "content-disposition": `attachment; filename="srovnani-${fotoId}.jpg"` } : {}),
            },
          });
        }

        // ── Stránka ──
        const rozbal = async (s: string | null) => {
          if (!s || !ANAMNEZA_KLUC) return "";
          try { return await odsifruj(s, ANAMNEZA_KLUC); } catch { return ""; }
        };
        const ids = zoznam.map((p) => p.id);
        const riadky = ids.length
          ? ((await DB.prepare(`SELECT id, popis, kluc_ciste, edit_json FROM klient_fotky WHERE klient = ?1 AND id IN (${ids.map((_, i) => `?${i + 2}`).join(",")})`)
            .bind(o.klient, ...ids).all()).results as { id: string; popis: string | null; kluc_ciste: string | null; edit_json: string | null }[])
          : [];
        const karty: KartaFotky[] = [];
        for (const p of zoznam) {
          const r = riadky.find((y) => y.id === p.id);
          if (!r) continue; // fotku medzitým zmazal — zo stránky zmizne
          // Dni PŘEDTÍM/POTOM zo stavu editora — z nich nadpis „N týdnů práce".
          const edit = await rozbal(r.edit_json);
          // Pár fotiek → porovnania z tých istých fotiek sa na stránke spoja do jednej karty.
          karty.push({ id: p.id, popis: await rozbal(r.popis), maCiste: !!r.kluc_ciste, cisla: p.cisla || [], dni: dniZEditu(edit), par: parZEditu(edit) });
        }
        const odpovede = ((await DB.prepare("SELECT vytvorene_at FROM fotky_odpovede WHERE token = ?1 ORDER BY vytvorene_at").bind(token).all()).results as { vytvorene_at: string }[])
          .map((r) => ({ kedy: r.vytvorene_at }));
        // Prvé otvorenie klientom — náhľad trénera (?nahlad=1) sa nepočíta.
        if (!o.otvorene_at && q.get("nahlad") !== "1") {
          await DB.prepare("UPDATE fotky_odkazy SET otvorene_at = ?2 WHERE token = ?1 AND otvorene_at IS NULL").bind(token, new Date().toISOString()).run().catch(() => {});
        }
        const hotovo = q.get("hotovo");
        const trener = TRENERI[o.trener || ""]?.krstne || o.trener || "";
        return html(fotkyStranka({
          token, trener,
          poslane: o.vytvorene_at.slice(0, 10), platiDo: o.plati_do,
          sprava: await rozbal(o.sprava),
          dalej: (await rozbal(o.dalej)).split("\n"),
          karty,
          suhlas: o.suhlas === "ano" || o.suhlas === "ne" ? o.suhlas : null,
          odpovede,
          hlaska: hotovo === "odpoved" ? "Díky, zpráva je odeslaná." : hotovo === "suhlas" ? "Díky, uloženo." : undefined,
          logoUrl: `${new URL(request.url).origin}/znacka-napis-tmava.svg`,
        }));
      },

      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, ANAMNEZA_KLUC } = bindings() as Env;
        const spat = (q = "") => new Response(null, { status: 303, headers: { location: `/f/${encodeURIComponent(token)}${q}`, "cache-control": "no-store" } });
        if (!DB || !platnyTvar(token)) return html(fotkyNeplati("neexistuje"), 404);
        const x = await nacitaj(DB, token);
        if ("neplati" in x) return html(fotkyNeplati(x.neplati), 404);
        const o = x.o;
        const f = await request.formData().catch(() => null);
        const akcia = String(f?.get("akcia") || "");

        if (akcia === "suhlas") {
          const hodnota = String(f?.get("hodnota") || "");
          if (hodnota !== "ano" && hodnota !== "ne") return spat();
          await DB.prepare("UPDATE fotky_odkazy SET suhlas = ?2, suhlas_at = ?3 WHERE token = ?1").bind(token, hodnota, new Date().toISOString()).run();
          // Doklad o súhlase nešifrovane — musí byť čitateľný aj bez kľúča.
          await audit(DB, { action: "fotky-suhlas", predmet: o.klient, neu: hodnota, actor: "klient" });
          return spat("?hotovo=suhlas");
        }

        if (akcia === "odpoved") {
          const text = String(f?.get("text") ?? "").trim().slice(0, 2000);
          if (!text || !ANAMNEZA_KLUC) return spat("#odpoved");
          // Strop proti zahlteniu: 20 správ na jeden odkaz.
          const pocet = await DB.prepare("SELECT COUNT(*) AS n FROM fotky_odpovede WHERE token = ?1").bind(token).first<{ n: number }>();
          if ((pocet?.n || 0) >= 20) return spat("#odpoved");
          await DB.prepare("INSERT INTO fotky_odpovede (token, klient, text, vytvorene_at) VALUES (?1, ?2, ?3, ?4)")
            .bind(token, o.klient, await zasifruj(text, ANAMNEZA_KLUC), new Date().toISOString()).run();
          await audit(DB, { action: "fotky-odpoved", predmet: o.klient, actor: "klient" });
          // Hneď aj na mobil trénerovi; notifikácia v Kokpite vznikne z registra.
          if (o.trener) {
            await pushTrenerovi(DB, o.trener, {
              titulok: `${o.klient} odpísal na fotky`,
              // Bez obsahu správy — notifikácia je vidno aj na zamknutom telefóne.
              text: "Odpoveď si prečítaj v Kokpite (notifikácie alebo profil → fotky).",
              url: "/#workspace",
              znacka: `fotky-${token}`,
            });
          }
          return spat("?hotovo=odpoved#odpoved");
        }
        return spat();
      },
    },
  },
});
