import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { menaPlatiZa, zapisPlatiZa } from "../../lib/psb/platiZa";

/**
 * Premenovanie klienta naprieč celou databázou.
 *
 * PREČO TO NIE JE JEDEN UPDATE
 *
 * Meno klienta nie je v jednej tabuľke — je v siedmich. A v troch z nich je
 * navyše zapečené v `dedup_key`, kľúči, ktorým import rozoznáva, či riadok už
 * má. Premenovať len `client_name` znamená, že najbližší export príde s novým
 * kľúčom, nič ho nespáruje a klient bude v appke dvakrát.
 *
 * Presne to hrozilo 14. 8. pri Alexejovi Bajkalovovi: sedem tréningov a dve
 * platby by sa zdvojili na štrnásť a 17 780 Kč.
 *
 * PREČO SA NEZLUČUJE
 *
 * Keď cieľové meno už existuje, ide o ZLÚČENIE dvoch ľudí do jedného — a to je
 * iná operácia s inými rizikami (dva balíčky, dve histórie, možný omyl
 * v identite). Táto cesta ho odmietne a povie prečo.
 *
 * PREČO NEMENÍ PTMINDER
 *
 * Nemá ako. Zdroj pravdy je export a ten sa opravuje tam. Toto zosúladí, čo
 * už v appke je, aby sa nová a stará podoba mena stretli namiesto minutia.
 */

/**
 * KTORÉ TABUĽKY NESÚ MENO KLIENTA.
 *
 * `kluc`: "replace" = meno je aj v `dedup_key` a mení sa spolu s ním
 * (pôvodné správanie), "historia" = `dedup_key` z `ptminder_historia`
 * (druh|klient|…), kde sa mení len celý dielik medzi zvislými čiarami.
 *
 * `unik`: tabuľka má jedinečný kľúč, v ktorom je meno — prázdne pole = meno
 * samo, inak zvyšné stĺpce kľúča. Keď cieľové meno už má riadok s tým istým
 * kľúčom, UPDATE by na ňom spadol; premenovanie to radšej povie vopred.
 *
 * Zoznam sa 21. 10. 2026 rozšíril o všetko, čo od 24. 9. pribudlo a nikto ho
 * sem nedopísal (kontrola stĺpcov `klient`/`client_name`/`meno` vo všetkých
 * migráciách): faktúry a ich položky, fakturačné údaje a odberatelia,
 * odkazy pre klienta (/v/, úvodný, fotky, dotazník, kalendár, ponuka
 * termínov), anamnéza, kartotéka fotiek, druh tréningu, tréningy zdarma,
 * doplnenia hodín, prenos hodín, história a zoznam klientov z PTmindera,
 * rozrobené v editore. Bez nich premenovaný klient prišiel o odkaz, ktorý
 * mu už odišiel v SMS, o anamnézu aj o faktúry — a nové meno ich nevidelo.
 */
type Tabulka = { tab: string; stlpec: string; kluc?: "replace" | "historia"; unik?: string[] };

const TABULKY: Tabulka[] = [
  { tab: "sessions", stlpec: "client_name", kluc: "replace" },
  { tab: "payments", stlpec: "client_name", kluc: "replace" },
  { tab: "services", stlpec: "client_name", kluc: "replace" },
  { tab: "packages", stlpec: "client_name" },
  { tab: "client_overrides", stlpec: "name", unik: [] },
  { tab: "client_notes", stlpec: "client_name" },
  { tab: "leads", stlpec: "name" },
  // Kalendár tu chýbal a bola to tichá diera. Premenovanie klienta prešlo
  // siedmimi tabuľkami, ale meno v Google Kalendári zostalo staré — a práve
  // z neho appka počíta pripomienku na SMS po úvodnom, upozornenie „úvodný
  // bez dopytu", zrušené tréningy aj právo veta pri odmlčaných („má
  // dohodnutý termín"). Klient premenovaný v Kokpite tak zostal v kalendári
  // niekým iným. Odhalilo sa to 17. 8. 2026 na Zuzane Sopoligovej: appka ju
  // po zlúčení stále hlásila ako úvodný bez dopytu, lebo kalendár o novom
  // mene nevedel.
  { tab: "kal_udalosti", stlpec: "klient" },
  { tab: "kal_mapovanie", stlpec: "klient" },
  // Tá istá diera o mesiac neskôr, len v iných tabuľkách (kontrola 24. 9.
  // 2026). Vlastná evidencia balíčkov a kniha platieb vznikli 22. 9. a do
  // tohto zoznamu ich nikto nepridal — premenovaný klient by tak prišiel
  // o balíček aj o hotovostné platby a nikto by nevedel kam. To isté platí
  // pre merania, nezaplatené poplatky, zmeny v kalendári a naučené
  // priradenie platiteľa.
  { tab: "balicky", stlpec: "klient" },
  { tab: "platby", stlpec: "klient", unik: ["fio_id"] },
  { tab: "klient_merania", stlpec: "klient", unik: ["datum", "zdroj"] },
  { tab: "poplatky", stlpec: "client_name" },
  { tab: "kal_zmeny", stlpec: "klient" },
  { tab: "platba_mapovanie", stlpec: "klient" },
  // Doplnené 21. 10. 2026 (viď vyššie).
  { tab: "vydane_faktury", stlpec: "klient" },
  { tab: "vydane_faktury_polozky", stlpec: "klient" },
  { tab: "klient_fakturacia", stlpec: "klient", unik: [] },
  { tab: "klient_odberatelia", stlpec: "klient" },
  { tab: "klient_odkazy", stlpec: "klient", unik: [] },
  { tab: "uvodne_odkazy", stlpec: "klient", unik: ["druh"] },
  { tab: "fotky_odkazy", stlpec: "klient" },
  { tab: "fotky_odpovede", stlpec: "klient" },
  { tab: "dotaznik_odkazy", stlpec: "klient", unik: ["kolo"] },
  { tab: "klient_kalendar", stlpec: "klient" },
  { tab: "ponuky_terminov", stlpec: "klient" },
  { tab: "anamnezy", stlpec: "klient", unik: [] },
  { tab: "klient_fotky", stlpec: "klient" },
  { tab: "klient_fotky_poznamky", stlpec: "klient", unik: ["den"] },
  { tab: "trening_druh", stlpec: "klient", unik: ["den"] },
  { tab: "treningy_zdarma", stlpec: "client_name", unik: ["den"] },
  { tab: "doplnenia_hodiny", stlpec: "klient", unik: ["den"] },
  { tab: "balicky_presun", stlpec: "klient" },
  { tab: "ptminder_historia", stlpec: "klient", kluc: "historia" },
  { tab: "ptminder_klienti", stlpec: "meno", unik: [] },
  { tab: "editor_navrhy", stlpec: "klient" },
  // Mailový zoznam: `klient` je spárované meno z Kokpitu (27. 10. 2026).
  { tab: "mail_odberatelia", stlpec: "klient" },
];

