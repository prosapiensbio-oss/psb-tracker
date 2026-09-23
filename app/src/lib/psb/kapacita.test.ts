// Kapacita a vyťaženie — čo sa smie započítať a čo nie.
import { describe, expect, it } from "bun:test";

import { capacityByTrainer, TARGET_H, ZONE_HI, vytazenieSpolu } from "./compute";
import type { ClientAgg } from "./compute";
import type { SessionRow } from "./types";

/** Pondelky po sebe, aby sa dali stavať týždne. */
const pondelok = (n: number) => new Date(Date.UTC(2026, 5, 1) + n * 7 * 86400000).toISOString().slice(0, 10);
const denVTyzdni = (t: number, d: number) =>
  new Date(Date.parse(`${pondelok(t)}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);

function sedenia(tyzdnov: number, hodinZaTyzden: number, trener = "Jerry"): SessionRow[] {
  const out: SessionRow[] = [];
  for (let t = 0; t < tyzdnov; t++) {
    for (let h = 0; h < hodinZaTyzden; h++) {
      out.push({
        date: denVTyzdni(t, h % 5), time: "", client: `K${h % 7}`, sessionTrainer: trener,
        sessionName: "", sessionType: "OFFLINE", duration: 60, price: 1000,
      } as SessionRow);
    }
  }
  return out;
}

const klienti = (n: number, trener = "Jerry"): Record<string, ClientAgg> => {
  const out: Record<string, ClientAgg> = {};
  for (let i = 0; i < n; i++) {
    out[`K${i}`] = { name: `K${i}`, primaryTrainer: trener, status: "Aktívny", segment: "Stabilný", sessions: [] } as unknown as ClientAgg;
  }
  return out;
};

/** Deň po poslednom týždni — vtedy sú všetky týždne úplné. */
const poKonci = (tyzdnov: number) => denVTyzdni(tyzdnov - 1, 7);

describe("bežiaci týždeň sa nezapočíta", () => {
  it("rozrobený týždeň nezníži typický týždeň", () => {
    // 12 týždňov po 29 h a potom utorok trinásteho: dve odtrénované hodiny.
    const plne = sedenia(12, 29);
    const rozrobeny = [{
      date: denVTyzdni(12, 1), time: "", client: "K1", sessionTrainer: "Jerry",
      sessionName: "", sessionType: "OFFLINE", duration: 120, price: 2000,
    } as SessionRow];
    const utorok = denVTyzdni(12, 1);
    const s = capacityByTrainer(klienti(10), [...plne, ...rozrobeny], utorok).find((c) => c.trainer === "Jerry")!;
    expect(Math.round(s.recentWeekly)).toBe(TARGET_H);
    expect(s.util).toBe(100);
  });

  it("bez tejto poistky by to isté vyšlo nižšie", () => {
    // Dôkaz, že test hore niečo stráži: keď sa deň posunie tak, že rozrobený
    // týždeň je už úplný, priemer klesne — lebo v ňom naozaj bolo 2 h.
    const plne = sedenia(12, 29);
    const rozrobeny = [{
      date: denVTyzdni(12, 1), time: "", client: "K1", sessionTrainer: "Jerry",
      sessionName: "", sessionType: "OFFLINE", duration: 120, price: 2000,
    } as SessionRow];
    const s = capacityByTrainer(klienti(10), [...plne, ...rozrobeny], denVTyzdni(13, 0)).find((c) => c.trainer === "Jerry")!;
    expect(s.recentWeekly).toBeLessThan(TARGET_H);
  });

  it("číslo nezávisí od toho, kedy sa nahral export", () => {
    // Tá istá skutočnosť odtrénovaná; menia sa len dni, keď sa appka pozrie.
    const s = sedenia(12, 29);
    const v = ["po", "st", "ne"].map((_, i) =>
      capacityByTrainer(klienti(10), s, denVTyzdni(12, i * 2)).find((c) => c.trainer === "Jerry")!.util,
    );
    expect(new Set(v).size).toBe(1);
  });

  it("úplne čerstvá appka (len rozrobený týždeň) neukáže nulu", () => {
    const s = sedenia(1, 20);
    const v = capacityByTrainer(klienti(10), s, denVTyzdni(0, 3)).find((c) => c.trainer === "Jerry")!;
    expect(v.recentWeekly).toBeGreaterThan(0);
  });
});

describe("vyťaženie", () => {
  it("typický týždeň na ideáli je 100 %", () => {
    const s = capacityByTrainer(klienti(10), sedenia(12, TARGET_H), poKonci(12)).find((c) => c.trainer === "Jerry")!;
    expect(s.util).toBe(100);
    expect(s.canTake).toBe(0);
  });

  it("jednorazová špička vyťaženie nevytiahne", () => {
    // Rušný týždeň je 80. PERCENTIL z dvanástich, nie maximum. Jeden nabitý
    // týždeň v roku nesmie zavrieť príjem nových klientov.
    const s = [...sedenia(11, 20), ...sedenia(1, ZONE_HI).map((x) => ({ ...x, date: denVTyzdni(11, 0) }))];
    const v = capacityByTrainer(klienti(10), s, poKonci(12)).find((c) => c.trainer === "Jerry")!;
    expect(v.busyWeekly).toBeLessThan(ZONE_HI);
    expect(v.util).toBeLessThan(100);
  });

  it("rušné týždne na strope zavrú kapacitu, aj keď typický zaostáva", () => {
    // Dvojitý strop: rastie sa, kým nenarazí PRVÝ z nich. Štyri z dvanástich
    // týždňov na 34 h už percentil vytiahnu — a to je stav „na strope",
    // hoci priemer ukazuje pokojne.
    const s = [
      ...sedenia(4, ZONE_HI),
      ...sedenia(12, 20).filter((x) => x.date >= denVTyzdni(4, 0)),
    ];
    const v = capacityByTrainer(klienti(10), s, poKonci(12)).find((c) => c.trainer === "Jerry")!;
    expect(v.recentWeekly).toBeLessThan(TARGET_H);
    expect(v.util).toBeGreaterThanOrEqual(100);
    expect(v.canTake).toBe(0);
  });

  it("spolu za dvoch sa meria proti dvojnásobnému ideálu", () => {
    const s = [...sedenia(12, TARGET_H, "Jerry"), ...sedenia(12, TARGET_H, "Terezka")];
    const cap = capacityByTrainer({ ...klienti(5, "Jerry"), ...klienti(5, "Terezka") }, s, poKonci(12));
    expect(vytazenieSpolu(cap)).toBe(100);
  });
});
