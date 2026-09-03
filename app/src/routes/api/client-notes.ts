import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

// Denník klienta — append-only, a JEDNO MIESTO, kde stojí všetko o ňom.
//
//   GET  ?name=…        → celá história klienta, najnovšie prvé
//   POST { name, note } → pridá zápis do denníka (autor = prihlásený)
//
// Mazanie zámerne neexistuje. Denník, z ktorého sa dá mazať, nie je denník —
// je to len pomalšie prepisovateľné pole.
//
// PREČO GET ČÍTA PÄŤ TABULIEK
//
// Jerry, 31. 8. 2026: „existuje viac miest, kde Jarvisovi dávam vedieť, čo sa
// deje s klientmi… preto by mal existovať jeden veľký register, jedno miesto
// o jednom klientovi, kde sa zapisuje všetko, čo sa ho týka, a Jarvis z toho
// čerpá."
//
// Mal pravdu a čísla mu dali za pravdu: o klientoch bolo v ten deň 202
// poznámok v PIATICH tabuľkách — a denník, ktorý mal byť tým jedným miestom,
// z toho mal šesť. Zvyšok ležal v poznámkach ku zrušeniam (58), v odpovediach
// na notifikácie (113), v záveroch z debát s Jarvisom (14) a v poliach na
// karte (11). Každé miesto vedelo svoje a o ostatných nič.
//
// ZAPISUJE SA ĎALEJ TAM, KDE SA TO STANE — zrušenie v Kalendári, odpoveď pri
// notifikácii, záver v chate. To je správne: písať sa má tam, kde človek
// práve je. Zlúčené je ČÍTANIE, a to je celý rozdiel medzi „všade" a „nikde".
// Preto je to jeden GET, nie migrácia a prepis piatich zapisovačov.
const uid = () => crypto.randomUUID();

