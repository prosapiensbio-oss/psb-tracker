/**
 * ZHRNUTIE ANAMNÉZY — to, čo sa zmestí na kartu klienta.
 *
 * Jerry, 30. 9. 2026: „v profile klienta bude len nejaké zhrnutie anamnézy
 * s možnosťou kliku priamo do nej." Celý formulár má tridsať otázok a na
 * karte klienta, kde sa rieši balíček a platba, by z neho bola stena textu.
 *
 * Zhrnutie je preto výber toho, čo musí byť vidieť BEZ otvárania:
 * čo človeka privádza, kde ho to bolí a ako silno, a červené vlajky —
 * teda presne to, kvôli čomu sa anamnéza vypĺňa pred tréningom.
 *
 * Funkcia je čistá (žiadne dáta z DB, žiadne šifrovanie) a má testy:
 * riadky na karte klienta sú to jediné, čo si Jerry prečíta pred hodinou,
 * a nesmú sa rozísť s tým, čo je vo formulári.
 */

export type RiadokZhrnutia = {
  /** Krátky nápis vľavo. */
  popis: string;
  /** Hodnota. Prázdna sa nikdy nevracia — riadok bez obsahu sa vynechá. */
  hodnota: string;
  /** `true` = zdravotné riziko, obrazovka to má zvýrazniť. */
  vlajka?: boolean;
};

type Oblast = { oblast: string; sila: number | null };

const jeOblasti = (x: unknown): x is Oblast[] =>
  Array.isArray(x) && x.every((o) => !!o && typeof o === "object" && "oblast" in (o as object));

const text = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const pole = (x: unknown): string[] => (Array.isArray(x) ? x.map((v) => String(v).trim()).filter(Boolean) : []);

/**
 * Vlajky bez „nic z toho" — klient ju zaškrtáva ako odpoveď „nič", takže
 * v zhrnutí by z nej bolo varovanie o tom, že nie je čo varovať.
 */
export const vlajkyBezNicoho = (x: unknown): string[] => pole(x).filter((v) => v !== "nic z toho");

export function zhrnutieAnamnezy(
  klient: Record<string, unknown>,
  zapis: Record<string, unknown>,
): RiadokZhrnutia[] {
  const out: RiadokZhrnutia[] = [];
  const berTo = (...kluce: string[]): unknown => {
    // Zápis trénera prebíja — je novší a videl človeka naživo.
    for (const k of kluce) if (zapis[k] != null && zapis[k] !== "") return zapis[k];
    for (const k of kluce) if (klient[k] != null && klient[k] !== "") return klient[k];
    return null;
  };

  /**
   * „Jiné" samo nič nehovorí — v súhrne stojí namiesto neho to, čo tréner
   * dopísal (`<otázka>_jine`, pri varovných príznakoch `vlajky_popis`).
   */
  const sJinym = (hodnoty: string[], jine: string): string[] =>
    hodnoty.flatMap((h) => (h === "Jiné" ? (jine ? [jine] : ["iné"]) : [h]));

  const privadza = sJinym([text(berTo("privadza"))].filter(Boolean), text(berTo("privadza_jine")))[0] || "";
  if (privadza) out.push({ popis: "privádza ho", hodnota: privadza });

  const obtiz = text(berTo("obtiz"));
  if (obtiz) out.push({ popis: "hlavná obtiaž", hodnota: obtiz });

  const oblasti = berTo("oblasti");
  if (jeOblasti(oblasti) && oblasti.length) {
    out.push({
      popis: "bolesť",
      hodnota: oblasti
        .map((o) => (o.sila == null ? o.oblast : `${o.oblast} ${o.sila}/10`))
        .join(" · "),
    });
  }

  const vlajky = sJinym(vlajkyBezNicoho(berTo("vlajky")), text(berTo("vlajky_popis")));
  if (vlajky.length) out.push({ popis: "pozor", hodnota: vlajky.join(", "), vlajka: true });

  const lieky = text(berTo("lieky"));
  // „ne" je odpoveď, nie údaj — na karte by zaberalo riadok a nič nehovorilo.
  if (lieky && !/^(ne|nie|nic|nič|žádné|zadne)\.?$/i.test(lieky)) {
    out.push({ popis: "lieky a liečba", hodnota: lieky, vlajka: true });
  }

  const zakaz = text(berTo("zakaz"));
  if (zakaz === "Ano") {
    out.push({ popis: "lekár niečo zakázal", hodnota: text(berTo("zakaz_popis")) || "áno — pozri anamnézu", vlajka: true });
  }

  const ciel = sJinym(pole(berTo("ciel")), text(berTo("ciel_jine")));
  if (ciel.length) out.push({ popis: "cieľ", hodnota: ciel.join(", ") });

  const uspech = text(berTo("uspech"));
  if (uspech) out.push({ popis: "úspech po 6 mes.", hodnota: uspech });

  return out;
}

/** Krátka veta o stave — čo ešte chýba, alebo že je hotovo. */
export function stavAnamnezy(v: {
  existuje: boolean;
  klientVyplnilAt: string | null;
  zapisAt: string | null;
}): { text: string; tón: "caka" | "ide" | "hotovo" } {
  if (!v.existuje) return { text: "Anamnéza ešte nie je založená.", tón: "caka" };
  if (v.zapisAt) return { text: "Hotová — klient aj zápis z tréningu.", tón: "hotovo" };
  if (v.klientVyplnilAt) return { text: "Klient vyplnil, zostáva zápis z tréningu.", tón: "ide" };
  return { text: "Čaká na klienta — odkaz je pripravený.", tón: "caka" };
}
