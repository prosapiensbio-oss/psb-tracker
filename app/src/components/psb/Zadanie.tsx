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

export function Zadanie({ chat }: { chat?: AssistantChat }) {
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

  return (
    <Card>
      <H3>
        <Info
          label="Zadanie pre Claude Project"
          text="Deľba práce, na ktorej sme sa dohodli: Jarvis rozhoduje ČO a PREČO — má čísla, kapacitný strop, FP pravidlá aj index brand-konfliktov. Claude Project rieši AKO to znie — má štýl, formáty a vizuálnu identitu. Zadanie je to, čo medzi nimi prechádza; musí stáť samo o sebe, lebo Project nevidí dáta Kokpitu."
        />
      </H3>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
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
