import { useEffect, useMemo, useState } from "react";

import { cenaDopytuZReklamy } from "../../lib/psb/cenaDopytu";
import { kotvaDat, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK } from "../../lib/psb/format";
import { DOPYTOV_MESACNE, KONVERZIA_DOPYTU, farbaCeny, hodnot, type Hodnotenie } from "../../lib/psb/hodnotenie";
import { suhrnKampani, zlucKampane, type Kampan } from "../../lib/psb/kampane";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Info } from "./ui";

import { krokyZa, oknoMesiacov } from "./MarketingLievik";

/**
 * Čísla, ktoré rozhodujú o marketingu — na povrchu, s výkladom pod trojuholníkom.
 *
 * PREČO JE VÝKLAD ZBALENÝ
 *
 * Prvá verzia mala pri každom čísle dva odstavce natvrdo. Tri karty tak
 * zabrali pol obrazovky textu, ktorý si Jerry prečíta raz a potom už len
 * prekáža medzi ním a číslami. Text nezmizol — je za trojuholníkom a otvorí
 * sa, keď treba.
 *
 * PREČO JE PRI KAŽDOM ČÍSLE SMER
 *
 * „43 %" samo o sebe nepovie, či je viac lepšie. Jeden riadok („čím vyššie,
 * tým lepšie · cieľ 70 %") to vyrieši bez toho, aby si čokoľvek pamätal —
 * a nahradil stupnicu 1–10, ktorú Jerry 12. 8. zrušil ako mätúcu.
 *
 * PREČO SÚ ĎALŠIE METRIKY VEDĽA A NIE POD SEBOU
 *
 * Prvé tri sú tri po sebe idúce otázky a keď na niektorú neexistuje odpoveď,
 * ďalšie dve sú bezcenné:
 *
 *   1. Koľko ľudí sa ozve?      → vstup. Nič iné ho nenahradí.
 *   2. Koľko z nich zostane?    → problém pred dverami alebo za nimi?
 *   3. Koľko stojí jeden dopyt? → bez toho je rozpočet stávka, nie nákup.
 *
 * Ostatné sú podporné — vysvetľujú, prečo tie tri vyzerajú tak, ako vyzerajú.
 * Preto sú za nimi v tom istom páse a treba k nim posunúť, nie ich preskočiť
 * očami.
 *
 * PREČO JE OBDOBIE ZAKOTVENÉ
 *
 * Priemer za mesiac sa počíta len z PLNÝCH mesiacov. Bežiaci mesiac má
 * napočítanú polovicu dopytov a stiahol by priemer nadol — tá istá chyba sa
 * v tejto appke opakovala už pri grafoch aj pri cene sedenia.
 */

type Metrika = {
  kluc: string;
  nazov: string;
  hodnota: string;
  h: Hodnotenie;
  /** Jednoriadkový smer: kam sa má číslo hýbať a kde je méta. */
  smer: string;
  /** Pevná farba čísla, keď sa nesúdi (cena za dopyt bez cieľa). */
  farba?: string;
  /**
   * Čo hovorí BEŽIACI mesiac.
   *
   * Pás počíta z plných mesiacov (inak by polovičný mesiac ťahal priemer
   * nadol). Lenže keď sa práve teraz niečo deje — 20. 9. 2026 prišiel prvý
   * dopyt z reklamy — pomlčka o tom mlčí a vyzerá ako porucha. Jerry sa preto
   * pýtal „je cena za dopyt stále 0?". Nie je nula; nie je za čo ju ešte
   * počítať. Tento riadok povie, čo sa deje teraz a kedy to do priemeru
   * spadne.
   */
  beziaci?: string;
  preco: string;
  verdikt: string;
  /**
   * Kto alebo čo za číslom stojí — mená a dátumy, z ktorých vzniklo.
   *
   * Bez tohto je metrika neoveriteľná očami: keď sa výpočet pokazí, číslo
   * vyzerá normálne a nikto si nevšimne. Google Ads hlásil 299 konverzií
   * mesiace; prišlo sa na to, až keď sa niekto pozrel na mená. Zoznam je
   * tá istá vec, ktorú Lievik ukazuje pri kliku — nie druhý výpočet.
   */
  riadky: { meno: string; vpravo: string }[];
  /** Čo zoznam obsahuje — nadpis nad ním a čitateľ/menovateľ jednou vetou. */
  zoznamNadpis: string;
};

