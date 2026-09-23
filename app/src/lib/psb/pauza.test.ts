// Pauzu ukončí tréning, nie človek, ktorý si na ňu spomenie.
import { describe, expect, it } from "bun:test";

import { deriveClients } from "./compute";
import type { PSBData } from "./types";

const sedenie = (client: string, date: string) => ({
  id: `${client}-${date}`, date: `${date}T00:00:00.000Z`, client, sessionTrainer: "Terezka",
  sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 1450, time: "5:00pm",
});

const data = (status: string, updatedAt: string, dni: string[]): PSBData => ({
  sessions: dni.map((d) => sedenie("Anetka", d)),
  services: [], payments: [], packages: [],
  clientOverrides: { Anetka: { status, updatedAt } },
  anomalyAck: {}, uploadLog: [], leads: [], zavery: [], poplatky: [], vedomosti: [],
} as unknown as PSBData);

describe("ručná pauza padne, keď klient príde", () => {
  it("tréning PO zapísaní pauzy ju ruší", () => {
    // Anetka Přinosilová: pauza nastavená 4. 8. 2026, tréningy 9. a 16. 9.
    // Appka ju celý čas viedla ako pauzu a notifikácie o nej mlčali.
    const c = deriveClients(data("Pauza", "2026-08-04T11:24:34.443Z", ["2026-09-09", "2026-09-16"])).Anetka;
    expect(c.status).not.toBe("Pauza");
    expect(c.pauzaZrusenaTreningom).toBe(true);
  });

  it("bez tréningu po nej pauza platí ďalej", () => {
    const c = deriveClients(data("Pauza", "2026-08-04T11:24:34.443Z", ["2026-07-30"])).Anetka;
    expect(c.status).toBe("Pauza");
    expect(c.pauzaZrusenaTreningom).toBeFalsy();
  });

  it("dohodnutá pauza do dátumu: tréning POČAS nej je výnimka, nie koniec", () => {
    // „Pauza|2026-09-30" znamená dohodu na konkrétny čas. Jedna hodina
    // uprostred ju neruší — inak by sa dohoda zmazala prvou výnimkou.
    const c = deriveClients(data("Pauza|2026-09-30", "2026-08-13T00:00:00Z", ["2026-09-05"])).Anetka;
    expect(c.status).toBe("Pauza");
    expect(c.pauseUntil).toBe("2026-09-30");
  });

  it("tréning PO dohodnutom konci pauzu ruší", () => {
    const c = deriveClients(data("Pauza|2026-08-27", "2026-08-13T00:00:00Z", ["2026-09-05"])).Anetka;
    expect(c.status).not.toBe("Pauza");
    expect(c.pauseUntil).toBeUndefined();
  });

  it("ručný „Neaktívny“ tréning NEPREBIJE — to je rozhodnutie o konci vzťahu", () => {
    const c = deriveClients(data("Neaktívny", "2026-08-04T00:00:00Z", ["2026-09-16"])).Anetka;
    expect(c.status).toBe("Neaktívny");
  });

  it("bez dátumu zápisu sa pauza neruší — nie je odkiaľ merať", () => {
    const c = deriveClients(data("Pauza", "", ["2026-09-16"])).Anetka;
    expect(c.status).toBe("Pauza");
  });

  it("po zrušení už nie je označená ako ručný stav", () => {
    // Inak by obrazovky tvrdili „nastavené rukou", hoci appka rozhoduje sama.
    const c = deriveClients(data("Pauza", "2026-08-04T00:00:00Z", ["2026-09-16"])).Anetka;
    expect(c.statusOverride).toBe(false);
  });
});
