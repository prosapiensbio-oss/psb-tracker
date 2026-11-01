import { describe, expect, it } from "bun:test";

import { bezAktivnehoBalicka, treningyZObochZdrojov, type KlientPreKartu } from "./bezBalicka";
import type { Balicek } from "./balickyEvidencia";

const DNES = "2026-09-28";

const kl = (o: Partial<KlientPreKartu> & { name: string }): KlientPreKartu => ({
  status: "Aktívny", primaryTrainer: "Jerry", membership: "OFF - 6h BEZ viazanosti",
  packageRemaining: 0, packageTotal: 6, packageValidTo: "2026-10-04",
  lastSession: "2026-09-23", ...o,
});

const bal = (o: Partial<Balicek> & { klient: string }): Balicek => ({
  id: "b", nazov: "OFF - 6h BEZ viazanosti", hodiny: 6, platnostOd: "2026-09-25",
  platnostDo: "2026-11-25", cenaCzk: 7790, zdroj: "rucne", zruseneAt: null, ...o,
});

describe("bezAktivnehoBalicka", () => {
  it("vezme aktívneho klienta bez hodín", () => {
    const v = bezAktivnehoBalicka([kl({ name: "Richard Matl" })], [], [], DNES);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ meno: "Richard Matl", dovod: "hodiny minuté", dni: 5 });
  });

  it("neaktívneho ani na pauze nevezme", () => {
    const l = [kl({ name: "A", status: "Neaktívny" }), kl({ name: "B", status: "Pauza" })];
    expect(bezAktivnehoBalicka(l, [], [], DNES)).toHaveLength(0);
  });

  it("kto má hodiny, v zozname nie je", () => {
    expect(bezAktivnehoBalicka([kl({ name: "A", packageRemaining: 3 })], [], [], DNES)).toHaveLength(0);
  });

  it("hodiny má, ale platnosť skončila — patrí tam", () => {
    const v = bezAktivnehoBalicka([kl({ name: "Jakub Gerich", packageRemaining: 1, packageValidTo: "2026-09-02" })], [], [], DNES);
    expect(v[0]).toMatchObject({ dovod: "platnosť skončila", platnostDo: "2026-09-02" });
  });

  it("balíček nahodený v Kokpite ho zo zoznamu vezme preč", () => {
    // Presne to, čo Jerry robí: klientovi došli hodiny, zapíše mu nový
    // balíček — a karta sa musí vyprázdniť, inak sa prestane čítať.
    const l = [kl({ name: "Richard Matl" })];
    expect(bezAktivnehoBalicka(l, [bal({ klient: "Richard Matl" })], [], DNES)).toHaveLength(0);
  });

  it("kópia exportu v `balicky` klienta zo zoznamu NESCHOVÁ", () => {
    // Richard Matl, 28. 9. 2026: 6 h kúpených 10. 8., všetky minuté. V
    // `balicky` má ten istý balíček naliaty z exportu — a odtrénované hodiny
    // by sa k nemu rátali z kalendára, ktorý siaha pár týždňov dozadu. Karta
    // ho tak vynechala, hoci na karte klienta stojí 0 h.
    const l = [kl({ name: "Richard Matl" })];
    const kopia = bal({ klient: "Richard Matl", zdroj: "ptminder", platnostOd: "2026-08-10", platnostDo: "2026-10-04" });
    const v = bezAktivnehoBalicka(l, [kopia], [], DNES);
    expect(v.map((x) => x.meno)).toEqual(["Richard Matl"]);
  });

  it("aj balíček z Kokpitu sa dá minúť", () => {
    const udalosti = ["2026-09-25", "2026-09-26", "2026-09-27"].map((d) => ({ klient: "Richard Matl", zaciatok: `${d}T17:00`, typ: "trening" }));
    const l = [kl({ name: "Richard Matl" })];
    expect(bezAktivnehoBalicka(l, [bal({ klient: "Richard Matl", hodiny: 3 })], udalosti, DNES)).toHaveLength(1);
  });

  it("paušál nie je chýbajúci balíček", () => {
    // GOLD a spol. stoja v exporte navždy na 0/0 — nemíňajú sa po hodinách.
    const l = [kl({ name: "Paušalista", membership: "GOLD", packageTotal: 0, packageValidTo: "2026-12-31" })];
    expect(bezAktivnehoBalicka(l, [], [], DNES)).toHaveLength(0);
  });

  it("paušál po platnosti do zoznamu patrí", () => {
    const l = [kl({ name: "Paušalista", membership: "GOLD", packageTotal: 0, packageValidTo: "2026-08-31" })];
    expect(bezAktivnehoBalicka(l, [], [], DNES)).toHaveLength(1);
  });

  it("klient úplne bez členstva má vlastný dôvod", () => {
    const v = bezAktivnehoBalicka([kl({ name: "Nový", membership: "", packageTotal: 0, packageValidTo: "" })], [], [], DNES);
    expect(v[0].dovod).toBe("žiadne členstvo");
  });

  it("hore je ten, kto má objednaný termín", () => {
    const udalosti = [{ klient: "S termínom", zaciatok: "2026-10-01T17:00", typ: "trening" }];
    const l = [kl({ name: "Bez termínu", lastSession: "2026-09-27" }), kl({ name: "S termínom", lastSession: "2026-09-01" })];
    const v = bezAktivnehoBalicka(l, [], udalosti, DNES);
    expect(v.map((x) => x.meno)).toEqual(["S termínom", "Bez termínu"]);
    expect(v[0].objednanych).toBe(1);
  });
});

