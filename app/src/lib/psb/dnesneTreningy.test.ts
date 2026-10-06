import { describe, expect, it } from "bun:test";

import { dnesneTreningy, type ClientAgg } from "./compute";

// Lukáš Hanus, 6. 10. 2026: −1 pred tréningom o 9:30 a pripomienka písala
// „dnes je posledná hodina, ktorú mu appka pozná". Jerry to čítal ako
// „má poslednú hodinu".
const klient = (zostatok: number) => ({ "Lukas Hanus": { name: "Lukas Hanus", packageRemaining: zostatok, packageTotal: 6 } as unknown as ClientAgg });
const kal = { udalosti: [{ zaciatok: "2026-10-06T09:30", klient: "Lukas Hanus", typ: "trening" }] };
const rano = new Date("2026-10-06T05:00:00Z");   // 7:00 v Prahe
const poObede = new Date("2026-10-06T12:00:00Z"); // 14:00 v Prahe

describe("pripomienka pri dnešnom tréningu hovorí stav PRED ním", () => {
  it("ráno s 1 h → dnes má poslednú hodinu", () => {
    expect(dnesneTreningy(klient(1), [], kal, {}, rano)[0].title).toContain("dnes má poslednú hodinu z balíčka");
  });
  it("po tréningu s 0 h → stále tá istá veta, nie „minuté“", () => {
    expect(dnesneTreningy(klient(0), [], kal, {}, poObede)[0].title).toContain("dnes má poslednú hodinu z balíčka");
  });
  it("ráno s −1 → hodiny minuté, dnešný je nad rámec (−2)", () => {
    expect(dnesneTreningy(klient(-1), [], kal, {}, rano)[0].title).toContain("hodiny má minuté — dnešný tréning je nad rámec (−2)");
  });
  it("s hodinami navyše nehlási nič", () => {
    expect(dnesneTreningy(klient(4), [], kal, {}, rano)).toEqual([]);
  });
});
