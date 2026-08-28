import { useMemo } from "react";

import { type ClientAgg } from "../../lib/psb/compute";
import { daysBetween, fmtCZK, fmtDMY, monthLabel } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Info, ValueBars } from "./ui";

// Profil klienta — všetko o jednom človeku na jednej obrazovke.
//
// Jerryho zadanie doslova: „všetko všetko všetko". Dáta o klientovi boli
// roztrúsené po piatich obrazovkách — platby vo Financiách, dochádzka v
// tabuľke, balíček v karte, poznámka v ✎ — a vyhľadávanie človeka dovedno
// len k riadku tabuľky. Otázka „ako na tom Novák vlastne je?" si vyžadovala
// päť klikov a skladanie v hlave.
//
// Porovnanie s priemerom je tu preto, lebo číslo bez mierky nič nehovorí:
// tempo 2,1 sedenia mesačne je málo alebo veľa len oproti tomu, ako chodia
// ostatní.

const DEN = 86400000;

// Tempo z posledných 90 dní — rovnaké okno, aké používa predikcia. Počíta sa
// tu nanovo, lebo ClientAgg tempo nenesie (žije až vo výstupe predikcie).
const tempo90 = (c: ClientAgg): number => {
  const od = Date.now() - 90 * DEN;
  const n = c.sessions.filter((s) => Date.parse(s.date) >= od).length;
  return n / 3; // sedení za mesiac
};

