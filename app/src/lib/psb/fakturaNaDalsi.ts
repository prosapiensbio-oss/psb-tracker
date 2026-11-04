import { CENNIK, platnostDo } from "./cennik";
import { nazovProduktu } from "./nazvyProduktov";

/**
 * FAKTÚRA NA ĎALŠÍ BALÍČEK (Jerry, 4. 11. 2026, Jan Kral).
 *
 * „Baliček mu vzniká prvou hodinou, ale čo keď mu po poslednej hodine chcem
 * poslať faktúru?" Balíček sa vopred nezakladá: vznikol by dlh pred prvou
 * hodinou a presun tréningu by posunul platnosť. Faktúra ide von hneď a čaká,
 * prvý balíček klienta si ju pri vzniku priradí. Bez tej väzby by Kokpit balíček
 * ponúkol vyfakturovať druhýkrát a faktúra by sa nikdy neuhradila sama.
 */

/** Balíčky, na ktoré sa dá fakturovať dopredu: cenník bez doplnenia. */
export const BALICKY_NA_DALSI = CENNIK.filter((s) => (s.hodiny || 0) > 0 && (s.cena || 0) > 0);

export type CakajucaFaktura = { id: string; cislo: string; klient: string; dalsi_nazov: string | null; dalsi_hodiny: number | null; ks: number; cena_czk: number };

/**
 * Berie balíček čakajúcu faktúru? Úvodný, doplnenie a prenesené hodiny nie sú
 * predaj a samostatná hodina popri členstve (Veronika, offline 1 h za 1 450)
 * nie je to, čo sa fakturovalo.
 */
export function balicekBerieFakturu(nazov: string, hodiny: number | null, f: Pick<CakajucaFaktura, "dalsi_hodiny">): boolean {
  if (/doplnen|prenesen|úvodn|uvodn/i.test(nazov)) return false;
  return !(hodiny === 1 && (f.dalsi_hodiny || 0) > 1);
}

/** Balíček podľa faktúry: to, čo klient dostal na doklade, nie „ako naposledy". */
export function balicekZFaktury(f: CakajucaFaktura, od: string): { nazov: string; hodiny: number; cena: number; doDna: string | null } | null {
  if (!f.dalsi_nazov || !f.dalsi_hodiny) return null;
  const s = CENNIK.find((x) => x.nazov === f.dalsi_nazov);
  return {
    nazov: f.dalsi_nazov,
    hodiny: f.dalsi_hodiny,
    cena: Math.round((Number(f.ks) || 1) * (Number(f.cena_czk) || 0)),
    doDna: s ? platnostDo(od, s.tyzdnov, s.mesiacov) || null : null,
  };
}

/**
 * Tréning, ktorým nový balíček vznikne: prvý, na ktorý nezostala hodina, alebo
 * prvý po konci platnosti. Jan Kral: 0 h, platnosť do 8. 11. → Po 9. 11. 15:00.
 */
export function prvyTreningNovehoBalicka(terminy: string[], zostatok: number | null | undefined, platnostDoDna: string | null | undefined): string | null {
  let hodin = Math.max(0, Math.floor(Number(zostatok) || 0));
  for (const t of [...terminy].sort()) {
    if (platnostDoDna && t.slice(0, 10) > platnostDoDna) return t;
    if (hodin <= 0) return t;
    hodin--;
  }
  return null;
}

/**
 * Popis položky: vlastný text z poslednej faktúry ostáva (Jan Kral má pre firmu
 * „Individuální vzdělávací program…"); názov balíčka, doplatok a úvodný nie.
 */
export function popisNaDalsi(poslednePopisy: string[], nazov: string): string {
  const posledny = poslednePopisy.map((p) => p.trim()).find(Boolean) || "";
  const jeBalicek = !posledny || /doplatek|úvodn|uvodn/i.test(posledny) || /\(\d{1,2}\. \d{1,2}\. \d{4}\)$/.test(posledny)
    || CENNIK.some((s) => s.nazov === posledny || s.nazov === nazovProduktu(posledny));
  return jeBalicek ? nazov : posledny;
}

const DNI = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

/** „Po 9. 11. o 15:00" z pražského času. */
export function terminSlovom(t: string): string {
  const d = new Date(`${t.slice(0, 10)}T12:00:00Z`);
  return `${DNI[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}. o ${t.slice(11, 16)}`;
}
