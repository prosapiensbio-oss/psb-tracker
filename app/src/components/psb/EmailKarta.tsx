import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { NAZVY_KATEGORII, PORADIE_KATEGORII, maObsah, rozdelCitat, spojZalomene } from "../../lib/psb/emailTriedenie";
import type { Kategoria } from "../../lib/psb/emailTriedenie";
import { najblizsieOkno } from "../../lib/psb/mailOkno";
import { C } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { useUzke } from "./useUzke";
import { VyberMena } from "./VyberMena";

/**
 * KARTA EMAIL — schránka info@prosapiens.cz vo Workspace (Jerry, 12. 11. 2026,
 * návrh D: „B s prepínačom vľavo“).
 *
 * Ľavý zoznam je ROVNAKÝ v oboch polohách prepínača a roztriedený ako v B
 * (Klienti, Noví ľudia, Web a prevádzka, zbalené Ostatné). Prepínač mení LEN
 * pravú stranu: Email = jeden mail s pásom klienta, Ľudia = celý rozhovor
 * s tým človekom v bublinách, aj s faktúrami, SMS a zmluvami z Kokpitu.
 *
 * Text mailu sa načíta až pri otvorení — Kokpit si pamätá len hlavičky.
 * Nič neodchádza samo: odpoveď ide len klikom na „Odoslať“.
 */

type Email = {
  id: string; odMeno: string; odMail: string; odpovedatMail: string; komu: string; predmet: string; datum: string;
  kategoria: Kategoria; klient: string | null; dovod: string; stav: "nove" | "precitane" | "vybavene";
  vybavil: string | null; vybaveneAt: string | null; odpovedaneAt: string | null; telefon: string | null;
};
type Bublina =
  | { druh: "prisiel"; kedy: string; id: string; predmet: string; text: string | null }
  | { druh: "odoslany"; kedy: string; predmet: string; text: string; kto: string }
  | { druh: "faktura"; kedy: string; cislo: string; suma: number; komu: string }
  | { druh: "sms"; kedy: string; co: string; kto: string }
  | { druh: "zmluva"; kedy: string; co: string };

/**
 * Podpis odpovede z info@ — predvolene Terézia Zaťková (tvar z webu), nech píše ktokoľvek;
 * dá sa prepnúť (Jerry, 12. 11. 2026: „daj tam možnosť výberu podpisu“).
 * Posledná voľba sa pamätá v prehliadači.
 */
const PODPISY = ["Terézia Zaťková", "Filip Stráňavský"] as const;
const KLUC_PODPISU = "psb-email-podpis";
function ulozenyPodpis(): string {
  try { const v = localStorage.getItem(KLUC_PODPISU); if (v && (PODPISY as readonly string[]).includes(v)) return v; } catch { /* súkromné okno */ }
  return PODPISY[0];
}

const tl = { padding: "6px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted } as const;
const tlHlavne = { ...tl, background: C.accent, color: C.onAccent, border: `1px solid ${C.accent}`, fontWeight: 600 } as const;
/**
 * Doručený mail je „papier“ — svetlá plocha s tmavým písmom, ako ho uvidí
 * v schránke. Na zelenom skle splýval s appkou (Jerry, 12. 11. 2026).
 */
/**
 * Výška plochy karty na počítači sa MERIA: od vrchu plochy po spodok karty,
 * ktorá roluje (alebo obrazovky). Zoznam aj mail potom rolujú samy — inak
 * bola odpoveď odrezaná pod kartou (Jerry, 12. 11. 2026). Odhad „100vh mínus
 * hlavička“ nesedel o 60 px, lebo kartu obkolesuje rad kariet a bodky.
 */
function useVyskaPlochy(zapnute: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [vyska, setVyska] = useState(420);
  useLayoutEffect(() => {
    if (!zapnute) return;
    const zmeraj = () => {
      const el = ref.current;
      if (!el) return;
      let p = el.parentElement;
      let spodok = window.innerHeight;
      while (p) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY)) { spodok = Math.min(spodok, p.getBoundingClientRect().bottom); break; }
        p = p.parentElement;
      }
      const posun = p ? p.scrollTop : window.scrollY;
      setVyska(Math.max(300, Math.round(spodok - (el.getBoundingClientRect().top + posun) - 18)));
    };
    zmeraj();
    window.addEventListener("resize", zmeraj);
    return () => window.removeEventListener("resize", zmeraj);
  }, [zapnute]);
  return { ref, vyska };
}

