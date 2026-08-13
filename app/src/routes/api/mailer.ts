import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { bindings } from "../../lib/bindings.server";

/**
 * MailerLite — odberatelia a kampane.
 *
 * PREČO TO STOJÍ ZA TO
 *
 * Formulár na /dychani zbiera maily, nie dopyty, a od júla sa o ňom vie, že má
 * vysoké zobrazenia a nula odoslaní. Kampaň naň minula 1 804 Kč.
 *
 * POZOR NA JEDEN UNÁHLENÝ ZÁVER
 *
 * Že od 3. 9. 2025 nepribudol odberateľ, NEZNAMENÁ, že je formulár rozbitý.
 * Jerry, 13. 8.: od vtedy nebežala žiadna akcia, ktorá by o mail požiadala.
 * Prázdny prírastok pri nulovej akcii je očakávaný výsledok, nie porucha —
 * a diagnóza „rozbité" by poslala hľadať chybu tam, kde žiadna nie je.
 *
 * Táto obrazovka teda meria, či akcia, KTORÁ BEŽÍ, prináša maily. Bez akcie
 * nemeria nič.
 *
 * TOKEN NEOPÚŠŤA SERVER
 *
 * Rovnako ako pri Mete: leží v `vzas_settings` pod `mailer_token`, číta ho len
 * tento súbor a do prehliadača sa nevracia ani skrátený.
 *
 * PREČO JE VOLANIE PÍSANÉ OBRANNE
 *
 * MailerLite v2 stránkuje raz cez `cursor`, raz cez `page`, podľa endpointu —
 * a odpovede sa medzi verziami menili. Kód preto skúša oboje a pri neznámom
 * tvare radšej skončí, než by tichým spôsobom stiahol polovicu.
 */

const API = "https://connect.mailerlite.com/api";

type Odpoved = { ok: boolean; data?: Record<string, unknown>; chyba?: string };

