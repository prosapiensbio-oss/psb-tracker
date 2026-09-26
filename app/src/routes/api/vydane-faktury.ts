import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { dalsieCislo, splatnostZ, SPLATNOST_DNI, type Faktura } from "../../lib/psb/vydanaFaktura";
import { fakturaDoPdf } from "../../lib/psb/fakturaPdf.server";
import { mailFaktury, menoPrilohy } from "../../lib/psb/mailFaktury";
import { posliMail } from "../../lib/psb/smtp.server";
import { jeMesiac, normName } from "../../lib/psb/format";

/**
 * VYDANÉ FAKTÚRY.
 *
 *   GET                                   → faktúry + fakturačné údaje klientov
 *   POST { akcia: "vystav", ... }         → nová faktúra (číslo pridelí server)
 *   POST { akcia: "uprav", id, ... }      → oprava nevystavených údajov
 *   POST { akcia: "storno", id, dovod }   → stornuje; číslo v rade zostane
 *   POST { akcia: "uhradena" | "neuhradena", id }
 *   POST { akcia: "odoslana", id, komu }  → zapíše, že doklad odišiel
 *   POST { akcia: "udaje", klient, ... }  → fakturačné údaje klienta
 *
 * ČÍSLO PRIDEĽUJE SERVER, NIE OBRAZOVKA. Dve otvorené karty by inak vystavili
 * dve faktúry s tým istým číslom a rada by prestala byť radou.
 *
 * FAKTÚRA SA NEMAŽE. Chybná sa stornuje — číslo zostane obsadené a v rade
 * nevznikne diera, ktorú po roku nikto nevysvetlí.
 */

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();
const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const denISO = (s: unknown) => {
  const v = String(s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && jeMesiac(v.slice(0, 7)) ? v : "";
};

/**
 * Meno klienta v tvare, aký pozná zvyšok appky.
 *
 * Tá istá pasca ako pri prepisovaní karty klienta (25. 9. 2026): zápis pod
 * iným tvarom mena sa „uloží" a nikde sa neobjaví, lebo čítanie hľadá
 * kanonický tvar z exportu.
 */
async function kanonickeMeno(DB: D1Database, meno: string): Promise<string> {
  const presne = await DB.prepare(
    "SELECT client_name FROM sessions WHERE client_name = ?1 COLLATE NOCASE LIMIT 1",
  ).bind(meno).first<{ client_name: string }>();
  if (presne?.client_name) return presne.client_name;
  const kandidati = await DB.prepare("SELECT DISTINCT client_name FROM sessions").all<{ client_name: string }>();
  const hladane = normName(meno);
  const zhody = (kandidati.results || []).filter((r) => normName(r.client_name) === hladane);
  return zhody.length === 1 ? zhody[0].client_name : meno;
}

/**
 * Prístup do schránky. Tie isté údaje, aké Kokpit používa na čítanie dopytov
 * — heslo zadáva Jerry v Údajoch a odtiaľto sa nikam nevypisuje.
 */
async function nastaveniaMailu(DB: D1Database): Promise<{ host: string; user: string; heslo: string }> {
  const rs = await DB.prepare(
    "SELECT key, value FROM vzas_settings WHERE key IN ('mail_host','mail_user','mail_heslo')",
  ).all();
  const m: Record<string, string> = {};
  for (const r of (rs.results as { key: string; value: string }[]) || []) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  return { host: m.mail_host || "", user: m.mail_user || "", heslo: m.mail_heslo || "" };
}

/** Riadok z databázy na doklad. Jedno miesto, nech sa PDF a obrazovka nerozídu. */
const naFakturu = (r: Record<string, string | number | null>): Faktura => ({
  cislo: String(r.cislo), klient: String(r.klient),
  vystavene: String(r.vystavene), splatnost: String(r.splatnost),
  popis: String(r.popis), ks: Number(r.ks) || 1,
  cena: Number(r.cena_czk) || 0, celkom: Number(r.celkom_czk) || 0,
  poznamka: String(r.poznamka || ""),
  stornoAt: r.storno_at ? String(r.storno_at) : null,
  uhradeneAt: r.uhradene_at ? String(r.uhradene_at) : null,
  odberatel: {
    firma: String(r.odb_firma || ""), ico: String(r.odb_ico || ""), dic: String(r.odb_dic || ""),
    ulica: String(r.odb_ulica || ""), psc: String(r.odb_psc || ""), mesto: String(r.odb_mesto || ""),
    stat: String(r.odb_stat || ""), email: String(r.odb_email || ""),
  },
});

/** Fakturačné údaje klienta; prázdne, keď ešte žiadne nemá. */
const prazdneUdaje = {
  stat: "Česká republika", firma: "", ico: "", dic: "", ulica: "", psc: "", mesto: "",
  email: "", dalsie_maily: "", telefon: "", web: "",
  os_titul: "", os_meno: "", os_priezvisko: "", os_mobil: "",
};

export const Route = createFileRoute("/api/vydane-faktury")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const f = await DB.prepare(
            `SELECT id, cislo, klient, balicek_id, vystavene, splatnost, popis, ks, cena_czk, celkom_czk,
                    odb_firma, odb_ico, odb_dic, odb_ulica, odb_psc, odb_mesto, odb_stat, odb_email,
                    poznamka, odoslane_at, odoslane_komu, uhradene_at, platba_id, storno_at, storno_dovod, created_at
             FROM vydane_faktury ORDER BY cislo DESC`,
          ).all();
          const u = await DB.prepare("SELECT * FROM klient_fakturacia").all();
          // Bez keše: faktúra sa číta hneď po vystavení a stará odpoveď by
          // ukázala doklad bez čísla.
          return Response.json({ ok: true, faktury: f.results || [], udaje: u.results || [] },
            { headers: { "cache-control": "no-store" } });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, BROWSER, ASSETS } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        const kto = (await currentUser(request)) || "";

        try {
          // ── fakturačné údaje klienta ─────────────────────────────────
          if (b.akcia === "udaje") {
            const klient = await kanonickeMeno(DB, kus(b.klient, 120));
            if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
            const v = {
              stat: kus(b.stat, 60) || "Česká republika",
              firma: kus(b.firma, 160),
              ico: kus(b.ico, 20),
              dic: kus(b.dic, 20),
              ulica: kus(b.ulica, 120),
              psc: kus(b.psc, 20),
              mesto: kus(b.mesto, 80),
              email: kus(b.email, 160).toLowerCase(),
              dalsie_maily: String(b.dalsieMaily ?? "").split(/[\n,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean).join("\n").slice(0, 400),
              telefon: kus(b.telefon, 40),
              web: kus(b.web, 120),
              os_titul: kus(b.osTitul, 30),
              os_meno: kus(b.osMeno, 60),
              os_priezvisko: kus(b.osPriezvisko, 60),
              os_mobil: kus(b.osMobil, 40),
            };
            if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) {
              return Response.json({ ok: false, error: "E-mail nevyzerá ako e-mail." }, { status: 400 });
            }
            await DB.prepare(
              `INSERT INTO klient_fakturacia (klient, stat, firma, ico, dic, ulica, psc, mesto, email, dalsie_maily,
                 telefon, web, os_titul, os_meno, os_priezvisko, os_mobil, updated_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
               ON CONFLICT(klient) DO UPDATE SET stat=?2, firma=?3, ico=?4, dic=?5, ulica=?6, psc=?7, mesto=?8,
                 email=?9, dalsie_maily=?10, telefon=?11, web=?12, os_titul=?13, os_meno=?14, os_priezvisko=?15,
                 os_mobil=?16, updated_at=?17`,
            ).bind(klient, v.stat, v.firma, v.ico, v.dic, v.ulica, v.psc, v.mesto, v.email, v.dalsie_maily,
              v.telefon, v.web, v.os_titul, v.os_meno, v.os_priezvisko, v.os_mobil, teraz()).run();
            await audit(DB, { action: "fakturacne-udaje", predmet: klient, actor: kto });
            return Response.json({ ok: true, klient });
          }

          // ── nová faktúra ─────────────────────────────────────────────
          if (b.akcia === "vystav") {
            const klient = await kanonickeMeno(DB, kus(b.klient, 120));
            const popis = String(b.popis ?? "").trim().slice(0, 600);
            const cena = Math.round((Number(b.cena) || 0) * 100) / 100;
            const ks = Math.max(0.01, Math.round((Number(b.ks) || 1) * 100) / 100);
            if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
            if (popis.length < 3) return Response.json({ ok: false, error: "Popis je príliš krátky." }, { status: 400 });
            if (cena <= 0) return Response.json({ ok: false, error: "Cena musí byť kladná." }, { status: 400 });
            const vystavene = denISO(b.vystavene) || new Date().toISOString().slice(0, 10);
            const dni = b.splatnostDni == null ? SPLATNOST_DNI : Math.max(0, Math.min(180, Math.round(Number(b.splatnostDni) || 0)));
            const splatnost = denISO(b.splatnost) || splatnostZ(vystavene, dni);
            if (splatnost < vystavene) return Response.json({ ok: false, error: "Splatnosť je pred vystavením." }, { status: 400 });

            // Odtlačok odberateľa. Berie sa z karty klienta, keď ho volajúci
            // neposlal — ale UKLADÁ sa do faktúry, nie ako odkaz.
            const u = (await DB.prepare("SELECT * FROM klient_fakturacia WHERE klient = ?1").bind(klient).first()) as Record<string, string> | null;
            const zdroj = { ...prazdneUdaje, ...(u || {}) };
            const odb = {
              firma: kus(b.odbFirma, 160) || zdroj.firma || klient,
              ico: kus(b.odbIco, 20) || zdroj.ico,
              dic: kus(b.odbDic, 20) || zdroj.dic,
              ulica: kus(b.odbUlica, 120) || zdroj.ulica,
              psc: kus(b.odbPsc, 20) || zdroj.psc,
              mesto: kus(b.odbMesto, 80) || zdroj.mesto,
              stat: kus(b.odbStat, 60) || zdroj.stat,
              email: kus(b.odbEmail, 160).toLowerCase() || zdroj.email,
            };

            // Číslo sa berie z najvyššieho v rade toho roku — vrátane
            // stornovaných. Preto sa čítajú všetky čísla, nie len živé.
            const rada = ((await DB.prepare("SELECT cislo FROM vydane_faktury").all()).results || [])
              .map((r) => String((r as { cislo: string }).cislo));
            const cislo = dalsieCislo(vystavene, rada);

            const id = uid();
            await DB.prepare(
              `INSERT INTO vydane_faktury (id, cislo, klient, balicek_id, vystavene, splatnost, popis, ks, cena_czk, celkom_czk,
                 odb_firma, odb_ico, odb_dic, odb_ulica, odb_psc, odb_mesto, odb_stat, odb_email, poznamka, created_at, autor)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)`,
            ).bind(id, cislo, klient, kus(b.balicekId, 40) || null, vystavene, splatnost, popis, ks, cena,
              Math.round(ks * cena * 100) / 100, odb.firma, odb.ico, odb.dic, odb.ulica, odb.psc, odb.mesto,
              odb.stat, odb.email, String(b.poznamka ?? "").slice(0, 600), teraz(), kto).run();
            await audit(DB, { action: "faktura-vystavena", predmet: `${cislo} · ${klient}`, neu: `${Math.round(ks * cena)} Kč`, actor: kto });
            return Response.json({ ok: true, id, cislo });
          }

          const id = kus(b.id, 40);
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });

          if (b.akcia === "uprav") {
            const popis = String(b.popis ?? "").trim().slice(0, 600);
            const cena = Math.round((Number(b.cena) || 0) * 100) / 100;
            const ks = Math.max(0.01, Math.round((Number(b.ks) || 1) * 100) / 100);
            if (popis.length < 3 || cena <= 0) return Response.json({ ok: false, error: "Popis alebo cena chýba." }, { status: 400 });
            const splatnost = denISO(b.splatnost);
            if (!splatnost) return Response.json({ ok: false, error: "Chýba splatnosť." }, { status: 400 });
            await DB.prepare(
              `UPDATE vydane_faktury SET popis=?2, ks=?3, cena_czk=?4, celkom_czk=?5, splatnost=?6, poznamka=?7,
                 odb_firma=?8, odb_ico=?9, odb_dic=?10, odb_ulica=?11, odb_psc=?12, odb_mesto=?13, odb_stat=?14, odb_email=?15
               WHERE id=?1 AND storno_at IS NULL`,
            ).bind(id, popis, ks, cena, Math.round(ks * cena * 100) / 100, splatnost, String(b.poznamka ?? "").slice(0, 600),
              kus(b.odbFirma, 160), kus(b.odbIco, 20), kus(b.odbDic, 20), kus(b.odbUlica, 120), kus(b.odbPsc, 20),
              kus(b.odbMesto, 80), kus(b.odbStat, 60), kus(b.odbEmail, 160).toLowerCase()).run();
            await audit(DB, { action: "faktura-uprava", predmet: id, actor: kto });
            return Response.json({ ok: true, id });
          }

          if (b.akcia === "storno") {
            const dovod = kus(b.dovod, 300);
            if (!dovod) return Response.json({ ok: false, error: "Storno potrebuje dôvod — o rok už nikto nebude vedieť prečo." }, { status: 400 });
            const r = await DB.prepare("UPDATE vydane_faktury SET storno_at=?2, storno_dovod=?3 WHERE id=?1 AND storno_at IS NULL")
              .bind(id, teraz(), dovod).run();
            if (!r.meta.changes) return Response.json({ ok: false, error: "Faktúra neexistuje alebo už je stornovaná." }, { status: 400 });
            await audit(DB, { action: "faktura-storno", predmet: id, neu: dovod, actor: kto });
            return Response.json({ ok: true });
          }

          /**
           * ODOSLANIE MAILOM.
           *
           * Vlastná schránka `info@prosapiens.cz`, ktorú Kokpit už pozná
           * z čítania dopytov. Klientovi tým príde faktúra z adresy, na
           * ktorú vie odpovedať — a odpoveď padne Jerrymu do schránky, nie
           * do appky.
           *
           * PORADIE JE ÚMYSELNÉ: najprv PDF, potom mail, a až po úspešnom
           * odoslaní sa zapíše `odoslane_at`. Keby sa zapisovalo dopredu,
           * appka by pri spadnutom SMTP tvrdila, že doklad odišiel.
           */
          if (b.akcia === "posli-mail") {
            if (!BROWSER) return Response.json({ ok: false, error: "Prehliadač na serveri nie je zapnutý — PDF sa nemá ako vyrobiť." }, { status: 503 });
            const r = await DB.prepare(
              `SELECT cislo, klient, vystavene, splatnost, popis, ks, cena_czk, celkom_czk, poznamka, storno_at, uhradene_at,
                      odb_firma, odb_ico, odb_dic, odb_ulica, odb_psc, odb_mesto, odb_stat, odb_email
               FROM vydane_faktury WHERE id = ?1`,
            ).bind(id).first<Record<string, string | number | null>>();
            if (!r) return Response.json({ ok: false, error: "Taká faktúra neexistuje." }, { status: 404 });
            if (r.storno_at) return Response.json({ ok: false, error: "Stornovaná faktúra sa neposiela." }, { status: 400 });

            const komu = (kus(b.komu, 160) || String(r.odb_email || "")).toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(komu)) {
              return Response.json({ ok: false, error: "Klient nemá e-mail — doplň ho vo fakturačných údajoch." }, { status: 400 });
            }

            const n = await nastaveniaMailu(DB);
            if (!n.host || !n.user || !n.heslo) {
              return Response.json({ ok: false, error: "Schránka nie je nastavená — doplň ju v Údajoch." }, { status: 400 });
            }

            const faktura = naFakturu(r);
            const pdf = await fakturaDoPdf(BROWSER, ASSETS, faktura, new URL(request.url).origin);
            const text = mailFaktury(faktura);
            const vysledok = await posliMail(
              // Čítanie chodí na IMAP (993), odosielanie na SMTP (587) —
              // ten istý stroj, iný port a iná služba.
              { host: n.host.replace(/^imap\./, "smtp."), port: 587, pouzivatel: n.user, heslo: n.heslo },
              {
                od: n.user,
                odMeno: "ProSapiens Biomechanic",
                komu: [komu],
                // Kópia sebe: v schránke tak zostane stopa po tom, čo klientovi
                // naozaj odišlo — SMTP sám do „Odoslané" nič nedá.
                kopiaSkryta: [n.user],
                predmet: String(b.predmet || text.predmet).slice(0, 200),
                telo: String(b.telo || text.telo).slice(0, 5000),
                prilohy: [{ meno: menoPrilohy(String(r.cislo)), typ: "application/pdf", data: pdf }],
              },
            );
            if (!vysledok.ok) {
              await audit(DB, { action: "faktura-mail-zlyhal", predmet: `${r.cislo} · ${komu}`, old: vysledok.chyba, actor: kto });
              return Response.json({ ok: false, error: `Mail neodišiel — ${vysledok.chyba}` }, { status: 502 });
            }
            await DB.prepare("UPDATE vydane_faktury SET odoslane_at = ?2, odoslane_komu = ?3 WHERE id = ?1")
              .bind(id, teraz(), komu).run();
            await audit(DB, { action: "faktura-odoslana-mailom", predmet: `${r.cislo} · ${komu}`, actor: kto });
            return Response.json({ ok: true, komu });
          }

          /**
           * PDF NA SERVERI. Vráti hotový doklad ako súbor — rovnaký, aký
           * vyjde z tlače, lebo ho sádže tá istá šablóna. Kvôli prílohe
           * mailu; obrazovka si zatiaľ tlačí sama.
           */
          if (b.akcia === "pdf") {
            if (!BROWSER) return Response.json({ ok: false, error: "Prehliadač na serveri nie je zapnutý." }, { status: 503 });
            const r = await DB.prepare(
              `SELECT cislo, klient, vystavene, splatnost, popis, ks, cena_czk, celkom_czk, poznamka, storno_at, uhradene_at,
                      odb_firma, odb_ico, odb_dic, odb_ulica, odb_psc, odb_mesto, odb_stat, odb_email
               FROM vydane_faktury WHERE id = ?1`,
            ).bind(kus(b.id, 40)).first<Record<string, string | number | null>>();
            if (!r) return Response.json({ ok: false, error: "Taká faktúra neexistuje." }, { status: 404 });
            const pdf = await fakturaDoPdf(BROWSER, ASSETS, naFakturu(r), new URL(request.url).origin);
            return new Response(pdf, {
              headers: {
                "content-type": "application/pdf",
                "content-disposition": `inline; filename="Faktura ${r.cislo}.pdf"`,
                "cache-control": "no-store",
              },
            });
          }

          /**
           * ZMAZANIE. Jerry, 26. 9. 2026: „tu potrebujem aj možnosť iba
           * vymazať a odstrániť faktúru."
           *
           * Storno zostáva pre doklad, ktorý už niekomu odišiel — tam sa má
           * vedieť, že existoval a prečo padol. Mazanie je pre skúšobné
           * a omylom založené faktúry, ktoré nikam nešli; nechať ich navždy
           * v knihe je horšie než diera v číslovaní.
           *
           * Čo z nej zostane: riadok v audite s číslom, klientom a sumou.
           * Zmazanie POSLEDNEJ faktúry v rade uvoľní jej číslo — nasledujúca
           * ho dostane znova, takže po skúške nezostane preskočené číslo.
           */
          if (b.akcia === "zmaz") {
            const f = await DB.prepare(
              "SELECT cislo, klient, celkom_czk, odoslane_at FROM vydane_faktury WHERE id = ?1",
            ).bind(id).first<{ cislo: string; klient: string; celkom_czk: number; odoslane_at: string | null }>();
            if (!f) return Response.json({ ok: false, error: "Taká faktúra neexistuje." }, { status: 404 });
            await DB.prepare("DELETE FROM vydane_faktury WHERE id = ?1").bind(id).run();
            await audit(DB, {
              action: "faktura-zmazana",
              predmet: `${f.cislo} · ${f.klient}`,
              old: `${Math.round(f.celkom_czk)} Kč${f.odoslane_at ? ` · odoslaná ${f.odoslane_at.slice(0, 10)}` : ""}`,
              actor: kto,
            });
            return Response.json({ ok: true, cislo: f.cislo });
          }

          if (b.akcia === "uhradena" || b.akcia === "neuhradena") {
            await DB.prepare("UPDATE vydane_faktury SET uhradene_at=?2, platba_id=?3 WHERE id=?1")
              .bind(id, b.akcia === "uhradena" ? (denISO(b.den) || teraz().slice(0, 10)) : null,
                b.akcia === "uhradena" ? (kus(b.platbaId, 40) || null) : null).run();
            await audit(DB, { action: `faktura-${b.akcia}`, predmet: id, actor: kto });
            return Response.json({ ok: true });
          }

          if (b.akcia === "odoslana") {
            await DB.prepare("UPDATE vydane_faktury SET odoslane_at=?2, odoslane_komu=?3 WHERE id=?1")
              .bind(id, teraz(), kus(b.komu, 160)).run();
            await audit(DB, { action: "faktura-odoslana", predmet: id, neu: kus(b.komu, 160), actor: kto });
            return Response.json({ ok: true });
          }

          return Response.json({ ok: false, error: "Neznáma akcia." }, { status: 400 });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
