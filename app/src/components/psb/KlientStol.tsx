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
  const [stav, setStav] = useState<"aktivni" | "neaktivni">("aktivni");
  const [meno, setMeno] = useState("");
  const [filter, setFilter] = useState<"vsetko" | "treningy" | "peniaze" | "balicky" | "poznamky" | "puvod">("vsetko");
  const [detaily, setDetaily] = useState(false);
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

  /** Koľko údajov je pod tlačidlom „ďalších N" — aby číslo nebolo vymyslené. */
  const dalsichUdajov = useMemo(
    () => (c ? stitky(c, dopyt, priviedol, poplatkyKlienta, btcSats?.[meno]).length : 0),
    [c, dopyt, priviedol, poplatkyKlienta, btcSats, meno],
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
     * Zoznam všetkých klientov — pod sebou, po abecede, s hlavičkou písmena.
     *
     * Prvá verzia ich sypala vedľa seba ako štítky; pri sedemdesiatich menách
     * z toho bola stena, v ktorej sa nedalo nič nájsť. Jerry, 23. 9. 2026:
     * „daj ich ako zoznam, nie vedľa seba, rozdeľ na A a všetci na A, B
     * a všetci na B, a nech je to rolovacie."
     *
     * Predvolene AKTÍVNI. Neaktívnych je viac než aktívnych a kto otvára
     * stôl, ide skoro vždy za niekým, kto chodí.
     */
    const vsetci = [...new Set([...mena, ...Object.keys(data.clientOverrides || {})])];
    const jeAktivny = (m: string) => (clients[m]?.status || "") !== "Neaktívny";
    const podlaStavu = vsetci.filter((m) => (stav === "aktivni" ? jeAktivny(m) : !jeAktivny(m)));
    const q = normName(hladam);
    // Hľadá sa cez OBE skupiny — kto píše meno, chce toho človeka nájsť,
    // nie sa dozvedieť, že je v druhej záložke.
    const zdrojHladania = q ? vsetci : podlaStavu;
    const vidno = (q ? zdrojHladania.filter((m) => normName(m).includes(q)) : podlaStavu)
      .sort((a, b) => a.localeCompare(b, "sk"));

    const skupiny: { pismeno: string; mena: string[] }[] = [];
    for (const m of vidno) {
      const p = (m.trim()[0] || "?").toLocaleUpperCase("sk");
      const posledna = skupiny[skupiny.length - 1];
      if (posledna && posledna.pismeno === p) posledna.mena.push(m);
      else skupiny.push({ pismeno: p, mena: [m] });
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <input
            value={hladam}
            onChange={(e) => setHladam(e.target.value)}
            placeholder="hľadať klienta…"
            autoFocus
            style={{ flex: "1 1 240px", minWidth: 190, padding: "9px 12px", borderRadius: 10, fontSize: 13.5, background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
          />
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => setStav("aktivni")} style={prepinac(stav === "aktivni")}>Aktívni</button>
            <button onClick={() => setStav("neaktivni")} style={prepinac(stav === "neaktivni")}>Neaktívni</button>
          </div>
          <button onClick={() => setNovy(true)} style={{ ...navrhTlacidlo, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>
            + Nový klient
          </button>
          <span style={{ fontSize: 11.5, color: C.textDim }}>{vidno.length}</span>
        </div>

        {novy && <NovyKlient onHotovo={(m: string | null) => { setNovy(false); if (m) setMeno(m); }} />}

        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", marginTop: 12 }}>
          {skupiny.map((sk) => (
            <div key={sk.pismeno}>
              <div style={{
                position: "sticky", top: 0, background: C.card, zIndex: 1,
                fontSize: 11, fontWeight: 800, color: C.accentLight, letterSpacing: 0.6,
                padding: "6px 2px 4px", borderBottom: `1px solid ${mix(C.border, 60)}`,
              }}>
                {sk.pismeno}
              </div>
              {sk.mena.map((m) => {
                const c2 = clients[m];
                return (
                  <button key={m} onClick={() => { setMeno(m); setHladam(""); }} style={{
                    display: "flex", width: "100%", gap: 10, alignItems: "baseline", textAlign: "left",
                    padding: "7px 4px", border: "none", borderBottom: `1px solid ${mix(C.border, 35)}`,
                    background: "transparent", color: C.text, fontSize: 13, cursor: "pointer",
                  }}>
                    <span style={{ flex: 1 }}>{m}</span>
                    {c2 ? (
                      <span style={{ fontSize: 11, color: C.textDim }}>
                        {c2.primaryTrainer}
                        {c2.lastSession ? ` · naposledy ${fmtDMY(c2.lastSession)}` : ""}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textDim }}>čaká na prvý tréning</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {!vidno.length && <Prazdne>Nikto taký. Skús menej písmen, alebo ho založ tlačidlom vyššie.</Prazdne>}
        </div>
      </div>
    );
  }

  return (
    /**
     * Profil podľa návrhu C (Jerry si ho vybral 23. 9. 2026): vľavo úzky
     * stĺpec s tým podstatným, vpravo celá história v čase s filtrami.
     *
     * Predtým to bolo dvadsať štítkov vedľa seba — Jerry: „vyzerá to extrémne
     * zle a som v tom mega stratený." Mal pravdu a je to tá istá chyba, pred
     * ktorou appka inde sama varuje: keď svieti všetko, nesvieti nič.
     * Naľavo je preto len to, na čo sa človek pýta zakaždým; zvyšok je pod
     * jedným tlačidlom a nekričí.
     */
    <div style={{ display: "flex", gap: 20, height: "100%", minHeight: 0 }}>

      <div style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{meno}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>
            {c ? `${c.status} · ${c.primaryTrainer}` : "čaká na prvý tréning"}
          </div>
        </div>

        <div style={{ padding: "11px 13px", borderRadius: 11, background: mix(rozdiel > 0 ? C.red : C.green, 10), border: `1px solid ${mix(rozdiel > 0 ? C.red : C.green, 40)}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: rozdiel > 0 ? C.red : C.green }}>
            {rozdiel > 0 ? `dlhuje ${fmtCZK(rozdiel)}` : rozdiel < 0 ? `predplatené ${fmtCZK(-rozdiel)}` : "vyrovnaný"}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
            predané {fmtCZK(predane)} · zaplatené {fmtCZK(zaplatene)}
          </div>
        </div>

        {c && c.packageTotal > 0 && (
          <div style={{ padding: "11px 13px", borderRadius: 11, background: mix(C.accent, 10), border: `1px solid ${mix(C.accent, 40)}` }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.accentLight }}>
              {c.packageOdvodeny ? "≈" : ""}{c.packageRemaining} h zostáva
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
              {c.membership || `z ${c.packageTotal}`}
              {c.packageValidTo ? ` · do ${fmtDMY(c.packageValidTo)}` : ""}
            </div>
          </div>
        )}

        {c && (
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.95 }}>
            {c.firstSession && <div><span style={{ color: C.textDim }}>chodí od</span> {fmtDMY(c.firstSession)}</div>}
            {!!c.sessionCount && <div><span style={{ color: C.textDim }}>tempo</span> {(c.sessionCount / Math.max(1, mesiacov(c))).toFixed(1)} / mes.</div>}
            {c.narodeniny && <div><span style={{ color: C.textDim }}>narodeniny</span> {fmtDMY(c.narodeniny)}</div>}
            {c.zdrojKto && <div><span style={{ color: C.textDim }}>priviedol</span> {c.zdrojKto}</div>}
            {!!priviedol.length && <div><span style={{ color: C.textDim }}>priviedol on</span> {priviedol.length}</div>}
          </div>
        )}

        <button onClick={() => setDetaily(!detaily)} style={{ ...navrhTlacidlo, textAlign: "left" }}>
          {detaily ? "Skryť detaily ▴" : `Ďalších ${dalsichUdajov} údajov ▾`}
        </button>
        {detaily && c && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {stitky(c, dopyt, priviedol, poplatkyKlienta, btcSats?.[meno]).map((x) => (
              <span key={x.k} title={x.info} style={{
                fontSize: 10.5, padding: "3px 7px", borderRadius: 6,
                background: mix(x.farba || C.border, 20), color: x.farba || C.textMuted,
                border: `1px solid ${mix(x.farba || C.border, 50)}`,
              }}>
                <span style={{ opacity: 0.7 }}>{x.k}</span> {x.v}
              </span>
            ))}
          </div>
        )}

        <div style={{ flexGrow: 1 }} />
        <button onClick={() => setPisem(!pisem)} style={{ ...navrhTlacidlo, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>
          {pisem ? "Zavrieť" : "+ Nahodiť balíček"}
        </button>
        <button onClick={() => { setMeno(""); setFilter("vsetko"); }} style={navrhTlacidlo}>← späť na zoznam</button>
      </div>

      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>VŠETKO V ČASE</div>
          <div style={{ flexGrow: 1 }} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {([["vsetko", "všetko"], ["treningy", "tréningy"], ["peniaze", "peniaze"], ["balicky", "balíčky"], ["poznamky", "poznámky"], ["puvod", "odkiaľ prišiel"]] as const).map(([id, l]) => (
              <button key={id} onClick={() => setFilter(id)} style={prepinac(filter === id)}>{l}</button>
            ))}
          </div>
        </div>

        {pisem && <FormularBalicka f={f} setF={setF} pracujem={pracujem} onUloz={() => void pridaj()} />}
        {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}

        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", marginTop: 10 }}>
          {(filter === "vsetko" || filter === "treningy") && buduce.map((z) => (
            <div key={z} style={{ ...riadok, color: C.blue }}>
              <span style={stlpecDen}>{fmtDMY(z.slice(0, 10))}</span>
              <span style={{ flex: 1 }}>objednané {z.slice(11, 16)} · z kalendára</span>
            </div>
          ))}

          {filter !== "poznamky" && filter !== "puvod" && os
            .filter((x) => filter === "vsetko"
              || (filter === "treningy" && x.druh === "trening")
              || (filter === "peniaze" && x.druh === "platba")
              || (filter === "balicky" && (x.druh === "balicekOd" || x.druh === "balicekDo")))
            .map((x, i) => <RiadokOsi key={i} u={x} />)}

          {filter === "poznamky" && (
            <>
              {c?.trainerNote && <Blok nadpis="Poznámka trénera">{c.trainerNote}</Blok>}
              {c?.precoNeprisiel && <Blok nadpis="Prečo po úvodnom neprišiel">{c.precoNeprisiel}</Blok>}
              {c?.duch && <Blok nadpis="Odchod">{c.duch}</Blok>}
              {c?.specialRateNote && <Blok nadpis="Špeciálna sadzba">{c.specialRateNote}</Blok>}
              {zavery.map((z, i) => (
                <Blok key={i} nadpis="Záver z debaty">{(z as { text?: string }).text || ""}</Blok>
              ))}
              <Dennik meno={meno} limit={12} />
            </>
          )}

          {filter === "puvod" && (
            dopyt ? (
              <>
                <div style={riadok}>
                  <span style={stlpecDen}>{fmtDMY(dopyt.date)}</span>
                  <span style={{ flex: 1 }}>prišiel dopyt · <b>{dopyt.source}</b>{dopyt.status ? ` · ${dopyt.status}` : ""}</span>
                </div>
                {(dopyt as { kampan?: string }).kampan && <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>kampaň: {(dopyt as { kampan: string }).kampan}</span></div>}
                {(dopyt as { stranka?: string }).stranka && <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>stránka: {(dopyt as { stranka: string }).stranka}</span></div>}
                {dopyt.note && <div style={riadok}><span style={stlpecDen} /><span style={{ flex: 1, color: C.textMuted }}>{dopyt.note}</span></div>}
                {priviedol.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Koho priviedol ({priviedol.length})</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {priviedol.map((m) => <button key={m} onClick={() => setMeno(m)} style={navrhTlacidlo}>{m}</button>)}
                    </div>
                  </div>
                )}
              </>
            ) : <Prazdne>Dopyt sa nenašiel — klient prišiel skôr, než appka dopyty evidovala.</Prazdne>
          )}
        </div>
      </div>
    </div>
  );
}

/** Koľko mesiacov klient chodí — na tempo. */
function mesiacov(c: ClientAgg): number {
  if (!c.firstSession) return 1;
  const d = (Date.now() - Date.parse(c.firstSession)) / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(0.5, d);
}

function RiadokOsi({ u }: { u: ReturnType<typeof osCasuKlienta>[number] }) {
  if (u.druh === "balicekOd") {
    return (
      <div style={{ ...riadok, background: mix(C.accent, 10), borderRadius: 7, padding: "8px 9px", marginTop: 4, border: "none" }}>
        <span style={stlpecDen}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1 }}>
          <b>{u.nazov}</b>
          <span style={{ color: C.textMuted }}>
            {" "}· {u.hodin ? `${u.hodin} h` : "bez limitu"}{u.doDna ? ` · do ${fmtDMY(u.doDna)}` : ""}
            {u.zaplatene ? ` · ${fmtCZK(u.zaplatene)}` : ""}
          </span>
        </span>
      </div>
    );
  }
  if (u.druh === "balicekDo") {
    return <div style={{ ...riadok, color: C.textDim }}><span style={stlpecDen}>{fmtDMY(u.den)}</span><span style={{ flex: 1 }}>skončila platnosť — {u.nazov}</span></div>;
  }
  if (u.druh === "platba") {
    return (
      <div style={riadok}>
        <span style={stlpecDen}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1, color: C.green }}>zaplatil {u.metoda === "bank" ? "prevodom" : u.metoda === "cash" ? "hotovosť" : "iné"}</span>
        <span style={{ color: C.green, fontWeight: 700 }}>{fmtCZK(u.suma)}</span>
      </div>
    );
  }
  return (
    <div style={riadok}>
      <span style={stlpecDen}>{fmtDMY(u.den)}</span>
      <span style={{ flex: 1, color: C.textMuted }}>tréning{u.cas ? ` ${u.cas}` : ""}{u.trener ? ` · ${u.trener}` : ""}</span>
      {u.zKalendara && <span style={{ fontSize: 11, color: C.blue }}>z kalendára</span>}
    </div>
  );
}

function FormularBalicka({ f, setF, pracujem, onUloz }: {
  f: Record<string, string>;
  setF: (v: never) => void;
  pracujem: boolean;
  onUloz: () => void;
}) {
  return (
    <div style={{ marginTop: 10, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "flex-end", padding: "10px 11px", borderRadius: 10, background: mix(C.border, 40) }}>
      {([
        { k: "nazov", l: "názov balíčka", w: 210 },
        { k: "hodiny", l: "hodín", w: 80 },
        { k: "platnostOd", l: "platí od", w: 115 },
        { k: "platnostDo", l: "platí do", w: 115 },
        { k: "cenaCzk", l: "cena Kč", w: 95 },
        { k: "poznamka", l: "poznámka", w: 150 },
      ]).map((x) => (
        <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
          {x.l}
          <input
            value={f[x.k]}
            onChange={(e) => setF({ ...f, [x.k]: e.target.value } as never)}
            style={{ width: x.w, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
          />
        </label>
      ))}
      <button onClick={onUloz} disabled={pracujem || !f.nazov.trim()} style={{
        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        cursor: f.nazov.trim() ? "pointer" : "not-allowed",
        border: `1px solid ${mix(C.green, 50)}`,
        background: f.nazov.trim() ? mix(C.green, 12) : "transparent",
        color: f.nazov.trim() ? C.green : C.textDim,
      }}>
        {pracujem ? "…" : "Nahodiť"}
      </button>
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

const prepinac = (on: boolean) => ({
  padding: "6px 11px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});

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
