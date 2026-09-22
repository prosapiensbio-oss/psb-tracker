import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { porovnajBalicky, type Balicek, type PtBalicek } from "../../lib/psb/balickyEvidencia";
import { jeMesiac } from "../../lib/psb/format";

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

async function nacitaj(DB: D1Database) {
  const [vlastne, pt, udalosti, horizont] = await DB.batch([
    DB.prepare("SELECT id, klient, nazov, hodiny, platnost_od, platnost_do, cena_czk, zdroj, ptminder_id, poznamka, zrusene_at FROM balicky ORDER BY klient, platnost_od"),
    DB.prepare("SELECT client_name, package_name, sessions_remaining, sessions_total, valid_from, valid_to FROM packages"),
    // Kalendár nesie odtrénované hodiny. Berie sa celá história tabuľky, nie
    // okno — balíček môže bežať pol roka a okno má 21 dní.
    DB.prepare("SELECT klient, zaciatok, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND klient IS NOT NULL"),
    // Dokiaľ siaha export. Bez toho by sa porovnávali Kokpitove hodiny do
    // dneška proti PTminderu do posledného sťahovania a každý klient, ktorý
    // odvtedy trénoval, by vyzeral ako rozdiel.
    DB.prepare("SELECT MAX(substr(date,1,10)) den FROM sessions"),
  ]);
  const riadky = ((vlastne.results || []) as unknown as Riadok[]);
  const ptZoznam = ((pt.results || []) as unknown as {
    client_name: string; package_name: string; sessions_remaining: number; sessions_total: number; valid_from: string; valid_to: string;
  }[]).map<PtBalicek>((p) => ({
    klient: p.client_name, nazov: p.package_name,
    zostava: p.sessions_remaining || 0, spolu: p.sessions_total || 0,
    platnostOd: p.valid_from || "", platnostDo: p.valid_to || "",
  }));
  return {
    riadky,
    porovnanie: porovnajBalicky(
      riadky.map(naBalicek),
      ptZoznam,
      (udalosti.results || []) as unknown as { klient: string | null; zaciatok: string; typ: string | null }[],
      new Date().toISOString().slice(0, 10),
      String(((horizont.results || [])[0] as { den?: string } | undefined)?.den || "") || undefined,
    ),
  };
}

export const Route = createFileRoute("/api/balicky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        const { riadky, porovnanie } = await nacitaj(DB);
        return Response.json({ ok: true, balicky: riadky, porovnanie });
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
            "SELECT id, client_name, package_name, sessions_remaining, sessions_total, valid_from, valid_to, payment_czk, kind FROM packages",
          ).all()).results || []) as unknown as {
            id: string; client_name: string; package_name: string; sessions_remaining: number; sessions_total: number;
            valid_from: string; valid_to: string; payment_czk: number | null; kind: string;
          }[];
          // Dokiaľ siaha export — k tomuto dňu platí zostatok, ktorý z neho
          // preberáme ako otváraciu položku.
          const horizont = String(((await DB.prepare("SELECT MAX(substr(date,1,10)) den FROM sessions").first<{ den: string }>())?.den) || "").slice(0, 10);
          const uz = new Set(((await DB.prepare("SELECT ptminder_id FROM balicky WHERE ptminder_id IS NOT NULL").all()).results || [])
            .map((r) => String((r as { ptminder_id: string }).ptminder_id)));

          const kedy = teraz();
          const prikazy = [];
          const preskocene: string[] = [];
          for (const p of pt) {
            if (uz.has(p.id)) continue;
            const zNazvu = /(\d+)\s*(h|hod)/i.exec(p.package_name || "");
            let od = denISO(p.valid_from);
            let doDna = denISO(p.valid_to) || null;
            // Hodiny z exportu; 0 znamená „export mlčí" (offline členstvá aj
            // paušály), a z názvu sa dá počet vyčítať — to už appka vie.
            let hodiny: number | null = p.sessions_total > 0 ? p.sessions_total : (zNazvu ? Number(zNazvu[1]) : null);
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
          const id = uid();
          await DB.prepare(
            `INSERT INTO balicky (id, klient, nazov, hodiny, platnost_od, platnost_do, cena_czk, zdroj, ptminder_id, poznamka, created_at, autor)
             VALUES (?,?,?,?,?,?,?,'rucne',NULL,?,?,?)`,
          ).bind(id, klient, nazov, hodiny, od, doDna, cena, poznamka, teraz(), kto || null).run();
          await audit(DB, { action: "balicek-novy", predmet: `${klient} — ${nazov}`, neu: `${hodiny ?? "paušál"} h, ${od}–${doDna || "bez konca"}`, actor: kto });
          return Response.json({ ok: true, id });
        }

        /**
         * Zrušenie NEMAŽE. Predaný balíček je záznam v knihe; zmazaním by
         * zmizla aj tržba, ktorá k nemu patrí, a nikto by sa nedozvedel, že
         * tam niečo bolo.
         */
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
