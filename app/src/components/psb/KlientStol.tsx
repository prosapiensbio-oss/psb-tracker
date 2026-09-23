import { useCallback, useEffect, useMemo, useState } from "react";

import { normName, fmtCZK, fmtDMY } from "../../lib/psb/format";
import { osCasuKlienta } from "../../lib/psb/klientOsCasu";
import type { ClientAgg } from "../../lib/psb/compute";
import type { PSBData } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { Dennik } from "./Dennik";
import { Info } from "./ui";

/**
 * Pracovný stôl jedného klienta — vyhľadaj a rob na ňom.
 *
 * Jerry, 23. 9. 2026: „chcel by som tam mať vyhľadávanie, vybrať klienta,
 * ukázal by sa mi jeho profil a mal by som tam možnosť robiť… aj listy:
 * tréningy (kedy bol + kedy bude), financie (všetky platby) a balíky —
 * miesto, kde ich nahadzujem."
 *
 * A jedna vec navyše, ktorú si vypýtal menovite: **s nahodením balíka má
 * vzniknúť mínus, ktorý zmizne, keď klient zaplatí.**
 *
 * MÍNUS SA NEVYMÝŠĽA
 *
 * Počíta sa z toho, čo je v appke úplné: predané balíčky z vlastnej
 * evidencie proti platbám z PTmindera (tie sú dnes jediný úplný zdroj —
 * vlastná kniha platieb má zatiaľ len banku od januára a hotovosť v nej
 * nie je). Obe sumy sú vidieť vedľa rozdielu, aby sa dalo overiť, z čoho
 * to číslo je. Keď sa súbežný chod dokončí a platby budú kompletné
 * v Kokpite, zdroj sa prepne — dovtedy by tichý odhad klamal.
 */

type Balicek = {
  id: string; klient: string; nazov: string; hodiny: number | null;
  platnost_od: string; platnost_do: string | null; cena_czk: number | null;
  zdroj: string; poznamka: string | null; zrusene_at: string | null;
};

const dnesISO = () => new Date().toISOString().slice(0, 10);

