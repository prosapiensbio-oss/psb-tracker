import { useState } from "react";

import { fetchVzasSettings, saveLead, saveVzasSetting } from "../../lib/psb/client";
import type { Ritual } from "../../lib/psb/rituals";
import { Dennik } from "./Dennik";
import { SOURCES } from "./Klienti";
import { C, mix } from "../../lib/psb/theme";
import { Modal } from "./ui";

// „+ Zápis" — jedno tlačidlo na všetko, čo sa do appky píše ručne.
//
// Appka vie sama len to, čo stiahne z PTmindera. Všetko ostatné — aký bol
// týždeň, čo sa stalo v mesiaci, odkiaľ prišiel dopyt, čo si o klientovi
// myslíme — musí niekto napísať. A to sa dialo tak, že si človek musel
// pamätať, na ktorej z piatich obrazoviek to políčko je.
//
// Preto jedno miesto, ktoré je vidieť vždy, a ktoré popri odkaze rovno hovorí,
// čo za toto obdobie ešte chýba. Nie je to formulár — je to rozcestník, ktorý
// človeka dovedie tam, kde sa to naozaj píše, nech je jeden zápis na jednom
// mieste a nie na dvoch.

type Polozka = { nadpis: string; popis: string; tab: string; sub?: string; stav?: "chyba" | "hotove" };

