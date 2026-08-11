import { createFileRoute } from "@tanstack/react-router";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { citajIcal } from "../../lib/psb/ical";
import { ohlasitZmenu } from "../../lib/psb/kalendarZmeny";

// Kalendár — predbežný obraz týždňa medzi dvoma exportmi z PTmindera.
//
// Čo appka robí: stiahne kalendár, porovná ho s tým, čo videla naposledy, a
// rozdiel si zapíše. Z toho vznikajú otázky („zmizla ti hodina spred dvoch dní
// — prečo?"), priebežné počty hodín a podklad pre predikciu.
//
// Čo NEROBÍ: nezapisuje do sessions ani do peňazí. V nedeľu príde export z
// PTmindera a ten je zdroj pravdy. Kalendár je predpoveď, PTminder je zápis.
//
// Okno je zámerne úzke — dva týždne dozadu (aby bolo z čoho robiť rozdiel) a
// dva dopredu. Ďalej v čase sú opakované udalosti len zvykom kalendára, nie
// informáciou: Jerry sám hovorí, že isté je nanajvýš dva týždne.

const DOZADU_DNI = 14;
const DOPREDU_DNI = 14;

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();

type Zdroj = { id: string; trener: string; url: string; aktivny: number };
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

  let udalosti;
  try {
    const r = await fetch(z.url, { headers: { "user-agent": "psb-kokpit-kalendar" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    udalosti = citajIcal(await r.text(), odMs, doMs);
  } catch (e) {
    const chyba = e instanceof Error ? e.message : "nepodarilo sa stiahnuť";
    await DB.prepare("UPDATE kal_zdroje SET posledna_chyba = ? WHERE id = ?").bind(chyba, z.id).run();
    await DB.prepare("INSERT INTO kal_snimky (id, kedy, trener, udalosti, zmien, ok, chyba) VALUES (?,?,?,0,0,0,?)")
      .bind(uid(), kedy, z.trener, chyba).run();
    return { ok: false, chyba };
  }

  const stare = ((await DB.prepare(
    "SELECT uid, trener, zaciatok, koniec, nazov, klient, typ, zmizla_at FROM kal_udalosti WHERE trener = ? AND zaciatok >= ? AND zaciatok <= ?",
  ).bind(z.trener, od, do_).all()).results || []) as unknown as Ulozena[];
  const prveStiahnutie = stare.length === 0;
  const podlaUid = new Map(stare.map((s) => [s.uid, s]));

  // Naučené mapovanie mien — čo už raz človek potvrdil, sa druhýkrát nepýta.
  const mapovanie = new Map<string, { klient: string | null; typ: string }>();
  for (const m of ((await DB.prepare("SELECT nazov, trener, klient, typ FROM kal_mapovanie WHERE trener = ?").bind(z.trener).all()).results || []) as { nazov: string; klient: string | null; typ: string }[]) {
    mapovanie.set(m.nazov, { klient: m.klient, typ: m.typ });
  }

  const prikazy: D1PreparedStatement[] = [];
  // Zmeny sa najprv nazbierajú a až potom zapíšu — treba ich vidieť naraz, aby
  // sa dalo spárovať zrušenie s pridaním (to je posun, nie dve udalosti).
  const surove: { druh: string; u: string; nazov: string; klient: string | null; pred: string | null; po: string | null }[] = [];
  const zmena = (druh: string, u: string, nazov: string, klient: string | null, pred: string | null, po: string | null) =>
    surove.push({ druh, u, nazov, klient, pred, po });

  const videne = new Set<string>();

  for (const u of udalosti) {
    videne.add(u.uid);
    const m = mapovanie.get(u.nazov);
    const klient = m?.klient ?? null;
    const typ = m?.typ ?? null;
    const s = podlaUid.get(u.uid);

    if (!s) {
      prikazy.push(DB.prepare(
        "INSERT OR REPLACE INTO kal_udalosti (uid, trener, zaciatok, koniec, nazov, klient, typ, prvy_raz, naposledy, zmizla_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)",
      ).bind(u.uid, z.trener, u.zaciatok, u.koniec, u.nazov, klient, typ, kedy, kedy));
      if (!prveStiahnutie) zmena("pridane", u.uid, u.nazov, klient, null, u.zaciatok);
      continue;
    }

    if (s.zaciatok !== u.zaciatok) zmena("posunute", u.uid, u.nazov, klient, s.zaciatok, u.zaciatok);
    else if (s.nazov !== u.nazov) zmena("premenovane", u.uid, u.nazov, klient, s.nazov, u.nazov);
    else if (s.zmizla_at) zmena("pridane", u.uid, u.nazov, klient, null, u.zaciatok);

    prikazy.push(DB.prepare(
      "UPDATE kal_udalosti SET zaciatok = ?, koniec = ?, nazov = ?, klient = ?, typ = ?, naposledy = ?, zmizla_at = NULL WHERE uid = ? AND trener = ?",
    ).bind(u.zaciatok, u.koniec, u.nazov, klient, typ, kedy, u.uid, z.trener));
  }

  // Čo v kalendári už nie je. Súkromné a netréningové udalosti sa nehlásia —
  // o zmazanom plávaní sa nikto pýtať nechce.
  for (const s of stare) {
    if (videne.has(s.uid) || s.zmizla_at) continue;
    prikazy.push(DB.prepare("UPDATE kal_udalosti SET zmizla_at = ? WHERE uid = ? AND trener = ?").bind(kedy, s.uid, z.trener));
    if (s.typ === "sukromne" || s.typ === "netrening") continue;
    zmena("zrusene", s.uid, s.nazov, s.klient, s.zaciatok, null);
  }

  /**
   * Dve zmeny, ktoré sú v skutočnosti jedna.
   *
   * Keď Jerry presunie hodinu, Google často nepošle zmenený čas, ale zruší
   * pôvodnú udalosť a vytvorí novú. Appka to videla ako „zrušené Robin Martin"
   * a hneď pod tým „pridané Robin Martin" — a pýtala sa dvakrát na to isté.
   * Ak sedí ten istý človek a ten istý deň, je to posun.
   */
  const paruj = () => {
    const von: typeof surove = [];
    const pouzite = new Set<number>();
    surove.forEach((a, i) => {
      if (pouzite.has(i) || a.druh !== "zrusene") return;
      const j = surove.findIndex((b, k) =>
        !pouzite.has(k) && b.druh === "pridane" &&
        (b.klient || b.nazov) === (a.klient || a.nazov) &&
        (b.po || "").slice(0, 10) === (a.pred || "").slice(0, 10));
      if (j < 0) return;
      pouzite.add(i); pouzite.add(j);
      von.push({ ...a, druh: "posunute", po: surove[j].po });
    });
    surove.forEach((x, i) => { if (!pouzite.has(i)) von.push(x); });
    return von;
  };

  // Ktoré zmeny sa hlásia, rozhoduje `ohlasitZmenu` — pravidlo žije vo
  // vlastnom module, lebo sa dá zlomiť ticho a je otestované.
  const dnesDen = kedy.slice(0, 10);

  let zmien = 0;
  for (const x of paruj()) {
    if (!ohlasitZmenu(x.druh, x.pred, x.po, dnesDen)) continue;
    zmien++;
    prikazy.push(DB.prepare(
      "INSERT INTO kal_zmeny (id, kedy, trener, uid, druh, nazov, klient, pred, po) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(uid(), kedy, z.trener, x.u, x.druh, x.nazov, x.klient, x.pred, x.po));
  }

  prikazy.push(DB.prepare("UPDATE kal_zdroje SET posledne_ok = ?, posledna_chyba = NULL WHERE id = ?").bind(kedy, z.id));
  prikazy.push(DB.prepare("INSERT INTO kal_snimky (id, kedy, trener, udalosti, zmien, ok, chyba) VALUES (?,?,?,?,?,1,NULL)")
    .bind(uid(), kedy, z.trener, udalosti.length, zmien));

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
          const zdroje = ((await DB.prepare("SELECT id, trener, url, aktivny FROM kal_zdroje WHERE aktivny = 1").all()).results || []) as unknown as Zdroj[];
          const vysledky: Record<string, unknown> = {};
          for (const z of zdroje) vysledky[z.trener] = await snimka(DB, z);
          return Response.json({ ok: true, vysledky });
        }

        if (!(await isAuthed(request))) return unauthorized();
        const { od, do_ } = okno();

        const [zdroje, zmeny, zmenyHistoria, mapovanie, udalosti, guillermo] = await Promise.all([
          DB.prepare("SELECT id, trener, aktivny, posledne_ok, posledna_chyba FROM kal_zdroje ORDER BY trener").all(),
          DB.prepare("SELECT id, kedy, trener, uid, druh, nazov, klient, pred, po, vysvetlene, poznamka FROM kal_zmeny WHERE vysvetlene = 0 ORDER BY kedy DESC LIMIT 60").all(),
          // Karta „Zmeny v kalendári" je schránka — ukazuje len to, čo ešte
          // čaká na odpoveď (vysvetlene = 0). Pre Jarvisa to nestačí: na
          // otázku „koľko sa mi tento týždeň zrušilo" je vysvetlené zrušenie
          // stále zrušenie. Preto druhý, širší rad — celá história zmien,
          // z ktorej sa dá počítať.
          DB.prepare("SELECT kedy, trener, druh, nazov, klient, pred, po, vysvetlene, poznamka FROM kal_zmeny ORDER BY kedy DESC LIMIT 300").all(),
          DB.prepare("SELECT nazov, trener, klient, typ FROM kal_mapovanie ORDER BY trener, nazov").all(),
          DB.prepare("SELECT uid, trener, zaciatok, koniec, nazov, klient, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND zaciatok >= ? AND zaciatok <= ? ORDER BY zaciatok").bind(od, do_).all(),
          DB.prepare("SELECT id, datum, druh, hodiny, suma_czk, poznamka FROM guillermo_hodiny ORDER BY datum DESC").all(),
        ]);

        // Názvy, ktoré appka ešte nepozná — to je práca, ktorú treba odklikať.
        const zname = new Set((mapovanie.results || []).map((m) => `${(m as { nazov: string }).nazov}|${(m as { trener: string }).trener}`));
        const nezname: Record<string, { nazov: string; trener: string; pocet: number; najblizsi: string }> = {};
        for (const u of (udalosti.results || []) as unknown as Ulozena[]) {
          const k = `${u.nazov}|${u.trener}`;
          if (zname.has(k)) continue;
          const e = (nezname[k] ||= { nazov: u.nazov, trener: u.trener, pocet: 0, najblizsi: u.zaciatok });
          e.pocet++;
          if (u.zaciatok < e.najblizsi) e.najblizsi = u.zaciatok;
        }

        return Response.json({
          ok: true,
          zdroje: zdroje.results || [],
          zmeny: zmeny.results || [],
          zmenyHistoria: zmenyHistoria.results || [],
          mapovanie: mapovanie.results || [],
          udalosti: udalosti.results || [],
          guillermo: guillermo.results || [],
          nezname: Object.values(nezname).sort((a, b) => b.pocet - a.pocet),
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

        if (akcia === "stiahni") {
          const zdroje = ((await DB.prepare("SELECT id, trener, url, aktivny FROM kal_zdroje WHERE aktivny = 1").all()).results || []) as unknown as Zdroj[];
          if (!zdroje.length) return Response.json({ ok: false, error: "Nie je pripojený žiadny kalendár." });
          const vysledky: Record<string, unknown> = {};
          for (const z of zdroje) vysledky[z.trener] = await snimka(DB, z);
          return Response.json({ ok: true, vysledky });
        }

        if (akcia === "mapuj") {
          const nazov = String(b.nazov || "");
          const trener = String(b.trener || "");
          const typ = String(b.typ || "trening");
          const klient = b.klient ? String(b.klient) : null;
          await DB.prepare("INSERT OR REPLACE INTO kal_mapovanie (nazov, trener, klient, typ, potvrdene_at) VALUES (?,?,?,?,?)")
            .bind(nazov, trener, klient, typ, teraz()).run();
          // Doplní sa spätne aj na už uložené udalosti — inak by sa mapovanie
          // prejavilo až pri ďalšom stiahnutí a človek by mal pocit, že sa nič nestalo.
          await DB.prepare("UPDATE kal_udalosti SET klient = ?, typ = ? WHERE nazov = ? AND trener = ?")
            .bind(klient, typ, nazov, trener).run();
          return Response.json({ ok: true });
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

        return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
      },
    },
  },
});
