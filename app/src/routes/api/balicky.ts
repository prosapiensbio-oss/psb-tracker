import { createFileRoute } from "@tanstack/react-router";
import { KOKPIT_OD } from "../../lib/psb/sedeniaZKalendara";
import type { D1Database } from "@cloudflare/workers-types";

import { navrhyNovychBalickov, navrhyPokracovaniaPredplatneho } from "../../lib/psb/automatickeBalicky.server";
import { smieVzniknutAutomaticky } from "../../lib/psb/workspaceKroky";
import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { type Balicek } from "../../lib/psb/balickyEvidencia";
import { hodinZNazvuBalicka } from "../../lib/psb/klientOsCasu";
import { jeMesiac, normName } from "../../lib/psb/format";
import { jePlatenyBalicek, podobnyBalicek, type ExistujuciBalicek } from "../../lib/psb/duplicitaBalicka";
import { dnesPraha } from "../../lib/psb/cas";
import { chybaUkoncenia, poznamkaUkoncenia, poznamkaVratenia } from "../../lib/psb/ukoncenieBalicka";

/**
 * Vlastná evidencia balíčkov — a jej porovnanie s PTminderom.
 *
 * Je to druhá polovica plánu z 22. 9. 2026: nechať obe evidencie bežať vedľa
 * seba a PTminder vypnúť, až keď sa prestanú rozchádzať. Prvá polovica
 * (dochádzka z kalendára) sa meria v `/api/kalendar` → `porovnanie`.
 *
 * ŠTART BEZ PREPISOVANIA
 *
 * Akcia `nalej` vezme aktuálny export a založí z neho vlastné riadky. Bez nej
 * by súbežný chod znamenal prepísať ručne päťdesiat živých členstiev — teda
 * presne tú administratívu, ktorej sa má Jerry zbaviť. Naliatie je
 * idempotentné (`ptminder_id` je unikátne), takže opakované spustenie nič
 * nezdvojí a doplní len to, čo pribudlo.
 */

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();
const denISO = (s: unknown) => {
  const v = String(s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && jeMesiac(v.slice(0, 7)) ? v : "";
};

type Riadok = {
  id: string; klient: string; nazov: string; hodiny: number | null;
  platnost_od: string; platnost_do: string | null; cena_czk: number | null;
  zdroj: string; ptminder_id: string | null; poznamka: string | null; zrusene_at: string | null;
};

const naBalicek = (r: Riadok): Balicek => ({
  id: r.id, klient: r.klient, nazov: r.nazov, hodiny: r.hodiny,
  platnostOd: r.platnost_od, platnostDo: r.platnost_do, cenaCzk: r.cena_czk,
  zdroj: r.zdroj, zruseneAt: r.zrusene_at,
});

/**
 * Vlastná evidencia. Porovnanie s PTminderom (`porovnajBalicky`) sa od
 * 20. 10. 2026 nepočíta — do PTmindera sa nezapisuje a dopyt ťahal celú
 * tabuľku kal_udalosti len kvôli nemu.
 */
async function nacitaj(DB: D1Database) {
  const vlastne = await DB.prepare("SELECT id, klient, nazov, hodiny, platnost_od, platnost_do, cena_czk, zdroj, ptminder_id, poznamka, zrusene_at, created_at FROM balicky ORDER BY klient, platnost_od").all();
  return { riadky: ((vlastne.results || []) as unknown as Riadok[]) };
}


/**
 * ZÁPIS NOVÉHO BALÍČKA — ručný aj automatický (prvým tréningom) idú tadiaľto.
 *
 * Čakajúci presun hodín sa pridá k prvému balíčku, ktorý po ňom vznikne —
 * „6h Předplatné" s ôsmimi hodinami vo vnútri (Jerry, 4. 10. 2026).
 * Doplnenie členstva presun nedostane: to nie je ďalší balíček, len
 * predĺžené staré hodiny.
 */
async function zapisBalicek(
  DB: D1Database,
  b: { klient: string; nazov: string; hodiny: number | null; od: string; doDna: string | null; cena: number | null; poznamka: string | null },
  kto: string | null | undefined,
  akcia = "balicek-novy",
): Promise<{ id: string; prenesene: number }> {
  const id = uid();
  // Meno sa NEPOROVNÁVA v SQL (21. 10. 2026): presun zapísaný pod „Tomas
  // Dvorak“ by balíček pre „Tomáš Dvořák“ nenašiel a prenesené hodiny by
  // ticho prepadli. Čakajúcich presunov je pár, filtruje sa tu.
  const caka = b.hodiny != null && !/doplnenie/i.test(b.nazov)
    ? (((await DB.prepare(
      "SELECT id, klient, hodiny, z_platnosti_do FROM balicky_presun WHERE pouzite_balicek_id IS NULL AND z_platnosti_do < ?1",
    ).bind(b.od).all().catch(() => ({ results: [] }))).results || []) as unknown as { id: string; klient: string; hodiny: number; z_platnosti_do: string }[])
      .filter((x) => normName(x.klient) === normName(b.klient))
    : [];
  const prenesene = caka.reduce((a, x) => a + (Number(x.hodiny) || 0), 0);
  const hodinySpolu = b.hodiny == null ? null : b.hodiny + prenesene;
  const poznamkaSpolu = prenesene
    ? [b.poznamka, `+${prenesene} h prenesené z balíčka do ${caka.map((x) => x.z_platnosti_do).join(", ")}`].filter(Boolean).join(" · ").slice(0, 400)
    : b.poznamka;
  await DB.prepare(
    `INSERT INTO balicky (id, klient, nazov, hodiny, platnost_od, platnost_do, cena_czk, zdroj, ptminder_id, poznamka, created_at, autor)
     VALUES (?,?,?,?,?,?,?,'rucne',NULL,?,?,?)`,
  ).bind(id, b.klient, b.nazov, hodinySpolu, b.od, b.doDna, b.cena, poznamkaSpolu, teraz(), kto || null).run();
  if (caka.length) {
    await DB.batch(caka.map((x) => DB.prepare(
      "UPDATE balicky_presun SET pouzite_balicek_id = ?1, pouzite_at = ?2 WHERE id = ?3",
    ).bind(id, teraz(), x.id)));
  }
  await audit(DB, { action: akcia, predmet: `${b.klient} — ${b.nazov}`, neu: `${hodinySpolu ?? "paušál"} h, ${b.od}–${b.doDna || "bez konca"}${prenesene ? ` (z toho ${prenesene} h prenesené)` : ""}`, actor: kto || undefined });
  return { id, prenesene };
}

export const Route = createFileRoute("/api/balicky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const { riadky } = await nacitaj(DB);
        // Presuny hodín, ktoré ešte čakajú na ďalší balíček (migrácia 0097).
        const presuny = ((await DB.prepare(
          "SELECT klient, hodiny, z_platnosti_do FROM balicky_presun WHERE pouzite_balicek_id IS NULL",
        ).all().catch(() => ({ results: [] }))).results || []) as unknown as { klient: string; hodiny: number; z_platnosti_do: string }[];
        return Response.json({ ok: true, balicky: riadky, presuny });
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

        // ── naliatie z exportu ───────────────────────────────────────────
        if (akcia === "nalej") {
          const pt = ((await DB.prepare(
            "SELECT id, client_name, package_name, sessions_remaining, sessions_total, valid_from, valid_to, payment_czk, kind, na_obdobie FROM packages",
          ).all()).results || []) as unknown as {
            id: string; client_name: string; package_name: string; sessions_remaining: number; sessions_total: number;
            valid_from: string; valid_to: string; payment_czk: number | null; kind: string; na_obdobie: number;
          }[];
          // Dokiaľ siaha export — k tomuto dňu platí zostatok, ktorý z neho
          // preberáme ako otváraciu položku.
          const horizont = String(((await DB.prepare("SELECT MAX(substr(date,1,10)) den FROM sessions").first<{ den: string }>())?.den) || "").slice(0, 10);
          const uz = new Set(((await DB.prepare("SELECT ptminder_id FROM balicky WHERE ptminder_id IS NOT NULL").all()).results || [])
            .map((r) => String((r as { ptminder_id: string }).ptminder_id)));
          /**
           * ČO UŽ V KOKPITE JE, SA POZNÁ PODĽA OBSAHU, NIE PODĽA ID.
           *
           * `ptminder_id` je id riadku v `packages` — a import balíčkov riadky
           * klientov zo súboru pri každom nahratí zmaže a založí s NOVÝM id.
           * Naliatie sa tak po každom importe tvárilo, že všetko je nové:
           * 29. 9. 2026 by založilo 96 balíčkov, z toho 59 už v Kokpite boli,
           * a tým klientom by sa zdvojnásobili hodiny. Od 1. 10. sú pritom
           * balíčky v Kokpite jediný zdroj zostatkov.
           *
           * Kľúč: klient + názov + začiatok platnosti. Riadok bez dátumu
           * (ročný balíček, doplnenie) sa berie ako už naliaty, keď ten istý
           * klient má ten istý názov — jeho zostatok sa prevzal raz a druhé
           * prevzatie by ho zdvojilo.
           */
          const vKokpite = ((await DB.prepare("SELECT klient, nazov, platnost_od, poznamka FROM balicky WHERE zrusene_at IS NULL").all()).results || []) as unknown as { klient: string; nazov: string; platnost_od: string; poznamka: string | null }[];
          /**
           * BALÍČEK, KTORÝ KOKPIT UŽ ZALOŽIL SÁM (prvým tréningom, 4. 10. 2026).
           * PTminder ho mal nahodiť Jerry v iný deň — pri predaji, nie pri
           * tréningu — takže deň sa nestretne. Ten istý klient a začiatok do
           * 14 dní od automatického = ten istý balíček; druhý by zdvojil hodiny.
           */
          const automaticke = vKokpite.filter((r) => /^automaticky/i.test(String(r.poznamka || "")));
          // Ten istý klient, rovnaký počet hodín a začiatok do 14 dní.
          const maAutomaticky = (klient: string, od: string, hodin: number) => automaticke.some((r) => r.klient === klient
            && (!hodin || hodinZNazvuBalicka(r.nazov) === hodin)
            && Math.abs(Date.parse(`${String(r.platnost_od).slice(0, 10)}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) <= 14 * 86400000);
          const podlaObsahu = new Set(vKokpite.map((r) => `${r.klient}|${r.nazov}|${String(r.platnost_od).slice(0, 10)}`));
          const podlaNazvu = new Set(vKokpite.map((r) => `${r.klient}|${r.nazov}`));
          /**
           * TEN ISTÝ PREDAJ POD INÝM MENOM — deň a počet hodín.
           *
           * Kokpit volá produkt „Předplatné 6 h", PTminder „OFF - 6h
           * S viazanostou"; podľa názvu sa nestretnú a naliatie by založilo
           * druhý riadok. 3. 10. 2026 sa to stalo Vítězslavovi Papiežovi
           * a karta mu hneď ukázala 11 h namiesto 5. Ten istý kľúč používa
           * aj os času (`osCasuKlienta`), nech obe miesta párujú rovnako.
           */
          const podlaHodin = new Set(
            vKokpite.map((r) => `${r.klient}|${String(r.platnost_od).slice(0, 10)}|h${hodinZNazvuBalicka(r.nazov) || ""}`),
          );

          const kedy = teraz();
          const prikazy = [];
          const preskocene: string[] = [];
          for (const p of pt) {
            if (uz.has(p.id)) continue;
            const odExportu = denISO(p.valid_from);
            // Predaj od 1. 10. 2026 vedie Kokpit (balíček vzniká sám prvým
            // tréningom). Naliaty z PTmindera by bol druhý zápis toho istého
            // predaja — dlh aj hodiny dvakrát (kontrola 29. 10. 2026).
            if (odExportu && odExportu >= KOKPIT_OD) { preskocene.push(`${p.client_name} — ${p.package_name} (od ${odExportu} vedie predaje Kokpit)`); continue; }
            if (odExportu && maAutomaticky(p.client_name, odExportu, p.sessions_total > 0 ? p.sessions_total : (p.na_obdobie > 0 ? p.na_obdobie : hodinZNazvuBalicka(p.package_name || "")))) { preskocene.push(`${p.client_name} — ${p.package_name} (Kokpit ho založil prvým tréningom)`); continue; }
            if (odExportu ? podlaObsahu.has(`${p.client_name}|${p.package_name}|${odExportu}`) : podlaNazvu.has(`${p.client_name}|${p.package_name}`)) continue;
            const hodinZExportu = p.sessions_total > 0 ? p.sessions_total : (p.na_obdobie > 0 ? p.na_obdobie : hodinZNazvuBalicka(p.package_name || ""));
            if (odExportu && hodinZExportu > 0 && podlaHodin.has(`${p.client_name}|${odExportu}|h${hodinZExportu}`)) continue;
            const zNazvu = /(\d+)\s*(h|hod)/i.exec(p.package_name || "");
            let od = denISO(p.valid_from);
            let doDna = denISO(p.valid_to) || null;
            // Hodiny z exportu; 0 znamená „export mlčí" (offline členstvá aj
            // paušály), a z názvu sa dá počet vyčítať — to už appka vie.
            // Počet na obdobie z exportu (8 per month, prenesené hodiny) má prednosť pred názvom.
            let hodiny: number | null = p.sessions_total > 0 ? p.sessions_total
              : p.na_obdobie > 0 ? p.na_obdobie
              : (zNazvu ? Number(zNazvu[1]) : null);
            let poznamka: string | null = hodiny == null ? "paušál — zostatok sa nepočíta" : null;

            /**
             * Doplnenia členstva („package") nemajú v exporte ŽIADNE dátumy.
             * Z takého riadku sa nedá odpočítavať — nevie sa odkedy — ale
             * zahodiť ho nemožno: sú to hodiny, ktoré klient zaplatil
             * a appka by ich po vypnutí PTmindera stratila (Tomáš Krčmar 68,
             * Jaroslav Broskva 50).
             *
             * Preberá sa teda to jediné, čo taký riadok naozaj hovorí:
             * KOĽKO ZOSTÁVA K DŇU EXPORTU. Je to otváracia položka, presne
             * ako kotva `balicek_zostatok` — od nej sa ďalej odpočítava
             * podľa kalendára. Dopočítať z nej minulosť sa nedá a nemá sa
             * o to pokúšať.
             */
            if (!od) {
              if (!p.sessions_remaining || !horizont) { preskocene.push(`${p.client_name} — ${p.package_name}`); continue; }
              od = horizont;
              doDna = null;
              hodiny = p.sessions_remaining;
              poznamka = `zostatok prevzatý z PTmindera k ${horizont} — pôvodný riadok nemá dátum platnosti`;
            }
            prikazy.push(DB.prepare(
              `INSERT INTO balicky (id, klient, nazov, hodiny, platnost_od, platnost_do, cena_czk, zdroj, ptminder_id, poznamka, created_at, autor)
               VALUES (?,?,?,?,?,?,?,'ptminder',?,?,?,?)`,
            ).bind(uid(), p.client_name, p.package_name, hodiny, od, doDna,
              p.payment_czk, p.id, poznamka, kedy, kto || null));
          }
          if (prikazy.length) await DB.batch(prikazy);
          await audit(DB, { action: "balicky-naliatie", predmet: `${prikazy.length} z exportu`, neu: preskocene.slice(0, 10).join(" · ").slice(0, 300), actor: kto });
          return Response.json({ ok: true, pridanych: prikazy.length, preskocenych: preskocene.length, preskocene: preskocene.slice(0, 30) });
        }

        // ── ručný zápis ──────────────────────────────────────────────────
        if (akcia === "pridaj" || akcia === "uprav") {
          const klient = String(b.klient || "").trim();
          const nazov = String(b.nazov || "").trim();
          const od = denISO(b.platnostOd);
          if (!klient || !nazov) return Response.json({ ok: false, error: "Chýba klient alebo názov." }, { status: 400 });
          if (!od) return Response.json({ ok: false, error: "Chýba platnosť od (RRRR-MM-DD)." }, { status: 400 });
          // Prázdne hodiny = paušál. Nula hodín je iná vec než „neobmedzene"
          // a zliať sa nesmú — to je tá istá pasca ako export 0/0.
          const hodiny = b.hodiny === "" || b.hodiny == null ? null : Math.max(0, Math.round(Number(b.hodiny) || 0));
          const doDna = denISO(b.platnostDo) || null;
          if (doDna && doDna < od) return Response.json({ ok: false, error: "Platnosť do je pred platnosťou od." }, { status: 400 });
          const cena = b.cenaCzk === "" || b.cenaCzk == null ? null : Number(b.cenaCzk) || 0;
          const poznamka = String(b.poznamka || "").slice(0, 400) || null;

          if (akcia === "uprav") {
            const id = String(b.id || "");
            if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
            await DB.prepare(
              "UPDATE balicky SET klient=?, nazov=?, hodiny=?, platnost_od=?, platnost_do=?, cena_czk=?, poznamka=? WHERE id=?",
            ).bind(klient, nazov, hodiny, od, doDna, cena, poznamka, id).run();
            await audit(DB, { action: "balicek-uprava", predmet: `${klient} — ${nazov}`, neu: `${hodiny ?? "paušál"} h, ${od}–${doDna || "bez konca"}`, actor: kto });
            return Response.json({ ok: true, id });
          }
          // Druhý zaplatený balíček do 14 dní od iného = skoro vždy omyl
          // (Papiež, 7. 10. 2026). Pýta sa; `ajTak` znamená, že človek potvrdil.
          if (!b.ajTak && jePlatenyBalicek(nazov, cena)) {
            const jeho = ((await DB.prepare(
              "SELECT nazov, platnost_od, cena_czk, zrusene_at FROM balicky WHERE klient = ?1 AND zrusene_at IS NULL",
            ).bind(klient).all().catch(() => ({ results: [] }))).results || []) as unknown as ExistujuciBalicek[];
            const podobny = podobnyBalicek(jeho, od);
            if (podobny) {
              const d = podobny.platnost_od.slice(0, 10).split("-");
              return Response.json({
                ok: false, duplicita: { nazov: podobny.nazov, od: podobny.platnost_od },
                error: `${klient} už má balíček „${podobny.nazov}" od ${Number(d[2])}. ${Number(d[1])}. ${d[0]}. Druhý by znamenal dvakrát hodiny aj peniaze.`,
              }, { status: 409 });
            }
          }
          const { id, prenesene } = await zapisBalicek(DB, { klient, nazov, hodiny, od, doDna, cena, poznamka }, kto);
          /**
           * DOPLNENIE ROZHODNUTÉ NESKORO POSUNIE AUTOMATICKÝ BALÍČEK ZA SEBA.
           *
           * Jerry, 6. 10. 2026: po konci platnosti so zvyškom 2 h majú prvé dva
           * tréningy ukázať „2 h, 1 h · doplnenie členstva" a nový balíček
           * prirodzene pokračovať od 6 h. Keď automatický balíček už stojí
           * (vznikol na tých tréningoch skôr, než padlo rozhodnutie), zruší sa
           * a obrazovka hneď zavolá `automaticky` — vznikne od prvého tréningu,
           * na ktorý doplnenie nestačí. Ručne nahodený balíček sa nehýbe.
           */
          let posunute = 0;
          if (/doplnenie/i.test(nazov)) {
            const r = await DB.prepare(
              "UPDATE balicky SET zrusene_at = ?1 WHERE klient = ?2 AND zrusene_at IS NULL AND platnost_od > ?3 AND id <> ?4 AND poznamka LIKE 'automaticky%'",
            ).bind(teraz(), klient, od, id).run();
            posunute = r.meta?.changes || 0;
            if (posunute) await audit(DB, { action: "balicek-zruseny", predmet: klient, neu: `${posunute}× automatický balíček po ${od} — prednosť má doplnenie, vznikne znova za ním`, actor: kto });
          }
          return Response.json({ ok: true, id, prenesene, posunute });
        }

        /**
         * AUTOMATICKY — balíček prvým tréningom (viď automatickeBalicky.server.ts).
         *
         * Volá to appka pri otvorení. Je to bezpečné opakovať: klient, ktorému
         * balíček vznikol, už nekrytý tréning nemá, a pre istotu sa nezapíše
         * druhý balíček z Kokpitu s tým istým dňom začiatku.
         */
        if (akcia === "automaticky") {
          const dnes = dnesPraha();
          const vznikli: { klient: string; nazov: string; od: string; navrat: boolean }[] = [];
          const den = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;
          /**
           * PŘEDPLATNÉ POKRAČUJE V DEŇ PO KONCI (22. 10. 2026) — najprv, aby
           * tréning v novom mesiaci už bol krytý a nezaložil balíček druhýkrát.
           * Prenos do 2 h ide cez `balicky_presun`, ako ručný presun: ten istý
           * zápis ho pripočíta. Keď presun z toho konca už je (Jerry ho
           * zapísal sám) alebo sú hodiny prenesené ako „Prenesené hodiny",
           * nepridáva sa nič.
           */
          for (const p of await navrhyPokracovaniaPredplatneho(DB, dnes)) {
            const uz = await DB.prepare(
              "SELECT id FROM balicky WHERE klient = ?1 AND platnost_od = ?2 AND zrusene_at IS NULL LIMIT 1",
            ).bind(p.klient, p.odDna).first().catch(() => null);
            if (uz) continue;
            if (p.prenos > 0) {
              const presun = await DB.prepare("SELECT id FROM balicky_presun WHERE klient = ?1 AND z_platnosti_do = ?2 LIMIT 1")
                .bind(p.klient, p.predosle.do).first().catch(() => null);
              const prenesene = await DB.prepare(
                "SELECT id FROM balicky WHERE klient = ?1 AND platnost_od = ?2 AND zrusene_at IS NULL AND (nazov LIKE '%renesen%' OR nazov LIKE '%oplnenie%') LIMIT 1",
              ).bind(p.klient, p.predosle.do).first().catch(() => null);
              // „Nechať prepadnúť" na otázke pred koncom mesiaca = neprenáša sa nič.
              const odpoved = await DB.prepare("SELECT note FROM anomaly_ack WHERE anomaly_key = ?1")
                .bind(`platnost|${p.klient}|${p.predosle.do}`).first<{ note: string | null }>().catch(() => null);
              const prepadlo = /prepadl|prepadnú/i.test(String(odpoved?.note || ""));
              if (!presun && !prenesene && !prepadlo) {
                await DB.prepare("INSERT INTO balicky_presun (id, klient, hodiny, z_platnosti_do, created_at, autor) VALUES (?1,?2,?3,?4,?5,?6)")
                  .bind(uid(), p.klient, p.prenos, p.predosle.do, teraz(), "kokpit").run();
              }
            }
            const poznamka = [
              `automaticky — pokračovanie předplatného od ${den(p.odDna)} (${p.mesiac}. mesiac${p.polrok > 1 ? ` ${p.polrok}. polroka` : " zo 6"})`,
              p.nevycerpane > p.prenos ? `zostalo ${p.nevycerpane} h, prenášajú sa najviac 2` : "",
              p.cenaPoznamka || "",
            ].filter(Boolean).join(" · ");
            await zapisBalicek(DB, { klient: p.klient, nazov: p.nazov, hodiny: p.hodiny, od: p.odDna, doDna: p.doDna, cena: p.cena, poznamka },
              kto || "kokpit", "balicek-predplatne-pokracuje");
            vznikli.push({ klient: p.klient, nazov: p.nazov, od: p.odDna, navrat: false });
          }
          const navrhy = await navrhyNovychBalickov(DB, dnes);
          for (const n of navrhy) {
            const uz = await DB.prepare(
              "SELECT id FROM balicky WHERE klient = ?1 AND platnost_od = ?2 AND zrusene_at IS NULL AND zdroj = 'rucne' LIMIT 1",
            ).bind(n.klient, n.odDna).first().catch(() => null);
            if (uz) continue;
            // Druhá stráž priamo pri zápise: doplnenie ani 0 Kč sám nevznikne.
            if (!smieVzniknutAutomaticky(n)) continue;
            const poznamka = [
              `automaticky — vznikol prvým tréningom ${den(n.odDna)}`,
              n.navrat ? `návrat po ${n.pauzaDni} dňoch — over, či sedí` : "",
              n.cenaPoznamka || "",
            ].filter(Boolean).join(" · ");
            await zapisBalicek(DB, {
              klient: n.klient, nazov: n.nazov, hodiny: n.hodiny, od: n.odDna,
              doDna: n.platnostDo || null, cena: n.cena, poznamka,
            }, kto || "kokpit", "balicek-automaticky");
            vznikli.push({ klient: n.klient, nazov: n.nazov, od: n.odDna, navrat: n.navrat });
          }
          return Response.json({ ok: true, vznikli });
        }

        /**
         * PRESUN HODÍN DO ĎALŠIEHO BALÍČKA — len při předplatnom, najviac 2 h.
         *
         * Jerry, 4. 10. 2026: „pri viazanosti/předplatnom má byť vždy možnosť
         * presunúť 2 hodiny do ďalšieho balíčka a tým by vznikol balíček
         * 6h Předplatné, ale s 8 hodinami vo vnútri." Keď ďalší balíček
         * z Kokpitu už je, hodiny sa mu pridajú hneď; inak presun počká
         * a pridá ich prvý balíček, ktorý vznikne (`pridaj` vyššie).
         */
        if (akcia === "presun") {
          const klient = String(b.klient || "").trim();
          const zDo = denISO(b.zPlatnostiDo);
          const h = Math.round((Number(b.hodiny) || 0) * 100) / 100;
          if (!klient || !zDo) return Response.json({ ok: false, error: "Chýba klient alebo koniec platnosti." }, { status: 400 });
          if (h <= 0 || h > 2) return Response.json({ ok: false, error: "Presunúť sa dá najviac 2 hodiny." }, { status: 400 });
          const dalsi = await DB.prepare(
            `SELECT id, hodiny, poznamka FROM balicky WHERE klient = ?1 AND zdroj = 'rucne' AND zrusene_at IS NULL
               AND platnost_od > ?2 AND hodiny IS NOT NULL AND nazov NOT LIKE '%oplnenie%' ORDER BY platnost_od LIMIT 1`,
          ).bind(klient, zDo).first<{ id: string; hodiny: number; poznamka: string | null }>().catch(() => null);
          const idPresunu = uid();
          if (dalsi) {
            await DB.batch([
              DB.prepare("UPDATE balicky SET hodiny = hodiny + ?1, poznamka = ?2 WHERE id = ?3")
                .bind(h, [dalsi.poznamka, `+${h} h prenesené z balíčka do ${zDo}`].filter(Boolean).join(" · ").slice(0, 400), dalsi.id),
              DB.prepare("INSERT INTO balicky_presun (id, klient, hodiny, z_platnosti_do, created_at, autor, pouzite_balicek_id, pouzite_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?5)")
                .bind(idPresunu, klient, h, zDo, teraz(), kto || null, dalsi.id),
            ]);
          } else {
            await DB.prepare("INSERT INTO balicky_presun (id, klient, hodiny, z_platnosti_do, created_at, autor) VALUES (?1,?2,?3,?4,?5,?6)")
              .bind(idPresunu, klient, h, zDo, teraz(), kto || null).run();
          }
          await audit(DB, { action: "balicek-presun-hodin", predmet: klient, neu: `${h} h z balíčka do ${zDo}${dalsi ? " → hneď do ďalšieho" : " → čaká na ďalší balíček"}`, actor: kto });
          return Response.json({ ok: true, hned: !!dalsi });
        }

        /**
         * Zrušenie NEMAŽE. Predaný balíček je záznam v knihe; zmazaním by
         * zmizla aj tržba, ktorá k nemu patrí, a nikto by sa nedozvedel, že
         * tam niečo bolo.
         */
        /**
         * UKONČIŤ A VRÁTIŤ (Jerry, 13. 10. 2026 — Radek Baláž, prvýkrát v PSB).
         * Balíček sa stiahne na čerpané hodiny a cenu po vrátení, vrátenie sa
         * zapíše ako platba so zápornou sumou. JEDNA dávka: keby prešla len
         * polovica, klient by mal buď dlh, alebo peniaze dvakrát. Pravidlá
         * a texty sú v `ukoncenieBalicka.ts`.
         */
        if (akcia === "ukonci") {
          const id = String(b.id || "");
          const den = denISO(b.den) || "";
          const odtrenovane = Number(b.odtrenovane);
          const vratit = Math.round(Number(b.vratit) || 0);
          const sposob = ["hotovost", "prevod", "bitcoin", "ine"].includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          if (!id) return Response.json({ ok: false, error: "Chýba id balíčka." }, { status: 400 });
          const bal = await DB.prepare(
            "SELECT id, klient, nazov, hodiny, cena_czk, platnost_od, poznamka, zrusene_at FROM balicky WHERE id = ?1",
          ).bind(id).first<{ id: string; klient: string; nazov: string; hodiny: number | null; cena_czk: number | null; platnost_od: string; poznamka: string | null; zrusene_at: string | null }>();
          if (!bal || bal.zrusene_at) return Response.json({ ok: false, error: "Taký balíček nie je (alebo je zrušený)." }, { status: 404 });
          const chyba = chybaUkoncenia({ hodiny: bal.hodiny, cena: bal.cena_czk, odtrenovane, vratit, den, platnostOd: bal.platnost_od });
          if (chyba) return Response.json({ ok: false, error: chyba }, { status: 400 });
          const mesiac = den.slice(0, 7);
          const zamknuty = await DB.prepare("SELECT 1 z FROM vzas_periods WHERE month = ?1 AND locked = 1").bind(mesiac).first().catch(() => null);
          if (zamknuty) return Response.json({ ok: false, error: `Mesiac ${mesiac} je uzamknutý — vrátenie doň zapísať nejde.` }, { status: 409 });

          const hodiny = Number(bal.hodiny), cena = Number(bal.cena_czk);
          const novaCena = Math.round((cena - vratit) * 100) / 100;
          const poz = poznamkaUkoncenia({ den, hodiny, cena, odtrenovane, vratit });
          const kedy = teraz();
          try {
            await DB.batch([
              DB.prepare("UPDATE balicky SET hodiny = ?1, cena_czk = ?2, platnost_do = ?3, poznamka = ?4 WHERE id = ?5")
                .bind(odtrenovane, novaCena, den, bal.poznamka ? `${bal.poznamka} · ${poz}` : poz, id),
              DB.prepare(
                "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,NULL,?,?,?,0)",
              ).bind(uid(), bal.klient, den, -vratit, sposob, poznamkaVratenia(hodiny - odtrenovane), kedy, kto || null),
            ]);
          } catch (e) {
            return Response.json({ ok: false, error: `Zápis sa nepodaril: ${String((e as Error)?.message || e).slice(0, 200)}` }, { status: 500 });
          }
          await audit(DB, {
            action: "balicek-ukonceny", predmet: `${bal.klient} — ${bal.nazov}`, month: mesiac,
            old: `${hodiny} h · ${cena} Kč`, neu: `${odtrenovane} h · ${novaCena} Kč · vrátené ${vratit} Kč (${sposob}) · ${den}`, actor: kto,
          });
          return Response.json({ ok: true, vratene: vratit, novaCena });
        }

        if (akcia === "zrus" || akcia === "vrat") {
          const id = String(b.id || "");
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          await DB.prepare("UPDATE balicky SET zrusene_at = ? WHERE id = ?").bind(akcia === "zrus" ? teraz() : null, id).run();
          await audit(DB, { action: akcia === "zrus" ? "balicek-zruseny" : "balicek-vrateny", predmet: id, actor: kto });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
      },
    },
  },
});