export function ZapisButton({
  ritualy,
  onNavigate,
  onRefresh,
  klienti = [],
  onDennikZapis,
}: {
  ritualy: Ritual[];
  onNavigate: (tab: string, sub?: string) => void;
  /** Mená + stále poznámky — stála poznámka sa pri vybranom klientovi ukáže
   *  ako kontext, zápis ide do denníka. */
  klienti?: { meno: string; poznamka: string }[];
  /** Po uložení dopytu sa musia dotiahnuť dáta — inak ho hľadanie a lievik
   *  neuvidia až do ďalšieho otvorenia appky. */
  onRefresh?: () => void;
  /** Zápis do denníka spracuje Jarvis na pozadí — pripomienky bez chatu. */
  onDennikZapis?: (meno: string, text: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [dopytMeno, setDopytMeno] = useState("");
  const [dopytZdroj, setDopytZdroj] = useState("reklama");
  /** Kedy sa človek OZVAL, nie kedy si to zapísal — z toho počíta lievik. */
  const [dopytDatum, setDopytDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [dopytBusy, setDopytBusy] = useState(false);
  const [dopytOk, setDopytOk] = useState("");
  const [poznMeno, setPoznMeno] = useState("");
  // Kampaň / akcia — vlajka do marketingových grafov. Pomenované po ľudsky:
  // „značka" nehovorí nič o tom, aký typ informácie sa čaká.
  const [akciaText, setAkciaText] = useState("");
  const [akciaDatum, setAkciaDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [akciaBusy, setAkciaBusy] = useState(false);
  const [akciaOk, setAkciaOk] = useState("");
  const [akciaOtvorena, setAkciaOtvorena] = useState(false);
  const ulozAkciu = () => {
    const t = akciaText.trim();
    if (!t || akciaBusy) return;
    setAkciaBusy(true);
    void fetchVzasSettings().then((st) => {
      const zoz = Array.isArray(st["mkt_znacky"]) ? (st["mkt_znacky"] as Record<string, unknown>[]) : [];
      zoz.push({ id: `z${Date.now().toString(36)}`, datum: akciaDatum, text: t });
      return saveVzasSetting("mkt_znacky", zoz);
    }).then(() => {
      setAkciaText("");
      setAkciaOk(t);
      setTimeout(() => setAkciaOk(""), 4000);
    }).finally(() => setAkciaBusy(false));
  };
  // Platné meno = existujúci klient. Voľný text sa neukladá — zápis bez
  // klienta nemá kam patriť a preklep by ho stratil.
  const vybranyKlient = klienti.find((k) => k.meno === poznMeno);
  const cakajuce = ritualy.filter((r) => r.splatne).length;

  const polozky: Polozka[] = [
    ...ritualy.map((r) => ({
      nadpis: r.nadpis,
      popis: r.detail,
      tab: r.ciel.tab,
      sub: r.ciel.sub,
      stav: r.hotove ? ("hotove" as const) : r.splatne ? ("chyba" as const) : undefined,
    })),
    // Dopyty sa medzitým presťahovali z Marketingu do Klientov — rozcestník
    // ukazoval na starú adresu.
    { nadpis: "Záver z debaty", popis: "Napíš Jarvisovi — záver si zapíše sám a objaví sa v registri.", tab: "dashboard" },
  ];

  const chod = (p: Polozka) => {
    onNavigate(p.tab, p.sub);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Kam sa čo zapisuje — a čo za toto obdobie ešte chýba"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          border: `1px solid ${cakajuce ? mix(C.accent, 55) : C.border}`,
          background: cakajuce ? mix(C.accent, 12) : "transparent",
          color: cakajuce ? C.accentLight : C.textMuted,
        }}
      >
        + Zápis
        {cakajuce > 0 && (
          <span style={{ background: C.accent, color: C.onAccent, borderRadius: 9, fontSize: 10.5, fontWeight: 700, padding: "1px 6px" }}>
            {cakajuce}
          </span>
        )}
      </button>

      {open && (
        <Modal title="Čo chceš zapísať" onClose={() => setOpen(false)}>
          {/* Najčastejší zápis rovno tu, bez navigácie. Dopyt je meno + zdroj
              + DÁTUM; všetko ostatné sa dá doplniť neskôr v Dopytoch.
              Rozcestník nižšie zostáva pre zápisy, ktoré potrebujú vlastnú
              obrazovku.

              Dátum tu pribudol 11. 8. (Jerry: „ak je dátum dôležitý, musí byť
              aj v + Zápis"). Predtým sa bral dnešok natvrdo — na zdroj klienta
              to nemá vplyv, ale lievik z toho počíta „Ø dní do úvodného" a
              kohorty dopytov. Kto si dopyty odklikal naraz na konci mesiaca,
              dostal všetky s jedným dátumom a obe čísla boli nezmysel.
              Predvyplnený je dnešok, takže bežný priebežný zápis je rovnako
              rýchly ako predtým. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const m = dopytMeno.trim();
              if (!m || dopytBusy) return;
              setDopytBusy(true);
              void saveLead({ date: dopytDatum || new Date().toISOString().slice(0, 10), name: m, source: dopytZdroj as never, status: "novy", referrer: "", note: "" })
                // Dátum sa po uložení ZÁMERNE nevracia na dnešok: kto dopisuje
                // viac dopytov z jedného dňa, nastaví ho raz. Meno sa maže,
                // dátum a zdroj zostávajú — to je poradie, v akom sa to píše.
                .then(() => { setDopytMeno(""); setDopytOk(`${m} · ${dopytDatum.split("-").reverse().map(Number).join(".")}.`); onRefresh?.(); setTimeout(() => setDopytOk(""), 4000); })
                .finally(() => setDopytBusy(false));
            }}
            style={{ marginBottom: 14, padding: "11px 13px", borderRadius: 10, border: `1px solid ${mix(C.accent, 30)}`, background: mix(C.accent, 5) }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nový dopyt — kto sa ozval</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input
                value={dopytMeno} onChange={(e) => setDopytMeno(e.target.value)} placeholder="Meno"
                style={{ flex: "2 1 140px", minWidth: 0, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
              />
              <input
                type="date"
                value={dopytDatum}
                onChange={(e) => setDopytDatum(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                title="Kedy sa ozval — nie kedy to zapisuješ. Z toho sa počíta lievik."
                style={{ flex: "0 1 132px", minWidth: 0, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, colorScheme: "dark" }}
              />
              <select
                value={dopytZdroj} onChange={(e) => setDopytZdroj(e.target.value)}
                style={{ flex: "1 1 120px", minWidth: 0, padding: "7px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5 }}
              >
                {SOURCES.map((z) => <option key={z.value} value={z.value} style={{ background: C.card }}>{z.label}</option>)}
              </select>
              <button type="submit" disabled={dopytBusy || !dopytMeno.trim()}
                style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight, cursor: dopytBusy || !dopytMeno.trim() ? "default" : "pointer", opacity: dopytBusy || !dopytMeno.trim() ? 0.45 : 1 }}>
                Zapísať
              </button>
            </div>
            {dopytOk && <div style={{ fontSize: 11.5, color: C.green, marginTop: 6 }}>Zapísané: {dopytOk}. Detail doplníš v Klienti → Dopyty.</div>}
          </form>

          {/* Denník klienta — rovnaký princíp ako dopyt: meno + text, bez
              navigácie. Zápisy sa PRIDÁVAJÚ a nikdy nemažú — poznámky v čase
              nie sú smetisko, sú príbeh klienta (Jerryho formulácia, a je
              správna: „marec: rameno prestalo bolieť" sa nedá zrekonštruovať
              z ničoho iného). Stála poznámka na fakty žije na karte klienta. */}
          {klienti.length > 0 && (
            <div style={{ marginBottom: 14, padding: "11px 13px", borderRadius: 10, border: `1px solid ${mix(C.accent, 30)}`, background: mix(C.accent, 5) }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>Denník klienta — čo sa stalo</div>
              <input
                value={poznMeno} list="zapis-klienti" placeholder="Klient — začni písať"
                onChange={(e) => setPoznMeno(e.target.value)}
                style={{ width: "100%", marginBottom: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${vybranyKlient ? mix(C.green, 50) : C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
              />
              <datalist id="zapis-klienti">
                {klienti.map((k) => <option key={k.meno} value={k.meno} />)}
              </datalist>
              {vybranyKlient ? (
                <>
                  {vybranyKlient.poznamka && (
                    <div style={{ fontSize: 11.5, color: C.textDim, margin: "2px 0 8px", lineHeight: 1.5 }}>
                      Stála poznámka: <span style={{ color: C.textMuted }}>{vybranyKlient.poznamka}</span>
                    </div>
                  )}
                  <Dennik meno={vybranyKlient.meno} limit={3} onNovyZapis={onDennikZapis} />
                </>
              ) : (
                <div style={{ fontSize: 11.5, color: C.textDim }}>Vyber klienta zo zoznamu — potom sa ukáže jeho denník.</div>
              )}
            </div>
          )}

          {/* Kampaň / akcia — za rozklikom (Jerry, 9. 8.): otvorené majú byť
              len dva najčastejšie zápisy, dopyt a denník. Kampaň sa píše
              párkrát do mesiaca — zbalená hlavička úplne stačí a panel je
              o obrazovku kratší.
              A od 11. 8. stojí AŽ POD denníkom: poradie v paneli má kopírovať
              to, ako často sa jednotlivé zápisy píšu, nie ako vznikali. */}
          <div style={{ marginBottom: 14, borderRadius: 10, border: `1px solid ${mix(C.orange, 28)}`, background: mix(C.orange, 5) }}>
            <button
              onClick={() => setAkciaOtvorena((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 13px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, flex: 1 }}>⚑ Kampaň / akcia v marketingu</span>
              <span style={{ color: C.textDim, fontSize: 12 }}>{akciaOtvorena ? "▾" : "▸"}</span>
            </button>
            {akciaOtvorena && (
              <div style={{ padding: "0 13px 11px" }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, lineHeight: 1.5 }}>
                  Jednou vetou, čo sa práve spustilo, vypnulo alebo zmenilo — reklama, nový formát obsahu, pauza,
                  kolaborácia. Ukáže sa ako vlajka v grafe Marketing → Čo som robil, aby o pol roka bolo vidieť,
                  prečo čísla vyzerali tak, ako vyzerali.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input type="date" value={akciaDatum} onChange={(e) => setAkciaDatum(e.target.value)}
                    style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5 }} />
                  <input
                    value={akciaText} onChange={(e) => setAkciaText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ulozAkciu(); } }}
                    placeholder="napr. spustená Meta kampaň na reel o kolene"
                    style={{ flex: "2 1 200px", minWidth: 0, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                  <button onClick={ulozAkciu} disabled={!akciaText.trim() || akciaBusy}
                    style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${akciaText.trim() ? C.orange : C.border}`, background: akciaText.trim() ? mix(C.orange, 14) : "transparent", color: akciaText.trim() ? C.orange : C.textDim, fontSize: 12.5, fontWeight: 600, cursor: akciaText.trim() ? "pointer" : "default" }}>
                    {akciaBusy ? "Ukladám…" : "Uložiť"}
                  </button>
                </div>
              </div>
            )}
            {akciaOk && <div style={{ fontSize: 11.5, color: C.green, padding: "0 13px 9px" }}>⚑ Zapísané: {akciaOk}</div>}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {polozky.map((p) => (
              <button
                key={p.nadpis}
                onClick={() => chod(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer",
                  padding: "11px 13px", borderRadius: 10, width: "100%",
                  border: `1px solid ${p.stav === "chyba" ? mix(C.accent, 45) : C.border}`,
                  background: p.stav === "chyba" ? mix(C.accent, 8) : "transparent",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.text }}>{p.nadpis}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.textDim, marginTop: 2, lineHeight: 1.45 }}>{p.popis}</span>
                </span>
                {p.stav === "hotove" && <span style={{ fontSize: 11, color: C.green, flexShrink: 0 }}>hotové</span>}
                {p.stav === "chyba" && <span style={{ fontSize: 11, color: C.accentLight, flexShrink: 0 }}>teraz</span>}
                <span style={{ color: C.textDim, flexShrink: 0 }}>→</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>
            Zapisuje sa tam, kde to patrí — toto je len rozcestník, aby si nemusel pamätať kde.
            Týždeň sa píše cez víkend, mesiac na prvý víkend nasledujúceho mesiaca.
          </div>
        </Modal>
      )}
    </>
  );
}
