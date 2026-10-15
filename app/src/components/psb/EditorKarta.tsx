import { useCallback, useEffect, useRef, useState } from "react";

import { UDALOST_DO_EDITORA, vezmiDvojicu, type DvojicaDoEditora } from "../../lib/psb/doEditora";
import { oznam } from "../../lib/psb/obnovaSignal";
import { C, mix } from "../../lib/psb/theme";
import { VyberMena } from "./VyberMena";

/**
 * KARTA EDITOR vo Workspace (Jerry, 6. 10. 2026): „pridaj ešte jednu kartu
 * editor, tam budú dve možnosti, foto a video; keď kliknem na jedno z nich,
 * otvorí sa editor."
 *
 * Editory sú samostatné stránky (`public/editor/foto.html`, `video.html`,
 * zostavené cez `editor/zostav.py`) — tie isté náčrty, ktoré si Jerry
 * vyskúšal. Tu sa otvoria v rámiku. Editor videa musí byť od fotiek
 * oddelený (jeho slová), spája ich len zásobník snímok: 📷 vo videu →
 * „Snímky z videa" vo fotkách.
 *
 * KLIENT (6. 10. 2026, „napoj editor na kartotéku klienta, nech sa to
 * ukladá"): vyberá sa tu, nad editormi, a obom sa pošle správou
 * (`postMessage`, ten istý pôvod). Editor fotiek z neho berie fotky do
 * polovíc a ukladá porovnanie, editor videa ukladá strih a snímky. Po
 * uložení editor ohlási `psb-ulozene` a kartotéka v profile sa obnoví.
 *
 * Z PROFILU (12. 10. 2026): v kartotéke klienta sa označia dve fotky a
 * „do editora" — karta prepne klienta, otvorí Foto a dvojicu pošle
 * (`psb-dvojica`) do ľavej a pravej polovice (lib/psb/doEditora.ts).
 *
 * CELÁ OBRAZOVKA (Jerry, 12. 10. 2026: „na iPade a telefóne mať možnosť
 * pustiť editor na celú obrazovku"). Editor sa roztiahne cez celý Kokpit
 * (bez hornej lišty a kariet). SYSTÉMOVÁ celá obrazovka prehliadača sa NEPOUŽÍVA
 * (13. 10. 2026: „keď to chcem zrušiť, zasekne sa to, celá obrazovka je
 * zaseknutá, v tme") — s rámikom editora ju Safari/Chrome po zavretí nechávali
 * čiernu a Kokpit ju nevedel zrušiť. Na ploche ako appka (PWA) lišta prehliadača
 * aj tak nie je.
 *
 * Raz otvorený editor ostane načítaný aj po prepnutí na druhý (aj na inú
 * kartu Workspace) — inak by prepnutie zahodilo rozrobenú prácu
 * (pravidlo „Workspace drží prácu").
 */
type Druh = "foto" | "video";

const EDITORY: { druh: Druh; ikona: string; nazov: string; popis: string }[] = [
  { druh: "foto", ikona: "◧", nazov: "Foto", popis: "predtým / potom vedľa seba, výrez, mriežka, prekrytie, čiary a uhly" },
  { druh: "video", ikona: "▶", nazov: "Video", popis: "chôdza a beh — spomalenie, krok po snímke, strih, uhly a 📷 snímky do fotiek" },
];

const KLUC_KLIENTA = "psb-editor-klient";

