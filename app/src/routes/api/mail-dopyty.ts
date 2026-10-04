import { createFileRoute } from "@tanstack/react-router";
import { terazPraha } from "../../lib/psb/cas";
import { obsahOdkazu } from "../../lib/psb/obsahOdkazu.server";
import type { D1Database } from "@cloudflare/workers-types";

import { jeCasCitat, najblizsieOkno } from "../../lib/psb/mailOkno";
import { audit } from "../../lib/psb/audit.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { stiahniSpravy, testSpojenia } from "../../lib/psb/imap";
import { naDopyt } from "../../lib/psb/mailDopyt";
import { adresyMailu } from "../../lib/psb/mime";
import { deriveClients } from "../../lib/psb/compute";
import { loadData } from "../../lib/psb/db.server";
import { mailKlientovi } from "../../lib/psb/mailKlientovi";
import { normName } from "../../lib/psb/format";
import { posliMail } from "../../lib/psb/smtp.server";
import { posli as posliPush, type Odber } from "../../lib/psb/push.server";

/**
 * Schránka info@prosapiens.cz ako zdroj dopytov.
 *
 * PREČO
 *
 * Kokpit videl dopyt len vtedy, keď prešiel formulárom na webe. 20. 9. 2026
 * prišiel dopyt rovno mailom — a keďže v ten istý deň bežala platená reklama,
 * cena za dopyt vychádzala vyššia, než aká naozaj bola. Schránka je posledný
 * vstup, ktorý appka nemerala.
 *
 * AKO
 *
 * Worker sa raz za pár hodín pripojí na IMAP (`cloudflare:sockets`), prečíta
 * hlavičky nových správ a tie, ktoré vyzerajú ako dopyt, zapíše do `leads`.
 * Nič nemaže a nič neoznačuje ako prečítané — v schránke po ňom nezostane
 * stopa.
 *
 * ČO SA NEPREPISUJE
 *
 * Dopyt, ktorý už v appke je (napríklad zo snippetu na webe aj s kampaňou),
 * sa mailom NEPREPÍŠE. V e-maile UTM nie sú, takže by mail zmazal jedinú
 * informáciu o tom, z ktorej reklamy človek prišiel. Dopĺňa sa len to, čo je
 * prázdne.
 */

/** VAPID kľúče — tie isté, aké používa ranná dávka. */
async function klucePush(DB: D1Database) {
  const rs = await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all();
  const m: Record<string, string> = {};
  for (const r of rs.results as { key: string; value: string }[]) m[r.key] = r.value;
  return { verejny: m.vapid_public || "", sukromny: m.vapid_private || "", kontakt: "mailto:prosapiensbio@gmail.com" };
}

type Nast = { host: string; port: number; user: string; heslo: string; od: string; ignoruj: string[]; vlastne: string[] };

/**
 * Automatická odpoveď na „Chcem celú históriu". Poistky:
 *
 *  1. Klient sa hľadá PRESNE podľa mena z predmetu (normName) — predmet
 *     skladá naše tlačidlo, takže meno je naše vlastné. Nula alebo dvaja
 *     kandidáti = nič sa neposiela.
 *  2. Ide VÝHRADNE na adresy uložené pri klientovi vo fakturačných údajoch.
 *     Odosielateľ žiadosti nedostane nič — pravému klientovi pristane
 *     história v jeho vlastnej schránke, podvrhnuté meno nič nezíska.
 *  3. Najviac raz denne na klienta (audit `historia-odoslana`).
 *
 * QR ani výzva na platbu v automatickej odpovedi nie sú — história je
 * archív; sumu ďalšieho balíčka nemá automat odkiaľ vziať bez hádania.
 */
