import { useEffect, useMemo, useState } from "react";

import { WEB_STRANKY , marketingVerzia } from "../../lib/psb/marketing";
import { MIN_DENNE_KC, MIN_STROP_KC, OBLASTI, OKRUH_MAX_KM, OKRUH_MIN_KM, UCET_REKLAM, navrhNazvu, pripravKampan, type CielKampane, type Oblast } from "../../lib/psb/kampanPlan";
import { C, mix, S } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

// ── Pripraviť kampaň ─────────────────────────────────────────────────────────
//
// Jerry, 19. 8. 2026: „chcem vyskúšať naplánovať takúto kampaň priamo
// z Kokpitu." Karta je preto plánovacia, nie spúšťacia: appka kampaň založí
// POZASTAVENÚ a spustenie zostáva v Meta Ads Manageri. Rozdiel medzi tými
// dvomi tlačidlami sú peniaze, tak nie sú na jednej obrazovke.
//
// Appka vyplní všetko vrátane kreatívy a reklamy (text + nahraté médium);
// v Mete ostáva len SPUSTENIE.
/**
 * Jerry, 19. 8. 2026: „pripraviť kampaň mi môžeš dať do Jarvisa ako
 * samostatné okno, lebo ja by som kampane chcel pripravovať aj na základe
 * rozhovoru s ním."
 *
 * Preto je to jeden komponent a dve miesta. `akoKarta` rozhoduje len o
 * obale — v Marketingu je to karta medzi ostatnými, v Jarvisovi panel pod
 * hlavičkou. Formulár, pravidlá aj poistky sú tie isté; dve kópie formulára
 * by znamenali, že jedna raz zabudne na strop výdavkov.
 */
export type NavrhKampane = {
  ciel?: CielKampane;
  stranka?: string;
  denneKc?: number;
  nazov?: string;
  /** Nepovinné — Jarvis ich doplní, keď z debaty vyplynú. */
  stropKc?: number;
  dni?: number;
};