async function volaj(cesta: string, token: string): Promise<Odpoved> {
  try {
    const r = await fetch(`${API}${cesta}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const m = (j.message as string) || (j.error as string) || `HTTP ${r.status}`;
      return { ok: false, chyba: String(m).slice(0, 300) };
    }
    return { ok: true, data: j };
  } catch (e) {
    return { ok: false, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

/** Prejde všetky strany. Strop je poistka proti zacykleniu, nie odhad počtu. */
async function vsetky(cesta: string, token: string, maxStran = 12): Promise<{ ok: boolean; riadky: Record<string, unknown>[]; chyba?: string }> {
  const riadky: Record<string, unknown>[] = [];
  let url = cesta;
  for (let i = 0; i < maxStran; i++) {
    const r = await volaj(url, token);
    if (!r.ok) return { ok: false, riadky, chyba: r.chyba };
    const d = (r.data?.data as Record<string, unknown>[]) || [];
    riadky.push(...d);
    // Kurzorové stránkovanie (odberatelia) aj číslované (kampane).
    const meta = (r.data?.meta || {}) as Record<string, unknown>;
    const dalsi = meta.next_cursor as string | undefined;
    if (dalsi) { url = `${cesta}${cesta.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(dalsi)}`; continue; }
    const links = (r.data?.links || {}) as Record<string, unknown>;
    if (!links.next || !d.length) break;
    const strana = Number(meta.current_page || i + 1) + 1;
    url = `${cesta}${cesta.includes("?") ? "&" : "?"}page=${strana}`;
  }
  return { ok: true, riadky };
}

const den = (v: unknown) => String(v || "").slice(0, 10);
const cislo = (v: unknown) => Number(v) || 0;

export const Route = createFileRoute("/api/mailer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        try {
          const [odb, kam, tok] = await Promise.all([
            DB.prepare("SELECT id, email, meno, prihlaseny, status, skupiny FROM mail_odberatelia ORDER BY prihlaseny DESC").all(),
            DB.prepare("SELECT id, nazov, odoslane, prijemcov, otvorenia, prekliky, odhlasenia FROM mail_kampane ORDER BY odoslane DESC").all(),
            DB.prepare("SELECT value FROM vzas_settings WHERE key = 'mailer_token'").first(),
          ]);
          return Response.json({
            ok: true, maToken: !!tok,
            odberatelia: odb.results, kampane: kam.results,
          });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }

        const now = new Date().toISOString();
        try {
          if (b.akcia === "uloz-token") {
            const t = String(b.token || "").trim();
            if (t.length < 20) return Response.json({ ok: false, error: "token_prilis_kratky" }, { status: 400 });
            await DB.prepare(
              `INSERT INTO vzas_settings (key, value, updated_at) VALUES ('mailer_token', ?1, ?2)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            ).bind(JSON.stringify(t), now).run();
            // Do auditu ide fakt, nie hodnota.
            await audit(DB, { action: "nastavenie", predmet: "mailer_token", neu: "token nastavený", actor: await currentUser(request) || undefined });
            return Response.json({ ok: true });
          }

          const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'mailer_token'").first<{ value: string }>();
          let token = "";
          try { token = r?.value ? String(JSON.parse(r.value)) : ""; } catch { token = r?.value || ""; }
          if (!token) return Response.json({ ok: false, error: "chyba_token" }, { status: 400 });

          // Skúška spojenia — čo ten token vôbec vidí. Prvá vec po vložení.
          if (b.akcia === "test") {
            const s = await volaj("/subscribers?limit=1", token);
            if (!s.ok) return Response.json({ ok: false, error: s.chyba }, { status: 502 });
            const g = await volaj("/groups?limit=50", token);
            const skupiny = ((g.data?.data as Record<string, unknown>[]) || [])
              .map((x) => `${x.name} (${cislo(x.active_count)})`);
            const spolu = ((s.data?.meta || {}) as Record<string, unknown>).total;
            return Response.json({
              ok: true,
              sprava: `Token funguje. Odberateľov: ${spolu ?? "?"}. Skupiny: ${skupiny.join(", ") || "žiadne"}.`,
            });
          }

          if (b.akcia === "stiahni") {
            // Skupiny sa NEDAJÚ vyčítať zo zoznamu odberateľov — MailerLite ich
            // tam neposiela (prvá verzia to skúšala a všetkých 616 zostalo bez
            // skupiny). Jediná cesta je opačná: prejsť skupiny a pri každej si
            // vypýtať jej odberateľov. Je to zopár volaní navyše a stoja za to:
            // skupina hovorí, z ktorého magnetu človek prišiel, a bez toho je
            // odberateľ len mail bez pôvodu.
            const g = await volaj("/groups?limit=100", token);
            const skupinyOdberatela = new Map<string, string[]>();
            for (const x of ((g.data?.data as Record<string, unknown>[]) || [])) {
              const meno = String(x.name || "");
              if (!meno) continue;
              const cl = await vsetky(`/groups/${x.id}/subscribers?limit=500`, token, 6);
              if (!cl.ok) continue;
              for (const c of cl.riadky) {
                const id = String(c.id || "");
                if (!id) continue;
                skupinyOdberatela.set(id, [...(skupinyOdberatela.get(id) || []), meno]);
              }
            }

            const o = await vsetky("/subscribers?limit=500", token);
            if (!o.ok) return Response.json({ ok: false, error: o.chyba }, { status: 502 });
            const k = await vsetky("/campaigns?filter[status]=sent&limit=50", token);
            if (!k.ok) return Response.json({ ok: false, error: k.chyba }, { status: 502 });

            const stmtsO = o.riadky.map((x) => {
              const sk = (skupinyOdberatela.get(String(x.id)) || []).join(" · ");
              const f = (x.fields || {}) as Record<string, unknown>;
              return DB.prepare(
                `INSERT INTO mail_odberatelia (id,email,meno,prihlaseny,status,skupiny,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)
                 ON CONFLICT(id) DO UPDATE SET email=?2, meno=?3, prihlaseny=?4, status=?5, skupiny=?6, updated_at=?7`,
              ).bind(
                String(x.id || ""), String(x.email || ""), String(f.name || x.name || ""),
                den(x.subscribed_at || x.created_at), String(x.status || ""), sk, now,
              );
            });

            const stmtsK = k.riadky.map((x) => {
              const st = (x.stats || {}) as Record<string, unknown>;
              return DB.prepare(
                `INSERT INTO mail_kampane (id,nazov,odoslane,prijemcov,otvorenia,prekliky,odhlasenia,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(id) DO UPDATE SET nazov=?2, odoslane=?3, prijemcov=?4,
                   otvorenia=?5, prekliky=?6, odhlasenia=?7, updated_at=?8`,
              ).bind(
                String(x.id || ""), String(x.name || ""), den(x.finished_at || x.scheduled_for || x.created_at),
                cislo(st.sent),
                // UNIKÁTNE počty. Celkové by pri jednom človeku, čo si mail
                // otvoril päťkrát, tvrdili, že záujem je päťnásobný.
                cislo(st.unique_opens_count ?? st.opens_count),
                cislo(st.unique_clicks_count ?? st.clicks_count),
                cislo(st.unsubscribes_count), now,
              );
            });

            for (let i = 0; i < stmtsO.length; i += 40) await DB.batch(stmtsO.slice(i, i + 40));
            for (let i = 0; i < stmtsK.length; i += 40) await DB.batch(stmtsK.slice(i, i + 40));
            return Response.json({ ok: true, odberatelov: stmtsO.length, kampani: stmtsK.length });
          }

          return Response.json({ ok: false, error: "nezname_akcia" }, { status: 400 });
        } catch (e) {
          return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
        }
      },
    },
  },
});
