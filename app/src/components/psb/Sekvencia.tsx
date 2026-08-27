import { useEffect, useMemo, useRef, useState } from "react";

import {
  DLZKA_PODLA_FAZY, pocetZaberov, skontrolujSekvenciu, ZABER_SEK, type Krok,
} from "../../lib/psb/sekvencia";
import { C, mix } from "../../lib/psb/theme";
import { ZABERY, ZABER_MAPA } from "../../lib/psb/zabery";
import { ZaberUkazka } from "./ZaberUkazka";
import { Info, Select } from "./ui";

/**
 * Rozpis záberov k hotovému textu.
 *
 * PREČO TO SEDÍ AŽ POD HOTOVÝM TEXTOM
 *
 * Zábery sa priraďujú k VETÁM. Kým text nie je, niet čoho sa chytiť — a rozpis
 * spravený dopredu by text tlačil do tvaru, ktorý mu nesedí.
 *
 * PREČO KONTROLU ROBÍ APPKA
 *
 * Dva rovnaké pohyby za sebou buď sú, alebo nie sú — to sa dá spočítať. Model
 * by to posúdil zakaždým trochu inak a raz za čas prehliadol.
 */
export function Sekvencia({ faza, hotovyText, scenar, hodnota, onZmena }: {
  faza: number;
  hotovyText: string;
  /** Scenár — vety, ku ktorým sa zábery priraďujú. */
  scenar?: string;
  /** JSON pole Krok. */
  hodnota: string;
  onZmena: (json: string) => void;
}) {
  const [navrhujem, setNavrhujem] = useState(false);
  const [hlaska, setHlaska] = useState("");
  /** Text, na ktorom už rozpis bežal sám. Bez toho by sa opakoval donekonečna. */
  const uzSkusene = useRef("");

  /**
   * Nechá rozpis navrhnúť Jarvisa.
   *
   * Priradiť záber k vete nie je tvorivá práca — je to remeslo s pravidlami,
   * ktoré Jarvis pozná. PREPÍŠE to, čo tam je: keby sa návrh pridával
   * k existujúcemu, vznikla by zmes dvoch rozpisov a nikto by nevedel, ktorý
   * je ktorý.
   */
  async function nechNavrhne(): Promise<boolean> {
    const text = zdrojViet.trim();
    if (navrhujem) return false;
    setNavrhujem(true);
    setHlaska("Jarvis rozpisuje…");
    try {
      const r = await fetch("/api/sekvencia-navrh", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenar: text, faza }),
      });
      const o = (await r.json()) as { ok?: boolean; error?: string; kroky?: Krok[]; zahodene?: string[] };
      if (!o.ok || !o.kroky?.length) { setHlaska(o.error || "Návrh sa nepodaril."); return false; }
      onZmena(JSON.stringify(o.kroky));
      setHlaska(o.zahodene?.length
        ? `navrhnuté ✓ — ${o.zahodene.length} ${o.zahodene.length === 1 ? "záber sa nerozpoznal a ostal" : "záberov sa nerozpoznalo a ostali"} prázdne`
        : "navrhnuté ✓");
      return true;
    } catch {
      setHlaska("Návrh zlyhal — spojenie.");
      return false;
    } finally {
      setNavrhujem(false);
    }
  }
  const kroky = useMemo<Krok[]>(() => {
    if (!hodnota) return [];
    try {
      const p = JSON.parse(hodnota);
      return Array.isArray(p) ? (p as Krok[]) : [];
    } catch { return []; }
  }, [hodnota]);

  const [otvorene, setOtvorene] = useState(kroky.length > 0);
  const dlzka = DLZKA_PODLA_FAZY[faza];
  const ciel = dlzka ? Math.round((dlzka.min + dlzka.max) / 2) : 20;
  const rozsah = pocetZaberov(dlzka?.max ?? 20);
  const spolu = kroky.reduce((s, k) => s + (k.sekund || 0), 0);
  const nalezy = useMemo(() => skontrolujSekvenciu(kroky, ciel), [kroky, ciel]);

  // Vety z hotového textu — z nich sa vyberá, čo ku ktorému záberu patrí.
  /**
   * Vety, ku ktorým sa zábery priraďujú.
   *
   * SCENÁR má prednosť pred captionom: zábery patria k tomu, čo Jerry HOVORÍ
   * na kameru, nie k tomu, čo je napísané pod príspevkom. Sú to dva rôzne
   * texty — scenár je po slovensky, caption po česky. Rozdelil som ich na dva
   * parametre kvôli Jarvisovi a málem tým túto prednosť zahodil.
   */
  const zdrojViet = (scenar || "").trim() || hotovyText;
  /**
   * Rozpis nabehne SÁM.
   *
   * Doteraz sa čakalo na tlačidlo, hoci v momente, keď je scenár a rozpis
   * prázdny, existuje len jedna rozumná vec, ktorú spraviť. Jerry: „mal by to
   * už automaticky spraviť Jarvis, nie až po stlačení tlačidla" (26. 8. 2026).
   *
   * Tri poistky, aby to nebolo otravné ani drahé: beží len keď je rozpis
   * PRÁZDNY (nikdy neprepíše hotovú prácu), len raz na ten istý text, a len
   * keď je z čoho vychádzať. Tlačidlo zostáva — na prerobenie.
   */
  useEffect(() => {
    const text = zdrojViet.trim();
    if (!text || kroky.length > 0 || navrhujem) return;
    if (uzSkusene.current === text) return;
    uzSkusene.current = text;
    void nechNavrhne().then((slo) => {
      setOtvorene(true);
      // Neúspech sa NEZAPAMÄTÁ. Prvý automatický pokus raz vrátil 502 a bez
      // tohto by rozpis ostal navždy prázdny — pri ďalšom otvorení sa skúsi
      // znova. Slučka nehrozí: efekt sa spúšťa zmenou textu, nie tejto značky.
      if (!slo) uzSkusene.current = "";
      else setTimeout(() => setHlaska(""), 6000);
    });
  }, [zdrojViet, kroky.length]);

  const vety = useMemo(() => zdrojViet
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 2), [zdrojViet]);

  const zapis = (n: Krok[]) => onZmena(n.length ? JSON.stringify(n) : "");
  const uprav = (i: number, zmena: Partial<Krok>) =>
    zapis(kroky.map((k, j) => (j === i ? { ...k, ...zmena } : k)));
  const pridaj = () => zapis([...kroky, { zaber: "", co: "", veta: "", sekund: ZABER_SEK.ideal }]);
  const zmaz = (i: number) => zapis(kroky.filter((_, j) => j !== i));
  const posun = (i: number, smer: -1 | 1) => {
    const j = i + smer;
    if (j < 0 || j >= kroky.length) return;
    const n = [...kroky];
    [n[i], n[j]] = [n[j], n[i]];
    zapis(n);
  };

  const vstup = {
    background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12,
    border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px",
    boxSizing: "border-box" as const, width: "100%",
  };

  if (!otvorene) {
    return (
      <div style={{ marginTop: 14 }}>
        <button onClick={() => { setOtvorene(true); if (!kroky.length) pridaj(); }}
          disabled={!zdrojViet.trim()}
          style={{
            background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "7px 12px", fontSize: 12, fontFamily: "inherit",
            color: zdrojViet.trim() ? C.accentLight : C.textDim,
            cursor: zdrojViet.trim() ? "pointer" : "default",
          }}>
          rozpísať zábery{!zdrojViet.trim() && " — najprv vlož scenár alebo text"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
          Sekvencia záberov
          <Info text={
            "Odporúčaná dĺžka vychádza z VAŠICH čísel: 79 meraných príspevkov, medián času sledovania 12,7 s na jedno pozretie, " +
            "75 % pod 16,1 s. Čo je za tým, to nikto neuvidí. Líši sa podľa fázy, lebo divák, ktorý o probléme nevie, nemá dôvod vydržať, " +
            "kým ten, čo sa rozhoduje, hľadá dôkaz a vydrží. Počet záberov vychádza z toho, že najvýkonnejšie krátke videá strihajú každé 2–4 s " +
            "a divák potrebuje asi 3 s, aby záber vstrebal. Pozor: dlhšie sledované príspevky u vás NEMAJÚ viac uložení — dĺžka je odporúčanie, nie cieľ."
          } />
        </div>
        <button onClick={() => void nechNavrhne().then((slo) => { if (slo) setTimeout(() => setHlaska(""), 6000); })} disabled={navrhujem || !zdrojViet.trim()}
          title={zdrojViet.trim() ? "" : "Najprv napíš scenár"}
          style={{
            background: "none", border: 0, padding: 0, color: C.accentLight, fontSize: 11.5,
            fontFamily: "inherit", cursor: navrhujem ? "default" : "pointer",
            opacity: navrhujem || !zdrojViet.trim() ? 0.5 : 1,
          }}>
          {navrhujem ? "Jarvis rozpisuje…" : "nech zábery rozpíše Jarvis"}
        </button>
        <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
          cieľ {dlzka?.min}–{dlzka?.max} s · {rozsah.min}–{rozsah.max} záberov ·
          <b style={{ color: spolu > (dlzka?.max ?? 99) ? C.red : C.text }}> teraz {spolu} s</b>
        </div>
        {hlaska && (
          <div style={{ fontSize: 11.5, color: hlaska.includes("✓") ? C.textMuted : C.orange, width: "100%" }}>
            {hlaska}
            {!hlaska.includes("✓") && !navrhujem && (
              <button onClick={() => setHlaska("")}
                style={{ background: "none", border: 0, padding: 0, marginLeft: 8, color: C.textDim, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                skryť
              </button>
            )}
          </div>
        )}
      </div>
      {dlzka && <div style={{ fontSize: 11, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>{dlzka.preco}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {kroky.map((k, i) => {
          const z = ZABER_MAPA.get(k.zaber);
          const mojeNalezy = nalezy.filter((n) => n.index === i);
          return (
            <div key={i} style={{
              display: "flex", gap: 10, padding: 10, borderRadius: 8, alignItems: "flex-start",
              background: mix(C.accent, 0.04),
              border: `1px solid ${mojeNalezy.some((n) => n.tvrdy) ? C.red : mix(C.border, 0.9)}`,
            }}>
              <div style={{ fontSize: 11, color: C.textDim, width: 16, paddingTop: 6, flex: "0 0 auto" }}>{i + 1}</div>

              <div style={{ flex: "0 0 auto", width: 96 }}>
                {z ? <ZaberUkazka pohyb={z.pohyb} vyska={54} /> : (
                  <div style={{ height: 54, display: "flex", alignItems: "center", fontSize: 10.5, color: C.textDim }}>
                    vyber záber
                  </div>
                )}
              </div>

              <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: "1 1 auto" }}>
                    <Select value={k.zaber} onChange={(v) => uprav(i, { zaber: v })}
                      options={[{ value: "", label: "— záber —" }, ...ZABERY.map((x) => ({ value: x.id, label: x.nazov }))]} />
                  </div>
                  <input type="number" min={1} max={30} value={k.sekund}
                    onChange={(e) => uprav(i, { sekund: Number(e.target.value) })}
                    style={{ ...vstup, width: 58 }} aria-label="sekúnd" />
                </div>
                <input value={k.co} onChange={(e) => uprav(i, { co: e.target.value })}
                  placeholder="čo je vidieť" style={vstup} />
                {vety.length > 0 && (
                  <Select value={k.veta} onChange={(v) => uprav(i, { veta: v })}
                    // Vlastná veta kroku sa doplní, aj keď v rozpise viet nie je.
                    // Jarvis zlúči staccato riadky („Plank. Skľapovačky. Mŕtvy ťah.")
                    // do jedného záberu — a to je filmársky správne. Bez tohto by sa
                    // taký krok tváril ako nepriradený a Jerry by ho vyberal znova.
                    options={[
                      { value: "", label: "— veta z textu —" },
                      ...(k.veta && !vety.includes(k.veta) ? [k.veta] : []).concat(vety)
                        .map((v) => ({ value: v, label: v.length > 58 ? v.slice(0, 58) + "…" : v })),
                    ]} />
                )}
                {mojeNalezy.map((n, j) => (
                  <div key={j} style={{ fontSize: 11, color: n.tvrdy ? C.red : C.textMuted, lineHeight: 1.4 }}>
                    {n.tvrdy ? "✕ " : "· "}{n.text}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "0 0 auto" }}>
                {[["↑", -1], ["↓", 1]].map(([z2, s]) => (
                  <button key={z2 as string} onClick={() => posun(i, s as -1 | 1)}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.textDim, fontSize: 11, cursor: "pointer", padding: "1px 5px", fontFamily: "inherit" }}>
                    {z2 as string}
                  </button>
                ))}
                <button onClick={() => zmaz(i)}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.textDim, fontSize: 11, cursor: "pointer", padding: "1px 5px", fontFamily: "inherit" }}>×</button>
              </div>
            </div>
          );
        })}
      </div>

      {nalezy.filter((n) => n.index === -1).map((n, i) => (
        <div key={i} style={{ fontSize: 11.5, color: n.tvrdy ? C.red : C.textMuted, marginTop: 8 }}>
          {n.tvrdy ? "✕ " : "· "}{n.text}
        </div>
      ))}

      <button onClick={pridaj}
        style={{ marginTop: 10, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "inherit", color: C.textMuted, cursor: "pointer" }}>
        + záber
      </button>
    </div>
  );
}
