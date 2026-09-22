// Vlastná evidencia balíčkov — druhá polovica odchodu od PTmindera.
import { describe, expect, it } from "bun:test";

import { jeAktivny, odtrenovane, porovnajBalicky, type Balicek, type PtBalicek } from "./balickyEvidencia";

const DNES = "2026-09-22";
const b = (o: Partial<Balicek> & { klient: string }): Balicek => ({
  id: o.id || Math.random().toString(36).slice(2),
  klient: o.klient,
  nazov: o.nazov ?? "OFF - 6h",
  hodiny: o.hodiny === undefined ? 6 : o.hodiny,
  platnostOd: o.platnostOd ?? "2026-09-01",
  platnostDo: o.platnostDo === undefined ? "2026-10-31" : o.platnostDo,
  cenaCzk: o.cenaCzk ?? null,
  zdroj: o.zdroj ?? "rucne",
  zruseneAt: o.zruseneAt ?? null,
});
const pt = (o: Partial<PtBalicek> & { klient: string }): PtBalicek => ({
  klient: o.klient,
  nazov: o.nazov ?? "OFF - 6h",
  zostava: o.zostava ?? 0,
  spolu: o.spolu ?? 6,
  platnostOd: o.platnostOd ?? "2026-09-01",
  platnostDo: o.platnostDo ?? "2026-10-31",
});
const u = (klient: string, den: string, typ: string | null = "trening") => ({ klient, zaciatok: `${den}T10:00:00Z`, typ });

describe("jeAktivny", () => {
  it("balíček po platnosti neplatí", () => {
    expect(jeAktivny(b({ klient: "A", platnostDo: "2026-09-01" }), DNES)).toBe(false);
  });
  it("balíček bez konca platí ďalej", () => {
    expect(jeAktivny(b({ klient: "A", platnostDo: null }), DNES)).toBe(true);
  });
  it("zrušený neplatí, aj keď je v platnosti", () => {
    expect(jeAktivny(b({ klient: "A", zruseneAt: "2026-09-10" }), DNES)).toBe(false);
  });
});

describe("odtrenovane", () => {
  it("počíta len tréningy v okne a len tréningy", () => {
    const ud = [
      u("Jan Kral", "2026-09-05"),
      u("Jan Kral", "2026-08-20"),            // pred oknom
      u("Jan Kral", "2026-09-10", "sukromne"), // nie tréning
      u("Eva Nova", "2026-09-06"),             // iný klient
    ];
    expect(odtrenovane(ud, "Jan Kral", "2026-09-01", DNES)).toBe(1);
  });
  it("meno sa páruje bez diakritiky", () => {
    expect(odtrenovane([u("Zuzana Spoligová", "2026-09-05")], "Zuzana Spoligova", "2026-09-01", DNES)).toBe(1);
  });
});

