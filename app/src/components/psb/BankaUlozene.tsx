import { Fragment, useEffect, useMemo, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { nazovKategorie } from "../../lib/psb/vzas";
import { C, mix, S } from "../../lib/psb/theme";
import { kategorieZoznam } from "./Banka";
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

type Pohyb = { datum: string; suma: number; protistrana: string; poznamka: string; typ: string; kategoria: string; kluc: string };
type Pravidlo = { vzor: string; kategoria: string };

export function BankaUlozene({ focus, pohybSplits, onSplit }: {
  focus?: { month?: string; kategoria?: string; nonce?: number } | null;
  /** Rozdelenia/priradenia pohybov z App (split telefónu, príjem, vrátenie). */
  pohybSplits?: PohybSplits;
  /** Uloží rozdelenie jedného pohybu; prázdny zoznam ho zruší. Bez tejto
   *  funkcie sa rozdeľovanie neponúkne (napr. keď komponent nemá kam zapísať). */
  onSplit?: (kluc: string, casti: SplitCiast[]) => void;
} = {}) {
  const [pohyby, setPohyby] = useState<Pohyb[]>([]);
  const [pravidla, setPravidla] = useState<Pravidlo[]>([]);
  const [nacitane, setNacitane] = useState(false);
  const [otvorene, setOtvorene] = useState(false);
  const [oznacene, setOznacene] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"vsetko" | "nezaradene" | "vyplaty">("vsetko");
  const [hladat, setHladat] = useState("");
  // Filter mesiaca. Pri sedemsto pohyboch je "ukáž mi júl" najčastejšia otázka
  // vôbec — bez neho sa musí scrollovať cez pol roka.
  const [mesiac, setMesiac] = useState("");
  /** Kategória z prekliku — „ukáž mi tie dva pohyby, ktoré sa zdvojili". */
  const [ibaKat, setIbaKat] = useState("");
  const [busy, setBusy] = useState(false);
  const [sprava, setSprava] = useState("");
  const KAT = useMemo(kategorieZoznam, []);
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
  const viditelne = pohyby.filter((p) => {
    if (mesiac && String(p.datum).slice(0, 7) !== mesiac) return false;
    if (ibaKat && p.kategoria !== ibaKat) return false;
    if (filter === "nezaradene" && p.kategoria) return false;
    if (filter === "vyplaty" && !p.kategoria.startsWith("vyplaty")) return false;
    if (hladat.trim()) {
      const h = hladat.trim().toLowerCase();
      if (!`${p.protistrana} ${p.poznamka}`.toLowerCase().includes(h)) return false;
    }
    return true;
  });

  /** Bez `kluce` sa mení celý označený výber; s nimi len tie riadky. */
  const zmen = async (kategoria: string, kluce?: string[], poznamka?: string) => {
    const vyber = kluce ? new Set(kluce) : oznacene;
    const zmeny = pohyby.filter((p) => vyber.has(p.kluc))
      .map((p) => ({ kluc: p.kluc, kategoria, datum: p.datum, ...(poznamka !== undefined ? { poznamka } : {}) }));
    if (!zmeny.length) return;
    setBusy(true);
    const r = await fetch("/api/fio", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "kategoria", zmeny }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      setSprava(`Prehodené: ${r.zmenene}${r.zamknute ? `, ${r.zamknute} odmietnutých (uzavretý mesiac)` : ""}.`);
      if (!kluce) setOznacene(new Set());
      nacitaj();
      setTimeout(() => setSprava(""), 5000);
    } else setSprava("Zmena sa nepodarila.");
  };

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
  }, [focus?.month, focus?.kategoria, focus?.nonce]);

  const nezaradenych = pohyby.filter((p) => !p.kategoria).length;
  if (!nacitane || !pohyby.length) return null;

  return (
    <Card>
      <div onClick={() => setOtvorene((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}>
        <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{otvorene ? "▼" : "▶"}</span>
        <H3><Info label={`Zapísané pohyby (${pohyby.length})`} text="Čo už je v databáze. Kategóriu sa dá prehodiť aj dodatočne — označ riadky a vyber novú. Uzavreté mesiace sa nemenia." /></H3>
        {nezaradenych > 0 && (
          <span style={{ fontSize: 11.5, color: C.orange }}>{nezaradenych} bez kategórie</span>
        )}
      </div>

      {otvorene && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
            {ibaKat && (
              <button onClick={() => setIbaKat("")}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
                len {nazovKategorie(ibaKat)} ✕
              </button>
            )}
            {([["vsetko", `Všetko (${pohyby.length})`], ["nezaradene", `Bez kategórie (${nezaradenych})`], ["vyplaty", `Výplaty (${pohyby.filter((p) => p.kategoria.startsWith("vyplaty")).length})`]] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setFilter(id)}
                style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${filter === id ? C.accent : C.border}`,
                  background: filter === id ? mix(C.accent, 12) : "transparent",
                  color: filter === id ? C.accentLight : C.textMuted }}>{lbl}</button>
            ))}
            <select value={mesiac} onChange={(e) => setMesiac(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: 8, border: `1px solid ${mesiac ? C.accent : C.border}`, background: C.bg, color: mesiac ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
              <option value="">Všetky mesiace</option>
              {mesiace.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
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
              <button onClick={() => setOznacene(new Set())} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zrušiť výber</button>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 8 }}>
            Klik na meno protistrany označí všetky jej pohyby. Zobrazených {viditelne.length} z {pohyby.length}.
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
                  </tr>
                  {onSplit && delenyKluc === p.kluc && (
                    <tr>
                      <td colSpan={5} style={{ ...S.td, background: mix(C.accent, 8), padding: "10px 12px" }}>
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
  );
}
