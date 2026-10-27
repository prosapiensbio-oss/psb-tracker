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
    text: `Tento mesiac si z firmy vybral ${kc(cerpanie)}, ${ako} — o ${kc(nad)} viac.`,
  };
}

/**
 * ZÁLOHY PO PRECHODE NA VÝPLATU 3. (výplatný model A, 26. 10. 2026).
 *
 * Od novembra 2026 chodí výplata 3. v mesiaci za PREDOŠLÝ mesiac; počas
 * mesiaca sa smie vybrať len záloha so stropom, ktorý postupne klesá
 * (november 30 000, december 20 000, január 10 000, od februára 0).
 * Výplata za minulý mesiac (1. – 5. deň) sa do zálohy nepočíta a polovica
 * spoločných tiež nie — tie idú z firmy ako doteraz.
 */
export const ZALOHY_OD = "2026-11";
export const STROP_ZALOHY: Record<string, number> = { "2026-11": 30000, "2026-12": 20000, "2027-01": 10000 };
export const VYPLATA_DO_DNA = 5;

export function stropZalohy(mesiac: string): number | null {
  if (mesiac < ZALOHY_OD) return null;
  return STROP_ZALOHY[mesiac] ?? 0;
}

/** Osobné výbery počas mesiaca okrem výplaty za minulý mesiac (dni 1–5). */
export function zalohyMesiaca(pohyby: PohybFio[], mesiac: string): number {
  let s = 0;
  for (const p of pohyby) {
    if (!p.date.startsWith(mesiac) || p.kat !== "vyplaty.jerry") continue;
    if (Number(p.date.slice(8, 10)) <= VYPLATA_DO_DNA) continue;
    s += -p.suma;
  }
  return Math.round(s);
}

export function rozhodniZalohu(
  mesiac: string,
  zalohy: number,
  strop: number,
  posledny: StavStrazcu,
): { poslat: false } | { poslat: true; prah: number; titulok: string; text: string } {
  const nad = zalohy - strop;
  if (nad <= 0) return { poslat: false };
  const prah = Math.floor(nad / KROK_CZK) + 1;
  if (posledny && posledny.mesiac === mesiac && posledny.prah >= prah) return { poslat: false };
  const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
  return {
    poslat: true,
    prah,
    titulok: "Záloha nad dohodu",
    text: strop > 0
      ? `Počas mesiaca si si vybral ${kc(zalohy)}, dohodnutý strop zálohy je ${kc(strop)} — o ${kc(nad)} viac. Zvyšok výplaty príde 3.`
      : `Počas mesiaca si si vybral ${kc(zalohy)} mimo výplaty 3. Podľa dohody sa výber nad nárok robí len po dohode s Terezkou.`,
  };
}
