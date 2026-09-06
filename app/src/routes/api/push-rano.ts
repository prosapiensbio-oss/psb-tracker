import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { loadData } from "../../lib/psb/db.server";
import { temaDna } from "../../lib/psb/temaDna";
import { preTrenera, registerZoServera } from "../../lib/psb/registerServer";
import { posli, type Odber } from "../../lib/psb/push.server";
import { polozkaZastaranaBanka, polozkyBtcNesedi } from "../../lib/psb/penazneNotifikacie";
import { TRAINERS } from "../../lib/psb/compute";

// Ranná dávka notifikácií na telefón.
//
// Jerry, 3. 9. 2026: „keď ráno otvorím telefón ja alebo Terezka, chcem tam
// mať všetky notifikácie — pre Terezku Terezkine, pre mňa moje."
//
// PREČO JEDNA SPRÁVA A NIE DESAŤ
//
// Osem samostatných pushov ráno je osem zabzučaní a druhý deň si ich človek
// vypne. Preto ide JEDNA správa a všetko je v nej: prvých päť riadkov vidno
// na zamknutej obrazovke, zvyšok po rozbalení. Je to ten istý princíp ako
// v registri — keď svieti všetko, nesvieti nič.
//
// PREČO SA POČÍTA NA SERVERI
//
// Register dovtedy vznikal len v prehliadači. Ráno ho ale nemá kto vykresliť,
// takže sa počíta tu — z tých istých funkcií, aké používa obrazovka
// (`registerZoServera`). Keby to boli dva rôzne výpočty, telefón by hlásil
// niečo iné než appka.

const KONTAKT = "mailto:prosapiensbio@gmail.com";
/** Koľko riadkov sa vojde do tela správy, kým sa zvyšok zhrnie číslom. */
const V_SPRAVE = 5;

async function kluce(DB: D1Database) {
  const rs = await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all();
  const m: Record<string, string> = {};
  for (const r of rs.results as { key: string; value: string }[]) m[r.key] = r.value;
  return { verejny: m.vapid_public || "", sukromny: m.vapid_private || "", kontakt: KONTAKT };
}

/** Meno konta (jerry/terezka) na meno trénera, ako ho pozná register. */
const trenerKonta = (kto: string) => TRAINERS.find((t) => t.toLowerCase() === kto.trim().toLowerCase()) || "";

/**
 * Bitcoinové platby z druhej appky — podpísané tak isto ako v `/api/btc-reserve`.
 *
 * Prehliadač si tam chodí cez podpísanú adresu; worker si ju vie podpísať sám,
 * takže na ranný beh netreba nikoho otvoreného. Keď to zlyhá, vráti prázdno a
 * bitcoinová kontrola sa ticho preskočí — chýbajúce upozornenie je lepšie než
 * ranná správa, ktorá nepríde vôbec.
 */