describe("treningyZObochZdrojov", () => {
  it("spojí export a kalendár, ten istý deň nezdvojí", () => {
    const v = treningyZObochZdrojov(
      [{ client: "Richard Matl", date: "2026-09-23T00:00:00Z" }],
      [
        { klient: "Richard Matl", zaciatok: "2026-09-23T17:00", typ: "trening" },
        { klient: "Richard Matl", zaciatok: "2026-09-28T17:00", typ: "trening" },
      ],
    );
    expect(v.map((x) => x.zaciatok.slice(0, 10))).toEqual(["2026-09-23", "2026-09-28"]);
  });

  it("nepomenovanú udalosť ani iný typ neberie", () => {
    const v = treningyZObochZdrojov([], [
      { klient: null, zaciatok: "2026-09-24T10:00", typ: "trening" },
      { klient: "Richard Matl", zaciatok: "2026-09-25T10:00", typ: "veterina" },
    ]);
    expect(v).toHaveLength(0);
  });
});

describe("poradie podľa mínusu", () => {
  it("najhlbší mínus je hore, objednané termíny rozhodujú až potom", () => {
    const l = [
      kl({ name: "Na nule, dva termíny" }),
      kl({ name: "Tri v mínuse" }),
      kl({ name: "Jeden v mínuse" }),
    ];
    const minus: Record<string, number> = { "Tri v mínuse": 3, "Jeden v mínuse": 1 };
    const udalosti = [
      { klient: "Na nule, dva termíny", zaciatok: "2026-10-01T17:00", typ: "trening" },
      { klient: "Na nule, dva termíny", zaciatok: "2026-10-03T17:00", typ: "trening" },
    ];
    const v = bezAktivnehoBalicka(l, [], udalosti, DNES, (m) => minus[m] || 0);
    expect(v.map((x) => [x.meno, x.vMinuse])).toEqual([
      ["Tri v mínuse", 3],
      ["Jeden v mínuse", 1],
      ["Na nule, dva termíny", 0],
    ]);
  });

  it("bez funkcie na mínus je všade nula a nič nespadne", () => {
    expect(bezAktivnehoBalicka([kl({ name: "A" })], [], [], DNES)[0].vMinuse).toBe(0);
  });

  describe("kontrola po nasadení, 1. 11. 2026", () => {
    const D = "2026-11-01";
    const prazdny = { membership: "", packageTotal: 0, packageRemaining: 0, packageValidTo: "" };
    const dopl = (klient: string): Balicek => bal({ klient, nazov: "Doplnenie členstva", hodiny: 1, platnostOd: "2026-10-13", platnostDo: null, cenaCzk: 0, zdroj: "rucne" });

    it("Štigut: minuté doplnenie je „hodiny minuté“, nie „žiadne členstvo“", () => {
      const v = bezAktivnehoBalicka([kl({ name: "Jakub Štigut", ...prazdny, lastSession: "2026-10-20" })], [{ ...dopl("Jakub Štigut"), hodiny: 1 }], [{ klient: "Jakub Štigut", zaciatok: "2026-10-20", typ: "trening" }], D);
      expect(v[0]).toMatchObject({ dovod: "hodiny minuté", platnostDo: "" });
    });

    it("kto nikdy nič nemal, je „žiadne členstvo“; zrušený balíček sa neráta", () => {
      const v = bezAktivnehoBalicka([kl({ name: "A", ...prazdny })], [bal({ klient: "A", zruseneAt: "2026-10-01", platnostDo: "2026-10-01" })], [], D);
      expect(v[0].dovod).toBe("žiadne členstvo");
    });

    it("skončený balíček bez členstva na karte: platnosť skončila s dátumom", () => {
      const v = bezAktivnehoBalicka([kl({ name: "A", ...prazdny })], [bal({ klient: "A", platnostOd: "2026-08-01", platnostDo: "2026-10-05", zdroj: "ptminder" })], [], D);
      expect(v[0]).toMatchObject({ dovod: "platnosť skončila", platnostDo: "2026-10-05" });
    });

    it("Stoklasko: Sporadický s termínom je v zozname aj Stoklásková bez termínu do mesiaca", () => {
      const l = [
        kl({ name: "Svetopluk Stoklasko", status: "Sporadický", ...prazdny, lastSession: "2026-09-10" }),
        kl({ name: "Kateřina Stoklásková", status: "Sporadický", ...prazdny, lastSession: "2026-10-20" }),
        kl({ name: "Dávno Sporadický", status: "Sporadický", ...prazdny, lastSession: "2026-09-03" }),
      ];
      const v = bezAktivnehoBalicka(l, [], [{ klient: "Svetopluk Stoklasko", zaciatok: "2026-11-12T10:00", typ: "trening" }], D);
      expect(v.map((x) => x.meno).sort()).toEqual(["Kateřina Stoklásková", "Svetopluk Stoklasko"]);
      expect(v.find((x) => x.meno === "Svetopluk Stoklasko")?.objednanych).toBe(1);
    });

    it("Sporadický, ktorý mal len úvodný, bez termínu v zozname nie je; s termínom áno", () => {
      const u = bal({ klient: "Linda", nazov: "Úvodní trénink", hodiny: 1, platnostOd: "2026-10-26", platnostDo: "2026-10-26" });
      const l = [kl({ name: "Linda", status: "Sporadický", ...prazdny, lastSession: "2026-10-26" })];
      expect(bezAktivnehoBalicka(l, [u], [], D)).toHaveLength(0);
      const v = bezAktivnehoBalicka(l, [u], [{ klient: "Linda", zaciatok: "2026-11-05T10:00", typ: "trening" }], D);
      expect(v[0]).toMatchObject({ meno: "Linda", dovod: "hodiny minuté" });
    });

    it("Neaktívny a Pauza s termínom patria do zoznamu; kto ešte netrénoval, nie (čaká ho úvodný)", () => {
      const t = (klient: string) => ({ klient, zaciatok: "2026-11-08T10:00", typ: "uvodny" });
      const l = [
        kl({ name: "Neaktívny", status: "Neaktívny", ...prazdny, lastSession: "2026-05-01" }),
        kl({ name: "Na pauze", status: "Pauza", ...prazdny, lastSession: "2026-05-01" }),
        kl({ name: "Nový", status: "Neaktívny", ...prazdny, lastSession: "" }),
      ];
      const v = bezAktivnehoBalicka(l, [], [t("Neaktívny"), t("Na pauze"), t("Nový")], D);
      expect(v.map((x) => x.meno).sort()).toEqual(["Na pauze", "Neaktívny"]);
    });

    it("Radek: ukončený s termínom v zozname nie je, kým netrénoval; potom áno, s vlastným dôvodom", () => {
      const r = { name: "Radek Balaž", status: "Neaktívny", ukonceny: true, membership: "OFF - 18 hodín offline", packageTotal: 5, packageValidTo: "2026-10-13", lastSession: "2026-10-08" };
      const termin = [{ klient: "Radek Balaž", zaciatok: "2026-11-17T10:00", typ: "trening" }];
      expect(bezAktivnehoBalicka([kl({ ...r, packageRemaining: 0 })], [], termin, D)).toHaveLength(0);
      const v = bezAktivnehoBalicka([kl({ ...r, packageRemaining: -1 })], [], termin, "2026-11-18");
      expect(v[0]).toMatchObject({ meno: "Radek Balaž", dovod: "balíček ukončený" });
    });

    it("termín ďaleko dopredu počíta aj za oknom kalendára, deň sa neráta dvakrát", () => {
      const u = treningyZObochZdrojov([], [{ klient: "A", zaciatok: "2026-11-05T10:00", typ: "trening" }], [
        { klient: "A", zaciatok: "2026-11-05T10:00" }, { klient: "A", zaciatok: "2026-12-05T10:00" }, { klient: null, zaciatok: "2026-12-06T10:00" },
      ]);
      expect(u.map((x) => x.zaciatok)).toEqual(["2026-11-05T10:00", "2026-12-05T10:00"]);
    });
  });
});
