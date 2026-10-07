import { createFileRoute } from "@tanstack/react-router";
import { loadData } from "../../lib/psb/db.server";
import { deriveClients } from "../../lib/psb/compute";
import { obsahOdkazu } from "../../lib/psb/obsahOdkazu.server";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";
import { chybaOdosielatela, cisloPreBranu, dlzkaSpravy } from "../../lib/psb/sms";
import { posliSms, type BranaUcet } from "../../lib/psb/smsBrana.server";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";

/**
 * SMS KLIENTOVI.
 *
 *   GET                        → či je brána nastavená (kľúč sa nevracia)
 *   POST { akcia: "nastav" }   → uloží bránu, kľúč a odosielateľa
 *   POST { klient, telefon, text } → pošle jednu správu
 *   POST { …, hromadna: true }     → to isté, ale v audite ako `sms-hromadna`
 *   POST { …, ponuka: true }       → to isté, v audite ako `sms-ponuka` (ponuka termínov)
 *                                    (oznam pre všetkých nemení zoznam v kroku SMS)
 *
 * ODOSIELA SA NA KLIK, NIKDY SAMO. Naše číslo hodín je pri časti klientov
 * dopočítané (viď `packageOdvodeny`) a správa „dnes si mal poslednú hodinu"
 * človeku, ktorý má ešte tri, je trapas, ktorý ide von k zákazníkovi a späť
 * sa vziať nedá. Preto tu nie je žiadny cron ani dávka — len jedna správa,
 * ktorú niekto pred odoslaním videl.
 */

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function nastavenia(DB: import("@cloudflare/workers-types").D1Database): Promise<BranaUcet> {
  const rs = await DB.prepare(
    "SELECT key, value FROM vzas_settings WHERE key IN ('sms_brana','sms_kluc','sms_odosielatel')",
  ).all();
  const m: Record<string, string> = {};
  for (const r of (rs.results as { key: string; value: string }[]) || []) {
    try { m[r.key] = String(JSON.parse(r.value)); } catch { m[r.key] = r.value; }
  }
  return { druh: m.sms_brana || "smsmanager", kluc: m.sms_kluc || "", odosielatel: m.sms_odosielatel || "" };
}

