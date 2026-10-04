/**
 * OS ČASU KLIENTA ZO SERVERA — jedno miesto pre stránku `/v/` aj pre mail.
 *
 * Do 3. 10. 2026 si stránka za odkazom ťahala kalendár a balíčky z Kokpitu
 * sama (`routes/v.$token.tsx`), kým mail „celá história" na vyžiadanie
 * (`routes/api/mail-dopyty.ts`) staval os len z PTmindera — bez kalendára
 * a bez balíčkov nahodených v Kokpite. Klient tak dostal v SMS jednu os
 * a v maili inú; presne chyba „os bez kalendára", opravená 2. 10. na
 * stránke, žila ďalej v maili.
 *
 * Tu sú oba zdroje načítané raz a rovnako:
 *  - kalendár s tým istým pravidlom ako `loadData`: zmiznutá udalosť sa
 *    počíta len vtedy, keď o nej Jerry povedal „bol tam" (`kal_konanie`);
 *  - `teraz` je pražský čas s hodinou, takže dnešný tréning, ktorý sa ešte
 *    nezačal, na osi nie je (viď `klientOsCasu`).
 */
import type { D1Database } from "@cloudflare/workers-types";
import { terazPraha } from "./cas";
import { osCasuKlienta, type Udalost } from "./klientOsCasu";
import type { PSBData } from "./types";

export type KalUdalostServer = { klient: string; trener: string; zaciatok: string; koniec: string; nazov: string; typ: string };
export type BalicekServer = {
  klient: string; nazov: string; hodiny: number | null; cena_czk: number | null;
  platnost_od: string; platnost_do: string | null; zdroj: string; zrusene_at: string | null;
};

export async function osKlientaZoServera(
  DB: D1Database,
  data: PSBData,
  meno: string,
  teraz: string = terazPraha(),
): Promise<{ os: Udalost[]; kalUdalosti: KalUdalostServer[]; balicky: BalicekServer[] }> {
  const kalUdalosti = ((await DB.prepare(
    `SELECT u.klient, u.trener, u.zaciatok, u.koniec, u.nazov, u.typ
       FROM kal_udalosti u
       LEFT JOIN kal_konanie k ON k.uid = u.uid AND k.trener = u.trener
      WHERE u.klient = ?1 AND u.typ IN ('trening','uvodny')
        AND (u.zmizla_at IS NULL OR k.konal = 1)`,
  ).bind(meno).all().catch(() => ({ results: [] }))).results || []) as unknown as KalUdalostServer[];

  const balicky = ((await DB.prepare(
    `SELECT klient, nazov, hodiny, cena_czk, platnost_od, platnost_do, zdroj, zrusene_at
       FROM balicky WHERE klient = ?1`,
  ).bind(meno).all().catch(() => ({ results: [] }))).results || []) as unknown as BalicekServer[];

  const os = osCasuKlienta(meno, {
    sessions: data.sessions, payments: data.payments, packages: data.packages,
    services: data.services, poplatky: data.poplatky, treningyZdarma: data.treningyZdarma,
    doplneniaHodiny: data.doplneniaHodiny || {}, kalUdalosti, balicky,
    historia: data.historiaBalickov || [],
  }, teraz);

  return { os, kalUdalosti, balicky };
}
