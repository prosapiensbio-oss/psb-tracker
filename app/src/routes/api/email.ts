import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { emailPodlaId, konverzacia, vybavStarsie, nastavStav, preradEmail, ulozHlavicky, zapisOdoslany, znamiZDb, zoznamEmailov } from "../../lib/psb/email.server";
import type { EmailRiadok } from "../../lib/psb/email.server";
import { PORADIE_KATEGORII, maObsah } from "../../lib/psb/emailTriedenie";
import type { Kategoria } from "../../lib/psb/emailTriedenie";
import { stiahniSpravy, stiahniTela } from "../../lib/psb/imap";
import { telefonZTextu } from "../../lib/psb/mailDopyt";
import { adresyMailu } from "../../lib/psb/mime";
import { posliMail } from "../../lib/psb/smtp.server";
import { PODPISUJUCI, PREDVOLENY_PODPIS, odpovedHtml } from "../../lib/psb/emailSablona";
import { nastavenia } from "./mail-dopyty";

/**
 * KARTA EMAIL — schránka info@prosapiens.cz vo Workspace (12. 11. 2026).
 *
 *   GET                      → zoznam (hlavičky + stav práce) a kedy sa naposledy čítalo
 *   GET ?telo=<id>           → celý text jedného mailu zo schránky (označí prečítané)
 *   GET ?ludia=<id>          → rozhovor s tým človekom: maily, naše odpovede, faktúry, SMS, zmluvy
 *   POST { akcia: "stav", id, stav }            → precitane | vybavene | vratit
 *   POST { akcia: "prerad", id, kategoria?, klient? }
 *   POST { akcia: "odpovedz", id, komu, predmet, text, citat?, vybav? }
 *   POST { akcia: "dopyt", id }                 → zapíše odosielateľa do dopytov
 *   POST { akcia: "nacitaj" }                   → hlavičky za 30 dní (prvé otvorenie); staršie než týždeň ako vybavené
 *
 * Obsah mailov sa do databázy NEUKLADÁ (dohoda s Jerrym) — číta sa vždy
 * zo schránky, len na čítanie (`BODY.PEEK`). Odpoveď ide len na klik.
 */
const ns = { "cache-control": "no-store" };

const chyba = (e: unknown) => String((e as Error)?.message || e).slice(0, 300);

async function precitaj(DB: D1Database, kluc: string): Promise<Record<string, unknown> | null> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(kluc).first<{ value: string }>();
  try { return JSON.parse(JSON.parse(r?.value || '""') || "null"); } catch { return null; }
}

/** Telá viacerých správ jedným prihlásením (Dovecot po sérii prihlásení odmieta). */
async function tela(DB: D1Database, riadky: { uid: number; validity: string }[], maxZnakov?: number) {
  const n = await nastavenia(DB);
  if (!n.host || !n.user || !n.heslo) throw new Error("schránka nie je nastavená (Údaje → schránka)");
  const out = new Map<number, { text: string; komu: string; od: string; datum: string }>();
  const podlaValidity = new Map<string, number[]>();
  for (const r of riadky) podlaValidity.set(r.validity, [...(podlaValidity.get(r.validity) || []), r.uid]);
  for (const [validity, uids] of podlaValidity) {
    const v = await stiahniTela({ host: n.host, port: n.port, user: n.user, heslo: n.heslo, uids, validity, maxZnakov });
    for (const s of v.spravy) out.set(Number(s.uid), { text: s.text, komu: s.komu, od: s.od, datum: s.datum });
  }
  return out;
}

