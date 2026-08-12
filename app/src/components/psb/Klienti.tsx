import { useEffect, useMemo, useRef, useState } from "react";

import { menoKluc, najdiKlienta, duchOdpoved, membershipBucket, MEMBERSHIP_ORDER, TRAINERS, type CapacityRow, type ClientAgg, type SixMRow } from "../../lib/psb/compute";
import { fmtCZK, fmtDate, fmtDMY, normName } from "../../lib/psb/format";
import { C, MEMBERSHIP_COLORS, mix, S } from "../../lib/psb/theme";
import { KlientProfil } from "./KlientProfil";
import { Referencie } from "./Referencie";
import { saveLead } from "../../lib/psb/client";
import type { Lead, PSBData } from "../../lib/psb/types";
import type { Actions, NavFocus } from "./App";
import { Dennik } from "./Dennik";
import { RastAStrata } from "./Fluktuacia";
import { SixMTracker } from "./SixM";
import { Badge, Card, Donut, Empty, H3, Info, Modal, Select, SortTh, StatCard, SubTabs, TableWrap, TrenerPills, useSort } from "./ui";

const segTone = (s: string) => (s === "Anchor" ? "green" : s === "Stabilný" ? "orange" : "red");
const segColor = (s: string) => (s === "Anchor" ? C.green : s === "Stabilný" ? C.orange : C.red);
// Logical status order for sorting (not alphabetical, so Pauza/Neaktívny land last).
const STATUS_RANK: Record<string, number> = { "Aktívny": 0, "Sporadický": 1, "Pauza": 2, "Neaktívny": 3 };
const statusTone = (s: string) =>
  s === "Aktívny" ? "green" : s === "Sporadický" ? "blue" : s === "Pauza" ? "orange" : "muted";
const SEGMENTS = ["Anchor", "Stabilný", "Sporadický"] as const;
const shortPkg = (m: string) => m.replace(/^OFF - /, "").replace(/^ON - /, "ON ").replace(" hodín offline", "h").replace("hodina offline", "h");

// Štandard rodiny T (roky chronologicky, potom okná od najdlhšieho).
const KPI_WINDOWS = [
  { value: "all", label: "Celé obdobie", days: 0 },
  { value: "2025", label: "2025", days: 0 },
  { value: "2026", label: "2026", days: 0 },
  { value: "6m", label: "Posledných 6 mes.", days: 183 },
  { value: "3m", label: "Posledné 3 mes.", days: 92 },
  { value: "1m", label: "Posledný mesiac", days: 31 },
  { value: "1t", label: "Posledný týždeň", days: 7 },
  { value: "custom", label: "Vlastné", days: -1 },
];

// Kanály presne tak, ako to Jerry popísal: „IG DM, hlavne maily z webového
// formulára, občas telefón, občas osobný Instagram". Telefón a osobný profil
// doteraz spadli do „Iné" — čiže najosobnejšie kanály, ktoré stoja najviac
// času, boli v štatistike neviditeľné.
export const SOURCES = [
  { value: "referencia", label: "Referencia" },
  // Bez tohto sa platená a neplatená cesta nedajú rozlíšiť: kto uvidel platený
  // reel, napíše „Instagram" rovnako ako ten, kto nás našiel sám. A kým sa to
  // nerozlíši, veta „spustím reklamu = klienti" sa nedá ani overiť, ani vyladiť.
  { value: "reklama", label: "Reklama (platená)" },
  { value: "mail", label: "Mail (web formulár)" },
  { value: "instagram", label: "Instagram — firemný" },
  { value: "instagram_osobny", label: "Instagram — osobný" },
  { value: "telefon", label: "Telefón" },
  { value: "google", label: "Google" },
  { value: "web", label: "Web" },
  { value: "ine", label: "Iné" },
];
const STATUSES = [
  { value: "novy", label: "Ozval sa" },
  { value: "neodpisal", label: "Neodpísal" },
  { value: "dohodnuty", label: "Dohodnutý úvodný" },
  { value: "zruseny", label: "Zrušený úvodný" },
];
const statusColor = (s: string) =>
  s === "dohodnuty" ? C.green : s === "zruseny" ? C.orange : s === "neodpisal" ? C.red : C.textMuted;

// The top of the funnel PTminder can't see: people who write and then go quiet.
// Deliberately narrow — it only asks what lives in Jerry's inbox and DMs. Whether
// someone actually showed up or became a client is already in the PTminder CSV,
// so it is derived rather than typed twice.
// Pole odporúčateľa sa ukladá samo.
//
// Predtým to bol nekontrolovaný input, ktorý zapisoval až pri opustení poľa.
// Kto meno dopísal a zavrel okno klávesou alebo klikom mimo, prišiel oň — a
// keďže to bolo jediné miesto, kde sa meno zadáva, referenčný rebríček zostal
// prázdny bez toho, aby to niekomu prišlo divné.
//
// Ukladá sa pol sekundy po dopísaní, pri opustení poľa aj pri Enteri. Ponuka
// mien existujúcich klientov je tam preto, že odporúčateľ je skoro vždy niekto,
// koho appka už pozná — a rovnaké meno napísané dvoma spôsobmi rozbije rebríček.
function PoleOdporucatela({ meno, hodnota, mena, onUloz }: { meno: string; hodnota: string; mena: string[]; onUloz: (v: string) => void }) {
  const [v, setV] = useState(hodnota);
  const [ulozene, setUlozene] = useState(true);
  useEffect(() => { setV(hodnota); setUlozene(true); }, [meno, hodnota]);
  useEffect(() => {
    if (v === hodnota) return;
    setUlozene(false);
    const t = setTimeout(() => { onUloz(v); setUlozene(true); }, 500);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginTop: 8 }}>
      <input
        style={{ ...S.input }}
        placeholder="Kto ho poslal? (meno)"
        list="psb-referrers"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== hodnota) { onUloz(v); setUlozene(true); } }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <datalist id="psb-referrers">
        {mena.map((n) => <option key={n} value={n} />)}
      </datalist>
      <div style={{ fontSize: 11, color: ulozene ? C.green : C.textDim, marginTop: 4 }}>
        {ulozene ? (v ? "Uložené — objaví sa v Marketing → Referencie" : "") : "Ukladám…"}
      </div>
    </div>
  );
}

/**
 * Odkedy sa čas odpovede počíta.
 *
 * `date` je len deň. Keby sa meralo od neho, počítalo by sa od POLNOCI: dopyt
 * o 18:00 a odpoveď o 20:00 by vyšla ako dvadsať hodín. Jerry to našiel hneď
 * pri prvom kliknutí — „za 13 hodín, ale to som ešte spal".
 */
const zaciatokMerania = (l: Lead): number => {
  const zCreated = Date.parse(l.createdAt || "");
  const zDna = Date.parse(`${l.date}T00:00:00Z`);
  // createdAt použijeme, len keď sedí na deň dopytu — pri starých ručne
  // zapísaných dopytoch je to čas prepísania, nie čas, keď sa človek ozval.
  if (Number.isFinite(zCreated) && (l.createdAt || "").slice(0, 10) === l.date) return zCreated;
  return zDna;
};

/**
 * Odkedy sa rýchlosť odpovede vôbec meria.
 *
 * Tlačidlo „ozvali sme sa" vzniklo 12. 8. 2026. Pri 37 dopytoch spred toho
 * dňa sa nedá zistiť, kedy sme sa ozvali — a dopĺňať to spätne by znamenalo
 * vymýšľať si. Preto sa staršie dopyty do dlaždíc nerátajú a tlačidlo pri
 * nich nie je: číslo má začínať na nule a rásť z pravdy.
 */
