import puppeteer from "@cloudflare/puppeteer";

import { fakturaDocument } from "./fakturaHtml";
import type { Faktura } from "./vydanaFaktura";

/**
 * FAKTÚRA DO PDF — NA SERVERI.
 *
 * Tlač z prehliadača vyrobí súbor až u človeka v dialógu; do prílohy mailu sa
 * tým pádom nedostane. Toto je ten istý dokument otvorený v prehliadači na
 * Cloudflare (väzba BROWSER) a uložený ako PDF. Jedna šablóna, dve cesty —
 * papier aj príloha vyzerajú rovnako, lebo ich sádže ten istý kód.
 *
 * ZNAČKA A PÍSMO SA VKLADAJÚ DNU, NETIAHNU SA SIEŤOU.
 *
 * Prvý pokus nechal v dokumente cesty `/znacka-…svg` a `/agrandir.woff2`
 * a pridal `<base>` na adresu appky. PDF vyšlo — ale v Robote a bez loga:
 * prehliadač na Cloudflare si tie súbory od nášho vlastného workera
 * nestiahol. Preto sa čítajú väzbou ASSETS (teda bez siete) a do dokumentu
 * idú ako dáta. PDF je tým pádom sebestačné a nezávisí na tom, či sa
 * prehliadač niekam dovolá.
 */

const base64 = (b: ArrayBuffer): string => {
  const bajty = new Uint8Array(b);
  let s = "";
  for (let i = 0; i < bajty.length; i += 0x8000) {
    s += String.fromCharCode(...bajty.subarray(i, i + 0x8000));
  }
  return btoa(s);
};

type Assets = { fetch: (req: Request) => Promise<Response> };

/** Súbor z appky ako dátová adresa; `null`, keď tam nie je. */
async function akoData(ASSETS: Assets, cesta: string, typ: string, zaklad: string): Promise<string | null> {
  const r = await ASSETS.fetch(new Request(new URL(cesta, zaklad).toString())).catch(() => null);
  if (!r || !r.ok) return null;
  return `data:${typ};base64,${base64(await r.arrayBuffer())}`;
}

export async function fakturaDoPdf(
  BROWSER: unknown,
  ASSETS: Assets | undefined,
  f: Faktura,
  zaklad: string,
): Promise<ArrayBuffer> {
  let html = fakturaDocument(f);
  if (ASSETS) {
    const kusy: [string, string, string][] = [
      ["/agrandir.woff2", "font/woff2", "font"],
      ["/znacka-napis-zelena.svg", "image/svg+xml", "svg"],
      ["/znacka-figura-biela.svg", "image/svg+xml", "svg"],
    ];
    for (const [cesta, typ] of kusy) {
      const data = await akoData(ASSETS, cesta, typ, zaklad);
      // Keď súbor chýba, nechá sa pôvodná cesta: radšej doklad bez loga než
      // žiadny doklad. Do logu sa to nepíše, lebo `ASSETS` buď je, alebo nie.
      if (data) html = html.split(cesta).join(data);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prehliadac = await puppeteer.launch(BROWSER as any);
  try {
    const strana = await prehliadac.newPage();
    await strana.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await strana.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return pdf as unknown as ArrayBuffer;
  } finally {
    await prehliadac.close();
  }
}
