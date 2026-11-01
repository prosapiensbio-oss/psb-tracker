import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../bindings.server";
import { audit } from "./audit.server";
import { currentUser, hashPassword, novaSol, sessionCookie, unauthorized, zabudniKonta } from "./auth.server";
import { rolaKonta, smieKonta, type AkciaKonta } from "./kontaPrava";

/**
 * `/api/users` — správa kont. Pravidlá sú v `kontaPrava.ts`; trasa je len tenký
 * obal, aby sa dala každá rola otestovať bez routera (`kontaApi.test.ts`).
 */
type RiadokKonta = { login: string; name: string; active: number };

/**
 * Konto prihláseného. Rovnaké hľadanie ako `kontoPodlaMena` (cookie nesie meno,
 * staršie cookies login), ale BEZ 20-sekundovej pamäte: o oprávnení sa rozhoduje
 * podľa toho, čo je v databáze teraz.
 */
const mojeKonto = (DB: D1Database, ja: string) =>
  DB.prepare("SELECT login, name, active FROM users WHERE name = ?1 OR login = ?2 ORDER BY name = ?1 DESC LIMIT 1")
    .bind(ja, ja.toLowerCase())
    .first<RiadokKonta>();

export async function kontaGet(request: Request): Promise<Response> {
  const ja = await currentUser(request);
  if (!ja) return unauthorized();
  const { DB } = bindings();
  if (!DB) return Response.json({ ok: false, users: [] });
  try {
    const [rs, moje] = await Promise.all([
      DB.prepare("SELECT login, name, active, last_login FROM users ORDER BY name").all(),
      mojeKonto(DB, ja),
    ]);
    return Response.json({
      ok: true, ja,
      // Obrazovky podľa toho ukazujú len to, čo server dovolí. Rozhoduje server.
      jaLogin: moje?.login ?? null, rola: rolaKonta(ja, moje),
      users: (rs.results as Record<string, unknown>[]).map((r) => ({
        login: r.login, name: r.name, active: !!r.active, lastLogin: r.last_login,
      })),
    });
  } catch {
    return Response.json({ ok: true, ja, jaLogin: null, rola: "cudzi", users: [] });
  }
}

/**
 * Nové heslo zvyšuje `session_ver`: heslo sa mení najmä preto, že ho pozná niekto
 * iný alebo sa stratil telefón, a stará cookie by inak platila ďalej. Vracia, čo
 * treba na novú cookie. Nové konto ide vlastnou cestou, tam nie je čo odhlasovať.
 */
const zapisHeslo = async (DB: D1Database, login: string, password: string, name: string) => {
  const salt = novaSol();
  const hash = await hashPassword(password, salt);
  return DB.prepare(
    `UPDATE users SET pass_hash = ?2, pass_salt = ?3, name = ?4, active = 1, session_ver = COALESCE(session_ver, 0) + 1
     WHERE login = ?1 RETURNING name, session_ver`,
  ).bind(login, hash, salt, name).first<{ name: string; session_ver: number }>();
};

