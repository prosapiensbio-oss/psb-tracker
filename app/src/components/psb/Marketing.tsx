import { fetchVzasSettings, saveVzasSetting } from "../../lib/psb/client";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { fmtDMY, fmtCZK } from "../../lib/psb/format";
import {
  GA4_MESACNE,
  GSC_DOPYTY,
  GSC_MESACNE,
  GSC_STRANY,
  WEB_RYCHLOST,
  WEB_STRANKY,
  GSC_ZARIADENIA,
  MKT_CLANKY,
  MKT_MESACNE,
  MKT_TOP,
  mktSum,
  MKT_ZDROJ,
  GADS_DOPYTY,
  GADS_KAMPANE,
  GADS_VALUTA,
  type GadsDopyt,
  type WebStrankaUI,
  type GadsKampan,
  type Ga4Mesiac,
  type GscDopyt,
  type GscMesiac,
  type GscStrana,
  type MktKus,
  type MktMesiac,
  obsahRiadky,
  marketingVerzia,
} from "../../lib/psb/marketing";
import { KATEGORIE_HOOKOV } from "../../lib/psb/marketing-obsah";
import { OBDOBIA, OBDOBIA_MESACNE, mesiaceVOkne, obdobieLabel } from "../../lib/psb/obdobia";
import { Dopyty } from "./Dopyty";
import { MarketingVrch } from "./MarketingVrch";
import { ObsahZive } from "./ObsahZive";
import { ObsahDopyt } from "./ObsahDopyt";
import { Mail } from "./Mail";
import { Zadanie } from "./Zadanie";
import { PlanMarketingu } from "./PlanMarketingu";
import { MapaCyklu } from "./MapaCyklu";
import { PlanObsahu } from "./PlanObsahu";
import { Napady } from "./Napady";
import { KedyPublikovat } from "./KedyPublikovat";
import { AkoMeratReklamu, Kohorta, Lievik } from "./MarketingLievik";
import { PripravitKampan } from "./KampanForm";
import { Reklama } from "./Reklama";
import { Kanaly } from "./Kanaly";
import { chybyNaStrankach, prilezitostiTitulkov } from "../../lib/psb/webObsah";
import { hodnotenie, type PsRiadok } from "../../lib/psb/pagespeed";
import { prilezitosti, soZamerom, zhrnutieWebu, type Dopyt } from "../../lib/psb/google";
import { kontrolaAds, kontrolaMerania } from "../../lib/psb/kontrolaDat";
import { adsMesiace, cenaZaKlik, zhrnutieAds } from "../../lib/psb/googleAds";
import { C, mix, S } from "../../lib/psb/theme";
import type { AssistantChat } from "./Assistant";
import type { ClientAgg } from "../../lib/psb/compute";
import type { Lead, PSBData } from "../../lib/psb/types";
import { Card, Empty, FilterObdobia, H3, Hlasenie, Info, OdkazStranky, Select, StatCard, SubTabs, ValueBars, useRolovanie } from "./ui";

// Marketing — skeleton. Four questions in the order Jerry asked them: what did I
// try, what worked, what did it cost, and what should I try next. The section
// lives in Tracker rather than VZAS on purpose: Výsledky look back at money,
// marketing looks forward at clients.
const MESIACE = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
const label = (m: string) => `${MESIACE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const num = (n: number) => n.toLocaleString("sk-SK");

// ── „Vysvetli mi to" ─────────────────────────────────────────────────────────
// Graf ukáže, ČO sa stalo. Nepovie, čo to znamená ani čo s tým. Toto tlačidlo
// pošle Jarvisovi presne ten výrez, ktorý má Jerry práve pred sebou — vrátane
// nastaveného filtra, lebo tie isté čísla znamenajú za 3 mesiace niečo iné než
// za 18 — a nechá ho to vyložiť ako marketéra, nie zopakovať.
//
// Výrez sa skladá až pri kliknutí (funkcia, nie hodnota): karta sa prekresľuje
// pri každom prepnutí filtra a nemá zmysel stavať text, ktorý sa možno nikdy
// neodošle.
function tsv(hlavicka: string[], riadky: (string | number)[][]) {
  return [hlavicka.join(" | "), ...riadky.map((r) => r.join(" | "))].join("\n");
}

function Vysvetli({ chat, titul, filter, vyrez }: { chat?: AssistantChat; titul: string; filter?: string; vyrez: () => string }) {
  if (!chat) return null;
  const klik = () => {
    chat.setFloatingOpen(true);
    void chat.ask(
      [
        `Vysvetli mi kartu „${titul}" z Marketingu.`,
        filter ? `Nastavené obdobie: ${filter}` : "",
        "",
        "Toto mám presne na obrazovke:",
        vyrez(),
        "",
        "Vylož mi to ako marketér, ktorý pozná PSB: čo tie čísla naozaj hovoria, čo sa zmenilo oproti predchádzajúcemu obdobiu a čo z toho pre nás vyplýva.",
        "Potom daj 2–3 konkrétne veci, čo skúsiť ďalej — téma reelu aj s prvou vetou, námet na článok, alebo úprava konkrétnej stránky. Nič všeobecné o Instagrame; len to, čo sedí na tieto čísla a na to, ako PSB funguje.",
        "Buď stručný. Ak čísla na nejaký záver nestačia, povedz to rovno.",
      ]
        .filter(Boolean)
        .join("\n"),
      // V rozhovore stačí veta. Výrez ide modelu, nie na obrazovku — Jerry ho
      // videl na karte pred sekundou a v chate je z neho len stena čísel.
      `Vysvetli mi kartu „${titul}"${filter ? ` — ${filter}` : ""}.`,
    );
  };
  return (
    <button
      onClick={klik}
      disabled={chat.busy}
      title="Pošle Jarvisovi tento graf aj s nastaveným filtrom a nechá ho to vyložiť."
      style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 8), color: C.accentLight, fontSize: 11.5, fontWeight: 600, cursor: chat.busy ? "default" : "pointer", opacity: chat.busy ? 0.5 : 1, whiteSpace: "nowrap" }}
    >
      Vysvetli mi to
    </button>
  );
}

// Obdobie. Marketing má DVE časové mierky a miešať ich je chyba: obsah žije dni
// (mesiac je jednotka, rok je kaša), kanály a SEO sa hýbu pomaly (rok je
// jednotka, mesiac je šum). Preto má každá karta iné východzie okno — ale ten
// istý ovládač, aký Jerry pozná z VZAS.
//
// A ešte niečo: pri 2–7 reels mesačne je rozdiel medzi 4 a 6 náhoda, nie trend.
// Preto sa nikde nezačína jedným mesiacom — najkratšie okno sú tri.
// Zoznam období aj výpočet okna žijú v lib/psb/obdobia.ts — na obrazovke boli
// tri kópie s rôznymi hodnotami a „posledných 6 mesiacov" znamenalo na každej
// karte niečo iné.
const oknoMesiacov = mesiaceVOkne;

/**
 * Skrývanie hlásení putuje z Appky, lebo zapisuje do `anomaly_ack` — tej
 * istej tabuľky, z ktorej žije register. Karty ho len podávajú ďalej.
 */
type SkrytieProps = {
  ack?: Record<string, { ackedAt?: string }>;
  onSkry?: (kluc: string) => void;
  onVrat?: (kluc: string) => void;
};

// Karty tu čítajú mesačné série, takže „posledných 30 dní" v ponuke nie je —
// viď OBDOBIA_MESACNE v lib/psb/obdobia.ts.
function ObdobieBar({ hodnota, onChange, poznamka }: { hodnota: string; onChange: (v: string) => void; poznamka?: string }) {
  return <FilterObdobia hodnota={hodnota} onChange={onChange} moznosti={OBDOBIA_MESACNE} poznamka={poznamka} />;
}

// Sortovateľná tabuľka. Klik na hlavičku triedi; druhý klik otočí smer.
// Číselné stĺpce začínajú zostupne, lebo pri „koľko klikov" chce človek vidieť
// najprv to najväčšie, nie najmenšie.
type Stlpec<T> = { id: keyof T & string; label: string; num?: boolean; info?: string; fmt?: (v: T[keyof T], r: T) => ReactNode; farba?: (r: T) => string | undefined };

