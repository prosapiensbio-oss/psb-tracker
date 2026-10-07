import { oznam } from "../../lib/psb/obnovaSignal";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { nazovKategorie } from "../../lib/psb/vzas";
import { C, mix, S } from "../../lib/psb/theme";
import { kategorieZoznam } from "./Banka";
import { cakaNaPotvrdenie, jePotvrdeny, patriDoFiltra, stavPrijmu, type FilterPohybov } from "../../lib/psb/filtrePohybov";
import { platnySplit, rozdelPohyb, type PohybSplits, type SplitCiast } from "../../lib/psb/pohybSplit";
import { VyberKategorie } from "./VyberKategorie";
import { Card, Empty, H3, Info, TableWrap } from "./ui";

// Čo je už zapísané — a možnosť to prehodiť.
//
// Náhľad pred zápisom bol dôkladný, ale po zápise sa kategória nedala zmeniť.
// Jeden nesprávny klik bol trvalý, a to má nepríjemný dôsledok: človek sa
// potom bojí zapísať čokoľvek, čím si nie je istý, a radšej nechá riadok
// prázdny. Nástroj, ktorý trestá omyl, si vychová opatrnosť namiesto poriadku.
//
// Druhá polovica obrazovky sú naučené pravidlá. Zle zaradené pravidlo sa
// tichým opakovaním zavlečie do každého ďalšieho mesiaca — preto musí byť
// vidieť a musí sa dať zmazať.

type Pohyb = {
  datum: string; suma: number; protistrana: string; poznamka: string; typ: string; kategoria: string; kluc: string;
  /** Pri príjme: komu ho krok Platby a balíčky priradil / že nie je klient. */
  klienti?: string; nieKlient?: boolean;
  /** Výdavok: Jerry potvrdil kategóriu (inak je to len návrh Kokpitu). */
  potvrdene?: boolean;
};
type Pravidlo = { vzor: string; kategoria: string };

/** Jeden krok späť: pôvodný stav riadkov pred akciou. */
type KrokSpat = { popis: string; stav: { kluc: string; kategoria: string; potvrdene: boolean }[] };
/**
 * Koľko krokov späť. Jerry chcel „aspoň 5/10". Jeden krok je jeden klik,
 * aj keď potvrdil 59 riadkov naraz — desať klikov dozadu pokryje každý
 * zbrklý ťah, a staršie chyby sa aj tak opravia priamo v riadku.
 */
const KROKOV_SPAT = 10;
const SPAT_KLUC = "psb-banka-spat";

