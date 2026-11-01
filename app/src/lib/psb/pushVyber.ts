import { casOdpovede } from "./compute";
import { dnesPraha } from "./cas";

/**
 * ČO SA MÁ POSLAŤ NA TELEFÓN (rozbor kokpitu, 1. 11. 2026).
 *
 * `push_poslane` strážilo len kľúč: raz poslaná položka mlčala 60 dní, aj keď
 * sa medzitým vrátila na obrazovku. Dve také cesty späť a obe sú zámerné
 * (pravidlo „Vybavené platí na to, čo bolo"):
 *
 *  1. `platneOd` — v položke pribudlo niečo nové po poslednom odoslaní
 *     (ďalší tréning bez balíčka, prechod do mínusu po novom balíčku).
 *  2. Uplynulé odloženie — človek si vec odložil na dátum a ten prišiel.
 *
 * Proti opakovanému zvoneniu stoja tri veci: porovnáva sa s časom posledného
 * odoslania, takže po znovuposlaní je položka zase „videná"; `platneOd`
 * z budúcnosti sa nepočíta (inak by bol stále novší než posledné odoslanie);
 * a ten istý kľúč znovu najskôr po `ROZOSTUP_HODIN`, nech zvoní najviac raz
 * denne aj vtedy, keď sa v položke niečo mení každú chvíľu.
 */
export const ROZOSTUP_HODIN = 20;

type Polozka = { key: string; platneOd?: string; vratene?: boolean };
type Ack = Record<string, { note?: string } | undefined>;

export function maIstNaTelefon(
  r: Polozka,
  /** Kľúč → kedy naposledy odišiel (ISO, UTC) — z `push_poslane`. */
  poslane: Map<string, string>,
  ack: Ack,
  teraz: Date = new Date(),
): boolean {
  const kedy = poslane.get(r.key);
  const odoslane = kedy ? Date.parse(kedy) : NaN;
  // Nikdy neodišla (alebo sa čas nedá prečítať — radšej raz navyše než nikdy).
  if (!Number.isFinite(odoslane)) return true;
  if (teraz.getTime() - odoslane < ROZOSTUP_HODIN * 3600000) return false;

  const casKedy = casOdpovede(kedy);
  if (r.platneOd) {
    const od = casOdpovede(r.platneOd);
    if (od > casKedy && od <= casOdpovede(teraz.toISOString())) return true;
  }
  if (r.vratene) {
    // Vrátila sa v deň odloženia; odoslané pred tým dňom = človek ju odvtedy nevidel.
    const den = /^odlozene\|(\d{4}-\d{2}-\d{2})/.exec(ack[r.key]?.note || "")?.[1];
    if (den && dnesPraha(new Date(odoslane)) < den) return true;
  }
  return false;
}