const PAPIER = { background: "#f7f6f0", color: "#1A2E24", slaba: "#6b7568", linka: "#d9ddd2" } as const;

function TextMailu({ text, kompaktne }: { text: string; kompaktne?: boolean }) {
  const { nove, citat } = rozdelCitat(text);
  const [otvorene, setOtvorene] = useState(false);
  return (
    <div>
      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{spojZalomene(nove) || "(prázdny mail)"}</div>
      {citat && (
        <div style={{ marginTop: kompaktne ? 6 : 12 }}>
          <button onClick={() => setOtvorene((x) => !x)}
            style={{ background: "none", border: `1px solid ${PAPIER.linka}`, borderRadius: 999, padding: "2px 10px", fontSize: 11.5, color: PAPIER.slaba, cursor: "pointer", fontFamily: "inherit" }}>
            {otvorene ? "skryť citovanú správu" : "··· citovaná správa"}
          </button>
          {otvorene && (
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 8, paddingLeft: 10, borderLeft: `3px solid ${PAPIER.linka}`, color: PAPIER.slaba, fontSize: 13 }}>{citat}</div>
          )}
        </div>
      )}
    </div>
  );
}

function kedyKratko(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dnes = new Date();
  const den = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  if (den(d) === den(dnes)) return d.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "numeric", minute: "2-digit" });
  const vcera = new Date(dnes.getTime() - 864e5);
  if (den(d) === den(vcera)) return "včera";
  if (dnes.getTime() - d.getTime() < 6 * 864e5) return ["ne", "po", "ut", "st", "št", "pi", "so"][d.getDay()];
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}
function kedyCelo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}. ${d.getMonth() + 1}. o ${d.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "numeric", minute: "2-digit" })}`;
}
const czk = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

async function api<T>(url: string, body?: unknown): Promise<T & { ok: boolean; error?: string }> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 300)}` } as T & { ok: boolean; error?: string }; }
}

