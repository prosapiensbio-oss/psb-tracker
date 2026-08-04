import { useState } from "react";

import { saveLead } from "../../lib/psb/client";
import type { Ritual } from "../../lib/psb/rituals";
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
  onPoznamka,
}: {
  ritualy: Ritual[];
  onNavigate: (tab: string, sub?: string) => void;
  /** Mená + existujúce poznámky — nech quick-zápis needitovanú poznámku
   *  neprepíše naslepo, ale ukáže ju a nechá doplniť. */
  klienti?: { meno: string; poznamka: string }[];
  onPoznamka?: (meno: string, poznamka: string) => void;
  /** Po uložení dopytu sa musia dotiahnuť dáta — inak ho hľadanie a lievik
   *  neuvidia až do ďalšieho otvorenia appky. */
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dopytMeno, setDopytMeno] = useState("");
  const [dopytZdroj, setDopytZdroj] = useState("reklama");
  const [dopytBusy, setDopytBusy] = useState(false);
  const [dopytOk, setDopytOk] = useState("");
  const [poznMeno, setPoznMeno] = useState("");
  const [poznText, setPoznText] = useState("");
  const [poznOk, setPoznOk] = useState("");
  // Platné meno = existujúci klient. Voľný text sa neukladá — poznámka bez
  // klienta nemá kam patriť a preklep by ju stratil.
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
          {/* Najčastejší zápis rovno tu, bez navigácie. Dopyt je meno + zdroj;
              všetko ostatné sa dá doplniť neskôr v Dopytoch. Rozcestník nižšie
              zostáva pre zápisy, ktoré potrebujú vlastnú obrazovku. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const m = dopytMeno.trim();
              if (!m || dopytBusy) return;
              setDopytBusy(true);
              void saveLead({ date: new Date().toISOString().slice(0, 10), name: m, source: dopytZdroj as never, status: "novy", referrer: "", note: "" })
                .then(() => { setDopytMeno(""); setDopytOk(m); onRefresh?.(); setTimeout(() => setDopytOk(""), 4000); })
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

          {/* Poznámka ku klientovi — rovnaký princíp ako dopyt: meno + text,
              bez navigácie. Pri vybranom klientovi sa načíta existujúca
              poznámka a edituje sa celá — slepé prepísanie by zahodilo, čo tam
              už je, a tiché pridávanie na koniec by z poznámky spravilo smetisko. */}
          {onPoznamka && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!vybranyKlient) return;
                onPoznamka(vybranyKlient.meno, poznText.trim());
                setPoznOk(vybranyKlient.meno);
                setPoznMeno(""); setPoznText("");
                setTimeout(() => setPoznOk(""), 4000);
              }}
              style={{ marginBottom: 14, padding: "11px 13px", borderRadius: 10, border: `1px solid ${mix(C.accent, 30)}`, background: mix(C.accent, 5) }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>Poznámka ku klientovi</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input
                  value={poznMeno} list="zapis-klienti" placeholder="Klient — začni písať"
                  onChange={(e) => {
                    setPoznMeno(e.target.value);
                    const k = klienti.find((x) => x.meno === e.target.value);
                    if (k) setPoznText(k.poznamka);
                  }}
                  style={{ flex: "2 1 160px", minWidth: 0, padding: "7px 10px", borderRadius: 8, border: `1px solid ${vybranyKlient ? mix(C.green, 50) : C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                />
                <datalist id="zapis-klienti">
                  {klienti.map((k) => <option key={k.meno} value={k.meno} />)}
                </datalist>
                <button type="submit" disabled={!vybranyKlient}
                  style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight, cursor: vybranyKlient ? "pointer" : "default", opacity: vybranyKlient ? 1 : 0.45 }}>
                  Uložiť
                </button>
              </div>
              <textarea
                value={poznText} onChange={(e) => setPoznText(e.target.value)}
                placeholder={vybranyKlient ? "Poznámka (ukladá sa celá — čo zmažeš, zmizne)" : "Najprv vyber klienta zo zoznamu"}
                disabled={!vybranyKlient}
                style={{ width: "100%", marginTop: 6, minHeight: 54, resize: "vertical", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, opacity: vybranyKlient ? 1 : 0.55 }}
              />
              {poznOk && <div style={{ fontSize: 11.5, color: C.green, marginTop: 4 }}>Uložené ku klientovi {poznOk}.</div>}
            </form>
          )}
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
