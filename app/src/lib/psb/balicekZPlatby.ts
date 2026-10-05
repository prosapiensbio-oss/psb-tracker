import { CENNIK, platnostDo } from "./cennik";
import { nazovProduktu } from "./nazvyProduktov";

/**
 * KTORÝ BALÍČEK PRIŠLA TÁ PLATBA ZAPLATIŤ.
 *
 * Jerry, 2. 10. 2026: „teoreticky ale dáva zmysel, že keď odošlem SMS, tak
 * v tom momente vznikne to dané nové členstvo?" Nedáva — SMS je ponuka, nie
 * predaj. Keby členstvo vzniklo pri odoslaní, klientovi by sa hneď ukázalo
 * „Zbývá ti 6 h" a QR by zmizlo skôr, než zaplatí; a kto nezaplatí, nechá
 * v appke balíček, ktorý nikdy nebol.
 *
 * Správny okamih je PRÍCHOD PLATBY. Vtedy appka vie, koľko prišlo, a vie
 * to spárovať s tým, čo si klient naposledy kupoval.
 *
 * AKO SA HÁDA (a čo sa nehádа)
 *
 *  1. Sedí suma s cenou JEHO POSLEDNÉHO balíčka? → ten istý balíček.
 *     Je to najsilnejší signál: ľudia si kupujú to isté dokola.
 *  2. Inak sedí suma s niektorou položkou cenníka? → tá.
 *  3. Inak sa NEHÁDA nič. Návrh, ktorý si vymyslí hodiny, je horší než
 *     prázdno — balíček sa zapíše ručne.
 *
 * Nič sa nezapisuje samo: funkcia vracia NÁVRH, ktorý človek odklikne.
 */
export type NavrhBalicka = {
  nazov: string;
  hodiny: number | null;
  cena: number;
  platnostOd: string;
  platnostDo: string | null;
  /** Prečo to appka navrhuje — ide to na obrazovku, nie do dát. */
  preco: string;
};

export function balicekZPlatby(v: {
  suma: number;
  den: string;
  /** Balíčky klienta — stačí názov, cena a deň; berie sa najnovší. */
  balicky: { nazov: string; cena_czk: number | null; platnost_od: string; zrusene_at?: string | null }[];
}): NavrhBalicka | null {
  const suma = Math.round(v.suma);
  if (suma <= 0) return null;

  const posledny = v.balicky
    .filter((b) => !b.zrusene_at && (b.cena_czk || 0) > 0)
    .sort((a, b) => b.platnost_od.localeCompare(a.platnost_od))[0];

  // 1 · to isté, čo si kupoval naposledy
  if (posledny && Math.round(posledny.cena_czk || 0) === suma) {
    const nazov = nazovProduktu(posledny.nazov);
    const zCennika = CENNIK.find((s) => s.nazov === nazov);
    return {
      nazov,
      hodiny: zCennika?.hodiny ?? null,
      cena: suma,
      platnostOd: v.den,
      platnostDo: (zCennika && platnostDo(v.den, zCennika.tyzdnov, zCennika.mesiacov)) || null,
      preco: "to isté, čo si kúpil naposledy",
    };
  }

  // 2 · sedí s cenníkom
  const zCennika = CENNIK.filter((s) => s.cena != null && Math.round(s.cena) === suma);
  // Dve položky za rovnakú cenu by znamenali hádanie — radšej nič.
  if (zCennika.length === 1) {
    const s = zCennika[0];
    return {
      nazov: s.nazov, hodiny: s.hodiny ?? null, cena: suma,
      platnostOd: v.den, platnostDo: platnostDo(v.den, s.tyzdnov, s.mesiacov) || null,
      preco: "suma sedí s cenníkom",
    };
  }

  // 3 · nehádа sa
  return null;
}
