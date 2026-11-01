// Komu sa ktorá notifikácia ukáže.
//
// Jerry, 31. 8. 2026: „tieto kontroly mám na starosti ja, tak tie sa nemusia
// Terezke zobrazovať v jej notifikáciách, nech ju nerozptyľujú… naopak jej sa
// zobrazujú notifikácie o dopytoch… všetky otázky ohľadom nových klientov
// smerovať na ňu. Samozrejme to neplatí na SMS po úvodnom — tá patrí tomu, kto
// mal s človekom úvodný tréning."
//
// Toto je jediné miesto, kde je to pravidlo napísané ako test. Priradenie sa
// dá pokaziť jedným riadkom v compute.ts a na obrazovke to nevidno — položka
// sa jednoducho niekomu prestane ukazovať, čo je presne ten druh tichej
// chyby, ktorý appku pripraví o dôveru.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import { deriveAnomalies, deriveClients, deriveRegister, deriveSixM, capacityByTrainer, patriTrenerovi, pripomienkaDovodu, pripomienkySlubov } from "./compute";
import { polozkaZastaranaBanka, polozkyBtcNesedi } from "./penazneNotifikacie";
import { ritualy } from "./rituals";
import { EMPTY_DATA, type PSBData, type SessionRow } from "./types";

const KLIENTI = {
  // Úvodný viedol Jerry, takže by mu podľa primárneho trénera pripadli aj
  // otázky o dopyte — a práve to sa nemá stať.
  "Novy Clovek": { primaryTrainer: "Jerry" },
};

const komu = (r: Parameters<typeof patriTrenerovi>[0]) =>
  (["Jerry", "Terezka"] as const).filter((t) => patriTrenerovi(r, KLIENTI, t));

describe("mesačné kontroly už neexistujú", () => {
  // Jerry, 11. 10. 2026: „mesačná kontrola ako zoznam úloh nemá existovať
  // vôbec." Prácu robí Workspace priebežne; kontrola bola tretie miesto na to
  // isté a odklepnúť sa dala bez toho, aby sa čokoľvek spravilo. Zostali len
  // PROMPTY pre Clauda — tie nie sú rituál, visia na karte Zdravie Kokpitu.
  it("ritualy() nevyrába ani jednu pripomienku druhu „kontrola“", () => {
    for (const den of ["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"]) {
      const r = ritualy(new Date(`${den}T09:00:00Z`), {}, {}, { chybaju: [] });
      expect(r.filter((x) => x.druh === "kontrola")).toHaveLength(0);
    }
  });
});

describe("otázky o nových klientoch idú Terezke", () => {
  it("„Prečo neprišiel znova“ nepatrí tomu, kto viedol úvodný, ale Terezke", () => {
    const clients = {
      "Novy Clovek": {
        name: "Novy Clovek", primaryTrainer: "Jerry", sessionCount: 1,
        sessions: [{ date: "2026-08-20", client: "Novy Clovek", sessionTrainer: "Jerry", sessionName: "Úvodní trénink", sessionType: "UVODNE", duration: 60, price: 0, time: "10:00" }],
      },
    } as any;
    const polozky = pripomienkaDovodu(clients, [], [], {}, new Date("2026-08-31T09:00:00Z"));
    const p = polozky.find((x) => x.title.includes("Novy Clovek"));
    expect(p).toBeTruthy();
    expect(p!.trener).toBe("Terezka");
    expect(komu(p!)).toEqual(["Terezka"]);
  });
});

