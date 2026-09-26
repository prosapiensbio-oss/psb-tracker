import { createFileRoute } from "@tanstack/react-router";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { typZNazvu } from "../../lib/psb/kalendar";
import { casUdalosti, nejednoznacneMena, vyberMapu, type Mapa } from "../../lib/psb/kalendarMena";
import { porovnajTyzdne } from "../../lib/psb/porovnanieDochadzky";
import { odkedyKalendar, porovnajMesiace } from "../../lib/psb/porovnanieMesiacov";
import { citajIcal } from "../../lib/psb/ical";
import { ohlasitZmenu, sparujZmeny } from "../../lib/psb/kalendarZmeny";
import { chybaZdroja, NEDOKONCENE, vyberZdroj, type ZdrojSPokusom } from "../../lib/psb/kalendarZdroje";

// Kalendár — predbežný obraz týždňa medzi dvoma exportmi z PTmindera.
//
// Čo appka robí: stiahne kalendár, porovná ho s tým, čo videla naposledy, a
// rozdiel si zapíše. Z toho vznikajú otázky („zmizla ti hodina spred dvoch dní
// — prečo?"), priebežné počty hodín a podklad pre predikciu.
//
// Čo NEROBÍ: nezapisuje do sessions ani do peňazí. V nedeľu príde export z
// PTmindera a ten je zdroj pravdy. Kalendár je predpoveď, PTminder je zápis.
//
// Dozadu tri týždne, dopredu dva.
//
// Dopredu zostáva úzke okno zámerne: ďalej v čase sú opakované udalosti len
// zvykom kalendára, nie informáciou — Jerry sám hovorí, že isté je nanajvýš
// dva týždne.
//
// Dozadu to bolo tiež štrnásť dní a ukázalo sa to ako málo (Jerry, 17. 8. 2026:
// „aby som mohol nahliadnuť aspoň tri týždne do minulosti"). Späť sa človek
// pozerá z iného dôvodu než dopredu — dohľadať, čo sa naozaj stalo. A appka
// odvtedy z tohto okna aj počíta: chýbajúce sedenie v PTminderi sa dá nájsť
// len tam, kam kalendár siaha, a mesačná uzávierka sa robí prvý víkend
// nasledujúceho mesiaca, teda o dva a viac týždňov po prvých dňoch.

const DOZADU_DNI = 21;
const DOPREDU_DNI = 14;

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();

type Zdroj = { id: string; trener: string; url: string; aktivny: number };
type ZdrojStav = {
  id: string; trener: string; aktivny: number; posledne_ok: string | null; posledna_chyba: string | null;
  snimka_kedy: string | null; snimka_ok: number | null; snimka_chyba: string | null;
};
type Ulozena = { uid: string; trener: string; zaciatok: string; koniec: string; nazov: string; klient: string | null; typ: string | null; zmizla_at: string | null };

function okno() {
  const d = new Date();
  const od = new Date(d.getTime() - DOZADU_DNI * 86400000);
  const doM = new Date(d.getTime() + DOPREDU_DNI * 86400000);
  return { odMs: od.getTime(), doMs: doM.getTime(), od: od.toISOString().slice(0, 16), do_: doM.toISOString().slice(0, 16) };
}

/**
 * Jedno stiahnutie + porovnanie so známym stavom.
 *
 * Prvé stiahnutie zdroja zmeny NEGENERUJE — inak by appka na úvod vysypala
 * stopäťdesiat „pribudlo" a človek by ten zoznam zavrel a už nikdy neotvoril.
 * Prvýkrát sa teda len zapamätá, čo tam je.
 */
