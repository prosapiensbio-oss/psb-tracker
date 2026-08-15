import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { nastavenie, ulozNastavenie } from "../../lib/psb/googleAuth.server";
import { poradieMerania, riadokZOdpovede } from "../../lib/psb/pagespeed";

/**
 * Meranie rýchlosti stránok cez PageSpeed Insights.
 *
 * PREČO PO TROCH A NIE VŠETKY NARAZ
 *
 * Jedno meranie trvá 10–30 sekúnd: Google si stránku naozaj otvorí
 * v prehliadači a odsimuluje pomalé mobilné pripojenie. Dvadsať stránok krát
 * dve zariadenia je pol hodiny — request by vypršal a v tabuľke by zostala
 * náhodná polovica. Preto sa meria po troch a hlási sa, koľko zostáva.
 *
 * PREČO NIE VŠETKÝCH 79 STRÁNOK
 *
 * Pri stránke, ktorú Google nikdy nikomu neukázal, je jej rýchlosť údaj bez
 * akcie. Poradie určuje počet zobrazení zo Search Console — meria sa to, čo
 * ľudia naozaj vidia. `poradieMerania()` s tým počíta.
 *
 * PREČO API KĽÚČ A NIE SERVISNÝ ÚČET
 *
 * PageSpeed Insights je jediná Google služba v Kokpite, ktorá nepracuje
 * s OAuth tokenom servisného účtu — nemá čo autorizovať, meria verejnú
 * stránku. Chce obyčajný API kľúč a bez neho beží tiež, len s tvrdým
 * obmedzením, na ktoré sa pri dvadsiatich stránkach narazí.
 */

const KLUC = "psi_api_key";
const DAVKA = 3;
const STRATEGIE = ["mobile", "desktop"] as const;
const CIEL_STRANOK = 20;

