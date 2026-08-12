import { fetchVzasSettings, saveVzasSetting } from "../../lib/psb/client";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { fmtDMY, fmtCZK } from "../../lib/psb/format";
import {
  GA4_MESACNE,
  GSC_DOPYTY,
  GSC_LOKALNE,
  GSC_MESACNE,
  GSC_PRILEZITOSTI,
  GSC_STRANY,
  GSC_ZARIADENIA,
  MKT_CLANKY,
  MKT_MESACNE,
  MKT_TOP,
  mktSum,
  MKT_ZDROJ,
  nastavMarketingZImportu,
  nastavWebZImportu,
  type Ga4Mesiac,
  type GscDopyt,
  type GscMesiac,
  type GscStrana,
  type MktKus,
  type MktMesiac,
} from "../../lib/psb/marketing";
import { KATEGORIE_HOOKOV, MKT_OBSAH } from "../../lib/psb/marketing-obsah";
import { Dopyty } from "./Dopyty";
import { Kampane } from "./Kampane";
import { MarketingVrch } from "./MarketingVrch";
import { ObsahZive } from "./ObsahZive";
import { Algoritmus } from "./Algoritmus";
import { AkoMeratReklamu, Kohorta, Lievik, Naklady } from "./MarketingLievik";
import { Kanaly } from "./Kanaly";
import { C, mix, S } from "../../lib/psb/theme";
import type { AssistantChat } from "./Assistant";
import type { ClientAgg } from "../../lib/psb/compute";
import type { Lead, PSBData } from "../../lib/psb/types";
import { Card, Empty, H3, Info, Select, StatCard, SubTabs, ValueBars, useRolovanie } from "./ui";

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

