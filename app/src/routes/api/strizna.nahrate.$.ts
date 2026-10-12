import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, unauthorized } from "../../lib/psb/auth.server";
import { cisteMeno, klucObjektu, MAX_VELKOST, overCasti, pocetCasti, rozsahCasti, rozsahZHlavicky, typVidea, VELKOST_CASTI, velkostCitatelne } from "../../lib/psb/striznaNahrate";
import { chyba, envNahrate, naNahratie, nacitajNahratie, noveId, ok, type RiadokNahratia } from "../../lib/psb/striznaNahrate.server";

/**
 * VIDEÁ Z MOBILU PRE STRIŽŇU — všetko v JEDNEJ splat route (12. 10. 2026).
 * Samostatná route pre holú cestu nefunguje: `/api/strizna/nahrate/$` chytí
 * aj `/api/strizna/nahrate` (prázdny splat) — overené lokálne, POST štartu
 * skončil tu. Holú cestu preto obsluhujú `zoznamNahrati` a `startNahratia`.
 *
 *   GET                  → { ok, polozky: [{ id, nazov, velkost, typ, nahrateKedy }] } (stav 'nahrate')
 *   GET ?vsetky=1        → { ok, polozky: Nahratie[] } (obrazovka v Kokpite)
 *   POST { nazov, velkost, typ } → { ok, id, uploadId, velkostCasti, pocetCasti }
 *
 *   PUT  <id>/cast/<n>   telo = surové bajty časti n (1…N)  → { ok, cislo, etag }
 *   POST <id>/dokonci    { casti: [{ cislo, etag }] }        → { ok }
 *   POST <id>/zrus       zruší nedokončené alebo nestiahnuté → { ok }
 *   GET  <id>/subor      bajty videa; Range: bytes=a-b → 206
 *   HEAD <id>/subor      len hlavičky (veľkosť, typ)
 *   POST <id>/stiahnute  Strižňa ho má → stav 'stiahnute', objekt z R2 preč → { ok }
 *
 * Prečo sa objekt maže hneď po „stiahnuté" a nie po 7 dňoch: Strižňa ho
 * nahlási až po úspešnom stiahnutí (overí veľkosť), originál je aj tak
 * v telefóne a druhá kópia v R2 by len rástla — žiadny plánovač by ju
 * nemusel zmazať a nikto by si to nevšimol. Riadok v D1 ostáva ako história.
 */
