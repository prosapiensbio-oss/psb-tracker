import { useEffect, useMemo, useState } from "react";

import { najdiKlienta, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel, normName } from "../../lib/psb/format";
import { ZDROJE } from "./Klienti";
import { OBDOBIA_MESACNE, mesiaceVOkne } from "../../lib/psb/obdobia";
import { GA4_MESACNE, GSC_DOPYTY, WEB_STRANKY, marketingVerzia } from "../../lib/psb/marketing";
import { C, mix, S } from "../../lib/psb/theme";
import { znackovanyOdkaz, type Platforma } from "../../lib/psb/utm";
import type { PSBData } from "../../lib/psb/types";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka, TableWrap, enterPosle } from "./ui";

// Marketing prestavaný podľa otázok, nie podľa kanálov.
//
// Doteraz bola prvá obrazovka „koľko sme toho vypustili" — počet postov, reels
// a stories. To je výkaz práce, nie odpoveď. Otázka, ktorá rozhoduje o
// peniazoch, znie „odkiaľ prišli klienti a koľko to stálo", a tá sa dá
// zodpovedať len lievikom.
//
// Instagram priviedol za 18 mesiacov 5 klientov, referencie 26. Poradie kariet
// má odteraz zodpovedať tomuto pomeru, nie tomu, kde je najviac dát.

// Konverzia nad 100 % je nemožná a znamená len to, že chýba čitateľ — typicky
// nezapísané dopyty. Vypísať „1200 %" by vyzeralo ako úspech; radšej pomlčka a
// vysvetlenie pod lievikom.
const pct = (a: number, b: number) => (b > 0 && a <= b ? Math.round((a / b) * 100) : null);

// Zoznam období je spoločný — viď lib/psb/obdobia.ts.

/**
 * „2026-08-11" → „11. 8." — v zozname mien je rok šum.
 *
 * Dátumy zo sedení chodia ako celé ISO („2026-08-06T00:00:00.000Z"), nie ako
 * holý deň. Prvá verzia to nečakala a vypísala celý reťazec aj s časom a Z.
 */
const fmtDen = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : d || "—";
};

const zdrojLabel = (z: string) => ZDROJE.find((x) => x.value === z)?.label || (z ? z : "nevyplnené");

/** Mesiace v okne, od najstaršieho. Kotva je posledný mesiac s dátami, nie dnešok. */
export function oknoMesiacov(data: PSBData, okno: string): string[] {
  return mesiaceVOkne(okno, data.sessions.map((s) => monthKey(s.date)));
}

export type Kroky = {
  dopyty: number; uvodne: number; klienti: number; trzba: number;
  /**
   * Dopyty, z ktorých sa STAL platiaci klient.
   *
   * PREČO NESTAČÍ `klienti / dopyty`
   *
   * 13. 8. ukazoval vrchný pásik „Z dopytu klient 124 %". Konverzia nad sto
   * percent nie je možná a nebola to chyba počítania — boli to dve rôzne
   * skupiny ľudí. `klienti` sú VŠETCI noví platiaci, aj tí, čo prišli
   * z odporúčania a dopyt sa im nikdy nezapísal; `dopyty` sú len zapísané
   * dopyty. Podiel dvoch nesúvisiacich množín nemeria nič.
   *
   * Tu sa konvertujú DOPYTY, nie klienti: pre každý dopyt v okne sa pozrie, či
   * z toho človeka klient napokon bol. Také číslo je zhora ohraničené stovkou
   * a znamená presne to, čo je nad ním napísané.
   *
   * Čerstvé dopyty ho ťahajú dole — kto sa ozval minulý mesiac, ešte nemusel
   * stihnúť zaplatiť. Okno preto končí posledným plným mesiacom (kotva dát).
   */
  zDopytu: number;
  /**
   * Dopyty, ktoré došli na úvodný tréning. Tá istá zásada ako `zDopytu`:
   * konvertujú sa DOPYTY, nie úvodné. `uvodne / dopyty` vyšlo 20. 8. 2026
   * „121 %" — úvodné z odporúčaní nemajú zapísaný dopyt, takže podiel dvoch
   * rôznych množín zase nemeral nič. Úvodný sa hľadá v celej histórii (aj po
   * konci okna) a musí byť najskôr v deň dopytu.
   */
  zDopytuUvodny: number;
  /**
   * Úvodné, z ktorých sa stal klient — čitateľ druhej šípky.
   *
   * Tá istá zásada ako pri prvej: konvertuje sa KROK, nie dve nesúvisiace
   * množiny. `klienti/uvodne` by prestrelilo, keby mal nový klient prvé
   * sedenie iného typu než UVODNE (chyba typu v PTminderi) — čitateľ by
   * nebol podmnožinou menovateľa.
   */
  zUvodnehoKlient: number;
  /**
   * Kto presne za tými číslami je.
   *
   * Jerry, 13. 8.: „keď kliknem na úvodný tréning 3, napíše mi, kto presne to
   * je." Číslo bez mien sa nedá overiť ani použiť — pri troch ľuďoch je otázka
   * „ktorí?" prvá, ktorá napadne, a doteraz sa na ňu dalo odpovedať len
   * preklikaním Klientov.
   */
  kto: {
    dopyty: { meno: string; datum: string; zdroj: string }[];
    /** Dopyty, ktoré došli na úvodný — čitateľ „Dopyt → úvodný". */
    naUvodny: { meno: string; dopyt: string; uvodny: string }[];
    uvodne: { meno: string; datum: string }[];
    /** `trzbaVOkne` je ten istý súčet, z ktorého je „Tržba od nových" — jeden zdroj pre číslo aj pre zoznam. */
    klienti: { meno: string; prvy: string; zaplatil: string; trzbaVOkne: number }[];
    /**
     * Kto prišiel na úvodný a už nikdy — najcennejší zoznam v lieviku.
     *
     * Ostatné tri hovoria, čo vyšlo. Tento hovorí, čo sa stratilo, a je to
     * jediné miesto, kde sa dá niečo zmeniť: osem ľudí ročne zaplatilo za
     * úvodný tréning a nevrátilo sa. Kým neboli menovite vidieť, nedala sa
     * položiť ani otázka prečo.
     */
    nepokracovali: { meno: string; datum: string; dni: number; trener: string; preco: string }[];
  };
};