/** Slovný verdikt podľa pásma. Tri pásma, tak ako ich pomenoval Jerry. */
function verdikt(h: Hodnotenie, texty: { dobre: string; priestor: string; zle: string; bezDat: string }): string {
  if (h.bezDat) return texty.bezDat;
  if (h.skore >= 6.5) return texty.dobre;
  if (h.skore >= 4) return texty.priestor;
  return texty.zle;
}

export function MarketingVrch({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [kampane, setKampane] = useState<Kampan[]>([]);
  const [otvorene, setOtvorene] = useState<string | null>(null);
  /** Ktorej metrike je otvorený zoznam ľudí/položiek pod číslom. */
  const [zoznam, setZoznam] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/meta", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kampane?: Kampan[] }) => setKampane(j.kampane || []))
      .catch(() => {});
  }, []);

  const m = useMemo<Metrika[]>(() => {
    const kotva = kotvaDat(data);
    // Bežiaci mesiac von: má napočítanú len časť dopytov a priemer by klamal.
    const mesiace = oknoMesiacov(data, "12m").filter((x) => !kotva.plny || x <= kotva.plny);
    const k = krokyZa(data, clients, mesiace);
    const mes = Math.max(1, mesiace.length);

    const dopytovMes = k.dopyty / mes;
    const hD = hodnot(dopytovMes, DOPYTOV_MESACNE);

    const fmtDen = (d: string) => {
      const [r, mm, dd] = (d || "").slice(0, 10).split("-");
      return dd && mm ? `${Number(dd)}. ${Number(mm)}. ${r}` : d;
    };
    const rDopyty = k.kto.dopyty.map((x) => ({ meno: x.meno, vpravo: `${fmtDen(x.datum)}${x.zdroj ? ` · ${x.zdroj}` : ""}` }));
    const rUvodne = k.kto.uvodne.map((x) => ({ meno: x.meno, vpravo: `úvodný ${fmtDen(x.datum)}` }));
    const rKlienti = k.kto.klienti.map((x) => ({ meno: x.meno, vpravo: `prvý tréning ${fmtDen(x.prvy)}${x.zaplatil ? ` · zaplatil ${fmtDen(x.zaplatil)}` : ""}` }));

    // Konvertujú sa DOPYTY, nie klienti — inak vyjde nad sto percent, lebo
    // klienti z odporúčaní nemajú zapísaný dopyt. Viď krokyZa.
    const konv = k.dopyty > 0 ? (k.zDopytu / k.dopyty) * 100 : null;
    const hK = hodnot(konv, KONVERZIA_DOPYTU);

    // ── cena za dopyt ────────────────────────────────────────────────────────
    //
    // Až do 13. 8. tu bolo `spend / konverzie z Mety` (20 Kč — stiahnutia
    // dokumentu, nie ľudia). Potom výdavok 12 mesiacov ÷ dopyty z reklamy —
    // lenže 15. 10. 2026 to dalo 9 072 Kč, lebo ~20 700 Kč starých boostov sa
    // delilo tromi septembrovými dopytmi. Odvtedy jedna definícia
    // `cenaDopytuZReklamy`: od septembra 2026, bez súdenia (cieľ Jerry
    // zámerne nestanovil). Výdavok za 12 mesiacov ostáva v „Minuté na reklamu".
    const s = suhrnKampani(zlucKampane(kampane.filter((x) => mesiace.includes(x.mesiac))));
    const cd = cenaDopytuZReklamy(kampane, data.leads);
    const neutralne = { skore: 0, slovo: "priemer", bezDat: cd.cena == null } as Hodnotenie;

    // Podporné čísla. Nemajú stupnicu — nie je proti čomu ich merať, ich
    // úloha je vysvetliť tie tri hlavné.
    const bez = { skore: 0, slovo: "priemer", bezDat: true } as Hodnotenie;
    const uvodnych = k.uvodne / mes;
    // Konvertujú sa DOPYTY, nie úvodné — `uvodne / dopyty` vyšlo 121 %,
    // lebo úvodné z odporúčaní nemajú zapísaný dopyt (revízia 20. 8. 2026).
    const naUvodny = k.dopyty > 0 ? (k.zDopytuUvodny / k.dopyty) * 100 : null;

    return [
      {
        kluc: "dopyty",
        nazov: "Dopytov mesačne",
        hodnota: dopytovMes.toFixed(1),
        h: hD,
        smer: "čím viac, tým lepšie · treba 10,5",
        preco: "Vstup lievika. Klientov nemôže pribudnúť viac, než koľko ľudí sa ozve — žiadne zlepšenie textu, ceny ani rýchlosti odpovede to neobíde.",
        verdikt: verdikt(hD, {
          dobre: "Blíži sa to k 10,5 dopytu mesačne, čo je tempo na zaplnenie 18 miest za pol roka.",
          priestor: `Na zaplnenie 18 miest za pol roka treba 10,5 mesačne. Chýba ${Math.max(0, 10.5 - dopytovMes).toFixed(1)} — to je diera, ktorú má zaplniť reklama.`,
          zle: "Takmer sa nikto neozýva. Kým sa to nezmení, na ostatných číslach nezáleží.",
          bezDat: "Zatiaľ nemám dosť mesiacov na priemer.",
        }),
        riadky: rDopyty,
        zoznamNadpis: `Kto sa ozval — ${k.dopyty} dopytov za ${mes} mesiacov`,
      },
      {
        kluc: "konverzia",
        nazov: "Z dopytu klient",
        hodnota: konv == null ? "—" : `${Math.round(konv)} %`,
        h: hK,
        smer: "čím vyššie, tým lepšie · z odporúčaní 70 %",
        preco: "Hovorí, či je problém PRED dverami alebo ZA nimi. Nízka konverzia znamená, že priviesť viac ľudí je liatie vody do deravého vedra; vysoká znamená, že vedro drží a treba doň naliať viac.",
        verdikt: verdikt(hK, {
          dobre: "Vedro drží. Priviesť viac ľudí sa oplatí — to, čo sa s nimi deje potom, funguje.",
          priestor: "Zhruba polovica dopytov sa stratí. Skôr než pridávať rozpočet, oplatí sa vedieť prečo — na to je v Dopytoch stĺpec „dôvod straty“.",
          zle: "Väčšina dopytov sa stráca. Viac reklamy by tú stratu len zdražilo.",
          bezDat: "Zatiaľ nemám dopyty, z ktorých by sa dala konverzia počítať.",
        }),
        riadky: rKlienti,
        zoznamNadpis: `Kto zostal a zaplatil — ${k.zDopytu} z ${k.dopyty} dopytov (menovateľ je zoznam pri „Dopytov mesačne“)`,
      },
      {
        kluc: "cena",
        nazov: "Cena za dopyt",
        hodnota: cd.cena == null ? "—" : fmtCZK(cd.cena),
        h: neutralne,
        farba: cd.cena == null ? undefined : C.text,
        smer: `od septembra 2026 · ${cd.dopyty.length} ${cd.dopyty.length === 1 ? "dopyt" : cd.dopyty.length > 1 && cd.dopyty.length < 5 ? "dopyty" : "dopytov"} z reklamy · cieľ zatiaľ nie je`,
        preco: "Koľko stojí jeden človek, ktorý sa ozval z reklamy. Počíta sa od septembra 2026 — vtedy reklama prvýkrát žiadala o dopyt (stránka s formulárom od 8. 9., odkazy s UTM od 14. 9.). Staršie kampane kupovali dosah a interakcie; ich výdavok je v „Minuté na reklamu“ a do tejto ceny nepatrí.",
        verdikt: cd.cena == null
          ? `Od septembra ${fmtCZK(cd.spend)} a zatiaľ žiadny dopyt z reklamy.`
          : `${fmtCZK(cd.spend)} od 1. 9. 2026 ÷ ${cd.dopyty.length} dopytov z reklamy, vrátane bežiaceho mesiaca.`
            + (cd.bezUtm ? ` ${cd.bezUtm} z nich nemá v odkaze UTM — zdroj „reklama“ je zapísaný ručne.` : "")
            + " Cieľovú cenu si zatiaľ zámerne nestanovil (15. 10. 2026: teraz je dobrý každý dopyt, reklamy sa ladia), preto číslo nesúdi.",
        riadky: cd.dopyty.map((l) => ({ meno: l.name || l.email || "(bez mena)", vpravo: `${fmtDen(l.date)}${l.kampan ? ` · ${l.kampan}` : " · reklama, bez UTM"}` })),
        zoznamNadpis: `Dopyty z reklamy od septembra 2026 — menovateľ ceny (čitateľ je ${fmtCZK(cd.spend)} výdavku za to isté obdobie)`,
      },
      {
        kluc: "uvodne",
        nazov: "Úvodných mesačne",
        hodnota: uvodnych.toFixed(1),
        h: bez,
        smer: "čím viac, tým lepšie",
        preco: "Medzičlánok medzi dopytom a klientom. Keď dopytov pribúda a úvodných nie, problém je v tom, čo sa deje po prvom kontakte — nie v reklame.",
        verdikt: "Porovnaj s dopytmi vedľa: keď je medzi nimi veľká diera, stráca sa to pri dohadovaní termínu.",
        riadky: rUvodne,
        zoznamNadpis: `Kto prišiel na úvodný — ${k.uvodne} ľudí za ${mes} mesiacov`,
      },
      {
        kluc: "naUvodny",
        nazov: "Dopyt → úvodný",
        hodnota: naUvodny == null ? "—" : `${Math.round(naUvodny)} %`,
        h: bez,
        smer: "čím vyššie, tým lepšie",
        preco: "Prvá polovica lievika: koľko zo zapísaných dopytov došlo na úvodný. Toto je číslo, na ktoré má najsilnejší vplyv rýchlosť odpovede — v službách silnejší než cena aj než text reklamy. Úvodné bez dopytu (odporúčania) sem nepatria — tie vidno pri „Úvodných mesačne“.",
        verdikt: "Keď je nízke, odpoveď hľadaj v Dopytoch: stĺpec „ozvali sme sa“ a dôvod straty.",
        riadky: k.kto.naUvodny.map((x) => ({ meno: x.meno, vpravo: `dopyt ${fmtDen(x.dopyt)} → úvodný ${fmtDen(x.uvodny)}` })),
        zoznamNadpis: `Čitateľ: ${k.zDopytuUvodny} dopytov, ktoré došli na úvodný · menovateľ: ${k.dopyty} dopytov (zoznam pri „Dopytov mesačne“)`,
      },
      {
        kluc: "minute",
        nazov: "Minuté na reklamu",
        hodnota: fmtCZK(s.spend),
        h: bez,
        smer: "samo o sebe ani dobré, ani zlé",
        preco: "Bez ceny za dopyt vedľa je to len výdavok. Spolu s ňou je to jediná dvojica, z ktorej sa dá rozhodnúť o rozpočte.",
        verdikt: s.podielNaDopyt < 20
          ? `Z toho išlo na kampane, ktoré vôbec pýtali dopyt, len ${Math.round(s.podielNaDopyt)} %. Zvyšok kupoval videnia a interakcie.`
          : `Na dopyt bolo namierených ${Math.round(s.podielNaDopyt)} % z toho.`,
        riadky: zlucKampane(kampane.filter((x) => mesiace.includes(x.mesiac)))
          .slice().sort((a, b) => b.spend - a.spend)
          .map((x) => ({ meno: x.nazov, vpravo: fmtCZK(x.spend) })),
        zoznamNadpis: `Kampane z Mety za ${mes} mesiacov, zoradené podľa výdavku`,
      },
    ];
  }, [data, clients, kampane]);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Info
          label="Na čom to stojí"
          text="Čísla, ktoré rozhodujú o marketingu. Prvé tri sú tie, na ktorých všetko stojí; za nimi vpravo sú podporné, ktoré vysvetľujú, prečo tie tri vyzerajú tak, ako vyzerajú — posuň sa k nim. Klik na trojuholník otvorí, prečo to sledujeme a ako to práve teraz stojí. Hranice nie sú z odvetvových priemerov, sú z tvojich vlastných čísel a z marketingového plánu: 10,5 dopytu mesačne na zaplnenie 18 miest za pol roka. Cena za dopyt sa nesúdi, kým si nestanovíš cieľ, a počíta sa od septembra 2026, keď reklama prvýkrát žiadala o dopyt. Ostatné sa počítajú z plných mesiacov — bežiaci mesiac má napočítanú polovicu a priemer by stiahol nadol."
        />
        <span style={{ fontSize: 11.5, color: C.textDim }}>posledných 12 plných mesiacov · posuň doprava, je toho viac</span>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
        {m.map((x) => {
          const farba = x.farba ?? (x.h.bezDat ? C.textDim : farbaCeny(x.h.skore));
          const je = otvorene === x.kluc;
          return (
            <div key={x.kluc} style={{
              flex: "0 0 auto", width: 236, padding: "12px 13px", borderRadius: 9,
              background: mix(farba, 7), alignSelf: "flex-start",
            }}>
              {/* Číslo je tlačidlo: otvorí mená, z ktorých vzniklo. Metrika,
                  pod ktorú sa nedá kliknúť, je nebezpečná aj keď je správna —
                  nikto si nevšimne, keď sa pokazí (revízia 19. 8. 2026). */}
              <button
                onClick={() => setZoznam(zoznam === x.kluc ? null : x.kluc)}
                title={x.riadky.length ? `Ukázať, z čoho číslo vzniklo (${x.riadky.length})` : "Za týmto číslom zatiaľ nie je žiadny riadok"}
                style={{
                  display: "flex", alignItems: "baseline", gap: 6, padding: 0, background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}>
                <span style={{ fontSize: 25, fontWeight: 800, color: farba, fontVariantNumeric: "tabular-nums" }}>{x.hodnota}</span>
                <span style={{ fontSize: 10.5, color: C.textDim }}>{zoznam === x.kluc ? "▾" : "▸"} {x.riadky.length}</span>
              </button>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 3 }}>{x.nazov}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{x.smer}</div>
              {x.beziaci && (
                <div style={{ fontSize: 11, color: C.accentLight, marginTop: 3, lineHeight: 1.45 }}>{x.beziaci}</div>
              )}

              <button
                onClick={() => setOtvorene(je ? null : x.kluc)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, marginTop: 8, padding: 0,
                  background: "none", border: "none", cursor: "pointer",
                  color: C.textMuted, fontSize: 11.5, fontFamily: "inherit",
                }}>
                <span style={{ fontSize: 9, display: "inline-block", transform: je ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▶</span>
                {je ? "skryť" : "čo to znamená"}
              </button>

              {je && (
                <>
                  <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.55, marginTop: 8 }}>
                    <b style={{ color: C.textDim }}>Prečo to sledujeme: </b>{x.preco}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.55, marginTop: 7, paddingTop: 7, borderTop: `1px solid ${mix(C.textDim, 22)}` }}>
                    {x.verdikt}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {zoznam && (() => {
        const x = m.find((y) => y.kluc === zoznam);
        if (!x) return null;
        return (
          <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 9, background: mix(C.text, 4), border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.textMuted }}>
                {x.zoznamNadpis}
              </span>
              <button onClick={() => setZoznam(null)}
                style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>zavrieť</button>
            </div>
            {x.riadky.length === 0 ? (
              <div style={{ fontSize: 12, color: C.textDim }}>Za týmto číslom nie je ani jeden riadok — presne preto je „—“ alebo nula.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 320, overflowY: "auto" }}>
                {x.riadky.map((r, i) => (
                  <div key={`${r.meno}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                    <span style={{ color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meno}</span>
                    <span style={{ color: C.textDim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.vpravo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </Card>
  );
}
