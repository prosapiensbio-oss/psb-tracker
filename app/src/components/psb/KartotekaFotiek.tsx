import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { dnesPraha } from "../../lib/psb/cas";
import { posliDoEditora, upravVEditore } from "../../lib/psb/doEditora";
import { PoslaneKlientovi, PoslatKlientovi, type OdkazFotiek, type OdpovedFotky } from "./FotkyKlientovi";
import { OpravitText } from "./OpravitText";
import { pocuvaj } from "../../lib/psb/obnovaSignal";
import { fotenia, jeFotkaTela, MAX_STRANA, nazovPohladu, porovnania, POHLADY, VIDEO, type Fotka } from "../../lib/psb/kartoteka";
import { denZFotky } from "../../lib/psb/exifDatum";
import { PLATNO } from "../../lib/psb/porovnaniePredPo";
import { poskladajPredPo } from "./poskladajPredPo";
import { C, mix } from "../../lib/psb/theme";

/**
 * KARTOTÉKA FOTIEK DRŽANIA TELA — časť C anamnézy (5. 10. 2026).
 *
 * Fotky sa robia na úvodnom tréningu (a pri každom ďalšom fotení) rovno
 * z iPadu: políčko na súbor otvorí fotoaparát aj galériu. Pred odoslaním
 * sa fotka v prehliadači zmenší na 2000 px dlhšej strany — z iPadu chodia
 * 5–12 MB súbory, ktoré by sa nahrávali pol minúty a nič by nepridali.
 *
 * ZMAZAŤ A DO EDITORA (Jerry, 12. 10. 2026: „jednu som dal zle a nie je tam
 * vymazať fotku… chcel by som mať možnosť označiť tie fotky a dať ich rovno
 * do editora pred a po"): na každej dlaždici je ✕ (zmazať) a krúžok na
 * označenie. Dve označené → „do editora": staršia ide doľava, novšia doprava.
 *
 * Čo sa nahrá, musí sa dať aj vidieť: zápis vracia úspech a zoznam sa po
 * ňom načíta znova zo servera (pravidlo „ticho zlyhávajúci zápis").
 */

type Odpoved = {
  ok: boolean; error?: string;
  fotky?: Fotka[]; poznamky?: Record<string, string>;
  odkazy?: OdkazFotiek[]; odpovede?: OdpovedFotky[];
  suhlas?: boolean; ulozisko?: boolean; sifra?: boolean;
  /** Id porovnaní, ktoré ukazuje stránka po úvodnom (/u/). */
  uvodny?: string[];
};

/** Strana porovnania pred a po: náhľad v okne a súbor, z ktorého sa skladá. */
type StranaUvodneho = { nahlad: string; subor: Blob };

const denCz = (d: string) => {
  const [r, m, dd] = d.split("-");
  return `${Number(dd)}. ${Number(m)}. ${r}`;
};

/**
 * Zmenší fotku na JPEG. `imageOrientation: "from-image"` otočí fotku
 * z iPadu podľa EXIF — bez toho by postoj na výšku prišiel naležato.
 * EXIF (aj poloha) sa tým zároveň zahodí, čo je pri fotke tela dobre.
 */
async function zmensi(subor: File): Promise<{ blob: Blob; sirka: number; vyska: number }> {
  const bmp = await createImageBitmap(subor, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const k = Math.min(1, MAX_STRANA / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("prehliadač nevie kresliť do plátna");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.86));
  if (!blob) throw new Error("fotku sa nepodarilo prekódovať");
  return { blob, sirka: w, vyska: h };
}

