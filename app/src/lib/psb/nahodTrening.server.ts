import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "./audit.server";
import { dnesPraha, posunDen } from "./cas";
import { normName } from "./format";
import { vlozUdalost } from "./gcal.server";
import { icsUid, pripravTrening, type VstupTreningu } from "./nahodTrening";

/**
 * MENÁ ZNÁMYCH KLIENTOV (21. 10. 2026) — jedno miesto pre istú zhodu celého
 * mena pri sťahovaní, stráž pravidla mena aj kartu „Jedno meno, viac klientov“.
 *
 * Do 21. 10. sa zoznam staval hlavne zo `sessions`, lenže export PTmindera
 * stojí od 19. 10. 2026 — nový klient by v ňom nebol nikdy a jeho celé meno
 * by appka nespoznala. Preto aj balíčky, udalosti s klientom, Client List
 * z PTmindera a pravidlá mena.
 *
 * Duplicity sa zlučujú podľa `normName`: „Anna Nová“ zo `sessions` a „Anna
 * Nova“ z udalosti sú jeden človek, a keby zostali dvaja,
 * `klientPodlaCelehoMena` by pri dvoch zhodách nevybral nikoho. Prednosť má
 * tvar zo zdroja, ktorý je v poradí skôr (export, Client List, balíčky…).
 */
export function zlucMenaKlientov(mena: string[]): string[] {
  const videne = new Set<string>();
  const von: string[] = [];
  for (const m of mena) {
    const t = String(m || "").trim();
    const k = normName(t);
    if (!k || videne.has(k)) continue;
    videne.add(k);
    von.push(t);
  }
  return von;
}

/**
 * `odDni`: len klienti, ktorí sa za toľko dní niekde ukázali (sedenie,
 * balíček, udalosť; Client List bez dátumu neaktivity). Pravidlá mena sa
 * berú vždy — sú to rozhodnutia o dnešných názvoch.
 *
 * Chyba dopytu sa NEZHLTNE: prázdny zoznam by stráž celého mena ticho vypol.
 */
export async function znamiKlienti(DB: D1Database, odDni?: number): Promise<string[]> {
  const od = odDni ? posunDen(dnesPraha(), -odDni) : "";
  const rs = await DB.prepare(
    `SELECT m FROM (
       SELECT DISTINCT client_name m, 1 poradie FROM sessions WHERE client_name IS NOT NULL AND date >= ?1
       UNION ALL SELECT meno, 2 FROM ptminder_klienti WHERE ?1 = '' OR COALESCE(neaktivny_od, '') = '' OR neaktivny_od >= ?1
       UNION ALL SELECT DISTINCT klient, 3 FROM balicky WHERE klient IS NOT NULL AND zrusene_at IS NULL AND platnost_od >= ?1
       UNION ALL SELECT DISTINCT klient, 4 FROM kal_mapovanie WHERE klient IS NOT NULL
       UNION ALL SELECT DISTINCT klient, 5 FROM kal_udalosti WHERE klient IS NOT NULL AND zaciatok >= ?1
     ) ORDER BY poradie`,
  ).bind(od).all<{ m: string }>();
  return zlucMenaKlientov((rs.results || []).map((x) => String(x.m || "")));
}

/**
 * ZÁPIS TRÉNINGU DO KALENDÁRA TRÉNERA — jedno miesto pre Kokpit aj pre
 * klienta, ktorý si vyberie termín z ponuky (`/t/<token>`, 7. 10. 2026).
 *
 * Zapíše sa na OBE miesta naraz: do Google cez servisný účet a hneď aj do
 * kal_udalosti pod tým istým ics uid, takže obrazovky ho vidia okamžite a
 * najbližšia snímka ho len potvrdí. Meno udalosti je plné meno klienta
 * a mapovanie sa doučí samo.
 */
