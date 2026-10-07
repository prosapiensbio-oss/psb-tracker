import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "./audit.server";
import { vlozUdalost } from "./gcal.server";
import { icsUid, pripravTrening, type VstupTreningu } from "./nahodTrening";

/**
 * ZÁPIS TRÉNINGU DO KALENDÁRA TRÉNERA — jedno miesto pre Kokpit aj pre
 * klienta, ktorý si vyberie termín z ponuky (`/t/<token>`, 7. 10. 2026).
 *
 * Zapíše sa na OBE miesta naraz: do Google cez servisný účet a hneď aj do
 * kal_udalosti pod tým istým ics uid, takže obrazovky ho vidia okamžite a
 * najbližšia snímka ho len potvrdí. Meno udalosti je plné meno klienta
 * a mapovanie sa doučí samo.
 */
export async function zapisTrening(
  DB: D1Database,
  kluc: string | undefined,
  vstup: VstupTreningu & { typ?: string },
  kto: string,
  akciaAuditu = "trening-nahodeny",
): Promise<{ ok: true; uid: string; zaciatok: string } | { ok: false; chyba: string; status: number }> {
  if (!kluc) return { ok: false, chyba: "Servisný účet nie je nastavený (GCAL_SA_KLUC).", status: 503 };
  const v = pripravTrening(vstup);
  if (!v.ok) return { ok: false, chyba: v.chyba, status: 400 };
  const typNovej = String(vstup.typ || "trening") === "uvodny" ? "uvodny" : "trening";

  let idUdalosti = "";
  try {
    idUdalosti = await vlozUdalost(kluc, v.t);
  } catch (e) {
    const sprava = String(e instanceof Error ? e.message : e);
    // Terezkin kalendár ešte nemusí byť zdieľaný — povedz to rovno.
    const rada = /not.*found|forbidden|403|404/i.test(sprava)
      ? ` Skontroluj, či je kalendár ${v.t.kalendar} zdieľaný účtu kokpit-kalendar@evident-catcher-510117-k6.iam.gserviceaccount.com s právom robiť zmeny.`
      : "";
    return { ok: false, chyba: `Google kalendár zápis odmietol: ${sprava}.${rada}`, status: 502 };
  }

  // Kľúč v tvare snímky: `<ics uid>|<začiatok>`. Holé ics uid by najbližšia
  // snímka nespoznala — založila by druhý riadok a tento ohlásila ako
  // „zrušený tréning“, hoci sa nič nezrušilo.
  const uid = `${icsUid(idUdalosti)}|${v.t.zaciatok}`;
  const kedy = new Date().toISOString();
  const klient = String(vstup.klient || "").trim();
  await DB.batch([
    DB.prepare(
      `INSERT OR REPLACE INTO kal_udalosti (uid, trener, zaciatok, koniec, nazov, klient, typ, prvy_raz, naposledy, zmizla_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?8, ?7, ?7, NULL)`,
    ).bind(uid, v.t.trener, v.t.zaciatok, v.t.koniec, v.t.nazov, klient, kedy, typNovej),
    // Mapovanie: plné meno klienta ako názov → klient. Bez času,
    // platí pre všetky jeho budúce udalosti s týmto názvom.
    DB.prepare(
      `INSERT OR IGNORE INTO kal_mapovanie (nazov, trener, cas, klient, typ, vedome) VALUES (?1, ?2, '', ?1, ?3, 1)`,
    ).bind(klient, v.t.trener, typNovej),
  ]);
  await audit(DB, { action: akciaAuditu, predmet: `${v.t.nazov} · ${v.t.zaciatok} · ${v.t.trener}`, neu: uid, actor: kto });
  return { ok: true, uid, zaciatok: v.t.zaciatok };
}
