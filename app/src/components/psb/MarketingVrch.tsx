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
 * Tri čísla, ktoré rozhodujú o marketingu — na povrchu, s výkladom.
 *
 * PREČO TO NIE JE ĎALŠÍ VÝKAZ
 *
 * Jerry vyslovil pravidlo, podľa ktorého sa tu meria všetko: číslo bez akcie
 * je zbytočné. Preto pri každom z tých troch nie je len hodnota, ale aj
 * odpoveď na „prečo to sledujeme" a veta o tom, či je to dobré, či je tam
 * priestor, alebo je to zle. Bez tej vety je to tabuľka, z ktorej si každý
 * prečíta, čo chce.
 *
 * PREČO PRÁVE TIETO TRI
 *
 * Sú to tri po sebe idúce otázky, a keď na niektorú z nich neexistuje
 * odpoveď, ďalšie dve sú bezcenné:
 *
 *   1. Koľko ľudí sa ozve?          → vstup. Nič iné ho nenahradí.
 *   2. Koľko z nich zostane?        → hovorí, či je problém pred dverami
 *                                      alebo za nimi.
 *   3. Koľko stojí jeden dopyt?     → bez toho je rozpočet stávka, nie nákup.
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
  preco: string;
  verdikt: string;
};

/** Slovný verdikt podľa skóre. Tri pásma, tak ako ich pomenoval Jerry. */
function verdikt(h: Hodnotenie, texty: { dobre: string; priestor: string; zle: string; bezDat: string }): string {
  if (h.bezDat) return texty.bezDat;
  if (h.skore >= 6.5) return texty.dobre;
  if (h.skore >= 4) return texty.priestor;
  return texty.zle;
}

export function MarketingVrch({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [kampane, setKampane] = useState<Kampan[]>([]);
  useEffect(() => {
    void fetch("/api/meta", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kampane?: Kampan[] }) => setKampane(j.kampane || []))
      .catch(() => {});
  }, []);

  const m = useMemo<Metrika[]>(() => {
    const kotva = kotvaDat(data);
    // Bežiaci mesiac von: má napočítanú len časť dopytov a priemer by klamal.
    const mesiace = oknoMesiacov(data, "12").filter((x) => !kotva.plny || x <= kotva.plny);
    const k = krokyZa(data, clients, mesiace);
    const mes = Math.max(1, mesiace.length);

    const dopytovMes = k.dopyty / mes;
    const hD = hodnot(dopytovMes, DOPYTOV_MESACNE);

    const konv = k.dopyty > 0 ? (k.klienti / k.dopyty) * 100 : null;
    const hK = hodnot(konv, KONVERZIA_DOPYTU);

    // Cena za dopyt sa berie z Mety a len z kampaní, ktoré o dopyt požiadali.
    // Priemer cez všetky kampane by miešal peniaze za dosah do ceny dopytu.
    const s = suhrnKampani(zlucKampane(kampane));
    const hC = hodnot(s.cena, CENA_ZA_DOPYT);

    return [
      {
        kluc: "dopyty",
        nazov: "Dopytov mesačne",
        hodnota: dopytovMes.toFixed(1),
        h: hD,
        preco: "Vstup lievika. Klientov nemôže pribudnúť viac, než koľko ľudí sa ozve — žiadne zlepšenie textu, ceny ani rýchlosti odpovede to neobíde.",
        verdikt: verdikt(hD, {
          dobre: `Blíži sa to k ${DOPYTOV_MESACNE[3][0]} dopytom mesačne, čo je tempo na zaplnenie 18 miest za pol roka.`,
          priestor: `Na zaplnenie 18 miest za pol roka treba ${DOPYTOV_MESACNE[3][0]} mesačne. Chýba ${Math.max(0, DOPYTOV_MESACNE[3][0] - dopytovMes).toFixed(1)} — to je diera, ktorú má zaplniť reklama.`,
          zle: "Takmer sa nikto neozýva. Kým sa to nezmení, na ostatných číslach nezáleží.",
          bezDat: "Zatiaľ nemám dosť mesiacov na priemer.",
        }),
      },
      {
        kluc: "konverzia",
        nazov: "Z dopytu klient",
        hodnota: konv == null ? "—" : `${Math.round(konv)} %`,
        h: hK,
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
    ];
  }, [data, clients, kampane]);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Info
          label="Na čom to stojí"
          text="Tri čísla, ktoré rozhodujú o marketingu, s výkladom. Farba čísla a veta pod ním hovoria, či je to dobré, či je tam priestor, alebo je to zle. Hranice nie sú z odvetvových priemerov — sú z tvojich vlastných čísel a z marketingového plánu: strop 2 200 Kč za dopyt u Terezkiných klientov, cieľ pod 1 000 Kč, 10,5 dopytu mesačne na zaplnenie 18 miest za pol roka. Počíta sa len z plných mesiacov — bežiaci mesiac má napočítanú polovicu a priemer by stiahol nadol."
        />
        <span style={{ fontSize: 11.5, color: C.textDim }}>posledných 12 plných mesiacov</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))", gap: 12, marginTop: 12 }}>
        {m.map((x) => (
          <div key={x.kluc} style={{ padding: "12px 13px", borderRadius: 9, background: mix(x.h.bezDat ? C.textDim : farbaCeny(x.h.skore), 7) }}>
            <div style={{ fontSize: 25, fontWeight: 800, color: x.h.bezDat ? C.textDim : farbaCeny(x.h.skore), fontVariantNumeric: "tabular-nums" }}>
              {x.hodnota}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 3 }}>{x.nazov}</div>

            <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.55, marginTop: 8 }}>
              <b style={{ color: C.textDim }}>Prečo to sledujeme: </b>{x.preco}
            </div>
            <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.55, marginTop: 7, paddingTop: 7, borderTop: `1px solid ${mix(C.textDim, 22)}` }}>
              {x.verdikt}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
