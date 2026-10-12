import { useCallback, useEffect, useRef, useState } from "react";

import { POKUSY_NA_CAST, rozsahCasti, velkostCitatelne, type Nahratie } from "../../lib/psb/striznaNahrate";
import { C, mix } from "../../lib/psb/theme";
import { Card } from "./ui";

/**
 * NAHRAŤ DO STRIŽNE (12. 10. 2026) — videá z telefónu pre Mac appku Strižňa.
 *
 * Marketing → „Nahrať do Strižne" (na telefóne aj vo ≡ Viac). Video ide po
 * 25 MB častiach (R2 multipart cez `/api/strizna/nahrate`) — Worker väčšie
 * telo neprijme a 4K klip z iPhonu má stovky MB. Každá časť sa skúsi až 3×.
 * Safari pri zamknutom telefóne JavaScript zastaví, preto stránka drží
 * obrazovku zapnutú (Wake Lock), kým sa nahráva, a hovorí to aj slovom.
 */

type Priebeh = { id: string; meno: string; velkost: number; poslane: number; stav: "caka" | "nahrava" | "hotovo" | "chyba"; chyba?: string };

/** Jedna časť cez XHR — fetch nevie hlásiť priebeh odosielania. */
function posliCast(url: string, telo: Blob, onBajty: (b: number) => void, zrus: AbortSignal): Promise<{ ok: boolean; etag?: string; chyba?: string }> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.withCredentials = true;
    x.upload.onprogress = (e) => onBajty(e.loaded);
    x.onload = () => {
      let j: { ok?: boolean; etag?: string; error?: string } | null = null;
      try { j = JSON.parse(x.responseText); } catch { /* nižšie */ }
      if (x.status === 200 && j?.ok && j.etag) resolve({ ok: true, etag: j.etag });
      else resolve({ ok: false, chyba: j?.error || `HTTP ${x.status}: ${x.responseText.slice(0, 200)}` });
    };
    x.onerror = () => resolve({ ok: false, chyba: "spojenie zlyhalo" });
    x.ontimeout = () => resolve({ ok: false, chyba: "vypršal čas" });
    zrus.addEventListener("abort", () => { x.abort(); resolve({ ok: false, chyba: "zrušené" }); });
    x.send(telo);
  });
}

