// Zdravie vzťahu — štyri signály s mierkou a jedna veta.
import { describe, expect, it } from "bun:test";

import { zdravieKlienta } from "./klientZdravie";
import type { ClientAgg } from "./compute";

const klient = (o: Partial<ClientAgg> = {}) => ({
  name: "Test", sessionCount: 30, firstSession: "2025-09-01", ...o,
} as ClientAgg);

const vstupy = (o: Partial<Parameters<typeof zdravieKlienta>[2]> = {}) => ({
  tempoTeraz: 3, tempoPredtym: 3, zrusene: 0, bolestPrve: null, bolestPosledne: null,
  obnovil: 3, mohol: 3, zrusenePriemer: 0.8, ...o,
});

describe("signály", () => {
  it("padajúce tempo je zlý signál", () => {
    const z = zdravieKlienta(klient(), [klient()], vstupy({ tempoTeraz: 2, tempoPredtym: 4 }));
    expect(z.signaly.find((s) => s.id === "tempo")!.tón).toBe("zle");
  });

  it("stabilné tempo je dobrý signál", () => {
    expect(zdravieKlienta(klient(), [klient()], vstupy()).signaly.find((s) => s.id === "tempo")!.tón).toBe("dobre");
  });

  it("krátka história netvrdí trend, povie „nevieme“", () => {
    // Pri nováčikovi by porovnanie s nulou vyrobilo −100 % a appka by ho
    // hlásila ako odchádzajúceho. Tá istá chyba ako pri tempe v profile.
    const s = zdravieKlienta(klient(), [klient()], vstupy({ tempoPredtym: 0 })).signaly.find((x) => x.id === "tempo")!;
    expect(s.tón).toBe("nevieme");
  });

  it("bolesť bez dvoch meraní sa netvrdí", () => {
    // „Zostal rok" je vernosť, nie zlepšenie — výsledok sa smie tvrdiť len
    // z porovnania prvého a posledného merania toho istého človeka.
    const s = zdravieKlienta(klient(), [klient()], vstupy({ bolestPrve: 7, bolestPosledne: null })).signaly.find((x) => x.id === "bolest")!;
    expect(s.tón).toBe("nevieme");
    expect(s.hodnota).toBe("nemeraná");
  });

  it("bolesť, ktorá klesla, je dobrý signál", () => {
    const s = zdravieKlienta(klient(), [klient()], vstupy({ bolestPrve: 7, bolestPosledne: 3 })).signaly.find((x) => x.id === "bolest")!;
    expect(s.tón).toBe("dobre");
    expect(s.detail).toBe("zlepšenie o 4");
  });

  it("pri zrušených je MENEJ lepšie — mierka sa obracia", () => {
    const malo = zdravieKlienta(klient(), [klient()], vstupy({ zrusene: 0 })).signaly.find((x) => x.id === "zrusene")!;
    const vela = zdravieKlienta(klient(), [klient()], vstupy({ zrusene: 4 })).signaly.find((x) => x.id === "zrusene")!;
    expect(malo.podiel).toBeGreaterThan(vela.podiel);
  });

  it("prvý balíček sa nepočíta ako vynechaná obnova", () => {
    const s = zdravieKlienta(klient(), [klient()], vstupy({ obnovil: 0, mohol: 0 })).signaly.find((x) => x.id === "obnovy")!;
    expect(s.tón).toBe("nevieme");
  });
});

describe("záver", () => {
  it("keď je všetko v poriadku, netvrdí nič zlé", () => {
    const z = zdravieKlienta(klient(), [klient()], vstupy({ bolestPrve: 6, bolestPosledne: 3 }));
    expect(z.tón).toBe("dobre");
    expect(z.zaver).toBe("Nič nenaznačuje, že by odchádzal.");
  });

  it("dva zlé signály znamenajú „Pozor“", () => {
    const z = zdravieKlienta(klient(), [klient()], vstupy({ tempoTeraz: 1, tempoPredtym: 4, zrusene: 5 }));
    expect(z.tón).toBe("zle");
    expect(z.zaver.startsWith("Pozor")).toBe(true);
  });

  it("záver menuje aj to, čo drží — nie je to len výčitka", () => {
    const z = zdravieKlienta(klient(), [klient()], vstupy({ tempoTeraz: 2, tempoPredtym: 4, bolestPrve: 7, bolestPosledne: 2 }));
    expect(z.zaver).toContain("drží");
  });
});
