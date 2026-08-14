import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import {
  ga4Mesiace, ga4Strany, gscMesiace, gscRebricek, normProperty, normSite, odKedy, zariadenia,
} from "../../lib/psb/google";
import {
  nastavenie, ulozNastavenie as uloz, ziskajToken,
} from "../../lib/psb/googleAuth.server";

/**
 * GA4 a Search Console cez servisný účet.
 *
 * PREČO SERVISNÝ ÚČET A NIE OAuth
 *
 * OAuth by znamenal prihlasovacie okno a obnovovací token, ktorý po čase
 * vyprší a nikto nevie prečo prestalo chodiť. Servisný účet je kľúč, ktorý
 * nevyprší; Jerry ho raz pridá do GA4 aj do Search Console ako čitateľa a tým
 * to končí. Cena je, že prístup treba udeliť na dvoch miestach — bez toho
 * vráti Google 403 aj s platným kľúčom.
 *
 * KĽÚČ NEOPÚŠŤA SERVER
 *
 * Rovnako ako token Mety a MailerLite: leží v `vzas_settings`, číta ho len
 * tento súbor a do prehliadača sa nevracia ani skrátený. V odpovedi je len
 * e-mail servisného účtu — ten Jerry potrebuje vidieť, lebo ho vkladá do GA4
 * aj Search Console.
 *
 * PREČO SA CHYBA VRACIA CELÁ
 *
 * Google odpovedá na zlé oprávnenie 403 s vetou, ktorá presne hovorí, čo
 * chýba. Prvá verzia napojenia na Metu tieto vety zahadzovala a namiesto nich
 * hlásila „spojenie zlyhalo" — pátranie po skutočnej príčine trvalo hodiny.
 */

type Volanie = { ok: boolean; data?: Record<string, unknown>; chyba?: string };

async function post(url: string, token: string, telo: unknown): Promise<Volanie> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(25000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const e = (j.error || {}) as Record<string, unknown>;
      return { ok: false, chyba: String(e.message || `HTTP ${r.status}`).slice(0, 300) };
    }
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

const GA4 = (p: string) => `https://analyticsdata.googleapis.com/v1beta/properties/${p}:runReport`;
const GSC = (s: string) => `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(s)}/searchAnalytics/query`;