async function postJson(url: string, telo: unknown): Promise<{ ok?: boolean; error?: string; [k: string]: unknown }> {
  return fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(telo) })
    .then(async (r) => {
      const t = await r.text();
      try { return JSON.parse(t); } catch { return { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 200)}` }; }
    })
    .catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
}

const kedy = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function StriznaNahrat() {
  const [priebehy, setPriebehy] = useState<Priebeh[]>([]);
  const [zoznam, setZoznam] = useState<Nahratie[] | null>(null);
  const [chybaZoznamu, setChybaZoznamu] = useState("");
  const [bezi, setBezi] = useState(false);
  const zrusenie = useRef<AbortController | null>(null);
  const vstup = useRef<HTMLInputElement | null>(null);

  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/strizna/nahrate?vsetky=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).catch(() => null);
    if (j?.ok) { setZoznam(j.polozky as Nahratie[]); setChybaZoznamu(""); }
    else setChybaZoznamu(j?.error || "Zoznam sa nenačítal.");
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  // Kým sa nahráva: obrazovka nezhasne (Wake Lock) a odchod zo stránky sa spýta.
  useEffect(() => {
    if (!bezi) return;
    let zamok: { release: () => Promise<void> } | null = null;
    const vezmi = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") zamok = await wl.request("screen");
      } catch { /* bez zámku — ostáva veta na obrazovke */ }
    };
    void vezmi();
    const naViditelnost = () => { if (document.visibilityState === "visible") void vezmi(); };
    const preOdchod = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    document.addEventListener("visibilitychange", naViditelnost);
    window.addEventListener("beforeunload", preOdchod);
    return () => {
      document.removeEventListener("visibilitychange", naViditelnost);
      window.removeEventListener("beforeunload", preOdchod);
      void zamok?.release().catch(() => {});
    };
  }, [bezi]);

  const uprav = (i: number, z: Partial<Priebeh>) => setPriebehy((p) => p.map((x, j) => (j === i ? { ...x, ...z } : x)));

  const nahrajJeden = async (subor: File, i: number, zrus: AbortSignal): Promise<boolean> => {
    uprav(i, { stav: "nahrava" });
    const start = await postJson("/api/strizna/nahrate", { nazov: subor.name, velkost: subor.size, typ: subor.type });
    if (!start.ok) { uprav(i, { stav: "chyba", chyba: String(start.error || "nezačalo sa") }); return false; }
    const id = String(start.id);
    const velkostCasti = Number(start.velkostCasti);
    const pocet = Number(start.pocetCasti);
    uprav(i, { id });
    const casti: { cislo: number; etag: string }[] = [];
    let hotove = 0;
    for (let n = 1; n <= pocet; n++) {
      const { od, po } = rozsahCasti(n, subor.size, velkostCasti);
      const kus = subor.slice(od, po);
      let vysledok: { ok: boolean; etag?: string; chyba?: string } = { ok: false };
      for (let pokus = 1; pokus <= POKUSY_NA_CAST; pokus++) {
        if (zrus.aborted) break;
        vysledok = await posliCast(`/api/strizna/nahrate/${id}/cast/${n}`, kus, (b) => uprav(i, { poslane: hotove + b }), zrus);
        if (vysledok.ok) break;
        if (pokus < POKUSY_NA_CAST) await new Promise((r) => setTimeout(r, 1500 * pokus));
      }
      if (!vysledok.ok || !vysledok.etag) {
        await postJson(`/api/strizna/nahrate/${id}/zrus`, {});
        uprav(i, { stav: "chyba", chyba: zrus.aborted ? "zrušené" : `časť ${n} z ${pocet}: ${vysledok.chyba || "neuložila sa"}` });
        return false;
      }
      casti.push({ cislo: n, etag: vysledok.etag });
      hotove = po;
      uprav(i, { poslane: hotove });
    }
    const koniec = await postJson(`/api/strizna/nahrate/${id}/dokonci`, { casti });
    if (!koniec.ok) { uprav(i, { stav: "chyba", chyba: String(koniec.error || "nedokončilo sa") }); return false; }
    uprav(i, { stav: "hotovo", poslane: subor.size });
    return true;
  };

  const vybrane = async (subory: File[]) => {
    if (!subory.length || bezi) return;
    const zaciatok = priebehy.length;
    setPriebehy((p) => [...p, ...subory.map((s) => ({ id: "", meno: s.name, velkost: s.size, poslane: 0, stav: "caka" as const }))]);
    const ac = new AbortController();
    zrusenie.current = ac;
    setBezi(true);
    for (let k = 0; k < subory.length; k++) {
      if (ac.signal.aborted) { uprav(zaciatok + k, { stav: "chyba", chyba: "zrušené" }); continue; }
      await nahrajJeden(subory[k], zaciatok + k, ac.signal);
      void nacitaj();
    }
    setBezi(false);
    zrusenie.current = null;
    if (vstup.current) vstup.current.value = "";
  };

  const zrusVsetko = () => zrusenie.current?.abort();

  const zrusPolozku = async (p: Nahratie) => {
    const otazka = p.stav === "nahrava" ? `Zrušiť nedokončené „${p.nazov}"?` : `Zmazať „${p.nazov}" — Strižňa ho ešte nestiahla?`;
    if (!window.confirm(otazka)) return;
    const j = await postJson(`/api/strizna/nahrate/${p.id}/zrus`, {});
    if (!j.ok) window.alert(String(j.error || "Nezmazalo sa."));
    void nacitaj();
  };

  const tlacidlo = { padding: "16px 20px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 17, fontWeight: 700 } as const;
  const stavText: Record<Nahratie["stav"], [string, string]> = {
    nahrava: ["nedokončené", C.orange],
    nahrate: ["čaká na Strižňu", C.accentLight],
    stiahnute: ["stiahnuté", C.textMuted],
  };

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 640 }}>
      <Card>
        <div style={{ fontSize: 15, color: C.textMuted, marginBottom: 12 }}>
          Videá z telefónu pôjdu do Strižne na Macu — stiahne si ich sama.
        </div>
        <input ref={vstup} type="file" accept="video/*" multiple style={{ display: "none" }}
          onChange={(e) => void vybrane(Array.from(e.currentTarget.files || []))} />
        <button disabled={bezi} onClick={() => vstup.current?.click()}
          style={{ ...tlacidlo, width: "100%", background: bezi ? mix(C.accent, 35) : C.accent, color: C.onAccent, cursor: bezi ? "default" : "pointer" }}>
          {bezi ? "Nahráva sa…" : "Vybrať videá"}
        </button>
        {bezi && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: mix(C.orange, 14), color: C.text, fontSize: 13.5, lineHeight: 1.45 }}>
            Nechaj túto stránku otvorenú a telefón nezamykaj — inak Safari nahrávanie zastaví.
            <button onClick={zrusVsetko} style={{ marginLeft: 8, background: "none", border: "none", color: C.textDim, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>zrušiť</button>
          </div>
        )}
        {priebehy.length > 0 && (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {priebehy.map((p, i) => {
              const pct = p.velkost ? Math.min(100, Math.round((p.poslane / p.velkost) * 100)) : 0;
              const farba = p.stav === "chyba" ? C.red : p.stav === "hotovo" ? C.green : C.accent;
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p.meno}</span>
                    <span style={{ color: p.stav === "chyba" ? C.red : C.textMuted, flex: "none" }}>
                      {p.stav === "hotovo" ? "✓ nahraté" : p.stav === "chyba" ? "chyba" : p.stav === "caka" ? "čaká" : `${pct} %`} · {velkostCitatelne(p.velkost)}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: C.track, marginTop: 5, overflow: "hidden" }}>
                    <div style={{ width: `${p.stav === "hotovo" ? 100 : pct}%`, height: "100%", background: farba, transition: "width .3s" }} />
                  </div>
                  {p.chyba && <div style={{ color: C.red, fontSize: 12.5, marginTop: 4 }}>{p.chyba}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Nahraté</div>
        {chybaZoznamu && <div style={{ color: C.red, fontSize: 13 }}>{chybaZoznamu}</div>}
        {zoznam === null && !chybaZoznamu && <div style={{ color: C.textMuted, fontSize: 13 }}>Načítavam…</div>}
        {zoznam?.length === 0 && <div style={{ color: C.textMuted, fontSize: 13 }}>Zatiaľ nič.</div>}
        {zoznam?.map((p) => {
          const [text, farba] = stavText[p.stav] || [p.stav, C.textMuted];
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${mix(C.border, 55)}`, fontSize: 13.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nazov}</div>
                <div style={{ color: C.textDim, fontSize: 12 }}>
                  {velkostCitatelne(p.velkost)} · {kedy(p.stiahnuteKedy || p.nahrateKedy)}{p.kto ? ` · ${p.kto}` : ""}
                </div>
              </div>
              <span style={{ color: farba, fontSize: 12.5, fontWeight: 600, flex: "none" }}>{text}</span>
              {p.stav !== "stiahnute" && !bezi && (
                <button onClick={() => void zrusPolozku(p)} aria-label="Zmazať" title="Zmazať"
                  style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16, padding: "0 4px", flex: "none" }}>×</button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