async function btcPlatby(): Promise<{ klient: string | null; datum: string; czk: number | null; sats?: number }[]> {
  try {
    const token = (bindings() as { BTC_RESERVE_TOKEN?: string }).BTC_RESERVE_TOKEN;
    if (!token) return [];
    const exp = Date.now() + 60_000;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`exp=${exp}`)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const r = await fetch(`https://btc.prosapiensbio.workers.dev/api/reserve?exp=${exp}&sig=${sig}&platby=1`);
    if (!r.ok) return [];
    const j = (await r.json()) as { platby?: { klient: string | null; datum: string; czk: number | null; sats?: number }[] };
    return j.platby || [];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/api/push-rano")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { DB, KAL_CRON_TOKEN } = bindings() as { DB?: D1Database; KAL_CRON_TOKEN?: string };
        const dany = request.headers.get("x-cron-token") || "";
        const token = KAL_CRON_TOKEN || "";
        if (!token || token.length !== dany.length || token !== dany) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {

        const k = await kluce(DB);
        if (!k.verejny || !k.sukromny) return Response.json({ ok: false, error: "chybaju_kluce" }, { status: 500 });

        // Odbery najprv: keď nikto nie je prihlásený, netreba počítať register
        // ani čítať 4 916 riadkov z databázy.
        const odbery = (await DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all())
          .results as unknown as (Odber & { kto: string })[];
        if (!odbery.length) return Response.json({ ok: true, poslane: 0, dovod: "ziadne_odbery" });

        const data = await loadData(DB);
        const od = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 16);
        const do_ = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16);
        const [ud, zm] = await DB.batch([
          DB.prepare("SELECT zaciatok, klient, typ, nazov, trener, zmizla_at FROM kal_udalosti WHERE zmizla_at IS NULL AND zaciatok >= ? AND zaciatok <= ? ORDER BY zaciatok").bind(od, do_),
          DB.prepare("SELECT kedy, trener, druh, nazov, klient, pred, po, vysvetlene, poznamka FROM kal_zmeny ORDER BY kedy DESC LIMIT 300"),
        ]);

        // ── Peňažné upozornenia ────────────────────────────────────────
        //
        // Jerry, 3. 9. 2026: „doplň aj tie peňažné notifikácie." Sú jeho a sú
        // to tie, kvôli ktorým sa ráno pozerá — chýbajúci výpis znamená P&L
        // bez nákladov, nesedaci bitcoin znamená peniaze bez stopy.
        //
        // Posledný pohyb sa berie JEDNÝM dopytom (MAX), nie načítaním celej
        // tabuľky: 658 riadkov navyše by v rannom behu nebolo treba a limit
        // D1 sme už raz minuli.
        const poslednyPohyb = await DB.prepare(
          "SELECT MAX(substr(date,1,10)) d FROM fio_transactions WHERE typ <> 'hotovosť'",
        ).first<{ d: string | null }>();
        const penazne = [
          polozkaZastaranaBanka(poslednyPohyb?.d || "", data.anomalyAck || {}),
          ...polozkyBtcNesedi(data.payments, await btcPlatby(), data.anomalyAck || {}),
        ].filter(Boolean) as ReturnType<typeof polozkyBtcNesedi>;

        // Týždenné a mesačné zápisy — bez nich by v rannej správe chýbali
        // rituály (mesačné kontroly, týždenná únava, uzávierka). Dve malé
        // tabuľky, pár desiatok riadkov.
        const [wk, mn, sp] = await DB.batch([
          DB.prepare("SELECT week, data FROM vzas_week_notes ORDER BY week DESC LIMIT 12"),
          DB.prepare("SELECT month, note, answers FROM vzas_month_notes ORDER BY month DESC LIMIT 6"),
          DB.prepare("SELECT value FROM vzas_settings WHERE key='stav_penazi'"),
        ]);
        // Dátum posledného zapísaného stavu hotovosti — pre pripomienku na
        // uzávierku (Jerry, 6. 9. 2026). Bez neho by rituál nevedel, či je stav
        // ku koncu mesiaca už spočítaný.
        let stavDatum: string | undefined;
        try {
          const raw = (sp.results as unknown as { value: string }[])[0]?.value;
          const v = raw ? (JSON.parse(raw) as { datum?: string }) : null;
          if (v?.datum) stavDatum = v.datum;
        } catch { /* prázdne */ }
        const weeks: Record<string, Record<string, string>> = {};
        for (const r of wk.results as unknown as { week: string; data: string }[]) {
          try { weeks[r.week] = JSON.parse(r.data || "{}"); } catch { weeks[r.week] = {}; }
        }
        const mesiace: Record<string, { note?: string; answers?: Record<string, string> }> = {};
        for (const r of mn.results as unknown as { month: string; note: string; answers: string }[]) {
          let answers: Record<string, string> = {};
          try { answers = JSON.parse(r.answers || "{}"); } catch { /* prázdne */ }
          mesiace[r.month] = { note: r.note || "", answers };
        }

        const register = penazne.concat(registerZoServera(data, {
          udalosti: (ud.results as unknown as Record<string, unknown>[]).map((u) => ({
            zaciatok: String(u.zaciatok), klient: (u.klient as string) || null, typ: (u.typ as string) || null,
            nazov: String(u.nazov || ""), trener: String(u.trener || ""), zmizlaAt: null,
          })),
          zmeny: zm.results as never,
        }, new Date(), { weeks, mesiace, stavDatum }));

        // ── Téma na dnešné hovorené video ──────────────────────────────
        //
        // Jerry, 3. 9. 2026: „chcel by som, aby mi každý deň vyskakoval nejaký
        // nápad alebo téma… keď mám čas a priestor, nemusím nič vymýšľať."
        //
        // Nie je to úloha a nesmie tak vyzerať — preto stojí NA KONCI správy,
        // za vecami, ktoré si naozaj pýtajú akciu, a nezapočítava sa do ich
        // počtu. Deň, keď Jerry video nenakrúti, nie je deň s nesplnenou úlohou.
        //
        // Zdroj sa číta jedným dopytom s LIMITom: `gads_dopyty` má 16 587
        // riadkov a načítať ich celé raz denne by bolo zbytočné míňanie
        // limitu D1 (minuli sme ho už dvakrát).
        const [hl, np] = await DB.batch([
          // BEZ `GROUP BY`. Zoskupovanie prinútilo SQLite prejsť a zoradiť
          // všetkých 16 587 riadkov a worker to spolu s načítaním klientov
          // v tej istej požiadavke neutiahol (3. 9. 2026, HTTP 500).
          // Index na `zobrazenia` robí z tohto čítanie 150 riadkov z konca.
          // Duplicitné vety nevadia — vyberá sa jedna a rovnaká veta dvakrát
          // v poradí len mierne zvýši jej šancu, čo pri najhľadanejších
          // dopytoch nie je chyba.
          DB.prepare(`SELECT dopyt, zobrazenia FROM gads_dopyty
                       WHERE LENGTH(dopyt) > 14 ORDER BY zobrazenia DESC LIMIT 150`),
          // Druh nápadu je v stĺpci `zdroj` („otázka klienta", „môj nápad",
          // „iné"), nie `druh` — na to som 3. 9. 2026 doplatil piatimi
          // stovkami: worker spadol na `no such column`, a keďže odpoveď
          // zabalí Cloudflare do svojej chybovej stránky, zvonku to vyzeralo
          // ako limit CPU. Prvý pohľad má patriť logu, nie domnienke.
          DB.prepare(`SELECT text, zdroj FROM mkt_napady
                       WHERE TRIM(COALESCE(text,'')) <> '' ORDER BY id DESC LIMIT 60`),
        ]);
        const tema = temaDna({
          hladania: (hl.results as unknown as { dopyt: string; zobrazenia: number }[]),
          napady: (np.results as unknown as { text: string; zdroj?: string }[])
            .map((n) => ({ text: n.text, druh: n.zdroj })),
        });

        const vysledky: { kto: string; poloziek: number; ok: boolean; status: number }[] = [];
        for (const o of odbery) {
          const trener = trenerKonta(o.kto);
          // Konto, ktoré nie je tréner (napr. spoločné „app"), dostane všetko —
          // radšej o riadok viac než ticho pri niekom, koho filter nepozná.
          const moje = preTrenera(register, data, trener || "all");
          // Pokojné ráno = žiadna správa… okrem Jerryho, ktorý si vypýtal
          // tému KAŽDÝ DEŇ. Bez tejto výnimky by mu inšpirácia prišla len
          // v dňoch, keď je aj niečo pokazené — teda presne naopak, než má
          // zmysel: čas na nakrúcanie býva vtedy, keď je pokoj.
          const jeJerry = trener === "Jerry" || !trener;
          if (!moje.length && !jeJerry) { vysledky.push({ kto: o.kto, poloziek: 0, ok: true, status: 0 }); continue; }

          const riadky = moje.slice(0, V_SPRAVE).map((r) => `• ${r.title}`);
          const zvysok = moje.length - riadky.length;
          const v = await posli(o, {
            titulok: moje.length
              ? `Kokpit: ${moje.length} ${moje.length === 1 ? "vec" : moje.length < 5 ? "veci" : "vecí"} na dnes`
              : "Kokpit: dnes nič nehorí",
            // Téma ide LEN Jerrymu — hovorené videá nakrúca on. Terezke by
            // to bol riadok, s ktorým nemá čo robiť.
            text: (riadky.length ? riadky.join("\n") + (zvysok > 0 ? `\n…a ďalších ${zvysok}` : "") : "")
              + (jeJerry ? `${riadky.length ? "\n\n" : ""}🎥 Téma na dnes: ${tema.tema}` : ""),
            url: "/#dashboard",
            // Rovnaká značka = ranná správa NAHRADÍ včerajšiu, ak ju človek
            // nechal ležať. Dve rovnaké na zamknutej obrazovke nikto nečíta.
            znacka: "rano",
          }, k);
          if (v.mrtvy) await DB.prepare("DELETE FROM push_odbery WHERE endpoint = ?1").bind(o.endpoint).run();
          else await DB.prepare("UPDATE push_odbery SET posledne_ok = ?2, chyba = ?3 WHERE endpoint = ?1")
            .bind(o.endpoint, v.ok ? new Date().toISOString() : null, v.ok ? null : (v.chyba || "chyba")).run();
          vysledky.push({ kto: o.kto, poloziek: moje.length, ok: v.ok, status: v.status });
        }

        return Response.json({ ok: true, odberov: odbery.length, vysledky });
        } catch (e) {
          // Neosetrena vynimka tu znamena, ze Cloudflare vrati SVOJU HTML
          // stranku „This page didn't load“ — a ta pricinu uplne zakryje.
          // 3. 9. 2026 ma to stalo hodinu: `no such column: druh` vyzeralo
          // zvonku ako limit CPU. Endpoint, ktory bezi bez cloveka, musi
          // povedat, co sa mu stalo. (CLAUDE.md: nikdy nehlas len stavovy kod.)
          console.error("push-rano zlyhalo:", e);
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
