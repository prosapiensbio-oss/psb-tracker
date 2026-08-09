import { Fragment, useEffect, useMemo, useState } from "react";

import { kotvaDat, type ClientAgg } from "../../lib/psb/compute";
import { fetchMonthNotes, saveMonthNote } from "../../lib/psb/client";
import { fmtCZK, fmtDMY, monthKey, monthLabel } from "../../lib/psb/format";
import { ZDROJE } from "./Klienti";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Empty, H3, Info, Select, TableWrap } from "./ui";

// Fluktuácia — druhá polovica rovnice rastu.
//
// Rast = príchody − odchody. Appka doteraz merala len príchody, a preto sa
// nedalo vysvetliť, prečo pri 44 nových klientoch za rok stúpol počet aktívnych
// o štyroch. Deväť z desiatich nových len nahradilo niekoho, kto odišiel.
//
// Odchod sa nedá zistiť, dá sa len usúdiť: nikto nezavolá, že končí, len
// prestane chodiť. Hranica je preto konvencia — dôležité je, aby bola jedna a
// stále rovnaká.
//
// Kotvou času je POSLEDNÝ DEŇ V DÁTACH, nie dnešok. Keby sa počítalo od dneška,
// tri mesiace bez uploadu by z celého štúdia spravili odídených klientov.

const DEN = 86400000;

const HRANICE = [
  { value: "60", label: "60 dní ticha" },
  { value: "90", label: "90 dní ticha" },
  { value: "120", label: "120 dní ticha" },
];

const zdrojLabel = (z: string) => ZDROJE.find((x) => x.value === z)?.label || (z ? z : "nevyplnené");

type Klient = ClientAgg & { _zivot: number; _odisiel: boolean; _trzba: number };

function pripravKlientov(data: PSBData, clients: Record<string, ClientAgg>, hranicaDni: number) {
  const kotva = data.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
  const kotvaMs = kotva ? Date.parse(kotva) : Date.now();
  const trzbaPodla = new Map<string, number>();
  for (const p of data.payments) {
    if (!p.client) continue;
    trzbaPodla.set(p.client, (trzbaPodla.get(p.client) || 0) + p.amount);
  }
  const zoznam: Klient[] = Object.values(clients)
    .filter((c) => c.firstSession && c.lastSession)
    .map((c) => {
      const ticho = (kotvaMs - Date.parse(c.lastSession)) / DEN;
      // Dohodnutá pauza nie je odchod. Keď sa skončí a klient nepríde, spadne
      // sem sám — ale kým beží, tvrdiť o ňom, že odišiel, je nepravda.
      const naPauze = !!(c.pauseUntil && Date.parse(c.pauseUntil) >= kotvaMs);
      return {
        ...c,
        _zivot: Math.round((Date.parse(c.lastSession) - Date.parse(c.firstSession)) / DEN),
        _odisiel: ticho > hranicaDni && !naPauze,
        _trzba: trzbaPodla.get(c.name) || 0,
      };
    });
  return { zoznam, kotva };
}

/**
 * Mesačné toky klientov — jediné miesto, kde sa počítajú. Číta ich obrazovka
 * Rast a strata aj výhľad v Mesačných výsledkoch; dve kópie tej istej
 * aritmetiky by sa časom rozišli presne tak, ako sa rozišli tržby s Excelom.
 */
