import { useEffect, useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel, normName } from "../../lib/psb/format";
import { ZDROJE } from "./Klienti";
import { OBDOBIA_MESACNE, mesiaceVOkne } from "../../lib/psb/obdobia";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka, TableWrap } from "./ui";

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

/** „2026-08-11" → „11. 8." — v zozname mien je rok šum. */
const fmtDen = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
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
   * Kto presne za tými číslami je.
   *
   * Jerry, 13. 8.: „keď kliknem na úvodný tréning 3, napíše mi, kto presne to
   * je." Číslo bez mien sa nedá overiť ani použiť — pri troch ľuďoch je otázka
   * „ktorí?" prvá, ktorá napadne, a doteraz sa na ňu dalo odpovedať len
   * preklikaním Klientov.
   */
  kto: {
    dopyty: { meno: string; datum: string; zdroj: string }[];
    uvodne: { meno: string; datum: string }[];
    klienti: { meno: string; prvy: string; zaplatil: string }[];
    /**
     * Kto prišiel na úvodný a už nikdy — najcennejší zoznam v lieviku.
     *
     * Ostatné tri hovoria, čo vyšlo. Tento hovorí, čo sa stratilo, a je to
     * jediné miesto, kde sa dá niečo zmeniť: osem ľudí ročne zaplatilo za
     * úvodný tréning a nevrátilo sa. Kým neboli menovite vidieť, nedala sa
     * položiť ani otázka prečo.
     */
    nepokracovali: { meno: string; datum: string; dni: number }[];
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
const jeKlient = (c: ClientAgg) => c.sessions.some((x) => x.sessionType !== "UVODNE");

export function krokyZa(data: PSBData, clients: Record<string, ClientAgg>, mesiace: string[]): Kroky {
  const v = (d: string) => mesiace.includes(monthKey(d));
  const dopytyRiadky = data.leads.filter((l) => v(l.date));
  const dopyty = dopytyRiadky.length;
  // Úvodný tréning ako UDALOSŤ, nie ako sedenie: keď niekto príde dvakrát,
  // stále je to jeden človek na začiatku cesty.
  const uvodneSedenia = data.sessions.filter((s) => s.sessionType === "UVODNE" && v(s.date));
  // Jeden človek = jeden riadok, aj keď prišiel dvakrát. Berie sa prvý dátum.
  const uvodneMapa = new Map<string, string>();
  for (const s of [...uvodneSedenia].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!uvodneMapa.has(s.client)) uvodneMapa.set(s.client, s.date);
  }
  const uvodne = uvodneMapa.size;
  const novi = Object.values(clients).filter((c) => {
    // Kto sa vrátil po pauze, nie je nový klient. Bez toho vyšlo v roku 2026
    // o jedného nového viac než úvodných tréningov — Kateřina Stoklásková mala
    // úvodný v novembri 2022, ale dáta z PTmindera siahajú do januára 2025.
    if (c.vratenie) return false;
    if (!c.firstSession || !v(c.firstSession)) return false;
    return jeKlient(c);
  });
  // Tržba z NOVÝCH klientov — nie celková. Celková tržba obsahuje aj obnovy
  // starých klientov a tie marketing nepriviedol.
  const menaNovych = new Set(novi.map((c) => c.name));
  const trzba = data.payments
    .filter((p) => p.client && menaNovych.has(p.client) && v(p.date))
    .reduce((a, p) => a + p.amount, 0);
  // Dopyt → klient. Páruje sa podľa mena; e-mail v dopyte často chýba a
  // v klientoch nie je vôbec.
  const platiaci = new Set(Object.values(clients).filter(jeKlient).map((c) => normName(c.name)));
  const zDopytu = data.leads.filter((l) => v(l.date) && l.name && platiaci.has(normName(l.name))).length;

  const prvaPlatba = (meno: string) =>
    data.payments.filter((p) => p.client === meno).map((p) => p.date).sort()[0] || "";

  return {
    dopyty, uvodne, klienti: novi.length, trzba, zDopytu,
    kto: {
      dopyty: dopytyRiadky
        .map((l) => ({ meno: l.name || "(bez mena)", datum: l.date, zdroj: l.source || "" }))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
      uvodne: [...uvodneMapa.entries()]
        .map(([meno, datum]) => ({ meno, datum }))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
      klienti: novi
        .map((c) => ({ meno: c.name, prvy: c.firstSession || "", zaplatil: prvaPlatba(c.name) }))
        .sort((a, b) => b.prvy.localeCompare(a.prvy)),
      // Mal úvodný v okne a v CELEJ histórii žiadne ďalšie sedenie. Pozerá sa
      // mimo okna zámerne: kto prišiel v januári a vrátil sa v júni, sa
      // nestratil — len to trvalo.
      nepokracovali: [...uvodneMapa.entries()]
        .filter(([meno]) => !(clients[meno]?.sessions || []).some((x) => x.sessionType !== "UVODNE"))
        .map(([meno, datum]) => ({
          meno, datum,
          dni: Math.max(0, Math.round((Date.now() - Date.parse(`${datum}T12:00:00Z`)) / 86400000)),
        }))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
    },
  };
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

export function Lievik({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [okno, setOkno] = useState("2026");
  /** Ktorý krok lievika má rozbalené mená. Vždy najviac jeden. */
  const [ktori, setKtori] = useState<"dopyty" | "uvodne" | "klienti" | "strata" | null>(null);
  const [web, setWeb] = useState<{ ga4: { m: string; udalosti: number }[]; dopyty: { dopyt: string; kliky: number }[] }>({ ga4: [], dopyty: [] });

  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ga4?: { m: string; udalosti: number }[]; gscDopyty?: { dopyt: string; kliky: number }[] }) =>
        setWeb({ ga4: j.ga4 || [], dopyty: j.gscDopyty || [] }))
      .catch(() => {});
  }, []);

  const mesiace = useMemo(() => oknoMesiacov(data, okno), [data, okno]);
  const k = useMemo(() => krokyZa(data, clients, mesiace), [data, clients, mesiace]);

  // Rozpad podľa zdroja — len klienti, ktorí v období začali.
  const podlaZdroja = useMemo(() => {
    const m = new Map<string, { klientov: number; trzba: number }>();
    const menaVObdobi = Object.values(clients).filter((c) => !c.vratenie && c.firstSession && mesiace.includes(monthKey(c.firstSession)));
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
          <Krok cislo={String(k.dopyty)} popis="Dopyty" konverzia={pct(k.uvodne, k.dopyty)}
            onClick={k.dopyty ? () => setKtori(ktori === "dopyty" ? null : "dopyty") : undefined} aktivny={ktori === "dopyty"} />
          <Krok cislo={String(k.uvodne)} popis="Úvodné tréningy" konverzia={pct(k.klienti, k.uvodne)}
            onClick={k.uvodne ? () => setKtori(ktori === "uvodne" ? null : "uvodne") : undefined} aktivny={ktori === "uvodne"}
            onStrata={k.kto.nepokracovali.length ? () => setKtori(ktori === "strata" ? null : "strata") : undefined}
            strataAktivna={ktori === "strata"} />
          <Krok cislo={String(k.klienti)} popis="Noví klienti" konverzia={undefined}
            onClick={k.klienti ? () => setKtori(ktori === "klienti" ? null : "klienti") : undefined} aktivny={ktori === "klienti"} />
          <div style={{ flex: "1 1 130px", minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.accentLight, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(k.trzba)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>Tržba od nových</div>
          </div>
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
                  vpravo: `prvý tréning ${fmtDen(x.prvy)}${x.zaplatil ? ` · zaplatil ${fmtDen(x.zaplatil)}` : ""}`,
                }));
          return (
            <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 9, background: mix(C.text, 4), border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.textMuted }}>
                  {nadpisy[ktori]} ({riadky.length})
                </span>
                <button onClick={() => setKtori(null)}
                  style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>zavrieť</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 260, overflowY: "auto" }}>
                {riadky.map((r, i) => (
                  <div key={`${r.meno}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                    <span style={{ color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meno}</span>
                    <span style={{ color: C.textDim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.vpravo}</span>
                  </div>
                ))}
              </div>
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
export function Naklady({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [kanaly, setKanaly] = useState<{ mesiac: string; kanal: string; metrika: string; hodnota: number }[]>([]);
  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kanaly?: { mesiac: string; kanal: string; metrika: string; hodnota: number }[] }) => setKanaly(j.kanaly || []))
      .catch(() => {});
  }, []);

  const riadky = useMemo(() => {
    // Výdavok na reklamu podľa mesiaca: z mesačnej zostavy (Meta Ads) a
    // z Metricool exportu (spend pri príspevkoch) — čo je k dispozícii.
    const spend = new Map<string, number>();
    for (const r of kanaly) {
      if (!/spent|spend/i.test(r.metrika)) continue;
      spend.set(r.mesiac, (spend.get(r.mesiac) || 0) + r.hodnota);
    }
    const noviVMesiaci = new Map<string, number>();
    const trzbaVMesiaci = new Map<string, number>();
    for (const c of Object.values(clients)) {
      if (!c.firstSession) continue;
      const m = monthKey(c.firstSession);
      noviVMesiaci.set(m, (noviVMesiaci.get(m) || 0) + 1);
      const t = data.payments.filter((p) => p.client === c.name && monthKey(p.date) === m).reduce((a, p) => a + p.amount, 0);
      trzbaVMesiaci.set(m, (trzbaVMesiaci.get(m) || 0) + t);
    }
    // Najnovší mesiac hore. Zoznam rástol zdola a júl 26 — jediný mesiac,
    // o ktorom sa reálne rozhoduje — bol na konci pod dvanástimi staršími.
    return [...spend.keys()].sort().reverse().map((m) => ({
      mesiac: m,
      spend: spend.get(m) || 0,
      novi: noviVMesiaci.get(m) || 0,
      trzba: trzbaVMesiaci.get(m) || 0,
    }));
  }, [kanaly, clients, data.payments]);

  const spolu = riadky.reduce((a, r) => ({ spend: a.spend + r.spend, novi: a.novi + r.novi, trzba: a.trzba + r.trzba }), { spend: 0, novi: 0, trzba: 0 });

  return (
    <Card>
      <H3><Info text="Koľko stála reklama a koľko klientov v tom mesiaci začalo. Je to ZMIEŠANÉ číslo, nie cena za klienta z reklamy: anamnéza sa nepýta, či človek prišiel z platenej alebo neplatenej cesty, takže sa nedá povedať, ktorý z tých klientov je z reklamy. Aj tak je to použiteľné — hovorí, koľko celý marketing stojí na jedného získaného klienta, a to je číslo, ktoré sa dá porovnať s cenou balíčka." label="Čo to stálo" /></H3>

      {riadky.length === 0 ? (
        <Empty>Zatiaľ nemám výdavky na reklamu. Nahraj mesačnú zostavu z Metricoolu (PDF alebo CSV).</Empty>
      ) : (
        <>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "10px 0 14px" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.orange, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(spolu.spend)}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Reklama spolu</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{spolu.novi}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Nových klientov</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: spolu.novi ? C.accentLight : C.textDim, fontVariantNumeric: "tabular-nums" }}>
                {spolu.novi ? fmtCZK(spolu.spend / spolu.novi) : "—"}
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Zmiešaná cena za klienta</div>
            </div>
          </div>

          <RolovaciaTabulka pocet={3}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Mesiac</th>
                <th style={{ ...S.th, textAlign: "right" }}>Reklama</th>
                <th style={{ ...S.th, textAlign: "right" }}>Nových klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Cena za klienta</th>
                <th style={{ ...S.th, textAlign: "right" }}>Tržba od nich</th>
              </tr>
            </thead>
            <tbody>
              {riadky.map((r) => (
                <tr key={r.mesiac}>
                  <td style={S.td}>{monthLabel(r.mesiac)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(r.spend)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{r.novi}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: r.novi ? C.text : C.textDim }}>
                    {r.novi ? fmtCZK(r.spend / r.novi) : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{fmtCZK(r.trzba)}</td>
                </tr>
              ))}
            </tbody>
          </RolovaciaTabulka>

          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
            Mesiac bez nového klienta má prázdnu cenu, nie nulu — reklama v ňom nebola zadarmo, len sa nekúpila.
          </div>

          <PlatenaCesta data={data} clients={clients} spend={spolu.spend} />
        </>
      )}
    </Card>
  );
}

// Platená cesta zvlášť — to je jediné číslo, podľa ktorého sa dá rozhodnúť,
// či pridať rozpočet. Zmiešaná cena za klienta na to nestačí: obsahuje aj
// klientov z odporúčaní, ktorí by prišli aj bez reklamy.
function PlatenaCesta({ data, clients, spend }: { data: PSBData; clients: Record<string, ClientAgg>; spend: number }) {
  const v = useMemo(() => {
    const dopyty = data.leads.filter((l) => l.source === "reklama");
    const podlaNorm = new Map<string, ClientAgg>();
    for (const c of Object.values(clients)) podlaNorm.set(normName(c.name), c);
    let klienti = 0;
    let trzba = 0;
    for (const l of dopyty) {
      const c = podlaNorm.get(normName(l.name || ""));
      if (!c) continue;
      const zaplatil = data.payments.some((p) => p.client === c.name) || c.sessions.some((x) => x.sessionType !== "UVODNE" && x.price > 0);
      if (!zaplatil) continue;
      klienti++;
      trzba += data.payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
    }
    return { dopyty: dopyty.length, klienti, trzba };
  }, [data.leads, data.payments, clients]);

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>
        Platená cesta zvlášť
      </div>
      {v.dopyty === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
          Zatiaľ nie je zapísaný ani jeden dopyt so zdrojom <b style={{ color: C.text }}>Reklama (platená)</b>, takže sa nedá
          povedať, čo reklama priniesla — len čo stála. Kým sa to nezačne zapisovať, zostáva zmiešaná cena vyššie
          jediné, čo appka o návratnosti reklamy vie, a tá obsahuje aj klientov z odporúčaní, ktorí by prišli aj bez nej.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{v.dopyty}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Dopytov z reklamy</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.orange, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(spend / v.dopyty)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Cena za dopyt</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{v.klienti}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Z toho klientov</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: v.klienti ? C.accentLight : C.textDim, fontVariantNumeric: "tabular-nums" }}>
              {v.klienti ? fmtCZK(spend / v.klienti) : "—"}
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Cena za klienta z reklamy</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.green, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(v.trzba)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Tržba z nich</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Referenčný motor ─────────────────────────────────────────────────────────
// ── Kohorta dopytov ──────────────────────────────────────────────────────────
//
// Mesačná krivka konverzie by pri štyroch úvodných mesačne bola šum. Kohorta
// nie: „z dvanástich, čo sa ozvali v septembri, prišlo sedem a päť začalo" je
// veta, podľa ktorej sa dá rozhodnúť o rozpočte.
//
// Dopyt sa páruje s klientom podľa mena bez diakritiky — nie je na to väzba v
// databáze a robiť ju kvôli tomu by znamenalo zapisovať dopyt dvakrát. Meno
// stačí; keď sa nespáruje, kohorta to prizná, nedopočíta.
export function Kohorta({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const riadky = useMemo(() => {
    const podlaNorm = new Map<string, ClientAgg>();
    for (const c of Object.values(clients)) podlaNorm.set(normName(c.name), c);
    const zaplatil = (c: ClientAgg) =>
      data.payments.some((p) => p.client === c.name) || c.sessions.some((x) => x.sessionType !== "UVODNE" && x.price > 0);

    const m = new Map<string, { dopytov: number; uvodny: number; klient: number; trzba: number; dni: number[] }>();
    for (const l of data.leads) {
      const mk = monthKey(l.date);
      if (!mk) continue;
      const e = m.get(mk) || { dopytov: 0, uvodny: 0, klient: 0, trzba: 0, dni: [] };
      e.dopytov++;
      const c = podlaNorm.get(normName(l.name || ""));
      if (c && c.firstSession) {
        e.uvodny++;
        const d = Math.round((Date.parse(c.firstSession) - Date.parse(l.date)) / 86400000);
        if (d >= 0 && d < 400) e.dni.push(d);
        if (zaplatil(c)) {
          e.klient++;
          e.trzba += data.payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
        }
      }
      m.set(mk, e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [data.leads, data.payments, clients]);

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
                <tr key={mk}>
                  <td style={S.td}>{monthLabel(mk)}</td>
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
  const odkaz = "https://www.prosapiens.cz/dychani/?utm_source=meta&utm_medium=paid&utm_campaign=dychani";
  const kopiruj = async (t: string, co: string) => {
    try { await navigator.clipboard.writeText(t); setKopirovane(co); setTimeout(() => setKopirovane(""), 2000); } catch { /* bez povolenia */ }
  };
  const krok: React.CSSProperties = { fontSize: 12.5, color: C.textMuted, lineHeight: 1.65, marginBottom: 12 };

  return (
    <Card>
      <H3><Info text="Dva kroky mimo appky, bez ktorých zostane platená cesta neviditeľná. Ani jeden nie je práca na hodiny — prvý je vloženie odkazu do reklamy, druhý je iný export z GA4." label="Ako zapnúť meranie reklamy" /></H3>

      <div style={krok}>
        <b style={{ color: C.text }}>1. Reklamy majú viesť na značkovaný odkaz.</b><br />
        Vtedy GA4 vie, že návšteva prišla z reklamy, aj keď to človek sám nevie povedať. Bez toho ten, kto videl
        platený reel, napíše do anamnézy „Instagram" rovnako ako ten, kto nás našiel sám.
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <code style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontSize: 11, color: C.textMuted, flex: "1 1 260px", minWidth: 0, overflowX: "auto", whiteSpace: "nowrap" }}>{odkaz}</code>
          <button onClick={() => void kopiruj(odkaz, "odkaz")} style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}>
            {kopirovane === "odkaz" ? "skopírované" : "kopírovať"}
          </button>
        </div>
        <span style={{ fontSize: 11, color: C.textDim }}>
          Časť za otáznikom sa dá meniť podľa kampane — dôležité je, aby ju mali len reklamy.
        </span>
      </div>

      <div style={krok}>
        <b style={{ color: C.text }}>2. Z GA4 exportuj kľúčové udalosti PODĽA KANÁLA.</b><br />
        Dnešný export dáva len súčet (18 za júl). Keď bude rozdelený po skupinách kanálov, appka uvidí, koľko
        formulárov prišlo z platenej cesty — a to je počet dopytov z reklamy bez toho, aby ho niekto zapisoval.
      </div>

      <div style={{ ...krok, marginBottom: 0 }}>
        <b style={{ color: C.orange }}>3. A jedna vec, ktorá nie je o meraní.</b><br />
        V júli išlo <b style={{ color: C.text }}>50 % rozpočtu do kampaní s cieľom „engagement"</b> a 12 % do „awareness".
        Tie kupujú videnia, nie návštevy — Meta ich doručí a zadanie splní. Jediná kampaň, z ktorej mohol vzniknúť
        dopyt, bola <i>Traffic — Příručka Dýchání</i> za 1 804 Kč a mala najlacnejší klik zo všetkých (2,80 Kč).
        Kým bude väčšina rozpočtu v engagement, „spustím reklamu = klienti" nemôže platiť ani pri dokonalom meraní.
      </div>
    </Card>
  );
}