// Jerry, 31. 8. 2026: „to je ďalšia kategória notifikácií, ktoré patria
// Jerrymu, pretože peniaze má na starosti on."
describe("peniaze patria Jerrymu", () => {
  const zdroj = readFileSync(new URL("../../components/psb/App.tsx", import.meta.url).pathname, "utf8");
  const kontrola = zdroj.slice(zdroj.indexOf("const kontrolaBanky"), zdroj.indexOf("const zmenyMetrik"));

  it("každá kontrola nad bankou a P&L, ktorá zostala v App.tsx, má trénera Jerry", () => {
    // Blok po bloku, nie počtom výskytov: počet by sedel aj vtedy, keby dva
    // trénery pristáli v jednej položke a inej by chýbal.
    //
    // Počet blokov sa NEKONTROLUJE — 3. 9. 2026 sa dva presunuli do knižnice
    // (`penazneNotifikacie.ts`), aby ich videla aj ranná dávka na telefón, a
    // pevné číslo by pri každom takom presune padlo bez toho, aby sa niečo
    // pokazilo. Testuje sa pravidlo, nie tvar súboru.
    const bloky = kontrola.split("out.push(").slice(1).map((c) => c.split("out.push(")[0])
      // Riadky, ktoré len delegujú na knižnicu (`out.push(...polozkyBtcNesedi(…))`),
      // sem nepatria — tréner sa v nich nastavuje na druhej strane a strážia
      // ho vlastné testy nižšie. Kontrolujú sa len položky písané tu na mieste.
      .filter((b) => b.includes("key,") || b.includes("key:"));
    const bez = bloky.filter((b) => !b.includes('trener: "Jerry"'));
    // Jediná výnimka: odchody klientov nie sú o peniazoch.
    expect(bez.length).toBe(1);
    expect(bez[0]).toContain("odišiel klient");
  });

  it("zastaraná banka patrí Jerrymu", () => {
    const p = polozkaZastaranaBanka("2026-07-31", {}, new Date("2026-09-03T09:00:00Z"));
    expect(p?.trener).toBe("Jerry");
    expect(komu(p!)).toEqual(["Jerry"]);
  });

  it("BTC nezhoda ide Jerrymu, nie trénerovi klienta", () => {
    // Novy Clovek je v tomto teste Jerryho, ale platilo by to aj o Terezkinom:
    // o peniazoch rozhoduje agenda, nie to, kto klienta trénuje.
    const p = polozkyBtcNesedi([], [{ klient: "Novy Clovek", datum: "2026-08-10", czk: 9000, sats: 400000 }], {});
    expect(p.length).toBe(1);
    expect(p[0].trener).toBe("Jerry");
    expect(komu(p[0])).toEqual(["Jerry"]);
  });
});

describe("SMS po úvodnom je výnimka — patrí tomu, kto úvodný viedol", () => {
  const udalosti = [
    { zaciatok: "2026-08-28T10:00", klient: "Novy Clovek", typ: "uvodny", trener: "Jerry", nazov: "Úvodní trénink", zmizlaAt: null },
  ] as any;

  it("SMS ide Jerrymu, hoci otázky o dopytoch idú Terezke", () => {
    const von = pripomienkySlubov(udalosti, [], {}, new Date("2026-08-29T09:00:00Z"));
    const sms = von.find((x) => x.title.startsWith("SMS po úvodnom"));
    expect(sms).toBeTruthy();
    expect(sms!.trener).toBe("Jerry");
    expect(komu(sms!)).toEqual(["Jerry"]);
  });

  it("„Úvodný bez dopytu“ o tom istom človeku ide naopak Terezke", () => {
    const von = pripomienkySlubov(udalosti, [], {}, new Date("2026-08-29T09:00:00Z"));
    const bez = von.find((x) => x.title.startsWith("Úvodný bez dopytu"));
    expect(bez).toBeTruthy();
    expect(bez!.trener).toBe("Terezka");
    expect(komu(bez!)).toEqual(["Terezka"]);
  });
});

/**
 * Položky bez vlastníka chodili obom (1. 11. 2026). Rozhoduje agenda:
 * peniaze a technické kontroly sú Jerryho, záver o klientovi jeho trénera.
 */
