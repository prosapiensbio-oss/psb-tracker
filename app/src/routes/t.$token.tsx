import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { dnesPraha, terazPraha } from "../lib/psb/cas";
import { zapisTrening } from "../lib/psb/nahodTrening.server";
import { oslovenieKlienta } from "../lib/psb/oslovenie";
import { ponukaStrankaHtml, type StavStranky } from "../lib/psb/ponukaStranka";
import { DLZKA_TRENINGU, casHHMM, denCz, icsTerminu, prekryva, stavPonuky, volneCasy, vybranyUsek, zaciatkyVRozmedzi } from "../lib/psb/ponukaTerminov";
import { nacitajPonuku, obsadeneVOkne, oknoCasov, pushTrenerovi } from "../lib/psb/ponukaTerminov.server";
import { audit } from "../lib/psb/audit.server";

/**
 * PONUKA TERMÍNOV — stránka pre klienta `/t/<token>` (7. 10. 2026).
 *
 * GET ukáže voľné termíny (alebo potvrdenie, keď už vybral), POST zapíše
 * výber: najprv sa ponuka „zamkne" podmieneným UPDATE (dva klepnutia naraz
 * nevyrobia dve udalosti), potom sa overí, že čas je stále voľný, a až
 * potom vznikne udalosť v Google kalendári trénera (`zapisTrening` — to isté
 * miesto ako „nahodiť tréning" v Kokpite). Keď Google odmietne, zámok sa
 * uvoľní a klient sa to dozvie.
 *
 * BEZPEČNOSŤ: token je náhodných 12 znakov, stránka je NOINDEX a bez keše.
 */
const html = (text: string, status = 200) => new Response(text, {
  status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});
const zle = (text: string, status = 404) => html(`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens</title></head>
<body style="margin:0;background:#FFFFFF;color:#1A2E24;font-family:Arial,Helvetica,sans-serif"><div style="max-width:420px;margin:80px auto;padding:0 20px;text-align:center;font-size:15px;line-height:1.6">${text}</div></body></html>`, status);
const krstne = oslovenieKlienta;

async function stav(DB: NonNullable<ReturnType<typeof bindings>["DB"]>, token: string, chyba?: string) {
  const n = await nacitajPonuku(DB, token);
  if (!n) return null;
  const { p, casy } = n;
  const trener = casy[0]?.trener || "Jerry";
  if (p.vybrany_id) {
    const c = casy.find((x) => x.id === p.vybrany_id);
    if (c) return { p, casy, trener: c.trener, s: { druh: "vybrane", cas: vybranyUsek(c, p.vybrany_zaciatok) } as StavStranky };
  }
  const o = oknoCasov(casy);
  const obsadene = await obsadeneVOkne(DB, o.od, o.do, token);
  const teraz = terazPraha();
  const volne = volneCasy(casy, obsadene, teraz);
  // Každý ponúknutý čas so začiatkami, ktoré sa dajú vybrať (rozmedzie aj hodina).
  const moznosti = volne.map((c) => ({ c, zaciatky: zaciatkyVRozmedzi(c, obsadene, teraz) }));
  const st = stavPonuky(p, dnesPraha(), volne.length);
  const s: StavStranky = st === "caka"
    ? { druh: "vyber", volne, moznosti, platiDo: p.plati_do, chyba }
    : { druh: "neplati", preco: st === "zrusene" ? "zrusene" : st === "obsadene" ? "obsadene" : "vyprsala" };
  return { p, casy, trener, s, volne, moznosti };
}

