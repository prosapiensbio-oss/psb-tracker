import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// 14. 10. 2026: „presunúť" fotenie vrátilo „chýba id" — akcia pracuje s dňom
// klienta, nie s jednou fotkou, a stála až za kontrolou, ktorá chce id fotky.
describe("presun fotenia na iný deň", () => {
  it("akcia presun-den je PRED kontrolou id fotky", () => {
    const zdroj = readFileSync(join(__dirname, "../../routes/api/fotky.ts"), "utf8");
    const presun = zdroj.indexOf('b.akcia === "presun-den"');
    const kontrolaId = zdroj.indexOf('if (!id) return chyba("chýba id")');
    expect(presun).toBeGreaterThan(-1);
    expect(kontrolaId).toBeGreaterThan(-1);
    expect(presun).toBeLessThan(kontrolaId);
  });
});
