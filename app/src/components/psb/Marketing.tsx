import { useMemo, useState } from "react";

import { fmtCZK } from "../../lib/psb/format";
import { MKT_MESACNE, MKT_TOP, mktSum } from "../../lib/psb/marketing";
import { C, mix, S } from "../../lib/psb/theme";
import type { ClientAgg } from "../../lib/psb/compute";
import type { Lead, PSBData } from "../../lib/psb/types";
import { Card, Empty, H3, Info, StatCard, SubTabs, ValueBars } from "./ui";

// Marketing — skeleton. Four questions in the order Jerry asked them: what did I
// try, what worked, what did it cost, and what should I try next. The section
// lives in Tracker rather than VZAS on purpose: Výsledky look back at money,
// marketing looks forward at clients.
const MESIACE = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
const label = (m: string) => `${MESIACE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const num = (n: number) => n.toLocaleString("sk-SK");

function Skeleton({ text }: { text: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px dashed ${mix(C.accent, 40)}`, background: mix(C.accent, 5), fontSize: 12.5, color: C.textMuted, lineHeight: 1.55 }}>
      <b style={{ color: C.accentLight }}>Kostra</b> — {text}
    </div>
  );
}

// ── Čo som robil ─────────────────────────────────────────────────────────────
function CoSomRobil({ rok }: { rok: string }) {
  const [metrika, setMetrika] = useState<"obsah" | "views" | "dosah" | "spend">("obsah");
  const data = MKT_MESACNE.filter((r) => r.m.startsWith(rok));
  const hodnota = (r: (typeof MKT_MESACNE)[0]) =>
    metrika === "obsah" ? r.reels + r.posty : metrika === "views" ? r.views : metrika === "dosah" ? r.dosah : r.spend;
  const opts: [typeof metrika, string][] = [["obsah", "Príspevky"], ["views", "Videnia"], ["dosah", "Dosah"], ["spend", "Reklama"]];

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <H3><Info text="Koľko obsahu si za mesiac vypustil, aký mal dosah a koľko stála reklama. Stories sa nerátajú do „príspevkov“ — sú v tabuľke nižšie, lebo majú úplne inú životnosť." label="Čo som robil" /></H3>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {opts.map(([id, lbl]) => (
            <button key={id} onClick={() => setMetrika(id)}
              style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${metrika === id ? C.accent : C.border}`, background: metrika === id ? C.accentBg : "transparent", color: metrika === id ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <ValueBars
        data={data.map((r) => ({ label: label(r.m), value: hodnota(r) }))}
        color={metrika === "spend" ? C.orange : C.accent}
        fmt={(n) => (metrika === "spend" ? `${Math.round(n / 100) / 10}k` : metrika === "obsah" ? String(n) : `${Math.round(n / 1000)}k`)}
        height={170}
        alignEnd
      />
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
              {["Mesiac", "Reels", "Posty", "Stories", "Videnia", "Uloženia", "Zdieľania", "Reklama"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.m}>
                <td style={{ ...S.td, fontSize: 12.5, color: C.text, whiteSpace: "nowrap" }}>{label(r.m)}</td>
                {[r.reels, r.posty, r.stories, r.views, r.ulozenia, r.zdielania].map((v, i) => (
                  <td key={i} style={{ ...S.td, textAlign: "right", fontSize: 12.5, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{num(v)}</td>
                ))}
                <td style={{ ...S.td, textAlign: "right", fontSize: 12.5, color: r.spend > 0 ? C.orange : C.textDim, fontVariantNumeric: "tabular-nums" }}>{r.spend ? fmtCZK(r.spend) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Čo fungovalo ─────────────────────────────────────────────────────────────
function CoFungovalo() {
  return (
    <Card>
      <H3><Info text="Rebríček podľa ULOŽENÍ, nie lajkov. Uloženie znamená „toto si chcem nechať“ a je zo všetkých metrík najbližšie k zámeru; lajk nehovorí nič." label="Čo fungovalo" /></H3>
      <div style={{ marginTop: 4 }}>
        {MKT_TOP.map((k, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${mix(C.border, 55)}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.textDim, width: 52, flex: "0 0 auto" }}>{label(k.m)}</span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, border: `1px solid ${C.border}`, color: C.textMuted, flex: "0 0 auto" }}>{k.typ}</span>
            <span style={{ flex: "1 1 260px", minWidth: 200, fontSize: 12.5, color: C.text }}>{k.hook}</span>
            <span style={{ fontSize: 12.5, color: C.accentLight, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.ulozenia} uložení</span>
            <span style={{ fontSize: 11.5, color: C.textDim, fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "right" }}>
              {num(k.views)} videní{k.viewRate > 0 && ` · ${k.viewRate} %`}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 12, lineHeight: 1.55 }}>
        Štyri z ôsmich najuchovávanejších kusov sú <b>klientske príbehy</b> — Jarek, „Nepřišel proto, že by chtěl víc svalů“,
        „Prkno. Sklapovačky.“ Naopak najslabšie dopadli všeobecné edukatívne reels a vianočný darčekový.
      </div>
      <div style={{ marginTop: 12 }}>
        <Skeleton text="sem príde triedenie podľa témy a formátu. Skúsil som to podľa hashtagov a je to nepoužiteľné — v každom príspevku máš skoro všetky. Triediť sa to musí podľa hooku, teda prvého riadku, čo je aj to jediné, čo rozhoduje, či to niekto dopozerá." />
      </div>
    </Card>
  );
}

// ── Čo to prinieslo ──────────────────────────────────────────────────────────
function CoToPrinieslo({ data, clients, leads }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[] }) {
  const rok = "2026";
  const uvodne = useMemo(
    () => data.sessions.filter((s) => s.sessionType === "UVODNE" && s.date.slice(0, 4) === rok).length,
    [data.sessions],
  );
  const spend = MKT_MESACNE.filter((r) => r.m.startsWith(rok)).reduce((a, r) => a + r.spend, 0);
  const cac = uvodne > 0 ? spend / uvodne : 0;
  // LTV: what a settled client pays over the whole relationship.
  const ltv = useMemo(() => {
    const g = Object.values(clients).filter((c) => c.sessionCount >= 3);
    return g.length ? g.reduce((a, c) => a + c.totalPrice, 0) / g.length : 0;
  }, [clients]);

  return (
    <Card>
      <H3><Info text="Instagram nikdy nepovie, kto sa stal klientom. Preto sa tu porovnávajú len dve veci, ktoré vieme: koľko stála reklama a koľko úvodných tréningov reálne prišlo. Skutočnú odpoveď „odkiaľ“ dá až lievik dopytov." label="Čo to prinieslo" /></H3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "12px 0 4px" }}>
        <StatCard value={fmtCZK(spend)} label={`Reklama ${rok}`} color={C.orange} />
        <StatCard value={String(uvodne)} label={`Úvodné tréningy ${rok}`} color={C.accent} />
        <StatCard value={fmtCZK(cac)} label={<Info text="Reklama delená počtom úvodných tréningov. Je to horný odhad: väčšina ľudí prišla cez referencie, nie cez reklamu — takže reálna cena za klienta z reklamy je vyššia, ale aj tak rádovo pod hodnotou klienta." label="Cena za úvodný (max)" />} color={C.blue} />
        <StatCard value={fmtCZK(ltv)} label={<Info text="Priemer za klientov s aspoň 3 sedeniami, za celú históriu." label="Hodnota klienta (LTV)" />} color={C.green} />
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: mix(C.blue, 10), border: `1px solid ${mix(C.blue, 30)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55, marginTop: 8 }}>
        Aj keby <b>všetky</b> úvodné tréningy prišli z reklamy, získanie jedného by stálo {fmtCZK(cac)} proti hodnote klienta {fmtCZK(ltv)}.
        Neprišli — prišli cez referencie. Ale práve preto máš priestor minúť násobne viac, než míňaš dnes.
      </div>
      <div style={{ marginTop: 12 }}>
        {leads.length > 0 ? (
          <div style={{ fontSize: 12.5, color: C.textMuted }}>Dopytov v lieviku: <b style={{ color: C.text }}>{leads.length}</b></div>
        ) : (
          <Empty>Lievik dopytov je zatiaľ prázdny — kým sa nezapisuje, appka nevie povedať, odkiaľ klienti chodia. Zapisuje sa v Klienti → Dopyty.</Empty>
        )}
      </div>
    </Card>
  );
}

// ── Čo skúsiť ďalej ──────────────────────────────────────────────────────────
function CoSkusitDalej() {
  return (
    <Card>
      <H3><Info text="Odporúčania z tvojej vlastnej histórie, nie zo všeobecných rád o Instagrame." label="Čo skúsiť ďalej" /></H3>
      <Skeleton text="tu bude porovnanie typu hooku × formátu (ktorá kombinácia má najviac uložení na jeden príspevok), návrh frekvencie podľa mesiacov, v ktorých pribúdali úvodné, a upozornenie na obsah, ktorý sa opakuje bez efektu." />
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 12, lineHeight: 1.55 }}>
        Čo už dnes z dát vidno: <b>stories padli</b> z 85 za mesiac (mar 2025) na ~35 (zač. 2026), zatiaľ čo reels rástli.
        Priemerný view rate je <b>36,5 %</b> a drží sa stabilne, takže problém nie je v tom, či ľudia vydržia pozerať — ale v tom, koľko ich vôbec príde.
      </div>
    </Card>
  );
}

