// Server-only D1 access for the PSB Tracker. All reads/writes hit env.DB.
import { zjednotOverrides } from "./zjednotOverrides";
import type { D1Database } from "@cloudflare/workers-types";

import { poplatkyPoOdrataniPlatieb } from "./platbyEvidencia";
import { audit, jeZamknuty, zamknuteMesiace } from "./audit.server";
import { nahradenieObdobia, type RiadokVKokpite } from "./nahradenieObdobia";
import { doplnHodinySpolu, KOKPIT_OD, sedeniaZKalendara, spojDochadzku, type UdalostKalendara } from "./sedeniaZKalendara";
import { hodinZNazvuBalicka } from "./klientOsCasu";
import { normName } from "./format";
import { parseAnamneza, parseCennik, parseGa4, parseGsc, parseKanaly, parseMetricool, parsePoplatky } from "./parse";
import {
  detectCSVType,
  parsePackages,
  parsePayments,
  parseServices,
  parseSessions,
  paymentKey,
  jeIkonaMiestoCisla,
  parseClientList,
  parseIdoklad,
  serviceKey,
  sessionKey,
} from "./parse";
import type { ClientOverride, PSBData, SessionRow } from "./types";
import { EMPTY_DATA } from "./types";
import { oblastiZJson } from "./pocitovka";

const uid = () => crypto.randomUUID();