describe("položky bez klienta majú vlastníka", () => {
  const data = (extra: Record<string, unknown>) => ({ ...EMPTY_DATA, ...extra }) as PSBData;
  const register = (d: PSBData) => {
    const clients = deriveClients(d);
    const sixM = deriveSixM(d, clients);
    return { clients, polozky: deriveRegister(d, clients, sixM, capacityByTrainer(clients, d.sessions)) };
  };
  const u = (over: Partial<SessionRow> & { client: string; sessionTrainer: string }) => ({
    date: "2026-10-20", time: "10:00", sessionName: "Trénink", sessionType: "TRENING", duration: 60, price: 0, ...over,
  }) as SessionRow;

  it("web-kontrola ide Jerrymu", () => {
    const d = data({ webKontroly: [{ kluc: "formular:/x/", nazov: "Formulár", stav: "chyba", detail: "padlo" }] });
    const { clients, polozky } = register(d);
    const p = polozky.find((x) => x.key.startsWith("web-kontrola|"));
    expect(p?.trener).toBe("Jerry");
    expect(patriTrenerovi(p!, clients, "Terezka")).toBe(false);
  });

  it("vedomost ide Jerrymu", () => {
    const d = data({ vedomosti: [{ id: "v1", nazov: "Benchmarky", oCom: "Reklama.", overeneAt: "2025-01-01", obnovovatPoDnoch: 30 }] });
    const { clients, polozky } = register(d);
    const p = polozky.find((x) => x.key.startsWith("vedomost|"));
    expect(p?.trener).toBe("Jerry");
    expect(patriTrenerovi(p!, clients, "Terezka")).toBe(false);
  });

  it("záver bez klienta (prevádzka) ide Jerrymu", () => {
    const d = data({ zavery: [{ id: "z1", datum: "2026-01-01", tema: "prevadzka", zaver: "Skontrolovať nájom.", overit: "Sedí nájom?", overitDo: "2026-01-02" }] });
    const { clients, polozky } = register(d);
    const p = polozky.find((x) => x.key === "zaver|z1");
    expect(p?.trener).toBe("Jerry");
    expect(patriTrenerovi(p!, clients, "Terezka")).toBe(false);
    expect(p?.category).toBe("Rozhodnutie");
  });

  it("záver o klientovi ide jeho trénerovi — Terezkin Robin nie je Jerryho", () => {
    const d = data({
      sessions: [u({ client: "Robin Martinek", sessionTrainer: "Terezka" })],
      zavery: [{ id: "z2", datum: "2026-01-01", tema: "klienti", zaver: "Robin Martinek — trénovať hodovú mechaniku.", overit: "Pripomeň", overitDo: "2026-01-02" }],
    });
    const { clients, polozky } = register(d);
    const p = polozky.find((x) => x.key === "zaver|z2");
    expect(p?.trener).toBeUndefined();
    expect(p?.oKom).toBe("Robin Martinek");
    expect(patriTrenerovi(p!, clients, "Terezka")).toBe(true);
    expect(patriTrenerovi(p!, clients, "Jerry")).toBe(false);
  });

  it("anomália s klientom ostáva, kde bola — prenos trénera ju nezmenil", () => {
    const d = data({ payments: [{ client: "Nikto Neznamy", amount: 1000, date: "2026-10-01" }] });
    const a = deriveAnomalies(d, deriveClients(d)).find((x) => x.key === "orphan|Nikto Neznamy");
    expect(a?.client).toBe("Nikto Neznamy");
    expect(a?.trener).toBeUndefined();
  });

  it("barter ide Jerrymu aj keď je klient Terezkin — Jarkov dlh sú peniaze", () => {
    const d = data({
      sessions: [u({ client: "Sofia Resnerová", sessionTrainer: "Terezka" })],
      balickyKokpit: [{ id: "b1", klient: "Sofia Resnerová", platnostOd: "2026-10-05", cena: 7790, hodiny: 6, zruseneAt: null, kotva: false }],
    });
    const { clients, polozky } = register(d);
    const p = polozky.find((x) => x.key.startsWith("barter|"));
    expect(p?.trener).toBe("Jerry");
    expect(patriTrenerovi(p!, clients, "Terezka")).toBe(false);
  });
});
