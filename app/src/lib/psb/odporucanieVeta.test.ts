import { describe, expect, it } from "bun:test";

import { deriveAnomalies, deriveClients } from "./compute";
import { dnesPraha } from "./cas";
import { EMPTY_DATA, type Lead, type PSBData, type SessionRow } from "./types";

const posun = (d: number) => dnesPraha(new Date(Date.now() + d * 86400000));
const sedenie = (client: string, d: number): SessionRow =>
  ({ date: `${posun(d)}T00:00:00.000Z`, time: "09:00", client, sessionTrainer: "Jerry", sessionName: "T", sessionType: "OFFLINE", duration: 60, price: 900 });
const dopyt = (name: string, referrer: string): Lead =>
  ({ id: `l-${name}`, date: posun(-5), name, source: "referencia", referrer, status: "novy", note: "" } as Lead);

/** „Jakub Kaňovsky odporučil Linda Muth, ktorý už trénuje" — zlý pád, rod aj tvar mena. */
describe("Odmena za odporúčanie", () => {
  const data = {
    ...EMPTY_DATA,
    sessions: [sedenie("Jakub Kaňovský", -2), sedenie("Linda Muth", -3)],
    leads: [dopyt("Linda Muth", "Jakub Kaňovsky"), dopyt("Ester Nová", "Jakub Kaňovsky")],
  } as PSBData;
  const a = deriveAnomalies(data, deriveClients(data)).filter((x) => x.key.startsWith("referral|"));

  it("veta bez skloňovania a rodu, mená z karty klienta", () => {
    const linda = a.find((x) => x.detail.includes("Linda Muth"));
    expect(linda?.detail).toStartWith("Odporúčanie: Jakub Kaňovský → Linda Muth (už trénuje)");
  });
  it("kto ešte netrénuje, to má v zátvorke", () => {
    expect(a.find((x) => x.detail.includes("Ester Nová"))?.detail).toContain("Ester Nová (zatiaľ dopyt, ešte netrénuje)");
  });
});
