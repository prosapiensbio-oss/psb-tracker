import { describe, expect, it } from "bun:test";
import { blokyMailu, dosadOslovenie, kontrolaTextu, mailHtml, mailText } from "./mailSablona";

const V = { druh: "bolest", nadpis: "Kolena ti utíkají dovnitř?", telo: "Ahoj {oslovení},\nděkuji.", odhlasitUrl: "https://k.cz/m/oabc", dovodVMaili: "kvůli tréninku u nás" };

describe("šablóna mailu", () => {
  it("oslovuje v 5. páde a bez mena nenechá dieru", () => {
    expect(dosadOslovenie("Ahoj {oslovení},", "Michal Novák")).toBe("Ahoj Michale,");
    expect(dosadOslovenie("Ahoj {oslovení},", "")).toBe("Ahoj,");
    expect(dosadOslovenie("Ahoj {osloveni},", "Jana")).toBe("Ahoj Jano,");
  });

  it("označenie a odhlásenie sú navrchu aj v päte", () => {
    const h = mailHtml(V);
    expect(h.match(/Odhlásit se jedním klikem/g)?.length).toBe(2);
    expect(h.match(/href="https:\/\/k\.cz\/m\/oabc"/g)?.length).toBe(2);
    expect(h.indexOf("Obchodní sdělení")).toBeLessThan(h.lastIndexOf("Kolena ti"));
    expect(h).toContain("kvůli tréninku u nás");
    expect(mailText(V)).toContain("Obchodní sdělení");
    expect(mailText(V)).toContain("https://k.cz/m/oabc");
  });

  it("nie je to text na bielom: kréma a zelená hlavička", () => {
    const h = mailHtml(V);
    expect(h).toContain("#F6F3EA");
    expect(h).toContain("#1A2E24");
    expect(h).toContain("PROČ TĚ TO BOLÍ");
  });

  it("rozozná bloky", () => {
    const b = blokyMailu("Text\n\n> Koleno je posel.\n\n## Jak poznáš\n- jedna\n- dve\n\n[Přečíst](https://x.cz/a)\n\n![foto](https://x.cz/a.jpg)");
    expect(b.map((x) => x.typ)).toEqual(["odsek", "veta", "box", "tlacidlo", "obrazok"]);
  });

  it("nepustí HTML ani cudzí protokol", () => {
    const h = mailHtml({ ...V, telo: "<script>alert(1)</script>\n\n[klik](javascript:alert(1))" });
    expect(h).not.toContain("<script>");
    expect(h).not.toContain('href="javascript');
    expect(kontrolaTextu({ predmet: "a", nadpis: "b", telo: "[x](ftp://y)" }).length).toBe(1);
    expect(kontrolaTextu({ predmet: "a", nadpis: "b", telo: "{meno}" }).length).toBe(1);
    expect(kontrolaTextu({ predmet: "a", nadpis: "b", telo: "Ahoj {oslovení}" })).toEqual([]);
  });

  it("potvrdzovací mail nie je obchodné oznámenie", () => {
    const h = mailHtml({ ...V, bezOznacenia: true, pataText: "Pokud jsi o to nežádal(a), nic nedělej." });
    expect(h).not.toContain("Obchodní sdělení");
    expect(h).not.toContain("Odhlásit");
    expect(h).toContain("nic nedělej");
  });
});
