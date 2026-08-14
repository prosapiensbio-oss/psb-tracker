import { useMemo, useRef, useState } from "react";

import { saveLead } from "../../lib/psb/client";
import { maTermin, najdiKlienta, type ClientAgg } from "../../lib/psb/compute";
import { fmtDMY, normName } from "../../lib/psb/format";
import { C, mix, S } from "../../lib/psb/theme";
import type { Lead } from "../../lib/psb/types";
import { Card, Empty, H3, Info, Modal, RolovaciaTabulka, Select, StatCard, TableWrap } from "./ui";
import { SOURCES, STATUSES, statusColor } from "./Klienti";

/**
 * Dopyty — kto sa ozval a čo sa s ním stalo.
 *
 * Presunuté 12. 8. 2026 z Klientov do Marketingu na Jerryho žiadosť: „prečo sú
 * dopyty v Klienti → Klienti, keď to súvisí s marketingom?" Má pravdu —
 * dopyt je vstup lievika, nie klient. Klientom sa stane až tým, že príde.
 *
 * Obrazovka je PRACOVNÁ, nie vyhodnocovacia: vedie sa tu jednotlivý človek
 * (stav, kedy sme sa ozvali, prečo z toho nič nebolo). Súhrny nad tými istými
 * dátami sú vedľa v „Odkiaľ prišli klienti".
 */

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

/**
 * Pole na dôvod straty — s vlastným stavom a viditeľným potvrdením.
 *
 * Predtým to bol `defaultValue` bez stavu. Každé uloženie kdekoľvek v tabuľke
 * spustí `refresh()`, ten prekreslí celý zoznam, a rozpísaný text v inom
 * riadku sa pri tom stratil — bez hlásky, bez stopy. Jerry vyplnil niekoľko
 * dôvodov a v databáze skončil jediný.
 *
 * Preto: hodnota žije v stave, Enter aj odklik ju uložia a na sekundu sa
 * ukáže „uložené". Zápis, o ktorom sa nedá povedať, či prešiel, je horší než
 * žiadny.
 */
function DovodPole({ l, onSave }: { l: Lead; onSave: (v: string) => Promise<void> | void }) {
  const [text, setText] = useState(l.dovod || "");
  const [ok, setOk] = useState(false);
  const uloz = () => {
    const v = text.trim();
    if (v === (l.dovod || "").trim()) return;
    void Promise.resolve(onSave(v)).then(() => { setOk(true); setTimeout(() => setOk(false), 1800); });
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <input
        list={DOVODY_ID} value={text} placeholder="dôvod…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); uloz(); } }}
        onBlur={uloz}
        style={{ ...S.select, width: "100%", minWidth: 0 }}
      />
      {ok && <span style={{ fontSize: 11, color: C.green, whiteSpace: "nowrap" }}>uložené</span>}
    </span>
  );
}

