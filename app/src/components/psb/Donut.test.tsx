import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Donut } from "./ui";
import { fmtCZK } from "../../lib/psb/format";

describe("legenda koláča", () => {
  it("peniaze idú cez fmtCZK, nie surové 394059.5", () => {
    const html = renderToStaticMarkup(<Donut data={[{ label: "Účet", value: 394059.5, color: "#000" }]} fmtHodnota={fmtCZK} />);
    expect(html).not.toContain("394059.5");
    expect(html).toContain("Kč");
  });
  it("počty ostávajú číslom", () => {
    expect(renderToStaticMarkup(<Donut data={[{ label: "A", value: 7, color: "#000" }]} />)).toContain(">7<");
  });
});