async function zmeraj(url: string, strategia: string, apiKey: string): Promise<{ telo: unknown; chyba: string }> {
  const p = new URLSearchParams({ url, strategy: strategia });
  for (const k of ["performance", "seo", "accessibility", "best-practices"]) p.append("category", k);
  if (apiKey) p.set("key", apiKey);
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${p}`, {
      signal: AbortSignal.timeout(90000),
    });
    const text = await r.text();
    let telo: unknown = null;
    try { telo = JSON.parse(text); } catch { /* nižšie */ }
    // Nerozobraná odpoveď je stále stopa; „HTTP 429" nie je nič.
    if (!telo) return { telo: null, chyba: `HTTP ${r.status}: ${text.slice(0, 200)}` };
    return { telo, chyba: "" };
  } catch (e) {
    return { telo: null, chyba: String(e).slice(0, 200) };
  }
}

export const Route = createFileRoute("/api/pagespeed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const kluc = await nastavenie(DB, KLUC);
          const r = await DB.prepare(
            `SELECT COUNT(DISTINCT url) stranok, COUNT(*) merani, MAX(merane_at) naposledy
               FROM web_rychlost WHERE chyba = ''`,
          ).first<{ stranok: number; merani: number; naposledy: string | null }>().catch(() => null);
          return Response.json({
            ok: true,
            // Kľúč sa nikdy nevracia, ani skrátený — von ide len to, či tam je.
            maKluc: Boolean(kluc),
            stranok: r?.stranok ?? 0,
            merani: r?.merani ?? 0,
            naposledy: r?.naposledy ?? null,
            ciel: CIEL_STRANOK,
          });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown> = {};
        try { b = (await request.json()) as Record<string, unknown>; } catch { /* prázdne telo je v poriadku */ }

        try {
          if (b.akcia === "kluc") {
            const v = String(b.kluc || "").trim();
            await ulozNastavenie(DB, KLUC, v);
            return Response.json({ ok: true, sprava: v ? "Kľúč uložený." : "Kľúč vymazaný." });
          }

          const apiKey = await nastavenie(DB, KLUC);

          // 1 · ktoré stránky merať. Poradie podľa toho, koľko ľudí ich vidí.
          const stranky = await DB.prepare("SELECT url FROM web_stranky WHERE text <> ''").all<{ url: string }>();
          if (!stranky.results?.length) {
            return Response.json(
              { ok: false, error: "Najprv treba prečítať text webu — bez neho neviem, ktoré stránky merať." },
              { status: 409 },
            );
          }
          const gsc = await DB.prepare("SELECT url, zobrazenia FROM gsc_strany").all<{ url: string; zobrazenia: number }>()
            .catch(() => ({ results: [] as { url: string; zobrazenia: number }[] }));
          const chcememe = poradieMerania(stranky.results, gsc.results || [], CIEL_STRANOK);

          // 2 · čo z toho ešte nie je zmerané. „obnov" zmeria všetko znova —
          // presne na to, aby sa dalo porovnať pred a po zmene na webe.
          const hotove = new Set<string>();
          if (b.akcia !== "obnov") {
            const uz = await DB.prepare(
              `SELECT url, strategia FROM web_rychlost WHERE chyba = '' GROUP BY url, strategia`,
            ).all<{ url: string; strategia: string }>().catch(() => ({ results: [] as { url: string; strategia: string }[] }));
            for (const u of uz.results || []) hotove.add(`${u.url}|${u.strategia}`);
          }

          const fronta: { url: string; strategia: string }[] = [];
          // Mobil pre všetky stránky prv než počítač pre ktorúkoľvek: indexuje
          // sa podľa mobilu a chodí z neho väčšina ľudí. Keby to bolo po
          // stránkach, po polovici merania by bola polovica webu nezmeraná
          // na tom zariadení, ktoré rozhoduje.
          for (const s of STRATEGIE) {
            for (const url of chcememe) {
              if (!hotove.has(`${url}|${s}`)) fronta.push({ url, strategia: s });
            }
          }

          const teraz = new Date().toISOString();
          let ulozene = 0;
          const chyby: string[] = [];
          for (const u of fronta.slice(0, DAVKA)) {
            const { telo, chyba } = await zmeraj(u.url, u.strategia, apiKey);
            const r = chyba
              ? { ...riadokZOdpovede({}, u.url, u.strategia, teraz), chyba }
              : riadokZOdpovede(telo, u.url, u.strategia, teraz);
            await DB.prepare(
              `INSERT INTO web_rychlost
                 (url, strategia, merane_at, vykon, seo, pristupnost, postupy,
                  lcp_ms, cls, tbt_ms, fcp_ms, prilezitosti, chyba)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
            ).bind(
              r.url, r.strategia, r.meraneAt, r.vykon, r.seo, r.pristupnost, r.postupy,
              r.lcpMs, r.cls, r.tbtMs, r.fcpMs, JSON.stringify(r.prilezitosti), r.chyba,
            ).run();
            if (r.chyba) chyby.push(`${u.url.replace("https://www.prosapiens.cz/", "")} (${u.strategia}): ${r.chyba.slice(0, 90)}`);
            else ulozene++;
          }

          const zostava = Math.max(0, fronta.length - DAVKA);
          await audit(DB, {
            action: "import", predmet: "rýchlosť stránok",
            neu: `${ulozene} meraní, zostáva ${zostava}`,
            actor: (await currentUser(request)) || undefined,
          });

          return Response.json({
            ok: chyby.length === 0,
            sprava: fronta.length === 0
              ? "Všetky stránky sú zmerané."
              : `Zmerané: ${ulozene}.` + (zostava > 0
                ? ` Zostáva ${zostava} meraní — klikni znova. Jedno trvá 10–30 s, preto po troch.`
                : " Hotovo, ďalej už netreba."),
            chyby, ulozene, zostava,
            maKluc: Boolean(apiKey),
          }, chyby.length ? { status: 207 } : undefined);
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 400) }, { status: 500 });
        }
      },
    },
  },
});