describe("porovnajBalicky", () => {
  it("zhodný zostatok je „sedí“", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jan Kral", hodiny: 6 })],
      [pt({ klient: "Jan Kral", zostava: 4, spolu: 6 })],
      [u("Jan Kral", "2026-09-05"), u("Jan Kral", "2026-09-12")],
      DNES,
    );
    expect(v.riadky[0].kokpit).toBe(4);
    expect(v.riadky[0].ptminder).toBe(4);
    expect(v.riadky[0].stav).toBe("sedi");
    expect(v.sedi).toBe(1);
  });

  it("rozdiel sa ukáže aj so znamienkom", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jan Kral", hodiny: 6 })],
      [pt({ klient: "Jan Kral", zostava: 2, spolu: 6 })],
      [u("Jan Kral", "2026-09-05")],
      DNES,
    );
    expect(v.riadky[0].kokpit).toBe(5);
    expect(v.riadky[0].rozdiel).toBe(3);
    expect(v.rozdiel).toBe(1);
  });

  it("dva balíčky naraz sa porovnávajú v súčte, nie po kuse", () => {
    // Gažo: dve členstvá cez seba. V deň prekryvu sa nedá povedať, ktorému
    // z nich PTminder hodinu strhol — súčet je jednoznačný, kus nie.
    const v = porovnajBalicky(
      [b({ klient: "Peter Gažo", hodiny: 18, platnostOd: "2026-07-01" }), b({ klient: "Peter Gažo", hodiny: 18, platnostOd: "2026-07-24" })],
      [pt({ klient: "Peter Gažo", zostava: 0, spolu: 18 }), pt({ klient: "Peter Gažo", zostava: 5, spolu: 18 })],
      Array.from({ length: 31 }, (_, i) => u("Peter Gažo", `2026-08-${String((i % 28) + 1).padStart(2, "0")}`)),
      DNES,
    );
    expect(v.riadky[0].predane).toBe(36);
    expect(v.riadky[0].ptminder).toBe(5);
    expect(v.riadky).toHaveLength(1);
  });

  it("export 0/0 sa nepočíta ako nula — PTminder mlčí", () => {
    const v = porovnajBalicky(
      [b({ klient: "Anetka P", hodiny: 18 })],
      [pt({ klient: "Anetka P", zostava: 0, spolu: 0 })],
      [u("Anetka P", "2026-09-05")],
      DNES,
    );
    expect(v.riadky[0].stav).toBe("ptminderMlci");
    expect(v.riadky[0].ptminder).toBeNull();
    expect(v.rozdiel).toBe(0);
  });

  it("paušál nemá zostatok a nikdy nedôjde", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jakub Štigut", hodiny: null, nazov: "GOLD" })],
      [pt({ klient: "Jakub Štigut", zostava: 0, spolu: 0 })],
      [u("Jakub Štigut", "2026-09-05")],
      DNES,
    );
    expect(v.riadky[0].stav).toBe("pausal");
    expect(v.riadky[0].kokpit).toBeNull();
  });

  it("klient, ktorý je v PTminderi a v Kokpite nie, je nález — nie ticho", () => {
    const v = porovnajBalicky([], [pt({ klient: "Eva Nova", zostava: 3, spolu: 6 })], [], DNES);
    expect(v.riadky[0].stav).toBe("lenPtminder");
    expect(v.rozdiel).toBe(1);
  });

  it("balíček po platnosti sa do porovnania neberie", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jan Kral", platnostDo: "2026-08-31" })],
      [],
      [],
      DNES,
    );
    expect(v.riadky).toHaveLength(0);
  });

  it("zostatok nejde pod nulu", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jan Kral", hodiny: 2 })],
      [pt({ klient: "Jan Kral", zostava: 0, spolu: 2 })],
      [u("Jan Kral", "2026-09-05"), u("Jan Kral", "2026-09-06"), u("Jan Kral", "2026-09-07")],
      DNES,
    );
    expect(v.riadky[0].kokpit).toBe(0);
  });
});

// Prvé ostré porovnanie hlásilo 59 rozdielov a takmer všetky boli −1 h.
// Nebola to chyba výpočtu, bol to vek exportu.
describe("porovnáva sa k dátumu exportu, nie k dnešku", () => {
  it("tréning po poslednom dni exportu sa neodpočítava", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jan Kral", hodiny: 6 })],
      [pt({ klient: "Jan Kral", zostava: 5, spolu: 6 })],
      [u("Jan Kral", "2026-09-10"), u("Jan Kral", "2026-09-21")],
      DNES,
      "2026-09-20",
    );
    expect(v.riadky[0].odtrenovane).toBe(1);
    expect(v.riadky[0].kokpit).toBe(5);
    expect(v.riadky[0].stav).toBe("sedi");
  });

  it("bez horizontu sa ráta do dneška — a vtedy rozdiel vznikne", () => {
    const v = porovnajBalicky(
      [b({ klient: "Jan Kral", hodiny: 6 })],
      [pt({ klient: "Jan Kral", zostava: 5, spolu: 6 })],
      [u("Jan Kral", "2026-09-10"), u("Jan Kral", "2026-09-21")],
      DNES,
    );
    expect(v.riadky[0].rozdiel).toBe(-1);
  });
});

it("prázdny riadok v exporte nie je nález", () => {
  // „Doplnenie členstva" s nulovým zostatkom: PTminder hovorí nulu, Kokpit
  // nemá nič. To je tá istá odpoveď. Karta ich najprv hlásila 24.
  const v = porovnajBalicky([], [pt({ klient: "Bohdan Klímek", zostava: 0, spolu: 5 })], [], DNES);
  expect(v.riadky).toHaveLength(0);
  expect(v.rozdiel).toBe(0);
});
