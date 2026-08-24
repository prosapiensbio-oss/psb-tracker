import { useCallback, useEffect, useMemo, useState } from "react";

import { krokyZa } from "./MarketingLievik";
import {
  KATALOG_METRIK, METRIKA_MAPA, STAV_POPIS, dlzkaPlanu, mesiacePlanu,
  skontrolujPlan, splnenie, type Plan, type StavPlanu,
} from "../../lib/psb/plan";
import { C, mix } from "../../lib/psb/theme";
import type { ClientAgg } from "../../lib/psb/compute";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { Card, H3, Info, Modal, Select } from "./ui";

/**
 * Marketingový plán — cieľ, obdobie, metriky, prístup, rozpočet.
 *
 * PREČO TO NIE JE ĎALŠÍ ZOZNAM CIEĽOV
 *
 * Ciele, KPI, kampane aj obsahová mapa v appke už sú. Toto ich viaže na
 * obdobie a dopĺňa jedinú vec, ktorá chýbala: porovnanie toho, čo sme si
 * povedali, s tým, čo sa naozaj stalo. Preto pri každej metrike svieti
 * SKUTOČNOSŤ za to isté obdobie — plán, do ktorého sa nedá vrátiť a zistiť,
 * ako dopadol, je len zápisník.
 */

type PlanRiadok = Plan & { created_at?: string; updated_at?: string };

const dnesMesiac = () => new Date().toISOString().slice(0, 7);

