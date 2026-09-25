import { describe, expect, it } from "bun:test";

import { registerZoServera } from "./registerServer";
import { EMPTY_DATA, type Lead, type PSBData } from "./types";

/**
 * JEDEN DOPYT = JEDNA PRIPOMIENKA.
 *
 * 25. 9. 2026 sa Jerry spýtal, prečo majú s Terezkou tri dni tie isté
 * notifikácie. Časť odpovede bola chyba: od 24. 9. vznikali na jeden
 * neodpovedaný dopyt DVE položky — `odpoved|<id>` v `deriveRegister`
 * a `ozvatsa|<id>` v `nezapisaneDoRegistra`. Obe stáli na tej istej
 * podmienke, obe patrili Terezke a obe išli do rannej správy. Pri piatich
 * otvorených dopytoch to bolo desať riadkov.
 *
 * Testy oboch funkcií to nechytili, lebo každá sama o sebe robila správnu
 * vec. Preto sa tu skladá CELÝ register — presne ako ho skladá ranný push.
 */

const DNES = new Date("2026-09-25T09:00:00Z");

const dopyt = (o: Partial<Lead> = {}): Lead => ({
  id: "lead-1",
  date: "2026-09-24",
  name: "Hana Marko",
  source: "web",
  referrer: "",
  status: "novy",
  note: "Chcela by som skúsiť úvodný tréning.",
  email: "hana.marko@example.com",
  telefon: "",
  kampan: "",
  utm: "",
  stranka: "",
  odpovedaneAt: "",
  dovod: "",
  createdAt: "2026-09-24T18:00:00Z",
  druh: "dopyt",
  ...o,
});

const data = (leads: Lead[]): PSBData => ({ ...EMPTY_DATA, leads });
const register = (leads: Lead[]) =>
  registerZoServera(data(leads), { udalosti: [], zmeny: [] }, DNES);

const oDopyte = (leads: Lead[], id: string) =>
  register(leads).filter((r) => r.key.includes(id));

describe("neodpovedaný dopyt", () => {
  it("má v registri práve jednu položku, nie dve", () => {
    const r = oDopyte([dopyt()], "lead-1");
    expect(r.map((x) => x.key)).toEqual(["odpoved|lead-1"]);
  });

  it("tá jedna nesie kľúč `odpoved|` — na ňom visí tlačidlo „ozval som sa“", () => {
    // Dashboard rozoznáva tlačidlo podľa predpony kľúča. Keby sa kľúč zmenil,
    // položka by zostala, ale zapísať čas by sa z nej nedalo.
    const [r] = oDopyte([dopyt()], "lead-1");
    expect(r.key.startsWith("odpoved|")).toBe(true);
    expect(r.trener).toBe("Terezka");
  });

  it("povie, ako dlho sa čaká", () => {
    // Čas sa meria proti SKUTOČNÉMU teraz (deriveRegister si berie `new Date()`),
    // tak sa tu kontroluje tvar, nie konkrétne číslo — inak by test padal
    // podľa toho, o koľkej beží.
    const [r] = oDopyte([dopyt()], "lead-1");
    expect(r.title).toMatch(/čaká \d+ (h|deň|dni|dní)\)$/);
  });

  it("po zapísaní odpovede zmizne", () => {
    expect(oDopyte([dopyt({ odpovedaneAt: "2026-09-24T19:00:00Z" })], "lead-1")).toHaveLength(0);
  });

  it("lead magnet nie je dopyt a nepripomína sa", () => {
    expect(oDopyte([dopyt({ druh: "magnet" })], "lead-1")).toHaveLength(0);
  });
});
