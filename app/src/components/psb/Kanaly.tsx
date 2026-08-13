import { useEffect, useMemo, useState } from "react";

import { monthLabel } from "../../lib/psb/format";
import { statistiky, type Druh } from "../../lib/psb/mesiac";
import { MesiacProfil } from "./MesiacProfil";
import type { ClientAgg } from "../../lib/psb/compute";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { C, mix, S } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, RolovaciaTabulka, Select, TableWrap, ValueBars } from "./ui";

// Všetky kanály, nie len Instagram.
//
// Appka poznala Instagram (CSV z Metricoolu), web (GA4) a vyhľadávanie (Search
// Console). Facebook, TikTok, Threads, LinkedIn, YouTube, Meta Ads a Google
// Business v nej neboli vôbec — pritom Facebook má viac impresií než Instagram
// a Meta Ads míňajú reálne peniaze.
//
// Dáta sem chodia z mesačnej zostavy Metricoolu, ktorú appka sama prečítať
// nevie (PDF s vykreslenými grafmi). Preto sa nekreslí graf, ale tabuľka: číslo
// a zmena oproti minulému mesiacu, presne ako v zostave. Kým sa nič nenahrá,
// obrazovka povie, čo treba spraviť — nepredstiera, že dáta má.

export type KanalRiadok = { mesiac: string; kanal: string; metrika: string; hodnota: number; zmena: number | null; poznamka: string };

const cislo = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("cs-CZ") : n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

// Poradie kanálov podľa toho, koľko z nich reálne ide — nie abecedne.
const PORADIE = ["Instagram", "Facebook", "TikTok", "Threads", "YouTube", "LinkedIn", "Google Business", "Web", "Meta Ads", "Google Ads", "Konkurencia"];
const poradieKanala = (k: string) => {
  const i = PORADIE.indexOf(k);
  return i < 0 ? PORADIE.length : i;
};

const sipka = (z: number | null) => (z == null ? "" : z > 1 ? "▲" : z < -1 ? "▼" : "►");
const farbaZmeny = (z: number | null) => (z == null ? C.textDim : z > 1 ? C.green : z < -1 ? C.red : C.textMuted);

// `druh` rozhoduje, nad čím sa počítajú štatistiky. Sledovatelia sú STAV —
// kumulujú sa, takže „priemerný počet sledovateľov" nehovorí nič a najlepší
// mesiac by vyšiel vždy ten posledný. Čo o nich niečo hovorí, je prírastok.
// Ostatné sú toky: každý mesiac začínajú od nuly.
const TREND_METRIKY: { id: string; label: string; kanal: string; metrika: string; druh: Druh; jednotka?: string; popis: string }[] = [
  { id: "sled", label: "Sledovatelia IG", kanal: "Instagram", metrika: "Followers", druh: "stav",
    popis: "Štatistiky sú z mesačných PRÍRASTKOV, nie z úrovne — počet sledovateľov len rastie a jeho priemer by hovoril len o tom, kedy sa meralo." },
  { id: "views", label: "Videnia IG", kanal: "Instagram", metrika: "Views", druh: "tok",
    popis: "Koľkokrát niekto videl obsah za mesiac. Skáče podľa toho, či nejaký reel chytil algoritmus — a podľa toho, koľko sa doplatilo za dosah." },
  { id: "reel", label: "Ø dosah reelu", kanal: "Instagram", metrika: "Avg reach per reel", druh: "tok",
    popis: "Výrobná kvalita: nezávisí od počtu publikovaní, len od toho, či obsah funguje." },
  { id: "ads", label: "Reklama Kč", kanal: "Meta Ads", metrika: "Spent", druh: "tok", jednotka: " Kč",
    popis: "Minuté na Meta Ads. Súčet za celé obdobie je to jediné číslo, ktoré tu má zmysel sčítať." },
  { id: "web", label: "Návštevníci webu", kanal: "Web", metrika: "Visitors", druh: "tok",
    popis: "Ľudia na webe za mesiac. Web je miesto, kam reklama aj Instagram posielajú." },
];

