import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../../lib/bindings.server";
import { posliLead } from "../../lib/psb/capi";
import { kategoriaHooku, krstneMenaKlientov } from "../../lib/psb/hook";
import { MIN_DENNE_KC, UCET_REKLAM, adsManagerOdkaz, jeUcetReklam, pripravKampan, pripravSadu, skontrolujPredSpustenim, stavDorucovania, type StavKampanePredSpustenim } from "../../lib/psb/kampanPlan";
import { OKNO_DNI, stavPristupu } from "../../lib/psb/metaPristup";
import { jeFaza } from "../../lib/psb/mapaCyklu";

/**
 * Meta Graph API — reklama a Instagram.
 *
 * PREČO TO STOJÍ ZA TO
 *
 * Ads Manager vie povedať cenu za preklik a za odoslaný formulár. NIKDY
 * nepovie cenu za klienta, ktorý zostal pol roka — nevie, kto sa ním stal.
 * Kokpit má oba konce: výdavok z Mety a klienta z PTmindera. Toto je miesto,
 * kde sa tie dve polovice stretnú.
 *
 * TOKEN NEOPÚŠŤA SERVER
 *
 * Leží v `vzas_settings` pod kľúčom `meta_token` a číta ho len tento súbor.
 * Do prehliadača sa nikdy neposiela — ani skrátený. Jerry ho vloží cez pole
 * v Údajoch, appka si ho uloží a odvtedy ho nikto nevidí.
 *
 * PREČO SÚ INSTAGRAMOVÉ ČÍSLA V INEJ TABUĽKE NEŽ METRICOOLOVÉ
 *
 * Merajú sa mierne inak — iné okno, iné zaokrúhlenie, iná definícia dosahu.
 * Keby sa miešali do `mkt_prispevky`, nedalo by sa povedať, ktorý zdroj ktoré
 * číslo dal, a pri prvom rozpore by sa nedalo rozhodnúť, ktorému veriť.
 */

/**
 * Verzia Graph API.
 *
 * Meta staré verzie po čase vypína. Keď endpoint začne vracať chybu o verzii,
 * stačí zdvihnúť toto číslo — nikde inde sa verzia nepíše.
 */
const V = "v21.0";

/**
 * Ktoré akcie z Mety sú dopyt.
 *
 * Meta vracia pod `actions` desiatky typov naraz a väčšina z nich nie je
 * konverzia: prehratie videa, zobrazenie stránky, reakcia na príspevok.
 *
 * A hlavne — TÚ ISTÚ konverziu vracia niekoľkokrát pod rôznymi menami.
 * Máj 2025, 235 registrácií, prišlo päťkrát:
 *
 *   complete_registration                            235
 *   omni_complete_registration                       235
 *   offsite_conversion.fb_pixel_complete_registration 235
 *   offsite_complete_registration_add_meta_leads      235
 *   offsite_complete_registration_add_20_s_calls      235
 *
 * Prvá verzia brala vzorku podľa konca názvu a sčítala tri z nich — mesiac
 * potom hlásil 705 dopytov namiesto 235. Preto NIE vzorka, ale výslovný
 * zoznam holých mien. Každý `omni_`, `offsite_` a `offsite_conversion.`
 * variant je duplikát toho istého a musí zostať vonku.
 */
const DOPYT = new Set(["lead", "complete_registration", "submit_application"]);

type Nastavenie = { token: string; adAccount: string; igUser: string };

async function nacitajNastavenie(DB: D1Database): Promise<Nastavenie> {
  const rs = await DB.prepare(
    "SELECT key, value FROM vzas_settings WHERE key IN ('meta_token','meta_ad_account','meta_ig_user')",
  ).all();
  const m: Record<string, string> = {};
  for (const r of rs.results as { key: string; value: string }[]) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  return { token: m.meta_token || "", adAccount: m.meta_ad_account || "", igUser: m.meta_ig_user || "" };
}

/** Volanie Graphu. Chyby vracia ako text, nie ako výnimku — nech ich vidí človek. */
/**
 * Počítadlo volaní do Marketing API.
 *
 * Databáza sa nesie v premennej modulu, lebo `graph` a `graphPost` sú
 * volané z dvadsiatich miest a pretláčať cez ne DB by znamenalo prepísať
 * všetky. Ukladá sa súčet za deň a zápis je „fire and forget" — keby zlyhal,
 * nesmie zhodiť sťahovanie dát. Počítadlo je pomôcka, nie dáta.
 */
let DB_PRE_POCITADLO: D1Database | null | undefined = null;

function zapisVolanie(ok: boolean): void {
  const DB = DB_PRE_POCITADLO;
  if (!DB) return;
  const den = new Date().toISOString().slice(0, 10);
  void DB.prepare(
    `INSERT INTO meta_volania (den, volani, chyb) VALUES (?1, 1, ?2)
     ON CONFLICT(den) DO UPDATE SET volani = volani + 1, chyb = chyb + ?2`,
  ).bind(den, ok ? 0 : 1).run().catch(() => {});
}