export function EmailKarta({ data, clients, mena, ktoSom, onProfil, onTerminy }: {
  data: PSBData; clients: Record<string, ClientAgg>; mena: string[]; ktoSom: string | null;
  onProfil: (meno: string) => void; onTerminy?: () => void;
}) {
  const uzke = useUzke();
  const [emaily, setEmaily] = useState<Email[] | null>(null);
  const [citane, setCitane] = useState<{ ok: string | null; posledny: string | null; chyba: string } | null>(null);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [ludia, setLudia] = useState(false);
  const [vybrany, setVybrany] = useState<string | null>(null);
  const [ostatneOtvorene, setOstatneOtvorene] = useState(false);
  const [ukazVybavene, setUkazVybavene] = useState(false);
  const [nacitavam, setNacitavam] = useState("");
  const prvyRaz = useRef(true);
  const plocha = useVyskaPlochy(!uzke);
  // Hláška o úspechu zmizne sama, chyba nie — tá čaká, kým si ju človek prečíta.
  useEffect(() => {
    if (!hlaska) return;
    const t = setTimeout(() => setHlaska(""), 8000);
    return () => clearTimeout(t);
  }, [hlaska]);

  const nacitaj = useCallback(async () => {
    const r = await api<{ emaily: Email[]; citane: { ok: string | null; posledny: string | null; chyba: string } }>("/api/email");
    if (!r.ok) { setChyba(r.error || "Nepodarilo sa načítať."); return null; }
    setChyba("");
    setEmaily(r.emaily);
    setCitane(r.citane);
    return r.emaily;
  }, []);

  useEffect(() => {
    void (async () => {
      const e = await nacitaj();
      // Prvé otvorenie nad prázdnou tabuľkou: hlavičky za posledný mesiac.
      if (e && e.length === 0 && prvyRaz.current) {
        prvyRaz.current = false;
        setNacitavam("Načítavam schránku za posledný mesiac…");
        const r = await api<{ pridanych: number }>("/api/email", { akcia: "nacitaj", dni: 30 });
        setNacitavam("");
        if (!r.ok) setChyba(r.error || "Schránku sa nepodarilo načítať.");
        else await nacitaj();
      }
    })();
  }, [nacitaj]);

  const nacitajTeraz = async () => {
    setNacitavam("Čítam schránku…");
    const r = await api<{ precitanych: number; pridanych: number }>("/api/mail-dopyty", { akcia: "stiahni" });
    setNacitavam("");
    if (!r.ok) setChyba(`Schránka neodpovedala: ${r.error || "neznáma chyba"}. Server občas odmietne aj správne heslo — skús o chvíľu znova.`);
    else setHlaska(r.precitanych ? `Prečítané · ${r.pridanych ? `${r.pridanych} nových dopytov` : "nových dopytov 0"}` : "Nič nové.");
    await nacitaj();
  };

  const nevybavene = (emaily || []).filter((e) => e.stav !== "vybavene");
  const skupiny = useMemo(() => {
    const out = new Map<Kategoria, Email[]>();
    for (const k of PORADIE_KATEGORII) out.set(k, []);
    for (const e of emaily || []) if (ukazVybavene || e.stav !== "vybavene") out.get(e.kategoria)?.push(e);
    return out;
  }, [emaily, ukazVybavene]);
  const vybavenychPocet = (emaily || []).length - nevybavene.length;
  const naVybavenie = nevybavene.filter((e) => e.kategoria !== "ostatne").length;
  const otvoreny = (emaily || []).find((e) => e.id === vybrany) || null;

  const zmenStav = async (e: Email, stav: "vybavene" | "vratit") => {
    const r = await api("/api/email", { akcia: "stav", id: e.id, stav });
    if (!r.ok) { setChyba(r.error || "Zápis zlyhal."); return; }
    if (stav === "vybavene") {
      setHlaska(`Vybavené: ${e.predmet || e.odMeno}`);
      // Ďalší nevybavený v tej istej skupine, aby sa dalo ísť ďalej bez hľadania.
      const dalsi = nevybavene.find((x) => x.id !== e.id && x.kategoria === e.kategoria) || nevybavene.find((x) => x.id !== e.id && x.kategoria !== "ostatne");
      setVybrany(dalsi?.id || null);
    }
    await nacitaj();
  };

  const posledne = citane?.ok ? kedyCelo(citane.ok) : "";
  const riadok = (e: Email) => {
    const on = e.id === vybrany;
    const nove = e.stav === "nove";
    return (
      <button key={e.id} onClick={() => setVybrany(e.id)}
        style={{
          display: "block", width: "100%", textAlign: "left", padding: "7px 9px", margin: "1px 0", borderRadius: 8, cursor: "pointer",
          fontFamily: "inherit", border: "none", background: on ? C.accentBg : "transparent", color: C.text,
          opacity: e.stav === "vybavene" ? 0.55 : 1, borderLeft: `3px solid ${nove ? C.accent : "transparent"}`,
        }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: nove ? 700 : 500, fontSize: 13 }}>
            {e.klient || e.odMeno || e.odMail}
          </span>
          {e.odpovedaneAt && <span title="odpovedané" style={{ fontSize: 11, color: C.green }}>↩</span>}
          <small style={{ color: C.textDim, fontSize: 11, flexShrink: 0 }}>{kedyKratko(e.datum)}</small>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.predmet || "(bez predmetu)"}</div>
      </button>
    );
  };

  const zoznam = (
    <div>
      {PORADIE_KATEGORII.map((k) => {
        const s = skupiny.get(k) || [];
        if (!s.length && k !== "klient" && k !== "novy") return null;
        const zbalene = k === "ostatne" && !ostatneOtvorene;
        return (
          <div key={k} style={{ marginBottom: 8 }}>
            <button onClick={() => k === "ostatne" && setOstatneOtvorene((x) => !x)}
              style={{ background: "none", border: "none", padding: "4px 2px", cursor: k === "ostatne" ? "pointer" : "default", fontFamily: "inherit", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700 }}>
              {k === "ostatne" ? (zbalene ? "▸ " : "▾ ") : ""}{NAZVY_KATEGORII[k]} <span style={{ fontWeight: 400 }}>· {s.filter((e) => e.stav !== "vybavene").length}</span>
            </button>
            {!zbalene && (s.length ? s.map(riadok) : <div style={{ fontSize: 12, color: C.textDim, padding: "2px 9px" }}>nič</div>)}
          </div>
        );
      })}
      {vybavenychPocet > 0 && (
        <button onClick={() => setUkazVybavene((x) => !x)} style={{ ...tl, fontSize: 11.5, marginTop: 4 }}>
          {ukazVybavene ? "skryť vybavené" : `ukázať vybavené (${vybavenychPocet})`}
        </button>
      )}
    </div>
  );

  const prepinac = uzke ? (
    <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 999, padding: 2 }}>
      {(["Email", "Ľudia"] as const).map((t, i) => (
        <button key={t} onClick={() => setLudia(i === 1)}
          style={{ ...tl, border: "none", borderRadius: 999, padding: "4px 12px", background: ludia === (i === 1) ? C.accentBg : "transparent", color: ludia === (i === 1) ? C.text : C.textMuted, fontWeight: ludia === (i === 1) ? 700 : 400 }}>
          {t}
        </button>
      ))}
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 4 }}>
      <small style={{ fontSize: 11, fontWeight: !ludia ? 700 : 400, color: !ludia ? C.text : C.textDim }}>Email</small>
      <button aria-label={ludia ? "Prepnúť na Email" : "Prepnúť na Ľudia"} onClick={() => setLudia((x) => !x)}
        style={{ width: 26, height: 72, borderRadius: 999, border: `1px solid ${C.border}`, background: C.track, position: "relative", cursor: "pointer", padding: 0 }}>
        <i style={{ position: "absolute", left: 3, top: ludia ? 47 : 3, width: 18, height: 20, borderRadius: 999, background: C.accent, transition: "top .18s" }} />
      </button>
      <small style={{ fontSize: 11, fontWeight: ludia ? 700 : 400, color: ludia ? C.text : C.textDim }}>Ľudia</small>
    </div>
  );

  const detail = otvoreny
    ? <Detail key={`${otvoreny.id}|${ludia ? "l" : "e"}`} e={otvoreny} ludia={ludia} data={data} clients={clients} mena={mena} ktoSom={ktoSom}
        onProfil={onProfil} onTerminy={onTerminy} onStav={zmenStav} onZmena={nacitaj} setHlaska={setHlaska} setChyba={setChyba}
        onSpat={uzke ? () => setVybrany(null) : undefined} naVysku={!uzke} />
    : <div style={{ color: C.textDim, fontSize: 13, padding: "30px 10px", textAlign: "center" }}>
        {emaily === null ? "Načítavam…" : naVybavenie ? "Vyber mail vľavo." : "Všetko vybavené."}
      </div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
        <div style={{ fontSize: 12, color: C.textDim, flex: 1, minWidth: 200 }}>
          info@prosapiens.cz{posledne ? ` · načítané ${posledne}` : ""} · ďalšie {najblizsieOkno(new Date())}
          {" · "}
          <button onClick={nacitajTeraz} disabled={!!nacitavam} style={{ background: "none", border: "none", padding: 0, color: C.accentLight, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
            ↻ načítať teraz
          </button>
        </div>
        {uzke && prepinac}
      </div>
      {citane?.chyba && citane.posledny !== citane.ok && (
        <div style={{ fontSize: 12, color: C.orange, marginBottom: 6 }}>Posledné čítanie zlyhalo ({citane.chyba.slice(0, 120)}) — zoznam je z {posledne || "predošlého čítania"}.</div>
      )}
      {nacitavam && <div style={{ fontSize: 12.5, color: C.accentLight, margin: "6px 0" }}>{nacitavam}</div>}
      {chyba && <div style={{ fontSize: 12.5, color: C.red, margin: "6px 0" }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12.5, color: C.green, margin: "6px 0" }}>{hlaska}</div>}

      {uzke ? (
        <div style={{ marginTop: 8 }}>{otvoreny ? detail : zoznam}</div>
      ) : (
        <div ref={plocha.ref} style={{ display: "grid", gridTemplateColumns: "44px minmax(220px, 300px) minmax(0, 1fr)", gap: 12, marginTop: 10, alignItems: "stretch", height: plocha.vyska }}>
          {prepinac}
          <div style={{ borderRight: `1px solid ${C.border}`, paddingRight: 10, overflowY: "auto", minHeight: 0 }}>{zoznam}</div>
          <div style={{ minWidth: 0, minHeight: 0 }}>{detail}</div>
        </div>
      )}
    </div>
  );
}