export async function posliHistoriu(DB: D1Database, menoZPredmetu: string, n: Nast): Promise<{ ok: true; komu: string } | { ok: false; preco: string }> {
  if (!n.host || !n.user || !n.heslo) return { ok: false, preco: "schránka nie je nastavená" };

  const data = await loadData(DB);
  const clients = deriveClients(data);
  const kandidati = Object.values(clients).filter((c) => normName(c.name) === normName(menoZPredmetu));
  if (kandidati.length !== 1) return { ok: false, preco: kandidati.length ? "meno sedí na viacerých" : "klient sa nenašiel" };
  const c = kandidati[0];

  const fa = await DB.prepare("SELECT email, dalsie_maily FROM klient_fakturacia WHERE klient = ?1")
    .bind(c.name).first<{ email: string; dalsie_maily: string }>();
  const { adresy } = adresyMailu([fa?.email || "", fa?.dalsie_maily || ""].join(","));
  if (!adresy.length) return { ok: false, preco: "klient nemá uloženú adresu" };

  const dnesUTC = new Date().toISOString().slice(0, 10);
  const uzDnes = await DB.prepare(
    "SELECT COUNT(*) n FROM vzas_audit WHERE action = 'historia-odoslana' AND payment_id LIKE ?1 AND at >= ?2",
  ).bind(`${c.name} ·%`, dnesUTC).first<{ n: number }>();
  if ((uzDnes?.n || 0) > 0) return { ok: false, preco: "dnes už raz odišla" };

  /**
   * Ten istý obsah ako stránka `/v/` (`obsahOdkazu`) — os s históriou
   * členstiev, kalendárom a balíčkami z Kokpitu, rovnaký nadpis aj mínusy.
   * Celá história a bez platby: mail chodí na vyžiadanie histórie, platba
   * a QR sú na stránke.
   */
  const { vypis } = await obsahOdkazu(DB, data, c, { rozsah: 0, teraz: terazPraha(), sPlatbou: false });
  const logoCid = `logo-${crypto.randomUUID()}@prosapiens`;
  const { ASSETS } = bindings();
  const logo = await ASSETS?.fetch(new Request("https://kokpit.prosapiensbio.workers.dev/znacka-napis-mail.png"))
    .then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  const m = mailKlientovi({ ...vypis, logoCid: logo ? logoCid : undefined });

  const vysledok = await posliMail(
    { host: n.host.replace(/^imap\./, "smtp."), pouzivatel: n.user, heslo: n.heslo },
    {
      od: n.user, odMeno: "ProSapiens Biomechanic", komu: adresy,
      predmet: m.predmet, telo: m.text, html: m.html,
      prilohy: logo ? [{ meno: "znacka.png", typ: "image/png", data: logo, cid: logoCid }] : [],
    },
  );
  if (!vysledok.ok) {
    await audit(DB, { action: "historia-mail-zlyhal", predmet: `${c.name} · ${adresy.join(", ")}`, old: vysledok.chyba, actor: "automat" });
    return { ok: false, preco: "odoslanie zlyhalo" };
  }
  await audit(DB, { action: "historia-odoslana", predmet: `${c.name} · ${adresy.join(", ")}`, actor: "automat" });
  return { ok: true, komu: adresy.join(", ") };
}

