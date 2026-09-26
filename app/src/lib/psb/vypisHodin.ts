import type { Udalost } from "./klientOsCasu";

/**
 * VÝPIS HODÍN — čo klient kúpil, čo odtrénoval a koľko mu zostáva.
 *
 * Jerry, 26. 9. 2026: „v profile klienta v záložke všetko chcem vedieť vedľa
 * tréningov aj počty hodín, koľko bolo hodín, keď klient zaplatil, s možnosťou
 * vytvoriť z toho report a poslať to klientovi na kontrolu."
 *
 * Os času ukazuje, ČO sa kedy stalo. Toto k tomu dopočíta jediné číslo, ktoré
 * pri spore chýba: stav hodín po každom riadku. Keď klient povie „veď mi ešte
 * zostávali štyri", dá sa prejsť zhora nadol a ukázať, kde sa to rozišlo.
 *
 * JEDEN TRÉNING = JEDNA HODINA. Je to pravda pre drvivú väčšinu tréningov
 * a os času inú informáciu nenesie. Dlhšie bloky (dve hodiny pre firmy) sa
 * takto počítajú ako jeden — preto to výpis píše nahlas, nech sa nikto
 * nedohaduje o čísle, ktoré appka nevie.
 *
 * ZOSTATOK NESMIE ZÁVISIEŤ OD OBDOBIA. Keď sa výpis obmedzí na posledné tri
 * mesiace, staršie balíčky a tréningy sa spočítajú do počiatočného stavu —
 * inak by klientovi vyšlo, že mu appka zobrala hodiny, ktoré minul vlani.
 */

export type RiadokVypisu = {
  den: string;
  /** Čo sa stalo, ľudsky. */
  popis: string;
  /** +18 pri balíčku, −1 pri tréningu, 0 pri platbe. */
  zmena: number;
  /** Stav po tomto riadku. */
  zostatok: number;
  druh: Udalost["druh"];
  /** Tréning, ktorý je zatiaľ len v kalendári — v exporte ešte nie je. */
  zKalendara?: boolean;
};

export type Vypis = {
  riadky: RiadokVypisu[];
  od: string;
  do: string;
  /** Stav hodín pred začiatkom obdobia. */
  zaciatok: number;
  /** Stav hodín na konci. */
  koniec: number;
  /** Koľko hodín v období pribudlo a koľko sa odtrénovalo. */
  kupene: number;
  odtrenovane: number;
  /** Obdobie začína posledným balíčkom, nie tam, kde si človek vypýtal. */
  odKotvy: boolean;
};