export const Route = createFileRoute("/api/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const surovy = await nastavenie(DB, "google_sa");
          let email = "";
          try { email = String((JSON.parse(surovy || "{}") as { client_email?: string }).client_email || ""); } catch { email = ""; }
          const [ga4, gsc] = await Promise.all([
            DB.prepare("SELECT COUNT(*) n FROM ga4_mesiace").first<{ n: number }>().catch(() => ({ n: 0 })),
            DB.prepare("SELECT COUNT(*) n FROM gsc_mesiace").first<{ n: number }>().catch(() => ({ n: 0 })),
          ]);
          return Response.json({
            ok: true,
            maKluc: !!surovy,
            email,
            property: await nastavenie(DB, "google_ga4_property"),
            site: await nastavenie(DB, "google_gsc_site"),
            ga4Mesiacov: ga4?.n ?? 0,
            gscMesiacov: gsc?.n ?? 0,
          });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        try {
          if (b.akcia === "uloz-kluc") {
            const raw = String(b.kluc || "").trim();
            let sa: { client_email?: string; private_key?: string; type?: string };
            try { sa = JSON.parse(raw); }
            catch { return Response.json({ ok: false, error: "To nie je JSON. Vlož celý obsah stiahnutého súboru, aj so zloženými zátvorkami." }, { status: 400 }); }
            if (!sa.client_email || !sa.private_key) {
              return Response.json({ ok: false, error: "V súbore chýba client_email alebo private_key — vyzerá to na iný súbor než kľúč servisného účtu." }, { status: 400 });
            }
            await uloz(DB, "google_sa", raw);
            await audit(DB, { action: "nastavenie", predmet: "google_sa", neu: `servisný účet ${sa.client_email}`, actor: await currentUser(request) || undefined });
            return Response.json({ ok: true, sprava: `Kľúč uložený. Servisný účet: ${sa.client_email}. Teraz ho pridaj ako čitateľa v GA4 aj v Search Console.` });
          }

          if (b.akcia === "uloz-ciele") {
            const p = normProperty(String(b.property || ""));
            const s = normSite(String(b.site || ""));
            if (b.property && !p) return Response.json({ ok: false, error: "Property ID je len číslo (napr. 123456789). „G-…“ je meracie ID, to je niečo iné." }, { status: 400 });
            await uloz(DB, "google_ga4_property", p);
            await uloz(DB, "google_gsc_site", s);
            return Response.json({ ok: true, sprava: `Uložené. GA4: ${p || "—"}, Search Console: ${s || "—"}.` });
          }

          const surovy = await nastavenie(DB, "google_sa");
          if (!surovy) return Response.json({ ok: false, error: "chyba_kluc" }, { status: 400 });
          let sa: { client_email?: string; private_key?: string };
          try { sa = JSON.parse(surovy); } catch { return Response.json({ ok: false, error: "uložený kľúč sa nedá prečítať" }, { status: 500 }); }

          const t = await ziskajToken(sa);
          if (!t.ok) return Response.json({ ok: false, error: t.chyba }, { status: 502 });

          const property = await nastavenie(DB, "google_ga4_property");
          const site = await nastavenie(DB, "google_gsc_site");

          // ── skúška spojenia ──────────────────────────────────────────────
          //
          // Obidve služby zvlášť: prístup sa udeľuje na dvoch miestach a keď
          // chýba len jeden, spoločná hláška „nefunguje" by poslala Jerryho
          // hľadať na nesprávne miesto.
          if (b.akcia === "test") {
            const casti: string[] = [];
            if (!property) casti.push("GA4: nie je zadané property ID.");
            else {
              const r = await post(GA4(property), t.token, {
                dateRanges: [{ startDate: "30daysAgo", endDate: "yesterday" }],
                metrics: [{ name: "newUsers" }],
              });
              const v = ((r.data?.rows as { metricValues?: { value?: string }[] }[]) || [])[0]?.metricValues?.[0]?.value;
              casti.push(r.ok ? `GA4 funguje — za 30 dní ${v ?? 0} nových návštevníkov.` : `GA4 nejde: ${r.chyba}`);
            }
            if (!site) casti.push("Search Console: nie je zadaná adresa webu.");
            else {
              const r = await post(GSC(site), t.token, {
                startDate: odKedy(new Date(), 2), endDate: new Date().toISOString().slice(0, 10),
                dimensions: [], rowLimit: 1,
              });
              const v = ((r.data?.rows as { clicks?: number }[]) || [])[0]?.clicks;
              casti.push(r.ok ? `Search Console funguje — ${Math.round(v || 0)} klikov za posledné dva mesiace.` : `Search Console nejde: ${r.chyba}`);
            }
            return Response.json({ ok: true, sprava: `Servisný účet ${sa.client_email}. ${casti.join(" ")}` });
          }

          // ── sťahovanie ───────────────────────────────────────────────────
          if (b.akcia === "stiahni") {
            const mesiacov = Math.min(Math.max(Number(b.mesiacov) || 18, 1), 36);
            const od = odKedy(new Date(), mesiacov);
            const do_ = new Date().toISOString().slice(0, 10);
            const now = new Date().toISOString();
            const hlasky: string[] = [];
            const chyby: string[] = [];

            if (property) {
              const kanaly = await post(GA4(property), t.token, {
                dateRanges: [{ startDate: od, endDate: do_ }],
                dimensions: [{ name: "yearMonth" }, { name: "firstUserDefaultChannelGroup" }],
                metrics: [{ name: "newUsers" }],
                limit: 5000,
              });
              if (!kanaly.ok) chyby.push(`GA4: ${kanaly.chyba}`);
              else {
                // Kľúčové udalosti sú v novších property `keyEvents`, v starších
                // `conversions`. Keď zlyhajú obidve, mesiace sa uložia bez nich —
                // je to doplnok, nie dôvod zahodiť celý sťah.
                let udalosti = await post(GA4(property), t.token, {
                  dateRanges: [{ startDate: od, endDate: do_ }],
                  dimensions: [{ name: "yearMonth" }], metrics: [{ name: "keyEvents" }], limit: 500,
                });
                if (!udalosti.ok) {
                  udalosti = await post(GA4(property), t.token, {
                    dateRanges: [{ startDate: od, endDate: do_ }],
                    dimensions: [{ name: "yearMonth" }], metrics: [{ name: "conversions" }], limit: 500,
                  });
                }
                const riadky = ga4Mesiace(kanaly.data || {}, udalosti.ok ? udalosti.data : undefined);
                for (const m of riadky) {
                  await DB.prepare(
                    `INSERT INTO ga4_mesiace (mesiac, novi, organic_search, paid_social, organic_social, direct, referral, udalosti, updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
                     ON CONFLICT(mesiac) DO UPDATE SET novi=?2, organic_search=?3, paid_social=?4, organic_social=?5,
                       direct=?6, referral=?7, udalosti=?8, updated_at=?9`,
                  ).bind(m.mesiac, m.novi, m.organicSearch, m.paidSocial, m.organicSocial, m.direct, m.referral, m.udalosti, now).run();
                }
                hlasky.push(`GA4: ${riadky.length} mesiacov${udalosti.ok ? "" : " (bez kľúčových udalostí)"}`);

                // Najčítanejšie stránky. Snímka za obdobie — starý rebríček sa
                // zahodí celý, dva rebríčky z rôznych období sa zlúčiť nedajú.
                const str = await post(GA4(property), t.token, {
                  dateRanges: [{ startDate: od, endDate: do_ }],
                  dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], limit: 300,
                });
                if (!str.ok) chyby.push(`GA4 (stránky): ${str.chyba}`);
                else {
                  const rs = ga4Strany(str.data || {});
                  await DB.prepare("DELETE FROM ga4_strany").run();
                  const st = rs.map((x) => DB.prepare(
                    `INSERT INTO ga4_strany (url, zobrazenia, updated_at) VALUES (?1,?2,?3)
                     ON CONFLICT(url) DO UPDATE SET zobrazenia=?2, updated_at=?3`,
                  ).bind(x.url, x.zobrazenia, now));
                  for (let i = 0; i < st.length; i += 40) await DB.batch(st.slice(i, i + 40));
                  hlasky.push(`stránok webu: ${rs.length}`);
                }
              }
            }

            if (site) {
              const dni = await post(GSC(site), t.token, {
                startDate: od, endDate: do_, dimensions: ["date"], rowLimit: 25000,
              });
              if (!dni.ok) chyby.push(`Search Console: ${dni.chyba}`);
              else {
                const mes = gscMesiace(dni.data || {});
                for (const m of mes) {
                  await DB.prepare(
                    `INSERT INTO gsc_mesiace (mesiac, kliky, zobrazenia, updated_at) VALUES (?1,?2,?3,?4)
                     ON CONFLICT(mesiac) DO UPDATE SET kliky=?2, zobrazenia=?3, updated_at=?4`,
                  ).bind(m.mesiac, m.kliky, m.zobrazenia, now).run();
                }

                // Rebríčky sú snímka za obdobie. Starý sa zahodí celý — dva
                // rebríčky z rôznych období sa nedajú zlúčiť, lebo pozícia je
                // priemer, nie súčet.
                for (const [rozmer, tab, stlpec] of [["query", "gsc_dopyty", "dopyt"], ["page", "gsc_strany", "url"]] as const) {
                  // 500 bol strop, nie počet — a hlásilo sa presne „500", čo sa
                  // dalo čítať ako celkový počet dopytov. Search Console unesie
                  // 25 000; 5 000 je viac, než koľko ich reálne je.
                  const r = await post(GSC(site), t.token, {
                    startDate: od, endDate: do_, dimensions: [rozmer], rowLimit: 5000,
                  });
                  if (!r.ok) { chyby.push(`Search Console (${rozmer}): ${r.chyba}`); continue; }
                  const riadky = gscRebricek(r.data || {});
                  await DB.prepare(`DELETE FROM ${tab}`).run();
                  const stmts = riadky.map((x) => DB.prepare(
                    `INSERT INTO ${tab} (${stlpec}, kliky, zobrazenia, ctr, pozicia, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
                     ON CONFLICT(${stlpec}) DO UPDATE SET kliky=?2, zobrazenia=?3, ctr=?4, pozicia=?5, updated_at=?6`,
                  ).bind(x.kluc, x.kliky, x.zobrazenia, x.ctr, x.pozicia, now));
                  for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
                  hlasky.push(`${rozmer === "query" ? "dopytov" : "strán"}: ${riadky.length}`);
                }
                // Podiel mobilu — jediné číslo, ktoré z toho čítame, ale bez
                // neho by karta o zariadeniach ostala natvrdo z roku 2025.
                const zar = await post(GSC(site), t.token, {
                  startDate: od, endDate: do_, dimensions: ["device"], rowLimit: 10,
                });
                if (!zar.ok) chyby.push(`Search Console (zariadenia): ${zar.chyba}`);
                else {
                  const zs = zariadenia(zar.data || {});
                  await DB.prepare("DELETE FROM gsc_zariadenia").run();
                  for (const z of zs) {
                    await DB.prepare(
                      `INSERT INTO gsc_zariadenia (zariadenie, kliky, zobrazenia, updated_at) VALUES (?1,?2,?3,?4)
                       ON CONFLICT(zariadenie) DO UPDATE SET kliky=?2, zobrazenia=?3, updated_at=?4`,
                    ).bind(z.zariadenie, z.kliky, z.zobrazenia, now).run();
                  }
                }
                hlasky.push(`Search Console: ${mes.length} mesiacov`);
              }
            }

            if (!hlasky.length && !chyby.length) {
              return Response.json({ ok: false, error: "Nie je zadané ani GA4 property, ani adresa webu." }, { status: 400 });
            }
            await audit(DB, { action: "import", predmet: "google", neu: hlasky.join(", ") || "nič", actor: await currentUser(request) || undefined });
            return Response.json({
              ok: true,
              sprava: `Stiahnuté — ${hlasky.join(", ") || "nič"}.${chyby.length ? ` Nepodarilo sa: ${chyby.join(" ")}` : ""}`,
            });
          }

          return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
