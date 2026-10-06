import { useCallback, useEffect, useRef, useState } from "react";

import { dnesPraha } from "../../lib/psb/cas";
import { pocuvaj } from "../../lib/psb/obnovaSignal";
import { fotenia, jeFotkaTela, MAX_STRANA, nazovPohladu, porovnania, POHLADY, VIDEO, type Fotka } from "../../lib/psb/kartoteka";
import { C, mix } from "../../lib/psb/theme";

/**
 * KARTOTÉKA FOTIEK DRŽANIA TELA — časť C anamnézy (5. 10. 2026).
 *
 * Fotky sa robia na úvodnom tréningu (a pri každom ďalšom fotení) rovno
 * z iPadu: políčko na súbor otvorí fotoaparát aj galériu. Pred odoslaním
 * sa fotka v prehliadači zmenší na 2000 px dlhšej strany — z iPadu chodia
 * 5–12 MB súbory, ktoré by sa nahrávali pol minúty a nič by nepridali.
 *
 * Čo sa nahrá, musí sa dať aj vidieť: zápis vracia úspech a zoznam sa po
 * ňom načíta znova zo servera (pravidlo „ticho zlyhávajúci zápis").
 */

type Odpoved = {
  ok: boolean; error?: string;
  fotky?: Fotka[]; poznamky?: Record<string, string>;
  suhlas?: boolean; ulozisko?: boolean; sifra?: boolean;
};

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

