import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../lib/psb/audit.server";
import { bindings } from "../lib/bindings.server";
import { dnesPraha } from "../lib/psb/cas";
import { setOverride } from "../lib/psb/db.server";
import { jeNahladTrenera } from "../lib/psb/verejnyOdkaz";
import { znenie } from "../lib/psb/zmluva6m";
import { kratkaZmluva, zmluvaNaPodpisHtml, zmluvaPodpisanaHtml } from "../lib/psb/zmluvaStranka";
import { oznacOtvorenie, pdfZmluvy, podlaTokenu, podpisKlienta, type ZmluvaRiadok } from "../lib/psb/zmluvy.server";

/**
 * ZMLUVA 6M PRE KLIENTA — verejná stránka za tokenom (10. 11. 2026).
 *
 * Bez prihlásenia, preto ako pri anamnéze: náhodný token, `noindex`,
 * `no-store`, v adrese nič okrem tokenu. Podpis sa odošle formulárom
 * (POST), server ho overí a presmeruje späť na tú istú adresu — tá už
 * ukáže podpísanú zmluvu a dá sa kedykoľvek otvoriť znova.
 */

const hlavicky = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
const html = (body: string, status = 200) => new Response(body, { status, headers: hlavicky });

function podpisana(z: ZmluvaRiadok, cerstvo: boolean): Response {
  const zn = znenie(z.verzia);
  if (!zn) return html(kratkaZmluva("Znění této smlouvy se nenašlo. Ozvi se nám prosím na info@prosapiens.cz."), 500);
  let suhlasy: { id: string; nazov: string; text: string }[] = [];
  try { suhlasy = JSON.parse(z.klient_suhlasy_json || "[]"); } catch { suhlasy = zn.pravidla; }
  return html(zmluvaPodpisanaHtml({
    znenie: zn, klient: z.klient, klientMeno: z.klient_meno || z.klient, klientPodpis: z.klient_podpis || "",
    klientAt: z.klient_at || "", suhlasy, poskytovatelPodpis: z.poskytovatel_podpis, poskytovatelAt: z.poskytovatel_at,
    autor: z.autor, odtlacok: z.odtlacok || "", cerstvo,
  }));
}

function naPodpis(z: ZmluvaRiadok, nahlad: boolean, chyba?: string): Response {
  const zn = znenie(z.verzia);
  if (!zn) return html(kratkaZmluva("Znění této smlouvy se nenašlo. Ozvi se nám prosím na info@prosapiens.cz."), 500);
  return html(zmluvaNaPodpisHtml({
    znenie: zn, klient: z.klient, poskytovatelPodpis: z.poskytovatel_podpis, poskytovatelAt: z.poskytovatel_at,
    autor: z.autor, dnes: dnesPraha(), nahlad, chyba,
  }), chyba ? 400 : 200);
}

export const Route = createFileRoute("/z/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database };
        if (!DB || !/^[A-Za-z0-9]{10,30}$/.test(token)) return html(kratkaZmluva("Tento odkaz neplatí."), 404);
        const z = await podlaTokenu(DB, token).catch(() => null);
        if (!z) return html(kratkaZmluva("Tento odkaz neplatí."), 404);
        const url = new URL(request.url);
        // Zmluva z DocuSeal (pred Kokpitom) — podpísané PDF, nič na podpis.
        if (z.zdroj === "docuseal") {
          const pdf = await pdfZmluvy(DB, z.id).catch(() => null);
          if (!pdf) return html(kratkaZmluva("PDF této smlouvy se nenašlo."), 404);
          return new Response(pdf as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="smlouva-6M.pdf"`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
        }
        if (z.stav === "podpisana") return podpisana(z, url.searchParams.get("hotovo") === "1");
        if (z.stav === "zrusena") return html(kratkaZmluva("Tento odkaz už neplatí — poslali jsme ti novější. Kdyby nic nepřišlo, ozvi se nám."), 410);
        const nahlad = jeNahladTrenera(url);
        if (!nahlad) await oznacOtvorenie(DB, token);
        return naPodpis(z, nahlad);
      },
      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database };
        if (!DB || !/^[A-Za-z0-9]{10,30}$/.test(token)) return html(kratkaZmluva("Tento odkaz neplatí."), 404);
        const z = await podlaTokenu(DB, token).catch(() => null);
        if (!z) return html(kratkaZmluva("Tento odkaz neplatí."), 404);
        if (jeNahladTrenera(new URL(request.url))) return naPodpis(z, true, "V náhledu se podepsat nedá.");

        const fd = await request.formData().catch(() => null);
        if (!fd) return naPodpis(z, false, "Formulář se nepodařilo přečíst, zkus to prosím znovu.");
        const zaskrtnute = new Set<string>();
        for (const [k, v] of fd.entries()) if (k.startsWith("pravidlo_") && String(v) === "1") zaskrtnute.add(k.slice(9));
        const vysledok = await podpisKlienta(DB, z, {
          meno: String(fd.get("meno") || ""),
          podpis: String(fd.get("podpis") || ""),
          tahy: Number(fd.get("tahy") || 0),
          zaskrtnute,
          ip: request.headers.get("cf-connecting-ip") || "",
          ua: request.headers.get("user-agent") || "",
        }).catch((e) => ({ ok: false as const, error: `Uložení se nepodařilo (${String((e as Error)?.message || e).slice(0, 120)}). Zkus to prosím znovu.` }));
        if (!vysledok.ok) {
          // Podpísaná medzitým (dvojklik) — ukáž podpísanú, nie chybu.
          const znova = await podlaTokenu(DB, token).catch(() => null);
          if (znova?.stav === "podpisana") return podpisana(znova, true);
          return naPodpis(z, false, vysledok.error);
        }
        // Zmluva sa priradí k profilu: tá istá značka, ktorú doteraz Jerry
        // odškrtával ručne. Neúspech tu podpis nezruší — zmluva je uložená
        // a karta Zmluvy ju ukáže; značku sa dá zapnúť ručne.
        await setOverride(DB, z.klient, "contractSigned", true).catch(() => false);
        await DB.prepare("INSERT INTO client_notes (id, client_name, note, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
          .bind(crypto.randomUUID(), z.klient, "Klient podepsal smlouvu 6M (Podmínky spolupráce) přes odkaz z Kokpitu.", "klient", new Date().toISOString())
          .run().catch(() => undefined);
        await audit(DB, { action: "zmluva-podpisana", predmet: z.klient, neu: { id: z.id, verzia: z.verzia }, actor: "klient" });
        return new Response(null, { status: 303, headers: { location: `/z/${encodeURIComponent(token)}?hotovo=1`, "cache-control": "no-store" } });
      },
    },
  },
});
