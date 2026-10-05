import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { dnesPraha } from "../../lib/psb/cas";
import { jeDenFotenia, jePohlad, klucFotky, MAX_BAJTOV, suhlasFotky } from "../../lib/psb/kartoteka";
import { odsifruj, odsifrujBajty, zasifruj, zasifrujBajty } from "../../lib/psb/sifra.server";

/**
 * KARTOTÉKA FOTIEK DRŽANIA TELA (5. 10. 2026).
 *
 *   GET  ?klient=X  → zoznam fotiek, poznámky k foteniam, či je súhlas
 *   GET  ?id=X      → samotná fotka (rozšifrovaná, len prihlásenému)
 *   POST multipart  → nahratie: klient, den, pohlad, subor (+ suhlasOsobne)
 *   POST { akcia: "poznamka" | "pohlad" | "zmaz" }
 *
 * Fotka je v R2 (väzba STORAGE) ZAŠIFROVANÁ kľúčom anamnézy; bez neho sa
 * nedá ani nahrať, ani pozrieť — radšej nič než čitateľná fotka tela
 * v úložisku. Nikde sa nezverejňuje: neexistuje verejná adresa, každé
 * čítanie ide cez tento endpoint a prihlásenie.
 */

type Env = {
  DB?: import("@cloudflare/workers-types").D1Database;
  STORAGE?: import("@cloudflare/workers-types").R2Bucket;
  ANAMNEZA_KLUC?: string;
};
const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Súhlas z anamnézy — posledný riadok klienta. Doklad o súhlase je nešifrovaný zámerne. */
async function maSuhlas(DB: NonNullable<Env["DB"]>, klient: string): Promise<boolean> {
  const r = await DB.prepare(
    "SELECT suhlasy_json FROM anamnezy WHERE klient = ?1 AND suhlasy_json IS NOT NULL ORDER BY COALESCE(klient_vyplnil_at, vytvorene_at) DESC LIMIT 1",
  ).bind(klient).first<{ suhlasy_json: string }>().catch(() => null);
  if (!r?.suhlasy_json) return false;
  try { return suhlasFotky(JSON.parse(r.suhlasy_json)); } catch { return false; }
}