export async function nastavenia(DB: D1Database): Promise<Nast> {
  const rs = await DB.prepare(
    `SELECT key, value FROM vzas_settings
      WHERE key IN ('mail_host','mail_port','mail_user','mail_heslo','mail_od','mail_ignoruj','mail_vlastne')`,
  ).all();
  const m: Record<string, string> = {};
  for (const r of (rs.results as { key: string; value: string }[]) || []) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  const zoznam = (s: string) => (s || "").split(/[,\s;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return {
    host: m.mail_host || "",
    port: Number(m.mail_port) || 993,
    user: m.mail_user || "",
    heslo: m.mail_heslo || "",
    // Bez dátumu by prvý beh čítal celú schránku. Týždeň dozadu stačí:
    // staršie dopyty sú už v appke prepísané ručne.
    od: m.mail_od || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10),
    ignoruj: zoznam(m.mail_ignoruj),
    vlastne: [m.mail_user || "", ...zoznam(m.mail_vlastne)].filter(Boolean),
  };
}

/**
 * Stav posledného behu — a zvlášť posledného ÚSPEŠNÉHO.
 *
 * Poštový server vie odmietnuť prihlásenie aj vtedy, keď je heslo správne
 * (21. 9. 2026 beh o 6:00 spadol na `AUTHENTICATIONFAILED` a ten o 6:46 prešiel
 * bez toho, aby sa čokoľvek zmenilo — Dovecot po sérii prihlásení chvíľu
 * odmieta). Keby panel ukazoval len poslednú chybu, vyzeralo by to ako
 * rozbité napojenie. To je tá istá lekcia ako pri kalendári: k chybe patrí
 * vek posledného úspechu.
 */
const stav = async (DB: D1Database, v: { chyba: string } & Record<string, unknown>) => {
  const zapis = (kluc: string) =>
    DB.prepare(`INSERT INTO vzas_settings (key,value) VALUES ('${kluc}',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(JSON.stringify(JSON.stringify(v))).run()
      .catch(() => undefined);
  await zapis("mail_stav");
  if (!v.chyba) await zapis("mail_stav_ok");
};

export const Route = createFileRoute("/api/mail-dopyty")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const n = await nastavenia(DB);
        const precitaj = async (kluc: string) => {
          const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(kluc).first<{ value: string }>();
          try { return JSON.parse(JSON.parse(r?.value || '""') || "null"); } catch { return null; }
        };
        const posledny = await precitaj("mail_stav");
        const poslednyUspech = await precitaj("mail_stav_ok");
        const zMailu = await DB.prepare(
          "SELECT COUNT(*) n, MAX(date) posledny FROM leads WHERE id LIKE 'mail-%'",
        ).first<{ n: number; posledny: string | null }>().catch(() => null);
        return Response.json({
          ok: true,
          // Heslo sa von neposiela nikdy — len to, či je vyplnené.
          nastavene: { host: n.host, port: n.port, user: n.user, od: n.od, heslo: n.heslo ? "uložené" : "", ignoruj: n.ignoruj.join(", ") },
          posledny,
          poslednyUspech,
          dopytovZMailu: zMailu?.n ?? 0,
          poslednyDopyt: zMailu?.posledny ?? null,
        });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        // Plánovač beží vo vlastnom workeri a nemá session — preukazuje sa tým
        // istým zdieľaným tajomstvom ako kalendár a sťahovanie webu.
        if (url.searchParams.get("cron") === "1") {
          const token = (bindings() as { KAL_CRON_TOKEN?: string }).KAL_CRON_TOKEN;
          const dany = request.headers.get("x-cron-token") || "";
          if (!token || token.length !== dany.length || token !== dany) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }
        } else if (!(await isAuthed(request))) {
          return unauthorized();
        }

        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        /**
         * RÁNO A VEČER, NIE KAŽDÚ HODINU.
         *
         * Plánovač volá každú hodinu a rozvrh sa mu meniť nedá (beží mimo
         * tohto repa), tak sa rozhodne tu: mimo okna sa na schránku vôbec
         * nesiaha. Ručné „Stiahnuť teraz" z obrazovky sa tým NEOBMEDZUJE —
         * to je človek, ktorý vie, prečo klikol.
         */
        if (url.searchParams.get("cron") === "1") {
          const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'mail_stav'")
            .first<{ value: string }>().catch(() => null);
          let poslednyBeh: string | null = null;
          try { poslednyBeh = JSON.parse(JSON.parse(r?.value || '""') || "null")?.kedy ?? null; } catch { /* prvý beh */ }
          if (!jeCasCitat(new Date(), poslednyBeh)) {
            return Response.json({ ok: true, preskocene: `mimo okna — číta sa ${najblizsieOkno(new Date())}` });
          }
        }
        let b: Record<string, unknown> = {};
        try { b = (await request.json()) as Record<string, unknown>; } catch { /* prázdne telo je v poriadku */ }
        const akcia = String(b.akcia || "stiahni");
        const n = await nastavenia(DB);

        // ── test spojenia ────────────────────────────────────────────────
        // Bez hesla a bez zápisu: odpovie, či sa worker na schránku vôbec
        // dostane. Cloudflare púšťa TCP z workera len na niektoré porty
        // a keby 993 medzi ne nepatril, nemá zmysel stavať nič ďalšie.
        if (akcia === "test") {
          const host = String(b.host || n.host || "");
          if (!host) return Response.json({ ok: false, error: "chýba adresa servera" }, { status: 400 });
          try {
            const banner = await testSpojenia(host, Number(b.port) || n.port);
            return Response.json({ ok: true, banner: banner.slice(0, 200) });
          } catch (e) {
            return Response.json({ ok: false, error: String(e).slice(0, 300) });
          }
        }

        if (akcia !== "stiahni") return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
        if (!n.host || !n.user || !n.heslo) {
          return Response.json({ ok: false, error: "schránka nie je nastavená (adresa, meno, heslo v Údajoch)" }, { status: 400 });
        }

        const zaciatok = new Date();
        try {
          const spravy = await stiahniSpravy({
            host: n.host, port: n.port, user: n.user, heslo: n.heslo,
            odKedy: new Date(`${n.od}T00:00:00Z`),
            limit: Number(b.limit) || 40,
          });

          const pridane: string[] = [];
          const doplnene: string[] = [];
          // Správa, ktorá už dopyt má a nemá čo doplniť, nesmie zmiznúť
          // z počtov — inak „prečítaných 7, nových 3" nesedí a vyzerá to,
          // akoby sa po ceste niečo stratilo.
          let uzBoli = 0;
          const preskocene: { predmet: string; preco: string }[] = [];

          for (const s of spravy) {
            const v = naDopyt(s, n.vlastne, n.ignoruj);
            if ("preskocene" in v) {
              preskocene.push({ predmet: (s.predmet || s.od).slice(0, 90), preco: v.preskocene });
              continue;
            }
            /**
             * Klient klikol v maili na „Chcem celú históriu". Nie je to nový
             * dopyt — človek už klientom je. Jerrymu príde push a v zázname
             * behu to zostane viditeľné; mail sám sa neposiela NIKDY, história
             * odchádza až Jerryho klikom zo stola klienta (rovnaké pravidlo
             * ako pri SMS: naše čísla sú miestami dopočítané).
             */
            if ("historia" in v) {
              await audit(DB, { action: "historia-vyziadana", predmet: `${v.historia.meno} · ${v.historia.email}`, actor: "klient" });
              /**
               * Automatická odpoveď (Jerry, 29. 9. 2026: „vedeli by sme to
               * automatizovať?"). Poistky sú v `posliHistoriu`; keď niektorá
               * nepustí, spadne sa späť na push a Jerry pošle históriu ručne.
               */
              const auto = await posliHistoriu(DB, v.historia.meno, n);
              if (auto.ok) {
                preskocene.push({ predmet: `${v.historia.meno} si pýtal celú históriu`, preco: `odoslaná automaticky na ${auto.komu}` });
                continue;
              }
              preskocene.push({ predmet: `${v.historia.meno} si pýta celú históriu`, preco: `automat sa stiahol (${auto.preco}) — poslaná notifikácia` });
              try {
                const k = await klucePush(DB);
                if (k.verejny && k.sukromny) {
                  const odbery = (await DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all())
                    .results as unknown as (Odber & { kto: string })[];
                  for (const o of odbery) {
                    if ((o.kto || "").trim().toLowerCase() !== "jerry") continue;
                    await posliPush(o, {
                      titulok: "Žiadosť o históriu",
                      text: `${v.historia.meno} si pýta celú históriu tréningov a platieb (${auto.preco}). Pošleš mu ju zo stola klienta — voľba „celá história + platby".`,
                      url: "/#workspace", znacka: `historia-${v.historia.email}`,
                    }, k);
                  }
                }
              } catch { /* push nesmie zhodiť čítanie schránky */ }
              continue;
            }
            const d = v.dopyt;
            const uz = await DB.prepare("SELECT id, name, email, telefon, note FROM leads WHERE id = ?1")
              .bind(d.kluc).first<{ id: string; name: string; email: string; telefon: string; note: string }>();

            if (!uz) {
              await DB.prepare(
                `INSERT INTO leads (id,date,name,source,referrer,status,note,created_at,email,telefon,kampan,utm,stranka)
                 VALUES (?1,?2,?3,?4,'','novy',?5,?6,?7,?8,'','','')`,
              ).bind(d.kluc, d.datum, d.meno || d.email, d.zdroj, d.poznamka, new Date().toISOString(), d.email, d.telefon).run();
              pridane.push(`${d.meno || d.email} (${d.datum})`);
            } else {
              // Dopĺňa sa LEN to, čo chýba. Kampaň, zdroj ani stav sa
              // nedotýkame — mail o nich nevie nič a prepísal by pravdu
              // zo snippetu domnienkou.
              const zmeny: string[] = [];
              const set: string[] = [];
              const hod: unknown[] = [];
              if (!uz.email && d.email) { set.push(`email = ?${set.length + 2}`); hod.push(d.email); zmeny.push("e-mail"); }
              if (!uz.telefon && d.telefon) { set.push(`telefon = ?${set.length + 2}`); hod.push(d.telefon); zmeny.push("telefón"); }
              if (!uz.note && d.poznamka) { set.push(`note = ?${set.length + 2}`); hod.push(d.poznamka); zmeny.push("poznámka"); }
              if (set.length) {
                await DB.prepare(`UPDATE leads SET ${set.join(", ")} WHERE id = ?1`).bind(d.kluc, ...hod).run();
                doplnene.push(`${uz.name || d.email}: ${zmeny.join(", ")}`);
              } else {
                uzBoli++;
              }
            }
          }

          const vysledok = {
            kedy: zaciatok.toISOString(),
            precitanych: spravy.length,
            pridanych: pridane.length,
            doplnenych: doplnene.length,
            uzBoli,
            pridane: pridane.slice(0, 20),
            doplnene: doplnene.slice(0, 20),
            // Vyradené sa ukazujú zámerne: keď filter vyhodí skutočný dopyt,
            // má sa to dať zbadať. Tichý filter je horší než žiadny.
            preskocene: preskocene.slice(0, 30),
            chyba: "",
          };
          await stav(DB, vysledok);
          if (pridane.length || doplnene.length) {
            await audit(DB, {
              action: "dopyt-z-mailu",
              predmet: `${pridane.length} nových`,
              neu: [...pridane, ...doplnene].join(" · ").slice(0, 300),
              actor: url.searchParams.get("cron") === "1" ? "cron" : "app",
            });
          }
          return Response.json({ ok: true, ...vysledok });
        } catch (e) {
          const chyba = String(e).slice(0, 300);
          await stav(DB, { kedy: zaciatok.toISOString(), precitanych: 0, pridanych: 0, doplnenych: 0, pridane: [], doplnene: [], preskocene: [], chyba });
          return Response.json({ ok: false, error: chyba });
        }
      },
    },
  },
});
