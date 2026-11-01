import { describe, expect, it } from "bun:test";

import { nazovZdroja } from "./zdroje";

describe("názov zdroja klienta", () => {
  it("kódy z ostrých dát sú ľudské názvy", () => {
    expect(nazovZdroja("fp")).toBe("FP adresár");
    expect(nazovZdroja("ai")).toBe("AI (ChatGPT a pod.)");
    expect(nazovZdroja("offline")).toBe("Tabuľa / billboard / leták");
  });
  it("Referencia a referencia sú to isté", () => {
    expect(nazovZdroja("Referencia")).toBe(nazovZdroja("referencia"));
  });
  it("ručný zápis ostane, prázdne je prázdne", () => {
    expect(nazovZdroja("kamarát z gymu")).toBe("kamarát z gymu");
    expect(nazovZdroja("")).toBe("");
  });
});
