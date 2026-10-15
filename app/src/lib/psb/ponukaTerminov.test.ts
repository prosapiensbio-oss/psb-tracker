import { describe, expect, it } from "bun:test";

import { denCz, icsTerminu, jeRozmedzie, nedelaTyzdna, platiDo, prahaNaUtcIcs, prekryva, prekryvVPonuke, stavPonuky, textSmsPonuky, volneCasy, vybranyUsek, zaciatkyVRozmedzi, zaciatokPoKliku } from "./ponukaTerminov";

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

// Jerry, 11. 10. 2026: „nastavím si, že mám čas odvtedy dovtedy, a človek si
// len vyberie, kedy by v tom rozmedzí mohol byť."
describe("ponuka v rozmedzí", () => {
  const r = { id: "r", trener: "Jerry", zaciatok: "2026-10-13T14:00", koniec: "2026-10-13T18:00" };
  it("celé a pol hodiny, posledný začiatok hodinu pred koncom", () => {
    expect(jeRozmedzie(r)).toBe(true);
    expect(zaciatkyVRozmedzi(r, [], "2026-10-12T12:00").map((x) => x.slice(11))).toEqual(["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"]);
  });
  it("obsadený úsek vypadne a ponúkne sa prvý voľný začiatok po ňom", () => {
    const obs = [{ trener: "Jerry", zaciatok: "2026-10-13T15:00", koniec: "2026-10-13T16:15" }];
    expect(zaciatkyVRozmedzi(r, obs, "2026-10-12T12:00").map((x) => x.slice(11))).toEqual(["14:00", "16:15", "16:30", "17:00"]);
  });
  it("udalosť iného trénera rozmedzie neruší; minulosť áno", () => {
    const obs = [{ trener: "Terezka", zaciatok: "2026-10-13T15:00", koniec: "2026-10-13T16:00" }];
    expect(zaciatkyVRozmedzi(r, obs, "2026-10-13T16:10").map((x) => x.slice(11))).toEqual(["16:15", "16:30", "17:00"]);
  });
  it("hodinový termín (starý tvar) má jeden začiatok, aj o štvrť", () => {
    const h = { id: "h", trener: "Jerry", zaciatok: "2026-10-13T08:15", koniec: "2026-10-13T09:15" };
    expect(jeRozmedzie(h)).toBe(false);
    expect(zaciatkyVRozmedzi(h, [], "2026-10-12T12:00")).toEqual(["2026-10-13T08:15"]);
  });
  it("vybraný úsek je hodina od zvoleného začiatku", () => {
    expect(vybranyUsek(r, "2026-10-13T15:30")).toMatchObject({ zaciatok: "2026-10-13T15:30", koniec: "2026-10-13T16:30" });
    expect(vybranyUsek(r, null)).toBe(r);
  });
  it("plne obsadené rozmedzie nie je voľné", () => {
    const obs = [{ trener: "Jerry", zaciatok: "2026-10-13T14:00", koniec: "2026-10-13T17:30" }];
    expect(volneCasy([r], obs, "2026-10-12T12:00")).toEqual([]);
  });
});

// Jerry, 15. 10. 2026: „dám jeden ráno a druhý večer, vysvieti sa mi ten deň
// na červeno a neudeje sa nič."
describe("zaciatokPoKliku", () => {
  const h = (hh: number, mm = 0) => hh * 60 + mm;
  // Utorok 20. 10.: tréningy do 20:00, ráno ponuka 10:00–11:00.
  const obsadeneUseky = [[h(19), h(20)], [h(15, 0), h(16)], [h(10), h(11)]];
  const zak = { odMin: h(7), doMax: h(21), obsadene: (od: number, doMin: number) => obsadeneUseky.some(([a, b]) => od < b && doMin > a), vMinulosti: () => false };

  it("klik do spodnej polovice hodiny 20:00 dá 20:00–21:00, nie červenú", () => {
    expect(zaciatokPoKliku(h(20, 30), zak)).toEqual({ od: h(20) });
    expect(zaciatokPoKliku(h(20, 45), zak)).toEqual({ od: h(20) });
  });
  it("tesne pred obsadenou hodinou sa termín posunie hore", () => {
    expect(zaciatokPoKliku(h(14, 30), zak)).toEqual({ od: h(14) });
  });
  it("voľné miesto berie presne kliknutú štvrťhodinu", () => {
    expect(zaciatokPoKliku(h(12, 15), zak)).toEqual({ od: h(12, 15) });
  });
  it("posun najviac o 45 min — kliknuté miesto zostane v hodine", () => {
    // 16:00–19:00 voľné, klik 18:45 → 18:00–19:00 (posun 45), nie 17:45.
    expect(zaciatokPoKliku(h(18, 45), zak)).toEqual({ od: h(18) });
  });
  it("keď sa nezmestí, povie prečo", () => {
    expect(zaciatokPoKliku(h(19, 30), zak)).toEqual({ dovod: "V tomto čase je už tréning alebo iný termín." });
    expect(zaciatokPoKliku(h(20, 30), { ...zak, doMax: h(20, 30) })).toHaveProperty("dovod");
    expect(zaciatokPoKliku(h(12), { ...zak, vMinulosti: () => true })).toEqual({ dovod: "Tento čas už bol." });
  });
});