/** O rok dopredu od mesiaca — východzí koniec nového plánu. */
function oMesiacov(m: string, n: number): string {
  const [r, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(r, mm - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PlanMarketingu({ data, clients, chat, onNavigate }: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  chat?: AssistantChat;
  onNavigate?: (tab: string, sub?: string) => void;
}) {
  const [plany, setPlany] = useState<PlanRiadok[]>([]);
  const [otvoreny, setOtvoreny] = useState<PlanRiadok | "novy" | null>(null);
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(() => {
    void fetch("/api/plany", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { plany?: (Omit<PlanRiadok, "metriky"> & { metriky?: string })[] }) =>
        setPlany((j.plany || []).map((p) => ({
          ...p,
          metriky: (() => {
            try { const x = JSON.parse(p.metriky || "[]"); return Array.isArray(x) ? x : []; }
            catch { return []; }
          })(),
        }) as PlanRiadok)))
      .catch(() => {});
  }, []);
  useEffect(nacitaj, [nacitaj]);

  const uloz = async (body: Record<string, unknown>) => {
    setChyba("");
    try {
      const r = await fetch("/api/plany", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) { setChyba(j.error || "Uložiť sa nepodarilo."); return false; }
      nacitaj();
      return true;
    } catch { setChyba("Uložiť sa nepodarilo — spojenie zlyhalo."); return false; }
  };

  return (
    <Card>
      <H3>
        Marketingový plán
        <Info text={
          "Cieľ, obdobie, metriky, čo pre to urobíme a koľko na to dáme. Metriky si plán nezakladá — vyberá z tých, " +
          "ktoré appka počíta v Marketingu, aby si obrazovka a plán neprotirečili. Pri každej vidíš SKUTOČNOSŤ za to isté " +
          "obdobie, takže sa dá kedykoľvek vrátiť a zistiť, či to ide podľa plánu, nie len ako to ide."
        } />
      </H3>

      {chyba && (
        <div style={{ background: C.redBg, color: C.red, padding: "8px 10px", borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>
          {chyba}
        </div>
      )}

      {plany.length === 0 && (
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
          Zatiaľ žiadny plán. Plán je odpoveď na otázku „ide nám to podľa toho, čo sme si povedali" —
          bez neho vieš len to, ako ti ide.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {plany.map((p) => (
          <RiadokPlanu key={p.id} plan={p} data={data} clients={clients} onOtvor={() => setOtvoreny(p)} />
        ))}
      </div>

      <button onClick={() => setOtvoreny("novy")}
        style={{
          marginTop: 12, background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "7px 12px", fontSize: 12.5, fontFamily: "inherit", color: C.accentLight, cursor: "pointer",
        }}>
        + nový plán
      </button>

      {otvoreny && (
        <Modal
          title={otvoreny === "novy" ? "Nový marketingový plán" : otvoreny.nazov || "Plán"}
          sirka={640}
          onClose={() => { setOtvoreny(null); setChyba(""); }}
        >
          <Editor
            plan={otvoreny === "novy" ? null : otvoreny}
            data={data}
            clients={clients}
            onUloz={uloz}
            onZavri={() => { setOtvoreny(null); setChyba(""); }}
            onJarvis={chat ? (p) => posliJarvisovi(chat, p, onNavigate) : undefined}
            onDoMapy={() => { setOtvoreny(null); onNavigate?.("marketing", "navrhy"); }}
          />
        </Modal>
      )}
    </Card>
  );
}

/**
 * Skutočnosť za obdobie plánu.
 *
 * Počíta sa z tých istých dát ako Marketing — dopyty z `leads`, klienti
 * z ich stavu. Metriky, na ktoré tu podklad nie je (dosah, uloženia), vracajú
 * null a obrazovka to prizná; vymyslená nula by vyzerala ako neúspech.
 */
function skutocnost(
  data: PSBData, clients: Record<string, ClientAgg>, mesiace: string[],
): Record<string, number | null> {
  if (!mesiace.length) return {};
  // krokyZa je TÁ ISTÁ funkcia, akou počíta lievik v Marketingu — vrátane
  // definície klienta a konverzie dopytov (nie klientov, tá dávala 124 %).
  // Vlastný výpočet by znamenal dve čísla o tom istom.
  const k = krokyZa(data, clients, mesiace);
  const mes = mesiace.length;
  return {
    dopyty: k.dopyty / mes,
    konverzia: k.dopyty > 0 ? (k.zDopytu / k.dopyty) * 100 : null,
    noviKlienti: k.klienti,
    uvodne: k.uvodne / mes,
    // Na tieto tu podklad nie je (cena za dopyt potrebuje kampane, dosah
    // a uloženia Instagram). Null obrazovka prizná — vymyslená nula by
    // vyzerala ako neúspech.
    cenaZaDopyt: null,
    dosah: null,
    ulozenia: null,
    prispevkov: null,
  };
}

function RiadokPlanu({ plan, data, clients, onOtvor }: { plan: PlanRiadok; data: PSBData; clients: Record<string, ClientAgg>; onOtvor: () => void }) {
  const mesiace = mesiacePlanu(plan.od, plan.do);
  const sk = useMemo(() => skutocnost(data, clients, mesiace), [data, clients, mesiace]);
  const dnes = dnesMesiac();
  const bezi = mesiace.length > 0 && plan.od <= dnes && dnes <= plan.do;

  return (
    <button onClick={onOtvor}
      style={{
        textAlign: "left", background: mix(C.accent, 0.04), border: `1px solid ${mix(C.border, 0.9)}`,
        borderRadius: 8, padding: 12, cursor: "pointer", fontFamily: "inherit", width: "100%",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{plan.nazov}</span>
        <span style={{ fontSize: 11, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>
          {plan.od} – {plan.do} · {dlzkaPlanu(plan)} mes. · {STAV_POPIS[plan.stav] || plan.stav}
          {bezi && <span style={{ color: C.accentLight }}> · práve beží</span>}
        </span>
      </div>
      {plan.ciel && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 1.45 }}>{plan.ciel}</div>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
        {plan.metriky.map((m) => {
          const def = METRIKA_MAPA.get(m.kluc);
          if (!def) return null;
          const s = sk[m.kluc];
          const p = splnenie(def, s, m.cielova);
          return (
            <span key={m.kluc} style={{ fontSize: 11, color: C.textDim }}>
              {def.nazov}{" "}
              <b style={{ color: p == null ? C.textDim : p >= 100 ? C.green : p >= 70 ? C.text : C.red }}>
                {s == null ? "—" : s.toFixed(s < 10 ? 1 : 0)}
              </b>
              <span style={{ color: C.textDim }}> / {m.cielova}</span>
              {p != null && <span style={{ color: C.textDim }}> ({p} %)</span>}
            </span>
          );
        })}
        {plan.rozpocet > 0 && (
          <span style={{ fontSize: 11, color: C.textDim }}>
            rozpočet <b style={{ color: C.text }}>{plan.rozpocet.toLocaleString("sk-SK")} Kč</b>
          </span>
        )}
      </div>
    </button>
  );
}

function posliJarvisovi(chat: AssistantChat, p: Plan, onNavigate?: (tab: string, sub?: string) => void) {
  const mes = mesiacePlanu(p.od, p.do);
  chat.newChat("marketing");
  if (onNavigate) { chat.zachovajOkno(); onNavigate("jarvis"); }
  else chat.setFloatingOpen(true);
  void chat.ask([
    `Debatujme o marketingovom pláne „${p.nazov}" na ${p.od} – ${p.do} (${mes.length} mesiacov).`,
    "",
    `CIEĽ: ${p.ciel || "(nie je zadaný)"}`,
    `PREČO: ${p.preco || "(nie je zadané)"}`,
    `METRIKY: ${p.metriky.map((m) => `${METRIKA_MAPA.get(m.kluc)?.nazov ?? m.kluc} → ${m.cielova}`).join(" · ") || "(žiadne)"}`,
    `PRÍSTUP: ${p.pristup || "(nie je zadaný)"}`,
    `ROZPOČET NA REKLAMU: ${p.rozpocet ? `${p.rozpocet} Kč na celé obdobie` : "žiadny"}`,
    "",
    "Povedz mi tri veci, každú krátko a podloženú číslom z dát PSB:",
    "1. Je ten cieľ na toto obdobie REÁLNY? Porovnaj s tým, čo sa dialo v rovnako dlhom období predtým.",
    "2. Merajú tie metriky naozaj ten cieľ, alebo meriam niečo, čo sa hýbe samo?",
    "3. Čo v prístupe chýba — a aký konkrétny obsah by som mal naplánovať do mapy cyklu, aby to vyšlo.",
    "",
    "Keď máš konkrétny obsahový návrh, pridaj psb-action naplanuj-obsah tak, ako to robíš inak.",
    "Keď je cieľ podľa dát nereálny, povedz to rovno a navrhni číslo, ktoré reálne je.",
  ].join("\n"), `Plán: ${p.nazov}`, []);
}

function Editor({ plan, data, clients, onUloz, onZavri, onJarvis, onDoMapy }: {
  plan: PlanRiadok | null;
  data: PSBData;
  clients: Record<string, ClientAgg>;
  onUloz: (b: Record<string, unknown>) => Promise<boolean>;
  onZavri: () => void;
  onJarvis?: (p: Plan) => void;
  onDoMapy: () => void;
}) {
  const [nazov, setNazov] = useState(plan?.nazov || "");
  const [od, setOd] = useState(plan?.od || dnesMesiac());
  const [doM, setDoM] = useState(plan?.do || oMesiacov(dnesMesiac(), 3));
  const [ciel, setCiel] = useState(plan?.ciel || "");
  const [preco, setPreco] = useState(plan?.preco || "");
  const [metriky, setMetriky] = useState(plan?.metriky || []);
  const [pristup, setPristup] = useState(plan?.pristup || "");
  const [rozpocet, setRozpocet] = useState(plan?.rozpocet || 0);
  const [stav, setStav] = useState<StavPlanu>(plan?.stav || "navrh");
  const [vyhodnotenie, setVyhodnotenie] = useState(plan?.vyhodnotenie || "");
  const [busy, setBusy] = useState(false);
  const [mazem, setMazem] = useState(false);

  const aktualny: Plan = {
    id: plan?.id || "", nazov, od, do: doM, ciel, preco, metriky, pristup, rozpocet, stav, vyhodnotenie,
  };
  const mesiace = mesiacePlanu(od, doM);
  const sk = useMemo(() => skutocnost(data, clients, mesiace), [data, clients, mesiace]);
  const nalezy = skontrolujPlan(aktualny);
  const tvrde = nalezy.filter((n) => n.tvrdy);

  const vstup = {
    width: "100%", background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13,
    border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box" as const,
  };
  const popis = { display: "block", fontSize: 11.5, color: C.textMuted, margin: "12px 0 4px" } as const;
  const tlacidlo = (hlavne: boolean) => ({
    background: hlavne ? C.accent : "none", color: hlavne ? "#fff" : C.textMuted,
    border: hlavne ? "none" : `1px solid ${C.border}`, borderRadius: 6,
    padding: "7px 14px", fontSize: 12.5, fontFamily: "inherit", cursor: busy ? "default" : "pointer",
  });

  const zapis = async () => {
    if (tvrde.length) return;
    setBusy(true);
    const telo: Record<string, unknown> = {
      nazov, od, do: doM, ciel, preco, metriky, pristup, rozpocet, stav, vyhodnotenie,
    };
    if (plan?.id) telo.id = plan.id;
    const ok = await onUloz(telo);
    setBusy(false);
    if (ok) onZavri();
  };

  return (
    <div>
      <label style={{ ...popis, marginTop: 0 }}>Názov plánu</label>
      <input value={nazov} onChange={(e) => setNazov(e.target.value)}
        placeholder="napr. Jeseň 2026 — zaplniť miesta po odídencoch" style={vstup} />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", flexDirection: "column", gap: 4 }}>
          Od
          <input value={od} onChange={(e) => setOd(e.target.value)} placeholder="RRRR-MM" style={{ ...vstup, width: 110 }} />
        </label>
        <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", flexDirection: "column", gap: 4 }}>
          Do
          <input value={doM} onChange={(e) => setDoM(e.target.value)} placeholder="RRRR-MM" style={{ ...vstup, width: 110 }} />
        </label>
        <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", flexDirection: "column", gap: 4, flex: "1 1 150px" }}>
          Stav
          <Select value={stav} onChange={(v) => setStav(v as StavPlanu)}
            options={[
              { value: "navrh", label: "návrh — ešte sa o ňom bavíme" },
              { value: "bezi", label: "beží — podľa neho pracujeme" },
              { value: "vyhodnoteny", label: "vyhodnotený — vieme, ako dopadol" },
            ]} />
        </label>
      </div>
      {mesiace.length > 0 && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
          {mesiace.length} mesiacov: {mesiace.join(" · ")}
        </div>
      )}

      <label style={popis}>Cieľ — čo chceme dosiahnuť</label>
      <textarea value={ciel} onChange={(e) => setCiel(e.target.value)} rows={2}
        placeholder="napr. zaplniť 8 miest, ktoré sa uvoľnili odchodmi" style={{ ...vstup, resize: "vertical" }} />

      <label style={popis}>Prečo práve toto</label>
      <textarea value={preco} onChange={(e) => setPreco(e.target.value)} rows={2}
        placeholder="čo v dátach ťa k tomu vedie" style={{ ...vstup, resize: "vertical" }} />

      <label style={popis}>Na čom to budeme merať</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {KATALOG_METRIK.map((def) => {
          const vybrata = metriky.find((m) => m.kluc === def.kluc);
          const s = sk[def.kluc];
          const p = vybrata ? splnenie(def, s, vybrata.cielova) : null;
          return (
            <div key={def.kluc} style={{
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
              padding: "6px 8px", borderRadius: 6,
              background: vybrata ? mix(C.accent, 0.06) : "transparent",
              border: `1px solid ${vybrata ? mix(C.accent, 0.35) : "transparent"}`,
            }}>
              <button
                onClick={() => setMetriky((x) => vybrata
                  ? x.filter((y) => y.kluc !== def.kluc)
                  : [...x, { kluc: def.kluc, cielova: 0 }])}
                style={{
                  background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12.5, color: vybrata ? C.text : C.textMuted, textAlign: "left", flex: "1 1 170px",
                }}>
                {vybrata ? "✓ " : "· "}{def.nazov}
                {def.referencia && <span style={{ color: C.textDim, fontSize: 11 }}> · {def.referencia}</span>}
              </button>
              {vybrata && (
                <>
                  <input type="number" value={vybrata.cielova || ""} min={0}
                    onChange={(e) => setMetriky((x) => x.map((y) =>
                      y.kluc === def.kluc ? { ...y, cielova: Number(e.target.value) } : y))}
                    placeholder="cieľ" style={{ ...vstup, width: 88, padding: "5px 8px", fontSize: 12 }} />
                  <span style={{ fontSize: 11, color: C.textDim, fontVariantNumeric: "tabular-nums", minWidth: 108 }}>
                    {/* Skutočnosť za to isté obdobie. Bez nej je cieľ len prianie. */}
                    teraz {s == null ? "— (nemeriame)" : s.toFixed(s < 10 ? 1 : 0)}
                    {p != null && <b style={{ color: p >= 100 ? C.green : p >= 70 ? C.text : C.red }}> · {p} %</b>}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <label style={popis}>Čo pre to urobíme — aký obsah a prečo práve taký</label>
      <textarea value={pristup} onChange={(e) => setPristup(e.target.value)} rows={4}
        placeholder="napr. ťažisko do fázy 3 a 4, dva reely týždenne, klientske príbehy až v decembri"
        style={{ ...vstup, resize: "vertical", lineHeight: 1.5 }} />

      <label style={popis}>Rozpočet na reklamu za celé obdobie (Kč)</label>
      <input type="number" min={0} value={rozpocet || ""} onChange={(e) => setRozpocet(Number(e.target.value))}
        placeholder="0" style={{ ...vstup, width: 140 }} />

      {stav === "vyhodnoteny" && (
        <>
          <label style={popis}>Ako to dopadlo</label>
          <textarea value={vyhodnotenie} onChange={(e) => setVyhodnotenie(e.target.value)} rows={3}
            placeholder="čo vyšlo, čo nie a čo z toho platí do ďalšieho plánu"
            style={{ ...vstup, resize: "vertical", lineHeight: 1.5 }} />
        </>
      )}

      {nalezy.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {nalezy.map((n, i) => (
            <div key={i} style={{ fontSize: 11.5, color: n.tvrdy ? C.red : C.textMuted, lineHeight: 1.4 }}>
              {n.tvrdy ? "✕ " : "· "}{n.text}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={zapis} disabled={busy || tvrde.length > 0}
          style={{ ...tlacidlo(true), opacity: busy || tvrde.length ? 0.5 : 1 }}>
          {plan ? "uložiť" : "založiť plán"}
        </button>
        {onJarvis && (
          <button onClick={() => onJarvis(aktualny)} disabled={busy}
            style={{ ...tlacidlo(false), color: C.accentLight, borderColor: mix(C.accent, 0.6) }}>
            prebrať s Jarvisom
          </button>
        )}
        <button onClick={onDoMapy} disabled={busy} style={tlacidlo(false)}>
          do mapy cyklu
        </button>
        {plan && (
          <button
            onClick={async () => {
              if (!mazem) { setMazem(true); return; }
              setBusy(true);
              const ok = await onUloz({ id: plan.id, zmaz: true });
              setBusy(false);
              if (ok) onZavri(); else setMazem(false);
            }}
            disabled={busy}
            style={{ ...tlacidlo(false), color: mazem ? C.red : C.textMuted, borderColor: mazem ? C.red : C.border }}>
            {mazem ? "naozaj vymazať?" : "vymazať"}
          </button>
        )}
        <button onClick={onZavri} disabled={busy} style={{ ...tlacidlo(false), marginLeft: "auto" }}>zrušiť</button>
      </div>
    </div>
  );
}