export function BankaUlozene({ focus, pohybSplits, onSplit, uzavierka, onPlatby }: {
  focus?: { month?: string; kategoria?: string; nonce?: number } | null;
  /** Rozdelenia/priradenia pohybov z App (split telefónu, príjem, vrátenie). */
  pohybSplits?: PohybSplits;
  /** Uloží rozdelenie jedného pohybu; prázdny zoznam ho zruší. Bez tejto
   *  funkcie sa rozdeľovanie neponúkne (napr. keď komponent nemá kam zapísať). */
  onSplit?: (kluc: string, casti: SplitCiast[]) => void;
  /** V uzávierke mesiaca: začína na nákladoch, mesiac je daný krokom. */
  uzavierka?: boolean;
  /** Preklik na krok Platby a balíčky — tam sa príjmy priraďujú klientom. */
  onPlatby?: () => void;
} = {}) {
  const [pohyby, setPohyby] = useState<Pohyb[]>([]);
  const [pravidla, setPravidla] = useState<Pravidlo[]>([]);
  const [nacitane, setNacitane] = useState(false);
  const [otvorene, setOtvorene] = useState(false);
  const [oznacene, setOznacene] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterPohybov>(uzavierka ? "naklady" : "vsetko");
  const [hladat, setHladat] = useState("");
  // Filter mesiaca. Pri sedemsto pohyboch je "ukáž mi júl" najčastejšia otázka
  // vôbec — bez neho sa musí scrollovať cez pol roka.
  const [mesiac, setMesiac] = useState("");
  /** Kategória z prekliku — „ukáž mi tie dva pohyby, ktoré sa zdvojili". */
  const [ibaKat, setIbaKat] = useState("");
  const [busy, setBusy] = useState(false);
  const [sprava, setSprava] = useState("");
  const KAT = useMemo(kategorieZoznam, []);
  // Krok späť prežije prepnutie karty aj obnovenie stránky v tej istej záložke.
  const [spat, setSpat] = useState<KrokSpat[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(SPAT_KLUC) || "[]") as KrokSpat[]; } catch { return []; }
  });
  const uloz = (h: KrokSpat[]) => { try { sessionStorage.setItem(SPAT_KLUC, JSON.stringify(h)); } catch { /* bez pamäte len do obnovenia */ } };
  const zapamataj = (popis: string, kluce: string[]) => {
    const vyber = new Set(kluce);
    const stav = pohyby.filter((p) => vyber.has(p.kluc)).map((p) => ({ kluc: p.kluc, kategoria: p.kategoria || "", potvrdene: !!p.potvrdene }));
    if (!stav.length) return;
    setSpat((h) => { const n = [...h, { popis, stav }].slice(-KROKOV_SPAT); uloz(n); return n; });
  };
  const koren = useRef<HTMLDivElement>(null);
  // Rozdeľovanie pohybu: kľúč otvoreného riadku + rozpracované časti.
  const [delenyKluc, setDelenyKluc] = useState<string | null>(null);
  const [koncept, setKoncept] = useState<SplitCiast[]>([]);
  const popisCiel = (ciel: string) => KAT.find((k) => k.value === ciel)?.label || nazovKategorie(ciel) || ciel;
  const otvorDelenie = (kluc: string) => {
    const jest = pohybSplits?.[kluc];
    setKoncept(jest && jest.length ? jest.map((c) => ({ ...c })) : [{ ciel: "", pct: 50 }, { ciel: "", pct: 50 }]);
    setDelenyKluc(kluc);
  };
  const suciastPct = koncept.reduce((a, c) => a + (c.pct || 0), 0);

  const nacitaj = () => {
    void fetch("/api/fio", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { pohyby?: Pohyb[]; pravidla?: Pravidlo[] }) => {
        setPohyby(j.pohyby || []);
        setPravidla(j.pravidla || []);
        setNacitane(true);
      })
      .catch(() => setNacitane(true));
  };
  useEffect(nacitaj, []);

  const mesiace = [...new Set(pohyby.map((p) => String(p.datum).slice(0, 7)))].sort().reverse();
  const maSplit = (p: Pohyb) => platnySplit(pohybSplits?.[p.kluc]);
  // Počty na tlačidlách platia pre zvolený mesiac — „Všetko (912)" pri
  // septembri, z ktorého je vidieť 122, mátlo.
  const zMesiaca = mesiac ? pohyby.filter((p) => String(p.datum).slice(0, 7) === mesiac) : pohyby;
  // V uzávierke potvrdené výdavky z plochy miznú — vidieť ich pod
  // „Potvrdené" a „Všetko". Počty na tlačidlách hovoria, čo ešte ostáva.
  const skryPotvrdene = !!uzavierka && filter !== "potvrdene" && filter !== "vsetko";
  const pocet = (f: FilterPohybov) => zMesiaca.filter((p) => patriDoFiltra(p, f, maSplit(p))
    && !(uzavierka && f !== "potvrdene" && f !== "vsetko" && jePotvrdeny(p, maSplit(p)))).length;
  const cakaPrijmov = zMesiaca.filter((p) => p.suma > 0 && stavPrijmu(p, maSplit(p)) === "caka").length;
  const viditelne = pohyby.filter((p) => {
    if (mesiac && String(p.datum).slice(0, 7) !== mesiac) return false;
    if (ibaKat && p.kategoria !== ibaKat) return false;
    if (!patriDoFiltra(p, filter, maSplit(p))) return false;
    if (skryPotvrdene && jePotvrdeny(p, maSplit(p))) return false;
    if (hladat.trim()) {
      const h = hladat.trim().toLowerCase();
      if (!`${p.protistrana} ${p.poznamka}`.toLowerCase().includes(h)) return false;
    }
    return true;
  });

  // Čo ešte treba prejsť: návrhy Kokpitu aj výdavky bez kategórie.
  const naKontrolu = zMesiaca.filter((p) => cakaNaPotvrdenie(p, maSplit(p)) || patriDoFiltra(p, "nezaradene", maSplit(p))).length;

  /** Bez `kluce` sa mení celý označený výber; s nimi len tie riadky. */
  const zmen = async (kategoria: string, kluce?: string[], poznamka?: string) => {
    const vyber = kluce ? new Set(kluce) : oznacene;
    const zmeny = pohyby.filter((p) => vyber.has(p.kluc))
      .map((p) => ({ kluc: p.kluc, kategoria, datum: p.datum, ...(poznamka !== undefined ? { poznamka } : {}) }));
    if (!zmeny.length) return;
    // Dopísaná poznámka nie je rozhodnutie o kategórii: nepotvrdzuje
    // a do krokov späť nejde.
    const lenPoznamka = poznamka !== undefined;
    if (!lenPoznamka) zapamataj(`zaradenie ${zmeny.length === 1 ? "1 pohybu" : `${zmeny.length} pohybov`} → ${popisCiel(kategoria) || "bez kategórie"}`, zmeny.map((z) => z.kluc));
    setBusy(true);
    const r = await fetch("/api/fio", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "kategoria", zmeny, ...(lenPoznamka ? { potvrd: false } : {}) }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      if (!lenPoznamka) setSprava(`${uzavierka && kategoria ? "Zaradené a potvrdené" : "Prehodené"}: ${r.zmenene}${r.zamknute ? `, ${r.zamknute} odmietnutých (uzavretý mesiac)` : ""}. ⌘Z vráti.`);
      if (!kluce) setOznacene(new Set());
      nacitaj();
      oznam("peniaze");
      setTimeout(() => setSprava(""), 5000);
    } else setSprava("Zmena sa nepodarila.");
  };

  /** Potvrdí (alebo so `zrus` vráti medzi návrhy) dané výdavky. */
  const potvrd = async (kluce: string[], zrus = false) => {
    if (!kluce.length) return;
    zapamataj(`${zrus ? "vrátenie" : "potvrdenie"} ${kluce.length === 1 ? "1 výdavku" : `${kluce.length} výdavkov`}`, kluce);
    setBusy(true);
    const r = await fetch("/api/fio", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "potvrd", kluce, zrus, rozdelene: kluce.filter((k) => platnySplit(pohybSplits?.[k])) }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      setSprava(`${zrus ? "Vrátené medzi návrhy" : "Potvrdené"}: ${r.potvrdene}${r.preskocene ? ` · ${r.preskocene} preskočených (bez kategórie alebo uzavretý mesiac)` : ""}. ⌘Z vráti.`);
      setOznacene(new Set());
      nacitaj();
      oznam("peniaze");
      setTimeout(() => setSprava(""), 6000);
    } else setSprava("Potvrdenie sa nepodarilo.");
  };

  /** Krok späť — vráti kategóriu aj potvrdenie riadkov pred poslednou akciou. */
  const krokSpat = useCallback(async () => {
    const posledny = spat[spat.length - 1];
    if (!posledny || busy) return;
    setBusy(true);
    const r = await fetch("/api/fio", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "obnov", stav: posledny.stav }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setSprava("Krok späť sa nepodaril."); return; }
    setSpat((h) => { const n = h.slice(0, -1); uloz(n); return n; });
    setSprava(`Vrátené: ${posledny.popis}${r.zamknute ? ` (${r.zamknute} v uzavretom mesiaci ostalo)` : ""}.`);
    setTimeout(() => setSprava(""), 6000);
    nacitaj();
    oznam("peniaze");
  }, [spat, busy]);

  // ⌘Z / Ctrl+Z — len keď je táto obrazovka naozaj vidieť (karty Workspace
  // ostávajú načítané a schované) a človek práve nepíše do poľa.
  useEffect(() => {
    const naKlaves = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const el = koren.current;
      if (!el || !el.getClientRects().length || getComputedStyle(el).visibility !== "visible") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      void krokSpat();
    };
    window.addEventListener("keydown", naKlaves);
    return () => window.removeEventListener("keydown", naKlaves);
  }, [krokSpat]);

  const oznacRovnake = (protistrana: string) => {
    const k = protistrana.trim().toLowerCase();
    if (!k) return;
    setOznacene((p) => {
      const n = new Set(p);
      for (const x of pohyby) if (x.protistrana.trim().toLowerCase() === k) n.add(x.kluc);
      return n;
    });
  };

  /**
   * Preklik z notifikácie o dvojitom zápise alebo nezhode príjmov.
   *
   * Karta je zabalená a pri sedemsto pohyboch je „nájdi tie dva z júla"
   * práca na minútu. S cieľom sa otvorí, nafiltruje na mesiac a kategóriu
   * a človek vidí presne tie riadky, o ktorých upozornenie hovorí.
   */
  useEffect(() => {
    if (!focus?.month && !focus?.kategoria) return;
    setOtvorene(true);
    if (focus.month) setMesiac(focus.month);
    setIbaKat(focus.kategoria || "");
    // Preklik na konkrétnu kategóriu nesmie zostať schovaný za filtrom.
    if (focus.kategoria) setFilter("vsetko");
  }, [focus?.month, focus?.kategoria, focus?.nonce]);

  // Pohyb s platným rozdelením (split) je zaradený, aj keď jeho surové pole
  // `category` je prázdne — split ho v P&L kryje. Bez tohto svietil telefón
  // −8999 ako „bez kategórie", hoci má 50/50 split (Jerry, 6. 9. 2026).
  // Len výdavky: príjem kategóriu nepotrebuje (viď filtrePohybov.ts).
  const nezaradenych = pohyby.filter((p) => patriDoFiltra(p, "nezaradene", maSplit(p))).length;
  if (!nacitane || !pohyby.length) return null;

  return (
    <div ref={koren}>
    <Card>
      <div onClick={() => !uzavierka && setOtvorene((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: uzavierka ? "default" : "pointer", flexWrap: "wrap" }}>
        {!uzavierka && <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{otvorene ? "▼" : "▶"}</span>}
        <H3><Info label={uzavierka && mesiac ? `Pohyby za ${mesiac} (${zMesiaca.length})` : `Zapísané pohyby (${pohyby.length})`} text="Čo už je v databáze. Kategóriu sa dá prehodiť aj dodatočne — označ riadky a vyber novú. Uzavreté mesiace sa nemenia." /></H3>
        {uzavierka && (
          <span style={{ fontSize: 11.5, color: naKontrolu ? C.orange : C.green }}>{naKontrolu ? `${naKontrolu} na kontrolu` : "všetko skontrolované ✓"}</span>
        )}
        {(uzavierka ? pocet("nezaradene") : nezaradenych) > 0 && (
          <span style={{ fontSize: 11.5, color: C.orange }}>{uzavierka ? pocet("nezaradene") : nezaradenych} výdavkov bez kategórie</span>
        )}
      </div>

      {(otvorene || uzavierka) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
            {ibaKat && (
              <button onClick={() => setIbaKat("")}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
                len {nazovKategorie(ibaKat)} ✕
              </button>
            )}
            {([
              ["naklady", "Náklady", "Všetko, čo odišlo z účtu okrem výplat a súkromného — aj to, čo ešte nemá kategóriu."],
              ["nezaradene", "Nezaradené", "Výdavky bez kategórie. Bez nej sa nedostanú do P&L."],
              ...(uzavierka ? [["potvrdene", "Potvrdené", "Čo si už skontroloval — z ostatných filtrov zmizlo."] as const] : []),
              ["vyplaty", "Výplaty", "Peniaze vyplatené Jerrymu a Terezke."],
              ["sukromne", "Súkromné", "Výdavky zaradené mimo firmu — kontrola, že tam nespadlo nič firemné."],
              ["prijmy", "Príjmy", "Čo prišlo na účet. Klientom sa priraďujú v kroku Platby a balíčky; tu je len stav."],
              ["vsetko", "Všetko", ""],
            ] as const).map(([id, lbl, tip]) => {
              const n = pocet(id);
              const pozor = (id === "nezaradene" && n > 0) || (id === "prijmy" && cakaPrijmov > 0);
              return (
                <button key={id} onClick={() => setFilter(id)} title={tip || undefined}
                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    border: `1px solid ${filter === id ? C.accent : C.border}`,
                    background: filter === id ? mix(C.accent, 12) : "transparent",
                    color: filter === id ? C.accentLight : pozor ? C.orange : C.textMuted }}>
                  {lbl} ({n}){id === "prijmy" && cakaPrijmov > 0 ? ` · ${cakaPrijmov} čaká` : ""}
                </button>
              );
            })}
            {!uzavierka && <select value={mesiac} onChange={(e) => setMesiac(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: 8, border: `1px solid ${mesiac ? C.accent : C.border}`, background: C.bg, color: mesiac ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
              <option value="">Všetky mesiace</option>
              {mesiace.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>}
            <input value={hladat} onChange={(e) => setHladat(e.target.value)} placeholder="Hľadať v protistrane…"
              style={{ flex: "1 1 180px", minWidth: 0, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
          </div>

          {sprava && <div style={{ marginBottom: 10, padding: "8px 11px", borderRadius: 8, background: mix(C.green, 12), color: C.text, fontSize: 12.5 }}>{sprava}</div>}

          {oznacene.size > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, padding: "9px 12px", borderRadius: 9, background: mix(C.accent, 10), border: `1px solid ${mix(C.accent, 32)}` }}>
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>Označených {oznacene.size}</span>
              <select value="" disabled={busy} onChange={(e) => e.target.value && void zmen(e.target.value)}
                style={{ background: C.bg, color: C.text, border: `1px solid ${mix(C.accent, 45)}`, borderRadius: 7, fontSize: 12, padding: "5px 7px", maxWidth: 280, cursor: "pointer" }}>
                <option value="">— prehodiť na kategóriu —</option>
                {[...new Set(KAT.map((k) => k.skupina))].filter(Boolean).map((sk) => (
                  <optgroup key={sk} label={sk}>
                    {KAT.filter((k) => k.skupina === sk).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </optgroup>
                ))}
              </select>
              {(() => {
                const naPotvrdenie = pohyby.filter((p) => oznacene.has(p.kluc) && cakaNaPotvrdenie(p, maSplit(p)));
                return naPotvrdenie.length > 0 && (
                  <button disabled={busy} onClick={() => void potvrd(naPotvrdenie.map((p) => p.kluc))}
                    style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 16), color: C.green, fontFamily: "inherit" }}>
                    {busy ? "…" : `✓ Potvrdiť označené (${naPotvrdenie.length})`}
                  </button>
                );
              })()}
              <button onClick={() => setOznacene(new Set())} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zrušiť výber</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, color: C.textDim, marginBottom: 8 }}>
            <span>
              {uzavierka
                ? "✓ vpravo potvrdí riadok a ten zmizne. Viac naraz: začiarkni ich vľavo (hore vľavo všetky) a daj Potvrdiť označené."
                : "Klik na meno protistrany označí všetky jej pohyby."}
              {" "}Zobrazených {viditelne.length} z {pohyby.length}.
            </span>
            <span style={{ marginLeft: "auto" }} />
            <button disabled={!spat.length || busy} onClick={() => void krokSpat()}
              title={spat.length ? `Vráti: ${spat[spat.length - 1].popis} (⌘Z)` : "Zatiaľ nie je čo vracať"}
              style={{ padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: spat.length ? "pointer" : "default", border: `1px solid ${spat.length ? C.border : mix(C.border, 50)}`, background: "transparent", color: spat.length ? C.text : C.textDim, fontFamily: "inherit" }}>
              ↶ Krok späť{spat.length ? ` (${spat.length})` : ""}
            </button>
          </div>


          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                  <th style={{ ...S.th, width: 28 }}>
                    <input type="checkbox"
                      checked={viditelne.length > 0 && viditelne.every((p) => oznacene.has(p.kluc))}
                      onChange={(e) => setOznacene((prev) => {
                        const n = new Set(prev);
                        viditelne.forEach((p) => (e.target.checked ? n.add(p.kluc) : n.delete(p.kluc)));
                        return n;
                      })}
                      style={{ accentColor: C.accent, cursor: "pointer" }} />
                  </th>
                  {["Dátum", "Suma", "Protistrana", "Kategória"].map((h) => (
                    <th key={h} style={{ ...S.th, textAlign: h === "Suma" ? "right" : "left" }}>{h}</th>
                  ))}
                  <th style={{ ...S.th, width: 46, textAlign: "center" }} title="Potvrdiť">✓</th>
                </tr>
              </thead>
              <tbody>
                {viditelne.slice(0, 400).map((p) => (
                  <Fragment key={p.kluc}>
                  <tr style={{ background: oznacene.has(p.kluc) ? mix(C.accent, 7) : undefined }}>
                    <td style={{ ...S.td, textAlign: "center", padding: "3px 4px" }}>
                      <input type="checkbox" checked={oznacene.has(p.kluc)}
                        onChange={() => setOznacene((prev) => {
                          const n = new Set(prev);
                          if (n.has(p.kluc)) n.delete(p.kluc); else n.add(p.kluc);
                          return n;
                        })}
                        style={{ accentColor: C.accent, cursor: "pointer" }} />
                    </td>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontSize: 12 }}>{fmtDMY(p.datum)}</td>
                    <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap", color: p.suma < 0 ? C.text : C.green, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(p.suma)}</td>
                    <td style={{ ...S.td, fontSize: 12 }}>
                      <div onClick={() => oznacRovnake(p.protistrana)} title={`Označiť všetky pohyby „${p.protistrana}"`}
                        style={{ color: C.text, cursor: "pointer" }}>{p.protistrana || "—"}</div>
                      {/* Poznámka sa dá dopísať aj po zápise — text z banky
                          často nepovie, čo to bolo, a o pol roka si to už
                          nikto nepamätá. Ukladá sa pri opustení poľa. */}
                      <input
                        defaultValue={p.poznamka || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (p.poznamka || "")) void zmen(p.kategoria, [p.kluc], e.target.value);
                        }}
                        placeholder="+ poznámka"
                        style={{ marginTop: 2, width: "100%", maxWidth: 320, background: "transparent", border: "none", borderBottom: `1px dashed ${mix(C.border, 80)}`, color: p.poznamka ? C.textDim : C.accentLight, fontSize: 11, padding: "1px 0" }}
                      />
                    </td>
                    <td style={{ ...S.td, padding: "3px 6px" }}>
                      {(() => {
                        const split = pohybSplits?.[p.kluc];
                        if (platnySplit(split)) {
                          const casti = rozdelPohyb(p.suma, split);
                          return (
                            <div>
                              {casti.map((c, ci) => (
                                <div key={ci} style={{ fontSize: 11.5, color: C.text }}>
                                  <span style={{ color: C.textDim }}>{split[ci].pct}%</span> {popisCiel(c.ciel)} <span style={{ color: C.textDim, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(-c.ciastka)}</span>
                                </div>
                              ))}
                              {onSplit && (
                                <button onClick={() => otvorDelenie(p.kluc)} style={{ background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 11, padding: "2px 0" }}>upraviť rozdelenie</button>
                              )}
                            </div>
                          );
                        }
                        // Príjem: namiesto kategórie stav z kroku Platby a balíčky.
                        if (p.suma > 0) {
                          const st = stavPrijmu(p);
                          return (
                            <div style={{ fontSize: 11.5 }}>
                              {st === "klient" && <span style={{ color: C.green }}>✓ {p.klienti}</span>}
                              {st === "nieKlient" && <span style={{ color: C.textMuted }}>nie je klient</span>}
                              {st === "caka" && (onPlatby
                                ? <button onClick={onPlatby} style={{ background: "none", border: "none", padding: 0, color: C.orange, cursor: "pointer", fontSize: 11.5, textAlign: "left" }}>čaká na priradenie → Platby a balíčky</button>
                                : <span style={{ color: C.orange }}>čaká na priradenie klientovi</span>)}
                              {/* Vrátenie od Alzy, vlastný vklad… — to sa rieši tu, nie v Platbách. */}
                              {onSplit && st !== "klient" && (
                                <button onClick={() => otvorDelenie(p.kluc)} title="Vrátenie nákladu alebo ručný príjem" style={{ display: "block", background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11, padding: "2px 0" }}>⑂ vrátenie / príjem</button>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div>
                            <VyberKategorie
                              hodnota={p.kategoria}
                              pocetOznacenych={oznacene.has(p.kluc) ? oznacene.size : 0}
                              onZmena={(kat) => void zmen(kat, oznacene.has(p.kluc) && oznacene.size > 1 ? undefined : [p.kluc])}
                            />
                            {onSplit && (
                              <button onClick={() => otvorDelenie(p.kluc)} title="Rozdeliť pohyb na časti / označiť ako príjem alebo vrátenie" style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11, padding: "2px 0" }}>⑂ rozdeliť / priradiť</button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Potvrdenie úplne vpravo: zelená fajka = „videl som, sedí";
                        riadok potom z plochy uzávierky zmizne. */}
                    <td style={{ ...S.td, textAlign: "center", padding: "3px 6px", width: 46 }}>
                      {cakaNaPotvrdenie(p, maSplit(p)) && (
                        <button disabled={busy} onClick={() => void potvrd([p.kluc])}
                          title="Videl som, sedí — potvrdiť" aria-label={`Potvrdiť ${p.protistrana}`}
                          style={{ width: 28, height: 28, borderRadius: 14, padding: 0, fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: `1.5px solid ${mix(C.green, 60)}`, background: mix(C.green, 14), color: C.green }}>✓</button>
                      )}
                      {jePotvrdeny(p, maSplit(p)) && p.potvrdene && filter === "potvrdene" && (
                        <button disabled={busy} onClick={() => void potvrd([p.kluc], true)} title="Vrátiť medzi nepotvrdené"
                          style={{ background: "none", border: "none", color: C.textDim, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>vrátiť</button>
                      )}
                    </td>
                  </tr>
                  {onSplit && delenyKluc === p.kluc && (
                    <tr>
                      <td colSpan={6} style={{ ...S.td, background: mix(C.accent, 8), padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>
                          Rozdeľuješ <b style={{ color: C.text }}>{fmtCZK(p.suma)}</b> ({fmtDMY(p.datum)}, {p.protistrana || "—"}). Percentá musia dať 100 %. Cieľ „Príjem" = ručný príjem; kladný pohyb na nákladovú kategóriu ten náklad zníži (vrátenie).
                        </div>
                        {koncept.map((c, ci) => (
                          <div key={ci} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                            <select value={c.ciel} onChange={(e) => setKoncept((k) => k.map((x, j) => (j === ci ? { ...x, ciel: e.target.value } : x)))}
                              style={{ background: C.bg, color: C.text, border: `1px solid ${mix(C.accent, 40)}`, borderRadius: 7, fontSize: 12, padding: "5px 7px", maxWidth: 300, cursor: "pointer" }}>
                              <option value="">— cieľ —</option>
                              {[...new Set(KAT.map((k) => k.skupina))].filter(Boolean).map((sk) => (
                                <optgroup key={sk} label={sk}>
                                  {KAT.filter((k) => k.skupina === sk).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                                </optgroup>
                              ))}
                            </select>
                            <input type="number" value={c.pct} min={0} max={100} onChange={(e) => setKoncept((k) => k.map((x, j) => (j === ci ? { ...x, pct: Number(e.target.value) } : x)))}
                              style={{ width: 64, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, padding: "5px 7px" }} />
                            <span style={{ fontSize: 12, color: C.textDim }}>%</span>
                            {koncept.length > 1 && (
                              <button onClick={() => setKoncept((k) => k.filter((_, j) => j !== ci))} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}>✕</button>
                            )}
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                          <button onClick={() => setKoncept((k) => [...k, { ciel: "", pct: Math.max(0, 100 - suciastPct) }])} style={{ background: "none", border: `1px dashed ${C.border}`, color: C.textMuted, borderRadius: 7, fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>+ časť</button>
                          <span style={{ fontSize: 12, color: Math.abs(suciastPct - 100) < 0.01 ? C.green : C.orange }}>súčet {suciastPct} %</span>
                          <span style={{ marginLeft: "auto" }} />
                          <button disabled={!platnySplit(koncept)} onClick={() => { onSplit(p.kluc, koncept); setDelenyKluc(null); }}
                            style={{ background: platnySplit(koncept) ? mix(C.accent, 30) : C.track, color: platnySplit(koncept) ? C.text : C.textDim, border: `1px solid ${mix(C.accent, 45)}`, borderRadius: 7, fontSize: 12, padding: "5px 12px", cursor: platnySplit(koncept) ? "pointer" : "not-allowed", fontWeight: 600 }}>Uložiť rozdelenie</button>
                          {platnySplit(pohybSplits?.[p.kluc]) && (
                            <button onClick={() => { onSplit(p.kluc, []); setDelenyKluc(null); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>zrušiť rozdelenie</button>
                          )}
                          <button onClick={() => setDelenyKluc(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}>zavrieť</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {viditelne.length > 400 && (
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>
              Zobrazených prvých 400 — zúž to filtrom alebo hľadaním.
            </div>
          )}

          {/* Naučené pravidlá. Zle zaradené pravidlo sa tichým opakovaním
              zavlečie do každého ďalšieho mesiaca, takže musí byť vidieť. */}
          <div style={{ marginTop: 18 }}>
            <H3><Info label={`Naučené pravidlá (${pravidla.length})`} text="Čo si appka zapamätala z tvojho zaraďovania. Nasledujúci import ich použije automaticky. Zlé pravidlo prepíšeš tak, že ten istý text zaradíš inam — posledné zaradenie vyhráva." /></H3>
            {pravidla.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                {pravidla.map((r, i) => (
                  <span key={i} style={{ fontSize: 11, color: C.textMuted, background: C.track, borderRadius: 12, padding: "3px 10px" }}>
                    {r.vzor} → <b style={{ color: C.accentLight }}>{KAT.find((k) => k.value === r.kategoria)?.label || r.kategoria}</b>
                  </span>
                ))}
              </div>
            ) : <Empty>Zatiaľ žiadne — naučia sa pri prvom zápise.</Empty>}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
