import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { jeFaza } from "../../lib/psb/mapaCyklu";
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
const ZDROJE = new Set(["otazka_klienta", "vlastny", "jarvis", "ine"]);

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

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
          const r = await DB.prepare(
            "SELECT id, datum, text, zdroj, stav, poznamka, autor, odkaz, pouzite_at, faza, planovane_na, kto, koncept, hotovy_text, zaber, sekvencia, scenar, hashtagy FROM mkt_napady ORDER BY datum DESC, created_at DESC LIMIT 200",
          ).all();
          return Response.json({ ok: true, napady: r.results || [] });
        } catch {
          // Tabuľka ešte nie je (staršia migrácia) — obrazovka si vystačí s prázdnym.
          return Response.json({ ok: true, napady: [] });
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
          const id = kus(b.id, 40);

          if (b.zmaz === true && id) {
            await DB.prepare("DELETE FROM mkt_napady WHERE id = ?1").bind(id).run();
            return Response.json({ ok: true });
          }

          // Úprava stavu alebo poznámky pri existujúcom nápade.
          if (id) {
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
            if (stav === null && poznamka === null && odkaz === null
                && faza === null && mesiac === null && kto === null && koncept === null
                && hotovy === null && zaber === null && sekvencia === null && scenar === null && hashtagy === null) {
              return Response.json({ ok: false, error: "nič na zmenu" }, { status: 400 });
            }
            // Deň použitia sa zapíše sám pri prechode na „použitý" — nikto ho
            // nebude vypĺňať ručne a bez neho sa nedá povedať, za ako dlho sa
            // nápad premení na obsah.
            const pouzite = stav === "pouzity" ? new Date().toISOString().slice(0, 10) : null;
            await DB.prepare(
              `UPDATE mkt_napady SET stav = COALESCE(?2, stav), poznamka = COALESCE(?3, poznamka),
                 odkaz = COALESCE(?4, odkaz),
                 pouzite_at = CASE WHEN ?5 IS NOT NULL AND pouzite_at = '' THEN ?5 ELSE pouzite_at END,
                 faza = COALESCE(?6, faza), planovane_na = COALESCE(?7, planovane_na),
                 kto = COALESCE(?8, kto), koncept = COALESCE(?9, koncept),
                 hotovy_text = COALESCE(?10, hotovy_text), zaber = COALESCE(?11, zaber),
                 sekvencia = COALESCE(?12, sekvencia),
                 scenar = COALESCE(?13, scenar), hashtagy = COALESCE(?14, hashtagy)
               WHERE id = ?1`,
            ).bind(id, stav, poznamka, odkaz, pouzite, faza, mesiac, kto, koncept, hotovy, zaber, sekvencia,
                   scenar, hashtagy).run().then((r) => {
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
          // Aj pri ZAKLADANÍ, nielen pri úprave. Obrazovka hotový text posiela
          // a bez tohto riadka by ho INSERT ticho zahodil — appka by ohlásila
          // uložené nad stratou (23. 8. 2026, nájdené pri kontrole).
          const nHotovy = String(b.hotovyText ?? "").trim().slice(0, 6000);

          await DB.prepare(
            `INSERT INTO mkt_napady (id, datum, text, zdroj, stav, poznamka, autor, created_at,
                                     faza, planovane_na, kto, koncept, zaber, hotovy_text)
             VALUES (?1, ?2, ?3, ?4, 'novy', '', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
          ).bind(novy, datum, text, zdroj, autor, new Date().toISOString(),
                 nFaza, nMesiac, nKto, nKoncept, nZaber, nHotovy).run();

          await audit(DB, { action: "zapis", predmet: "marketingový nápad", neu: text.slice(0, 120), actor: autor || undefined });
          return Response.json({ ok: true, id: novy });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