export function KartotekaFotiek({ meno, uzke }: { meno: string; uzke: boolean }) {
  const [d, setD] = useState<Odpoved | null>(null);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [den, setDen] = useState(() => dnesPraha());
  const [pohlad, setPohlad] = useState<string>("bok");
  const [osobne, setOsobne] = useState(false);
  const [nahravam, setNahravam] = useState<string | null>(null);
  const [zvacsena, setZvacsena] = useState<Fotka | null>(null);
  /** Prehrávané video z editora: zašifrované ide celé cez fetch, potom z pamäte. */
  const [video, setVideo] = useState<{ f: Fotka; url: string } | null>(null);
  /** Rozpísané poznámky po dňoch — zapisujú sa pri odchode z políčka. */
  const [koncepty, setKoncepty] = useState<Record<string, string>>({});
  const vstup = useRef<HTMLInputElement | null>(null);

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
    const na = (e: KeyboardEvent) => { if (e.key === "Escape") { setZvacsena(null); setVideo(null); } };
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
    for (let n = 0; n < subory.length; n++) {
      setNahravam(`Nahrávam ${n + 1} z ${subory.length}…`);
      try {
        const { blob, sirka, vyska } = await zmensi(subory[n]);
        const fd = new FormData();
        fd.append("klient", meno);
        fd.append("den", den);
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
    if (hotovo) setHlaska(hotovo === 1 ? "Fotka je v kartotéke." : `${hotovo} fotky sú v kartotéke.`);
    await nacitaj();
  };

  const zmenPohlad = async (f: Fotka, p: string) => {
    if (await posli({ akcia: "pohlad", id: f.id, pohlad: p })) await nacitaj();
  };

  const zmaz = async (f: Fotka) => {
    if (!window.confirm(`Zmazať fotku ${nazovPohladu(f.pohlad)} z ${denCz(f.den)}? Vrátiť sa to nedá.`)) return;
    if (await posli({ akcia: "zmaz", id: f.id })) { setZvacsena(null); setVideo(null); await nacitaj(); }
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: C.textMuted }}>
            deň{" "}
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
        </div>
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
              <div key={p.pohlad} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[p.prva, p.posledna].map((f, k) => (
                  <button key={f.id} type="button" onClick={() => setZvacsena(f)} style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.card, cursor: "zoom-in", textAlign: "left", fontFamily: "inherit" }}>
                    <img src={obrazok(f)} alt={`${nazovPohladu(p.pohlad)} ${denCz(f.den)}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover", background: C.bg }} />
                    <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.textMuted }}>
                      {nazovPohladu(p.pohlad)} · {k === 0 ? "prvá" : "posledná"} · {denCz(f.den)}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Z EDITORA ── porovnania predtým/potom a videá (Workspace → Editor) */}
      {zEditora.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim, marginBottom: 8 }}>Z editora</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${uzke ? 130 : 170}px, 1fr))`, gap: 8 }}>
            {zEditora.map((f) => (
              <button
                key={f.id} type="button"
                onClick={() => (f.pohlad === VIDEO ? void prehraj(f) : setZvacsena(f))}
                style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.card, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: C.text }}
              >
                {f.pohlad === VIDEO ? (
                  <div style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontSize: 34, color: C.accentLight }}>▶</div>
                ) : (
                  <img src={obrazok(f)} alt={`predtým / potom ${denCz(f.den)}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: C.bg }} />
                )}
                <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.textMuted }}>{nazovPohladu(f.pohlad)} · {denCz(f.den)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FOTENIA ── */}
      {!dni.length && (
        <div style={{ fontSize: 13, color: C.textDim }}>Zatiaľ žiadne fotky. Prvé sa robia na úvodnom tréningu — zboku, spredu, zozadu.</div>
      )}
      {dni.map((x) => (
        <div key={x.den} style={{ borderTop: `1px solid ${mix(C.border, 60)}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{denCz(x.den)}</span>
            <span style={{ fontSize: 11.5, color: C.textDim }}>
              {x.den === prveFotenie ? "prvé fotenie · " : ""}{x.fotky.length} {x.fotky.length === 1 ? "fotka" : x.fotky.length < 5 ? "fotky" : "fotiek"}
            </span>
            <span style={{ flexGrow: 1 }} />
            {/* Doplniť fotku k už existujúcemu foteniu — deň sa vezme z neho. */}
            <button
              type="button" disabled={!mozeNahrat || !!nahravam}
              onClick={() => { setDen(x.den); vstup.current?.click(); }}
              style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: mozeNahrat && !nahravam ? "pointer" : "default", opacity: mozeNahrat && !nahravam ? 1 : 0.5 }}
            >+ pridať fotky k tomuto dňu</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${uzke ? 120 : 150}px, 1fr))`, gap: 8, marginTop: 9 }}>
            {x.fotky.map((f) => (
              <div key={f.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
                <button type="button" onClick={() => setZvacsena(f)} style={{ display: "block", width: "100%", padding: 0, border: "none", background: C.bg, cursor: "zoom-in" }}>
                  <img src={obrazok(f)} alt={`${nazovPohladu(f.pohlad)} ${denCz(f.den)}`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover" }} />
                </button>
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
      {video && (
        <div
          role="dialog" aria-label="Video" onClick={() => setVideo(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: C.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 10 }}
        >
          <video src={video.url} controls autoPlay muted playsInline onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 110px)", borderRadius: 8, background: "#000" }} />
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: C.textMuted }}>
            <span>video · {denCz(video.f.den)}{video.f.kto ? ` · ${video.f.kto}` : ""}</span>
            <a href={video.url} download={`video-${meno}-${video.f.den}.${(video.f.typ || "").includes("webm") ? "webm" : "mp4"}`} style={{ color: C.accentLight, fontSize: 12.5 }}>stiahnuť</a>
            <button type="button" onClick={() => void zmaz(video.f)} style={{ background: "none", border: "none", color: C.red, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zmazať</button>
            <button type="button" onClick={() => setVideo(null)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zavrieť</button>
          </div>
        </div>
      )}

      {/* ── ZVÄČŠENIE ── nepriehľadné pozadie (pravidlo z 30. 9.: okno nad obsahom nesmie byť priesvitné) */}
      {zvacsena && (
        <div
          role="dialog" aria-label="Fotka" onClick={() => setZvacsena(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: C.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 10 }}
        >
          <img src={obrazok(zvacsena)} alt="" style={{ maxWidth: "100%", maxHeight: "calc(100vh - 110px)", objectFit: "contain", borderRadius: 8 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: C.textMuted }}>
            <span>{nazovPohladu(zvacsena.pohlad)} · {denCz(zvacsena.den)}{zvacsena.kto ? ` · ${zvacsena.kto}` : ""}</span>
            <button type="button" onClick={() => void zmaz(zvacsena)} style={{ background: "none", border: "none", color: C.red, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zmazať</button>
            <button type="button" onClick={() => setZvacsena(null)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zavrieť</button>
          </div>
        </div>
      )}
    </div>
  );
}