const obdobieLabel = (v: string) => OBDOBIA.find((o) => o.value === v)?.label ?? v;

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
// Štandard rodiny M — rovnaké poradie ako v Peniazoch, len s krátkymi oknami
// navrchu (marketing sa číta v mesiacoch, nie rokoch).
const OBDOBIA = [
  { value: "all", label: "Celé obdobie" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
  { value: "6m", label: "Posledných 6 mes." },
  { value: "3m", label: "Posledné 3 mes." },
  { value: "1m", label: "Posledný mesiac" },
  { value: "custom", label: "Vlastné" },
];

// Vráti zoznam mesiacov "YYYY-MM", ktoré do okna patria.
function oknoMesiacov(obdobie: string, vsetky: string[]): string[] {
  const zoradene = [...new Set(vsetky)].sort();
  if (obdobie === "all") return zoradene;
  if (obdobie === "2025" || obdobie === "2026") return zoradene.filter((m) => m.startsWith(obdobie));
  if (obdobie.startsWith("custom:")) {
    const [od, doM] = obdobie.slice(7).split("|");
    return zoradene.filter((m) => (!od || m >= od) && (!doM || m <= doM));
  }
  const n = obdobie === "1m" ? 1 : obdobie === "3m" ? 3 : obdobie === "6m" ? 6 : 12;
  return zoradene.slice(-n);
}

function ObdobieBar({ hodnota, onChange, poznamka }: { hodnota: string; onChange: (v: string) => void; poznamka?: string }) {
  // „Vlastné" nesie rozsah priamo v hodnote ("custom:2026-01|2026-04") —
  // ObdobieBar používa päť kariet a stav rozsahu by inak musela držať každá.
  const jeCustom = hodnota === "custom" || hodnota.startsWith("custom:");
  const [od, doM] = hodnota.startsWith("custom:") ? hodnota.slice(7).split("|") : ["", ""];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {poznamka && <span style={{ fontSize: 11, color: C.textDim }}>{poznamka}</span>}
      <Select value={jeCustom ? "custom" : hodnota} onChange={(v) => onChange(v === "custom" ? "custom:|" : v)} options={OBDOBIA} />
      {jeCustom && (
        <>
          <input type="month" value={od} onChange={(e) => onChange(`custom:${e.target.value}|${doM}`)}
            style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }} />
          <span style={{ color: C.textDim }}>–</span>
          <input type="month" value={doM} onChange={(e) => onChange(`custom:${od}|${e.target.value}`)}
            style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }} />
        </>
      )}
    </div>
  );
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
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
            {stlpce.map((c) => {
              const aktivny = sort.id === c.id;
              return (
                <th key={c.id} onClick={() => klik(c)}
                  style={{ textAlign: c.num ? "right" : "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", color: aktivny ? C.accentLight : C.textMuted, userSelect: "none" }}>
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
        <span style={{ fontSize: 11, color: C.textDim }}>⚑ kampane & akcie — čo v tom čase bežalo</span>
        <button onClick={() => setPridavam((v) => !v)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 9px", color: C.accentLight, fontSize: 11, cursor: "pointer" }}>
          {pridavam ? "zavrieť" : "+ kampaň / akcia"}
        </button>
      </div>
      {pridavam && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 7 }}>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)}
            style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { void uloz([...znacky, { id: `z${Date.now().toString(36)}`, datum, text: text.trim() }]); setText(""); setPridavam(false); } }}
            placeholder="napr. spustená Meta kampaň na reel o kolene"
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
    metrika: "Videnia na reel", norma: 580, poznamka: "priemer účtov 1–5 tis. sledovateľov",
    nase: (rs) => {
      const reels = rs.reduce((a, r) => a + r.reels, 0);
      return reels ? Math.round(rs.reduce((a, r) => a + r.views, 0) / Math.max(1, reels + rs.reduce((a, r) => a + r.posty, 0)) ) : 0;
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
  const rs = MKT_MESACNE.slice(-3);
  if (!rs.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>
        Posledné 3 mesiace oproti benchmarku
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
    const vyber = MKT_OBSAH.filter((r) => okno.includes(r.m));
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
function CoFungovalo({ chat }: { chat?: AssistantChat }) {
  // Otázka znie „čo funguje TERAZ", nie „čo kedy fungovalo" — preto 90 dní.
  const [obdobie, setObdobie] = useState("2026");
  const okno = oknoMesiacov(obdobie, MKT_MESACNE.map((r) => r.m));
  const vyber = MKT_TOP.filter((k) => okno.includes(k.m));
  const vyrez = () =>
    tsv(["mesiac", "typ", "hook (prvá veta)", "uloženia", "videnia", "view rate"],
      vyber.map((k) => [label(k.m), k.typ, k.hook, k.ulozenia, k.views, k.viewRate ? `${k.viewRate} %` : "—"]));
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3><Info text="Rebríček podľa ULOŽENÍ, nie lajkov. Uloženie znamená „toto si chcem nechať“ a je zo všetkých metrík najbližšie k zámeru; lajk nehovorí nič." label="Čo fungovalo" /></H3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ObdobieBar hodnota={obdobie} onChange={setObdobie} />
          <Vysvetli chat={chat} titul="Čo fungovalo" filter={obdobieLabel(obdobie)} vyrez={vyrez} />
        </div>
      </div>
      {!vyber.length && <Empty>V tomto okne nemám žiadny príspevok v rebríčku — skús dlhšie obdobie.</Empty>}
      <div style={{ marginTop: 4 }}>
        {vyber.map((k, i) => (
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
      {/* Veta „štyri z ôsmich sú klientske príbehy" tu bola natvrdo a viazala
          sa na starý statický rebríček — od chvíle, keď top plní databáza z
          nahratých exportov, by klamala. Interpretáciu robí Jarvis nad živými
          dátami cez „Vysvetli mi to". */}
      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: mix(C.blue, 10), border: `1px solid ${mix(C.blue, 30)}`, color: C.text, fontSize: 12.5, lineHeight: 1.55 }}>
        <b>Čo z týchto dát POVEDAŤ NEJDE:</b> či obsah priniesol klientov. Medzi príspevkom a úvodným tréningom nie je
        žiadne spojenie — odpoveď dáva len dopyt a pole „odkiaľ prišiel“. Na to je záložka <b>Odkiaľ prišli klienti</b>.
      </div>
      <div style={{ marginTop: 16 }}>
        <PodlaHooku okno={okno} />
      </div>
    </Card>
  );
}

// ── Čo to prinieslo ──────────────────────────────────────────────────────────
function CoToPrinieslo({ data, clients, leads, chat }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[]; chat?: AssistantChat }) {
  // Vlastný rok: globálny prepínač žil v hlavičke, ktorá sa zobrazuje len v
  // Dosahu — z lievika, kde táto karta reálne je, sa rok nedal zmeniť vôbec.
  const [rok, setRok] = useState("2026");
  const uvodne = useMemo(
    () => data.sessions.filter((s) => s.sessionType === "UVODNE" && s.date.slice(0, 4) === rok).length,
    [data.sessions, rok],
  );
  const spend = MKT_MESACNE.filter((r) => r.m.startsWith(rok)).reduce((a, r) => a + r.spend, 0);
  const cac = uvodne > 0 ? spend / uvodne : 0;
  // LTV: what a settled client pays over the whole relationship.
  const ltv = useMemo(() => {
    const g = Object.values(clients).filter((c) => c.sessionCount >= 3);
    return g.length ? g.reduce((a, c) => a + c.totalPrice, 0) / g.length : 0;
  }, [clients]);

  const vyrez = () =>
    [`Rok ${rok}`, `Reklama spolu: ${Math.round(spend)} Kč`, `Úvodné tréningy: ${uvodne}`,
      `Cena za úvodný (horný odhad): ${Math.round(cac)} Kč`, `Hodnota klienta (LTV, ≥3 sedenia): ${Math.round(ltv)} Kč`,
      `Dopytov v lieviku: ${leads.length}`].join("\n");
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <H3><Info text="Instagram nikdy nepovie, kto sa stal klientom. Preto sa tu porovnávajú len dve veci, ktoré vieme: koľko stála reklama a koľko úvodných tréningov reálne prišlo. Skutočnú odpoveď „odkiaľ“ dá až lievik dopytov." label="Čo to prinieslo" /></H3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {["2025", "2026"].map((y) => (
          <button key={y} onClick={() => setRok(y)}
            style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${rok === y ? C.accent : C.border}`, background: rok === y ? C.accentBg : "transparent", color: rok === y ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
            {y}
          </button>
        ))}
        <Vysvetli chat={chat} titul="Čo to prinieslo" filter={`rok ${rok}`} vyrez={vyrez} />
      </div>
      </div>
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

// ── Web a kanály (GA4) ───────────────────────────────────────────────────────
// Instagram povie, koľko ľudí obsah videlo. GA4 povie, koľko ich prišlo na web
// a — čo je dôležitejšie — ČI prišli z platenej alebo organickej cesty. To je
// jediné miesto v celej appke, kde sa tieto dve veci dajú oddeliť ešte pred tým,
// než sa niekto ozve.
function WebKanaly({ rok, chat }: { rok: string; chat?: AssistantChat }) {
  const vsetky = GA4_MESACNE.filter((r) => r.m.startsWith(rok));
  // Mesiace bez merania sa NEPRIEMERUJÚ — nula by tvárila, že nikto neprišiel,
  // hoci sa len nemeralo.
  const data = vsetky.filter((r) => !r.chyba);
  const diery = vsetky.filter((r) => r.chyba).map((r) => label(r.m));
  const castocne = vsetky.filter((r) => r.castocne).map((r) => label(r.m));
  if (!data.length) {
    return (
      <Card>
        <H3><Info text="Zdroj: export „Prehľad stavu prehľadov“ z GA4." label="Web a kanály (GA4)" /></H3>
        <Empty>Za rok {rok} nemám GA4 export — v priečinku je zatiaľ len 2025. Stačí ho dotiahnuť rovnako ako ten minuloročný.</Empty>
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
      <H3><Info text="Noví používatelia webu podľa toho, odkiaľ prišli. „Hlavné udalosti“ sú konverzie nastavené v GA4 — odoslaný formulár a podobne. Zdroj: export „Prehľad stavu prehľadov“." label="Web a kanály (GA4)" /></H3>
      <Vysvetli chat={chat} titul="Web a kanály (GA4)" filter={`rok ${rok}`} vyrez={vyrez} />
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
      {(diery.length > 0 || castocne.length > 0) && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: mix(C.orange, 10), border: `1px solid ${mix(C.orange, 30)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          {diery.length > 0 && <><b>{diery.join(" a ")}</b> chýba — GA4 bolo odpojené, takže to nie je nula, ale diera. Do súčtov a priemerov sa nezapočítava. </>}
          {castocne.length > 0 && <><b>{castocne.join(", ")}</b> je len čiastočný, meranie sa rozbehlo v priebehu mesiaca.</>}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 14, lineHeight: 1.55 }}>
        Platená reklama bežala len <b>apríl – júl 2025</b> a je na nej vidieť: v máji priniesla 427 nových ľudí z 1 224.
        Odvtedy je na nule a web drží stabilných ~280 nových mesačne z vyhľadávania a priameho prístupu — to je
        <b> základ, ktorý nezmizne, keď prestaneš platiť</b>.
      </div>
    </Card>
  );
}

// ── Čo fungovalo na webe ─────────────────────────────────────────────────────
// Instagram má životnosť dva dni, článok pracuje roky. Preto patria vedľa seba:
// jedno ukazuje, čo zaujalo teraz, druhé to, čo ťa živí ticho na pozadí.
function CoFungovaloWeb({ rok, chat }: { rok: string; chat?: AssistantChat }) {
  const clanky = MKT_CLANKY.filter((c) => c.rok === rok);
  const vyrez = () => `Rok ${rok}\n` + tsv(["článok", "zobrazenia"], clanky.map((c) => [c.nazov, c.zobrazenia]));
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <H3><Info text="Najčítanejšie články na webe podľa GA4. Servisné stránky (Domov, Služby, Kontakt) sú vynechané — zaujíma nás obsah." label="Čo fungovalo na webe" /></H3>
      <Vysvetli chat={chat} titul="Čo fungovalo na webe" filter={`rok ${rok}`} vyrez={vyrez} />
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
        „Fascie – Voda v nás“ mal v 2025 sám <b>1 829 zobrazení</b> — viac než všetky ostatné články dokopy —
        a dodnes ťa drží vo vyhľadávaní.
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
          Kliky z vyhľadávania <b>rastú stabilne</b> — z ~110 mesačne v lete 2025 na ~240 dnes, bez jedinej koruny za reklamu.
          Je to najpomalší kanál, aký máš, a zároveň jediný, ktorý neprestane fungovať, keď prestaneš platiť.
        </div>
      </Card>

      {tabulka("Čo ťa nachádza", "Dopyty, ktoré reálne privádzajú ľudí. Značkové dopyty („prosapiens“) sú ľudia, čo ťa už poznajú — tie nerátaj medzi nových.", GSC_DOPYTY)}

      {tabulka(
        "Kde sa zobrazuješ, ale nikto neklikne",
        "Dopyty s veľa zobrazeniami a takmer nulovým preklikom. Znamená to, že Google web ukazuje, ale titulok alebo popis nezaujme — alebo je to dopyt, ktorý s tvojou službou nesúvisí a nemá zmysel oň bojovať. Toto je najlacnejšia práca v SEO: text už existuje, mení sa len nadpis.",
        GSC_PRILEZITOSTI,
      )}

      {tabulka(
        "Dopyty so zámerom kúpiť",
        "Presne tie dopyty, ktoré píše človek, čo hľadá tréning v Brne — nie encyklopédiu. Sem patria tvoji budúci klienti.",
        GSC_LOKALNE,
      )}

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
            { id: "url", label: "Stránka", farba: () => C.text },
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

export function Marketing({ data, clients, leads, chat, sub, onSub, onKlient, refresh }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[]; chat?: AssistantChat; sub: string; onSub: (s: string) => void; onKlient?: (m: string) => void; refresh: () => Promise<void> }) {
  const setSub = onSub;
  const [rok, setRok] = useState("2026");
  // Nahraté exporty vyhrávajú nad číslami v kóde. Načíta sa raz pri otvorení;
  // `tik` je len na to, aby sa obrazovka po výmene prekreslila — samotné dáta
  // žijú v module, lebo ich číta desať miest naprieč touto obrazovkou.
  const [, tik] = useState(0);
  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { mesacne?: MktMesiac[]; top?: MktKus[]; ga4?: Ga4Mesiac[]; gscMesacne?: GscMesiac[]; gscDopyty?: GscDopyt[]; gscStrany?: GscStrana[] }) => {
        const a = nastavMarketingZImportu(j.mesacne || [], j.top || []);
        const b = nastavWebZImportu(j.ga4 || [], j.gscMesacne || [], j.gscDopyty || [], j.gscStrany || []);
        if (a || b) tik((x) => x + 1);
      })
      .catch(() => {});
  }, []);
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
        // Poradie je poradie otázok, ktoré rozhodujú o peniazoch — nie zoznam
        // kanálov. Predtým bol prvý „Prehľad" s počtom postov a reels, čo je
        // výkaz práce, nie odpoveď. Instagram priviedol za 18 mesiacov 5
        // klientov, referencie 26; karty majú zodpovedať tomuto pomeru, nie
        // tomu, kde je najviac dát.
        tabs={[
          // Dopyty prvé: sú vstupom lievika a jediná záložka, kde sa niečo
          // zapisuje. Ostatné tri sú čítanie nad tým, čo tu vznikne.
          { id: "dopyty", label: "Dopyty" },
          { id: "lievik", label: "Odkiaľ prišli klienti" },
          { id: "naklady", label: "Čo to stálo" },
          { id: "dosah", label: "Dosah a obsah" },
          { id: "algoritmus", label: "Algoritmus" },
        ]}
        value={sub}
        onChange={setSub}
      />

      {/* Živé z Graph API hore, ručná tabuľka s view rate pod tým — kým sa
          obe nezhodnú na tom istom poradí kategórií, platia obe. */}
      {sub === "dosah" && <ObsahZive />}
      {sub === "dosah" && (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div>
            <H3><Info text="Instagramové čísla sa berú z nahratých Metricool exportov (Údaje → Upload CSV: posty, reels aj stories). Kým sa nič nenahrá, ukazuje sa jednorazový prepis z Metricoolu za jan 2025 – jún 2026. GA4 a Search Console sú zatiaľ stále ten jednorazový export. Prepínač rokov riadi ročné karty (web, články, návratnosť); karty o obsahu a vyhľadávaní majú vlastné okno, lebo sa hýbu inou rýchlosťou." label="Marketing" /></H3>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              {vRoku.length} mesiacov {rok} · {suma("posty")} postov · {suma("reels")} reels · {num(suma("stories"))} stories · reklama {fmtCZK(suma("spend"))}
              <span style={{ color: C.textDim }}> · spolu za 18 mes. {fmtCZK(mktSum("spend"))}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.textDim, marginRight: 2 }}>Rok</span>
            {["2025", "2026"].map((y) => (
              <button key={y} onClick={() => setRok(y)}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${rok === y ? C.accent : C.border}`, background: rok === y ? C.accentBg : "transparent", color: rok === y ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
                {y}
              </button>
            ))}
          </div>
        </div>
      </Card>
      )}

      {sub === "dopyty" && <Dopyty leads={leads} clients={clients} refresh={refresh} />}

      {sub === "lievik" && (
        <>
          <Lievik data={data} clients={clients} />
          <Kohorta data={data} clients={clients} />
          <CoToPrinieslo data={data} clients={clients} leads={leads} chat={chat} />
        </>
      )}
      {/* Kampane pred zmiešanou cenou: sú to skutočné čísla z Mety, kým
          „Čo to stálo" je odhad z Metricoolu a z nových klientov v mesiaci. */}
      {sub === "naklady" && (<><Kampane /><Naklady data={data} clients={clients} /><AkoMeratReklamu /></>)}
      {sub === "dosah" && (
        <>
          <Kanaly />
          <CoSomRobil chat={chat} />
          <CoFungovalo chat={chat} />
          <Vyhladavanie chat={chat} />
          <WebKanaly rok={rok} chat={chat} />
          <CoFungovaloWeb rok={rok} chat={chat} />
        </>
      )}
      {sub === "algoritmus" && <Algoritmus />}
    </>
  );
}
