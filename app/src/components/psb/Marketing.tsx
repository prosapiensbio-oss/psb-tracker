import { useMemo, useState, type ReactNode } from "react";

import { fmtCZK } from "../../lib/psb/format";
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
  type GscDopyt,
  type GscStrana,
} from "../../lib/psb/marketing";
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

// Sortovateľná tabuľka. Klik na hlavičku triedi; druhý klik otočí smer.
// Číselné stĺpce začínajú zostupne, lebo pri „koľko klikov" chce človek vidieť
// najprv to najväčšie, nie najmenšie.
type Stlpec<T> = { id: keyof T & string; label: string; num?: boolean; info?: string; fmt?: (v: T[keyof T], r: T) => ReactNode; farba?: (r: T) => string | undefined };

function SortTable<T extends Record<string, any>>({ riadky, stlpce, minWidth = 460, vychodzi }: {
  riadky: T[]; stlpce: Stlpec<T>[]; minWidth?: number; vychodzi?: keyof T & string;
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

  return (
    <div style={{ overflowX: "auto" }}>
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
      <div style={{ marginTop: 12 }}>
        <SortTable
          riadky={data}
          vychodzi="m"
          stlpce={[
            { id: "m", label: "Mesiac", fmt: (v) => label(String(v)) },
            { id: "reels", label: "Reels", num: true },
            { id: "posty", label: "Posty", num: true },
            { id: "stories", label: "Stories", num: true },
            { id: "views", label: "Videnia", num: true },
            { id: "ulozenia", label: "Uloženia", num: true, info: "Koľkokrát si niekto príspevok uložil. Zo všetkých metrík je najbližšie k zámeru — lajk nestojí nič, uloženie znamená „toto sa mi bude hodiť“." },
            { id: "zdielania", label: "Zdieľania", num: true },
            { id: "viewRate", label: "View rate", num: true, info: "Koľko % ľudí, ktorým sa reel začal prehrávať, ho pozeralo aspoň 3 sekundy. Meria silu hooku, teda prvej vety.", fmt: (v) => `${v} %` },
            { id: "spend", label: "Reklama", num: true, fmt: (v) => (Number(v) ? fmtCZK(Number(v)) : "—"), farba: (r) => (r.spend > 0 ? C.orange : C.textDim) },
          ]}
          minWidth={640}
        />
      </div>
    </Card>
  );
}

// ── Čo fungovalo ─────────────────────────────────────────────────────────────
function CoFungovalo({ rok }: { rok: string }) {
  return (
    <Card>
      <H3><Info text="Rebríček podľa ULOŽENÍ, nie lajkov. Uloženie znamená „toto si chcem nechať“ a je zo všetkých metrík najbližšie k zámeru; lajk nehovorí nič." label="Čo fungovalo" /></H3>
      <div style={{ marginTop: 4 }}>
        {MKT_TOP.filter((k) => k.m.startsWith(rok)).map((k, i) => (
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
function CoToPrinieslo({ data, clients, leads, rok }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[]; rok: string }) {
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

// ── Web a kanály (GA4) ───────────────────────────────────────────────────────
// Instagram povie, koľko ľudí obsah videlo. GA4 povie, koľko ich prišlo na web
// a — čo je dôležitejšie — ČI prišli z platenej alebo organickej cesty. To je
// jediné miesto v celej appke, kde sa tieto dve veci dajú oddeliť ešte pred tým,
// než sa niekto ozve.
function WebKanaly({ rok }: { rok: string }) {
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

  return (
    <Card>
      <H3><Info text="Noví používatelia webu podľa toho, odkiaľ prišli. „Hlavné udalosti“ sú konverzie nastavené v GA4 — odoslaný formulár a podobne. Zdroj: export „Prehľad stavu prehľadov“." label="Web a kanály (GA4)" /></H3>
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

// ── Čo fungovalo na webe ─────────────────────────────────────────────────────
// Instagram má životnosť dva dni, článok pracuje roky. Preto patria vedľa seba:
// jedno ukazuje, čo zaujalo teraz, druhé to, čo ťa živí ticho na pozadí.
function CoFungovaloWeb({ rok }: { rok: string }) {
  const clanky = MKT_CLANKY.filter((c) => c.rok === rok);
  return (
    <Card>
      <H3><Info text="Najčítanejšie články na webe podľa GA4. Servisné stránky (Domov, Služby, Kontakt) sú vynechané — zaujíma nás obsah." label="Čo fungovalo na webe" /></H3>
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
function Vyhladavanie({ rok }: { rok: string }) {
  const data = GSC_MESACNE.filter((r) => r.m.startsWith(rok));
  const kliky = data.reduce((a, r) => a + r.kliky, 0);
  const zobrazenia = data.reduce((a, r) => a + r.zobrazenia, 0);
  const ctr = zobrazenia > 0 ? (kliky / zobrazenia) * 100 : 0;
  const mobil = GSC_ZARIADENIA.find((z) => z.zariadenie === "Mobil");
  const mobilPct = mobil ? (mobil.kliky / GSC_ZARIADENIA.reduce((a, z) => a + z.kliky, 0)) * 100 : 0;

  const tabulka = (nadpis: string, info: string, riadky: GscDopyt[]) => (
    <Card>
      <H3><Info text={info} label={nadpis} /></H3>
      <SortTable
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
        <H3><Info text="Google Search Console za 31.3.2025 – 30.6.2026. Kliky = ľudia, ktorí prišli z vyhľadávania. Zobrazenia = koľkokrát sa web ukázal vo výsledkoch. MP = miera prekliku, teda koľko % zobrazení skončilo klikom." label="Vyhľadávanie (Search Console)" /></H3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 14px" }}>
          <StatCard value={num(kliky)} label={`Kliky z Googlu ${rok}`} color={C.green} />
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
        <H3><Info text="Ktoré stránky ťahajú návštevnosť z vyhľadávania. Klikni na hlavičku a zoradíš podľa čohokoľvek." label="Najsilnejšie stránky" /></H3>
        <SortTable
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

export function Marketing({ data, clients, leads }: { data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[] }) {
  const [sub, setSub] = useState("prehlad");
  const [rok, setRok] = useState("2026");
  // The header used to sum all 18 months no matter which year was selected —
  // the switch looked broken because the summary never moved.
  const vRoku = MKT_MESACNE.filter((r) => r.m.startsWith(rok));
  const suma = (k: "posty" | "reels" | "stories" | "spend") => vRoku.reduce((a, r) => a + r[k], 0);

  return (
    <>
      <SubTabs
        tabs={[
          { id: "prehlad", label: "Prehľad" },
          { id: "vykon", label: "Čo fungovalo" },
          { id: "vyhladavanie", label: "Vyhľadávanie" },
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
              {vRoku.length} mesiacov {rok} · {suma("posty")} postov · {suma("reels")} reels · {num(suma("stories"))} stories · reklama {fmtCZK(suma("spend"))}
              <span style={{ color: C.textDim }}> · spolu za 18 mes. {fmtCZK(mktSum("spend"))}</span>
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
          <WebKanaly rok={rok} />
          <CoSkusitDalej />
        </>
      )}
      {sub === "vykon" && (<><CoFungovalo rok={rok} /><CoFungovaloWeb rok={rok} /></>)}
      {sub === "vyhladavanie" && <Vyhladavanie rok={rok} />}
      {sub === "navratnost" && <CoToPrinieslo data={data} clients={clients} leads={leads} rok={rok} />}
    </>
  );
}