function PasKlienta({ meno, data, clients, onProfil }: { meno: string; data: PSBData; clients: Record<string, ClientAgg>; onProfil: (m: string) => void }) {
  const c = clients[meno];
  const dlh = (data.dlhy || []).filter((d) => d.klient === meno).reduce((a, d) => a + (d.doplatit || 0), 0);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", fontSize: 12.5, padding: "7px 10px", borderRadius: 9, background: C.accentBg, color: C.textMuted, margin: "8px 0" }}>
      <b style={{ color: C.text }}>● {meno}</b>
      {c?.primaryTrainer && c.primaryTrainer !== "—" && <span>{c.primaryTrainer}</span>}
      {c && <span>zostatok <b style={{ color: (c.packageRemaining ?? 0) < 0 ? C.red : C.text }}>{c.packageRemaining ?? 0} h</b></span>}
      <span>dlh <b style={{ color: dlh > 0 ? C.red : C.text }}>{czk(dlh)}</b></span>
      <button onClick={() => onProfil(meno)} style={{ ...tl, padding: "3px 9px", marginLeft: "auto" }}>Profil →</button>
    </div>
  );
}

function Detail({ e, ludia, data, clients, mena, ktoSom, onProfil, onTerminy, onStav, onZmena, setHlaska, setChyba, onSpat, naVysku }: {
  e: Email; ludia: boolean; data: PSBData; clients: Record<string, ClientAgg>; mena: string[]; ktoSom: string | null;
  onProfil: (m: string) => void; onTerminy?: () => void; onStav: (e: Email, s: "vybavene" | "vratit") => Promise<void>;
  onZmena: () => Promise<unknown>; setHlaska: (s: string) => void; setChyba: (s: string) => void; onSpat?: () => void;
  /** Na počítači vyplní výšku plochy: hlavička hore, mail v strede roluje, odpoveď dole. */
  naVysku?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [bubliny, setBubliny] = useState<Bublina[] | null>(null);
  const [chybaDetailu, setChybaDetailu] = useState("");
  const [podpis, setPodpis] = useState(ulozenyPodpis);
  const [odpoved, setOdpoved] = useState(() => `Dobrý den,\n\n\n\nS pozdravem\n${ulozenyPodpis()}\nProSapiens Biomechanic`);
  const zmenPodpis = (novy: string) => {
    setOdpoved((t) => (t.includes(podpis) ? t.split(podpis).join(novy) : `${t.trimEnd()}\n${novy}`));
    setPodpis(novy);
    try { localStorage.setItem(KLUC_PODPISU, novy); } catch { /* nevadí */ }
  };
  const [komu, setKomu] = useState(e.odpovedatMail);
  const [posielam, setPosielam] = useState(false);
  /** Odpoveď je zbalená — Terezka dopytom volá; mail sa píše len občas. */
  const [pisem, setPisem] = useState(false);
  const [preradit, setPreradit] = useState(false);
  const [klientNovy, setKlientNovy] = useState("");

  useEffect(() => {
    let zive = true;
    void (async () => {
      if (ludia) {
        const r = await api<{ bubliny: Bublina[]; chybaTiel: string }>(`/api/email?ludia=${encodeURIComponent(e.id)}`);
        if (!zive) return;
        if (!r.ok) setChybaDetailu(r.error || "Rozhovor sa nepodarilo načítať.");
        else { setBubliny(r.bubliny); if (r.chybaTiel) setChybaDetailu(`Text mailov sa nepodarilo načítať zo schránky: ${r.chybaTiel}`); }
      } else {
        const r = await api<{ text: string }>(`/api/email?telo=${encodeURIComponent(e.id)}`);
        if (!zive) return;
        if (!r.ok) setChybaDetailu(r.error || "Mail sa nepodarilo načítať.");
        else setText(r.text);
      }
      if (e.stav === "nove") void onZmena();
    })();
    return () => { zive = false; };
  }, [e.id, ludia]); // eslint-disable-line react-hooks/exhaustive-deps

  const posli = async (vybav: boolean) => {
    if (posielam) return;
    if (!maObsah(odpoved)) { setChyba("Odpoveď je prázdna — napíš niečo medzi pozdrav a podpis."); return; }
    setPosielam(true);
    const citat = !ludia && text ? text : "";
    const citatHlavicka = citat ? `${kedyCelo(e.datum)} napsal(a) ${e.odMeno || e.odMail}:` : "";
    const r = await api<{ komu: string[] }>("/api/email", { akcia: "odpovedz", id: e.id, komu, predmet: /^re:/i.test(e.predmet) ? e.predmet : `Re: ${e.predmet}`, text: odpoved, citat, citatHlavicka, podpis, vybav });
    setPosielam(false);
    if (!r.ok) { setChyba(r.error || "Mail neodišiel."); return; }
    setHlaska(`Odoslané na ${(r.komu || []).join(", ")}${vybav ? " · vybavené" : ""}`);
    if (vybav) await onStav(e, "vybavene").catch(() => undefined);
    else await onZmena();
  };

  const dopyt = async () => {
    const r = await api<{ uzBol: boolean; meno: string }>("/api/email", { akcia: "dopyt", id: e.id });
    if (!r.ok) { setChyba(r.error || "Dopyt sa nezapísal."); return; }
    setHlaska(r.uzBol ? `${r.meno} už v dopytoch je — nič nové som nezapísal.` : `Zapísané do dopytov: ${r.meno}`);
    await onZmena();
  };

  const prerad = async (v: { kategoria?: Kategoria; klient?: string }) => {
    const r = await api("/api/email", { akcia: "prerad", id: e.id, ...v });
    if (!r.ok) { setChyba(r.error || "Preradenie zlyhalo."); return; }
    setPreradit(false);
    setHlaska(v.klient ? `Priradené klientovi ${v.klient}` : "Preradené");
    await onZmena();
  };

  const akcie = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", margin: "10px 0 8px" }}>
      {/* Telefón prvý — Terezka dopytom volá, nepíše (Jerry, 12. 11. 2026). */}
      {e.telefon && (
        <a href={`tel:${e.telefon.replace(/[^\d+]/g, "")}`} style={{ ...tlHlavne, textDecoration: "none", display: "inline-block" }}>📞 Zavolať {e.telefon}</a>
      )}
      {e.stav === "vybavene"
        ? <button onClick={() => void onStav(e, "vratit")} style={tl}>Vrátiť medzi nevybavené</button>
        : <button onClick={() => void onStav(e, "vybavene")} style={{ ...tl, color: C.text, fontWeight: 600 }}>✓ Vybavené</button>}
      {e.kategoria !== "klient" && <button onClick={dopyt} style={tl}>＋ Zapísať ako dopyt</button>}
      {onTerminy && <button onClick={onTerminy} style={tl}>Ponúknuť termíny</button>}
      <button onClick={() => setPreradit((x) => !x)} style={{ ...tl, border: "none" }}>preradiť…</button>
    </div>
  );

  const pisanie = !pisem ? (
    <div style={{ marginTop: 10, flex: "none" }}>
      <button onClick={() => setPisem(true)} style={{ ...tl, color: C.text }}>✉ Odpísať mailom</button>
    </div>
  ) : (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, flex: "none" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700, marginBottom: 6 }}>Odpoveď</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: C.textDim, marginBottom: 6 }}>
        komu <input value={komu} onChange={(x) => setKomu(x.target.value)} style={{ flex: "1 1 200px", minWidth: 0, padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontFamily: "inherit", fontSize: 12.5 }} />
        <span style={{ marginLeft: 6 }}>podpis</span>
        {PODPISY.map((p) => (
          <button key={p} onClick={() => zmenPodpis(p)}
            style={{ ...tl, padding: "3px 9px", fontSize: 12, background: p === podpis ? C.accentBg : "transparent", color: p === podpis ? C.text : C.textMuted, fontWeight: p === podpis ? 700 : 400 }}>
            {p}
          </button>
        ))}
      </div>
      <textarea value={odpoved} onChange={(x) => setOdpoved(x.target.value)} rows={5}
        style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.45, resize: "vertical" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
        <button onClick={() => void posli(true)} disabled={posielam || !maObsah(odpoved)} style={{ ...tlHlavne, opacity: maObsah(odpoved) ? 1 : 0.45 }}>{posielam ? "Posielam…" : "Odoslať a vybaviť"}</button>
        <button onClick={() => void posli(false)} disabled={posielam || !maObsah(odpoved)} style={{ ...tl, opacity: maObsah(odpoved) ? 1 : 0.45 }}>len odoslať</button>
        {!ludia && <small style={{ color: C.textDim }}>pôvodný mail ide pod tvoj text</small>}
      </div>
    </div>
  );

  return (
    <div style={naVysku ? { display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" } : undefined}>
      {onSpat && <button onClick={onSpat} style={{ ...tl, marginBottom: 8 }}>‹ späť na zoznam</button>}
      {!ludia ? (
        <>
          <h4 style={{ margin: "0 0 3px", fontSize: 16, color: C.text }}>{e.predmet || "(bez predmetu)"}</h4>
          <div style={{ fontSize: 12, color: C.textDim }}>
            <b style={{ color: C.textMuted }}>{e.odMeno}</b>{e.odMail && e.odMail !== e.odMeno ? ` <${e.odMail}>` : ""} · {kedyCelo(e.datum)}
            {e.dovod ? ` · ${e.dovod}` : ""}{e.vybavil ? ` · vybavil(a) ${e.vybavil}` : ""}
          </div>
        </>
      ) : !e.klient && <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{e.odMeno} <span style={{ fontWeight: 400, fontSize: 12, color: C.textDim }}>{e.odMail}</span></div>}
      {e.klient && <PasKlienta meno={e.klient} data={data} clients={clients} onProfil={onProfil} />}
      {akcie}
      {preradit && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: 8, border: `1px dashed ${C.border}`, borderRadius: 9, margin: "6px 0" }}>
          <span style={{ fontSize: 12, color: C.textDim }}>je to klient:</span>
          <VyberMena hodnota={klientNovy} mena={mena} onZmen={setKlientNovy} style={{ width: 180 }} />
          <button disabled={!mena.includes(klientNovy)} onClick={() => void prerad({ klient: klientNovy })} style={tl}>priradiť</button>
          <span style={{ fontSize: 12, color: C.textDim, marginLeft: 6 }}>alebo do skupiny:</span>
          {PORADIE_KATEGORII.filter((k) => k !== "klient" && k !== e.kategoria).map((k) => (
            <button key={k} onClick={() => void prerad({ kategoria: k })} style={{ ...tl, padding: "3px 9px" }}>{NAZVY_KATEGORII[k].split(" —")[0]}</button>
          ))}
        </div>
      )}
      {chybaDetailu && <div style={{ fontSize: 12.5, color: C.orange, margin: "6px 0" }}>{chybaDetailu}</div>}

      {!ludia ? (
        <div style={{ ...PAPIER, fontSize: 14.5, lineHeight: 1.6, padding: "16px 20px", borderRadius: 10, ...(naVysku ? { flex: "1 1 0", minHeight: 120 } : { maxHeight: "50vh" }), overflowY: "auto", boxShadow: "0 1px 0 rgba(0,0,0,.08)" }}>
          {text === null && !chybaDetailu ? <span style={{ color: PAPIER.slaba }}>Načítavam text zo schránky…</span> : <TextMailu text={text || ""} />}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, ...(naVysku ? { flex: "1 1 0", minHeight: 160 } : { maxHeight: "55vh" }), overflowY: "auto", padding: "4px 2px" }}>
          {bubliny === null && !chybaDetailu && <span style={{ color: C.textDim, fontSize: 13 }}>Skladám rozhovor…</span>}
          {(bubliny || []).map((b, i) => {
            const nasa = b.druh !== "prisiel";
            const stitok = b.druh === "prisiel" ? "mail" : b.druh === "odoslany" ? `naša odpoveď${b.kto ? ` · ${b.kto}` : ""}` : b.druh === "faktura" ? "Kokpit · faktúra" : b.druh === "sms" ? `SMS${b.kto ? ` · ${b.kto}` : ""}` : "Kokpit · zmluva";
            const aktualny = b.druh === "prisiel" && b.id === e.id;
            const maly = b.druh === "faktura" || b.druh === "sms" || b.druh === "zmluva";
            return (
              <div key={i} style={{
                alignSelf: nasa ? "flex-end" : "flex-start", maxWidth: "82%", padding: maly ? "6px 11px" : "10px 13px", borderRadius: 12,
                ...(nasa ? { background: C.accentBg, color: C.text } : { background: PAPIER.background, color: PAPIER.color }),
                border: aktualny ? `2px solid ${C.accent}` : "1px solid transparent",
                fontSize: maly ? 12.5 : 13.5, lineHeight: 1.5,
              }}>
                {(b.druh === "odoslany" || b.druh === "prisiel") && b.predmet && (
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: nasa ? C.textMuted : PAPIER.slaba, marginBottom: 3 }}>{b.predmet}</div>
                )}
                {b.druh === "prisiel" ? (b.text === null ? <span style={{ color: PAPIER.slaba }}>(text sa nenačítal)</span> : <TextMailu text={b.text} kompaktne />)
                  : b.druh === "odoslany" ? <TextMailu text={b.text} kompaktne />
                  : b.druh === "faktura" ? `Faktúra ${b.cislo} · ${czk(b.suma)}${b.komu ? ` → ${b.komu}` : ""}` : b.co}
                <small style={{ display: "block", fontSize: 10.5, color: nasa ? C.textDim : PAPIER.slaba, marginTop: 4 }}>{stitok} · {kedyCelo(b.kedy)}</small>
              </div>
            );
          })}
          {bubliny && !bubliny.length && <span style={{ color: C.textDim, fontSize: 13 }}>Zatiaľ nič.</span>}
        </div>
      )}
      {pisanie}
    </div>
  );
}