export const Route = createFileRoute("/api/sms")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        /**
         * KOMU UŽ SMS ODIŠLA — karta „SMS pre klientov" vo Workspace.
         *
         * Jerry, 4. 10. 2026: „po odoslaní nech klient zo zoznamu zmizne, kým
         * sa jeho stav nezmení, aby sa dal zoznam vyčistiť." Odoslanie stojí
         * v audite (meno · číslo); stačí posledný čas na klienta.
         */
        if (new URL(request.url).searchParams.get("odoslane") === "1") {
          const rs = await DB.prepare(
            `SELECT payment_id predmet, MAX(at) kedy FROM vzas_audit
              WHERE action = 'sms-odoslana' AND at >= datetime('now', '-120 days')
              GROUP BY payment_id`,
          ).all<{ predmet: string; kedy: string }>().catch(() => ({ results: [] as { predmet: string; kedy: string }[] }));
          const podla: Record<string, string> = {};
          for (const r of rs.results || []) {
            const klient = String(r.predmet || "").split(" · ")[0].trim();
            if (klient && (!podla[klient] || r.kedy > podla[klient])) podla[klient] = r.kedy;
          }
          return Response.json({ ok: true, odoslane: podla });
        }
        const n = await nastavenia(DB);
        const poslane = await DB.prepare(
          "SELECT COUNT(*) n, MAX(at) posledna FROM vzas_audit WHERE action = 'sms-odoslana'",
        ).first<{ n: number; posledna: string | null }>().catch(() => null);
        // Kľúč sa von neposiela nikdy — len to, či je vyplnený.
        return Response.json({
          ok: true,
          brana: n.druh,
          odosielatel: n.odosielatel,
          kluc: n.kluc ? "uložený" : "",
          poslanych: poslane?.n ?? 0,
          posledna: poslane?.posledna ?? null,
        });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        const kto = (await currentUser(request)) || "";

        if (b.akcia === "nastav") {
          const brana = kus(b.brana, 40) || "smsmanager";
          // Meno, ktoré brána odmietne, sa nesmie uložiť — SMS by potom ticho
          // odchádzala z čísla a nikto by nevedel prečo.
          const zle = chybaOdosielatela(kus(b.odosielatel, 40), brana);
          if (zle) return Response.json({ ok: false, error: zle }, { status: 400 });
          const ulozit: [string, string][] = [
            ["sms_brana", brana],
            ["sms_odosielatel", kus(b.odosielatel, 40)],
          ];
          // Prázdny kľúč NEPREPISUJE uložený — obrazovka ho nikdy nedostane
          // späť, takže by ho pri každom uložení nastavení zmazala.
          if (kus(b.kluc, 200)) ulozit.push(["sms_kluc", kus(b.kluc, 200)]);
          await DB.batch(ulozit.map(([k, v]) => DB.prepare(
            "INSERT INTO vzas_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          ).bind(k, JSON.stringify(v))));
          await audit(DB, { action: "sms-brana-nastavena", predmet: kus(b.brana, 40), actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * ODKAZ NA STRÁNKU KLIENTA (/v/<token>) — do SMS.
         *
         * Token je na klienta JEDEN a nemení sa: klient si odkaz môže uložiť
         * a bude mu platiť. Zneplatnenie = zmazať riadok v klient_odkazy.
         */
        if (b.akcia === "odkaz") {
          const klient = kus(b.klient, 120);
          if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
          let riadok = await DB.prepare("SELECT token FROM klient_odkazy WHERE klient = ?1").bind(klient).first<{ token: string }>();
          if (!riadok) {
            // Bez 0/O/I/l/1 — token sa občas prepisuje ručne z telefónu.
            const abeceda = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
            const nahodne = crypto.getRandomValues(new Uint8Array(12));
            const token = [...nahodne].map((x) => abeceda[x % abeceda.length]).join("");
            await DB.prepare("INSERT INTO klient_odkazy (token, klient, vytvorene) VALUES (?1, ?2, ?3)")
              .bind(token, klient, new Date().toISOString()).run();
            riadok = { token };
          }
          // Krátka adresa — viď verejnyOdkaz.ts; v SMS ide o jednu správu.
          // `nahlad` je tá istá stránka pre okno pred odoslaním: ide priamo
          // na workera (presmerovanie z webu by sa do iframu neprenieslo)
          // a nezdvíha počítadlo otvorení.
          const origin = new URL(request.url).origin;
          const rozsah = await DB.prepare("SELECT balickov FROM klient_odkazy WHERE token = ?1")
            .bind(riadok.token).first<{ balickov: number | null }>().catch(() => null);
          /**
           * STAV STRÁNKY Z TOHO ISTÉHO VÝPOČTU, KTORÝ JU KRESLÍ (`obsahOdkazu`).
           *
           * SMS do 4. 10. 2026 sľubovala „a QR na platbu" podľa čísla, ktoré
           * jej poslala obrazovka, z ktorej sa otvorila — a karta klienta,
           * Kalendár a Dnes posielali tri rôzne. Správa tak vedela sľúbiť QR,
           * ktoré klient na stránke nenašiel. Teraz sa pýta stránky samej.
           * Keď výpočet zlyhá, `stav` chýba a SMS sa správa ako doteraz.
           */
          const stav = await (async () => {
            const data = await loadData(DB);
            const c = deriveClients(data)[klient];
            if (!c) return null;
            const o = await obsahOdkazu(DB, data, c, { rozsah: Number(rozsah?.balickov ?? 1) });
            return { zostatok: o.vypis.zostatok, suma: o.suma, sQr: o.sQr };
          })().catch(() => null);
          return Response.json({
            ok: true,
            url: verejnyOdkaz(`/v/${riadok.token}`, origin),
            nahlad: `${origin}/v/${riadok.token}?nahlad=1`,
            balickov: rozsah?.balickov ?? 1,
            stav,
          });
        }

        /**
         * KOĽKO HISTÓRIE UVIDÍ KLIENT ZA ODKAZOM.
         *
         * Nastavuje sa pri TOKENE, nie v adrese: krátky odkaz
         * prosapiens.cz/v/… je vo WordPresse presmerovanie a to query string
         * zahadzuje, takže `?h=2` by sa do workera nikdy nedostalo a klient
         * by vždy videl jeden balíček. Zmena platí aj pre odkaz, ktorý už
         * odišiel — to je zámer: keď sa Jerry rozhodne ukázať viac, nemusí
         * posielať druhú SMS.
         */
        if (b.akcia === "rozsah") {
          const klient = kus(b.klient, 120);
          const kolko = Math.max(0, Math.min(9, Math.round(Number(b.balickov) || 0)));
          if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
          const r = await DB.prepare("UPDATE klient_odkazy SET balickov = ?2 WHERE klient = ?1")
            .bind(klient, kolko).run().catch(() => null);
          if (!r) return Response.json({ ok: false, error: "Rozsah sa neuložil." }, { status: 500 });
          return Response.json({ ok: true, balickov: kolko });
        }

        const klient = kus(b.klient, 120);
        const text = String(b.text ?? "").slice(0, 600).trim();
        const cislo = cisloPreBranu(kus(b.telefon, 40));
        if (!cislo) return Response.json({ ok: false, error: "Toto nie je telefónne číslo, na ktoré sa dá poslať SMS." }, { status: 400 });
        if (!text) return Response.json({ ok: false, error: "Prázdna správa." }, { status: 400 });

        const n = await nastavenia(DB);
        const v = await posliSms(n, cislo, text);
        const kolko = dlzkaSpravy(text);
        if (!v.ok) {
          await audit(DB, { action: "sms-zlyhala", predmet: `${klient} · ${cislo}`, old: v.chyba, actor: kto });
          return Response.json({ ok: false, error: `SMS neodišla — ${v.chyba}` }, { status: 502 });
        }
        // Komu správa naozaj odišla, keď nie klientovi samému (rodič, partner,
        // ten, kto platí) — inak by sa z histórie nedalo poznať, prečo číslo
        // nesedí s profilom.
        const prijemca = kus(b.prijemca, 120);
        await audit(DB, {
          // Hromadná správa a ponuka termínov nie sú správa o hodinách —
          // `sms-odoslana` by klienta vyčistil zo zoznamu kroku 2 · SMS.
          action: b.hromadna === true ? "sms-hromadna" : b.ponuka === true ? "sms-ponuka" : "sms-odoslana",
          predmet: `${klient} · ${cislo}`,
          neu: `${kolko.sprav} ${kolko.sprav === 1 ? "správa" : "správy"}${v.id ? ` · ${v.id}` : ""}${prijemca ? ` · pre: ${prijemca}` : ""}`,
          actor: kto,
        });
        return Response.json({ ok: true, cislo, sprav: kolko.sprav });
      },
    },
  },
});