function SortTable<T extends Record<string, any>>({ riadky, stlpce, minWidth = 460, vychodzi, rolovat }: {
  riadky: T[]; stlpce: Stlpec<T>[]; minWidth?: number; vychodzi?: keyof T & string;
  // Koľko riadkov nechať vidieť; zvyšok sa roluje v karte. Bez toho tlačia
  // stovky vyhľadávacích dopytov všetko pod sebou o obrazovku nižšie.
  rolovat?: number;
}) {
  const [sort, setSort] = useState<{ id: string; desc: boolean }>(() => {
    const d = vychodzi ?? stlpce.find((c) => c.num)?.id ?? stlpce[0].id;
    return { id: d, desc: true };
  });
  const zoradene = useMemo(() => {
    const c = stlpce.find((x) => x.id === sort.id);
    return [...riadky].sort((a, b) => {
      const av = a[sort.id], bv = b[sort.id];
      const r = c?.num ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), "sk");
      return sort.desc ? -r : r;
    });
  }, [riadky, sort, stlpce]);
  const klik = (c: Stlpec<T>) =>
    setSort((s) => (s.id === c.id ? { id: c.id, desc: !s.desc } : { id: c.id, desc: !!c.num }));

  const rol = useRolovanie(rolovat ?? 0, zoradene);

  return (
    <>
    {rolovat ? rol.stylTag : null}
    <div ref={rolovat ? rol.ref : undefined} className={rolovat ? rol.trieda : undefined}
      style={rolovat ? rol.styl : { overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth, ...(rolovat ? rol.stylTabulky : null) }}>
        <thead>
          {/* Pri rolovaní kreslí spodný ram hlavičky samo `th`: rám na `tr` sa
              v režime `border-collapse: separate` nevykreslí. */}
          <tr style={rolovat ? undefined : { borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
            {stlpce.map((c) => {
              const aktivny = sort.id === c.id;
              return (
                <th key={c.id} onClick={() => klik(c)}
                  style={{ textAlign: c.num ? "right" : "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", color: aktivny ? C.accentLight : C.textMuted, userSelect: "none",
                    ...(rolovat ? { borderBottom: `2px solid ${mix(C.accent, 35)}` } : null) }}>
                  {c.info ? <Info text={c.info} label={c.label} /> : c.label}
                  <span style={{ marginLeft: 4, fontSize: 9, color: aktivny ? C.accent : C.textDim }}>
                    {aktivny ? (sort.desc ? "▼" : "▲") : "↕"}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {zoradene.map((r, i) => (
            <tr key={i}>
              {stlpce.map((c) => (
                <td key={c.id} style={{ ...S.td, textAlign: c.num ? "right" : "left", fontSize: 12.5, color: c.farba?.(r) ?? (c.num ? C.textMuted : C.text), fontVariantNumeric: "tabular-nums", whiteSpace: c.num ? "nowrap" : "normal" }}>
                  {c.fmt ? c.fmt(r[c.id], r) : c.num ? num(r[c.id]) : String(r[c.id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {rolovat ? rol.prepinac : null}
    </>
  );
}

// ── Značky udalostí ──────────────────────────────────────────────────────────
//
// Jerryho zadanie z júla: „do každého grafu pridať informáciu, čo som robil".
// Graf dosahu ukáže špičku v máji, ale nepovie prečo — o tri mesiace už nikto
// nevie, či vtedy bežala reklama, vyšiel silný reel, alebo bola pauza. Značka
// je zápis „tu sa stalo toto" a kreslí sa ako vlajka nad mesiacom, aby čísla
// a ich príčiny stáli vedľa seba. Bez toho sa z grafov nedá učiť, čo funguje.
//
// ČO SEM PO NAPOJENÍ METY UŽ NEPATRÍ
//
// Odkedy Kokpit ťahá kampane z Marketing API (12. 8.), pozná každú platenú
// kampaň aj s dátumami a výdavkom. Prepisovať ich sem ručne by znamenalo dve
// verzie toho istého a otázku, ktorá platí. Ostáva presne to, o čom Meta
// nevie a nikdy vedieť nebude: rozhodnutia („vypli sme reklamu"), veci mimo
// Mety (prednáška, podcast, spolupráca, zmena ceny, nový web) a prestávky.
//
// Jediná uložená značka to ukazuje presne: „Vypnutá platená propagácia"
// z 1. 8. Meta o vypnutí nevie — vráti prázdno, ktoré vyzerá rovnako ako
// mesiac, na ktorý sa zabudlo.
//
// Ukladajú sa do vzas_settings (kľúč mkt_znacky) — je ich pár za rok, vlastná
// tabuľka by bola viac kódu než úžitku. Zapísať ich vie aj Jarvis (akcia
// mkt-znacka), takže „spustili sme kampaň" z rozhovoru skončí rovno v grafe.
export type MktZnacka = { id: string; datum: string; text: string };

function useZnacky() {
  const [znacky, setZnacky] = useState<MktZnacka[]>([]);
  useEffect(() => {
    void fetchVzasSettings().then((n: Record<string, unknown>) => {
      const z = n["mkt_znacky"];
      if (Array.isArray(z)) setZnacky(z as MktZnacka[]);
    }).catch(() => {});
  }, []);
  const uloz = async (nove: MktZnacka[]) => {
    setZnacky(nove);
    await saveVzasSetting("mkt_znacky", nove);
  };
  return { znacky, uloz };
}

function ZnackyBlok({ znacky, uloz, okno }: { znacky: MktZnacka[]; uloz: (z: MktZnacka[]) => Promise<void>; okno: string[] }) {
  const [pridavam, setPridavam] = useState(false);
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const vOkne = znacky.filter((z) => okno.includes(z.datum.slice(0, 7))).sort((a, b) => b.datum.localeCompare(a.datum));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: C.textDim }}>⚑ čo sa stalo — to, o čom Meta nevie</span>
        <button onClick={() => setPridavam((v) => !v)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 9px", color: C.accentLight, fontSize: 11, cursor: "pointer" }}>
          {pridavam ? "zavrieť" : "+ čo sa stalo"}
        </button>
      </div>
      {pridavam && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 7 }}>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)}
            style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { void uloz([...znacky, { id: `z${Date.now().toString(36)}`, datum, text: text.trim() }]); setText(""); setPridavam(false); } }}
            placeholder="napr. prednáška v Brne · vypnutá reklama · zmena ceny · spolupráca"
            style={{ flex: 1, minWidth: 220, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
          <button
            onClick={() => { if (text.trim()) { void uloz([...znacky, { id: `z${Date.now().toString(36)}`, datum, text: text.trim() }]); setText(""); setPridavam(false); } }}
            disabled={!text.trim()}
            style={{ background: text.trim() ? C.accentBg : "transparent", border: `1px solid ${text.trim() ? C.accent : C.border}`, borderRadius: 6, padding: "4px 12px", color: text.trim() ? C.accentLight : C.textDim, fontSize: 12, cursor: text.trim() ? "pointer" : "default" }}>
            Uložiť
          </button>
        </div>
      )}
      {vOkne.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {vOkne.map((z) => (
            <div key={z.id} style={{ fontSize: 11.5, color: C.textMuted, display: "flex", gap: 7, alignItems: "baseline" }}>
              <span style={{ color: C.orange }}>⚑</span>
              <span style={{ color: C.textDim, whiteSpace: "nowrap" }}>{fmtDMY(z.datum)}</span>
              <span style={{ flex: 1 }}>{z.text}</span>
              <button onClick={() => void uloz(znacky.filter((x) => x.id !== z.id))} title="Zmazať značku"
                style={{ background: "none", border: "none", color: C.textDim, fontSize: 11, cursor: "pointer" }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Čo som robil ─────────────────────────────────────────────────────────────
function CoSomRobil({ chat }: { chat?: AssistantChat }) {
  const [metrika, setMetrika] = useState<"obsah" | "views" | "dosah" | "spend">("obsah");
  const [obdobie, setObdobie] = useState("2026");
  const okno = oknoMesiacov(obdobie, MKT_MESACNE.map((r) => r.m));
  const { znacky, uloz } = useZnacky();
  // Vlajka nesie všetky značky daného mesiaca naraz — dve udalosti v jednom
  // mesiaci sú jedna vlajka s dvoma riadkami v tooltipe, nie dve vlajky.
  const znackaPre = (lbl: string) => {
    const mk = MKT_MESACNE.find((r) => label(r.m) === lbl)?.m;
    if (!mk) return undefined;
    const zoz = znacky.filter((z) => z.datum.slice(0, 7) === mk);
    return zoz.length ? zoz.map((z) => `${fmtDMY(z.datum)} — ${z.text}`).join("\n") : undefined;
  };
  const data = MKT_MESACNE.filter((r) => okno.includes(r.m));
  const hodnota = (r: (typeof MKT_MESACNE)[0]) =>
    metrika === "obsah" ? r.reels + r.posty : metrika === "views" ? r.views : metrika === "dosah" ? r.dosah : r.spend;
  const opts: [typeof metrika, string][] = [["obsah", "Príspevky"], ["views", "Videnia"], ["dosah", "Dosah"], ["spend", "Reklama"]];
  const vyrez = () =>
    tsv(["mesiac", "reels", "posty", "stories", "videnia", "dosah", "uloženia", "zdieľania", "view rate", "reklama Kč"],
      data.map((r) => [label(r.m), r.reels, r.posty, r.stories, r.views, r.dosah, r.ulozenia, r.zdielania, `${r.viewRate} %`, r.spend]));

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <H3><Info text="Koľko obsahu si za mesiac vypustil, aký mal dosah a koľko stála reklama. Stories sa nerátajú do „príspevkov“ — sú v tabuľke nižšie, lebo majú úplne inú životnosť. Východzie okno sú 3 mesiace: pri 2–7 reels mesačne je rozdiel medzi jedným a druhým mesiacom náhoda, nie trend." label="Čo som robil" /></H3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <ObdobieBar hodnota={obdobie} onChange={setObdobie} />
          <Vysvetli chat={chat} titul="Čo som robil" filter={obdobieLabel(obdobie)} vyrez={vyrez} />
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
        znacka={znackaPre}
      />
      <ZnackyBlok znacky={znacky} uloz={uloz} okno={okno} />
      {/* Mesačná tabuľka impresií tu bola a je preč. Podľa nej sa nikdy
          nespravilo rozhodnutie — bol to výkaz. Namiesto nej porovnanie s
          benchmarkom, lebo „405 videní" samo o sebe neznamená nič a „405 pri
          priemere 580, ale view rate 48 pri priemere 30" znamená veľa. */}
      <Benchmark />
    </Card>
  );
}

// Benchmark pre účty s 1–5 tis. sledovateľmi (Socialinsider, 2026). Sú to
// PRIEMERY naprieč odvetviami — nie cieľ, ale mierka. Bez nich je každé číslo
// v tejto appke len číslo.
const BENCHMARK: { metrika: string; nase: (r: (typeof MKT_MESACNE)[0][]) => number; norma: number; jednotka?: string; vyssieLepsie?: boolean; poznamka: string }[] = [
  {
    // Nadpis hovoril „na reel", menovateľ delil reelmi AJ postami — číslo bolo
    // o tretinu nižšie a riadok svietil oranžovo pri hodnote nad normou.
    // `views` v zostave sú videnia všetkého obsahu, tak nech to hovorí nadpis.
    metrika: "Videnia na príspevok (reel + post)", norma: 580, poznamka: "norma je priemer NA REEL pri účtoch 1–5 tis. — naše číslo je prísnejšie, deli sa všetkým obsahom",
    nase: (rs) => {
      const kusov = rs.reduce((a, r) => a + r.reels + r.posty, 0);
      return kusov ? Math.round(rs.reduce((a, r) => a + r.views, 0) / kusov) : 0;
    },
  },
  {
    metrika: "View rate reels", norma: 30, jednotka: " %", poznamka: "koľko % divákov vydrží aspoň 3 sekundy",
    nase: (rs) => {
      const s = rs.filter((r) => r.viewRate > 0);
      return s.length ? Math.round((s.reduce((a, r) => a + r.viewRate, 0) / s.length) * 10) / 10 : 0;
    },
  },
  {
    metrika: "Uloženia na príspevok", norma: 1, poznamka: "uloženie je najbližšie k zámeru zo všetkých metrík",
    nase: (rs) => {
      const ks = rs.reduce((a, r) => a + r.reels + r.posty, 0);
      return ks ? Math.round((rs.reduce((a, r) => a + r.ulozenia, 0) / ks) * 10) / 10 : 0;
    },
  },
  {
    metrika: "Zdieľania na príspevok", norma: 1, poznamka: "podľa Mosseriho 3–5× váha lajku a najsilnejší signál pre nových ľudí",
    nase: (rs) => {
      const ks = rs.reduce((a, r) => a + r.reels + r.posty, 0);
      return ks ? Math.round((rs.reduce((a, r) => a + r.zdielania, 0) / ks) * 10) / 10 : 0;
    },
  },
];

function Benchmark() {
  // Neúplný mesiac (nahratá len časť príspevkov) je DOLNÁ hranica, nie
  // výsledok — z takého čísla sa nesmie čítať prepad. Jarvisov kontext tú
  // značku rešpektuje od začiatku, benchmark nie (revízia 18. 8. 2026).
  const uplne = MKT_MESACNE.filter((r) => !r.neuplny);
  const rs = uplne.slice(-3);
  const vynechane = MKT_MESACNE.slice(-3).filter((r) => r.neuplny).map((r) => r.m);
  if (!rs.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>
        Posledné 3 úplné mesiace oproti benchmarku
        {vynechane.length > 0 && (
          <span style={{ fontWeight: 400, color: C.textDim }}>
            {" "}· vynechané {vynechane.join(", ")} (nahratá len časť príspevkov)
          </span>
        )}
      </div>
      {BENCHMARK.map((b) => {
        const v = b.nase(rs);
        const pomer = b.norma ? v / b.norma : 0;
        const farba = pomer >= 1 ? C.green : pomer >= 0.7 ? C.orange : C.red;
        return (
          <div key={b.metrika} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${mix(C.border, 45)}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: C.text, flex: "1 1 170px", minWidth: 0 }}>{b.metrika}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: farba, fontVariantNumeric: "tabular-nums", minWidth: 56, textAlign: "right" }}>
              {v}{b.jednotka || ""}
            </span>
            <span style={{ fontSize: 11.5, color: C.textDim, minWidth: 78, textAlign: "right" }}>norma {b.norma}{b.jednotka || ""}</span>
            <span style={{ fontSize: 11, color: C.textDim, flex: "1 1 220px" }}>{b.poznamka}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
        Zelená znamená nad priemerom, oranžová do 30 % pod ním, červená hlbšie. Norma nie je cieľ — je to mierka,
        aby číslo niečo znamenalo.
      </div>
    </div>
  );
}

// ── Triedenie podľa hooku ────────────────────────────────────────────────────
// Podľa hashtagov to nejde — v každom príspevku sú skoro všetky. Jediné, čo sa
// dá triediť a zároveň jediné, čo rozhoduje o dopozeraní, je prvá veta.
//
// Dôležitejšie než rebríček je ale poctivosť o tom, čo z toho vieme. Uloženia
// sú 1–3 na príspevok; rozdiel medzi 2,0 a 2,5 pri desiatich kusoch je šum, nie
// nález. Preto sa nesľubuje víťaz — ukáže sa tabuľka a povie sa, ktorá metrika
// má dosť dát na záver a ktorá nie.
function PodlaHooku({ okno }: { okno: string[] }) {
  const data = useMemo(() => {
    // `obsahRiadky()` — živá tabuľka z Meta API, statický súbor len ako
    // história. Predtým tu bol natvrdo MKT_OBSAH a Jarvis čítal živé dáta:
    // zhoda 62 %, teda iné poradie hookov na tú istú otázku (18. 8. 2026).
    const vyber = obsahRiadky().filter((r) => okno.includes(r.m));
    const map = new Map<string, { k: string; f: string; n: number; u: number; v: number; z: number; vr: number[] }>();
    for (const r of vyber) {
      const key = `${r.k}|${r.f}`;
      const e = map.get(key) || { k: r.k, f: r.f, n: 0, u: 0, v: 0, z: 0, vr: [] };
      e.n++; e.u += r.u; e.v += r.v; e.z += r.z;
      if (r.vr > 0) e.vr.push(r.vr);
      map.set(key, e);
    }
    return [...map.values()]
      .map((e) => ({
        kat: e.k, format: e.f, ks: e.n,
        ulozenia: Math.round((e.u / e.n) * 10) / 10,
        videnia: Math.round(e.v / e.n),
        zdielania: Math.round((e.z / e.n) * 10) / 10,
        viewRate: e.vr.length ? Math.round((e.vr.reduce((a, b) => a + b, 0) / e.vr.length) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.ks - a.ks);
  }, [okno]);

  // View rate je jediná metrika s dosť veľkou vzorkou na záver: každý príspevok
  // ju počíta zo stoviek divákov, kým uloženia sú jednotky kusov.
  const reels = data.filter((r) => r.format === "Reel" && r.ks >= 3 && r.viewRate > 0);
  const najlepsi = [...reels].sort((a, b) => b.viewRate - a.viewRate)[0];
  const najhorsi = [...reels].sort((a, b) => a.viewRate - b.viewRate)[0];

  if (!data.length) return <Empty>V tomto okne nemám príspevky s textom.</Empty>;
  return (
    <>
      <H3><Info text="Príspevky zaradené podľa toho, ČÍM ZAČÍNAJÚ — hook je jediné, čo sa dá zmysluplne triediť (hashtagy sú v každom príspevku skoro všetky) a zároveň jediné, čo rozhoduje, či to niekto dopozerá. Kategórie sú vytiahnuté z reálnych prvých viet, nie vymyslené." label="Podľa typu hooku" /></H3>
      <div style={{ marginTop: 8 }}>
        <SortTable
          riadky={data}
          vychodzi="ks"
          stlpce={[
            { id: "kat", label: "Typ hooku", farba: () => C.text },
            { id: "format", label: "Formát" },
            { id: "ks", label: "Kusov", num: true },
            { id: "ulozenia", label: "Ø uložení", num: true, info: "Priemer na jeden príspevok. Pozor: sú to jednotky, takže rozdiely medzi kategóriami sú v tomto rozsahu prevažne šum." },
            { id: "videnia", label: "Ø videní", num: true },
            { id: "zdielania", label: "Ø zdieľaní", num: true },
            { id: "viewRate", label: "Ø view rate", num: true, info: "Koľko % ľudí pozeralo aspoň 3 sekundy. Jediná metrika, ktorá má na záver dosť veľkú vzorku — každý reel ju počíta zo stoviek divákov. Pri postoch sa nemeria.", fmt: (v) => (Number(v) ? `${v} %` : "—") },
          ]}
          minWidth={620}
        />
      </div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 12, lineHeight: 1.55 }}>
        <b>Čo z toho ide a čo nie:</b> uloženia sú 1–3 na príspevok, takže rozdiel medzi 2,0 a 2,5 pri desiatich kusoch
        <b> nie je nález, je to šum</b> — na rebríček podľa uložení by bolo treba rádovo viac príspevkov alebo rádovo viac uložení.
        {najlepsi && najhorsi && najlepsi.kat !== najhorsi.kat && (
          <> Zato <b>view rate na reels</b> má vzorku dosť veľkú: <b>{najlepsi.kat}</b> drží {najlepsi.viewRate} % oproti {najhorsi.viewRate} % pri „{najhorsi.kat}".
            To je rozdiel v tom, koľko ľudí zostane po prvých troch sekundách — a tam sa rozhoduje všetko ostatné.</>
        )}
      </div>
    </>
  );
}

// ── Čo fungovalo ─────────────────────────────────────────────────────────────

// ── Čo to prinieslo ──────────────────────────────────────────────────────────
function RokBar({ rok, onRok }: { rok: string; onRok: (r: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: C.textDim, marginRight: 2 }}>Rok</span>
      {["2025", "2026"].map((y) => (
        <button key={y} onClick={() => onRok(y)}
          style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${rok === y ? C.accent : C.border}`, background: rok === y ? C.accentBg : "transparent", color: rok === y ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
          {y}
        </button>
      ))}
    </div>
  );
}

/**
 * Google Ads — čo stála reklama na Googli a na čo ľudia naozaj klikali.
 *
 * PREČO JE TO SAMOSTATNÁ KARTA A NIE STĹPEC V TABUĽKE WEBU
 *
 * GA4 a Search Console merajú ten istý web tými istými mesiacmi. Google Ads
 * merajú niečo iné: peniaze a nakúpenú pozornosť. Vliať ich do jedného radu by
 * znamenalo, že rast klikov z reklamy bude vyzerať ako rast webu — a to je
 * presne ten druh čísla, ktoré meria niečo iné, než tvrdí jeho nadpis.
 *
 * PREČO SÚ HĽADANÉ VÝRAZY DÔLEŽITEJŠIE NEŽ NÁKLAD
 *
 * Náklad povie, koľko sa utratilo. Hľadané výrazy povedia, čo ľudia v Brne
 * naozaj píšu do Googlu, keď ich niečo bolí — a to je jediný dôkaz o dopyte,
 * ktorý máme kúpený vlastnými peniazmi, nie odhadnutý.
 */
function GoogleAdsKarta({ clients, chat, ack, onSkry, onVrat }: { clients: Record<string, ClientAgg>; chat?: AssistantChat } & SkrytieProps) {
  const mesiace = adsMesiace(GADS_KAMPANE);
  // Noví klienti po mesiacoch — z prvého sedenia, teda z toho istého zdroja,
  // z ktorého sa počíta všetko ostatné. Slúži na to, aby appka vedela
  // pochybovať o konverziách, ktoré jej Google nahlási.
  const { novych, odKedy: odKedyKlienti } = useMemo(() => {
    const n: Record<string, number> = {};
    let najstarsi = "";
    for (const c of Object.values(clients)) {
      const m = (c.firstSession || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) continue;
      n[m] = (n[m] || 0) + 1;
      if (!najstarsi || m < najstarsi) najstarsi = m;
    }
    return { novych: n, odKedy: najstarsi };
  }, [clients]);
  const straz = kontrolaAds(mesiace, novych, odKedyKlienti);
  // Mena z účtu, nie natvrdo. Kým sa nestiahne, radšej bez jednotky než
  // s nesprávnou — číslo bez meny sa dá doplniť, číslo v zlej mene klame.
  const mena = GADS_VALUTA === "CZK" ? "Kč" : GADS_VALUTA === "EUR" ? "€" : GADS_VALUTA;
  const cpc = cenaZaKlik(mesiace);
  const vyrazy = GADS_DOPYTY.slice(0, 12);

  if (!mesiace.length) {
    return (
      <Card>
        <H3>
          <Info
            label="Google Ads"
            text="Výkon vlastných kampaní na Googli a skutočné vety, ktoré ľudia napísali do vyhľadávania predtým, než klikli. Ťahá sa cez API tým istým servisným účtom ako GA4."
          />
        </H3>
        <Empty>
          Ešte sa nestiahlo. V <b>Dáta a uzávierka → Napojenia</b> je karta „Google Ads“ —
          vlož token vývojára a stlač Stiahnuť. Prázdna tabuľka neznamená, že sa na Googli
          neinzerovalo; znamená, že sa to sem ešte nedostalo.
        </Empty>
      </Card>
    );
  }

  return (
    <Card>
      <H3>
        <Info
          label="Google Ads"
          text="Náklad je už v korunách, nie v mikrách, ako to posiela Google. Mesačný súčet sa počíta z rozpadu po kampaniach, takže sa tie dve čísla nemôžu rozísť. Hľadané výrazy existujú len pre kampane vo vyhľadávaní — pri Display alebo Smart kampani je zoznam prázdny, hoci minula tie isté peniaze."
        />
      </H3>

      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 1.6 }}>
        {zhrnutieAds(mesiace, GADS_VALUTA)}
      </div>

      {straz.map((n) => (
        <Hlasenie key={n.kluc} {...n} ack={ack} onSkry={onSkry} onVrat={onVrat} />
      ))}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }}>
        <thead>
          <tr style={{ color: C.textDim, textAlign: "right" }}>
            <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 500 }}>mesiac</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>náklad</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>kliky</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>zobrazenia</th>
            <th style={{ padding: "4px 6px", fontWeight: 500 }}>za klik</th>
          </tr>
        </thead>
        <tbody>
          {mesiace.filter((m) => m.naklad > 0 || m.kliky > 0).map((m) => (
            <tr key={m.mesiac} style={{ borderTop: `1px solid ${mix(C.text, 10)}`, textAlign: "right" }}>
              <td style={{ textAlign: "left", padding: "4px 6px", color: C.text }}>{label(m.mesiac)}</td>
              <td style={{ padding: "4px 6px", color: C.text }}>{Math.round(m.naklad)} {mena}</td>
              <td style={{ padding: "4px 6px", color: C.text }}>{m.kliky}</td>
              <td style={{ padding: "4px 6px", color: C.textMuted }}>{m.zobrazenia}</td>
              <td style={{ padding: "4px 6px", color: C.textMuted }}>
                {m.kliky > 0 ? `${Math.round((m.naklad / m.kliky) * 100) / 100} ${mena}`.trim() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {vyrazy.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
            <Info
              label="Na čo ľudia naozaj klikali"
              text="Skutočné vety z Googlu, nie odhad. Toto je najbližšie k odpovedi na otázku, či v Brne niekto hľadá to, čo PSB robí — a je to zaplatené vlastnými peniazmi, takže sa na to dá spoľahnúť viac než na akýkoľvek odhad objemu hľadania."
            />
          </div>
          {vyrazy.map((v) => (
            <div key={`${v.mesiac}|${v.dopyt}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 12, borderTop: `1px solid ${mix(C.text, 8)}` }}>
              <span style={{ color: C.text }}>{v.dopyt}</span>
              <span style={{ color: C.textMuted, whiteSpace: "nowrap" }}>
                {v.zobrazenia} zobr. · {v.kliky} klik{v.kliky === 1 ? "" : "ov"}
              </span>
            </div>
          ))}
        </div>
      )}

      {chat && (
        <button
          onClick={() => {
            chat.setFloatingOpen(true);
            void chat.ask([
              "Pozri sa na Google Ads v dátach (kľúč googleAds) a odpovedz na jednu otázku:",
              "dá sa z týchto čísel povedať, či má platené hľadanie na Googli pre PSB zmysel?",
              "",
              "Drž sa týchto pravidiel:",
              "1. Ak sú konverzie nula, NEROB záver, že reklama nefungovala — povedz, že sa nemerala.",
              "2. Objem hľadania nemáme (plánovač kľúčových slov je zablokovaný). Neodhaduj ho.",
              "3. Porovnaj cenu za klik s tým, čo vieme o Mete — 31 452 Kč za 19 mesiacov a nula doložených dopytov.",
              "4. Ak sa z dát odpovedať NEDÁ, povedz to rovno a napíš, čo by na to bolo treba.",
            ].join("\n"), "Má Google Ads pre PSB zmysel?");
          }}
          disabled={chat.busy}
          style={{ marginTop: 12, background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11.5, cursor: chat.busy ? "default" : "pointer", fontFamily: "inherit" }}
        >
          Má to zmysel? Spýtaj sa Jarvisa
        </button>
      )}
    </Card>
  );
}

function WebKanaly({ rok, onRok, chat, ack, onSkry, onVrat }: { rok: string; onRok: (r: string) => void; chat?: AssistantChat } & SkrytieProps) {
  const vsetky = GA4_MESACNE.filter((r) => r.m.startsWith(rok));
  // Strážca beží nad celou radou, nie nad vybraným rokom — diera na prelome
  // rokov by inak zmizla medzi dvomi filtrami.
  const straz = kontrolaMerania(GA4_MESACNE, GSC_MESACNE).filter((n) => n.kluc.includes(rok));
  // Mesiace bez merania sa NEPRIEMERUJÚ — nula by tvárila, že nikto neprišiel,
  // hoci sa len nemeralo.
  const data = vsetky.filter((r) => !r.chyba);
  const diery = vsetky.filter((r) => r.chyba).map((r) => label(r.m));
  const castocne = vsetky.filter((r) => r.castocne).map((r) => label(r.m));
  if (!data.length) {
    return (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Zdroj: priamo GA4 cez Analytics Data API. Sťahuje sa tlačidlom v Mesiac → Dáta a uzávierka." label="Web a kanály (GA4)" /></H3>
          <RokBar rok={rok} onRok={onRok} />
        </div>
        <Empty>Za rok {rok} nemám z GA4 ani jeden meraný mesiac. Stiahni ich v Mesiac → Dáta a uzávierka → Google.</Empty>
      </Card>
    );
  }
  const sum = (k: keyof (typeof data)[0]) => data.reduce((a, r) => a + (r[k] as number), 0);
  const platene = sum("paidSocial");
  const organicke = sum("organicSearch") + sum("organicSocial") + sum("direct") + sum("referral");
  const pod = (v: number) => (sum("novi") > 0 ? (v / sum("novi")) * 100 : 0);
  const kanaly: [string, number, string][] = [
    ["Organic Search", sum("organicSearch"), C.green],
    ["Paid Social", platene, C.orange],
    ["Organic Social", sum("organicSocial"), C.accent],
    ["Direct", sum("direct"), C.blue],
    ["Referral", sum("referral"), C.textMuted],
  ];

  const vyrez = () =>
    [`Rok ${rok}. Noví na webe spolu: ${sum("novi")}`,
      tsv(["kanál", "noví", "podiel"], kanaly.map(([n2, v]) => [n2, v, `${pod(v).toFixed(0)} %`])),
      `Hlavné udalosti (konverzie): ${sum("udalosti")}`,
      diery.length ? `Mesiace bez merania (nie nula, diera): ${diery.join(", ")}` : "",
      castocne.length ? `Čiastočne merané mesiace: ${castocne.join(", ")}` : "",
      tsv(["mesiac", "noví", "organic search", "paid social", "organic social", "direct", "referral"],
        data.map((r) => [label(r.m), r.novi, r.organicSearch, r.paidSocial, r.organicSocial, r.direct, r.referral])),
    ].filter(Boolean).join("\n");
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <H3><Info text="Noví používatelia webu podľa toho, odkiaľ prišli. „Hlavné udalosti“ sú konverzie nastavené v GA4 — odoslaný formulár a podobne. Zdroj: priamo GA4 cez Analytics Data API, sťahuje sa v Mesiac → Dáta a uzávierka. Mesiace, v ktorých meranie nebežalo, sa do súčtov ani priemerov nepočítajú — nula by tvrdila, že nikto neprišiel." label="Web a kanály (GA4)" /></H3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <RokBar rok={rok} onRok={onRok} />
        <Vysvetli chat={chat} titul="Web a kanály (GA4)" filter={`rok ${rok}`} vyrez={vyrez} />
      </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 14px" }}>
        <StatCard value={num(sum("novi"))} label={`Noví na webe ${rok}`} color={C.accent} />
        <StatCard value={`${pod(platene).toFixed(0)} %`} label={<Info text={`${num(platene)} nových prišlo z platenej reklamy, ${num(organicke)} organicky.`} label="Z platenej reklamy" />} color={C.orange} />
        <StatCard value={num(sum("udalosti"))} label={<Info text="Konverzie zaznamenané v GA4 za obdobie — odoslané formuláre a iné nastavené udalosti." label="Hlavné udalosti" />} color={C.green} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {kanaly.map(([n2, v, col]) => (
          <div key={n2} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: C.textMuted, width: 112, flex: "0 0 auto" }}>{n2}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: mix(C.border, 70), overflow: "hidden" }}>
              <div style={{ width: `${pod(v)}%`, height: "100%", background: col }} />
            </div>
            <span style={{ fontSize: 12, color: C.text, fontVariantNumeric: "tabular-nums", width: 92, textAlign: "right" }}>{num(v)} · {pod(v).toFixed(0)} %</span>
          </div>
        ))}
      </div>
      {straz.map((n) => (
        <Hlasenie key={n.kluc} {...n} ack={ack} onSkry={onSkry} onVrat={onVrat} />
      ))}
      {(diery.length > 0 || castocne.length > 0) && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: mix(C.orange, 10), border: `1px solid ${mix(C.orange, 30)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          {diery.length > 0 && <><b>{diery.join(" a ")}</b> chýba — GA4 bolo odpojené, takže to nie je nula, ale diera. Do súčtov a priemerov sa nezapočítava. </>}
          {castocne.length > 0 && <><b>{castocne.join(", ")}</b> je len čiastočný, meranie sa rozbehlo v priebehu mesiaca.</>}
        </div>
      )}
      {zhrnutieWebu(vsetky) && (
        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 14, lineHeight: 1.55 }}>
          {zhrnutieWebu(vsetky)}
        </div>
      )}
    </Card>
  );
}

// ── Čo fungovalo na webe ─────────────────────────────────────────────────────
// Instagram má životnosť dva dni, článok pracuje roky. Preto patria vedľa seba:
// jedno ukazuje, čo zaujalo teraz, druhé to, čo ťa živí ticho na pozadí.
function CoFungovaloWeb({ rok, chat }: { rok: string; chat?: AssistantChat }) {
  // Rebríček z GA4 API je za STIAHNUTÉ OBDOBIE, nie po rokoch — riadky z neho
  // majú prázdny rok. Kým sa dáta neťahali, boli rozdelené na 2025 a 2026
  // a karta sa filtrovala rokom. Keď sú živé, filter by ju vyprázdnil.
  const zive = MKT_CLANKY.some((c) => !c.rok);
  const clanky = zive ? MKT_CLANKY : MKT_CLANKY.filter((c) => c.rok === rok);
  const obdobie = zive ? "posledných 18 mesiacov (živé z GA4)" : `rok ${rok}`;
  const vyrez = () => `${obdobie}\n` + tsv(["článok", "zobrazenia"], clanky.map((c) => [c.nazov, c.zobrazenia]));
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <H3><Info text="Najčítanejšie stránky webu podľa GA4 — zobrazenia za stiahnuté obdobie. Servisné stránky (Domov, Kontakt, Služby, Cenník) sú vynechané: vyhrali by vždy a nič by tým nepovedali, lebo to nie sú témy, ktoré si niekto vybral, ale dvere, ktorými prejde každý." label="Čo fungovalo na webe" /></H3>
      <Vysvetli chat={chat} titul="Čo fungovalo na webe" filter={obdobie} vyrez={vyrez} />
      </div>
      {clanky.length ? (
        <SortTable
          riadky={clanky}
          stlpce={[
            { id: "nazov", label: "Článok", farba: () => C.text },
            { id: "zobrazenia", label: "Zobrazenia", num: true, farba: () => C.accentLight },
          ]}
          minWidth={380}
        />
      ) : (
        <Empty>Za rok {rok} nemám GA4 dáta.</Empty>
      )}
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 12, lineHeight: 1.55 }}>
        Rozdiel oproti Instagramu je v životnosti: reel má dva dni, článok pracuje roky.
        (Za rok 2025 mal „Fascie – Voda v nás“ sám 1 829 zobrazení — viac než ostatné články dokopy.
        Aktuálne poradie je v tabuľke vyššie; táto veta je poznámka k histórii, nie živé číslo.)
      </div>
    </Card>
  );
}

// ── Vyhľadávanie ─────────────────────────────────────────────────────────────
// Toto je jediná karta, ktorá odpovedá na otázku „o čom písať" — a jediná, kde
// je vidieť rozdiel medzi tým, čo prináša čitateľov, a tým, čo prináša klientov.
function Vyhladavanie({ chat }: { chat?: AssistantChat }) {
  // SEO sa hýbe pomaly — na kratšom okne než rok je to šum.
  const [obdobie, setObdobie] = useState("2026");
  const okno = oknoMesiacov(obdobie, GSC_MESACNE.map((r) => r.m));
  const data = GSC_MESACNE.filter((r) => okno.includes(r.m));
  const kliky = data.reduce((a, r) => a + r.kliky, 0);
  const zobrazenia = data.reduce((a, r) => a + r.zobrazenia, 0);
  const ctr = zobrazenia > 0 ? (kliky / zobrazenia) * 100 : 0;
  const mobil = GSC_ZARIADENIA.find((z) => z.zariadenie === "Mobil");
  const mobilPct = mobil ? (mobil.kliky / GSC_ZARIADENIA.reduce((a, z) => a + z.kliky, 0)) * 100 : 0;

  const tabulka = (nadpis: string, info: string, riadky: GscDopyt[]) => (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <H3><Info text={info} label={nadpis} /></H3>
      <Vysvetli chat={chat} titul={nadpis} filter="celé obdobie (Search Console inak dopyty nedáva)"
        vyrez={() => tsv(["dopyt", "kliky", "zobrazenia", "MP %", "pozícia"], riadky.map((r) => [r.dopyt, r.kliky, r.zobrazenia, r.ctr, r.pozicia]))} />
      </div>
      <SortTable
        rolovat={3}
        riadky={riadky}
        stlpce={[
          { id: "dopyt", label: "Dopyt", farba: () => C.text },
          { id: "kliky", label: "Kliky", num: true, info: "Koľko ľudí na výsledok reálne kliklo a prišlo na web.", farba: (r) => (r.kliky > 0 ? C.accentLight : C.textDim) },
          { id: "zobrazenia", label: "Zobrazenia", num: true, info: "Koľkokrát sa web ukázal vo výsledkoch vyhľadávania — bez ohľadu na to, či niekto klikol." },
          { id: "ctr", label: "MP", num: true, info: "Miera prekliku = kliky ÷ zobrazenia. Koľko % ľudí, ktorí ťa vo výsledkoch videli, aj kliklo. Vysoké zobrazenia s nízkou MP znamenajú, že Google ťa ukazuje, ale titulok nezaujme.", fmt: (v) => `${v} %`, farba: (r) => (r.ctr >= 5 ? C.green : r.ctr >= 1 ? C.textMuted : C.red) },
          { id: "pozicia", label: "Pozícia", num: true, info: "Priemerné poradie vo výsledkoch. 1–10 je prvá strana Googlu; nad 20 už prakticky nikto nedočíta.", farba: (r) => (r.pozicia <= 10 ? C.text : C.textDim) },
        ]}
      />
    </Card>
  );

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Google Search Console za 31.3.2025 – 30.6.2026. Kliky = ľudia, ktorí prišli z vyhľadávania. Zobrazenia = koľkokrát sa web ukázal vo výsledkoch. MP = miera prekliku, teda koľko % zobrazení skončilo klikom. Tabuľky dopytov a stránok sú vždy za celé obdobie — Search Console ich inak nedáva." label="Vyhľadávanie (Search Console)" /></H3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <ObdobieBar hodnota={obdobie} onChange={setObdobie} />
            <Vysvetli chat={chat} titul="Vyhľadávanie (Search Console)" filter={obdobieLabel(obdobie)}
              vyrez={() => [`Spolu: ${kliky} klikov, ${zobrazenia} zobrazení, MP ${ctr.toFixed(2)} %, z mobilu ${mobilPct.toFixed(0)} %`,
                tsv(["mesiac", "kliky", "zobrazenia"], data.map((r) => [label(r.m), r.kliky, r.zobrazenia]))].join("\n")} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 14px" }}>
          <StatCard value={num(kliky)} label="Kliky z Googlu" color={C.green} />
          <StatCard value={num(zobrazenia)} label="Zobrazenia" color={C.accent} />
          <StatCard value={`${ctr.toFixed(2)} %`} label={<Info text="Priemerná miera prekliku. Pri prevažne informačných dopytoch je 2–3 % normál; pri dopytoch so zámerom kúpiť býva mnohonásobne vyššia." label="Miera prekliku" />} color={C.blue} />
          <StatCard value={`${mobilPct.toFixed(0)} %`} label={<Info text="Podiel klikov z mobilu za celé obdobie. Podľa toho sa dá posúdiť, či má web zmysel ladiť najprv pre telefón." label="Z mobilu" />} color={C.orange} />
        </div>
        <ValueBars
          data={data.map((r) => ({ label: label(r.m), value: r.kliky }))}
          color={C.green}
          fmt={(n) => String(Math.round(n))}
          height={150}
          alignEnd
        />
        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 10, lineHeight: 1.55 }}>
          Vyhľadávanie je najpomalší kanál, aký máš, a zároveň jediný, ktorý neprestane
          fungovať, keď prestaneš platiť — trend čítaj z grafu nad touto vetou, nie z viet.
        </div>
      </Card>

      {tabulka("Čo ťa nachádza", "Dopyty, ktoré reálne privádzajú ľudí. Značkové dopyty („prosapiens“) sú ľudia, čo ťa už poznajú — tie nerátaj medzi nových.", GSC_DOPYTY)}

      {tabulka(
        "Kde sa zobrazuješ, ale nikto neklikne",
        "Dopyty s veľa zobrazeniami a takmer nulovým preklikom. Znamená to, že Google web ukazuje, ale titulok alebo popis nezaujme — alebo je to dopyt, ktorý s tvojou službou nesúvisí a nemá zmysel oň bojovať. Toto je najlacnejšia práca v SEO: text už existuje, mení sa len nadpis.",
        prilezitosti(GSC_DOPYTY as unknown as Dopyt[]),
      )}

      {tabulka(
        "Dopyty so zámerom kúpiť",
        "Presne tie dopyty, ktoré píše človek, čo hľadá tréning v Brne — nie encyklopédiu. Sem patria tvoji budúci klienti.",
        soZamerom(GSC_DOPYTY as unknown as Dopyt[]),
      )}
    </>
  );
}

/**
 * Stránky webu — či je web v poriadku.
 *
 * Jerry, 17. 8. 2026: „príde mi to strašne rozsiahle a ťažko sa v tom
 * orientuje." Mal pravdu: jedna záložka „Web a Google" merala 4 785 pixelov
 * a robila štyri rôzne práce naraz. Rez nevedie medzi „web" a „Google" —
 * Search Console aj GA4 sú Google, ale merajú tvoj web. Vedie medzi OTÁZKAMI:
 * „kto ma hľadá a či klikne" (Vyhľadávanie) a „sú moje stránky v poriadku"
 * (tu). Preto sú dopyty tam a stránky sem.
 */
function StrankyWebu({ chat }: { chat?: AssistantChat }) {
  return (
    <>
      <Titulky chat={chat} />

      <Rychlost chat={chat} />

      {WEB_STRANKY.length > 0 && (() => {
        const chyby = chybyNaStrankach(WEB_STRANKY.map((s) => ({ ...s, text: "" })));
        if (!chyby.length) return null;
        return (
          <Card>
            <H3><Info label="Čo je na stránkach technicky zle" text="Spočítané z textu, ktorý už v Kokpite je — žiadny SEO nástroj ani ďalšia služba. Duplicitný titulok znamená, že si dve tvoje stránky vo výsledkoch konkurujú a Google si vyberie, ktorú ukáže. Odseknutý titulok znamená, že človek prečíta len jeho polovicu. Nie je to celý audit; je to tá časť, ktorá sa dá overiť z vlastných dát a niečo z nej vyplýva." /></H3>
            <SortTable
              rolovat={3}
              riadky={chyby}
              stlpce={[
                { id: "druh", label: "Nález", farba: (r) => (r.druh.includes("duplicit") || r.druh.includes("chýba") ? C.red : C.textMuted) },
                { id: "url", label: "Stránka", farba: () => C.text, fmt: (v) => <OdkazStranky url={String(v)} /> },
                { id: "detail", label: "Čo to znamená" },
              ]}
            />
          </Card>
        );
      })()}

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3><Info text="Ktoré stránky ťahajú návštevnosť z vyhľadávania. Klikni na hlavičku a zoradíš podľa čohokoľvek." label="Najsilnejšie stránky" /></H3>
        <Vysvetli chat={chat} titul="Najsilnejšie stránky" filter="celé obdobie"
          vyrez={() => tsv(["stránka", "kliky", "zobrazenia", "MP %", "pozícia"], (GSC_STRANY as unknown as GscStrana[]).map((r) => [r.url, r.kliky, r.zobrazenia, r.ctr, r.pozicia]))} />
        </div>
        <SortTable
          rolovat={3}
          riadky={GSC_STRANY as unknown as GscStrana[]}
          stlpce={[
            { id: "url", label: "Stránka", farba: () => C.text, fmt: (v) => <OdkazStranky url={String(v)} /> },
            { id: "kliky", label: "Kliky", num: true, farba: () => C.accentLight },
            { id: "zobrazenia", label: "Zobrazenia", num: true },
            { id: "ctr", label: "MP", num: true, info: "Miera prekliku = kliky ÷ zobrazenia.", fmt: (v) => `${v} %`, farba: (r) => (r.ctr >= 5 ? C.green : C.textMuted) },
            { id: "pozicia", label: "Pozícia", num: true },
          ]}
        />
      </Card>
    </>
  );
}

/**
 * Titulky, ktoré Google ukazuje a nikto na ne neklikne.
 *
 * PREČO JE TÁTO KARTA INÁ NEŽ „Kde sa zobrazuješ, ale nikto neklikne"
 *
 * Tá je o DOPYTOCH: povie, na čo sa ľudia pýtali. Táto je o STRÁNKACH a má pri
 * každej jej SÚČASNÝ titulok — teda presne to, čo sa prepisuje. Dovtedy sa dalo
 * povedať len „15 777 zobrazení, 97 klikov", čo je číslo bez akcie.
 */
function Titulky({ chat }: { chat?: AssistantChat }) {
  const riadky = prilezitostiTitulkov(
    WEB_STRANKY.map((s) => ({ ...s, text: "" })),
    (GSC_STRANY as unknown as GscStrana[]).map((g) => ({ url: g.url, zobrazenia: g.zobrazenia, kliky: g.kliky })),
  );
  if (!WEB_STRANKY.length) {
    return (
      <Card>
        <H3>Titulky na prepis</H3>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.55, marginTop: 6 }}>
          Text webu sa ešte nestiahol. V Údajoch → Napojenia je karta „Text webu“;
          po prečítaní tu bude pri každej stránke jej titulok a bude jasné, čo prepísať.
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3><Info label="Titulky na prepis" text="Stránky, ktoré Google ukazuje veľa a nikto na ne neklikne — merané proti mediánu prekliku celého webu, nie proti číslu z klobúka. Pri každej je jej súčasný titulok, takže sa dá povedať, čo prepísať. Text stránok už existuje; mení sa jedna veta." /></H3>
        <Vysvetli chat={chat} titul="Titulky na prepis" filter="celé obdobie"
          vyrez={() => tsv(["stránka", "titulok", "zobrazenia", "kliky", "MP %"], riadky.map((r) => [r.url, r.titulok, r.zobrazenia, r.kliky, r.ctr]))} />
      </div>
      {riadky.length === 0 ? (
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>Žiadna stránka nie je výrazne pod mediánom webu. To je dobrá správa, nie prázdna tabuľka.</div>
      ) : (
        <SortTable
          rolovat={3}
          riadky={riadky}
          stlpce={[
            { id: "titulok", label: "Súčasný titulok", farba: () => C.text },
            { id: "url", label: "Stránka", fmt: (v) => <OdkazStranky url={String(v)} /> },
            { id: "zobrazenia", label: "Zobrazenia", num: true, farba: () => C.accentLight },
            { id: "kliky", label: "Kliky", num: true },
            { id: "ctr", label: "MP", num: true, info: "Miera prekliku = kliky ÷ zobrazenia.", fmt: (v) => `${v} %`, farba: () => C.red },
          ]}
        />
      )}
    </Card>
  );
}

/**
 * Rýchlosť stránok.
 *
 * PREČO SA UKAZUJE MOBIL A POČÍTAČ VEDĽA SEBA, A NIE PRIEMER
 *
 * Sú to dve rôzne merania na dvoch rôznych pripojeniach a spravidla dve dosť
 * odlišné čísla. Priemer z nich by nebol ani jedno. Rozhoduje mobil: Google
 * indexuje podľa neho a chodí z neho väčšina ľudí — preto je vľavo.
 *
 * PREČO TU NIE JE SKÓRE AKO HLAVNÉ ČÍSLO
 *
 * „47/100" sa nedá opraviť. „Človek pozerá na neúplnú stránku 4,3 sekundy"
 * áno — a hneď za tým stojí, čo z toho je najväčší jediný kus.
 */
function Rychlost({ chat }: { chat?: AssistantChat }) {
  if (!WEB_RYCHLOST.length) return null;

  const mobil = WEB_RYCHLOST.filter((r) => r.strategia === "mobile" && !r.chyba);
  const desktop = new Map(WEB_RYCHLOST.filter((r) => r.strategia === "desktop" && !r.chyba).map((r) => [r.url, r]));
  const zlyhane = WEB_RYCHLOST.filter((r) => r.chyba);

  const riadky = mobil
    .map((r) => ({
      url: r.url.replace("https://www.prosapiens.cz/", ""),
      lcp: r.lcpMs === null ? 0 : Math.round(r.lcpMs / 100) / 10,
      lcpPc: (() => { const d = desktop.get(r.url); return d?.lcpMs == null ? 0 : Math.round(d.lcpMs / 100) / 10; })(),
      vykon: r.vykon ?? 0,
      seo: r.seo ?? 0,
      co: hodnotenie(r).veta,
      stav: hodnotenie(r).stav,
    }))
    .sort((a, b) => b.lcp - a.lcp);

  const zle = riadky.filter((r) => r.stav === "zle").length;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3><Info label="Ako rýchlo sa stránky otvárajú" text="Merané Googlom cez PageSpeed Insights na simulovanom pomalom mobilnom pripojení — teda tak, ako to zažije človek na ceste, nie na wifi v štúdiu. „Hlavný obsah“ je najväčší prvok na obrazovke; Google berie do 2,5 s ako dobré a nad 4 s ako zlé, a je to jeden z jeho hodnotiacich faktorov. Stĺpec „mobil“ rozhoduje: podľa neho sa web indexuje." /></H3>
        <Vysvetli chat={chat} titul="Rýchlosť stránok" filter="posledné meranie"
          vyrez={() => tsv(["stránka", "mobil s", "počítač s", "výkon", "SEO", "čo to znamená"], riadky.map((r) => [r.url, r.lcp, r.lcpPc, r.vykon, r.seo, r.co]))} />
      </div>
      {zle > 0 && (
        <div style={{ fontSize: 13, color: C.red, marginTop: 6 }}>
          {zle === 1 ? "Jedna stránka je nad 4 sekundy" : `${zle} stránok je nad 4 sekundy`} — to je hranica, za ktorou Google hovorí „zlé“.
        </div>
      )}
      <SortTable
        rolovat={3}
        riadky={riadky}
        stlpce={[
          { id: "url", label: "Stránka", farba: () => C.text, fmt: (v) => <OdkazStranky url={String(v)} /> },
          { id: "lcp", label: "Mobil", num: true, info: "Za koľko sekúnd človek uvidí hlavný obsah na mobile.", fmt: (v) => `${String(v).replace(".", ",")} s`, farba: (r) => (r.lcp > 4 ? C.red : r.lcp > 2.5 ? C.orange : C.green) },
          { id: "lcpPc", label: "Počítač", num: true, fmt: (v) => (v ? `${String(v).replace(".", ",")} s` : "—"), farba: (r) => (r.lcpPc > 4 ? C.red : r.lcpPc > 2.5 ? C.orange : C.textMuted) },
          { id: "vykon", label: "Výkon", num: true, info: "Lighthouse skóre 0–100. Je to súhrn, nie akcia — akcia je v poslednom stĺpci.", farba: (r) => (r.vykon < 50 ? C.red : r.vykon < 90 ? C.orange : C.green) },
          { id: "seo", label: "SEO", num: true, info: "Technické SEO stránky podľa Lighthouse: titulok, popis, čitateľnosť pre robota. Neháda kvalitu textu.", farba: (r) => (r.seo < 90 ? C.orange : C.green) },
          { id: "co", label: "Čo to znamená" },
        ]}
      />
      {zlyhane.length > 0 && (
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
          {zlyhane.length} meraní neprešlo (najčastejšie limit Googlu bez API kľúča) — tieto stránky tu nie sú
          a nie sú tu ani ako nuly. Nezmerané a pomalé nie je to isté.
        </div>
      )}
    </Card>
  );
}

export function Marketing({ data, clients, leads, chat, sub, onSub, onKlient, refresh, onPoznamkaStrata, onNavigate, focus, onAck }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[]; chat?: AssistantChat; sub: string; onSub: (s: string) => void; onKlient?: (m: string) => void; refresh: () => Promise<void>; onPoznamkaStrata?: (meno: string, text: string) => void; onNavigate?: (tab: string, sub?: string) => void; focus?: { client?: string; filter?: string; nonce?: number } | null; onAck?: (kluc: string, zapnut: boolean, poznamka?: string) => void }) {
  const setSub = onSub;
  // Jedno miesto, odkiaľ karty berú stav skrytia — inak by každá karta
  // potrebovala vlastné tri propy a jedna by ich časom nedostala.
  const skrytie: SkrytieProps = {
    ack: data.anomalyAck,
    onSkry: onAck ? (k) => onAck(k, true) : undefined,
    onVrat: onAck ? (k) => onAck(k, false) : undefined,
  };
  const [rok, setRok] = useState("2026");
  // Nahraté exporty vyhrávajú nad číslami v kóde. Načíta sa raz pri otvorení;
  // `tik` je len na to, aby sa obrazovka po výmene prekreslila — samotné dáta
  // žijú v module, lebo ich číta desať miest naprieč touto obrazovkou.
  // Sklady plní App.tsx pri štarte jedným volaním /api/marketing — táto
  // obrazovka ich od 19. 8. 2026 už neplní druhýkrát. `marketingVerzia()`
  // v deps nižšie zabezpečí prekreslenie, keď dorazia.
  const [, tik] = useState(0);
  useEffect(() => { tik((x) => x + 1); }, [marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  // The header used to sum all 18 months no matter which year was selected —
  // the switch looked broken because the summary never moved.
  const vRoku = MKT_MESACNE.filter((r) => r.m.startsWith(rok));
  const suma = (k: "posty" | "reels" | "stories" | "spend") => vRoku.reduce((a, r) => a + r[k], 0);

  return (
    <>
      {/* Nad záložkami, nie v jednej z nich: sú to čísla, ktoré platia bez
          ohľadu na to, ktorú otázku si práve otváraš. */}
      <MarketingVrch data={data} clients={clients} />
      <SubTabs
        // Osem podzáložiek v troch rodinách (Jerry, 17. 8.: „nedá sa aj to
        // nejako optimalizovať?"). Zlučovať ich by bola chyba — Soc. siete
        // majú jednu kartu, ale Reels & posty 3 558 pixelov a spojením by
        // vznikla presne tá obrazovka, ktorú sme práve rozbili. Nemení sa
        // teda počet, ale to, či sa v nich dá zorientovať očami.
        //
        // Poradie je poradie otázok, ktoré rozhodujú o peniazoch — nie zoznam
        // kanálov. Predtým bol prvý „Prehľad" s počtom postov a reels, čo je
        // výkaz práce, nie odpoveď. Instagram priviedol za 18 mesiacov 5
        // klientov, referencie 26; karty majú zodpovedať tomuto pomeru, nie
        // tomu, kde je najviac dát.
        tabs={[
          // Dopyty prvé: sú vstupom lievika a jediná záložka, kde sa niečo
          // zapisuje. Ostatné tri sú čítanie nad tým, čo tu vznikne.
          { id: "dopyty", label: "Dopyty", skupina: "Výsledok" },
          { id: "lievik", label: "Odkiaľ prišli klienti", skupina: "Výsledok" },
          { id: "naklady", label: "Čo to stálo", skupina: "Výsledok" },
          // „Dosah a obsah" bola jedna záložka zlepená z dvoch obrazoviek:
          // Instagram a vyhľadávanie. Hýbu sa inou rýchlosťou — reel žije dni,
          // pozícia v Googli mesiace — a v jednom okne sa jedno z nich vždy
          // čítalo zle. Kanály zostali zvlášť: sú jediný pohľad cez VŠETKY
          // kanály naraz a bývaju v nich rozbory mesiaca.

          // „Web a Google" bola jedna záložka na 4 785 pixelov so štyrmi
          // rôznymi prácami. Rez nevedie medzi web/Google (Search Console aj
          // GA4 sú Google, ale merajú tvoj web), ale medzi otázkami: „kto ma
          // hľadá a či klikne" verzus „sú moje stránky v poriadku".
          // Id „web" zostáva pôvodné — visia na ňom odkazy z Kokpitu.
          { id: "vyhladavanie", label: "Vyhľadávanie", skupina: "Kde nás nájdu" },
          { id: "web", label: "Web", skupina: "Kde nás nájdu" },
          // Obsah nakoniec zámerne: je to práca, ktorú robíš, nie výsledok,
          // ktorý rozhoduje. Poradie chipov je poradie otázok.
          { id: "kanaly", label: "Soc. siete", skupina: "Čo púšťame von" },
          // Rez medzi „čo idem spraviť" a „čo fungovalo".
          //
          // „Reels & posty" bola jedna obrazovka na 3 558 pixelov so siedmimi
          // kartami a dvoma rôznymi prácami: hore sa PLÁNUJE (zadanie, návrhy
          // z dát, nápady zo Zápisu), dole sa VYHODNOCUJE (čo vyšlo, ako to
          // dopadlo, kedy publikovať, po čom sa ľudia ozvali). Sú to dve
          // sedenia v iný deň a v jednom okne sa to hore vždy prescrollovalo.
          // Rovnaký rez ako pri Web × Vyhľadávanie (18. 8. 2026).
          { id: "navrhy", label: "Čo publikovať", skupina: "Čo púšťame von" },
          { id: "obsah", label: "Reels & posty", skupina: "Čo púšťame von" },
          { id: "mail", label: "Mailer", skupina: "Čo púšťame von" },
          // Kampaň nie je záložka — je to preklik do Jarvisa. Kampaň sa
          // pripravuje debatou (čo má dosiahnuť, kam viesť, za koľko) a tá
          // patrí k nemu; formulár bez debaty by bol len ďalšie políčko.
          // Jerry, 19. 8. 2026: „daj tam možnosť kliknúť na kampaň a
          // preklikne ma to na Jarvisa na tú podkategóriu."
          { id: "kampan", label: "Kampaň ↗", skupina: "Čo púšťame von" },
          // Algoritmus tu bol záložkou a Jerry ju 12. 8. zrušil: čítal ju
          // dvakrát a odvtedy nie. Dáta žijú ďalej — sťahujú sa každú noc
          // a idú Jarvisovi do kontextu, lebo pri plánovaní obsahu rozhodujú.
          // Karta sa dá vrátiť jedným riadkom, keby ju predsa chcel vidieť.
        ]}
        value={sub}
        onChange={(id) => {
          if (id !== "kampan") { setSub(id); return; }
          // Nový rozhovor, nie prepnutie zamerania rozbehnutej debaty:
          // prepísať zameranie tomu, čo práve píšeš, je vedľajší účinok,
          // ktorý nikto nechcel (rovnaká úvaha ako pri „zmeniť zameranie").
          chat?.newChat("kampan");
          // Bez tohto Jarvisova stránka pri otvorení založí ďalší rozhovor
          // — a ten už zameranie nemá. Overené naživo 19. 8. 2026: preklik
          // fungoval, ale otvoril „Poradcu naprieč celou firmou".
          chat?.zachovajOkno();
          chat?.setFloatingOpen(false);
          onNavigate?.("jarvis");
        }}
      />

      {sub === "dopyty" && <Dopyty leads={leads} clients={clients} refresh={refresh} focus={focus} />}

      {sub === "lievik" && (
        <>
          <Lievik data={data} clients={clients} onPoznamka={onPoznamkaStrata} />
          <Kohorta data={data} clients={clients} />
        </>
      )}
      {/* JEDNA karta na otázku „čo priniesla reklama".
          Boli štyri — „Čo to prinieslo" (výdavok ÷ úvodné), „Čo to stálo"
          (výdavok ÷ všetci noví), „Platená cesta" a „Kampane" — každá
          s vlastným výpočtom, vlastným prepínačom obdobia a iným výsledkom.
          Podľa nich sa pritom rozhodovalo o rozpočte (18. 8. 2026). */}
      {sub === "naklady" && (
        <>
          <Reklama data={data} clients={clients} />
          <AkoMeratReklamu />
          <PripravitKampan />
        </>
      )}
      {sub === "kanaly" && <Kanaly data={data} clients={clients} chat={chat} />}

      {/* ČO PUBLIKOVAŤ — plánovanie. Poradie je poradie otázok: ako sa zadanie
          odovzdá → čo do neho dať podľa dát → čo sa ľudia nahlas spýtali. */}
      {sub === "navrhy" && (
        <>
          <Zadanie chat={chat} nastaveneAt={data.anomalyAck?.["project|nastavene"]?.ackedAt || null} onNastavene={(hotovo) => onAck?.("project|nastavene", hotovo, "Claude Project nastavený")} />
          {/* Plán je NAD mapou: najprv cieľ a obdobie, potom obsah, ktorý ho
              má naplniť. Opačné poradie robilo z obsahu samoúčel. */}
          <PlanMarketingu data={data} clients={clients} chat={chat} onNavigate={onNavigate} />
          {/* Mapa je nad počítanými návrhmi zámerne: najprv treba vidieť, kam
              sa obsah chystá, až potom čítať, čo do toho dáta odporúčajú.
              Opačné poradie robilo z návrhov zoznam bez miesta, kam ich dať. */}
          <MapaCyklu data={data} chat={chat} onNavigate={onNavigate} />
          <PlanObsahu data={data} chat={chat} onNavigate={onNavigate} />
          {/* Nápady hneď za návrhmi z dát. Jedna karta vie, čo ľudia hľadali,
              druhá čo sa nahlas spýtali — nie je to duplicita. */}
          <Napady chat={chat} />
        </>
      )}

      {/* REELS & POSTY — vyhodnotenie toho, čo už vyšlo. */}
      {sub === "obsah" && (
        <>
          <CoSomRobil chat={chat} />
          {/* Živé z Graph API hneď za tým, čo sa publikovalo, a pred ručnou
              tabuľkou. Obe odpovedajú na tú istú otázku z dvoch strán: táto sa
              aktualizuje sama, tá pod ňou drží view rate, ktorý API nedáva.
              Kým sa nezhodnú na tom istom poradí kategórií, platia obe. */}
          {/* Dve karty o obsahu, nie tri. Ručná tabuľka „Čo fungovalo" merala
              to isté z jarného zatriedenia a držala sa kvôli jedinému stĺpcu
              (view rate); ten sa teraz doťahuje z Metricoolu rovno sem.
              „Po čom nám niekto napísal" zostáva samostatná zámerne: meria
              DOPYT, nie uloženia — a keby splynula, stokrát početnejšie
              uloženia by ten slabší signál prevalcovali. */}
          <ObsahZive />
          {/* Kedy publikovať je nastavenie, nie práca — preto vlastná karta
              a nie ďalší stĺpec v tabuľke vyššie. */}
          <KedyPublikovat />
          <ObsahDopyt leads={leads} />
        </>
      )}

      {sub === "mail" && <Mail clients={clients} leads={leads} />}

      {/* Vyhľadávanie = kto ma hľadá a či klikne. Google Ads sem patrí:
          je to platené vyhľadávanie, tá istá otázka za peniaze. */}
      {sub === "vyhladavanie" && (
        <>
          <Vyhladavanie chat={chat} />
          <GoogleAdsKarta clients={clients} chat={chat} {...skrytie} />
        </>
      )}
      {/* Web = sú moje stránky v poriadku a chodí na ne niekto. */}
      {sub === "web" && (
        <>
          <StrankyWebu chat={chat} />
          <WebKanaly rok={rok} onRok={setRok} chat={chat} {...skrytie} />
          <CoFungovaloWeb rok={rok} chat={chat} />
        </>
      )}
    </>
  );
}
