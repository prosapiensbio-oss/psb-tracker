import { useState } from "react";

// Kánon je spoločný originál pre Kokpit aj Project — vťahuje sa zo súboru
// v docs, nie z kópie v kóde. Dve verzie pravidiel by znamenali, že jedna
// časom klame.
import kanonRaw from "../../../../docs/kanon-psb.md?raw";
import { C, mix } from "../../lib/psb/theme";
import type { AssistantChat } from "./Assistant";
import { Card, H3, Info } from "./ui";

/**
 * Odovzdávacie miesto medzi Jarvisom a Claude Projectom.
 *
 * PREČO TO NIE JE ĎALŠIE OKNO
 *
 * Jerry navrhol samostatné okno na „interaktívnu prácu s marketingom". Jarvis
 * ale interaktívne okno UŽ JE a druhý chat vedľa neho by len rozdelil
 * pozornosť — a hlavne by nemal jeho dáta. Čo naozaj chýbalo, je jeden jasný
 * krok medzi „Jarvis pozná čísla" a „Project píše texty".
 *
 * PREČO SA ZADANIE PÝTA, A NEGENERUJE SAMO
 *
 * Dobré zadanie potrebuje vedieť, na čo sa práve mieri — iné pre septembrový
 * test reklamy, iné pre mailing 335 ľuďom v skupine Fascie. Automaticky
 * vyrobené zadanie by bolo priemerné vždy. Tlačidlo teda otvorí Jarvisa
 * s otázkou, nie s hotovou odpoveďou.
 */

/** Claude Project, ktorý z Jarvisovho zadania vyrába captiony a scenáre. */
export const CLAUDE_PROJECT = "https://claude.ai/cowork/project/019cce4d-b3a1-7147-bbbb-15dbb2aa0008";

/**
 * Kánon sa NEPÍŠE druhýkrát.
 *
 * `docs/kanon-psb.md` je spoločný originál pre Kokpit aj Project. Keby sa
 * jeho text prepísal sem do komponentu, vznikli by dve verzie pravidiel
 * a jedna by časom klamala. Preto sa vťahuje priamo zo súboru — kto ho
 * upraví, upraví aj to, čo appka ponúka na skopírovanie.
 */
const KANON = kanonRaw;

/**
 * Tri vety do Project instructions.
 *
 * Sú po česky zámerne — Project píše po česky a inštrukcia v jazyku výstupu
 * má väčšiu váhu než preložená. Doslova to isté je v `docs/tvar-zadania.md`;
 * keď sa mení jedno, musí sa zmeniť aj druhé.
 */
const INSTRUKCIE = [
  "Řiď se souborem kanon-psb.md v knowledge. Je nadřazený všemu ostatnímu.",
  "Všechny texty pro klienty piš česky.",
  "Zadání chodí v pevném tvaru: TÉMA, PREČO PRÁVE TOTO, ČÍSLA, PUBLIKUM A SYMPTÓM, FORMÁT A DĹŽKA, JAZYK, ČO NESMIE ZAZNIEŤ, HOTOVÉ VETY, ČO CHCEM SPÄŤ. Odpověz jen na to, co je v poli ČO CHCEM SPÄŤ.",
].join("\n\n");

