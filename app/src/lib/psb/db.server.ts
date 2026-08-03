// Server-only D1 access for the PSB Tracker. All reads/writes hit env.DB.
import type { D1Database } from "@cloudflare/workers-types";

import { audit, jeZamknuty, zamknuteMesiace } from "./audit.server";
import { normName } from "./format";
import { parseAnamneza, parseCennik } from "./parse";
import {
  detectCSVType,
  parsePackages,
  parsePayments,
  parseServices,
  parseSessions,
  paymentKey,
  serviceKey,
  sessionKey,
} from "./parse";
import type { ClientOverride, PSBData } from "./types";
import { EMPTY_DATA } from "./types";

const uid = () => crypto.randomUUID();

export async function loadData(DB: D1Database): Promise<PSBData> {
  const [sessions, services, payments, packages, overrides, acks, log, leads, zavery] = await Promise.all([
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
  ]);

  const data: PSBData = {
    ...EMPTY_DATA,
    clientOverrides: {},
    anomalyAck: {},
    sessions: (sessions.results as any[]).map((r) => ({
      date: r.date,
      time: r.time,
      client: r.client_name,
      sessionTrainer: r.session_trainer,
      sessionName: r.session_name,
      sessionType: r.session_type,
      duration: r.duration_min,
      price: r.price_czk,
    })),
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
    })),
    zavery: (zavery.results as any[]).map((r) => ({
      id: r.id, datum: r.datum, tema: r.tema, zaver: r.zaver,
      overit: r.overit, overitDo: r.overit_do, stav: r.stav,
    })),
    leads: (leads.results as any[]).map((r) => ({
      id: r.id,
      date: r.date,
      name: r.name || "",
      source: r.source,
      referrer: r.referrer || "",
      status: r.status,
      note: r.note || "",
    })),
    uploadLog: (log.results as any[]).map((r) => ({
      date: r.date,
      filename: r.filename,
      type: r.type,
      added: r.added,
      skipped: r.skipped,
    })),
  };

  for (const r of overrides.results as any[]) {
    data.clientOverrides[r.name] = {
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
    };
  }
  for (const r of acks.results as any[]) {
    data.anomalyAck[r.anomaly_key] = { note: r.note || "", ackedAt: r.acked_at };
  }
  return data;
}

export type IngestResult = {
  filename: string; type: string | null; added: number; skipped: number; error?: string;
  /** Koľko riadkov import odmietol, lebo patria do uzavretého mesiaca. */
  zamknute?: number;
};

export async function ingest(DB: D1Database, filename: string, text: string, actor?: string): Promise<IngestResult> {
  const type = detectCSVType(text);
  if (!type) return { filename, type: null, added: 0, skipped: 0, error: "Nerozpoznaný typ CSV" };

  let added = 0;
  let skipped = 0;
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
    // Uloží sa surovo. Nekreslí sa to zatiaľ nikde, ale nič sa nestratí — a to
    // je pri Metricoole časovo obmedzená vec.
    const kluc = `${type}|${filename}|${text.length}`;
    const uz = await DB.prepare("SELECT id FROM raw_uploads WHERE dedup_key = ?1").bind(kluc).first();
    if (uz) skipped = 1;
    else {
      await DB.prepare(
        "INSERT INTO raw_uploads (id, filename, kind, content, bytes, dedup_key, uploaded_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
      ).bind(uid(), filename, type, text.slice(0, 4_000_000), text.length, kluc, new Date().toISOString()).run();
      added = 1;
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
      if (!meno || uzMa.has(meno)) { skipped++; continue; }
      await setOverride(DB, meno, "zdroj", r.zdroj);
      if (r.zdrojKto) await setOverride(DB, meno, "zdrojKto", r.zdrojKto);
      uzMa.add(meno);
      added++;
    }
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
  } else if (type === "packages") {
    // Per-client MERGE, not a wholesale replace: refresh package rows only for the
    // clients present in THIS file, and leave every other client's packages intact.
    // PTminder exports are often partial (one package type / filtered view), so a
    // wholesale replace would wipe clients missing from the file. This way uploads
    // accumulate safely by client, and a client's rows are always the latest snapshot.
    const rows = parsePackages(text);
    const clientsInFile = [...new Set(rows.map((r) => r.client))];
    // Mazať sa smie len ten POHĽAD, ktorý súbor nesie. Report má štyri pohľady
    // a klient môže byť v dvoch naraz (dochodí starý balíček A má nové
    // členstvo) — keby súbor s členstvami zmazal klientovi aj riadky balíčkov,
    // druhý upload by ticho zahodil dáta prvého.
    const kindInFile = rows[0]?.kind || "";
    const stmts = [
      ...clientsInFile.map((name) =>
        DB.prepare("DELETE FROM packages WHERE client_name = ? AND (kind = ? OR kind = '')").bind(name, kindInFile),
      ),
      ...rows.map((r) =>
        DB.prepare(
          "INSERT INTO packages (id,client_name,client_status,package_name,sessions_remaining,sessions_total,added,valid_from,valid_to,payment_czk,kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(uid(), r.client, r.status, r.package, r.remaining, r.total,
          r.added || "", r.validFrom || "", r.validTo || "", r.payment ?? null, r.kind || ""),
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
    neu: `${type}: +${added} riadkov, ${skipped} duplicít${zamknutych ? `, ${zamknutych} odmietnutých (uzavretý mesiac)` : ""}`,
    actor,
  });

  return { filename, type, added, skipped, zamknute: zamknutych };
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
export async function setOverride(
  DB: D1Database,
  name: string,
  key: keyof ClientOverride,
  value: unknown,
): Promise<void> {
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
  };
  const col = colMap[key as string];
  if (!col) return;

  let v: unknown = value;
  if (col === "special_rate" || col === "contract_signed" || col === "bitcoin") v = value ? 1 : 0;
  if ((col === "status" || col === "primary_trainer") && (value === "" || value == null)) v = null;

  await DB.prepare(
    `INSERT INTO client_overrides (name, ${col}, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(name) DO UPDATE SET ${col} = ?2, updated_at = ?3`,
  )
    .bind(name, v as never, new Date().toISOString())
    .run();
}

export async function ackAnomaly(DB: D1Database, key: string, note: string): Promise<void> {
  await DB.prepare(
    "INSERT INTO anomaly_ack (anomaly_key,note,acked_at) VALUES (?,?,?) ON CONFLICT(anomaly_key) DO UPDATE SET note=excluded.note, acked_at=excluded.acked_at",
  )
    .bind(key, note, new Date().toISOString())
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