const MERANIE_OD = "2026-08-12";
const meraSa = (l: Lead) => l.date >= MERANIE_OD;

/** Za ako dlho sme sa ozvali — „za 2 h", „za 3 dni". Kratšie než dátum a čas. */
function odpovedZa(l: Lead): string {
  if (!l.odpovedaneAt) return "";
  const doK = Date.parse(l.odpovedaneAt);
  if (!Number.isFinite(doK)) return "✓";
  const h = Math.max(0, Math.round((doK - zaciatokMerania(l)) / 3600000));
  if (h < 1) return "hneď";
  if (h < 24) return `za ${h} h`;
  const d = Math.round(h / 24);
  return `za ${d} ${d === 1 ? "deň" : d < 5 ? "dni" : "dní"}`;
}

/**
 * Dôvody, prečo sa z dopytu nestal klient.
 *
 * Ponuka, nie číselník — dá sa napísať čokoľvek. Zmysel je v tom, aby sa tie
 * isté veci písali rovnako a dali sa spočítať; keby si každý písal po svojom,
 * o pol roka sa z toho nedá prečítať nič.
 */
const DOVODY_ID = "psb-dovody";
const DOVODY = ["nezdvíhal telefón", "neodpísal", "cena", "vzdialenosť", "termín nesedel",
  "rozmyslel si to", "šiel inam", "len sa pýtal", "omyl / spam"];