export const Route = createFileRoute("/api/client-notes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, zapisy: [] });
        const name = new URL(request.url).searchParams.get("name") || "";
        if (!name) return Response.json({ ok: false, zapisy: [] });
        try {
          const ako = `%${name}%`;
          const [dennik, zmeny, odpovede, zavery, karta, merania] = await DB.batch([
            DB.prepare("SELECT id, note, author, created_at FROM client_notes WHERE client_name = ?1 ORDER BY created_at DESC LIMIT 100").bind(name),
            DB.prepare("SELECT id, kedy, druh, poznamka, trener FROM kal_zmeny WHERE klient = ?1 AND TRIM(COALESCE(poznamka,'')) <> '' ORDER BY kedy DESC LIMIT 40").bind(name),
            // Kľúč notifikácie nesie meno ako jednu zo zložiek („gone|Meno“,
            // „bezterminu|dátum|Meno“) — preto LIKE, nie rovnosť.
            DB.prepare("SELECT anomaly_key, note, acked_at, actor FROM anomaly_ack WHERE TRIM(COALESCE(note,'')) <> '' AND anomaly_key LIKE ?1 ORDER BY acked_at DESC LIMIT 40").bind(ako),
            DB.prepare("SELECT id, datum, tema, zaver, overit, overit_do, stav FROM jarvis_zavery WHERE zaver LIKE ?1 OR tema LIKE ?1 ORDER BY datum DESC LIMIT 20").bind(ako),
            DB.prepare("SELECT trainer_note, preco_neprisiel, updated_at FROM client_overrides WHERE name = ?1").bind(name),
            DB.prepare("SELECT id, datum, bolest, poznamka, autor FROM klient_merania WHERE klient = ?1 ORDER BY datum DESC LIMIT 20").bind(name),
          ]);

          type R = Record<string, unknown>;
          const zapisy = (dennik.results as R[]).map((r) => ({
            id: r.id, note: r.note, autor: r.author, kedy: r.created_at,
          }));

          // Jedna spoločná os času. `odkial` nie je ozdoba: tá istá veta znamená
          // niečo iné, keď ju Jerry zapísal pri zrušení tréningu, a niečo iné,
          // keď ju odklepol pri notifikácii.
          const historia: { id: string; kedy: string; odkial: string; text: string; autor: string }[] = [
            ...zapisy.map((z) => ({ id: `dennik-${z.id}`, kedy: String(z.kedy), odkial: "denník", text: String(z.note), autor: String(z.autor || "") })),
            ...(zmeny.results as R[]).map((r) => ({
              id: `kal-${r.id}`, kedy: String(r.kedy), odkial: "kalendár",
              text: `${r.druh === "zrusene" ? "zrušené" : r.druh === "posunute" ? "posunuté" : String(r.druh)}: ${r.poznamka}`,
              autor: String(r.trener || ""),
            })),
            ...(odpovede.results as R[]).map((r) => ({
              id: `ack-${r.anomaly_key}`, kedy: String(r.acked_at), odkial: "notifikácia",
              text: String(r.note), autor: String(r.actor || ""),
            })),
            ...(zavery.results as R[]).map((r) => ({
              id: `zaver-${r.id}`, kedy: `${String(r.datum).slice(0, 10)}T12:00:00.000Z`, odkial: "Jarvis",
              text: `${r.zaver}${r.overit ? ` — overiť${r.overit_do ? ` do ${String(r.overit_do).slice(0, 10)}` : ""}: ${r.overit}` : ""}${r.stav && r.stav !== "otvoreny" ? ` (${r.stav})` : ""}`,
              autor: "",
            })),
            ...(merania.results as R[]).map((r) => ({
              id: `meranie-${r.id}`, kedy: `${String(r.datum).slice(0, 10)}T12:00:00.000Z`, odkial: "meranie",
              text: `bolesť ${r.bolest}/10${r.poznamka ? ` — ${r.poznamka}` : ""}`, autor: String(r.autor || ""),
            })),
          ];
          // Polia z karty nemajú vlastný dátum — nesú `updated_at` celej karty,
          // takže v osi času sedia len približne. Sú tu aj tak: stála poznámka
          // („platí za neho firma“) je presne to, čo Jerry chce vidieť pri mene.
          const k = (karta.results as R[])[0];
          if (k) {
            const kedy = String(k.updated_at || "");
            if (String(k.trainer_note || "").trim()) historia.push({ id: "karta-poznamka", kedy, odkial: "karta klienta", text: String(k.trainer_note), autor: "" });
            if (String(k.preco_neprisiel || "").trim()) historia.push({ id: "karta-preco", kedy, odkial: "karta klienta", text: `prečo neprišiel znova: ${k.preco_neprisiel}`, autor: "" });
          }
          historia.sort((a, b) => String(b.kedy).localeCompare(String(a.kedy)));

          return Response.json({ ok: true, zapisy, historia });
        } catch {
          return Response.json({ ok: false, zapisy: [], historia: [] });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: { name?: string; note?: string };
        try { b = (await request.json()) as typeof b; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const name = String(b.name || "").trim();
        const note = String(b.note || "").trim().slice(0, 2000);
        if (!name || !note) return Response.json({ ok: false, error: "empty" }, { status: 400 });

        const autor = (await currentUser(request)) || "app";
        const now = new Date().toISOString();
        // try/catch ako ostatné POST handlery (merania, napady): výnimka z D1
        // by inak vyletela ako neJSON 500 a klientov r.json() by ju prehltol —
        // zápis by zmizol úplne bez stopy (revízia 19. 8. 2026).
        try {
          await DB.prepare(
            "INSERT INTO client_notes (id, client_name, note, author, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
          ).bind(uid(), name, note, autor, now).run();
        } catch (e) {
          return Response.json({ ok: false, error: `Zápis sa neuložil: ${String(e).slice(0, 200)}` }, { status: 500 });
        }
        await audit(DB, { action: "dennik-zapis", predmet: name, neu: note.slice(0, 120), actor: autor });
        return Response.json({ ok: true });
      },
    },
  },
});
