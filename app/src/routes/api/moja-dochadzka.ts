import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { terazPraha } from "../../lib/psb/cas";
import { normName } from "../../lib/psb/format";
import { rucneAkoUdalosti, sNazvamiKontaktov, type DataDochadzky } from "../../lib/psb/mojaDochadzka";
import { nacitajSukromne } from "../../lib/psb/sukromneKontakty.server";
import { kandidatiDochadzky, nacitajDochadzku, prevzatieGuillerma, udalostiDochadzky, ulozDochadzku } from "../../lib/psb/mojaDochadzka.server";

/**
 * MOJA DOCHÁDZKA — súkromné aktivity trénera (Box, Guillermo), 14. 11. 2026.
 *
 *   GET                 → aktivity a nákupy prihláseného + ich udalosti a návrhy, čo sledovať
 *   GET ?vsetci=1       → všetko (pre notifikácie v appke — každá patrí svojmu majiteľovi)
 *   POST { akcia: "aktivita-pridaj", nazov, nazvy?, guillermo? }
 *   POST { akcia: "aktivita-zmaz", id }
 *   POST { akcia: "nakup-pridaj", aktivitaId, datum, hodiny, sumaKc?, poznamka? }
 *   POST { akcia: "nakup-zmaz", id }
 *
 * Každý mení len svoje. Uložené vo vzas_settings.moja_dochadzka (JSON) —
 * pár riadkov na človeka.
 */