export const Route = createFileRoute("/api/strizna/nahrate/$")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const kto = await currentUser(request);
        if (!kto) return unauthorized();
        const [id, co, cisloRaw] = cesta(params);
        if (co !== "cast") return chyba("Neznáma cesta.", 404);
        const { DB, STORAGE } = envNahrate();
        if (!DB || !STORAGE) return chyba("Úložisko nie je zapnuté.", 503);
        const r = await nacitajNahratie(DB, id).catch(() => null);
        if (!r) return chyba("Také nahrávanie nie je.", 404);
        if (r.stav !== "nahrava" || !r.upload_id) return chyba("Toto nahrávanie je už uzavreté.", 409);
        const n = Number(cisloRaw);
        const spolu = pocetCasti(r.velkost);
        if (!Number.isInteger(n) || n < 1 || n > spolu) return chyba(`Časť ${cisloRaw} neexistuje (1–${spolu}).`);
        const { od, po } = rozsahCasti(n, r.velkost);
        const dlzka = Number(request.headers.get("content-length"));
        // R2 chce časti rovnako veľké (okrem poslednej) — a odrezaný kus by
        // dal pokazené video, ktoré sa ukáže až v Strižni.
        if (dlzka !== po - od) return chyba(`Časť ${n} má mať ${po - od} bajtov, prišlo ${Number.isFinite(dlzka) ? dlzka : "?"}.`);
        if (!request.body) return chyba("Prázdne telo.");
        try {
          const mpu = STORAGE.resumeMultipartUpload(r.kluc, r.upload_id);
          const cast = await mpu.uploadPart(n, request.body as never);
          return ok({ cislo: cast.partNumber, etag: cast.etag });
        } catch (e) {
          return chyba(`Časť ${n} sa neuložila: ${String(e).slice(0, 200)}`, 502);
        }
      },

      POST: async ({ request, params }) => {
        if (!cesta(params).length) return startNahratia(request);
        const kto = await currentUser(request);
        if (!kto) return unauthorized();
        const [id, co] = cesta(params);
        const { DB, STORAGE } = envNahrate();
        if (!DB || !STORAGE) return chyba("Úložisko nie je zapnuté.", 503);
        const r = await nacitajNahratie(DB, id).catch(() => null);
        if (!r) return chyba("Také nahrávanie nie je.", 404);

        if (co === "dokonci") {
          if (r.stav === "nahrate") return ok();
          if (r.stav !== "nahrava" || !r.upload_id) return chyba("Toto nahrávanie je už uzavreté.", 409);
          const b = (await request.json().catch(() => null)) as { casti?: unknown } | null;
          const casti = overCasti(b?.casti, pocetCasti(r.velkost));
          if (typeof casti === "string") return chyba(casti);
          try {
            const obj = await STORAGE.resumeMultipartUpload(r.kluc, r.upload_id)
              .complete(casti.map((c) => ({ partNumber: c.cislo, etag: c.etag })));
            if (obj.size !== r.velkost) return chyba(`V úložisku je ${obj.size} bajtov namiesto ${r.velkost}.`, 500);
          } catch (e) {
            return chyba(`Dokončenie zlyhalo: ${String(e).slice(0, 200)}`, 502);
          }
          await DB.prepare("UPDATE strizna_nahrate SET stav = 'nahrate', nahrate_kedy = ?2, upload_id = NULL WHERE id = ?1")
            .bind(id, new Date().toISOString()).run();
          await audit(DB, { action: "strizna-nahrate", predmet: r.nazov.slice(0, 120), neu: { id, velkost: r.velkost }, actor: kto });
          return ok();
        }

        if (co === "zrus") {
          if (r.stav === "stiahnute") return chyba("Strižňa ho už stiahla — rušiť nie je čo.", 409);
          if (r.stav === "nahrava" && r.upload_id) {
            await STORAGE.resumeMultipartUpload(r.kluc, r.upload_id).abort().catch(() => {});
          } else {
            await STORAGE.delete(r.kluc).catch(() => {});
          }
          await DB.prepare("DELETE FROM strizna_nahrate WHERE id = ?1").bind(id).run();
          await audit(DB, { action: "strizna-zrusene", predmet: r.nazov.slice(0, 120), old: { id, stav: r.stav }, actor: kto });
          return ok();
        }

        if (co === "stiahnute") {
          if (r.stav === "stiahnute") return ok();
          if (r.stav !== "nahrate") return chyba("Video ešte nie je celé nahraté.", 409);
          await DB.prepare("UPDATE strizna_nahrate SET stav = 'stiahnute', stiahnute_kedy = ?2 WHERE id = ?1")
            .bind(id, new Date().toISOString()).run();
          // Zapísané najprv stav, až potom mazanie: keby mazanie padlo, objekt
          // ostane navyše (lacné), ale Strižňa ho už neuvidí dvakrát.
          await STORAGE.delete(r.kluc).catch(() => {});
          await audit(DB, { action: "strizna-stiahnute", predmet: r.nazov.slice(0, 120), neu: { id }, actor: kto });
          return ok();
        }

        return chyba("Neznáma cesta.", 404);
      },

      GET: async ({ request, params }) => (cesta(params).length ? subor(request, params, false) : zoznamNahrati(request)),
      HEAD: async ({ request, params }) => subor(request, params, true),
    },
  },
});

function cesta(params: unknown): string[] {
  const splat = String((params as { _splat?: string })._splat || "");
  return splat.split("/").filter(Boolean);
}

