import { describe, expect, it } from "bun:test";

import { podlaRodu, rodKlienta } from "./rodKlienta";

describe("rod klienta z ostrých mien", () => {
  const ZENY = [
    "Katarína Mátlová", "Radka Kovaříková", "Linda Muth", "Natalia Peckova", "Barbora Vanková", "Marcela Hruzova",
    "Veronika Stoklaskova", "Lucie Podolova", "Regina Obrovska", "Naďa Khamaziuk", "Ester", "Nikol", "Anetka",
    "Jolona Hořovská", "Prochazkova", "Terézia", "Ĺudmila", "Magdálena", "Petra Bambúšková", "Maria",
  ];
  const MUZI = [
    "Radek Baláž", "Jarek Heinrich", "Branislav Široký", "Roman Pavlik", "Roman Jakubiček", "Martin Vaško", "Albert Matl",
    "Vítězslav Papiež", "Tomáš Mareš", "Ondra", "Vojta", "Jirka", "Luky", "Zdeněk", "Panagiotis", "Milan Bařina", "Josef Pávek",
  ];

  for (const m of ZENY) it(`${m} je žena`, () => expect(rodKlienta(m)).toBe("z"));
  for (const m of MUZI) it(`${m} je muž`, () => expect(rodKlienta(m)).toBe("m"));

  it("pri neistote neutrálne, nikdy mužský", () => {
    for (const m of ["", null, undefined, "Nikola", "Saša", "Peťa", "Bez mena", "Xyz", "Robin"]) {
      expect(rodKlienta(m)).toBe("?");
    }
  });

  it("priezvisko rozhodne pri neistom krstnom", () => {
    expect(rodKlienta("Nikola Dvořáková")).toBe("z");
    expect(rodKlienta("Saša Široký")).toBe("m");
  });

  it("keď si krstné a priezvisko protirečia, je to neutrálne", () => {
    expect(rodKlienta("Martin Nováková")).toBe("?");
    expect(rodKlienta("Jana Široký")).toBe("?");
  });

  it("dovetok z kalendára rod nemení", () => {
    expect(rodKlienta("Romana Prochádzková- diagnostika")).toBe("z");
  });

  it("podlaRodu dá neutrálnu vetu, nie mužský tvar", () => {
    const t = { m: "neprišiel", z: "neprišla", neutralne: "neukázal(a) sa" };
    expect(podlaRodu("Radka Kovaříková", t)).toBe("neprišla");
    expect(podlaRodu("Radek Baláž", t)).toBe("neprišiel");
    expect(podlaRodu("Saša", t)).toBe("neukázal(a) sa");
  });
});