/**
 * `fakturacne_kontakty.klient` je ZOZNAM mien oddelený čiarkou (jedna firma
 * platí za viacerých — viď `vydane-faktury.ts`). Rovnosť stĺpca by ho
 * minula; meno sa mení ako položka zoznamu, nie ako podreťazec.
 */
const zoznamMien = (s: string): string[] => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

async function kontaktySMenom(DB: D1Database, meno: string): Promise<{ id: string; klient: string }[]> {
  const r = await DB.prepare("SELECT id, klient FROM fakturacne_kontakty WHERE klient LIKE ?1")
    .bind(`%${meno}%`).all<{ id: string; klient: string }>();
  return (r.results || []).filter((k) => zoznamMien(k.klient).includes(meno));
}

/**
 * `client_overrides.plati_za` je ZOZNAM mien oddelený zvislicou (kto platí za
 * koho, 21. 10. 2026). Premenovaný klient sa musí zmeniť aj TAM, inak by
 * platiteľov odkaz `/v/` prestal pýtať jeho dlh a nikto by si toho nevšimol —
 * suma by len ticho klesla.
 */
async function platitelia(DB: D1Database, meno: string): Promise<{ name: string; plati_za: string }[]> {
  const r = await DB.prepare("SELECT name, plati_za FROM client_overrides WHERE plati_za LIKE ?1")
    .bind(`%${meno}%`).all<{ name: string; plati_za: string }>().catch(() => null);
  return ((r?.results) || []).filter((x) => menaPlatiZa(x.plati_za).includes(meno));
}