function Dopyty({ leads, clients, refresh }: { leads: Lead[]; clients: Record<string, ClientAgg>; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [upravCas, setUpravCas] = useState<string | null>(null);
  const [lenCakajuci, setLenCakajuci] = useState(false);
  const [uzOzvane, setUzOzvane] = useState(false);
  const zoznamRef = useRef<HTMLDivElement>(null);
  const [rychleMeno, setRychleMeno] = useState("");
  const [rychlyZdroj, setRychlyZdroj] = useState("reklama");
  const [draft, setDraft] = useState<Partial<Lead>>({});

  const clientNames = useMemo(
    () => Object.values(clients).map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [clients],
  );
  // A referred person who already shows up as a client = the referral worked.
  // najdiKlienta (presne, potom fuzzy) — dopyt písaný z hlavy nesmie stratiť
  // konverziu na diakritike či preklepe. Rovnaká rodina chýb ako Prochádzka.
  const menaKlientovAll = useMemo(() => Object.keys(clients), [clients]);
  const converted = (l: Lead) => !!(l.name && najdiKlienta(menaKlientovAll, l.name));

  const save = async (l: Partial<Lead> & { id?: string; remove?: boolean }) => {
    setBusy(true);
    await saveLead(l);
    await refresh();
    setBusy(false);
  };
  const openAdd = () => {
    setDraft({ date: new Date().toISOString().slice(0, 10), source: "instagram", status: "novy", name: "", referrer: "", note: "" });
    setAdding(true);
  };
  const submitAdd = async () => {
    setAdding(false);
    await save(draft);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1;
    const konv = leads.filter(converted).length;
    // Rýchlosť odpovede: medián, nie priemer. Jeden dopyt, na ktorý sa
    // zabudlo na tri týždne, by priemer roztiahol tak, že by číslo prestalo
    // hovoriť o bežnom prípade.
    const casy = leads
      .filter((l) => meraSa(l) && l.odpovedaneAt)
      .map((l) => (Date.parse(l.odpovedaneAt) - zaciatokMerania(l)) / 3600000)
      .filter((h) => Number.isFinite(h) && h >= 0)
      .sort((a, b) => a - b);
    const median = casy.length ? casy[Math.floor(casy.length / 2)] : null;
    const bezOdpovede = leads.filter((l) => meraSa(l) && !l.odpovedaneAt && l.status === "novy").length;
    return { total: leads.length, dohodnuty: c.dohodnuty || 0, neodpisal: c.neodpisal || 0, konv, median, bezOdpovede };
  }, [leads, menaKlientovAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const bySource = useMemo(() => {
    const m: Record<string, { n: number; klient: number }> = {};
    for (const l of leads) {
      const e = (m[l.source] ||= { n: 0, klient: 0 });
      e.n++;
      if (converted(l)) e.klient++;
    }
    return m;
  }, [leads, menaKlientovAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputStyle = { ...S.select, width: "100%", minWidth: 0 } as const;
  const REFERRER_LIST = "psb-referrers";

  return (
    <>
      <datalist id={REFERRER_LIST}>
        {clientNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <H3><Info text="Každý, kto sa ozve — mail, Instagram, referencia. Aj ten, kto potom neodpíše. Zapisuje sa len to, čo appka inak nezistí; či klient reálne prišiel a či začal chodiť, vyčíta z PTminder CSV." label="Dopyty" /></H3>
          {/* Rýchly zápis. Modálne okno so šiestimi poľami zostáva na doplnenie
              detailu, ale prvý zápis musí trvať desať sekúnd — inak sa nestane.
              Meno a zdroj stačia; dátum je dnešok a stav „ozval sa". */}
          <form
            onSubmit={(e) => { e.preventDefault(); if (!rychleMeno.trim()) return; void save({ date: new Date().toISOString().slice(0, 10), name: rychleMeno.trim(), source: rychlyZdroj as Lead["source"], status: "novy", referrer: "", note: "", odpovedaneAt: uzOzvane ? new Date().toISOString() : "" }); setRychleMeno(""); }}
            style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
          >
            <input
              value={rychleMeno} onChange={(e) => setRychleMeno(e.target.value)} placeholder="Meno — kto sa ozval"
              style={{ ...S.select, width: 200, minWidth: 0 }}
            />
            <Select value={rychlyZdroj} onChange={setRychlyZdroj} options={SOURCES} />
            {/* Zapisovanie dopytu a odpovedanie naň sú často jedna a tá istá
                chvíľa — zavoláš a hneď to píšeš. Bez tohto by sa muselo
                preklikávať do zoznamu a čas by sa nikdy nezaznamenal presne. */}
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.textMuted, cursor: "pointer" }}>
              <input type="checkbox" checked={uzOzvane} onChange={(e) => setUzOzvane(e.target.checked)} />
              už som sa ozval
            </label>
            <button type="submit" disabled={busy || !rychleMeno.trim()}
              style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12.5, fontWeight: 600, cursor: busy || !rychleMeno.trim() ? "default" : "pointer", opacity: busy || !rychleMeno.trim() ? 0.45 : 1 }}>
              Zapísať
            </button>
            <button type="button" onClick={openAdd} disabled={busy}
              style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
              s detailom
            </button>
          </form>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <StatCard value={String(counts.total)} label="Dopytov spolu" color={C.blue} />
          <StatCard value={String(counts.dohodnuty)} label="Dohodnutý úvodný" color={C.accentLight} />
          <StatCard value={String(counts.neodpisal)} label="Neodpísali" color={C.red} />
          <StatCard value={counts.total ? `${((counts.konv / counts.total) * 100).toFixed(0)} %` : "—"}
            label={<Info text="Podiel dopytov, ktorých meno sa už objavuje medzi klientmi v PTminderi — teda naozaj začali chodiť. Počíta sa automaticky, nezapisuje sa." label="Konverzia na klienta" />} color={C.green} />
          <StatCard
            value={counts.median === null ? "—" : counts.median < 24 ? `${Math.round(counts.median)} h` : `${Math.round(counts.median / 24)} dni`}
            label={<Info text="Medián času od dopytu po našu prvú odpoveď. V službách je rýchlosť odpovede najsilnejšia páka na konverziu — silnejšia než cena aj než text reklamy. Meria sa tlačidlom „ozvali sme sa“ pri dopyte; medián preto, aby jeden zabudnutý dopyt neroztiahol celé číslo." label="Ozveme sa za" />}
            color={counts.median === null ? C.textDim : counts.median <= 24 ? C.green : C.orange} />
          <div onClick={() => { setLenCakajuci((x) => !x); zoznamRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            style={{ cursor: "pointer" }} title="Klikni — ukáže len tých, čo čakajú">
            <StatCard value={String(counts.bezOdpovede)}
              label={<Info text="Dopyty od zavedenia merania, pri ktorých ešte nikto neklikol „ozvali sme sa“. Sú to ľudia, ktorí práve teraz čakajú. Klik na dlaždicu zoznam dole prefiltruje len na nich." label="Čaká na odpoveď" />}
              color={counts.bezOdpovede ? C.red : C.green} />
          </div>
        </div>
      </Card>

      {Object.keys(bySource).length > 0 && (
        <Card>
          <H3><Info text="Ktorý kanál naozaj prináša klientov, nie len správy." label="Podľa zdroja" /></H3>
          <TableWrap>
            <thead>
              <tr>
                <th style={S.th}>Zdroj</th>
                <th style={{ ...S.th, textAlign: "right" }}>Dopytov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Konverzia</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.filter((s) => bySource[s.value]).map((s) => {
                const e = bySource[s.value];
                return (
                  <tr key={s.value}>
                    <td style={S.td}>{s.label}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{e.n}</td>
                    <td style={{ ...S.td, textAlign: "right", color: C.green }}>{e.klient}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{e.n ? `${((e.klient / e.n) * 100).toFixed(0)} %` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <datalist id={DOVODY_ID}>{DOVODY.map((d) => <option key={d} value={d} />)}</datalist>

      <Card>
        <div ref={zoznamRef} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <H3 style={{ marginBottom: 0 }}>Zoznam</H3>
          {lenCakajuci && (
            <button onClick={() => setLenCakajuci(false)}
              style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${C.red}`, background: "transparent", color: C.red, cursor: "pointer" }}>
              len čakajúci na odpoveď ✕
            </button>
          )}
        </div>
        {!leads.length ? (
          <Empty>Zatiaľ žiadne dopyty — pridaj prvý tlačidlom vyššie.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: 118 }}>Dátum</th>
                <th style={{ ...S.th, minWidth: 130 }}>Meno</th>
                <th style={{ ...S.th, minWidth: 128 }}>Odkiaľ prišiel</th>
                <th style={{ ...S.th, minWidth: 150 }}>Od koho</th>
                <th style={{ ...S.th, minWidth: 130 }}>Kampaň</th>
                <th style={{ ...S.th, minWidth: 150 }}>Stav</th>
                <th style={{ ...S.th, minWidth: 130 }}>Ozvali sme sa</th>
                <th style={{ ...S.th, minWidth: 150 }}><Info label="Prečo nie" text="Prečo sa z dopytu nestal klient. Pole sa objaví, až keď v stĺpci Stav nastavíš „Neodpísal“ alebo „Zrušený“ — pri dopyte, ktorý ešte žije, by bol dôvod straty veštba. Ponúkajú sa hotové dôvody, aby sa tie isté veci písali rovnako a dali sa spočítať; napísať sa dá čokoľvek." /></th>
                <th style={{ ...S.th, minWidth: 140 }}>Poznámka</th>
                <th style={S.th} />
              </tr>
            </thead>
            <tbody>
              {(lenCakajuci ? leads.filter((l) => meraSa(l) && !l.odpovedaneAt && l.status === "novy") : leads).map((l) => (
                <tr key={l.id}>
                  <td style={S.td}>
                    <input type="date" defaultValue={l.date} onBlur={(e) => e.target.value !== l.date && save({ ...l, date: e.target.value })}
                      style={{ ...inputStyle, colorScheme: "dark" }} />
                  </td>
                  <td style={S.td}>
                    <input defaultValue={l.name} placeholder="meno (ak vieme)" onBlur={(e) => e.target.value !== l.name && save({ ...l, name: e.target.value })}
                      style={inputStyle} />
                    {converted(l) && <span title="už je medzi klientmi v PTminderi" style={{ color: C.green, fontSize: 11, marginLeft: 6 }}>✓ klient</span>}
                  </td>
                  <td style={S.td}>
                    <Select value={l.source} onChange={(v) => save({ ...l, source: v as Lead["source"], referrer: v === "referencia" ? l.referrer : "" })}
                      options={SOURCES} style={inputStyle} />
                  </td>
                  <td style={S.td}>
                    {l.source === "referencia" ? (
                      <input list={REFERRER_LIST} defaultValue={l.referrer} placeholder="píš meno…"
                        onBlur={(e) => e.target.value !== l.referrer && save({ ...l, referrer: e.target.value })} style={inputStyle} />
                    ) : <span style={{ color: C.textDim, fontSize: 12 }}>—</span>}
                  </td>
                  <td style={S.td}>
                    {l.kampan ? (
                      <span title={l.utm || ""} style={{ fontSize: 11.5, color: C.accent }}>{l.kampan}</span>
                    ) : <span style={{ color: C.textDim, fontSize: 12 }}>—</span>}
                  </td>
                  <td style={S.td}>
                    <Select value={l.status} onChange={(v) => save({ ...l, status: v as Lead["status"] })} options={STATUSES}
                      style={{ ...inputStyle, color: statusColor(l.status) }} />
                  </td>
                  <td style={S.td}>
                    {/* Čas prvej odpovede jedným klikom. Keby to bolo pole na
                        vypĺňanie, nevyplní ho nikto — a práve toto číslo je
                        v službách najsilnejšia páka na konverziu.
                        Zapísaný čas sa dá prepísať: Terezka zavolá o desiatej
                        a odklikne sa to o štvrtej. Bez opravy by číslo merilo
                        našu pozornosť, nie našu rýchlosť. */}
                    {!meraSa(l) ? (
                      <span title={`Rýchlosť odpovede sa meria až od ${fmtDMY(MERANIE_OD)} — pri starších dopytoch sa už nedá zistiť.`}
                        style={{ color: C.textDim, fontSize: 12 }}>—</span>
                    ) : l.odpovedaneAt ? (
                      upravCas === l.id ? (
                        <input
                          type="datetime-local" autoFocus
                          defaultValue={new Date(Date.parse(l.odpovedaneAt) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                          onBlur={(e) => { setUpravCas(null); if (e.target.value) save({ ...l, odpovedaneAt: new Date(e.target.value).toISOString() }); }}
                          style={{ ...inputStyle, colorScheme: "dark" }} />
                      ) : (
                        <span style={{ fontSize: 11.5, color: C.textMuted }}>
                          <button onClick={() => setUpravCas(l.id)} title="klikni a oprav čas"
                            style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", padding: 0, fontSize: 11.5, textDecoration: "underline dotted" }}>
                            {odpovedZa(l)}
                          </button>
                          <button onClick={() => save({ ...l, odpovedaneAt: "" })} title="zrušiť"
                            style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", marginLeft: 4 }}>✕</button>
                        </span>
                      )
                    ) : (
                      <button onClick={() => save({ ...l, odpovedaneAt: new Date().toISOString() })}
                        style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.accent, cursor: "pointer" }}>
                        ozvali sme sa
                      </button>
                    )}
                  </td>
                  <td style={S.td}>
                    {/* Dôvod má zmysel len pri stratenom dopyte — pri živom by
                        to bola veštba. Lenže pomlčka sama o sebe nepovie, čo
                        s tým: Jerry sa hneď pýtal, ako sa to vypĺňa. */}
                    {l.status === "neodpisal" || l.status === "zruseny" ? (
                      <input list={DOVODY_ID} defaultValue={l.dovod} placeholder="dôvod…"
                        onBlur={(e) => e.target.value !== l.dovod && save({ ...l, dovod: e.target.value })} style={inputStyle} />
                    ) : (
                      <span title="Vyplní sa, až keď v stĺpci Stav nastavíš „Neodpísal“ alebo „Zrušený“."
                        style={{ color: C.textDim, fontSize: 12, cursor: "help" }}>—</span>
                    )}
                  </td>
                  <td style={S.td}>
                    <input defaultValue={l.note} placeholder="poznámka" onBlur={(e) => e.target.value !== l.note && save({ ...l, note: e.target.value })} style={inputStyle} />
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <button onClick={() => save({ id: l.id, remove: true })} title="Zmazať"
                      style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
          Keď sa meno odporúčaného objaví medzi klientmi, v „Na čo sa pozrieť“ vyskočí pripomienka na 10 % zľavu pre toho, kto ho poslal.
        </div>
      </Card>

      {adding && (
        <Modal title="Nový dopyt" onClose={() => setAdding(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Dátum
              <input type="date" value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                style={{ ...inputStyle, colorScheme: "dark", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Meno <span style={{ color: C.textDim }}>(ak ho vieme)</span>
              <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="napr. Peter Novák" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Odkiaľ prišiel
              <div style={{ marginTop: 4 }}>
                <Select value={draft.source ?? "instagram"} onChange={(v) => setDraft({ ...draft, source: v as Lead["source"] })}
                  options={SOURCES} style={inputStyle} />
              </div>
            </label>
            {draft.source === "referencia" && (
              <label style={{ fontSize: 12, color: C.textMuted }}>
                Od koho <span style={{ color: C.textDim }}>(píš meno — nemusí to byť náš klient)</span>
                <input list={REFERRER_LIST} value={draft.referrer ?? ""} onChange={(e) => setDraft({ ...draft, referrer: e.target.value })}
                  placeholder="začni písať…" style={{ ...inputStyle, marginTop: 4 }} />
              </label>
            )}
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Poznámka
              <input value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="napr. bolesti chrbta, píše z Brna…" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={submitAdd}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Pridať
              </button>
              <button onClick={() => setAdding(false)}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>
                Zrušiť
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// Odkiaľ klienti reálne chodia — kategórie sú tie, ktoré vyšli zo 47 anamnéz
// (jún 2025 – júl 2026), nie vymyslené. Poradie podľa početnosti.
export const ZDROJE = [
  { value: "", label: "—" },
  { value: "referencia", label: "Referencia" },
  // Reklama a web pribudli s meraním platenej cesty — klient, ktorý prišiel z
  // dopytu so zdrojom „reklama", má ten zdroj niesť ďalej, inak sa atribúcia
  // stratí presne v momente, keď sa z dopytu stane platiaci človek.
  { value: "reklama", label: "Reklama (platená)" },
  { value: "web", label: "Web / mail" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "fp", label: "FP adresár" },
  { value: "offline", label: "Tabuľa / billboard / leták" },
  { value: "ai", label: "AI (ChatGPT a pod.)" },
  { value: "ine", label: "Iné" },
];

export function Klienti({ clients, capacity, actions, focus, leads, trainer, onTrainer, sixM, sub, onSub, data, btcSatsKlienti = {}, onDennikZapis }: { clients: Record<string, ClientAgg>; capacity: CapacityRow[]; actions: Actions; focus?: NavFocus | null; leads: Lead[]; trainer: string; onTrainer: (t: string) => void; sixM: SixMRow[]; sub: string; onSub: (s: string) => void; data: PSBData; btcSatsKlienti?: Record<string, number>; onDennikZapis?: (meno: string, text: string) => Promise<string | null> }) {
  const [focusClient, setFocusClient] = useState<string | null>(null);
  const [skupina, setSkupina] = useState<{ label: string; mena: string[] } | null>(null);
  useEffect(() => {
    if (focus?.client) setFocusClient(focus.client);
    // Skupina a jeden klient sa vylučujú — otvoriť oboje naraz by znamenalo
    // dva filtre, ktoré si protirečia.
    if (focus?.skupina) { setSkupina(focus.skupina); setFocusClient(null); }
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const fTrainer = trainer;
  const setFTrainer = onTrainer;
  const [fSegment, setFSegment] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [modalityF, setModalityF] = useState("all");
  const [membershipF, setMembershipF] = useState(""); // package bucket from the donut
  const [nameSearch, setNameSearch] = useState("");
  // Mená klientov na ponuku pri odporúčateľovi — odporúčateľ je skoro vždy
  // niekto, koho appka pozná, a rovnaké meno napísané dvoma spôsobmi rozbije
  // rebríček.
  const clientNames = useMemo(() => Object.keys(clients).sort((a, b) => a.localeCompare(b)), [clients]);
  const [showInactive, setShowInactive] = useState(false);
  // „Kto nemá zapísané, odkiaľ prišiel" — jediné miesto, kde sa marketing
  // spája s peniazmi, a doteraz sa dalo dopĺňať len tak, že človek prechádzal
  // celý zoznam a hádal, ktorému chýba. Filter z toho robí odškrtávací zoznam.
  const [lenBezZdroja, setLenBezZdroja] = useState(false);
  const [kpiWin, setKpiWin] = useState("2026");
  const [kpiFrom, setKpiFrom] = useState("");
  const [kpiTo, setKpiTo] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort({ key: "name", dir: "asc" });

  const all = useMemo(() => Object.values(clients), [clients]);

  const pocetNeaktivnych = useMemo(() => all.filter((c) => c.status === "Neaktívny").length, [all]);
  // Počíta sa zo VŠETKÝCH klientov vrátane neaktívnych — inak by tlačidlo
  // hlásilo menšie číslo, než koľko sa po jeho stlačení objaví.
  const pocetBezZdroja = useMemo(() => all.filter((c) => !c.zdroj).length, [all]);

  // Package-type filter options built from the real memberships in the data.
  const typeOptions = useMemo(() => {
    const memberships = [...new Set(all.map((c) => c.membership).filter(Boolean))].sort();
    return [
      { value: "all", label: "Všetky typy" },
      { value: "grp:6M Predplatné", label: "6M Predplatné (všetky)" },
      { value: "grp:Balíček", label: "Balíček (všetky)" },
      ...memberships.map((m) => ({ value: `m:${m}`, label: m })),
    ];
  }, [all]);

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const t of TRAINERS) m[t] = { Anchor: 0, Stabilný: 0, Sporadický: 0 };
    for (const c of all) {
      if (c.status === "Neaktívny") continue;
      if (m[c.primaryTrainer]) m[c.primaryTrainer][c.segment]++;
    }
    return m;
  }, [all]);

  // Everything except the package-donut filter — the donut is built from this,
  // so its slices stay visible/clickable even after you pick one.
  const baseList = useMemo(() => {
    let arr = all.filter((c) => (showInactive ? true : c.status !== "Neaktívny"));
    if (fTrainer !== "all") arr = arr.filter((c) => c.primaryTrainer === fTrainer);
    if (fSegment !== "all") arr = arr.filter((c) => c.segment === fSegment);
    return arr;
  }, [all, fTrainer, fSegment, showInactive]);

  const membershipDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    // Pri vybranom klientovi ukáž len JEHO balíček — koláč všetkých vedľa
    // profilu jedného človeka je šum a mätie (Jerryho postreh).
    if (focusClient) {
      const c = all.find((x) => normName(x.name) === normName(focusClient));
      if (c) {
        const b = membershipBucket(c.membership);
        if (b) counts[b] = 1;
      }
      return MEMBERSHIP_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: MEMBERSHIP_COLORS[k] }));
    }
    for (const c of baseList) {
      const b = membershipBucket(c.membership);
      counts[b] = (counts[b] || 0) + 1;
    }
    return MEMBERSHIP_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: MEMBERSHIP_COLORS[k] }));
  }, [baseList, focusClient, all]);

  const list = useMemo(() => {
    // A click-through from the Dashboard focuses one client — show only them (even if inactive).
    if (focusClient) {
      const t = normName(focusClient);
      return all.filter((c) => normName(c.name) === t);
    }
    // Table-only filters (name search + package type + modality + package bucket from the donut).
    let arr = baseList;
    // Skupina z dashboardu ide cez `all`, nie cez baseList — dlaždica hovorí
    // o konkrétnych ľuďoch a tí sa nesmú stratiť tým, že je práve zapnutý
    // filter trénera alebo skryté neaktívne.
    if (skupina) {
      const set = new Set(skupina.mena.map(normName));
      arr = all.filter((c) => set.has(normName(c.name)));
    }
    if (membershipF) arr = arr.filter((c) => membershipBucket(c.membership) === membershipF);
    if (typeF.startsWith("grp:")) arr = arr.filter((c) => c.clientType === typeF.slice(4));
    else if (typeF.startsWith("m:")) arr = arr.filter((c) => c.membership === typeF.slice(2));
    if (modalityF !== "all") arr = arr.filter((c) => c.modality === modalityF);
    if (lenBezZdroja) arr = arr.filter((c) => !c.zdroj);
    if (nameSearch.trim()) {
      const q = normName(nameSearch);
      arr = arr.filter((c) => normName(c.name).includes(q));
    }
    return sorted(arr, {
      name: (c) => c.name,
      trainer: (c) => c.primaryTrainer,
      status: (c) => STATUS_RANK[c.status] ?? 9,
      segment: (c) => c.attendance,
      type: (c) => c.membership || c.clientType,
      pkg: (c) => c.packageRemaining,
      sessions: (c) => c.sessionCount,
      attendance: (c) => c.attendance,
      avg: (c) => c.paidAvg,
      last: (c) => new Date(c.lastSession).getTime(),
      bitcoin: (c) => (c.bitcoin ? 1 : 0),
      zdroj: (c) => c.zdroj || "zzz",
    });
  }, [baseList, membershipF, typeF, modalityF, lenBezZdroja, nameSearch, sorted, focusClient, all, skupina]);

  const donut = useMemo(
    () => SEGMENTS.map((s) => ({ label: s, value: list.filter((c) => c.segment === s).length, color: segColor(s) })),
    [list],
  );

  // KPI tiles scoped to the chosen time window.
  const kpis = useMemo(() => {
    const preset = KPI_WINDOWS.find((w) => w.value === kpiWin);
    let lo = 0;
    let hi = Infinity;
    let scoped = kpiWin !== "all";
    if (kpiWin === "custom") {
      lo = kpiFrom ? new Date(kpiFrom).getTime() : 0;
      hi = kpiTo ? new Date(kpiTo).getTime() + 86400000 : Infinity;
      scoped = !!(kpiFrom || kpiTo);
    } else if (kpiWin === "2025" || kpiWin === "2026") {
      lo = Date.parse(`${kpiWin}-01-01`);
      hi = Date.parse(`${kpiWin}-12-31`) + 86400000;
    } else if (preset && preset.days > 0) {
      lo = Date.now() - preset.days * 86400000;
    }
    let hours = 0, sedeni = 0, clientsWithSess = 0;
    for (const c of list) {
      const sess = scoped ? c.sessions.filter((s) => { const t = new Date(s.date).getTime(); return t >= lo && t <= hi; }) : c.sessions;
      if (sess.length) clientsWithSess++;
      sedeni += sess.length;
      for (const s of sess) hours += s.duration / 60;
    }
    // Ø cena sedenia = PRIJATÉ PENIAZE ÷ sedenia, rovnako ako na Kokpite
    // a v Peniazoch. Predtým sa tu rátal priemer ceny zapísanej pri sedení
    // BEZ nulových — vyšlo 1 046 Kč tam, kde Tréningy hlásili 844 a Kokpit
    // 1 015. Nulová cena nie je tréning zadarmo, je to sedenie kryté
    // balíčkom; vyhodiť ho z menovateľa znamená stratiť pätinu odrobenej
    // práce a cenu nadhodnotiť.
    const menaList = new Set(list.map((c) => normName(c.name)));
    let cash = 0;
    for (const p of data.payments) {
      if (!p.client || !menaList.has(normName(p.client))) continue;
      const t = new Date(p.date).getTime();
      if (scoped && (t < lo || t > hi)) continue;
      cash += p.amount;
    }
    const denom = (scoped ? clientsWithSess : list.length) || 1;
    const att = list.length ? (list.reduce((a, c) => a + c.attendance, 0) / list.length) * 100 : 0;
    return { count: list.length, activeInWin: clientsWithSess, att, hpc: hours / denom, avg: sedeni ? cash / sedeni : 0, scoped };
  }, [list, kpiWin, kpiFrom, kpiTo, data.payments]);

  const cell = (t: string, seg: string) => {
    const active = fTrainer === t && fSegment === seg;
    const n = matrix[t]?.[seg] ?? 0;
    return (
      <td
        key={seg}
        onClick={() => { setFTrainer(active ? "all" : t); setFSegment(active ? "all" : seg); }}
        style={{ ...S.td, cursor: "pointer", textAlign: "center", fontWeight: 700, background: active ? segColor(seg) : n ? segColor(seg) + "22" : undefined, color: active ? "#14180F" : segColor(seg), borderRadius: 6 }}
      >
        {n}
      </td>
    );
  };

  const setSub = onSub;

  const editC = edit ? clients[edit] : null;
  const filterLabel = fTrainer === "all" && fSegment === "all" ? "Všetci klienti" : `${fTrainer === "all" ? "" : fTrainer} ${fSegment === "all" ? "" : fSegment}`.trim();

  return (
    <>
      {/* 6M sem prišlo z vlastnej sekcie. Šesťmesačný proces nie je iný modul,
          je to pohľad na tých istých klientov — a doteraz bol na troch miestach
          naraz (vlastná sekcia, karta na dashboarde, upozornenia v registri).
          Kto hľadal klienta v 6M, musel vedieť, že sa naňho pozerá inde. */}
      <SubTabs
        tabs={[
          { id: "klienti", label: "Klienti" },
          { id: "6m", label: "6M proces" },
          { id: "dopyty", label: "Dopyty" },
          // Referencie hneď za Dopytmi — poradie rozpráva cestu klienta:
          // kto sa ozval → kto ho poslal → kto prišiel a odišiel.
          { id: "referencie", label: "Referencie" },
          { id: "rast", label: "Fluktuácia" },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "referencie" ? (
        <Referencie data={data} clients={clients} onKlient={(m) => { setFocusClient(m); onSub("klienti"); }} />
      ) : sub === "rast" ? (
        <RastAStrata
          data={data}
          clients={clients}
          // Klik na meno prepne na zoznam klientov a zameria ho. Zameraný klient
          // obchádza všetky filtre vrátane „zobraziť neaktívnych", takže sa
          // otvorí aj ten, kto v bežnom zozname nie je.
          onKlient={(m) => { setFocusClient(m); onSub("klienti"); }}
          // Klik na POČET v kohortách či zdrojoch otvorí zoznam len s tými
          // ľuďmi — rovnaká skupina ako z dlaždice Odmlčaní na Kokpite.
          onSkupina={(label, mena) => { setSkupina({ label, mena }); setFocusClient(null); onSub("klienti"); }}
        />
      ) :
       sub === "6m" ? <SixMTracker sixM={sixM} actions={actions} trainer={trainer} onTrainer={onTrainer} /> :
       sub === "dopyty" ? <Dopyty leads={leads} clients={clients} refresh={actions.refresh} /> : (
      <>
      {/* Filtre + KPI úplne hore */}
      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <TrenerPills value={fTrainer} onChange={(v) => { setFTrainer(v); if (v === "all") setFSegment("all"); }} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Obdobie štatistík:</span>
            <Select value={kpiWin} onChange={setKpiWin} options={KPI_WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
            {kpiWin === "custom" && (
              <>
                <input type="date" value={kpiFrom} onChange={(e) => setKpiFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
                <span style={{ color: C.textDim, alignSelf: "center" }}>–</span>
                <input type="date" value={kpiTo} onChange={(e) => setKpiTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
              </>
            )}
          </div>
        </div>
        {fSegment !== "all" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setFSegment("all")} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "4px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>Segment: {fSegment} ✕</button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          <StatCard value={kpis.scoped ? kpis.activeInWin : kpis.count} label={<Info text="Počet klientov, ktorí prešli aktuálnymi filtrami. V časovom okne = koľko z nich reálne chodilo v danom období." label={kpis.scoped ? "Chodilo v období" : "Klientov vo výbere"} />} />
          <StatCard value={`${kpis.att.toFixed(0)}%`} label={<Info text="Priemerný podiel týždňov, v ktorých mal klient aspoň jeden tréning, za posledných 18 týždňov. Vždy 18 týž., nezávisí od filtra času." label="Ø dochádzka" />} />
          <StatCard value={kpis.hpc.toFixed(1)} label={<Info text="Priemerný počet odtrénovaných hodín na klienta za zvolené obdobie (alebo celú históriu)." label={`Ø hodín/klient${kpis.scoped ? " (obd.)" : ""}`} />} />
          <StatCard value={fmtCZK(kpis.avg)} label={<Info text="Prijaté peniaze delené počtom odtrénovaných sedení za zvolené obdobie, pre klientov v tomto zozname. Rovnaká definícia ako „Ø cena sedenia“ na Kokpite a v Peniazoch. Neráta sa z ceny zapísanej pri sedení: tá je pri 19 % sedení nulová, lebo platba visí na balíčku." label="Ø CZK/sedenie" />} />
        </div>
      </Card>

      <Card>
        <H3>
          <Info text="Klikni na bunku (Jerry × Anchor) a zoznam dole sa vyfiltruje na tých klientov. Klik na meno trénera = celý tréner, klik na segment = oba tréneri. „Odrob. h/týž“ = reálne odtrénované hodiny za týždeň (priemer posledných 8 týž.); zdravá zóna 24–34h." label="Kapacita & segmenty" />
        </H3>
        <TableWrap>
          <thead>
            <tr>
              <th style={S.th}></th>
              {SEGMENTS.map((s) => (
                <th key={s} onClick={() => { setFSegment(fSegment === s ? "all" : s); setFTrainer("all"); }} style={{ ...S.th, cursor: "pointer", textAlign: "center", color: fSegment === s ? C.accentLight : segColor(s) }}>
                  {s}
                </th>
              ))}
              <th style={{ ...S.th, textAlign: "right" }}>Odrob. h/týž</th>
              <th style={{ ...S.th, textAlign: "right" }}>Zvládne ešte</th>
              <th style={S.th}>Odporúčanie</th>
            </tr>
          </thead>
          <tbody>
            {TRAINERS.map((t) => {
              const cap = capacity.find((c) => c.trainer === t);
              const inZone = cap && cap.recentWeekly >= 24 && cap.recentWeekly <= 34;
              return (
                <tr key={t}>
                  <td onClick={() => { setFTrainer(fTrainer === t ? "all" : t); setFSegment("all"); }} style={{ ...S.td, cursor: "pointer", fontWeight: 600, color: fTrainer === t ? C.accentLight : C.text }}>{t}</td>
                  {SEGMENTS.map((s) => cell(t, s))}
                  <td style={{ ...S.td, textAlign: "right", color: inZone ? C.green : (cap?.recentWeekly ?? 0) > 34 ? C.red : C.orange }}>{cap?.recentWeekly.toFixed(0)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.accentLight }}>{cap ? `+${cap.canTake}` : "—"}</td>
                  <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{cap?.advice}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Card style={{ marginBottom: 0 }}>
          <H3>Segmenty — {filterLabel}</H3>
          {donut.some((d) => d.value > 0) ? <Donut data={donut} size={130} centerLabel={String(kpis.count)} /> : <Empty>Žiadni klienti.</Empty>}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Koľko klientov má aký balíček. Klikni na položku a zoznam dole sa vyfiltruje na daný balíček (rešpektuje aj výber trénera)." label="Klienti podľa balíčka" />
          </H3>
          {membershipDonut.length ? (
            <Donut data={membershipDonut} size={130} centerLabel={String(membershipDonut.reduce((a, d) => a + d.value, 0))} onSlice={(l) => setMembershipF((v) => (v === l ? "" : l))} />
          ) : (
            <Empty>Nahraj Packages & Memberships.</Empty>
          )}
        </Card>
      </div>

      {/* Profil 360 — všetko o vybranom človeku na jednom mieste. Vyhľadanie
          klienta doteraz doviedlo len k riadku tabuľky a zvyšok si človek
          skladal z piatich obrazoviek.
          btcSatsKlienti je kľúčované fuzzy kľúčom (menoKluc), nie normName —
          inak „Prochadzka" z PTmindera nenájde „Procházku" z BTC knihy. */}
      {focusClient && clients[focusClient] && (
        <KlientProfil meno={focusClient} data={data} clients={clients} btcSats={btcSatsKlienti[menoKluc(focusClient)]} onZavri={() => setFocusClient(null)} />
      )}

      <Card>
        <H3><Info text="Všetci klienti podľa filtrov. Hľadaj podľa mena, filtruj typ balíčka a modalitu, alebo klikni na výsek v koláči „Klienti podľa balíčka“ hore." label="Všetci klienti" /></H3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {focusClient ? (
            <button onClick={() => setFocusClient(null)} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Vybraný klient: {focusClient} ✕ (zobraziť všetkých)
            </button>
          ) : skupina ? (
            <button onClick={() => setSkupina(null)} style={{ background: mix(C.orange, 12), border: `1px solid ${C.orange}`, borderRadius: 6, padding: "5px 10px", color: C.orange, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              {skupina.label} ({skupina.mena.length}) ✕ (zobraziť všetkých)
            </button>
          ) : (
            <>
              <input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="🔍 Hľadať meno…" style={{ ...S.input, width: "auto", minWidth: 160, flex: "0 1 200px" }} />
              <Select value={typeF} onChange={setTypeF} options={typeOptions} />
              <Select value={modalityF} onChange={setModalityF} options={[
                { value: "all", label: "Offline + Online" },
                { value: "Offline", label: "Prevažne Offline" },
                { value: "Online", label: "Prevažne Online" },
              ]} />
              {/* Presunuté z horných filtrov k tabuľke (Jerryho pokyn):
                  neaktívni a bez zdroja menia OBSAH TEJTO tabuľky, tak patria
                  k nej — hore menili aj KPI a koláče, čo mätie. */}
              <button
                onClick={() => setShowInactive((v) => !v)}
                style={{ padding: "5px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${showInactive ? C.accent : C.border}`,
                  background: showInactive ? C.accentBg : "transparent",
                  color: showInactive ? C.accentLight : C.textMuted }}
              >
                {showInactive ? "✓ " : "+ "}{pocetNeaktivnych} neaktívnych
              </button>
              <button
                onClick={() => { setLenBezZdroja((v) => !v); if (!lenBezZdroja) setShowInactive(true); }}
                title="Klienti, pri ktorých nie je zapísané, odkiaľ prišli"
                style={{ padding: "5px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${lenBezZdroja ? C.orange : C.border}`,
                  background: lenBezZdroja ? mix(C.orange, 12) : "transparent",
                  color: lenBezZdroja ? C.orange : C.textMuted }}
              >
                {lenBezZdroja ? "✓ " : ""}bez zdroja ({pocetBezZdroja})
              </button>
              {membershipF && (
                <button onClick={() => setMembershipF("")} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "6px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>Balíček: {membershipF} ✕</button>
              )}
              {(typeF !== "all" || modalityF !== "all" || nameSearch) && (
                <button onClick={() => { setTypeF("all"); setModalityF("all"); setNameSearch(""); setMembershipF(""); }} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>Zrušiť filtre</button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13, color: C.accentLight, fontWeight: 600 }}>{list.length} klientov</span>
            </>
          )}
        </div>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Klient" sortKey="name" sort={sort} onSort={toggle} />
              <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
              <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggle} info="Anchor ≥84 % týždňov, Stabilný ≥50 %, Sporadický <50 % — z posledných 18 týždňov." />
              <SortTh label="Predplatné" sortKey="type" sort={sort} onSort={toggle} info="Aktuálny produkt z reportu Packages & Memberships." />
              <SortTh label="Zostatok" sortKey="pkg" sort={sort} onSort={toggle} align="right" info="Zostatok sedení v aktuálnom balíčku." />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" info="Celková odtrénovaná história. Stĺpec s hodinami tu bol tiež a hovoril prakticky to isté — sedenie trvá 60 alebo 90 minút, takže sa obe čísla líšili len mierkou. Presné hodiny ukáže myš nad číslom." />
              <SortTh label="Dochádzka" sortKey="attendance" sort={sort} onSort={toggle} align="right" info="Podiel týždňov s tréningom za posledných 18 týždňov." />
              <SortTh label="Ø CZK" sortKey="avg" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Posledný" sortKey="last" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Zdroj" sortKey="zdroj" sort={sort} onSort={toggle} info="Odkiaľ sa o nás klient dozvedel. Toto je jediné miesto, kde sa marketing spája s peniazmi — bez neho je každé číslo o návratnosti kanála odhad. Pri referencii dopíš aj meno toho, kto ho poslal (klik na ✎)." />
              <SortTh label="₿" sortKey="bitcoin" sort={sort} onSort={toggle} align="center" info="Platí v Bitcoine. Zaškrtni klientov platiacich BTC — potom ich vieš filtrovať a AI asistent vie porovnať BTC vs. klasické platby." />
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.name} style={{ background: c.specialRate ? C.orangeBg : undefined, opacity: c.status === "Neaktívny" ? 0.6 : 1 }}>
                <td style={{ ...S.td, fontWeight: 500 }}>
                  {c.name}
                  {c.specialRate && <span title={c.specialRateNote} style={{ marginLeft: 6, fontSize: 10, color: C.orange }}>★</span>}
                  {c.substituteCount > 0 && <span title={`${c.substituteCount}× zástup`} style={{ marginLeft: 6, fontSize: 9, color: C.blue }}>⇄</span>}
                </td>
                <td style={S.td}>{c.primaryTrainer}{c.primaryTrainerOverride && <span title="Manuálne" style={{ fontSize: 9, color: C.textDim, marginLeft: 3 }}>✎</span>}</td>
                <td style={S.td}><Badge tone={statusTone(c.status)}>{c.status}</Badge>{c.statusOverride && <span title={`Auto: ${c.statusAuto}`} style={{ fontSize: 9, color: C.textDim, marginLeft: 4 }}>✎</span>}</td>
                <td style={S.td}><Badge tone={segTone(c.segment)}>{c.segment}</Badge></td>
                <td style={{ ...S.td, fontSize: 12, color: c.is6m ? C.accentLight : C.textMuted }} title={c.membership}>{c.membership ? shortPkg(c.membership) : c.clientType}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : "—"}</td>
                <td style={{ ...S.td, textAlign: "right" }} title={`${c.totalHours.toFixed(0)} hodín`}>{c.sessionCount}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{(c.attendance * 100).toFixed(0)}%</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(c.paidAvg)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtDate(c.lastSession)}</td>
                <td style={S.td}>
                  <select
                    value={c.zdroj}
                    onChange={(e) => actions.setOverride(c.name, "zdroj", e.target.value)}
                    title={c.zdrojKto ? `Poslal: ${c.zdrojKto}` : "Odkiaľ sa o nás dozvedel"}
                    style={{ background: c.zdroj ? C.cardHover : "transparent", color: c.zdroj ? C.text : C.textDim, border: `1px solid ${c.zdroj ? C.border : "transparent"}`, borderRadius: 6, fontSize: 11.5, padding: "2px 4px", cursor: "pointer", maxWidth: 130 }}
                  >
                    {ZDROJE.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                  </select>
                  {c.zdroj === "referencia" && (
                    // Otáznik bol obyčajný text — dal sa naň klikať a nič sa
                    // nedialo. Pritom je to jediné miesto, kde appka hovorí
                    // „tu niečo chýba", takže je logické, že tam človek klikne.
                    // Teraz otvorí kartu klienta rovno na poli odporúčateľa.
                    <button
                      onClick={() => setEdit(c.name)}
                      title={c.zdrojKto ? `Poslal: ${c.zdrojKto} — klik na úpravu` : "Kto ho poslal? Klikni a dopíš — bez mena sa nedá odovzdať odmena."}
                      style={{ marginLeft: 4, fontSize: 11, color: c.zdrojKto ? C.green : C.orange, background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                    >
                      {c.zdrojKto ? "✓" : "?"}
                    </button>
                  )}
                </td>
                <td style={{ ...S.td, textAlign: "center" }}>
                  <input type="checkbox" checked={c.bitcoin} onChange={(e) => actions.setOverride(c.name, "bitcoin", e.target.checked)} title="Platí v Bitcoine" style={{ accentColor: "#f7931a", cursor: "pointer" }} />
                </td>
                <td style={S.td}><button onClick={() => setEdit(c.name)} style={{ background: C.cardHover, border: "none", borderRadius: 6, padding: "4px 9px", cursor: "pointer", color: C.text, fontSize: 11 }}>✎</button></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!list.length && (
          <Empty>
            {focusClient
              ? `„${focusClient}“ nemá žiadne odtrénované sedenia — je len v platbách. Pravdepodobne preklep v mene platby alebo klient zaplatil vopred a ešte netrénoval. Skontroluj Financie → Cashflow alebo podobné mená v tabuľke (zruš filter ✕ vyššie).`
              : "Žiadni klienti pre tento filter."}
          </Empty>
        )}
      </Card>

      {editC && (
        <Modal title={editC.name} onClose={() => setEdit(null)}>
          {editC.membership && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Predplatné: <strong style={{ color: C.text }}>{editC.membership}</strong>{editC.packageTotal ? ` · zostatok ${editC.packageRemaining}/${editC.packageTotal}` : ""}</div>}
          {duchOdpoved(editC) === "ano" && (
            // Zadné vrátka. Potvrdenie ducha je rozhodnutie, nie rozsudok —
            // ľudia sa vracajú a vtedy sa to musí dať zrušiť jedným klikom,
            // nie hľadaním v dvoch poliach.
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 11px", marginBottom: 12, borderRadius: 8, background: mix(C.red, 8), border: `1px solid ${mix(C.red, 25)}` }}>
              <span style={{ fontSize: 12, color: C.text }}>
                Potvrdený duch ({editC.duch.split("|")[1] || "bez dátumu"}) — vedený ako neaktívny
                {editC.packageRemaining > 0 && <>, neminuté hodiny <b>{editC.packageRemaining}</b> sa berú ako prepadnuté</>}.
              </span>
              <button
                onClick={() => { actions.setOverride(editC.name, "duch", ""); actions.setOverride(editC.name, "status", ""); }}
                style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, color: C.accentLight, fontSize: 12, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Vrátiť späť
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Status (manuálny override vždy vyhráva)</div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Automatický návrh: {editC.statusAuto}</div>
          <Select style={{ width: "100%", marginBottom: 14 }} value={editC.statusOverride ? editC.status : ""} onChange={(v) => actions.setOverride(editC.name, "status", v === "Pauza" && editC.pauseUntil ? `Pauza|${editC.pauseUntil}` : v)} options={[
            { value: "", label: "Automatický" },
            { value: "Aktívny", label: "Aktívny" },
            { value: "Sporadický", label: "Sporadický" },
            { value: "Pauza", label: "Pauza" },
            { value: "Neaktívny", label: "Neaktívny" },
          ]} />
          {editC.status === "Pauza" && (
            <div style={{ marginTop: -6, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Pauza do (nepovinné — po dátume príde pripomienka „ozvi sa")</div>
              <input
                type="date"
                value={editC.pauseUntil || ""}
                onChange={(e) => actions.setOverride(editC.name, "status", e.target.value ? `Pauza|${e.target.value}` : "Pauza")}
                style={{ ...S.input, colorScheme: "dark" }}
              />
              {editC.pauseUntil && <button onClick={() => actions.setOverride(editC.name, "status", "Pauza")} style={{ marginLeft: 8, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zrušiť dátum</button>}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Primárny tréner (override)</div>
          <Select style={{ width: "100%", marginBottom: 14 }} value={editC.primaryTrainerOverride ? editC.primaryTrainer : ""} onChange={(v) => actions.setOverride(editC.name, "primaryTrainer", v)} options={[
            { value: "", label: `Automatický (${editC.primaryTrainer})` },
            { value: "Jerry", label: "Jerry" },
            { value: "Terezka", label: "Terezka" },
          ]} />
          <label style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={editC.specialRate} onChange={(e) => actions.setOverride(editC.name, "specialRate", e.target.checked)} style={{ accentColor: C.accent }} />
            Špeciálna sadzba (investor, rodina, zamestnanec…)
          </label>
          {editC.specialRate && (
            <input style={{ ...S.input, marginBottom: 14 }} placeholder="Dôvod špeciálnej sadzby" defaultValue={editC.specialRateNote} onBlur={(e) => actions.setOverride(editC.name, "specialRateNote", e.target.value)} />
          )}
          {/* Narodeniny. PTminder ich neexportuje, takže sa dopĺňajú tu — a keď
              sú vyplnené, appka pripomenie týždeň, tri dni, deň pred a v deň
              samotný. Rok je voliteľný v tom zmysle, že sa dá zadať aj
              nesprávny, ale keď je správny, pripomienka povie aj vek. */}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Narodeniny</div>
          <input
            type="date"
            defaultValue={editC.narodeniny}
            onChange={(e) => actions.setOverride(editC.name, "narodeniny", e.target.value)}
            style={{ ...S.input, marginBottom: 4, colorScheme: "dark" }}
          />
          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 14, lineHeight: 1.5 }}>
            {editC.narodeniny
              ? "Pripomenie sa týždeň, tri dni a deň pred — a v deň samotný. Každá pripomienka sa dá skryť zvlášť."
              : "Keď doplníš, appka pripomenie narodeniny týždeň dopredu, potom tri dni, deň pred a v deň samotný."}
          </div>
          {/* 6M proces — ručná oprava odvodenia.
              Pravidlo („S viazanostou" + 6 990 Kč = 6M) je správne a zostáva;
              toto je výnimka pre prípad, keď si klient viazanosť kúpil, ale do
              procesu nevstúpil — alebo naopak. Tri stavy zámerne: prázdno
              znamená „nikto sa nevyjadril", nie „nie". Prepínač riadi všetko
              naraz: zoznam 6M, fázy, pripomienku na zmluvu aj hodnotiaci
              rozhovor v 5. mesiaci. */}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>6M proces</div>
          <Select
            value={editC.v6m || ""}
            onChange={(v) => actions.setOverride(editC.name, "v6m", v)}
            options={[
              { value: "", label: `Podľa dát — ${editC.is6m ? "je v 6M" : "nie je v 6M"}` },
              { value: "ano", label: "Je v 6M procese (aj keď to z dát nevyplýva)" },
              { value: "nie", label: "Nie je v 6M procese (aj keď to dáta tvrdia)" },
            ]}
          />
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "6px 0 14px", lineHeight: 1.5 }}>
            {editC.v6m === "nie"
              ? "Ručne mimo 6M — nebude v zozname 6M ani v pripomienkach (zmluva, 5. mesiac)."
              : editC.v6m === "ano"
                ? "Ručne v 6M — appka mu bude počítať fázy aj pripomienky."
                : "Appka to odvodzuje z balíčka a platieb: balíček s viazanosťou a 6 990 Kč mesačne = 6M."}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Odkiaľ sa o nás dozvedel</div>
          <Select
            value={editC.zdroj}
            onChange={(v) => actions.setOverride(editC.name, "zdroj", v)}
            options={ZDROJE}
          />
          {editC.zdroj === "referencia" && (
            <PoleOdporucatela
              meno={editC.name}
              hodnota={editC.zdrojKto}
              mena={clientNames}
              onUloz={(v) => actions.setOverride(editC.name, "zdrojKto", v)}
            />
          )}
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "6px 0 14px", lineHeight: 1.5 }}>
            Bez mena odporúčateľa sa nedá odovzdať odmena za doporučenie (10 % z ďalšieho balíčka alebo tréning zadarmo).
          </div>
          {/* Dve vrstvy poznámok: stála = fakty, ktoré platia (kto platí, na čo
              pozor) a prepisuje sa; denník = udalosti v čase, pridáva sa a
              nemaže. Pri prepise stálej poznámky server odloží starú verziu do
              denníka — nič sa nestráca ani tu. */}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Stála poznámka (fakty — prepisuje sa, stará verzia sa odloží do denníka)</div>
          <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", marginBottom: 14 }} defaultValue={editC.trainerNote} onBlur={(e) => actions.setOverride(editC.name, "trainerNote", e.target.value)} />
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>Denník — príbeh klienta v čase (pridáva sa, nemaže)</div>
          <div style={{ marginBottom: 14 }}>
            <Dennik meno={editC.name} limit={4} onNovyZapis={onDennikZapis} />
          </div>
          <button onClick={() => setEdit(null)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, width: "100%" }}>Hotovo</button>
        </Modal>
      )}
      </>
      )}
    </>
  );
}