export function EditorKarta({ mena }: { mena: string[] }) {
  const [otvoreny, setOtvoreny] = useState<Druh | null>(null);
  const [nacitane, setNacitane] = useState<Druh[]>([]);
  const [klient, setKlient] = useState(() => {
    try { return sessionStorage.getItem(KLUC_KLIENTA) || ""; } catch { return ""; }
  });
  const ramiky = useRef<Partial<Record<Druh, HTMLIFrameElement | null>>>({});
  /** Editorom ide len meno, ktoré naozaj patrí klientovi — rozpísané nie. */
  const platny = mena.includes(klient) ? klient : "";
  const posliKlienta = useCallback((d?: Druh) => {
    for (const [k, el] of Object.entries(ramiky.current)) {
      if (d && k !== d) continue;
      el?.contentWindow?.postMessage({ typ: "psb-klient", meno: platny }, location.origin);
    }
  }, [platny]);
  useEffect(() => {
    posliKlienta();
    try { sessionStorage.setItem(KLUC_KLIENTA, platny); } catch { /* len pohodlie */ }
  }, [posliKlienta, platny]);
  // Fotky klientovi odišli a server zmazal jeho rozrobené — editor obnoví zoznam.
  useEffect(() => {
    const f = (e: Event) => {
      const klient = (e as CustomEvent<{ klient: string }>).detail?.klient || "";
      for (const el of Object.values(ramiky.current)) el?.contentWindow?.postMessage({ typ: "psb-navrhy-zmazane", klient }, location.origin);
    };
    window.addEventListener("psb-navrhy-zmazane", f);
    return () => window.removeEventListener("psb-navrhy-zmazane", f);
  }, []);
  // Editor po uložení ku klientovi ohlási zmenu — kartotéka v profile sa obnoví.
  useEffect(() => {
    const na = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      if (e.data?.typ === "psb-ulozene") oznam("fotky");
      if (e.data?.typ === "psb-kto-je-klient") posliKlienta();
      // Otvorený rozrobený návrh patrí klientovi — prepne sa aj tu hore.
      if (e.data?.typ === "psb-nastav-klienta" && typeof e.data.meno === "string" && mena.includes(e.data.meno)) setKlient(e.data.meno);
    };
    addEventListener("message", na);
    return () => removeEventListener("message", na);
  }, [posliKlienta, mena]);
  const otvor = (d: Druh) => {
    setOtvoreny(d);
    setNacitane((n) => (n.includes(d) ? n : [...n, d]));
  };

  // Dvojica z profilu: počká, kým je editor fotiek načítaný, potom ide do polovíc.
  const dvojica = useRef<DvojicaDoEditora | null>(null);
  const fotoNacitane = useRef(false);
  const posliDvojicu = useCallback(() => {
    const d = dvojica.current;
    const el = ramiky.current.foto;
    if (!d || !el?.contentWindow || !fotoNacitane.current) return;
    dvojica.current = null;
    el.contentWindow.postMessage(d.upravit ? { typ: "psb-upravit", id: d.upravit } : { typ: "psb-dvojica", pred: d.pred, po: d.po }, location.origin);
  }, []);
  useEffect(() => {
    const prevezmi = () => {
      const d = vezmiDvojicu();
      if (!d) return;
      dvojica.current = d;
      setKlient(d.klient);
      setOtvoreny("foto");
      setNacitane((n) => (n.includes("foto") ? n : [...n, "foto"]));
      posliDvojicu();
    };
    prevezmi(); // karta sa mohla pripojiť až po udalosti
    addEventListener(UDALOST_DO_EDITORA, prevezmi);
    return () => removeEventListener(UDALOST_DO_EDITORA, prevezmi);
  }, [posliDvojicu]);

  // ── Celá obrazovka ──
  const [cela, setCela] = useState(false);
  const obal = useRef<HTMLDivElement | null>(null);
  const zapniCelu = useCallback(() => setCela(true), []);
  const vypniCelu = useCallback(() => {
    setCela(false);
    // Poistka: keby prehliadač predsa ostal v systémovej celej obrazovke
    // (stará verzia, gesto), zavretie ju ukončí — nikdy nech neostane tma.
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      try { if (d.exitFullscreen) void d.exitFullscreen().catch(() => {}); else d.webkitExitFullscreen?.(); } catch { /* nič */ }
    }
  }, []);
  useEffect(() => {
    if (!cela) return;
    // Kokpit pod editorom sa nemá posúvať; Esc režim zavrie.
    const html = document.documentElement, predtym = html.style.overflow;
    html.style.overflow = "hidden";
    /*
     * `position: fixed` platí voči obrazovke, len kým žiadny rodič nemá
     * transform, filter či backdrop-filter — inak sa roztiahne len cez kartu
     * (Workspace karty majú transform z listovania, sklenená paleta blur).
     * Rámik s editorom sa presunúť nesmie (načítal by sa znova a zahodil
     * rozrobenú prácu), tak sa na chvíľu „vypnú" tie vlastnosti rodičom.
     */
    // Rodičia sa OZNAČIA a pravidlo zo štýlu (!important) im vlastnosti vypne —
    // vyhrá aj nad tým, čo im animácia karty nastaví neskôr (inline bez !important).
    if (!document.getElementById("editor-cela-css")) {
      const st = document.createElement("style");
      st.id = "editor-cela-css";
      st.textContent = "[data-editor-cela-predok]{transform:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;perspective:none!important;will-change:auto!important;contain:none!important;transition:none!important;z-index:2147483000!important}";
      document.head.appendChild(st);
    }
    const predkovia: HTMLElement[] = [];
    for (let el = obal.current?.parentElement; el && el !== document.body; el = el.parentElement) {
      el.setAttribute("data-editor-cela-predok", "");
      predkovia.push(el);
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") vypniCelu(); };
    addEventListener("keydown", esc);
    return () => {
      html.style.overflow = predtym;
      for (const el of predkovia) el.removeAttribute("data-editor-cela-predok");
      removeEventListener("keydown", esc);
    };
  }, [cela, vypniCelu]);

  if (!otvoreny) {
    return (
      <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 320px))", gap: 18, justifyContent: "center", width: "100%" }}>
          {EDITORY.map((e) => (
            <button
              key={e.druh}
              type="button"
              onClick={() => otvor(e.druh)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "26px 24px",
                borderRadius: 16, border: `1px solid ${mix(C.border, 140)}`, background: C.surface, color: C.text,
                fontFamily: "inherit", textAlign: "left", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 34, lineHeight: 1, color: C.accentLight }}>{e.ikona}</span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{e.nazov}</span>
              <span style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.55 }}>{e.popis}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={obal}
      style={cela ? {
        position: "fixed", inset: 0, zIndex: 2147483000, background: C.bg, display: "flex", flexDirection: "column", gap: 6,
        padding: "max(6px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left))",
      } : { flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: cela ? 8 : 10, flexWrap: "wrap" }}>
        <div role="tablist" aria-label="Editor" style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${mix(C.border, 120)}`, background: C.surface }}>
          {EDITORY.map((e) => (
            <button
              key={e.druh}
              type="button"
              role="tab"
              aria-selected={otvoreny === e.druh}
              onClick={() => otvor(e.druh)}
              style={{
                padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                background: otvoreny === e.druh ? mix(C.accent, 22) : "transparent",
                color: otvoreny === e.druh ? C.accentLight : C.textMuted, fontWeight: otvoreny === e.druh ? 700 : 500,
              }}
            >{e.ikona} {e.nazov}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: C.textMuted }}>klient</span>
          <VyberMena
            hodnota={klient} mena={mena} onZmen={setKlient} placeholder="komu to patrí…"
            varovanie={!!klient && !platny}
            style={{ width: 230 }}
          />
        </div>
        {!cela && (
          <span style={{ fontSize: 11.5, color: C.textDim }}>
            {platny
              ? `ukladá sa do kartotéky — ${platny}`
              : "bez klienta sa dá upravovať aj sťahovať, len nie uložiť ku klientovi"}
          </span>
        )}
        <button
          type="button" onClick={cela ? vypniCelu : zapniCelu}
          title={cela ? "Späť do Kokpitu (Esc)" : "Editor cez celú obrazovku"}
          style={{
            marginLeft: "auto", padding: "7px 12px", borderRadius: 9, border: `1px solid ${cela ? C.accent : mix(C.border, 140)}`,
            background: cela ? mix(C.accent, 18) : C.surface, color: cela ? C.accentLight : C.text,
            fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >{cela ? "✕ zavrieť" : "⛶ celá obrazovka"}</button>
      </div>
      <div style={{ position: "relative", flexGrow: 1, minHeight: cela ? 0 : 420, borderRadius: cela ? 8 : 12, overflow: "hidden", border: `1px solid ${mix(C.border, 100)}` }}>
        {nacitane.map((d) => (
          <iframe
            key={d}
            ref={(el) => { ramiky.current[d] = el; }}
            onLoad={() => {
              posliKlienta(d);
              if (d === "foto") { fotoNacitane.current = true; posliDvojicu(); }
            }}
            // Bez .html — Cloudflare assets by ho presmerovali (307) na túto adresu.
            src={`/editor/${d}`}
            title={d === "foto" ? "Editor fotiek" : "Editor videa"}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", border: 0,
              // „inherit", nie „visible": výslovné visible prebije skrytie celej
              // karty v kope a editor presvital cez ostatné karty (Jerry, 6. 10.).
              visibility: d === otvoreny ? "inherit" : "hidden",
            }}
          />
        ))}
      </div>
    </div>
  );
}