export function KlientStol({ clients, mena, data, kalUdalosti, btcSats }: {
  clients: Record<string, ClientAgg>;
  mena: string[];
  data: PSBData;
  kalUdalosti?: { zaciatok: string; klient: string | null; typ: string | null }[];
  /** Koľko satoshi klient celkovo zaplatil (z appky PSB Bitcoin). */
  btcSats?: Record<string, number>;
}) {
  const [hladam, setHladam] = useState("");
  const [novy, setNovy] = useState(false);
  const [meno, setMeno] = useState("");
  const [zalozka, setZalozka] = useState<"treningy" | "financie" | "balicky" | "poznamky" | "puvod">("treningy");
  const [balicky, setBalicky] = useState<Balicek[]>([]);
  const [pisem, setPisem] = useState(false);
  const [f, setF] = useState({ nazov: "", hodiny: "", platnostOd: dnesISO(), platnostDo: "", cenaCzk: "", poznamka: "" });
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");

  const nacitajBalicky = useCallback(async () => {
    const r = await fetch("/api/balicky", { credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setBalicky(r.balicky || []);
  }, []);
  useEffect(() => { void nacitajBalicky(); }, [nacitajBalicky]);

  const c = meno ? clients[meno] : undefined;
  const os = useMemo(
    () => (meno ? osCasuKlienta(meno, { sessions: data.sessions as never, payments: data.payments as never, packages: (data.packages || []) as never, kalUdalosti }) : []),
    [meno, data.sessions, data.payments, data.packages, kalUdalosti],
  );

  const mojeBalicky = useMemo(
    () => balicky.filter((b) => normName(b.klient) === normName(meno) && !b.zrusene_at).sort((a, b) => b.platnost_od.localeCompare(a.platnost_od)),
    [balicky, meno],
  );

  const buduce = useMemo(() => {
    const d = dnesISO();
    return (kalUdalosti || [])
      .filter((u) => u.klient && normName(u.klient) === normName(meno) && (u.typ === "trening" || u.typ === "uvodny") && u.zaciatok.slice(0, 10) >= d)
      .map((u) => u.zaciatok)
      .sort();
  }, [kalUdalosti, meno]);

  const platby = useMemo(
    () => (data.payments || []).filter((p) => normName(p.client) === normName(meno)).sort((a, b) => b.date.localeCompare(a.date)),
    [data.payments, meno],
  );

  /** Dopyt, z ktorého klient vznikol — odkiaľ prišiel a za čo sme ho kúpili. */
  const dopyt = useMemo(
    () => (data.leads || []).find((l) => normName(l.name || "") === normName(meno)) || null,
    [data.leads, meno],
  );

  /** Koho priviedol — klienti, ktorí ho uviedli ako odporúčateľa. */
  const priviedol = useMemo(
    () => Object.values(clients).filter((x) => x.zdrojKto && normName(x.zdrojKto) === normName(meno)).map((x) => x.name),
    [clients, meno],
  );

  /** Nezaplatené poplatky z PTmindera. */
  const poplatkyKlienta = useMemo(
    () => (data.poplatky || []).filter((x) => normName((x as { client?: string }).client || "") === normName(meno)),
    [data.poplatky, meno],
  );

  /** Závery z debát s Jarvisom, ktoré sa týkajú tohto klienta. */
  const zavery = useMemo(
    () => (data.zavery || []).filter((z) => normName((z as { klient?: string }).klient || "") === normName(meno)),
    [data.zavery, meno],
  );

  // Mínus: predané z vlastnej evidencie proti zaplatenému z PTmindera.
  const predane = mojeBalicky.reduce((a, b) => a + (b.cena_czk || 0), 0);
  const zaplatene = platby.reduce((a, p) => a + p.amount, 0);
  const rozdiel = Math.round(predane - zaplatene);

  const pridaj = async () => {
    setPracujem(true); setChyba("");
    const r = await fetch("/api/balicky", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "pridaj", klient: meno, ...f }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa uložiť"); return; }
    setF({ nazov: "", hodiny: "", platnostOd: dnesISO(), platnostDo: "", cenaCzk: "", poznamka: "" });
    setPisem(false);
    await nacitajBalicky();
  };

  if (!meno) {
    /**
     * Zoznam VŠETKÝCH klientov abecedne, vyhľadávanie hore.
     *
     * Prvá verzia ukazovala prázdno, kým človek nezačal písať. Jerry, 23. 9.
     * 2026: „nech sú tam všetci v zozname abecedne a hneď na vrchu je
     * vyhľadávanie." Prázdna obrazovka núti vedieť meno vopred; zoznam ho
     * ponúkne — a pri sedemdesiatich menách sa v ňom dá aj len pozerať.
     */
    const vsetci = [...new Set([...mena, ...Object.keys(data.clientOverrides || {})])]
      .sort((a, b) => a.localeCompare(b, "sk"));
    const q = normName(hladam);
    const vidno = q ? vsetci.filter((m) => normName(m).includes(q)) : vsetci;
    const bezSedeni = new Set(vsetci.filter((m) => !clients[m]));

    return (
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={hladam}
            onChange={(e) => setHladam(e.target.value)}
            placeholder="hľadať klienta…"
            autoFocus
            style={{ flex: "1 1 260px", minWidth: 200, padding: "9px 12px", borderRadius: 10, fontSize: 13.5, background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
          />
          <button onClick={() => setNovy(true)} style={{ ...navrhTlacidlo, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>
            + Nový klient
          </button>
          <span style={{ fontSize: 11.5, color: C.textDim }}>{vidno.length} z {vsetci.length}</span>
        </div>

        {novy && <NovyKlient onHotovo={(m: string | null) => { setNovy(false); if (m) setMeno(m); }} />}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {vidno.map((m) => (
            <button key={m} onClick={() => { setMeno(m); setHladam(""); }} style={{
              ...navrhTlacidlo,
              color: bezSedeni.has(m) ? C.textDim : C.text,
              borderStyle: bezSedeni.has(m) ? "dashed" : "solid",
            }} title={bezSedeni.has(m) ? "Zatiaľ bez sedení — čaká na export z PTmindera" : undefined}>
              {m}
            </button>
          ))}
          {!vidno.length && <Prazdne>Nikto taký. Skús menej písmen, alebo ho založ tlačidlom vyššie.</Prazdne>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{meno}</div>
        {c && <div style={{ fontSize: 11.5, color: C.textMuted }}>{c.status} · {c.primaryTrainer} · {c.sessionCount} sedení</div>}
        <button onClick={() => { setMeno(""); setZalozka("treningy"); }} style={{ ...navrhTlacidlo, marginLeft: "auto" }}>zmeniť klienta</button>
      </div>

      {/* VŠETKO, čo o klientovi appka vie — Jerry, 23. 9. 2026: „na tom
          profile chcem, aby bolo úplne všetko, čo si schopný o tom klientovi
          zistiť z celého Kokpitu."
          Ukazuje sa len to, čo je vyplnené: prázdne políčka by zo štítkov
          spravili tapetu a to, čo tam naozaj je, by sa v nich stratilo. */}
      {c && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {stitky(c, dopyt, priviedol, poplatkyKlienta, btcSats?.[meno]).map((x) => (
            <span key={x.k} title={x.info} style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 7,
              background: mix(x.farba || C.border, 22), color: x.farba || C.textMuted,
              border: `1px solid ${mix(x.farba || C.border, 60)}`,
            }}>
              <span style={{ opacity: 0.75 }}>{x.k}</span> {x.v}
            </span>
          ))}
        </div>
      )}

      {/* Mínus — to, čo si Jerry vypýtal menovite. Obe sumy sú vidieť, aby
          sa dalo overiť, z čoho to číslo vzniklo. */}
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap", padding: "9px 11px", borderRadius: 9, background: mix(rozdiel > 0 ? C.red : C.green, 10), marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: rozdiel > 0 ? C.red : C.green }}>
          {rozdiel > 0 ? `dlhuje ${fmtCZK(rozdiel)}` : rozdiel < 0 ? `predplatené ${fmtCZK(-rozdiel)}` : "vyrovnané"}
        </div>
        <div style={{ fontSize: 11.5, color: C.textMuted }}>
          predané balíčky {fmtCZK(predane)} · zaplatené {fmtCZK(zaplatene)}
        </div>
        <Info text="Predané balíčky sú z vlastnej evidencie Kokpitu, zaplatené z PTmindera — tie sú dnes jediný úplný zdroj (vlastná kniha platieb má zatiaľ len banku od januára, hotovosť v nej nie je). Keď sa súbežný chod dokončí, zdroj sa prepne. Balíček bez ceny sa do „predaného“ neráta." label="" />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {([["treningy", `Tréningy (${os.filter((x) => x.druh === "trening").length}${buduce.length ? ` + ${buduce.length}` : ""})`],
           ["financie", `Financie (${platby.length})`],
           ["balicky", `Balíčky (${mojeBalicky.length})`],
           ["poznamky", "Poznámky a história"],
           ["puvod", `Odkiaľ prišiel${priviedol.length ? ` · priviedol ${priviedol.length}` : ""}`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setZalozka(id)} style={podzalozka(zalozka === id)}>{label}</button>
        ))}
      </div>

      <div style={{ maxHeight: "min(46vh, 420px)", overflowY: "auto" }}>
        {zalozka === "treningy" && (
          <>
            {buduce.map((z) => (
              <div key={z} style={{ ...riadok, color: C.blue }}>
                <span style={stlpecDen}>{fmtDMY(z.slice(0, 10))}</span>
                <span style={{ flex: 1 }}>objednané {z.slice(11, 16)} · z kalendára</span>
              </div>
            ))}
            {os.filter((x) => x.druh === "trening").map((x, i) => (
              <div key={i} style={riadok}>
                <span style={stlpecDen}>{fmtDMY(x.den)}</span>
                <span style={{ flex: 1, color: C.textMuted }}>
                  {x.druh === "trening" && [x.cas, x.trener, x.nazov].filter(Boolean).join(" · ")}
                </span>
                {x.druh === "trening" && x.zKalendara && <span style={{ fontSize: 11, color: C.blue }}>z kalendára</span>}
              </div>
            ))}
            {!os.some((x) => x.druh === "trening") && !buduce.length && <Prazdne>Žiadne tréningy.</Prazdne>}
          </>
        )}

        {zalozka === "financie" && (
          platby.length ? platby.map((p, i) => (
            <div key={i} style={riadok}>
              <span style={stlpecDen}>{fmtDMY(p.date)}</span>
              <span style={{ flex: 1, color: C.textMuted }}>{p.method === "bank" ? "prevodom" : p.method === "cash" ? "hotovosť" : "iné"}</span>
              <span style={{ color: C.green, fontWeight: 700 }}>{fmtCZK(p.amount)}</span>
            </div>
          )) : <Prazdne>Žiadne platby — barter alebo platí inak.</Prazdne>
        )}

        {zalozka === "poznamky" && (
          <>
            {c?.trainerNote && <Blok nadpis="Poznámka trénera">{c.trainerNote}</Blok>}
            {c?.precoNeprisiel && <Blok nadpis="Prečo po úvodnom neprišiel">{c.precoNeprisiel}</Blok>}
            {c?.duch && <Blok nadpis="Odchod">{c.duch}</Blok>}
            {c?.specialRateNote && <Blok nadpis="Špeciálna sadzba">{c.specialRateNote}</Blok>}
            {zavery.map((z, i) => (
              <Blok key={i} nadpis={`Záver z debaty${(z as { datum?: string }).datum ? ` · ${fmtDMY((z as { datum: string }).datum)}` : ""}`}>
                {(z as { text?: string }).text || ""}
              </Blok>
            ))}
            {/* Denník ťahá zápisy, poznámky pri zrušených tréningoch, odpovede
                na notifikácie a merania bolesti — všetko na jednej osi. */}
            <div style={{ marginTop: 10 }}>
              <Dennik meno={meno} limit={12} />
            </div>
          </>
        )}

        {zalozka === "puvod" && (
          <>
            {dopyt ? (
              <>
                <div style={riadok}>
                  <span style={stlpecDen}>{fmtDMY(dopyt.date)}</span>
                  <span style={{ flex: 1 }}>prišiel dopyt · <b>{dopyt.source}</b>{dopyt.status ? ` · ${dopyt.status}` : ""}</span>
                </div>
                {(dopyt as { kampan?: string }).kampan && (
                  <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>kampaň: {(dopyt as { kampan: string }).kampan}</span></div>
                )}
                {(dopyt as { stranka?: string }).stranka && (
                  <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>stránka: {(dopyt as { stranka: string }).stranka}</span></div>
                )}
                {dopyt.note && <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>{dopyt.note}</span></div>}
                {(dopyt.email || dopyt.telefon) && (
                  <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>{[dopyt.email, dopyt.telefon].filter(Boolean).join(" · ")}</span></div>
                )}
              </>
            ) : (
              <Prazdne>Dopyt sa nenašiel — klient prišiel skôr, než appka dopyty evidovala, alebo cez niekoho.</Prazdne>
            )}
            {c?.zdrojKto && (
              <div style={{ ...riadok, marginTop: 8 }}>
                <span style={stlpecDen} /><span style={{ flex: 1 }}>priviedol ho: <b>{c.zdrojKto}</b></span>
              </div>
            )}
            {priviedol.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Koho priviedol ({priviedol.length})</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {priviedol.map((m) => <button key={m} onClick={() => setMeno(m)} style={navrhTlacidlo}>{m}</button>)}
                </div>
              </div>
            )}
          </>
        )}

        {zalozka === "balicky" && (
          <>
            {mojeBalicky.map((b) => (
              <div key={b.id} style={riadok}>
                <span style={stlpecDen}>{fmtDMY(b.platnost_od)}</span>
                <span style={{ flex: 1 }}>
                  <b style={{ fontSize: 12.5 }}>{b.nazov}</b>
                  <span style={{ color: C.textMuted, fontSize: 11.5 }}>
                    {" "}· {b.hodiny ? `${b.hodiny} h` : "bez limitu"}
                    {b.platnost_do ? ` · do ${fmtDMY(b.platnost_do)}` : " · bez konca"}
                    {b.zdroj === "ptminder" ? " · z PTmindera" : ""}
                  </span>
                </span>
                <span style={{ color: b.cena_czk ? C.text : C.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {b.cena_czk ? fmtCZK(b.cena_czk) : "bez ceny"}
                </span>
              </div>
            ))}
            {!mojeBalicky.length && <Prazdne>Zatiaľ žiadny balíček v Kokpite.</Prazdne>}
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={() => setPisem(!pisem)} style={{ ...navrhTlacidlo, borderColor: mix(C.accentLight, 45), color: C.accentLight }}>
          {pisem ? "Zavrieť" : "+ Nahodiť balíček alebo členstvo"}
        </button>
      </div>

      {pisem && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {([
            { k: "nazov" as const, l: "názov (napr. OFF - 6h S viazanostou)", w: 240 },
            { k: "hodiny" as const, l: "hodín (prázdne = paušál)", w: 150 },
            { k: "platnostOd" as const, l: "platí od", w: 120 },
            { k: "platnostDo" as const, l: "platí do", w: 120 },
            { k: "cenaCzk" as const, l: "cena Kč", w: 100 },
            { k: "poznamka" as const, l: "poznámka", w: 180 },
          ]).map((x) => (
            <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
              {x.l}
              <input
                value={f[x.k]}
                onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
                placeholder={x.k.startsWith("platnost") ? "RRRR-MM-DD" : ""}
                style={{ width: x.w, padding: "7px 9px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
              />
            </label>
          ))}
          <button onClick={() => void pridaj()} disabled={pracujem || !f.nazov.trim()} style={{
            padding: "8px 15px", borderRadius: 9, fontSize: 12.5, fontWeight: 700,
            cursor: f.nazov.trim() ? "pointer" : "not-allowed",
            border: `1px solid ${mix(C.green, 50)}`, background: f.nazov.trim() ? mix(C.green, 12) : "transparent",
            color: f.nazov.trim() ? C.green : C.textDim,
          }}>
            {pracujem ? "…" : "Nahodiť"}
          </button>
        </div>
      )}
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
    </div>
  );
}

/**
 * Štítky s tým, čo o klientovi appka vie. Prázdne polia sa NEUKAZUJÚ —
 * dvadsať prázdnych štítkov by z hlavičky spravilo tapetu a to, čo tam
 * naozaj je, by sa v nich stratilo.
 */
function stitky(
  c: ClientAgg,
  dopyt: { source?: string } | null,
  priviedol: string[],
  poplatky: unknown[],
  satoshi?: number,
): { k: string; v: string; farba?: string; info?: string }[] {
  const out: { k: string; v: string; farba?: string; info?: string }[] = [];
  const pridaj = (k: string, v: string | number | undefined | null | false, farba?: string, info?: string) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    out.push({ k, v: String(v), farba, info });
  };

  pridaj("od", c.firstSession ? fmtDMY(c.firstSession) : "", undefined, "prvé sedenie v dátach");
  pridaj("naposledy", c.lastSession ? fmtDMY(c.lastSession) : "");
  pridaj("segment", c.segment);
  pridaj("dochádzka", c.attendance ? `${Math.round(c.attendance * 100)} %` : "");
  pridaj("hodín", c.totalHours ? c.totalHours.toFixed(0) : "");
  pridaj("Ø hodina", c.avgPrice ? fmtCZK(Math.round(c.avgPrice)) : "");
  pridaj("narodeniny", c.narodeniny ? fmtDMY(c.narodeniny) : "", C.accentLight);
  pridaj("členstvo", c.membership);
  if (c.packageTotal) {
    pridaj("balíček", `${c.packageOdvodeny ? "≈" : ""}${c.packageRemaining}/${c.packageTotal}`,
      c.packageRemaining <= 1 ? C.orange : undefined,
      c.packageOdkial || "zostatok z exportu PTmindera");
  }
  pridaj("platí do", c.packageValidTo ? fmtDMY(c.packageValidTo) : "");
  pridaj("zdroj", c.zdroj || dopyt?.source);
  pridaj("priviedol ho", c.zdrojKto);
  if (priviedol.length) pridaj("priviedol", `${priviedol.length}`, C.green);
  pridaj("6M", c.is6m ? "áno" : "", C.accentLight);
  pridaj("zmluva", c.contractSigned ? "podpísaná" : "", C.green);
  pridaj("sadzba", c.specialRate ? "špeciálna" : "", C.orange, c.specialRateNote);
  pridaj("bitcoin", c.bitcoin ? (satoshi ? `${satoshi.toLocaleString("sk-SK")} sat` : "áno") : "", C.accentLight);
  pridaj("modalita", c.modality);
  pridaj("zastupoval", c.substituteCount ? `${c.substituteCount}×` : "");
  if (poplatky.length) pridaj("nezaplatené", `${poplatky.length}`, C.red, "poplatky z PTmindera");
  pridaj("pauza do", c.pauseUntil ? fmtDMY(c.pauseUntil) : "", C.orange);
  pridaj("odišiel", c.duch ? "áno" : "", C.red, c.duch);
  return out;
}

const Blok = ({ nadpis, children }: { nadpis: string; children: React.ReactNode }) => (
  <div style={{ padding: "8px 10px", borderRadius: 8, background: mix(C.border, 40), marginBottom: 8 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.4 }}>{nadpis.toUpperCase()}</div>
    <div style={{ fontSize: 12.5, color: C.text, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{children}</div>
  </div>
);

/**
 * Nový klient — založený v Kokpite skôr, než o ňom vie PTminder.
 *
 * Jerry, 23. 9. 2026: „potrebujem aj vytvoriť nového klienta."
 *
 * Zakladá sa riadok v `client_overrides`, takže človek existuje hneď —
 * dá sa mu zapísať balíček, poznámka aj narodeniny. Sedenia a platby
 * pribudnú samy, keď dorazí export.
 *
 * PRETO JE MENO NAJDÔLEŽITEJŠIE POLE. Spája sa podľa neho: keď sa tu napíše
 * inak než v PTminderi, vzniknú dvaja ľudia a všetko sa rozdelí na polovicu.
 * Karta to hovorí nahlas — nie je to detail, ktorý si niekto domyslí.
 */
function NovyKlient({ onHotovo }: { onHotovo: (meno: string | null) => void }) {
  const [f, setF] = useState({ meno: "", narodeniny: "", zdroj: "", zdrojKto: "", poznamka: "" });
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");

  const zaloz = async () => {
    const meno = f.meno.trim();
    if (meno.length < 3) { setChyba("Meno je príliš krátke."); return; }
    setPracujem(true); setChyba("");
    // Prvé pole zakladá riadok, ostatné ho dopĺňajú. Keď prvé zlyhá, ďalšie
    // sa neposielajú — inak by sa polia zapisovali do neexistujúceho človeka.
    const polia: [string, string][] = [
      ["zdroj", f.zdroj.trim() || "ine"],
      ["narodeniny", f.narodeniny.trim()],
      ["zdrojKto", f.zdrojKto.trim()],
      ["trainerNote", f.poznamka.trim()],
    ];
    for (const [key, value] of polia) {
      if (!value) continue;
      const r = await fetch("/api/override", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: meno, key, value }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
      if (!r.ok) { setPracujem(false); setChyba(r.error || "nepodarilo sa založiť"); return; }
    }
    setPracujem(false);
    onHotovo(meno);
  };

  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, border: `1px solid ${mix(C.green, 40)}`, background: mix(C.green, 8) }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Nový klient</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {([
          { k: "meno" as const, l: "meno a priezvisko", w: 220 },
          { k: "narodeniny" as const, l: "narodeniny (RRRR-MM-DD)", w: 170 },
          { k: "zdroj" as const, l: "odkiaľ prišiel", w: 150 },
          { k: "zdrojKto" as const, l: "kto ho priviedol", w: 170 },
          { k: "poznamka" as const, l: "poznámka", w: 200 },
        ]).map((x) => (
          <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
            {x.l}
            <input
              value={f[x.k]}
              onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
              style={{ width: x.w, padding: "7px 9px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
            />
          </label>
        ))}
        <button onClick={() => void zaloz()} disabled={pracujem || f.meno.trim().length < 3} style={{
          padding: "8px 15px", borderRadius: 9, fontSize: 12.5, fontWeight: 700,
          cursor: f.meno.trim().length >= 3 ? "pointer" : "not-allowed",
          border: `1px solid ${mix(C.green, 50)}`,
          background: f.meno.trim().length >= 3 ? mix(C.green, 14) : "transparent",
          color: f.meno.trim().length >= 3 ? C.green : C.textDim,
        }}>
          {pracujem ? "…" : "Založiť"}
        </button>
        <button onClick={() => onHotovo(null)} style={navrhTlacidlo}>Zrušiť</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.orange, marginTop: 9, lineHeight: 1.5 }}>
        Meno napíš PRESNE tak, ako ho budeš mať v PTminderi. Podľa neho sa to spojí — pri inom
        zápise vzniknú dvaja ľudia a sedenia aj platby sa rozdelia medzi nich.
      </div>
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
    </div>
  );
}

const Prazdne = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, color: C.textDim, padding: "10px 2px" }}>{children}</div>
);

const riadok = {
  display: "flex", gap: 10, alignItems: "baseline",
  padding: "6px 2px", borderBottom: `1px solid ${mix(C.border, 40)}`, fontSize: 12,
};
const stlpecDen = { color: C.textDim, minWidth: 74, fontVariantNumeric: "tabular-nums" as const };

const navrhTlacidlo = {
  padding: "6px 11px", borderRadius: 8, fontSize: 12, cursor: "pointer",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};

const podzalozka = (on: boolean) => ({
  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});