async function snimka(DB: D1Database, z: Zdroj) {
  const { odMs, doMs, od, do_ } = okno();
  const kedy = teraz();

  // POKUS SA ZAPÍŠE PRED ŤAŽKOU PRÁCOU. Worker zabitý na limite nestihne nič
  // zapísať — bez tohto riadku by po ňom neostala stopa a výber zdroja by si
  // ho pri ďalšom behu vzal znova (10.–13. 9. 2026). Úspech aj chyba tento
  // riadok len prepíšu; keď ho neprepíše nič, beh zomrel (viď kalendarZdroje).
  const snimkaId = uid();
  await DB.prepare("INSERT INTO kal_snimky (id, kedy, trener, udalosti, zmien, ok, chyba) VALUES (?,?,?,0,0,0,?)")
    .bind(snimkaId, kedy, z.trener, `${NEDOKONCENE} — beh sa neukončil (limit workera)`).run();

  let udalosti;
  try {
    // 28 s, nie 15: Google generuje iCal rôzne dlho a Jerryho kalendár (~2,5 MB)
    // sa z Workera pri pomalšom behu na 15 s nestihol — `posledná_chyba = timeout`,
    // kalendár „odpojený" (8. 9. 2026). Odo mňa 9 s, ale Google kolíše (memory:
    // „snímka vyjde ~1 z 3"). 28 s dáva rezervu a fetch je I/O, nie CPU, takže
    // to nehrozí prekročením CPU limitu workera. Cloudflare req cap je ~30 s.
    const r = await fetch(z.url, { headers: { "user-agent": "psb-kokpit-kalendar" }, signal: AbortSignal.timeout(28000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    udalosti = citajIcal(await r.text(), odMs, doMs);
  } catch (e) {
    const chyba = e instanceof Error ? e.message : "nepodarilo sa stiahnuť";
    await DB.prepare("UPDATE kal_zdroje SET posledna_chyba = ? WHERE id = ?").bind(chyba, z.id).run();
    await DB.prepare("UPDATE kal_snimky SET chyba = ? WHERE id = ?").bind(chyba, snimkaId).run();
    return { ok: false, chyba };
  }

  const stare = ((await DB.prepare(
    "SELECT uid, trener, zaciatok, koniec, nazov, klient, typ, zmizla_at FROM kal_udalosti WHERE trener = ? AND zaciatok >= ? AND zaciatok <= ?",
  ).bind(z.trener, od, do_).all()).results || []) as unknown as Ulozena[];
  const prveStiahnutie = stare.length === 0;
  const podlaUid = new Map(stare.map((s) => [s.uid, s]));

  // Naučené mapovanie mien — čo už raz človek potvrdil, sa druhýkrát nepýta.
  const mapovanie = ((await DB.prepare("SELECT nazov, trener, cas, klient, typ FROM kal_mapovanie WHERE trener = ?")
    .bind(z.trener).all()).results || []) as unknown as Mapa[];

  const prikazy: D1PreparedStatement[] = [];
  // Zmeny sa najprv nazbierajú a až potom zapíšu — treba ich vidieť naraz, aby
  // sa dalo spárovať zrušenie s pridaním (to je posun, nie dve udalosti).
  const surove: { druh: string; u: string; nazov: string; klient: string | null; pred: string | null; po: string | null; typ: string }[] = [];
  // `typ` sa nesie až k `ohlasitZmenu` — o tom, či sa zmena hlási, rozhoduje
  // JEDNO miesto, nie tri podmienky roztrúsené v cykle.
  const zmena = (druh: string, u: string, nazov: string, klient: string | null, pred: string | null, po: string | null, typ: string | null = "trening") =>
    surove.push({ druh, u, nazov, klient, pred, po, typ: typ || "trening" });

  const videne = new Set<string>();

  for (const u of udalosti) {
    videne.add(u.uid);
    // Mapovanie sa vyberá aj podľa ČASU: „Marketa 8:30" je iná klientka než
    // „Marketa 14:00" a jedno meno na dvoch ľudí je v PSB bežné (18 krstných
    // mien má viac než jedného klienta).
    const m = vyberMapu(mapovanie, u.nazov, z.trener, casUdalosti(u.zaciatok));
    const klient = m?.klient ?? null;
    // Naučené mapovanie vyhráva vždy; hádanie z názvu je až náhradník.
    // Pri úvodnom je každý nový človek nový názov, teda nová práca — a to
    // práve vtedy, keď je najmenej času. Klient sa NEHÁDA: zlé priradenie
    // človeka je horšie než žiadne, sedenie by sa pripísalo cudziemu.
    const typ = m?.typ ?? typZNazvu(u.nazov);
    const s = podlaUid.get(u.uid);

    if (!s) {
      prikazy.push(DB.prepare(
        "INSERT OR REPLACE INTO kal_udalosti (uid, trener, zaciatok, koniec, nazov, klient, typ, prvy_raz, naposledy, zmizla_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)",
      ).bind(u.uid, z.trener, u.zaciatok, u.koniec, u.nazov, klient, typ, kedy, kedy));
      if (!prveStiahnutie) zmena("pridane", u.uid, u.nazov, klient, null, u.zaciatok, typ);
      continue;
    }

    if (s.zaciatok !== u.zaciatok) zmena("posunute", u.uid, u.nazov, klient, s.zaciatok, u.zaciatok, typ);
    else if (s.nazov !== u.nazov) zmena("premenovane", u.uid, u.nazov, klient, s.nazov, u.nazov, typ);
    else if (s.zmizla_at) zmena("pridane", u.uid, u.nazov, klient, null, u.zaciatok, typ);

    prikazy.push(DB.prepare(
      "UPDATE kal_udalosti SET zaciatok = ?, koniec = ?, nazov = ?, klient = ?, typ = ?, naposledy = ?, zmizla_at = NULL WHERE uid = ? AND trener = ?",
    ).bind(u.zaciatok, u.koniec, u.nazov, klient, typ, kedy, u.uid, z.trener));
  }

  // Čo v kalendári už nie je. Súkromné a netréningové udalosti sa nehlásia —
  // o zmazanom plávaní sa nikto pýtať nechce.
  for (const s of stare) {
    if (videne.has(s.uid) || s.zmizla_at) continue;
    prikazy.push(DB.prepare("UPDATE kal_udalosti SET zmizla_at = ? WHERE uid = ? AND trener = ?").bind(kedy, s.uid, z.trener));
    zmena("zrusene", s.uid, s.nazov, s.klient, s.zaciatok, null, s.typ);
  }

  // Párovanie zrušenia s pridaním (to je posun, nie dve udalosti) žije
  // v `kalendarZmeny.ts` spolu s pravidlom, ktoré zmeny sa hlásia — obe sa
  // dajú zlomiť ticho a obe sú otestované.

  // Ktoré zmeny sa hlásia, rozhoduje `ohlasitZmenu` — pravidlo žije vo
  // vlastnom module, lebo sa dá zlomiť ticho a je otestované.
  const dnesDen = kedy.slice(0, 10);

  let zmien = 0;
  for (const x of sparujZmeny(surove)) {
    if (!ohlasitZmenu(x.druh, x.pred, x.po, dnesDen, x.typ)) continue;
    zmien++;
    prikazy.push(DB.prepare(
      "INSERT INTO kal_zmeny (id, kedy, trener, uid, druh, nazov, klient, pred, po) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(uid(), kedy, z.trener, x.u, x.druh, x.nazov, x.klient, x.pred, x.po));
  }

  prikazy.push(DB.prepare("UPDATE kal_zdroje SET posledne_ok = ?, posledna_chyba = NULL WHERE id = ?").bind(kedy, z.id));
  prikazy.push(DB.prepare("UPDATE kal_snimky SET udalosti = ?, zmien = ?, ok = 1, chyba = NULL WHERE id = ?")
    .bind(udalosti.length, zmien, snimkaId));

  await DB.batch(prikazy);
  return { ok: true, udalosti: udalosti.length, zmien, prveStiahnutie };
}

export const Route = createFileRoute("/api/kalendar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" });
        const q0 = new URL(request.url).searchParams;

        // ── Spustenie z plánovača ─────────────────────────────────────────
        //
        // Sťahovanie ráno a večer nemôže čakať na to, kým niekto otvorí appku —
        // zmysel snímok je práve v tom, že ich robí stroj v rovnaký čas. Cron
        // beží vo vlastnom workeri (nemá session) a preukazuje sa tajomstvom,
        // ktoré obe strany zdieľajú. Je to ten istý princíp ako pri bitcoinovej
        // rezerve: po drôte ide dôkaz, nie heslo.
        if (q0.get("cron") === "1") {
          const token = (bindings() as { KAL_CRON_TOKEN?: string }).KAL_CRON_TOKEN;
          const dany = request.headers.get("x-cron-token") || "";
          if (!token || token.length !== dany.length || token !== dany) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }
          // Aj tu jeden zdroj na volanie — z rovnakého dôvodu ako pri ručnom
          // sťahovaní. `trener` v query si vie plánovač vypýtať adresne;
          // bez neho sa berie najdlhšie NESKÚŠANÝ (vyberZdroj) — nie najdlhšie
          // neúspešný, inak padajúci kalendár zablokuje každý beh (10.–13. 9. 2026).
          const ziadany = q0.get("trener") || "";
          const zdroje = ((await DB.prepare(
            "SELECT z.id, z.trener, z.url, z.aktivny, z.posledne_ok, (SELECT MAX(s.kedy) FROM kal_snimky s WHERE s.trener = z.trener) AS posledny_pokus FROM kal_zdroje z WHERE z.aktivny = 1",
          ).all()).results || []) as unknown as (Zdroj & ZdrojSPokusom & { posledne_ok: string | null })[];
          if (!zdroje.length) return Response.json({ ok: true, vysledky: {} });
          const z = vyberZdroj(zdroje, ziadany);
          if (!z) return Response.json({ ok: false, error: "neznamy trener" }, { status: 404 });
          return Response.json({ ok: true, vysledky: { [z.trener]: await snimka(DB, z) } });
        }

        if (!(await isAuthed(request))) return unauthorized();
        const { od, do_ } = okno();

        const [zdroje, zmeny, zmenyHistoria, mapovanie, udalosti, guillermo, guillermoUdalosti] = await Promise.all([
          DB.prepare(`SELECT z.id, z.trener, z.aktivny, z.posledne_ok, z.posledna_chyba,
            (SELECT s.kedy FROM kal_snimky s WHERE s.trener = z.trener ORDER BY s.kedy DESC LIMIT 1) AS snimka_kedy,
            (SELECT s.ok FROM kal_snimky s WHERE s.trener = z.trener ORDER BY s.kedy DESC LIMIT 1) AS snimka_ok,
            (SELECT s.chyba FROM kal_snimky s WHERE s.trener = z.trener ORDER BY s.kedy DESC LIMIT 1) AS snimka_chyba
            FROM kal_zdroje z ORDER BY z.trener`).all(),
          DB.prepare("SELECT id, kedy, trener, uid, druh, nazov, klient, pred, po, vysvetlene, poznamka FROM kal_zmeny WHERE vysvetlene = 0 ORDER BY kedy DESC LIMIT 60").all(),
          // Karta „Zmeny v kalendári" je schránka — ukazuje len to, čo ešte
          // čaká na odpoveď (vysvetlene = 0). Pre Jarvisa to nestačí: na
          // otázku „koľko sa mi tento týždeň zrušilo" je vysvetlené zrušenie
          // stále zrušenie. Preto druhý, širší rad — celá história zmien,
          // z ktorej sa dá počítať.
          // `uid` tu MUSÍ byť: karta z neho pozná ručne zapísané zmeny
          // (`rucne-`). Bez neho spadol 25. 9. 2026 celý Kokpit na
          // `undefined.startsWith` — chýbajúci stĺpec vyzeral ako prázdny.
          DB.prepare("SELECT id, kedy, trener, uid, druh, nazov, klient, pred, po, vysvetlene, poznamka, odpovedane_at FROM kal_zmeny ORDER BY kedy DESC LIMIT 300").all(),
          DB.prepare("SELECT nazov, trener, cas, klient, typ, vedome FROM kal_mapovanie ORDER BY trener, nazov, cas").all(),
          DB.prepare("SELECT uid, trener, zaciatok, koniec, nazov, klient, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND zaciatok >= ? AND zaciatok <= ? ORDER BY zaciatok").bind(od, do_).all(),
          DB.prepare("SELECT id, datum, druh, hodiny, suma_czk, poznamka FROM guillermo_hodiny ORDER BY datum DESC").all(),
          // Guillermo tréningy MIMO okna: zostatok sedení sa počíta od kotvy
          // (napr. 9. 8.), ale okno udalostí siaha len 21 dní dozadu — tréning
          // starší by z počtu vypadol a zostatok by ticho narástol späť. Preto
          // sa guillermo udalosti berú bez ohľadu na okno (je ich pár).
          DB.prepare("SELECT uid, trener, zaciatok, koniec, nazov, klient, typ FROM kal_udalosti WHERE typ = 'guillermo' AND zmizla_at IS NULL ORDER BY zaciatok").all(),
        ]);

        /**
         * Meradlo súbežného chodu kalendára a PTmindera.
         *
         * Ťahá sa ZVLÁŠŤ, mimo `okno()`: okno má 21 dní dozadu, ale otázka
         * „vydrží kalendár sám?" sa nedá zodpovedať z troch týždňov. Sú to
         * dva ploché SELECTy (pár stoviek riadkov) a porovnanie sa robí
         * v TypeScripte — JOIN mena s menom cez celú históriu je v D1 presne
         * ten kvadratický dopyt, ktorý appku už raz položil.
         */
        const odKedy = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
        const [udalostiP, sedeniaP, prveSnimky] = await DB.batch([
          DB.prepare("SELECT klient, zaciatok, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND klient IS NOT NULL AND zaciatok >= ?").bind(odKedy),
          DB.prepare("SELECT client_name, date, session_trainer FROM sessions WHERE date >= ?").bind(odKedy),
          // Odkedy sa ktorý kalendár ČÍTA — nie odkedy je v ňom najstaršia
          // udalosť. Pred prvou snímkou nemal kalendár ako niečo obsahovať
          // a každé sedenie by vyzeralo ako strata.
          DB.prepare("SELECT trener, MIN(substr(kedy,1,10)) od FROM kal_snimky GROUP BY trener"),
        ]);
        const kalendarOd: Record<string, string> = {};
        for (const r of ((prveSnimky.results || []) as unknown as { trener: string; od: string }[])) kalendarOd[r.trener] = r.od;
        const porovnanie = porovnajTyzdne(
          (udalostiP.results || []) as unknown as { klient: string | null; zaciatok: string; typ: string | null }[],
          ((sedeniaP.results || []) as unknown as { client_name: string; date: string; session_trainer: string }[])
            .map((r) => ({ client: r.client_name, date: r.date, trener: r.session_trainer })),
          kalendarOd,
        );

        // Názvy, ktoré appka ešte nepozná — to je práca, ktorú treba odklikať.
        //
        // Pozor na mapovanie viazané na ČAS: „Marketa 8:30 = Resnerová" znamená,
        // že názov v tabuľke JE, ale pre tréning o 15:00 z neho klient nevyplýva.
        // Taká udalosť by bez tejto vetvy ticho zostala bez klienta — ani medzi
        // neznámymi, ani v dochádzke. Preto sa za neznáme považuje aj udalosť,
        // ktorej mapovanie nedalo klienta (22. 9. 2026).
        const zname = new Set((mapovanie.results || []).map((m) => `${(m as { nazov: string }).nazov}|${(m as { trener: string }).trener}`));
        const nezname: Record<string, { nazov: string; trener: string; pocet: number; najblizsi: string }> = {};
        for (const u of (udalosti.results || []) as unknown as Ulozena[]) {
          const k = `${u.nazov}|${u.trener}`;
          const chybaKlient = !u.klient && (u.typ === "trening" || u.typ === "uvodny");
          if (zname.has(k) && !chybaKlient) continue;
          const e = (nezname[k] ||= { nazov: u.nazov, trener: u.trener, pocet: 0, najblizsi: u.zaciatok });
          e.pocet++;
          if (u.zaciatok < e.najblizsi) e.najblizsi = u.zaciatok;
        }

        /**
         * Mená, ktoré sedia na viacerých klientov.
         *
         * Toto je to, čo 22. 9. 2026 stálo Marketu Resnerovú šesť tréningov:
         * „Marketa" v kalendári sedí na ňu aj na Marketu Lozias, mapovanie
         * poznalo len jednu a appka o tom mlčala. Osemnásť krstných mien má
         * v PSB viac než jedného klienta, takže mlčať sa nedá.
         */
        const menaKlientov = ((await DB.prepare(
          "SELECT DISTINCT client_name FROM sessions WHERE date >= date('now','-400 days')",
        ).all()).results || []).map((r) => String((r as { client_name: string }).client_name));
        const nazvyVKalendari = [...new Set(((udalosti.results || []) as unknown as Ulozena[])
          .filter((u) => u.typ === "trening" || u.typ === "uvodny")
          .map((u) => u.nazov))];
        // Meno, pri ktorom už človek vedome rozhodol (alebo ho rozlíšil časom),
        // sa nepripomína — karta má byť prázdna, keď je práca hotová.
        const vyriesene = new Set(((mapovanie.results || []) as unknown as (Mapa & { vedome: number })[])
          .filter((m) => m.cas || m.vedome)
          .map((m) => m.nazov));
        const nejednoznacne = nejednoznacneMena(nazvyVKalendari.filter((x) => !vyriesene.has(x)), menaKlientov).map((n) => ({
          ...n,
          // Časy, v ktorých to meno v kalendári stojí — podľa nich sa to dá
          // rozlíšiť jedným klikom namiesto prepisovania mien v kalendári.
          casy: [...new Set(((udalosti.results || []) as unknown as Ulozena[])
            .filter((u) => u.nazov === n.nazov)
            .map((u) => `${u.trener}|${casUdalosti(u.zaciatok)}`))].sort(),
        }));

        return Response.json({
          ok: true,
          nejednoznacne,
          // Beh, ktorý zomrel bez zápisu chyby, sa ukáže ako chyba — nie ako
          // zelené „pripojený" (kalendarZdroje.chybaZdroja).
          zdroje: ((zdroje.results || []) as unknown as ZdrojStav[]).map(({ snimka_kedy, snimka_ok, snimka_chyba, ...z }) => ({
            ...z,
            posledna_chyba: chybaZdroja(z, snimka_kedy ? { kedy: snimka_kedy, ok: snimka_ok ?? 1, chyba: snimka_chyba } : null, Date.now()),
          })),
          zmeny: zmeny.results || [],
          zmenyHistoria: zmenyHistoria.results || [],
          mapovanie: mapovanie.results || [],
          udalosti: udalosti.results || [],
          guillermo: guillermo.results || [],
          guillermoUdalosti: guillermoUdalosti.results || [],
          nezname: Object.values(nezname).sort((a, b) => b.pocet - a.pocet),
          porovnanie,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }
        const akcia = String(b.akcia || "");

        if (akcia === "zdroj-pridaj") {
          const trener = String(b.trener || "");
          const url = String(b.url || "").trim();
          // Tajná adresa je heslo v podobe odkazu. Kontrolujeme aspoň to, že ide
          // naozaj o Google iCal — vložený omylom skopírovaný text by inak ticho
          // sedel v databáze a sťahovanie by padalo bez zjavnej príčiny.
          if (!/^https:\/\/calendar\.google\.com\/.*\.ics$/i.test(url)) {
            return Response.json({ ok: false, error: "Toto nevyzerá na tajnú iCal adresu z Google Kalendára (má končiť na .ics)." });
          }
          if (trener !== "Jerry" && trener !== "Terezka") return Response.json({ ok: false, error: "Neznámy tréner." });
          await DB.prepare("DELETE FROM kal_zdroje WHERE trener = ?").bind(trener).run();
          await DB.prepare("INSERT INTO kal_zdroje (id, trener, url, aktivny, created_at) VALUES (?,?,?,1,?)")
            .bind(uid(), trener, url, teraz()).run();
          return Response.json({ ok: true });
        }

        if (akcia === "zdroj-zmaz") {
          await DB.prepare("DELETE FROM kal_zdroje WHERE trener = ?").bind(String(b.trener || "")).run();
          return Response.json({ ok: true });
        }

        // JEDEN KALENDÁR NA POŽIADAVKU.
        //
        // Do 24. 8. 2026 sa v jednej požiadavke sťahovali oba a Cloudflare ju
        // zabil na „Worker exceeded resource limits" — Jerryho kalendár (prvý
        // v poradí) sa stihol zapísať, Terezkin nie. Worker zomrel skôr, než
        // stihol zapísať chybu, takže `posledna_chyba` zostala prázdna a nikto
        // sa nedozvedel, že sa jej kalendár od 17. 8. nesťahuje. Appka celý ten
        // čas ukazovala tréningy, ktoré si už dávno zmazala.
        //
        // Bez `trener` sa vezme najdlhšie NESKÚŠANÝ zdroj (vyberZdroj), takže
        // opakované volania sa cez všetky pretočia — aj keď jeden z nich padá.
        if (akcia === "stiahni") {
          const ziadany = String(b.trener || "").trim();
          const zdroje = ((await DB.prepare(
            "SELECT z.id, z.trener, z.url, z.aktivny, z.posledne_ok, (SELECT MAX(s.kedy) FROM kal_snimky s WHERE s.trener = z.trener) AS posledny_pokus FROM kal_zdroje z WHERE z.aktivny = 1",
          ).all()).results || []) as unknown as (Zdroj & ZdrojSPokusom & { posledne_ok: string | null })[];
          if (!zdroje.length) return Response.json({ ok: false, error: "Nie je pripojený žiadny kalendár." });
          const z = vyberZdroj(zdroje, ziadany);
          if (!z) return Response.json({ ok: false, error: `Kalendár trénera ${ziadany} nie je pripojený.` }, { status: 404 });
          const vysledok = await snimka(DB, z);
          return Response.json({
            ok: true, trener: z.trener, vysledok,
            // Obrazovka podľa toho vie, či má zavolať ešte raz pre ďalší kalendár.
            zostava: zdroje.filter((x) => x.trener !== z.trener).map((x) => x.trener),
          });
        }

        /**
         * DOPLNENIE HISTÓRIE Z KALENDÁRA.
         *
         * Jerry, 26. 9. 2026: grafy majú časom stáť na vlastných dátach,
         * nie na reportoch z PTmindera — a obe verzie majú chvíľu bežať
         * vedľa seba a porovnávať sa.
         *
         * Prečo to ide bez novej integrácie: kalendár sa ťahá ako iCal súbor
         * a v ňom je CELÁ história. Bežná snímka z neho odreže okno 21 dní
         * dozadu (to je správne, lebo sleduje zmeny), ale na grafy treba
         * roky. Toto je to isté sťahovanie s iným oknom.
         *
         * ŽIADNE ZMENY SA NEHLÁSIA. Udalosť spred roka nie je „pribudlo" —
         * bolo by ich niekoľko tisíc a zoznam zmien by sa stal nepoužiteľným.
         * Existujúce riadky sa neprepisujú: ak už udalosť v tabuľke je,
         * nechá sa tak aj s naučeným menom klienta.
         */
        /**
         * MERADLO: kalendár proti exportu, mesiac po mesiaci. Kým sa
         * rozchádzajú, grafy na kalendári stáť nemôžu.
         */
        if (akcia === "porovnaj-mesiace") {
          const [kal, exp] = await DB.batch([
            DB.prepare("SELECT zaciatok, typ, klient, zmizla_at FROM kal_udalosti"),
            DB.prepare("SELECT substr(date, 1, 10) AS date FROM sessions"),
          ]);
          const kalR = ((kal.results || []) as unknown as { zaciatok: string; typ: string | null; klient: string | null; zmizla_at: string | null }[])
            .map((r) => ({ zaciatok: r.zaciatok, typ: r.typ, klient: r.klient, zmizlaAt: r.zmizla_at }));
          const od = odkedyKalendar(kalR);
          return Response.json({
            ok: true,
            od,
            mesiace: porovnajMesiace(kalR, (exp.results || []) as unknown as { date: string }[], od),
          }, { headers: { "cache-control": "no-store" } });
        }

        if (akcia === "historia") {
          const ziadany = String(b.trener || "").trim();
          const od = String(b.od || "").slice(0, 10);
          const do_ = String(b.do || "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(od) || !/^\d{4}-\d{2}-\d{2}$/.test(do_)) {
            return Response.json({ ok: false, error: "Chýba obdobie (RRRR-MM-DD)." }, { status: 400 });
          }
          const zdroje = ((await DB.prepare(
            "SELECT id, trener, url, aktivny FROM kal_zdroje WHERE aktivny = 1",
          ).all()).results || []) as unknown as Zdroj[];
          const z = ziadany ? zdroje.find((x) => x.trener === ziadany) : zdroje[0];
          if (!z) return Response.json({ ok: false, error: "Taký kalendár nie je pripojený." }, { status: 404 });

          let text: string;
          try {
            const r = await fetch(z.url, { headers: { "user-agent": "psb-kokpit-kalendar" }, signal: AbortSignal.timeout(28000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            text = await r.text();
          } catch (e) {
            return Response.json({ ok: false, error: e instanceof Error ? e.message : "nepodarilo sa stiahnuť" }, { status: 502 });
          }

          const odMs = Date.parse(`${od}T00:00:00Z`);
          const doMs = Date.parse(`${do_}T23:59:59Z`);
          const udalosti = citajIcal(text, odMs, doMs);
          const uz = new Set(((await DB.prepare(
            "SELECT uid FROM kal_udalosti WHERE trener = ?1 AND zaciatok >= ?2 AND zaciatok <= ?3",
          ).bind(z.trener, `${od}T00:00`, `${do_}T23:59`).all()).results || [])
            .map((r) => String((r as { uid: string }).uid)));
          const mapovanie = ((await DB.prepare("SELECT nazov, trener, cas, klient, typ FROM kal_mapovanie WHERE trener = ?")
            .bind(z.trener).all()).results || []) as unknown as Mapa[];

          const kedy = teraz();
          const prikazy: D1PreparedStatement[] = [];
          for (const u of udalosti) {
            if (uz.has(u.uid)) continue;
            const m = vyberMapu(mapovanie, u.nazov, z.trener, casUdalosti(u.zaciatok));
            prikazy.push(DB.prepare(
              "INSERT OR IGNORE INTO kal_udalosti (uid, trener, zaciatok, koniec, nazov, klient, typ, prvy_raz, naposledy, zmizla_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)",
            ).bind(u.uid, z.trener, u.zaciatok, u.koniec, u.nazov, m?.klient ?? null, m?.typ ?? typZNazvu(u.nazov), kedy, kedy));
          }
          // Po stovkách, nie naraz: D1 má na dávku strop a tisíc príkazov
          // v jednej transakcii ju prekročí.
          for (let i = 0; i < prikazy.length; i += 200) await DB.batch(prikazy.slice(i, i + 200));
          await audit(DB, { action: "kalendar-historia", predmet: `${z.trener} ${od}–${do_}`, neu: `${prikazy.length} udalostí`, actor: await currentUser(request) || undefined });
          return Response.json({
            ok: true, trener: z.trener, od, do: do_,
            vIcale: udalosti.length, pridanych: prikazy.length, uzBolo: udalosti.length - prikazy.length,
            zostava: zdroje.filter((x) => x.trener !== z.trener).map((x) => x.trener),
          });
        }

        if (akcia === "mapuj") {
          const nazov = String(b.nazov || "");
          const trener = String(b.trener || "");
          const typ = String(b.typ || "trening");
          const klient = b.klient ? String(b.klient) : null;
          // Prázdny čas = platí pre všetky hodiny (tak to bolo doteraz).
          // Vyplnený čas rieši mená, ktoré má viac klientov naraz.
          const cas = /^\d{2}:\d{2}$/.test(String(b.cas || "")) ? String(b.cas) : "";
          // `vedome` = potvrdené v karte „Jedno meno, viac klientov", teda
          // s vedomím, že to meno sedí na viacerých ľudí. Staré mapovania
          // vznikli bez tej informácie, preto sa za rozhodnutie nepočítajú.
          const vedome = b.vedome ? 1 : 0;
          await DB.prepare("INSERT OR REPLACE INTO kal_mapovanie (nazov, trener, cas, klient, typ, potvrdene_at, vedome) VALUES (?,?,?,?,?,?,?)")
            .bind(nazov, trener, cas, klient, typ, teraz(), vedome).run();
          // Doplní sa spätne aj na už uložené udalosti — inak by sa mapovanie
          // prejavilo až pri ďalšom stiahnutí a človek by mal pocit, že sa nič nestalo.
          // Pri mapovaní na čas sa prepíšu len udalosti v tom čase.
          if (cas) {
            await DB.prepare("UPDATE kal_udalosti SET klient = ?, typ = ? WHERE nazov = ? AND trener = ? AND substr(zaciatok, 12, 5) = ?")
              .bind(klient, typ, nazov, trener, cas).run();
          } else {
            // Udalosti, pre ktoré platí presnejšie mapovanie na čas, sa
            // nesmú prepísať všeobecným — inak by oprava zmizla pri prvom
            // uložení všeobecného pravidla.
            await DB.prepare(
              `UPDATE kal_udalosti SET klient = ?, typ = ?
                WHERE nazov = ? AND trener = ?
                  AND substr(zaciatok, 12, 5) NOT IN (SELECT cas FROM kal_mapovanie WHERE nazov = ? AND trener = ? AND cas <> '')`,
            ).bind(klient, typ, nazov, trener, nazov, trener).run();
          }
          return Response.json({ ok: true });
        }

        /**
         * Hromadné odloženie toho, čo tréning nie je.
         *
         * Karta „Nové názvy" mala 22. 9. 2026 deväťdesiatjeden položiek a
         * sedemdesiat z nich boli veterina, box, plávanie, strihanie
         * a „napísať Zuzke". Odklepávať ich po jednej nikto nešiel — a tak
         * v tom zozname celé týždne ležalo aj štrnásť skutočných tréningov,
         * ktoré appka nespoznala. Zoznam, ktorý sa nedá vyčistiť, prestane
         * byť zoznamom a stane sa šumom.
         *
         * Zámerne LEN typ, bez klienta: hromadne sa dá povedať „toto nie sú
         * tréningy", nikdy „toto je ten a ten človek". Priradenie mena
         * zostáva po jednom, tam sa hádať nesmie.
         */
        if (akcia === "mapujVela") {
          const polozky = Array.isArray(b.polozky) ? b.polozky : [];
          const typ = String(b.typ || "netrening");
          if (typ === "trening" || typ === "uvodny") {
            return Response.json({ ok: false, error: "Hromadne sa dá označiť len to, čo tréning NIE JE." }, { status: 400 });
          }
          const dvojice = polozky
            .map((x) => x as { nazov?: unknown; trener?: unknown })
            .map((x) => ({ nazov: String(x?.nazov ?? ""), trener: String(x?.trener ?? "") }))
            .filter((x) => x.nazov && x.trener)
            .slice(0, 200);
          if (!dvojice.length) return Response.json({ ok: false, error: "Nič na označenie." }, { status: 400 });
          const kedy2 = teraz();
          await DB.batch(dvojice.flatMap((d) => [
            DB.prepare("INSERT OR REPLACE INTO kal_mapovanie (nazov, trener, cas, klient, typ, potvrdene_at, vedome) VALUES (?,?,'',NULL,?,?,1)")
              .bind(d.nazov, d.trener, typ, kedy2),
            DB.prepare("UPDATE kal_udalosti SET klient = NULL, typ = ? WHERE nazov = ? AND trener = ?")
              .bind(typ, d.nazov, d.trener),
          ]));
          await audit(DB, {
            action: "kalendar-nie-treningy",
            predmet: `${dvojice.length} názvov`,
            neu: dvojice.map((d) => `${d.trener}: ${d.nazov}`).join(" · ").slice(0, 300),
            actor: await currentUser(request) || undefined,
          });
          return Response.json({ ok: true, oznacenych: dvojice.length });
        }

        // Guillermo: nákup sedení. Čerpanie sa neeviduje ručne — to hovorí
        // kalendár, a dva zdroje o tej istej veci by sa raz rozišli.
        if (akcia === "guillermo-pridaj") {
          const datum = String(b.datum || "").slice(0, 10);
          const sedeni = Number(b.sedeni || 0);
          // „zostatok" je kotva: stav účtu k danému dňu, od ktorého sa ďalej
          // počíta. Bez nej sa zostatok nedá zistiť — kalendár siaha dva týždne
          // dozadu a februárové sedenia v ňom nikdy nebudú.
          const druh = b.druh === "zostatok" ? "zostatok" : "nakup";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(sedeni) || (druh === "nakup" && sedeni <= 0)) {
            return Response.json({ ok: false, error: "Chýba dátum alebo počet sedení." });
          }
          await DB.prepare(
            "INSERT INTO guillermo_hodiny (id, datum, druh, hodiny, ucastnik, suma_czk, zdroj, poznamka, created_at) VALUES (?,?,?,?,'Jerry',?,'rucne',?,?)",
          ).bind(uid(), datum, druh, sedeni, b.suma ? Number(b.suma) : null, b.poznamka ? String(b.poznamka) : null, teraz()).run();
          return Response.json({ ok: true });
        }

        if (akcia === "guillermo-zmaz") {
          await DB.prepare("DELETE FROM guillermo_hodiny WHERE id = ?").bind(String(b.id || "")).run();
          return Response.json({ ok: true });
        }

        // Ručne zapísaná zmena (Jerry, 11. 8.). Automatický rozdiel vidí len to,
        // čo sa medzi dvoma stiahnutiami zmenilo V KALENDÁRI — takže zrušenie,
        // o ktorom sa Jerry dozvie telefonicky a v kalendári ho nechá stáť,
        // alebo náhrada dohodnutá mimo kalendára, mu uniknú. Toto je zadné
        // vrátka: to isté miesto, tá istá tabuľka, len zdroj je človek.
        // `uid` má predponu `rucne-`, aby sa dalo odlíšiť od kalendárovej
        // udalosti — a nikdy sa netrafí do skutočného uid z iCal.
        if (akcia === "zmena-rucne") {
          const druh = String(b.druh || "");
          if (druh !== "zrusene" && druh !== "nahrada") {
            return Response.json({ ok: false, error: "druh musí byť zrusene alebo nahrada" }, { status: 400 });
          }
          const klient = String(b.klient || "").trim();
          if (!klient) return Response.json({ ok: false, error: "chýba klient" }, { status: 400 });
          const kedy = String(b.datum || "").slice(0, 10) || teraz().slice(0, 10);
          // Ručný zápis zostáva VIDITEĽNÝ (vysvetlene = 0), aj keď k nemu Jerry
          // rovno napísal dôvod. Prvá verzia ho brala ako vybavený a riadok
          // hneď zmizol zo zoznamu — človek niečo zapísal a nič sa nestalo,
          // presne to ticho, ktoré appka nemá robiť. Poznámka sa uloží a karta
          // ju vypíše; „Vybavené" si klikne sám, keď to bude naozaj vybavené.
          const poznamka = String(b.poznamka || "").trim();
          await DB.prepare(
            "INSERT INTO kal_zmeny (id, kedy, trener, uid, druh, nazov, klient, pred, po, vysvetlene, poznamka, odpovedane_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          ).bind(
            uid(),
            teraz(),
            String(b.trener || ""),
            `rucne-${uid()}`,
            druh,
            klient,
            klient,
            // Zrušenie nesie pôvodný termín v `pred`, náhrada nový v `po` —
            // rovnaká konvencia ako pri automatickom rozdiele, aby to karta
            // vedela vypísať bez vetvenia navyše.
            // Rovnaký tvar ako ukladá automatický rozdiel (`YYYY-MM-DDTHH:MM`),
            // inak ho formátovač dátumu nerozparsuje. Ručný zápis nemá čas,
            // takže 00:00 — karta ho pri ručných zázname aj tak nevypisuje.
            druh === "zrusene" ? `${kedy}T00:00` : null,
            druh === "nahrada" ? `${kedy}T00:00` : null,
            0,
            poznamka || null,
            null,
          ).run();
          return Response.json({ ok: true });
        }

        if (akcia === "vysvetli") {
          await DB.prepare("UPDATE kal_zmeny SET vysvetlene = 1, poznamka = ?, odpovedane_at = ? WHERE id = ?")
            .bind(b.poznamka ? String(b.poznamka) : null, teraz(), String(b.id || "")).run();
          return Response.json({ ok: true });
        }

        /**
         * KROK SPÄŤ.
         *
         * Jerry, 25. 9. 2026: „zle som to pochopil a rovno som aj zlý zápis
         * spravil… a teraz nemá možnosť to vrátiť späť." Napísal k zrušeniu
         * 7. 10., že klienti idú na dovolenku — dovolenka je pritom 30. 9.
         * Vysvetlená zmena z karty zmizne (ukazuje sa len `vysvetlene = 0`),
         * takže omyl sa nedal ani nájsť, nieto opraviť.
         *
         * Vracia sa CELÝ zápis, nie len text: poznámka bez odklepnutia by
         * v karte svietila ako cudzia veta bez majiteľa.
         */
        if (akcia === "vrat") {
          const id = String(b.id || "");
          if (!id) return Response.json({ ok: false, error: "chýba id" }, { status: 400 });
          const r = await DB.prepare(
            "UPDATE kal_zmeny SET vysvetlene = 0, poznamka = NULL, odpovedane_at = NULL WHERE id = ?1 AND vysvetlene = 1",
          ).bind(id).run();
          // Nula zmenených riadkov znamená, že zmena už otvorená bola — to nie
          // je chyba, ale nesmie sa to tváriť ako úspešné vrátenie.
          return Response.json({ ok: true, vratene: r.meta.changes || 0 });
        }

        return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
      },
    },
  },
});
