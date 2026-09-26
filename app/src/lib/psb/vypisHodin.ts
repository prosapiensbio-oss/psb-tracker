import type { Udalost } from "./klientOsCasu";

/**
 * VÝPIS HODÍN — čo klient kúpil, čo odtrénoval a koľko mu zostáva.
 *
 * Jerry, 26. 9. 2026: „v profile klienta v záložke všetko chcem vedieť vedľa
 * tréningov aj počty hodín, koľko bolo hodín, keď klient zaplatil, s možnosťou
 * vytvoriť z toho report a poslať to klientovi na kontrolu."
 *
 * DVE ČÍSLA, LEBO APPKA VIE DVE RÔZNE VECI
 *
 * Odtrénované hodiny appka pozná od prvého dňa — sedenia sú v exporte aj
 * v kalendári. Zostatok balíčka pozná len tam, kde vie aj NÁKUP, a balíčky
 * PTminder exportuje až od marca 2026 (55 zo 120 riadkov má dátum, najstarší
 * 3/2026). Anetka Přinosilová má v appke jediný balíček — z 2. 9. 2026 —
 * hoci chodí od januára 2025 a má za sebou 54 tréningov.
 *
 * Prvá verzia (26. 9.) počítala zostatok od začiatku osi a vyšlo jej −37 h.
 * Druhá zostatok zakotvila pri poslednom balíčku, ale tým zmizli čísla zo
 * zvyšku histórie a filter obdobia prestal čokoľvek meniť. Preto teraz:
 *
 * - **`spolu`** — koľko hodín má klient za sebou. Beží cez celú históriu
 *   a je to tvrdé číslo zo sedení.
 * - **`zostatok`** — koľko mu zostáva z balíčka. Existuje LEN od kotvy
 *   (`zaciatokBalicka`) ďalej; pred ňou je `null`, lebo nákup appka nevidí.
 *   Dopočítaný zostatok by bol výmysel a Jerry ho hovorí klientovi nahlas.
 *
 * HODINA JE HODINA, NIE TRÉNING. Sedenie nesie dĺžku (`duration_min`);
 * 3 698 ich má 60 minút a 11 má deväťdesiat. Tie sa počítajú ako 1,5 h.
 * Tréning z kalendára dĺžku nenesie — berie sa hodina.
 */

export type RiadokVypisu = {
  den: string;
  /** Čo sa stalo, ľudsky. */
  popis: string;
  /** +18 pri balíčku, −1 pri tréningu, 0 pri platbe. */
  zmena: number;
  /** Zostatok balíčka po tomto riadku; `null` tam, kde appka nákup nevidí. */
  zostatok: number | null;
  /** Koľko hodín má klient odtrénovaných vrátane tohto riadku. */
  spolu: number;
  druh: Udalost["druh"];
  /** Tréning, ktorý je zatiaľ len v kalendári — v exporte ešte nie je. */
  zKalendara?: boolean;
  /** Hodiny balíčka sú z názvu, nie z exportu. */
  odvodene?: boolean;
};

export type Vypis = {
  riadky: RiadokVypisu[];
  od: string;
  do: string;
  /** Stav hodín pred začiatkom obdobia (`null`, keď obdobie začína pred kotvou). */
  zaciatok: number | null;
  /** Stav hodín na konci (`null`, keď appka nemá ani jeden balíček). */
  koniec: number | null;
  /** Koľko hodín v období pribudlo, odtrénovalo sa a koľko klient zaplatil. */
  kupene: number;
  odtrenovane: number;
  zaplatene: number;
  /** Odtrénované hodiny za celú históriu, nielen za obdobie. */
  spolu: number;
  /** Deň, od ktorého sa zostatok dá počítať. Prázdne = appka balíček nevidí. */
  kotva: string;
  /** Zostatok nesiaha cez celé obdobie — staršie riadky balíček nepokrýva. */
  neuplny: boolean;
};

/** Dĺžka tréningu v hodinách. Bez údaja je to hodina — tak vyzerá 99,7 % z nich. */
export const hodinTreningu = (u: Udalost): number => {
  if (u.druh !== "trening") return 0;
  const m = u.minut && u.minut > 0 ? u.minut : 60;
  return Math.round((m / 60) * 4) / 4;
};

const zmenaZ = (u: Udalost): number => {
  if (u.druh === "balicekOd") return u.hodin || 0;
  if (u.druh === "trening") return -hodinTreningu(u);
  return 0;
};

/** Dátum pre človeka. Klient v maile nemá čítať ISO. */
const den = (iso: string): string => {
  const [r, m, d] = iso.split("-");
  return r && m && d ? `${Number(d)}. ${Number(m)}. ${r}` : iso;
};

/**
 * Čas v jednom tvare. PTminder dáva „3:00pm", kalendár „15:00" — v jednom
 * výpise vedľa seba to vyzerá ako dva rôzne tréningy.
 */
