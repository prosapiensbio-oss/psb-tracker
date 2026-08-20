import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { posliLead } from "../../lib/psb/capi";
import { bindings } from "../../lib/bindings.server";

/**
 * Dopyt z webového formulára (Contact Form 7 na prosapiens.cz).
 *
 * PREČO TENTO ENDPOINT EXISTUJE
 *
 * Contact Form 7 nič neukladá — pošle e-mail a tým to preň končí. Schránka sa
 * nedá spočítať: z e-mailov sa nezistí, koľko dopytov prišlo v júli, koľko
 * z nich trénovalo ani aká je konverzia. Preto sa všetkých 37 dopytov od
 * januára 2026 prepisovalo ručne.
 *
 * A hlavne: v e-maile NIE JE KAMPAŇ. Informácia „z ktorej reklamy tento človek
 * prišiel" žije len v adrese v momente kliknutia (utm_* parametre). Keď ju
 * formulár nezachytí a nepošle sem, je nenávratne preč a spojenie medzi
 * vynaloženými peniazmi a klientom sa už spätne nezostaví.
 *
 * PREČO NIE JE ZA PRIHLÁSENÍM
 *
 * Volá to WordPress, nie prehliadač s reláciou. Namiesto hesla je zdieľané
 * tajomstvo v `vzas_settings` pod kľúčom `web_lead_secret` — appka ho vygeneruje
 * a Jerry ho skopíruje do snippetu na webe. Bez neho by ktokoľvek, kto adresu
 * uhádne, vedel appku zaplniť vymyslenými dopytmi.
 *
 * IDEMPOTENCIA
 *
 * Kľúčom je `id` odvodené z e-mailu a dňa. Keď CF7 pošle to isté dvakrát
 * (retry, dvojklik na tlačidlo), vznikne jeden dopyt, nie dva.
 */

/**
 * Zdroj sa odvodí z UTM, nie z toho, čo príde v tele — web o sebe nevie, či
 * ho práve niekto našiel cez reklamu alebo cez Google.
 *
 * Poradie je zámerné: platená reklama má prednosť pred organickým zdrojom.
 * Keď človek klikne na instagramovú reklamu, je to „reklama", nie „instagram" —
 * inak by sa platený a neplatený Instagram zliali a nedalo by sa povedať,
 * čo priniesli peniaze.
 */
