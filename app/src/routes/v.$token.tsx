import { createFileRoute } from "@tanstack/react-router";
import { terazPraha } from "../lib/psb/cas";
import { obsahOdkazu } from "../lib/psb/obsahOdkazu.server";

import { bindings } from "../lib/bindings.server";
import { isAuthed } from "../lib/psb/auth.server";
import { deriveClients } from "../lib/psb/compute";
import { klientStranka } from "../lib/psb/klientStranka";
import { UKAZKA_KLIENT, jeUkazka } from "../lib/psb/ukazka";
import { nastavenia, posliHistoriu } from "./api/mail-dopyty";
import { loadData } from "../lib/psb/db.server";
import { mailKlientovi } from "../lib/psb/mailKlientovi";
import { blokPocitovky } from "../lib/psb/pocitovkaStranka";
import { oblastiZJson, platnaHodnota, posledneHodnoty, POSUN, type Meranie, type Oblast } from "../lib/psb/pocitovka";
import { podlaKlienta } from "../lib/psb/anamneza.server";
import { qrObrazok } from "../lib/psb/fakturaHtml";
import { cenaPoZlave, kurzBtc, LIGHTNING_ADRESA, satsText, satsZaCzk, vytvorFakturu } from "../lib/psb/lightning";
import type { VypisKlienta } from "../lib/psb/mailKlientovi";
import { DODAVATEL, spayd } from "../lib/psb/vydanaFaktura";

/**
 * VEREJNÁ STRÁNKA KLIENTA — to, na čo klikne z SMS.
 *
 * Jerry, 30. 9. 2026: „je možnosť tam dať preklik, ktorý by ľudí preklikol
 * rovno do toho zobrazenia tréningov a na platbu?" SMS nemá miesto na
 * tabuľku; nesie odkaz `/v/<token>` a stránka ukáže to isté, čo mail
 * s výpisom: históriu tréningov a platieb — a keď klient niečo dlhuje,
 * aj QR na platbu so sumou.
 *
 * BEZPEČNOSŤ: token je náhodných 12 znakov z tabuľky `klient_odkazy` —
 * nedá sa uhádnuť ani odvodiť z mena a zmazaním riadku odkaz zhasne.
 * Stránka je NOINDEX a bez keše; okrem tokenu sa v adrese nič nenesie.
 * Sadzba je tá istá ako v maili (mailKlientovi) — jeden vzhľad, jedna
 * pravda; obrázky idú ako URL a data:, lebo stránka prílohy nemá.
 */
