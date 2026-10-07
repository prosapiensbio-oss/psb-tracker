import { describe, expect, it } from "bun:test";

import { denCz, icsTerminu, nedelaTyzdna, platiDo, prahaNaUtcIcs, prekryva, prekryvVPonuke, stavPonuky, textSmsPonuky, volneCasy } from "./ponukaTerminov";

// Jerry, 7. 10. 2026: „vytukal by som si všetky termíny, ktoré ponúkam,
// poslal by som mu odkaz… klikol by na ten, ktorý chce."
describe("ponuka termínov", () => {
  const c = (id: string, zaciatok: string, koniec: string, trener = "Jerry") => ({ id, trener, zaciatok, koniec });

  it("prekryv po minútach, dotyk nie je prekryv", () => {
    expect(prekryva({ zaciatok: "2026-10-13T10:00", koniec: "2026-10-13T11:00" }, { zaciatok: "2026-10-13T10:30", koniec: "2026-10-13T11:30" })).toBe(true);
    expect(prekryva({ zaciatok: "2026-10-13T10:00", koniec: "2026-10-13T11:00" }, { zaciatok: "2026-10-13T11:00", koniec: "2026-10-13T12:00" })).toBe(false);
  });

  it("voľné sú len časy bez udalosti TOHO ISTÉHO trénera a nie v minulosti", () => {
    const casy = [
      c("a", "2026-10-13T10:00", "2026-10-13T11:00"),
      c("b", "2026-10-13T14:00", "2026-10-13T15:00"),
      c("c", "2026-10-13T16:00", "2026-10-13T17:00"),
      c("d", "2026-10-12T09:00", "2026-10-12T10:00"),
    ];
    const obsadene = [
      { trener: "Jerry", zaciatok: "2026-10-13T10:30", koniec: "2026-10-13T11:30" }, // zhltne a
      { trener: "Terezka", zaciatok: "2026-10-13T14:00", koniec: "2026-10-13T15:00" }, // cudzí kalendár — b ostáva
    ];
    expect(volneCasy(casy, obsadene, "2026-10-12T12:00").map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("platí do nedele týždňa posledného termínu", () => {
    expect(nedelaTyzdna("2026-10-07")).toBe("2026-10-11"); // streda → nedeľa
    expect(nedelaTyzdna("2026-10-11")).toBe("2026-10-11"); // nedeľa ostáva
    expect(platiDo([{ zaciatok: "2026-10-09T10:00" }, { zaciatok: "2026-10-13T10:00" }])).toBe("2026-10-18");
  });

  it("stav: vybrané prebije všetko, potom zrušené, vypršané, obsadené", () => {
    const p = { plati_do: "2026-10-11", vybrany_id: null, zrusene_at: null };
    expect(stavPonuky(p, "2026-10-10", 2)).toBe("caka");
    expect(stavPonuky(p, "2026-10-12", 2)).toBe("vyprsala");
    expect(stavPonuky(p, "2026-10-10", 0)).toBe("obsadene");
    expect(stavPonuky({ ...p, vybrany_id: "x" }, "2026-10-12", 0)).toBe("vybrane");
  });

  it("prekryv v jednej ponuke odhalí preklep pri ťukaní", () => {
    expect(prekryvVPonuke([c("a", "2026-10-13T10:00", "2026-10-13T11:00"), c("b", "2026-10-13T10:45", "2026-10-13T11:45")])).toBe(true);
    expect(prekryvVPonuke([c("a", "2026-10-13T10:00", "2026-10-13T11:00"), c("b", "2026-10-13T10:00", "2026-10-13T11:00", "Terezka")])).toBe(false);
  });

  it("deň po česky a krátka SMS", () => {
    expect(denCz("2026-10-13")).toBe("Úterý 13. 10.");
    const t = textSmsPonuky("Eva", "https://x.cz/t/abc", "Jerry");
    expect(t).toBe("Eva, posílám volné termíny, vyberte si: https://x.cz/t/abc Jerry");
  });
});

describe("termín do kalendára (.ics)", () => {
  it("pražský čas → UTC podľa letného aj zimného času", () => {
    expect(prahaNaUtcIcs("2026-10-13T10:00")).toBe("20261013T080000Z"); // CEST +2
    expect(prahaNaUtcIcs("2026-11-03T10:00")).toBe("20261103T090000Z"); // CET +1
  });
  it("udalosť má začiatok, koniec a názov", () => {
    const s = icsTerminu({ uid: "x@psb", zaciatok: "2026-10-13T10:00", koniec: "2026-10-13T11:00", nazov: "Trénink ProSapiens" });
    expect(s).toContain("DTSTART:20261013T080000Z");
    expect(s).toContain("DTEND:20261013T090000Z");
    expect(s).toContain("SUMMARY:Trénink ProSapiens");
  });
});
