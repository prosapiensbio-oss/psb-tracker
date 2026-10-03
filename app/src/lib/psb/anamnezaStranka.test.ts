import { describe, expect, it } from "bun:test";

import { FORMULAR } from "./anamnezaFormular";
import { strankaHtml } from "./anamnezaStranka";

const z = {
  formular: FORMULAR,
  klient: "Josef Pávek",
  kontakt: { email: "josef@example.cz", telefon: "+420 702 000 111", narodeniny: null },
  uvodny: "pátek 9. 10. v 9:00",
};

describe("údaje o klientovi na anamnéze", () => {
  it("klient si ich môže opraviť sám", () => {
    // Jerry, 3. 10. 2026: „daj tam možnosť Nesedí něco? Opravte nás —
    // keď klikne, upraví to ten klient sám."
    const h = strankaHtml(z);
    expect(h).toContain("Nesedí něco? Opravte nás.");
    expect(h).toContain('name="oprava_meno"');
    expect(h).toContain('name="oprava_email"');
    expect(h).toContain('name="oprava_telefon"');
    // Polia sú predvyplnené tým, čo o ňom vieme — nie prázdne.
    expect(h).toContain('value="Josef Pávek"');
    expect(h).toContain('value="josef@example.cz"');
    expect(h).toContain('value="+420 702 000 111"');
  });

  it("polia na opravu sú vnútri formulára, inak by sa neodoslali", () => {
    const h = strankaHtml(z);
    expect(h.indexOf('<form method="post"')).toBeLessThan(h.indexOf('name="oprava_meno"'));
    expect(h.indexOf('name="oprava_meno"')).toBeLessThan(h.indexOf("</form>"));
  });

  it("z telefónu si prehliadač nesmie spraviť modrý odkaz", () => {
    // Jerry: „to číslo je superkriklavo modrou, že sa nedá ani prečítať."
    expect(strankaHtml(z)).toContain('<meta name="format-detection" content="telephone=no">');
  });

  it("po odoslaní sa formulár ani polia na opravu nekreslia", () => {
    const h = strankaHtml({ ...z, hotovo: true });
    expect(h).not.toContain('name="oprava_meno"');
    expect(h).toContain("Máme to");
  });
});