export async function loadData(DB: D1Database): Promise<PSBData> {
  const [sessions, services, payments, packages, overrides, acks, log, leads, zavery, vedomosti, poplatky, zdarma, vlastnePlatby, doplneniaH, kalOd, balickyK, merania] = await Promise.all([
    DB.prepare("SELECT * FROM sessions").all(),
    DB.prepare("SELECT * FROM services").all(),
    DB.prepare("SELECT * FROM payments").all(),
    DB.prepare("SELECT * FROM packages").all(),
    DB.prepare("SELECT * FROM client_overrides").all(),
    DB.prepare("SELECT * FROM anomaly_ack").all(),
    DB.prepare("SELECT * FROM upload_log ORDER BY date DESC LIMIT 40").all(),
    DB.prepare("SELECT * FROM leads ORDER BY date DESC").all().catch(() => ({ results: [] })),
    // Otvorené závery z debát — do registra sa dostanú tie, ktorým prešiel
    // termín overenia. Bez toho by rozhodnutie žilo len v Jarvisovom prompte
    // a nikto by sa k nemu nevrátil, kým sa naň sám nespýta.
    DB.prepare("SELECT id, datum, tema, zaver, overit, overit_do, stav FROM jarvis_zavery WHERE stav = 'otvoreny'")
      .all().catch(() => ({ results: [] })),
    // Text sa zámerne NEČÍTA — rešerš má 8 000 znakov a do kontextu každej
    // správy nepatrí. Jarvis dostane prehľad a text si vytiahne SQL dopytom,
    // keď ho naozaj potrebuje.
    DB.prepare(
      "SELECT id, nazov, o_com, zdroj, obnovovat_po_dnoch, overene_at, LENGTH(text) AS znakov FROM jarvis_vedomosti",
    ).all().catch(() => ({ results: [] })),
    // Nezaplatené poplatky z PTminderu. Tabuľka je zrkadlo exportu: čo v nej
    // je, to je otvorené (viď migráciu 0063).
    DB.prepare("SELECT id, datum, client_name, popis, suma_czk FROM poplatky ORDER BY datum DESC")
      .all().catch(() => ({ results: [] })),
    // Tréningy, ktoré sa z členstva neodpočítavajú — viď migráciu 0081.
    DB.prepare("SELECT id, client_name, den, dovod, kto FROM treningy_zdarma ORDER BY den DESC")
      .all().catch(() => ({ results: [] })),
    // Vlastná evidencia platieb — potrebná na to, aby sa z otvorených
    // poplatkov odrátali tie, ktoré už niekto zaplatil (viď nižšie).
    DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, zrusene_at FROM platby")
      .all().catch(() => ({ results: [] })),
    // Koľko hodín pridalo „Doplnenie členstva" — viď migráciu 0085.
    DB.prepare("SELECT klient, den, hodiny FROM doplnenia_hodiny").all().catch(() => ({ results: [] })),
    // Dochádzka z kalendára od KOKPIT_OD (viď sedeniaZKalendara.ts). Zmiznutá
    // udalosť sa berie len vtedy, keď o nej Jerry povedal „bol tam".
    DB.prepare(
      `SELECT u.klient, u.trener, u.zaciatok, u.koniec, u.nazov, u.typ
         FROM kal_udalosti u
         LEFT JOIN kal_konanie k ON k.uid = u.uid AND k.trener = u.trener
        WHERE u.klient IS NOT NULL AND u.typ IN ('trening','uvodny')
          AND (u.zmizla_at IS NULL OR k.konal = 1)
          AND u.zaciatok >= ?1`,
    ).bind(KOKPIT_OD).all().catch(() => ({ results: [] })),
    // Balíčky v Kokpite — z nich cena tréningu z kalendára.
    DB.prepare("SELECT klient, nazov, zdroj, platnost_od, platnost_do, hodiny, cena_czk, zrusene_at, poznamka FROM balicky")
      .all().catch(() => ({ results: [] })),
    /**
     * Pocitovka — tri otázky 1–10, ktoré si klepne klient sám na svojej
     * verejnej stránke. Ide to cez `loadData`, lebo to isté číslo číta
     * profil klienta aj Jarvisov kontext; dve cesty k jednému číslu sa
     * skôr či neskôr rozídu.
     */
    DB.prepare("SELECT klient, datum, oblasti_json, posun, poznamka, zdroj FROM klient_merania ORDER BY datum")
      .all().catch(() => ({ results: [] })),
  ]);

  const sessionsPtminder: SessionRow[] = (sessions.results as any[]).map((r) => ({
    date: r.date,
    time: r.time,
    client: r.client_name,
    sessionTrainer: r.session_trainer,
    sessionName: r.session_name,
    sessionType: r.session_type,
    duration: r.duration_min,
    price: r.price_czk,
  }));
  const data: PSBData = {
    ...EMPTY_DATA,
    clientOverrides: {},
    anomalyAck: {},
    // Zatiaľ PTminder celý; od KOKPIT_OD ho na konci nahradí kalendár.
    sessions: sessionsPtminder,
    services: (services.results as any[]).map((r) => ({
      date: r.date,
      client: r.client_name,
      serviceType: r.service_type,
      description: r.service_description,
      price: r.price_czk,
      is6m: !!r.is_6m,
      trainer: r.trainer,
    })),
    payments: (payments.results as any[]).map((r) => ({
      date: r.date,
      client: r.client_name,
      amount: r.amount_czk,
      method: r.payment_method,
      note: r.note || "",
    })),
    packages: (packages.results as any[]).map((r) => ({
      client: r.client_name,
      status: r.client_status,
      package: r.package_name,
      remaining: r.sessions_remaining,
      total: r.sessions_total,
      added: r.added || "",
      validFrom: r.valid_from || "",
      validTo: r.valid_to || "",
      payment: r.payment_czk ?? undefined,
      kind: r.kind || "",
      naObdobie: Number(r.na_obdobie) || 0,
    })),
    vedomosti: (vedomosti.results as any[]).map((r) => ({
      id: r.id, nazov: r.nazov, oCom: r.o_com || "", zdroj: r.zdroj || "",
      obnovovatPoDnoch: Number(r.obnovovat_po_dnoch) || 0,
      overeneAt: r.overene_at || "", znakov: Number(r.znakov) || 0,
    })),
    zavery: (zavery.results as any[]).map((r) => ({
      id: r.id, datum: r.datum, tema: r.tema, zaver: r.zaver,
      overit: r.overit, overitDo: r.overit_do, stav: r.stav,
    })),
    /**
     * OTVORENÉ POPLATKY MÍNUS TO, ČO UŽ VIDÍ KOKPIT.
     *
     * Jerry, 28. 9. 2026: „Kalva má platbu 27. 9., to isté aj Kouřil."
     * `poplatky` je zrkadlo PTmindera a platilo, že čo v ňom je, je otvorené.
     * Počas súbežného chodu je ale Kokpit napred: peniaze vidí vo výpise
     * z banky hneď, kým v PTminderi ich Jerry zapíše neskôr alebo vôbec.
     * Zo štrnástich poplatkov tak štyri viseli zaplatené.
     *
     * Odratáva sa TU, nie v komponente — na „nezaplatené" sa pozerá karta na
     * Dnes, Prehľad peňazí aj Jarvis, a tri kópie toho istého pravidla by sa
     * rozišli.
     */
    poplatky: poplatkyPoOdrataniPlatieb(
      (poplatky.results as any[]).map((r) => ({
        id: r.id, datum: r.datum, klient: r.client_name, popis: r.popis || "", suma: Number(r.suma_czk) || 0,
      })),
      (vlastnePlatby.results as any[]).map((r) => ({
        id: r.id, klient: r.klient, datum: r.datum, sumaCzk: Number(r.suma_czk) || 0,
        sposob: r.sposob, fioId: r.fio_id, zruseneAt: r.zrusene_at,
      })),
    ).otvorene,
    /**
     * Odpovede na „koľko hodín pridalo doplnenie" — kľúč `klient|deň`.
     *
     * Ide to cez `loadData`, lebo os času klienta stavia päť obrazoviek
     * a každá by si to inak musela doťahovať sama. Jedno miesto, jeden
     * zdroj (viď „nové pole = celá reťaz" v CLAUDE.md).
     */
    doplneniaHodiny: Object.fromEntries(
      (doplneniaH.results as any[]).map((r) => [`${r.klient}|${String(r.den).slice(0, 10)}`, Number(r.hodiny) || 0]),
    ),
    treningyZdarma: (zdarma.results as any[]).map((r) => ({
      id: r.id, klient: r.client_name, den: String(r.den).slice(0, 10), dovod: r.dovod || "", kto: r.kto || "",
    })),
    merania: (merania.results as any[]).map((r) => ({
      klient: String(r.klient), datum: String(r.datum).slice(0, 10),
      oblasti: oblastiZJson(r.oblasti_json),
      posun: r.posun == null ? null : Number(r.posun),
      poznamka: String(r.poznamka || ""),
      zdroj: String(r.zdroj || "trener"),
    })),
    /**
     * V `leads` sú LEN dopyty na úvodný tréning.
     *
     * Jerry, 24. 9. 2026: „keď má lead magnet, to nie je úplne dopyt."
     * Mal pravdu a je to dôležitejšie, než to znie: stiahnutý protokol
     * a veta „trpím na hexenšus" sú dve rôzne veci a v jednom počte skazia
     * cenu za dopyt, konverziu aj lievik. Delí sa to TU, na jednom mieste —
     * inak by sa musel doplniť filter do pätnástich výpočtov a na šestnásty
     * by sa zabudlo. Magnety sa nestrácajú, sú vedľa v `magnety`.
     */
    leads: (leads.results as any[]).filter((r) => (r.druh || "dopyt") !== "magnet").map((r) => ({
      id: r.id,
      date: r.date,
      name: r.name || "",
      source: r.source,
      referrer: r.referrer || "",
      status: r.status,
      note: r.note || "",
      email: r.email || "",
      telefon: r.telefon || "",
      kampan: r.kampan || "",
      utm: r.utm || "",
      stranka: r.stranka || "",
      odpovedaneAt: r.odpovedane_at || "",
      dovod: r.dovod || "",
      druh: r.druh || "dopyt",
      createdAt: r.created_at || "",
    })),
    magnety: (leads.results as any[]).filter((r) => (r.druh || "dopyt") === "magnet").map((r) => ({
      id: r.id, date: r.date, name: r.name || "", email: r.email || "",
      stranka: r.stranka || "", kampan: r.kampan || "", source: r.source,
    })),
    uploadLog: (log.results as any[]).map((r) => ({
      date: r.date,
      filename: r.filename,
      type: r.type,
      added: r.added,
      skipped: r.skipped,
    })),
  };

  const overrideRiadky: { meno: string; ov: any }[] = [];
  for (const r of overrides.results as any[]) {
    overrideRiadky.push({ meno: r.name, ov: {
      status: r.status,
      specialRate: !!r.special_rate,
      specialRateNote: r.special_rate_note || "",
      trainerNote: r.trainer_note || "",
      contractSigned: !!r.contract_signed,
      primaryTrainer: r.primary_trainer,
      bitcoin: !!r.bitcoin,
      duch: String(r.duch || ""),
      zdroj: String(r.zdroj || ""),
      zdrojKto: String(r.zdroj_kto || ""),
      narodeniny: String(r.narodeniny || ""),
      prvyKontakt: String(r.prvy_kontakt || ""),
      v6m: String(r.v6m || ""),
      precoNeprisiel: String(r.preco_neprisiel || ""),
      balicekZostatok: r.balicek_zostatok == null ? null : Number(r.balicek_zostatok),
      balicekKDatumu: String(r.balicek_k_datumu || ""),
      // Kedy sa override naposledy zapísal. Bez toho sa nedá povedať, či
      // ručná „Pauza" ešte platí — a 23. 9. 2026 ju malo trinásť klientov,
      // ktorí odvtedy trénovali. Ručný zápis je snímka, ktorá nevyprší;
      // aspoň nech je vidieť, kedy vznikla.
      updatedAt: String(r.updated_at || ""),
    } });
  }
  // Prekľúčovanie na meno z exportu. Bez neho má človek napísaný na dva
  // spôsoby dva profily a svoj zápis nevidí ani v jednom z nich.
  data.clientOverrides = zjednotOverrides(overrideRiadky, data.sessions.map((s) => s.client));

  for (const r of acks.results as any[]) {
    data.anomalyAck[r.anomaly_key] = { note: r.note || "", ackedAt: r.acked_at, actor: r.actor || "" };
  }
  /**
   * DOCHÁDZKA: PRED KOKPIT_OD PTMINDER, OD NEHO KALENDÁR.
   *
   * Jedno miesto pre celú appku — zostatky, karty, dlh, mail, tržby podľa
   * trénera aj Jarvis čítajú `data.sessions`. Tréningy z PTmindera za obdobie
   * od KOKPIT_OD sú v `sessionsPtminder` a slúžia len na kontrolu.
   */
  {
    const terazPraha = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Prague" }).replace(" ", "T").slice(0, 16);
    const balicky = doplnHodinySpolu(
      (balickyK.results as any[]).map((r) => ({
        klient: r.klient, nazov: r.nazov, zdroj: r.zdroj, platnost_od: String(r.platnost_od || ""),
        platnost_do: r.platnost_do || null, hodiny: r.hodiny ?? null, cena_czk: r.cena_czk ?? null, zrusene_at: r.zrusene_at || null,
      })),
      data.packages.map((p) => ({ client: p.client, package: p.package, total: p.total, naObdobie: p.naObdobie })),
      hodinZNazvuBalicka,
    );
    const zKalendara = sedeniaZKalendara((kalOd.results as any[]) as UdalostKalendara[], balicky, terazPraha);
    /**
     * Úvodné, ktoré ešte len budú. Ten istý zoznam udalostí, z ktorého sa
     * rátajú sedenia — len opačný koniec: `sedeniaZKalendara` budúce
     * preskakuje (tréning sa ešte nekonal), a práve tie tu treba.
     */
    data.objednaneUvodne = ((kalOd.results as any[]) as UdalostKalendara[])
      .filter((u) => u.typ === "uvodny" && !!u.klient && String(u.zaciatok || "").slice(0, 16) > terazPraha)
      .map((u) => ({ klient: String(u.klient), den: String(u.zaciatok || "").slice(0, 10), trener: String(u.trener || "") }));
    const { sessions: spojene, kontrola } = spojDochadzku(sessionsPtminder, zKalendara);
    data.sessions = spojene;
    data.sessionsPtminder = kontrola;
    // Balíčky v Kokpite pre zostatok na karte. Kotva = zostatok prevzatý
    // z PTmindera k dňu naliatia (poznámka to hovorí doslova).
    data.balickyKokpit = (balickyK.results as any[]).map((r) => ({
      klient: r.klient, nazov: r.nazov, hodiny: r.hodiny ?? null,
      platnostOd: String(r.platnost_od || "").slice(0, 10), platnostDo: r.platnost_do ? String(r.platnost_do).slice(0, 10) : null,
      zruseneAt: r.zrusene_at || null,
      kotva: /^zostatok prevzatý/i.test(String(r.poznamka || "")),
    }));
  }

  return data;
}