export function Dopyty({ leads, clients, refresh }: { leads: Lead[]; clients: Record<string, ClientAgg>; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [upravCas, setUpravCas] = useState<string | null>(null);
  const [lenCakajuci, setLenCakajuci] = useState(false);
  /**
   * Len nevyriešené — dopyty, pri ktorých sa ešte dá niečo zapísať.
   *
   * V zozname je 37 riadkov a väčšina z nich je hotová vec: človek sa stal
   * klientom. Otázka „prečo z toho nič nebolo" sa týka hŕstky, ktorá sa
   * v tabuľke stráca. Bez filtra znamená doplnenie dôvodov preklikať celý
   * zoznam a pri každom riadku si pamätať, či ten človek náhodou netrénuje.
   */
  const [lenNevyriesene, setLenNevyriesene] = useState(false);

  const clientNames = useMemo(
    () => Object.values(clients).map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [clients],
  );
  // A referred person who already shows up as a client = the referral worked.
  // najdiKlienta (presne, potom fuzzy) — dopyt písaný z hlavy nesmie stratiť
  // konverziu na diakritike či preklepe. Rovnaká rodina chýb ako Prochádzka.
  const menaKlientovAll = useMemo(() => Object.keys(clients), [clients]);
  const converted = (l: Lead) => !!(l.name && najdiKlienta(menaKlientovAll, l.name));

  // Najnovšie hore a v karte vidno tri. Zoznam rástol zdola a najčerstvejší
  // dopyt — jediný, s ktorým sa reálne pracuje — končil mimo obrazovky.
  const zoradene = useMemo(() => {
    const zaklad = lenCakajuci
      ? leads.filter((l) => meraSa(l) && !l.odpovedaneAt && l.status === "novy")
      : lenNevyriesene
        // Nevyriešený = nestal sa klientom a dôvod nie je zapísaný. Stav sa
        // zámerne nekontroluje: väčšina má „nový", lebo ich nikto neposunul —
        // a práve tie treba prejsť.
        // Kto má dohodnutý termín, nie je nevyriešený — je rozbehnutý.
        ? leads.filter((l) => !converted(l) && !String(l.dovod || "").trim() && !maTermin(l.name || ""))
        : leads;
    // Pri dvoch dopytoch z toho istého dňa rozhoduje, kedy naozaj prišli.
    return [...zaklad].sort((a, b) =>
      b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [leads, lenCakajuci, lenNevyriesene, menaKlientovAll]);
  const [uzOzvane, setUzOzvane] = useState(false);
  const zoznamRef = useRef<HTMLDivElement>(null);
  const [rychleMeno, setRychleMeno] = useState("");
  const [rychlyZdroj, setRychlyZdroj] = useState("reklama");
  const [draft, setDraft] = useState<Partial<Lead>>({});


  /**
   * Posledná zmena a spôsob, ako ju vrátiť.
   *
   * Jerry, 14. 8.: „ak by som hocikde pri zápise urobil chybu, nemám žiadnu
   * možnosť Cmd+Z." V tabuľke sa píše priamo do riadkov a jedno tlačidlo ✕
   * zmaže dopyt bez opýtania — undo tu chýbalo najviac.
   *
   * Drží sa CELÝ pôvodný riadok, nie len zmenené pole: vrátenie je potom
   * obyčajný zápis toho, čo tam bolo, a funguje rovnako pri úprave aj pri
   * zmazaní (uloženie podľa `id` zmazaný riadok obnoví).
   */
  const [vratit, setVratit] = useState<{ predtym: Lead; co: string } | null>(null);

  const save = async (
    l: Partial<Lead> & { id?: string; remove?: boolean },
    /** Čo sa zmenilo — do hlášky. Bez toho by tam stálo len „uložené". */
    co?: string,
  ) => {
    setBusy(true);
    const predtym = l.id ? leads.find((x) => x.id === l.id) : undefined;
    await saveLead(l);
    await refresh();
    setBusy(false);
    if (predtym && co) setVratit({ predtym, co });
  };

  const vratSpat = async () => {
    if (!vratit) return;
    setVratit(null);
    setBusy(true);
    await saveLead(vratit.predtym);
    await refresh();
    setBusy(false);
  };
  const openAdd = () => {
    setDraft({ date: new Date().toISOString().slice(0, 10), source: "instagram", status: "novy", name: "", referrer: "", note: "" });
    setAdding(true);
  };
  const submitAdd = async () => {
    setAdding(false);
    // Medzera na začiatku mena vyrobila 4. 8. dvojicu „Pavel Blecha" a
    // „ Pavel Blecha" — dva riadky, ktoré appka považovala za dvoch ľudí.
    await save({ ...draft, name: String(draft.name ?? "").trim() });
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
      {/* Pás na vrátenie. Drží sa dole nad okrajom obrazovky, aby bol vidieť
          aj vtedy, keď je zoznam odrolovaný — chyba sa najčastejšie zbadá
          hneď po nej, nie po návrate na vrch stránky. */}
      {vratit && (
        <div style={{
          position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 60,
          display: "flex", alignItems: "center", gap: 12, maxWidth: "92vw",
          padding: "10px 14px", borderRadius: 10,
          background: C.card, border: `1px solid ${mix(C.accent, 40)}`,
          boxShadow: "0 8px 28px rgba(0,0,0,.35)",
        }}>
          <span style={{ fontSize: 12.5, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Zmenené: {vratit.co}
          </span>
          <button onClick={() => void vratSpat()} disabled={busy}
            style={{
              fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 7, whiteSpace: "nowrap",
              border: `1px solid ${C.accent}`, background: mix(C.accent, 12), color: C.accentLight,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1, fontFamily: "inherit",
            }}>
            Vrátiť späť
          </button>
          <button onClick={() => setVratit(null)} title="Zavrieť"
            style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

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
          {!lenCakajuci && (() => {
            const kolko = leads.filter((l) => !converted(l) && !String(l.dovod || "").trim() && !maTermin(l.name || "")).length;
            if (!kolko && !lenNevyriesene) return null;
            return (
              <button onClick={() => setLenNevyriesene((v) => !v)}
                title="Dopyty, z ktorých sa nestal klient a nikto nezapísal prečo"
                style={{
                  fontSize: 11.5, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${lenNevyriesene ? C.accent : C.border}`,
                  background: lenNevyriesene ? mix(C.accent, 12) : "transparent",
                  color: lenNevyriesene ? C.accentLight : C.textMuted, fontFamily: "inherit",
                }}>
                len nevyriešené ({kolko}){lenNevyriesene ? " ✕" : ""}
              </button>
            );
          })()}
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
          <RolovaciaTabulka pocet={3}>
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
              {zoradene.map((l) => (
                <tr key={l.id}>
                  <td style={S.td}>
                    <input type="date" defaultValue={l.date} onBlur={(e) => e.target.value !== l.date && save({ ...l, date: e.target.value }, `dátum ${l.name || "dopytu"}`)}
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
                      <DovodPole l={l} onSave={(v) => save({ ...l, dovod: v }, `dôvod pri ${l.name || "dopyte"}`)} />
                    ) : converted(l) ? (
                      <span title="Tento človek sa stal klientom — nie je čo vysvetľovať."
                        style={{ color: C.green, fontSize: 11.5 }}>klient</span>
                    ) : maTermin(l.name || "") ? (
                      <span title="V kalendári má dohodnutý termín — ešte sa nič nestratilo."
                        style={{ color: C.accentLight, fontSize: 11.5 }}>má termín</span>
                    ) : (
                      /* Dva kroky namiesto jedného: doteraz sa musel najprv
                         prepnúť Stav a až potom sa objavilo pole. Pri dopyte,
                         z ktorého nikdy nič nebolo, sú obe informácie tá istá
                         veta — tak ju appka zapíše naraz. */
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ color: C.textDim, fontSize: 11.5 }}>nebolo z toho nič?</span>
                        <button onClick={() => void save({ ...l, status: "neodpisal", dovod: "" }, `stav ${l.name || "dopytu"}`)}
                          title="Označí dopyt za stratený a otvorí pole na dôvod"
                          style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                            border: `1px solid ${mix(C.accent, 40)}`, background: mix(C.accent, 8),
                            color: C.accentLight, fontFamily: "inherit", whiteSpace: "nowrap",
                          }}>
                          zapísať prečo
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={S.td}>
                    <input defaultValue={l.note} placeholder="poznámka" onBlur={(e) => e.target.value !== l.note && save({ ...l, note: e.target.value })} style={inputStyle} />
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <button onClick={() => save({ id: l.id, remove: true }, `zmazanie ${l.name || "dopytu"}`)} title="Zmazať"
                      style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </RolovaciaTabulka>
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

