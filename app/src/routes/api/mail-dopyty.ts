import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { stiahniSpravy, testSpojenia } from "../../lib/psb/imap";
import { naDopyt } from "../../lib/psb/mailDopyt";

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

type Nast = { host: string; port: number; user: string; heslo: string; od: string; ignoruj: string[]; vlastne: string[] };

async function nastavenia(DB: D1Database): Promise<Nast> {
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

const stav = async (DB: D1Database, v: unknown) =>
  DB.prepare("INSERT INTO vzas_settings (key,value) VALUES ('mail_stav',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(JSON.stringify(JSON.stringify(v))).run()
    .catch(() => undefined);

export const Route = createFileRoute("/api/mail-dopyty")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const n = await nastavenia(DB);
        const s = await DB.prepare("SELECT value FROM vzas_settings WHERE key='mail_stav'").first<{ value: string }>();
        let posledny: unknown = null;
        try { posledny = JSON.parse(JSON.parse(s?.value || '""') || "null"); } catch { posledny = null; }
        const zMailu = await DB.prepare(
          "SELECT COUNT(*) n, MAX(date) posledny FROM leads WHERE id LIKE 'mail-%'",
        ).first<{ n: number; posledny: string | null }>().catch(() => null);
        return Response.json({
          ok: true,
          // Heslo sa von neposiela nikdy — len to, či je vyplnené.
          nastavene: { host: n.host, port: n.port, user: n.user, od: n.od, heslo: n.heslo ? "uložené" : "", ignoruj: n.ignoruj.join(", ") },
          posledny,
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