export type IngestResult = {
  filename: string; type: string | null; added: number; skipped: number; error?: string;
  /** Koľko riadkov import odmietol, lebo patria do uzavretého mesiaca. */
  zamknute?: number;
  /**
   * Koľko riadkov prišlo bez zostatku, lebo PTminder namiesto čísla
   * vyexportoval ikonu. Viď `jeIkonaMiestoCisla`.
   */
  bezZostatku?: number;
  /**
   * Dvojice, kde appka a zdroj hovoria iné — import ich nechal tak.
   * Pracovný mail z faktúry a súkromný z PTmindera sú obe správne; appka
   * nemá rozhodovať, ktorý platí.
   */
  rozdiely?: string[];
  /**
   * Klienti, ktorí sú podľa PTminderu aktívni, ale v nahranom súbore nie sú.
   * Import ich nechá tak, ako boli — čo je správne, ale ticho. Preto sa mená
   * vracajú von: čiastočný export vyzerá presne ako úplný.
   */
  chybaju?: string[];
  /** Tréningy, ktoré import zmazal (PTminder ich za obdobie súboru už nemá). */
  odstranene?: string[];
  /** Nastavené, keď poistka mazanie zastavila. */
  nahradenieZastavene?: string;
  /** `true` = chýbajúcim sa vyčerpaný balíček vynuloval (pohľad `package`). */
  vynulovane?: boolean;
};

