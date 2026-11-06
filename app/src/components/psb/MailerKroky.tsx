import { useCallback, useEffect, useMemo, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import { DRUHY_MAILU, kontrolaTextu, mailHtml } from "../../lib/psb/mailSablona";
import { adresatiSkupin, NAZVY_PREKAZOK, type Prekazka, type Skupina } from "../../lib/psb/mailSkupiny";
import { NAZVY_DRUHOV, ZASOBNIK_TEM, type TemaMailu } from "../../lib/psb/mailTemy";
import { btn, C, mix, S } from "../../lib/psb/theme";
import { Card, H3 } from "./ui";

/**
 * MAILER: Kokpit navrhne dôvod, potom štyri kroky (Jerry, 4. 11. 2026).
 *   1 Nápad · 2 Návrh · 3 Skupina · 4 Odoslanie
 * Na obrazovke je vždy len jedna otázka, nič sa nedá preskočiť. Mail odíde len po
 * kliknutí a počet na tlačidle overí ešte raz server.
 */

type Vydanie = {
  id: string; druh: string; tema: string; preco: string; predmet: string; nadpis: string; predhlavicka: string;
  telo: string; skupiny: string; stav: string; vytvorene_at: string; upravene_at: string; skuska_at: string; odoslane_at: string;
  adresatov: number; caka: number; odoslanych: number; dorucenych: number; otvorenych: number; kliknutych: number;
  odhlasenych: number; odrazenych: number; staznosti: number; odpovedi: number;
};
type Odpoved = { id: string; vydanie: string; email: string; meno: string; predmet: string; text: string; prijate_at: string; vybavene_at: string; lead_id: string };
type Nastavenie = {
  maKluc: boolean; maWebhook: boolean; odosielatel: string; dennyLimit: number; darcekNazov: string; darcekUrl: string;
  skuskaAdresa: string; zostavaDnes: number; domena: { overena: boolean; meno: string; stav: string; chyba: string };
};
type Prehlad = { vydania: Vydanie[]; odpovede: Odpoved[]; nastavenie: Nastavenie };
type Navrh = { id: string; druh: string; tema: string; preco: string; predmet?: string; nadpis?: string; telo: string; skupiny: string[] };

const KROKY = ["Nápad", "Návrh", "Skupina", "Odoslanie"];
const PODPIS = "Stačí odpovědět na tenhle mail, přečtu si to sám.\nFilip";
const KOSTRA = `Ahoj {oslovení},\n\nsem napiš, o čem to je.\n\n${PODPIS}`;
const pole = { ...S.input, width: "100%", boxSizing: "border-box" as const };
const popis = { display: "block", fontSize: 12.5, color: C.textMuted, margin: "12px 0 5px" };

async function posli(akcia: string, telo: Record<string, unknown> = {}) {
  const r = await fetch("/api/mailer-vydania", {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({ akcia, ...telo }),
  });
  const j = await r.json().catch(() => ({})) as Record<string, any>;
  return { ok: r.ok && j.ok !== false, ...j } as { ok: boolean; error?: string; [k: string]: any };
}

/** C: Kokpit začína tým, komu a prečo má zmysel napísať. Text píše človek. */
function navrhySkupin(skupiny: Skupina[]): Navrh[] {
  const pocet = (id: string) => skupiny.find((s) => s.id === id)?.adresati.length || 0;
  const out: Navrh[] = [];
  if (pocet("len_uvodny")) out.push({
    id: "len_uvodny", druh: "otazka", tema: "Ako je ľuďom po jednom tréningu",
    preco: "Po tréningu neprišli a nikto sa ich nespýtal prečo. Dostanú otázku, nie ponuku.",
    predmet: "Jak ti je po tréninku u nás?", nadpis: "Jak ti je po tréninku u nás?",
    telo: `Ahoj {oslovení},\n\nod tréninku u nás uplynul nějaký čas. Nepíšu, abych ti něco prodával.\n\nZměnilo se od té doby něco, co tě tehdy trápilo?\n\n${PODPIS}`,
    skupiny: ["len_uvodny"],
  });
  if (pocet("skoncil")) out.push({
    id: "skoncil", druh: "otazka", tema: "Ako je ľuďom, čo skončili",
    preco: "Chodili pravidelne a od konca sa im nikto neozval. Zaujíma nás, ako sú na tom.",
    telo: KOSTRA, skupiny: ["skoncil"],
  });
  if (pocet("newsletter_web")) out.push({
    id: "newsletter_web", druh: "bolest", tema: "Prvý mail pre nových z webu",
    preco: "Sami si to zaškrtli a čakajú, čo príde. Dostanú to, kvôli čomu prišli.",
    telo: KOSTRA, skupiny: ["newsletter_web"],
  });
  return out;
}

function Ukazka({ v, meno }: { v: { druh: string; predmet: string; nadpis: string; predhlavicka: string; telo: string }; meno: string }) {
  const [sirka, setSirka] = useState(600);
  const html = useMemo(() => mailHtml({ ...v, meno, odhlasitUrl: "#", dovodVMaili: "kvůli tréninku u nás" }), [v, meno]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.textDim, marginRight: "auto" }}>Takto to príde</span>
        <button style={btn(sirka === 600 ? "accent" : "outline")} onClick={() => setSirka(600)}>Počítač</button>
        <button style={btn(sirka === 360 ? "accent" : "outline")} onClick={() => setSirka(360)}>Telefón</button>
      </div>
      <iframe title="Ukážka mailu" sandbox="" srcDoc={html}
        style={{ width: "100%", maxWidth: sirka, height: 620, border: `1px solid ${C.border}`, borderRadius: 10, background: "#E9E5D8", display: "block", margin: "0 auto" }} />
    </div>
  );
}