export function PripravitKampan({ akoKarta = true, navrh }: { akoKarta?: boolean; navrh?: NavrhKampane | null }) {
  const [ciel, setCiel] = useState<CielKampane>("navstevnost");
  const [stranka, setStranka] = useState("");
  const [denne, setDenne] = useState(String(MIN_DENNE_KC));
  /**
   * Dva spôsoby, ako povedať to isté — a človek uvažuje v tom druhom.
   *
   * Jerry, 19. 8. 2026: „čo keby chcem pri kampani nastaviť celkovú sumu,
   * ktorú chcem dať za reklamu?" Meta to vie (`lifetime_budget`), len k tomu
   * potrebuje pevný koniec. Predvolený zostáva denný režim, lebo tak appka
   * fungovala doteraz a existujúce návrhy z Jarvisa nesú dennú sumu.
   */
  const [rezimRozpoctu, setRezimRozpoctu] = useState<"denne" | "celkom">("denne");
  const [celkom, setCelkom] = useState("2000");
  const [strop, setStrop] = useState(String(MIN_STROP_KC));
  const [oblast, setOblast] = useState<Oblast>("cz");
  // Mesto + okruh. Pre štúdio v Brne je celá krajina priširoká — človek
  // z Ostravy na tréning nepríde. Meta nepozná „Brno" ako text, chce svoj
  // kľúč, takže sa mesto musí vyhľadať.
  const [hladaneMesto, setHladaneMesto] = useState("");
  const [mesta, setMesta] = useState<{ key: string; nazov: string; kraj: string; krajina: string }[]>([]);
  const [mesto, setMesto] = useState<{ key: string; nazov: string } | null>(null);
  const [okruh, setOkruh] = useState("25");
  // Dva režimy: nová kampaň (text + médium → celá reklama) alebo
  // propagácia hotového príspevku (obrázok/video aj text z Instagramu).
  // Jerry, 19. 8. 2026:
  // „čo keby chcem propagovať nejaký príspevok?"
  const [rezim, setRezim] = useState<"nova" | "prispevok">("nova");
  const [prispevky, setPrispevky] = useState<{ id: string; datum: string; hook: string; dosah: number; ulozenia: number }[]>([]);
  const [prispevok, setPrispevok] = useState("");
  const [stahujem, setStahujem] = useState(false);
  const [chybaStiahnutia, setChybaStiahnutia] = useState("");
  /**
   * Text reklamy. Do 19. 8. 2026 sa dopisoval v Mete, lebo appka kreatívu
   * vyrobiť nevedela — `/adcreatives` vracalo `(#3) capability`. Nebola to
   * chyba práv tokenu: facebooková aplikácia Kokpit stála v režime
   * „Development" a po jej publikovaní kreatíva prejde.
   *
   * Zostáva voliteľný. Prázdny znamená to, čo appka robila doteraz —
   * kampaň a sadu ako kostru. Vyplnený znamená hotovú reklamu.
   */
  const [textReklamy, setTextReklamy] = useState("");
  const [nadpis, setNadpis] = useState("");
  /**
   * Obrázok alebo video k novej reklame.
   *
   * Nahráva sa SAMOSTATNE a hneď pri výbere súboru, nie až pri zakladaní:
   * je to najpomalší krok a keby padol uprostred, zostali by v účte prázdne
   * kampane. Appka si odloží len odtlačok (obrázok) alebo id (video) a ten
   * pošle spolu so zvyškom.
   */
  const [medium, setMedium] = useState<{ typ: "obrazok" | "video"; hash?: string; videoId?: string; nahlad?: string; meno: string } | null>(null);
  const [nahravam, setNahravam] = useState(false);
  const [chybaMedia, setChybaMedia] = useState("");
  const [dni, setDni] = useState("");
  const [nazov, setNazov] = useState("");
  const [robim, setRobim] = useState(false);
  /**
   * Návrh z rozhovoru prepíše formulár, keď príde nový.
   *
   * Kľúč je celý návrh, nie jeho existencia: keď Jarvis v debate navrhne
   * druhú kampaň, formulár sa má prepísať na ňu. Bez toho by sa vyplnil raz
   * a ďalšie návrhy by ticho nič nerobili.
   */
  const klucNavrhu = navrh ? JSON.stringify(navrh) : "";
  useEffect(() => {
    if (!navrh) return;
    if (navrh.ciel) setCiel(navrh.ciel);
    if (navrh.stranka) setStranka(navrh.stranka);
    if (navrh.denneKc) setDenne(String(navrh.denneKc));
    if (navrh.nazov) setNazov(navrh.nazov);
    if (navrh.stropKc) setStrop(String(navrh.stropKc));
    if (navrh.dni) setDni(String(navrh.dni));
  }, [klucNavrhu]); // eslint-disable-line react-hooks/exhaustive-deps

  const [hlaska, setHlaska] = useState<{ ok: boolean; text: string } | null>(null);
  const [kampane, setKampane] = useState<{ id: string; nazov: string; stav: string; stavSad: string }[]>([]);
  const [dopytovTyzdenne, setDopytovTyzdenne] = useState<number | null>(null);

  // Čo práve beží — kontext pre toho, kto ide zakladať ďalšiu kampaň.
  useEffect(() => {
    void fetch("/api/meta", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kampane?: { id: string; nazov: string; stav?: string; stav_sad?: string }[]; dopytovTyzdenne?: number }) => {
        if (typeof j.dopytovTyzdenne === "number") setDopytovTyzdenne(j.dopytovTyzdenne);
        const podlaId = new Map<string, { id: string; nazov: string; stav: string; stavSad: string }>();
        for (const k of j.kampane || []) {
          podlaId.set(k.id, { id: k.id, nazov: k.nazov, stav: k.stav || "", stavSad: k.stav_sad || "" });
        }
        setKampane([...podlaId.values()]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // `co=instagram`, nie `co=prispevky` — to druhé API nepozná a odpovie
    // úplne iným tvarom. Zoznam príspevkov preto zostával prázdny a vyzeralo
    // to, akoby appka žiadne nemala; pritom ich vracala 265 (Jerry, 19. 8.).
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prispevky?: { id: string; datum: string; hook: string; dosah: number; ulozenia: number }[] }) => {
        setPrispevky((j.prispevky || []).slice(0, 30));
      })
      .catch(() => {});
  }, []);

  // Hľadá sa až od dvoch znakov a s odkladom — inak by každé písmeno
  // znamenalo volanie do Mety.
  useEffect(() => {
    if (hladaneMesto.trim().length < 2) { setMesta([]); return; }
    const t = setTimeout(() => {
      void fetch("/api/meta", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "mesta", q: hladaneMesto.trim() }),
      }).then((r) => r.json()).then((j: { mesta?: typeof mesta }) => setMesta(j.mesta || [])).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [hladaneMesto]);

  const bezia = kampane.filter((k) => k.stavSad === "bezi");
  const zapnute = kampane.filter((k) => (k.stav || "").toUpperCase() === "ACTIVE");

  const stranky = useMemo(() => {
    const zoznam = WEB_STRANKY.map((x) => x.url).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const uvodny = zoznam.find((u) => /uvodni-trenink/.test(u));
    return uvodny ? [uvodny, ...zoznam.filter((u) => u !== uvodny)] : zoznam;
    // marketingVerzia(): WEB_STRANKY plní import mimo Reactu — bez verzie
    // v deps memo zamrzne nad prázdnym skladom, keď človek otvorí kartu skôr,
    // než dobehne /api/marketing (tá istá chyba ako PlanObsahu, 18. 8.).
  }, [marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  const cielovaStranka = stranka || stranky[0] || "";
  const mesiac = new Date().toISOString().slice(0, 7);
  const menoKampane = nazov || navrhNazvu(ciel, cielovaStranka, mesiac);

  /**
   * Prepočet na druhú stranu. Nie je to kontrola — tú robí `pripravKampan` —
   * je to odpoveď na otázku, ktorú si človek kladie pri písaní čísla:
   * „a koľko to teda bude?" Bez počtu dní sa pri dennom režime povedať nedá,
   * tak sa vtedy mlčí namiesto hádania.
   */
  const prepocet = useMemo((): { text: string; varovanie: boolean } | null => {
    const d = Number(dni) || 0;
    const kc = (s: number) => Math.round(s).toLocaleString("sk");
    if (rezimRozpoctu === "celkom") {
      const c = Number(celkom.replace(",", ".")) || 0;
      if (!c) return null;
      if (!d) return { text: "Doplň, koľko dní má kampaň bežať — bez toho sa suma nedá rozvrhnúť.", varovanie: true };
      const naDen = c / d;
      return naDen < MIN_DENNE_KC
        ? {
          text: `${kc(c)} Kč na ${d} dní je ${naDen.toFixed(0)} Kč na deň — pod minimom ${MIN_DENNE_KC} Kč. `
            + `Zvýš sumu na ${kc(MIN_DENNE_KC * d)} Kč, alebo skráť na ${Math.floor(c / MIN_DENNE_KC)} dní.`,
          varovanie: true,
        }
        : { text: `= ${naDen.toFixed(0)} Kč na deň počas ${d} dní.`, varovanie: false };
    }
    const den = Number(denne.replace(",", ".")) || 0;
    if (!den || !d) return null;
    return { text: `= ${kc(den * d)} Kč celkom za ${d} dní.`, varovanie: false };
  }, [rezimRozpoctu, celkom, denne, dni]);

  const plan = pripravKampan({
    nazov: menoKampane, ciel, stranka: cielovaStranka,
    denneKc: Number(denne.replace(",", ".")) || 0,
    stropKc: Number(strop.replace(",", ".")) || 0,
    rezimRozpoctu,
    celkomKc: Number(celkom.replace(",", ".")) || 0,
    dni: Number(dni) || 0,
    ...(dopytovTyzdenne === null ? {} : { dopytovTyzdenne }),
    // Cena za dopyt z posledných 12 mesiacov — 2 200 Kč je strop, s ktorým
    // appka počíta na karte Čo priniesla reklama.
    cenaZaDopytKc: 2200,
  });

  const propaguj = async () => {
    setRobim(true); setHlaska(null);
    try {
      const j = await fetch("/api/meta", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          akcia: "propaguj-prispevok", mediaId: prispevok, oblast,
          denneKc: Number(denne.replace(",", ".")) || 0, dni: Number(dni) || 7,
          odkaz: znackovanyOdkazPreCiel(), nazov: menoKampane,
        }),
      }).then((r) => r.json()).catch(() => null);
      setHlaska(j?.ok && j.reklamaId
        ? {
          ok: true,
          text: j.cesta === "boost"
            ? `Hotovo a POZASTAVENÉ: kampaň ${j.kampanId}, sada ${j.sadaId}, reklama ${j.reklamaId}. Reklamou sa stal TEN ISTÝ príspevok — lajky a komentáre si nesie so sebou a zbiera ďalšie. Spustíš ju v Mete.`
            : `Hotovo a POZASTAVENÉ: kampaň ${j.kampanId}, sada ${j.sadaId}, reklama ${j.reklamaId}. Pravý boost Meta nepustila (chýba Full Access), tak appka z príspevku vzala ${j.video ? "celé video" : j.kariet > 1 ? `všetkých ${j.kariet} obrázkov` : "obrázok"} aj text a poskladala ${j.video ? "video reklamu" : j.kariet > 1 ? "karuselovú reklamu" : "rovnako vyzerajúcu reklamu"} — je ale NOVÁ, takže lajky a komentáre pôvodného príspevku nemá. Spustíš ju v Mete.`,
        }
        : { ok: false, text: `Nepodarilo sa: ${j?.chyba || j?.error || "server neodpovedal"}` });
    } finally { setRobim(false); }
  };

  const zaloz = async () => {
    setRobim(true); setHlaska(null);
    try {
      const j = await fetch("/api/meta", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          akcia: "zaloz-kampan", nazov: menoKampane, ciel, stranka: cielovaStranka,
          denneKc: Number(denne.replace(",", ".")) || 0, stropKc: Number(strop.replace(",", ".")) || 0,
          rezimRozpoctu, celkomKc: Number(celkom.replace(",", ".")) || 0,
          oblast, dni: Number(dni) || 0,
          mestoKey: mesto?.key || "", okruhKm: Number(okruh) || 25,
          text: textReklamy, nadpis,
          imageHash: medium?.hash || "", videoId: medium?.videoId || "", nahlad: medium?.nahlad || "",
        }),
      }).then((r) => r.json()).catch(() => null);
      setHlaska(j?.ok
        ? {
          ok: true,
          text: j.reklamaId
            ? `Hotové celé a POZASTAVENÉ: kampaň ${j.id} · sada ${j.sadaId} · reklama ${j.reklamaId}. Text aj odkaz sú v nej — chýba už len obrázok alebo video, to sa dopĺňa v Mete. Spúšťaš ju ty.`
            : j.chybaReklamy
              ? `Kampaň ${j.id} aj sada ${j.sadaId} sú POZASTAVENÉ a v poriadku, ale REKLAMA NEPREŠLA: ${j.chybaReklamy}. Text dopíš v Mete.`
              : j.sadaId
                ? `Hotovo: kampaň ${j.id} + sada reklám ${j.sadaId}, obe POZASTAVENÉ. Chýba posledné poschodie — KREATÍVA (obrázok alebo video a text). Kým ju v Mete nedoplníš, nemá sa čo ukázať a dopyt vzniknúť nemôže.`
                : `Kampaň ${j.id} vznikla, ale SADA REKLÁM NEPREŠLA: ${j.chybaSady || "bez dôvodu"}. Kampaň bez sady neukáže nikomu nič — dorob ju v Mete alebo skús znova.`,
        }
        : { ok: false, text: `Nezaložila sa: ${j?.error || "server neodpovedal"}` });
    } finally { setRobim(false); }
  };

  const znackovanyOdkazPreCiel = () => plan.ok ? (plan.odkaz || "") : "";

  const pole: React.CSSProperties = { ...S.input, marginBottom: 0, fontSize: 11.5, padding: "6px 8px" };
  const prepinac = (c: CielKampane, popis: string) => (
    <button key={c} onClick={() => setCiel(c)}
      style={{ padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5,
        border: `1px solid ${ciel === c ? C.accent : C.border}`,
        background: ciel === c ? mix(C.accent, 14) : "transparent",
        color: ciel === c ? C.accentLight : C.textMuted }}>{popis}</button>
  );

  const obsah = (
    <>
      <H3><Info label="Pripraviť kampaň" text="Appka založí kampaň v Mete VŽDY pozastavenú a s rozpočtovým stropom. Spustenie zostáva v Meta Ads Manageri — to je poistka, nie nedorobok. Od 19. 8. 2026 vyrobí aj sadu, kreatívu a reklamu: pri novej kampani z textu, ktorý napíšeš, pri propagácii z obrázka a textu vybraného príspevku. Obrázok alebo video k vlastnej reklame sa dopĺňa v Mete — nahrávať ich appka nevie." /></H3>

      {/* Prvá veta, ktorú človek nad zakladaním kampane potrebuje: beží už
          niečo? Prepínač kampane na to NEODPOVEDÁ — 19. 8. 2026 bolo 37
          kampaní zapnutých a nebežala ani jedna. */}
      {kampane.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8, lineHeight: 1.55 }}>
          {bezia.length === 0
            ? <>Teraz <b style={{ color: C.text }}>nebeží žiadna kampaň</b>{zapnute.length > 0 && <> — {zapnute.length} je síce zapnutých, ale ich sady reklám dobehli</>}.</>
            : <>Práve beží <b style={{ color: C.text }}>{bezia.length === 1 ? "1 kampaň" : `${bezia.length} kampaní`}</b>: {bezia.slice(0, 3).map((k) => k.nazov).join(" · ")}{bezia.length > 3 ? " …" : ""}</>}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "10px 0" }}>
        <button onClick={() => setRezim("nova")} style={{ padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, border: `1px solid ${rezim === "nova" ? C.accent : C.border}`, background: rezim === "nova" ? mix(C.accent, 14) : "transparent", color: rezim === "nova" ? C.accentLight : C.textMuted }}>Nová kampaň</button>
        <button onClick={() => setRezim("prispevok")} style={{ padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, border: `1px solid ${rezim === "prispevok" ? C.accent : C.border}`, background: rezim === "prispevok" ? mix(C.accent, 14) : "transparent", color: rezim === "prispevok" ? C.accentLight : C.textMuted }}>Propagovať príspevok</button>
      </div>

      {rezim === "prispevok" && (
        <div style={{ marginBottom: 8 }}>
          <select value={prispevok} onChange={(e) => setPrispevok(e.target.value)} style={{ ...pole, width: "100%" }}>
            <option value="">vyber príspevok z Instagramu…</option>
            {prispevky.map((p2) => (
              <option key={p2.id} value={p2.id}>
                {p2.datum?.slice(0, 10)} · {(p2.hook || "bez textu").slice(0, 60)} · dosah {p2.dosah}{p2.ulozenia ? ` · ${p2.ulozenia} uložení` : ""}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
            Príspevok už kreatívu MÁ — obrázok aj text sú tie, ktoré na Instagrame vidíš. Appka k nemu vyrobí
            kampaň, sadu aj reklamu, všetko pozastavené. Karusel prenesie so všetkými kartami.
            {/* Zoznam je z poslednej stiahnutej dávky, nie živý — Instagram sa
                sťahuje na klik, nie sám. Bez tohto tlačidla by sa nový príspevok
                dal pridať len cez Mesiac → Dáta a uzávierka a nikto by nevedel
                prečo tam nie je (Jerry, 19. 8. 2026). */}
            <button onClick={() => {
              setStahujem(true); setChybaStiahnutia("");
              void fetch("/api/meta", {
                method: "POST", credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ akcia: "instagram" }),
              }).then((r) => r.json())
                // Sťahovanie je ZÁPIS do ig_prispevky — zlyhanie sa musí
                // povedať, inak „nič nové" a „nepodarilo sa" vyzerajú rovnako
                // (revízia 19. 8. 2026).
                .then((j: { ok?: boolean; error?: string }) => {
                  if (j.ok === false) throw new Error(j.error || "Meta neodpovedala.");
                  return fetch("/api/meta?co=instagram", { credentials: "same-origin" });
                })
                .then((r) => r.json())
                .then((j: { prispevky?: typeof prispevky }) => setPrispevky((j.prispevky || []).slice(0, 30)))
                .catch((e) => setChybaStiahnutia(`Stiahnutie zlyhalo: ${String((e as Error).message || e).slice(0, 160)}`))
                .finally(() => setStahujem(false));
            }} disabled={stahujem}
              style={{ marginLeft: 6, padding: 0, border: "none", background: "none", color: C.accentLight, fontSize: 11, cursor: stahujem ? "wait" : "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
              {stahujem ? "sťahujem…" : "↻ stiahnuť nové z Instagramu"}
            </button>
            {chybaStiahnutia && <span style={{ marginLeft: 6, color: C.red }}>{chybaStiahnutia}</span>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "10px 0" }}>
        {prepinac("navstevnost", "Návštevy webu")}
        {prepinac("dopyty", "Dopyty")}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select value={cielovaStranka} onChange={(e) => setStranka(e.target.value)} style={{ ...pole, flex: "1 1 260px", minWidth: 0 }}>
          {stranky.length === 0 && <option value="">Text webu sa ešte nestiahol</option>}
          {stranky.map((u) => <option key={u} value={u}>{u.replace(/^https?:\/\/(www\.)?/, "")}</option>)}
        </select>
        <input value={nazov} onChange={(e) => setNazov(e.target.value)} placeholder={navrhNazvu(ciel, cielovaStranka, mesiac)}
          style={{ ...pole, flex: "1 1 240px", minWidth: 0 }} />
      </div>

      {/* Rozpočet dvoma spôsobmi. Prepočet na druhú stranu stojí hneď vedľa —
          Jerry, 19. 8. 2026: „preto keby je tam rovno prepočet na to, koľko to
          vyjde, tiež by bolo super." Prepočítavať 2000/14 v hlave je presne tá
          práca, ktorú má robiť appka. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {([["denne", "denne"], ["celkom", "celkom"]] as const).map(([id, popis]) => (
            <button key={id} onClick={() => setRezimRozpoctu(id)}
              title={id === "denne"
                ? "Meta minie túto sumu každý deň a beží, kým ju nezastavíš"
                : "Povieš celkovú sumu a počet dní — Meta si ju sama rozvrhne"}
              style={{
                padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5,
                border: `1px solid ${rezimRozpoctu === id ? C.accent : C.border}`,
                background: rezimRozpoctu === id ? mix(C.accent, 14) : "transparent",
                color: rezimRozpoctu === id ? C.accentLight : C.textMuted,
              }}>{popis}</button>
          ))}
        </div>
        {rezimRozpoctu === "denne" ? (
          <>
            <label style={{ fontSize: 11.5, color: C.textMuted }}>
              denne <input value={denne} onChange={(e) => setDenne(e.target.value)} inputMode="decimal" style={{ ...pole, width: 74, marginLeft: 4 }} /> Kč
            </label>
            <label style={{ fontSize: 11.5, color: C.textMuted }}>
              strop <input value={strop} onChange={(e) => setStrop(e.target.value)} inputMode="decimal" style={{ ...pole, width: 84, marginLeft: 4 }} /> Kč
            </label>
          </>
        ) : (
          <label style={{ fontSize: 11.5, color: C.textMuted }}>
            celkom <input value={celkom} onChange={(e) => setCelkom(e.target.value)} inputMode="decimal" style={{ ...pole, width: 84, marginLeft: 4 }} /> Kč
          </label>
        )}
        <span style={{ fontSize: 11, color: C.textDim }}>
          {rezimRozpoctu === "denne"
            ? <>Minimum je {MIN_DENNE_KC} Kč/deň. Strop je nepovinný; keď ho dáš, musí byť aspoň {MIN_STROP_KC} Kč — nižší Meta neprijme.</>
            : <>Meta sumu rozvrhne sama — v deň, keď je aukcia lacnejšia, minie viac. Strop netreba: celková suma je sama hranicou.</>}
        </span>
      </div>

      {/* Druhá strana mince — vypočítaná, nie vypýtaná. */}
      {prepocet && (
        <div style={{ fontSize: 11.5, color: prepocet.varovanie ? C.orange : C.accentLight, marginBottom: 8, lineHeight: 1.5 }}>
          {prepocet.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 11.5, color: C.textMuted }}>
          kde
          <select value={mesto ? "mesto" : oblast}
            onChange={(e) => { if (e.target.value === "mesto") { setHladaneMesto("Brno"); } else { setMesto(null); setOblast(e.target.value as Oblast); } }}
            style={{ ...pole, marginLeft: 4, width: 132 }}>
            {Object.entries(OBLASTI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="mesto">mesto + okruh</option>
          </select>
        </label>
        {mesto && (
          <label style={{ fontSize: 11.5, color: C.textMuted }}>
            okruh <input value={okruh} onChange={(e) => setOkruh(e.target.value)} inputMode="numeric"
              style={{ ...pole, width: 70, marginLeft: 4 }} /> km
          </label>
        )}
        <label style={{ fontSize: 11.5, color: C.textMuted }}>
          dokedy <input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" placeholder="bez konca"
            style={{ ...pole, width: 88, marginLeft: 4 }} /> dní
        </label>
      </div>

      {(hladaneMesto || mesto) && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={hladaneMesto} onChange={(e) => setHladaneMesto(e.target.value)} placeholder="napíš mesto…"
              style={{ ...pole, flex: "1 1 200px", minWidth: 0 }} />
            {mesto && (
              <span style={{ fontSize: 11.5, color: C.accentLight }}>
                cieľ: {mesto.nazov} + {Math.min(OKRUH_MAX_KM, Math.max(OKRUH_MIN_KM, Number(okruh) || 25))} km
              </span>
            )}
          </div>
          {mesta.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {mesta.map((m) => (
                <button key={m.key} onClick={() => { setMesto({ key: m.key, nazov: m.nazov }); setMesta([]); setHladaneMesto(m.nazov); }}
                  style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  {m.nazov}{m.kraj ? `, ${m.kraj}` : ""} ({m.krajina})
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
            Meta berie okruh {OKRUH_MIN_KM}–{OKRUH_MAX_KM} km. Pre štúdio je lepšie začať úzko a rozšíriť, až keď sa rozpočet nedá minúť.
          </div>
        </div>
      )}

      {/* Text reklamy — len pri novej kampani. Pri propagácii príspevku by
          bol zbytočný: ten text už na Instagrame je a Meta ho použije. */}
      {rezim === "nova" && (
        <div style={{ marginBottom: 8 }}>
          <textarea
            value={textReklamy}
            onChange={(e) => setTextReklamy(e.target.value)}
            rows={3}
            placeholder="text reklamy — nepovinný, ale bez neho vznikne len kostra…"
            style={{ ...pole, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
          />
          {textReklamy && (
            <input value={nadpis} onChange={(e) => setNadpis(e.target.value)} placeholder="nadpis nad odkazom (nepovinný)"
              style={{ ...pole, width: "100%", marginTop: 6 }} />
          )}
          {/* Obrázok alebo video. Nahráva sa hneď pri výbere — nahranie je
              najpomalší krok a keby padlo až pri zakladaní, zostali by v účte
              prázdne kampane. Odkaz je viditeľný VŽDY (Jerry, 19. 8. 2026) —
              dovtedy sa ukázal až po napísaní textu a pôsobilo to, akoby
              obrázok nahrať nešlo. Poradie je ľubovoľné: obrázok prvý, text
              potom, alebo naopak. */}
          {(
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 11.5, color: C.accentLight, cursor: nahravam ? "wait" : "pointer", textDecoration: "underline" }}>
                {nahravam ? "nahrávam…" : medium ? "vymeniť obrázok/video" : "+ pridať obrázok alebo video"}
                <input
                  type="file" accept="image/*,video/*" disabled={nahravam}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setNahravam(true); setChybaMedia(""); setMedium(null);
                    const fd = new FormData();
                    fd.append("subor", f);
                    void fetch("/api/meta-media", { method: "POST", credentials: "same-origin", body: fd })
                      .then((r) => r.json())
                      .then((j: { ok?: boolean; typ?: string; hash?: string; videoId?: string; nahlad?: string; meno?: string; error?: string }) => {
                        if (j.ok && (j.hash || j.videoId)) {
                          setMedium({ typ: j.typ === "video" ? "video" : "obrazok", hash: j.hash, videoId: j.videoId, nahlad: j.nahlad, meno: j.meno || f.name });
                        } else setChybaMedia(j.error || "Súbor sa nepodarilo nahrať.");
                      })
                      .catch(() => setChybaMedia("Súbor sa nepodarilo nahrať."))
                      .finally(() => setNahravam(false));
                  }}
                />
              </label>
              {medium && (
                <span style={{ fontSize: 11, color: C.green }}>
                  ✓ {medium.typ === "video" ? "video" : "obrázok"}: {medium.meno.slice(0, 40)}
                </span>
              )}
              {chybaMedia && <span style={{ fontSize: 11, color: C.red }}>{chybaMedia}</span>}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
            {!textReklamy
              ? medium
                ? `${medium.typ === "video" ? "Video" : "Obrázok"} je nahraný — dopíš text a vznikne hotová reklama. Bez textu vznikne len kampaň a sada, obrázok sa nepoužije.`
                : "Bez textu vznikne kampaň a sada, ale reklama nie — text sa potom dopisuje v Mete."
              : medium
                ? `Vznikne hotová reklama s textom (${textReklamy.length}/600) aj s ${medium.typ === "video" ? "videom" : "obrázkom"} — nič sa nemusí dopĺňať v Mete.`
                : `Vznikne reklama s textom (${textReklamy.length}/600), ale BEZ obrázka. Reklama bez vizuálu sa síce založí, ale nikoho nezaujme — pridaj obrázok alebo video.`}
          </div>
        </div>
      )}

      {plan.ok && plan.odkaz && (
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, overflowX: "auto", whiteSpace: "nowrap" }}>
          Reklama povedie na: <code style={{ fontSize: 10.5, color: C.textMuted }}>{plan.odkaz}</code>
        </div>
      )}

      {plan.varovania.map((v) => (
        <div key={v} style={{ fontSize: 11.5, color: C.orange, marginBottom: 6, lineHeight: 1.5 }}>{v}</div>
      ))}
      {!plan.ok && plan.chyby.map((ch) => (
        <div key={ch} style={{ fontSize: 11.5, color: C.red, marginBottom: 6, lineHeight: 1.5 }}>{ch}</div>
      ))}

      <button onClick={() => void (rezim === "prispevok" ? propaguj() : zaloz())} disabled={robim || !plan.ok || (rezim === "prispevok" && !prispevok)}
        style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.accent}`,
          background: mix(C.accent, 12), color: C.accentLight, fontSize: 12.5, fontWeight: 600,
          cursor: robim || !plan.ok ? "default" : "pointer", opacity: robim || !plan.ok ? 0.5 : 1, fontFamily: "inherit" }}>
        {robim ? "zakladám…" : rezim === "prispevok" ? "Propagovať príspevok — pozastavene" : textReklamy ? "Založiť reklamu v Mete — pozastavenú" : "Založiť v Mete — pozastavenú"}
      </button>

      {hlaska && (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.55, color: hlaska.ok ? C.green : C.red }}>{hlaska.text}</div>
      )}

      <div style={{ fontSize: 11, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
        Kampaň vznikne v účte <b style={{ color: C.textMuted }}>ProSapiens Biomechanic ({UCET_REKLAM})</b> — vždy a len tam.
        Je to ten účet, ktorý Kokpit číta; čo vznikne inde, v cene za klienta nikdy nebude.<br />
        <b style={{ color: C.textMuted }}>Kampaň je priečinok, nie reklama.</b> Meta má tri poschodia: kampaň (cieľ a rozpočet) →
        sada reklám (komu, kde, ako dlho) → reklama (obrázok alebo video a text). Appka robí prvé poschodie;
        kým nie sú druhé a tretie, nikto reklamu neuvidí a dopyt z nej vzniknúť nemôže.
      </div>
    </>
  );

  return akoKarta ? <Card>{obsah}</Card> : <div style={{ padding: "10px 12px" }}>{obsah}</div>;
}
