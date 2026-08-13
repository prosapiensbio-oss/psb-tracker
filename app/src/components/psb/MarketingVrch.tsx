import { useEffect, useMemo, useState } from "react";

import { kotvaDat, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK } from "../../lib/psb/format";
import { CENA_ZA_DOPYT, DOPYTOV_MESACNE, KONVERZIA_DOPYTU, hodnot, type Hodnotenie } from "../../lib/psb/hodnotenie";
import { suhrnKampani, zlucKampane, type Kampan } from "../../lib/psb/kampane";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Info } from "./ui";
import { farbaCeny } from "./Kampane";
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

/** Claude Project, ktorý z Jarvisovho zadania vyrába captiony a scenáre. */
const CLAUDE_PROJECT = "https://claude.ai/cowork/project/019cce4d-b3a1-7147-bbbb-15dbb2aa0008";

type Metrika = {
  kluc: string;
  nazov: string;
  hodnota: string;
  h: Hodnotenie;
  /** Jednoriadkový smer: kam sa má číslo hýbať a kde je méta. */
  smer: string;
  preco: string;
  verdikt: string;
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

    const konv = k.dopyty > 0 ? (k.klienti / k.dopyty) * 100 : null;
    const hK = hodnot(konv, KONVERZIA_DOPYTU);

    const s = suhrnKampani(zlucKampane(kampane));
    const hC = hodnot(s.cena, CENA_ZA_DOPYT);

    // Podporné čísla. Nemajú stupnicu — nie je proti čomu ich merať, ich
    // úloha je vysvetliť tie tri hlavné.
    const bez = { skore: 0, slovo: "priemer", bezDat: true } as Hodnotenie;
    const uvodnych = k.uvodne / mes;
    const naUvodny = k.dopyty > 0 ? (k.uvodne / k.dopyty) * 100 : null;

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
      },
      {
        kluc: "cena",
        nazov: "Cena za dopyt",
        hodnota: s.cena == null ? "—" : fmtCZK(s.cena),
        h: hC,
        smer: "čím nižšia, tým lepšia · strop 2 200 Kč",
        preco: "Bez tohto čísla je rozpočet stávka, nie nákup. S ním sa dá povedať vetu, ktorá dnes povedať nejde: „keď mi odíde osem ľudí, za X korún si objednám dvadsať dopytov.“",
        verdikt: verdikt(hC, {
          dobre: "Pod stropom aj u klientov, čo pôjdu k Terezke. Toto sa oplatí zopakovať vo väčšom.",
          priestor: "Nad cieľom 1 000 Kč, ale pod stropom 2 200 Kč. Vráti sa to, len pomaly.",
          zle: "Nad stropom 2 200 Kč — klient, ktorý pôjde k Terezke, sa z toho nezaplatí.",
          bezDat: kampane.length === 0
            ? "Ešte som z Mety nestiahol kampane."
            : "Reklama za 19 mesiacov o dopyt nikdy nepožiadala — všetky kampane kupovali dosah, prekliky a interakcie. Toto číslo vznikne až pri prvej kampani s cieľom „dopyt“.",
        }),
      },
      {
        kluc: "uvodne",
        nazov: "Úvodných mesačne",
        hodnota: uvodnych.toFixed(1),
        h: bez,
        smer: "čím viac, tým lepšie",
        preco: "Medzičlánok medzi dopytom a klientom. Keď dopytov pribúda a úvodných nie, problém je v tom, čo sa deje po prvom kontakte — nie v reklame.",
        verdikt: "Porovnaj s dopytmi vedľa: keď je medzi nimi veľká diera, stráca sa to pri dohadovaní termínu.",
      },
      {
        kluc: "naUvodny",
        nazov: "Dopyt → úvodný",
        hodnota: naUvodny == null ? "—" : `${Math.round(naUvodny)} %`,
        h: bez,
        smer: "čím vyššie, tým lepšie",
        preco: "Prvá polovica lievika. Toto je číslo, na ktoré má najsilnejší vplyv rýchlosť odpovede — v službách silnejší než cena aj než text reklamy.",
        verdikt: "Keď je nízke, odpoveď hľadaj v Dopytoch: stĺpec „ozvali sme sa“ a dôvod straty.",
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
      },
    ];
  }, [data, clients, kampane]);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Info
          label="Na čom to stojí"
          text="Čísla, ktoré rozhodujú o marketingu. Prvé tri sú tie, na ktorých všetko stojí; za nimi vpravo sú podporné, ktoré vysvetľujú, prečo tie tri vyzerajú tak, ako vyzerajú — posuň sa k nim. Klik na trojuholník otvorí, prečo to sledujeme a ako to práve teraz stojí. Hranice nie sú z odvetvových priemerov, sú z tvojich vlastných čísel a z marketingového plánu: strop 2 200 Kč za dopyt u Terezkiných klientov, cieľ pod 1 000 Kč, 10,5 dopytu mesačne na zaplnenie 18 miest za pol roka. Počíta sa len z plných mesiacov — bežiaci mesiac má napočítanú polovicu a priemer by stiahol nadol."
        />
        <span style={{ fontSize: 11.5, color: C.textDim }}>posledných 12 plných mesiacov · posuň doprava, je toho viac</span>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
        {m.map((x) => {
          const farba = x.h.bezDat ? C.textDim : farbaCeny(x.h.skore);
          const je = otvorene === x.kluc;
          return (
            <div key={x.kluc} style={{
              flex: "0 0 auto", width: 236, padding: "12px 13px", borderRadius: 9,
              background: mix(farba, 7), alignSelf: "flex-start",
            }}>
              <div style={{ fontSize: 25, fontWeight: 800, color: farba, fontVariantNumeric: "tabular-nums" }}>
                {x.hodnota}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 3 }}>{x.nazov}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{x.smer}</div>

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
    </Card>
  );
}