export async function ingest(DB: D1Database, filename: string, text: string, actor?: string): Promise<IngestResult> {
  const type = detectCSVType(text);
  if (!type) return { filename, type: null, added: 0, skipped: 0, error: "Nerozpoznaný typ CSV" };

  let added = 0;
  let skipped = 0;
  let chybaju: string[] = [];
  /** Tréningy, ktoré import Sessions zmazal, lebo ich PTminder za to obdobie už nemá. */
  let odstraneneSedenia: string[] = [];
  /** Keď poistka mazanie zastavila — dôvod. */
  let nahradenieZastavene = "";
  /** Pri pohľade `package` sa chýbajúcim zostatok vynuluje — hláška to povie. */
  let vynulovane = false;
  let bezZostatku = 0;
  /** Údaje, ktoré sa v appke a v zdroji líšia — import ich NEPREPÍŠE. */
  const rozdiely: string[] = [];
  // Uzavretý mesiac sa neprepisuje. Nie varovaním — odmietnutím. Import je
  // jediná cesta, ktorou sa do appky dostávajú tréningy a platby, takže stačí
  // strážiť ju; riadky z uzamknutých mesiacov sa preskočia a povie sa o tom.
  const zamky = await zamknuteMesiace(DB);
  let zamknutych = 0;
  const zamknuty = (isoDatum: string | null | undefined) => {
    if (!jeZamknuty(zamky, isoDatum)) return false;
    zamknutych++;
    return true;
  };

  if (type === "sessions") {
    const rows = parseSessions(text);
    const existing = new Set(
      (await DB.prepare("SELECT dedup_key FROM sessions").all()).results.map((r: any) => r.dedup_key),
    );
    const stmts = [];
    for (const r of rows) {
      if (zamknuty(r.date)) continue;
      const key = sessionKey(r);
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      stmts.push(
        DB.prepare(
          "INSERT OR IGNORE INTO sessions (id,date,time,client_name,session_trainer,session_name,session_type,duration_min,price_czk,dedup_key) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).bind(uid(), r.date, r.time, r.client, r.sessionTrainer, r.sessionName, r.sessionType, r.duration, r.price, key),
      );
      added++;
    }
    if (stmts.length) await DB.batch(stmts);

    /**
     * Nahradenie obdobia — čo v súbore za to isté obdobie nie je, zmizne.
     * Pravidlá a poistky sú v `nahradenieObdobia`; tu sa len načíta, čo
     * v rozsahu je, a zmaže. Jeden dopyt na rozsah (nie celú tabuľku) —
     * limit D1 sme už raz minuli.
     */
    if (rows.length) {
      const dni = rows.map((r) => String(r.date).slice(0, 10)).filter(Boolean).sort();
      const vRozsahu = (await DB.prepare(
        "SELECT id, date, time, client_name, session_trainer, dedup_key FROM sessions WHERE substr(date,1,10) BETWEEN ?1 AND ?2",
      ).bind(dni[0], dni[dni.length - 1]).all()).results as unknown as RiadokVKokpite[];
      const n = nahradenieObdobia(
        rows.map((r) => ({ date: r.date, sessionTrainer: r.sessionTrainer, kluc: sessionKey(r) })),
        vRozsahu,
        (d) => jeZamknuty(zamky, d),
      );
      odstraneneSedenia = n.odstranit.map((r) => `${String(r.date).slice(0, 10)} ${r.time} ${r.client_name} (${r.session_trainer})`);
      nahradenieZastavene = n.zastavene || "";
      for (let i = 0; i < n.odstranit.length; i += 50) {
        await DB.batch(n.odstranit.slice(i, i + 50).map((r) => DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(r.id)));
      }
    }
  } else if (type === "services") {
    const rows = parseServices(text);
    const existing = new Set(
      (await DB.prepare("SELECT dedup_key FROM services").all()).results.map((r: any) => r.dedup_key),
    );
    const stmts = [];
    for (const r of rows) {
      if (zamknuty(r.date)) continue;
      const key = serviceKey(r);
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      stmts.push(
        DB.prepare(
          "INSERT OR IGNORE INTO services (id,date,client_name,service_type,service_description,price_czk,is_6m,trainer,dedup_key) VALUES (?,?,?,?,?,?,?,?,?)",
        ).bind(uid(), r.date, r.client, r.serviceType, r.description, r.price, r.is6m ? 1 : 0, r.trainer, key),
      );
      added++;
    }
    if (stmts.length) await DB.batch(stmts);
  } else if (type === "payments") {
    const rows = parsePayments(text);
    const existing = new Set(
      (await DB.prepare("SELECT dedup_key FROM payments").all()).results.map((r: any) => r.dedup_key),
    );
    const stmts = [];
    for (const r of rows) {
      if (zamknuty(r.date)) continue;
      const key = paymentKey(r);
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      stmts.push(
        DB.prepare(
          "INSERT OR IGNORE INTO payments (id,date,client_name,amount_czk,payment_method,note,dedup_key) VALUES (?,?,?,?,?,?,?)",
        ).bind(uid(), r.date, r.client, r.amount, r.method, r.note || "", key),
      );
      added++;
    }
    if (stmts.length) await DB.batch(stmts);
  } else if (type === "metricool" || type === "ga4" || type === "gsc") {
    // Metricool sa už aj spracúva: jeden riadok = jeden príspevok. Mesačné súčty
    // sa počítajú z nich, nie naopak — z uloženého agregátu sa už nedá zistiť,
    // ktorý reel to ťahal.
    //
    // Surová kópia sa ukladá aj tak. Formát exportu sa mení a keď sa raz ukáže,
    // že sa niečo parsovalo zle, pôvodný súbor je jediné, z čoho sa to dá
    // opraviť — a Metricool ho po čase už nevydá.
    if (type === "metricool") {
      const prispevky = parseMetricool(text);
      if (prispevky.length) {
        const now = new Date().toISOString();
        const stmts = prispevky.map((x) =>
          DB.prepare(
            `INSERT INTO mkt_prispevky (id, druh, datum, mesiac, url, hook, views, dosah, ulozenia, zdielania, komentare, lajky, spend, view_rate, watch_time, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
             ON CONFLICT(id) DO UPDATE SET druh=?2, datum=?3, mesiac=?4, url=?5, hook=?6, views=?7, dosah=?8,
               ulozenia=?9, zdielania=?10, komentare=?11, lajky=?12, spend=?13, view_rate=?14, watch_time=?15, updated_at=?16`,
          ).bind(x.id, x.druh, x.datum, x.mesiac, x.url, x.hook, x.views, x.dosah, x.ulozenia, x.zdielania, x.komentare, x.lajky, x.spend, x.viewRate, x.watchTime, now),
        );
        for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
        added = prispevky.length;
      }
    }
    if (type === "ga4") {
      const g = parseGa4(text);
      if (g) {
        await DB.prepare(
          `INSERT INTO ga4_mesiace (mesiac, novi, organic_search, paid_social, organic_social, direct, referral, udalosti, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
           ON CONFLICT(mesiac) DO UPDATE SET novi=?2, organic_search=?3, paid_social=?4, organic_social=?5,
             direct=?6, referral=?7, udalosti=?8, updated_at=?9`,
        ).bind(g.mesiac, g.novi, g.organicSearch, g.paidSocial, g.organicSocial, g.direct, g.referral, g.udalosti, new Date().toISOString()).run();
        added = 1;
      }
    }
    if (type === "gsc") {
      const v = parseGsc(text);
      const now = new Date().toISOString();
      if (v && v.druh === "graf") {
        for (const m of v.mesiace) {
          await DB.prepare(
            `INSERT INTO gsc_mesiace (mesiac, kliky, zobrazenia, updated_at) VALUES (?1,?2,?3,?4)
             ON CONFLICT(mesiac) DO UPDATE SET kliky=?2, zobrazenia=?3, updated_at=?4`,
          ).bind(m.mesiac, Math.round(m.kliky), Math.round(m.zobrazenia), now).run();
        }
        added = v.mesiace.length;
      } else if (v && (v.druh === "dopyty" || v.druh === "strany")) {
        // Rebríček je snímka za obdobie, nie časový rad — starý sa zahodí celý.
        // Miešať dva rebríčky z rôznych období nejde: pozícia je priemer.
        const tab = v.druh === "dopyty" ? "gsc_dopyty" : "gsc_strany";
        const stlpec = v.druh === "dopyty" ? "dopyt" : "url";
        await DB.prepare(`DELETE FROM ${tab}`).run();
        const stmts = v.riadky.slice(0, 500).map((r) =>
          DB.prepare(`INSERT OR REPLACE INTO ${tab} (${stlpec}, kliky, zobrazenia, ctr, pozicia, updated_at) VALUES (?1,?2,?3,?4,?5,?6)`)
            .bind(r.kluc, Math.round(r.kliky), Math.round(r.zobrazenia), r.ctr, r.pozicia, now),
        );
        for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
        added = stmts.length;
      }
    }
    const kluc = `${type}|${filename}|${text.length}`;
    const uz = await DB.prepare("SELECT id FROM raw_uploads WHERE dedup_key = ?1").bind(kluc).first();
    if (uz) skipped += 1;
    else {
      await DB.prepare(
        "INSERT INTO raw_uploads (id, filename, kind, content, bytes, dedup_key, uploaded_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
      ).bind(uid(), filename, type, text.slice(0, 4_000_000), text.length, kluc, new Date().toISOString()).run();
      if (type !== "metricool" && type !== "ga4" && type !== "gsc") added = 1;
    }
  } else if (type === "kanaly") {
    // Mesačná zostava zo všetkých kanálov. Nahratie toho istého mesiaca prepíše
    // predošlé — je to snímka, nie prírastok.
    const riadky = parseKanaly(text);
    if (riadky.length) {
      const now = new Date().toISOString();
      const stmts = riadky.map((r) =>
        DB.prepare(
          `INSERT INTO kanaly_mesiace (mesiac, kanal, metrika, hodnota, zmena, poznamka, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(mesiac, kanal, metrika) DO UPDATE SET hodnota=?4, zmena=?5, poznamka=?6, updated_at=?7`,
        ).bind(r.mesiac, r.kanal, r.metrika, r.hodnota, r.zmena, r.poznamka, now),
      );
      for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
      added = riadky.length;
    }
  } else if (type === "anamneza") {
    // Z anamnézy sa berie jediná vec: odkiaľ sa klient o PSB dozvedel. Zdravotná
    // časť sa neukladá — nie je na ňu v appke dôvod a bola by to najcitlivejšia
    // vec v celej databáze.
    //
    // Mená vo formulári si ľudia píšu sami, takže sa nezhodujú s PTminderom na
    // znak („Kaňunsky" vs „Kaňovský"). Preto sa páruje bez diakritiky a keď to
    // nesedí celé, skúsi sa priezvisko — a riadok, ktorý sa nespáruje, sa
    // zaráta ako preskočený, nie ako úspech.
    const riadky = parseAnamneza(text);
    const menaDb = (await DB.prepare("SELECT DISTINCT client_name FROM sessions").all()).results.map((r: any) => String(r.client_name));
    const podlaNorm = new Map<string, string>();
    const podlaPriezviska = new Map<string, string[]>();
    for (const m of menaDb) {
      podlaNorm.set(normName(m), m);
      const p = normName(m).split(" ").filter(Boolean).pop() || "";
      if (p.length >= 4) podlaPriezviska.set(p, [...(podlaPriezviska.get(p) || []), m]);
    }
    let pridaneNarodeniny = 0;
    const maNarodeniny = new Set(
      (await DB.prepare("SELECT name FROM client_overrides WHERE narodeniny IS NOT NULL AND narodeniny <> ''").all())
        .results.map((r: any) => String(r.name)),
    );
    // Čo je už vyplnené, sa neprepisuje: ručný zápis vie viac než formulár.
    const uzMa = new Set(
      (await DB.prepare("SELECT name FROM client_overrides WHERE zdroj IS NOT NULL AND zdroj <> ''").all())
        .results.map((r: any) => String(r.name)),
    );
    for (const r of riadky) {
      const n = normName(r.meno);
      let meno = podlaNorm.get(n);
      if (!meno) {
        const p = n.split(" ").filter(Boolean).pop() || "";
        const kand = podlaPriezviska.get(p) || [];
        if (kand.length === 1) meno = kand[0];
      }
      if (!meno) { skipped++; continue; }
      // Narodeniny sa dopĺňajú aj klientovi, ktorý už zdroj má — sú to dve
      // nezávislé polia a PTminder dátum narodenia neexportuje vôbec, takže
      // formulár je jediný zdroj. Ručne vyplnené sa neprepisuje.
      if (r.narodeniny && !maNarodeniny.has(meno)) {
        await setOverride(DB, meno, "narodeniny", r.narodeniny);
        maNarodeniny.add(meno);
        pridaneNarodeniny++;
      }
      if (uzMa.has(meno) || !r.zdroj) { skipped++; continue; }
      await setOverride(DB, meno, "zdroj", r.zdroj);
      if (r.zdrojKto) await setOverride(DB, meno, "zdrojKto", r.zdrojKto);
      uzMa.add(meno);
      added++;
    }
    added += pridaneNarodeniny;
  } else if (type === "cennik") {
    // Cenník nie sú pohyby — je to zoznam šablón. Ukladá sa ako nastavenie,
    // aby Jarvis aj karty vedeli aktuálne ceny bez toho, aby ich niekto
    // prepisoval ručne do znalostí.
    const riadky = parseCennik(text);
    if (riadky.length) {
      const stare = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'cennik'").first<{ value: string }>();
      const spolu: Record<string, unknown> = stare ? JSON.parse(stare.value || "{}") : {};
      for (const r of riadky) spolu[r.nazov] = r;
      await DB.prepare(
        "INSERT INTO vzas_settings (key, value, updated_at) VALUES ('cennik', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
      ).bind(JSON.stringify(spolu), new Date().toISOString()).run();
      added = riadky.length;
    }
  } else if (type === "transakcie") {
    /**
     * Poplatky sa NEPRIDÁVAJÚ, tabuľka sa PREPÍŠE.
     *
     * V PTminderi sa poplatok po zaplatení zmaže, takže export je vždy úplný
     * zoznam otvorených položiek — nie prírastok. Keby sa importovalo cez
     * INSERT OR IGNORE, zaplatené poplatky by v Kokpite zostali navždy
     * a appka by pýtala peniaze, ktoré už prišli.
     */
    const rows = parsePoplatky(text);
    const stmts = [
      DB.prepare("DELETE FROM poplatky"),
      ...rows.map((r) =>
        DB.prepare("INSERT INTO poplatky (id,datum,client_name,popis,suma_czk,dedup_key) VALUES (?,?,?,?,?,?)")
          .bind(uid(), r.datum, r.klient, r.popis, r.suma, `${r.datum}|${r.klient}|${r.suma}`),
      ),
    ];
    await DB.batch(stmts);
    added = rows.length;
  } else if (type === "klienti") {
    /**
     * ZOZNAM KLIENTOV — DOPLNÍ, NEPREPÍŠE.
     *
     * Jerry, 28. 9. 2026: „skús podoplňať do profilov klientov všetko, čo tam
     * chýba." Doplní sa to, čo v appke NIE JE; kde už hodnota stojí a líši sa,
     * import ju nechá a vráti dvojicu von (`rozdiely`). Pracovný mail z faktúr
     * a súkromný z PTmindera sú obe správne odpovede na inú otázku a appka
     * nemá rozhodovať, ktorá platí.
     *
     * Jerry, 28. 9. 2026: „kľudne k tým ľuďom daj dva maily." Odlišný mail sa
     * preto neodhodí — uloží sa ako druhý a faktúra aj výpis hodín potom
     * odídu na obe adresy. Martinovi Vaškovi doklad mesiac odchádzal na
     * adresu s jedným preklepom a nikomu to nedalo vedieť.
     *
     * Narodeniny majú vlastnú stráž: `datumNarodenia` odmietne nezrozumiteľný
     * tvar a rok mimo rozumného rozsahu — Naďa Khamaziuk má v PTminderi 2036
     * a appka ju kvôli tomu kedysi viedla ako dieťa.
     */
    const rows = parseClientList(text);
    const kf = new Map(
      ((await DB.prepare("SELECT klient, email, dalsie_maily, telefon FROM klient_fakturacia").all()).results as any[])
        .map((r) => [String(r.klient), {
          email: String(r.email || ""), dalsie: String(r.dalsie_maily || ""), telefon: String(r.telefon || ""),
        }]),
    );
    const nar = new Map(
      ((await DB.prepare("SELECT name, narodeniny FROM client_overrides").all()).results as any[])
        .map((r) => [String(r.name), String(r.narodeniny || "")]),
    );
    const stmts = [];
    for (const r of rows) {
      const uz = kf.get(r.meno);
      const mail = r.email && (!uz?.email ? r.email : "");
      const tel = r.telefon && (!uz?.telefon ? r.telefon : "");
      const iny = !!uz?.email && !!r.email && uz.email.trim().toLowerCase() !== r.email.trim().toLowerCase();
      // Druhý mail sa dopĺňa len do prázdna — ručne zapísanú adresu import neprepíše.
      const druhy = iny && !uz?.dalsie ? r.email : "";
      if (iny) {
        rozdiely.push(druhy
          ? `${r.meno}: v appke ${uz!.email}, v PTminderi ${r.email} — uložené ako druhý mail, pôjde na obe`
          : `${r.meno}: v appke ${uz!.email}, v PTminderi ${r.email}`);
      }
      if (mail || tel || druhy) {
        stmts.push(
          uz
            ? DB.prepare(
              `UPDATE klient_fakturacia SET email = CASE WHEN email = '' THEN ?2 ELSE email END,
                 telefon = CASE WHEN telefon = '' THEN ?3 ELSE telefon END,
                 dalsie_maily = CASE WHEN dalsie_maily = '' THEN ?5 ELSE dalsie_maily END,
                 updated_at = ?4 WHERE klient = ?1`,
            ).bind(r.meno, mail, tel, new Date().toISOString(), druhy)
            : DB.prepare(
              // `dalsie_maily` patrí aj sem. Bez neho klient, ktorý v tabuľke
              // ešte nebol, druhý mail pri prvom zápise ticho stratil.
              "INSERT INTO klient_fakturacia (klient, firma, email, telefon, dalsie_maily, updated_at) VALUES (?1, ?1, ?2, ?3, ?5, ?4)",
            ).bind(r.meno, mail, tel, new Date().toISOString(), druhy),
        );
        added++;
      }
      if (r.narodeniny && !nar.get(r.meno)) {
        stmts.push(DB.prepare(
          "INSERT INTO client_overrides (name, narodeniny, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO UPDATE SET narodeniny = ?2, updated_at = ?3 WHERE narodeniny = ''",
        ).bind(r.meno, r.narodeniny, new Date().toISOString()));
      }
    }
    if (stmts.length) await DB.batch(stmts);
  } else if (type === "idoklad") {
    /**
     * Faktúry z iDokladu sú ZRKADLO exportu: `INSERT OR REPLACE` podľa čísla
     * dokladu. Stav úhrady sa mení a riadok sa má aktualizovať, nie zdvojiť;
     * faktúra, ktorá v novšom exporte nie je, sa ale nemaže — export býva za
     * obdobie a staršie doklady sú stále platný variabilný symbol.
     */
    const rows = parseIdoklad(text);
    const stmts = rows.map((r) =>
      DB.prepare(
        "INSERT OR REPLACE INTO idoklad_faktury (cislo,nazov,popis,suma_czk,vystaveno,splatnost,stav,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))",
      ).bind(r.cislo, r.nazov, r.popis, r.suma, r.vystaveno, r.splatnost, r.stav),
    );
    added = rows.length;
    if (stmts.length) await DB.batch(stmts);
  } else if (type === "packages") {
    // Per-client MERGE, not a wholesale replace: refresh package rows only for the
    // clients present in THIS file, and leave every other client's packages intact.
    // PTminder exports are often partial (one package type / filtered view), so a
    // wholesale replace would wipe clients missing from the file. This way uploads
    // accumulate safely by client, and a client's rows are always the latest snapshot.
    const rows = parsePackages(text);
    // Ticho by to prešlo ako „0 left from 0" — a karta klienta by odvtedy
    // ukazovala dopočítané číslo namiesto toho z PTminderu.
    bezZostatku = text.split(/\r?\n/).slice(1).filter((r) => r.trim() && jeIkonaMiestoCisla(r)).length;
    const clientsInFile = [...new Set(rows.map((r) => r.client))];
    // Mazať sa smie len ten POHĽAD, ktorý súbor nesie. Report má štyri pohľady
    // a klient môže byť v dvoch naraz (dochodí starý balíček A má nové
    // členstvo) — keby súbor s členstvami zmazal klientovi aj riadky balíčkov,
    // druhý upload by ticho zahodil dáta prvého.
    const kindInFile = rows[0]?.kind || "";
    // ── kontrola úplnosti ────────────────────────────────────────────────
    //
    // 19. 8. 2026: Natália Pečková mala v appke 0 hodín, v PTminderi 5. Import
    // z 14. 8. prebehol bez chyby a ohlásil „+20 riadkov" — lenže tých riadkov
    // malo byť 77. Bol to export za 14 dní a ona v tom okne nemala pohyb.
    //
    // Merge nižšie je zámerný a správny (klient mimo súboru sa nesmie zmazať),
    // ale má vedľajší účinok: čiastočný export vyzerá presne ako úplný. Preto
    // sa PRED zápisom odloží, kto je podľa PTminderu aktívny, a po porovnaní
    // so súborom sa chýbajúci vrátia von. Appka nevie, či je to chyba — vie len
    // povedať, že sa niekto stratil, a to stačí na to, aby sa človek pozrel.
    //
    // Kritérium je `client_status` z PTminderu, nie zostatok hodín. Pôvodne sa
    // hľadal „živý balíček" (zostatok > 0 alebo platnosť do budúcna) a to bolo
    // málo: Natália mala v starých dátach len dočerpané riadky bez dátumov,
    // takže by práve ona — jediný známy prípad — prepadla. Kto je aktívny
    // klient, ten do úplného exportu balíčkov patrí, nech má hodín koľkokoľvek.
    //
    // Porovnáva sa LEN v rámci toho istého pohľadu (`kind`), a riadky starého
    // formátu bez typu (`kind = ''`) sa do porovnania neberú vôbec. Report má
    // pohľadov viac a klient býva len v jednom — pri prvom ostrom spustení
    // 19. 8. tak `package` súbor ohlásil šesť „chýbajúcich", ktorí boli všetci
    // paušáloví („Doplnenie členstva") a do package exportu ani nepatria.
    // Cena za to je, že prvý import každého pohľadu nemá s čím porovnávať —
    // to je správne, radšej ticho než falošný poplach.
    // KAŽDÝ POHĽAD MÁ INÉ PRAVIDLO, koho doň PTminder vôbec dá — a kontrola
    // musí poznať oboje, inak háda. Zmerané na ostrých dátach 19. 8. 2026:
    //
    //  • `package`    — 21 riadkov, z toho NULA s nulovým zostatkom. Dochodený
    //                   balíček v tomto exporte jednoducho nie je.
    //  • `membership` — 45 riadkov, z toho 7 s nulovým zostatkom. Paušál stojí
    //                   na 0/N navždy, takže tu nula nič neznamená; rozhoduje
    //                   platnosť.
    //
    // Bez tohto rozlíšenia hlásil package súbor šesticu ľudí s dočerpanými
    // doplnkami (Anna Nová, Jakub Štigut, Janka Šnirychová, Jarek Heinrich,
    // Klára Holubová, Patrik Lutonský), ktorí doň nikdy patriť nemali, a
    // membership súbor troch, ktorým dobehla platnosť.
    const dnesISO = new Date().toISOString().slice(0, 10);
    // Dosadené parametre sa musia zhodovať s tým, čo dopyt naozaj obsahuje —
    // preto sa spolu s podmienkou skladá aj ich zoznam.
    const [patriDoExportu, param] = kindInFile === "package"
      ? ["sessions_remaining > 0", [kindInFile]]
      : ["(valid_to = '' OR valid_to >= ?)", [kindInFile, dnesISO]];
    const aktivni = kindInFile
      ? (
        await DB.prepare(
          `SELECT DISTINCT client_name FROM packages
            WHERE kind = ? AND client_status = 'Active Client' AND ${patriDoExportu}`,
        ).bind(...param).all()
      ).results.map((r: any) => String(r.client_name))
      : [];
    const vSubore = new Set(clientsInFile);
    chybaju = aktivni.filter((meno) => !vSubore.has(meno)).sort();
    /**
     * KTO Z EXPORTU BALÍČKOV ZMIZOL, TEN UŽ HODINY NEMÁ.
     *
     * Export balíčkov nesie len riadky so zostatkom — vyčerpaný balíček v ňom
     * jednoducho nie je (zmerané 19. 8. 2026: z 21 riadkov nula s nulovým
     * zostatkom). Doteraz sa to len hlásilo („N aktívnych klientov v súbore
     * chýba") a starý riadok zostal so zostatkom, ktorý už neplatil. 29. 9.
     * 2026 tak Kokpit považoval za živé doplnenia Martina Vaška, Veroniky
     * Stoklaskovej či Petry Bambúškovej, hoci ich PTminder mal minuté —
     * a súhrn toho istého exportu (5 doplnení, 2 ONE YEAR, 1 SPECIAL 3)
     * sedel presne na riadky v súbore.
     *
     * Riadok sa NEMAŽE, len sa mu zostatok nastaví na nulu: história, že
     * balíček bol, zostáva. Týka sa to LEN pohľadu `package` — pri členstvách
     * rozhoduje platnosť a tú riadok nesie sám.
     */
    const vycerpane = kindInFile === "package" ? chybaju : [];
    vynulovane = vycerpane.length > 0;
    const stmts = [
      ...vycerpane.map((name) =>
        DB.prepare("UPDATE packages SET sessions_remaining = 0 WHERE client_name = ? AND kind = 'package' AND sessions_remaining > 0").bind(name),
      ),
      ...clientsInFile.map((name) =>
        DB.prepare("DELETE FROM packages WHERE client_name = ? AND (kind = ? OR kind = '')").bind(name, kindInFile),
      ),
      ...rows.map((r) =>
        DB.prepare(
          "INSERT INTO packages (id,client_name,client_status,package_name,sessions_remaining,sessions_total,added,valid_from,valid_to,payment_czk,kind,na_obdobie) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(uid(), r.client, r.status, r.package, r.remaining, r.total,
          r.added || "", r.validFrom || "", r.validTo || "", r.payment ?? null, r.kind || "", r.naObdobie || 0),
      ),
    ];
    if (stmts.length) await DB.batch(stmts);
    added = rows.length;
  }

  await DB.prepare(
    "INSERT INTO upload_log (id,date,filename,type,added,skipped) VALUES (?,?,?,?,?,?)",
  ).bind(uid(), new Date().toISOString(), filename, type, added, skipped).run();

  await audit(DB, {
    action: "import",
    predmet: filename,
    neu: `${type}: +${added} riadkov, ${skipped} duplicít${odstraneneSedenia.length ? `, ${odstraneneSedenia.length} zmazaných (v PTminderi opravené): ${odstraneneSedenia.join("; ")}` : ""}${nahradenieZastavene ? ` — ${nahradenieZastavene}` : ""}${zamknutych ? `, ${zamknutych} odmietnutých (uzavretý mesiac)` : ""}${chybaju.length ? (vynulovane ? `, ${chybaju.length} klientom vyčerpaný balíček (v exporte už nie sú)` : `, ${chybaju.length} aktívnych klientov v súbore chýba`) : ""}`,
    actor,
  });

  return { filename, type, added, skipped, zamknute: zamknutych, chybaju, vynulovane, odstranene: odstraneneSedenia, nahradenieZastavene, bezZostatku, rozdiely };
}

// Zapíše JEDEN stĺpec. Nie celý riadok — a to je oprava skutočnej chyby.
//
// Predtým sa riadok najprv načítal, v pamäti sa mu prepísalo jedno pole a
// zapísal sa celý späť. Keď prišli dve zmeny tesne po sebe (a to sa deje: „Áno,
// duch" nastavuje naraz odpoveď aj stav klienta), obe si prečítali ten istý
// starý riadok a druhá prepísala prvú. Zmena ticho zmizla — bez chyby, bez
// stopy, len sa neuložila.
//
// Názov stĺpca sa do SQL vkladá textom, ale len z pevnej mapy nižšie; hodnota
// ide cez parameter. Kľúč mimo mapy sa zahodí ešte predtým.
/**
 * Zapíše JEDEN stĺpec klienta.
 *
 * Vracia `true` len keď D1 potvrdí zápis. Do 19. 8. 2026 vracala `void`
 * a API nad ňou odpovedalo `ok: true` vždy — aj keby D1 padla, aj pri
 * neznámom poli (to sa ticho preskočilo). Presne tvar, ktorý pravidlo
 * „ticho zlyhávajúci zápis je horší než hlasitá chyba" zakazuje. Dnes padne
 * len pri výpadku D1, ale obrazovka by vtedy ukázala „uložené" nad ničím.
 */
export async function setOverride(
  DB: D1Database,
  name: string,
  key: keyof ClientOverride,
  value: unknown,
): Promise<boolean> {
  const colMap: Record<string, string> = {
    status: "status",
    specialRate: "special_rate",
    specialRateNote: "special_rate_note",
    trainerNote: "trainer_note",
    contractSigned: "contract_signed",
    primaryTrainer: "primary_trainer",
    bitcoin: "bitcoin",
    duch: "duch",
    zdroj: "zdroj",
    zdrojKto: "zdroj_kto",
    narodeniny: "narodeniny",
    prvyKontakt: "prvy_kontakt",
    v6m: "v6m",
    precoNeprisiel: "preco_neprisiel",
    balicekZostatok: "balicek_zostatok",
    balicekKDatumu: "balicek_k_datumu",
  };
  const col = colMap[key as string];
  if (!col) return false;

  let v: unknown = value;
  if (col === "special_rate" || col === "contract_signed" || col === "bitcoin") v = value ? 1 : 0;
  if ((col === "status" || col === "primary_trainer") && (value === "" || value == null)) v = null;

  const r = await DB.prepare(
    `INSERT INTO client_overrides (name, ${col}, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(name) DO UPDATE SET ${col} = ?2, updated_at = ?3`,
  )
    .bind(name, v as never, new Date().toISOString())
    .run()
    .catch(() => null);
  // D1 pri zlyhaní hádže výnimku (tú chytá catch → null); `success` má typ
  // `true`, takže stačí, že výsledok existuje.
  return r !== null;
}

export async function ackAnomaly(DB: D1Database, key: string, note: string, actor = ""): Promise<void> {
  await DB.prepare(
    "INSERT INTO anomaly_ack (anomaly_key,note,acked_at,actor) VALUES (?,?,?,?) "
    + "ON CONFLICT(anomaly_key) DO UPDATE SET note=excluded.note, acked_at=excluded.acked_at, actor=excluded.actor",
  )
    .bind(key, note, new Date().toISOString(), actor)
    .run();
}

export async function unackAnomaly(DB: D1Database, key: string): Promise<void> {
  await DB.prepare("DELETE FROM anomaly_ack WHERE anomaly_key = ?").bind(key).run();
}

export async function resetAll(DB: D1Database): Promise<void> {
  await DB.batch([
    DB.prepare("DELETE FROM sessions"),
    DB.prepare("DELETE FROM services"),
    DB.prepare("DELETE FROM payments"),
    DB.prepare("DELETE FROM packages"),
    DB.prepare("DELETE FROM upload_log"),
    DB.prepare("DELETE FROM anomaly_ack"),
    // client_overrides are intentionally preserved (manual notes survive a reset).
  ]);
}