export const Route = createFileRoute("/t/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return zle("Tento odkaz neplatí.");
        const x = await stav(DB, token).catch(() => null);
        if (!x) return zle("Tento odkaz neplatí. Ozvěte se nám a pošleme nový.");
        const url = new URL(request.url);
        // „Přidat do kalendáře" — udalosť pre telefón klienta.
        if (url.searchParams.get("ics") && x.s.druh === "vybrane") {
          const c = x.s.cas;
          return new Response(icsTerminu({
            uid: `ponuka-${token}@prosapiens.cz`, zaciatok: c.zaciatok, koniec: c.koniec,
            nazov: `Trénink ProSapiens · ${c.trener === "Terezka" ? "Terezka" : "Filip"}`,
          }), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": "attachment; filename=trenink.ics", "cache-control": "no-store" } });
        }
        const chyba = url.searchParams.get("chyba") === "obsazeno"
          ? "Tento termín si mezitím vybral někdo jiný. Vyberte prosím jiný."
          : url.searchParams.get("chyba") === "zapis"
            ? "Termín se nepodařilo zapsat do kalendáře. Zkuste to prosím znovu, nebo napište."
            : undefined;
        const s = chyba && x.s.druh === "vyber" ? { ...x.s, chyba } : x.s;
        return html(ponukaStrankaHtml({ token, oslovenie: krstne(x.p.klient), trener: x.trener, logoUrl: `${url.origin}/znacka-napis-tmava.svg`, stav: s, typ: x.p.typ }));
      },

      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, GCAL_SA_KLUC } = bindings() as ReturnType<typeof bindings> & { GCAL_SA_KLUC?: string };
        const spat = (q = "") => new Response(null, { status: 303, headers: { location: `/t/${encodeURIComponent(token)}${q}`, "cache-control": "no-store" } });
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return zle("Tento odkaz neplatí.");
        const x = await stav(DB, token).catch(() => null);
        if (!x) return zle("Tento odkaz neplatí.");
        if (x.s.druh !== "vyber") return spat();
        // Hodnota je „id|HH:MM" (začiatok v rozmedzí); staré stránky posielajú len id.
        const [id, hhmmVstup = ""] = String((await request.formData()).get("cas") || "").split("|");
        const rozsah = x.casy.find((k) => k.id === id);
        if (!rozsah) return spat();
        const zaciatok = /^\d{2}:\d{2}$/.test(hhmmVstup) ? `${rozsah.zaciatok.slice(0, 10)}T${hhmmVstup}` : rozsah.zaciatok;
        const moze = (x.moznosti || []).find((m) => m.c.id === id)?.zaciatky || [];
        if (!moze.includes(zaciatok)) return spat("?chyba=obsazeno");
        // Pri rozmedzí sa zapisuje hodina od zvoleného začiatku, nie celé rozmedzie.
        const c = vybranyUsek(rozsah, zaciatok);

        // Zámok: ponuka sa vyberá raz. Druhé klepnutie (alebo druhé okno) neprejde.
        const kedy = new Date().toISOString();
        const zamok = await DB.prepare("UPDATE ponuky_terminov SET vybrany_id = ?2, vybrane_at = ?3, vybrany_zaciatok = ?4 WHERE token = ?1 AND vybrany_id IS NULL AND zrusene_at IS NULL")
          .bind(token, id, kedy, zaciatok).run();
        if (!zamok.meta.changes) return spat();
        const uvolni = () => DB.prepare("UPDATE ponuky_terminov SET vybrany_id = NULL, vybrane_at = NULL, vybrany_zaciatok = NULL WHERE token = ?1 AND vybrany_id = ?2").bind(token, id).run();

        // Iná ponuka mohla ten istý čas vybrať v tej istej sekunde.
        const o = oknoCasov([c]);
        const inde = await obsadeneVOkne(DB, o.od, o.do, token);
        if (inde.some((k) => k.trener === c.trener && prekryva(c, k))) { await uvolni(); return spat("?chyba=obsazeno"); }

        const minut = c === rozsah
          ? (Number(c.koniec.slice(11, 13)) * 60 + Number(c.koniec.slice(14, 16))) - (Number(c.zaciatok.slice(11, 13)) * 60 + Number(c.zaciatok.slice(14, 16)))
          : DLZKA_TRENINGU;
        const r = await zapisTrening(DB, GCAL_SA_KLUC, {
          klient: x.p.klient, den: c.zaciatok.slice(0, 10), cas: c.zaciatok.slice(11, 16), minut, trener: c.trener, typ: x.p.typ,
        }, `${x.p.klient} (ponuka termínov)`, "trening-z-ponuky").catch((e) => ({ ok: false as const, chyba: String(e), status: 500 }));
        if (!r.ok) {
          await uvolni();
          await audit(DB, { action: "ponuka-zapis-zlyhal", predmet: `${x.p.klient} · ${c.zaciatok}`, neu: r.chyba.slice(0, 300) });
          return spat("?chyba=zapis");
        }
        await DB.prepare("UPDATE ponuky_terminov SET udalost_uid = ?2 WHERE token = ?1").bind(token, r.uid).run();
        await pushTrenerovi(DB, c.trener, {
          titulok: "Termín vybraný",
          text: `${x.p.klient} si vybral(a) ${denCz(c.zaciatok, false)} o ${casHHMM(c.zaciatok)} — už je v kalendári.`,
          url: "/#kalendar", znacka: `ponuka-${token}`,
        });
        return spat();
      },
    },
  },
});
