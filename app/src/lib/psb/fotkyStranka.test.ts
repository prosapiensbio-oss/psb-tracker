import { describe, expect, it } from "bun:test";
import { fotkyStranka, vychodiskovaSprava, vyplneneCisla, type FotkyStrankaVstup } from "./fotkyStranka";

const vstup = (o: Partial<FotkyStrankaVstup> = {}): FotkyStrankaVstup => ({
  token: "abc123XYZ789", trener: "Jerry", poslane: "2026-10-12", platiDo: "2026-11-11",
  sprava: vychodiskovaSprava("Tomáš"), dalej: [], karty: [{ id: "f1", popis: "Hrudník otevřenější.", maCiste: false, cisla: [] }],
  suhlas: null, odpovede: [], ...o,
});

describe("stránka s fotkami pre klienta", () => {
  it("všeobecná správa — platí pre hocijaké fotenie", () => {
    expect(vychodiskovaSprava("Tomáš")).toContain("z dřívějšího a z nedávného focení");
    expect(vychodiskovaSprava("")).toMatch(/^Ahoj, posílám/);
  });
  it("čísla len keď sú vyplnené", () => {
    expect(vyplneneCisla([{ nazov: "", pred: "14°", po: "6°" }, { nazov: "pánev", pred: "", po: "" }])).toEqual([]);
    expect(fotkyStranka(vstup())).not.toContain('class="cisla"');
    const h = fotkyStranka(vstup({ karty: [{ id: "f1", popis: "", maCiste: false, cisla: [{ nazov: "pánev", pred: "14°", po: "6°" }] }] }));
    expect(h).toContain("<b>14°</b>");
  });
  it("najprv čistá fotka, s rozborom až po posune doprava — len keď čistá podoba existuje", () => {
    expect(fotkyStranka(vstup())).not.toContain('class="snimky"');
    const h = fotkyStranka(vstup({ karty: [{ id: "f1", popis: "", maCiste: true, cisla: [] }] }));
    expect(h).toContain('class="snimky"');
    expect(h.indexOf("foto=f1&ciste=1")).toBeLessThan(h.indexOf('foto=f1" target'));
  });
  it("čo ďalej len keď je čo napísať", () => {
    expect(fotkyStranka(vstup({ dalej: ["", "  "] }))).not.toContain("Na čem budeme pracovat dál");
    expect(fotkyStranka(vstup({ dalej: ["Pravá kyčel"] }))).toContain("Na čem budeme pracovat dál");
  });
  it("text sa escapuje", () => {
    const h = fotkyStranka(vstup({ sprava: "<script>x</script>", karty: [{ id: "f1", popis: "<b>a</b>", maCiste: false, cisla: [] }] }));
    expect(h).not.toContain("<script>x");
    expect(h).toContain("&lt;b&gt;a");
  });
  it("odoslaná správa sa potvrdí, súhlas sa dá zmeniť", () => {
    const h = fotkyStranka(vstup({ odpovede: [{ kedy: "2026-10-13T08:00:00Z" }], suhlas: "ano" }));
    expect(h).toContain("Zpráva odeslána 13. 10. 2026");
    expect(h).toContain("Ne, raději jen pro mě");
  });
});
