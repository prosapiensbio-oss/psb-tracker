import { useState } from "react";

import { koniecKvartalu, kvartalMesiaca, navrhyReportu, postavReport, type ExtraReportu, type MesiacReportu } from "../../lib/psb/mesacnyReport";
import { C, mix } from "../../lib/psb/theme";
import { Prezentacia } from "./Prezentacia";
import { ReportMesiaca } from "./ReportMesiaca";

export type ReportVstup = (mesiac: string, druh?: "mesiac" | "kvartal") => { mesiace: MesiacReportu[]; extra: ExtraReportu };

/** Mesiac v tvare „september 2026". */
export const nazovMesiaca = (mk: string) => {
  const m = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"][Number(mk.slice(5, 7)) - 1] || mk;
  return `${m} ${mk.slice(0, 4)}`;
};

const vedlajsie: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};
const hlavne: React.CSSProperties = {
  padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
  border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green,
};

/**
 * TLAČIDLÁ REPORTU MESIACA a okno s reportom (prezentácia je v ňom).
 *
 * Jedno miesto pre kartu uzávierky aj pre zoznam všetkých mesiacov (Jerry,
 * 18. 10. 2026: „tie reporty a prezentácie nájdem pri každom zamknutom
 * mesiaci — keď naň kliknem, rozbalí sa a bude tam report toho mesiaca").
 * Kvartálny len za marec, jún, september a december. Nezamknutý mesiac
 * ukazuje náhľad — čísla sa v ňom ešte môžu zmeniť.
 */
export function ReportyMesiaca({ mesiac, zamknuty, reportVstup }: { mesiac: string; zamknuty: boolean; reportVstup: ReportVstup }) {
  const [report, setReport] = useState<"mesiac" | "kvartal" | null>(null);
  /** Prezentácia rovno, bez okna reportu — pri zamknutom mesiaci (18. 10. 2026). */
  const [prezentuje, setPrezentuje] = useState<"mesiac" | "kvartal" | null>(null);
  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={zamknuty ? hlavne : vedlajsie} onClick={() => setReport("mesiac")}>
          📄 {zamknuty ? "Report" : "Náhľad reportu"} za {nazovMesiaca(mesiac)}
        </button>
        {zamknuty && <button style={vedlajsie} onClick={() => setPrezentuje("mesiac")}>▶ Prezentácia mesiaca</button>}
        {koniecKvartalu(mesiac) && (
          <button style={zamknuty ? hlavne : vedlajsie} onClick={() => setReport("kvartal")}>
            📊 {zamknuty ? "Kvartálny report" : "Náhľad kvartálneho reportu"} Q{kvartalMesiaca(mesiac)} {mesiac.slice(0, 4)}
          </button>
        )}
        {zamknuty && koniecKvartalu(mesiac) && <button style={vedlajsie} onClick={() => setPrezentuje("kvartal")}>▶ Prezentácia Q{kvartalMesiaca(mesiac)}</button>}
      </div>
      {prezentuje && (() => {
        const v = reportVstup(mesiac, prezentuje);
        return <Prezentacia report={postavReport(v.mesiace, mesiac, prezentuje, v.extra)} onZavri={() => setPrezentuje(null)} />;
      })()}
      {report && (() => {
        const v = reportVstup(mesiac, report);
        // Pri kvartáli aj návrhy všetkých troch mesiacov — štvrtá otázka.
        const plnenie = report === "kvartal"
          ? [2, 1, 0].map((k) => {
            const [y, mm] = mesiac.split("-").map(Number);
            const m = new Date(Date.UTC(y, mm - 1 - k, 1)).toISOString().slice(0, 7);
            const vm = reportVstup(m, "mesiac");
            return { m, nazov: nazovMesiaca(m), navrhy: navrhyReportu(postavReport(vm.mesiace, m, "mesiac", vm.extra)) };
          })
          : undefined;
        return <ReportMesiaca report={postavReport(v.mesiace, mesiac, report, v.extra)} nahlad={!zamknuty} onZavri={() => setReport(null)} plnenie={plnenie} />;
      })()}
    </>
  );
}
