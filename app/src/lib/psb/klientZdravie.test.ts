// Zdravie vzťahu — signály s mierkou a jedna veta.
import { describe, expect, it } from "bun:test";

import { zdravieKlienta } from "./klientZdravie";
import type { ClientAgg } from "./compute";

const klient = (o: Partial<ClientAgg> = {}) => ({
  name: "Test", sessionCount: 30, firstSession: "2025-09-01", ...o,
} as ClientAgg);

const vstupy = (o: Partial<Parameters<typeof zdravieKlienta>[1]> = {}) => ({
  tempoTeraz: 3, tempoPredtym: 3, zrusene: 0, dniOdPosledneho: 7, obvyklyOdstup: 8,
  priemery: { tempo: 2.8, zrusene: 0.8 },
  ...o,
});

describe("signály", () => {
  it("padajúce tempo je zlý signál", () => {
    const z = zdravieKlienta(klient(), vstupy({ tempoTeraz: 2, tempoPredtym: 4 }));
    expect(z.signaly.find((s) => s.id === "tempo")!.tón).toBe("zle");
  });

  it("stabilné tempo je dobrý signál", () => {
    expect(zdravieKlienta(klient(), vstupy()).signaly.find((s) => s.id === "tempo")!.tón).toBe("dobre");
  });

  it("krátka história netvrdí trend, povie „nevieme“", () => {
    // Pri nováčikovi by porovnanie s nulou vyrobilo −100 % a appka by ho
    // hlásila ako odchádzajúceho. Tá istá chyba ako pri tempe v profile.
    const s = zdravieKlienta(klient(), vstupy({ tempoPredtym: 0 })).signaly.find((x) => x.id === "tempo")!;
    expect(s.tón).toBe("nevieme");
  });

  it("medzera dvaapolnásobne dlhšia než obvyklá je zlý signál", () => {
    const s = zdravieKlienta(klient(), vstupy({ dniOdPosledneho: 21, obvyklyOdstup: 7 })).signaly.find((x) => x.id === "medzera")!;
    expect(s.tón).toBe("zle");
    expect(s.mierka).toBe("jeho obvyklý odstup 7 dní");
  });

  it("medzera v rámci obvyklého rytmu je v poriadku", () => {
    expect(zdravieKlienta(klient(), vstupy({ dniOdPosledneho: 6, obvyklyOdstup: 7 })).signaly.find((x) => x.id === "medzera")!.tón).toBe("dobre");
  });

  it("bez histórie odstupu sa netvrdí nič", () => {
    expect(zdravieKlienta(klient(), vstupy({ obvyklyOdstup: null })).signaly.find((x) => x.id === "medzera")!.tón).toBe("nevieme");
  });

  it("pri zrušených je MENEJ lepšie — mierka sa obracia", () => {
    const malo = zdravieKlienta(klient(), vstupy({ zrusene: 0 })).signaly.find((x) => x.id === "zrusene")!;
    const vela = zdravieKlienta(klient(), vstupy({ zrusene: 4 })).signaly.find((x) => x.id === "zrusene")!;
    expect(malo.podiel).toBeGreaterThan(vela.podiel);
  });
});

describe("záver", () => {
  it("keď je všetko v poriadku, netvrdí nič zlé", () => {
    const z = zdravieKlienta(klient(), vstupy());
    expect(z.tón).toBe("dobre");
    expect(z.zaver).toBe("Nič nenaznačuje, že by odchádzal.");
  });

  it("dva zlé signály znamenajú „Pozor“", () => {
    const z = zdravieKlienta(klient(), vstupy({ tempoTeraz: 1, tempoPredtym: 4, zrusene: 5 }));
    expect(z.tón).toBe("zle");
    expect(z.zaver.startsWith("Pozor")).toBe(true);
  });

  it("záver menuje aj to, čo drží — nie je to len výčitka", () => {
    const z = zdravieKlienta(klient(), vstupy({ tempoTeraz: 2, tempoPredtym: 4 }));
    expect(z.zaver).toContain("drží");
  });
});

describe("priemery sú priemery klientely, nie odvodenina od jedného klienta", () => {
  it("tempo nad priemerom je vpravo od čiarky", () => {
    const z = zdravieKlienta(klient(), vstupy({ tempoTeraz: 4, priemery: { tempo: 2, zrusene: 0.8 } }));
    const s = z.signaly.find((x) => x.id === "tempo")!;
    expect(s.podiel).toBeGreaterThan(s.priemer);
    expect(s.mierka).toBe("priemer klientely 2.0");
  });

  it("medzera sa porovnáva s JEHO rytmom, nie s klientelou", () => {
    // Kto chodí raz za dva týždne, nemešká, keď je desať dní preč.
    const s = zdravieKlienta(klient(), vstupy({ dniOdPosledneho: 10, obvyklyOdstup: 14 })).signaly.find((x) => x.id === "medzera")!;
    expect(s.mierka).toBe("jeho obvyklý odstup 14 dní");
    expect(s.tón).toBe("dobre");
  });
});
