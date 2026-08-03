import { useMemo, useState } from "react";

import type { CapacityRow, ClientAgg, RegisterItem, SixMRow } from "../../lib/psb/compute";
import { monthLabel } from "../../lib/psb/format";
import { buildReport, dostupneMesiace, SEKCIE, type SekciaId } from "../../lib/psb/report";
import { vytlacReport } from "../../lib/psb/reportHtml";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, H3, Info, Select } from "./ui";

// Report — appka po sebe napíše, ako jej to išlo, a text sa dá vziať preč.
//
// Dva reálne dôvody (Jerryho odpoveď): plánovanie obsahu v Claude projekte,
// kde treba mať po ruke všetko, čo appka vie — a ukazovanie výsledkov Jarkovi
// alebo Terezke, kde treba vetu, nie screenshot dashboardu.
//
// Zámerne sa nič nepočíta nanovo: report berie tie isté funkcie ako dashboard,
// takže keď sa raz opraví výpočet, opraví sa aj tu. Dva zdroje pravdy o jednom
// čísle sú horšie než žiadny report.

const posunMesiac = (mk: string, o: number) => {
  const [r, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(r, m - 1 + o, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function Report({
  data, clients, sixM, capacity, register,
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  sixM: SixMRow[];
  capacity: CapacityRow[];
  register: RegisterItem[];
}) {
  const mesiace = useMemo(() => dostupneMesiace(data), [data]);
  const posledny = mesiace[mesiace.length - 1] || new Date().toISOString().slice(0, 7);

  const [od, setOd] = useState(() => {
    const p = posunMesiac(posledny, -2);
    return mesiace.includes(p) ? p : mesiace[0] || posledny;
  });
  const [doM, setDoM] = useState(posledny);
  const [trener, setTrener] = useState("obaja");
  const [detail, setDetail] = useState(true);
  const [sekcie, setSekcie] = useState<SekciaId[]>(SEKCIE.map((s) => s.id));
  const [skopirovane, setSkopirovane] = useState(false);

  // Rozsah sa nedá otočiť naopak — prehodenie by ticho vrátilo prázdny report.
  const odOk = od <= doM ? od : doM;
  const text = useMemo(
    () => buildReport(data, clients, sixM, capacity, register, { od: odOk, doM, trener, sekcie, detail }),
    [data, clients, sixM, capacity, register, odOk, doM, trener, sekcie, detail],
  );

  const prepni = (id: SekciaId) =>
    setSekcie((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const rychlo = (mesiacov: number) => {
    setDoM(posledny);
    const p = posunMesiac(posledny, -(mesiacov - 1));
    setOd(mesiace.includes(p) ? p : mesiace[0] || posledny);
  };

  const kopiruj = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setSkopirovane(true);
      setTimeout(() => setSkopirovane(false), 2000);
    } catch {
      // Clipboard bez povolenia — nech sa dá text aspoň označiť ručne.
      setSkopirovane(false);
    }
  };

  const obdobiePopis = `Report za ${odOk === doM ? monthLabel(odOk) : `${monthLabel(odOk)} – ${monthLabel(doM)}`}${trener !== "obaja" ? ` · ${trener}` : ""}`;

  const stiahni = () => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `psb-report-${odOk}_${doM}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tlac = (hlavne: boolean): React.CSSProperties => ({
    padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${hlavne ? mix(C.accent, 45) : C.border}`,
    background: hlavne ? mix(C.accent, 8) : "transparent",
    color: hlavne ? C.accentLight : C.textMuted,
  });

  return (
    <>
      <Card>
        <H3><Info text="Report zoberie čísla, ktoré appka už počíta, a napíše z nich text. Používa sa dvojako: vložiť do Claude projektu, keď plánuješ obsah (nech Claude nepracuje naslepo), alebo poslať Jarkovi či Terezke, keď im ukazuješ výsledky. Nič sa tu nepočíta nanovo — sú to tie isté výpočty ako na dashboarde." label="Report" /></H3>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0 12px" }}>
          <span style={{ fontSize: 11.5, color: C.textDim }}>Rýchlo:</span>
          {[{ n: 1, l: "Posledný mesiac" }, { n: 3, l: "3 mesiace" }, { n: 6, l: "6 mesiacov" }, { n: 12, l: "12 mesiacov" }].map((x) => (
            <button key={x.n} onClick={() => rychlo(x.n)} style={{ ...tlac(false), padding: "6px 11px", fontSize: 12 }}>{x.l}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: C.textMuted }}>
            Od
            <div style={{ marginTop: 4 }}>
              <Select value={od} onChange={setOd} options={mesiace.map((m) => ({ value: m, label: monthLabel(m) }))} />
            </div>
          </label>
          <label style={{ fontSize: 11, color: C.textMuted }}>
            Do
            <div style={{ marginTop: 4 }}>
              <Select value={doM} onChange={setDoM} options={mesiace.map((m) => ({ value: m, label: monthLabel(m) }))} />
            </div>
          </label>
          <label style={{ fontSize: 11, color: C.textMuted }}>
            Tréner
            <div style={{ marginTop: 4 }}>
              <Select
                value={trener} onChange={setTrener}
                options={[{ value: "obaja", label: "Obaja" }, { value: "Jerry", label: "Jerry" }, { value: "Terezka", label: "Terezka" }]}
              />
            </div>
          </label>
          <button onClick={() => setDetail(!detail)} style={{ ...tlac(detail) }}>
            {detail ? "Detailný" : "Súhrn"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 6 }}>
          {SEKCIE.map((s) => {
            const on = sekcie.includes(s.id);
            return (
              <button
                key={s.id} onClick={() => prepni(s.id)} title={s.popis}
                style={{
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5,
                  border: `1px solid ${on ? mix(C.accent, 45) : C.border}`,
                  background: on ? mix(C.accent, 8) : "transparent",
                  color: on ? C.accentLight : C.textDim,
                }}
              >
                {on ? "✓ " : ""}{s.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          {trener !== "obaja" && "Filter podľa trénera platí na sedenia a hodiny — platby v PTminderi trénera nemajú, takže tržby zostávajú za celé štúdio. "}
          Report sa prepisuje sám, ako meníš filtre.
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => void kopiruj()} style={tlac(true)}>
            {skopirovane ? "✓ Skopírované" : "Kopírovať"}
          </button>
          <button onClick={() => vytlacReport(text, obdobiePopis)} style={tlac(true)}>PDF</button>
          <button onClick={stiahni} style={tlac(false)}>Stiahnuť .md</button>
          <span style={{ fontSize: 11, color: C.textDim, marginLeft: "auto" }}>
            {text.split("\n").length} riadkov · {Math.round(text.length / 1000)} tis. znakov
          </span>
        </div>
        <pre
          style={{
            margin: 0, padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`,
            color: C.textMuted, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 560, overflowY: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {text}
        </pre>
      </Card>
    </>
  );
}
