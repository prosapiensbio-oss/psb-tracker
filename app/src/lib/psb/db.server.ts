// Server-only D1 access for the PSB Tracker. All reads/writes hit env.DB.
import type { D1Database } from "@cloudflare/workers-types";
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
  const [sessions, services, payments, packages, overrides, acks, log, leads] = await Promise.all([
    DB.prepare("SELECT * FROM sessions").all(),
    DB.prepare("SELECT * FROM services").all(),
    DB.prepare("SELECT * FROM payments").all(),
    DB.prepare("SELECT * FROM packages").all(),
    DB.prepare("SELECT * FROM client_overrides").all(),
    DB.prepare("SELECT * FROM anomaly_ack").all(),
    DB.prepare("SELECT * FROM upload_log ORDER BY date DESC LIMIT 40").all(),
    DB.prepare("SELECT * FROM leads ORDER BY date DESC").all().catch(() => ({ results: [] })),
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
    })),
    packages: (packages.results as any[]).map((r) => ({
      client: r.client_name,
      status: r.client_status,
      package: r.package_name,
      remaining: r.sessions_remaining,
      total: r.sessions_total,
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

export type IngestResult = { filename: string; type: string | null; added: number; skipped: number; error?: string };

export async function ingest(DB: D1Database, filename: string, text: string): Promise<IngestResult> {
  const type = detectCSVType(text);
  if (!type) return { filename, type: null, added: 0, skipped: 0, error: "Nerozpoznaný typ CSV" };

  let added = 0;
  let skipped = 0;

  if (type === "sessions") {
    const rows = parseSessions(text);
    const existing = new Set(
      (await DB.prepare("SELECT dedup_key FROM sessions").all()).results.map((r: any) => r.dedup_key),
    );
    const stmts = [];
    for (const r of rows) {
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
      const key = paymentKey(r);
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      stmts.push(
        DB.prepare(
          "INSERT OR IGNORE INTO payments (id,date,client_name,amount_czk,payment_method,dedup_key) VALUES (?,?,?,?,?,?)",
        ).bind(uid(), r.date, r.client, r.amount, r.method, key),
      );
      added++;
    }
    if (stmts.length) await DB.batch(stmts);
  } else if (type === "packages") {
    // Per-client MERGE, not a wholesale replace: refresh package rows only for the
    // clients present in THIS file, and leave every other client's packages intact.
    // PTminder exports are often partial (one package type / filtered view), so a
    // wholesale replace would wipe clients missing from the file. This way uploads
    // accumulate safely by client, and a client's rows are always the latest snapshot.
    const rows = parsePackages(text);
    const clientsInFile = [...new Set(rows.map((r) => r.client))];
    const stmts = [
      ...clientsInFile.map((name) => DB.prepare("DELETE FROM packages WHERE client_name = ?").bind(name)),
      ...rows.map((r) =>
        DB.prepare(
          "INSERT INTO packages (id,client_name,client_status,package_name,sessions_remaining,sessions_total) VALUES (?,?,?,?,?,?)",
        ).bind(uid(), r.client, r.status, r.package, r.remaining, r.total),
      ),
    ];
    if (stmts.length) await DB.batch(stmts);
    added = rows.length;
  }

  await DB.prepare(
    "INSERT INTO upload_log (id,date,filename,type,added,skipped) VALUES (?,?,?,?,?,?)",
  ).bind(uid(), new Date().toISOString(), filename, type, added, skipped).run();

  return { filename, type, added, skipped };
}

export async function setOverride(
  DB: D1Database,
  name: string,
  key: keyof ClientOverride,
  value: unknown,
): Promise<void> {
  const existing = await DB.prepare("SELECT * FROM client_overrides WHERE name = ?")
    .bind(name)
    .first<any>();
  const cur: any = existing || {
    name,
    status: null,
    special_rate: 0,
    special_rate_note: "",
    trainer_note: "",
    contract_signed: 0,
    primary_trainer: null,
    bitcoin: 0,
    duch: "",
    zdroj: "",
    zdroj_kto: "",
  };
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
  let v: any = value;
  if (col === "special_rate" || col === "contract_signed" || col === "bitcoin") v = value ? 1 : 0;
  if ((col === "status" || col === "primary_trainer") && (value === "" || value == null)) v = null;
  cur[col] = v;

  await DB.prepare(
    `INSERT INTO client_overrides (name,status,special_rate,special_rate_note,trainer_note,contract_signed,primary_trainer,bitcoin,duch,zdroj,zdroj_kto,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(name) DO UPDATE SET status=excluded.status, special_rate=excluded.special_rate,
       special_rate_note=excluded.special_rate_note, trainer_note=excluded.trainer_note,
       contract_signed=excluded.contract_signed, primary_trainer=excluded.primary_trainer,
       bitcoin=excluded.bitcoin, duch=excluded.duch, zdroj=excluded.zdroj,
       zdroj_kto=excluded.zdroj_kto, updated_at=excluded.updated_at`,
  )
    .bind(
      name,
      cur.status ?? null,
      cur.special_rate ?? 0,
      cur.special_rate_note ?? "",
      cur.trainer_note ?? "",
      cur.contract_signed ?? 0,
      cur.primary_trainer ?? null,
      cur.bitcoin ?? 0,
      cur.duch ?? "",
      cur.zdroj ?? "",
      cur.zdroj_kto ?? "",
      new Date().toISOString(),
    )
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
