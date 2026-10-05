/**
 * SEDENIE, KTORÉ V GOOGLE KALENDÁRI NIE JE.
 *
 * Jerry, 1. 10. 2026: „všetko by malo byť v Google kalendári." Od toho dňa
 * je kalendár pravda o dochádzke a PTminder už len kontrola — takže tento
 * smer je ten NEBEZPEČNÝ. Opačný („v kalendári áno, v PTminderi nie") znamená
 * len to, že kontrola ešte nedobehla; tento znamená, že sa tréning naozaj
 * konal a zdroj pravdy o ňom nevie. Po odchode z PTmindera by zmizol.
 *
 * Appka to dovtedy vedela, ale nepovedala nikomu: porovnanie viselo v karte
 * „Vydrží kalendár sám?" v Kalendári, kam sa nikto nechodí pozerať.
 * Zmerané 1. 10. 2026 za obdobie 10. 8. – 29. 9.: 9 sedení z 348, z toho
 * 5 skutočných klientov.
 *
 * OKNO SI BERIE Z DÁT, NIE Z KONŠTANTY — a stálo ma to jeden zlý deploy.
 *
 * Najprv tu bolo natvrdo 31 dní. Lenže pole udalostí, s ktorým appka pracuje,
 * siaha len **21 dní dozadu** (`okno()` v `api/kalendar.ts`). Sedenia spred
 * 22–31 dní tak nemali s čím sedieť a appka ohlásila ako „chýba v kalendári"
 * desiatky tréningov, ktoré v ňom celý čas sú. Kontrola ostrých dát to
 * zachytila: 33 klientov, niektorí s piatimi otázkami naraz.
 *
 * Je to TÁ ISTÁ chyba, ktorú appka o hodinu skôr opravovala v opačnom smere
 * (695 otázok „konal sa tréning?", z toho 650 mimo pokrytia exportu): keď sa
 * niečo porovnáva so zdrojom, ktorý pokrýva len časť času, musí sa jeho
 * pokrytie ZISTIŤ, nie odhadnúť. Preto sa spodná hranica berie z najstaršej
 * udalosti v poli a strop 31 dní je len poistka, keby okno niekto rozšíril.
 *
 * Prázdne pole udalostí = nevie sa nič a nehlási sa nič. Chýbajúca udalosť
 * nie je dôkaz, že tréning v kalendári nebol.
 */
import { normName } from "./format";
import { dnesPraha } from "./cas";

export type MimoKalendara = { klient: string; datum: string; trener: string | null };

/** Strop okna. Skutočná hranica je najstaršia udalosť v poli, keď je novšia. */
export const OKNO_DNI = 31;

const den = (s: string) => String(s || "").slice(0, 10);
const posun = (d: string, o: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + o * 86400000).toISOString().slice(0, 10);

export function sedeniaMimoKalendara(
  sedenia: { client: string; date: string; sessionTrainer?: string }[],
  udalosti: { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null }[] | undefined,
  dnes: Date = new Date(),
): MimoKalendara[] {
  const dnesDen = dnesPraha(dnes);
  // Bez udalostí sa porovnávať nedá — mlčanie je jediná správna odpoveď.
  if (!udalosti || !udalosti.length) return [];
  // Odkiaľ pole udalostí vôbec siaha. Ďalej než ono sa pýtať nemá zmysel.
  const najstarsia = udalosti.reduce((m, u) => {
    const d = den(u.zaciatok);
    return d && (!m || d < m) ? d : m;
  }, "");
  if (!najstarsia) return [];
  /**
   * O DEŇ ĎALEJ, NEŽ SIAHA POLE — kvôli tolerancii ±1 deň.
   *
   * Sedenie sa porovnáva s udalosťami v okolí ±1 deň (presunutá hodina).
   * Na PRVÝ deň okna sa to oprieť nedá: udalosť z predošlého dňa v poli už
   * nie je, takže sedenie, ktorého hodina sa posunula o deň dozadu, vyzerá
   * ako chýbajúce. Zmerané na živých dátach 1. 10. 2026: bez tohto posunu
   * 15 klientov, s ním 2 — a tie dva sú skutočné.
   */
  const strop = posun(dnesDen, -OKNO_DNI);
  const prvyPlny = posun(najstarsia, 1);
  const odKedy = prvyPlny > strop ? prvyPlny : strop;

  // Tolerancia ±1 deň — presunutá hodina sa nesmie počítať ako chýbajúca.
  // Je to tá istá tolerancia ako v `nepotvrdeneTreningy` a v porovnaní
  // týždňov; vlastná kópia by sa rozišla a dve obrazovky by tvrdili dvoje.
  const vKalendari = new Set<string>();
  for (const u of udalosti || []) {
    if (u.zmizlaAt || !u.klient) continue;
    if (u.typ !== "trening" && u.typ !== "uvodny") continue;
    const d = den(u.zaciatok);
    if (!d) continue;
    for (const o of [-1, 0, 1]) vKalendari.add(`${normName(u.klient)}|${posun(d, o)}`);
  }

  const out: MimoKalendara[] = [];
  const videne = new Set<string>();
  for (const s of sedenia) {
    const d = den(s.date);
    if (!d || !s.client) continue;
    if (d < odKedy || d > dnesDen) continue;
    const kluc = `${normName(s.client)}|${d}`;
    if (vKalendari.has(kluc)) continue;
    if (videne.has(kluc)) continue;
    videne.add(kluc);
    out.push({ klient: s.client, datum: d, trener: s.sessionTrainer || null });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}