/** To isté ako `graph`, len zápis. Telo ide ako JSON, nie ako query. */
async function graphPost(cesta: string, telo: Record<string, unknown>, token: string): Promise<{ ok: boolean; data?: unknown; chyba?: string }> {
  try {
    // Graph berie POST ako formulár, nie ako JSON. Pri JSON tele odpovedal
    // 19. 8. 2026 hláškou „Unsupported post request. Object with ID
    // act_… does not exist, cannot be loaded due to missing permissions" —
    // teda vetou o právach, hoci šlo o tvar požiadavky. Polia a objekty idú
    // ako reťazec s JSON vnútri, tak to Graph očakáva.
    const telo2 = new URLSearchParams();
    for (const [k, v] of Object.entries(telo)) {
      if (v === undefined || v === null) continue;
      telo2.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    telo2.set("access_token", token);
    const r = await fetch(`https://graph.facebook.com/${V}/${cesta}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: telo2.toString(),
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const e = (j.error || {}) as Record<string, unknown>;
      zapisVolanie(false);
      return { ok: false, chyba: `${e.error_user_msg || e.message || `HTTP ${r.status}`}` };
    }
    zapisVolanie(true);
    return { ok: true, data: j };
  } catch (e) {
    zapisVolanie(false);
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

async function graph(cesta: string, token: string): Promise<{ ok: boolean; data?: unknown; chyba?: string }> {
  const spojka = cesta.includes("?") ? "&" : "?";
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${cesta}${spojka}access_token=${encodeURIComponent(token)}`);
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const e = (j.error || {}) as Record<string, unknown>;
      zapisVolanie(false);
      return { ok: false, chyba: `${e.type || "chyba"}: ${e.message || `HTTP ${r.status}`}` };
    }
    zapisVolanie(true);
    return { ok: true, data: j };
  } catch (e) {
    zapisVolanie(false);
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

export const Route = createFileRoute("/api/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        DB_PRE_POCITADLO = DB;
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
        // Príspevky sa pýtajú zvlášť: je ich stovky a obrazovka s kampaňami
        // ich nepotrebuje. Jedna odpoveď so všetkým by bola pri každom otvorení
        // Marketingu pol megabajtu za nič.
        if (new URL(request.url).searchParams.get("co") === "instagram") {
          // Text sa dopĺňa z metricoolovej tabuľky podľa DŇA publikovania.
          //
          // Graph API vracia `caption`, ale príspevky stiahnuté pred 12. 8.
          // ho nemajú a reels sponzorované cez Ads ho občas nemajú vôbec.
          // Metricool ten istý príspevok pozná — a bez tohto spojenia by
          // v zozname stálo „(bez textu)" pri riadku, ktorého text je
          // v susednej tabuľke na tej istej obrazovke.
          //
          // Páruje sa na deň, nie na presný čas: obidva zdroje uvádzajú iné
          // pásmo a rovnaký príspevok by sa o hodinu minul.
          // `view_rate` a `watch_time` sa doťahujú z Metricoolu podľa DŇA.
          //
          // Graph API ich nedáva a sú to jediné čísla, ktoré hovoria o
          // POZORNOSTI — koľko ľudí vydržalo aspoň tri sekundy. Kým sa
          // doťahovali z inej karty, existovala vedľa tejto druhá tabuľka
          // s tými istými kategóriami len kvôli jednému stĺpcu.
          const p = await DB.prepare(
            `SELECT i.id, i.datum, i.mesiac, i.typ, i.permalink, i.kategoria, i.faza,
                    COALESCE(NULLIF(i.hook,''), (SELECT m.hook FROM mkt_prispevky m
                       WHERE substr(m.datum,1,10) = substr(i.datum,1,10)
                         AND m.hook <> '' ORDER BY m.views DESC LIMIT 1), '') AS hook,
                    i.dosah, i.ulozenia, i.zdielania, i.komentare, i.lajky, i.videnia,
                    COALESCE((SELECT m.view_rate FROM mkt_prispevky m
                       WHERE substr(m.datum,1,10) = substr(i.datum,1,10)
                         AND m.view_rate > 0 ORDER BY m.views DESC LIMIT 1), 0) AS viewRate,
                    COALESCE((SELECT m.watch_time FROM mkt_prispevky m
                       WHERE substr(m.datum,1,10) = substr(i.datum,1,10)
                         AND m.watch_time > 0 ORDER BY m.views DESC LIMIT 1), 0) AS watchTime
               FROM ig_prispevky i ORDER BY i.datum DESC`,
          ).all();
          return Response.json({ ok: true, prispevky: p.results });
        }

        // Časová os obsahu pre kartu „Obsah → dopyt": Instagram API tam, kde
        // už je, a Metricool všade inde. Kategória sa pri metricoolových
        // riadkoch dopočíta z textu tu — inak by karta nefungovala, kým sa
        // Instagram nestiahne nanovo, a to je väčšina histórie.
        if (new URL(request.url).searchParams.get("co") === "obsah") {
          const ig = await DB.prepare(
            "SELECT datum, kategoria, hook, dosah FROM ig_prispevky WHERE datum <> ''",
          ).all();
          const mk = await DB.prepare(
            "SELECT datum, hook, dosah FROM mkt_prispevky WHERE druh IN ('reel','post') AND datum <> ''",
          ).all();
          // POZOR: v D1 sa stĺpec volá `client_name`. V TypeScripte je to `client`,
          // lebo import ho premenúva — a práve na tom sa to 12. 8. zlomilo:
          // `SELECT DISTINCT client` hodilo „no such column", výnimka zhodila
          // celú odpoveď a sťahovanie Instagramu tíško padalo na 500.
          const klienti = await DB.prepare("SELECT DISTINCT client_name FROM sessions WHERE client_name <> ''").all();
          const mena = krstneMenaKlientov(((klienti.results as { client_name: string }[]) || []).map((r) => r.client_name));

          type R = { datum: string; kategoria?: string; hook?: string; dosah?: number };
          const von = new Map<string, { datum: string; kategoria: string; hook: string; dosah: number; zdroj: string }>();
          const daj = (r: R, zdroj: string, kat: string) => {
            const den = String(r.datum).slice(0, 10);
            const kluc = `${den}|${String(r.hook || "").slice(0, 40)}`;
            // Ten istý príspevok je v oboch zdrojoch. Vyhráva Instagram API:
            // má vlastnú kategóriu a presnejší dosah.
            if (von.has(kluc) && zdroj !== "instagram") return;
            von.set(kluc, { datum: den, kategoria: kat, hook: String(r.hook || ""), dosah: Number(r.dosah) || 0, zdroj });
          };
          // Príspevok bez textu a bez uloženej kategórie sa PRESKOČÍ.
          //
          // Zaradiť ho by znamenalo poslať ho do „Edukácie" — tam padne každý
          // prázdny reťazec — a 265 príspevkov stiahnutých pred 12. 8. text
          // nemá. Edukácia by tým narástla na 342 kusov a bola by pred
          // každým dopytom aj pred každým dňom. Neznáme nie je edukácia.
          for (const r of (ig.results as R[]) || []) {
            const kat = r.kategoria || (r.hook ? kategoriaHooku(r.hook, mena) : "");
            if (kat) daj(r, "instagram", kat);
          }
          for (const r of (mk.results as R[]) || []) {
            if (r.hook) daj(r, "metricool", kategoriaHooku(r.hook, mena));
          }
          return Response.json({ ok: true, obsah: [...von.values()].sort((a, b) => b.datum.localeCompare(a.datum)) });
        }

        const n = await nacitajNastavenie(DB);
        /**
         * Dokedy token platí — hneď v prehľade, nie až po stlačení skúšky.
         * Krátky token z Explorera vyprší do hodiny a appka by potom
         * prestala sťahovať uprostred mesiaca. Vracia sa dátum, nikdy token.
         */
        let tokenPlatiDo = "";
        if (n.token) {
          const l = await graph(`debug_token?input_token=${encodeURIComponent(n.token)}`, n.token);
          const d = ((l.data as { data?: { expires_at?: number } })?.data) || {};
          if (typeof d.expires_at === "number") {
            tokenPlatiDo = d.expires_at === 0 ? "bez expirácie" : new Date(d.expires_at * 1000).toISOString();
          }
        }
        const kampane = await DB.prepare(
          `SELECT id, mesiac, nazov, ciel, spend, impressions, clicks, vysledky, stav, stav_sad
             FROM mkt_kampane ORDER BY mesiac DESC, spend DESC`,
        ).all();
        const reklamy = await DB.prepare(
          `SELECT id, mesiac, nazov, kampan, spend, impressions, clicks, ctr, cpm, frekvencia, videnia2s, thruplay
             FROM mkt_reklamy ORDER BY mesiac DESC, spend DESC`,
        ).all();
        // Token sa nevracia ani skrátený — len či existuje.
        return Response.json({
          ok: true,
          maToken: !!n.token,
          tokenPlatiDo,
          // Koľko dopytov appka skutočne vidí — obrazovka podľa toho vie
          // dopredu povedať, či sa kampaň na konverzie vôbec dá pustiť.
          dopytovTyzdenne: await (async () => {
            const r = await DB.prepare("SELECT COUNT(*) n FROM leads WHERE date >= ?1")
              .bind(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)).first<{ n: number }>();
            return Math.round(((Number(r?.n) || 0) / (90 / 7)) * 10) / 10;
          })(),
          pristup: await (async () => {
            const od = new Date(Date.now() - OKNO_DNI * 86400000).toISOString().slice(0, 10);
            const r = await DB.prepare(
              "SELECT COALESCE(SUM(volani),0) v, COALESCE(SUM(chyb),0) c FROM meta_volania WHERE den >= ?1",
            ).bind(od).first<{ v: number; c: number }>();
            return stavPristupu(Number(r?.v) || 0, Number(r?.c) || 0);
          })(),
          reklamy: reklamy.results,
          // Token pre Conversions API sa — rovnako ako ten prvý — nevracia
          // ani skrátený. Pixel áno: je to verejné číslo, stojí v kóde webu.
          maCapi: !!(await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'meta_capi_token'").first()),
          pixelId: await (async () => {
            const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'meta_pixel_id'").first<{ value: string }>();
            if (!r?.value) return "";
            try { return String(JSON.parse(r.value)); } catch { return r.value; }
          })(),
          adAccount: n.adAccount,
          igUser: n.igUser,
          kampane: kampane.results,
          kampani: kampane.results.length,
          igPrispevkov: ((await DB.prepare("SELECT COUNT(*) n FROM ig_prispevky").first<{ n: number }>())?.n) ?? 0,
        });
        } catch (e) {
          // Bez tohto skončí chyba v SQL ako holá päťstovka a na obrazovke
          // ako „spojenie zlyhalo" — čo znie ako výpadok siete a pošle človeka
          // hľadať úplne inam. Text chyby patrí tomu, kto sa pozerá.
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        DB_PRE_POCITADLO = DB;
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const akcia = String(b.akcia || "");
        const now = new Date().toISOString();
        try {
        const uloz = async (k: string, v: string) =>
          DB.prepare(
            `INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1,?2,?3)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
          ).bind(k, JSON.stringify(v), now).run();

        if (akcia === "uloz-token") {
          const token = String(b.token || "").trim();
          if (token.length < 20) return Response.json({ ok: false, error: "token_prilis_kratky" }, { status: 400 });
          await uloz("meta_token", token);
          // Do auditu ide len fakt, že sa token zmenil — nikdy jeho hodnota.
          await audit(DB, { action: "nastavenie", predmet: "meta_token", neu: "token nastavený", actor: await currentUser(request) || undefined });
          return Response.json({ ok: true });
        }

        if (akcia === "uloz-capi") {
          const t = String(b.capiToken || "").trim();
          if (t && t.length < 20) return Response.json({ ok: false, error: "token_prilis_kratky" }, { status: 400 });
          if (t) await uloz("meta_capi_token", t);
          await uloz("meta_pixel_id", String(b.pixelId || "").trim());
          await audit(DB, { action: "nastavenie", predmet: "meta_capi", neu: t ? "token pre Conversions API nastavený" : "pixel nastavený", actor: await currentUser(request) || undefined });
          return Response.json({ ok: true });
        }

        // Skúšobná udalosť. Bez nej sa dá zistiť, či CAPI funguje, až keď
        // niekto naozaj odošle formulár — a to je zlý moment na hľadanie chyby.
        if (akcia === "skuska-capi") {
          const r = await DB.prepare(
            "SELECT key, value FROM vzas_settings WHERE key IN ('meta_capi_token','meta_pixel_id')",
          ).all();
          const m: Record<string, string> = {};
          for (const x of (r.results as { key: string; value: string }[]) || []) {
            try { m[x.key] = String(JSON.parse(x.value)); } catch { m[x.key] = x.value; }
          }
          const v = await posliLead(m.meta_pixel_id, m.meta_capi_token, {
            id: `skuska-${Date.now()}`,
            email: "skuska@prosapiens.cz",
            telefon: "",
            stranka: "https://www.prosapiens.cz/uvodni-trenink/",
          }, String(b.testKod || "") || undefined);
          return v.ok
            ? Response.json({ ok: true, sprava: "Skúšobný Lead odoslaný — pozri Events Manager → Test events." })
            : Response.json({ ok: false, error: v.chyba }, { status: 502 });
        }

        if (akcia === "uloz-ucty") {
          await uloz("meta_ad_account", String(b.adAccount || "").trim());
          await uloz("meta_ig_user", String(b.igUser || "").trim());
          return Response.json({ ok: true });
        }

        const n = await nacitajNastavenie(DB);
        if (!n.token) return Response.json({ ok: false, error: "chyba_token" }, { status: 400 });

        // Skúška spojenia + čo token vôbec vidí. Toto je prvá vec, ktorá sa
        // púšťa po vložení tokenu — bez nej sa hľadá chyba naslepo.
        // Prepočet kategórií z HOOKU.
        //
        // Klasifikátor dostával raz celý text príspevku a inde len prvú vetu —
        // a to je rozdiel v 15 % prípadov (merané 17. 8. 2026 na 124 kusoch).
        // Najčastejšie tak zmizol „Klientsky príbeh" a „Staccato výpočet" do
        // „Edukácie", lebo v dlhom texte sa forma úvodu stratí. Odteraz sa
        // klasifikuje vždy hook; táto akcia zrovná to, čo je uložené.
        // Oprava zaradenia do fázy nákupného cyklu. Prvé zaradenie 116
        // príspevkov spravil 23. 8. 2026 model z textu háku — je to odhad
        // a Jerry ho musí vedieť prepísať jedným klikom, inak by mapa stála
        // na čísle, ktoré nikto nepotvrdil.
        if (akcia === "faza-prispevku") {
          const id = String(b.id || "").slice(0, 60);
          const faza = Number(b.faza);
          if (!id) return Response.json({ ok: false, error: "chýba id" }, { status: 400 });
          if (!jeFaza(faza)) return Response.json({ ok: false, error: "Neplatná fáza." }, { status: 400 });
          const r = await DB.prepare("UPDATE ig_prispevky SET faza = ?2 WHERE id = ?1").bind(id, faza).run();
          // UPDATE nad neexistujúcim id prejde s nulou zmien a obrazovka by
          // ohlásila uložené nad ničím (revízia 19. 8.).
          if (!r.meta.changes) return Response.json({ ok: false, error: "Príspevok sa nenašiel." }, { status: 404 });
          return Response.json({ ok: true, id, faza });
        }

        if (akcia === "prepocitaj-kategorie") {
          const klientiPre = await DB.prepare("SELECT DISTINCT client_name FROM sessions WHERE client_name <> ''").all();
          const mena = krstneMenaKlientov(((klientiPre.results as { client_name: string }[]) || []).map((r) => r.client_name));
          const rs = await DB.prepare("SELECT id, hook, text, kategoria FROM ig_prispevky").all<{ id: string; hook: string; text: string; kategoria: string }>();
          let zmenene = 0;
          const zmeny: Record<string, number> = {};
          for (const r of rs.results || []) {
            const nova = kategoriaHooku(r.hook || r.text || "", mena);
            if (nova === r.kategoria) continue;
            zmeny[`${r.kategoria} → ${nova}`] = (zmeny[`${r.kategoria} → ${nova}`] || 0) + 1;
            await DB.prepare("UPDATE ig_prispevky SET kategoria = ?2 WHERE id = ?1").bind(r.id, nova).run();
            zmenene++;
          }
          return Response.json({ ok: true, spolu: (rs.results || []).length, zmenene, zmeny });
        }

        /**
         * Založenie kampane z Kokpitu — VŽDY pozastavenej.
         *
         * Jerry, 19. 8. 2026: „chcem vyskúšať naplánovať takúto kampaň
         * priamo z Kokpitu." Appka teda kampaň ZALOŽÍ, ale nespustí:
         * `status` sa nastavuje tu na serveri a telo z obrazovky sa
         * v tomto poli ignoruje. Obrazovku vie niekto obísť, server nie —
         * a rozdiel medzi pozastavenou a bežiacou kampaňou sú peniaze.
         *
         * Od 19. 8. 2026 appka zakladá aj sadu, kreatívu a reklamu (vetvy
         * nižšie) — pôvodná veta „appka nezakladá sadu ani kreatívu" tu
         * stála ešte deň po tom, čo prestala platiť. Jediné, čo ostáva
         * v Mete, je SPUSTENIE.
         */
        if (akcia === "zaloz-kampan") {
          // Účet sa NEBERIE z nastavenia. Nastavenie sa dá prepísať v inej
          // karte a kampaň by ticho vznikla tam, kam Kokpit nevidí; toto je
          // presne to, čo sa stalo s dvomi kampaňami v osobnom účte (2023).
          const ucet = `act_${UCET_REKLAM}`;
          if (n.adAccount && !jeUcetReklam(n.adAccount)) {
            await audit(DB, {
              action: "reklama", predmet: "ucet",
              neu: `nastavenie ukazuje na ${n.adAccount}, kampaň sa aj tak zakladá na ${ucet}`,
              actor: await currentUser(request) || undefined,
            });
          }
          // Dopyty za posledných 90 dní z DÁT, nie z odhadu. Obrazovka sa dá
          // obísť, server nie — a toto je jediné miesto, kde sa dá zastaviť
          // kampaň, ktorá sa nemá z čoho učiť.
          const dopytyR = await DB.prepare(
            "SELECT COUNT(*) n FROM leads WHERE date >= ?1",
          ).bind(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)).first<{ n: number }>();
          const dopytovTyzdenne = Math.round(((Number(dopytyR?.n) || 0) / (90 / 7)) * 10) / 10;

          const plan = pripravKampan({
            nazov: String(b.nazov || ""),
            ciel: (String(b.ciel || "navstevnost") === "dopyty" ? "dopyty" : "navstevnost"),
            stranka: String(b.stranka || ""),
            denneKc: Number(b.denneKc) || 0,
            stropKc: Number(b.stropKc) || 0,
            rezimRozpoctu: String(b.rezimRozpoctu || "denne") === "celkom" ? "celkom" : "denne",
            celkomKc: Number(b.celkomKc) || 0,
            dni: Number(b.dni) || 0,
            dopytovTyzdenne,
            cenaZaDopytKc: Number(b.cenaZaDopytKc) || 0,
          });
          if (!plan.ok) return Response.json({ ok: false, error: plan.chyby.join(" ") }, { status: 400 });
          const telo: Record<string, unknown> = { ...plan.telo, status: "PAUSED" };
          const r = await graphPost(`${ucet}/campaigns`, telo, n.token);
          if (!r.ok) {
            /**
             * Meta na chýbajúce právo odpovie vetou o neexistujúcom objekte:
             * „Object with ID act_… does not exist, cannot be loaded due to
             * missing permissions". Jerry z toho 19. 8. 2026 čítal, že je
             * zle účet — pritom účet je správny a chýba `ads_management`.
             * Preto sa pri neúspechu pozrieme na práva a povieme to rovno.
             */
            const prava = await graph("me/permissions", n.token);
            const zoznam = ((prava.data as { data?: { permission: string; status: string }[] })?.data) || [];
            const mozeZakladat = zoznam.some((x) => x.permission === "ads_management" && x.status === "granted");
            return Response.json({
              ok: false,
              error: mozeZakladat
                ? r.chyba
                : "Token, ktorý má appka uložený, smie kampane len ČÍTAŤ (ads_read). Na zakladanie treba právo ads_management — vytvor nový token s týmto právom a vlož ho v Mesiac → Dáta a uzávierka → Meta. Účet ani kampaň nie sú chybné.",
              chybaMety: r.chyba,
            }, { status: 502 });
          }
          const id = String((r.data as { id?: string })?.id || "");

          /**
           * Sada reklám hneď za kampaňou.
           *
           * Kampaň bez sady je prázdny priečinok — Meta pri nej píše
           * „Campaign recommendations: Not available because ad set is
           * missing" a Jerry sa 19. 8. 2026 oprávnene pýtal, čo že to
           * appka vlastne vytvorila. Odteraz vzniká aj poschodie, ktoré
           * hovorí KOMU a DOKEDY. Kreatíva (obrázok/video a text) zostáva
           * v Mete — tú appka nerobí.
           *
           * Keď sada neprejde, kampaň zostane a povie sa to. Mazať ju by
           * znamenalo zahodiť aj to, čo vyšlo.
           */
          const sada = await graphPost(`${ucet}/adsets`, pripravSadu({
            kampanId: id,
            nazov: String(telo.name || ""),
            ciel: (String(b.ciel || "navstevnost") === "dopyty" ? "dopyty" : "navstevnost"),
            oblast: (String(b.oblast || "cz") === "sk" ? "sk" : "cz"),
            mesto: b.mestoKey ? { key: String(b.mestoKey), okruhKm: Number(b.okruhKm) || 25 } : null,
            dni: Number(b.dni) || 0,
            odkaz: plan.odkaz || "",
            prijemca: "ProSapiens Biomechanic",
          }), n.token);
          const sadaId = sada.ok ? String((sada.data as { id?: string })?.id || "") : "";

          /**
           * Tretie poschodie: kreatíva a reklama — ale len keď je čo napísať.
           *
           * Do 19. 8. 2026 appka končila pri sade a text sa dopisoval v Mete.
           * Nebolo to rozhodnutie, bola to prekážka: `/adcreatives` vracalo
           * `(#3) capability`, lebo facebooková aplikácia Kokpit bola
           * v režime „Development". Po jej publikovaní kreatíva prejde.
           *
           * POZOR NA ROZDIEL, ktorý stál pol dňa hľadania: takto vytvorená
           * kreatíva (vlastný text + odkaz) funguje, ale `source_instagram_media_id`
           * — teda propagácia HOTOVÉHO príspevku z Instagramu — má vlastnú
           * bránu a tú publikovanie neotvorilo. Na tú treba Full Access.
           *
           * Bez textu sa nerobí nič a kampaň zostáva kostrou ako doteraz;
           * prázdna kreatíva by bola horšia než žiadna.
           */
          const text = String(b.text || "").replace(/\s+$/, "").slice(0, 600);
          const nadpis = String(b.nadpis || "").trim().slice(0, 80);
          let kreativaId = "";
          let reklamaId = "";
          let chybaReklamy = "";
          if (text && sadaId && plan.odkaz) {
            // Tá istá stránka, akú hľadá propagácia príspevku nižšie: podľa
            // napojeného Instagramu, inak prvá v poradí.
            const str = await graph("me/accounts?fields=id,name,instagram_business_account{id}&limit=25", n.token);
            const zoz = ((str.data as { data?: { id: string; instagram_business_account?: { id: string } }[] })?.data) || [];
            const pageId = (zoz.find((x) => x.instagram_business_account?.id === n.igUser) || zoz[0])?.id || "";
            if (!pageId) {
              chybaReklamy = "Nenašla sa facebooková stránka napojená na Instagram.";
            } else {
              /**
               * Médium, ktoré Jerry nahral pred založením (`/api/meta-media`).
               *
               * Do 19. 8. 2026 appka kreatívu skladala vždy bez obrázka —
               * Meta ju prijala, ale reklama bez vizuálu je v praxi nepoužiteľná
               * a dopĺňať ho bolo treba v Mete. Nahranie je preto samostatný
               * krok PRED zakladaním: je najpomalší a keby padol uprostred,
               * zostali by v účte prázdne kampane.
               *
               * Video má vlastný tvar (`video_data`), obrázok ide do
               * `link_data` ako `image_hash`. Bez média sa skladá to, čo
               * doteraz — kreatíva len s textom a odkazom.
               */
              const videoId = String(b.videoId || "").trim();
              const nahladVidea = String(b.nahlad || "").trim();
              const imageHash = String(b.imageHash || "").trim();
              const cta = { type: "LEARN_MORE", value: { link: plan.odkaz } };
              const storySpec = videoId
                ? {
                  page_id: pageId,
                  ...(n.igUser ? { instagram_user_id: n.igUser } : {}),
                  video_data: {
                    video_id: videoId,
                    ...(nahladVidea ? { image_url: nahladVidea } : {}),
                    message: text,
                    ...(nadpis ? { title: nadpis } : {}),
                    call_to_action: cta,
                  },
                }
                : {
                  page_id: pageId,
                  ...(n.igUser ? { instagram_user_id: n.igUser } : {}),
                  link_data: {
                    link: plan.odkaz,
                    message: text,
                    ...(imageHash ? { image_hash: imageHash } : {}),
                    ...(nadpis ? { name: nadpis } : {}),
                    call_to_action: cta,
                  },
                };
              const kreativa = await graphPost(`${ucet}/adcreatives`, {
                name: `${telo.name} — kreatíva`,
                object_story_spec: storySpec,
              }, n.token);
              if (!kreativa.ok) {
                chybaReklamy = `Kreatíva neprešla: ${kreativa.chyba}`;
              } else {
                kreativaId = String((kreativa.data as { id?: string })?.id || "");
                const reklama = await graphPost(`${ucet}/ads`, {
                  name: `${telo.name} — reklama`, adset_id: sadaId,
                  creative: { creative_id: kreativaId }, status: "PAUSED",
                }, n.token);
                if (!reklama.ok) chybaReklamy = `Reklama neprešla: ${reklama.chyba}`;
                else reklamaId = String((reklama.data as { id?: string })?.id || "");
              }
            }
          }

          await audit(DB, {
            action: "reklama", predmet: `kampan ${id}`,
            neu: `založená POZASTAVENÁ: ${telo.name} · ${telo.objective} · ${Math.round(Number(telo.daily_budget) / 100)} Kč/deň${telo.spend_cap ? ` · strop ${Math.round(Number(telo.spend_cap) / 100)} Kč` : " · bez stropu"}${sadaId ? ` · sada ${sadaId}` : " · SADA NEPREŠLA"}${reklamaId ? ` · reklama ${reklamaId}` : chybaReklamy ? ` · REKLAMA NEPREŠLA: ${chybaReklamy}` : ""}`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({
            ok: true, id, sadaId, kreativaId, reklamaId, odkaz: plan.odkaz,
            chybaSady: sada.ok ? "" : sada.chyba,
            chybaReklamy,
            varovania: plan.varovania,
          });
        }

        /**
         * Propagovať existujúci príspevok z Instagramu.
         *
         * Jerry, 19. 8. 2026: „čo keby chcem propagovať nejaký príspevok?"
         * Toto je iná vec než nová kampaň: príspevok už existuje aj s obrázkom
         * a textom, takže vzniká všetkých PÄŤ poschodí naraz — kampaň, sada,
         * kreatíva z toho príspevku a reklama. A appka pritom vie, KTORÝ
         * príspevok stojí za to: pozná uloženia aj dosah všetkých kusov.
         *
         * Všetko vzniká POZASTAVENÉ. Kreatíva sa nevymýšľa — je to ten istý
         * príspevok, ktorý už na Instagrame je.
         */
        if (akcia === "propaguj-prispevok") {
          const mediaId = String(b.mediaId || "").trim();
          if (!mediaId) return Response.json({ ok: false, error: "chyba_prispevok" }, { status: 400 });
          if (!n.igUser) return Response.json({ ok: false, error: "V nastavení chýba Instagram účet (meta_ig_user)." }, { status: 400 });
          const ucet = `act_${UCET_REKLAM}`;
          const denneKc = Number(b.denneKc) || MIN_DENNE_KC;
          const dni = Number(b.dni) || 7;
          const nazov = String(b.nazov || "").trim() || `PSB — propagovaný príspevok ${new Date().toISOString().slice(0, 10)}`;
          const odkaz = String(b.odkaz || "").trim();

          /**
           * PORADIE JE ZÁMERNÉ: najprv kreatíva, potom kampaň.
           *
           * Prvá verzia zakladala kampaň a sadu a až potom kreatívu — a keď
           * kreatíva neprešla (19. 8. 2026 dvakrát), zostali v účte prázdne
           * kampane, ktoré nikto nechcel. Najkrehkejší krok patrí dopredu.
           *
           * Kreatíva z existujúceho príspevku sa skladá INAK než vlastná
           * reklama: `source_instagram_media_id` je obsah a `instagram_user_id`
           * jeho autor. `object_story_spec` sa k tomu pridať NEDÁ — Meta
           * odpovie „The object you are trying to promote is ambiguous".
           */
          let pageId = String(b.pageId || "").trim();
          if (!pageId) {
            const str = await graph("me/accounts?fields=id,name,instagram_business_account{id}&limit=25", n.token);
            const zoz = ((str.data as { data?: { id: string; instagram_business_account?: { id: string } }[] })?.data) || [];
            pageId = (zoz.find((x) => x.instagram_business_account?.id === n.igUser) || zoz[0])?.id || "";
          }
          if (!pageId) return Response.json({ ok: false, error: "Nenašla sa facebooková stránka napojená na Instagram." }, { status: 400 });

          /**
           * DVE CESTY K TEJ ISTEJ REKLAME — a druhá je tu preto, že prvá je
           * za bránou, ktorú Kokpit sám neotvorí.
           *
           *  1. PRAVÝ BOOST (`source_instagram_media_id`). Reklamou sa stane
           *     TEN ISTÝ príspevok — zdedí lajky, komentáre aj zdieľania
           *     a zbiera ďalšie. Vyžaduje Full Access (500 volaní/15 dní);
           *     bez neho Meta vráti `(#3) capability`. Skúša sa ako prvá,
           *     lebo je lepšia — a v deň, keď Full Access dorazí, začne
           *     appka bez jediného zásahu do kódu používať ju.
           *
           *  2. KÓPIA OBSAHU (záloha). Appka stiahne z príspevku obrázok,
           *     nahrá ho do účtu (`/adimages`) a poskladá vlastnú kreatívu
           *     s tým istým obrázkom a textom. Vyzerá rovnako, ale je to nová
           *     reklama — históriu interakcií nemá. Full Access nepotrebuje.
           *
           * Zámerne sa neskúša najprv druhá: sociálny dôkaz sa nedá dorobiť
           * spätne a je jediné, čím sa tie dve cesty líšia.
           */
          let kreativaId = "";
          let cesta: "boost" | "kopia" = "boost";
          let kariet = 0;
          let jeVideoKopia = false;
          const kreativa = await graphPost(`${ucet}/adcreatives`, {
            name: `${nazov} — kreatíva`,
            source_instagram_media_id: mediaId,
            instagram_user_id: n.igUser,
            page_id: pageId,
            ...(odkaz ? { call_to_action: { type: "LEARN_MORE", value: { link: odkaz } } } : {}),
          }, n.token);
          if (kreativa.ok) {
            kreativaId = String((kreativa.data as { id?: string })?.id || "");
          } else {
            cesta = "kopia";
            // Bez odkazu sa kópia poskladať nedá — Meta pri vlastnej kreatíve
            // link vyžaduje. Pravý boost ho má nepovinný, preto až tu.
            if (!odkaz) {
              return Response.json({
                ok: false,
                error: `Pravý boost neprešiel (${kreativa.chyba}) a náhradná cesta potrebuje cieľovú adresu — vyber stránku, na ktorú má reklama viesť.`,
                kroky: "nič sa nezaložilo",
              }, { status: 400 });
            }
            const med = await graph(
              `${mediaId}?fields=media_url,thumbnail_url,caption,media_type,children%7Bmedia_url,thumbnail_url,media_type%7D`,
              n.token,
            );
            const m = (med.data as {
              media_url?: string; thumbnail_url?: string; caption?: string; media_type?: string;
              children?: { data?: { media_url?: string; thumbnail_url?: string; media_type?: string }[] };
            }) || {};

            /**
             * Karusel sa kopíruje ako karusel, nie ako jeho prvý obrázok.
             *
             * `media_url` vráti pri karuseli len prvú kartu — reklama z neho
             * bola technicky správna, ale hovorila desatinu toho, čo príspevok.
             * Karty sú v `children`; Meta ich berie 2 až 10, čo presne sedí na
             * strop Instagramu.
             *
             * VIDEO má vlastnú vetvu nižšie. Do 19. 8. 2026 sa z neho brával
             * len statický náhľad — a keďže 71 % príspevkov PSB sú reels,
             * znamenalo to, že z väčšiny obsahu vznikala nehybná reklama
             * z jedného náhodného snímku. To nie je tá istá reklama.
             */
            /**
             * VIDEO: nahrá sa celé, nie jeho náhľad.
             *
             * `/advideos` je iný endpoint než `/adimages` a vracia video
             * v stave `processing`. Zmerané 19. 8. 2026: **kreatíva prejde aj
             * počas spracovania**, takže sa naň nečaká — čakanie by request
             * predĺžilo o desiatky sekúnd a v Cloudflare Workeri by hrozilo,
             * že vyprší. Meta si video dospracuje sama.
             *
             * Náhľad (`picture`) je povinný aj pri videu — Meta ho pýta ako
             * `image_url`. Vracia ho `/advideos` hneď, ešte pred dokončením.
             */
            const jeVideo = m.media_type === "VIDEO" && !!m.media_url;
            if (jeVideo) {
              const bin = await fetch(m.media_url as string)
                .then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
              if (!bin) {
                return Response.json({
                  ok: false,
                  error: `Pravý boost neprešiel (${kreativa.chyba}) a video z príspevku sa nepodarilo stiahnuť.`,
                  kroky: "nič sa nezaložilo",
                }, { status: 502 });
              }
              const fdv = new FormData();
              fdv.append("access_token", n.token);
              fdv.append("source", new Blob([bin]), "prispevok.mp4");
              const upv = await fetch(`https://graph.facebook.com/${V}/${ucet}/advideos`, { method: "POST", body: fdv })
                .then((r) => r.json() as Promise<{ id?: string; error?: { message?: string } }>)
                .catch(() => null);
              zapisVolanie(!!upv && !upv.error);
              const videoId = String(upv?.id || "");
              if (!videoId) {
                return Response.json({
                  ok: false,
                  error: `Pravý boost neprešiel (${kreativa.chyba}) a video sa nepodarilo nahrať: ${upv?.error?.message || "bez dôvodu"}`,
                  kroky: "nič sa nezaložilo",
                }, { status: 502 });
              }
              const nahlad = await graph(`${videoId}?fields=picture`, n.token);
              const obrazokVidea = String((nahlad.data as { picture?: string })?.picture || "")
                || m.thumbnail_url || "";
              const textV = String(b.text || m.caption || "").slice(0, 600);
              const kopV = await graphPost(`${ucet}/adcreatives`, {
                name: `${nazov} — kreatíva (kópia videa)`,
                object_story_spec: {
                  page_id: pageId,
                  instagram_user_id: n.igUser,
                  video_data: {
                    video_id: videoId,
                    ...(obrazokVidea ? { image_url: obrazokVidea } : {}),
                    ...(textV ? { message: textV } : {}),
                    call_to_action: { type: "LEARN_MORE", value: { link: odkaz } },
                  },
                },
              }, n.token);
              if (!kopV.ok) {
                return Response.json({
                  ok: false,
                  error: `Pravý boost neprešiel a video kreatíva tiež nie: ${kopV.chyba}`,
                  kroky: "nič sa nezaložilo",
                }, { status: 502 });
              }
              kreativaId = String((kopV.data as { id?: string })?.id || "");
              jeVideoKopia = true;
            }

            const KARET_MAX = 10;
            const zoznam = jeVideo ? [] : (m.children?.data || [])
              .map((c) => (c.media_type === "VIDEO" ? c.thumbnail_url : c.media_url) || c.thumbnail_url || "")
              .filter(Boolean)
              .slice(0, KARET_MAX);
            const obrazky = jeVideo ? [] : (zoznam.length
              ? zoznam
              : [m.media_url || m.thumbnail_url || ""].filter(Boolean));
            if (!jeVideo && !obrazky.length) {
              return Response.json({
                ok: false,
                error: `Pravý boost neprešiel (${kreativa.chyba}) a z príspevku sa nepodarilo získať obrázok, takže ho nevieme ani skopírovať.`,
                kroky: "nič sa nezaložilo",
              }, { status: 502 });
            }

            // Karty sa nahrávajú POSTUPNE. Naraz by to bolo rýchlejšie, ale
            // desať súbežných uploadov je presne ten druh nárazu, na ktorý
            // Meta odpovedá limitom — a vtedy padne celá propagácia.
            const hashe: string[] = [];
            for (const url of obrazky) {
              const bin = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
              if (!bin) continue;
              const fd = new FormData();
              fd.append("access_token", n.token);
              fd.append("filename", new Blob([bin]), "prispevok.jpg");
              const up = await fetch(`https://graph.facebook.com/${V}/${ucet}/adimages`, { method: "POST", body: fd })
                .then((r) => r.json() as Promise<{ images?: Record<string, { hash?: string }>; error?: { message?: string } }>)
                .catch(() => null);
              zapisVolanie(!!up && !up.error);
              const h = up?.images ? Object.values(up.images)[0]?.hash || "" : "";
              if (h) hashe.push(h);
            }
            if (!jeVideo && !hashe.length) {
              return Response.json({
                ok: false,
                error: `Pravý boost neprešiel (${kreativa.chyba}) a ani jeden obrázok z príspevku sa nepodarilo nahrať.`,
                kroky: "nič sa nezaložilo",
              }, { status: 502 });
            }
            kariet = hashe.length;

            // Obrázková kreatíva sa skladá LEN keď nešlo o video — to má
            // vlastnú vetvu vyššie a kreatívu už vyrobenú.
            if (!jeVideo) {
            const text = String(b.text || m.caption || "").slice(0, 600);
            const cta = { type: "LEARN_MORE", value: { link: odkaz } };
            // Jedna karta nie je karusel — Meta na `child_attachments` s jedným
            // prvkom odpovie chybou, tak sa vtedy skladá obyčajná kreatíva.
            const linkData = hashe.length > 1
              ? {
                link: odkaz,
                ...(text ? { message: text } : {}),
                child_attachments: hashe.map((h) => ({ link: odkaz, image_hash: h, call_to_action: cta })),
                // Meta si karty preusporiada podľa výkonu. Poradie z Instagramu
                // nenesie príbeh — je to zoznam cvikov, nie kapitoly.
                multi_share_optimized: true,
              }
              : { image_hash: hashe[0], link: odkaz, ...(text ? { message: text } : {}), call_to_action: cta };
            const kop = await graphPost(`${ucet}/adcreatives`, {
              name: `${nazov} — kreatíva (kópia príspevku${hashe.length > 1 ? `, ${hashe.length} kariet` : ""})`,
              object_story_spec: { page_id: pageId, instagram_user_id: n.igUser, link_data: linkData },
            }, n.token);
            if (!kop.ok) {
              return Response.json({ ok: false, error: `Kreatíva neprešla ani jednou cestou: ${kop.chyba}`, kroky: "nič sa nezaložilo" }, { status: 502 });
            }
            kreativaId = String((kop.data as { id?: string })?.id || "");
            }
          }

          const kamp = await graphPost(`${ucet}/campaigns`, {
            name: nazov, objective: "OUTCOME_TRAFFIC", status: "PAUSED", buying_type: "AUCTION",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP", special_ad_categories: [],
            daily_budget: Math.round(denneKc * 100),
          }, n.token);
          if (!kamp.ok) return Response.json({ ok: false, error: kamp.chyba, kreativaId }, { status: 502 });
          const kampanId = String((kamp.data as { id?: string })?.id || "");

          const sada = await graphPost(`${ucet}/adsets`, pripravSadu({
            kampanId, nazov, ciel: "navstevnost",
            oblast: (String(b.oblast || "cz") === "sk" ? "sk" : "cz"),
            dni, odkaz, prijemca: "ProSapiens Biomechanic",
          }), n.token);
          const sadaId = sada.ok ? String((sada.data as { id?: string })?.id || "") : "";
          if (!sadaId) return Response.json({ ok: false, error: `Sada neprešla: ${sada.chyba}`, kampanId, kreativaId }, { status: 502 });

          const reklama = await graphPost(`${ucet}/ads`, {
            name: `${nazov} — reklama`, adset_id: sadaId, creative: { creative_id: kreativaId }, status: "PAUSED",
          }, n.token);
          await audit(DB, {
            action: "reklama", predmet: `propagacia ${mediaId}`,
            neu: `kampaň ${kampanId} · sada ${sadaId} · kreatíva ${kreativaId} (${cesta === "boost" ? "pravý boost" : `kópia obsahu — bez Full Access${jeVideoKopia ? ", VIDEO" : kariet > 1 ? `, karusel ${kariet} kariet` : ""}`}) — všetko POZASTAVENÉ, ${denneKc} Kč/deň, ${dni} dní`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({
            ok: reklama.ok, kampanId, sadaId, kreativaId, cesta, kariet, video: jeVideoKopia,
            reklamaId: reklama.ok ? String((reklama.data as { id?: string })?.id || "") : "",
            error: reklama.ok ? "" : `Reklama neprešla: ${reklama.chyba}`,
          });
        }

        /**
         * Hľadanie mesta pre cielenie.
         *
         * Meta nepozná „Brno" ako text — chce svoj kľúč z číselníka miest.
         * Preto sa nedá napísať mesto do políčka a hotovo; musí sa vyhľadať.
         * Vracia sa len to, čo treba na výber: kľúč, meno, kraj a krajina.
         */
        if (akcia === "spusti-kampan" || akcia === "zastav-kampan") {
          /**
           * Spustenie a vypnutie kampane — s kontrolórom pred spustením.
           *
           * Vzniklo 20. 8. 2026: test doručovania musel spúšťať Claude ručne
           * cez Graph API, lebo appka vedela kampaň len založiť (POZASTAVENÚ).
           * Odteraz: appka dá preklik do Ads Managera na kontrolu očami
           * a tlačidlo Spustiť; server pred aktiváciou prejde kontrolórom
           * (`skontrolujPredSpustenim`) a zapne VŠETKY TRI úrovne — kampaň,
           * sadu aj reklamu. Pol zapnutá kampaň („Ad set off") bola presne
           * pasca, do ktorej Jerry spadol v Ads Manageri.
           */
          const kampanId = String(b.kampanId || "").trim();
          if (!/^[0-9]{5,}$/.test(kampanId)) return Response.json({ ok: false, error: "chyba_kampan" }, { status: 400 });
          const [k, sadyR, reklamyR] = await Promise.all([
            graph(`${kampanId}?fields=name,account_id,daily_budget,lifetime_budget,stop_time`, n.token),
            graph(`${kampanId}/adsets?fields=id,daily_budget,lifetime_budget,end_time&limit=25`, n.token),
            graph(`${kampanId}/ads?fields=id,effective_status,creative&limit=25`, n.token),
          ]);
          if (!k.ok) return Response.json({ ok: false, error: k.chyba }, { status: 502 });
          const kd = k.data as { name?: string; account_id?: string; daily_budget?: string; lifetime_budget?: string; stop_time?: string };
          const sd = ((sadyR.data as { data?: { id: string; daily_budget?: string; lifetime_budget?: string; end_time?: string }[] })?.data) || [];
          const rd = ((reklamyR.data as { data?: { id: string; effective_status?: string; creative?: { id?: string } }[] })?.data) || [];
          const cislo = (x?: string) => (x ? Number(x) : null);
          const stavPred: StavKampanePredSpustenim = {
            kampan: { id: kampanId, accountId: String(kd.account_id || ""), dailyBudget: cislo(kd.daily_budget), lifetimeBudget: cislo(kd.lifetime_budget), stopTime: kd.stop_time || null },
            sady: sd.map((x) => ({ id: x.id, dailyBudget: cislo(x.daily_budget), lifetimeBudget: cislo(x.lifetime_budget), endTime: x.end_time || null })),
            reklamy: rd.map((x) => ({ id: x.id, efektivnyStav: x.effective_status || null, maKreativu: !!x.creative?.id })),
          };
          if (akcia === "spusti-kampan") {
            const chyby = skontrolujPredSpustenim(stavPred);
            if (chyby.length) return Response.json({ ok: false, kontrola: chyby }, { status: 409 });
          }
          const cielovyStav = akcia === "spusti-kampan" ? "ACTIVE" : "PAUSED";
          // Kampaň ako posledná: keby prepínanie spadlo v strede, zostane
          // vypnutá strecha nad polozapnutými poschodiami — nič sa neminie.
          const objekty = [...rd.map((x) => x.id), ...sd.map((x) => x.id), kampanId];
          for (const o of objekty) {
            const r = await graphPost(o, { status: cielovyStav }, n.token);
            if (!r.ok) return Response.json({ ok: false, error: `Prepnutie ${o} neprešlo: ${r.chyba}` }, { status: 502 });
          }
          await audit(DB, {
            action: "reklama", predmet: akcia,
            neu: `${kd.name || kampanId} → ${cielovyStav} (${objekty.length} objektov)`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, stav: cielovyStav, nazov: kd.name || "", odkaz: adsManagerOdkaz(kampanId), objektov: objekty.length });
        }

        if (akcia === "mesta") {
          const q = String(b.q || "").trim();
          if (q.length < 2) return Response.json({ ok: true, mesta: [] });
          const r = await graph(
            `search?type=adgeolocation&location_types=${encodeURIComponent(JSON.stringify(["city"]))}&limit=50&q=${encodeURIComponent(q)}`,
            n.token,
          );
          if (!r.ok) return Response.json({ ok: false, error: r.chyba }, { status: 502 });
          const zoz = ((r.data as { data?: Record<string, unknown>[] })?.data) || [];
          /**
           * Presná zhoda hore.
           *
           * Meta vracia na „Brno" najprv mestské časti (Brno-jih, Brno-Líšeň…)
           * a samotné Brno nie je ani medzi prvými ôsmimi. Kto by si vybral
           * z prvej ponuky, cielil by na štvrť namiesto mesta.
           */
          const hladane = q.toLowerCase();
          const mesta = zoz.map((m) => ({
            key: String(m.key || ""),
            nazov: String(m.name || ""),
            kraj: String(m.region || ""),
            krajina: String(m.country_code || ""),
          })).filter((m) => m.key);
          mesta.sort((a, c) => {
            // „Brno" pred „Brno-jih": zhoda celého mena, potom meno pred
            // čiarkou (Meta vracia aj tvar „Ostrava, Czech Republic"), až
            // potom začiatok. Mestské časti majú spojovník a idú naspodok.
            const skore = (x: { nazov: string }) => {
              const n = x.nazov.toLowerCase();
              if (n === hladane) return 0;
              if (n.split(",")[0].trim() === hladane) return 1;
              if (n.startsWith(hladane + " ")) return 2;
              if (n.startsWith(hladane)) return 3;
              return 4;
            };
            return skore(a) - skore(c) || a.nazov.length - c.nazov.length;
          });
          return Response.json({ ok: true, mesta: mesta.slice(0, 8) });
        }

        /**
         * Metriky na úrovni REKLAMY.
         *
         * Kampaňové čísla nepovedia, či je problém v kreatíve alebo v nákupe.
         * `video_3_sec_watched_actions` a `video_thruplay_watched_actions` sú
         * jediné dve polia, z ktorých sa dá hook a hold spočítať — a Graph
         * ich dáva len na úrovni reklamy.
         */
        if (akcia === "reklamy") {
          const od = String(b.od || "2025-01-01").slice(0, 10);
          const doD = String(b.do || new Date().toISOString().slice(0, 10)).slice(0, 10);
          const ucet = `act_${UCET_REKLAM}`;
          const r = await graph(
            `${ucet}/insights?level=ad&time_increment=monthly&limit=300` +
            `&fields=ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,ctr,cpm,frequency,` +
            // Trojsekundové videnia Meta zrušila (19. 8. 2026: „is not valid
            // for fields param" — a to isté pre `3_second_video_plays`).
            // Dnešná metrika je `video_continuous_2_sec_watched_actions`.
            `video_continuous_2_sec_watched_actions,video_thruplay_watched_actions,date_start` +
            `&time_range=${encodeURIComponent(JSON.stringify({ since: od, until: doD }))}`,
            n.token,
          );
          if (!r.ok) return Response.json({ ok: false, error: r.chyba }, { status: 502 });
          const riadky = ((r.data as { data?: Record<string, unknown>[] }).data) || [];
          const sucet = (x: unknown) => (Array.isArray(x) ? x.reduce((a: number, y) => a + (Number((y as { value?: string }).value) || 0), 0) : 0);
          const stmts = riadky.map((x) => DB.prepare(
            `INSERT INTO mkt_reklamy (id, mesiac, nazov, kampan, sada, spend, impressions, clicks, ctr, cpm, frekvencia, videnia2s, thruplay, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
             ON CONFLICT(id, mesiac) DO UPDATE SET nazov=?3, kampan=?4, sada=?5, spend=?6, impressions=?7,
               clicks=?8, ctr=?9, cpm=?10, frekvencia=?11, videnia2s=?12, thruplay=?13, updated_at=?14`,
          ).bind(
            String(x.ad_id || ""), String(x.date_start || "").slice(0, 7), String(x.ad_name || ""),
            String(x.campaign_name || ""), String(x.adset_name || ""),
            Number(x.spend) || 0, Number(x.impressions) || 0, Number(x.clicks) || 0,
            Number(x.ctr) || 0, Number(x.cpm) || 0, Number(x.frequency) || 0,
            // Meta vracia raz číslo, raz pole s rozpisom — obe tvary sa zrátajú.
            sucet(x.video_continuous_2_sec_watched_actions),
            sucet(x.video_thruplay_watched_actions), now,
          ));
          for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
          return Response.json({ ok: true, riadkov: stmts.length });
        }

        if (akcia === "test") {
          const ucty = await graph("me/adaccounts?fields=id,name,account_status&limit=25", n.token);
          const ig = await graph("me/accounts?fields=id,name,instagram_business_account{id,username}&limit=25", n.token);
          // Práva tokenu. Bez nich sa „nezaložila sa" nedá odlíšiť od chyby
          // v kóde: Meta na chýbajúce `ads_management` odpovie vetou
          // o neexistujúcom objekte (19. 8. 2026).
          const prava = await graph("me/permissions", n.token);
          const zoznam = ((prava.data as { data?: { permission: string; status: string }[] })?.data) || [];
          /**
           * Dokedy token platí. Krátky token z Explorera vyprší do hodiny
           * a appka by potom prestala sťahovať uprostred mesiaca bez toho,
           * aby ktokoľvek vedel prečo. `expires_at: 0` znamená bez expirácie.
           * Vracia sa LEN dátum, nikdy token.
           */
          const ladenie = await graph(`debug_token?input_token=${encodeURIComponent(n.token)}`, n.token);
          const d = ((ladenie.data as { data?: { expires_at?: number; data_access_expires_at?: number } })?.data) || {};
          const platiDo = d.expires_at ? new Date(d.expires_at * 1000).toISOString() : (d.expires_at === 0 ? "bez expirácie" : "");
          return Response.json({
            ok: true, reklamneUcty: ucty, instagram: ig,
            prava: zoznam.filter((x) => x.status === "granted").map((x) => x.permission),
            mozeZakladatKampane: zoznam.some((x) => x.permission === "ads_management" && x.status === "granted"),
            platiDo,
            dniDoKonca: d.expires_at ? Math.round((d.expires_at * 1000 - Date.now()) / 86400000) : null,
          });
        }

        // Kampane po mesiacoch. `time_increment=monthly` necháva sčítanie na
        // Mete — vlastné sčítavanie dní by sa rozišlo s tým, čo vidí v Ads
        // Manageri, a prvý rozpor by stál hodinu hľadania.
        if (akcia === "kampane") {
          const od = String(b.od || "2025-01-01").slice(0, 10);
          const doD = String(b.do || new Date().toISOString().slice(0, 10)).slice(0, 10);
          if (!n.adAccount) return Response.json({ ok: false, error: "chyba_ad_ucet" }, { status: 400 });
          const ucet = n.adAccount.startsWith("act_") ? n.adAccount : `act_${n.adAccount}`;
          const r = await graph(
            `${ucet}/insights?level=campaign&time_increment=monthly&limit=200` +
            `&fields=campaign_id,campaign_name,objective,spend,impressions,clicks,actions,date_start` +
            `&time_range=${encodeURIComponent(JSON.stringify({ since: od, until: doD }))}`,
            n.token,
          );
          if (!r.ok) return Response.json({ ok: false, error: r.chyba }, { status: 502 });
          const riadky = ((r.data as { data?: Record<string, unknown>[] }).data) || [];
          const stmts = riadky.map((x) => {
            const akcie = (x.actions as { action_type: string; value: string }[]) || [];
            const vysl = akcie.filter((a) => DOPYT.has(a.action_type))
              .reduce((s, a) => s + (Number(a.value) || 0), 0);
            return DB.prepare(
              `INSERT INTO mkt_kampane (id, mesiac, nazov, stav, spend, impressions, clicks, vysledky, ciel, akcie, updated_at)
               VALUES (?1,?2,?3,'',?4,?5,?6,?7,?9,?10,?8)
               ON CONFLICT(id, mesiac) DO UPDATE SET nazov=?3, spend=?4, impressions=?5, clicks=?6,
                 vysledky=?7, ciel=?9, akcie=?10, updated_at=?8`,
            ).bind(
              String(x.campaign_id || ""), String(x.date_start || "").slice(0, 7), String(x.campaign_name || ""),
              Number(x.spend) || 0, Number(x.impressions) || 0, Number(x.clicks) || 0, vysl, now,
              String(x.objective || ""),
              // Surová odpoveď celá. Výklad sa mení, dáta nie — a druhýkrát sa
              // už z API ťahať nedá, staré kampane sa spätne neprepočítajú.
              JSON.stringify(akcie.map((a) => [a.action_type, Number(a.value) || 0])),
            );
          });
          for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));

          /**
           * Druhý dopyt: zoznam kampaní, nie ich výkon.
           *
           * `/insights` vracia LEN to, čo sa doručovalo. Kampaň, ktorá je
           * pozastavená a nikdy nebežala, v ňom nie je — a Kokpit o nej
           * nevie ani to, že existuje. 19. 8. 2026 sa na tom mala rozbiť
           * skúška zakladania kampaní: appka by tvrdila, že sa nezaložila.
           *
           * A druhá vec: stĺpec `stav` bol pri všetkých 78 kampaniach
           * prázdny, lebo ho nemal kto naplniť. Bez neho sa bežiaca kampaň
           * nedá odlíšiť od pozastavenej — čo je prvá otázka, ktorú si nad
           * zoznamom kampaní človek položí.
           *
           * Berie sa `effective_status`, nie `status`: hovorí, či kampaň
           * MÔŽE doručovať (pozastavený účet alebo sada ju zastavia tiež),
           * nie len to, čo si niekto prepol.
           */
          const zoznam = await graph(
            `${ucet}/campaigns?limit=200&fields=id,name,objective,effective_status,created_time`,
            n.token,
          );
          /**
           * Tretí dopyt: sady reklám. Doručovanie sa riadi nimi, nie
           * kampaňou — 19. 8. 2026 bolo 37 zo 62 kampaní zapnutých a
           * nebežala ani jedna, lebo ich sady mali po konci.
           */
          const sadyOdpoved = await graph(
            `${ucet}/adsets?limit=500&fields=id,campaign_id,effective_status,end_time`,
            n.token,
          );
          const podlaKampane = new Map<string, { effective_status?: string; end_time?: string }[]>();
          if (sadyOdpoved.ok) {
            for (const a of ((sadyOdpoved.data as { data?: Record<string, unknown>[] }).data) || []) {
              const k = String(a.campaign_id || "");
              if (!k) continue;
              podlaKampane.set(k, [...(podlaKampane.get(k) || []), {
                effective_status: String(a.effective_status || ""),
                end_time: a.end_time ? String(a.end_time) : undefined,
              }]);
            }
          }
          const teraz = new Date();

          let bezVykonu = 0;
          if (zoznam.ok) {
            const kampane = ((zoznam.data as { data?: Record<string, unknown>[] }).data) || [];
            const stavy: ReturnType<typeof DB.prepare>[] = [];
            for (const k of kampane) {
              const id = String(k.id || "");
              if (!id) continue;
              const stav = String(k.effective_status || "");
              const stavSad = stavDorucovania(podlaKampane.get(id) || [], teraz);
              // Stav patrí kampani, nie mesiacu — nastaví sa na všetkých jej riadkoch.
              stavy.push(DB.prepare("UPDATE mkt_kampane SET stav = ?2, stav_sad = ?4, updated_at = ?3 WHERE id = ?1").bind(id, stav, now, stavSad));
              // Mesiac vzniku, aby kampaň bez jediného zobrazenia nesadla
              // do zlého mesiaca. Mimo sťahovaného okna sa nezakladá.
              const mesiac = String(k.created_time || "").slice(0, 7);
              if (!mesiac || mesiac < od.slice(0, 7) || mesiac > doD.slice(0, 7)) continue;
              bezVykonu++;
              stavy.push(DB.prepare(
                `INSERT INTO mkt_kampane (id, mesiac, nazov, stav, spend, impressions, clicks, vysledky, ciel, akcie, updated_at, stav_sad)
                 VALUES (?1,?2,?3,?4,0,0,0,0,?5,'[]',?6,?7)
                 ON CONFLICT(id, mesiac) DO UPDATE SET nazov=?3, stav=?4, ciel=?5, updated_at=?6, stav_sad=?7`,
              ).bind(id, mesiac, String(k.name || ""), stav, String(k.objective || ""), now, stavSad));
            }
            for (let i = 0; i < stavy.length; i += 40) await DB.batch(stavy.slice(i, i + 40));
          }
          return Response.json({ ok: true, riadkov: stmts.length, stavy: zoznam.ok, bezVykonu });
        }

        // Instagramové príspevky aj s metrikami. Koniec ručného exportu
        // z Metricoolu — ten sa musel raz mesačne stiahnuť, nahrať a keď sa
        // zabudlo, obrazovka tvrdila, že mesiac bol prázdny.
        if (akcia === "instagram") {
          if (!n.igUser) return Response.json({ ok: false, error: "chyba_ig_ucet" }, { status: 400 });
          const POLIA = "id,timestamp,media_type,permalink,caption,like_count,comments_count";
          // Metriky sa expandujú do toho istého volania — inak by to bol jeden
          // dotaz na príspevok a Worker má subrequesty spočítané.
          //
          // Bohatšia sada sa skúša prvá a pri chybe sa spadne na užšiu: Meta
          // metriky medzi verziami premenúva (`plays` → `views`) a jedna
          // neznáma metrika zhodí CELÉ volanie, nielen svoj stĺpec.
          const SADY = [
            "insights.metric(reach,saved,shares,views,total_interactions)",
            "insights.metric(reach,saved,shares)",
          ];
          let cesta = "";
          let prva: { ok: boolean; data?: unknown; chyba?: string } = { ok: false };
          for (const sada of SADY) {
            cesta = `${n.igUser}/media?limit=100&fields=${POLIA},${sada}`;
            prva = await graph(cesta, n.token);
            if (prva.ok) break;
          }
          if (!prva.ok) return Response.json({ ok: false, error: prva.chyba }, { status: 502 });

          type Media = Record<string, unknown> & {
            insights?: { data?: { name: string; values?: { value: number }[] }[] };
          };
          const vsetky: Media[] = [];
          let odpoved = prva.data as { data?: Media[]; paging?: { next?: string } };
          // Šesť strán = 600 príspevkov. Strop je tu preto, aby sa Worker
          // nezacyklil na chybnom `paging`, nie preto, že by ich bolo viac.
          for (let strana = 0; strana < 6; strana++) {
            vsetky.push(...(odpoved.data || []));
            const dalej = odpoved.paging?.next;
            if (!dalej || vsetky.length >= 600) break;
            try {
              const r = await fetch(dalej);
              const j = (await r.json()) as typeof odpoved & { error?: unknown };
              if (!r.ok || j.error) break;
              odpoved = j;
            } catch { break; }
          }

          const cislo = (m: Media, meno: string) =>
            m.insights?.data?.find((x) => x.name === meno)?.values?.[0]?.value ?? 0;

          // Krstné mená klientov — bez nich sa klientsky príbeh nedá spoznať,
          // lebo „Michal" je inak obyčajné slovo. Berú sa zo sedení: tabuľka
          // klientov neexistuje, klient je odvodený z toho, kto trénoval.
          // POZOR: v D1 sa stĺpec volá `client_name`. V TypeScripte je to `client`,
          // lebo import ho premenúva — a práve na tom sa to 12. 8. zlomilo:
          // `SELECT DISTINCT client` hodilo „no such column", výnimka zhodila
          // celú odpoveď a sťahovanie Instagramu tíško padalo na 500.
          const klienti = await DB.prepare("SELECT DISTINCT client_name FROM sessions WHERE client_name <> ''").all();
          const mena = krstneMenaKlientov(((klienti.results as { client_name: string }[]) || []).map((r) => r.client_name));

          const stmts = vsetky.map((m) => {
            const datum = String(m.timestamp || "").slice(0, 10);
            // Hodina publikovania. Meta posiela ISO čas s posunom
            // („2026-08-11T18:04:23+0000"); berieme HH:MM tak, ako prišiel.
            const cas = String(m.timestamp || "").slice(11, 16);
            const text = String(m.caption || "").slice(0, 2000);
            // `hook` je prvý riadok, `text` celý popis. Analýza obsahu číta hook,
            // triedenie potrebuje viac — staccato sa v jednom riadku nespozná.
            const hook = text.split("\n")[0].slice(0, 200);
            return DB.prepare(
              `INSERT INTO ig_prispevky (id,datum,mesiac,typ,permalink,hook,dosah,ulozenia,zdielania,komentare,lajky,videnia,watch_time,text,kategoria,cas,updated_at)
               VALUES (?1,?2,?3,?4,?5,?13,?6,?7,?8,?9,?10,?11,0,?14,?15,?16,?12)
               ON CONFLICT(id) DO UPDATE SET dosah=?6, ulozenia=?7, zdielania=?8,
                 komentare=?9, lajky=?10, videnia=?11, hook=?13, text=?14, updated_at=?12, cas=?16,
                 -- Zaradenie sa prepočíta zakaždým. Pravidlá sa budú
                 -- upresňovať a staré príspevky sa musia opraviť s nimi; keď
                 -- pribudne ručná oprava, bude na ňu treba vlastný príznak,
                 -- lebo inak sa tu tíško stratí.
                 kategoria=?15`,
            ).bind(
              String(m.id || ""), datum, datum.slice(0, 7),
              String(m.media_type || ""), String(m.permalink || ""),
              cislo(m, "reach"), cislo(m, "saved"), cislo(m, "shares"),
              Number(m.comments_count) || 0, Number(m.like_count) || 0,
              cislo(m, "views"), now,
              hook, text, kategoriaHooku(hook || text, mena), cas,
            );
          });
          for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
          return Response.json({ ok: true, riadkov: stmts.length });
        }

        return Response.json({ ok: false, error: "nezname_akcia" }, { status: 400 });
        } catch (e) {
          // To isté ako pri GET: chyba v SQL sa nesmie stratiť za hláškou
          // „spojenie zlyhalo". Sťahovanie Instagramu takto tíško padalo.
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
