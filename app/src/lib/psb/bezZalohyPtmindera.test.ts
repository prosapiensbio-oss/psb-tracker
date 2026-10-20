import { describe, expect, it } from "bun:test";

import { deriveAnomalies, deriveClients } from "./compute";
import { EMPTY_DATA, type PSBData } from "./types";
import { treningyBezBalicka, type BalicekPreZostatok } from "./zostatokKokpitu";
import { dnesPraha } from "./cas";

/**
 * Odchod z PTmindera, krok 3 (20. 10. 2026): zostatok bez zálohy z exportu.
 * Klient bez aktívneho balíčka v Kokpite je bez balíčka a tréning bez
 * balíčka hlási notifikácia `bezbalicka|`.
 */

const b = (klient: string, od: string, doDna: string | null, hodiny: number | null, extra: Partial<BalicekPreZostatok> = {}): BalicekPreZostatok =>
  ({ klient, nazov: "OFF - 6h", hodiny, platnostOd: od, platnostDo: doDna, ...extra });
const s = (klient: string, d: string) => ({ client: klient, date: `${d}T00:00:00.000Z`, duration: 60 });

describe("treningyBezBalicka", () => {
  it("tréning po konci platnosti bez nového balíčka", () => {
    expect(treningyBezBalicka([b("Svetopluk", "2026-07-27", "2026-09-20", 6)], "Svetopluk",
      [s("Svetopluk", "2026-09-07"), s("Svetopluk", "2026-10-12")], "2026-10-01", "2026-10-20")).toEqual(["2026-10-12"]);
  });
  it("vyčerpaný, ale platný balíček kryje (mínus hlási iná notifikácia)", () => {
    expect(treningyBezBalicka([b("A", "2026-10-01", "2026-11-25", 1)], "A",
      [s("A", "2026-10-02"), s("A", "2026-10-09")], "2026-10-01", "2026-10-20")).toEqual([]);
  });
  it("zrušený balíček nekryje, zadarmo sa nepočíta, pred 1. 10. sa nesúdi, budúcnosť tiež nie", () => {
    const zadarmo = new Set(["a|2026-10-05"]);
    expect(treningyBezBalicka([b("A", "2026-10-01", null, 6, { zruseneAt: "2026-10-03" })], "A",
      [s("A", "2026-09-29"), s("A", "2026-10-05"), s("A", "2026-10-06"), s("A", "2026-10-06"), s("A", "2026-10-25")],
      "2026-10-01", "2026-10-20", zadarmo)).toEqual(["2026-10-06"]);
  });
});

describe("deriveClients — zostatok bez zálohy z PTmindera", () => {
  const dnes = dnesPraha();
  const posun = (d: number) => dnesPraha(new Date(Date.now() + d * 86400000));
  const data = {
    ...EMPTY_DATA,
    sessions: [
      { date: `${posun(-40)}T00:00:00.000Z`, time: "10:00", client: "Kat Stokl", sessionTrainer: "Terezka", sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 0 },
      { date: `${posun(-2)}T00:00:00.000Z`, time: "10:00", client: "Kat Stokl", sessionTrainer: "Terezka", sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 0 },
      { date: `${posun(-3)}T00:00:00.000Z`, time: "10:00", client: "Ma Balicek", sessionTrainer: "Jerry", sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 0 },
    ],
    // Export PTmindera: doplnenie 1 z 2 (v Kokpite nie je).
    packages: [{ client: "Kat Stokl", package: "Doplnenie členstva", total: 2, remaining: 1, validFrom: "", validTo: "", added: posun(-9), kind: "package", naObdobie: 0 }],
    balickyKokpit: [{ klient: "Ma Balicek", nazov: "6h Balíček", hodiny: 6, platnostOd: posun(-5), platnostDo: posun(50) }],
  } as unknown as PSBData;

  it("vypnuté: zostatok z PTmindera s poznámkou (dnešný stav naostro)", () => {
    const c = deriveClients(data, { bezZalohyPtmindera: false })["Kat Stokl"];
    if (dnes < "2026-10-01") return;
    expect(c.packageRemaining).toBe(1);
    expect(c.packageOdkial).toContain("z PTmindera");
    expect(c.treningyBezBalicka).toBeUndefined();
  });

  it("zapnuté: bez balíčka v Kokpite = bez balíčka, tréning odvtedy sa hlási", () => {
    const vsetci = deriveClients(data, { bezZalohyPtmindera: true });
    const c = vsetci["Kat Stokl"];
    expect(c.packageRemaining).toBe(0);
    expect(c.packageTotal).toBe(0);
    expect(c.membership).toBe("");
    expect(c.packageOdkial).toBe("Kokpit: žiadny aktívny balíček");
    expect(c.treningyBezBalicka).toEqual([posun(-2)]);
    // Klient s balíčkom v Kokpite sa nemení.
    expect(vsetci["Ma Balicek"].packageRemaining).toBe(5);
    expect(vsetci["Ma Balicek"].treningyBezBalicka).toBeUndefined();

    const a = deriveAnomalies(data, vsetci).filter((x) => x.key.startsWith("bezbalicka|"));
    expect(a.map((x) => x.key)).toEqual(["bezbalicka|Kat Stokl"]);
    expect(a[0].platneOd).toBe(posun(-2));
  });
});
