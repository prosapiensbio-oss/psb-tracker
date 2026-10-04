import { describe, expect, it } from "bun:test";

import { popisPoplatku } from "./obsahOdkazu.server";

describe("popis poplatku pre klienta", () => {
  it("surový text z PTmindera sa klientovi ukáže česky a s dátumom po česky", () => {
    // Hanus, 4. 10. 2026: stránka ukazovala doslova anglický text z PTmindera.
    expect(popisPoplatku("OFF - 6h S viazanostou - from 02/10/2026 to 02/11/2026")).toBe("6h Předplatné · 2. 10. – 2. 11. 2026");
    expect(popisPoplatku("OFF - 8 hodín offline - from 09/09/2026 to 04/11/2026")).toBe("8h Balíček · 9. 9. – 4. 11. 2026");
  });

  it("popis, ktorý tvar nemá, prejde cez slovník produktov", () => {
    expect(popisPoplatku("OFF - 6h BEZ viazanosti")).toBe("6h Balíček");
    expect(popisPoplatku("nezaplacený balíček")).toBe("nezaplacený balíček");
  });
});
