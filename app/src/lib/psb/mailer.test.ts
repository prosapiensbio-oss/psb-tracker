import { describe, expect, it } from "bun:test";

import { aktivni, mieryKampane, odberateliaKtoriSuKlienti, prihlaseniaPoMesiacoch, type Odberatel } from "./mailer";

const o = (prihlaseny: string, email = "a@b.cz", status = "active"): Odberatel =>
  ({ id: email + prihlaseny, email, prihlaseny, status, skupiny: "" });

describe("miery kampane", () => {
  const k = { id: "1", nazov: "x", odoslane: "2026-07-19", prijemcov: 414, otvorenia: 81, prekliky: 3, odhlasenia: 2 };

  it("otvorenosť a preklikovosť sú z počtu príjemcov", () => {
    const m = mieryKampane(k);
    expect(Math.round(m.otvorenost!)).toBe(20);
    expect(m.preklikovost!.toFixed(2)).toBe("0.72");
  });

  it("preklik z otvorených oddeľuje predmet od obsahu", () => {
    // 3 z 81 otvorených. Nízka celková preklikovosť pri vysokej tejto znamená
    // slabý predmet, nie slabý text — a opravovať sa má to prvé.
    expect(Math.round(mieryKampane(k).preklikZOtvorenych!)).toBe(4);
  });

  it("kampaň bez príjemcov nedelí nulou", () => {
    const m = mieryKampane({ ...k, prijemcov: 0, otvorenia: 0, prekliky: 0 });
    expect(m.otvorenost).toBeNull();
    expect(m.preklikZOtvorenych).toBeNull();
  });
});

describe("prihlásenia po mesiacoch", () => {
  it("mesiac bez prihlásenia sa doplní ako nula", () => {
    // Bez toho by graf preskočil prázdne obdobie a plochý rad by vyzeral
    // ako rastúci — presne to, čo má karta odhaliť.
    const v = prihlaseniaPoMesiacoch([o("2026-05-03"), o("2026-08-01")]);
    expect(v.map((x) => x.m)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(v.map((x) => x.v)).toEqual([1, 0, 0, 1]);
  });

  it("prechod cez koniec roka", () => {
    const v = prihlaseniaPoMesiacoch([o("2025-12-30"), o("2026-01-02")]);
    expect(v.map((x) => x.m)).toEqual(["2025-12", "2026-01"]);
  });

  it("prázdny vstup nespadne", () => {
    expect(prihlaseniaPoMesiacoch([])).toEqual([]);
  });

  it("odberateľ bez dátumu sa nezapočíta ako neznámy mesiac", () => {
    expect(prihlaseniaPoMesiacoch([o(""), o("2026-08-01")]).map((x) => x.m)).toEqual(["2026-08"]);
  });
});

describe("odberatelia, ktorí sú klientmi", () => {
  it("páruje sa na e-mail bez ohľadu na veľkosť písmen a medzery", () => {
    const v = odberateliaKtoriSuKlienti(
      [o("2026-01-01", " Jan@Novak.CZ "), o("2026-01-02", "nikto@nikde.sk")],
      ["jan@novak.cz"],
    );
    expect(v).toMatchObject({ spolu: 2, klientov: 1 });
    expect(Math.round(v.podiel!)).toBe(50);
  });

  it("bez e-mailov klientov vráti nulu, nie chybu", () => {
    const v = odberateliaKtoriSuKlienti([o("2026-01-01")], []);
    expect(v.klientov).toBe(0);
    expect(v.podiel).toBe(0);
  });

  it("prázdny e-mail sa nespáruje s prázdnym", () => {
    // Inak by každý odberateľ bez mailu vyzeral ako klient bez mailu.
    const v = odberateliaKtoriSuKlienti([o("2026-01-01", "")], [""]);
    expect(v.klientov).toBe(0);
  });
});

describe("aktívni", () => {
  it("odhlásení sa nepočítajú", () => {
    expect(aktivni([o("2026-01-01", "a@b.cz"), o("2026-01-02", "c@d.cz", "unsubscribed")])).toBe(1);
  });
});