export function Marketing({ data, clients, leads }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[] }) {
  const [sub, setSub] = useState("prehlad");
  const [rok, setRok] = useState("2026");
  const spendSpolu = mktSum("spend");

  return (
    <>
      <SubTabs
        tabs={[
          { id: "prehlad", label: "Prehľad" },
          { id: "vykon", label: "Čo fungovalo" },
          { id: "navratnost", label: "Čo to prinieslo" },
        ]}
        value={sub}
        onChange={setSub}
      />

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div>
            <H3><Info text="Zatiaľ kostra. Čísla sú jednorazový export z Metricoolu za 18 mesiacov (jan 2025 – jún 2026); importér mesačných exportov pribudne, aby sa to aktualizovalo samo ako PTminder." label="Marketing" /></H3>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              18 mesiacov · {mktSum("posty")} postov · {mktSum("reels")} reels · {num(mktSum("stories"))} stories · reklama {fmtCZK(spendSpolu)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["2025", "2026"].map((y) => (
              <button key={y} onClick={() => setRok(y)}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${rok === y ? C.accent : C.border}`, background: rok === y ? C.accentBg : "transparent", color: rok === y ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
                {y}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {sub === "prehlad" && (
        <>
          <CoSomRobil rok={rok} />
          <CoSkusitDalej />
        </>
      )}
      {sub === "vykon" && <CoFungovalo />}
      {sub === "navratnost" && <CoToPrinieslo data={data} clients={clients} leads={leads} />}
    </>
  );
}
