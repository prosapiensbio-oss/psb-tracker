import { describe, expect, it } from "bun:test";

import { dniDoNarodenin, trvanieText, zaciatokSpoluprace } from "./spolupraca";

// Jerry, 19. 10. 2026: „ako dlho s klientom spolupracujeme — 1r 3m 16d".
describe("spolupráca s klientom", () => {
  const dnes = "2026-10-19";

  it("klient spred roku 2025 má začiatok z prvého tréningu v archíve PTmindera", () => {
    // Michal Knapčok: Kokpit má sedenia od 2025, archív prvý tréning 5. 10. 2022.
    expect(zaciatokSpoluprace({ prvyTrening: "2025-01-06", prvyTreningArchiv: "2022-10-05", registracia: "2022-09-29" }, dnes))
      .toEqual({ den: "2022-10-05", zdroj: "ptminder" });
  });
  it("registrácia nepredbehne známy prvý tréning", () => {
    // Anna Nová: registrácia 10. 1. 2024, prvý tréning 9. 10. 2024.
    expect(zaciatokSpoluprace({ prvyTreningArchiv: "2024-10-09", registracia: "2024-01-10" }, dnes)?.den).toBe("2024-10-09");
  });
  it("bez známeho tréningu je záloha registrácia", () => {
    expect(zaciatokSpoluprace({ registracia: "2022-09-29", vytvoreny: "2022-10-01" }, dnes)).toEqual({ den: "2022-09-29", zdroj: "ptminder" });
  });
  it("dátum narodenia v poli registrácie sa neberie", () => {
    // Iva Stoklasková: Sign up date 24. 5. 1965, vytvorená 3. 3. 2023.
    expect(zaciatokSpoluprace({ registracia: "1965-05-24", vytvoreny: "2023-03-03" }, dnes)?.den).toBe("2023-03-03");
  });
  it("nový klient bez PTmindera má začiatok z Kokpitu", () => {
    expect(zaciatokSpoluprace({ prvyTrening: "2026-10-03T08:00:00" }, dnes)).toEqual({ den: "2026-10-03", zdroj: "kokpit" });
    expect(zaciatokSpoluprace({}, dnes)).toBe(null);
  });
  it("trvanie ako vek: roky, mesiace, dni", () => {
    expect(trvanieText("2022-09-29", dnes)).toBe("4r 0m 20d");
    expect(trvanieText("2025-07-03", dnes)).toBe("1r 3m 16d");
    expect(trvanieText("2026-08-01", dnes)).toBe("2m 18d");
    expect(trvanieText("2026-10-12", dnes)).toBe("7d");
    expect(trvanieText(dnes, dnes)).toBe("dnes");
    expect(trvanieText("2026-01-31", "2026-03-01")).toBe("1m 1d");
  });
  it("dni do narodenín podľa pražského dňa", () => {
    expect(dniDoNarodenin("1994-10-19", dnes)).toBe(0);
    expect(dniDoNarodenin("1994-10-20", dnes)).toBe(1);
    expect(dniDoNarodenin("1994-10-18", dnes)).toBe(364);
    expect(dniDoNarodenin("", dnes)).toBe(null);
  });
});