const ns = { "cache-control": "no-store" };
const chyba = (e: string, s = 400) => Response.json({ ok: false, error: e }, { status: s });
const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const Route = createFileRoute("/api/moja-dochadzka")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const kto = (await currentUser(request)) || "";
        const ulozene = await nacitajDochadzku(DB);
        const d = { ...ulozene, aktivity: sNazvamiKontaktov(ulozene.aktivity, await nacitajSukromne(DB)) };
        const vsetci = new URL(request.url).searchParams.get("vsetci") === "1";
        const moje: DataDochadzky = vsetci ? d : {
          aktivity: d.aktivity.filter((a) => a.kto === kto),
          nakupy: d.nakupy.filter((n) => d.aktivity.some((a) => a.id === n.aktivitaId && a.kto === kto)),
          rucne: (d.rucne || []).filter((r) => d.aktivity.some((a) => a.id === r.aktivitaId && a.kto === kto)),
        };
        const udalosti = [...(await udalostiDochadzky(DB, moje.aktivity)), ...rucneAkoUdalosti(moje)];
        const kandidati = vsetci ? [] : (await kandidatiDochadzky(DB, kto)).filter((k) => !moje.aktivity.some((a) => (k.guillermo ? a.guillermo : a.nazvy.some((n) => normName(n) === normName(k.nazov)))));
        return Response.json({ ok: true, kto, teraz: terazPraha(), ...moje, udalosti, kandidati }, { headers: ns });
      },
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const kto = (await currentUser(request)) || "";
        if (!kto) return chyba("Neviem, kto je prihlásený.", 401);
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const d = await nacitajDochadzku(DB);
        const teraz = new Date().toISOString();
        const moja = (aid: string) => d.aktivity.find((a) => a.id === aid && a.kto === kto);

        if (b.akcia === "aktivita-pridaj") {
          const nazov = String(b.nazov || "").replace(/\s+/g, " ").trim().slice(0, 60);
          if (!nazov) return chyba("Chýba názov aktivity.");
          const guillermo = b.guillermo === true;
          const nazvy = (Array.isArray(b.nazvy) ? b.nazvy.map(String) : [nazov]).map((x) => x.trim()).filter(Boolean).slice(0, 5);
          if (!guillermo && !nazvy.length) return chyba("Chýba názov udalosti v kalendári.");
          if (d.aktivity.some((a) => a.kto === kto && normName(a.nazov) === normName(nazov))) return chyba(`Aktivitu „${nazov}“ už máš.`);
          const novaId = id();
          d.aktivity.push({ id: novaId, kto, nazov, nazvy: guillermo ? [] : nazvy, ...(guillermo ? { guillermo: true } : {}), vytvorene: teraz });
          if (guillermo) {
            for (const n of await prevzatieGuillerma(DB, kto)) d.nakupy.push({ id: id(), aktivitaId: novaId, ...n, vytvorene: teraz });
          }
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-aktivita", predmet: `${kto} · ${nazov}`, actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        if (b.akcia === "aktivita-zmaz") {
          const a = moja(String(b.id || ""));
          if (!a) return chyba("Aktivita sa nenašla.", 404);
          d.aktivity = d.aktivity.filter((x) => x.id !== a.id);
          d.nakupy = d.nakupy.filter((n) => n.aktivitaId !== a.id);
          d.rucne = (d.rucne || []).filter((r) => r.aktivitaId !== a.id);
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-aktivita-zmazana", predmet: `${kto} · ${a.nazov}`, actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        if (b.akcia === "nakup-pridaj") {
          const a = moja(String(b.aktivitaId || ""));
          if (!a) return chyba("Vyber aktivitu.");
          const datum = String(b.datum || "");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return chyba("Dátum platby chýba.");
          const hodiny = Math.round(Number(b.hodiny) || 0);
          if (hodiny < 1 || hodiny > 500) return chyba("Počet hodín musí byť 1 až 500.");
          const suma = b.sumaKc === "" || b.sumaKc == null ? null : Math.round(Number(String(b.sumaKc).replace(",", ".").replace(/\s/g, "")));
          if (suma != null && (!Number.isFinite(suma) || suma < 0)) return chyba("Suma nevyzerá ako číslo.");
          d.nakupy.push({ id: id(), aktivitaId: a.id, datum, hodiny, sumaKc: suma, poznamka: String(b.poznamka || "").trim().slice(0, 200), vytvorene: teraz });
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-nakup", predmet: `${kto} · ${a.nazov}`, neu: { datum, hodiny, suma }, actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        if (b.akcia === "nakup-zmaz") {
          const n = d.nakupy.find((x) => x.id === String(b.id || ""));
          if (!n || !moja(n.aktivitaId)) return chyba("Nákup sa nenašiel.", 404);
          d.nakupy = d.nakupy.filter((x) => x.id !== n.id);
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-nakup-zmazany", predmet: `${kto} · ${n.datum}`, old: n, actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        /**
         * Tréning mimo kalendára (Guillermo 2025 — poznáme ho zo správ s Josém)
         * a séria opakovanej udalosti (Guillermove „Busy“ stredy).
         */
        if (b.akcia === "trening-pridaj") {
          const a = moja(String(b.aktivitaId || ""));
          if (!a) return chyba("Vyber aktivitu.");
          const zaciatok = String(b.zaciatok || "");
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(zaciatok)) return chyba("Dátum a čas tréningu chýba.");
          d.rucne = [...(d.rucne || []), { id: id(), aktivitaId: a.id, zaciatok, poznamka: String(b.poznamka || "").trim().slice(0, 200) }];
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-trening", predmet: `${kto} · ${a.nazov} · ${zaciatok}`, actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        if (b.akcia === "trening-zmaz") {
          const r = (d.rucne || []).find((x) => x.id === String(b.id || ""));
          if (!r || !moja(r.aktivitaId)) return chyba("Tréning sa nenašiel.", 404);
          d.rucne = (d.rucne || []).filter((x) => x.id !== r.id);
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-trening-zmazany", predmet: `${kto} · ${r.zaciatok}`, actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        if (b.akcia === "aktivita-serie") {
          const a = moja(String(b.id || ""));
          if (!a) return chyba("Aktivita sa nenašla.", 404);
          a.serie = (Array.isArray(b.serie) ? b.serie.map(String) : []).map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{8,}$/.test(x)).slice(0, 10);
          await ulozDochadzku(DB, d);
          await audit(DB, { action: "dochadzka-serie", predmet: `${kto} · ${a.nazov}`, neu: a.serie.join(", "), actor: kto });
          return Response.json({ ok: true }, { headers: ns });
        }
        return chyba("Neznáma akcia.");
      },
    },
  },
});
