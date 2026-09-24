import { oznam } from "../../lib/psb/obnovaSignal";
import { useCallback, useEffect, useState } from "react";

import type { RiadokPorovnania } from "../../lib/psb/balickyEvidencia";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

/**
 * Vlastná evidencia balíčkov a jej porovnanie s PTminderom.
 *
 * Jerry, 22. 9. 2026: nechať obe evidencie bežať vedľa seba a PTminder
 * vypnúť, keď sa prestanú rozchádzať. Pre dochádzku to meria karta „Vydrží
 * kalendár sám?"; toto je tá druhá polovica — hodiny.
 *
 * Karta je zámerne na jednom mieste s tou prvou: obe odpovedajú na tú istú
 * otázku a rozhodnutie vypnúť PTminder sa nedá urobiť z jednej polovice.
 *
 * ČÍSLO, KTORÉ ROZHODUJE, je „rozdiel" — klienti, pri ktorých Kokpit počíta
 * iný zostatok než PTminder. „PTminder mlčí" sú offline členstvá, ktoré
 * export vyváža ako 0/0; tam nie je čo porovnávať a do rozdielu nejdú.
 */

type Balicek = {
  id: string; klient: string; nazov: string; hodiny: number | null;
  platnost_od: string; platnost_do: string | null; cena_czk: number | null;
  zdroj: string; poznamka: string | null; zrusene_at: string | null;
};
type Porovnanie = { riadky: RiadokPorovnania[]; spolu: number; sedi: number; rozdiel: number; mlci: number; poExport: string };