export function KartotekaFotiek({ meno, uzke, trener = "" }: { meno: string; uzke: boolean; trener?: string }) {
  const [d, setD] = useState<Odpoved | null>(null);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [den, setDen] = useState(() => dnesPraha());
  const [pohlad, setPohlad] = useState<string>("bok");
  const [osobne, setOsobne] = useState(false);
  const [nahravam, setNahravam] = useState<string | null>(null);
  /**
   * ÚVODNÝ TRÉNING — FOTKY PRED A PO (Jerry, 28. 10. 2026: „pri prvom fotení
   * daj možnosť fotenie úvodný tréning; keď to zaškrtnem, vložím fotky,
   * uložím — a na stránke po úvodnom sa to ukáže"). Fotka z diagnostiky
   * a fotka po narovnaní sa poskladajú vedľa seba, uložia ako porovnanie
   * a pripnú k stránke po úvodnom (`/api/uvodny` akcia `fotky`).
   */
  const [uvodny, setUvodny] = useState(false);
  const [uvPred, setUvPred] = useState<StranaUvodneho | null>(null);
  const [uvPo, setUvPo] = useState<StranaUvodneho | null>(null);
  const [uvUkladam, setUvUkladam] = useState(false);
  useEffect(() => () => { if (uvPred) URL.revokeObjectURL(uvPred.nahlad); }, [uvPred]);
  useEffect(() => () => { if (uvPo) URL.revokeObjectURL(uvPo.nahlad); }, [uvPo]);
  useEffect(() => { setUvodny(false); setUvPred(null); setUvPo(null); }, [meno]);
  const [zvacsena, setZvacsena] = useState<Fotka | null>(null);
  /** Rozpísaný popis zväčšenej fotky — zapíše sa pri odchode z políčka. */
  const [popisKoncept, setPopisKoncept] = useState<string | null>(null);
  /** Zväčšené porovnanie: ukázať čistú podobu (bez čiar)? */
  const [zvacsenaCiste, setZvacsenaCiste] = useState(false);
  /** Popis upravovaný priamo na dlaždici „Z editora" (id fotky) a jeho text. */
  const [textNa, setTextNa] = useState<string | null>(null);
  const [textKoncept, setTextKoncept] = useState("");
  useEffect(() => { setPopisKoncept(null); setZvacsenaCiste(false); }, [zvacsena?.id]);
  /** Prehrávané video z editora: zašifrované ide celé cez fetch, potom z pamäte. */
  const [video, setVideo] = useState<{ f: Fotka; url: string } | null>(null);
  /** Rozpísané poznámky po dňoch — zapisujú sa pri odchode z políčka. */
  const [koncepty, setKoncepty] = useState<Record<string, string>>({});
  const vstup = useRef<HTMLInputElement | null>(null);
  /**
   * „+ pridať fotky k tomuto dňu" = človek deň zvolil výslovne a EXIF ho
   * nesmie prebiť. Pri bežnom nahratí má prednosť dátum z fotky.
   */
  const vynutDen = useRef(false);
  /** Fotenie, ktorému sa práve mení dátum (pôvodný deň) a nový deň. */
  const [menimDen, setMenimDen] = useState<{ z: string; na: string } | null>(null);
  /** Označené fotky pre editor — najviac dve; tretia vytlačí najstaršie označenie. */
  const [vyber, setVyber] = useState<string[]>([]);
  const oznac = (id: string) => setVyber((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id].slice(-2)));
  /** Porovnania označené na poslanie klientovi (odkaz /f/). */
  const [naPoslanie, setNaPoslanie] = useState<string[]>([]);
  const [skladam, setSkladam] = useState(false);
  const oznacNaPoslanie = (id: string) => setNaPoslanie((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  useEffect(() => { setVyber([]); setNaPoslanie([]); setSkladam(false); }, [meno]);

  const nacitaj = useCallback(async () => {
    const j = (await fetch(`/api/fotky?klient=${encodeURIComponent(meno)}`, { credentials: "same-origin" })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }))) as Odpoved;
    if (!j.ok) { setChyba(j.error || "Kartotéka sa nenačítala."); return; }
    setD(j);
    setKoncepty({});
  }, [meno]);
  useEffect(() => { void nacitaj(); }, [nacitaj]);
  // Editor (Workspace → Editor) uloží porovnanie či video ku klientovi —
  // kartotéka v profile ostáva načítaná, tak sa obnoví na signál.
  useEffect(() => pocuvaj("fotky", () => void nacitaj()), [nacitaj]);

  // Esc zavrie zväčšenú fotku aj video.
  useEffect(() => {
    if (!zvacsena && !video) return;
    const na = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Rozpísaný popis sa zapíše pri strate zamerania — Esc ho nesmie zahodiť.
      (document.activeElement as HTMLElement | null)?.blur?.();
      setZvacsena(null); setVideo(null);
    };
    document.addEventListener("keydown", na);
    return () => document.removeEventListener("keydown", na);
  }, [zvacsena, video]);
  // Adresa videa v pamäti sa po zavretí uvoľní.
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);
  const prehraj = async (f: Fotka) => {
    setHlaska("Načítavam video…");
    try {
      // Celé cez fetch, nie <video src>: Safari chce pri videu čiastočné
      // odpovede (Range) a server vracia rozšifrovaný súbor naraz.
      const r = await fetch(`/api/fotky?id=${encodeURIComponent(f.id)}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`);
      setVideo({ f, url: URL.createObjectURL(await r.blob()) });
      setChyba("");
    } catch (e) {
      setChyba(`Video sa nenačítalo: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`);
    }
    setHlaska("");
  };

  const posli = async (telo: Record<string, unknown>): Promise<boolean> => {
    const j = await fetch("/api/fotky", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    if (!j?.ok) { setChyba(j?.error || "Zmena sa nezapísala."); return false; }
    setChyba("");
    return true;
  };

  /** Nahratie jednej alebo viacerých fotiek — po jednej, aby sa dalo povedať, koľko prešlo. */
  const nahraj = async (subory: FileList | null) => {
    if (!subory || !subory.length) return;
    setChyba("");
    setHlaska("");
    let hotovo = 0;
    const vynutene = vynutDen.current;
    vynutDen.current = false;
    /** Dni, ktoré sa vzali z fotiek — povie sa nahlas, aby nikto nehľadal. */
    const zExif = new Set<string>();
    for (let n = 0; n < subory.length; n++) {
      setNahravam(`Nahrávam ${n + 1} z ${subory.length}…`);
      try {
        // Dátum fotenia sa číta z PÔVODNÉHO súboru — zmenšenie EXIF zahodí.
        // Jerry, 14. 10. 2026: fotky z 2023 sa uložili s dňom nahratia.
        const exif = vynutene ? null : denZFotky(await subory[n].slice(0, 262144).arrayBuffer(), dnesPraha());
        if (exif) zExif.add(exif);
        const { blob, sirka, vyska } = await zmensi(subory[n]);
        const fd = new FormData();
        fd.append("klient", meno);
        fd.append("den", exif || den);
        fd.append("pohlad", pohlad);
        fd.append("sirka", String(sirka));
        fd.append("vyska", String(vyska));
        if (osobne) fd.append("suhlasOsobne", "1");
        fd.append("subor", blob, "fotka.jpg");
        const j = await fetch("/api/fotky", { method: "POST", credentials: "same-origin", body: fd })
          .then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
        if (!j?.ok) { setChyba(`${hotovo ? `Prešlo ${hotovo} z ${subory.length}. ` : ""}${j?.error || "Fotka sa nenahrala."}`); break; }
        hotovo++;
      } catch (e) {
        setChyba(`Fotku ${n + 1} sa nepodarilo pripraviť: ${String(e).slice(0, 120)}`);
        break;
      }
    }
    setNahravam(null);
    if (vstup.current) vstup.current.value = "";
    if (hotovo) {
      const dni = [...zExif].sort().map(denCz);
      setHlaska(`${hotovo === 1 ? "Fotka je v kartotéke." : `${hotovo} fotky sú v kartotéke.`}${dni.length ? ` Dátum fotenia z fotky: ${dni.join(", ")}.` : ""}`);
    }
    await nacitaj();
  };

  const presunDen = async (z: string, na: string) => {
    if (!na || na === z) { setMenimDen(null); return; }
    if (await posli({ akcia: "presun-den", klient: meno, z, na })) {
      setMenimDen(null);
      setHlaska(`Fotenie presunuté na ${denCz(na)}.`);
      await nacitaj();
    }
  };

  const zmenPohlad = async (f: Fotka, p: string) => {
    if (await posli({ akcia: "pohlad", id: f.id, pohlad: p })) await nacitaj();
  };

  const zmaz = async (f: Fotka) => {
    if (!window.confirm(`Zmazať fotku ${nazovPohladu(f.pohlad)} z ${denCz(f.den)}? Vrátiť sa to nedá.`)) return;
    if (await posli({ akcia: "zmaz", id: f.id })) {
      setZvacsena(null); setVideo(null);
      setVyber((v) => v.filter((x) => x !== f.id));
      setHlaska("Fotka zmazaná.");
      await nacitaj();
    }
  };

  const ulozPopis = async (f: Fotka) => {
    if (popisKoncept === null || popisKoncept.trim() === (f.popis || "")) return;
    if (await posli({ akcia: "popis", id: f.id, text: popisKoncept })) {
      setHlaska("Popis uložený.");
      // Len ak je tá istá fotka ešte otvorená — zavreté okno sa nesmie znova otvoriť.
      setZvacsena((z) => (z && z.id === f.id ? { ...z, popis: popisKoncept.trim() } : z));
      await nacitaj();
    }
  };

  /** Pripne porovnanie k stránke po úvodnom (alebo ho z nej odoberie pri prázdnom zozname). */
  const naStrankuPoUvodnom = async (ids: string[]): Promise<boolean> => {
    const j = await fetch("/api/uvodny", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "fotky", klient: meno, fotky: ids, trener }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" })) as { ok?: boolean; error?: string };
    if (!j.ok) { setChyba(j.error || "Fotky sa k stránke po úvodnom nepripojili."); return false; }
    return true;
  };

  const ulozUvodny = async () => {
    if (!uvPred || !uvPo || uvUkladam) return;
    setUvUkladam(true);
    setChyba("");
    setHlaska("");
    try {
      const subor = await poskladajPredPo(uvPred.subor, uvPo.subor);
      const fd = new FormData();
      fd.append("klient", meno);
      fd.append("den", den);
      fd.append("pohlad", "porovnanie");
      fd.append("popis", "Úvodní lekce — před a po");
      fd.append("sirka", String(PLATNO.sirka));
      fd.append("vyska", String(PLATNO.vyska));
      if (osobne) fd.append("suhlasOsobne", "1");
      fd.append("subor", subor, "pred-a-po.jpg");
      const j = await fetch("/api/fotky", { method: "POST", credentials: "same-origin", body: fd })
        .then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" })) as { ok?: boolean; id?: string; error?: string };
      if (!j.ok || !j.id) { setChyba(j.error || "Fotky sa neuložili."); return; }
      // Porovnanie je v kartotéke; keď zlyhá pripnutie, povie sa to a dá sa zopakovať.
      if (!(await naStrankuPoUvodnom([j.id]))) { await nacitaj(); return; }
      setUvPred(null);
      setUvPo(null);
      setUvodny(false);
      setHlaska("Fotky pred a po sú uložené a stránka po úvodnom ich ukáže — aj keď SMS už odišla.");
      await nacitaj();
    } catch (e) {
      setChyba(`Fotky sa nepodarilo poskladať: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`);
    } finally {
      setUvUkladam(false);
    }
  };

  const ulozPoznamku = async (dn: string) => {
    const text = koncepty[dn];
    if (text === undefined || text === (d?.poznamky?.[dn] || "")) return;
    if (await posli({ akcia: "poznamka", klient: meno, den: dn, text })) {
      setHlaska("Poznámka uložená.");
      await nacitaj();
    }
  };

  if (!d) {
    return <div style={{ padding: 16, fontSize: 13, color: chyba ? C.red : C.textDim }}>{chyba || "Načítavam kartotéku…"}</div>;
  }

  // Fotky tela zvlášť od výstupov editora (porovnanie, video) — tie sa
  // neporovnávajú a nepatria do fotení.
  const vsetky = d.fotky || [];
  const fs = vsetky.filter(jeFotkaTela);
  const zEditora = vsetky.filter((f) => !jeFotkaTela(f));
  const dni = fotenia(fs, d.poznamky || {});
  /** Najstaršie fotenie — od neho je všetko ďalšie „potom". */
  const prveFotenie = fs.length ? fs.reduce((a, f) => (f.den < a ? f.den : a), fs[0].den) : "";
  const porov = porovnania(fs);
  const mozeNahrat = !!d.ulozisko && !!d.sifra && (d.suhlas || osobne);
  const obrazok = (f: Fotka) => `/api/fotky?id=${encodeURIComponent(f.id)}`;

  const nalepka = (txt: string, farba: string) => (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 8px", borderRadius: 6, background: mix(farba, 16), color: farba, textTransform: "uppercase", whiteSpace: "nowrap" }}>{txt}</span>
  );

  const doEditora = (a: Fotka, b: Fotka) => posliDoEditora(meno, { id: a.id, den: a.den }, { id: b.id, den: b.den });
  const oznacene = vyber.map((id) => fs.find((f) => f.id === id)).filter((f): f is Fotka => !!f);
  /** Okrúhle tlačidlo v rohu dlaždice — dosť veľké na prst na iPade. */
  const rohove = (strana: "left" | "right", farba: string, plne: boolean): React.CSSProperties => ({
    position: "absolute", top: 6, [strana]: 6, width: 30, height: 30, borderRadius: 15, padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
    border: `2px solid ${plne ? farba : "rgba(255,255,255,0.9)"}`, background: plne ? farba : "rgba(0,0,0,0.45)",
    color: "#fff", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 }}>
      {/* ── NAHRATIE ── */}
      <div style={{ padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${mix(C.border, 120)}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{prveFotenie ? "Nahrať ďalšie fotky" : "Prvé fotenie"}</span>
          {d.suhlas ? nalepka("súhlas z anamnézy", C.green) : nalepka("bez súhlasu v anamnéze", C.orange)}
        </div>
        {!d.ulozisko && (
          <div style={{ fontSize: 12.5, color: C.orange, marginTop: 8, lineHeight: 1.55 }}>
            Úložisko fotiek (Cloudflare R2) ešte nie je zapnuté — kartotéka zatiaľ fotky neprijme.
          </div>
        )}
        {!d.sifra && (
          <div style={{ fontSize: 12.5, color: C.orange, marginTop: 8 }}>Chýba šifrovací kľúč — bez neho sa fotky neukladajú.</div>
        )}
        {!d.suhlas && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, fontSize: 12.5, color: C.textMuted, lineHeight: 1.5, cursor: "pointer" }}>
            <input type="checkbox" checked={osobne} onChange={(e) => setOsobne(e.target.checked)} style={{ marginTop: 3, accentColor: C.accent }} />
            <span>
              Klient súhlasil s fotkami osobne. <span style={{ color: C.textDim }}>Jeho anamnéza súhlas s fotkami nemá
              (staré z Google Forms sa naň nepýtali). Pri fotke sa zapíše, že súhlas bol osobný a kto ho potvrdil.</span>
            </span>
          </label>
        )}
        {/* ── ÚVODNÝ TRÉNING: PRED A PO ── */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: C.text, cursor: "pointer" }}>
          <input type="checkbox" checked={uvodny} onChange={(e) => setUvodny(e.target.checked)} style={{ accentColor: C.accent }} />
          <span>Úvodný tréning — fotky pred a po <span style={{ color: C.textDim, fontSize: 12 }}>(klient ich uvidí na stránke po úvodnom)</span></span>
        </label>
        {!!d.uvodny?.length && !uvodny && (() => {
          const f = zEditora.find((x) => x.id === d.uvodny![0]);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 12.5, color: C.green, flexWrap: "wrap" }}>
              {f && <img src={obrazok(f)} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />}
              <span>✓ Na stránke po úvodnom sú fotky pred a po{f ? ` z ${denCz(f.den)}` : ""}.</span>
              <button type="button" onClick={() => void (async () => { if (await naStrankuPoUvodnom([])) { setHlaska("Fotky sú zo stránky po úvodnom odobraté (v kartotéke ostali)."); await nacitaj(); } })()}
                style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                odobrať zo stránky
              </button>
            </div>
          );
        })()}
        {uvodny && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: mix(C.accent, 5) }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
              {([["Pred (diagnostika)", uvPred, setUvPred], ["Po (po narovnaní)", uvPo, setUvPo]] as const).map(([nadpis, f, nastav]) => (
                <div key={nadpis} style={{ display: "flex", flexDirection: "column", gap: 6, width: uzke ? 130 : 160 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{nadpis}</span>
                  {f ? (
                    <div style={{ position: "relative" }}>
                      <img src={f.nahlad} alt={nadpis} style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
                      <button type="button" onClick={() => nastav(null)} aria-label={`Odstrániť — ${nadpis}`} style={rohove("right", C.red, false)}>✕</button>
                    </div>
                  ) : (
                    <label style={{ width: "100%", aspectRatio: "3 / 4", boxSizing: "border-box", borderRadius: 8, border: `1px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, fontSize: 12.5, color: C.accentLight, cursor: "pointer" }}>
                      Odfotiť alebo vybrať
                      <input type="file" accept="image/*" hidden onChange={(e) => {
                        const s = e.target.files?.[0];
                        e.target.value = "";
                        if (s) nastav({ nahlad: URL.createObjectURL(s), subor: s });
                      }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: C.textMuted }}>
                deň{" "}
                <input type="date" value={den} max={dnesPraha()} onChange={(e) => setDen(e.target.value || dnesPraha())}
                  style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5 }} />
              </label>
              <button type="button" disabled={!mozeNahrat || !uvPred || !uvPo || uvUkladam} onClick={() => void ulozUvodny()}
                style={{
                  padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 14),
                  color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  cursor: mozeNahrat && uvPred && uvPo && !uvUkladam ? "pointer" : "default", opacity: mozeNahrat && uvPred && uvPo && !uvUkladam ? 1 : 0.5,
                }}>
                {uvUkladam ? "Ukladám…" : "Uložiť a ukázať na stránke po úvodnom"}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.55 }}>
              Fotky sa poskladajú vedľa seba (PŘED · PO), uložia sa do kartotéky ako porovnanie a stránka po úvodnom ich ukáže hneď — aj klientovi, ktorému už SMS odišla.
              {!mozeNahrat && d.ulozisko && d.sifra && " Najprv potvrď súhlas s fotkami vyššie."}
            </div>
          </div>
        )}

        {!uvodny && <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: C.textMuted }} title="Keď má fotka v sebe dátum fotenia (EXIF), použije sa ten. Tento deň platí pre fotky bez neho — snímky obrazovky, fotky zo WhatsAppu.">
            deň (ak ho fotka nemá){" "}
            <input
              type="date" value={den} max={dnesPraha()}
              onChange={(e) => setDen(e.target.value || dnesPraha())}
              style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5 }}
            />
          </label>
          <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }}>
            {POHLADY.map((p) => (
              <button
                key={p.id} type="button" onClick={() => setPohlad(p.id)}
                style={{
                  padding: "6px 11px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5,
                  background: pohlad === p.id ? mix(C.accent, 20) : "transparent",
                  color: pohlad === p.id ? C.accentLight : C.textMuted, fontWeight: pohlad === p.id ? 600 : 400,
                }}
              >{p.nazov}</button>
            ))}
          </div>
          <input
            ref={vstup} type="file" accept="image/*" multiple hidden
            onChange={(e) => void nahraj(e.target.files)}
          />
          <button
            type="button" disabled={!mozeNahrat || !!nahravam} onClick={() => vstup.current?.click()}
            style={{
              padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 14),
              color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              cursor: mozeNahrat && !nahravam ? "pointer" : "default", opacity: mozeNahrat && !nahravam ? 1 : 0.5,
            }}
          >{nahravam || "Odfotiť alebo vybrať"}</button>
        </div>}
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8, lineHeight: 1.55 }}>
          {prveFotenie
            ? <>Prvé fotenie je z {denCz(prveFotenie)}. Fotky z iného dňa sú ďalšie fotenie („potom") a prvá s poslednou sa postavia vedľa seba.</>
            : <>Robí sa na úvodnom tréningu. Každé ďalšie fotenie sa nahrá sem s jeho dňom.</>}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.55 }}>
          Fotky sú zašifrované a nikde sa nezverejňujú — vidí ich len prihlásený tréner. Viac fotiek naraz dostane
          zvolený pohľad; zmeniť sa dá pri každej.
        </div>
        {(chyba || hlaska) && (
          <div style={{ fontSize: 12.5, marginTop: 8, color: chyba ? C.red : C.green }}>{chyba || hlaska}</div>
        )}
      </div>

      {/* ── PREDTÝM A TERAZ ── */}
      {porov.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim, marginBottom: 8 }}>Predtým a teraz</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {porov.map((p) => (
              <div key={p.pohlad}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[p.prva, p.posledna].map((f, k) => (
                  <button key={f.id} type="button" onClick={() => setZvacsena(f)} style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.card, cursor: "zoom-in", textAlign: "left", fontFamily: "inherit" }}>
                    <img src={obrazok(f)} alt={`${nazovPohladu(p.pohlad)} ${denCz(f.den)}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover", background: C.bg }} />
                    <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.textMuted }}>
                      {nazovPohladu(p.pohlad)} · {k === 0 ? "prvá" : "posledná"} · {denCz(f.den)}
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button" onClick={() => doEditora(p.prva, p.posledna)}
                style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}
              >◧ tieto dve do editora</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Z EDITORA ── porovnania predtým/potom a videá (Workspace → Editor) */}
      {zEditora.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim }}>Z editora</span>
            {zEditora.some((f) => f.pohlad !== VIDEO) && !skladam && (
              <span style={{ fontSize: 11.5, color: C.textDim }}>· krúžkom označ porovnania, ktoré pošleš klientovi</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${uzke ? 130 : 170}px, 1fr))`, gap: 8 }}>
            {zEditora.map((f) => (
              <div key={f.id} style={{ position: "relative", border: `${naPoslanie.includes(f.id) ? 2 : 1}px solid ${naPoslanie.includes(f.id) ? C.accent : C.border}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
                <button
                  type="button"
                  onClick={() => (f.pohlad === VIDEO ? void prehraj(f) : setZvacsena(f))}
                  style={{ display: "block", width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: C.text }}
                >
                  {f.pohlad === VIDEO ? (
                    <div style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontSize: 34, color: C.accentLight }}>▶</div>
                  ) : (
                    <img src={obrazok(f)} alt={`predtým / potom ${denCz(f.den)}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: C.bg }} />
                  )}
                  <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.textMuted }}>{nazovPohladu(f.pohlad)} · {denCz(f.den)}{f.maCiste ? " · aj čisté" : ""}</div>
                  {f.popis && <div style={{ padding: "0 9px 8px", fontSize: 12, color: C.text, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{f.popis}</div>}
                </button>
                {/* Text a mazanie priamo na dlaždici (Jerry, 12. 10. 2026: „chýba upraviť/vložiť text, vymazať"). */}
                {textNa === f.id && (
                  <div style={{ padding: "0 8px 8px" }}>
                    <textarea
                      autoFocus value={textKoncept} onChange={(e) => setTextKoncept(e.target.value)} rows={4}
                      placeholder="Čo je na porovnaní vidieť — klient to uvidí pod fotkou."
                      style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.5, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                      <button type="button" onClick={async () => { if (await posli({ akcia: "popis", id: f.id, text: textKoncept })) { setTextNa(null); setHlaska("Popis uložený."); await nacitaj(); } }} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.accent}`, background: mix(C.accent, 18), color: C.accentLight, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>uložiť</button>
                      <button type="button" onClick={() => setTextNa(null)} style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>zrušiť</button>
                    </div>
                    <div style={{ marginTop: 6 }}><OpravitText maly text={textKoncept} onOpravene={setTextKoncept} /></div>
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", padding: "6px 9px", borderTop: `1px solid ${mix(C.border, 80)}` }}>
                  {f.maEdit && (
                    <button type="button" onClick={() => upravVEditore(meno, f.id)} title="Otvoriť v editore s čiarami a kresbou — uloženie ho prepíše, upraviť sa dá kedykoľvek znova"
                      style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>✎ upraviť v editore</button>
                  )}
                  {f.pohlad !== VIDEO && textNa !== f.id && (
                    <button type="button" onClick={() => { setTextNa(f.id); setTextKoncept(f.popis || ""); }}
                      style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>{f.popis ? "✎ upraviť text" : "+ vložiť text"}</button>
                  )}
                  <button type="button" onClick={() => void zmaz(f)}
                    style={{ background: "none", border: "none", padding: 0, color: C.red, fontFamily: "inherit", fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>zmazať</button>
                </div>
                {!f.maEdit && f.pohlad !== VIDEO && (
                  <div style={{ padding: "0 9px 8px", fontSize: 11, color: C.textDim, lineHeight: 1.45 }}>
                    Uložené skôr, než editor ukladal svoj stav — čiary sa nedajú otvoriť znova. Nové porovnanie: označ dve fotky nižšie → Do editora.
                  </div>
                )}
                {f.pohlad !== VIDEO && (
                  <button
                    type="button" onClick={() => oznacNaPoslanie(f.id)}
                    aria-pressed={naPoslanie.includes(f.id)}
                    title={naPoslanie.includes(f.id) ? "Nepridávať do odkazu" : "Pridať do odkazu pre klienta"}
                    style={rohove("left", C.accent, naPoslanie.includes(f.id))}
                  >{naPoslanie.includes(f.id) ? "✓" : ""}</button>
                )}
              </div>
            ))}
          </div>
          {naPoslanie.length > 0 && !skladam && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setSkladam(true)} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 22), color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                ✉ Poslať klientovi ({naPoslanie.length})
              </button>
              <button type="button" onClick={() => setNaPoslanie([])} style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zrušiť výber</button>
            </div>
          )}
          {skladam && (
            <div style={{ marginTop: 10 }}>
              <PoslatKlientovi
                meno={meno} trener={trener}
                fotky={naPoslanie.map((id) => zEditora.find((f) => f.id === id)).filter((f): f is Fotka => !!f)}
                onZrus={() => { setSkladam(false); setNaPoslanie([]); }}
                onHotovo={() => void nacitaj()}
                onOtvorFotku={(f) => setZvacsena(f)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── POSLANÉ KLIENTOVI ── kedy, či otvoril, súhlas a jeho odpovede */}
      <PoslaneKlientovi odkazy={d.odkazy || []} odpovede={d.odpovede || []} onZmena={() => void nacitaj()} />

      {/* ── VÝBER DO EDITORA ── drží sa pri vrchu, kým sa označuje */}
      {fs.length > 1 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${vyber.length ? C.accent : mix(C.border, 120)}`,
        }}>
          <span style={{ fontSize: 12.5, color: vyber.length ? C.text : C.textMuted, flexGrow: 1, minWidth: 180 }}>
            {vyber.length === 0 && <>Pred a po: označ krúžkom dve fotky a otvor ich v editore.</>}
            {vyber.length === 1 && <>Označená 1 z 2 — vyber ešte jednu.</>}
            {vyber.length === 2 && oznacene.length === 2 && (() => {
              const [a, b] = oznacene[1].den < oznacene[0].den ? [oznacene[1], oznacene[0]] : oznacene;
              return <>Pred: {denCz(a.den)} · Po: {denCz(b.den)}</>;
            })()}
          </span>
          {vyber.length > 0 && (
            <button type="button" onClick={() => setVyber([])} style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zrušiť</button>
          )}
          <button
            type="button" disabled={oznacene.length !== 2}
            onClick={() => { if (oznacene.length === 2) { doEditora(oznacene[0], oznacene[1]); setVyber([]); } }}
            style={{
              padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, oznacene.length === 2 ? 22 : 8),
              color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              cursor: oznacene.length === 2 ? "pointer" : "default", opacity: oznacene.length === 2 ? 1 : 0.5,
            }}
          >◧ Do editora — pred a po</button>
        </div>
      )}

      {/* ── FOTENIA ── */}
      {!dni.length && (
        <div style={{ fontSize: 13, color: C.textDim }}>Zatiaľ žiadne fotky. Prvé sa robia na úvodnom tréningu — zboku, spredu, zozadu.</div>
      )}
      {dni.map((x) => (
        <div key={x.den} style={{ borderTop: `1px solid ${mix(C.border, 60)}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {menimDen?.z === x.den ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="date" value={menimDen.na} max={dnesPraha()} autoFocus
                  onChange={(e) => setMenimDen({ z: x.den, na: e.target.value })}
                  style={{ padding: "4px 7px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5, colorScheme: "dark" }}
                />
                <button type="button" onClick={() => void presunDen(x.den, menimDen.na)} style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>presunúť</button>
                <button type="button" onClick={() => setMenimDen(null)} style={{ background: "none", border: "none", color: C.textDim, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>zrušiť</button>
              </span>
            ) : (
              <>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{denCz(x.den)}</span>
                <button
                  type="button" onClick={() => setMenimDen({ z: x.den, na: x.den })}
                  title="Fotky sú z iného dňa — presunúť celé fotenie"
                  style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                >zmeniť dátum</button>
              </>
            )}
            <span style={{ fontSize: 11.5, color: C.textDim }}>
              {x.den === prveFotenie ? "prvé fotenie · " : ""}{x.fotky.length} {x.fotky.length === 1 ? "fotka" : x.fotky.length < 5 ? "fotky" : "fotiek"}
            </span>
            <span style={{ flexGrow: 1 }} />
            {/* Doplniť fotku k už existujúcemu foteniu — deň sa vezme z neho. */}
            <button
              type="button" disabled={!mozeNahrat || !!nahravam}
              onClick={() => { setDen(x.den); vynutDen.current = true; vstup.current?.click(); }}
              style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: mozeNahrat && !nahravam ? "pointer" : "default", opacity: mozeNahrat && !nahravam ? 1 : 0.5 }}
            >+ pridať fotky k tomuto dňu</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${uzke ? 120 : 150}px, 1fr))`, gap: 8, marginTop: 9 }}>
            {x.fotky.map((f) => (
              <div key={f.id} style={{ position: "relative", border: `${vyber.includes(f.id) ? 2 : 1}px solid ${vyber.includes(f.id) ? C.accent : C.border}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
                <button type="button" onClick={() => setZvacsena(f)} style={{ display: "block", width: "100%", padding: 0, border: "none", background: C.bg, cursor: "zoom-in" }}>
                  <img src={obrazok(f)} alt={`${nazovPohladu(f.pohlad)} ${denCz(f.den)}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover" }} />
                </button>
                <button
                  type="button" onClick={() => oznac(f.id)}
                  aria-pressed={vyber.includes(f.id)}
                  title={vyber.includes(f.id) ? "Zrušiť označenie" : "Označiť do editora (pred a po)"}
                  style={rohove("left", C.accent, vyber.includes(f.id))}
                >{vyber.includes(f.id) ? "✓" : ""}</button>
                <button
                  type="button" onClick={() => void zmaz(f)}
                  aria-label={`Zmazať fotku ${nazovPohladu(f.pohlad)} z ${denCz(f.den)}`} title="Zmazať fotku"
                  style={rohove("right", C.red, false)}
                >✕</button>
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 6px" }}>
                  <select
                    aria-label="Pohľad" value={f.pohlad} onChange={(e) => void zmenPohlad(f, e.target.value)}
                    style={{ flexGrow: 1, minWidth: 0, padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 11.5 }}
                  >
                    {POHLADY.map((p) => <option key={p.id} value={p.id}>{p.nazov}</option>)}
                  </select>
                  {f.suhlas === "osobne" && <span title="Súhlas dal klient osobne" style={{ fontSize: 10, color: C.orange }}>os.</span>}
                </div>
              </div>
            ))}
          </div>
          <textarea
            aria-label={`Poznámka k foteniu ${denCz(x.den)}`}
            placeholder="Čo na fotkách vidíš — zapíše sa k tomuto dňu."
            value={koncepty[x.den] ?? x.poznamka}
            onChange={(e) => setKoncepty((k) => ({ ...k, [x.den]: e.target.value }))}
            onBlur={() => void ulozPoznamku(x.den)}
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 9, padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13, lineHeight: 1.55, resize: "vertical" }}
          />
        </div>
      ))}

      {/* ── VIDEO Z EDITORA ── */}
      {video && createPortal(
        <div
          role="dialog" aria-label="Video" onClick={() => setVideo(null)}
          style={{ position: "fixed", inset: 0, zIndex: 2147482000, background: C.surface, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", alignItems: "center", padding: "max(16px, env(safe-area-inset-top)) 16px 24px", gap: 10 }}
        >
          <video src={video.url} controls autoPlay muted playsInline onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 110px)", borderRadius: 8, background: "#000" }} />
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: C.textMuted }}>
            <span>video · {denCz(video.f.den)}{video.f.kto ? ` · ${video.f.kto}` : ""}</span>
            <a href={video.url} download={`video-${meno}-${video.f.den}.${(video.f.typ || "").includes("webm") ? "webm" : "mp4"}`} style={{ color: C.accentLight, fontSize: 12.5 }}>stiahnuť</a>
            <button type="button" onClick={() => void zmaz(video.f)} style={{ background: "none", border: "none", color: C.red, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zmazať</button>
            <button type="button" onClick={() => setVideo(null)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zavrieť</button>
          </div>
        </div>,
        document.body,
      )}

      {/* ── ZVÄČŠENIE ── nepriehľadné pozadie (pravidlo z 30. 9.: okno nad obsahom nesmie byť priesvitné).
          Cez portál do <body> a s vlastným posúvaním (Jerry, 12. 10. 2026: „keď kliknem na fotku,
          nedá sa scrollovať") — karta Workspace má transform, takže okno sa zmestilo len do nej. */}
      {zvacsena && createPortal(
        <div
          role="dialog" aria-label="Fotka" onClick={() => setZvacsena(null)}
          style={{ position: "fixed", inset: 0, zIndex: 2147482000, background: C.surface, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", justifyContent: "flex-end", gap: 8, padding: "max(10px, env(safe-area-inset-top)) 14px 10px", background: C.surface }}>
            <button type="button" onClick={() => setZvacsena(null)} style={{ padding: "8px 16px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>✕ zavrieť</button>
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0 16px 32px", maxWidth: 980, margin: "0 auto" }}>
            {zvacsena.maCiste && (
              <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${mix(C.border, 120)}`, background: C.card }}>
                {[false, true].map((c) => (
                  <button key={String(c)} type="button" onClick={() => setZvacsenaCiste(c)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, background: zvacsenaCiste === c ? mix(C.accent, 22) : "transparent", color: zvacsenaCiste === c ? C.accentLight : C.textMuted }}>{c ? "čisté" : "s rozborom"}</button>
                ))}
              </div>
            )}
            <img src={`${obrazok(zvacsena)}${zvacsena.maCiste && zvacsenaCiste ? "&ciste=1" : ""}`} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 8 }} />
            <textarea
              aria-label="Popis k fotke"
              placeholder="Popis k fotke — čo je na nej vidieť. Uloží sa, keď klikneš mimo."
              value={popisKoncept ?? (zvacsena.popis || "")}
              onChange={(e) => setPopisKoncept(e.target.value)}
              onBlur={() => void ulozPopis(zvacsena)}
              rows={4}
              style={{ width: "min(680px, 100%)", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, resize: "vertical" }}
            />
            <div style={{ width: "min(680px, 100%)" }}>
              <OpravitText
                text={popisKoncept ?? (zvacsena.popis || "")}
                onOpravene={async (t) => {
                  // Opravený text sa hneď aj uloží — pole už stratilo zameranie.
                  const f = zvacsena;
                  setPopisKoncept(t);
                  if (await posli({ akcia: "popis", id: f.id, text: t })) {
                    setZvacsena((z) => (z && z.id === f.id ? { ...z, popis: t.trim() } : z));
                    setPopisKoncept(null);
                    await nacitaj();
                  }
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center", fontSize: 13, color: C.textMuted }}>
              <span>{nazovPohladu(zvacsena.pohlad)} · {denCz(zvacsena.den)}{zvacsena.kto ? ` · ${zvacsena.kto}` : ""}</span>
              {zvacsena.maEdit && (
                <button type="button" onClick={() => { const f = zvacsena; setZvacsena(null); upravVEditore(meno, f.id); }} style={{ background: "none", border: "none", color: C.accentLight, fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>✎ upraviť v editore</button>
              )}
              <button type="button" onClick={() => void zmaz(zvacsena)} style={{ background: "none", border: "none", color: C.red, fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>zmazať</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