/**
 * PRAVIDLO „NÁZOV = CELÉ MENO KLIENTA“ (21. 10. 2026). Kokpit nahadzuje
 * udalosť s názvom presne podľa klienta, takže pravidlo pre ten názov MUSÍ
 * ukazovať naňho. Do 21. 10. to bolo `INSERT OR IGNORE`: staré zlé pravidlo
 * („Albert Matl“ → Richard Matl) prežilo, Jerry Albertov tréning zmazal
 * a nahodil znova — a znova ho dostal Richard. Teraz pravidlo prepíše
 * a opraví aj udalosti s tým názvom (okrem ručne určených a tých, kde platí
 * pravidlo na čas).
 *
 * DRUH PRAVIDLA JE VŽDY TRÉNING (21. 10. 2026). Pravidlo vzniklo pri prvej
 * udalosti klienta — a keď to bol úvodný, dostalo typ `uvodny` a najbližšie
 * sťahovanie spravilo úvodný z KAŽDÉHO ďalšieho tréningu toho klienta. Úvodný
 * je vlastnosť jednej udalosti, nie mena: tú nesie `typ_rucne` pri zápise
 * (`zapisTrening`), pravidlo ostáva `trening`. Prepíše sa aj staré pravidlo
 * bez klienta (netrening/sukromne) pre presne toto celé meno.
 */
export function pravidloCelehoMena(DB: D1Database, klient: string, trener: string) {
  return [
    // Kým sa zlé pravidlo `uvodny` prepíše, prvý úvodný s týmto názvom sa
    // podrží ručnou značkou — inak by ho sťahovanie spravilo tréningom.
    DB.prepare(
      `UPDATE kal_udalosti SET typ_rucne = 1
        WHERE uid = (SELECT u.uid FROM kal_udalosti u WHERE u.nazov = ?1 AND u.trener = ?2 AND u.typ = 'uvodny' AND u.zmizla_at IS NULL ORDER BY u.zaciatok LIMIT 1)
          AND trener = ?2
          AND EXISTS (SELECT 1 FROM kal_mapovanie WHERE nazov = ?1 AND trener = ?2 AND cas = '' AND typ = 'uvodny')`,
    ).bind(klient, trener),
    DB.prepare(
      `INSERT INTO kal_mapovanie (nazov, trener, cas, klient, typ, potvrdene_at, vedome) VALUES (?1, ?2, '', ?1, 'trening', ?3, 1)
       ON CONFLICT(nazov, trener, cas) DO UPDATE SET klient = excluded.klient, typ = 'trening', vedome = 1, potvrdene_at = excluded.potvrdene_at
       WHERE kal_mapovanie.klient IS NOT excluded.klient OR kal_mapovanie.typ IS NOT 'trening'`,
    ).bind(klient, trener, new Date().toISOString()),
    DB.prepare(
      `UPDATE kal_udalosti SET klient = ?1
        WHERE nazov = ?1 AND trener = ?2 AND klient_rucne = 0 AND klient IS NOT ?1
          AND substr(zaciatok, 12, 5) NOT IN (SELECT cas FROM kal_mapovanie WHERE nazov = ?1 AND trener = ?2 AND cas <> '')`,
    ).bind(klient, trener),
  ];
}

/** `typ_rucne` novej udalosti z Kokpitu: úvodný sa drží proti pravidlu mena, tréning nie. */
export const typRucnePreNovu = (typ: string): 1 | null => (typ === "uvodny" ? 1 : null);

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
    // Úvodný nesie ručnú značku: pravidlo mena je `trening` a sťahovanie
    // by mu inak druh prepísalo (21. 10. 2026).
    DB.prepare(
      `INSERT OR REPLACE INTO kal_udalosti (uid, trener, zaciatok, koniec, nazov, klient, typ, typ_rucne, prvy_raz, naposledy, zmizla_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?8, ?9, ?7, ?7, NULL)`,
    ).bind(uid, v.t.trener, v.t.zaciatok, v.t.koniec, v.t.nazov, klient, kedy, typNovej, typRucnePreNovu(typNovej)),
    // Mapovanie: plné meno klienta ako názov → klient. Bez času,
    // platí pre všetky jeho budúce udalosti s týmto názvom.
    ...pravidloCelehoMena(DB, klient, v.t.trener),
  ]);
  await audit(DB, { action: akciaAuditu, predmet: `${v.t.nazov} · ${v.t.zaciatok} · ${v.t.trener}`, neu: uid, actor: kto });
  return { ok: true, uid, zaciatok: v.t.zaciatok };
}