export function Kanaly({ data, clients, chat }: { data: PSBData; clients: Record<string, ClientAgg>; chat?: AssistantChat }) {
  const [rozobrat, setRozobrat] = useState<string | null>(null);
  const [riadky, setRiadky] = useState<KanalRiadok[]>([]);
  const [mesiac, setMesiac] = useState("");
  const [nacitava, setNacitava] = useState(true);

  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kanaly?: KanalRiadok[] }) => {
        const k = j.kanaly || [];
        setRiadky(k);
        if (k.length) setMesiac(k[0].mesiac);
        setNacitava(false);
      })
      .catch(() => setNacitava(false));
  }, []);

  const mesiace = useMemo(() => [...new Set(riadky.map((r) => r.mesiac))].sort().reverse(), [riadky]);
  const vMesiaci = useMemo(() => riadky.filter((r) => r.mesiac === mesiac), [riadky, mesiac]);
  const skupiny = useMemo(() => {
    const m = new Map<string, KanalRiadok[]>();
    for (const r of vMesiaci) m.set(r.kanal, [...(m.get(r.kanal) || []), r]);
    return [...m.entries()].sort((a, b) => poradieKanala(a[0]) - poradieKanala(b[0]) || a[0].localeCompare(b[0]));
  }, [vMesiaci]);

  // HOOKY PRED PODMIENENÝMI RETURNMI. Prvá verzia ich mala až za nimi a
  // appka sa zložila celá: pri načítavaní sa hooky nevolali, po načítaní
  // pribudli — React na zmenu počtu hookov odpovedá pádom, nie varovaním.
  const [trendId, setTrendId] = useState("sled");
  const trendCfg = TREND_METRIKY.find((t) => t.id === trendId)!;
  const trendData = useMemo(() => {
    const podla = new Map<string, number>();
    for (const r of riadky) {
      if (r.kanal === trendCfg.kanal && r.metrika.toLowerCase() === trendCfg.metrika.toLowerCase()) {
        podla.set(r.mesiac, r.hodnota);
      }
    }
    return [...podla.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({ label: m, value: v }));
  }, [riadky, trendCfg]);

  /**
   * Všetky kanály vedľa seba — nie len Instagram.
   *
   * Karta sa volá „Kanály", ale osem čísel hore aj prepínač trendu mieria
   * takmer výhradne na Instagram. Pritom v zostave je aj Facebook, TikTok,
   * Threads, YouTube, LinkedIn a Google Business — a Facebook má v niektorých
   * mesiacoch VIAC impresií než Instagram. Bez tohto porovnania to nebolo
   * vidieť nikde a celá karta tvrdila, že Instagram je jediný kanál, čo ide.
   *
   * Berú sa štyri metriky, ktoré má každý kanál: sledovatelia, videnia,
   * interakcie a počet príspevkov. Zvyšok (~160 metrík) je v rozbaľovači dole.
   */
  const porovnanie = useMemo(() => {
    const predosly = [...new Set(riadky.map((r) => r.mesiac))].sort().filter((m) => m < mesiac).pop() || "";
    const hod = (kanal: string, metrika: string, mes: string) =>
      riadky.find((r) => r.mesiac === mes && r.kanal === kanal && r.metrika.toLowerCase() === metrika.toLowerCase())?.hodnota ?? null;
    const kanaly = [...new Set(vMesiaci.map((r) => r.kanal))]
      // Reklama a konkurencia nie sú kanály, kde sa publikuje — porovnávať
      // ich s Instagramom počtom príspevkov nedáva zmysel.
      .filter((k) => !["Meta Ads", "Google Ads", "Konkurencia"].includes(k));
    const von = kanaly.map((k) => {
      const imp = hod(k, "Impressions", mesiac);
      const impPred = predosly ? hod(k, "Impressions", predosly) : null;
      const sled = hod(k, "Followers", mesiac);
      const sledPred = predosly ? hod(k, "Followers", predosly) : null;
      return {
        kanal: k,
        sledovatelia: sled,
        prirastok: sled != null && sledPred != null ? sled - sledPred : null,
        videnia: imp,
        zmena: imp != null && impPred != null && impPred > 0 ? ((imp - impPred) / impPred) * 100 : null,
        interakcie: hod(k, "Interactions", mesiac),
        prispevkov: hod(k, "Posts", mesiac),
      };
    }).filter((r) => r.videnia != null || r.sledovatelia != null);
    const spolu = von.reduce((a, r) => a + (r.videnia || 0), 0);
    return {
      riadky: von.sort((a, b) => (b.videnia ?? -1) - (a.videnia ?? -1)),
      spolu,
      predosly,
    };
  }, [riadky, vMesiaci, mesiac]);

  // Štatistiky vybranej metriky. Bez nich je graf pekný, ale nepovie, či je
  // posledný stĺpec dobrý — a to je jediná otázka, ktorú pri ňom človek má.
  const trendStat = useMemo(
    () => statistiky(trendData.map((d) => ({ m: d.label, v: d.value })), trendCfg.druh),
    [trendData, trendCfg.druh],
  );

  const [celyZoznam, setCelyZoznam] = useState(false);
  // Duplicitné varianty tej istej metriky (dve čítania PDF) — v plnom zozname
  // sa nechá tá s vyššou hodnotou, druhá je podmnožina.
  const skupinyBezDup = useMemo(() => skupiny.map(([kanal, rs]) => {
    const podla = new Map<string, KanalRiadok>();
    for (const r of rs) {
      const k = r.metrika.toLowerCase();
      const uz = podla.get(k);
      if (!uz || Math.abs(r.hodnota) > Math.abs(uz.hodnota)) podla.set(k, r);
    }
    return [kanal, [...podla.values()]] as [string, KanalRiadok[]];
  }), [skupiny]);

  if (nacitava) return <Card><div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div></Card>;

  if (!riadky.length) {
    return (
      <Card>
        <H3><Info text="Mesačná zostava z Metricoolu pokrýva všetky kanály naraz — Facebook, TikTok, Threads, LinkedIn, YouTube, Meta Ads aj Google Business. Appka ju vie prečítať, keď má tvar tabuľky." label="Kanály" /></H3>
        <Empty>Zatiaľ nič nahraté.</Empty>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 10, lineHeight: 1.6 }}>
          Metricool posiela mesačnú zostavu ako PDF a to appka prečítať nevie — text je v podmnožinách fontov a
          čísla sú vykreslené do grafov. Daj to PDF Claudovi (ten sa na strany pozerá ako na obrázky) a vypýtaj si
          CSV s piatimi stĺpcami:
          <pre style={{ margin: "8px 0", padding: "9px 11px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 11.5, color: C.textDim, overflowX: "auto" }}>
{`mesiac,kanal,metrika,hodnota,zmena
2026-07,Instagram,Followers,1518,2.02
2026-07,Facebook,Impressions,82810,120.91
2026-07,Meta Ads,Spent,4795.91,154.96`}
          </pre>
          Ten súbor sa nahráva rovnako ako ostatné, v <b style={{ color: C.text }}>Údaje → Upload CSV</b>.
        </div>
      </Card>
    );
  }

  // ── výber toho, na čom záleží ──────────────────────────────────────────────
  //
  // Zostava má ~160 metrík a väčšina z nich je šum (Followers by city, Post
  // reactions…). Človek, ktorý im nerozumie, v tom zozname nenájde nič — a
  // človek, ktorý im rozumie, tam nepotrebuje chodiť. Preto hore stojí osem
  // čísel, ktoré pre PSB naozaj niečo znamenajú, každé s vysvetlením po
  // ľudsky, a celý zoznam je zbalený dole pre kontrolu.
  //
  // Hľadá sa bez ohľadu na veľkosť písmen — zostava má duplicitné varianty
  // („Story exits" aj „Story Exits") z dvoch čítaní PDF.
  const hodnotaM = (kanal: string, metrika: string): number | null => {
    const r = vMesiaci.find((x) => x.kanal === kanal && x.metrika.toLowerCase() === metrika.toLowerCase());
    return r ? r.hodnota : null;
  };
  const igSled = hodnotaM("Instagram", "Followers");
  const igPrir = hodnotaM("Instagram", "Followers balance");
  const igViews = hodnotaM("Instagram", "Views");
  const igReel = hodnotaM("Instagram", "Avg reach per reel");
  const igSaved = hodnotaM("Instagram", "Saved");
  const igShares = hodnotaM("Instagram", "Shares");
  const adsSpent = hodnotaM("Meta Ads", "Spent");
  const adsClicks = hodnotaM("Meta Ads", "Clicks");
  const webVisitors = hodnotaM("Web", "Visitors");
  const konkSled = hodnotaM("Konkurencia", "Followers");

  // Trend vybranej metriky po mesiacoch. Dnes je nahratý jeden mesiac, takže
  // graf ukáže jeden stĺpec — ale s každou ďalšou zostavou rastie sám a práve
  // na to tu je: o pol roka toto bude hlavný pohľad a tabuľka len poznámka.
  const pocetVsetkych = skupinyBezDup.reduce((a, [, rs]) => a + rs.length, 0);

  const stat = (label: string, hodnota: string, vysvetlenie: string, farba?: string) => (
    <div className="psb-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
        <Info text={vysvetlenie} label={label} />
      </div>
    </div>
  );

  return (
    <Card>
      {rozobrat && (
        <MesiacProfil mesiac={rozobrat} kanaly={riadky} data={data} clients={clients} chat={chat}
          onClose={() => setRozobrat(null)} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3><Info text="Osem čísel, na ktorých pre PSB záleží — vybrané zo ~160 metrík mesačnej zostavy Metricoolu. Celý zoznam je dole v rozbaľovači, keby bolo treba niečo dohľadať. Zmena je oproti predošlému mesiacu tak, ako ju uvádza zostava." label="Kanály — mesačný súhrn" /></H3>
        {/* „2026-07" je strojový zápis. V zozname sedemnástich mesiacov sa
            v ňom nedá orientovať pohľadom — mesiac má byť čitateľný. */}
        {mesiace.length > 1 && (
          <Select value={mesiac} onChange={setMesiac} options={mesiace.map((m) => ({ value: m, label: monthLabel(m) }))} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "12px 0" }}>
        {igSled != null && stat("Sledovatelia IG", `${cislo(igSled)}${igPrir != null ? ` (${igPrir >= 0 ? "+" : ""}${cislo(igPrir)})` : ""}`,
          "Koľko ľudí odoberá váš Instagram; v zátvorke prírastok za mesiac. Rastie pomaly a to je v poriadku — dôležitejšie je, KTO to je, než koľko ich je.", C.accentLight)}
        {igViews != null && stat("Videnia IG", cislo(igViews),
          "Koľkokrát niekto videl váš obsah za mesiac (všetky formáty spolu). Skáče podľa toho, či niektorý reel chytil algoritmus — jeden mesiac nič neznamená, trend áno.")}
        {igReel != null && stat("Ø dosah reelu", cislo(igReel),
          "Koľko ľudí v priemere zasiahne jeden reel. Toto je vaša „výrobná kvalita\u201d — nezávisí od počtu publikovaní, len od toho, či obsah funguje.")}
        {(igSaved != null || igShares != null) && stat("Uloženia + zdieľania", cislo((igSaved || 0) + (igShares || 0)),
          "Najsilnejší signál zo všetkých: obsah, ktorý si ľudia ODKLADAJÚ a POSIELAJÚ známym. Desať uložení znamená viac než sto lajkov — lajk je zdvorilosť, uloženie je úmysel.", C.green)}
        {adsSpent != null && stat("Reklama", `${cislo(Math.round(adsSpent))} Kč`,
          adsClicks ? `Minuté na Meta Ads za mesiac. Priniesla ${cislo(adsClicks)} klikov, teda ~${(adsSpent / adsClicks).toFixed(1)} Kč za klik. Klik ešte nie je klient — spojenie s klientmi ukazuje lievik dopytov.` : "Minuté na Meta Ads za mesiac.", C.orange)}
        {webVisitors != null && stat("Návštevníci webu", cislo(webVisitors),
          "Ľudí na webe za mesiac (z Metricoolu; presnejšie čísla má GA4 v karte Dosah). Web je miesto, kam reklama aj Instagram posielajú — keď rastie obsah a web nie, niekde po ceste sa strácajú.")}
        {konkSled != null && stat("Konkurencia — sledovatelia", cislo(konkSled),
          "Sledovatelia sledovanej konkurencie. Nie je to súper, je to mierka: keď rastú rovnako rýchlo ako vy, hýbe sa trh, nie vy.", C.textDim)}
      </div>

      {/* ── všetky kanály vedľa seba ──────────────────────────────────── */}
      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, margin: "16px 0 6px" }}>
        <Info
          label="Všetky kanály vedľa seba"
          text="Štyri metriky, ktoré má každý kanál, za vybraný mesiac. Zoradené podľa videní — a práve preto to tu je: Facebook máva viac impresií než Instagram a z ôsmich čísel hore sa to nedalo zistiť. „Podiel“ hovorí, koľko z celkového dosahu pripadá na ten kanál; „zmena“ je oproti predošlému nahratému mesiacu. Reklama a konkurencia sú vynechané — nie sú to kanály, kde sa publikuje."
        />
      </div>
      {porovnanie.riadky.length === 0 ? (
        <Empty>Za tento mesiac nemám porovnateľné čísla.</Empty>
      ) : (
        <RolovaciaTabulka pocet={4}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left" }}>Kanál</th>
              <th style={{ ...S.th, textAlign: "right" }}>Videnia</th>
              <th style={{ ...S.th, textAlign: "right" }}>Podiel</th>
              <th style={{ ...S.th, textAlign: "right" }}>Zmena</th>
              <th style={{ ...S.th, textAlign: "right" }}>Sledovatelia</th>
              <th style={{ ...S.th, textAlign: "right" }}>Interakcie</th>
              <th style={{ ...S.th, textAlign: "right" }}>Príspevkov</th>
            </tr>
          </thead>
          <tbody>
            {porovnanie.riadky.map((r) => (
              <tr key={r.kanal}>
                <td style={{ ...S.td, color: C.text }}>{r.kanal}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.accentLight, fontWeight: 600 }}>
                  {r.videnia == null ? "—" : cislo(r.videnia)}
                </td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>
                  {r.videnia == null || !porovnanie.spolu ? "—" : `${Math.round((r.videnia / porovnanie.spolu) * 100)} %`}
                </td>
                <td style={{ ...S.td, textAlign: "right", color: farbaZmeny(r.zmena) }}>
                  {r.zmena == null ? "—" : `${sipka(r.zmena)} ${Math.abs(Math.round(r.zmena))} %`}
                </td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>
                  {r.sledovatelia == null ? "—" : cislo(r.sledovatelia)}
                  {r.prirastok != null && r.prirastok !== 0 && (
                    <span style={{ color: r.prirastok > 0 ? C.green : C.red, fontSize: 11 }}>
                      {" "}({r.prirastok > 0 ? "+" : ""}{cislo(r.prirastok)})
                    </span>
                  )}
                </td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.interakcie == null ? "—" : cislo(r.interakcie)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{r.prispevkov == null ? "—" : cislo(r.prispevkov)}</td>
              </tr>
            ))}
          </tbody>
        </RolovaciaTabulka>
      )}

      {/* Trend po mesiacoch — s jednou zostavou jeden stĺpec, s každou ďalšou
          rastie sám. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.textDim }}>Trend:</span>
        {TREND_METRIKY.map((t) => (
          <button key={t.id} onClick={() => setTrendId(t.id)}
            style={{ padding: "4px 11px", borderRadius: 14, border: `1px solid ${trendId === t.id ? C.accent : C.border}`, background: trendId === t.id ? C.accentBg : "transparent", color: trendId === t.id ? C.accentLight : C.textMuted, fontSize: 11.5, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>
      {trendData.length ? (
        <>
          {/* Štatistiky nad grafom, nie pod ním: odpovedajú na otázku, ktorú
              má človek PRI pohľade na posledný stĺpec — je to veľa alebo málo? */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 8, fontSize: 11.5 }}>
            <Cifra label={trendCfg.druh === "stav" ? "Ø prírastok / mes." : "Priemer / mes."}
              hodnota={`${cislo(Math.round(trendStat.priemer))}${trendCfg.jednotka || ""}`} />
            {trendStat.najlepsi && (
              <Cifra label={`Najlepší (${monthLabel(trendStat.najlepsi.m)})`} farba={C.green}
                hodnota={`${cislo(Math.round(trendStat.najlepsi.v))}${trendCfg.jednotka || ""}`} />
            )}
            {trendStat.najhorsi && (
              <Cifra label={`Najhorší (${monthLabel(trendStat.najhorsi.m)})`} farba={C.orange}
                hodnota={`${cislo(Math.round(trendStat.najhorsi.v))}${trendCfg.jednotka || ""}`} />
            )}
            {trendStat.zmena != null && (
              <Cifra label="Posledný oproti predošlému" farba={trendStat.zmena >= 0 ? C.green : C.red}
                hodnota={`${trendStat.zmena >= 0 ? "+" : ""}${Math.round(trendStat.zmena)} %`} />
            )}
            {trendStat.odchylka != null && (
              <Cifra label="Posledný oproti bežnému" farba={trendStat.odchylka >= 0 ? C.green : C.red}
                hodnota={`${trendStat.odchylka >= 0 ? "+" : ""}${Math.round(trendStat.odchylka)} %`} />
            )}
            {trendCfg.druh === "tok" && trendId === "ads" && (
              <Cifra label={`Spolu za ${trendStat.mesiacov} mes.`} hodnota={`${cislo(Math.round(trendStat.sucet))} Kč`} farba={C.orange} />
            )}
          </div>

          <ValueBars data={trendData} color={trendId === "ads" ? C.orange : C.accent}
            fmt={(n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : cislo(Math.round(n)))} height={150} alignEnd
            onKlik={(m) => setRozobrat(m)} />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
            Klikni na stĺpec a rozoberie sa ti celý mesiac — príspevky, kampane, dopyty aj noví klienti.
            {" "}{trendCfg.popis}
          </div>
        </>
      ) : (
        <Empty>Táto metrika v nahratých zostavách nie je.</Empty>
      )}
      {trendData.length === 1 && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          Zatiaľ jedna zostava — graf porastie s každým ďalším mesiacom sám.
        </div>
      )}

      {/* Celý zoznam — zbalený. Kontrola, nie čítanie. */}
      <div onClick={() => setCelyZoznam((v) => !v)}
        style={{ marginTop: 14, fontSize: 12.5, color: C.textMuted, cursor: "pointer", userSelect: "none" }}>
        <span style={{ display: "inline-block", width: 14, color: C.textDim, fontSize: 9 }}>{celyZoznam ? "\u25bc" : "\u25b6"}</span>
        Všetky metriky zo zostavy ({pocetVsetkych})
      </div>
      {celyZoznam && (
      <div style={{ marginTop: 10 }}>
        {skupinyBezDup.map(([kanal, rs]) => (
          <div key={kanal} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.accentLight, padding: "4px 0 6px", borderBottom: `1px solid ${mix(C.accent, 30)}` }}>
              {kanal}
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: "left" }}>Metrika</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Hodnota</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Zmena</th>
                  <th style={{ ...S.th, textAlign: "left" }}>Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={`${r.kanal}|${r.metrika}`}>
                    <td style={S.td}>{r.metrika}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{cislo(r.hodnota)}</td>
                    <td style={{ ...S.td, textAlign: "right", color: farbaZmeny(r.zmena), fontVariantNumeric: "tabular-nums" }}>
                      {r.zmena == null ? "\u2014" : `${sipka(r.zmena)} ${r.zmena.toFixed(1)} %`}
                    </td>
                    <td style={{ ...S.td, color: C.textDim, fontSize: 11.5 }}>{r.poznamka}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ))}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.55 }}>
          Zdroj: mesačná zostava Metricoolu prečítaná Claudom. Duplicitné varianty metrík (dve čítania PDF) sú
          zlúčené — nechala sa vyššia hodnota.
        </div>
      </div>
      )}
    </Card>
  );
}

function Cifra({ label, hodnota, farba }: { label: string; hodnota: string; farba?: string }) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ color: C.textDim }}>{label}</div>
    </div>
  );
}
