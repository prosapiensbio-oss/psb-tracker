import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { odKedy } from "../../lib/psb/google";
import {
  nastavenie, servisnyUcet, ulozNastavenie, ziskajToken,
} from "../../lib/psb/googleAuth.server";
import {
  adsDopyty, adsKampane, adsRiadky, adsUcty, adsUrl, gaqlDopyty, gaqlKampane,
  gaqlUcty, normCustomer, SCOPE_ADS,
} from "../../lib/psb/googleAds";

/**
 * Google Ads — výkon vlastných kampaní a skutočné hľadané výrazy.
 *
 * PREČO TEN ISTÝ SERVISNÝ ÚČET
 *
 * Google Ads dlho servisné účty nepustil bez Workspace domény a delegovania —
 * a pol internetu to tvrdí doteraz. Googlova vlastná dokumentácia hovorí, že
 * stačí pridať e-mail servisného účtu ako používateľa v Google Ads
 * (Správca → Prístup a zabezpečenie). **Overené 14. 8. 2026 skúškou:** Google
 * ten e-mail prijal na úrovni „Iba na čítanie", typ účtu „Nespravované",
 * bez Workspace a bez delegovania. Takže OAuth flow tu netreba.
 *
 * Chyba z Googlu sa aj tak vracia celá a neprepisuje sa na „spojenie zlyhalo" —
 * keď to Google raz zmení, bude to napísané v jej texte a nebudeme hádať.
 *
 * TRI HLAVIČKY, BEZ KTORÝCH TO NEJDE
 *
 * `developer-token` je token vývojára; `login-customer-id` je manažérsky účet,
 * cez ktorý sa k účtu inzerenta pristupuje; `authorization` je hodinový token.
 * Chýbajúca druhá hlavička dá chybu o oprávneniach, nie o hlavičke — preto sa
 * posiela vždy, keď manažérsky účet poznáme.
 *
 * ČO TENTO SÚBOR ZATIAĽ NEROBÍ
 *
 * Neťahá objem hľadania (plánovač kľúčových slov). Token na úrovni
 * „prieskumník" ho blokuje a Basic je v schvaľovaní. Keď príde, pridá sa
 * dopyt — tabuľky ani obrazovka sa prestavovať nebudú.
 */

const MESIACOV = 40;   // aj kampaň z mája 2023 má padnúť do rozsahu

type Hlavicky = Record<string, string>;

function hlavicky(token: string, devToken: string, manager: string): Hlavicky {
  const h: Hlavicky = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "developer-token": devToken,
  };
  if (manager) h["login-customer-id"] = manager;
  return h;
}

type Volanie = { ok: true; data: unknown } | { ok: false; chyba: string };