export const Route = createFileRoute("/api/email")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings() as { DB?: D1Database };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const url = new URL(request.url);
        const kto = (await currentUser(request)) || "";
        try {
          const teloId = url.searchParams.get("telo");
          if (teloId) {
            const e = await emailPodlaId(DB, teloId);
            if (!e) return Response.json({ ok: false, error: "Mail sa v Kokpite nenašiel." }, { status: 404 });
            const t = await tela(DB, [e], 20000);
            const s = t.get(e.uid);
            if (!s) return Response.json({ ok: false, error: "V schránke tento mail už nie je — niekto ho zmazal alebo ho server presunul do spamu. Daj Vybavené." }, { status: 404 });
            if (e.stav === "nove") await nastavStav(DB, e.id, "precitane", kto);
            return Response.json({ ok: true, text: s.text, komu: s.komu }, { headers: ns });
          }
          const ludiaId = url.searchParams.get("ludia");
          if (ludiaId) {
            const e = await emailPodlaId(DB, ludiaId);
            if (!e) return Response.json({ ok: false, error: "Mail sa v Kokpite nenašiel." }, { status: 404 });
            const bubliny = await konverzacia(DB, { mail: e.odMail, klient: e.klient });
            // Obsah len posledných šiestich prichádzajúcich — staršie sa otvoria klikom.
            const prisle = bubliny.filter((b) => b.druh === "prisiel").slice(-6) as { uid: number; validity: string }[];
            let texty = new Map<number, { text: string }>();
            let chybaTiel = "";
            try { texty = await tela(DB, prisle, 4000); } catch (x) { chybaTiel = chyba(x); }
            if (e.stav === "nove") await nastavStav(DB, e.id, "precitane", kto);
            return Response.json({
              ok: true,
              bubliny: bubliny.map((b) => (b.druh === "prisiel" ? { ...b, text: texty.get(b.uid)?.text ?? null } : b)),
              chybaTiel,
            }, { headers: ns });
          }
          const emaily = await zoznamEmailov(DB).catch(() => null);
          if (!emaily) return Response.json({ ok: false, error: "Tabuľka mailov chýba (migrácia 0139)." }, { status: 503 });
          const [ok, posledny] = await Promise.all([precitaj(DB, "mail_stav_ok"), precitaj(DB, "mail_stav")]);
          return Response.json({
            ok: true, emaily, kto,
            citane: { ok: (ok?.kedy as string) || null, posledny: (posledny?.kedy as string) || null, chyba: (posledny?.chyba as string) || "" },
          }, { headers: ns });
        } catch (x) {
          return Response.json({ ok: false, error: chyba(x) }, { status: 502 });
        }
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings() as { DB?: D1Database };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const kto = (await currentUser(request)) || "";
        const b = await request.json().catch(() => ({})) as Record<string, unknown>;
        const id = String(b.id || "");
        try {
          if (b.akcia === "stav") {
            const stav = String(b.stav);
            const cielovy: EmailRiadok["stav"] | null = stav === "vybavene" ? "vybavene" : stav === "precitane" ? "precitane" : stav === "vratit" ? "nove" : null;
            if (!cielovy) return Response.json({ ok: false, error: "Neznámy stav." }, { status: 400 });
            const ok = await nastavStav(DB, id, cielovy, kto);
            return Response.json(ok ? { ok: true } : { ok: false, error: "Mail sa nenašiel." }, { status: ok ? 200 : 404 });
          }
          if (b.akcia === "prerad") {
            const kat = PORADIE_KATEGORII.includes(b.kategoria as Kategoria) ? (b.kategoria as Kategoria) : undefined;
            const klient = b.klient === undefined ? undefined : (String(b.klient || "").trim().slice(0, 120) || null);
            if (klient && !kat) {
              const ok = await preradEmail(DB, id, { kategoria: "klient", klient });
              return Response.json({ ok }, { status: ok ? 200 : 404 });
            }
            const ok = await preradEmail(DB, id, { kategoria: kat, klient });
            return Response.json({ ok }, { status: ok ? 200 : 404 });
          }
          if (b.akcia === "odpovedz") {
            const e = id ? await emailPodlaId(DB, id) : null;
            const { adresy, zle } = adresyMailu(String(b.komu || "").slice(0, 300));
            if (zle.length) return Response.json({ ok: false, error: `Toto nie je e-mailová adresa: ${zle.join(", ")}` }, { status: 400 });
            if (!adresy.length) return Response.json({ ok: false, error: "Chýba adresa." }, { status: 400 });
            const text = String(b.text || "").trim().slice(0, 20000);
            if (!maObsah(text)) return Response.json({ ok: false, error: "Odpoveď je prázdna — napíš niečo medzi pozdrav a podpis." }, { status: 400 });
            const predmet = String(b.predmet || "").trim().slice(0, 250) || (e ? `Re: ${e.predmet}` : "ProSapiens");
            const citat = String(b.citat || "").trim().slice(0, 6000);
            const citatHlavicka = String(b.citatHlavicka || "").trim().slice(0, 200);
            const telo = citat ? `${text}\n\n${[citatHlavicka, ...citat.split("\n")].filter((r, i) => i > 0 || r).map((r) => `> ${r}`).join("\n")}` : text;
            /**
             * HTML podoba — návrh A (Jerry, 12. 11. 2026). Logo a fotka toho,
             * kto podpisuje, idú ako prílohy s cid; keď sa nenačítajú, mail
             * odíde bez nich (logo nahradí nápis), nie vôbec.
             */
            const podpis = PODPISUJUCI[String(b.podpis || "")] ? String(b.podpis) : PREDVOLENY_PODPIS;
            const { ASSETS } = bindings() as { ASSETS?: { fetch: (r: Request) => Promise<Response> } };
            const origin = new URL(request.url).origin;
            const obrazok = (cesta: string) => ASSETS?.fetch(new Request(`${origin}${cesta}`)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) ?? Promise.resolve(null);
            const [logo, foto] = await Promise.all([obrazok("/znacka-napis-mail.png"), obrazok(PODPISUJUCI[podpis].foto)]);
            const logoCid = `logo-${crypto.randomUUID()}@prosapiens`;
            const fotoCid = `foto-${crypto.randomUUID()}@prosapiens`;
            const html = odpovedHtml({ text, podpis, citat, citatHlavicka, logoCid: logo ? logoCid : undefined, fotoCid: foto ? fotoCid : undefined });
            const prilohy = [
              ...(logo ? [{ meno: "prosapiens.png", typ: "image/png", data: logo, cid: logoCid }] : []),
              ...(foto ? [{ meno: "podpis.jpg", typ: "image/jpeg", data: foto, cid: fotoCid }] : []),
            ];
            const n = await nastavenia(DB);
            if (!n.host || !n.user || !n.heslo) return Response.json({ ok: false, error: "Schránka nie je nastavená — doplň ju v Údajoch." }, { status: 400 });
            const v = await posliMail(
              { host: n.host.replace(/^imap\./, "smtp."), pouzivatel: n.user, heslo: n.heslo },
              { od: n.user, odMeno: `${podpis} · ProSapiens Biomechanic`, komu: adresy, predmet, telo, html, prilohy },
            );
            if (!v.ok) {
              await audit(DB, { action: "email-odpoved-zlyhala", predmet: adresy.join(", "), old: v.chyba, actor: kto });
              return Response.json({ ok: false, error: `Mail neodišiel — ${v.chyba}. Server niekedy odmietne aj správne heslo; skús to o chvíľu znova.` }, { status: 502 });
            }
            await zapisOdoslany(DB, { spravaId: e?.id || null, komu: adresy[0], klient: e?.klient || null, predmet, text, kto });
            if (e && b.vybav) await nastavStav(DB, e.id, "vybavene", kto);
            await audit(DB, { action: "email-odpoved", predmet: `${e?.klient || adresy.join(", ")} · ${predmet}`.slice(0, 200), actor: kto });
            return Response.json({ ok: true, komu: adresy }, { headers: ns });
          }
          if (b.akcia === "dopyt") {
            const e = await emailPodlaId(DB, id);
            if (!e) return Response.json({ ok: false, error: "Mail sa nenašiel." }, { status: 404 });
            if (!e.odpovedatMail) return Response.json({ ok: false, error: "Mail nemá adresu odosielateľa." }, { status: 400 });
            let text = "";
            try { text = (await tela(DB, [e], 3000)).get(e.uid)?.text || ""; } catch { /* dopyt aj bez textu */ }
            const den = (e.datum || new Date().toISOString()).slice(0, 10);
            const kluc = `mail-${den}-${e.odpovedatMail}`.slice(0, 64);
            const uz = await DB.prepare("SELECT id, name FROM leads WHERE id = ?1 OR (email = ?2 AND date >= date(?3, '-60 days'))")
              .bind(kluc, e.odpovedatMail, den).first<{ id: string; name: string }>();
            if (uz) return Response.json({ ok: true, uzBol: true, meno: uz.name }, { headers: ns });
            const poznamka = `${e.predmet} · ${text.replace(/\s+/g, " ").trim()}`.slice(0, 500);
            await DB.prepare(
              `INSERT INTO leads (id,date,name,source,referrer,status,note,created_at,email,telefon,kampan,utm,stranka)
               VALUES (?1,?2,?3,'mail','','novy',?4,?5,?6,?7,'','','')`,
            ).bind(kluc, den, e.odMeno || e.odpovedatMail, poznamka, new Date().toISOString(), e.odpovedatMail, telefonZTextu(text)).run();
            if (e.kategoria !== "klient") await preradEmail(DB, e.id, { kategoria: "novy" });
            await audit(DB, { action: "email-dopyt", predmet: `${e.odMeno} · ${e.odpovedatMail}`, actor: kto });
            return Response.json({ ok: true, uzBol: false, meno: e.odMeno }, { headers: ns });
          }
          if (b.akcia === "nacitaj") {
            // Hlavičky za posledný mesiac — len do karty, dopyty ani kurzor importu sa nemenia.
            const n = await nastavenia(DB);
            if (!n.host || !n.user || !n.heslo) return Response.json({ ok: false, error: "Schránka nie je nastavená — doplň ju v Údajoch." }, { status: 400 });
            const dni = Math.min(60, Math.max(3, Number(b.dni) || 30));
            const { spravy, kurzor } = await stiahniSpravy({
              host: n.host, port: n.port, user: n.user, heslo: n.heslo,
              odKedy: new Date(Date.now() - dni * 864e5), limit: 80, kurzor: null,
            });
            const pred = new Date(Date.now() - 7 * 864e5).toISOString();
            const pridane = await ulozHlavicky(DB, spravy, kurzor.validity, n, await znamiZDb(DB), pred);
            // Riadky z prvého spustenia karty (12. 11. 2026) dostanú to isté pravidlo.
            const dorovnane = await vybavStarsie(DB, pred);
            return Response.json({ ok: true, precitanych: spravy.length, pridanych: pridane, starsieVybavene: dorovnane }, { headers: ns });
          }
          return Response.json({ ok: false, error: "Neznáma akcia." }, { status: 400 });
        } catch (x) {
          return Response.json({ ok: false, error: `Nepodarilo sa: ${chyba(x)}` }, { status: 500 });
        }
      },
    },
  },
});
