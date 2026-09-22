/**
 * Mená z kalendára a klienti — ktoré je ktoré.
 *
 * PREČO TO NIE JE TRIVIÁLNE
 *
 * V kalendári stoja krstné mená a prezývky („Marketa", „Barborka", „Lucia"),
 * v Trackeri celé mená. Mapovanie `nazov → klient` to riešilo jedno k jednému
 * — a 22. 9. 2026 sa ukázalo, čo to robí, keď to isté meno majú dvaja:
 *
 *   „Marketa" 8:30  = Marketa Resnerová
 *   „Marketa" 11:00 = Marketa Lozias
 *
 * Mapovanie poznalo len jednu, takže šesť Resnerovej tréningov skončilo
 * u Lozias — aj s tempom, dochádzkou a zostatkom balíčka. Krstných mien,
 * ktoré má v PSB viac klientov, je osemnásť (Tomáš štyria, Martin a Jakub
 * traja…), takže to nie je výnimka, ale vzor.
 *
 * Preto: mapovanie smie mať ČAS a appka vie povedať, ktoré meno je
 * nejednoznačné — namiesto toho, aby si ticho vybrala.
 */

export type Mapa = { nazov: string; trener: string; cas: string; klient: string | null; typ: string };

const norm = (s: string) => String(s || "").trim().toLowerCase();

/** Čas udalosti ako 'HH:MM' — z ISO začiatku. */
export function casUdalosti(zaciatok: string): string {
  const m = /T(\d{2}:\d{2})/.exec(String(zaciatok || ""));
  return m ? m[1] : "";
}

/**
 * Ktoré mapovanie platí pre udalosť.
 *
 * Presný čas vyhráva nad všeobecným — inak by „Marketa 8:30 = Resnerová"
 * neprebilo staré „Marketa = Lozias" a oprava by sa nikdy neprejavila.
 */
export function vyberMapu(mapy: Mapa[], nazov: string, trener: string, cas: string): Mapa | null {
  const zhoda = mapy.filter((m) => m.nazov === nazov && m.trener === trener);
  return zhoda.find((m) => m.cas && m.cas === cas) || zhoda.find((m) => !m.cas) || null;
}

/**
 * Mená, ktoré sedia na viacerých klientov.
 *
 * Porovnáva sa krstné meno (prvé slovo názvu) s krstnými menami klientov.
 * „Marketa" nájde Resnerovú aj Lozias; „Marketa R" nenájde nič navyše, lebo
 * druhé slovo už rozlišuje — a presne tak to Terezka niekedy píše.
 */
export function nejednoznacneMena(
  nazvy: string[],
  menaKlientov: string[],
): { nazov: string; kandidati: string[] }[] {
  const podlaKrstneho = new Map<string, string[]>();
  for (const meno of menaKlientov) {
    const krstne = norm(meno).split(/\s+/)[0];
    if (!krstne) continue;
    podlaKrstneho.set(krstne, [...(podlaKrstneho.get(krstne) || []), meno]);
  }
  const von: { nazov: string; kandidati: string[] }[] = [];
  for (const nazov of [...new Set(nazvy)]) {
    const slova = norm(nazov).split(/\s+/).filter(Boolean);
    if (slova.length !== 1) continue;          // „Marketa R" už rozlišuje
    const kandidati = podlaKrstneho.get(slova[0]) || [];
    if (kandidati.length > 1) von.push({ nazov, kandidati });
  }
  return von;
}
