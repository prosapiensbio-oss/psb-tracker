import { bindings } from "../bindings.server";
import { maTajomstvo, overPouzivatela, sessionCookie, type Pouzivatel } from "./auth.server";
import { vymazPokusy, zapisZlyhanie, zostavaBlok } from "./loginLimit.server";

/**
 * `/api/login` — prihlásenie vlastným kontom, meno + heslo z tabuľky `users`.
 * Iná cesta dnu nie je. Trasa je len tenký obal, aby sa to dalo otestovať bez
 * routera (`loginApi.test.ts`).
 *
 * Výpadok databázy NIE JE zlé heslo: človek by menil heslo, ktoré má správne, a
 * pokus by sa započítal do limitu. Preto vlastná odpoveď 503.
 */
export async function loginPost(request: Request): Promise<Response> {
  let password = "";
  let login = "";
  try {
    const body = (await request.json()) as { password?: unknown; login?: unknown };
    password = typeof body.password === "string" ? body.password : "";
    login = typeof body.login === "string" ? body.login.trim().toLowerCase().slice(0, 40) : "";
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!maTajomstvo()) {
    return Response.json({ ok: false, error: "bez_tajomstva", sprava: "Appke chýba nastavenie prihlásenia. Napíš Jerrymu." }, { status: 503 });
  }

  const { DB } = bindings();
  const ip = request.headers.get("cf-connecting-ip") || "neznama";
  const zostava = await zostavaBlok(DB, ip, login);
  if (zostava > 0) {
    const minut = Math.ceil(zostava / 60_000);
    return Response.json(
      { ok: false, error: "prilis_vela_pokusov", sprava: `Priveľa neúspešných pokusov. Skús to znova o ${minut} min.` },
      { status: 429, headers: { "retry-after": String(Math.ceil(zostava / 1000)) } },
    );
  }

  const bezDatabazy = () => Response.json(
    { ok: false, error: "databaza", sprava: "Databáza práve neodpovedá, heslo sa nedá overiť. Skús to o chvíľu." },
    { status: 503 },
  );
  if (!DB) return bezDatabazy();
  let u: Pouzivatel | null;
  try {
    u = await overPouzivatela(DB, login, password);
  } catch {
    return bezDatabazy();
  }

  if (!u) {
    await zapisZlyhanie(DB, ip, login);
    return Response.json({ ok: false, error: "invalid" }, { status: 401 });
  }
  await vymazPokusy(DB, ip, login);
  await DB.prepare("UPDATE users SET last_login = ?2 WHERE login = ?1")
    .bind(u.login, new Date().toISOString()).run().catch(() => {});
  return Response.json({ ok: true, user: u.name }, { headers: { "Set-Cookie": await sessionCookie(u.name, u.sessionVer) } });
}
