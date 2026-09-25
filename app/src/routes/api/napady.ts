import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { jeFaza } from "../../lib/psb/mapaCyklu";
import { jeVetva } from "../../lib/psb/mapaNapadov";
import { jeMesiac as platnyMesiac } from "../../lib/psb/format";
import { ZABER_MAPA } from "../../lib/psb/zabery";

/**
 * Marketingové nápady.
 *
 * Surové vety, z ktorých sa raz stane obsah — najčastejšie otázka, ktorú
 * klient položí počas tréningu. Zapisujú sa v „+ Zápis" jedným riadkom, lebo
 * o mesiac si ich nikto nepamätá a obchádzka na inú obrazovku by ich zabila.
 *
 * PREČO SA NIČ NEMAŽE
 *
 * Zamietnutý nápad zostáva so zdôvodnením. Vedieť, že sa téma už raz zavrhla
 * a prečo, je cennejšie než čistý zoznam — inak sa tá istá vec navrhne znova
 * a znova sa nad ňou premýšľa od nuly.
 */

const STAVY = new Set(["novy", "pouzity", "zamietnuty"]);
const ZDROJE = new Set(["otazka_klienta", "vlastny", "jarvis", "ine", "inspiracia"]);

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Text, kde ZÁLEŽÍ NA RIADKOCH.
 *
 * `kus` zráža všetky biele znaky na medzeru — pri úvodných vetách to zlepilo
 * tri vety do jednej a pole stratilo zmysel (25. 8. 2026). Riadky sa tu držia,
 * len sa čistia okraje a zahadzujú prázdne.
 */
const riadkyKus = (v: unknown, max: number) =>
  String(v ?? "").split(/\n/).map((r) => r.trim()).filter(Boolean).join("\n").slice(0, max);

/** Mesiac plánu je „YYYY-MM"; prázdny reťazec vracia slot do zásobníka. */
const jeMesiac = (v: unknown) => v === "" || platnyMesiac(v);

