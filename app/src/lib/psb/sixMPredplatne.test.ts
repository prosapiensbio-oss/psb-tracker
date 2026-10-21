// 6M proces sa počíta z počtu předplatných (Jerry, 21. 10. 2026 — Vaško).
import { describe, expect, it } from "bun:test";

import { EMPTY_DATA } from "./types";
import { sixMClientSet, zaciatkyPredplatneho } from "./compute";

const data = (x: object) => ({ ...EMPTY_DATA, ...x }) as never;

describe("6M z předplatného", () => {
  it("mesiac = počet předplatných, nie kalendár; ten istý predaj v oboch zdrojoch je jeden", () => {
    const d = data({
      services: [
        { client: "Martin Vaško", date: "2026-02-17", description: "OFF - 6h BEZ viazanosti", is6m: false },
        { client: "Martin Vaško", date: "2026-04-01", description: "OFF - 6h S viazanostou", is6m: true },
        { client: "Martin Vaško", date: "2026-05-19", description: "OFF - 6h S viazanostou", is6m: true },
        { client: "Martin Vaško", date: "2026-07-13", description: "OFF - 6h S viazanostou", is6m: true },
      ],
      historiaBalickov: [{ client: "Martin Vaško", package: "OFF - 6h S viazanostou", validFrom: "2026-07-13" }],
      balickyKokpit: [{ klient: "Martin Vaško", nazov: "6h Předplatné", hodiny: 6, platnostOd: "2026-08-17", platnostDo: "2026-09-16" }],
    });
    // Balíček z februára sa nepočíta; 13. 7. je v oboch zdrojoch raz.
    expect(zaciatkyPredplatneho(d).get("Martin Vaško")).toEqual(["2026-04-01", "2026-05-19", "2026-07-13", "2026-08-17"]);
  });
  it("kto nemá předplatné dva mesiace, v procese nie je", () => {
    const d = data({ balickyKokpit: [{ klient: "X", nazov: "6h Předplatné", hodiny: 6, platnostOd: "2026-01-05", platnostDo: "2026-02-04" }] });
    expect(sixMClientSet(d).has("X")).toBe(false);
  });
});
