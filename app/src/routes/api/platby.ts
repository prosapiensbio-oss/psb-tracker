import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { normName } from "../../lib/psb/format";
import { bindings } from "../../lib/bindings.server";
import {
  chybaZoznamuMien, fakturyZIdokladu, nepriradene, porovnajPlatby, smieSaZapamatat, vzorPlatby,
  sposobZRiadku, type CenaBalicka, type Diel, type FakturaVzor, type FioRiadok, type Platba,
} from "../../lib/psb/platbyEvidencia";
import { balicekZPlatby } from "../../lib/psb/balicekZPlatby";
import { polozkyDlhovMien } from "../../lib/psb/dlhyMien.server";
import { dnesPraha } from "../../lib/psb/cas";
import { btcNaPlatby, mozePrepnut, PENIAZE_KLUC } from "../../lib/psb/peniazeZKokpitu";
import { chybaDielov, menaPlatiZa, rozdelPodlaDlhov } from "../../lib/psb/platiZa";
import { najdiKlienta } from "../../lib/psb/compute";

/**
 * Vlastná evidencia platieb: banka z výpisu, hotovosť zo zošita.
 *
 * Tretia a posledná tretina plánu z 22. 9. 2026. Prvé dve merajú
 * `/api/kalendar` → `porovnanie` (dochádzka) a `/api/balicky` (hodiny).
 *
 * BANKA SA NENALIEVA CELÁ NARAZ
 *
 * Pri balíčkoch sa dal vziať export a založiť z neho riadky, lebo v ňom
 * klient STOJÍ. Vo výpise nestojí — je v texte, niekedy v správe, niekedy
 * v mene odosielateľa a niekedy nikde. Hromadné naliatie by preto priradilo
 * peniaze cudzím ľuďom. Priraďuje sa po jednom, appka navrhne a človek
 * potvrdí; naučené priradenie sa pamätá podľa odosielateľa, takže ten istý
 * platiteľ sa pýta raz.
 */

const uid = () => crypto.randomUUID();

/**
 * PRIRADENIE POHYBU KLIENTOVI — jedno miesto, lebo zrušená platba blokuje.
 *
 * Jerry, 8. 10. 2026: „túto platbu som potvrdil už 2× a stále sa vracia,
 * prečo?" Lebo nad `platby` je unikátna dvojica (fio_id, klient) a NEBERIE
 * ohľad na zrušenie. Platbu Jiřího Miřejovského (752 Kč, 7. 1.) zrušila
 * 5. 10. oprava platiteľa „Jarek"; odvtedy ten istý pohyb tomu istému
 * klientovi priradiť nešlo — `INSERT OR IGNORE` ticho nezapísal NIČ a API
 * vrátilo `ok: true`. Appka teda po každom kliknutí tvrdila, že je hotovo,
 * a pohyb sa vracal medzi nepriradené.
 *
 * Zrušená platba sa preto OŽIVÍ, nezakladá sa druhá: stráž má pravdu, že
 * ten istý pohyb nesmie mať pre jedného klienta dva riadky. A výsledok sa
 * vracia von, aby sa „nestalo sa nič" už nikdy nemohlo tváriť ako úspech
 * (CLAUDE.md: ticho zlyhávajúci zápis je horší než hlasitá chyba).
 */
type StavZapisu = "nova" | "obnovena" | "uz-bola";
type VysledokZapisu = { ok: true; stav: StavZapisu } | { ok: false; error: string };

/**
 * Meno so zoznamom („A, B, C“ z fakturačného kontaktu) nie je klient —
 * viď `chybaZoznamuMien`. Známi klienti sa ťahajú LEN keď je v mene čiarka;
 * bežné priradenie tým nič nestojí.
 */
async function chybaMena(DB: D1Database, klient: string): Promise<string | null> {
  if (!klient.includes(",")) return null;
  const [s, bal] = await DB.batch([
    DB.prepare("SELECT DISTINCT client_name m FROM sessions"),
    DB.prepare("SELECT DISTINCT klient m FROM balicky"),
  ]);
  const znami = [...(s.results || []), ...(bal.results || [])].map((x) => String((x as { m: string }).m || ""));
  return chybaZoznamuMien(klient, znami);
}

const zoznamMien = (xs: string[]) => xs.length === 1 ? `klientovi ${xs[0]}` : `klientom ${xs.join(", ")}`;

