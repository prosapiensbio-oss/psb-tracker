import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { dnesPraha } from "../../lib/psb/cas";
import { jeDenFotenia, jePohlad, klucFotky, MAX_BAJTOV, MAX_VIDEO_BAJTOV, POROVNANIE, suhlasFotky, TYPY_VIDEA, VIDEO } from "../../lib/psb/kartoteka";
import { odsifruj, odsifrujBajty, zasifruj, zasifrujBajty } from "../../lib/psb/sifra.server";
import { novyToken } from "../../lib/psb/anamneza.server";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";
import { vyplneneCisla } from "../../lib/psb/fotkyStranka";

/**
 * KARTOTÉKA FOTIEK DRŽANIA TELA (5. 10. 2026).
 *
 *   GET  ?klient=X  → zoznam fotiek, poznámky k foteniam, či je súhlas
 *   GET  ?id=X      → samotná fotka (rozšifrovaná, len prihlásenému); &ciste=1 = porovnanie bez čiar a kresby;
 *                     &zdroj=<tok> = pôvodná fotka z editora (nebola v kartotéke) — na návrat k úprave
 *   GET  ?edit=X    → uložený stav editora k porovnaniu (návrat k hotovému editu)
 *   POST multipart s „nahradit=<id>" → prepíše porovnanie (obrázok, čistá podoba, popis, stav editora)
 *   POST multipart  → nahratie: klient, den, pohlad, subor (+ suhlasOsobne)
 *                     pohlad „porovnanie" a „video" posiela editor (Workspace → Editor)
 *   POST { akcia: "poznamka" | "popis" | "pohlad" | "zmaz" }
 *   popis = text k jednej fotke (šifrovaný), pri nahratí aj v poli „popis"
 *   POST { akcia: "odkaz", klient, trener, fotky: [{id, cisla}], sprava, dalej } → odkaz `/f/<token>` pre klienta
 *   POST { akcia: "zrus-odkaz", token }
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
          const r = await DB.prepare("SELECT kluc, typ, kluc_ciste FROM klient_fotky WHERE id = ?1").bind(id).first<{ kluc: string; typ: string | null; kluc_ciste: string | null }>();
          if (!r) return chyba("Taká fotka nie je.", 404);
          const zdroj = q.get("zdroj") || "";
          if (zdroj && !/^[a-z0-9]{6,16}$/.test(zdroj)) return chyba("zlý zdroj");
          const obj = await STORAGE.get(zdroj ? `${r.kluc}-zdroj-${zdroj}` : q.get("ciste") === "1" && r.kluc_ciste ? r.kluc_ciste : r.kluc);
          if (!obj) return chyba("Fotka v úložisku chýba.", 404);
          try {
            const cista = await odsifrujBajty(await obj.arrayBuffer(), ANAMNEZA_KLUC);
            return new Response(cista as unknown as ArrayBuffer, {
              headers: {
                "content-type": r.typ || "image/jpeg",
                // Len do prehliadača toho, kto je prihlásený — nikdy do
                // zdieľanej keše — a vždy sa spýtať servera: zmazaná fotka
                // by inak z keše išla ešte hodinu (overené 5. 10. 2026).
                "cache-control": "private, no-cache",
                "x-robots-tag": "noindex",
              },
            });
          } catch (e) {
            return chyba(`Fotku sa nepodarilo rozšifrovať: ${String(e).slice(0, 120)}`, 500);
          }
        }

        // Stav editora k porovnaniu — „✎ upraviť" v kartotéke.
        const editId = kus(q.get("edit"), 40);
        if (editId) {
          if (!ANAMNEZA_KLUC) return chyba("Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC).", 503);
          const r = await DB.prepare("SELECT klient, den, edit_json, popis FROM klient_fotky WHERE id = ?1").bind(editId)
            .first<{ klient: string; den: string; edit_json: string | null; popis: string | null }>();
          if (!r) return chyba("Také porovnanie nie je.", 404);
          if (!r.edit_json) return chyba("Toto porovnanie vzniklo skôr, než editor ukladal svoj stav — upraviť sa nedá, len urobiť nové.", 404);
          try {
            const edit = JSON.parse(await odsifruj(r.edit_json, ANAMNEZA_KLUC));
            const popis = r.popis ? await odsifruj(r.popis, ANAMNEZA_KLUC).catch(() => "") : "";
            return Response.json({ ok: true, id: editId, klient: r.klient, den: r.den, popis, edit }, { headers: { "cache-control": "no-store" } });
          } catch (e) {
            return chyba(`Stav editora sa nepodarilo prečítať: ${String(e).slice(0, 120)}`, 500);
          }
        }

        const klient = kus(q.get("klient"), 120);
        if (!klient) return chyba("chýba klient");
        const [fotky, poznamky, suhlas] = await Promise.all([
          DB.prepare("SELECT id, klient, den, pohlad, sirka, vyska, suhlas, kto, created_at, typ, popis, kluc_ciste, edit_json IS NOT NULL AS ma_edit FROM klient_fotky WHERE klient = ?1 ORDER BY den DESC, created_at")
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
        // Poslané odkazy a odpovede klienta (fotky_odkazy, fotky_odpovede — migrácia 0113).
        const odkazyRiadky = (await DB.prepare("SELECT token, fotky_json, trener, kto, vytvorene_at, plati_do, zrusene_at, otvorene_at, suhlas, suhlas_at FROM fotky_odkazy WHERE klient = ?1 ORDER BY vytvorene_at DESC LIMIT 30")
          .bind(klient).all().then((x) => x.results as Record<string, unknown>[]).catch(() => [])) || [];
        const odpovedeRiadky = (await DB.prepare("SELECT id, token, text, vytvorene_at FROM fotky_odpovede WHERE klient = ?1 ORDER BY vytvorene_at DESC LIMIT 60")
          .bind(klient).all().then((x) => x.results as Record<string, unknown>[]).catch(() => [])) || [];
        const odpovede: { id: number; token: string; text: string; kedy: string }[] = [];
        for (const r of odpovedeRiadky) {
          let text = "(odpoveď sa nepodarilo rozšifrovať)";
          if (ANAMNEZA_KLUC) { try { text = await odsifruj(String(r.text), ANAMNEZA_KLUC); } catch { /* nechá hlášku */ } }
          odpovede.push({ id: Number(r.id), token: String(r.token), text, kedy: String(r.vytvorene_at) });
        }
        const origin = new URL(request.url).origin;
        const odkazy = odkazyRiadky.map((r) => {
          let pocet = 0;
          try { pocet = (JSON.parse(String(r.fotky_json)) as unknown[]).length; } catch { /* 0 */ }
          return {
            token: String(r.token), url: verejnyOdkaz(`/f/${r.token}`, origin), pocet,
            trener: r.trener ?? null, kto: r.kto ?? null, vytvorene: String(r.vytvorene_at), platiDo: String(r.plati_do),
            zrusene: r.zrusene_at ?? null, otvorene: r.otvorene_at ?? null, suhlas: r.suhlas ?? null, suhlasKedy: r.suhlas_at ?? null,
          };
        });

        const popisy: Record<string, string> = {};
        if (ANAMNEZA_KLUC) {
          for (const f of fotky) {
            if (!f.popis) continue;
            try { popisy[String(f.id)] = await odsifruj(String(f.popis), ANAMNEZA_KLUC); } catch { popisy[String(f.id)] = "(popis sa nepodarilo rozšifrovať)"; }
          }
        }
        return Response.json({
          ok: true,
          fotky: fotky.map((f) => ({
            id: f.id, klient: f.klient, den: f.den, pohlad: f.pohlad, sirka: f.sirka, vyska: f.vyska,
            suhlas: f.suhlas, kto: f.kto, createdAt: f.created_at, typ: f.typ ?? null, popis: popisy[String(f.id)] || "",
            maCiste: !!f.kluc_ciste,
            maEdit: !!f.ma_edit,
          })),
          poznamky: poz,
          odkazy,
          odpovede,
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
          // Video len ako výstup editora videa (strih) — nie súbor z telefónu.
          const typ = (f.type || "").split(";")[0];
          if (pohlad === VIDEO) {
            if (!TYPY_VIDEA.includes(typ)) return chyba(`Toto nie je video (${f.type || "neznámy typ"}).`);
            if (f.size > MAX_VIDEO_BAJTOV) return chyba("Video je priveľké — nad 40 MB. Skráť strih alebo ulož pri vyššej rýchlosti.");
          } else {
            if (!/^image\/(jpeg|png|webp)$/.test(typ)) return chyba(`Toto nie je fotka (${f.type || "neznámy typ"}).`);
            if (f.size > MAX_BAJTOV) return chyba("Fotka je priveľká — nad 6 MB.");
          }

          // Súhlas: z anamnézy, alebo ho tréner potvrdí za klienta, ktorý
          // súhlasil osobne. Bez jedného z nich sa fotka neuloží.
          const zAnamnezy = await maSuhlas(DB, klient);
          const osobne = form.get("suhlasOsobne") === "1";
          if (!zAnamnezy && !osobne) {
            return chyba("Klient nemá v anamnéze súhlas s fotkami. Potvrď, že súhlasil osobne, alebo mu pošli anamnézu.", 403);
          }

          // Prepísanie hotového porovnania (návrat k editu) — to isté id, ten istý
          // kľúč v R2; odkazy klientovi tak ukážu novú verziu.
          const nahradit = kus(form.get("nahradit"), 40);
          let povodny: { id: string; kluc: string; kluc_ciste: string | null } | null = null;
          if (nahradit) {
            povodny = await DB.prepare("SELECT id, kluc, kluc_ciste FROM klient_fotky WHERE id = ?1 AND klient = ?2 AND pohlad = 'porovnanie'")
              .bind(nahradit, klient).first<{ id: string; kluc: string; kluc_ciste: string | null }>();
            if (!povodny) return chyba("Porovnanie, ktoré upravuješ, už v kartotéke nie je — ulož ho ako nové.", 404);
          }
          const id = povodny?.id || `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          const kluc = povodny?.kluc || klucFotky(id, den);
          /**
           * ZÁLOHA PRED PREPÍSANÍM (15. 10. 2026). Radkovi Balážovi prepísalo
           * druhé uloženie prvý záber a R2 nemá verzie — obrázok bol preč.
           * Predošlá podoba (obrázok, čistá podoba, popis a stav editora) sa
           * odloží o úroveň späť pod `<kluc>-predtym*`; zmaže sa s porovnaním.
           */
          if (povodny) {
            const stary = await STORAGE.get(povodny.kluc).catch(() => null);
            if (stary) await STORAGE.put(`${povodny.kluc}-predtym`, await stary.arrayBuffer(), { httpMetadata: { contentType: "application/octet-stream" } });
            const staryCisty = povodny.kluc_ciste ? await STORAGE.get(povodny.kluc_ciste).catch(() => null) : null;
            if (staryCisty) await STORAGE.put(`${povodny.kluc}-predtym-ciste`, await staryCisty.arrayBuffer(), { httpMetadata: { contentType: "application/octet-stream" } });
            const meta = await DB.prepare("SELECT popis, edit_json FROM klient_fotky WHERE id = ?1").bind(povodny.id).first<{ popis: string | null; edit_json: string | null }>();
            await STORAGE.put(`${povodny.kluc}-predtym-meta`, JSON.stringify({ ...meta, kedy: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
          }
          const sifra = await zasifrujBajty(await f.arrayBuffer(), ANAMNEZA_KLUC);
          await STORAGE.put(kluc, sifra, { httpMetadata: { contentType: "application/octet-stream" } });
          // Čistá podoba porovnania (bez čiar a kresby) — len pri porovnaní z editora.
          const ciste = form.get("subor_ciste");
          let klucCiste: string | null = null;
          if (pohlad === POROVNANIE && ciste && typeof ciste !== "string") {
            const c = ciste as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
            if (/^image\/(jpeg|png|webp)$/.test((c.type || "").split(";")[0]) && c.size <= MAX_BAJTOV) {
              klucCiste = `${kluc}-ciste`;
              await STORAGE.put(klucCiste, await zasifrujBajty(await c.arrayBuffer(), ANAMNEZA_KLUC), { httpMetadata: { contentType: "application/octet-stream" } });
            }
          }
          const popisText = String(form.get("popis") ?? "").trim().slice(0, 4000);
          const popis = popisText ? await zasifruj(popisText, ANAMNEZA_KLUC) : null;

          // Stav editora + fotky, ktoré neboli z kartotéky („zdroj:N" → adresa v R2).
          let editJson: string | null = null;
          if (pohlad === POROVNANIE) {
            let edit = String(form.get("edit") ?? "");
            if (edit && edit.length < 400_000) {
              for (let n = 0; n < 2; n++) {
                const z = form.get(`zdroj${n}`);
                if (!z || typeof z === "string" || !edit.includes(`zdroj:${n}`)) continue;
                const zf = z as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
                if (!/^image\/(jpeg|png|webp)$/.test((zf.type || "").split(";")[0]) || zf.size > MAX_BAJTOV) continue;
                const tok = Math.random().toString(36).slice(2, 12).padEnd(8, "0");
                await STORAGE.put(`${kluc}-zdroj-${tok}`, await zasifrujBajty(await zf.arrayBuffer(), ANAMNEZA_KLUC), { httpMetadata: { contentType: "application/octet-stream" } });
                edit = edit.split(`zdroj:${n}`).join(`/api/fotky?id=${id}&zdroj=${tok}`);
              }
              editJson = await zasifruj(edit, ANAMNEZA_KLUC);
              // Pôvodné fotky, na ktoré nový stav už neodkazuje, preč.
              const zoznam = await STORAGE.list({ prefix: `${kluc}-zdroj-` }).catch(() => null);
              for (const o of zoznam?.objects || []) {
                const t = o.key.slice(`${kluc}-zdroj-`.length);
                if (!edit.includes(`zdroj=${t}`)) await STORAGE.delete(o.key).catch(() => {});
              }
            }
          }

          if (povodny) {
            // Čistá podoba: nová, alebo už žiadna (porovnanie bez čiar).
            if (!klucCiste && povodny.kluc_ciste) await STORAGE.delete(povodny.kluc_ciste).catch(() => {});
            const sirkaN = Math.max(0, Math.round(Number(form.get("sirka")) || 0)) || null;
            const vyskaN = Math.max(0, Math.round(Number(form.get("vyska")) || 0)) || null;
            await DB.prepare("UPDATE klient_fotky SET sirka = ?2, vyska = ?3, bajty = ?4, popis = ?5, kluc_ciste = ?6, edit_json = ?7, kto = ?8 WHERE id = ?1")
              .bind(id, sirkaN, vyskaN, sifra.length, popis, klucCiste, editJson, kto).run();
            await audit(DB, { action: "fotka-prepisana", predmet: klient, neu: { id }, actor: kto || undefined });
            return Response.json({ ok: true, id, prepisane: true });
          }
          const sirka = Math.max(0, Math.round(Number(form.get("sirka")) || 0)) || null;
          const vyska = Math.max(0, Math.round(Number(form.get("vyska")) || 0)) || null;
          try {
            await DB.prepare(
              "INSERT INTO klient_fotky (id, klient, den, pohlad, kluc, sirka, vyska, bajty, suhlas, kto, created_at, typ, popis, kluc_ciste, edit_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            ).bind(id, klient, den, pohlad, kluc, sirka, vyska, sifra.length, zAnamnezy ? "anamneza" : "osobne", kto, new Date().toISOString(), typ === "image/jpeg" ? null : typ, popis, klucCiste, editJson).run();
          } catch (e) {
            // Bez riadku by fotka v úložisku visela a nikto by o nej nevedel.
            await STORAGE.delete(kluc).catch(() => {});
            if (klucCiste) await STORAGE.delete(klucCiste).catch(() => {});
            return chyba(`Fotka sa nezapísala: ${String(e).slice(0, 200)}`, 500);
          }
          await audit(DB, { action: "fotka-nahrata", predmet: klient, neu: { den, pohlad, suhlas: zAnamnezy ? "anamneza" : "osobne" }, actor: kto || undefined });
          return Response.json({ ok: true, id });
        }

        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

        // ── ODKAZ S FOTKAMI PRE KLIENTA ──
        if (b.akcia === "odkaz") {
          const klient = kus(b.klient, 120);
          if (!klient) return chyba("chýba klient");
          const vstup = Array.isArray(b.fotky) ? (b.fotky as { id?: unknown; cisla?: unknown }[]).slice(0, 12) : [];
          const ids = vstup.map((f) => kus(f?.id, 40)).filter(Boolean);
          if (!ids.length) return chyba("Vyber aspoň jednu fotku.");
          // Poslať sa dá len to, čo v kartotéke tohto klienta naozaj je.
          const maju = ((await DB.prepare(`SELECT id FROM klient_fotky WHERE klient = ?1 AND id IN (${ids.map((_, i) => `?${i + 2}`).join(",")})`)
            .bind(klient, ...ids).all()).results as { id: string }[]).map((r) => r.id);
          const fotky = vstup
            .map((f) => ({ id: kus(f?.id, 40), cisla: vyplneneCisla(Array.isArray(f?.cisla) ? (f.cisla as never[]).slice(0, 6) : []).map((c) => ({ nazov: c.nazov.slice(0, 40), pred: c.pred.slice(0, 20), po: c.po.slice(0, 20) })) }))
            .filter((f) => maju.includes(f.id));
          if (!fotky.length) return chyba("Vybrané fotky v kartotéke nie sú.");
          const sprava = String(b.sprava ?? "").trim().slice(0, 2000);
          const dalej = (Array.isArray(b.dalej) ? (b.dalej as unknown[]) : String(b.dalej ?? "").split("\n"))
            .map((x) => String(x ?? "").trim().slice(0, 300)).filter(Boolean).slice(0, 8).join("\n");
          const token = novyToken(14);
          const teraz = new Date();
          const platiDo = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date(teraz.getTime() + 30 * 86400000));
          await DB.prepare(
            "INSERT INTO fotky_odkazy (token, klient, fotky_json, sprava, dalej, kto, trener, vytvorene_at, plati_do) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
          ).bind(token, klient, JSON.stringify(fotky), sprava ? await zasifruj(sprava, ANAMNEZA_KLUC) : null, dalej ? await zasifruj(dalej, ANAMNEZA_KLUC) : null,
            kto, kus(b.trener, 40) || null, teraz.toISOString(), platiDo).run();
          await audit(DB, { action: "fotky-odkaz", predmet: klient, neu: { fotky: fotky.length, platiDo }, actor: kto || undefined });
          const origin = new URL(request.url).origin;
          return Response.json({ ok: true, token, url: verejnyOdkaz(`/f/${token}`, origin), nahlad: `${origin}/f/${token}?nahlad=1`, platiDo });
        }

        if (b.akcia === "zrus-odkaz") {
          const token = kus(b.token, 40);
          const r = await DB.prepare("UPDATE fotky_odkazy SET zrusene_at = ?2 WHERE token = ?1 AND zrusene_at IS NULL").bind(token, new Date().toISOString()).run();
          if (!r.meta.changes) return chyba("Taký odkaz nie je (alebo je už zrušený).", 404);
          await audit(DB, { action: "fotky-odkaz-zruseny", predmet: token, actor: kto || undefined });
          return Response.json({ ok: true });
        }

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

        /**
         * PRESUNÚŤ FOTENIE NA INÝ DEŇ (Jerry, 14. 10. 2026 — Radek Baláž).
         * Fotky z roku 2023 sa uložili s dňom nahratia, lebo dátum z EXIF sa
         * vtedy nečítal; v uložených fotkách EXIF už nie je (zmenšenie ho
         * zahodí), takže deň sa dá opraviť len rukou. Presúva sa CELÉ fotenie
         * (všetky fotky klienta z toho dňa) aj s poznámkou, keď cieľový deň
         * vlastnú poznámku ešte nemá.
         */
        if (b.akcia === "presun-den") {
          const klient = kus(b.klient, 120);
          const z = kus(b.z, 10), na = kus(b.na, 10);
          if (!klient || !jeDenFotenia(z, "9999-12-31") || !jeDenFotenia(na, dnesPraha())) return chyba("Deň nesedí (RRRR-MM-DD, nie v budúcnosti).");
          if (z === na) return Response.json({ ok: true, presunute: 0 });
          const r = await DB.prepare("UPDATE klient_fotky SET den = ?3 WHERE klient = ?1 AND den = ?2").bind(klient, z, na).run();
          if (!r.meta.changes) return chyba("V ten deň tento klient fotky nemá.", 404);
          const cielMa = await DB.prepare("SELECT 1 x FROM klient_fotky_poznamky WHERE klient = ?1 AND den = ?2").bind(klient, na).first().catch(() => null);
          if (!cielMa) await DB.prepare("UPDATE klient_fotky_poznamky SET den = ?3 WHERE klient = ?1 AND den = ?2").bind(klient, z, na).run().catch(() => null);
          await audit(DB, { action: "fotky-presun-den", predmet: klient, old: z, neu: { den: na, fotiek: r.meta.changes }, actor: kto || undefined });
          return Response.json({ ok: true, presunute: r.meta.changes });
        }

        const id = kus(b.id, 40);
        if (!id) return chyba("chýba id");

        if (b.akcia === "popis") {
          const text = String(b.text ?? "").trim().slice(0, 4000);
          const r = await DB.prepare("UPDATE klient_fotky SET popis = ?2 WHERE id = ?1")
            .bind(id, text ? await zasifruj(text, ANAMNEZA_KLUC) : null).run();
          if (!r.meta.changes) return chyba("Taká fotka nie je.", 404);
          return Response.json({ ok: true });
        }

        if (b.akcia === "pohlad") {
          // Fotku tela nejde prerobiť na porovnanie či video (ani naopak).
          if (!jePohlad(b.pohlad) || b.pohlad === POROVNANIE || b.pohlad === VIDEO) return chyba("Neznámy pohľad.");
          const r = await DB.prepare("UPDATE klient_fotky SET pohlad = ?2 WHERE id = ?1 AND pohlad NOT IN ('porovnanie', 'video')").bind(id, b.pohlad).run();
          if (!r.meta.changes) return chyba("Taká fotka nie je.", 404);
          return Response.json({ ok: true });
        }

        if (b.akcia === "zmaz") {
          const r = await DB.prepare("SELECT klient, den, pohlad, kluc, kluc_ciste FROM klient_fotky WHERE id = ?1").bind(id)
            .first<{ klient: string; den: string; pohlad: string; kluc: string; kluc_ciste: string | null }>();
          if (!r) return chyba("Taká fotka nie je.", 404);
          if (STORAGE) await STORAGE.delete(r.kluc);
          if (STORAGE && r.kluc_ciste) await STORAGE.delete(r.kluc_ciste);
          if (STORAGE) {
            for (const prefix of [`${r.kluc}-zdroj-`, `${r.kluc}-predtym`]) {
              const zoz = await STORAGE.list({ prefix }).catch(() => null);
              for (const o of zoz?.objects || []) await STORAGE.delete(o.key).catch(() => {});
            }
          }
          await DB.prepare("DELETE FROM klient_fotky WHERE id = ?1").bind(id).run();
          await audit(DB, { action: "fotka-zmazana", predmet: r.klient, old: { den: r.den, pohlad: r.pohlad }, actor: kto || undefined });
          return Response.json({ ok: true });
        }

        return chyba("neznáma akcia");
      },
    },
  },
});