async function posli(telo: Record<string, unknown>) {
  const r = await fetch("/api/balicky", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  return (await r.json()) as { ok: boolean; error?: string; pridanych?: number; preskocenych?: number; preskocene?: string[] };
}

export function BalickyEvidencia({ mena }: { mena: string[] }) {
  const [balicky, setBalicky] = useState<Balicek[] | null>(null);
  const [p, setP] = useState<Porovnanie | null>(null);
  const [chyba, setChyba] = useState("");
  const [pracujem, setPracujem] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [pisem, setPisem] = useState(false);
  const [detail, setDetail] = useState(false);
  const [f, setF] = useState({ klient: "", nazov: "", hodiny: "", platnostOd: new Date().toISOString().slice(0, 10), platnostDo: "", cenaCzk: "", poznamka: "" });

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/balicky", { credentials: "same-origin" });
    const j = (await r.json()) as { ok: boolean; balicky?: Balicek[]; porovnanie?: Porovnanie };
    if (j.ok) { setBalicky(j.balicky || []); setP(j.porovnanie || null); }
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const akcia = async (telo: Record<string, unknown>, znacka: string) => {
    setPracujem(znacka); setChyba(""); setHlaska("");
    const j = await posli(telo).catch(() => ({ ok: false, error: "spojenie" } as Awaited<ReturnType<typeof posli>>));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return false; }
    if (typeof j.pridanych === "number") {
      setHlaska(`Naliatych ${j.pridanych} balíčkov z exportu${j.preskocenych ? `, ${j.preskocenych} preskočených (bez dátumu platnosti)` : ""}.`);
    }
    await nacitaj();
    oznam("peniaze");
    return true;
  };

  if (!balicky) return null;
  const zive = balicky.filter((b) => !b.zrusene_at);
  const prazdne = zive.length === 0;

  return (
    <Card>
      <H3>
        <Info
          text="Kokpit si vedie vlastný zoznam predaných balíčkov a zostatok si počíta sám z kalendára. Kým sa jeho čísla rozchádzajú s PTminderom, PTminder je potrebný. Keď „rozdiel“ vydrží niekoľko týždňov na nule, hodiny unesie Kokpit sám."
          label="Balíčky — vlastná evidencia"
        />
      </H3>

      {prazdne ? (
        <>
          <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55, margin: "4px 0 10px" }}>
            Zoznam je zatiaľ prázdny. Nalej doň aktuálny stav z PTmindera — päťdesiat živých členstiev
            sa prepisovať ručne nebude. Odvtedy sa do Kokpitu zapisujú už len nové predaje a appka
            porovná, či jej zostatky sedia s PTminderom.
          </div>
          <button
            onClick={() => void akcia({ akcia: "nalej" }, "nalej")}
            disabled={pracujem === "nalej"}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green,
            }}
          >
            {pracujem === "nalej" ? "nalievam…" : "Naliať z PTmindera"}
          </button>
        </>
      ) : p && (
        <>
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "2px 0 10px" }}>
            Porovnáva sa k {p.poExport ? `${p.poExport.slice(8)}. ${Number(p.poExport.slice(5, 7))}. ${p.poExport.slice(0, 4)}` : "dnešku"} — pokiaľ siaha posledný export z PTmindera.
            Tréningy odvtedy Kokpit vidí, PTminder ešte nie, a rozdiel by hovoril o veku súboru, nie o zhode.
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "4px 0 12px" }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: p.rozdiel === 0 ? C.green : C.red }}>{p.rozdiel}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>klientov s iným zostatkom<br /><span style={{ color: C.textDim }}>toto rozhoduje</span></div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.green }}>{p.sedi}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>sedí do hodiny<br /><span style={{ color: C.textDim }}>Kokpit = PTminder</span></div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.textMuted }}>{p.mlci}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>nedá sa porovnať<br /><span style={{ color: C.textDim }}>paušál alebo export 0/0</span></div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.text }}>{zive.length}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>balíčkov v evidencii<br /><span style={{ color: C.textDim }}>{zive.filter((b) => b.zdroj === "rucne").length} zapísaných v Kokpite</span></div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "4px 6px 4px 0", fontWeight: 600 }}>klient</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>predané</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>odtrénované</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>Kokpit</th>
                <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>PTminder</th>
                <th style={{ padding: "4px 0 4px 6px", fontWeight: 600 }}>stav</th>
              </tr>
            </thead>
            <tbody>
              {(detail ? p.riadky : p.riadky.filter((r) => r.stav === "rozdiel" || r.stav === "lenPtminder")).map((r) => (
                <tr key={r.klient} style={{ borderTop: `1px solid ${mix(C.border, 55)}` }}>
                  <td style={{ padding: "5px 6px 5px 0", color: C.text }}>
                    {r.klient}
                    {r.balicky.length > 1 && <span style={{ color: C.textDim, fontSize: 11 }}> · {r.balicky.length} balíčky</span>}
                  </td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.textMuted }}>{r.predane ?? "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.textMuted }}>{r.odtrenovane}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color: C.text }}>{r.kokpit ?? "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: C.textMuted }}>{r.ptminder ?? "—"}</td>
                  <td style={{ padding: "5px 0 5px 6px", fontSize: 11.5, color: r.stav === "sedi" ? C.green : r.stav === "rozdiel" || r.stav === "lenPtminder" ? C.red : C.textDim }}>
                    {r.stav === "sedi" ? "sedí"
                      : r.stav === "rozdiel" ? `${(r.rozdiel as number) > 0 ? "+" : ""}${r.rozdiel} h oproti PTminderu`
                        : r.stav === "ptminderMlci" ? "PTminder mlčí (0/0)"
                          : r.stav === "pausal" ? "paušál — nedochádza"
                            : r.stav === "lenKokpit" ? "v PTminderi nie je"
                              : "v Kokpite nie je"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!detail && p.rozdiel === 0 && (
            <div style={{ fontSize: 12.5, color: C.green, marginTop: 8 }}>
              Všetkých {p.sedi} porovnateľných klientov sedí do hodiny.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button
              onClick={() => setDetail(!detail)}
              style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
            >
              {detail ? "Ukázať len rozdiely" : `Ukázať všetkých (${p.spolu})`}
            </button>
            <button
              onClick={() => setPisem(!pisem)}
              style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.accentLight, 45)}`, background: "transparent", color: C.accentLight }}
            >
              {pisem ? "Zavrieť" : "Zapísať nový balíček"}
            </button>
            <button
              onClick={() => void akcia({ akcia: "nalej" }, "nalej")}
              disabled={pracujem === "nalej"}
              style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
            >
              {pracujem === "nalej" ? "…" : "Doplniť nové z PTmindera"}
            </button>
          </div>
        </>
      )}

      {pisem && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {([
            { k: "klient", l: "klient", w: 180, list: true },
            { k: "nazov", l: "názov balíčka", w: 190, list: false },
            { k: "hodiny", l: "hodín (prázdne = paušál)", w: 150, list: false },
            { k: "platnostOd", l: "platnosť od", w: 130, list: false },
            { k: "platnostDo", l: "platnosť do", w: 130, list: false },
            { k: "cenaCzk", l: "cena Kč", w: 110, list: false },
          ] as const).map((x) => (
            <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: C.textDim }}>
              {x.l}
              <input
                value={f[x.k]}
                list={x.list ? "balicky-klienti" : undefined}
                onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
                placeholder={x.k.startsWith("platnost") ? "RRRR-MM-DD" : ""}
                style={{ width: x.w, padding: "7px 9px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
              />
            </label>
          ))}
          <datalist id="balicky-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
          <button
            onClick={async () => { if (await akcia({ akcia: "pridaj", ...f }, "pridaj")) { setF({ ...f, klient: "", nazov: "", hodiny: "", cenaCzk: "", poznamka: "" }); setPisem(false); } }}
            disabled={pracujem === "pridaj"}
            style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green }}
          >
            {pracujem === "pridaj" ? "…" : "Uložiť"}
          </button>
        </div>
      )}

      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>{hlaska}</div>}
    </Card>
  );
}