/**
 * Nový klient = ten, kto po úvodnom tréningu prišiel ZNOVA.
 *
 * PREČO NIE „ZAPLATIL"
 *
 * Do 13. 8. tu stálo „má aspoň jednu platbu". Konverzia úvodný → klient vyšla
 * z toho 100 % a Jerry sa spýtal, či to môže byť pravda. Nemohlo: úvodný
 * tréning je PLATENÝ (1 100 Kč), takže platbu má každý, kto naň prišiel.
 * Podmienka bola splnená okamihom, keď človek zaplatil za to, čo práve
 * absolvoval — merala dochádzku, nie rozhodnutie pokračovať.
 *
 * V roku 2026 to znamenalo rozdiel medzi 35 z 35 a 27 z 35. Ôsmi ľudia majú
 * presne jedno sedenie, jednu platbu 1 100 Kč v deň úvodného a odvtedy nič.
 *
 * Druhý tréning je prvý moment, kedy sa človek rozhodol na základe toho, čo
 * zažil — a to je konverzia. Kto si kúpil balíček a ešte netrénoval, sa
 * započíta až keď príde; radšej neskoro než nepravdivo.
 */
/**
 * Koľko musí človek zaplatiť NAD cenu úvodného, aby to bol nákup, nie
 * zaokrúhlenie. Pod touto hranicou nie je žiadny balíček ani členstvo.
 */
const NAD_UVODNY = 500;

// Definícia žije v lib/psb/compute.ts (jedna pre obrazovku aj Jarvisov
// kontext) — tu sa importuje a re-exportuje, nech existujúce importy fungujú.
import { jeKlient } from "../../lib/psb/compute";
export { jeKlient };

export function krokyZa(data: PSBData, clients: Record<string, ClientAgg>, mesiace: string[]): Kroky {
  const v = (d: string) => mesiace.includes(monthKey(d));
  const dopytyRiadky = data.leads.filter((l) => v(l.date));
  const dopyty = dopytyRiadky.length;
  // Úvodný tréning ako UDALOSŤ, nie ako sedenie: keď niekto príde dvakrát,
  // stále je to jeden človek na začiatku cesty.
  const uvodneSedenia = data.sessions.filter((s) => s.sessionType === "UVODNE" && v(s.date));
  // Jeden človek = jeden riadok, aj keď prišiel dvakrát. Berie sa prvý dátum.
  const uvodneMapa = new Map<string, string>();
  const trenerUvodneho = new Map<string, string>();
  for (const s of [...uvodneSedenia].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!uvodneMapa.has(s.client)) {
      uvodneMapa.set(s.client, s.date);
      trenerUvodneho.set(s.client, s.sessionTrainer || "");
    }
  }
  const uvodne = uvodneMapa.size;
  const novi = Object.values(clients).filter((c) => {
    // Kto sa vrátil po pauze, nie je nový klient. Bez toho vyšlo v roku 2026
    // o jedného nového viac než úvodných tréningov — Kateřina Stoklásková mala
    // úvodný v novembri 2022, ale dáta z PTmindera siahajú do januára 2025.
    if (c.vratenie) return false;
    if (!c.firstSession || !v(c.firstSession)) return false;
    return jeKlient(c, data.payments);
  });
  // Tržba z NOVÝCH klientov — nie celková. Celková tržba obsahuje aj obnovy
  // starých klientov a tie marketing nepriviedol.
  const menaNovych = new Set(novi.map((c) => c.name));
  const trzba = data.payments
    .filter((p) => p.client && menaNovych.has(p.client) && v(p.date))
    .reduce((a, p) => a + p.amount, 0);
  // Dopyt → klient. Páruje sa podľa mena; e-mail v dopyte často chýba a
  // v klientoch nie je vôbec.
  // Párovanie cez `najdiKlienta` (presne + fuzzy), nie cez holé `normName`.
  // „Lukáš Hanus" z dopytu a „Lukas Hanus" z PTmindera sú jeden človek; presná
  // zhoda z nich robila dvoch a konverzia na obrazovke vychádzala nižšia než
  // tá, ktorú počíta Jarvis. Rovnaké párovanie ako v aiContext (18. 8. 2026).
  const menaPlatiacich = Object.values(clients).filter((c) => jeKlient(c, data.payments)).map((c) => c.name);
  // …a klientom sa musel stať PO dopyte. Bez tejto podmienky sa ako
  // „konverzia dopytu" počítal aj existujúci klient, ktorý vyplnil formulár
  // znova — jeho firstSession je roky pred dopytom (revízia 19. 8. 2026).
  const prvePodlaMena = new Map(Object.values(clients).map((c) => [normName(c.name), c.firstSession || ""]));
  const zDopytu = data.leads.filter((l) => {
    if (!v(l.date) || !l.name) return false;
    const kanonicke = najdiKlienta(menaPlatiacich, l.name);
    if (!kanonicke) return false;
    const prve = prvePodlaMena.get(normName(kanonicke)) || "";
    return !prve || prve >= l.date;
  }).length;

  const prvaPlatba = (meno: string) =>
    data.payments.filter((p) => p.client === meno).map((p) => p.date).sort()[0] || "";

  // Dopyt → úvodný. Úvodné z CELEJ histórie (dopyt z konca okna má úvodný
  // pokojne o dva týždne neskôr — mimo okna) a úvodný musí byť najskôr v deň
  // dopytu, inak by sa počítal existujúci klient, ktorý vyplnil formulár znova.
  const uvodneVsetky = new Map<string, string>();
  for (const sx of [...data.sessions].filter((x) => x.sessionType === "UVODNE").sort((a, b) => a.date.localeCompare(b.date)))
    if (!uvodneVsetky.has(sx.client)) uvodneVsetky.set(sx.client, sx.date);
  const menaUvodnychVsetky = [...uvodneVsetky.keys()];
  const naUvodnyRiadky = data.leads.flatMap((l) => {
    if (!v(l.date) || !l.name) return [];
    const kan = najdiKlienta(menaUvodnychVsetky, l.name);
    if (!kan) return [];
    const datumUvodneho = (uvodneVsetky.get(kan) || "").slice(0, 10);
    if (datumUvodneho && datumUvodneho < l.date.slice(0, 10)) return [];
    return [{ meno: l.name, dopyt: l.date, uvodny: datumUvodneho }];
  });

  const zUvodnehoKlient = novi.filter((c) => uvodneMapa.has(c.name)).length;

  return {
    dopyty, uvodne, klienti: novi.length, trzba, zDopytu, zDopytuUvodny: naUvodnyRiadky.length, zUvodnehoKlient,
    kto: {
      dopyty: dopytyRiadky
        .map((l) => ({ meno: l.name || "(bez mena)", datum: l.date, zdroj: l.source || "" }))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
      naUvodny: naUvodnyRiadky.sort((a, b) => b.dopyt.localeCompare(a.dopyt)),
      uvodne: [...uvodneMapa.entries()]
        .map(([meno, datum]) => ({ meno, datum }))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
      klienti: novi
        .map((c) => ({
          meno: c.name, prvy: c.firstSession || "", zaplatil: prvaPlatba(c.name),
          trzbaVOkne: data.payments.filter((p) => p.client === c.name && v(p.date)).reduce((a, p) => a + p.amount, 0),
        }))
        .sort((a, b) => b.prvy.localeCompare(a.prvy)),
      // Mal úvodný v okne a v CELEJ histórii žiadne ďalšie sedenie. Pozerá sa
      // mimo okna zámerne: kto prišiel v januári a vrátil sa v júni, sa
      // nestratil — len to trvalo.
      nepokracovali: [...uvodneMapa.entries()]
        // Tá istá definícia ako pri klientoch — kto si kúpil balíček, sa
        // nestratil, len ešte nestihol prísť.
        .filter(([meno]) => clients[meno] && !jeKlient(clients[meno], data.payments))
        .map(([meno, datum]) => ({
          meno, datum,
          // Dátum môže prísť ako celé ISO — pripojiť k nemu ďalší čas vyrobí
          // neplatný dátum a z neho „pred NaN dňami".
          dni: Math.max(0, Math.round((Date.now() - Date.parse(`${datum.slice(0, 10)}T12:00:00Z`)) / 86400000)),
          trener: trenerUvodneho.get(meno) || "",
          preco: (clients[meno]?.precoNeprisiel || "").trim(),
        }))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
    },
  };
}

