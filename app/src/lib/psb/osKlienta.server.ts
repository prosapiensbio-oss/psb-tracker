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
import { normName } from "./format";
import { osCasuKlienta, type Udalost } from "./klientOsCasu";
import type { PSBData } from "./types";

export type KalUdalostServer = { klient: string; trener: string; zaciatok: string; koniec: string; nazov: string; typ: string };
export type BalicekServer = {
  klient: string; nazov: string; hodiny: number | null; cena_czk: number | null;
  platnost_od: string; platnost_do: string | null; zdroj: string; zrusene_at: string | null;
  /** „zostatok prevzatý z PTmindera…" — os ho potrebuje (29. 10. 2026). */
  poznamka?: string | null;
};

export async function osKlientaZoServera(
  DB: D1Database,
  data: PSBData,
  meno: string,
  teraz: string = terazPraha(),
): Promise<{ os: Udalost[]; kalUdalosti: KalUdalostServer[]; balicky: BalicekServer[] }> {
  /**
   * MENO SA POROVNÁVA CEZ normName, NIE PRESNE V SQL (21. 10. 2026).
   *
   * Kokpit v appke páruje klienta s balíčkami aj kalendárom cez `normName`
   * (bez diakritiky, veľkosti písmen a dvojitých medzier). Stránka `/v/`
   * a mail tu mali `WHERE klient = ?1` — balíček zapísaný ako „Stigut“
   * k „Štigut“ tak v appke bol a na stránke klienta chýbal; klient videl
   * mínus hodiny, ktoré Kokpit nevidel. SQL LIKE diakritiku nezjednotí,
   * preto sa berú všetky riadky a filtruje sa v JS tým istým pravidlom.
   *
   * A BEZ `.catch(() => ({ results: [] }))`: prázdny zoznam pri výpadku D1
   * vyzerá presne ako „žiadny balíček“ a stránka by klientovi ukázala
   * zlé hodiny a QR na doplatok. Chyba nech radšej spadne — stránka
   * ukáže chybu, nie nepravdu.
   */
  const kto = normName(meno);
  const kalUdalosti = (((await DB.prepare(
    `SELECT u.klient, u.trener, u.zaciatok, u.koniec, u.nazov, u.typ
       FROM kal_udalosti u
       LEFT JOIN kal_konanie k ON k.uid = u.uid AND k.trener = u.trener
      WHERE u.klient IS NOT NULL AND u.typ IN ('trening','uvodny')
        AND (u.zmizla_at IS NULL OR k.konal = 1)`,
  ).all()).results || []) as unknown as KalUdalostServer[])
    .filter((u) => normName(u.klient) === kto);

  const balicky = (((await DB.prepare(
    `SELECT klient, nazov, hodiny, cena_czk, platnost_od, platnost_do, zdroj, zrusene_at, poznamka
       FROM balicky`,
  ).all()).results || []) as unknown as BalicekServer[])
    .filter((b) => normName(b.klient) === kto);

  const os = osCasuKlienta(meno, {
    sessions: data.sessions, payments: data.payments, packages: data.packages,
    services: data.services, poplatky: data.poplatky, nezaplateneKokpit: data.nezaplateneKokpit || [], bezHodin: data.bezHodin, platbyKokpit: data.platbyKokpit, treningyZdarma: data.treningyZdarma,
    doplneniaHodiny: data.doplneniaHodiny || {}, kalUdalosti, balicky,
    druhyTreningov: data.druhyTreningov || {},
    historia: data.historiaBalickov || [], acks: data.anomalyAck,
  }, teraz);

  return { os, kalUdalosti, balicky };
}