export const Route = createFileRoute("/api/fotky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB) return chyba("no_db", 500);
        const q = new URL(request.url).searchParams;

        const id = kus(q.get("id"), 40);
        if (id) {
          if (!STORAGE) return chyba("Úložisko fotiek (R2) nie je zapnuté.", 503);
          if (!ANAMNEZA_KLUC) return chyba("Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC).", 503);
          const r = await DB.prepare("SELECT kluc FROM klient_fotky WHERE id = ?1").bind(id).first<{ kluc: string }>();
          if (!r) return chyba("Taká fotka nie je.", 404);
          const obj = await STORAGE.get(r.kluc);
          if (!obj) return chyba("Fotka v úložisku chýba.", 404);
          try {
            const cista = await odsifrujBajty(await obj.arrayBuffer(), ANAMNEZA_KLUC);
            return new Response(cista as unknown as ArrayBuffer, {
              headers: {
                "content-type": "image/jpeg",
                // Fotka sa pod rovnakým id nemení. Len do prehliadača toho,
                // kto je prihlásený — nikdy do zdieľanej keše.
                "cache-control": "private, max-age=3600",
                "x-robots-tag": "noindex",
              },
            });
          } catch (e) {
            return chyba(`Fotku sa nepodarilo rozšifrovať: ${String(e).slice(0, 120)}`, 500);
          }
        }

        const klient = kus(q.get("klient"), 120);
        if (!klient) return chyba("chýba klient");
        const [fotky, poznamky, suhlas] = await Promise.all([
          DB.prepare("SELECT id, klient, den, pohlad, sirka, vyska, suhlas, kto, created_at FROM klient_fotky WHERE klient = ?1 ORDER BY den DESC, created_at")
            .bind(klient).all().then((x) => x.results as Record<string, unknown>[]).catch(() => null),
          DB.prepare("SELECT den, text FROM klient_fotky_poznamky WHERE klient = ?1").bind(klient).all()
            .then((x) => x.results as { den: string; text: string }[]).catch(() => null),
          maSuhlas(DB, klient),
        ]);
        // Tabuľky chýbajú = migrácia neprebehla. Povedať to, nie tváriť sa prázdne.
        if (fotky === null || poznamky === null) return chyba("Kartotéka nemá tabuľky (migrácia 0098).", 500);
        const poz: Record<string, string> = {};
        if (ANAMNEZA_KLUC) {
          for (const p of poznamky) {
            try { poz[p.den] = await odsifruj(p.text, ANAMNEZA_KLUC); } catch { poz[p.den] = "(poznámku sa nepodarilo rozšifrovať)"; }
          }
        }
        return Response.json({
          ok: true,
          fotky: fotky.map((f) => ({
            id: f.id, klient: f.klient, den: f.den, pohlad: f.pohlad, sirka: f.sirka, vyska: f.vyska,
            suhlas: f.suhlas, kto: f.kto, createdAt: f.created_at,
          })),
          poznamky: poz,
          suhlas,
          ulozisko: !!STORAGE,
          sifra: !!ANAMNEZA_KLUC,
        }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, STORAGE, ANAMNEZA_KLUC } = bindings() as Env;
        if (!DB) return chyba("no_db", 500);
        if (!ANAMNEZA_KLUC) return chyba("Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC).", 503);
        const kto = (await currentUser(request)) || "";

        // ── NAHRATIE FOTKY ──
        if ((request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
          if (!STORAGE) return chyba("Úložisko fotiek (R2) nie je zapnuté.", 503);
          const form = await request.formData();
          const klient = kus(form.get("klient"), 120);
          const den = kus(form.get("den"), 10);
          const pohlad = kus(form.get("pohlad"), 10);
          const subor = form.get("subor");
          if (!klient) return chyba("chýba klient");
          if (!jeDenFotenia(den, dnesPraha())) return chyba("Deň fotenia nesedí (RRRR-MM-DD, nie v budúcnosti).");
          if (!jePohlad(pohlad)) return chyba("Neznámy pohľad.");
          if (!subor || typeof subor === "string") return chyba("Chýba súbor.");
          const f = subor as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
          if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return chyba(`Toto nie je fotka (${f.type || "neznámy typ"}).`);
          if (f.size > MAX_BAJTOV) return chyba("Fotka je priveľká — nad 6 MB.");

          // Súhlas: z anamnézy, alebo ho tréner potvrdí za klienta, ktorý
          // súhlasil osobne. Bez jedného z nich sa fotka neuloží.
          const zAnamnezy = await maSuhlas(DB, klient);
          const osobne = form.get("suhlasOsobne") === "1";
          if (!zAnamnezy && !osobne) {
            return chyba("Klient nemá v anamnéze súhlas s fotkami. Potvrď, že súhlasil osobne, alebo mu pošli anamnézu.", 403);
          }

          const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          const kluc = klucFotky(id, den);
          const sifra = await zasifrujBajty(await f.arrayBuffer(), ANAMNEZA_KLUC);
          await STORAGE.put(kluc, sifra, { httpMetadata: { contentType: "application/octet-stream" } });
          const sirka = Math.max(0, Math.round(Number(form.get("sirka")) || 0)) || null;
          const vyska = Math.max(0, Math.round(Number(form.get("vyska")) || 0)) || null;
          try {
            await DB.prepare(
              "INSERT INTO klient_fotky (id, klient, den, pohlad, kluc, sirka, vyska, bajty, suhlas, kto, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            ).bind(id, klient, den, pohlad, kluc, sirka, vyska, sifra.length, zAnamnezy ? "anamneza" : "osobne", kto, new Date().toISOString()).run();
          } catch (e) {
            // Bez riadku by fotka v úložisku visela a nikto by o nej nevedel.
            await STORAGE.delete(kluc).catch(() => {});
            return chyba(`Fotka sa nezapísala: ${String(e).slice(0, 200)}`, 500);
          }
          await audit(DB, { action: "fotka-nahrata", predmet: klient, neu: { den, pohlad, suhlas: zAnamnezy ? "anamneza" : "osobne" }, actor: kto || undefined });
          return Response.json({ ok: true, id });
        }

        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

        if (b.akcia === "poznamka") {
          const klient = kus(b.klient, 120);
          const den = kus(b.den, 10);
          if (!klient || !jeDenFotenia(den, dnesPraha())) return chyba("chýba klient alebo deň");
          const text = String(b.text ?? "").trim().slice(0, 4000);
          if (!text) {
            await DB.prepare("DELETE FROM klient_fotky_poznamky WHERE klient = ?1 AND den = ?2").bind(klient, den).run();
            return Response.json({ ok: true });
          }
          await DB.prepare(
            `INSERT INTO klient_fotky_poznamky (klient, den, text, kto, updated_at) VALUES (?1,?2,?3,?4,?5)
             ON CONFLICT(klient, den) DO UPDATE SET text = excluded.text, kto = excluded.kto, updated_at = excluded.updated_at`,
          ).bind(klient, den, await zasifruj(text, ANAMNEZA_KLUC), kto, new Date().toISOString()).run();
          return Response.json({ ok: true });
        }

        const id = kus(b.id, 40);
        if (!id) return chyba("chýba id");

        if (b.akcia === "pohlad") {
          if (!jePohlad(b.pohlad)) return chyba("Neznámy pohľad.");
          const r = await DB.prepare("UPDATE klient_fotky SET pohlad = ?2 WHERE id = ?1").bind(id, b.pohlad).run();
          if (!r.meta.changes) return chyba("Taká fotka nie je.", 404);
          return Response.json({ ok: true });
        }

        if (b.akcia === "zmaz") {
          const r = await DB.prepare("SELECT klient, den, pohlad, kluc FROM klient_fotky WHERE id = ?1").bind(id)
            .first<{ klient: string; den: string; pohlad: string; kluc: string }>();
          if (!r) return chyba("Taká fotka nie je.", 404);
          if (STORAGE) await STORAGE.delete(r.kluc);
          await DB.prepare("DELETE FROM klient_fotky WHERE id = ?1").bind(id).run();
          await audit(DB, { action: "fotka-zmazana", predmet: r.klient, old: { den: r.den, pohlad: r.pohlad }, actor: kto || undefined });
          return Response.json({ ok: true });
        }

        return chyba("neznáma akcia");
      },
    },
  },
});