async function volaj(url: string, h: Hlavicky, telo?: unknown): Promise<Volanie> {
  try {
    const r = await fetch(url, {
      method: telo === undefined ? "GET" : "POST",
      headers: h,
      body: telo === undefined ? undefined : JSON.stringify(telo),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      // Google Ads vracia chyby v poli `error.details[].errors[].message`,
      // a práve tam je napísané, čo presne chýba. Prvá verzia napojenia na
      // Metu tieto vety zahadzovala a hľadanie príčiny trvalo hodiny.
      const e = (j as { error?: Record<string, unknown> })?.error || {};
      const detail = JSON.stringify((e as { details?: unknown }).details ?? "");
      const vnutro = /"message":"([^"]{4,300})"/.exec(detail)?.[1];
      const sprava = vnutro || String((e as { message?: unknown }).message || `HTTP ${r.status}`);
      return { ok: false, chyba: sprava.slice(0, 400) };
    }
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

const dopyt = (cid: string, gaql: string, h: Hlavicky) =>
  volaj(adsUrl(`customers/${cid}/googleAds:searchStream`), h, { query: gaql });

/** Zápis po dávkach — D1 neznesie tisíc príkazov naraz. */
async function zapisDavkami(DB: D1Database, prikazy: ReturnType<D1Database["prepare"]>[]): Promise<void> {
  for (let i = 0; i < prikazy.length; i += 50) {
    await DB.batch(prikazy.slice(i, i + 50) as never);
  }
}

export const Route = createFileRoute("/api/google-ads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const [kampani, dopytov, ucty] = await Promise.all([
            DB.prepare("SELECT COUNT(*) n FROM gads_kampane").first<{ n: number }>().catch(() => ({ n: 0 })),
            DB.prepare("SELECT COUNT(*) n FROM gads_dopyty").first<{ n: number }>().catch(() => ({ n: 0 })),
            DB.prepare("SELECT id, nazov, valuta, je_manager FROM gads_ucty ORDER BY je_manager DESC, nazov")
              .all().catch(() => ({ results: [] })),
          ]);
          const sa = await servisnyUcet(DB);
          return Response.json({
            ok: true,
            maToken: !!(await nastavenie(DB, "gads_dev_token")),
            manager: await nastavenie(DB, "gads_manager"),
            email: sa.ok ? sa.email : "",
            kampani: kampani?.n ?? 0,
            dopytov: dopytov?.n ?? 0,
            ucty: ucty?.results ?? [],
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
          // ── uloženie tokenu a manažérskeho účtu ────────────────────────
          if (b.akcia === "uloz-token") {
            const t = String(b.token || "").trim();
            const m = normCustomer(String(b.manager || ""));
            if (t && t.length < 20) {
              return Response.json(
                { ok: false, error: "Token vývojára má 22 znakov. Toto vyzerá na niečo iné." },
                { status: 400 },
              );
            }
            if (b.manager && !m) {
              return Response.json(
                { ok: false, error: "ID manažérskeho účtu je desať číslic (napr. 410-571-5629)." },
                { status: 400 },
              );
            }
            if (t) await ulozNastavenie(DB, "gads_dev_token", t);
            await ulozNastavenie(DB, "gads_manager", m);
            await audit(DB, {
              action: "nastavenie", predmet: "google_ads",
              neu: `token vývojára${m ? `, manažér ${m}` : ""}`,
              actor: (await currentUser(request)) || undefined,
            });
            return Response.json({
              ok: true,
              sprava: `Uložené. Teraz pridaj servisný účet ako používateľa v Google Ads: Správca → Prístup a zabezpečenie.`,
            });
          }

          const devToken = await nastavenie(DB, "gads_dev_token");
          if (!devToken) return Response.json({ ok: false, error: "chyba_token" }, { status: 400 });
          const manager = await nastavenie(DB, "gads_manager");

          const sa = await servisnyUcet(DB);
          if (!sa.ok) return Response.json({ ok: false, error: sa.chyba }, { status: 400 });

          const t = await ziskajToken(sa.sa, SCOPE_ADS);
          if (!t.ok) return Response.json({ ok: false, error: t.chyba }, { status: 502 });
          const h = hlavicky(t.token, devToken, manager);

          // ── skúška spojenia ───────────────────────────────────────────
          //
          // `listAccessibleCustomers` nepotrebuje ID účtu, takže oddelí
          // problém s prihlásením od problému so zlým ID. Bez toho by chyba
          // v jednom ukazovala na druhé.
          if (b.akcia === "test") {
            const r = await volaj(adsUrl("customers:listAccessibleCustomers"), h);
            if (!r.ok) return Response.json({ ok: false, error: r.chyba }, { status: 502 });
            const mena = ((r.data as { resourceNames?: string[] })?.resourceNames || [])
              .map((x) => x.replace("customers/", ""));
            return Response.json({
              ok: true,
              sprava: mena.length
                ? `Spojenie funguje. Servisný účet vidí ${mena.length} ${mena.length === 1 ? "účet" : "účty"}: ${mena.join(", ")}.`
                : "Google odpovedal, ale servisný účet nevidí žiadny účet — chýba mu prístup v Google Ads (Správca → Prístup a zabezpečenie).",
              ucty: mena,
            });
          }

          // ── stiahnutie ────────────────────────────────────────────────
          const od = odKedy(new Date(), MESIACOV);
          const teraz = new Date().toISOString();

          // Účty sa objavia samy. Prepisovanie ID z hlavy bolo pri Mete
          // zdrojom hodinového hľadania chyby.
          const zoznam: string[] = [];
          let valuta = "";
          if (manager) {
            const ru = await dopyt(manager, gaqlUcty(), h);
            if (!ru.ok) return Response.json({ ok: false, error: ru.chyba }, { status: 502 });
            const ucty = adsUcty(adsRiadky(ru.data));
            if (ucty.length) {
              await zapisDavkami(DB, ucty.map((u) => DB.prepare(
                `INSERT INTO gads_ucty (id, nazov, valuta, je_manager, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET nazov = excluded.nazov,
                   valuta = excluded.valuta, je_manager = excluded.je_manager,
                   updated_at = excluded.updated_at`,
              ).bind(u.id, u.nazov, u.valuta, u.jeManager ? 1 : 0, teraz)));
            }
            for (const u of ucty) if (!u.jeManager) zoznam.push(u.id);
            valuta = ucty.find((u) => !u.jeManager)?.valuta || ucty[0]?.valuta || "";
          }
          const ciel = zoznam.length ? zoznam : [manager].filter(Boolean);
          if (!ciel.length) {
            return Response.json(
              { ok: false, error: "Nie je z čoho ťahať — vlož ID manažérskeho účtu." },
              { status: 400 },
            );
          }

          let kampani = 0;
          let dopytovN = 0;
          const chyby: string[] = [];

          for (const cid of ciel) {
            const rk = await dopyt(cid, gaqlKampane(od), h);
            if (!rk.ok) { chyby.push(`kampane ${cid}: ${rk.chyba}`); continue; }
            const kampane = adsKampane(adsRiadky(rk.data));
            if (kampane.length) {
              await zapisDavkami(DB, kampane.map((k) => DB.prepare(
                `INSERT INTO gads_kampane
                   (id, campaign_id, nazov, typ, stav, mesiac, naklad, kliky, zobrazenia, konverzie, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET nazov = excluded.nazov, typ = excluded.typ,
                   stav = excluded.stav, naklad = excluded.naklad, kliky = excluded.kliky,
                   zobrazenia = excluded.zobrazenia, konverzie = excluded.konverzie,
                   updated_at = excluded.updated_at`,
              ).bind(
                `${k.campaignId}|${k.mesiac}`, k.campaignId, k.nazov, k.typ, k.stav,
                k.mesiac, k.naklad, k.kliky, k.zobrazenia, k.konverzie, teraz,
              )));
              kampani += kampane.length;
            }

            // Hľadané výrazy existujú len pre kampane vo vyhľadávaní. Prázdno
            // tu neznamená, že ľudia nič nehľadali — Display kampaň nevráti
            // ani riadok, hoci minula tie isté peniaze.
            const rd = await dopyt(cid, gaqlDopyty(od), h);
            if (!rd.ok) { chyby.push(`hľadané výrazy ${cid}: ${rd.chyba}`); continue; }
            const vyrazy = adsDopyty(adsRiadky(rd.data));
            if (vyrazy.length) {
              await zapisDavkami(DB, vyrazy.map((v) => DB.prepare(
                `INSERT INTO gads_dopyty (id, mesiac, dopyt, kliky, zobrazenia, naklad, konverzie, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET kliky = excluded.kliky,
                   zobrazenia = excluded.zobrazenia, naklad = excluded.naklad,
                   konverzie = excluded.konverzie, updated_at = excluded.updated_at`,
              ).bind(`${v.mesiac}|${v.dopyt}`, v.mesiac, v.dopyt, v.kliky, v.zobrazenia, v.naklad, v.konverzie, teraz)));
              dopytovN += vyrazy.length;
            }
          }

          if (valuta) await ulozNastavenie(DB, "gads_valuta", valuta);
          await audit(DB, {
            action: "import", predmet: "google ads",
            neu: `${kampani} riadkov kampaní, ${dopytovN} hľadaných výrazov`,
            actor: (await currentUser(request)) || undefined,
          });

          // Aj čiastočný úspech sa hlási ako čiastočný. „Stiahnuté" nad
          // polovicou dát je horšie než chyba, lebo sa k tomu nikto nevráti.
          return Response.json({
            ok: chyby.length === 0,
            sprava: `Stiahnuté — kampane: ${kampani} riadkov, hľadané výrazy: ${dopytovN}.`
              + (dopytovN === 0 ? " Žiadne hľadané výrazy: buď to neboli kampane vo vyhľadávaní, alebo sú starší ako to, čo Google drží." : ""),
            chyby,
            kampani, dopytov: dopytovN,
          }, chyby.length ? { status: 207 } : undefined);
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 400) }, { status: 500 });
        }
      },
    },
  },
});
