import { describe, expect, it } from "bun:test";

import { bezPodpisu, odpovedHtml } from "./emailSablona";

const TEXT = "Dobrý den,\n\nv úterý v 10 máme volno.\n\nS pozdravem\nTerézia Zaťková\nProSapiens Biomechanic";

describe("odpovedHtml — návrh A", () => {
  it("podpis z textu nahradí blok s fotkou, „S pozdravem“ ostane", () => {
    expect(bezPodpisu(TEXT, "Terézia Zaťková")).toBe("Dobrý den,\n\nv úterý v 10 máme volno.\n\nS pozdravem");
    const h = odpovedHtml({ text: TEXT, podpis: "Terézia Zaťková", logoCid: "l1", fotoCid: "f1" });
    expect(h.match(/Terézia Zaťková/g)?.length).toBe(1);
    expect(h).toContain("S pozdravem");
    expect(h).toContain('src="cid:l1"');
    expect(h).toContain('src="cid:f1"');
    expect(h).toContain("+420 702 147 704");
    expect(h).toContain("Fanderlíkova 70");
  });
  it("Filipov podpis nesie jeho telefón", () => {
    const h = odpovedHtml({ text: "Ahoj\n\nS pozdravem\nFilip Stráňavský", podpis: "Filip Stráňavský" });
    expect(h).toContain("+420 702 090 289");
    expect(h).not.toContain("702 147 704");
  });
  it("text sa escapuje a citát ide pod podpis", () => {
    const h = odpovedHtml({ text: "a <b>x</b> & y", podpis: "Terézia Zaťková", citatHlavicka: "1. 11. napsala Radka:", citat: "chci <trénink>" });
    expect(h).toContain("a &lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(h).toContain("chci &lt;trénink&gt;");
    expect(h.indexOf("1. 11. napsala Radka:")).toBeGreaterThan(h.indexOf("trenérka"));
  });
  it("bez obrázkov odíde s nápisom namiesto loga a bez prázdnej fotky", () => {
    const h = odpovedHtml({ text: "Ahoj", podpis: "neznámy" });
    expect(h).toContain("PROSAPIENS BIOMECHANIC");
    expect(h).not.toContain("cid:");
  });
});
