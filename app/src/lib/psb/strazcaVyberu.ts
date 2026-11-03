/**
 * Strážca výberov (Peniaze manažér, 26. 10. 2026): ozve sa Jerrymu na telefón,
 * keď si v bežiacom mesiaci z firmy vybral viac, než je jeho nárok za CELÝ
 * mesiac pri dnešnom tempe hodín.
 *
 * Čerpanie = „Jerry vyplata" (prevody aj platby kartou z Fio) + polovica
 * Spoločných — to isté, čo Kokpit volá „poslané" pri dlhu trénera.
 *
 * Nárok bežiaceho mesiaca sa odhaduje TEMPOM (hodiny doteraz / dni × dni
 * mesiaca). Prvý týždeň je tempo z pár dní nezmysel (jeden voľný deň ho zrazí
 * o tretinu), preto sa vtedy berie nárok predošlého mesiaca.
 *
 * Neozýva sa každý deň: raz za mesiac pri prekročení a potom až pri ďalších
 * 5 000 Kč nad nárokom. Inak by sa stal riadkom, ktorý sa odklikne bez čítania.
 */
export const KROK_CZK = 5000;
export const PRVY_TYZDEN_DNI = 7;

export type ModelNaroku = { fix: number; prah: number; sadzba: number };
export type PohybFio = { date: string; suma: number; kat: string };
export type StavStrazcu = { mesiac: string; prah: number } | null;

/** Suma ide so znamienkom: príchodzie vrátenie s tou istou kategóriou
 *  („Chata vratenie" +11 000, 20. 10. 2026) čerpanie zníži — rovnako
 *  ako v J&T Výplatách (`jeVratenieVydavku`). */
export function cerpanieMesiaca(pohyby: PohybFio[], mesiac: string): number {
  let s = 0;
  for (const p of pohyby) {
    if (!p.date.startsWith(mesiac)) continue;
    if (p.kat === "vyplaty.jerry") s += -p.suma;
    // spoločné a výplaty bez mena/delené: Jerryho je polovica (ako v dlhu trénera)
    else if (p.kat.startsWith("spolocne.") || p.kat === "vyplaty" || p.kat === "vyplaty.delene") s += -p.suma / 2;
  }
  return Math.round(s);
}

export function narokPodlaTempa(
  model: ModelNaroku,
  hodinyDoteraz: number,
  den: number,
  dniVMesiaci: number,
  narokMinulehoMesiaca: number | null,
): { narok: number; podlaTempa: boolean; hodinyZaMesiac: number } {
  if (den <= PRVY_TYZDEN_DNI && narokMinulehoMesiaca) {
    return { narok: Math.round(narokMinulehoMesiaca), podlaTempa: false, hodinyZaMesiac: 0 };
  }
  const h = (hodinyDoteraz / Math.max(1, den)) * dniVMesiaci;
  return { narok: Math.round(model.fix + (h - model.prah) * model.sadzba), podlaTempa: true, hodinyZaMesiac: h };
}

export function rozhodni(
  mesiac: string,
  cerpanie: number,
  narok: { narok: number; podlaTempa: boolean; hodinyZaMesiac: number },
  posledny: StavStrazcu,
): { poslat: false } | { poslat: true; prah: number; titulok: string; text: string } {
  const nad = cerpanie - narok.narok;
  if (nad <= 0) return { poslat: false };
  const prah = Math.floor(nad / KROK_CZK) + 1;
  if (posledny && posledny.mesiac === mesiac && posledny.prah >= prah) return { poslat: false };
  const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
  const ako = narok.podlaTempa
    ? `nárok pri tomto tempe (~${Math.round(narok.hodinyZaMesiac)} h) ≈ ${kc(narok.narok)}`
    : `nárok minulého mesiaca bol ${kc(narok.narok)}`;
  return {
    poslat: true,
    prah,
    titulok: "Výber nad nárok",
    text: `Tento mesiac je z firmy vybraných ${kc(cerpanie)}, ${ako} — o ${kc(nad)} viac.`,
  };
}

/**
 * LIMIT CELÉHO MESIACA NAMIESTO ZÁLOHY (Jerry 2. 11. 2026): čerpá postupne, nie
 * jednou výplatou 3., takže výber po 5. nie je „záloha nad dohodu“. V takom
 * mesiaci sa stráži všetko čerpanie proti tomu, čo mu v ňom patrí: doplatok
 * za október 22 630 − nechané vo firme 7 124 + strop 30 000 (číslo z uzávierky
 * Kasičky, prepojené nie je: po jej zmene treba prepísať aj tu).
 * Od decembra sa stráži čerpanie proti nároku pri dnešnom tempe, ako pred
 * novembrom: postupné čerpanie je dohodnuté s Terezkou (Jerry 2. 11. 2026),
 * strop zálohy 20 000 / 10 000 / 0 tým padol.
 */
export const LIMIT_MESIACA: Record<string, number> = { "2026-11": 45506 };

export function limitMesiaca(mesiac: string): number | null {
  return LIMIT_MESIACA[mesiac] ?? null;
}

export function rozhodniLimit(
  mesiac: string,
  cerpanie: number,
  limit: number,
  posledny: StavStrazcu,
): { poslat: false } | { poslat: true; prah: number; titulok: string; text: string } {
  const nad = cerpanie - limit;
  if (nad <= 0) return { poslat: false };
  const prah = Math.floor(nad / KROK_CZK) + 1;
  if (posledny && posledny.mesiac === mesiac && posledny.prah >= prah) return { poslat: false };
  const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/\s/g, " ")} Kč`;
  return {
    poslat: true,
    prah,
    titulok: "Výber nad limit mesiaca",
    text: `Tento mesiac je vybraných ${kc(cerpanie)}, limit je ${kc(limit)} — o ${kc(nad)} viac.`,
  };
}