function Kroky({ start, skupiny, nastavenie, onZmena, onZavri }: {
  start: Partial<Vydanie> & { skupinyPole?: string[] };
  skupiny: Skupina[] | null;
  nastavenie: Nastavenie;
  onZmena: () => void;
  onZavri: () => void;
}) {
  const [krok, setKrok] = useState(() => (start.id && start.predmet ? 1 : 0));
  const [id, setId] = useState(start.id || "");
  const [druh, setDruh] = useState(start.druh || "bolest");
  const [tema, setTema] = useState(start.tema || "");
  const [preco, setPreco] = useState(start.preco || "");
  const [otvoril, setOtvoril] = useState(!!start.id);
  const [predmet, setPredmet] = useState(start.predmet || "");
  const [nadpis, setNadpis] = useState(start.nadpis || "");
  const [predhlavicka, setPredhlavicka] = useState(start.predhlavicka || "");
  const [telo, setTelo] = useState(start.telo || KOSTRA);
  const [vybrane, setVybrane] = useState<string[]>(() => {
    if (start.skupinyPole) return start.skupinyPole;
    try { return JSON.parse(start.skupiny || "[]"); } catch { return []; }
  });
  const [skuskaAt, setSkuskaAt] = useState(start.skuska_at || "");
  const [adresa, setAdresa] = useState(nastavenie.skuskaAdresa);
  const [rozbalena, setRozbalena] = useState("");
  const [sprava, setSprava] = useState("");
  const [chyba, setChyba] = useState("");
  const [pracuje, setPracuje] = useState(false);
  const [istota, setIstota] = useState(false);
  const [hotovo, setHotovo] = useState<{ odoslane: number; zostava: number } | null>(null);

  const text = { druh, predmet, nadpis, predhlavicka, telo };
  const chybyTextu = kontrolaTextu(text);
  const adresati = useMemo(() => adresatiSkupin(skupiny || [], vybrane), [skupiny, vybrane]);

  const uloz = useCallback(async () => {
    const r = await posli("uloz", { id, druh, tema, preco, predmet, nadpis, predhlavicka, telo, skupiny: vybrane });
    if (!r.ok) { setChyba(r.error || "Neuložilo sa."); return false; }
    setId(r.id);
    if (!r.skuskaPlati) setSkuskaAt("");
    onZmena();
    return true;
  }, [id, druh, tema, preco, predmet, nadpis, predhlavicka, telo, vybrane, onZmena]);

  const dalej = async (kam: number) => {
    setChyba(""); setSprava(""); setPracuje(true); setIstota(false);
    const ok = await uloz();
    setPracuje(false);
    if (ok) setKrok(kam);
  };

  const skuska = async () => {
    setChyba(""); setSprava(""); setPracuje(true);
    if (await uloz()) {
      const idTeraz = id;
      const r = await posli("skuska", { id: idTeraz, adresa });
      if (r.ok) { setSkuskaAt(r.skuska_at); setSprava(`Skúšobný mail odišiel na ${adresa}. Pozri si ho v schránke, aj na telefóne.`); onZmena(); }
      else setChyba(r.error || "Skúšobný mail neodišiel.");
    }
    setPracuje(false);
  };

  const odosli = async () => {
    setChyba(""); setPracuje(true);
    const r = await posli("odosli", { id, potvrdeny_pocet: adresati.length });
    setPracuje(false); setIstota(false);
    if (!r.ok) { setChyba(r.error || "Mail neodišiel."); onZmena(); return; }
    setHotovo({ odoslane: r.odoslane || 0, zostava: r.zostava || 0 });
    onZmena();
  };

  if (hotovo) {
    return (
      <Card>
        <H3>Mail odišiel</H3>
        <p style={{ fontSize: 14, color: C.text }}>
          Odoslané: <b>{hotovo.odoslane}</b>.
          {hotovo.zostava > 0 && <> Ďalších <b>{hotovo.zostava}</b> odíde automaticky v nasledujúcich dňoch, lebo denný limit je {nastavenie.dennyLimit}.</>}
        </p>
        <p style={{ fontSize: 12.5, color: C.textMuted }}>Výsledky a odpovede sa budú zobrazovať na hlavnej obrazovke Mailera.</p>
        <button style={btn("accent")} onClick={onZavri}>Späť na Mailer</button>
      </Card>
    );
  }

  const kontroly: { ok: boolean; text: string }[] = [
    { ok: !chybyTextu.length, text: chybyTextu.length ? chybyTextu.join(" ") : "Text je v poriadku." },
    { ok: true, text: "Označenie „Obchodní sdělení“ a odhlásenie sú navrchu aj v päte." },
    { ok: true, text: "Odhlásení, nedoručiteľní a kto dostal mail do 14 dní sú vyradení." },
    { ok: adresati.length > 0, text: adresati.length ? `Adresátov: ${adresati.length}.` : "Nie je vybraná skupina." },
    { ok: nastavenie.maKluc, text: nastavenie.maKluc ? "Resend je pripojený." : "Chýba kľúč Resendu, zadaj ho v nastavení." },
    { ok: nastavenie.domena.overena, text: nastavenie.domena.overena ? "Doména news.prosapiens.cz je overená." : "Doména news.prosapiens.cz ešte nie je overená." },
    { ok: !!skuskaAt, text: skuskaAt ? "Skúšobný mail tejto verzie odišiel." : "Ešte nebol poslaný skúšobný mail tejto verzie." },
  ];
  const mozeOdoslat = kontroly.every((k) => k.ok);
  const dnes = Math.min(adresati.length, nastavenie.zostavaDnes);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {KROKY.map((k, i) => (
            <button key={k} onClick={() => { if (i < krok) setKrok(i); }} disabled={i >= krok}
              style={{ ...btn(i === krok ? "accent" : "outline"), opacity: i > krok ? 0.5 : 1, cursor: i < krok ? "pointer" : "default" }}>
              {i + 1} {k}
            </button>
          ))}
        </div>
        <button style={btn("ghost")} onClick={onZavri}>Zavrieť</button>
      </div>

      {krok === 0 && (
        <div style={{ maxWidth: 620 }}>
          <H3>Čo chceš povedať?</H3>
          <label style={popis}>Téma</label>
          <input style={pole} value={tema} onChange={(e) => setTema(e.target.value)} />
          <label style={popis}>Druh mailu</label>
          <select style={pole} value={druh} onChange={(e) => setDruh(e.target.value)}>
            {Object.entries(NAZVY_DRUHOV).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <label style={popis}>Prečo to ten človek chce dostať? (povinné)</label>
          <textarea style={{ ...pole, minHeight: 72 }} value={preco} onChange={(e) => setPreco(e.target.value)} />
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "14px 0", fontSize: 13.5, color: C.text, cursor: "pointer" }}>
            <input type="checkbox" checked={otvoril} onChange={(e) => setOtvoril(e.target.checked)} />
            Keby tento mail prišiel mne, otvoril by som ho.
          </label>
          <button style={{ ...btn("accent"), opacity: tema.trim() && preco.trim() && otvoril ? 1 : 0.5 }}
            disabled={!tema.trim() || !preco.trim() || !otvoril || pracuje} onClick={() => dalej(1)}>Ďalej: napísať text</button>
        </div>
      )}

      {krok === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18 }}>
          <div>
            <H3>Text mailu</H3>
            <label style={popis}>Predmet</label>
            <input style={pole} value={predmet} onChange={(e) => setPredmet(e.target.value)} />
            <label style={popis}>Nadpis v zelenej hlavičke</label>
            <input style={pole} value={nadpis} onChange={(e) => setNadpis(e.target.value)} />
            <label style={popis}>Veta za predmetom v schránke (nepovinné)</label>
            <input style={pole} value={predhlavicka} onChange={(e) => setPredhlavicka(e.target.value)} />
            <label style={popis}>Text</label>
            <textarea style={{ ...pole, minHeight: 280, fontFamily: "inherit", lineHeight: 1.5 }} value={telo} onChange={(e) => setTelo(e.target.value)} />
            <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.6, margin: "6px 0 12px" }}>
              {"{oslovení} doplní meno. **tučné**. Odkaz [text](https://…), sám na riadku je tlačidlo. > zvýraznená veta. „## nadpis“ a riadky „- “ sú zelený box. Obrázok ![popis](https://…)."}
            </div>
            {chybyTextu.map((c) => <div key={c} style={{ fontSize: 12.5, color: C.orange, marginBottom: 4 }}>{c}</div>)}
            <button style={{ ...btn("accent"), opacity: chybyTextu.length ? 0.5 : 1 }} disabled={!!chybyTextu.length || pracuje} onClick={() => dalej(2)}>Ďalej: komu</button>
          </div>
          <Ukazka v={text} meno="Martin Novák" />
        </div>
      )}

      {krok === 2 && (
        <div>
          <H3>Komu</H3>
          <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: 0 }}>Skupiny sa počítajú samy z tréningov a súhlasov. Vidíš, koľkým smieš napísať a prečo nie ostatným.</p>
          {!skupiny && <div style={{ fontSize: 13, color: C.textDim }}>Počítam skupiny…</div>}
          {skupiny?.map((s) => {
            const n = s.adresati.length;
            const dovody = new Map<Prekazka, number>();
            for (const x of s.vynechani) dovody.set(x.prekazka, (dovody.get(x.prekazka) || 0) + 1);
            return (
              <div key={s.id} style={{ border: `1px solid ${vybrane.includes(s.id) ? C.accent : C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, opacity: n ? 1 : 0.65 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: n ? "pointer" : "default" }}>
                  <input type="checkbox" disabled={!n} checked={vybrane.includes(s.id)} style={{ marginTop: 3 }}
                    onChange={(e) => setVybrane(e.target.checked ? [...vybrane, s.id] : vybrane.filter((x) => x !== s.id))} />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{s.nazov}</span>
                    <span style={{ display: "block", fontSize: 12, color: C.textMuted }}>{s.popis}</span>
                    {dovody.size > 0 && (
                      <span style={{ display: "block", fontSize: 11.5, color: C.textDim, marginTop: 2 }}>
                        Nie: {[...dovody].map(([p, k]) => `${k} ${NAZVY_PREKAZOK[p]}`).join(" · ")}
                      </span>
                    )}
                  </span>
                  <b style={{ fontSize: 14, color: n ? C.accentLight : C.textDim, whiteSpace: "nowrap" }}>{n} z {s.vsetkych}</b>
                </label>
                {n > 0 && (
                  <button style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, padding: "4px 0 0 24px", cursor: "pointer" }}
                    onClick={() => setRozbalena(rozbalena === s.id ? "" : s.id)}>
                    {rozbalena === s.id ? "Skryť mená" : "Ukázať mená"}
                  </button>
                )}
                {rozbalena === s.id && (
                  <div style={{ margin: "6px 0 0 24px", maxHeight: 220, overflow: "auto", fontSize: 12.5, color: C.textMuted }}>
                    {s.adresati.map((a) => (
                      <div key={a.email} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span>{a.meno || "bez mena"} · {a.email}</span>
                        <button style={{ background: "none", border: "none", color: C.orange, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}
                          onClick={async () => {
                            const r = await posli("nepisat", { email: a.email, dovod: "nechce maily, ručne v Kokpite" });
                            if (r.ok) onZmena(); else setChyba(r.error || "Nezapísalo sa.");
                          }}>Nepísať</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button style={{ ...btn("accent"), opacity: adresati.length ? 1 : 0.5 }} disabled={!adresati.length || pracuje} onClick={() => dalej(3)}>Ďalej: kontrola</button>
            <span style={{ fontSize: 13, color: C.textMuted }}>Spolu {adresati.length} ľudí</span>
          </div>
        </div>
      )}

      {krok === 3 && (
        <div style={{ maxWidth: 620 }}>
          <H3>Kontrola a odoslanie</H3>
          {kontroly.map((k) => (
            <div key={k.text} style={{ display: "flex", gap: 8, fontSize: 13.5, color: k.ok ? C.text : C.orange, padding: "3px 0" }}>
              <span style={{ color: k.ok ? C.green : C.orange, fontWeight: 700 }}>{k.ok ? "✓" : "!"}</span>{k.text}
            </div>
          ))}
          <label style={popis}>Skúšobný mail na adresu</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...pole, flex: "1 1 220px", width: "auto" }} type="email" value={adresa} onChange={(e) => setAdresa(e.target.value)} />
            <button style={btn("outline")} disabled={pracuje || !adresa.trim() || !nastavenie.maKluc} onClick={skuska}>Poslať skúšobný</button>
          </div>
          {adresati.length > nastavenie.zostavaDnes && (
            <p style={{ fontSize: 12.5, color: C.textMuted, margin: "10px 0 0" }}>
              Dnes odíde {dnes}, zvyšok automaticky v ďalších dňoch. Denný limit je {nastavenie.dennyLimit}, a nová doména aj tak nesmie začať veľkou dávkou.
            </p>
          )}
          <div style={{ marginTop: 16 }}>
            {!istota ? (
              <button style={{ ...btn("accent"), opacity: mozeOdoslat ? 1 : 0.5 }} disabled={!mozeOdoslat || pracuje} onClick={() => setIstota(true)}>
                Odoslať {adresati.length} ľuďom
              </button>
            ) : (
              <div style={{ background: mix(C.accent, 10), borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 14, color: C.text, marginBottom: 10 }}>Naozaj odoslať <b>{predmet}</b> {adresati.length} ľuďom? Vziať to späť sa nedá.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={btn("accent")} disabled={pracuje} onClick={odosli}>Áno, odoslať</button>
                  <button style={btn("outline")} onClick={() => setIstota(false)}>Ešte nie</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {sprava && <div style={{ fontSize: 13, color: C.green, marginTop: 12 }}>{sprava}</div>}
      {chyba && <div style={{ fontSize: 13, color: C.red, marginTop: 12 }}>{chyba}</div>}
    </Card>
  );
}

function NastavenieKarta({ n, onZmena }: { n: Nastavenie; onZmena: () => void }) {
  const [otvorene, setOtvorene] = useState(!n.maKluc || !n.domena.overena);
  const [kluc, setKluc] = useState("");
  const [webhook, setWebhook] = useState("");
  const [nazov, setNazov] = useState(n.darcekNazov);
  const [url, setUrl] = useState(n.darcekUrl);
  const [limit, setLimit] = useState(String(n.dennyLimit));
  const [sprava, setSprava] = useState("");
  const uloz = async () => {
    const r = await posli("nastav", { kluc, webhook, darcekNazov: nazov, darcekUrl: url, dennyLimit: Number(limit) });
    setSprava(r.ok ? "Uložené." : r.error || "Neuložilo sa.");
    if (r.ok) { setKluc(""); setWebhook(""); onZmena(); }
  };
  const riadok = (ok: boolean, text: string) => (
    <div style={{ fontSize: 13, color: ok ? C.text : C.orange, padding: "2px 0" }}>{ok ? "✓" : "!"} {text}</div>
  );
  return (
    <Card>
      <H3 onClick={() => setOtvorene(!otvorene)} style={{ cursor: "pointer" }}>Nastavenie odosielania {otvorene ? "▾" : "▸"}</H3>
      {otvorene && (
        <>
          {riadok(n.maKluc, n.maKluc ? "Kľúč Resendu je uložený." : "Chýba kľúč Resendu.")}
          {riadok(n.domena.overena, n.domena.overena ? "Doména news.prosapiens.cz je overená." : n.domena.chyba ? `Resend hlási: ${n.domena.chyba}` : `Doména news.prosapiens.cz: ${n.domena.stav || "ešte nepridaná"}.`)}
          {riadok(n.maWebhook, n.maWebhook ? "Výsledky a odpovede sú napojené." : "Chýba tajomstvo webhooku, bez neho sa nezapíšu výsledky ani odpovede.")}
          <div style={{ fontSize: 12, color: C.textDim, margin: "6px 0" }}>Odosielateľ: {n.odosielatel} · dnes ešte môže odísť {n.zostavaDnes}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0 14px" }}>
            <div><label style={popis}>Kľúč Resendu (po uložení sa už neukáže)</label>
              <input style={pole} type="password" autoComplete="off" value={kluc} onChange={(e) => setKluc(e.target.value)} placeholder={n.maKluc ? "uložený" : ""} /></div>
            <div><label style={popis}>Tajomstvo webhooku (whsec_…)</label>
              <input style={pole} type="password" autoComplete="off" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder={n.maWebhook ? "uložené" : ""} /></div>
            <div><label style={popis}>Názov darčeka</label>
              <input style={pole} value={nazov} onChange={(e) => setNazov(e.target.value)} /></div>
            <div><label style={popis}>Odkaz na darček (https://…)</label>
              <input style={pole} value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div><label style={popis}>Denný limit</label>
              <input style={pole} type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: 12, color: C.textDim, margin: "10px 0" }}>Adresa webhooku v Resende: https://kokpit.prosapiensbio.workers.dev/api/mail-udalosti</div>
          <button style={btn("accent")} onClick={uloz}>Uložiť</button>
          {sprava && <span style={{ fontSize: 12.5, color: C.textMuted, marginLeft: 10 }}>{sprava}</span>}
        </>
      )}
    </Card>
  );
}

/** Odpovede na hromadné maily. Mimo dopytov; dopyt vznikne len tlačidlom. */
function OdpovedeZoznam({ odpovede, onZmena }: { odpovede: Odpoved[]; onZmena: () => void }) {
  const p = { odpovede };
  const nacitaj = onZmena;
  const neriesene = odpovede.filter((o) => !o.vybavene_at);
  return (
    <Card>
        <H3>Odpovede ({neriesene.length})</H3>
        <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: 0 }}>Nie sú to dopyty a nerátajú sa do nich. Dopyt z odpovede vznikne len tvojím tlačidlom.</p>
        {!p.odpovede.length && <div style={{ fontSize: 13, color: C.textDim }}>Zatiaľ žiadne.</div>}
        {p.odpovede.map((o) => (
          <div key={o.id} style={{ borderTop: `1px solid ${C.border}`, padding: "9px 0", opacity: o.vybavene_at ? 0.6 : 1 }}>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{o.meno || o.email} <span style={{ fontWeight: 400, fontSize: 11.5, color: C.textDim }}>{fmtDMY(o.prijate_at.slice(0, 10))}{!o.vydanie ? " · nie je z nášho mailu" : ""}</span></div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{o.predmet}</div>
            <div style={{ fontSize: 13, color: C.text, whiteSpace: "pre-wrap", margin: "6px 0", maxHeight: 180, overflow: "auto" }}>{o.text}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a style={{ ...btn("outline"), textDecoration: "none" }} href={`mailto:${o.email}?subject=${encodeURIComponent(`Re: ${o.predmet}`)}`}>Odpísať</a>
              {!o.vybavene_at && <button style={btn("outline")} onClick={async () => { await posli("odpoved-vybavena", { id: o.id }); void nacitaj(); }}>Vybavené</button>}
              {!o.lead_id && <button style={btn("ghost")} onClick={async () => { await posli("odpoved-dopyt", { id: o.id }); void nacitaj(); }}>Urobiť z toho dopyt</button>}
              {o.lead_id && <span style={{ fontSize: 12, color: C.green, alignSelf: "center" }}>V dopytoch</span>}
            </div>
          </div>
        ))}
    </Card>
  );
}

/**
 * Odpovede aj v ostrom Kokpite (6. 11. 2026). Mailer s krokmi je zatiaľ len
 * v bete, ale beta nemá kľúč na čítanie šifrovaného textu, takže odpoveď by sa
 * nedala prečítať nikde.
 */
export function MailerOdpovede() {
  const [odpovede, setOdpovede] = useState<Odpoved[] | null>(null);
  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/mailer-vydania", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setOdpovede(j.odpovede || []);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);
  if (!odpovede || !odpovede.length) return null;
  return <OdpovedeZoznam odpovede={odpovede} onZmena={nacitaj} />;
}

const percent = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "–");

export function MailerKroky() {
  const [p, setP] = useState<Prehlad | null>(null);
  const [skupiny, setSkupiny] = useState<Skupina[] | null>(null);
  const [chyba, setChyba] = useState("");
  const [otvorene, setOtvorene] = useState<(Partial<Vydanie> & { skupinyPole?: string[]; kluc: string }) | null>(null);
  const [vsetkyTemy, setVsetkyTemy] = useState(false);

  const nacitaj = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/mailer-vydania", { credentials: "same-origin" }).then((r) => r.json()),
        fetch("/api/mailer-vydania?skupiny=1", { credentials: "same-origin" }).then((r) => r.json()),
      ]);
      if (!a.ok) throw new Error(a.error || "Mailer sa nenačítal.");
      setP(a);
      if (b.ok) setSkupiny(b.skupiny); else setChyba(b.error || "Skupiny sa nepodarilo spočítať.");
    } catch (e) {
      setChyba(String((e as Error)?.message || e).slice(0, 200));
    }
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  if (!p) return chyba ? <Card><div style={{ color: C.red, fontSize: 13 }}>{chyba}</div></Card> : <Card><div style={{ color: C.textDim, fontSize: 13 }}>Načítavam Mailer…</div></Card>;

  const rozpisane = p.vydania.filter((v) => v.stav === "rozpisane");
  const odoslane = p.vydania.filter((v) => v.stav !== "rozpisane");
  const pouzite = new Set(p.vydania.map((v) => v.tema));
  const temy = ZASOBNIK_TEM.filter((t) => !pouzite.has(t.tema));
  const poslednyDatum = odoslane.reduce((a, v) => (v.odoslane_at > a ? v.odoslane_at : a), "");
  const dniOdPosledneho = poslednyDatum ? Math.floor((Date.now() - Date.parse(poslednyDatum)) / 86400000) : null;
  const navrhy = navrhySkupin(skupiny || []);

  const zacni = (v: Partial<Vydanie> & { skupinyPole?: string[] }) => setOtvorene({ ...v, kluc: v.id || crypto.randomUUID() });
  const zTemy = (t: TemaMailu) => zacni({ druh: t.druh, tema: t.tema, preco: "", telo: KOSTRA });

  if (otvorene) {
    return <Kroky key={otvorene.kluc} start={otvorene} skupiny={skupiny} nastavenie={p.nastavenie} onZmena={nacitaj} onZavri={() => { setOtvorene(null); void nacitaj(); }} />;
  }

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <H3>Komu má zmysel napísať</H3>
          <button style={btn("accent")} onClick={() => zacni({ telo: KOSTRA })}>Nový mail</button>
        </div>
        <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 12px" }}>
          {dniOdPosledneho === null ? "Z Kokpitu zatiaľ žiadny mail neodišiel." : `Posledný mail odišiel pred ${dniOdPosledneho} dňami.`}{" "}
          Dohodnuté je najviac 1 mail mesačne a bez dôvodu sa neposiela.
          {dniOdPosledneho !== null && dniOdPosledneho < 30 && <b style={{ color: C.orange }}> Tento mesiac už mail odišiel.</b>}
        </p>
        {navrhy.map((n) => (
          <div key={n.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: "1 1 280px" }}>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{n.tema} · {skupiny?.find((s) => s.id === n.skupiny[0])?.adresati.length} ľudí</div>
              <div style={{ fontSize: 12.5, color: C.textMuted }}>{n.preco}</div>
            </div>
            <button style={btn("outline")} onClick={() => zacni({ druh: n.druh, tema: n.tema, preco: n.preco, predmet: n.predmet, nadpis: n.nadpis, telo: n.telo, skupinyPole: n.skupiny })}>Začať</button>
          </div>
        ))}
        {!skupiny && !chyba && <div style={{ fontSize: 12.5, color: C.textDim }}>Počítam skupiny…</div>}
        {chyba && <div style={{ fontSize: 12.5, color: C.red }}>{chyba}</div>}

        <div style={{ fontSize: 12.5, color: C.textDim, margin: "14px 0 6px" }}>Alebo téma zo zásobníka ({temy.length} z {ZASOBNIK_TEM.length})</div>
        {(vsetkyTemy ? temy : temy.slice(0, 4)).map((t) => (
          <button key={t.tema} onClick={() => zTemy(t)}
            style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 10, background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "7px 2px", cursor: "pointer", textAlign: "left", color: C.text, fontSize: 13.5 }}>
            <span>{t.tema}</span>
            <span style={{ fontSize: 11.5, color: C.textDim, whiteSpace: "nowrap" }}>{NAZVY_DRUHOV[t.druh]} · {t.zdroj}</span>
          </button>
        ))}
        {temy.length > 4 && <button style={{ ...btn("ghost"), marginTop: 8 }} onClick={() => setVsetkyTemy(!vsetkyTemy)}>{vsetkyTemy ? "Menej" : "Všetky témy"}</button>}
      </Card>

      {rozpisane.length > 0 && (
        <Card>
          <H3>Rozpísané</H3>
          {rozpisane.map((v) => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}`, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px" }}>
                <div style={{ fontSize: 14, color: C.text }}>{v.predmet || v.tema || "Bez názvu"}</div>
                <div style={{ fontSize: 11.5, color: C.textDim }}>{NAZVY_DRUHOV[v.druh] || DRUHY_MAILU[v.druh]} · upravené {fmtDMY(v.upravene_at.slice(0, 10))}</div>
              </div>
              <button style={btn("outline")} onClick={() => zacni(v)}>Pokračovať</button>
              <button style={btn("ghost")} onClick={async () => {
                const r = await posli("zmaz", { id: v.id });
                if (r.ok) void nacitaj(); else setChyba(r.error || "Nezmazalo sa.");
              }}>Zmazať</button>
            </div>
          ))}
        </Card>
      )}

      {odoslane.length > 0 && (
        <Card>
          <H3>Odoslané maily</H3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: C.text }}>
              <thead><tr style={{ color: C.textDim, textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Mail</th><th style={{ padding: "4px 6px" }}>Odišlo</th><th style={{ padding: "4px 6px" }}>Otvorilo</th>
                <th style={{ padding: "4px 6px" }}>Kliklo</th><th style={{ padding: "4px 6px" }}>Odhlásilo</th><th style={{ padding: "4px 6px" }}>Odrazené</th><th style={{ padding: "4px 6px" }}>Spam</th>
              </tr></thead>
              <tbody>{odoslane.map((v) => (
                <tr key={v.id} style={{ borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "6px" }}>{v.predmet}<div style={{ fontSize: 11, color: C.textDim }}>{v.odoslane_at ? fmtDMY(v.odoslane_at.slice(0, 10)) : ""}{v.caka > 0 ? ` · ešte čaká ${v.caka}` : ""}</div></td>
                  <td style={{ padding: "6px" }}>{v.odoslanych}</td>
                  <td style={{ padding: "6px" }}>{percent(v.otvorenych, v.odoslanych)}</td>
                  <td style={{ padding: "6px" }}>{percent(v.kliknutych, v.odoslanych)}</td>
                  <td style={{ padding: "6px" }}>{v.odhlasenych}</td>
                  <td style={{ padding: "6px" }}>{v.odrazenych}</td>
                  <td style={{ padding: "6px", color: v.staznosti ? C.red : undefined }}>{v.staznosti}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>Otvorenia sú len hrubý údaj, niektoré poštové appky ich zapisujú samé. Spoľahlivejšie sú kliky a odpovede.</div>
        </Card>
      )}

      <OdpovedeZoznam odpovede={p.odpovede} onZmena={nacitaj} />

      <NastavenieKarta n={p.nastavenie} onZmena={nacitaj} />
    </>
  );
}