/**
 * Jeden stratený človek — a miesto, kam sa napíše prečo.
 *
 * Dôvod sa zapisuje v deň, keď je ešte v hlave. O mesiac ho nikto nezopakuje
 * a osem jednotlivých príbehov sa nikdy nespojí do vzorca.
 */
/**
 * Dokedy sa návrat po úvodnom ešte dá čakať.
 *
 * Tá istá hranica, akú používa register (compute.ts). Dve rôzne čísla by
 * znamenali, že appka sa na jednej obrazovke pýta a na druhej mlčí.
 */
const DNI_NA_NAVRAT = 21;

function StrataRiadok({ x, onPoznamka }: {
  x: { meno: string; datum: string; dni: number; trener: string; preco: string };
  onPoznamka?: (meno: string, text: string) => Promise<boolean | void> | boolean | void;
}) {
  const [text, setText] = useState(x.preco);
  const [ulozene, setUlozene] = useState(false);
  // Kto bol na úvodnom pred pár dňami, ešte len hľadá termín. Pýtať sa naňho
  // „prečo neprišiel" je predčasné — a zapísaný dôvod by ho navyše umlčal
  // v registri skôr, než sa vôbec stihol vrátiť.
  const cerstvy = x.dni < DNI_NA_NAVRAT && !x.preco;
  const uloz = () => {
    const t = text.trim();
    if (!onPoznamka || t === x.preco.trim()) return;
    // „Uložené" sa smie ukázať až vtedy, keď zápis naozaj prešiel. Prvá verzia
    // to hlásila hneď po kliknutí a 13. 8. klamala celý večer: stĺpec v
    // databáze neexistoval, API vracalo `bad_field` a dôvody sa strácali.
    void Promise.resolve(onPoznamka(x.meno, t)).then((ok) => {
      if (ok === false) return;
      setUlozene(true);
      setTimeout(() => setUlozene(false), 2500);
    });
  };
  return (
    <div style={{ borderLeft: `2px solid ${x.preco ? C.green : x.dni < DNI_NA_NAVRAT ? mix(C.text, 25) : mix(C.orange, 55)}`, paddingLeft: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
        <span style={{ color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {x.meno}
          {x.trener && <span style={{ color: C.textDim, fontSize: 11.5 }}> · {x.trener}</span>}
        </span>
        <span style={{ color: C.textDim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          úvodný {fmtDen(x.datum)} · pred {x.dni} dňami
        </span>
      </div>
      {cerstvy ? (
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>
          Ešte môže prísť — na termín býva pár týždňov. Dôvod sa pýta až po {DNI_NA_NAVRAT} dňoch.
        </div>
      ) : onPoznamka && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={enterPosle(uloz)}
            onBlur={uloz}
            placeholder="prečo neprišiel? (cena, vzdialenosť, termíny, nebolo to preňho…)"
            style={{
              flex: 1, minWidth: 0, padding: "5px 9px", borderRadius: 7,
              border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12,
            }}
          />
          {ulozene && <span style={{ fontSize: 11, color: C.green, flexShrink: 0 }}>uložené</span>}
        </div>
      )}
    </div>
  );
}

function Krok({ cislo, popis, farba, konverzia, onClick, aktivny, onStrata, strataAktivna }: {
  cislo: string; popis: string; farba?: string; konverzia?: number | null;
  /** Bez toho je krok len číslo — s tým sa dá spýtať „ktorí?". */
  onClick?: () => void; aktivny?: boolean;
  /** Klik na percento konverzie — ukáže, kto sa medzi týmto a ďalším krokom stratil. */
  onStrata?: () => void; strataAktivna?: boolean;
}) {
  const telo = (
    <>
      <div style={{ fontSize: 26, fontWeight: 800, color: farba || C.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{cislo}</div>
      <div style={{ fontSize: 11.5, color: onClick ? C.accentLight : C.textMuted, marginTop: 3 }}>
        {popis}{onClick && <span style={{ fontSize: 9, marginLeft: 5, opacity: 0.8 }}>{aktivny ? "▾" : "▸"}</span>}
      </div>
    </>
  );
  return (
    <>
      {onClick ? (
        <button onClick={onClick} title="Ukázať mená"
          style={{
            flex: "1 1 110px", minWidth: 0, textAlign: "left", cursor: "pointer",
            background: aktivny ? mix(C.accent, 8) : "transparent",
            border: `1px solid ${aktivny ? mix(C.accent, 35) : "transparent"}`,
            borderRadius: 8, padding: "4px 8px", margin: "-4px -8px", fontFamily: "inherit",
          }}>
          {telo}
        </button>
      ) : (
        <div style={{ flex: "1 1 110px", minWidth: 0 }}>{telo}</div>
      )}
      {konverzia !== undefined && (
        onStrata ? (
          <button onClick={onStrata} title="Ukázať, kto sa medzi krokmi stratil"
            style={{
              flex: "0 0 auto", textAlign: "center", alignSelf: "center", cursor: "pointer",
              background: strataAktivna ? mix(C.red, 10) : "transparent",
              border: `1px solid ${strataAktivna ? mix(C.red, 35) : "transparent"}`,
              borderRadius: 8, padding: "4px 7px", fontFamily: "inherit",
            }}>
            <div style={{ fontSize: 16, lineHeight: 1, color: C.textDim }}>→</div>
            <div style={{ fontSize: 11, marginTop: 3, color: konverzia == null ? C.textDim : C.accentLight }}>
              {konverzia == null ? "—" : `${konverzia} %`}
            </div>
          </button>
        ) : (
          <div style={{ flex: "0 0 auto", textAlign: "center", color: C.textDim, alignSelf: "center" }}>
            <div style={{ fontSize: 16, lineHeight: 1 }}>→</div>
            <div style={{ fontSize: 11, marginTop: 3, color: konverzia == null ? C.textDim : C.accentLight }}>
              {konverzia == null ? "—" : `${konverzia} %`}
            </div>
          </div>
        )
      )}
    </>
  );
}

export function Lievik({ data, clients, onPoznamka }: {
  data: PSBData; clients: Record<string, ClientAgg>;
  /** Uloží dôvod, prečo človek po úvodnom už neprišiel. `false` = neuložilo sa. */
  onPoznamka?: (meno: string, text: string) => Promise<boolean | void> | boolean | void;
}) {
  const [okno, setOkno] = useState("2026");
  /** Ktorý krok lievika má rozbalené mená. Vždy najviac jeden. */
  const [ktori, setKtori] = useState<"dopyty" | "uvodne" | "klienti" | "strata" | null>(null);
  /** Ukázať aj tých, ktorým už niekto dôvod zapísal. */
  const [vybavene, setVybavene] = useState(false);
  // GA4 a dopyty zo Search Console zo skladu — App.tsx ich načíta pri štarte.
  // Do 19. 8. 2026 si ich táto obrazovka ťahala druhýkrát sama a mohla mať
  // iný stav než zvyšok appky.
  const web = useMemo(() => ({ ga4: GA4_MESACNE, dopyty: GSC_DOPYTY }), [marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesiace = useMemo(() => oknoMesiacov(data, okno), [data, okno]);
  const k = useMemo(() => krokyZa(data, clients, mesiace), [data, clients, mesiace]);

  // Rozpad podľa zdroja — len klienti, ktorí v období začali.
  const podlaZdroja = useMemo(() => {
    const m = new Map<string, { klientov: number; trzba: number }>();
    // `jeKlient` aj tu: bez neho bol čitateľ nadmnožinou menovateľa
    // (k.klienti z krokyZa tú podmienku má), podiely sa sčítali na ~125 %
    // a zdroj, ktorý sám presiahol k.klienti, vypísal prázdnu bunku.
    const menaVObdobi = Object.values(clients).filter((c) => !c.vratenie && c.firstSession && mesiace.includes(monthKey(c.firstSession)) && jeKlient(c, data.payments));
    for (const c of menaVObdobi) {
      const z = c.zdroj || "";
      const e = m.get(z) || { klientov: 0, trzba: 0 };
      e.klientov++;
      e.trzba += data.payments
        .filter((p) => p.client === c.name && mesiace.includes(monthKey(p.date)))
        .reduce((a, p) => a + p.amount, 0);
      m.set(z, e);
    }
    return [...m.entries()].sort((a, b) => b[1].klientov - a[1].klientov);
  }, [clients, data.payments, mesiace]);

  // Predstihové čísla — jediné, ktoré appka dostáva automaticky a presne.
  const ga4Okno = web.ga4.filter((g) => mesiace.includes(g.m));
  const udalosti = ga4Okno.reduce((a, g) => a + g.udalosti, 0);
  const znackove = web.dopyty.filter((d) => /prosapiens|pro sapiens/i.test(d.dopyt)).reduce((a, d) => a + d.kliky, 0);

  const obdobiePopis = mesiace.length ? `${monthLabel(mesiace[0])} – ${monthLabel(mesiace[mesiace.length - 1])}` : "";
  // Menej dopytov než úvodných tréningov je fyzikálne nemožné — každý, kto
  // prišiel, sa najprv musel ozvať. Znamená to len jedno: dopyty sa nezapisujú.
  const chybajuDopyty = k.dopyty < k.uvodne;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Cesta od prvého ozvania po zaplatený balíček. Percentá sú konverzie medzi krokmi. Tržba je len z klientov, ktorí v tomto období ZAČALI — obnovy starých klientov marketing nepriviedol a do lievika nepatria." label={`Odkiaľ prišli klienti · ${obdobiePopis}`} /></H3>
          <FilterObdobia hodnota={okno} onChange={setOkno} moznosti={OBDOBIA_MESACNE} />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", margin: "14px 0 4px" }}>
          {/* Šípka konvertuje DOPYTY, nie úvodné — `uvodne/dopyty` sú dve
              rôzne množiny ľudí (úvodné z odporúčaní dopyt nemajú) a ich
              podiel vyšiel v jan–aug 2026 „100 %", hoci na úvodný došlo
              29 z 38 dopytov (76 %). Ten istý vzor ako „124 %" z 13. 8. —
              vrchný pás to už počíta poctivo (zDopytuUvodny), pásik lievika
              na to 27. 8. 2026 došiel tiež. */}
          <Krok cislo={String(k.dopyty)} popis="Dopyty" konverzia={pct(k.zDopytuUvodny, k.dopyty)}
            onClick={k.dopyty ? () => setKtori(ktori === "dopyty" ? null : "dopyty") : undefined} aktivny={ktori === "dopyty"} />
          <Krok cislo={String(k.uvodne)} popis="Úvodné tréningy" konverzia={pct(k.zUvodnehoKlient, k.uvodne)}
            onClick={k.uvodne ? () => setKtori(ktori === "uvodne" ? null : "uvodne") : undefined} aktivny={ktori === "uvodne"}
            onStrata={k.kto.nepokracovali.length ? () => setKtori(ktori === "strata" ? null : "strata") : undefined}
            strataAktivna={ktori === "strata"} />
          <Krok cislo={String(k.klienti)} popis="Noví klienti" konverzia={undefined}
            onClick={k.klienti ? () => setKtori(ktori === "klienti" ? null : "klienti") : undefined} aktivny={ktori === "klienti"} />
          {/* Tržba od nových je súčet platieb TÝCH ISTÝCH ľudí, čo sú v zozname
              „Noví klienti" — klik otvorí ten istý zoznam, s tržbou pri každom.
              Do 19. 8. 2026 jediný krok lievika bez prekliku. */}
          <Krok cislo={fmtCZK(k.trzba)} popis="Tržba od nových" konverzia={undefined}
            onClick={k.klienti ? () => setKtori(ktori === "klienti" ? null : "klienti") : undefined} aktivny={ktori === "klienti"} />
        </div>

        {ktori && (() => {
          // Jeden zoznam pre všetky tri kroky — riadky sa líšia len stĺpcami.
          // Tri samostatné tabuľky by boli trikrát to isté a rozišli by sa.
          const nadpisy = {
            dopyty: "Kto sa ozval", uvodne: "Kto prišiel na úvodný",
            klienti: "Kto zostal a zaplatil", strata: "Kto prišiel na úvodný a už nikdy",
          };
          const riadky: { meno: string; vpravo: string }[] =
            ktori === "dopyty"
              ? k.kto.dopyty.map((x) => ({ meno: x.meno, vpravo: `${fmtDen(x.datum)}${x.zdroj ? ` · ${zdrojLabel(x.zdroj)}` : ""}` }))
              : ktori === "uvodne"
                ? k.kto.uvodne.map((x) => ({ meno: x.meno, vpravo: `úvodný ${fmtDen(x.datum)}` }))
                : ktori === "strata"
                  ? k.kto.nepokracovali.map((x) => ({ meno: x.meno, vpravo: `úvodný ${fmtDen(x.datum)} · pred ${x.dni} dňami` }))
                  : k.kto.klienti.map((x) => ({
                  meno: x.meno,
                  vpravo: `prvý tréning ${fmtDen(x.prvy)}${x.zaplatil ? ` · zaplatil ${fmtDen(x.zaplatil)}` : ""} · ${fmtCZK(x.trzbaVOkne)}`,
                }));
          return (
            <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 9, background: mix(C.text, 4), border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.textMuted }}>
                  {nadpisy[ktori]} ({ktori === "strata"
                    ? `${k.kto.nepokracovali.filter((x) => !x.preco).length} z ${k.kto.nepokracovali.length}`
                    : riadky.length})
                </span>
                <button onClick={() => setKtori(null)}
                  style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>zavrieť</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ktori === "strata" ? 8 : 5, maxHeight: 320, overflowY: "auto" }}>
                {ktori === "strata"
                  ? k.kto.nepokracovali
                    // Zapísaný dôvod znamená vybavené — riadok zmizne.
                    // Počet nad zoznamom ale musí ostať pravdivý (toľko ľudí
                    // naozaj nepokračovalo), preto sa vybavené dajú vrátiť
                    // jedným klikom, nie sú zmazané.
                    .filter((x) => vybavene || !x.preco)
                    .map((x) => (
                      <StrataRiadok key={x.meno} x={x} onPoznamka={onPoznamka} />
                    ))
                  : riadky.map((r, i) => (
                    <div key={`${r.meno}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                      <span style={{ color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meno}</span>
                      <span style={{ color: C.textDim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.vpravo}</span>
                    </div>
                  ))}
              </div>
              {ktori === "strata" && (() => {
                const hotovych = k.kto.nepokracovali.filter((x) => !!x.preco).length;
                const zostava = k.kto.nepokracovali.length - hotovych;
                return (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 9, lineHeight: 1.55 }}>
                    {zostava === 0
                      ? "Všetky dôvody sú zapísané. Jarvis ich má a vie z nich odpovedať, keď sa spýtaš, prečo ľudia po úvodnom nezostávajú."
                      : "Zapísaný dôvod znamená vybavené — riadok zmizne aj z Notifikácií."}
                    {hotovych > 0 && (
                      <>
                        {" "}
                        <button onClick={() => setVybavene((v) => !v)}
                          style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                          {vybavene ? `skryť vybavené (${hotovych})` : `ukázať aj vybavené (${hotovych})`}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {chybajuDopyty && (
          <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 9, background: mix(C.orange, 8), border: `1px solid ${mix(C.orange, 26)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
            <b>Dopytov je menej než úvodných tréningov, čo nie je možné</b> — každý, kto prišiel, sa najprv musel ozvať.
            Znamená to, že sa dopyty nezapisujú, a prvé dve čísla lievika sú preto slepé. Zapisujú sa v{" "}
            <b>Prevádzka → Klienti → Dopyty</b> alebo cez <b>+ Zápis</b> hore.
          </div>
        )}
      </Card>

      <Card>
        <H3><Info text="Tieto dve čísla appka dostáva automaticky a sú presné — na rozdiel od dopytov, ktoré závisia od toho, či si ich niekto zapíše. Kľúčové udalosti v GA4 sú odoslané formuláre (kontakt + ďakovná stránka), teda ľudia, ktorí sa reálne ozvali cez web. Značkové vyhľadávanie je počet klikov na dopyt „prosapiens“ — najčistejší ukazovateľ toho, že o vás ľudia vedia a hľadajú vás menom." label="Predstihové čísla (automatické)" /></H3>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: udalosti ? C.text : C.textDim, fontVariantNumeric: "tabular-nums" }}>{udalosti || "—"}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Odoslaných formulárov (GA4)</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: znackove ? C.text : C.textDim, fontVariantNumeric: "tabular-nums" }}>{znackove || "—"}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Klikov na „prosapiens“ v Google</div>
          </div>
        </div>
        {!udalosti && !znackove && (
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>
            Zatiaľ prázdne — nahraj GA4 export a Search Console (Údaje → Upload CSV).
          </div>
        )}
      </Card>

      <Card>
        <H3><Info text="Klienti, ktorí v zvolenom období odtrénovali svoje prvé sedenie, rozdelení podľa toho, odkiaľ sa o PSB dozvedeli. Zdroj sa berie z anamnézy alebo z ručného zápisu v karte klienta." label="Odkiaľ konkrétne" /></H3>
        {podlaZdroja.length === 0 ? (
          <Empty>V tomto období nezačal žiadny nový klient.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Zdroj</th>
                <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Tržba</th>
                <th style={{ ...S.th, textAlign: "right" }}>Podiel</th>
              </tr>
            </thead>
            <tbody>
              {podlaZdroja.map(([z, v]) => (
                <tr key={z || "—"}>
                  <td style={S.td}>{zdrojLabel(z)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.text }}>{v.klientov}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{fmtCZK(v.trzba)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{pct(v.klientov, k.klienti)} %</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

// ── Čo to stálo ──────────────────────────────────────────────────────────────

// „Čo to stálo" a „Platená cesta" tu boli do 18. 8. 2026. Obe odpovedali na
// otázku „čo priniesla reklama" vlastným výpočtom — spolu so „Čo to prinieslo"
// a „Kampane" to boli štyri karty a štyri rôzne čísla. Nahradila ich jedna:
// components/psb/Reklama.tsx nad výpočtom v lib/psb/reklama.ts.

export function Kohorta({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const riadky = useMemo(() => {
    const podlaNorm = new Map<string, ClientAgg>();
    for (const c of Object.values(clients)) podlaNorm.set(normName(c.name), c);
    // najdiKlienta (presne + fuzzy), nie holé normName — rovnaké párovanie
    // ako Lievik o kartu vyššie a aiContext. Revízia 19. 8.: kohorty párovali
    // vlastným pravidlom, takže „Lukas Hanus" z dopytu a „Lukáš Hanus"
    // z PTmindera boli dvaja ľudia a kohorty hlásili nižšiu konverziu než
    // Lievik na tej istej obrazovke.
    const vsetkyMena = [...podlaNorm.values()].map((c) => c.name);
    const najdi = (meno: string) => {
      const kanonicke = najdiKlienta(vsetkyMena, meno);
      return kanonicke ? podlaNorm.get(normName(kanonicke)) : undefined;
    };
    // Jedna definícia klienta pre celý súbor — viď jeKlient hore. Lokálna
    // kópia tu mala mäkšie pravidlo („má platbu") a stĺpec „Začali chodiť"
    // tak počítal aj ľudí, ktorí prišli raz na úvodný a zmizli.
    const zaplatil = (c: ClientAgg) => jeKlient(c, data.payments);

    // Každý riadok kohorty si nesie mená, z ktorých vznikol — klik na mesiac
    // ich ukáže. Bez toho bola kohorta čistá tabuľka čísel bez možnosti
    // overiť očami, kto v nej je (revízia 19. 8. 2026).
    type Kto = { meno: string; datum: string; uvodny: string; klient: boolean; trzba: number };
    const m = new Map<string, { dopytov: number; uvodny: number; klient: number; trzba: number; dni: number[]; kto: Kto[] }>();
    for (const l of data.leads) {
      const mk = monthKey(l.date);
      if (!mk) continue;
      const e = m.get(mk) || { dopytov: 0, uvodny: 0, klient: 0, trzba: 0, dni: [], kto: [] };
      e.dopytov++;
      const c = najdi(l.name || "");
      let jeKl = false, tr = 0;
      if (c && c.firstSession) {
        e.uvodny++;
        const d = Math.round((Date.parse(c.firstSession) - Date.parse(l.date)) / 86400000);
        if (d >= 0 && d < 400) e.dni.push(d);
        if (zaplatil(c)) {
          e.klient++;
          tr = data.payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
          e.trzba += tr;
          jeKl = true;
        }
      }
      e.kto.push({ meno: l.name || "(bez mena)", datum: l.date, uvodny: c?.firstSession || "", klient: jeKl, trzba: tr });
      m.set(mk, e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [data.leads, data.payments, clients]);

  const [otvorenaKohorta, setOtvorenaKohorta] = useState<string | null>(null);
  const fmtDenK = (d: string) => { const [r, mm, dd] = (d || "").slice(0, 10).split("-"); return dd ? `${Number(dd)}. ${Number(mm)}. ${r}` : "—"; };

  return (
    <Card>
      <H3><Info text="Skupina ľudí, ktorí sa ozvali v jednom mesiaci, sledovaná ďalej v čase — koľko z nich prišlo na úvodný tréning a koľko potom zaplatilo. Mesačná konverzia by pri štyroch úvodných mesačne bola šum; kohorta nie. Dopyt sa páruje s klientom podľa mena bez diakritiky, takže preklep v mene znamená nespárovaný riadok, nie chybu vo výpočte." label="Kohorty dopytov" /></H3>
      {riadky.length === 0 ? (
        <Empty>Zatiaľ žiadne zapísané dopyty — bez nich sa cesta od ozvania po klienta nedá sledovať.</Empty>
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Ozvali sa v</th>
                <th style={{ ...S.th, textAlign: "right" }}>Dopytov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Prišli na úvodný</th>
                <th style={{ ...S.th, textAlign: "right" }}>Začali chodiť</th>
                <th style={{ ...S.th, textAlign: "right" }}>Ø dní do úvodného</th>
                <th style={{ ...S.th, textAlign: "right" }}>Tržba z nich</th>
              </tr>
            </thead>
            <tbody>
              {riadky.map(([mk, v]) => (
                <tr key={mk} onClick={() => setOtvorenaKohorta(otvorenaKohorta === mk ? null : mk)}
                  style={{ cursor: "pointer", background: otvorenaKohorta === mk ? mix(C.accent, 8) : undefined }}
                  title="Klik ukáže mená v tejto kohorte">
                  <td style={S.td}>{monthLabel(mk)} <span style={{ fontSize: 9, color: C.textDim }}>{otvorenaKohorta === mk ? "▾" : "▸"}</span></td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.text }}>{v.dopytov}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    {v.uvodny}
                    <span style={{ color: C.textDim, fontSize: 11 }}> · {pct(v.uvodny, v.dopytov) ?? "—"} %</span>
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>
                    {v.klient}
                    <span style={{ color: C.textDim, fontSize: 11 }}> · {pct(v.klient, v.dopytov) ?? "—"} %</span>
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>
                    {v.dni.length ? Math.round(v.dni.reduce((a, b) => a + b, 0) / v.dni.length) : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: C.green }}>{fmtCZK(v.trzba)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {otvorenaKohorta && (() => {
            const r = riadky.find(([mk]) => mk === otvorenaKohorta);
            if (!r) return null;
            const [mk, v] = r;
            return (
              <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 9, background: mix(C.text, 4), border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.textMuted }}>
                    Ozvali sa v {monthLabel(mk)} — {v.dopytov} dopytov · {v.uvodny} na úvodnom · {v.klient} začali chodiť
                  </span>
                  <button onClick={() => setOtvorenaKohorta(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>zavrieť</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 300, overflowY: "auto" }}>
                  {v.kto.map((x, i) => (
                    <div key={`${x.meno}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                      <span style={{ color: x.klient ? C.text : C.textMuted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.meno}</span>
                      <span style={{ color: C.textDim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {fmtDenK(x.datum)}{x.uvodny ? ` · úvodný ${fmtDenK(x.uvodny)}` : " · bez úvodného"}{x.klient ? ` · klient · ${fmtCZK(x.trzba)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
            Posledné mesiace budú vždy vyzerať horšie — ľudia, ktorí sa ozvali minulý týždeň, ešte nemali kedy prísť.
            Čítať sa dajú až kohorty staršie ako dva mesiace.
          </div>
        </>
      )}
    </Card>
  );
}


// ── Ako zapnúť meranie reklamy ───────────────────────────────────────────────
//
// Toto nie je návod pre appku, je to návod pre Jerryho — a je tu preto, že bez
// týchto dvoch krokov zostane platená cesta neviditeľná bez ohľadu na to, čo
// appka počíta. Cieľ „spustím reklamu = noví klienti" sa nedá vyladiť, kým sa
// nedá overiť.
export function AkoMeratReklamu() {
  const [kopirovane, setKopirovane] = useState("");
  const [platforma, setPlatforma] = useState<Platforma>("meta");
  const [stranka, setStranka] = useState("");
  const [kampan, setKampan] = useState("");

  /**
   * Ponuka stránok. Prvá je úvodný tréning — na septembrový test sa mieri
   * naň a hľadať ho medzi 77 adresami je zbytočná práca. Zvyšok je zoznam,
   * ktorý appka o webe naozaj má; vypisovať adresu ručne znamená preklep.
   */
  const stranky = useMemo(() => {
    const zoznam = WEB_STRANKY.map((s2) => s2.url).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const uvodny = zoznam.find((u) => /uvodni-trenink/.test(u));
    return uvodny ? [uvodny, ...zoznam.filter((u) => u !== uvodny)] : zoznam;
    // marketingVerzia(): WEB_STRANKY plní import mimo Reactu — bez verzie
    // v deps memo zamrzne nad prázdnym skladom, keď človek otvorí kartu skôr,
    // než dobehne /api/marketing (tá istá chyba ako PlanObsahu, 18. 8.).
  }, [marketingVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  const ciel = stranka || stranky[0] || "";
  const odkaz = znackovanyOdkaz(ciel, platforma, kampan);

  const kopiruj = async (t: string, co: string) => {
    try { await navigator.clipboard.writeText(t); setKopirovane(co); setTimeout(() => setKopirovane(""), 2000); } catch { /* bez povolenia */ }
  };
  const krok: React.CSSProperties = { fontSize: 12.5, color: C.textMuted, lineHeight: 1.65, marginBottom: 12 };
  const prepinac = (p: Platforma, popis: string) => (
    <button key={p} onClick={() => setPlatforma(p)}
      style={{ padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5,
        border: `1px solid ${platforma === p ? C.accent : C.border}`,
        background: platforma === p ? mix(C.accent, 14) : "transparent",
        color: platforma === p ? C.accentLight : C.textMuted }}>
      {popis}
    </button>
  );

  return (
    <Card>
      <H3><Info text="Odkaz, ktorý povie GA4, odkiaľ človek prišiel. Bez neho ten, kto videl platený reel, vyzerá v dátach rovnako ako ten, kto nás našiel sám. Google je výnimka — značkuje si sám a namiesto odkazu potrebuje tri veci nastavené v jeho rozhraní." label="Ako zapnúť meranie reklamy" /></H3>

      <div style={krok}>
        <b style={{ color: C.text }}>1. Kde to pustíš?</b>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "8px 0" }}>
          {prepinac("meta", "Meta (Facebook, Instagram)")}
          {prepinac("google", "Google Ads")}
          {prepinac("mail", "Mail")}
        </div>

        {platforma === "google" ? (
          <>
            Google si značkuje sám cez <code style={{ fontSize: 11 }}>gclid</code>, takže tu nie je čo kopírovať — ručné
            <code style={{ fontSize: 11 }}> utm_</code> by mu automatické značkovanie prebilo a boli by z toho dva zdroje pravdy.
            Namiesto odkazu skontroluj v Google Ads tri veci:
            <div style={{ marginTop: 6, paddingLeft: 14, lineHeight: 1.75 }}>
              <b style={{ color: C.text }}>a)</b> automatické značkovanie je zapnuté (Nastavenia účtu → Automatické označovanie),<br />
              <b style={{ color: C.text }}>b)</b> účet je prepojený s GA4 (Nástroje → Prepojené účty),<br />
              <b style={{ color: C.text }}>c)</b> konverzia je <b style={{ color: C.text }}>odoslanie formulára</b>, nie zobrazenie stránky
              — presne takto to bolo nastavené počas kampaní 2023–25 a preto hlásili 299 konverzií na 13 klientov. Pred novým spustením to over znova.
            </div>
          </>
        ) : (
          <>
            {platforma === "meta"
              ? "Meta si neznačkuje nič. Bez tohto odkazu je platený návštevník v GA4 nerozoznateľný od toho, kto prišiel sám."
              : "Mail dostane vlastný zdroj, aby sa neschoval medzi reklamu ani medzi priame návštevy."}
          </>
        )}
      </div>

      {platforma !== "google" && (
        <div style={krok}>
          <b style={{ color: C.text }}>2. Kam to má viesť a ako sa to volá?</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
            <select value={ciel} onChange={(e) => setStranka(e.target.value)}
              style={{ ...S.input, flex: "1 1 300px", minWidth: 0, fontSize: 11.5, padding: "6px 8px" }}>
              {stranky.length === 0 && <option value="">Text webu sa ešte nestiahol</option>}
              {stranky.map((u) => <option key={u} value={u}>{u.replace(/^https?:\/\/(www\.)?/, "")}</option>)}
            </select>
            <input value={kampan} onChange={(e) => setKampan(e.target.value)} placeholder="názov kampane, napr. Úvodní trénink září"
              style={{ ...S.input, flex: "1 1 220px", minWidth: 0, fontSize: 11.5, padding: "6px 8px" }} />
          </div>
          <span style={{ fontSize: 11, color: C.textDim }}>
            Názov sa v odkaze objaví ako <code style={{ fontSize: 10.5 }}>utm_campaign</code> — bez diakritiky a medzier.
            Podľa neho ich potom appka aj GA4 vedia rozlíšiť, tak nech je pre každú kampaň iný.
          </span>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <code style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontSize: 11, color: odkaz ? C.textMuted : C.textDim, flex: "1 1 260px", minWidth: 0, overflowX: "auto", whiteSpace: "nowrap" }}>
              {odkaz || "vyber stránku"}
            </code>
            <button onClick={() => odkaz && void kopiruj(odkaz, "odkaz")} disabled={!odkaz}
              style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11.5, cursor: odkaz ? "pointer" : "default", opacity: odkaz ? 1 : 0.5, whiteSpace: "nowrap", fontFamily: "inherit" }}>
              {kopirovane === "odkaz" ? "skopírované" : "kopírovať"}
            </button>
          </div>
        </div>
      )}

      <div style={krok}>
        <b style={{ color: C.text }}>3. Z GA4 exportuj kľúčové udalosti PODĽA KANÁLA.</b><br />
        Dnešný export dáva len súčet (18 za júl). Keď bude rozdelený po skupinách kanálov, appka uvidí, koľko
        formulárov prišlo z platenej cesty — a to je počet dopytov z reklamy bez toho, aby ho niekto zapisoval.
      </div>

      <div style={{ ...krok, marginBottom: 0 }}>
        <b style={{ color: C.orange }}>4. A jedna vec, ktorá nie je o meraní.</b><br />
        V júli 2026 išlo <b style={{ color: C.text }}>50 % rozpočtu do kampaní s cieľom „engagement"</b> a 12 % do „awareness"
        (živé podiely za zvolené obdobie sú na karte Kampane — toto je momentka z júla).
        Tie kupujú videnia, nie návštevy — Meta ich doručí a zadanie splní. Jediná kampaň, z ktorej mohol vzniknúť
        dopyt, bola <i>Traffic — Příručka Dýchání</i> za 1 804 Kč a mala najlacnejší klik zo všetkých (2,80 Kč).
        Kým bude väčšina rozpočtu v engagement, „spustím reklamu = klienti" nemôže platiť ani pri dokonalom meraní.
      </div>
    </Card>
  );
}