export async function kontaPost(request: Request): Promise<Response> {
  const ja = await currentUser(request);
  if (!ja) return unauthorized();
  const { DB } = bindings();
  if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
  let b: { login?: string; name?: string; password?: string; active?: boolean; akcia?: string };
  try { b = (await request.json()) as typeof b; }
  catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

  const login = String(b.login || "").trim().toLowerCase().slice(0, 40);
  if (!/^[a-z0-9._-]{2,40}$/.test(login)) return Response.json({ ok: false, error: "bad_login" }, { status: 400 });
  if (b.akcia !== undefined && b.akcia !== "odhlas-vsade" && b.akcia !== "zachrana") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const password = String(b.password || "");

  // Databáza neodpovedá = nikto nič. Oprávnenie sa nedá overiť, tak sa nepredpokladá.
  let moje: RiadokKonta | null;
  let ciel: RiadokKonta | null;
  try {
    moje = await mojeKonto(DB, ja);
    ciel = await DB.prepare("SELECT login, name, active FROM users WHERE login = ?1").bind(login).first<RiadokKonta>();
  } catch {
    return Response.json({ ok: false, error: "no_db" }, { status: 500 });
  }

  const akcia: AkciaKonta = b.akcia === "odhlas-vsade" || b.akcia === "zachrana"
    ? b.akcia
    : !ciel ? "nove" : password ? "heslo" : "uprava";
  if (!smieKonta(rolaKonta(ja, moje), moje?.login ?? null, akcia, login)) {
    return Response.json({ ok: false, error: "nesmie" }, { status: 403 });
  }

  // Odhlásiť všade: vyššia verzia zneplatní všetky cookies konta, aj tejto
  // obrazovky, ak ide o vlastné konto. Stratený telefón sa rieši týmto.
  if (akcia === "odhlas-vsade") {
    try {
      const r = await DB.prepare("UPDATE users SET session_ver = COALESCE(session_ver, 0) + 1 WHERE login = ?1").bind(login).run();
      if (!r.meta.changes) return Response.json({ ok: false, error: "no_user" }, { status: 404 });
    } catch (e) {
      // Migrácia 0129 ešte nebeží — povedať to, nie tváriť sa, že sa niekto odhlásil.
      return Response.json({ ok: false, error: "no_migration", detail: String(e).slice(0, 200) }, { status: 500 });
    }
    zabudniKonta();
    await audit(DB, { action: "odhlasenie-vsade", predmet: login, actor: ja });
    return Response.json({ ok: true });
  }

  // Záchrana nezakladá kontá a nezapína vypnuté: tie vracia správca.
  if (akcia === "zachrana" && (!ciel || !ciel.active)) return Response.json({ ok: false, error: "no_user" }, { status: 404 });
  if ((akcia === "nove" || akcia === "zachrana") && !password) return Response.json({ ok: false, error: "need_password" }, { status: 400 });
  // Osem znakov je dosť na appku za jedným zámkom a málo na to, aby si
  // niekto vymýšľal heslo, ktoré si nezapamätá a prestane appku otvárať.
  if (password && password.length < 8) return Response.json({ ok: false, error: "short_password" }, { status: 400 });
  // Vlastné konto sa vypnúť nedá — kto by ho potom zapol.
  if (akcia === "uprava" && b.active === false && moje?.login === login) {
    return Response.json({ ok: false, error: "vlastne_konto" }, { status: 400 });
  }

  // Meno mení len správca: správa sa podľa loginu, no audit a cookie nesú meno.
  const noveMeno = rolaKonta(ja, moje) === "spravca" ? String(b.name || "").trim().slice(0, 60) : "";

  if (akcia === "nove") {
    const salt = novaSol();
    const hash = await hashPassword(password, salt);
    await DB.prepare(
      "INSERT INTO users (login, name, pass_hash, pass_salt, active, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
    ).bind(login, noveMeno || login, hash, salt, new Date().toISOString()).run();
    zabudniKonta();
    await audit(DB, { action: "nove-konto", predmet: login, neu: "zmenené heslo", actor: ja });
    return Response.json({ ok: true });
  }

  if (akcia === "uprava") {
    const aktivne = b.active === undefined ? ciel!.active : b.active ? 1 : 0;
    await DB.prepare("UPDATE users SET name = ?2, active = ?3 WHERE login = ?1").bind(login, noveMeno || ciel!.name, aktivne).run();
    zabudniKonta();
    await audit(DB, { action: "uprava-konta", predmet: login, neu: `aktívne: ${aktivne ? "áno" : "nie"}`, actor: ja });
    return Response.json({ ok: true });
  }

  // Heslo: vlastné, cudzie od správcu, alebo záchrana.
  let r: { name: string; session_ver: number } | null;
  try {
    r = await zapisHeslo(DB, login, password, noveMeno || ciel!.name);
  } catch (e) {
    return Response.json({ ok: false, error: "no_migration", detail: String(e).slice(0, 200) }, { status: 500 });
  }
  if (!r) return Response.json({ ok: false, error: "no_user" }, { status: 404 });
  zabudniKonta();
  await audit(DB, akcia === "zachrana"
    ? { action: "zachrana-hesla", predmet: login, neu: "nové heslo cez záchranu, zariadenia odhlásené", actor: ja }
    : { action: "uprava-konta", predmet: login, neu: "zmenené heslo, zariadenia odhlásené", actor: ja });

  // Vlastné heslo: nová cookie v novej verzii, aby sa človek neodhlásil sám sebe.
  if (moje?.login === login) {
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await sessionCookie(r.name, r.session_ver) } });
  }
  return Response.json({ ok: true });
}
