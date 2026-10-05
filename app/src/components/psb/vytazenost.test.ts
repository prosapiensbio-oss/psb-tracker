import { describe, expect, it } from "bun:test";
import { tyzdenVytazenosti } from "./WorkspaceKroky";

describe("tyzdenVytazenosti", () => {
  // 5. 10. 2026 je pondelok.
  it("pondelok až štvrtok sa pýta na minulý týždeň", () => {
    expect(tyzdenVytazenosti(new Date(2026, 9, 5))).toBe("2026-09-28");
    expect(tyzdenVytazenosti(new Date(2026, 9, 8))).toBe("2026-09-28");
  });
  it("od piatku na bežiaci týždeň", () => {
    expect(tyzdenVytazenosti(new Date(2026, 9, 9))).toBe("2026-10-05");
    expect(tyzdenVytazenosti(new Date(2026, 9, 11))).toBe("2026-10-05");
  });
});