const cas24 = (c: string): string => {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(c.trim());
  if (!m) return c;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

const suma = (n: number): string => Math.round(n).toLocaleString("sk-SK").replace(/ /g, " ");

/** Hodiny bez zbytočnej nuly: 1 h, 1,5 h. */
export const hod = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "").replace(".", ","));

const METODY: Record<string, string> = { bank: "prevodom", cash: "v hotovosti", card: "kartou" };

const popisZ = (u: Udalost): string => {
  if (u.druh === "balicekOd") return `${u.nazov}${u.hodin ? ` · ${u.odvodene ? "≈" : ""}${u.hodin} h` : ""}${u.doDna ? ` · do ${den(u.doDna)}` : ""}`;
  if (u.druh === "balicekDo") return `koniec platnosti — ${u.nazov}`;
  if (u.druh === "platba") return `platba ${suma(u.suma)} Kč${u.metoda ? ` · ${METODY[u.metoda] || u.metoda}` : ""}`;
  return `tréning${u.cas ? ` ${cas24(u.cas)}` : ""}${u.trener ? ` · ${u.trener}` : ""}`;
};

/**
 * Posledný balíček, ktorý už platí. Berie sa POSLEDNÝ, nie prvý: členstvá sa
 * u nás neskladajú, nové nahrádza dočerpané.
 */
export function poslednyBalicek(os: Udalost[], dnes = new Date().toISOString().slice(0, 10)) {
  let naj: Extract<Udalost, { druh: "balicekOd" }> | null = null;
  for (const u of os) {
    if (u.druh !== "balicekOd" || u.den > dnes) continue;
    if (!naj || u.den > naj.den) naj = u;
  }
  return naj;
}

export function zaciatokBalicka(os: Udalost[], dnes = new Date().toISOString().slice(0, 10)): string {
  return poslednyBalicek(os, dnes)?.den || "";
}

/** Chronologicky od najstaršieho; v rámci dňa tak, ako sa to naozaj stalo. */
const vCase = (os: Udalost[]): Udalost[] => {
  const poradie = { balicekOd: 0, trening: 1, platba: 2, balicekDo: 3 } as const;
  return [...os].sort((a, b) => a.den.localeCompare(b.den) || poradie[a.druh] - poradie[b.druh]);
};

/**
 * ZOSTATOK SA POČÍTA SPÄTNE, OD ČÍSLA, KTORÉ APPKA POZNÁ.
 *
 * Prvý pokus (26. 9. 2026) ho počítal dopredu od balíčka: hodiny z balíčka
 * mínus tréningy. Na ostrých dátach to sedelo len tam, kde má klient jedno
 * členstvo. Pri OBNOVOVANOM členstve export nesie jediný riadok za posledné
 * obdobie, takže Jakubovi Gerichovi („OFF - 6h S viazanosťou", 1 zo 6)
 * vyšlo −30 h a Natálii Pečkovej −3 h. Obe čísla boli nezmysel a obe by
 * Jerry poslal klientovi.
 *
 * Pravda o zostatku je jedno číslo: to, ktoré appka ukazuje na karte klienta
 * (`packageRemaining` — z exportu, z ručnej kotvy alebo dopočítané z názvu).
 * Preto sa od neho ide DOZADU: pred každým tréningom mal klient o hodinu
 * viac. Rad tak vždy končí na čísle, ktoré sedí s PTminderom.
 *
 * Kde sa rad dostane nad hodiny balíčka, počítanie sa ZASTAVÍ — tam už
 * história patrí predošlému obdobiu členstva, o ktorom appka nič nevie.
 * Radšej prázdno než vymyslený riadok.
 */
export function zostatkyOsi(
  os: Udalost[],
  zostatokTeraz: number | null,
  dnes = new Date().toISOString().slice(0, 10),
): { stavy: Map<Udalost, number>; kotva: string; neuplny: boolean } {
  const stavy = new Map<Udalost, number>();
  const bal = poslednyBalicek(os, dnes);
  if (!bal || zostatokTeraz == null) return { stavy, kotva: bal?.den || "", neuplny: false };

  // Export končí posledným sedením, ktoré z neho prišlo. Tréningy po ňom sú
  // z kalendára a appka o nich pri svojom čísle ešte nevedela.
  let denExportu = bal.den;
  for (const u of os) if (u.druh === "trening" && !u.zKalendara && u.den > denExportu) denExportu = u.den;

  const rad = vCase(os).filter((u) => u.den <= dnes);

  // Dopredu: čo sa stalo po exporte. Pod nulu sa nejde — mínusový zostatok
  // neznamená, že klient dlží hodiny, ale že appka ešte nevidí novší
  // balíček (Natália Pečková zaplatila 16. 9. a export je z 20. 9.).
  let neuplny = false;
  let po = zostatokTeraz;
  for (const u of rad) {
    if (u.den <= denExportu) continue;
    if (po + zmenaZ(u) < 0) { neuplny = true; break; }
    po += zmenaZ(u);
    stavy.set(u, po);
  }

  // Dozadu: pred každým tréningom mal klient o hodinu viac.
  let bezi = zostatokTeraz;
  for (let i = rad.length - 1; i >= 0; i--) {
    const u = rad[i];
    if (u.den > denExportu) continue;
    if (u.den < bal.den) { neuplny = true; break; }
    if (bal.hodin > 0 && bezi > bal.hodin) { neuplny = true; break; }
    stavy.set(u, bezi);
    bezi -= zmenaZ(u);
  }

  return { stavy, kotva: bal.den, neuplny };
}