// Bez `.catch(() => ({ n: 0 }))` (21. 10. 2026): chýbajúca tabuľka by sa
// v náhľade tvárila ako „nič sa netýka“ a samotné premenovanie by potom
// spadlo — alebo horšie, kolízia by sa prehliadla.
async function pocet(DB: D1Database, tab: string, stlpec: string, meno: string): Promise<number> {
  const r = await DB.prepare(`SELECT COUNT(*) n FROM ${tab} WHERE ${stlpec} = ?1`)
    .bind(meno).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Riadky, na ktorých by UPDATE narazil na jedinečný kľúč cieľového mena. */
async function kolizie(DB: D1Database, t: Tabulka, zo: string, na: string): Promise<number> {
  if (!t.unik) return 0;
  const on = ["1 = 1", ...t.unik.map((c) => `a.${c} = b.${c}`)].join(" AND ");
  const r = await DB.prepare(
    `SELECT COUNT(*) n FROM ${t.tab} a JOIN ${t.tab} b ON ${on} WHERE a.${t.stlpec} = ?1 AND b.${t.stlpec} = ?2`,
  ).bind(zo, na).first<{ n: number }>();
  return r?.n ?? 0;
}

export const Route = createFileRoute("/api/premenuj")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let zo = "";
        let na = "";
        let naozaj = false;
        try {
          const b = (await request.json()) as Record<string, unknown>;
          zo = String(b.zo ?? "").trim();
          na = String(b.na ?? "").trim();
          naozaj = b.naozaj === true;
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }

        if (!zo || !na) return Response.json({ ok: false, error: "Chýba pôvodné alebo nové meno." }, { status: 400 });
        if (zo === na) return Response.json({ ok: false, error: "Mená sú rovnaké." }, { status: 400 });
        if (na.length > 120) return Response.json({ ok: false, error: "Meno je príliš dlhé." }, { status: 400 });

        try {
          // Cieľ už existuje → je to zlúčenie, nie premenovanie. Nerobíme ho:
          // dvaja ľudia s jedným menom sa oddeliť naspäť nedajú.
          // ptminder_historia má jedinečný dedup_key s menom — keď cieľ už
          // v histórii je, je to zlúčenie a batch by spadol na surovej chybe.
          const kolizia = await pocet(DB, "sessions", "client_name", na)
            + await pocet(DB, "client_overrides", "name", na)
            + await pocet(DB, "ptminder_historia", "klient", na);
          if (kolizia > 0) {
            return Response.json({
              ok: false,
              error: `Meno „${na}“ už v appke existuje. Zlúčiť dvoch klientov do jedného appka zámerne nevie — späť by sa to oddeliť nedalo. Ak je to naozaj ten istý človek, ozvi sa.`,
            }, { status: 409 });
          }

          // Tabuľky s jedinečným kľúčom na mene: cieľ tam už riadok má
          // (napr. odkaz alebo anamnéza pod novým menom) → to je tiež
          // zlúčenie a UPDATE by na ňom spadol. Povie sa to vopred a presne.
          const zrazky: string[] = [];
          for (const t of TABULKY) {
            const n = await kolizie(DB, t, zo, na);
            if (n) zrazky.push(`${t.tab} (${n})`);
          }
          if (zrazky.length) {
            return Response.json({
              ok: false,
              error: `Pod menom „${na}“ už sú záznamy, ktoré by sa zrazili s pôvodnými: ${zrazky.join(", ")}. To je zlúčenie, nie premenovanie — appka ho zámerne nerobí.`,
              zrazky,
            }, { status: 409 });
          }

          // Najprv len spočítať, čoho sa to týka. Jerry to uvidí a potvrdí.
          const dotknute: Record<string, number> = {};
          let spolu = 0;
          for (const t of TABULKY) {
            const n = await pocet(DB, t.tab, t.stlpec, zo);
            if (n) { dotknute[t.tab] = n; spolu += n; }
          }
          const kontakty = await kontaktySMenom(DB, zo);
          if (kontakty.length) { dotknute.fakturacne_kontakty = kontakty.length; spolu += kontakty.length; }
          const platia = await platitelia(DB, zo);
          if (platia.length) { dotknute["client_overrides.plati_za"] = platia.length; spolu += platia.length; }
          if (!spolu) return Response.json({ ok: false, error: `Pod menom „${zo}“ nič nie je.` }, { status: 404 });
          if (!naozaj) return Response.json({ ok: true, nahlad: true, dotknute, spolu });

          // Kľúč sa mení spolu s menom — inak by najbližší import založil
          // druhého klienta namiesto toho, aby doplnil tohto.
          const prikazy = TABULKY.map((t) =>
            t.kluc === "replace"
              ? DB.prepare(
                `UPDATE ${t.tab} SET ${t.stlpec} = ?1, dedup_key = REPLACE(dedup_key, ?2, ?1) WHERE ${t.stlpec} = ?2`,
              ).bind(na, zo)
              : t.kluc === "historia"
                ? DB.prepare(
                  `UPDATE ${t.tab} SET ${t.stlpec} = ?1, dedup_key = REPLACE(dedup_key, '|' || ?2 || '|', '|' || ?1 || '|') WHERE ${t.stlpec} = ?2`,
                ).bind(na, zo)
                : DB.prepare(`UPDATE ${t.tab} SET ${t.stlpec} = ?1 WHERE ${t.stlpec} = ?2`).bind(na, zo),
          );
          for (const k of kontakty) {
            const novy = zoznamMien(k.klient).map((x) => (x === zo ? na : x));
            prikazy.push(
              DB.prepare("UPDATE fakturacne_kontakty SET klient = ?2 WHERE id = ?1")
                .bind(k.id, [...new Set(novy)].join(", ")),
            );
          }
          for (const p of platia) {
            prikazy.push(
              DB.prepare("UPDATE client_overrides SET plati_za = ?2 WHERE name = ?1")
                .bind(p.name, zapisPlatiZa(menaPlatiZa(p.plati_za).map((x) => (x === zo ? na : x)))),
            );
          }
          // Jedna dávka = jedna transakcia: keď spadne ktorýkoľvek UPDATE,
          // nezmení sa nič a chyba ide späť (catch nižšie), nie polovičné meno.
          await DB.batch(prikazy);

          await audit(DB, {
            action: "premenovanie",
            predmet: `klient ${zo}`,
            neu: `${na} · ${spolu} riadkov (${Object.entries(dotknute).map(([t, n]) => `${t}:${n}`).join(", ")})`,
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, spolu, dotknute });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