function Porovnanie({ label, hodnota, priemer, fmt, vyssieLepsie = true }: {
  label: string; hodnota: number; priemer: number; fmt: (n: number) => string; vyssieLepsie?: boolean;
}) {
  const max = Math.max(hodnota, priemer, 0.0001);
  const lepsi = vyssieLepsie ? hodnota >= priemer : hodnota <= priemer;
  const riadok = (meno: string, v: number, farba: string, hrubsi: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 62, fontSize: 10.5, color: C.textDim, textAlign: "right" }}>{meno}</span>
      <div style={{ flex: 1, height: hrubsi ? 14 : 10, background: C.track, borderRadius: 7, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(2, (v / max) * 100)}%`, height: "100%", background: farba, borderRadius: 7 }} />
      </div>
      <span style={{ width: 74, fontSize: 11.5, color: hrubsi ? C.text : C.textMuted, fontVariantNumeric: "tabular-nums", fontWeight: hrubsi ? 600 : 400 }}>{fmt(v)}</span>
    </div>
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {riadok("klient", hodnota, lepsi ? C.green : C.orange, true)}
        {riadok("Ø ostatní", priemer, mix(C.accent, 55), false)}
      </div>
    </div>
  );
}

export function KlientProfil({ meno, data, clients, onZavri, btcSats }: {
  meno: string;
  data: PSBData;
  clients: Record<string, ClientAgg>;
  onZavri: () => void;
  /** Koľko satov klient celkovo zaplatil (z appky PSB Bitcoin). */
  btcSats?: number;
}) {
  const c = clients[meno];

  const p = useMemo(() => {
    if (!c) return null;
    const platby = data.payments
      .filter((x) => x.client === meno)
      .sort((a, b) => b.date.localeCompare(a.date));
    const zaplatene = platby.reduce((a, x) => a + x.amount, 0);

    // Sedenia po mesiacoch — posledných 12, aby graf niečo hovoril aj pri
    // dlhoročnom klientovi.
    const podlaMesiaca = new Map<string, number>();
    for (const s of c.sessions) {
      const mk = s.date.slice(0, 7);
      podlaMesiaca.set(mk, (podlaMesiaca.get(mk) || 0) + 1);
    }
    const mesacne = [...podlaMesiaca.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([mk, n]) => ({ label: monthLabel(mk), value: n }));

    // Priemer sa ráta z AKTÍVNYCH klientov — porovnávať sa s duchmi a
    // odídenými by každého robilo hviezdou.
    const aktivni = Object.values(clients).filter((x) => x.status !== "Neaktívny" && x.name !== meno);
    const avg = (f: (x: ClientAgg) => number) => {
      const v = aktivni.map(f).filter((n) => Number.isFinite(n) && n > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    };
    const priemery = {
      tempo: avg((x) => tempo90(x)),
      dochadzka: avg((x) => x.attendance * 100),
      cena: avg((x) => {
        const z = data.payments.filter((pp) => pp.client === x.name).reduce((a, pp) => a + pp.amount, 0);
        return x.totalHours > 0 ? z / x.totalHours : 0;
      }),
      zaplatene: avg((x) => data.payments.filter((pp) => pp.client === x.name).reduce((a, pp) => a + pp.amount, 0)),
    };

    // daysBetween (floor) — tá istá definícia ako „X dní bez tréningu"
    // v notifikácii. Vlastný Math.round tu 27. 8. 2026 ukazoval „23 d",
    // kým notifikácia hovorila 22 — dve rátania tých istých dní.
    const dniTicha = c.lastSession ? daysBetween(c.lastSession, new Date()) : null;

    // Ø cena = ZAPLATENÉ / ODTRÉNOVANÉ HODINY. Payrollové `avgPrice` delí
    // interné ceny sedení počtom sedení a pri balíčkových klientoch vyjde
    // nezmysel (Jan Kral: 547 Kč pri reálnych 1 450/h). Klienta zaujíma,
    // koľko ho hodina naozaj stojí.
    const cenaHodiny = c.totalHours > 0 ? zaplatene / c.totalHours : 0;

    // Tempo míňania balíčkov: Ø dní medzi nákupmi (platby aspoň 7 dní od
    // seba — bližšie sú doplnky, nie nový balíček) a odhad, o koľko týždňov
    // minie aktuálny zostatok pri terajšom tempe.
    const kupy = [...platby].reverse().map((x) => Date.parse(x.date));
    const medzery: number[] = [];
    for (let i = 1; i < kupy.length; i++) {
      const d = (kupy[i] - kupy[i - 1]) / DEN;
      if (d >= 7) medzery.push(d);
    }
    const priemMedzera = medzery.length ? medzery.reduce((a, b) => a + b, 0) / medzery.length : null;
    const t90 = tempo90(c);
    const minieO = c.packageRemaining > 0 && t90 > 0 ? (c.packageRemaining / t90) * 4.33 : null;

    return { platby, zaplatene, mesacne, priemery, dniTicha, tempo: t90, cenaHodiny, priemMedzera, minieO };
  }, [c, data, clients, meno]);

  if (!c || !p) return null;

  const stat = (label: string, hodnota: string, farba?: string, info?: string) => (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 11px", minWidth: 118 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 1 }}>{info ? <Info text={info} label={label} /> : label}</div>
    </div>
  );

  const stavFarba = c.status === "Aktívny" ? C.green : c.status === "Neaktívny" ? C.red : C.orange;
  const burnRate = p.tempo;

  return (
    <Card style={{ border: `1px solid ${mix(C.accent, 45)}` }}>
      {/* hlavička */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{c.name}</span>
        <span style={{ fontSize: 11.5, color: stavFarba, fontWeight: 600 }}>{c.status}</span>
        <span style={{ fontSize: 11.5, color: C.textMuted }}>{c.segment} · {c.primaryTrainer || "?"} · {c.modality}</span>
        {c.zdroj && (
          <span style={{ fontSize: 12, fontWeight: 700, color: C.accentLight, background: mix(C.accent, 14), border: `1px solid ${mix(C.accent, 45)}`, borderRadius: 9, padding: "2px 10px" }}>
            prišiel cez: {c.zdroj}{c.zdrojKto ? ` · ${c.zdrojKto}` : ""}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {c.is6m && <span style={{ fontSize: 10.5, color: C.accentLight, border: `1px solid ${mix(C.accent, 45)}`, borderRadius: 8, padding: "1px 7px" }}>6M</span>}
          {c.bitcoin && <span style={{ fontSize: 10.5, color: C.orange }}>₿ platí v BTC{btcSats ? ` · zaplatil ${btcSats.toLocaleString("cs-CZ")} sats` : ""}</span>}
          {c.specialRate && <span title={c.specialRateNote} style={{ fontSize: 10.5, color: C.orange, cursor: c.specialRateNote ? "help" : "default" }}>špeciálna sadzba</span>}
          {!c.contractSigned && <span style={{ fontSize: 10.5, color: C.red }}>bez zmluvy</span>}
          <button onClick={onZavri} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zavrieť ×</button>
        </span>
      </div>

      {/* kľúčové čísla */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {/* Narodeniny s vekom a s tým, koľko dní ostáva — samotný dátum by
            človek musel prepočítavať a práve preto by to nerobil. Blízke
            narodeniny sa zvýraznia, nech ich netreba hľadať. */}
        {c.narodeniny && (() => {
          const md = c.narodeniny.slice(5);
          const dnesISO = new Date().toISOString().slice(0, 10);
          const dnes = Date.parse(`${dnesISO}T00:00:00Z`);
          const rok = Number(dnesISO.slice(0, 4));
          // Najbližší výskyt: tento rok, a keď už bol, tak budúci.
          const dni = [rok, rok + 1]
            .map((r) => Math.round((Date.parse(`${r}-${md}T00:00:00Z`) - dnes) / 86400000))
            .filter((n) => n >= 0)
            .sort((a, b) => a - b)[0];
          // Vek DNES: rozdiel rokov mínus jeden, ak tohtoročné narodeniny ešte neboli.
          const narodeny = Number(c.narodeniny.slice(0, 4));
          const uzMal = md <= dnesISO.slice(5);
          const vek = Number.isFinite(narodeny) && narodeny > 1900 ? rok - narodeny - (uzMal ? 0 : 1) : null;
          const casti = [fmtDMY(c.narodeniny)];
          if (vek !== null) casti.push(`${vek} r.`);
          if (dni === 0) casti.push("DNES");
          else if (dni !== undefined) casti.push(`o ${dni} dní`);
          return stat(
            "Narodeniny",
            casti.join(" · "),
            dni !== undefined && dni <= 7 ? C.orange : undefined,
            "Dátum narodenia z PTmindera. Appka pripomenie týždeň, tri dni a deň pred — a v deň samotný.",
          );
        })()}
        {stat("Prvé sedenie", c.firstSession ? fmtDMY(c.firstSession) : "—")}
        {stat("Posledné", c.lastSession ? `${fmtDMY(c.lastSession)}${p.dniTicha != null ? ` (${p.dniTicha} d)` : ""}` : "—",
          p.dniTicha != null && p.dniTicha > 21 ? C.orange : undefined,
          "Posledné sedenie a koľko dní odvtedy ubehlo.")}
        {/* Zátvorka s hodinami len keď sa líšia od počtu — pri hodinových
            sedeniach je „4 (4 h)" to isté číslo dvakrát. */}
        {stat("Sedení", Math.round(c.totalHours) === c.sessionCount ? String(c.sessionCount) : `${c.sessionCount} (${Math.round(c.totalHours)} h)`)}
        {/* Na pauze tempo klame: v 90-dňovom okne sú mesiace, keď klient
            zámerne nechodil, a číslo vyzerá ako spomalenie. Appka pozná len
            „dokedy" pauza trvá, nie odkedy — tak sa okno nedá očistiť presne.
            Preto sa pri pauze tempo NEZAMLČÍ ani nevymyslí, ale označí: je to
            tempo z obdobia, kam pauza padá, a tak sa má čítať. */}
        {stat("Tempo", `${burnRate.toFixed(1)}/mes · ${(burnRate / 4.33).toFixed(1)}/týž`, c.status === "Pauza" ? C.textDim : undefined,
          c.status === "Pauza"
            ? `Z posledných 90 dní — ale klient je NA PAUZE${c.pauseUntil ? ` (do ${fmtDMY(c.pauseUntil)})` : ""}, takže číslo zahŕňa mesiace, keď zámerne nechodil. Nie je to spomalenie; skutočné tempo uvidíš, až keď sa vráti.`
            : "Priemerný počet sedení za mesiac a za týždeň z posledných 90 dní.")}
        {stat("Dochádzka", `${Math.round(c.attendance * 100)} %`,
          c.attendance >= 0.7 ? C.green : c.attendance >= 0.4 ? undefined : C.orange,
          "Podiel týždňov z posledných 18, v ktorých klient reálne trénoval.")}
        {stat("Zaplatené spolu", fmtCZK(p.zaplatene), C.green)}
        {stat("Ø cena hodiny", fmtCZK(Math.round(p.cenaHodiny)), undefined, "Zaplatené spolu delené odtrénovanými hodinami — koľko klienta hodina naozaj stojí, vrátane zliav a bonusov.")}
        {stat("Balíček", c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : (c.lenDoplnky ? "len členstvo" : "—"), undefined,
          c.membership ? `${c.membership}${c.packageValidTo ? ` · platí do ${fmtDMY(c.packageValidTo)}` : ""}` : undefined)}
        {p.priemMedzera != null && stat("Ø medzi nákupmi", `${Math.round(p.priemMedzera)} dní`, undefined,
          "Priemerný odstup medzi platbami (platby menej než 7 dní od seba sa rátajú ako doplnky k tej istej kúpe). Hovorí, ako často klient reálne obnovuje.")}
        {p.minieO != null && stat("Zostatok minie o", `~${p.minieO.toFixed(0)} týž.`, p.minieO <= 2 ? C.orange : undefined,
          "Zostávajúce hodiny balíčka delené súčasným tempom — kedy príde ďalší nákup, ak bude chodiť ako teraz.")}
      </div>

      {c.trainerNote && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted, background: mix(C.accent, 6), borderRadius: 8, padding: "8px 11px", lineHeight: 1.5 }}>
          <b style={{ color: C.text }}>Poznámka trénera:</b> {c.trainerNote}
        </div>
      )}

      {/* Koho priviedol — druhá strana referenčného motora. Tržba z nich sa
          ráta zo všetkých platieb, lebo profil nemá obdobie; je to odpoveď na
          otázku „koľko tento človek PSB priniesol cez iných". */}
      {(() => {
        const privedeni = Object.values(clients)
          .filter((x) => x.zdroj === "referencia" && (x.zdrojKto || "").trim() === c.name)
          .sort((a, b) => (a.firstSession || "").localeCompare(b.firstSession || ""));
        if (!privedeni.length) return null;
        const trzba = data.payments.filter((pp) => privedeni.some((x) => x.name === pp.client)).reduce((a, pp) => a + pp.amount, 0);
        return (
          <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted, background: mix(C.green, 6), border: `1px solid ${mix(C.green, 25)}`, borderRadius: 8, padding: "8px 11px", lineHeight: 1.6 }}>
            <b style={{ color: C.text }}>Odporučil {privedeni.length} {privedeni.length === 1 ? "človeka" : privedeni.length < 5 ? "ľudí" : "ľudí"}</b>
            <span style={{ color: C.green }}> · {fmtCZK(trzba)} od nich spolu</span>
            <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {privedeni.map((x) => (
                <span key={x.name} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "2px 8px", color: x.status === "Aktívny" ? C.text : C.textDim }}>
                  {x.name}{x.firstSession ? ` · od ${fmtDMY(x.firstSession)}` : ""}{x.status !== "Aktívny" ? ` · ${x.status.toLowerCase()}` : ""}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginTop: 14 }}>
        {/* porovnanie s priemerom */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            <Info text="Porovnanie s priemerom AKTÍVNYCH klientov (bez tohto klienta). Číslo bez mierky nič nehovorí — tempo 2,1 je málo alebo veľa len oproti tomu, ako chodia ostatní." label="Oproti ostatným" />
          </div>
          <Porovnanie label="Tempo (sedení / mes.)" hodnota={burnRate} priemer={p.priemery.tempo} fmt={(n) => n.toFixed(1)} />
          <Porovnanie label="Dochádzka" hodnota={c.attendance * 100} priemer={p.priemery.dochadzka} fmt={(n) => `${Math.round(n)} %`} />
          <Porovnanie label="Ø cena hodiny" hodnota={p.cenaHodiny} priemer={p.priemery.cena} fmt={(n) => fmtCZK(Math.round(n))} />
          <Porovnanie label="Zaplatené celkovo" hodnota={p.zaplatene} priemer={p.priemery.zaplatene} fmt={(n) => fmtCZK(Math.round(n))} />
        </div>

        {/* sedenia po mesiacoch */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Sedenia po mesiacoch</div>
          {p.mesacne.length ? (
            <ValueBars data={p.mesacne} color={C.accent} fmt={(n) => String(Math.round(n))} height={120} alignEnd />
          ) : (
            <div style={{ fontSize: 12, color: C.textDim }}>Zatiaľ žiadne sedenia.</div>
          )}
        </div>

        {/* história platieb */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            História platieb ({p.platby.length})
          </div>
          {p.platby.length ? (
            <div style={{ maxHeight: 190, overflowY: "auto" }}>
              {p.platby.map((x, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 2px", borderBottom: `1px solid ${mix(C.border, 45)}` }}>
                  <span style={{ color: C.textDim }}>{fmtDMY(x.date)}</span>
                  <span style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(x.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.textDim }}>Žiadne platby — barter alebo platí inak.</div>
          )}
        </div>
      </div>
    </Card>
  );
}