const zmenaZ = (u: Udalost): number => {
  if (u.druh === "balicekOd") return u.hodin || 0;
  if (u.druh === "trening") return -1;
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

const suma = (n: number): string => Math.round(n).toLocaleString("sk-SK").replace(/\u00a0/g, " ");

const METODY: Record<string, string> = { bank: "prevodom", cash: "v hotovosti", card: "kartou" };

const popisZ = (u: Udalost): string => {
  if (u.druh === "balicekOd") return `${u.nazov}${u.hodin ? ` · ${u.hodin} h` : ""}${u.doDna ? ` · do ${den(u.doDna)}` : ""}`;
  if (u.druh === "balicekDo") return `koniec platnosti — ${u.nazov}`;
  if (u.druh === "platba") return `platba ${suma(u.suma)} Kč${u.metoda ? ` · ${METODY[u.metoda] || u.metoda}` : ""}`;
  return `tréning${u.cas ? ` ${cas24(u.cas)}` : ""}${u.trener ? ` · ${u.trener}` : ""}`;
};

/**
 * @param od    začiatok zobrazeného obdobia (staršie sa zráta do `zaciatok`)
 * @param doDna koniec obdobia
 * @param kotva deň, od ktorého sa vôbec počíta — staršie riadky sa IGNORUJÚ,
 *              nie zrátajú. Viď `zaciatokBalicka`.
 */
export function vypisHodin(os: Udalost[], od = "", doDna = "", kotva = ""): Vypis {
  // Od najstaršieho: zostatok je bežiaci súčet a ten sa pozadu počítať nedá.
  const vsetko = [...os].sort((a, b) => a.den.localeCompare(b.den));
  let bezi = 0;
  let zaciatok = 0;
  const riadky: RiadokVypisu[] = [];
  let kupene = 0;
  let odtrenovane = 0;

  for (const u of vsetko) {
    // Čo je za koncom obdobia, sa nepočíta vôbec — inak by „stav na konci"
    // hovoril o dnešku, hoci výpis končí v júni.
    if (doDna && u.den > doDna) continue;
    // Pred kotvou appka nevie, koľko hodín klient mal — tie riadky sa
    // nesmú ani zrátať do počiatočného stavu, inak ide zostatok do mínusu.
    if (kotva && u.den < kotva) continue;
    const zmena = zmenaZ(u);
    bezi += zmena;
    if (od && u.den < od) { zaciatok = bezi; continue; }
    if (zmena > 0) kupene += zmena;
    if (zmena < 0) odtrenovane += -zmena;
    riadky.push({
      den: u.den,
      popis: popisZ(u),
      zmena,
      zostatok: bezi,
      druh: u.druh,
      zKalendara: u.druh === "trening" ? u.zKalendara : undefined,
    });
  }

  // Obdobie nesmie tvrdiť viac, než výpis pokrýva: keď kotva leží neskôr než
  // vyžiadaný začiatok, platí kotva. Inak by hlavička hovorila „od júna"
  // a stav na začiatku 0 h — klient by si prečítal, že v júni nemal nič.
  const zacObdobia = od && kotva ? (od > kotva ? od : kotva) : (od || kotva);

  return {
    riadky: riadky.reverse(),
    od: zacObdobia || (vsetko[0]?.den ?? ""),
    do: doDna || (vsetko[vsetko.length - 1]?.den ?? ""),
    zaciatok,
    koniec: bezi,
    kupene,
    odtrenovane,
    odKotvy: Boolean(kotva) && (!od || od <= kotva),
  };
}

/**
 * ODKEDY MÁ ZOSTATOK ZMYSEL — deň posledného balíčka.
 *
 * Os času nesie tréningy od začiatku, ale balíčky len tie, ktoré PTminder
 * exportuje dnes. Bežiaci súčet od úplného začiatku preto vychádzal do
 * mínusu (Anetka −37 h): odčítal roky tréningov, ku ktorým v appke žiadny
 * balíček nie je. Zostatok sa preto počíta od posledného balíčka, ktorý už
 * začal platiť — presne tak, ako to hovorí karta klienta („15 h zostáva").
 */
export function zaciatokBalicka(os: Udalost[], dnes = new Date().toISOString().slice(0, 10)): string {
  let naj = "";
  for (const u of os) {
    if (u.druh !== "balicekOd" || u.den > dnes) continue;
    if (!naj || u.den > naj) naj = u.den;
  }
  return naj;
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
    const zmena = r.zmena > 0 ? `+${r.zmena}` : r.zmena < 0 ? String(r.zmena) : "";
    return `${den(r.den).padEnd(14)} ${r.popis}${zmena ? `   ${zmena} h → zostatok ${r.zostatok} h` : ""}`;
  });
  return [
    `Výpis hodín — ${klient}`,
    `Obdobie ${den(v.od)} až ${den(v.do)}`,
    "",
    `Stav na začiatku: ${v.zaciatok} h`,
    `Pribudlo: ${v.kupene} h · odtrénované: ${v.odtrenovane} h`,
    `Stav na konci: ${v.koniec} h`,
    "",
    ...riadky,
    "",
    v.odKotvy ? "Výpis začína posledným balíčkom — staršie hodiny už boli vyčerpané." : "",
    "Jeden tréning sa počíta ako jedna hodina.",
  ].filter((r, i, p) => r !== "" || p[i - 1] !== "").join("\n");
}