export function tokyKlientov(data: PSBData, clients: Record<string, ClientAgg>, hranicaDni = 60) {
  const { zoznam, kotva } = pripravKlientov(data, clients, hranicaDni);
  const m = new Map<string, { prisli: string[]; odisli: string[] }>();
  const daj = (k: string) => {
    const e = m.get(k) || { prisli: [], odisli: [] };
    m.set(k, e);
    return e;
  };
  for (const c of zoznam) {
    daj(monthKey(c.firstSession)).prisli.push(c.name);
    if (c._odisiel) daj(monthKey(c.lastSession)).odisli.push(c.name);
  }
  const mesacne = [...m.entries()]
    .map(([k, v]) => [k, { prislo: v.prisli.length, odislo: v.odisli.length, prisli: v.prisli, odisli: v.odisli }] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  // Uzavretý mesiac sa riadi KOTVOU DÁT, nie kalendárom. Keď PTminder nie je
  // nahratý mesiac dozadu, kalendárne „uzavretý" mesiac je v dátach prázdny —
  // a nula príchodov by sa čítala ako „nikto neprišiel" namiesto „nevieme".
  const beziaci = new Date().toISOString().slice(0, 7);
  const plny = kotvaDat(data).plny || beziaci;
  const uzavrete = mesacne.filter(([mk]) => mk <= plny);
  const prichodove = uzavrete.slice(-12);
  const zrele = kotva
    ? new Date(Date.parse(kotva) - hranicaDni * DEN).toISOString().slice(0, 7)
    : beziaci;
  const odchodove = uzavrete.filter(([mk]) => mk < zrele).slice(-12);
  return {
    zoznam, kotva, mesacne,
    prisloMes: prichodove.length ? prichodove.reduce((a, [, v]) => a + v.prislo, 0) / prichodove.length : 0,
    odisloMes: odchodove.length ? odchodove.reduce((a, [, v]) => a + v.odislo, 0) / odchodove.length : 0,
  };
}

export function RastAStrata({ data, clients, onKlient }: { data: PSBData; clients: Record<string, ClientAgg>; onKlient?: (meno: string) => void }) {
  const [hranica, setHranica] = useState("60");
  // Rozbalený mesiac. Bublina pod myšou tu bola prvá a bola to chyba: na
  // dotykovom displeji neexistuje a mená sa z nej nedali otvoriť.
  const [otvoreny, setOtvoreny] = useState<string | null>(null);
  const toky = useMemo(() => tokyKlientov(data, clients, Number(hranica)), [data, clients, hranica]);
  const { zoznam, kotva, mesacne, prisloMes, odisloMes } = toky;

  const odisli = zoznam.filter((c) => c._odisiel);
  const aktivni = zoznam.filter((c) => !c._odisiel);

  const [cielRastu, setCielRastu] = useState("3");
  const trebaZiskat = odisloMes + Number(cielRastu);

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Rast = príchody mínus odchody. Odchod sa nedá zistiť, len usúdiť — nikto nezavolá, že končí, len prestane chodiť. Hranica ticha je preto konvencia; dôležité je, aby bola stále rovnaká. Klient na dohodnutej pauze sa neráta ako odídený. Čas sa počíta od posledného dňa v dátach, nie od dneška — inak by tri mesiace bez uploadu spravili z celého štúdia odídených." label="Fluktuácia" /></H3>
          <Select value={hranica} onChange={setHranica} options={HRANICE} />
        </div>

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "12px 0 4px" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontVariantNumeric: "tabular-nums" }}>+{prisloMes.toFixed(1)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>príchodov / mesiac</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.red, fontVariantNumeric: "tabular-nums" }}>−{odisloMes.toFixed(1)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>odchodov / mesiac</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: prisloMes - odisloMes > 0.5 ? C.accentLight : C.orange, fontVariantNumeric: "tabular-nums" }}>
              {prisloMes - odisloMes >= 0 ? "+" : ""}{(prisloMes - odisloMes).toFixed(1)}
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>čistý rast / mesiac</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{aktivni.length}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>aktívnych zo {zoznam.length}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 9, background: mix(C.accent, 7), border: `1px solid ${mix(C.accent, 24)}` }}>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
            Aby si rástol o{" "}
            <select
              value={cielRastu} onChange={(e) => setCielRastu(e.target.value)}
              style={{ ...S.select, display: "inline-block", width: "auto", padding: "2px 6px", fontSize: 12.5 }}
            >
              {["1", "2", "3", "4", "5"].map((n) => <option key={n} value={n} style={{ background: C.card }}>{n}</option>)}
            </select>{" "}
            klientov mesačne, musíš získať <b style={{ color: C.accentLight, fontSize: 15 }}>{trebaZiskat.toFixed(1)}</b> nových —
            lebo {odisloMes.toFixed(1)} mesačne odíde bez ohľadu na to, koľko ich pribudne.
          </div>
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.55 }}>
            Toto je zadanie pre reklamu. Keby sa podarilo znížiť odchody o polovicu, ten istý rast by stál{" "}
            {(odisloMes / 2 + Number(cielRastu)).toFixed(1)} nových klientov mesačne — teda výrazne menej peňazí.
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Mesiac</th>
                <th style={{ ...S.th, textAlign: "right" }}>Prišlo</th>
                <th style={{ ...S.th, textAlign: "right" }}>Odišlo</th>
                <th style={{ ...S.th, textAlign: "right" }}>Čistý</th>
              </tr>
            </thead>
            <tbody>
              {mesacne.slice(-14).reverse().map(([mk, v]) => {
                const cisty = v.prislo - v.odislo;
                const je = otvoreny === mk;
                const daSa = v.prislo + v.odislo > 0;
                return (
                  <Fragment key={mk}>
                    <tr
                      onClick={() => daSa && setOtvoreny(je ? null : mk)}
                      style={{ cursor: daSa ? "pointer" : "default", background: je ? mix(C.accent, 6) : undefined }}
                    >
                      <td style={S.td}>
                        <span style={{ color: C.textDim, marginRight: 6 }}>{daSa ? (je ? "▾" : "▸") : " "}</span>
                        {monthLabel(mk)}
                      </td>
                      <td style={{ ...S.td, textAlign: "right", color: C.green }}>{v.prislo || "—"}</td>
                      <td style={{ ...S.td, textAlign: "right", color: C.red }}>{v.odislo || "—"}</td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: cisty > 0 ? C.accentLight : cisty < 0 ? C.red : C.textMuted }}>
                        {cisty > 0 ? "+" : ""}{cisty}
                      </td>
                    </tr>
                    {je && (
                      <tr>
                        <td colSpan={4} style={{ ...S.td, background: mix(C.accent, 4) }}>
                          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "4px 0 8px" }}>
                            <Zoznam nadpis="Prišli" mena={v.prisli} farba={C.green} onKlient={onKlient} clients={clients} />
                            <Zoznam nadpis="Odišli" mena={v.odisli} farba={C.red} onKlient={onKlient} clients={clients} />
                          </div>
                          {v.odisli.length > 0 && (
                            <DovodyOdchodu mesiac={mk} mena={v.odisli} clients={clients} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Klikni na mesiac a rozbalí sa, kto prišiel a kto odišiel; meno otvorí kartu klienta aj vtedy, keď je
            už neaktívny a v bežnom zozname sa nezobrazuje. {" "}
            Posledné dva–tri mesiace budú vždy vyzerať lepšie, než sú: kto prestal chodiť minulý mesiac, ešte nemá
            {" "}{hranica} dní ticha a ako odídený sa zatiaľ neráta. Dáta sú po {kotva ? kotva.slice(0, 10) : "—"}.
            {" "}A augusty budú strašiť každý rok — leto je mŕtve, nie je to fluktuácia.
          </div>
        </div>
      </Card>

      <KdeTecie odisli={odisli} onKlient={onKlient} />
      <Prezitie zoznam={zoznam} />
      <HodnotaPodlaZdroja zoznam={zoznam} />
    </>
  );
}

// ── 2. Kde tečie ─────────────────────────────────────────────────────────────
function KdeTecie({ odisli, onKlient }: { odisli: Klient[]; onKlient?: (m: string) => void }) {
  // Rovnaký vzor ako mesiace v Raste a strate: klik rozbalí mená. Číslo „16
  // odišlo do 90 dní" je bez mien diagnóza bez pacientov.
  const [otvoreny, setOtvoreny] = useState<string | null>(null);
  const koše = [
    { label: "Prišli raz a nikdy viac", filter: (c: Klient) => c.sessionCount <= 1, vysvetlenie: "úvodný tréning, ktorý nikam neviedol" },
    { label: "Do 90 dní", filter: (c: Klient) => c.sessionCount > 1 && c._zivot < 90, vysvetlenie: "na výsledky je to krátko — toto je o prvom dojme a očakávaniach" },
    { label: "3 – 6 mesiacov", filter: (c: Klient) => c._zivot >= 90 && c._zivot < 180, vysvetlenie: "prvý balíček dochodil a druhý si nekúpil" },
    { label: "6 – 12 mesiacov", filter: (c: Klient) => c._zivot >= 180 && c._zivot < 365, vysvetlenie: "" },
    { label: "Viac ako rok", filter: (c: Klient) => c._zivot >= 365, vysvetlenie: "títo odišli po svojom, nie kvôli PSB" },
  ];
  const spolu = odisli.length || 1;
  const max = Math.max(...koše.map((k) => odisli.filter(k.filter).length), 1);

  return (
    <Card>
      <H3><Info text="Ako dlho vydržali tí, čo odišli. Odchod v prvých mesiacoch a odchod po roku majú úplne inú príčinu a inú cenu opravy — prvý je o onboardingu, druhý o výsledkoch alebo o živote klienta. Bez tohto rozdelenia je 'fluktuácia 5 %' číslo, s ktorým sa nedá nič spraviť." label="Kde to tečie" /></H3>
      {odisli.length === 0 ? (
        <Empty>Zatiaľ nikto neodišiel.</Empty>
      ) : (
        <div style={{ marginTop: 10 }}>
          {koše.map((k) => {
            const n = odisli.filter(k.filter).length;
            const p = Math.round((n / spolu) * 100);
            const mena = odisli.filter(k.filter).map((c) => c.name);
            const je = otvoreny === k.label;
            return (
              <div key={k.label} style={{ marginBottom: 10 }}>
                <div
                  onClick={() => n > 0 && setOtvoreny(je ? null : k.label)}
                  style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", cursor: n > 0 ? "pointer" : "default" }}
                >
                  <span style={{ color: C.textDim, fontSize: 11 }}>{n > 0 ? (je ? "▾" : "▸") : " "}</span>
                  <span style={{ fontSize: 12.5, color: C.text, minWidth: 150 }}>{k.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: p >= 40 ? C.red : C.textMuted, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                  <span style={{ fontSize: 11.5, color: C.textDim }}>{p} %</span>
                  <span style={{ fontSize: 11, color: C.textDim, flex: "1 1 200px" }}>{k.vysvetlenie}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.track, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: p >= 40 ? C.red : mix(C.accent, 60) }} />
                </div>
                {je && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                    {mena.map((meno) => (
                      <button key={meno} onClick={() => onKlient?.(meno)}
                        style={{ padding: "3px 9px", borderRadius: 7, fontSize: 11.5, cursor: onKlient ? "pointer" : "default", border: `1px solid ${mix(C.border, 80)}`, background: "transparent", color: C.textMuted }}>
                        {meno}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── 3. Prežitie kohorty ──────────────────────────────────────────────────────
function Prezitie({ zoznam }: { zoznam: Klient[] }) {
  const riadky = useMemo(() => {
    const m = new Map<string, Klient[]>();
    for (const c of zoznam) {
      const k = monthKey(c.firstSession);
      m.set(k, [...(m.get(k) || []), c]);
    }
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([mk, cs]) => ({
        mk,
        n: cs.length,
        // „Ešte tu po X mesiacoch" = jeho posledné sedenie je aspoň X mesiacov
        // po prvom. Nie „je aktívny dnes" — to by pri starých kohortách meralo
        // len to, koľko času odvtedy prešlo.
        m3: cs.filter((c) => c._zivot >= 90).length,
        m6: cs.filter((c) => c._zivot >= 180).length,
        m12: cs.filter((c) => c._zivot >= 365).length,
        sixM: cs.filter((c) => c.is6m).length,
      }));
  }, [zoznam]);

  // Kohorta stará dva mesiace nemôže mať nikoho, kto vydržal tri — a „0 · 0 %"
  // by to ukázalo ako zlyhanie. Kým míľnik neprešiel, je tam pomlčka.
  const bunka = (n: number, z: number, mk: string, mesiacov: number) => {
    const vek = (Date.now() - Date.parse(`${mk}-01`)) / (30.4 * DEN);
    if (vek < mesiacov) return "—";
    return z ? `${n} · ${Math.round((n / z) * 100)} %` : "—";
  };

  return (
    <Card>
      <H3><Info text="Z tých, čo začali v danom mesiaci, koľkí vydržali aspoň 3, 6 a 12 mesiacov. Meria sa dĺžka od prvého po posledné sedenie, nie to, či je klient aktívny dnes — inak by staré kohorty vyzerali horšie len preto, že odvtedy prešlo viac času. Kohorty mladšie než rok nemôžu mať plný stĺpec 12M; prázdno tam neznamená zlyhanie." label="Kto vydrží (kohorty)" /></H3>
      {riadky.length === 0 ? (
        <Empty>Žiadne dáta.</Empty>
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Začali v</th>
                <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>z toho 6M</th>
                <th style={{ ...S.th, textAlign: "right" }}>Vydržali 3 mes.</th>
                <th style={{ ...S.th, textAlign: "right" }}>6 mes.</th>
                <th style={{ ...S.th, textAlign: "right" }}>12 mes.</th>
              </tr>
            </thead>
            <tbody>
              {riadky.map((r) => (
                <tr key={r.mk}>
                  <td style={S.td}>{monthLabel(r.mk)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.text }}>{r.n}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.textDim }}>{r.sixM || "—"}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{bunka(r.m3, r.n, r.mk, 3)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{bunka(r.m6, r.n, r.mk, 6)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{bunka(r.m12, r.n, r.mk, 12)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Stĺpec „z toho 6M“ je tu preto, aby sa dalo porovnať, či klienti v šesťmesačnom procese vydržia dlhšie než ostatní.
            Pri troch–siedmich klientoch mesačne je jeden človek 15–30 %, takže rozdiel medzi dvoma susednými mesiacmi je šum.
          </div>
        </>
      )}
    </Card>
  );
}

// ── 4. Hodnota klienta podľa zdroja ──────────────────────────────────────────
function HodnotaPodlaZdroja({ zoznam }: { zoznam: Klient[] }) {
  const riadky = useMemo(() => {
    const m = new Map<string, Klient[]>();
    for (const c of zoznam) m.set(c.zdroj || "", [...(m.get(c.zdroj || "") || []), c]);
    return [...m.entries()]
      .map(([z, cs]) => ({
        z,
        n: cs.length,
        zivot: Math.round(cs.reduce((a, c) => a + c._zivot, 0) / cs.length),
        sedeni: Math.round((cs.reduce((a, c) => a + c.sessionCount, 0) / cs.length) * 10) / 10,
        trzba: Math.round(cs.reduce((a, c) => a + c._trzba, 0) / cs.length),
        aktivnych: cs.filter((c) => !c._odisiel).length,
      }))
      .sort((a, b) => b.trzba - a.trzba);
  }, [zoznam]);

  return (
    <Card>
      <H3><Info text="Koľko klient z daného zdroja v priemere prinesie za celý čas, čo chodí. Toto je číslo, proti ktorému má zmysel držať cenu za získaného klienta: keď klient z reklamy prinesie v priemere 28 000 Kč, tisíckorunová cena za jeho získanie je dobrý obchod. A ak klient z odporúčania vydrží dlhšie než klient z reklamy, oplatí sa za odporúčanie zaplatiť viac." label="Čo klient prinesie podľa zdroja" /></H3>
      <TableWrap>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Zdroj</th>
            <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
            <th style={{ ...S.th, textAlign: "right" }}>Ešte chodí</th>
            <th style={{ ...S.th, textAlign: "right" }}>Ø dní</th>
            <th style={{ ...S.th, textAlign: "right" }}>Ø sedení</th>
            <th style={{ ...S.th, textAlign: "right" }}>Ø tržba</th>
          </tr>
        </thead>
        <tbody>
          {riadky.map((r) => (
            <tr key={r.z || "—"}>
              <td style={S.td}>{zdrojLabel(r.z)}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.text }}>{r.n}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.aktivnych}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.zivot}</td>
              <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.sedeni}</td>
              <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.green }}>{fmtCZK(r.trzba)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 9, background: mix(C.orange, 7), border: `1px solid ${mix(C.orange, 22)}`, fontSize: 11.5, color: C.text, lineHeight: 1.6 }}>
        <b>Riadky sa medzi sebou porovnávať nedajú priamo.</b> Zdroj sa začal zapisovať až s anamnézou (jún 2025),
        takže klienti so známym zdrojom sú prevažne tí novší — ich Ø dní a Ø tržba sú useknuté tým, že chodia kratšie.
        Riadok „nevyplnené“ obsahuje starých klientov s dvojročnou históriou, preto vyzerá najlepšie. Nie je to tým,
        že by neznámy zdroj privádzal lepších ľudí; je to tým, že mali viac času.
        <br />Porovnávať má zmysel až rovnako staré kohorty — na to je tabuľka vyššie.
      </div>
    </Card>
  );
}


/** Mená v rozbalenom mesiaci — každé otvorí kartu klienta. */
function Zoznam({ nadpis, mena, farba, onKlient, clients }: {
  nadpis: string; mena: string[]; farba: string;
  onKlient?: (m: string) => void; clients: Record<string, ClientAgg>;
}) {
  if (!mena.length) return null;
  return (
    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: farba, marginBottom: 5 }}>{nadpis} ({mena.length})</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {mena.map((m) => {
          const neaktivny = clients[m]?.status === "Neaktívny";
          return (
            <button
              key={m}
              onClick={() => onKlient?.(m)}
              title={neaktivny ? `${m} — vedený ako neaktívny, v bežnom zozname sa neukazuje` : m}
              style={{
                padding: "3px 9px", borderRadius: 7, fontSize: 11.5, cursor: onKlient ? "pointer" : "default",
                border: `1px solid ${mix(C.border, 80)}`, background: "transparent",
                color: neaktivny ? C.textDim : C.text,
                textDecoration: neaktivny ? "line-through" : "none",
              }}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}


/**
 * Prečo prestali chodiť.
 *
 * Dôvod je jediná vec, ktorú appka o odchode nezistí — vidí posledný tréning,
 * segment aj balíček, ale nie to, či človek odišiel k inému trénerovi, zranil
 * sa, alebo prestal veriť. Doteraz sa na to pýtala mesačná otázka, kde bolo
 * treba najprv prepísať mená, ktoré appka aj tak vie. Tu je otázka pri
 * konkrétnom človeku a jednou vetou je vybavená.
 *
 * Ukladá sa k mesiacu, v ktorom odišiel — tam sa naň totiž budeš pozerať, keď
 * sa raz spýtaš „prečo bol máj taký zlý".
 */
function DovodyOdchodu({ mesiac, mena, clients }: { mesiac: string; mena: string[]; clients: Record<string, ClientAgg> }) {
  const [odpovede, setOdpovede] = useState<Record<string, string>>({});
  const [pisem, setPisem] = useState<Record<string, string>>({});
  const [uklada, setUklada] = useState("");

  useEffect(() => {
    void fetchMonthNotes().then((n) => setOdpovede(n[mesiac]?.answers || {}));
  }, [mesiac]);

  const uloz = async (meno: string) => {
    const k = `odchod__${meno}`;
    const text = (pisem[meno] ?? "").trim();
    if (!text) return;
    setUklada(meno);
    const n = await fetchMonthNotes();
    const doterajsie = n[mesiac]?.answers || {};
    const nove = { ...doterajsie, [k]: text };
    await saveMonthNote(mesiac, n[mesiac]?.note || "", nove, "jerry");
    setOdpovede(nove);
    setPisem({ ...pisem, [meno]: "" });
    setUklada("");
  };

  return (
    <div style={{ borderTop: `1px solid ${mix(C.border, 60)}`, paddingTop: 10, marginTop: 4 }}>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, letterSpacing: 0.3, textTransform: "uppercase" }}>
        Prečo prestali chodiť
      </div>
      {mena.map((meno) => {
        const ulozene = odpovede[`odchod__${meno}`];
        const c = clients[meno];
        return (
          <div key={meno} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", padding: "5px 0" }}>
            <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600, minWidth: 150 }}>{meno}</span>
            <span style={{ fontSize: 11, color: C.textDim, minWidth: 110 }}>
              {c?.lastSession ? `naposledy ${fmtDMY(c.lastSession)}` : ""}
            </span>
            {ulozene ? (
              <span style={{ fontSize: 12.5, color: C.textMuted, flex: 1 }}>
                {ulozene}{" "}
                <button onClick={() => setOdpovede({ ...odpovede, [`odchod__${meno}`]: "" })}
                  style={{ background: "none", border: "none", color: C.textDim, fontSize: 11, cursor: "pointer" }}>
                  zmeniť
                </button>
              </span>
            ) : (
              <>
                <input
                  value={pisem[meno] || ""}
                  onChange={(e) => setPisem({ ...pisem, [meno]: e.target.value })}
                  placeholder="prečo prestal chodiť?"
                  style={{ flex: "1 1 240px", padding: "5px 9px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
                />
                <button onClick={() => void uloz(meno)} disabled={uklada === meno || !(pisem[meno] || "").trim()}
                  style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11.5, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}>
                  {uklada === meno ? "…" : "Uložiť"}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
