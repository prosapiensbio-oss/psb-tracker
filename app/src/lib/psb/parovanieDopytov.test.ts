import { describe, expect, it } from "bun:test";

import type { ClientAgg } from "./compute";
import type { Lead, PaymentRow, PSBData, SessionRow } from "./types";
import { krokyZa, kohortyDopytov } from "../../components/psb/MarketingLievik";
import { parovanieDopytov } from "./parovanieDopytov";

const lead = (name: string, date: string): Lead => ({ id: name, date, name, source: "web", referrer: "", status: "novy", note: "", email: "", telefon: "", kampan: "", utm: "", stranka: "" } as Lead);
const sedenie = (client: string, date: string, sessionType: SessionRow["sessionType"]): SessionRow =>
  ({ date, time: "09:00", client, sessionTrainer: "Jerry", sessionName: "T", sessionType, duration: 60, price: 1100 });
const klient = (name: string, sessions: SessionRow[], firstSession = sessions[0]?.date || ""): ClientAgg =>
  ({ name, sessions, firstSession, sessionCount: sessions.length, vratenie: false } as unknown as ClientAgg);

/**
 * Štyria ľudia, na ktorých sa rozchádzali Dopyty (83 %), kohorty a Lievik:
 *  Ana: dopyt → úvodný → klient;  Bea: dopyt → úvodný a koniec;
 *  Cyril: starý klient, vyplnil formulár znova;  Dana: úvodný len v budúcnosti.
 */
const ana = [sedenie("Ana Nová", "2026-03-05", "UVODNE"), sedenie("Ana Nová", "2026-03-12", "OFFLINE")];
const bea = [sedenie("Bea Malá", "2026-03-06", "UVODNE")];
const cyril = [sedenie("Cyril Starý", "2026-01-05", "UVODNE"), sedenie("Cyril Starý", "2026-01-12", "OFFLINE")];
const clients = {
  "Ana Nová": klient("Ana Nová", ana),
  "Bea Malá": klient("Bea Malá", bea),
  "Cyril Starý": klient("Cyril Starý", cyril),
  "Dana Budúca": klient("Dana Budúca", [], "2026-11-08"),
};
const data = {
  leads: [lead("Ana Nová", "2026-03-01"), lead("Bea Malá", "2026-03-02"), lead("Cyril Starý", "2026-03-03"), lead("Dana Budúca", "2026-03-04"), lead("Eva Nikto", "2026-03-04")],
  sessions: [...ana, ...bea, ...cyril],
  payments: [] as PaymentRow[],
} as unknown as PSBData;

describe("čo sa z dopytu stalo", () => {
  it("klient a úvodný len po dopyte; meno v Kokpite nestačí", () => {
    const p = parovanieDopytov(data, clients);
    expect(data.leads.map((l) => p.klient(l))).toEqual(["Ana Nová", "", "", "", ""]);
    expect(data.leads.map((l) => p.uvodny(l)?.meno || "")).toEqual(["Ana Nová", "Bea Malá", "", "", ""]);
  });

  it("Lievik a kohorty dávajú tie isté čísla", () => {
    const k = krokyZa(data, clients, ["2026-03"]);
    expect(k.dopyty).toBe(5);
    expect(k.zDopytuUvodny).toBe(2);
    expect(k.zDopytu).toBe(1);
    const [[mk, v]] = kohortyDopytov(data, clients);
    expect(mk).toBe("2026-03");
    expect([v.dopytov, v.uvodny, v.klient]).toEqual([k.dopyty, k.zDopytuUvodny, k.zDopytu]);
    expect(v.dni).toEqual([4, 4]);
  });
});