async function subor(request: Request, params: unknown, lenHlavicky: boolean): Promise<Response> {
  if (!(await currentUser(request))) return unauthorized();
  const [id, co] = cesta(params);
  if (co !== "subor") return chyba("Neznáma cesta.", 404);
  const { DB, STORAGE } = envNahrate();
  if (!DB || !STORAGE) return chyba("Úložisko nie je zapnuté.", 503);
  const r = await nacitajNahratie(DB, id).catch(() => null);
  if (!r) return chyba("Také video nie je.", 404);
  if (r.stav === "nahrava") return chyba("Video sa ešte nahráva.", 409);
  if (r.stav === "stiahnute") return chyba("Video už Strižňa stiahla a z úložiska je zmazané.", 410);

  const velkost = Number(r.velkost);
  const rozsah = rozsahZHlavicky(request.headers.get("range"), velkost);
  const meno = cisteMeno(r.nazov);
  const hlavicky: Record<string, string> = {
    "content-type": r.typ || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(meno)}`,
    "x-robots-tag": "noindex",
  };
  if (rozsah === "zly") {
    return new Response(null, { status: 416, headers: { ...hlavicky, "content-range": `bytes */${velkost}` } });
  }
  if (lenHlavicky) {
    const h = await STORAGE.head(r.kluc);
    if (!h) return chyba("Video v úložisku chýba.", 404);
    return new Response(null, { status: 200, headers: { ...hlavicky, "content-length": String(h.size) } });
  }
  const obj = await STORAGE.get(r.kluc, rozsah ? { range: { offset: rozsah.od, length: rozsah.dlzka } } : undefined);
  if (!obj) return chyba("Video v úložisku chýba.", 404);
  const telo = (obj as unknown as { body: ReadableStream }).body;
  if (rozsah) {
    return new Response(telo, {
      status: 206,
      headers: { ...hlavicky, "content-length": String(rozsah.dlzka), "content-range": `bytes ${rozsah.od}-${rozsah.od + rozsah.dlzka - 1}/${velkost}` },
    });
  }
  return new Response(telo, { status: 200, headers: { ...hlavicky, "content-length": String(velkost) } });
}

/**
 * VIDEÁ Z MOBILU PRE STRIŽŇU (12. 10. 2026) — zoznam a štart nahrávania (holá cesta /api/strizna/nahrate).
 *
 *   GET                → { ok, polozky: [{ id, nazov, velkost, nahrateKedy }] }
 *                        len stav 'nahrate' (čaká na Strižňu, najstaršie prvé)
 *   GET ?vsetky=1      → { ok, polozky: Nahratie[] } posledných 60 vrátane
 *                        nedokončených a stiahnutých (obrazovka v Kokpite)
 *   POST { nazov, velkost, typ }
 *                      → { ok, id, uploadId, velkostCasti, pocetCasti }
 *
 * Prihlásenie: cookie Kokpitu (Jerry, Terezka) ALEBO hlavička
 * x-strizna-token — `currentUser` pozná obe.
 */
async function zoznamNahrati(request: Request): Promise<Response> {
  if (!(await currentUser(request))) return unauthorized();
  const { DB } = envNahrate();
  if (!DB) return chyba("no_db", 500);
  const vsetky = new URL(request.url).searchParams.get("vsetky") === "1";
  const r = await DB.prepare(
    vsetky
      ? "SELECT * FROM strizna_nahrate ORDER BY zacate_kedy DESC LIMIT 60"
      : "SELECT * FROM strizna_nahrate WHERE stav = 'nahrate' ORDER BY nahrate_kedy",
  ).all<RiadokNahratia>().then((x) => x.results).catch(() => null);
  // Tabuľka chýba = migrácia neprebehla. Povedať to, nie tváriť sa prázdne.
  if (r === null) return chyba("Chýba tabuľka strizna_nahrate (migrácia 0115).", 500);
  if (vsetky) return ok({ polozky: r.map(naNahratie) });
  return ok({ polozky: r.map((x) => ({ id: x.id, nazov: x.nazov, velkost: Number(x.velkost) || 0, typ: x.typ, nahrateKedy: x.nahrate_kedy })) });
}

async function startNahratia(request: Request): Promise<Response> {
  const kto = await currentUser(request);
  if (!kto) return unauthorized();
  const { DB, STORAGE } = envNahrate();
  if (!DB) return chyba("no_db", 500);
  if (!STORAGE) return chyba("Úložisko (R2) nie je zapnuté.", 503);
  const b = (await request.json().catch(() => null)) as { nazov?: unknown; velkost?: unknown; typ?: unknown } | null;
  if (!b) return chyba("Telo nie je JSON.");
  const nazov = String(b.nazov ?? "").trim();
  const velkost = Number(b.velkost);
  if (!nazov) return chyba("Chýba meno súboru.");
  if (!Number.isFinite(velkost) || velkost <= 0) return chyba("Súbor je prázdny.");
  if (velkost > MAX_VELKOST) return chyba(`Súbor má ${velkostCitatelne(velkost)} — najviac sa dá ${velkostCitatelne(MAX_VELKOST)}.`);
  const typ = typVidea(String(b.typ ?? ""), nazov);
  if (!typ) return chyba("Toto nie je video.");

  const id = noveId();
  const kluc = klucObjektu(id, nazov);
  let uploadId: string;
  try {
    const mpu = await STORAGE.createMultipartUpload(kluc, { httpMetadata: { contentType: typ } });
    uploadId = mpu.uploadId;
  } catch (e) {
    return chyba(`Úložisko odmietlo začať nahrávanie: ${String(e).slice(0, 200)}`, 502);
  }
  try {
    await DB.prepare(
      "INSERT INTO strizna_nahrate (id, nazov, velkost, typ, kluc, upload_id, stav, kto, zacate_kedy) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'nahrava', ?7, ?8)",
    ).bind(id, nazov.slice(0, 200), velkost, typ, kluc, uploadId, kto, new Date().toISOString()).run();
  } catch (e) {
    await STORAGE.resumeMultipartUpload(kluc, uploadId).abort().catch(() => {});
    return chyba(`Zápis do databázy zlyhal: ${String(e).slice(0, 200)}`, 500);
  }
  await audit(DB, { action: "strizna-nahrava", predmet: nazov.slice(0, 120), neu: { id, velkost }, actor: kto });
  return ok({ id, uploadId, velkostCasti: VELKOST_CASTI, pocetCasti: pocetCasti(velkost) });
}
