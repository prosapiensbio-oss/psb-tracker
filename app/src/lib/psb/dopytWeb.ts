/**
 * ZÁPIS DOPYTU Z WEBU — dva formuláre v ten istý deň sú jeden riadok.
 *
 * Kľúč je `web-<deň>-<email>`: dvojklik ani opakovaný pokus CF7 nesmie vyrobiť
 * dva riadky. Lenže druhý formulár toho dňa pôvodne PREPÍSAL prvý: kto ráno
 * napísal, že ho bolí chrbát, a poobede si stiahol lead magnet, stal sa „magnetom"
 * a jeho správa zmizla. Terezka by ho potom vôbec nemala na zozname dopytov.
 *
 *  • `druh` sa nikdy nezhorší: čo raz bolo `dopyt`, ostane `dopyt`,
 *    magnet sa naopak na dopyt zlepší, keď človek potom napíše.
 *  • `note` sa pripája; rovnaká správa (dvojklik, opakovaný pokus) sa nezdvojí.
 *    Oddeľovač je ` · `, nie nový riadok — poznámka sa kreslí aj v jednoriadkovom
 *    poli a koniec riadku by sa v ňom stratil.
 *  • Prázdne pole z druhého formulára nezmaže vyplnené z prvého
 *    (magnet býva len e-mail, kontaktný formulár má aj telefón a meno).
 */
export type DopytZWebu = {
  id: string;
  date: string;
  /** Zobrazované meno; keď formulár meno nemal, je tu náhradne e-mail alebo telefón. */
  name: string;
  /** Meno tak, ako ho človek napísal — prázdne = staré meno ostáva. */
  menoZFormulara: string;
  source: string;
  note: string;
  createdAt: string;
  email: string;
  telefon: string;
  kampan: string;
  utm: string;
  stranka: string;
  druh: "dopyt" | "magnet" | "kontrola";
};

/** Dlhšie než toto sa poznámka nepredĺži — jeden človek nemá zaplniť riadok v D1. */
const STROP_POZNAMKY = 2000;

const neZmaz = (stlpec: string) => `${stlpec} = COALESCE(NULLIF(excluded.${stlpec}, ''), leads.${stlpec})`;

export const SQL_ZAPIS_DOPYTU = `INSERT INTO leads (id,date,name,source,referrer,status,note,created_at,email,telefon,kampan,utm,stranka,druh)
VALUES (?1,?2,?3,?4,'','novy',?5,?6,?7,?8,?9,?10,?11,?12)
ON CONFLICT(id) DO UPDATE SET
  name = CASE WHEN ?13 = '' THEN leads.name ELSE excluded.name END,
  ${neZmaz("email")}, ${neZmaz("telefon")}, ${neZmaz("kampan")}, ${neZmaz("utm")}, ${neZmaz("stranka")},
  note = CASE
    WHEN excluded.note = '' THEN leads.note
    WHEN COALESCE(leads.note, '') = '' THEN excluded.note
    WHEN instr(leads.note, excluded.note) > 0 THEN leads.note
    ELSE substr(leads.note || ' · ' || excluded.note, 1, ${STROP_POZNAMKY})
  END,
  druh = CASE WHEN leads.druh = 'dopyt' THEN 'dopyt' ELSE excluded.druh END`;

export async function zapisDopytZWebu(DB: import("@cloudflare/workers-types").D1Database, d: DopytZWebu): Promise<void> {
  await DB.prepare(SQL_ZAPIS_DOPYTU)
    .bind(d.id, d.date, d.name, d.source, d.note, d.createdAt, d.email, d.telefon, d.kampan, d.utm, d.stranka, d.druh, d.menoZFormulara)
    .run();
}
