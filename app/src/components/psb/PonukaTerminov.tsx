import { useCallback, useEffect, useMemo, useState } from "react";

import { dnesPraha, posunDen, terazPraha } from "../../lib/psb/cas";
import { TRENERI } from "../../lib/psb/mailFaktury";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import { textSmsPonuky } from "../../lib/psb/ponukaTerminov";
import type { Lead } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { SmsKlientovi } from "./SmsKlientovi";
import { useUzke } from "./useUzke";
import { VyberMena } from "./VyberMena";

/**
 * PONUKA TERMÍNOV — Workspace (Jerry, 7. 10. 2026: „A1 a B1").
 *
 * „Objaví sa klient, ktorý chce termín, ponúknem mu dva a nemôže ani jeden…
 * vytukal by som si všetky termíny, ktoré ponúkam, rovnako ako si vytukávam
 * udalosti v Google kalendári, potvrdil by som, vytvoril by sa odkaz
 * a poslal by som mu to SMS."
 *
 * Týždeň z kalendára trénerov; klik do voľného miesta = ponuka na 60 min
 * (po 15 min), −15/+15 a ×. Do obsadeného času ponuka nejde (kontroluje aj
 * server). Filter je ten istý ako vo Workspace: pri „všetko" má deň dva
 * pruhy, Jerry vľavo, Terezka vpravo. Klient vyberá na `/t/<token>`.
 */
type Udalost = { uid: string; trener: string; zaciatok: string; koniec: string | null; nazov: string | null; klient: string | null; zmizla_at: string | null };
type Navrh = { id: number; trener: string; den: string; od: number; minut: number };
type Ponuka = {
  token: string; klient: string; telefon: string | null; typ: string; platiDo: string; vybranyId: string | null;
  zruseneAt: string | null; createdAt: string; casy: { id: string; trener: string; zaciatok: string; koniec: string }[];
  volnych: number; stav: "vybrane" | "zrusene" | "vyprsala" | "obsadene" | "caka"; url: string;
};

const OD_H = 7, DO_H = 21;
const DNI = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const minuty = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const dm = (den: string) => `${Number(den.slice(8, 10))}. ${Number(den.slice(5, 7))}.`;
const pondelokTyzdna = (den: string) => {
  const d = new Date(`${den}T12:00:00Z`);
  return posunDen(den, -((d.getUTCDay() + 6) % 7));
};
const krstne = (meno: string) => meno.trim().split(/\s+/)[0] || "";
const PODPIS: Record<string, string> = { Jerry: TRENERI.Jerry?.krstne || "Filip", Terezka: TRENERI.Terezka?.krstne || "Terezka" };

