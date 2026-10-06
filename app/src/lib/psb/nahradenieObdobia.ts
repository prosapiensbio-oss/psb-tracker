/**
 * IMPORT SESSIONS NAHRÁDZA OBDOBIE, KTORÉ SÚBOR POKRÝVA.
 *
 * Do 29. 9. 2026 import len pridával (`INSERT OR IGNORE`). Jerry v PTminderi
 * nemaže — ale OPRAVUJE: prepíše klienta alebo čas. Pre Kokpit je opravený
 * tréning nový riadok (kľúč je dátum|čas|klient|tréner) a ten starý zostal.
 * Ten istý tréning tak stál v Kokpite dvakrát, raz na zlom mene:
 *
 *   17. 9. 15:00  Kokpit: Lenka Přínosilová · PTminder aj kalendár: Maty
 *    5. 8. 17:00  Kokpit: Michal Knapčok     · kalendár: Katka M.
 *
 * Lenke a Knapčokovi to uberalo hodinu, ktorú nemali.
 *
 * Preto: čo v Kokpite je, ale v súbore za to isté obdobie nie, zmizne. Tri
 * poistky, lebo je to mazanie:
 *
 *  1. **Len v rozsahu súboru** — od prvého po posledný deň, ktorý v ňom je.
 *     Export do 27. 9. nezmaže nič z 28. 9.
 *  2. **Len tréneri zo súboru** — export len za Jerryho nezmaže Terezku.
 *  3. **Nikdy v zamknutom mesiaci** — uzávierka sa nemení importom.
 *
 * A štvrtá, pre prípad, že sa niečo pokazí inde: keď by sa malo zmazať viac
 * než pätina toho, čo v rozsahu je, nezmaže sa NIČ a povie sa to. To nie je
 * oprava pár preklepov — to je iný tvar exportu alebo zlý súbor.
 */

export type RiadokVSubore = { date: string; sessionTrainer: string; kluc: string };
export type RiadokVKokpite = { id: string; date: string; time: string; client_name: string; session_trainer: string; dedup_key: string };

export type Nahradenie = {
  /** Riadky, ktoré z Kokpitu zmiznú. */
  odstranit: RiadokVKokpite[];
  /** Rozsah súboru (ISO dni) — `null`, keď je súbor prázdny. */
  od: string | null;
  do: string | null;
  /** Nastavené, keď poistka zastavila mazanie — dôvod pre hlášku. */
  zastavene?: string;
};

const den = (s: string) => String(s || "").slice(0, 10);

/** Podiel, nad ktorým sa mazanie zastaví. */
export const MAX_PODIEL_MAZANIA = 0.2;

export function nahradenieObdobia(
  subor: RiadokVSubore[],
  kokpit: RiadokVKokpite[],
  jeZamknuty: (isoDen: string) => boolean,
  /** Čo sa nahrádza — do hlášky poistky („tréningov", „služieb"). */
  coto = "tréningov",
): Nahradenie {
  if (!subor.length) return { odstranit: [], od: null, do: null };
  const dni = subor.map((r) => den(r.date)).filter(Boolean).sort();
  const od = dni[0], do_ = dni[dni.length - 1];
  const treneri = new Set(subor.map((r) => r.sessionTrainer));
  const kluce = new Set(subor.map((r) => r.kluc));

  const vRozsahu = kokpit.filter((r) => {
    const d = den(r.date);
    return d >= od && d <= do_ && treneri.has(r.session_trainer) && !jeZamknuty(d);
  });
  const odstranit = vRozsahu.filter((r) => !kluce.has(r.dedup_key));

  // Pri malom počte je pätina príliš prísna (jeden opravený tréning z troch
  // by zastavil import) — preto aspoň 10.
  const strop = Math.max(10, Math.floor(vRozsahu.length * MAX_PODIEL_MAZANIA));
  if (odstranit.length > strop) {
    return {
      odstranit: [], od, do: do_,
      zastavene: `import by zmazal ${odstranit.length} z ${vRozsahu.length} ${coto} v tom období — to nie sú opravy, to vyzerá na iný tvar exportu. Nezmazal som nič.`,
    };
  }
  return { odstranit, od, do: do_ };
}