export const Route = createFileRoute("/v/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        const prec = (text: string, status: number) => new Response(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens</title></head>
<body style="margin:0;background:#232b1c;color:#f2f0e4;font-family:Arial,Helvetica,sans-serif"><div style="max-width:420px;margin:80px auto;padding:0 20px;text-align:center">
<div style="font-size:15px;line-height:1.6">${text}</div>
<div style="margin-top:18px;font-size:12px;color:#9aa284">ProSapiens Biomechanic · ${DODAVATEL.telefon}</div></div></body></html>`,
          { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
        );
        if (!/^[A-Za-z0-9]{8,24}$/.test(token)) return prec("Tento odkaz neplatí.", 404);

        /**
         * UKÁŽKA — vymyslené dáta, žiadny klient, žiadne počítadlo.
         *
         * Jerry, 3. 10. 2026: „prišlo mi 5 SMS, ale ani jeden odkaz sa nedal
         * otvoriť." Skúšobné správy niesli neexistujúci token. Posielať
         * odkaz, ktorý nikam nevedie, je horšie než neposlať nič — človek si
         * overuje práve to, či to klientovi funguje.
         *
         * Stojí PRED kontrolou databázy: ukážka nepotrebuje ani DB.
         */
        if (jeUkazka(token)) {
          const qrU = qrObrazok(spayd({ suma: 6990, vs: "", sprava: UKAZKA_KLIENT, prijemca: DODAVATEL.meno }));
          const bajtyU = new Uint8Array(qrU.data);
          let binU = "";
          for (let i = 0; i < bajtyU.length; i += 4096) binU += String.fromCharCode(...bajtyU.subarray(i, i + 4096));
          const html = klientStranka({
            klient: UKAZKA_KLIENT, oslovenie: "Ukážko", trener: "Jerry",
            os: [
              { den: "2026-09-09", popis: "6h Předplatné", druh: "balicekOd", zostatok: null, dlh: null },
              { den: "2026-09-12", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 6, dlh: null },
              { den: "2026-09-19", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 5, dlh: null },
              { den: "2026-09-26", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 4, dlh: null },
              { den: "2026-10-01", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 3, dlh: null },
              { den: "2026-10-02", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 2, dlh: null },
              { den: "2026-10-03", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 1, dlh: null },
            ],
            zostatok: 0, hodinSpolu: 6, odkedy: "2026-09-09", dnes: new Date().toISOString().slice(0, 10),
            platba: { popis: "6h Předplatné", suma: 6990, ucet: DODAVATEL.ucet, sprava: UKAZKA_KLIENT, odpocet: 0, novy: true },
            qrUrl: `data:${qrU.typ};base64,${btoa(binU)}`,
            pocitovka: blokPocitovky({ oblasti: ["bedra", "kolena"], zUvodneho: { bedra: 7, kolena: 5 } }),
            logoUrl: `${new URL(request.url).origin}/znacka-napis-tmava.svg`,
          });
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
          });
        }

        if (!DB) return prec("Tento odkaz neplatí.", 404);
        const r = await DB.prepare("SELECT klient, balickov FROM klient_odkazy WHERE token = ?1")
          .bind(token).first<{ klient: string; balickov: number | null }>();
        if (!r) return prec("Tento odkaz neplatí. Ozvi sa nám a pošleme ti nový.", 404);

        const data = await loadData(DB);
        const c = deriveClients(data)[r.klient];
        if (!c) return prec("Tento odkaz neplatí. Ozvi sa nám a pošleme ti nový.", 404);

        /**
         * KALENDÁR PATRÍ NA OS, INAK ČÍSLO NESEDÍ SO ZOZNAMOM.
         *
         * Jerry, 2. 10. 2026 nad Lukášom Hanusom: „prečo tam chýba 5 h?"
         * Lebo os sa stavala BEZ kalendára, kým zostatok sa kotví na
         * `packageRemaining`, ktorý kalendár pozná. Hanus má 29. 9. tréning,
         * ktorý je len v kalendári (export ho ešte nemá a je spred KOKPIT_OD,
         * takže sedenie z neho nevznikne) — v zozname chýbal, v čísle bol.
         * Reťaz sa potom začala o hodinu nižšie, než hovoril balíček, a to
         * vyzerá presne ako preskočená hodina.
         *
         * Tie isté udalosti číta aj stôl klienta (`KlientStol`), takže obe
         * obrazovky hovoria o tom istom.
         */
        /**
         * OBSAH ODKAZU sa skladá na jednom mieste (`obsahOdkazu`) — to isté
         * číta SMS pred odoslaním aj mail „celá história". Tu sa už len
         * kreslí: QR, pocitovka, sadzba.
         */
        const rozsah = Math.max(0, Math.round(Number(r.balickov ?? 1)));
        const { vypis, suma, sprava } = await obsahOdkazu(DB, data, c, { rozsah, teraz: terazPraha() });
        const origin = new URL(request.url).origin;

        /**
         * BITCOINOVÝ KLIENT PLATÍ NA LIGHTNING, NIE NA ÚČET.
         *
         * Jerry, 5. 10. 2026. Zľava je číslo pri klientovi (`btcZlava`),
         * lebo pravidlo má výnimky; kurz sa berie z verejného zdroja
         * a schová na desať minút; faktúra sa vyrába až tu, pri otvorení
         * stránky, aby nevypršala skôr, než ju klient uvidí.
         *
         * Keď čokoľvek z toho zlyhá — kurz, kľúč, Blink — ostáva statická
         * Lightning Address a suma napísaná slovom. Bankový blok sa
         * bitcoinovému klientovi neukazuje: platil by dvakrát.
         */
        const prepis = data.clientOverrides?.[c.name];
        const jeBitcoin = !!prepis?.bitcoin;
        let lightning: VypisKlienta["lightning"];
        if (jeBitcoin && suma > 0) {
          const zlava = Number(prepis?.btcZlava) || 0;
          const czk = cenaPoZlave(suma, zlava);
          const kurz = await kurzBtc(DB).catch(() => null);
          const sats = kurz ? satsZaCzk(czk, kurz.czkZaBtc) : null;
          if (sats) {
            // Faktúra sa pýta priamo Lightning adresy (LNURL-pay) — kľúč ani
            // účet na to netreba, a keď Jerry prejde k inej peňaženke, stačí
            // vymeniť adresu.
            const faktura = await vytvorFakturu(LIGHTNING_ADRESA, sats, `ProSapiens — ${c.name}`).catch(() => null);
            lightning = {
              sats: satsText(sats),
              czk, plnaCena: suma, zlava,
              kurz: Math.round(kurz!.czkZaBtc).toLocaleString("cs-CZ").replace(/\u00a0/g, " "),
              kurzKedy: kurz!.kedy.slice(11, 16),
              adresa: LIGHTNING_ADRESA,
              bolt11: faktura?.bolt11,
            };
            // QR nesie faktúru, keď je; inak samotnú adresu — tú prečítajú
            // bežné peňaženky tiež, len si klient sumu zadá sám.
            const o = qrObrazok((faktura?.bolt11 || LIGHTNING_ADRESA).toUpperCase());
            const bajty = new Uint8Array(o.data);
            let bin = "";
            for (let i = 0; i < bajty.length; i += 4096) bin += String.fromCharCode(...bajty.subarray(i, i + 4096));
            vypis.lightning = lightning;
            vypis.qrUrl = `data:${o.typ};base64,${btoa(bin)}`;
          }
        }

        let qrUrl: string | undefined;
        if (!jeBitcoin && suma > 0) {
          // Do správy pre príjemcu ide MENO — podľa neho Kokpit platbu spáruje.
          const o = qrObrazok(spayd({ suma, vs: "", sprava, prijemca: DODAVATEL.meno }));
          const bajty = new Uint8Array(o.data);
          let bin = "";
          for (let i = 0; i < bajty.length; i += 4096) bin += String.fromCharCode(...bajty.subarray(i, i + 4096));
          qrUrl = `data:${o.typ};base64,${btoa(bin)}`;
        }

        /**
         * POCITOVKA — tri otázky, ktoré si klepne klient sám. Sedí na tej
         * istej stránke, na ktorú aj tak klikne z SMS; vlastný odkaz by
         * znamenal druhý token, druhú stránku a druhú vetu v správe.
         */
        /**
         * Minulé odpovede sa ukazujú ako OBRYS, nie ako predvyber (Jerry,
         * 30. 9. 2026). Berú sa zo VŠETKÝCH doterajších hodnotení, nie len
         * z dnešného — „minule 6" je informácia aj o mesiac starej odpovedi.
         */
        const predosle = ((await DB.prepare(
          "SELECT datum, oblasti_json, posun, poznamka FROM klient_merania WHERE klient = ?1 AND zdroj = 'klient' ORDER BY datum",
        ).bind(c.name).all().catch(() => ({ results: [] }))).results || []) as unknown as
          { datum: string; oblasti_json: string | null; posun: number | null; poznamka: string | null }[];
        const merania: Meranie[] = predosle.map((r) => ({
          datum: r.datum, oblasti: oblastiZJson(r.oblasti_json), posun: r.posun, poznamka: r.poznamka || "",
        }));
        const sOdkazom = [...merania].reverse().find((m) => m.poznamka.trim());

        /**
         * Oblasti Z JEHO ANAMNÉZY — to, s čím prišiel. Zápis trénera prebíja
         * to, čo odklikol klient (tá istá prednosť ako v zhrnutí anamnézy):
         * na úvodnom sa to prejde spolu a upresní.
         *
         * Keď anamnéza nie je alebo sa nedá prečítať, pýta sa jeden
         * všeobecný riadok — otázka bez anamnézy je lepšia než žiadna.
         */
        let oblastiKlienta: string[] = [];
        /**
         * Číslo z ÚVODNÉHO — kotva, voči ktorej sa meria zmena.
         *
         * Jerry, 2. 10. 2026: „Jak ti je by malo byť iba zhrubnutý rám
         * a číslo to, ktoré vyplnil na úvodnom tréningu." Berie sa z tej
         * istej anamnézy, z ktorej už beriem názvy oblastí — žiadne nové
         * čítanie šifrovaných odpovedí, len `sila` vedľa mena oblasti.
         */
        const zUvodneho: Record<string, number> = {};
        if (ANAMNEZA_KLUC) {
          const a = await podlaKlienta(DB, c.name, ANAMNEZA_KLUC).catch(() => null);
          const z = a ? (a.zapisOdpovede.oblasti ?? a.klientOdpovede.oblasti) : null;
          for (const o of oblastiZJson(z)) {
            oblastiKlienta.push(o.oblast);
            if (o.sila != null) zUvodneho[o.oblast] = o.sila;
          }
        }

        /**
         * OTÁZKY LEN PRI DOCHODENOM BALÍČKU A NAD RÁMEC.
         *
         * Jerry, 2. 10. 2026: „v Zostávajú hodiny by som dal preč Jak ti je."
         * Počas balíčka je to otázka navyše k ničomu — klient chodí ďalej
         * a nič sa nerozhoduje. Pri dochodenom balíčku je to iný okamih:
         * vtedy sa rozhoduje, či bude pokračovať.
         */
        const pocity = (vypis.zostatok ?? 1) > 0 ? "" : blokPocitovky({
          oblasti: oblastiKlienta,
          minule: posledneHodnoty(merania),
          zUvodneho,
          poslednyOdkaz: sOdkazom ? { datum: sOdkazom.datum, text: sOdkazom.poznamka.trim() } : undefined,
          vdaka: new URL(request.url).searchParams.get("vdaka") === "1",
        });

        /**
         * VLASTNÁ SADZBA, NIE RECYKLOVANÝ MAIL. Stránka bola dovtedy HTML
         * z mailu s prilepeným viewportom — preto bola tmavá a slovenská.
         * Mail zostáva ako bol; toto je to, čo klient otvorí z SMS.
         */
        const html = klientStranka({
          ...vypis,
          // Bitcoinový QR je už vo výpise; bankový `qrUrl` je pri takom
          // klientovi prázdny a prepísať ho ním by znamenalo stránku bez QR.
          qrUrl: vypis.qrUrl || qrUrl,
          pocitovka: pocity,
          logoUrl: `${origin}/znacka-napis-tmava.svg`,
          historiaPoslana: new URL(request.url).searchParams.get("historia") === "1",
        });

        /**
         * NÁHĽAD NEPOČÍTA OTVORENIE.
         *
         * Jerry, 2. 10. 2026: „keď kliknem na SMS, nech sa otvorí okno, kde
         * bude text tej SMS a náhľad obsahu odkazu." Lenže `otvorene` je
         * jediné miesto, z ktorého sa dá zistiť, či klient na odkaz klikol —
         * a keby ho dvíhal aj náhľad z Kokpitu, to číslo by prestalo o čomkoľvek
         * vypovedať.
         *
         * Preto `?nahlad=1` a LEN pre prihláseného. Bez prihlásenia sa
         * správa ako bežné otvorenie, takže kto adresu odkukne z SMS,
         * počítadlo neobíde.
         */
        const jeNahlad = new URL(request.url).searchParams.get("nahlad") === "1" && await isAuthed(request);
        if (!jeNahlad) {
          await DB.prepare("UPDATE klient_odkazy SET otvorene = otvorene + 1, posledne_otvorene = ?1 WHERE token = ?2")
            .bind(new Date().toISOString(), token).run().catch(() => null);
        }

        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
        });
      },

      /**
       * ODPOVEĎ NA TRI OTÁZKY. Autorizuje TOKEN v adrese — ten istý, ktorý
       * stránku otvoril; nič iné sa z formulára neberie, takže sa cezeň nedá
       * zapísať nikomu inému.
       *
       * Zápis PREPISUJE dnešok (`ON CONFLICT`), nepridáva druhý riadok:
       * klient si to vie rozmyslieť a klepnúť znova, a oprava má odpoveď
       * zmeniť, nie postaviť vedľa nej ďalšiu. Čo neklepol, sa nemaže
       * (`COALESCE`) — prázdno nie je odpoveď.
       */
      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        const spat = (vdaka: boolean) => new Response(null, {
          status: 303,
          headers: { location: `/v/${encodeURIComponent(token)}${vdaka ? "?vdaka=1" : ""}`, "cache-control": "no-store" },
        });
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return new Response("Tento odkaz neplatí.", { status: 404 });

        const r = await DB.prepare("SELECT klient FROM klient_odkazy WHERE token = ?1").bind(token).first<{ klient: string }>();
        if (!r) return new Response("Tento odkaz neplatí.", { status: 404 });

        const f = await request.formData();

        /**
         * CTA „Poslat na e-mail" — celá história.
         *
         * Jerry, 1. 10. 2026: „celá história by mala prísť na vyžiadanie
         * a preto by v tom odkaze malo byť CTA na žiadosť o celú históriu."
         * Posiela to TÁ ISTÁ funkcia, ktorá odpovedá na mailovú žiadosť
         * (`posliHistoriu`) — vrátane stropu raz za deň na klienta a toho,
         * že mail ide na adresu uloženú pri klientovi, nie kamkoľvek.
         * Druhá kópia by znamenala dva rôzne maily s tým istým názvom.
         */
        if (String(f.get("akcia") || "") === "historia") {
          const n = await nastavenia(DB);
          const v = await posliHistoriu(DB, r.klient, n).catch(() => ({ ok: false as const, preco: "zlyhalo" }));
          return new Response(null, {
            status: 303,
            headers: {
              location: `/v/${encodeURIComponent(token)}${v.ok ? "?historia=1" : "?historia=0"}`,
              "cache-control": "no-store",
            },
          });
        }
        // Meno oblasti a jej hodnota sa páruje PORADÍM — „hrudní páteř" ani
        // „lokty / zápěstí" sa do názvu poľa dať nedajú.
        const mena = f.getAll("oblast_meno").map((x) => String(x).trim().slice(0, 60)).filter(Boolean);
        const oblasti: Oblast[] = mena
          .map((oblast, i) => ({ oblast, sila: platnaHodnota(f.get(`oblast_sila_${i}`)) }))
          .filter((o) => o.sila != null);
        const posun = platnaHodnota(f.get("posun"), 1, POSUN.moznosti.length);
        const poznamka = String(f.get("poznamka") ?? "").trim().slice(0, 1000);
        if (!oblasti.length && posun == null && !poznamka) return spat(false);

        const dnes = new Date().toISOString().slice(0, 10);
        await DB.prepare(
          `INSERT INTO klient_merania (id, klient, datum, oblasti_json, posun, poznamka, autor, created_at, zdroj)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'klient', ?7, 'klient')
           ON CONFLICT (klient, datum, zdroj) DO UPDATE SET
             oblasti_json = COALESCE(excluded.oblasti_json, klient_merania.oblasti_json),
             posun        = COALESCE(excluded.posun,        klient_merania.posun),
             poznamka     = CASE WHEN excluded.poznamka = '' THEN klient_merania.poznamka ELSE excluded.poznamka END`,
        ).bind(
          `${dnes}-${crypto.randomUUID().slice(0, 8)}`, r.klient, dnes,
          oblasti.length ? JSON.stringify(oblasti) : null,
          posun, poznamka, new Date().toISOString(),
        ).run();

        return spat(true);
      },
    },
  },
});