export function PonukaTerminov({ mena, leads, trener }: { mena: string[]; leads: Lead[]; trener: string | null }) {
  const uzke = useUzke();
  const PX = uzke ? 30 : 40;
  // Od soboty sa ponúka budúci týždeň — tento už skoro nemá čo ponúknuť.
  const [pondelok, setPondelok] = useState(() => {
    const dnes = dnesPraha();
    const d = new Date(`${dnes}T12:00:00Z`).getUTCDay();
    return pondelokTyzdna(d === 6 || d === 0 ? posunDen(dnes, 2) : dnes);
  });
  const [udalosti, setUdalosti] = useState<Udalost[] | null>(null);
  const [navrhy, setNavrhy] = useState<Navrh[]>([]);
  const [klient, setKlient] = useState("");
  const [telefon, setTelefon] = useState("");
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState("");
  const [hotovo, setHotovo] = useState<{ url: string; klient: string; telefon: string; trener: string } | null>(null);
  const [ponuky, setPonuky] = useState<Ponuka[]>([]);
  const [blik, setBlik] = useState("");
  const [dalsieId, setDalsieId] = useState(1);

  const treneri = trener ? [trener] : ["Jerry", "Terezka"];
  const dni = useMemo(() => Array.from({ length: 7 }, (_, i) => posunDen(pondelok, i)), [pondelok]);

  const nacitajTyzden = useCallback(async () => {
    const j = await fetch(`/api/kalendar?tyzden=${pondelok}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).catch(() => null);
    if (j?.ok) setUdalosti((j.udalosti || []).filter((u: Udalost) => !u.zmizla_at));
    else setChyba("Kalendár sa nenačítal.");
  }, [pondelok]);
  const nacitajPonuky = useCallback(async () => {
    const j = await fetch("/api/ponuky", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setPonuky(j.ponuky || []);
  }, []);
  useEffect(() => { setUdalosti(null); void nacitajTyzden(); }, [nacitajTyzden]);
  useEffect(() => { void nacitajPonuky(); }, [nacitajPonuky]);
  // Klient si mohol medzitým vybrať — zoznam aj kalendár sa obnovia samy.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") { void nacitajPonuky(); void nacitajTyzden(); } }, 60_000);
    return () => clearInterval(t);
  }, [nacitajPonuky, nacitajTyzden]);
  useEffect(() => pocuvaj("kalendar", () => void nacitajTyzden()), [nacitajTyzden]);

  /** Nový človek z dopytu: meno nie je v klientoch, číslo z dopytu. */
  const dopyty = useMemo(() => leads.filter((l) => l.name && l.status !== "zruseny").slice(-60), [leads]);
  const jeKlient = mena.includes(klient);
  const dopyt = !jeKlient ? dopyty.find((l) => l.name === klient) : undefined;
  useEffect(() => { if (dopyt?.telefon) setTelefon(dopyt.telefon); }, [dopyt?.telefon]);
  const ponukaMena = useMemo(() => [...new Set([...mena, ...dopyty.map((l) => l.name)])], [mena, dopyty]);

  const obsadene = (den: string, tr: string, od: number, doMin: number, okrem?: Navrh) =>
    (udalosti || []).some((u) => u.trener === tr && u.zaciatok.slice(0, 10) === den
      && od < (u.koniec ? minuty(u.koniec) : minuty(u.zaciatok) + 60) && doMin > minuty(u.zaciatok))
    || navrhy.some((n) => n !== okrem && n.den === den && n.trener === tr && od < n.od + n.minut && doMin > n.od);
  const vMinulosti = (den: string, od: number) => `${den}T${hhmm(od)}` <= terazPraha();

  const pridaj = (den: string, tr: string, od: number) => {
    const k = `${den}|${tr}`;
    if (od + 60 > DO_H * 60 || obsadene(den, tr, od, od + 60) || vMinulosti(den, od)) { setBlik(k); setTimeout(() => setBlik(""), 450); return; }
    setNavrhy((xs) => [...xs, { id: dalsieId, trener: tr, den, od, minut: 60 }]);
    setDalsieId((x) => x + 1);
    setHotovo(null);
  };
  const zmenDlzku = (n: Navrh, o: number) => {
    const m = n.minut + o;
    if (m < 30 || m > 180 || n.od + m > DO_H * 60 || (o > 0 && obsadene(n.den, n.trener, n.od, n.od + m, n))) return;
    setNavrhy((xs) => xs.map((x) => (x.id === n.id ? { ...x, minut: m } : x)));
  };

  const vytvor = async () => {
    if (!klient.trim() || !navrhy.length) return;
    setBezi(true); setChyba("");
    const r = await fetch("/api/ponuky", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        akcia: "vytvor", klient: klient.trim(), telefon: telefon.trim() || undefined, typ: jeKlient ? "trening" : "uvodny",
        casy: navrhy.map((n) => ({ trener: n.trener, den: n.den, cas: hhmm(n.od), minut: n.minut })),
      }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setBezi(false);
    if (!r?.ok) { setChyba(r?.error || "Ponuka sa nevytvorila."); return; }
    const tr = navrhy[0]?.trener || trener || "Jerry";
    setHotovo({ url: r.url, klient: klient.trim(), telefon: telefon.trim(), trener: tr });
    setNavrhy([]);
    void nacitajPonuky();
  };
  const zrus = async (token: string) => {
    if (!window.confirm("Zrušiť túto ponuku? Odkaz klientovi prestane platiť.")) return;
    const r = await fetch("/api/ponuky", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ akcia: "zrus", token }) })
      .then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r?.ok) setChyba(r?.error || "Nezrušilo sa.");
    void nacitajPonuky();
  };

  const farba = (tr: string) => (tr === "Terezka" ? C.blue : C.accent);
  const zoradene = [...navrhy].sort((a, b) => a.den.localeCompare(b.den) || a.od - b.od);
  const nedela = dni[6];
  const STAV: Record<Ponuka["stav"], string> = { caka: "čaká na výber", vybrane: "vybral(a)", zrusene: "zrušená", vyprsala: "vypršala", obsadene: "všetko obsadené" };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: uzke ? "wrap" : "nowrap", alignItems: "flex-start" }}>
      {/* ── TÝŽDEŇ ── */}
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => { setPondelok(posunDen(pondelok, -7)); }} style={tl}>‹</button>
          <b style={{ fontSize: 14 }}>{dm(pondelok)} – {dm(nedela)} {nedela.slice(0, 4)}</b>
          <button type="button" onClick={() => { setPondelok(posunDen(pondelok, 7)); }} style={tl}>›</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: C.textDim }}>{trener ? `kalendár: ${trener}` : "Jerry vľavo · Terezka vpravo"}</span>
        </div>
        {!udalosti ? <div style={{ fontSize: 13, color: C.textDim, padding: 20 }}>Načítavam kalendár…</div> : (
          <div style={{ display: "grid", gridTemplateColumns: `${uzke ? 26 : 38}px repeat(7, 1fr)`, userSelect: "none" }}>
            <div />
            {dni.map((den, i) => (
              <div key={den} style={{ textAlign: "center", fontSize: 11.5, color: den === dnesPraha() ? C.accentLight : C.textMuted, paddingBottom: 5, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
                {DNI[i]}<b style={{ display: "block", fontSize: 14, color: den === dnesPraha() ? C.accentLight : C.text }}>{Number(den.slice(8, 10))}</b>
              </div>
            ))}
            <div>
              {Array.from({ length: DO_H - OD_H }, (_, h) => (
                <div key={h} style={{ height: PX, fontSize: 10, color: C.textDim, textAlign: "right", paddingRight: 4, transform: "translateY(-6px)" }}>{OD_H + h}{uzke ? "" : ":00"}</div>
              ))}
            </div>
            {dni.map((den) => (
              <div key={den} style={{ display: "grid", gridTemplateColumns: `repeat(${treneri.length}, 1fr)`, borderLeft: `1px solid ${mix(C.border, 60)}`, height: (DO_H - OD_H) * PX, backgroundImage: `linear-gradient(${mix(C.border, 45)} 1px, transparent 1px)`, backgroundSize: `100% ${PX}px` }}>
                {treneri.map((tr, ti) => (
                  <div
                    key={tr}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      pridaj(den, tr, OD_H * 60 + Math.floor(((e.clientY - r.top) / PX) * 4) * 15);
                    }}
                    style={{
                      position: "relative", cursor: "copy", borderLeft: ti ? `1px dashed ${mix(C.border, 40)}` : undefined,
                      background: blik === `${den}|${tr}` ? mix(C.red, 22) : undefined, transition: "background .2s",
                    }}
                  >
                    {(udalosti || []).filter((u) => u.trener === tr && u.zaciatok.slice(0, 10) === den).map((u) => {
                      const od = minuty(u.zaciatok), doMin = u.koniec ? minuty(u.koniec) : od + 60;
                      if (doMin <= OD_H * 60 || od >= DO_H * 60) return null;
                      return (
                        <div key={u.uid} title={`${u.zaciatok.slice(11, 16)} ${u.klient || u.nazov || ""}`} style={{
                          position: "absolute", left: 1, right: 1, top: (Math.max(od, OD_H * 60) - OD_H * 60) / 60 * PX, height: Math.max(10, (Math.min(doMin, DO_H * 60) - Math.max(od, OD_H * 60)) / 60 * PX - 2),
                          borderRadius: 5, background: mix(farba(tr), 16), borderLeft: `3px solid ${mix(farba(tr), 55)}`, fontSize: 10, lineHeight: 1.2, padding: "2px 4px",
                          color: C.textMuted, overflow: "hidden", pointerEvents: "none",
                        }}>{uzke ? "" : `${u.zaciatok.slice(11, 16)} `}{u.klient || u.nazov}</div>
                      );
                    })}
                    {navrhy.filter((n) => n.den === den && n.trener === tr).map((n) => (
                      <div key={n.id} onClick={(e) => e.stopPropagation()} style={{
                        position: "absolute", left: 1, right: 1, top: (n.od - OD_H * 60) / 60 * PX, height: n.minut / 60 * PX - 2, zIndex: 2,
                        borderRadius: 6, border: `2px dashed ${farba(tr)}`, background: mix(farba(tr), 12), color: tr === "Terezka" ? C.blue : C.accentLight,
                        fontSize: 10.5, fontWeight: 700, padding: "2px 3px", display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "default",
                      }}>
                        <span>{hhmm(n.od)}–{hhmm(n.od + n.minut)}</span>
                        <span style={{ display: "flex", gap: 2 }}>
                          {[["−15", () => zmenDlzku(n, -15)], ["+15", () => zmenDlzku(n, 15)], ["×", () => setNavrhy((xs) => xs.filter((x) => x.id !== n.id))]].map(([t, f]) => (
                            <button key={t as string} type="button" onClick={f as () => void} style={{ flex: 1, padding: 0, border: 0, borderRadius: 3, background: "rgba(0,0,0,.35)", color: "inherit", font: "inherit", fontSize: 9.5, cursor: "pointer" }}>{t as string}</button>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PANEL ── */}
      <div style={{ width: uzke ? "100%" : 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={stitok}>Komu</div>
        <VyberMena hodnota={klient} mena={ponukaMena} onZmen={(v) => { setKlient(v); setHotovo(null); }} placeholder="klient alebo nový z dopytu…" />
        {klient.trim() && !jeKlient && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>{dopyt ? "nový z dopytu" : "nový človek"} — dostane <b>úvodný tréning</b></div>
            <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="telefón" inputMode="tel"
              style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13 }} />
          </div>
        )}
        <div style={{ ...stitok, marginTop: 4 }}>Ponúkané termíny {zoradene.length ? `(${zoradene.length})` : ""}</div>
        {!zoradene.length && <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>Ťukni do voľného miesta v týždni — pribudne termín na 60 min. Na bloku −15 / +15 a ×.</div>}
        {zoradene.map((n) => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 8, background: C.surface, border: `1px solid ${mix(C.border, 100)}`, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: farba(n.trener) }} />
            {DNI[(new Date(`${n.den}T12:00:00Z`).getUTCDay() + 6) % 7]} {dm(n.den)} · <b>{hhmm(n.od)}</b> · {n.minut} min{trener ? "" : ` · ${n.trener}`}
            <button type="button" onClick={() => setNavrhy((xs) => xs.filter((x) => x.id !== n.id))} style={{ marginLeft: "auto", background: "none", border: 0, color: C.textDim, cursor: "pointer" }}>✕</button>
          </div>
        ))}
        {zoradene.length > 0 && <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.5 }}>Platí do nedele {dm(posunDen(pondelokTyzdna(zoradene[zoradene.length - 1].den), 6))} alebo kým si nevyberie. Vybraný termín zmizne aj z ponúk iným.</div>}
        <button type="button" disabled={!klient.trim() || !zoradene.length || bezi} onClick={() => void vytvor()} style={{
          padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 16), color: C.accentLight,
          fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !klient.trim() || !zoradene.length || bezi ? 0.5 : 1,
        }}>{bezi ? "Vytváram…" : "Vytvoriť odkaz a SMS"}</button>
        {chyba && <div style={{ fontSize: 12.5, color: C.red }}>{chyba}</div>}
        {hotovo && (
          <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 8), display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, color: C.green }}>Odkaz je hotový — <a href={hotovo.url} target="_blank" rel="noreferrer" style={{ color: C.green }}>pozrieť, čo uvidí</a>.</div>
            <SmsKlientovi
              meno={hotovo.klient} trener={hotovo.trener} vlozene ponuka
              cisloNovehoCloveka={hotovo.telefon || undefined}
              predvolenyText={textSmsPonuky(krstne(hotovo.klient), hotovo.url, PODPIS[hotovo.trener] || "")}
              onOdoslane={() => { oznam("kalendar"); void nacitajPonuky(); }}
            />
          </div>
        )}

        {/* ── POSLANÉ PONUKY ── */}
        {ponuky.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={stitok}>Poslané ponuky</div>
            {ponuky.filter((p) => !trener || p.casy.some((c) => c.trener === trener)).slice(0, 12).map((p) => {
              const vybrany = p.casy.find((c) => c.id === p.vybranyId);
              return (
                <div key={p.token} style={{ padding: "7px 9px", borderRadius: 8, background: C.surface, border: `1px solid ${mix(C.border, 100)}`, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <b>{p.klient}</b>
                    <span style={{ color: p.stav === "vybrane" ? C.green : p.stav === "caka" ? C.accentLight : C.textDim, fontSize: 11.5 }}>
                      {STAV[p.stav]}{vybrany ? ` ${DNI[(new Date(`${vybrany.zaciatok.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7]} ${dm(vybrany.zaciatok)} ${vybrany.zaciatok.slice(11, 16)}` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.textDim }}>
                    {p.casy.length} {p.casy.length === 1 ? "termín" : p.casy.length < 5 ? "termíny" : "termínov"}{p.stav === "caka" ? ` · voľných ${p.volnych} · do ${dm(p.platiDo)}` : ""}
                    {" · "}<a href={p.url} target="_blank" rel="noreferrer" style={{ color: C.textMuted }}>odkaz</a>
                    {p.stav === "caka" && <> · <button type="button" onClick={() => void zrus(p.token)} style={{ background: "none", border: 0, padding: 0, color: C.red, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}>zrušiť</button></>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const tl = { padding: "5px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "inherit", fontSize: 14, cursor: "pointer" } as const;
const stitok = { fontSize: 10.5, letterSpacing: 1.1, textTransform: "uppercase" as const, color: C.textDim, fontWeight: 600 };
