import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { normName } from "../../lib/psb/format";
import { bindings } from "../../lib/bindings.server";
import {
  nepriradene, porovnajPlatby, smieSaZapamatat, vzorPlatby,
  sposobZRiadku, type CenaBalicka, type Diel, type FakturaVzor, type FioRiadok, type Platba,
} from "../../lib/psb/platbyEvidencia";
import { balicekZPlatby } from "../../lib/psb/balicekZPlatby";
import { dlhyKlientov } from "../../lib/psb/zaplatene";
import { dnesPraha } from "../../lib/psb/cas";
import { mozePrepnut, PENIAZE_KLUC } from "../../lib/psb/peniazeZKokpitu";

/**
 * Vlastná evidencia platieb: banka z výpisu, hotovosť zo zošita.
 *
 * Tretia a posledná tretina plánu z 22. 9. 2026. Prvé dve merajú
 * `/api/kalendar` → `porovnanie` (dochádzka) a `/api/balicky` (hodiny).
 *
 * BANKA SA NENALIEVA CELÁ NARAZ
 *
 * Pri balíčkoch sa dal vziať export a založiť z neho riadky, lebo v ňom
 * klient STOJÍ. Vo výpise nestojí — je v texte, niekedy v správe, niekedy
 * v mene odosielateľa a niekedy nikde. Hromadné naliatie by preto priradilo
 * peniaze cudzím ľuďom. Priraďuje sa po jednom, appka navrhne a človek
 * potvrdí; naučené priradenie sa pamätá podľa odosielateľa, takže ten istý
 * platiteľ sa pýta raz.
 */

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();
const denISO = (s: unknown) => {
  const v = String(s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
};

type PlatbaRiadok = {
  id: string; klient: string; datum: string; suma_czk: number; sposob: string;
  fio_id: string | null; poznamka: string | null; zrusene_at: string | null;
};

const naPlatbu = (r: PlatbaRiadok): Platba => ({
  id: r.id, klient: r.klient, datum: r.datum, sumaCzk: r.suma_czk,
  sposob: r.sposob, fioId: r.fio_id, zruseneAt: r.zrusene_at,
});

type FakturaRiadok = { id: string; cislo: string; klient: string; ks: number; cena_czk: number };
type PolozkaRiadok = { faktura_id: string; klient: string; celkom_czk: number };

/**
 * Faktúry z Kokpitu na párovanie podľa variabilného symbolu. Faktúra
 * s položkami za ďalších klientov dostane `diely` — komu koľko z nej patrí.
 * Viac položiek toho istého klienta sa sčíta do jedného dielu.
 */
function fakturyKokpitu(faktury: FakturaRiadok[], polozky: PolozkaRiadok[]): FakturaVzor[] {
  const dalsie = new Map<string, PolozkaRiadok[]>();
  for (const p of polozky) dalsie.set(p.faktura_id, [...(dalsie.get(p.faktura_id) || []), p]);
  return faktury.filter((f) => f.cislo).map((f) => {
    const jeho = dalsie.get(f.id) || [];
    if (!jeho.length) return { cislo: f.cislo, klient: f.klient };
    const diely = new Map<string, number>();
    const pridaj = (k: string, n: number) => {
      const kl = normName(k);
      const kto = [...diely.keys()].find((x) => normName(x) === kl) || k;
      diely.set(kto, (diely.get(kto) || 0) + Math.round(n));
    };
    pridaj(f.klient, (Number(f.ks) || 1) * (Number(f.cena_czk) || 0));
    for (const p of jeho) pridaj(p.klient, Number(p.celkom_czk) || 0);
    return {
      cislo: f.cislo, klient: f.klient,
      ...(diely.size > 1 ? { diely: [...diely].map(([klient, suma]) => ({ klient, suma })) } : {}),
    };
  });
}

/**
 * JE TÁTO PLATBA VOPRED?
 *
 * Jerry, 4. 10. 2026: „ak klient zaplatí skôr, ako bude mať tréning, platba
 * sa zapíše, ale nový balíček má vzniknúť prvou odtrénovanou hodinou."
 * Balíček teda v tej chvíli ešte nie je a platba by sa pri počítaní dlhu
 * stratila (počítajú sa platby od prvého balíčka z Kokpitu). Príznak ju
 * udrží: platba je vopred, keď klient v čase priradenia NIČ NEDLŽÍ — ani
 * otvorený poplatok z PTmindera, ani nezaplatený balíček z Kokpitu.
 * Vtedy nepatrí ničomu, čo už existuje, a čaká na balíček, ktorý príde.
 */
async function jeVopred(DB: D1Database, klient: string): Promise<boolean> {
  // Jedno pravidlo „zaplatený" (`dlhyKlientov`, 5. 10. 2026) — to isté, čo
  // počíta `loadData`, aj s poistkou z PTmindera a bez zdvojeného predaja.
  // Dovtedy tu bola vlastná kópia bez nich a platbu klienta, ktorého
  // PTminder vedie ako zaplateného, neoznačila ako vopred.
  const k = normName(klient);
  // Len riadky tohto klienta (LIKE na prvé písmeno priezviska by bolo krehké;
  // tabuľky sú malé). História môže chýbať (pred migráciou 0095) — vtedy
  // poistka beží bez nej; ide súbežne, nech platba nečaká na dve kolá.
  const [[bal, pl, pop, ptp], hist] = await Promise.all([
    DB.batch([
      DB.prepare("SELECT id, klient, nazov, cena_czk, platnost_od, zdroj, zrusene_at FROM balicky"),
      DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, zrusene_at, vopred FROM platby"),
      DB.prepare("SELECT id, datum, client_name, popis, suma_czk FROM poplatky"),
      DB.prepare("SELECT client_name, date, amount_czk FROM payments"),
    ]),
    DB.prepare("SELECT klient, od FROM ptminder_historia").all().catch(() => ({ results: [] })),
  ]);
  type B = { id: string; klient: string; nazov: string; cena_czk: number | null; platnost_od: string; zdroj: string; zrusene_at: string | null };
  type P = { id: string; klient: string; datum: string; suma_czk: number; sposob: string; fio_id: string | null; zrusene_at: string | null; vopred: number | null };
  type O = { id: string; datum: string; client_name: string; popis: string; suma_czk: number };
  type T = { client_name: string; date: string; amount_czk: number };
  type H = { klient: string; od: string | null };
  const moje = <X,>(xs: X[], meno: (x: X) => string) => xs.filter((x) => normName(meno(x)) === k);
  const { polozky } = dlhyKlientov({
    poplatky: moje((pop.results || []) as unknown as O[], (x) => x.client_name)
      .map((p) => ({ id: p.id, klient: p.client_name, datum: p.datum, popis: p.popis || "", suma: Number(p.suma_czk) || 0 })),
    platby: moje((pl.results || []) as unknown as P[], (x) => x.klient)
      .map((p) => ({ id: p.id, klient: p.klient, datum: String(p.datum).slice(0, 10), suma: Number(p.suma_czk) || 0, zruseneAt: p.zrusene_at, vopred: p.vopred, sposob: p.sposob, fioId: p.fio_id })),
    balicky: moje((bal.results || []) as unknown as B[], (x) => x.klient)
      .map((b) => ({ id: b.id, klient: b.klient, nazov: b.nazov, cena: b.cena_czk, platnostOd: String(b.platnost_od).slice(0, 10), zdroj: b.zdroj, zruseneAt: b.zrusene_at })),
    ptPlatby: moje((ptp.results || []) as unknown as T[], (x) => x.client_name)
      .map((p) => ({ klient: p.client_name, datum: String(p.date || "").slice(0, 10), suma: Number(p.amount_czk) || 0 })),
    ptHistoria: moje((hist.results || []) as unknown as H[], (x) => x.klient)
      .map((h) => ({ klient: h.klient, od: String(h.od || "").slice(0, 10) })),
  });
  return polozky.length === 0;
}

/**
 * Zapíše diely jedného pohybu — každý ako samostatnú platbu s tým istým
 * `fio_id`. Spoločné pre ručné rozdelenie aj dávku. Diely sa musia zložiť
 * na sumu pohybu (tolerancia koruna); inak sa nezapíše nič.
 */
async function zapisDiely(
  DB: D1Database, r: FioRiadok, kusy: Diel[], kto: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (kusy.length < 2) return { ok: false, error: "Na rozdelenie treba aspoň dvoch klientov." };
  if (kusy.some((d) => !d.klient || d.suma <= 0)) return { ok: false, error: "Každý diel potrebuje klienta a kladnú sumu." };
  const spolu = kusy.reduce((n, d) => n + d.suma, 0);
  if (Math.abs(spolu - Math.round(r.amount_czk)) > 1) {
    return { ok: false, error: `Diely dávajú ${spolu} Kč, pohyb je ${Math.round(r.amount_czk)} Kč.` };
  }
  // Bez try/catch vracia worker HTML stránku „This page didn't load"
  // a na obrazovke to vyzerá, že sa neudialo nič. Presne tak vyzerala
  // zrazená unikátna stráž nad `fio_id` (migrácia 0082).
  const vopred = await Promise.all(kusy.map((d) => jeVopred(DB, d.klient)));
  try {
    await DB.batch(kusy.map((d, i) =>
      DB.prepare(
        "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).bind(uid(), d.klient, r.date.slice(0, 10), d.suma, sposobZRiadku(r), r.id,
        `rozdelené · ${(r.counterparty || "").slice(0, 160)}`, teraz(), kto || null, vopred[i] ? 1 : 0),
    ));
  } catch (e) {
    const t = String(e instanceof Error ? e.message : e);
    return {
      ok: false,
      error: /UNIQUE/i.test(t)
        ? "Tento pohyb už má priradenú platbu pre toho istého klienta."
        : `Diely sa nezapísali: ${t.slice(0, 160)}`,
    };
  }
  await audit(DB, {
    action: "platba-rozdelena",
    predmet: `${r.date.slice(0, 10)} · ${Math.round(r.amount_czk)} Kč`,
    neu: kusy.map((d) => `${d.klient}: ${d.suma}`).join(" · "),
    actor: kto,
  });
  return { ok: true };
}

/** Ručné spôsoby platby. Fio si svoje riadky značí samo cez fio_id. */
const SPOSOBY = ["hotovost", "prevod", "bitcoin", "ine"];

/** Stav vlastnej evidencie platieb — to isté pre GET aj pre bránu prepnutia peňazí. */
async function stavPlatieb(DB: D1Database) {
  const [vlastne, fio, mapa, nieKlient, mena, pt, horizont, faktury, firmy, idoklad, kontakty, polozky, ceny] = await DB.batch([
    DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at, vopred, created_at FROM platby ORDER BY datum DESC"),
    DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE amount_czk > 0 ORDER BY date DESC"),
    DB.prepare("SELECT vzor, klient FROM platba_mapovanie"),
    DB.prepare("SELECT fio_id FROM platba_nie_klient"),
    DB.prepare("SELECT DISTINCT client_name FROM sessions WHERE date >= date('now','-400 days')"),
    DB.prepare("SELECT client_name, date, amount_czk, payment_method FROM payments"),
    DB.prepare("SELECT MAX(substr(date,1,10)) den FROM sessions"),
    // Faktúry a firmy klientov — dva najtvrdšie dôkazy v texte platby.
    // Číslo faktúry chodí ako variabilný symbol; firma je fakturačný
    // údaj KLIENTA, nie cudzia strana (Jerry, 26. 9. 2026).
    DB.prepare("SELECT id, cislo, klient, ks, cena_czk FROM vydane_faktury WHERE storno_at IS NULL"),
    DB.prepare("SELECT klient, firma, ico FROM klient_fakturacia WHERE firma <> '' OR ico <> ''"),
    // Faktúry vystavené v iDoklade. Číslo dokladu stojí v texte prevodu
    // („20260037 MGR. FILIP STRANAVSKY") a je to variabilný symbol —
    // najtvrdší dôkaz, aký v tom texte býva. Meno na faktúre je ale
    // firma, takže sa prekladá cez spárované fakturačné kontakty.
    DB.prepare("SELECT cislo, nazov FROM idoklad_faktury"),
    DB.prepare("SELECT firma, klient FROM fakturacne_kontakty WHERE klient IS NOT NULL AND klient <> ''"),
    // Faktúra za viacerých klientov — podľa položiek sa platba rozdelí.
    DB.prepare("SELECT faktura_id, klient, celkom_czk FROM vydane_faktury_polozky ORDER BY poradie"),
    // Ceny balíčkov — spoločný prevod, keď PTminder už nepíše.
    // + história členstiev z PTmindera: balíčky v Kokpite začínajú
    // až jeseňou 2026, staršie ceny sú len tam.
    DB.prepare(`SELECT klient, platnost_od od, cena_czk cena FROM balicky WHERE zrusene_at IS NULL AND cena_czk > 0
                UNION ALL SELECT klient, od, platba cena FROM ptminder_historia WHERE platba > 0`),
  ]);

  const platby = ((vlastne.results || []) as unknown as PlatbaRiadok[]);
  const mapovanie: Record<string, string> = {};
  for (const m of ((mapa.results || []) as unknown as { vzor: string; klient: string }[])) mapovanie[m.vzor] = m.klient;
  const poExport = String(((horizont.results || [])[0] as { den?: string } | undefined)?.den || dnesPraha());

  /**
   * Odkedy sa porovnáva — a prečo to nie je „odjakživa".
   *
   * Bankové platby sa dajú doplniť spätne z výpisu, HOTOVOSŤ nie:
   * tá je v zošite a nikto ju rok dozadu prepisovať nebude. V starších
   * mesiacoch by teda rozdiel ukazoval chýbajúcu hotovosť, nie chybu —
   * a cieľ „rozdiel nula" by bol nedosiahnuteľný. Súbežný chod preto
   * začína mesiacom, ktorý si Jerry zvolí (`platby_od`); staršie
   * bankové platby v evidencii zostávajú, len sa nesúdia.
   */
  const odMesiaca = String(
    (await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'platby_od'").first<{ value: string }>())?.value || "",
  ).replace(/"/g, "") || dnesPraha().slice(0, 7);

  const ptPlatby = ((pt.results || []) as unknown as { client_name: string; date: string; amount_czk: number; payment_method: string }[])
    .map((p) => ({ klient: p.client_name, datum: p.date, suma: p.amount_czk, metoda: p.payment_method }));
  /**
   * Faktúra z iDokladu → klient. Meno na doklade býva firma
   * („FSH Devices s.r.o."), preto cez spárované kontakty; keď je
   * vystavená priamo na človeka, hľadá sa medzi klientmi.
   */
  const menaKlientov = ((mena.results || []) as unknown as { client_name: string }[]).map((x) => x.client_name);
  const podlaFirmy = new Map<string, string>();
  for (const k of ((kontakty.results || []) as unknown as { firma: string; klient: string }[])) {
    podlaFirmy.set(normName(k.firma), k.klient);
  }
  const zIdokladu = ((idoklad.results || []) as unknown as { cislo: string; nazov: string }[])
    .map((f) => ({
      cislo: f.cislo,
      klient: podlaFirmy.get(normName(f.nazov))
        || menaKlientov.find((m) => normName(m) === normName(f.nazov))
        || "",
    }))
    .filter((f) => f.klient);

  const vsetkyNepriradene = nepriradene(
    (fio.results || []) as unknown as FioRiadok[],
    platby.map(naPlatbu),
    mapovanie,
    new Set(((nieKlient.results || []) as unknown as { fio_id: string }[]).map((x) => x.fio_id)),
    menaKlientov,
    ptPlatby,
    [...fakturyKokpitu(
      (faktury.results || []) as unknown as FakturaRiadok[],
      (polozky.results || []) as unknown as PolozkaRiadok[],
    ), ...zIdokladu],
    ((firmy.results || []) as unknown as { klient: string; firma: string; ico: string }[]),
    (ceny.results || []) as unknown as CenaBalicka[],
  );
  const celkomNepriradenych = vsetkyNepriradene.length;

  const porovnanie = porovnajPlatby(
    platby.map(naPlatbu),
    ptPlatby,
    poExport,
    odMesiaca,
  );
  return {
    ok: true as const,
    platby,
    nepriradene: vsetkyNepriradene.slice(0, 120),
    porovnanie,
    /**
     * Peniaze z Kokpitu (`peniazeZKokpitu.ts`): od ktorého mesiaca už
     * platia a či sa smú prepnúť od začiatku súbežného chodu. Brána
     * počíta len príjmy, ktoré vyzerajú na platbu klienta — vrátka
     * z obchodu prepnutiu nebráni.
     */
    peniazeOd: String((await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(PENIAZE_KLUC).first<{ value: string }>().catch(() => null))?.value || "").replace(/"/g, ""),
    prepnutie: { od: odMesiaca, ...mozePrepnut(odMesiaca, porovnanie.mesiace, vsetkyNepriradene.filter((x) => x.klientsky)) },
    poExport,
    odMesiaca,
    celkomNepriradenych,
  };
}

export const Route = createFileRoute("/api/platby")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        /**
         * Platby jedného klienta — pre jeho profil.
         * Celá odpoveď nižšie ťahá aj výpis z banky a porovnanie s PTminderom;
         * na profil to je zbytočná práca, ktorú by človek čakal pri každom
         * kliknutí na meno.
         */
        // Meno sa NEPOROVNÁVA v SQL: „Tomáš Dvořák" a „Tomas Dvorak" sú v D1
        // dva rôzne reťazce a klientovi by jeho vlastná platba zmizla.
        // Tabuľka má stovky riadkov, takže sa vráti celá a triedi sa hore.
        if (new URL(request.url).searchParams.has("klient")) {
          const r = await DB.prepare(
            "SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at, vopred, created_at FROM platby ORDER BY datum DESC",
          ).all();
          return Response.json({ ok: true, platby: r.results || [] });
        }

        return Response.json(await stavPlatieb(DB));
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }
        const akcia = String(b.akcia || "");
        const kto = await currentUser(request) || undefined;

        /** Riadok výpisu → platba klienta. `zapamataj` uloží aj pravidlo. */
        if (akcia === "priradz") {
          const fioId = String(b.fioId || "");
          const klient = String(b.klient || "").trim();
          if (!fioId || !klient) return Response.json({ ok: false, error: "Chýba platba alebo klient." }, { status: 400 });
          const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
            .bind(fioId).first<FioRiadok>();
          if (!r) return Response.json({ ok: false, error: "Riadok výpisu neexistuje." }, { status: 404 });
          const prikazy = [
            DB.prepare(
              "INSERT OR IGNORE INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,?,?,?,?,?)",
            ).bind(uid(), klient, r.date.slice(0, 10), r.amount_czk, sposobZRiadku(r), fioId, (r.counterparty || "").slice(0, 200), teraz(), kto || null, (await jeVopred(DB, klient)) ? 1 : 0),
          ];
          // Pravidlo sa učí LEN vtedy, keď je klient priamo v odosielateľovi.
          // Inak by sa naučilo zo sprostredkovaného prevodu a každý ďalší
          // prevod tej istej osoby by appka ponúkala ako platbu toho klienta.
          const vzor = vzorPlatby(r);
          const naucil = !!b.zapamataj && smieSaZapamatat(vzor, klient);
          if (naucil) {
            prikazy.push(DB.prepare("INSERT OR REPLACE INTO platba_mapovanie (vzor, klient, potvrdene_at) VALUES (?,?,?)")
              .bind(vzor, klient, teraz()));
          }
          await DB.batch(prikazy);
          await audit(DB, { action: "platba-priradena", predmet: klient, neu: `${r.amount_czk} Kč · ${r.date.slice(0, 10)}`, actor: kto });

          /**
           * BALÍČEK VZNIKÁ Z PENAZÍ, NIE ZO ZÁMERU.
           *
           * Jerry, 2. 10. 2026: „áno, dorob to." SMS s QR je ponuka; keby
           * balíček vznikol pri jej odoslaní, klientovi by sa hneď ukázalo
           * „Zbývá ti 6 h" a QR by zmizlo skôr, než zaplatí — a kto
           * nezaplatí, nechá v appke balíček, ktorý nikdy nebol.
           *
           * Tu je ten správny okamih: peniaze dorazili. Appka len NAVRHNE,
           * čo si klient zrejme kúpil; zapíše sa to až kliknutím.
           */
          const jehoBalicky = ((await DB.prepare(
            "SELECT nazov, cena_czk, platnost_od, zrusene_at FROM balicky WHERE klient = ?1",
          ).bind(klient).all().catch(() => ({ results: [] }))).results || []) as unknown as
            { nazov: string; cena_czk: number | null; platnost_od: string; zrusene_at: string | null }[];
          const navrh = balicekZPlatby({ suma: r.amount_czk, den: r.date.slice(0, 10), balicky: jehoBalicky });

          return Response.json({ ok: true, zapamatane: naucil, navrh });
        }

        /**
         * DÁVKOVÉ PRIRADENIE.
         *
         * Jerry, 26. 9. 2026: „vieš tie platby na účte automaticky priradiť
         * ku klientovi na základe poznámky v platbe — ale nie tak, že sa
         * priamo zapíšu?" Presne tak to aj je: appka návrh urobí sama
         * (z mena v texte, z naučeného pravidla, zo sumy a dňa), ale zapíše
         * sa až to, čo človek odklikne. Toto je len to odkliknutie naraz —
         * po jednom to bola práca na mesiac.
         *
         * Každý riadok sa spracuje zvlášť a chyba jedného neruší ostatné:
         * jedna platba na neexistujúci riadok výpisu nesmie zhodiť dávku
         * dvadsiatich.
         */
        if (akcia === "priradz-davka") {
          const polozky = (Array.isArray(b.polozky) ? b.polozky : []) as { fioId?: unknown; klient?: unknown; diely?: unknown }[];
          if (!polozky.length) return Response.json({ ok: false, error: "Nič na priradenie." }, { status: 400 });
          if (polozky.length > 100) return Response.json({ ok: false, error: "Naraz najviac sto platieb." }, { status: 400 });

          let hotovo = 0;
          let naucenych = 0;
          const chyby: string[] = [];
          for (const p of polozky) {
            const fioId = String(p.fioId || "");
            const klient = String(p.klient || "").trim();
            /**
             * SPOLOČNÝ PREVOD V DÁVKE. Diely sa zapíšu každému zvlášť a
             * pravidlo sa neučí — vzor by ukazoval na dvoch ľudí naraz.
             */
            if (fioId && Array.isArray(p.diely) && p.diely.length >= 2) {
              const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
                .bind(fioId).first<FioRiadok>();
              if (!r) { chyby.push(`${fioId.slice(0, 8)}: riadok výpisu neexistuje`); continue; }
              const kusy = (p.diely as { klient?: unknown; suma?: unknown }[])
                .map((d) => ({ klient: String(d.klient || "").trim(), suma: Math.round(Number(d.suma) || 0) }));
              const v = await zapisDiely(DB, r, kusy, kto);
              if (!v.ok) { chyby.push(`${r.date.slice(0, 10)} ${Math.round(r.amount_czk)} Kč: ${v.error}`); continue; }
              hotovo++;
              continue;
            }
            if (!fioId || !klient) { chyby.push("chýba platba alebo klient"); continue; }
            const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
              .bind(fioId).first<FioRiadok>();
            if (!r) { chyby.push(`${fioId.slice(0, 8)}: riadok výpisu neexistuje`); continue; }
            const vzor = vzorPlatby(r);
            const naucil = smieSaZapamatat(vzor, klient);
            const prikazy = [
              DB.prepare(
                "INSERT OR IGNORE INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,?,?,?,?,?)",
              ).bind(uid(), klient, r.date.slice(0, 10), r.amount_czk, sposobZRiadku(r), fioId, (r.counterparty || "").slice(0, 200), teraz(), kto || null, (await jeVopred(DB, klient)) ? 1 : 0),
            ];
            if (naucil) {
              prikazy.push(DB.prepare("INSERT OR REPLACE INTO platba_mapovanie (vzor, klient, potvrdene_at) VALUES (?,?,?)")
                .bind(vzor, klient, teraz()));
              naucenych++;
            }
            await DB.batch(prikazy);
            hotovo++;
          }
          await audit(DB, { action: "platby-davka", predmet: `${hotovo} z ${polozky.length}`, neu: `naučených pravidiel: ${naucenych}`, actor: kto });
          return Response.json({ ok: true, hotovo, naucenych, chyby: chyby.slice(0, 10) });
        }

        /**
         * JEDEN PREVOD, VIAC KLIENTOV.
         *
         * Jerry, 28. 9. 2026: „15 580 DK Consulting — to je Dan Kouřil, ale
         * spoločne s Monikou Schonwalderovou, takže to potrebujem rozdeliť."
         * Dvaja klienti si pošlú balíčky jedným prevodom a v banke je to
         * jeden riadok.
         *
         * Zapíše sa toľko platieb, koľko je dielov, a všetky nesú to isté
         * `fio_id` — pohyb tak zmizne zo zoznamu nepriradených a v mesačnom
         * porovnaní s PTminderom sedí súčet.
         *
         * Diely sa musia zložiť na SUMU POHYBU. Tolerancia je koruna kvôli
         * zaokrúhľovaniu; väčší rozdiel je preklep a ten sa nezapíše —
         * rozdelenie, ktoré nesedí, je horšie než nerozdelené.
         *
         * Odosielateľ sa NEUČÍ: vzor by ukazoval na dvoch ľudí naraz a
         * najbližší prevod od tej istej firmy by sa priradil jednému z nich.
         */
        if (akcia === "rozdel") {
          const fioId = String(b.fioId || "");
          const diely = (Array.isArray(b.diely) ? b.diely : []) as { klient?: unknown; suma?: unknown }[];
          if (!fioId || diely.length < 2) {
            return Response.json({ ok: false, error: "Na rozdelenie treba aspoň dvoch klientov." }, { status: 400 });
          }
          const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
            .bind(fioId).first<FioRiadok>();
          if (!r) return Response.json({ ok: false, error: "Riadok výpisu neexistuje." }, { status: 404 });
          const kusy = diely.map((d) => ({ klient: String(d.klient || "").trim(), suma: Math.round(Number(d.suma) || 0) }));
          const v = await zapisDiely(DB, r, kusy, kto);
          if (!v.ok) return Response.json(v, { status: /dávajú|potrebuje|aspoň/.test(v.error) ? 400 : 500 });
          return Response.json({ ok: true, dielov: kusy.length });
        }

        /**
         * „Toto nie je platba klienta" — nájom, vrátenie, vlastný prevod.
         * Nemaže sa nič z výpisu; len sa prestane pýtať.
         */
        if (akcia === "nieKlient") {
          const fioId = String(b.fioId || "");
          if (!fioId) return Response.json({ ok: false, error: "Chýba platba." }, { status: 400 });
          await DB.prepare("INSERT OR REPLACE INTO platba_nie_klient (fio_id, dovod, oznacene_at) VALUES (?,?,?)")
            .bind(fioId, String(b.dovod || "").slice(0, 200) || null, teraz()).run();
          return Response.json({ ok: true });
        }

        /** Hotovosť zo zošita — jediné miesto, kde sa píše ručne. */
        if (akcia === "hotovost") {
          const klient = String(b.klient || "").trim();
          const datum = denISO(b.datum);
          const suma = Number(b.suma) || 0;
          if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
          if (!datum) return Response.json({ ok: false, error: "Chýba dátum (RRRR-MM-DD)." }, { status: 400 });
          if (suma <= 0) return Response.json({ ok: false, error: "Suma musí byť kladná." }, { status: 400 });
          const sposob = SPOSOBY.includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          await DB.prepare(
            "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,NULL,?,?,?,?)",
          ).bind(uid(), klient, datum, suma, sposob, String(b.poznamka || "").slice(0, 300) || null, teraz(), kto || null, (await jeVopred(DB, klient)) ? 1 : 0).run();
          await audit(DB, { action: "platba-hotovost", predmet: klient, neu: `${suma} Kč · ${datum}`, actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * Oprava ručnej platby — preklep v sume alebo dátume.
         * Platby z banky sa neupravujú: ich pravdou je výpis, nie Kokpit.
         */
        if (akcia === "uprav") {
          const id = String(b.id || "");
          const datum = denISO(b.datum);
          const suma = Number(b.suma) || 0;
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          if (!datum) return Response.json({ ok: false, error: "Chýba dátum (RRRR-MM-DD)." }, { status: 400 });
          if (suma <= 0) return Response.json({ ok: false, error: "Suma musí byť kladná." }, { status: 400 });
          const stav = await DB.prepare("SELECT fio_id FROM platby WHERE id = ?").bind(id).first<{ fio_id: string | null }>();
          if (!stav) return Response.json({ ok: false, error: "Platba sa nenašla." }, { status: 404 });
          if (stav.fio_id) return Response.json({ ok: false, error: "Platbu z banky upraviť nejde — pravdou je výpis." }, { status: 400 });
          const sposob = SPOSOBY.includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          await DB.prepare(
            "UPDATE platby SET datum=?, suma_czk=?, sposob=?, poznamka=? WHERE id=?",
          ).bind(datum, suma, sposob, String(b.poznamka || "").slice(0, 300) || null, id).run();
          await audit(DB, { action: "platba-upravena", predmet: id, neu: `${suma} Kč · ${datum}`, actor: kto });
          return Response.json({ ok: true });
        }

        /** Zrušenie NEMAŽE — platba je záznam v knihe, nie riadok v tabuľke. */
        if (akcia === "zrus" || akcia === "vrat") {
          const id = String(b.id || "");
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          await DB.prepare("UPDATE platby SET zrusene_at = ? WHERE id = ?").bind(akcia === "zrus" ? teraz() : null, id).run();
          await audit(DB, { action: akcia === "zrus" ? "platba-zrusena" : "platba-vratena", predmet: id, actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * PENIAZE Z KOKPITU OD MESIACA — alebo späť na PTminder (prázdny mesiac).
         *
         * Prepnúť sa dá len od mesiaca, od ktorého sa súbežný chod súdi, a len
         * keď brána (`mozePrepnut`) pustí: rozhoduje server, nie tlačidlo —
         * obrazovka mohla byť načítaná pred hodinou. Späť sa dá vždy.
         */
        if (akcia === "peniaze-od") {
          const m = String(b.mesiac || "").slice(0, 7);
          if (!m) {
            await DB.prepare("DELETE FROM vzas_settings WHERE key = ?1").bind(PENIAZE_KLUC).run();
            await audit(DB, { action: "peniaze-z-ptmindera", predmet: "", actor: kto });
            return Response.json({ ok: true });
          }
          const stav = await stavPlatieb(DB);
          if (m !== stav.prepnutie.od) return Response.json({ ok: false, error: `Prepnúť sa dá od ${stav.prepnutie.od} — od toho mesiaca sa súbežný chod porovnáva.` }, { status: 400 });
          if (!stav.prepnutie.ok) return Response.json({ ok: false, error: `Ešte nesedí: ${stav.prepnutie.dovody.join(" · ")}` }, { status: 409 });
          await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(PENIAZE_KLUC, JSON.stringify(m)).run();
          await audit(DB, { action: "peniaze-z-kokpitu", predmet: m, actor: kto });
          return Response.json({ ok: true });
        }

        /** Odkedy sa súbežný chod súdi. Staršie mesiace zostávajú v evidencii. */
        if (akcia === "odMesiaca") {
          const m = String(b.mesiac || "").slice(0, 7);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return Response.json({ ok: false, error: "Mesiac musí byť RRRR-MM." }, { status: 400 });
          await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES ('platby_od',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(JSON.stringify(m)).run();
          await audit(DB, { action: "platby-od", predmet: m, actor: kto });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
      },
    },
  },
});