/**
 * @param od            začiatok zobrazeného obdobia (staršie sa nezobrazí)
 * @param doDna         koniec obdobia
 * @param zostatokTeraz koľko hodín klientovi zostáva podľa appky
 *                      (`packageRemaining`). Bez neho sa zostatok nepočíta —
 *                      radšej prázdny stĺpec než vymyslené číslo.
 */
export function vypisHodin(os: Udalost[], od = "", doDna = "", zostatokTeraz: number | null = null): Vypis {
  const dnes = doDna || new Date().toISOString().slice(0, 10);
  const { stavy, kotva, neuplny } = zostatkyOsi(os, zostatokTeraz, dnes);
  const vsetko = vCase(os);

  let spolu = 0;
  let zaciatok: number | null = null;
  let koniec: number | null = null;
  const riadky: RiadokVypisu[] = [];
  let kupene = 0;
  let odtrenovane = 0;
  let zaplatene = 0;

  for (const u of vsetko) {
    // Čo je za koncom obdobia, sa nepočíta vôbec — inak by „stav na konci"
    // hovoril o dnešku, hoci výpis končí v júni.
    if (doDna && u.den > doDna) continue;
    const zmena = zmenaZ(u);
    if (u.druh === "trening") spolu += hodinTreningu(u);
    const zostatok = stavy.has(u) ? (stavy.get(u) as number) : null;
    if (od && u.den < od) {
      if (zostatok !== null) zaciatok = zostatok;
      continue;
    }
    if (zmena > 0) kupene += zmena;
    if (u.druh === "trening") odtrenovane += hodinTreningu(u);
    if (u.druh === "platba") zaplatene += u.suma;
    if (zostatok !== null) koniec = zostatok;
    riadky.push({
      den: u.den,
      popis: popisZ(u),
      zmena,
      zostatok,
      spolu,
      druh: u.druh,
      zKalendara: u.druh === "trening" ? u.zKalendara : undefined,
      odvodene: u.druh === "balicekOd" || u.druh === "balicekDo" ? u.odvodene : undefined,
    });
  }

  return {
    riadky: riadky.reverse(),
    od: od || (vsetko[0]?.den ?? ""),
    do: doDna || (vsetko[vsetko.length - 1]?.den ?? ""),
    zaciatok,
    koniec,
    kupene,
    odtrenovane,
    zaplatene,
    spolu,
    kotva,
    neuplny,
  };
}

/** Obdobie „posledné N mesiace" ako dvojica dátumov. */
export function poslednychMesiacov(n: number, dnes = new Date().toISOString().slice(0, 10)): { od: string; do: string } {
  const d = new Date(`${dnes}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return { od: d.toISOString().slice(0, 10), do: dnes };
}

/** Výpis ako text do mailu — klient ho číta v tele správy, nie v prílohe. */
export function vypisAkoText(v: Vypis, klient: string): string {
  const riadky = [...v.riadky].reverse().map((r) => {
    const zmena = r.zmena > 0 ? `+${hod(r.zmena)} h` : r.zmena < 0 ? `-${hod(-r.zmena)} h` : "";
    const stav = r.zostatok !== null && r.zmena !== 0
      ? `   ${zmena} → zostatok ${hod(r.zostatok)} h`
      : r.druh === "trening"
        ? `   ${zmena} → spolu ${hod(r.spolu)} h`
        : "";
    return `${den(r.den).padEnd(14)} ${r.popis}${stav}`;
  });
  return [
    `Výpis hodín — ${klient}`,
    `Obdobie ${den(v.od)} až ${den(v.do)}`,
    "",
    v.zaplatene > 0 ? `Zaplatené: ${suma(v.zaplatene)} Kč` : "",
    `Odtrénované: ${hod(v.odtrenovane)} h${v.odtrenovane !== v.spolu ? ` (za celú históriu ${hod(v.spolu)} h)` : ""}`,
    v.koniec !== null ? `Zostáva: ${hod(v.koniec)} h` : "",
    "",
    ...riadky,
    "",
    v.neuplny && v.koniec !== null
      ? `Zostatok je uvedený za posledné členstvo. Staršie riadky majú stĺpec „spolu" — koľko hodín má klient dovtedy za sebou.`
      : "",
    v.riadky.some((r) => r.odvodene) ? "Hodiny označené ≈ sú z názvu členstva — PTminder ich vo výpise neuvádza." : "",
    "Dĺžka tréningu sa berie zo záznamu o sedení; bežný tréning je hodina.",
  ].filter((r, i, p) => r !== "" || p[i - 1] !== "").join("\n");
}
