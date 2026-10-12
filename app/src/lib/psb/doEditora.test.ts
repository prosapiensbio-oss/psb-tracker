import { describe, expect, it } from "bun:test";
import { zoradDvojicu } from "./doEditora";

describe("dvojica z profilu do editora", () => {
  it("staršia fotka je pred, aj keď sa označila druhá", () => {
    const [pred, po] = zoradDvojicu({ id: "b", den: "2026-10-12" }, { id: "a", den: "2026-08-01" });
    expect(pred.id).toBe("a");
    expect(po.id).toBe("b");
  });
  it("v ten istý deň rozhoduje poradie označenia", () => {
    const [pred, po] = zoradDvojicu({ id: "x", den: "2026-10-12" }, { id: "y", den: "2026-10-12" });
    expect([pred.id, po.id]).toEqual(["x", "y"]);
  });
});
