import { describe, expect, it } from "bun:test";

import { dnesneTreningy, zaplateneVopredNaDalsi, type ClientAgg } from "./compute";

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
    expect(dnesneTreningy(klient(-1), [], kal, {}, rano)[0].title).toContain("hodiny má minuté — s dnešným tréningom 2 h nad rámec");
  });
  it("s hodinami navyše nehlási nič", () => {
    expect(dnesneTreningy(klient(4), [], kal, {}, rano)).toEqual([]);
  });
});

// Jan Kral, 9. 11. 2026: balíček 9. 10. – 8. 11. minutý, ďalší zaplatený vopred
// 4. 11. a vznikne až dnešným tréningom. Ráno prišlo „1 h nad rámec".
describe("zaplatený ďalší balíček nie je hodina nad rámec", () => {
  it("kto má ďalší zaplatený, nedostane vetu o minutých hodinách", () => {
    expect(dnesneTreningy(klient(0), [], kal, {}, rano, [], zaplateneVopredNaDalsi({ naDalsiZaplatene: ["Lukas Hanus"] }))).toEqual([]);
  });
  it("ostatní ju dostanú ďalej", () => {
    expect(dnesneTreningy(klient(0), [], kal, {}, rano, [], zaplateneVopredNaDalsi({}))[0].title).toContain("1 h nad rámec");
  });
});
