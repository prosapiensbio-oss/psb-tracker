import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { deriveClients } from "../lib/psb/compute";
import { dlhKlienta, type BalicekDlh, type PlatbaDlh } from "../lib/psb/dlhKlienta";
import { historiaPreMail } from "../lib/psb/historiaMail";
import { loadData } from "../lib/psb/db.server";
import { mailKlientovi } from "../lib/psb/mailKlientovi";
import { osCasuKlienta } from "../lib/psb/klientOsCasu";
import { qrObrazok } from "../lib/psb/fakturaHtml";
import { DODAVATEL, spayd } from "../lib/psb/vydanaFaktura";

/**
 * VEREJNÁ STRÁNKA KLIENTA — to, na čo klikne z SMS.
 *
 * Jerry, 30. 9. 2026: „je možnosť tam dať preklik, ktorý by ľudí preklikol
 * rovno do toho zobrazenia tréningov a na platbu?" SMS nemá miesto na
 * tabuľku; nesie odkaz `/v/<token>` a stránka ukáže to isté, čo mail
 * s výpisom: históriu tréningov a platieb — a keď klient niečo dlhuje,
 * aj QR na platbu so sumou.
 *
 * BEZPEČNOSŤ: token je náhodných 12 znakov z tabuľky `klient_odkazy` —
 * nedá sa uhádnuť ani odvodiť z mena a zmazaním riadku odkaz zhasne.
 * Stránka je NOINDEX a bez keše; okrem tokenu sa v adrese nič nenesie.
 * Sadzba je tá istá ako v maili (mailKlientovi) — jeden vzhľad, jedna
 * pravda; obrázky idú ako URL a data:, lebo stránka prílohy nemá.
 */
export const Route = createFileRoute("/v/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        const prec = (text: string, status: number) => new Response(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens</title></head>
<body style="margin:0;background:#232b1c;color:#f2f0e4;font-family:Arial,Helvetica,sans-serif"><div style="max-width:420px;margin:80px auto;padding:0 20px;text-align:center">
<div style="font-size:15px;line-height:1.6">${text}</div>
<div style="margin-top:18px;font-size:12px;color:#9aa284">ProSapiens Biomechanic · ${DODAVATEL.telefon}</div></div></body></html>`,
          { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
        );
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return prec("Tento odkaz neplatí.", 404);

        const r = await DB.prepare("SELECT klient FROM klient_odkazy WHERE token = ?1").bind(token).first<{ klient: string }>();
        if (!r) return prec("Tento odkaz neplatí. Ozvi sa nám a pošleme ti nový.", 404);

        const data = await loadData(DB);
        const c = deriveClients(data)[r.klient];
        if (!c) return prec("Tento odkaz neplatí. Ozvi sa nám a pošleme ti nový.", 404);

        const dnes = new Date().toISOString().slice(0, 10);
        const os = osCasuKlienta(c.name, {
          sessions: data.sessions, payments: data.payments, packages: data.packages,
          services: data.services, poplatky: data.poplatky, treningyZdarma: data.treningyZdarma,
          doplneniaHodiny: data.doplneniaHodiny || {},
        }, dnes);
        const dalsi = ((await DB.prepare(
          "SELECT MIN(zaciatok) z FROM kal_udalosti WHERE zmizla_at IS NULL AND klient = ?1 AND typ IN ('trening','uvodny') AND zaciatok > ?2",
        ).bind(c.name, new Date().toISOString().slice(0, 16)).first<{ z: string | null }>())?.z) || undefined;

        /**
         * DLH LEN Z VLASTNEJ EVIDENCIE — tá istá matematika ako mínus na
         * karte klienta (dlhKlienta): ručne nahodené balíčky mínus platby.
         * Keď nič nedlhuje, platobný blok sa nekreslí — QR na nulu je výzva
         * na omyl.
         */
        const balicky = ((await DB.prepare(
          "SELECT cena_czk, platnost_od, zdroj, zrusene_at, nazov FROM balicky WHERE klient = ?1",
        ).bind(c.name).all()).results || []) as unknown as { cena_czk: number | null; platnost_od: string; zdroj: string; zrusene_at: string | null; nazov: string }[];
        const platby = ((await DB.prepare(
          "SELECT suma_czk, datum, zrusene_at FROM platby WHERE klient = ?1",
        ).bind(c.name).all()).results || []) as unknown as { suma_czk: number; datum: string; zrusene_at: string | null }[];
        const dlh = dlhKlienta(
          balicky.map((b): BalicekDlh => ({ cena: b.cena_czk, platnostOd: b.platnost_od, zdroj: b.zdroj, zruseneAt: b.zrusene_at, nazov: b.nazov })),
          platby.map((p): PlatbaDlh => ({ suma: p.suma_czk, datum: p.datum, zruseneAt: p.zrusene_at })),
        );

        const vypis = historiaPreMail(c.name, os, c, dnes, dalsi);
        const origin = new URL(request.url).origin;
        let qrUrl: string | undefined;
        if (dlh.dlzi > 0) {
          // Do správy pre príjemcu ide MENO — podľa neho Kokpit platbu spáruje.
          const o = qrObrazok(spayd({ suma: dlh.dlzi, vs: "", sprava: c.name, prijemca: DODAVATEL.meno }));
          const bajty = new Uint8Array(o.data);
          let bin = "";
          for (let i = 0; i < bajty.length; i += 4096) bin += String.fromCharCode(...bajty.subarray(i, i + 4096));
          qrUrl = `data:${o.typ};base64,${btoa(bin)}`;
          vypis.platba = {
            popis: dlh.pocet === 1 ? "nezaplatený balíček" : `nezaplatené balíčky (${dlh.pocet})`,
            suma: dlh.dlzi, ucet: DODAVATEL.ucet, sprava: c.name,
          };
        }

        const m = mailKlientovi({ ...vypis, qrUrl, logoUrl: `${origin}/znacka-napis-mail.png` });
        // Mailová sadzba nemá viewport — telefón by stránku zmenšil na známku.
        const html = m.html.replace(
          '<meta charset="utf-8">',
          '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">',
        );

        await DB.prepare("UPDATE klient_odkazy SET otvorene = otvorene + 1, posledne_otvorene = ?1 WHERE token = ?2")
          .bind(new Date().toISOString(), token).run().catch(() => null);

        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
        });
      },
    },
  },
});