async function zapisPriradenie(
  DB: D1Database,
  v: { klient: string; datum: string; suma: number; sposob: string; fioId: string; poznamka: string; kto: string | null | undefined; vopred: boolean },
  /**
   * Smie mať pohyb živú platbu aj pre INÉHO klienta? Len pri dieloch
   * (`zapisDiely` si súčet overí sám). Celý pohyb druhému klientovi nie.
   */
  dielyPohybu = false,
): Promise<VysledokZapisu> {
  const zlyMeno = await chybaMena(DB, v.klient);
  if (zlyMeno) return { ok: false, error: zlyMeno };
  /**
   * Bez `.catch`: keď sa nedá zistiť, čo už na pohybe visí, nezapisuje sa
   * nič. Dovtedy chyba čítania znamenala „nič tam nie je“ a zapísalo sa.
   *
   * Meno sa porovnáva normalizované (21. 10. 2026): „Tomas Dvorak“ a „Tomáš
   * Dvořák“ sú ten istý klient, v SQL dva reťazce — zrušená platba by sa
   * neoživila a vedľa nej by vznikla druhá.
   */
  const riadky = ((await DB.prepare("SELECT id, klient, zrusene_at FROM platby WHERE fio_id = ?1")
    .bind(v.fioId).all()).results || []) as unknown as { id: string; klient: string; zrusene_at: string | null }[];
  const k = normName(v.klient);
  const moje = riadky.filter((x) => normName(x.klient) === k);
  /**
   * JEDEN POHYB, DVAJA KLIENTI CELÝ (21. 10. 2026). Unikátna je dvojica
   * (fio_id, klient), takže databáza pustila ten istý prevod celý aj druhému
   * klientovi — tržba sa zdvojila a banka sedela. Spoločný prevod sa delí cez
   * `rozdel`; celé priradenie inému sa odmietne s menom toho, kto ho má.
   */
  const ini = riadky.filter((x) => !x.zrusene_at && normName(x.klient) !== k).map((x) => x.klient);
  if (ini.length && !dielyPohybu) {
    return {
      ok: false,
      error: `Tento pohyb už je priradený ${zoznamMien(ini)}. Ak patrí inému, najprv tú platbu zruš; ak patrí viacerým, rozdeľ ho.`,
    };
  }
  const zivy = moje.find((x) => !x.zrusene_at);
  if (zivy) return { ok: true, stav: "uz-bola" };
  const uz = moje.find((x) => x.klient === v.klient) || moje[0];
  if (uz) {
    await DB.prepare(
      // Meno sa berie z NOVÉHO priradenia — zrušený riadok mohol niesť inú
      // podobu mena („Tomas Dvorak“ vs „Tomáš Dvořák“).
      `UPDATE platby SET zrusene_at = NULL, klient = ?8, datum = ?2, suma_czk = ?3, sposob = ?4, poznamka = ?5, autor = ?6, vopred = ?7
         WHERE id = ?1`,
    ).bind(uz.id, v.datum, v.suma, v.sposob, v.poznamka, v.kto || null, v.vopred ? 1 : 0, v.klient).run();
    return { ok: true, stav: "obnovena" };
  }
  await DB.prepare(
    "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).bind(uid(), v.klient, v.datum, v.suma, v.sposob, v.fioId, v.poznamka, teraz(), v.kto || null, v.vopred ? 1 : 0).run();
  return { ok: true, stav: "nova" };
}

/**
 * OPRAVA NAUČENÉHO PLATITEĽA (21. 10. 2026).
 *
 * Pravidlo v `platba_mapovanie` sa dovtedy len pridávalo. Keď sa naučilo zle
 * a človek potom platbu od toho istého odosielateľa priradil inému, pravidlo
 * zostalo a ďalší prevod znova ponúklo zlému klientovi — ako „naučené“, teda
 * najistejší návrh, ktorý dávka predvyplní.
 *
 * Keď človek rozhodne inak než pravidlo: smie sa nový klient naučiť
 * (`smieSaZapamatat`), pravidlo sa PREPÍŠE; nesmie, staré sa ZMAŽE, nech
 * prestane navrhovať. Oboje ide do auditu. `klienti` sú tí, komu pohyb
 * práve priradili (pri dieloch viacerí) — pravidlo, ktoré ukazuje na
 * jedného z nich, nie je v rozpore.
 */
async function opravPravidlo(
  DB: D1Database,
  vzor: string,
  klienti: string[],
  naucitPre: string | null,
  kto: string | undefined,
): Promise<{ naucil: boolean }> {
  if (!vzor) return { naucil: false };
  const stare = await DB.prepare("SELECT klient FROM platba_mapovanie WHERE vzor = ?1").bind(vzor).first<{ klient: string }>();
  const vRozpore = !!stare && !klienti.some((x) => normName(x) === normName(stare.klient));
  if (naucitPre) {
    await DB.prepare("INSERT OR REPLACE INTO platba_mapovanie (vzor, klient, potvrdene_at) VALUES (?,?,?)")
      .bind(vzor, naucitPre, teraz()).run();
    if (stare && normName(stare.klient) !== normName(naucitPre)) {
      await audit(DB, { action: "platba-pravidlo-nahradene", predmet: vzor, old: stare.klient, neu: naucitPre, actor: kto });
    }
    return { naucil: true };
  }
  if (stare && vRozpore) {
    await DB.prepare("DELETE FROM platba_mapovanie WHERE vzor = ?1").bind(vzor).run();
    await audit(DB, {
      action: "platba-pravidlo-zmazane", predmet: vzor, old: stare.klient,
      neu: `priradené ${klienti.join(", ")} — pravidlo sa nesmie naučiť, staré zmazané`, actor: kto,
    });
  }
  return { naucil: false };
}

const textChyby = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 160);
const teraz = () => new Date().toISOString();
const denISO = (s: unknown) => {
  const v = String(s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
};

type PlatbaRiadok = {
  id: string; klient: string; datum: string; suma_czk: number; sposob: string;
  fio_id: string | null; poznamka: string | null; zrusene_at: string | null;
};

const naPlatbu = (r: PlatbaRiadok): Platba => ({
  id: r.id, klient: r.klient, datum: r.datum, sumaCzk: r.suma_czk,
  sposob: r.sposob, fioId: r.fio_id, zruseneAt: r.zrusene_at,
});

type FakturaRiadok = { id: string; cislo: string; klient: string; ks: number; cena_czk: number };
type PolozkaRiadok = { faktura_id: string; klient: string; celkom_czk: number };

/**
 * Faktúry z Kokpitu na párovanie podľa variabilného symbolu. Faktúra
 * s položkami za ďalších klientov dostane `diely` — komu koľko z nej patrí.
 * Viac položiek toho istého klienta sa sčíta do jedného dielu.
 */
function fakturyKokpitu(faktury: FakturaRiadok[], polozky: PolozkaRiadok[]): FakturaVzor[] {
  const dalsie = new Map<string, PolozkaRiadok[]>();
  for (const p of polozky) dalsie.set(p.faktura_id, [...(dalsie.get(p.faktura_id) || []), p]);
  return faktury.filter((f) => f.cislo).map((f) => {
    const jeho = dalsie.get(f.id) || [];
    if (!jeho.length) return { cislo: f.cislo, klient: f.klient };
    const diely = new Map<string, number>();
    const pridaj = (k: string, n: number) => {
      const kl = normName(k);
      const kto = [...diely.keys()].find((x) => normName(x) === kl) || k;
      diely.set(kto, (diely.get(kto) || 0) + Math.round(n));
    };
    pridaj(f.klient, (Number(f.ks) || 1) * (Number(f.cena_czk) || 0));
    for (const p of jeho) pridaj(p.klient, Number(p.celkom_czk) || 0);
    return {
      cislo: f.cislo, klient: f.klient,
      ...(diely.size > 1 ? { diely: [...diely].map(([klient, suma]) => ({ klient, suma })) } : {}),
    };
  });
}

/**
 * JE TÁTO PLATBA VOPRED?
 *
 * Jerry, 4. 10. 2026: „ak klient zaplatí skôr, ako bude mať tréning, platba
 * sa zapíše, ale nový balíček má vzniknúť prvou odtrénovanou hodinou."
 * Balíček teda v tej chvíli ešte nie je a platba by sa pri počítaní dlhu
 * stratila (počítajú sa platby od prvého balíčka z Kokpitu). Príznak ju
 * udrží: platba je vopred, keď klient v čase priradenia NIČ NEDLŽÍ — ani
 * otvorený poplatok z PTmindera, ani nezaplatený balíček z Kokpitu.
 * Vtedy nepatrí ničomu, čo už existuje, a čaká na balíček, ktorý príde.
 */
async function jeVopred(DB: D1Database, klient: string): Promise<boolean> {
  return ((await dlhyMien(DB, [klient])).get(normName(klient)) || 0) === 0;
}

/** Koľko kto dlží — súčet položiek dlhu (`polozkyDlhovMien`). */
async function dlhyMien(DB: D1Database, mena: string[]): Promise<Map<string, number>> {
  const kluce = new Set(mena.map((m) => normName(m)).filter(Boolean));
  const out = new Map<string, number>();
  if (!kluce.size) return out;
  const polozky = await polozkyDlhovMien(DB, mena);
  for (const k of kluce) out.set(k, 0);
  for (const x of polozky) {
    const k = normName(x.klient);
    if (kluce.has(k)) out.set(k, (out.get(k) || 0) + x.doplatit);
  }
  for (const [k, v] of out) out.set(k, Math.max(0, Math.round(v)));
  return out;
}

/**
 * Zapíše diely jedného pohybu — každý ako samostatnú platbu s tým istým
 * `fio_id`. Spoločné pre ručné rozdelenie aj dávku. Diely sa musia zložiť
 * na sumu pohybu (tolerancia koruna); inak sa nezapíše nič.
 */
async function zapisDiely(
  DB: D1Database, r: FioRiadok, kusy: Diel[], kto: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (kusy.length < 2) return { ok: false, error: "Na rozdelenie treba aspoň dvoch klientov." };
  if (kusy.some((d) => !d.klient || d.suma <= 0)) return { ok: false, error: "Každý diel potrebuje klienta a kladnú sumu." };
  const spolu = kusy.reduce((n, d) => n + d.suma, 0);
  if (Math.abs(spolu - Math.round(r.amount_czk)) > 1) {
    return { ok: false, error: `Diely dávajú ${spolu} Kč, pohyb je ${Math.round(r.amount_czk)} Kč.` };
  }
  if (new Set(kusy.map((d) => normName(d.klient))).size !== kusy.length) {
    return { ok: false, error: "Ten istý klient je v dieloch dvakrát — spoj jeho diely do jedného." };
  }
  // Bez try/catch vracia worker HTML stránku „This page didn't load"
  // a na obrazovke to vyzerá, že sa neudialo nič. Presne tak vyzerala
  // zrazená unikátna stráž nad `fio_id` (migrácia 0082).
  let vratPovodne: () => Promise<void> = async () => {};
  try {
    for (const d of kusy) {
      const zle = await chybaMena(DB, d.klient);
      if (zle) return { ok: false, error: zle };
    }
    /**
     * DIELY NAVRCH CELÉHO PRIRADENIA (21. 10. 2026). Pohyb priradený celý
     * jednému klientovi (dávka 28. 9. tak zapísala DK Consulting Danovi) sa
     * rozdelením neopravil: Danov riadok zostal na celej sume („už bola“)
     * a Monikin diel pribudol navrch — súčet platieb prerástol pohyb. Teraz
     * sa najprv overí, čo na pohybe už živé visí: celé priradenie treba
     * najprv zrušiť a diely spolu so starými nesmú prerásť sumu pohybu.
     */
    const suma = Math.round(r.amount_czk);
    let zive = ((await DB.prepare("SELECT id, klient, suma_czk FROM platby WHERE fio_id = ?1 AND zrusene_at IS NULL")
      .bind(r.id).all()).results || []) as unknown as { id: string; klient: string; suma_czk: number }[];
    /**
     * ROZDELENIE NA JEDEN KLIK (Jerry, 21. 10. 2026: „áno, uprav to na jeden
     * klik“). Keď na pohybe visia platby LEN klientov, ktorí sú aj v dieloch
     * (Dan dostal celých 15 580, rozdeľuje sa na Dana a Moniku), staré
     * priradenie sa zruší samo a diely sa zapíšu namiesto neho — zrušený
     * riadok toho istého klienta `zapisPriradenie` oživí s novou sumou.
     * Keď na pohybe visí niekto, kto v dieloch NIE JE, rozhodne človek:
     * jeho platba by ticho zmizla.
     */
    const vDieloch = new Set(kusy.map((d) => normName(d.klient)));
    const nahradit = zive.length && zive.every((x) => vDieloch.has(normName(x.klient))) ? zive : [];
    const povodne = nahradit.map((x) => ({ id: x.id, suma: Number(x.suma_czk) || 0 }));
    if (nahradit.length) {
      const kedy = teraz();
      await DB.batch(nahradit.map((x) => DB.prepare("UPDATE platby SET zrusene_at = ?2 WHERE id = ?1").bind(x.id, kedy)));
      zive = [];
    }
    /**
     * Keď sa diely nezapíšu, vráti sa pôvodné priradenie — nič nesmie zostať
     * napoly: nové diely sa zrušia, pôvodné riadky oživia s pôvodnou sumou.
     */
    vratPovodne = async () => {
      if (!povodne.length) return;
      const ids = new Set(povodne.map((x) => x.id));
      const teraz2 = teraz();
      const nove = ((await DB.prepare("SELECT id FROM platby WHERE fio_id = ?1 AND zrusene_at IS NULL").bind(r.id).all()).results || []) as { id: string }[];
      await DB.batch([
        ...nove.filter((x) => !ids.has(x.id)).map((x) => DB.prepare("UPDATE platby SET zrusene_at = ?2 WHERE id = ?1").bind(x.id, teraz2)),
        ...povodne.map((x) => DB.prepare("UPDATE platby SET zrusene_at = NULL, suma_czk = ?2 WHERE id = ?1").bind(x.id, x.suma)),
      ]);
    };
    const cely = zive.find((x) => Math.abs(Math.round(Number(x.suma_czk) || 0) - suma) <= 1);
    if (cely) {
      return { ok: false, error: `Tento pohyb už je celý priradený klientovi ${cely.klient} (${suma} Kč), ktorý v dieloch nie je. Najprv tú platbu zruš, potom ho rozdeľ.` };
    }
    const uzZapisane = zive.reduce((n, x) => n + Math.round(Number(x.suma_czk) || 0), 0);
    const pribudne = kusy.filter((d) => !zive.some((x) => normName(x.klient) === normName(d.klient))).reduce((n, d) => n + d.suma, 0);
    if (zive.length && uzZapisane + pribudne > suma + 1) {
      return {
        ok: false,
        error: `Pohyb už má priradené ${uzZapisane} Kč (${zive.map((x) => x.klient).join(", ")}); s novými dielmi by to bolo ${uzZapisane + pribudne} Kč z ${suma} Kč. Najprv zruš staré priradenie.`,
      };
    }
    const vopred = await Promise.all(kusy.map((d) => jeVopred(DB, d.klient)));
    // Po jednom, nie v dávke: zrušená platba toho istého klienta sa OŽIVÍ
    // (viď `zapisPriradenie`) — dovtedy na nej rozdelenie padalo hláškou
    // „už má priradenú platbu", hoci žiadna živá neexistovala.
    for (let i = 0; i < kusy.length; i++) {
      const d = kusy[i];
      const v = await zapisPriradenie(DB, {
        klient: d.klient, datum: r.date.slice(0, 10), suma: d.suma, sposob: sposobZRiadku(r), fioId: r.id,
        poznamka: `rozdelené · ${(r.counterparty || "").slice(0, 160)}`, kto, vopred: vopred[i],
      }, true);
      if (!v.ok) {
        if (povodne.length) {
          await vratPovodne();
          return { ok: false, error: `${v.error} Pôvodné priradenie som vrátil, nič sa nezmenilo.` };
        }
        return { ok: false, error: `${v.error}${i ? ` Zapísané už sú diely: ${kusy.slice(0, i).map((x) => x.klient).join(", ")}.` : ""}` };
      }
    }
  } catch (e) {
    await vratPovodne().catch(() => undefined);
    const t = String(e instanceof Error ? e.message : e);
    return {
      ok: false,
      error: /UNIQUE/i.test(t)
        ? "Tento pohyb už má priradenú platbu pre toho istého klienta."
        : `Diely sa nezapísali: ${t.slice(0, 160)}`,
    };
  }
  await audit(DB, {
    action: "platba-rozdelena",
    predmet: `${r.date.slice(0, 10)} · ${Math.round(r.amount_czk)} Kč`,
    neu: kusy.map((d) => `${d.klient}: ${d.suma}`).join(" · "),
    actor: kto,
  });
  // Pri dieloch sa pravidlo neučí, ale zlé sa opraví: naučený platiteľ,
  // ktorý ukazuje na niekoho mimo dielov, by ďalší prevod ponúkol zle.
  try { await opravPravidlo(DB, vzorPlatby(r), kusy.map((d) => d.klient), null, kto); }
  catch (e) { await audit(DB, { action: "platba-pravidlo-chyba", predmet: vzorPlatby(r), neu: textChyby(e), actor: kto }); }
  return { ok: true };
}

/** Ručné spôsoby platby. Fio si svoje riadky značí samo cez fio_id. */
const SPOSOBY = ["hotovost", "prevod", "bitcoin", "ine"];

/** Stav vlastnej evidencie platieb — to isté pre GET aj pre bránu prepnutia peňazí. */
async function stavPlatieb(DB: D1Database) {
  const [vlastne, fio, mapa, nieKlient, mena, pt, horizont, faktury, firmy, idoklad, kontakty, polozky, ceny] = await DB.batch([
    DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at, vopred, created_at FROM platby ORDER BY datum DESC"),
    // Predaj produktu a iný príjem nie sú platby klienta — do frontu nepatria.
    DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE amount_czk > 0 AND COALESCE(category, '') NOT IN ('prijem.produkt', 'prijem.ine') ORDER BY date DESC"),
    DB.prepare("SELECT vzor, klient FROM platba_mapovanie"),
    DB.prepare("SELECT fio_id FROM platba_nie_klient"),
    // Mená klientov: export PTmindera stojí od 19. 10. 2026, preto aj kalendár
    // a balíčky z Kokpitu — inak by sa platba nového klienta nikdy nenavrhla.
    DB.prepare(`SELECT DISTINCT client_name FROM sessions WHERE date >= date('now','-400 days')
      UNION SELECT DISTINCT klient FROM kal_udalosti WHERE klient IS NOT NULL AND zmizla_at IS NULL AND typ IN ('trening','uvodny') AND zaciatok >= date('now','-400 days')
      UNION SELECT DISTINCT klient FROM balicky WHERE zrusene_at IS NULL`),
    DB.prepare("SELECT client_name, date, amount_czk, payment_method FROM payments"),
    DB.prepare("SELECT MAX(substr(date,1,10)) den FROM sessions"),
    // Faktúry a firmy klientov — dva najtvrdšie dôkazy v texte platby.
    // Číslo faktúry chodí ako variabilný symbol; firma je fakturačný
    // údaj KLIENTA, nie cudzia strana (Jerry, 26. 9. 2026).
    DB.prepare("SELECT id, cislo, klient, ks, cena_czk FROM vydane_faktury WHERE storno_at IS NULL"),
    DB.prepare("SELECT klient, firma, ico FROM klient_fakturacia WHERE firma <> '' OR ico <> ''"),
    // Faktúry vystavené v iDoklade. Číslo dokladu stojí v texte prevodu
    // („20260037 MGR. FILIP STRANAVSKY") a je to variabilný symbol —
    // najtvrdší dôkaz, aký v tom texte býva. Meno na faktúre je ale
    // firma, takže sa prekladá cez spárované fakturačné kontakty.
    DB.prepare("SELECT cislo, nazov FROM idoklad_faktury"),
    DB.prepare("SELECT firma, klient FROM fakturacne_kontakty WHERE klient IS NOT NULL AND klient <> ''"),
    // Faktúra za viacerých klientov — podľa položiek sa platba rozdelí.
    DB.prepare("SELECT faktura_id, klient, celkom_czk FROM vydane_faktury_polozky ORDER BY poradie"),
    // Ceny balíčkov — spoločný prevod, keď PTminder už nepíše.
    // + história členstiev z PTmindera: balíčky v Kokpite začínajú
    // až jeseňou 2026, staršie ceny sú len tam.
    DB.prepare(`SELECT klient, platnost_od od, cena_czk cena FROM balicky WHERE zrusene_at IS NULL AND cena_czk > 0
                UNION ALL SELECT klient, od, platba cena FROM ptminder_historia WHERE platba > 0`),
  ]);

  const platby = ((vlastne.results || []) as unknown as PlatbaRiadok[]);
  const mapovanie: Record<string, string> = {};
  for (const m of ((mapa.results || []) as unknown as { vzor: string; klient: string }[])) mapovanie[m.vzor] = m.klient;
  const poExport = String(((horizont.results || [])[0] as { den?: string } | undefined)?.den || dnesPraha());

  /**
   * Odkedy sa porovnáva — a prečo to nie je „odjakživa".
   *
   * Bankové platby sa dajú doplniť spätne z výpisu, HOTOVOSŤ nie:
   * tá je v zošite a nikto ju rok dozadu prepisovať nebude. V starších
   * mesiacoch by teda rozdiel ukazoval chýbajúcu hotovosť, nie chybu —
   * a cieľ „rozdiel nula" by bol nedosiahnuteľný. Súbežný chod preto
   * začína mesiacom, ktorý si Jerry zvolí (`platby_od`); staršie
   * bankové platby v evidencii zostávajú, len sa nesúdia.
   */
  const odMesiaca = String(
    (await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'platby_od'").first<{ value: string }>())?.value || "",
  ).replace(/"/g, "") || dnesPraha().slice(0, 7);

  const ptPlatby = ((pt.results || []) as unknown as { client_name: string; date: string; amount_czk: number; payment_method: string }[])
    .map((p) => ({ klient: p.client_name, datum: p.date, suma: p.amount_czk, metoda: p.payment_method }));
  /**
   * Faktúra z iDokladu → klient. Meno na doklade býva firma
   * („FSH Devices s.r.o."), preto cez spárované kontakty; keď je
   * vystavená priamo na človeka, hľadá sa medzi klientmi.
   */
  const menaKlientov = ((mena.results || []) as unknown as { client_name: string }[]).map((x) => x.client_name);
  // Kontakt môže patriť viacerým klientom („A, B, C“) — rozloží sa na mená
  // a faktúra ich ponúkne na výber (21. 10. 2026, `fakturyZIdokladu`).
  const zIdokladu = fakturyZIdokladu(
    (idoklad.results || []) as unknown as { cislo: string; nazov: string }[],
    (kontakty.results || []) as unknown as { firma: string; klient: string }[],
    menaKlientov,
  );

  const vsetkyNepriradene = nepriradene(
    (fio.results || []) as unknown as FioRiadok[],
    platby.map(naPlatbu),
    mapovanie,
    new Set(((nieKlient.results || []) as unknown as { fio_id: string }[]).map((x) => x.fio_id)),
    menaKlientov,
    ptPlatby,
    [...fakturyKokpitu(
      (faktury.results || []) as unknown as FakturaRiadok[],
      (polozky.results || []) as unknown as PolozkaRiadok[],
    ), ...zIdokladu],
    ((firmy.results || []) as unknown as { klient: string; firma: string; ico: string }[]),
    (ceny.results || []) as unknown as CenaBalicka[],
    (((await DB.prepare("SELECT name, plati_za FROM client_overrides WHERE plati_za IS NOT NULL AND plati_za <> ''").all<{ name: string; plati_za: string }>().catch(() => null))?.results) || [])
      .map((r) => ({ platitel: r.name, za: menaPlatiZa(r.plati_za) })),
  );
  const celkomNepriradenych = vsetkyNepriradene.length;
  const btcNes = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'btc_nesparovane'").first().catch(() => null);

  const porovnanie = porovnajPlatby(
    platby.map(naPlatbu),
    ptPlatby,
    poExport,
    odMesiaca,
  );
  return {
    ok: true as const,
    platby,
    nepriradene: vsetkyNepriradene.slice(0, 120),
    porovnanie,
    /**
     * Peniaze z Kokpitu (`peniazeZKokpitu.ts`): od ktorého mesiaca už
     * platia a či sa smú prepnúť od začiatku súbežného chodu. Brána
     * počíta len príjmy, ktoré vyzerajú na platbu klienta — vrátka
     * z obchodu prepnutiu nebráni.
     */
    peniazeOd: String((await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(PENIAZE_KLUC).first<{ value: string }>().catch(() => null))?.value || "").replace(/"/g, ""),
    prepnutie: { od: odMesiaca, ...mozePrepnut(odMesiaca, porovnanie.mesiace, vsetkyNepriradene.filter((x) => x.klientsky)) },
    /** BTC platby, ktorých klienta import nespoznal — treba ich zapísať ručne. */
    btcNesparovane: (() => {
      try { return JSON.parse(String((btcNes as { value?: string } | null)?.value || "[]")) as { meno: string; datum: string; suma: number }[]; } catch { return []; }
    })(),
    poExport,
    odMesiaca,
    celkomNepriradenych,
  };
}

export const Route = createFileRoute("/api/platby")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });

        /**
         * Platby jedného klienta — pre jeho profil.
         * Celá odpoveď nižšie ťahá aj výpis z banky a porovnanie s PTminderom;
         * na profil to je zbytočná práca, ktorú by človek čakal pri každom
         * kliknutí na meno.
         */
        // Meno sa NEPOROVNÁVA v SQL: „Tomáš Dvořák" a „Tomas Dvorak" sú v D1
        // dva rôzne reťazce a klientovi by jeho vlastná platba zmizla.
        // Tabuľka má stovky riadkov, takže sa vráti celá a triedi sa hore.
        if (new URL(request.url).searchParams.has("klient")) {
          const r = await DB.prepare(
            "SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at, vopred, created_at FROM platby ORDER BY datum DESC",
          ).all();
          return Response.json({ ok: true, platby: r.results || [] });
        }

        return Response.json(await stavPlatieb(DB));
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }
        const akcia = String(b.akcia || "");
        const kto = await currentUser(request) || undefined;

        /** Riadok výpisu → platba klienta. `zapamataj` uloží aj pravidlo. */
        if (akcia === "priradz") {
          const fioId = String(b.fioId || "");
          const klient = String(b.klient || "").trim();
          if (!fioId || !klient) return Response.json({ ok: false, error: "Chýba platba alebo klient." }, { status: 400 });
          const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
            .bind(fioId).first<FioRiadok>();
          if (!r) return Response.json({ ok: false, error: "Riadok výpisu neexistuje." }, { status: 404 });
          let stav: StavZapisu;
          try {
            const v = await zapisPriradenie(DB, {
              klient, datum: r.date.slice(0, 10), suma: r.amount_czk, sposob: sposobZRiadku(r), fioId,
              poznamka: (r.counterparty || "").slice(0, 200), kto, vopred: await jeVopred(DB, klient),
            });
            if (!v.ok) return Response.json(v, { status: 409 });
            stav = v.stav;
          } catch (e) {
            return Response.json({ ok: false, error: `Platba sa nezapísala: ${textChyby(e)}` }, { status: 500 });
          }
          // Pravidlo sa učí LEN vtedy, keď je klient priamo v odosielateľovi.
          // Inak by sa naučilo zo sprostredkovaného prevodu a každý ďalší
          // prevod tej istej osoby by appka ponúkala ako platbu toho klienta.
          // Pravidlo, ktoré ukazovalo na niekoho iného, sa opraví
          // (`opravPravidlo`, 21. 10. 2026).
          const vzor = vzorPlatby(r);
          let naucil = false;
          let chybaPravidla = "";
          try {
            naucil = (await opravPravidlo(DB, vzor, [klient], !!b.zapamataj && smieSaZapamatat(vzor, klient) ? klient : null, kto)).naucil;
          } catch (e) {
            // Platba už je zapísaná — nevracia sa chyba celej akcie, ale
            // povie sa to nahlas a zostane stopa v audite.
            chybaPravidla = `Platba je zapísaná, ale pravidlo platiteľa sa neuložilo: ${textChyby(e)}`;
            await audit(DB, { action: "platba-pravidlo-chyba", predmet: vzor, neu: chybaPravidla, actor: kto });
          }
          await audit(DB, { action: "platba-priradena", predmet: klient, neu: `${r.amount_czk} Kč · ${r.date.slice(0, 10)}${stav === "obnovena" ? " (obnovená zrušená platba)" : ""}`, actor: kto });

          /**
           * BALÍČEK VZNIKÁ Z PENAZÍ, NIE ZO ZÁMERU.
           *
           * Jerry, 2. 10. 2026: „áno, dorob to." SMS s QR je ponuka; keby
           * balíček vznikol pri jej odoslaní, klientovi by sa hneď ukázalo
           * „Zbývá ti 6 h" a QR by zmizlo skôr, než zaplatí — a kto
           * nezaplatí, nechá v appke balíček, ktorý nikdy nebol.
           *
           * Tu je ten správny okamih: peniaze dorazili. Appka len NAVRHNE,
           * čo si klient zrejme kúpil; zapíše sa to až kliknutím.
           */
          // Meno sa NEPOROVNÁVA v SQL (21. 10. 2026): „Tomas Dvorak“ a „Tomáš
          // Dvořák“ sú dva reťazce a návrh balíčka by nenašiel ani jeden.
          // Tabuľka je malá, filtruje sa tu.
          const jehoBalicky = (((await DB.prepare(
            "SELECT klient, nazov, cena_czk, platnost_od, zrusene_at FROM balicky",
          ).all().catch(() => ({ results: [] }))).results || []) as unknown as
            { klient: string; nazov: string; cena_czk: number | null; platnost_od: string; zrusene_at: string | null }[])
            .filter((x) => normName(x.klient) === normName(klient));
          const navrh = balicekZPlatby({ suma: r.amount_czk, den: r.date.slice(0, 10), balicky: jehoBalicky });

          return Response.json({ ok: true, zapamatane: naucil, navrh, stav, ...(chybaPravidla ? { upozornenie: chybaPravidla } : {}) });
        }

        /**
         * DÁVKOVÉ PRIRADENIE.
         *
         * Jerry, 26. 9. 2026: „vieš tie platby na účte automaticky priradiť
         * ku klientovi na základe poznámky v platbe — ale nie tak, že sa
         * priamo zapíšu?" Presne tak to aj je: appka návrh urobí sama
         * (z mena v texte, z naučeného pravidla, zo sumy a dňa), ale zapíše
         * sa až to, čo človek odklikne. Toto je len to odkliknutie naraz —
         * po jednom to bola práca na mesiac.
         *
         * Každý riadok sa spracuje zvlášť a chyba jedného neruší ostatné:
         * jedna platba na neexistujúci riadok výpisu nesmie zhodiť dávku
         * dvadsiatich.
         */
        if (akcia === "priradz-davka") {
          const polozky = (Array.isArray(b.polozky) ? b.polozky : []) as { fioId?: unknown; klient?: unknown; diely?: unknown }[];
          if (!polozky.length) return Response.json({ ok: false, error: "Nič na priradenie." }, { status: 400 });
          if (polozky.length > 100) return Response.json({ ok: false, error: "Naraz najviac sto platieb." }, { status: 400 });

          let hotovo = 0;
          let naucenych = 0;
          const chyby: string[] = [];
          /** Čo sa naozaj zapísalo — do auditu, aj keď dávka skončí s chybami. */
          const zapisane: string[] = [];
          for (const p of polozky) {
            const fioId = String(p.fioId || "");
            const klient = String(p.klient || "").trim();
            let oznacenie = fioId.slice(0, 8) || "?";
            /**
             * CHYBA JEDNÉHO RIADKU NERUŠÍ OSTATNÉ — naozaj (21. 10. 2026).
             * Komentár nad dávkou to sľuboval, ale výnimka z D1 vyletela von:
             * časť platieb sa zapísala, worker vrátil HTML stránku a audit
             * nezostal žiadny. Každý riadok má vlastný try/catch a chyba ide
             * do zoznamu `chyby`.
             */
            try {
              /**
               * SPOLOČNÝ PREVOD V DÁVKE. Diely sa zapíšu každému zvlášť a
               * pravidlo sa neučí — vzor by ukazoval na dvoch ľudí naraz.
               */
              if (fioId && Array.isArray(p.diely) && p.diely.length >= 2) {
                const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
                  .bind(fioId).first<FioRiadok>();
                if (!r) { chyby.push(`${oznacenie}: riadok výpisu neexistuje`); continue; }
                oznacenie = `${r.date.slice(0, 10)} ${Math.round(r.amount_czk)} Kč`;
                const kusy = (p.diely as { klient?: unknown; suma?: unknown }[])
                  .map((d) => ({ klient: String(d.klient || "").trim(), suma: Math.round(Number(d.suma) || 0) }));
                const v = await zapisDiely(DB, r, kusy, kto);
                if (!v.ok) { chyby.push(`${oznacenie}: ${v.error}`); continue; }
                zapisane.push(`${oznacenie} → ${kusy.map((d) => `${d.klient} ${d.suma}`).join(" + ")}`);
                hotovo++;
                continue;
              }
              if (!fioId || !klient) { chyby.push("chýba platba alebo klient"); continue; }
              const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
                .bind(fioId).first<FioRiadok>();
              if (!r) { chyby.push(`${oznacenie}: riadok výpisu neexistuje`); continue; }
              oznacenie = `${r.date.slice(0, 10)} ${Math.round(r.amount_czk)} Kč`;
              const vzor = vzorPlatby(r);
              const v = await zapisPriradenie(DB, {
                klient, datum: r.date.slice(0, 10), suma: r.amount_czk, sposob: sposobZRiadku(r), fioId,
                poznamka: (r.counterparty || "").slice(0, 200), kto, vopred: await jeVopred(DB, klient),
              });
              if (!v.ok) { chyby.push(`${oznacenie}: ${v.error}`); continue; }
              zapisane.push(`${oznacenie} → ${klient}${v.stav === "uz-bola" ? " (už bolo)" : ""}`);
              hotovo++;
              try {
                if ((await opravPravidlo(DB, vzor, [klient], smieSaZapamatat(vzor, klient) ? klient : null, kto)).naucil) naucenych++;
              } catch (e) {
                chyby.push(`${oznacenie}: platba zapísaná, pravidlo platiteľa nie (${textChyby(e)})`);
              }
            } catch (e) {
              chyby.push(`${oznacenie}: ${textChyby(e)}`);
            }
          }
          await audit(DB, {
            action: "platby-davka",
            predmet: `${hotovo} z ${polozky.length}`,
            neu: `naučených pravidiel: ${naucenych}${zapisane.length ? ` · ${zapisane.join(" · ")}` : ""}`,
            ...(chyby.length ? { reason: `${chyby.length} chýb: ${chyby.join(" · ").slice(0, 600)}` } : {}),
            actor: kto,
          });
          return Response.json({ ok: true, hotovo, naucenych, chyby: chyby.slice(0, 10), chybCelkom: chyby.length });
        }

        /**
         * JEDEN PREVOD, VIAC KLIENTOV.
         *
         * Jerry, 28. 9. 2026: „15 580 DK Consulting — to je Dan Kouřil, ale
         * spoločne s Monikou Schonwalderovou, takže to potrebujem rozdeliť."
         * Dvaja klienti si pošlú balíčky jedným prevodom a v banke je to
         * jeden riadok.
         *
         * Zapíše sa toľko platieb, koľko je dielov, a všetky nesú to isté
         * `fio_id` — pohyb tak zmizne zo zoznamu nepriradených a v mesačnom
         * porovnaní s PTminderom sedí súčet.
         *
         * Diely sa musia zložiť na SUMU POHYBU. Tolerancia je koruna kvôli
         * zaokrúhľovaniu; väčší rozdiel je preklep a ten sa nezapíše —
         * rozdelenie, ktoré nesedí, je horšie než nerozdelené.
         *
         * Odosielateľ sa NEUČÍ: vzor by ukazoval na dvoch ľudí naraz a
         * najbližší prevod od tej istej firmy by sa priradil jednému z nich.
         */
        if (akcia === "rozdel") {
          const fioId = String(b.fioId || "");
          const diely = (Array.isArray(b.diely) ? b.diely : []) as { klient?: unknown; suma?: unknown }[];
          if (!fioId || diely.length < 2) {
            return Response.json({ ok: false, error: "Na rozdelenie treba aspoň dvoch klientov." }, { status: 400 });
          }
          const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
            .bind(fioId).first<FioRiadok>();
          if (!r) return Response.json({ ok: false, error: "Riadok výpisu neexistuje." }, { status: 404 });
          const kusy = diely.map((d) => ({ klient: String(d.klient || "").trim(), suma: Math.round(Number(d.suma) || 0) }));
          const v = await zapisDiely(DB, r, kusy, kto);
          if (!v.ok) return Response.json(v, { status: /dávajú|potrebuje|aspoň|dvakrát|zoznam/.test(v.error) ? 400 : /už je|už má/.test(v.error) ? 409 : 500 });
          return Response.json({ ok: true, dielov: kusy.length });
        }

        /**
         * „Toto nie je platba klienta" — nájom, vrátenie, vlastný prevod.
         * Nemaže sa nič z výpisu; len sa prestane pýtať.
         */
        if (akcia === "nieKlient") {
          const fioId = String(b.fioId || "");
          if (!fioId) return Response.json({ ok: false, error: "Chýba platba." }, { status: 400 });
          await DB.prepare("INSERT OR REPLACE INTO platba_nie_klient (fio_id, dovod, oznacene_at) VALUES (?,?,?)")
            .bind(fioId, String(b.dovod || "").slice(0, 200) || null, teraz()).run();
          return Response.json({ ok: true });
        }

        /** Hotovosť zo zošita — jediné miesto, kde sa píše ručne. */
        if (akcia === "hotovost") {
          const klient = String(b.klient || "").trim();
          const datum = denISO(b.datum);
          const suma = Number(b.suma) || 0;
          if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });
          if (!datum) return Response.json({ ok: false, error: "Chýba dátum (RRRR-MM-DD)." }, { status: 400 });
          if (suma <= 0) return Response.json({ ok: false, error: "Suma musí byť kladná." }, { status: 400 });
          const zleMeno = await chybaMena(DB, klient);
          if (zleMeno) return Response.json({ ok: false, error: zleMeno }, { status: 400 });
          const sposob = SPOSOBY.includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          await DB.prepare(
            "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,NULL,?,?,?,?)",
          ).bind(uid(), klient, datum, suma, sposob, String(b.poznamka || "").slice(0, 300) || null, teraz(), kto || null, (await jeVopred(DB, klient)) ? 1 : 0).run();
          await audit(DB, { action: "platba-hotovost", predmet: klient, neu: `${suma} Kč · ${datum}`, actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * Oprava ručnej platby — preklep v sume alebo dátume.
         * Platby z banky sa neupravujú: ich pravdou je výpis, nie Kokpit.
         */
        if (akcia === "uprav") {
          const id = String(b.id || "");
          const datum = denISO(b.datum);
          const suma = Number(b.suma) || 0;
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          if (!datum) return Response.json({ ok: false, error: "Chýba dátum (RRRR-MM-DD)." }, { status: 400 });
          if (suma <= 0) return Response.json({ ok: false, error: "Suma musí byť kladná." }, { status: 400 });
          const stav = await DB.prepare("SELECT fio_id FROM platby WHERE id = ?").bind(id).first<{ fio_id: string | null }>();
          if (!stav) return Response.json({ ok: false, error: "Platba sa nenašla." }, { status: 404 });
          if (stav.fio_id) return Response.json({ ok: false, error: "Platbu z banky upraviť nejde — pravdou je výpis." }, { status: 400 });
          const sposob = SPOSOBY.includes(String(b.sposob)) ? String(b.sposob) : "hotovost";
          await DB.prepare(
            "UPDATE platby SET datum=?, suma_czk=?, sposob=?, poznamka=? WHERE id=?",
          ).bind(datum, suma, sposob, String(b.poznamka || "").slice(0, 300) || null, id).run();
          await audit(DB, { action: "platba-upravena", predmet: id, neu: `${suma} Kč · ${datum}`, actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * RUČNÉ ROZDELENIE JEDNEJ PLATBY MEDZI KLIENTOV.
         *
         * Jerry, 21. 10. 2026: „som schopný to rozdeliť aj v Kokpite?" Pri
         * BANKOVOM pohybe sa to dalo odjakživa (`rozdel` nad nepriradeným
         * riadkom výpisu), ale bitcoinová platba žiadny riadok výpisu nemá —
         * príde z BTC knihy pod kľúčom `btc:…`. A `uprav` ju odmieta, lebo
         * má `fio_id`. Jediná cesta zostávala zrušiť ju a nahodiť dve ručne.
         *
         * Automatické rozdelenie (`plati_za`) zaberie len vtedy, keď súčet
         * očakávaných sedí; toto je to, čo robí človek, keď nesedí.
         *
         * NEMENÍ, KOĽKO PEŇAZÍ PRIŠLO. Pôvodný riadok si nechá diel platiteľa
         * (keď v dieloch je) alebo sa zruší; ostatné diely pribudnú s TÝM
         * ISTÝM `fio_id`, takže sa nič nezdvojí a v knihe zostáva jedna
         * platba rozpísaná na ľudí.
         */
        if (akcia === "rozdel-platbu") {
          const id = String(b.id || "");
          const diely = (Array.isArray(b.diely) ? b.diely : []) as { klient?: unknown; suma?: unknown }[];
          const kusy = diely.map((d) => ({ klient: String(d.klient || "").trim(), suma: Math.round(Number(d.suma) || 0) }));
          if (!id) return Response.json({ ok: false, error: "Chýba platba." }, { status: 400 });
          const p = await DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at FROM platby WHERE id = ?1")
            .bind(id).first<{ id: string; klient: string; datum: string; suma_czk: number; sposob: string; fio_id: string | null; poznamka: string | null; zrusene_at: string | null }>();
          if (!p) return Response.json({ ok: false, error: "Platba sa nenašla." }, { status: 404 });
          if (p.zrusene_at) return Response.json({ ok: false, error: "Táto platba je zrušená — rozdeliť sa dá len živá." }, { status: 400 });
          const zle = chybaDielov(Number(p.suma_czk) || 0, kusy);
          if (zle) return Response.json({ ok: false, error: zle }, { status: 400 });
          for (const d of kusy) {
            const zlePole = await chybaMena(DB, d.klient);
            if (zlePole) return Response.json({ ok: false, error: zlePole }, { status: 400 });
          }
          // Iná ŽIVÁ platba na tom istom kľúči by sa s dielom zrazila na
          // unikáte (fio_id, klient) — a zrazený zápis vracia HTML stránku,
          // nie vetu (migrácia 0082). Povie sa to vopred a menom.
          if (p.fio_id) {
            const zive = (((await DB.prepare("SELECT klient FROM platby WHERE fio_id = ?1 AND id <> ?2 AND zrusene_at IS NULL")
              .bind(p.fio_id, p.id).all<{ klient: string }>().catch(() => null))?.results) || []);
            const zrazka = zive.find((x) => kusy.some((d) => normName(d.klient) === normName(x.klient)));
            if (zrazka) {
              return Response.json({ ok: false, error: `${zrazka.klient} už na tejto platbe diel má. Najprv ho zruš, potom rozdeľ znova.` }, { status: 409 });
            }
          }
          const mojDiel = kusy.find((d) => normName(d.klient) === normName(p.klient));
          const poznamka = `${String(p.poznamka || "").slice(0, 240)}${String(p.poznamka || "").includes("rozdelené") ? "" : " · rozdelené"}`.trim();
          const prikazy = [
            mojDiel
              ? DB.prepare("UPDATE platby SET suma_czk = ?2, poznamka = ?3 WHERE id = ?1").bind(p.id, mojDiel.suma, poznamka)
              : DB.prepare("UPDATE platby SET zrusene_at = ?2 WHERE id = ?1").bind(p.id, teraz()),
          ];
          const ostatni = kusy.filter((d) => d !== mojDiel);
          const vopred = await Promise.all(ostatni.map((d) => jeVopred(DB, d.klient)));
          ostatni.forEach((d, i) => {
            prikazy.push(DB.prepare(
              "INSERT INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,?,?,?,?,?,?)",
            ).bind(uid(), d.klient, String(p.datum).slice(0, 10), d.suma, p.sposob, p.fio_id, poznamka, teraz(), kto || null, vopred[i] ? 1 : 0));
          });
          try {
            await DB.batch(prikazy);
          } catch (e) {
            return Response.json({ ok: false, error: `Rozdelenie neprebehlo, nezmenilo sa nič: ${String(e).slice(0, 200)}` }, { status: 500 });
          }
          await audit(DB, {
            action: "platba-rozdelena", predmet: `${p.klient} · ${Math.round(Number(p.suma_czk) || 0)} Kč`,
            neu: kusy.map((d) => `${d.klient} ${d.suma}`).join(" · "), actor: kto,
          });
          return Response.json({ ok: true, dielov: kusy.length });
        }

        /**
         * PLATBA PATRÍ INÉMU KLIENTOVI (Jerry, 23. 10. 2026: „ako môžeme
         * upraviť chybu s platbou, ak ju omylom priradíme zlému človeku?").
         * Terezka dala Ivinu platbu z 21. 10. („IVA STOKLÁSKOVÁ“) Lenke
         * Divinovej. Dovtedy sa to dalo opraviť len okľukou: zrušiť platbu
         * a hľadať pohyb znova medzi nepriradenými, alebo „rozdeliť“ ju na
         * jeden diel — a pravidlo platiteľa, ktoré zlé priradenie zmazalo,
         * ostalo zmazané.
         *
         * Stará platba sa ZRUŠÍ (záznam v knihe ostáva), novému klientovi sa
         * zapíše tým istým zápisom ako pri priradení, s tým istým `fio_id`.
         * Pravidlo platiteľa sa opraví rovnako ako pri priradení.
         */
        if (akcia === "prerad") {
          const id = String(b.id || "");
          const klient = String(b.klient || "").trim();
          if (!id || !klient) return Response.json({ ok: false, error: "Chýba platba alebo klient." }, { status: 400 });
          const p = await DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, poznamka, zrusene_at FROM platby WHERE id = ?1")
            .bind(id).first<{ id: string; klient: string; datum: string; suma_czk: number; sposob: string; fio_id: string | null; poznamka: string | null; zrusene_at: string | null }>();
          if (!p) return Response.json({ ok: false, error: "Platba sa nenašla." }, { status: 404 });
          if (p.zrusene_at) return Response.json({ ok: false, error: "Táto platba je zrušená — presunúť sa dá len živá." }, { status: 400 });
          if (normName(p.klient) === normName(klient)) return Response.json({ ok: false, error: `Platba už patrí klientovi ${p.klient}.` }, { status: 400 });
          const zlyMeno = await chybaMena(DB, klient);
          if (zlyMeno) return Response.json({ ok: false, error: zlyMeno }, { status: 400 });
          const vopred = await jeVopred(DB, klient);
          if (!p.fio_id) {
            await DB.prepare("UPDATE platby SET klient = ?2, vopred = ?3 WHERE id = ?1").bind(p.id, klient, vopred ? 1 : 0).run();
          } else {
            // Iné živé diely toho istého pohybu (rozdelený prevod) ostávajú;
            // presúva sa len tento diel, súčet pohybu sa nemení.
            const ine = (((await DB.prepare("SELECT klient FROM platby WHERE fio_id = ?1 AND id <> ?2 AND zrusene_at IS NULL")
              .bind(p.fio_id, p.id).all<{ klient: string }>()).results) || []);
            if (ine.some((x) => normName(x.klient) === normName(klient))) {
              return Response.json({ ok: false, error: `${klient} už na tejto platbe diel má. Ak má mať celú, rozdeľ ju znova.` }, { status: 409 });
            }
            await DB.prepare("UPDATE platby SET zrusene_at = ?2 WHERE id = ?1").bind(p.id, teraz()).run();
            let v: VysledokZapisu;
            try {
              v = await zapisPriradenie(DB, {
                klient, datum: String(p.datum).slice(0, 10), suma: Number(p.suma_czk) || 0, sposob: p.sposob, fioId: p.fio_id,
                poznamka: String(p.poznamka || "").slice(0, 300), kto, vopred,
              }, ine.length > 0);
            } catch (e) {
              v = { ok: false, error: `Platba sa nezapísala: ${textChyby(e)}` };
            }
            if (!v.ok) {
              // Nič nesmie ostať napoly: stará platba sa vráti.
              await DB.prepare("UPDATE platby SET zrusene_at = NULL WHERE id = ?1").bind(p.id).run();
              return Response.json(v, { status: 409 });
            }
            const r = await DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ FROM fio_transactions WHERE id = ?")
              .bind(p.fio_id).first<FioRiadok>().catch(() => null);
            if (r) {
              try {
                const vzor = vzorPlatby(r);
                await opravPravidlo(DB, vzor, [klient], smieSaZapamatat(vzor, klient) ? klient : null, kto);
              } catch (e) {
                await audit(DB, { action: "platba-pravidlo-chyba", predmet: p.fio_id, neu: textChyby(e), actor: kto });
              }
            }
          }
          await audit(DB, { action: "platba-preradena", predmet: `${p.klient} → ${klient}`, old: p.klient, neu: `${Math.round(Number(p.suma_czk) || 0)} Kč · ${String(p.datum).slice(0, 10)}`, actor: kto });
          return Response.json({ ok: true });
        }

        /** Zrušenie NEMAŽE — platba je záznam v knihe, nie riadok v tabuľke. */
        if (akcia === "zrus" || akcia === "vrat") {
          const id = String(b.id || "");
          if (!id) return Response.json({ ok: false, error: "Chýba id." }, { status: 400 });
          /**
           * Vrátenie zrušenej bankovej platby nesmie prerásť pohyb (21. 10.
           * 2026) — rovnaká stráž ako pri priradení: keď pohyb medzitým
           * dostal iného klienta, oživená platba by ten istý prevod
           * započítala dvakrát.
           */
          if (akcia === "vrat") {
            const p = await DB.prepare("SELECT fio_id, suma_czk, zrusene_at FROM platby WHERE id = ?1").bind(id)
              .first<{ fio_id: string | null; suma_czk: number; zrusene_at: string | null }>();
            if (p?.fio_id && p.zrusene_at) {
              const [pohyb, zive] = await DB.batch([
                DB.prepare("SELECT amount_czk FROM fio_transactions WHERE id = ?1").bind(p.fio_id),
                DB.prepare("SELECT klient, suma_czk FROM platby WHERE fio_id = ?1 AND zrusene_at IS NULL").bind(p.fio_id),
              ]);
              const suma = Math.round(Number(((pohyb.results || [])[0] as { amount_czk?: number } | undefined)?.amount_czk) || 0);
              const ini = (zive.results || []) as unknown as { klient: string; suma_czk: number }[];
              const spolu = ini.reduce((n, x) => n + Math.round(Number(x.suma_czk) || 0), 0) + Math.round(Number(p.suma_czk) || 0);
              if (ini.length && suma && spolu > suma + 1) {
                return Response.json({
                  ok: false,
                  error: `Tento pohyb už je priradený ${zoznamMien(ini.map((x) => x.klient))}; s vrátenou platbou by to bolo ${spolu} Kč z ${suma} Kč.`,
                }, { status: 409 });
              }
            }
          }
          await DB.prepare("UPDATE platby SET zrusene_at = ? WHERE id = ?").bind(akcia === "zrus" ? teraz() : null, id).run();
          await audit(DB, { action: akcia === "zrus" ? "platba-zrusena" : "platba-vratena", predmet: id, actor: kto });
          return Response.json({ ok: true });
        }

        /**
         * BITCOIN Z BTC KNIHY → VLASTNÁ EVIDENCIA (`btcNaPlatby`).
         *
         * Knihu sťahuje PREHLIADAČ (worker → worker padá na 522, viď
         * btc-reserve.ts) a posiela ju sem. Zapisuje sa od mesiaca, od
         * ktorého sa súbežný chod súdi (`platby_od`) — staršie mesiace sa
         * neporovnávajú a do dlhov by zasiahli bez dôvodu. Opakované
         * načítanie nič nezdvojí: `fio_id` je kľúč zápisu v knihe a
         * dvojica (fio_id, klient) je v DB unikátna.
         */
        if (akcia === "btc-import") {
          const kniha = Array.isArray(b.platby) ? (b.platby as { klient: string | null; datum: string; czk: number | null; sats?: number }[]).slice(0, 2000) : [];
          const od = String((await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'platby_od'").first<{ value: string }>().catch(() => null))?.value || "").replace(/"/g, "") || dnesPraha().slice(0, 7);
          const [s1, s2] = await DB.batch([
            DB.prepare(`SELECT DISTINCT client_name m FROM sessions WHERE date >= date('now','-400 days')
              UNION SELECT DISTINCT klient FROM kal_udalosti WHERE klient IS NOT NULL AND zmizla_at IS NULL AND typ IN ('trening','uvodny') AND zaciatok >= date('now','-400 days')`),
            DB.prepare("SELECT DISTINCT klient m FROM balicky WHERE zrusene_at IS NULL"),
          ]);
          const mena = [...new Set([...(s1.results || []), ...(s2.results || [])].map((x) => String((x as { m: string }).m || "")).filter(Boolean))];
          const { zapisat, nesparovane } = btcNaPlatby(kniha, (m) => najdiKlienta(mena, m) || null, `${od}-01`);
          /**
           * JEDEN PLATÍ ZA VIACERÝCH (Jerry, 21. 10. 2026: Jakub Kaňovský
           * platí aj za Annu Kadličkovú). V knihe stojí jedno meno a jedna
           * suma — zapísať ju celú platiteľovi by znamenalo, že jemu platba
           * prebýva a druhému chýba. Delí sa podľa toho, koľko kto dlží, a
           * len keď sa suma od ich súčtu nelíši o viac než desatinu (kurz).
           */
          const dvojice = new Map<string, string[]>();
          for (const r of ((await DB.prepare("SELECT name, plati_za FROM client_overrides WHERE plati_za IS NOT NULL AND plati_za <> ''").all<{ name: string; plati_za: string }>().catch(() => null))?.results) || []) {
            const za = menaPlatiZa(r.plati_za).map((m) => najdiKlienta(mena, m) || m);
            if (za.length) dvojice.set(normName(r.name), za);
          }
          let nove = 0;
          let rozdelenych = 0;
          for (const z of zapisat) {
            const za = dvojice.get(normName(z.klient)) || [];
            let diely: { klient: string; suma: number }[] = [{ klient: z.klient, suma: z.suma }];
            if (za.length) {
              const dlhy = await dlhyMien(DB, [z.klient, ...za]);
              /**
               * Pri PLATITEĽOVI sa počíta aj ponuka nového balíčka — jeho
               * stránka ju pýta vtedy, keď dočerpal a nový mu ešte nevznikol
               * (vzniká až prvým tréningom). Bez toho by sa dvojica rozpadla
               * presne v ten deň. Pri ostatných sa nič nedomýšľa: kto
               * nedlží, v rozdelení nie je.
               */
              let ocakavaneOdNeho = dlhy.get(normName(z.klient)) || 0;
              if (!ocakavaneOdNeho) {
                const b = await DB.prepare(
                  "SELECT cena_czk c FROM balicky WHERE klient = ?1 AND zrusene_at IS NULL AND cena_czk > 0 ORDER BY platnost_od DESC LIMIT 1",
                ).bind(z.klient).first<{ c: number }>().catch(() => null);
                ocakavaneOdNeho = Math.round(Number(b?.c) || 0);
              }
              const r = rozdelPodlaDlhov(z.suma, [
                { klient: z.klient, dlzi: ocakavaneOdNeho },
                ...za.map((m) => ({ klient: m, dlzi: dlhy.get(normName(m)) || 0 })),
              ]);
              if (r) { diely = r; rozdelenych += 1; }
            }
            for (const d of diely) {
              const popis = `z BTC knihy${z.sats ? ` · ${z.sats.toLocaleString("sk-SK")} sats` : ""}${diely.length > 1 ? ` · spoločná platba (${z.klient})` : ""}`;
              const r = await DB.prepare(
                "INSERT OR IGNORE INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,'bitcoin',?,?,?,?,?)",
              ).bind(uid(), d.klient, z.datum, d.suma, z.kluc, popis, teraz(), "btc-kniha", (await jeVopred(DB, d.klient)) ? 1 : 0).run();
              nove += r.meta?.changes || 0;
            }
          }
          if (nove) await audit(DB, { action: "platby-btc-import", predmet: `${nove} z BTC knihy${rozdelenych ? ` · ${rozdelenych} rozdelená` : ""}`, neu: zapisat.map((z) => `${z.klient} ${z.datum} ${z.suma}`).join(" · ").slice(0, 300), actor: kto });
          // Nespoznané mená sa ODLOŽIA — inak by ticho chýbali v tržbách a
          // nikto by sa to nedozvedel. Karta Platieb ich ukáže (GET).
          await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES ('btc_nesparovane',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(JSON.stringify(nesparovane.slice(0, 50))).run();
          return Response.json({ ok: true, nove, nesparovane });
        }

        /**
         * PENIAZE Z KOKPITU OD MESIACA — alebo späť na PTminder (prázdny mesiac).
         *
         * Prepnúť sa dá len od mesiaca, od ktorého sa súbežný chod súdi, a len
         * keď brána (`mozePrepnut`) pustí: rozhoduje server, nie tlačidlo —
         * obrazovka mohla byť načítaná pred hodinou. Späť sa dá vždy.
         */
        if (akcia === "peniaze-od") {
          const m = String(b.mesiac || "").slice(0, 7);
          if (!m) {
            await DB.prepare("DELETE FROM vzas_settings WHERE key = ?1").bind(PENIAZE_KLUC).run();
            await audit(DB, { action: "peniaze-z-ptmindera", predmet: "", actor: kto });
            return Response.json({ ok: true });
          }
          const stav = await stavPlatieb(DB);
          if (m !== stav.prepnutie.od) return Response.json({ ok: false, error: `Prepnúť sa dá od ${stav.prepnutie.od} — od toho mesiaca sa súbežný chod porovnáva.` }, { status: 400 });
          if (!stav.prepnutie.ok) return Response.json({ ok: false, error: `Ešte nesedí: ${stav.prepnutie.dovody.join(" · ")}` }, { status: 409 });
          await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(PENIAZE_KLUC, JSON.stringify(m)).run();
          await audit(DB, { action: "peniaze-z-kokpitu", predmet: m, actor: kto });
          return Response.json({ ok: true });
        }

        /** Odkedy sa súbežný chod súdi. Staršie mesiace zostávajú v evidencii. */
        if (akcia === "odMesiaca") {
          const m = String(b.mesiac || "").slice(0, 7);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return Response.json({ ok: false, error: "Mesiac musí byť RRRR-MM." }, { status: 400 });
          await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES ('platby_od',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(JSON.stringify(m)).run();
          await audit(DB, { action: "platby-od", predmet: m, actor: kto });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "neznáma akcia" }, { status: 400 });
      },
    },
  },
});