export function Zadanie({ chat, nastaveneAt, onNastavene }: {
  chat?: AssistantChat;
  /** Kedy si Project nastavil. `null` = ešte nikdy. */
  nastaveneAt?: string | null;
  onNastavene?: (hotovo: boolean) => void;
}) {
  const [kopirovane, setKopirovane] = useState("");
  /**
   * Keď prehliadač kopírovanie nepustí, text sa ukáže na označenie.
   *
   * Schránka je jediné miesto v appke, kde akcia závisí od povolenia, ktoré
   * appka nevie vynútiť — v niektorých prehliadačoch a pri otvorenom paneli
   * `writeText` odmietne alebo visí. Tlačidlo, po ktorom sa nič nestane,
   * je to isté ako tichý zápis: človek si myslí, že má text, a nemá ho.
   */
  const [naOznacenie, setNaOznacenie] = useState<{ co: string; text: string } | null>(null);
  const kopiruj = async (t: string, co: string) => {
    try {
      // Tretí stav, ktorý sa nedá prehliadnuť: schránka NEODPOVIE. Keď je
      // otvorený panel alebo prehliadač čaká na povolenie, `writeText` sa
      // ani nesplní, ani neodmietne — 19. 8. 2026 to takto viselo a tlačidlo
      // vyzeralo, akoby nerobilo nič. Preto strop: po sekunde a pol sa text
      // ukáže na označenie, nech človek nezostane s prázdnou schránkou.
      await Promise.race([
        navigator.clipboard.writeText(t),
        new Promise((_, zle) => setTimeout(() => zle(new Error("schránka neodpovedala")), 1500)),
      ]);
      setKopirovane(co); setNaOznacenie(null);
      setTimeout(() => setKopirovane(""), 2500);
    } catch {
      setNaOznacenie({ co, text: t });
    }
  };
  const pytaj = () => {
    if (!chat) return;
    chat.setFloatingOpen(true);
    void chat.ask([
      "Vyrob mi ZADANIE PRE CLAUDE PROJECT na najbližší obsah.",
      "",
      "Najprv sa ma spýtaj na jednu vec, ak ti nie je jasná z dát: na čo práve mierime —",
      "septembrový test reklamy, mailing existujúcim odberateľom, alebo organický obsah?",
      "Ak to z dát jasné je, nepýtaj sa a rovno pokračuj.",
      "",
      "Potom postupuj podľa svojich pravidiel pre plánovací režim: najprv čísla, potom kniha.",
      "Zadanie musí stáť samo o sebe — Project nevidí dáta Kokpitu ani tento rozhovor,",
      "takže všetky čísla a mená v ňom musia byť vypísané, nie odkázané.",
      "",
      "Skontroluj ho proti FP pravidlám a proti indexu brand-konfliktov skôr, než mi ho dáš.",
    ].join("\n"), "Vyrob mi zadanie pre Claude Project na najbližší obsah.");
  };

  const tlacidlo: React.CSSProperties = {
    padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent",
    color: C.textMuted, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
  const krok: React.CSSProperties = { fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginTop: 10 };

  return (
    <Card>
      <H3>
        <Info
          label="Zadanie pre Claude Project"
          text="Deľba práce, na ktorej sme sa dohodli: Jarvis rozhoduje ČO a PREČO — má čísla, kapacitný strop, FP pravidlá aj index brand-konfliktov. Claude Project rieši AKO to znie — má štýl, formáty a vizuálnu identitu. Zadanie je to, čo medzi nimi prechádza; musí stáť samo o sebe, lebo Project nevidí dáta Kokpitu."
        />
      </H3>

      {/* ── Nastavenie: raz a je pokoj ─────────────────────────────────────
          Bez kánonu v znalostiach Project nevie ani to, že všetko ku klientovi
          je po česky — a to je pravidlo, na ktoré sa zabúda najčastejšie.
          Preto stojí nastavenie NAD každodennými tlačidlami, kým hotové nie je. */}
      {nastaveneAt ? (
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span>Project nastavený {new Date(nastaveneAt).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" })}.</span>
          {onNastavene && (
            <button onClick={() => onNastavene(false)}
              style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
              nastaviť znova
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: mix(C.accent, 6), border: `1px solid ${mix(C.accent, 22)}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Najprv raz nastav Project</div>
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3, lineHeight: 1.55 }}>
            Bez toho Project nevie, kto je PSB, a hlavne nevie, že všetko ku klientovi je po česky.
            Trvá to dve minúty a potom je pokoj.
          </div>

          <div style={krok}>
            <b style={{ color: C.text }}>1.</b> Skopíruj kánon a vlož ho v Projecte do <b style={{ color: C.text }}>Project knowledge</b>.
            <div style={{ marginTop: 6 }}>
              <button onClick={() => void kopiruj(KANON, "kanon")} style={tlacidlo}>
                {kopirovane === "kanon" ? `skopírované (${Math.round(KANON.length / 1000)} tis. znakov)` : "kopírovať kánon"}
              </button>
            </div>
          </div>

          <div style={krok}>
            <b style={{ color: C.text }}>2.</b> Skopíruj tri vety a vlož ich do <b style={{ color: C.text }}>Project instructions</b>.
            <div style={{ marginTop: 6 }}>
              <button onClick={() => void kopiruj(INSTRUKCIE, "instrukcie")} style={tlacidlo}>
                {kopirovane === "instrukcie" ? "skopírované" : "kopírovať inštrukcie"}
              </button>
            </div>
          </div>

          {naOznacenie && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, color: C.orange, marginBottom: 4 }}>
                Prehliadač kopírovanie nepustil. Označ text a skopíruj ho ručne (Cmd+A, Cmd+C).
              </div>
              <textarea readOnly value={naOznacenie.text} onFocus={(e) => e.currentTarget.select()}
                style={{ width: "100%", height: 110, background: C.bg, color: C.textMuted, border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: 8, fontSize: 11, fontFamily: "inherit", lineHeight: 1.5 }} />
            </div>
          )}

          <div style={krok}>
            <b style={{ color: C.text }}>3.</b> Hotovo? Appka si zapíše dátum a tento návod už neukáže.
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={CLAUDE_PROJECT} target="_blank" rel="noreferrer" style={{ ...tlacidlo, textDecoration: "none", display: "inline-block" }}>
                otvoriť Project ↗
              </a>
              {onNastavene && (
                <button onClick={() => onNastavene(true)}
                  style={{ ...tlacidlo, border: `1px solid ${C.accent}`, background: mix(C.accent, 12), color: C.accentLight, fontWeight: 600 }}>
                  mám to nastavené
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
        {chat && (
          <button onClick={pytaj} disabled={chat.busy}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.accent}`,
              background: mix(C.accent, 12), color: C.accentLight, fontSize: 12.5, fontWeight: 600,
              cursor: chat.busy ? "default" : "pointer", opacity: chat.busy ? 0.5 : 1, fontFamily: "inherit" }}>
            1 · Vypýtaj si zadanie od Jarvisa
          </button>
        )}
        <span style={{ color: C.textDim, fontSize: 13 }}>→</span>
        <a href={CLAUDE_PROJECT} target="_blank" rel="noreferrer"
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`,
            background: mix(C.accent, 8), color: C.accentLight, fontSize: 12.5, fontWeight: 600,
            textDecoration: "none", whiteSpace: "nowrap" }}>
          2 · Otvoriť Claude Project ↗
        </a>
      </div>

      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
        Jarvis rozhoduje <b style={{ color: C.textMuted }}>čo a prečo</b> — pozná čísla, kapacitný strop
        aj to, čo sa vo verejnom obsahu nesmie objaviť. Project rieši <b style={{ color: C.textMuted }}>ako
        to znie</b>. Zadanie skopíruj z Jarvisovej odpovede a vlož ho do Projectu celé; nevidí odtiaľto nič,
        takže odkaz na „to číslo z Kokpitu" mu nepovie nič.
      </div>
    </Card>
  );
}
