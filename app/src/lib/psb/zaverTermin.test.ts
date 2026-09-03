import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { najblizsiTermin, terminSlovom, zaverUzMaTermin } from "./compute";

/**
 * Pripomienka „ozvať sa a dohodnúť termín“ sa najprv pozrie do kalendára.
 *
 * Jerry, 31. 8. 2026: podľa nej napísal Romanovi Pavlíkovi SMS a Roman
 * odpísal, že sú dohodnutí — mal termín v utorok o 10:30. Falošný poplach je
 * horší než zmeškaný, lebo podľa neho sa koná.
 */
const KLIENTI = ["Roman Pavlik", "Michal Knapčok", "Jan Kral"];
const DNES = new Date("2026-08-31T08:00:00Z");
const u = (klient: string, zaciatok: string, typ = "trening", zmizlaAt: string | null = null) =>
  ({ klient, zaciatok, typ, zmizlaAt });

const ROMAN = { zaver: "Roman Pavlik budúci týždeň nepríde na tréning.", tema: "klienti", overit: "Ozvať sa Romanovi a dohodnúť termín na začiatok septembra." };

describe("záver o termíne sa overuje kalendárom", () => {
  it("keď má budúci termín, vráti ho", () => {
    const r = zaverUzMaTermin(ROMAN, KLIENTI, [u("Roman Pavlik", "2026-09-01T10:30:00Z")], DNES);
    expect(r).toBe("2026-09-01T10:30:00Z");
  });

  it("keď termín nemá, nehlási nič", () => {
    expect(zaverUzMaTermin(ROMAN, KLIENTI, [], DNES)).toBeNull();
  });

  it("minulý tréning termín nenahrádza", () => {
    expect(zaverUzMaTermin(ROMAN, KLIENTI, [u("Roman Pavlik", "2026-08-20T10:30:00Z")], DNES)).toBeNull();
  });

  it("zrušený termín sa neráta — pripomienka sa vráti sama", () => {
    const zruseny = [u("Roman Pavlik", "2026-09-01T10:30:00Z", "trening", "2026-08-30T12:00:00Z")];
    expect(zaverUzMaTermin(ROMAN, KLIENTI, zruseny, DNES)).toBeNull();
  });

  it("záver, ktorý nie je o termíne, kalendár neumlčí", () => {
    const fb = { zaver: "Full Access: žiadosť odoslaná.", tema: "Meta", overit: "Prišlo rozhodnutie?" };
    expect(zaverUzMaTermin(fb, KLIENTI, [u("Roman Pavlik", "2026-09-01T10:30:00Z")], DNES)).toBeNull();
  });

  it("bez rozpoznaného klienta radšej hlási", () => {
    const bezMena = { zaver: "Treba dohodnúť termín stretnutia s dodávateľom.", tema: "", overit: "Dohodnúť termín." };
    expect(zaverUzMaTermin(bezMena, KLIENTI, [u("Roman Pavlik", "2026-09-01T10:30:00Z")], DNES)).toBeNull();
  });

  it("termín iného klienta nestačí", () => {
    expect(zaverUzMaTermin(ROMAN, KLIENTI, [u("Michal Knapčok", "2026-09-01T10:30:00Z")], DNES)).toBeNull();
  });
});

/**
 * Pripomienka nezmizne — odpovie.
 *
 * Jerry, 31. 8. 2026: „nech notifikácia napíše, že sme dohodnutí na ten a ten
 * termín, a ja dám Vybavené.“ Ticho by ho pripravilo o to, že sa človek vracia.
 */
describe("termín sa píše do pripomienky", () => {
  it("nájde najbližší budúci termín", () => {
    const u = [
      { klient: "Roman Jakubiček", zaciatok: "2026-09-08T09:30:00Z", typ: "trening", zmizlaAt: null },
      { klient: "Roman Jakubiček", zaciatok: "2026-09-01T09:30:00Z", typ: "trening", zmizlaAt: null },
    ];
    expect(najblizsiTermin("Roman Jakubiček", u, DNES)).toBe("2026-09-01T09:30:00Z");
  });

  it("minulý ani zrušený termín sa neráta", () => {
    const u = [
      { klient: "Jan Kral", zaciatok: "2026-08-20T18:00:00Z", typ: "trening", zmizlaAt: null },
      { klient: "Jan Kral", zaciatok: "2026-09-02T18:00:00Z", typ: "trening", zmizlaAt: "2026-08-30T00:00:00Z" },
    ];
    expect(najblizsiTermin("Jan Kral", u, DNES)).toBeNull();
  });

  it("termín sa píše tak, ako ho čítaš v kalendári", () => {
    expect(terminSlovom("2026-09-01T10:30:00Z")).toBe("ut 1. 9. o 10:30");
    // bez vedúcej nuly — v kalendári to je 9:30, nie 09:30
    expect(terminSlovom("2026-09-01T09:30:00Z")).toBe("ut 1. 9. o 9:30");
  });

  it("nezmyselný dátum nespadne", () => {
    expect(terminSlovom("nezmysel")).toBe("");
  });
});

/**
 * „Prestal chodiť“ mlčí, keď má klient termín.
 *
 * Jerry, 31. 8. 2026: veta „14 dní bez tréningu — termín má po 31. 8.“ si
 * protirečí a je to zároveň druhýkrát to isté, čo hovorí jeho vlastný záver
 * o dovolenke. Kto má termín, neprestal chodiť.
 */
describe("prestal chodiť vs. termín v kalendári", () => {
  const zdroj = readFileSync(new URL("./compute.ts", import.meta.url).pathname, "utf8");

  it("gone| sa pushuje len bez termínu a bez otvoreného záveru", () => {
    expect(zdroj).toContain("if (!najblizsiTermin(c.name, kal?.udalosti, now) && !zaverKryjeKlienta(data.zavery, c.name, now)) {");
  });

  it("do textu gone| sa termín NEdopisuje", () => {
    const i = zdroj.indexOf("`gone|${c.name}`");
    expect(zdroj.slice(i, i + 200)).not.toContain("terminSlovom");
  });

  it("v závere termín naopak zostáva", () => {
    expect(zdroj).toContain("Termín už máte dohodnutý: ${terminSlovom(termin)}");
  });
});
