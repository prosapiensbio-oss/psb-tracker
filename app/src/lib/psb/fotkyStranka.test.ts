import { describe, expect, it } from "bun:test";
import { dniZEditu, fotkyStranka, obdobieSrovnani, vychodiskovaSprava, vyplneneCisla, type FotkyStrankaVstup } from "./fotkyStranka";

const vstup = (o: Partial<FotkyStrankaVstup> = {}): FotkyStrankaVstup => ({
  token: "abc123XYZ789", trener: "Jerry", poslane: "2026-10-12", platiDo: "2026-11-11",
  sprava: vychodiskovaSprava("Tomáš"), dalej: [], karty: [{ id: "f1", popis: "Hrudník otevřenější.", maCiste: false, cisla: [] }],
  suhlas: null, odpovede: [], ...o,
});

describe("stránka s fotkami pre klienta", () => {
  it("nadpis z dní odfotenia: týždne, pri dlhšom mesiace, bez dvoch dní nič", () => {
    expect(obdobieSrovnani(["2026-10-11", "2026-01-30"])).toEqual({ od: "2026-01-30", do: "2026-10-11", nadpis: "36 týdnů práce" });
    expect(obdobieSrovnani(["2026-10-11", "2026-10-11"])).toBeNull();
    expect(obdobieSrovnani([])).toBeNull();
    expect(obdobieSrovnani(["2026-10-01", "2026-10-04"])?.nadpis).toBe("3 dny práce");
    expect(obdobieSrovnani(["2026-09-01", "2026-09-15"])?.nadpis).toBe("2 týdny práce");
    expect(obdobieSrovnani(["2025-01-10", "2026-05-10"])?.nadpis).toBe("16 měsíců práce");
  });
  it("dni sa čítajú zo stavu editora (JSON v JSON-e), polovice bez fotky nie", () => {
    const edit = JSON.stringify({ stav: JSON.stringify({ stav: [{ src: "/api/fotky?id=a", den: "2026-01-30" }, { src: "/api/fotky?id=b", den: "2026-10-11" }, { src: null, den: "2020-01-01" }] }) });
    expect(dniZEditu(edit)).toEqual(["2026-01-30", "2026-10-11"]);
    expect(dniZEditu("nezmysel")).toEqual([]);
    expect(dniZEditu(null)).toEqual([]);
  });
  it("hlavička: nadpis s rozsahom, pri trénerovi „poslal“ s dňom; trénerka „poslala“", () => {
    const h = fotkyStranka(vstup({ trener: "Filip", karty: [{ id: "f1", popis: "", maCiste: false, cisla: [], dni: ["2026-01-30", "2026-10-11"] }] }));
    expect(h).toContain("<h1>36 týdnů práce</h1>");
    expect(h).toContain("30. 1. 2026 <span>→</span> 11. 10. 2026");
    expect(h).toContain("tvůj trenér · poslal 12. 10.");
    expect(fotkyStranka(vstup({ trener: "Terezka" }))).toContain("tvoje trenérka · poslala 12. 10.");
    expect(fotkyStranka(vstup())).toContain("<h1>Tvoje srovnání</h1>");
  });
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
