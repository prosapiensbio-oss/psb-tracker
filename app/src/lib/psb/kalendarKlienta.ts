/**
 * KALENDÁR V PROFILE KLIENTA (Jerry, 26. 11. 2026 — vybral návrh B z
 * `navrhy-kokpitu/profil-kalendar.html`): tri malé mesiace vedľa seba.
 * Zelený štvorček = tréning, modrý rámik = platba, oranžová bodka = začiatok
 * balíčka; pod mesiacom pás platnosti balíčkov a súčet.
 *
 * Čísla sa tu NEPOČÍTAJÚ nanovo — všetko je z osi času (`osCasuKlienta`),
 * ktorú kreslí aj zoznam. Kalendár je len iné rozloženie tých istých riadkov.
 */
import type { Udalost } from "./klientOsCasu";

export type DenKalendara = {
  den: string;
  treningy: Extract<Udalost, { druh: "trening" }>[];
  platby: Extract<Udalost, { druh: "platba" }>[];
  balicky: Extract<Udalost, { druh: "balicekOd" }>[];
  /** Objednané termíny z kalendára (ešte neodtrénované), čas „HH:MM". */
  objednane: string[];
};

export type PasBalicka = { od: string; do: string; nazov: string; hodin: number; doplnenie: boolean; nezaplatene: boolean; otvoreny: boolean };

export type MesiacKalendara = {
  mesiac: string; // "2026-11"
  /** Koľko prázdnych políčok pred 1. dňom (týždeň začína pondelkom). */
  posun: number;
  dni: DenKalendara[];
  pasy: PasBalicka[];
  treningov: number;
  zaplatene: number;
};

const pocetDni = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const dowPo = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Posun mesiaca „2026-11" o n (aj cez rok). */
export function posunMesiac(m: string, n: number): string {
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Pásy platnosti balíčkov. Koniec je `doDna`; keď chýba (doplnenie, staré
 * členstvo bez konca), pás beží do začiatku ďalšieho balíčka, a keď ďalší
 * nie je, do `dnes` — a je „otvorený", aby obrazovka nevyzerala, že vie koniec.
 */
export function pasyBalickov(os: Udalost[], dnes: string): PasBalicka[] {
  const zac = os.filter((u): u is Extract<Udalost, { druh: "balicekOd" }> => u.druh === "balicekOd")
    .sort((a, b) => a.den.localeCompare(b.den));
  return zac.map((b, i) => {
    // Doplnenie sa míňa pred ďalším balíčkom, takže končí jeho začiatkom
    // (akýmkoľvek); balíček bez konca končí až ďalším balíčkom, nie doplnením.
    const dalsi = zac.slice(i + 1).find((x) => x.den > b.den && (b.doplnenie || !x.doplnenie));
    const doDna = b.doDna ? b.doDna.slice(0, 10) : dalsi ? dalsi.den : dnes > b.den ? dnes : b.den;
    return { od: b.den, do: doDna, nazov: b.nazov, hodin: b.hodin, doplnenie: !!b.doplnenie, nezaplatene: !!b.nezaplatene, otvoreny: !b.doDna && !dalsi };
  });
}

export function mesiacKalendara(mesiac: string, os: Udalost[], objednane: string[], dnes: string): MesiacKalendara {
  const n = pocetDni(mesiac);
  const dni: DenKalendara[] = [];
  for (let i = 1; i <= n; i++) {
    const den = `${mesiac}-${String(i).padStart(2, "0")}`;
    dni.push({
      den,
      treningy: os.filter((u): u is Extract<Udalost, { druh: "trening" }> => u.druh === "trening" && u.den.slice(0, 10) === den),
      platby: os.filter((u): u is Extract<Udalost, { druh: "platba" }> => u.druh === "platba" && u.den.slice(0, 10) === den),
      balicky: os.filter((u): u is Extract<Udalost, { druh: "balicekOd" }> => u.druh === "balicekOd" && u.den.slice(0, 10) === den),
      objednane: objednane.filter((z) => z.slice(0, 10) === den).map((z) => z.slice(11, 16)),
    });
  }
  const prvy = `${mesiac}-01`, posledny = `${mesiac}-${String(n).padStart(2, "0")}`;
  const pasy = pasyBalickov(os, dnes)
    .filter((p) => p.od <= posledny && p.do >= prvy)
    .map((p) => ({ ...p, od: p.od < prvy ? prvy : p.od, do: p.do > posledny ? posledny : p.do }));
  return {
    mesiac, posun: dowPo(prvy), dni, pasy,
    treningov: dni.reduce((s, d) => s + d.treningy.length, 0),
    zaplatene: dni.reduce((s, d) => s + d.platby.reduce((a, p) => a + p.suma, 0), 0),
  };
}

/** Tri mesiace končiace mesiacom `posledny` (predvolene bežný). */
export function triMesiace(posledny: string, os: Udalost[], objednane: string[], dnes: string): MesiacKalendara[] {
  return [-2, -1, 0].map((o) => mesiacKalendara(posunMesiac(posledny, o), os, objednane, dnes));
}
