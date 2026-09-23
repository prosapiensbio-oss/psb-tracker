// Zdravie vzťahu — signály s mierkou a jedna veta.
import { describe, expect, it } from "bun:test";

import { zdravieKlienta } from "./klientZdravie";
import type { ClientAgg } from "./compute";

const klient = (o: Partial<ClientAgg> = {}) => ({
  name: "Test", sessionCount: 30, firstSession: "2025-09-01",
  attendance: 0.8, avgPrice: 1000, sessions: [], ...o,
} as unknown as ClientAgg);

const vstupy = (o: Partial<Parameters<typeof zdravieKlienta>[1]> = {}) => ({
  tempoTeraz: 3, tempoPredtym: 3, zrusene: 0,
  priemery: { tempo: 2.8, zrusene: 0.8, dochadzka: 0.8, vztah: 12, hodinovka: 1000 },
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



  it("dochádzka pod priemerom je varovanie", () => {
    const s = zdravieKlienta(klient({ attendance: 0.5 }), vstupy()).signaly.find((x) => x.id === "dochadzka")!;
    expect(s.tón).toBe("zle");
    expect(s.mierka).toBe("priemer klientely 80 %");
  });

  it("klient bez odtrénovaného tréningu nemá dochádzku ani dĺžku vzťahu", () => {
    const z = zdravieKlienta(klient({ sessionCount: 0, firstSession: "" }), vstupy());
    expect(z.signaly.find((x) => x.id === "dochadzka")!.tón).toBe("nevieme");
    expect(z.signaly.find((x) => x.id === "vztah")!.tón).toBe("nevieme");
  });

  it("nováčik so zľavou nie je „pozor“ — kontext sa do záveru nepočíta", () => {
    // Dĺžka vzťahu a hodinovka sú kontext. Keby zhoršovali záver, appka by
    // varovala pri každom novom klientovi so zľavou a človek by prestal
    // čítať aj tie riadky, ktoré varovanie naozaj sú.
    const z = zdravieKlienta(
      klient({ firstSession: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), avgPrice: 500 }),
      vstupy(),
    );
    expect(z.signaly.find((x) => x.id === "vztah")!.doZaveru).toBe(false);
    expect(z.signaly.find((x) => x.id === "hodinovka")!.doZaveru).toBe(false);
    expect(z.tón).toBe("dobre");
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
    const z = zdravieKlienta(klient(), vstupy({ tempoTeraz: 4, priemery: { tempo: 2, zrusene: 0.8, dochadzka: 0.8, vztah: 12, hodinovka: 1000 } }));
    const s = z.signaly.find((x) => x.id === "tempo")!;
    expect(s.podiel).toBeGreaterThan(s.priemer);
    expect(s.mierka).toBe("priemer klientely 2.0");
  });

});
