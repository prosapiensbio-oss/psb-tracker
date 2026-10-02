import { describe, expect, it } from "bun:test";

import { hodinyBezBalicka } from "./hodinyBezBalicka";

const ses = (client: string, den: string) => ({
  client, date: `${den}T00:00:00.000Z`, time: "16:00", sessionTrainer: "Jerry",
  sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 1000,
});
const bal = (client: string, od: string, h = 2) => ({
  client, package: `OFF - ${h}h`, remaining: 0, total: 0, added: od,
  validFrom: od, validTo: "2026-12-31", payment: h * 1165, naObdobie: h,
});
const trener = () => "Jerry";

describe("hodinyBezBalicka", () => {
  it("nájde hodiny, ktoré po poslednom balíčku nič nekryje", () => {
    const r = hodinyBezBalicka(["Dlzni"], {
      sessions: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"].map((d) => ses("Dlzni", d)),
      payments: [], packages: [bal("Dlzni", "2026-09-01")],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ klient: "Dlzni", hodin: 2, balicek: "2026-09-01" });
  });

  it("kto si balíček dokúpil, v zozname nie je — hodiny sa z neho odpísali", () => {
    // Presne pravidlo, ktoré Jerry opísal 2. 10. 2026: balíček má ďalej
    // svojich 6 h, len dve sú hneď minuté.
    const r = hodinyBezBalicka(["Doplatil"], {
      sessions: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"].map((d) => ses("Doplatil", d)),
      payments: [], packages: [bal("Doplatil", "2026-09-01"), bal("Doplatil", "2026-09-25")],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(0);
  });

  it("klient bez jediného balíčka sa nehlási — nedá sa povedať, čo malo byť kryté", () => {
    // PTminder vyváža balíčky až od marca 2026. Cez celú históriu by vyšli
    // nezmysly ako −227 h u človeka, ktorý vždy riadne platil.
    const r = hodinyBezBalicka(["Starý"], {
      sessions: ["2025-01-05", "2025-01-12"].map((d) => ses("Starý", d)),
      payments: [], packages: [],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(0);
  });

  it("kto má hodiny v balíčku, nie je nikde", () => {
    const r = hodinyBezBalicka(["V poriadku"], {
      sessions: [ses("V poriadku", "2026-09-01")],
      payments: [], packages: [bal("V poriadku", "2026-09-01", 6)],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(0);
  });

  it("najviac hodín je hore", () => {
    const zdroj = {
      sessions: [
        ...["2026-09-01", "2026-09-08", "2026-09-15"].map((d) => ses("Jedna", d)),
        ...["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"].map((d) => ses("Tri", d)),
      ],
      payments: [], packages: [bal("Jedna", "2026-09-01"), bal("Tri", "2026-09-01")],
    };
    const r = hodinyBezBalicka(["Jedna", "Tri"], zdroj as never, trener, "2026-09-30");
    expect(r.map((x) => x.klient)).toEqual(["Tri", "Jedna"]);
    expect(r[0].hodin).toBe(3);
  });

  it("tréningy zadarmo sa nepočítajú — darovaná hodina nie je nekrytá", () => {
    const r = hodinyBezBalicka(["Darovaný"], {
      sessions: ["2026-09-01", "2026-09-08", "2026-09-15"].map((d) => ses("Darovaný", d)),
      payments: [], packages: [bal("Darovaný", "2026-09-01")],
      treningyZdarma: [{ klient: "Darovaný", den: "2026-09-15", dovod: "meškanie" }],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(0);
  });
});

describe("okno 90 dní", () => {
  it("kto odišiel dávno, na karte nie je — nie je to úloha", () => {
    const r = hodinyBezBalicka(["Dávny"], {
      sessions: ["2025-06-21", "2025-06-24", "2025-06-28"].map((d) => ses("Dávny", d)),
      payments: [], packages: [bal("Dávny", "2025-06-21")],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(0);
  });

  it("kto prečerpal nedávno, na karte je", () => {
    const r = hodinyBezBalicka(["Nedávny"], {
      sessions: ["2026-09-01", "2026-09-08", "2026-09-15"].map((d) => ses("Nedávny", d)),
      payments: [], packages: [bal("Nedávny", "2026-09-01")],
    } as never, trener, "2026-09-30");
    expect(r).toHaveLength(1);
  });
});