function zdrojZUtm(utmSource: string, utmMedium: string, referer: string): string {
  const m = utmMedium.toLowerCase();
  const s = utmSource.toLowerCase();
  if (m.includes("cpc") || m.includes("paid") || m.includes("ppc") || s.includes("meta") || s.includes("fb")) return "reklama";
  if (s.includes("instagram") || s.includes("ig")) return "instagram";
  if (s.includes("google")) return "google";
  if (s) return "ine";
  const r = referer.toLowerCase();
  if (r.includes("instagram")) return "instagram";
  if (r.includes("google")) return "google";
  // Bez UTM aj bez odkazovača: človek prišiel priamo alebo si adresu uložil.
  return "web";
}

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const Route = createFileRoute("/api/lead-web")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let b: Record<string, unknown>;
        try {
          b = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }

        // Tajomstvo z hlavičky aj z tela — WordPress snippety posielajú raz tak,
        // raz onak a padnúť na tomto by bola zbytočná strata dopytu.
        const dane = request.headers.get("x-psb-secret") || kus(b.secret, 200);
        const ulozene = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'web_lead_secret'")
          .first<{ value: string }>();
        const ocakavane = ulozene?.value ? String(JSON.parse(ulozene.value)) : "";
        if (!ocakavane || dane !== ocakavane) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const meno = kus(b.name, 120);
        const email = kus(b.email, 160);
        const telefon = kus(b.phone ?? b.telefon, 40);
        if (!meno && !email && !telefon) {
          return Response.json({ ok: false, error: "prazdny_dopyt" }, { status: 400 });
        }

        const utmSource = kus(b.utm_source, 80);
        const utmMedium = kus(b.utm_medium, 80);
        const utmCampaign = kus(b.utm_campaign, 120);
        const referer = kus(b.referer, 300);
        const utm = [
          utmSource && `source=${utmSource}`,
          utmMedium && `medium=${utmMedium}`,
          utmCampaign && `campaign=${utmCampaign}`,
          kus(b.utm_content, 80) && `content=${kus(b.utm_content, 80)}`,
          kus(b.utm_term, 80) && `term=${kus(b.utm_term, 80)}`,
        ].filter(Boolean).join(" · ");

        const dnes = new Date().toISOString().slice(0, 10);
        // Ten istý človek v ten istý deň = jeden dopyt. Dvojklik na tlačidlo
        // ani opakovaný pokus CF7 nesmie vyrobiť dva riadky.
        /**
         * Kľúč smie prísť z webu.
         *
         * Je to zároveň `event_id` pre Metu — a odstránenie duplicít funguje
         * len vtedy, keď majú prehliadač a server ROVNAKÝ reťazec. Keby si
         * ho každá strana počítala sama, stačí iné časové pásmo okolo polnoci
         * a Meta započíta dopyt dvakrát. Tvar sa kontroluje, aby sa cez toto
         * pole nedal podstrčiť cudzí kľúč.
         */
        const zWebu = kus(b.id, 64);
        const kluc = /^web-\d{4}-\d{2}-\d{2}-.+/.test(zWebu)
          ? zWebu
          : `web-${dnes}-${(email || telefon || meno).toLowerCase()}`.slice(0, 64);

        await DB.prepare(
          `INSERT INTO leads (id,date,name,source,referrer,status,note,created_at,email,telefon,kampan,utm,stranka)
           VALUES (?1,?2,?3,?4,'',?5,?6,?7,?8,?9,?10,?11,?12)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, telefon=excluded.telefon,
             note=excluded.note, kampan=excluded.kampan, utm=excluded.utm, stranka=excluded.stranka`,
        )
          .bind(
            kluc, dnes, meno || email || telefon,
            zdrojZUtm(utmSource, utmMedium, referer),
            "novy",
            kus(b.message ?? b.sprava, 500),
            new Date().toISOString(),
            email, telefon, utmCampaign, utm, kus(b.page ?? b.stranka, 300),
          )
          .run();

        // ── ohlásenie Mete ────────────────────────────────────────────────
        //
        // Až tu, po zápise. Dopyt je v Kokpite bez ohľadu na to, či sa hlásenie
        // podarí — radšej dopyt bez konverzie než konverzia bez dopytu.
        //
        // K 13. 8. 2026 nemal pixel ani jednu funkčnú konverziu: sedem vlastných
        // visí na mŕtvom pixeli a tá jediná na živom nedostala nikdy žiadnu
        // udalosť. Toto je prvá cesta, ktorou sa Meta o dopyte naozaj dozvie —
        // a ide zo servera, takže funguje aj pri odmietnutých cookies.
        let capi = "";
        const nast = await DB.prepare(
          "SELECT key, value FROM vzas_settings WHERE key IN ('meta_capi_token','meta_pixel_id')",
        ).all();
        const m: Record<string, string> = {};
        for (const r of (nast.results as { key: string; value: string }[]) || []) {
          try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
        }
        if (m.meta_capi_token && m.meta_pixel_id) {
          const v = await posliLead(m.meta_pixel_id, m.meta_capi_token, {
            id: kluc,
            email, telefon,
            stranka: kus(b.page ?? b.stranka, 300),
            // `_fbc` a `_fbp` posiela web, ak ich vie prečítať z cookies.
            fbc: kus(b.fbc, 200) || undefined,
            fbp: kus(b.fbp, 200) || undefined,
            // WordPress volá tento endpoint zo SVOJHO servera na Kokpitov
            // server — `cf-connecting-ip` by preto bola IP webhostingu, nie
            // návštevníka. Web preto posiela skutočnú IP v tele; hlavička je
            // len záloha pre volania, ktoré ju v tele nemajú.
            ip: kus(b.ip, 45) || request.headers.get("cf-connecting-ip") || undefined,
            userAgent: kus(b.userAgent ?? request.headers.get("user-agent"), 300) || undefined,
          });
          capi = v.ok ? " · nahlásené Mete" : ` · Mete sa nenahlásilo: ${v.chyba}`;
        }

        await audit(DB, {
          action: "dopyt-z-webu",
          predmet: kluc,
          neu: ([meno, email, utmCampaign].filter(Boolean).join(" · ") + capi).slice(0, 300),
          actor: "web",
        });

        return Response.json({ ok: true, id: kluc, meta: capi.trim() });
      },
    },
  },
});
