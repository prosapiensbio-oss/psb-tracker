import { useEffect, useMemo, useRef, useState } from "react";

import type { RegisterItem } from "../../lib/psb/compute";
import { adsManagerOdkaz } from "../../lib/psb/kampanPlan";
import { doSchranky } from "../../lib/psb/kopirovanie";
import { oznam } from "../../lib/psb/obnovaSignal";
import { kc, meriaSaDm, suhrnDozoru, type ReklamaPolozka } from "../../lib/psb/reklamaDozor";
import { dnesPraha } from "../../lib/psb/cas";
import { C, S, btn } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, H3 } from "./ui";

const linkBtn = { background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 12, padding: 0 } as const;

async function posli(telo: Record<string, unknown>): Promise<{ ok: boolean; veta?: string; error?: string }> {
  try {
    const r = await fetch("/api/meta", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
    });
    const t = await r.text();
    try { return JSON.parse(t) as { ok: boolean; veta?: string; error?: string }; }
    catch { return { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 300)}` }; }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Tlačidlo „Prompt pre Clauda" — zadanie s ID a číslami do Claude Code. */
function PromptPreClauda({ text }: { text: string }) {
  const [stav, setStav] = useState<"" | "ok" | "chyba">("");
  return (
    <button
      onClick={() => void doSchranky(text).then((ok) => { setStav(ok ? "ok" : "chyba"); setTimeout(() => setStav(""), 2500); })}
      style={{ ...linkBtn, color: stav === "ok" ? C.green : stav === "chyba" ? C.red : C.blue }}
      title="Skopíruje zadanie s ID kampane a číslami — vlož ho do Claude Code"
    >
      {stav === "ok" ? "Skopírované" : stav === "chyba" ? "Schránka odmietla — označ a cmd+C" : "Prompt pre Clauda"}
    </button>
  );
}

/**
 * Rozhodnutie priamo v notifikácii dozoru (10. 10. 2026).
 *
 * „Vypnúť" ide hneď — nič nestojí. „Zmeniť rozpočet" míňa peniaze, preto sa
 * najprv ukáže suma na mesiac a čaká sa na druhé potvrdenie. Každé
 * rozhodnutie sa zapíše aj s číslami, na ktorých stálo, a uzavrie notifikáciu.
 */
export function ReklamaRozhodnutie({ item, onHotovo }: { item: RegisterItem; onHotovo: (poznamka: string) => void }) {
  const r = item.reklama as ReklamaPolozka;
  const [dm, setDm] = useState("");
  const [rozpocetOtvoreny, setRozpocetOtvoreny] = useState(false);
  const [novy, setNovy] = useState(() => String(Math.round((r.dennyRozpocet || 100) * 1.5)));
  const [potvrdRozpocet, setPotvrdRozpocet] = useState(false);
  const [potvrdVypnut, setPotvrdVypnut] = useState<string | null>(null);
  const [beh, setBeh] = useState("");
  const [chyba, setChyba] = useState("");

  const rozhodni = async (kampanId: string, rozhodnutie: "nechat" | "vypnut" | "rozpocet", nazov?: string) => {
    setBeh(`${kampanId}:${rozhodnutie}`);
    setChyba("");
    const dmCislo = dm.trim() === "" ? null : Math.max(0, Math.round(Number(dm)));
    const v = await posli({
      akcia: "rozhodni-kampan", kampanId, rozhodnutie,
      dm: dmCislo, minuteKc: r.cisla?.minuteKc, dopyty: r.cisla?.dopyty,
      novyDenny: rozhodnutie === "rozpocet" ? Number(novy) : undefined,
    });
    setBeh("");
    if (!v.ok) { setChyba(v.error || "Neprešlo — skús znova."); return; }
    oznam("reklama");
    // Pri „bez dopytu" a strope sa vypína po jednej — notifikácia ostáva,
    // kým sa Jerry nerozhodne, že stačilo.
    if (r.druh === "vyhodnot") onHotovo(`${nazov || r.nazov}: ${v.veta}${dmCislo !== null ? ` · DM ${dmCislo}` : ""}`);
    else setChyba(`${nazov}: ${v.veta}`);
    setPotvrdVypnut(null);
    setPotvrdRozpocet(false);
  };

  const novyCislo = Number(novy) || 0;
  const pole = { ...S.input, width: 90, padding: "4px 8px", fontSize: 16 } as const;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
      {r.druh === "vyhodnot" && r.kampanId && (
        <>
          {meriaSaDm(r.ciel || "") && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.textMuted }}>
              Koľko správ (DM) z nej prišlo?
              <input type="number" min={0} inputMode="numeric" value={dm} onChange={(e) => setDm(e.target.value)} style={pole} />
            </label>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => void rozhodni(r.kampanId!, "nechat")} disabled={!!beh} style={{ ...linkBtn, color: C.green }}>
              {beh.endsWith(":nechat") ? "…" : "Nechať bežať"}
            </button>
            {potvrdVypnut === r.kampanId ? (
              <>
                <span style={{ color: C.text }}>Naozaj vypnúť?</span>
                <button onClick={() => void rozhodni(r.kampanId!, "vypnut")} disabled={!!beh} style={{ ...linkBtn, color: C.red }}>
                  {beh.endsWith(":vypnut") ? "vypínam…" : "Áno, vypnúť"}
                </button>
                <button onClick={() => setPotvrdVypnut(null)} style={{ ...linkBtn, color: C.textMuted }}>Nie</button>
              </>
            ) : (
              <button onClick={() => setPotvrdVypnut(r.kampanId!)} disabled={!!beh} style={{ ...linkBtn, color: C.red }}>Vypnúť</button>
            )}
            <button onClick={() => { setRozpocetOtvoreny((o) => !o); setPotvrdRozpocet(false); }} style={{ ...linkBtn, color: rozpocetOtvoreny ? C.accentLight : C.blue }}>
              {rozpocetOtvoreny ? "Zavrieť rozpočet" : "Zmeniť rozpočet"}
            </button>
            <a href={adsManagerOdkaz(r.kampanId)} target="_blank" rel="noreferrer" style={{ ...linkBtn, color: C.textMuted }}>Ads Manager ↗</a>
            <PromptPreClauda text={r.prompt} />
          </div>
          {rozpocetOtvoreny && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: C.textMuted }}>
              Denne z {r.dennyRozpocet ? kc(r.dennyRozpocet) : "—"} na
              <input type="number" min={22} inputMode="numeric" value={novy} onChange={(e) => { setNovy(e.target.value); setPotvrdRozpocet(false); }} style={pole} /> Kč
              {!potvrdRozpocet ? (
                <button onClick={() => setPotvrdRozpocet(true)} disabled={novyCislo < 22} style={{ ...linkBtn, color: C.blue }}>Pokračovať</button>
              ) : (
                <>
                  <span style={{ color: C.text }}>
                    To je ~{kc(novyCislo * 30)} mesačne{r.dennyRozpocet ? ` (doteraz ~${kc(r.dennyRozpocet * 30)})` : ""}. Potvrdiť?
                  </span>
                  <button onClick={() => void rozhodni(r.kampanId!, "rozpocet")} disabled={!!beh} style={{ ...linkBtn, color: C.green }}>
                    {beh.endsWith(":rozpocet") ? "mením…" : "Áno, zmeniť"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {(r.druh === "bezdopytu" || r.druh === "strop" || r.druh === "problem" || r.druh === "stary") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(r.druh === "bezdopytu" || r.druh === "strop") && (r.bezia || []).map((k) => (
            <div key={k.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.text }}>{k.nazov}{k.denny ? ` · ${kc(k.denny)}/deň` : ""}</span>
              {potvrdVypnut === k.id ? (
                <>
                  <button onClick={() => void rozhodni(k.id, "vypnut", k.nazov)} disabled={!!beh} style={{ ...linkBtn, color: C.red }}>
                    {beh === `${k.id}:vypnut` ? "vypínam…" : "Áno, vypnúť"}
                  </button>
                  <button onClick={() => setPotvrdVypnut(null)} style={{ ...linkBtn, color: C.textMuted }}>Nie</button>
                </>
              ) : (
                <button onClick={() => setPotvrdVypnut(k.id)} disabled={!!beh} style={{ ...linkBtn, color: C.red }}>Vypnúť</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {r.kampanId && <a href={adsManagerOdkaz(r.kampanId)} target="_blank" rel="noreferrer" style={{ ...linkBtn, color: C.textMuted }}>Ads Manager ↗</a>}
            <PromptPreClauda text={r.prompt} />
          </div>
        </div>
      )}
      {chyba && <div style={{ color: chyba.includes(": ") && !chyba.startsWith("HTTP") ? C.textMuted : C.red }}>{chyba}</div>}
    </div>
  );
}

/**
 * Karta „Dozor reklám" v Marketing → Náklady — to isté, čo notifikácie,
 * ale aj vtedy, keď sa práve nič nepýta: čo beží, koľko minulo od posledného
 * rozhodnutia, kedy príde ďalšie vyhodnotenie, a nastavenie stropu a cieľa.
 */
export function DozorReklamKarta({ data }: { data: PSBData }) {
  const d = data.reklamaDozor;
  const dnes = dnesPraha();
  const riadky = useMemo(() => (d ? suhrnDozoru(d, data.leads || [], data.anomalyAck || {}, dnes) : []), [d, data.leads, data.anomalyAck, dnes]);
  const [strop, setStrop] = useState(d?.nastavenie.stropMesiac ? String(d.nastavenie.stropMesiac) : "");
  const [ciel, setCiel] = useState(d?.nastavenie.cielDopyt ? String(d.nastavenie.cielDopyt) : "");
  const [stav, setStav] = useState("");
  // Formulár otvorený skôr než dáta by ostal prázdny (pravidlo z 29. 8.):
  // kým sa ho nikto nedotkol, zrkadlí uložené nastavenie.
  const dotknute = useRef(false);
  useEffect(() => {
    if (dotknute.current || !d) return;
    setStrop(d.nastavenie.stropMesiac ? String(d.nastavenie.stropMesiac) : "");
    setCiel(d.nastavenie.cielDopyt ? String(d.nastavenie.cielDopyt) : "");
  }, [d]);

  const stiahni = async () => {
    setStav("sťahujem z Mety…");
    const v = (await posli({ akcia: "dozor" })) as { ok: boolean; error?: string; kampani?: number; dni?: number; problemov?: number; varovania?: string[] };
    if (!v.ok) { setStav(`Nestiahlo sa: ${v.error}`); return; }
    setStav(`Stiahnuté: ${v.kampani} bežiacich kampaní, ${v.dni} dní, ${v.problemov} problémov${v.varovania?.length ? ` · čiastočne: ${v.varovania.join("; ")}` : ""}`);
    oznam("reklama");
  };
  const ulozNastavenie = async () => {
    setStav("ukladám…");
    const v = await posli({ akcia: "dozor-nastavenie", stropMesiac: strop, cielDopyt: ciel });
    setStav(v.ok ? "Uložené." : `Neuložilo sa: ${v.error}`);
    if (v.ok) oznam("reklama");
  };

  const pole = { ...S.input, width: 110, padding: "6px 10px", fontSize: 16 } as const;
  const vyhodnotenia = (d?.vyhodnotenia || []).slice(0, 8);
  const nazvy = new Map((d?.kampane || []).map((k) => [k.id, k.nazov]));

  return (
    <Card>
      <H3>Dozor reklám</H3>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
        Kokpit sa ozve v notifikáciách, keď kampaň beží 7 dní (po „nechať“ 14) alebo minie 1 500 Kč, keď za každých ďalších 1 000 Kč nepríde dopyt z reklamy a keď Meta niečo zamietne.
        {d?.aktualizovane ? ` Naposledy stiahnuté ${new Date(d.aktualizovane).toLocaleString("sk-SK", { timeZone: "Europe/Prague" })}.` : " Ešte nestiahnuté."}
      </div>
      {!riadky.length ? (
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>Žiadna kampaň práve nebeží — dozor mlčí.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {riadky.map((x) => (
            <div key={x.id} style={{ padding: "8px 10px", borderRadius: 8, background: x.cakaNaVyhodnotenie ? C.orangeBg : C.track, fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <b style={{ color: C.text }}>{x.nazov}</b>
                <span style={{ color: C.textMuted }}>{x.ciel}{x.dennyRozpocet ? ` · ${kc(x.dennyRozpocet)}/deň` : ""}{x.bezi ? "" : " · nedoručuje"}</span>
              </div>
              <div style={{ color: C.text, marginTop: 2 }}>
                od {x.obdobie.od.slice(8, 10).replace(/^0/, "")}. {x.obdobie.od.slice(5, 7).replace(/^0/, "")}. ({x.obdobie.dni} dní): {kc(x.minuteKc)} · {x.kliky} klikov · {x.naStranke} na stránke · dopyty s odkazom {x.dopytySOdkazom}{x.dopytyZReklamyBezOdkazu ? ` (+${x.dopytyZReklamyBezOdkazu} z reklamy bez odkazu)` : ""}{x.cenaZaDopyt ? ` · ${kc(x.cenaZaDopyt)} za dopyt` : ""}
              </div>
              <div style={{ color: C.textMuted, marginTop: 2 }}>
                {x.cakaNaVyhodnotenie ? "Čaká na vyhodnotenie (je v notifikáciách). " : `${x.dovod[0].toUpperCase()}${x.dovod.slice(1)}. `}{x.navrh}
              </div>
              {x.problemy.map((p) => <div key={p} style={{ color: C.red, marginTop: 2 }}>⚠ {p}</div>)}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: C.textMuted }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Mesačný strop <input type="number" min={0} inputMode="numeric" value={strop} onChange={(e) => { dotknute.current = true; setStrop(e.target.value); }} placeholder="bez stropu" style={pole} /> Kč
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Cieľová cena za dopyt <input type="number" min={0} inputMode="numeric" value={ciel} onChange={(e) => { dotknute.current = true; setCiel(e.target.value); }} placeholder="nezadaná" style={pole} /> Kč
        </label>
        <button onClick={() => void ulozNastavenie()} style={btn("outline")}>Uložiť</button>
        <button onClick={() => void stiahni()} style={btn("outline")}>Stiahnuť teraz</button>
      </div>
      {stav && <div style={{ fontSize: 12, color: stav.startsWith("Nes") || stav.startsWith("Neu") ? C.red : C.textMuted, marginTop: 6 }}>{stav}</div>}
      {vyhodnotenia.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
          <summary style={{ cursor: "pointer" }}>Posledné rozhodnutia ({vyhodnotenia.length})</summary>
          {vyhodnotenia.map((v) => (
            <div key={`${v.kampanId}${v.kedy}`} style={{ marginTop: 4 }}>
              {v.kedy.slice(0, 10)} · {nazvy.get(v.kampanId) || v.kampanId}: {v.rozhodnutie === "nechat" ? "nechať" : v.rozhodnutie === "vypnut" ? "vypnúť" : `rozpočet → ${v.rozpocetPo} Kč/deň`}
              {v.minuteKc !== null ? ` · pri ${kc(v.minuteKc)}` : ""}{v.dopyty !== null ? `, ${v.dopyty} dopytov` : ""}{v.dm !== null ? `, ${v.dm} DM` : ""}
            </div>
          ))}
        </details>
      )}
    </Card>
  );
}
