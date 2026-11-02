import { describe, expect, it } from "bun:test";

import { dlzkaSpravy } from "./sms";
import { krstneMeno, textSmsNarodenin, zastupcaKlienta } from "./narodeniny";
import { narodeninyStranka } from "./narodeninyStranka";

const URL = "https://prosapiens.cz/v/naAbCdEfGhIjKlMnOpQr";

describe("dátum narodenia cez odkaz", () => {
  it("za deti ide správa rodičovi aj pri inom tvare mena", () => {
    expect(zastupcaKlienta("Luky Kriz")).toBe("Dominika Križova");
    expect(zastupcaKlienta("Anetka Prinosilova")).toBe("Lenka Prinosilova");
    expect(zastupcaKlienta("Maty Přínosil")).toBe("Lenka Prinosilova");
    expect(zastupcaKlienta("Sofia Resnerová")).toBe("Marketa Resnerová");
    expect(zastupcaKlienta("Josef Pávek")).toBeNull();
  });
  it("je to jedna SMS a pri dieťati nesie jeho meno", () => {
    for (const k of ["Josef Pávek", "Anetka Přinosilová", "Radka Kovaříková"]) {
      expect(dlzkaSpravy(textSmsNarodenin(k, URL)).sprav).toBe(1);
    }
    expect(textSmsNarodenin("Anetka Přinosilová", URL)).toContain("pro Anetka");
    expect(textSmsNarodenin("Josef Pávek", URL)).not.toContain(" pro ");
    expect(krstneMeno("Luky Križ")).toBe("Luky");
  });
  it("stránka tyká, dieťa menuje krstným a uložený dátum neukazuje", () => {
    const dieta = narodeninyStranka({ klient: "Luky Križ", dnes: "2026-11-02", stav: "otazka" });
    expect(dieta).toContain("<b>Luky</b>");
    expect(dieta).not.toContain("Križ");
    expect(dieta).toContain('max="2026-11-02"');
    expect(narodeninyStranka({ klient: "Josef Pávek", dnes: "2026-11-02", stav: "otazka" })).toContain("své datum narození");
    expect(narodeninyStranka({ klient: "Josef Pávek", dnes: "2026-11-02", stav: "uzMame" })).not.toContain("<form");
    expect(narodeninyStranka({ klient: "Josef Pávek", dnes: "2026-11-02", stav: "chyba" })).toContain("nesedí");
  });
});
