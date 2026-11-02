import type { D1Database } from "@cloudflare/workers-types";

import { podpisOdkazu } from "./auth.server";
import { dnesPraha, posunDen } from "./cas";
import { setOverride } from "./db.server";
import { normName } from "./format";
import { znamiKlienti } from "./nahodTrening.server";
import { datumNarodenia } from "./parse";
import { verejnyOdkaz } from "./verejnyOdkaz";
import { textSmsNarodenin, zastupcaKlienta } from "./narodeniny";

/**
 * ODKAZ NA DÁTUM NARODENIA — `/v/na<18 znakov>`.
 *
 * Pod `/v/` z rovnakého dôvodu ako faktúra (`fakturaOdkaz.server.ts`): krátka
 * adresa cez prosapiens.cz pozná len známe cesty a dlhá adresa workera by
 * znamenala dve SMS namiesto jednej. Token je podpis mena, bez tabuľky.
 * Tokeny klientov majú 12 znakov, takže sa s týmito nestretnú.
 */
export const PREDPONA_NARODENIN = "na";

export async function tokenNarodenin(klient: string): Promise<string> {
  return `${PREDPONA_NARODENIN}${(await podpisOdkazu(`narodeniny|${normName(klient)}`)).slice(0, 18)}`;
}

export async function klientPodlaTokenuNarodenin(DB: D1Database, token: string): Promise<string | null> {
  if (!token.startsWith(PREDPONA_NARODENIN) || token.length !== PREDPONA_NARODENIN.length + 18) return null;
  for (const m of await znamiKlienti(DB)) if ((await tokenNarodenin(m)) === token) return m;
  return null;
}

/** Dátum sa zapíše len tam, kde žiadny nie je: odkaz sa dá preposlať a omyl opraví tréner v profile. */
export async function ulozNarodeninyZOdkazu(DB: D1Database, klient: string, hodnota: string): Promise<"hotovo" | "uzMame" | "chyba"> {
  const datum = datumNarodenia(hodnota);
  if (!datum || datum > dnesPraha()) return "chyba";
  if (await maNarodeniny(DB, klient)) return "uzMame";
  await setOverride(DB, klient, "narodeniny", datum);
  return "hotovo";
}

export async function maNarodeniny(DB: D1Database, klient: string): Promise<boolean> {
  const r = await DB.prepare("SELECT narodeniny FROM client_overrides WHERE name = ?1").bind(klient).first<{ narodeniny: string | null }>();
  return !!r?.narodeniny;
}

export type RiadokNarodenin = {
  klient: string; prijemca: string; telefon: string; url: string; nahlad: string; text: string; odoslane: boolean;
};

/** Kto chodí (kalendár od augusta) a dátum nemá; číslo je toho, kto vypĺňa. */
export async function zoznamBezNarodenin(DB: D1Database, origin: string): Promise<RiadokNarodenin[]> {
  const [udalosti, prepisy, pt, fakt, odoslane] = await DB.batch([
    DB.prepare("SELECT DISTINCT klient FROM kal_udalosti WHERE klient IS NOT NULL AND typ IN ('trening','uvodny') AND zmizla_at IS NULL AND zaciatok >= ?1").bind(posunDen(dnesPraha(), -90)),
    DB.prepare("SELECT name, narodeniny FROM client_overrides"),
    DB.prepare("SELECT meno, narodeniny, telefon FROM ptminder_klienti"),
    DB.prepare("SELECT klient, telefon FROM klient_fakturacia"),
    DB.prepare("SELECT payment_id AS predmet FROM vzas_audit WHERE action = 'sms-narodeniny'"),
  ]);
  const riadky = <T,>(x: { results?: unknown[] }) => (x.results || []) as T[];
  const sDatumom = new Set([
    ...riadky<{ name: string; narodeniny: string | null }>(prepisy).filter((x) => x.narodeniny).map((x) => normName(x.name)),
    ...riadky<{ meno: string; narodeniny: string | null }>(pt).filter((x) => x.narodeniny).map((x) => normName(x.meno)),
  ]);
  const telefony = new Map<string, string>();
  for (const x of riadky<{ meno: string; telefon: string | null }>(pt)) if (x.telefon) telefony.set(normName(x.meno), x.telefon);
  // Fakturačný kontakt je novší než archív PTmindera.
  for (const x of riadky<{ klient: string; telefon: string | null }>(fakt)) if (x.telefon) telefony.set(normName(x.klient), x.telefon);
  const poslane = new Set(riadky<{ predmet: string }>(odoslane).map((x) => normName(String(x.predmet).split(" · ")[0])));

  const out: RiadokNarodenin[] = [];
  for (const { klient } of riadky<{ klient: string }>(udalosti)) {
    if (sDatumom.has(normName(klient))) continue;
    const prijemca = zastupcaKlienta(klient) || klient;
    const token = await tokenNarodenin(klient);
    const url = verejnyOdkaz(`/v/${token}`, origin);
    out.push({
      klient, prijemca, telefon: telefony.get(normName(prijemca)) || "", url, nahlad: `${origin}/v/${token}?nahlad=1`,
      text: textSmsNarodenin(klient, url), odoslane: poslane.has(normName(klient)),
    });
  }
  return out.sort((a, b) => a.klient.localeCompare(b.klient, "cs"));
}