export const Route = createFileRoute("/api/napady")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const r = await DB.prepare("SELECT id, datum, text, zdroj, stav, poznamka, autor, odkaz, pouzite_at, faza, planovane_na, kto, koncept, hotovy_text, zaber, sekvencia, scenar, hashtagy, plan_id, inspiracia, titulka, uvodne_vety, rodic, vetva, poradie, zbalene, mapa_id, pos_x, pos_y FROM mkt_napady ORDER BY datum DESC, created_at DESC LIMIT 2000").all();
          const m = await DB.prepare("SELECT id, nazov, created_at, poradie FROM mkt_mapy ORDER BY poradie, created_at").all();
          return Response.json({ ok: true, napady: r.results || [], mapy: m.results || [] });
        } catch (e) {
          // Prázdno s úspechom je najhoršia možná odpoveď: nápady čítajú štyri
          // obrazovky a jedna neaplikovaná migrácia by ich všetky vyprázdnila
          // bez slova. Dopyty sú preto ODDELENÉ (D1 batch je transakcia, takže
          // chýbajúca `mkt_mapy` by zhodila aj nápady) a chyba sa hlási.
          try {
            const r = await DB.prepare(
              "SELECT id, datum, text, zdroj, stav, poznamka, autor, odkaz, pouzite_at, faza, planovane_na, kto, koncept, hotovy_text, zaber, sekvencia, scenar, hashtagy, plan_id, inspiracia, titulka, uvodne_vety FROM mkt_napady ORDER BY datum DESC, created_at DESC LIMIT 2000",
            ).all();
            return Response.json({ ok: true, napady: r.results || [], mapy: [], varovanie: `Mapa sa nenačítala: ${String(e).slice(0, 160)}` });
          } catch (e2) {
            return Response.json({ ok: false, error: String(e2).slice(0, 300) }, { status: 500 });
          }
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
          // ── Mapy ──────────────────────────────────────────────────────
          // Mapa je obal nad nápadmi; preto tu, a nie vo vlastnej route —
          // jedna tabuľka, jedna cesta zápisu, jedno miesto na overenie.
          if (b.akcia === "mapa-nova") {
            const nazov = kus(b.nazov, 60) || "Nová mapa";
            const idMapy = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
            const poradie = await DB.prepare("SELECT COALESCE(MAX(poradie), 0) + 1 p FROM mkt_mapy").first<{ p: number }>();
            await DB.prepare("INSERT INTO mkt_mapy (id, nazov, created_at, poradie) VALUES (?1, ?2, ?3, ?4)")
              .bind(idMapy, nazov, new Date().toISOString(), poradie?.p ?? 1).run();
            return Response.json({ ok: true, id: idMapy, nazov });
          }
          if (b.akcia === "mapa-premenuj") {
            const idMapy = kus(b.mapaId, 40);
            const nazov = kus(b.nazov, 60);
            if (!idMapy || !nazov) return Response.json({ ok: false, error: "Mapa potrebuje meno." }, { status: 400 });
            const r = await DB.prepare("UPDATE mkt_mapy SET nazov = ?2 WHERE id = ?1").bind(idMapy, nazov).run();
            if (!r.meta.changes) return Response.json({ ok: false, error: "Taká mapa neexistuje." }, { status: 404 });
            return Response.json({ ok: true });
          }
          if (b.akcia === "mapa-zmaz") {
            const idMapy = kus(b.mapaId, 40);
            if (idMapy === "m-hlavna") {
              return Response.json({ ok: false, error: "Prvú mapu zmazať nejde — musí zostať kam písať." }, { status: 400 });
            }
            // Mapa s nápadmi sa NEZMAŽE. Zmazať ju aj s obsahom by znamenalo
            // stratiť nápady jedným klikom; presunúť ich inam by zase ticho
            // premiestnilo prácu. Obe rozhodnutia patria človeku.
            // Rovnaká podmienka ako odznak na karte mapy — inak odznak hlási
            // nulu a mazanie odmietne s „v mape je 3 nápadov".
            const kolko = await DB.prepare("SELECT COUNT(*) n FROM mkt_napady WHERE mapa_id = ?1 AND stav <> 'zamietnuty'").bind(idMapy).first<{ n: number }>();
            if ((kolko?.n ?? 0) > 0) {
              return Response.json({ ok: false, error: `V mape je ${kolko?.n} nápadov — najprv ich presuň alebo zmaž.` }, { status: 400 });
            }
            await DB.prepare("DELETE FROM mkt_mapy WHERE id = ?1").bind(idMapy).run();
            return Response.json({ ok: true });
          }

          const id = kus(b.id, 40);

          if (b.zmaz === true && id) {
            // Jediné miesto v appke, kde nápad naozaj mizne. Hlavička tohto
            // súboru hovorí „prečo sa nič nemaže" — platí to pre zamietnuté
            // nápady, ktoré majú zostať aj s dôvodom. Prázdna bublina z mapy
            // je iný prípad: nikdy nebola nápadom. Preto sa maže LEN riadok,
            // v ktorom nie je nič okrem textu, a zostane po ňom záznam.
            const r = await DB.prepare(
              `SELECT text, COALESCE(koncept,'') koncept, COALESCE(hotovy_text,'') hotovy,
                      COALESCE(scenar,'') scenar, COALESCE(odkaz,'') odkaz,
                      COALESCE(planovane_na,'') mesiac, COALESCE(faza,0) faza
                 FROM mkt_napady WHERE id = ?1`,
            ).bind(id).first<{ text: string; koncept: string; hotovy: string; scenar: string; odkaz: string; mesiac: string; faza: number }>();
            if (!r) return Response.json({ ok: true });
            if (r.koncept || r.hotovy || r.scenar || r.odkaz || r.mesiac || r.faza) {
              return Response.json({
                ok: false,
                error: "Nápad má rozpracovaný obsah alebo termín — zmaž ho v karte Nápady, nech je vidieť prečo.",
              }, { status: 400 });
            }
            await DB.prepare("DELETE FROM mkt_napady WHERE id = ?1").bind(id).run();
            await audit(DB, { action: "zmazanie", predmet: "marketingový nápad", old: String(r.text || "").slice(0, 120), actor: (await currentUser(request)) || undefined });
            return Response.json({ ok: true });
          }

          // Úprava stavu alebo poznámky pri existujúcom nápade.
          if (id) {
            // TEXT NÁPADU. Chýbal tu do 25. 9. 2026 a myšlienková mapa je prvá
            // obrazovka, ktorá ho upravuje: prepísaná bublina sa neuložila,
            // server vrátil „nič na zmenu" a najbližšie načítanie vrátilo starý
            // text. Prázdny text sa NEZAPÍŠE — nápad bez vety nie je nápad.
            const novyText = b.text === undefined ? null : (kus(b.text, 600) || null);
            const stav = STAVY.has(String(b.stav)) ? String(b.stav) : null;
            const poznamka = b.poznamka === undefined ? null : kus(b.poznamka, 600);
            // Odkaz na hotový príspevok — tým sa kruh uzatvára. Prázdny
            // reťazec je platná hodnota (odkaz sa dá odobrať), preto sa
            // rozlišuje `undefined` od `""`.
            const odkaz = b.odkaz === undefined ? null : kus(b.odkaz, 500);
            // Plánovacie polia. Fáza 0 znamená „vrátiť do zásobníka", preto
            // sa nula nesmie zliať s „neposlané" — rozlišuje sa undefined.
            // Neplatný vstup sa ODMIETA, nemlčí. Tichý fallback na "" by
            // z preklepu v mesiaci urobil zmazanie termínu — a obrazovka by
            // hlásila uložené nad stratou.
            if (b.faza !== undefined && !jeFaza(Number(b.faza))) {
              return Response.json({ ok: false, error: "Neplatná fáza." }, { status: 400 });
            }
            if (b.planovaneNa !== undefined && !jeMesiac(b.planovaneNa)) {
              return Response.json({ ok: false, error: "Mesiac má tvar RRRR-MM." }, { status: 400 });
            }
            const faza = b.faza === undefined ? null : Number(b.faza);
            const mesiac = b.planovaneNa === undefined ? null : kus(b.planovaneNa, 7);
            const kto = b.kto === undefined ? null : kus(b.kto, 120);
            const koncept = b.koncept === undefined ? null : kus(b.koncept, 1200);
            // Hotový text sa NEZBAVUJE zalomení — je to príspevok, nie
            // jednoriadkový popis. `kus` zlieva biele znaky do medzier a to
            // by z reelu urobilo jeden odsek.
            const hotovy = b.hotovyText === undefined ? null : String(b.hotovyText ?? "").trim().slice(0, 6000);
            // Záber sa berie len z katalógu — voľný text by znamenal, že
            // v poli skončí čokoľvek a animácia ani zadanie k nemu nič nenájdu.
            if (b.zaber !== undefined && b.zaber !== "" && !ZABER_MAPA.has(String(b.zaber))) {
              return Response.json({ ok: false, error: "Neznámy záber." }, { status: 400 });
            }
            const zaber = b.zaber === undefined ? null : String(b.zaber);
            // Odkaz na cudzí príspevok, ktorý nápad inšpiroval. Overuje sa len
            // to, že je to adresa — akú sieť to je, appke jedno.
            const inspiracia = b.inspiracia === undefined ? null : kus(b.inspiracia, 500);
            // Sekvencia chodí ako JSON pole. Overuje sa, že sa vôbec dá
            // rozobrať — uložený nerozoberateľný reťazec by obrazovku zhodil
            // až o týždeň, keď by ho niekto otvoril.
            let sekvencia: string | null = null;
            if (b.sekvencia !== undefined) {
              const raw = String(b.sekvencia ?? "");
              if (raw) {
                try {
                  if (!Array.isArray(JSON.parse(raw))) throw new Error("nie je pole");
                } catch {
                  return Response.json({ ok: false, error: "Sekvencia sa nedá prečítať." }, { status: 400 });
                }
              }
              sekvencia = raw.slice(0, 8000);
            }
            // Scenár a hashtagy: rovnako ako hotový text sa NEČISTIA cez kus() —
            // scenár má zalomenia po vetách a hashtagy po riadkoch.
            const scenar = b.scenar === undefined ? null : String(b.scenar ?? "").trim().slice(0, 6000);
            // Hashtagy sa VŽDY ukladajú v jednom riadku, nech prídu akokoľvek.
            // Project ich raz vrátil pod sebou a do Instagramu sa vkladajú
            // za sebou — zrovnať ich ručne po každom kole je zbytočná práca.
            // Je to jediná normalizácia, ktorú si tu dovolím: nič sa nestráca,
            // mení sa len biely znak medzi značkami.
            const hashtagy = b.hashtagy === undefined ? null
              : String(b.hashtagy ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
            // Nastavenie titulky. Prázdny reťazec je platná hodnota („zabudni,
            // čo som nastavil"), takže sa rozlišuje od `undefined`.
            const titulka = b.titulka === undefined ? null : String(b.titulka ?? "").slice(0, 4000);
            // Jedna veta na riadok, prázdne riadky preč. Text, nie štruktúra —
            // Jerry to číta a prepisuje pri statíve.
            const uvodneVety = b.uvodneVety === undefined ? null : riadkyKus(b.uvodneVety, 1500);
            // Miesto v myšlienkovej mape. Prázdny `rodic` je platná hodnota
            // („odpoj a zaves priamo na vetvu"), preto sa rozlišuje od
            // `undefined` — rovnako ako pri odkaze.
            if (b.vetva !== undefined && b.vetva !== "" && !jeVetva(b.vetva)) {
              return Response.json({ ok: false, error: "Neznáma vetva." }, { status: 400 });
            }
            const rodic = b.rodic === undefined ? null : kus(b.rodic, 40);
            const vetva = b.vetva === undefined ? null : kus(b.vetva, 20);
            const poradie = b.poradie === undefined ? null : Math.max(0, Math.min(9999, Math.round(Number(b.poradie) || 0)));
            const zbalene = b.zbalene === undefined ? null : (b.zbalene ? 1 : 0);
            // Nápad sa dá presunúť do inej mapy — je to ten istý nápad, len sa
            // o ňom premýšľa inde.
            const mapaId = b.mapaId === undefined ? null : (kus(b.mapaId, 40) || "m-hlavna");
            // Ručné miesto bubliny. `null` je platná hodnota („vráť to
            // výpočtu"), preto sa rozlišuje od `undefined`, a číslo sa
            // orezáva — súradnica mimo plátna by bublinu poslala tam, odkiaľ
            // sa nedá pritiahnuť späť.
            const suradnica = (v: unknown) => (v === null ? -1 : Math.max(0, Math.min(20000, Math.round(Number(v) || 0))));
            const posX = b.posX === undefined ? null : suradnica(b.posX);
            const posY = b.posY === undefined ? null : suradnica(b.posY);
            if (novyText === null && stav === null && poznamka === null && odkaz === null
                && faza === null && mesiac === null && kto === null && koncept === null
                && hotovy === null && zaber === null && sekvencia === null && inspiracia === null
                && scenar === null && hashtagy === null && titulka === null && uvodneVety === null
                && rodic === null && vetva === null && poradie === null && zbalene === null
                && mapaId === null && posX === null && posY === null) {
              return Response.json({ ok: false, error: "nič na zmenu" }, { status: 400 });
            }
            // Deň použitia sa zapíše sám pri prechode na „použitý" — nikto ho
            // nebude vypĺňať ručne a bez neho sa nedá povedať, za ako dlho sa
            // nápad premení na obsah.
            const pouzite = stav === "pouzity" ? new Date().toISOString().slice(0, 10) : null;
            await DB.prepare(
              `UPDATE mkt_napady SET text = COALESCE(?23, text),
                 stav = COALESCE(?2, stav), poznamka = COALESCE(?3, poznamka),
                 odkaz = COALESCE(?4, odkaz),
                 pouzite_at = CASE WHEN ?5 IS NOT NULL AND pouzite_at = '' THEN ?5 ELSE pouzite_at END,
                 faza = COALESCE(?6, faza), planovane_na = COALESCE(?7, planovane_na),
                 kto = COALESCE(?8, kto), koncept = COALESCE(?9, koncept),
                 hotovy_text = COALESCE(?10, hotovy_text), zaber = COALESCE(?11, zaber),
                 sekvencia = COALESCE(?12, sekvencia), inspiracia = COALESCE(?15, inspiracia),
                 scenar = COALESCE(?13, scenar), hashtagy = COALESCE(?14, hashtagy),
                 titulka = COALESCE(?16, titulka),
                 uvodne_vety = COALESCE(?17, uvodne_vety),
                 rodic = COALESCE(?18, rodic), vetva = COALESCE(?19, vetva),
                 poradie = COALESCE(?20, poradie), zbalene = COALESCE(?21, zbalene),
                 mapa_id = COALESCE(?22, mapa_id),
                 pos_x = CASE WHEN ?24 IS NULL THEN pos_x WHEN ?24 < 0 THEN NULL ELSE ?24 END,
                 pos_y = CASE WHEN ?25 IS NULL THEN pos_y WHEN ?25 < 0 THEN NULL ELSE ?25 END
               WHERE id = ?1`,
            ).bind(id, stav, poznamka, odkaz, pouzite, faza, mesiac, kto, koncept, hotovy, zaber, sekvencia,
                   scenar, hashtagy, inspiracia, titulka, uvodneVety, rodic, vetva, poradie, zbalene, mapaId,
                   novyText, posX, posY).run().then((r) => {
              // UPDATE s neexistujúcim id prejde „úspešne" s nulou zmien —
              // a obrazovka by ohlásila uložené nad ničím (revízia 19. 8.).
              if (!r.meta.changes) throw new Error("nenajdene");
            });
            return Response.json({ ok: true, id });
          }

          const text = kus(b.text, 600);
          if (text.length < 3) return Response.json({ ok: false, error: "Nápad je prázdny." }, { status: 400 });
          const zdroj = ZDROJE.has(String(b.zdroj)) ? String(b.zdroj) : "vlastny";
          const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(b.datum))
            ? String(b.datum)
            : new Date().toISOString().slice(0, 10);
          const novy = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const autor = (await currentUser(request)) || "";

          // Nápad sa dá založiť rovno ako slot v pláne (z mapy cyklu) alebo
          // ako holá veta (z „+ Zápis"). Je to tá istá tabuľka — líši sa len
          // tým, či má mesiac a fázu.
          if (b.faza !== undefined && !jeFaza(Number(b.faza))) {
            return Response.json({ ok: false, error: "Neplatná fáza." }, { status: 400 });
          }
          if (b.planovaneNa !== undefined && !jeMesiac(b.planovaneNa)) {
            return Response.json({ ok: false, error: "Mesiac má tvar RRRR-MM." }, { status: 400 });
          }
          const nFaza = b.faza === undefined ? 0 : Number(b.faza);
          const nMesiac = b.planovaneNa === undefined ? "" : kus(b.planovaneNa, 7);
          const nKto = kus(b.kto, 120);
          const nKoncept = kus(b.koncept, 1200);
          if (b.zaber !== undefined && b.zaber !== "" && !ZABER_MAPA.has(String(b.zaber))) {
            return Response.json({ ok: false, error: "Neznámy záber." }, { status: 400 });
          }
          const nZaber = b.zaber === undefined ? "" : String(b.zaber);
          // Miesto v myšlienkovej mape. Nápad založený z „+ Zápis" mapu
          // nepozná a padne do vetvy „nezaradene" — to je pravda o ňom, nie
          // chýbajúci údaj, a práve preto tá vetva v mape existuje.
          if (b.vetva !== undefined && b.vetva !== "" && !jeVetva(b.vetva)) {
            return Response.json({ ok: false, error: "Neznáma vetva." }, { status: 400 });
          }
          const nRodic = kus(b.rodic, 40);
          const nVetva = nRodic ? "" : (jeVetva(b.vetva) ? String(b.vetva) : "nezaradene");
          const nPoradie = Math.max(0, Math.min(9999, Math.round(Number(b.poradie) || 0)));
          // Nápad z „+ Zápis" mapu nepozná a patrí do prvej — inak by spadol
          // do prázdna a nikde by nebol vidieť.
          const nMapa = kus(b.mapaId, 40) || "m-hlavna";
          // Nápad zapísaný do mapy, ktorá neexistuje, by nebol vidieť nikde.
          if (nMapa !== "m-hlavna") {
            const ma = await DB.prepare("SELECT 1 x FROM mkt_mapy WHERE id = ?1").bind(nMapa).first();
            if (!ma) return Response.json({ ok: false, error: "Taká mapa neexistuje." }, { status: 400 });
          }
          // Aj pri ZAKLADANÍ, nielen pri úprave. Obrazovka hotový text posiela
          // a bez tohto riadka by ho INSERT ticho zahodil — appka by ohlásila
          // uložené nad stratou (23. 8. 2026, nájdené pri kontrole).
          const nHotovy = String(b.hotovyText ?? "").trim().slice(0, 6000);
          const nSekvencia = (() => {
            const raw = String(b.sekvencia ?? "");
            if (!raw) return "";
            try { return Array.isArray(JSON.parse(raw)) ? raw.slice(0, 8000) : ""; } catch { return ""; }
          })();
          const nScenar = String(b.scenar ?? "").trim().slice(0, 6000);
          const nHashtagy = String(b.hashtagy ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
          const nInspiracia = kus(b.inspiracia, 500);

          await DB.prepare(
            // VŠETKY polia, ktoré obrazovka pri zakladaní posiela. Chýbajúci
            // stĺpec v INSERTe neurobí chybu — hodnota sa ticho zahodí a appka
            // ohlási uložené nad stratou. Stalo sa to 23. 8. 2026 dvakrát:
            // najprv pri hotovy_text, potom pri scenari a sekvencii.
            `INSERT INTO mkt_napady (id, datum, text, zdroj, stav, poznamka, autor, created_at,
                                     faza, planovane_na, kto, koncept, zaber, hotovy_text,
                                     sekvencia, scenar, hashtagy, inspiracia, titulka, uvodne_vety,
                                     rodic, vetva, poradie, zbalene, mapa_id, pos_x, pos_y)
             -- zbalene je natvrdo 0: nový uzol nemá deti, takže sa nemá čo
             -- zbaliť. Stĺpec tu stojí preto, aby stráž zo zapisy.test.ts
             -- videla, že sa naň nezabudlo.
             -- pos_x/pos_y sú NULL: nový uzol si miesto nechá spočítať.
             VALUES (?1, ?2, ?3, ?4, 'novy', ?17, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?18, ?19, ?20, ?21, ?22, 0, ?23, NULL, NULL)`,
          ).bind(novy, datum, text, zdroj, autor, new Date().toISOString(),
                 nFaza, nMesiac, nKto, nKoncept, nZaber, nHotovy,
                 nSekvencia, nScenar, nHashtagy, nInspiracia, kus(b.poznamka, 600),
                 kus(b.titulka, 4000), riadkyKus(b.uvodneVety, 1500),
                 nRodic, nVetva, nPoradie, nMapa).run();

          await audit(DB, { action: "zapis", predmet: "marketingový nápad", neu: text.slice(0, 120), actor: autor || undefined });
          return Response.json({ ok: true, id: novy });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
