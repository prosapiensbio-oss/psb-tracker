import { describe, expect, it } from "bun:test";

import { AKTUALNA_VERZIA, jePodpis, menoPodpisujuceho, odtlacokZnenia, znenie } from "./zmluva6m";
import { zmluvaMail, zmluvaNaPodpisHtml, zmluvaPodpisanaHtml } from "./zmluvaStranka";
import { notifikacieZmluv } from "./zmluvyNotifikacie";

const zn = znenie(AKTUALNA_VERZIA)!;
const PNG = `data:image/png;base64,${"A".repeat(2000)}`;

describe("zmluva 6M", () => {
  it("šesť pravidiel, každé povinné zaškrtávacie políčko", () => {
    const h = zmluvaNaPodpisHtml({ znenie: zn, klient: "Jan Kral", poskytovatelPodpis: PNG, poskytovatelAt: "2026-11-10T10:00:00Z", autor: "Jerry", dnes: "2026-11-10" });
    expect(zn.pravidla.length).toBe(6);
    expect((h.match(/type="checkbox" name="pravidlo_/g) || []).length).toBe(6);
    expect((h.match(/required>/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(h).toContain("V Brně dne <b>10. 11. 2026</b>");
    expect(h).toContain("Mgr. Filip Stráňavský");
    expect(h).toContain("11.7 Přílohou obchodních podmínek");
  });
  it("náhľad sa podpísať nedá", () => {
    const h = zmluvaNaPodpisHtml({ znenie: zn, klient: "A B", poskytovatelPodpis: PNG, poskytovatelAt: "2026-11-10T10:00:00Z", autor: "Jerry", dnes: "2026-11-10", nahlad: true });
    expect(h).toContain("var NAHLAD=true");
    expect(h).toContain("Odsud se podepsat nedá");
  });
  it("podpísaná nesie oba podpisy, odsúhlasené pravidlá a tlač", () => {
    const h = zmluvaPodpisanaHtml({ znenie: zn, klient: "Jan Kral", klientMeno: "Jan Král", klientPodpis: PNG, klientAt: "2026-11-10T17:33:00Z", suhlasy: zn.pravidla, poskytovatelPodpis: PNG, poskytovatelAt: "2026-11-10T10:00:00Z", autor: "Jerry", odtlacok: "abcdef0123456789xyz" });
    expect((h.match(/<img src="data:image\/png/g) || []).length).toBe(2);
    expect((h.match(/☑/g) || []).length).toBe(6);
    expect(h).toContain("window.print()");
    expect(h).toContain("10. 11. 2026 v 18:33");
  });
  it("odtlačok je stabilný a mení sa s textom", async () => {
    const a = await odtlacokZnenia(zn);
    expect(a).toBe(await odtlacokZnenia(zn));
    expect(a).not.toBe(await odtlacokZnenia({ ...zn, pravidla: zn.pravidla.slice(1) }));
  });
  it("podpis: len PNG data URL v rozumnej veľkosti", () => {
    expect(jePodpis(PNG)).toBe(true);
    expect(jePodpis("data:image/png;base64,AAAA")).toBe(false);
    expect(jePodpis("javascript:alert(1)")).toBe(false);
  });
  it("podpisuje Filip, inak tréner za poskytovateľa", () => {
    expect(menoPodpisujuceho("Jerry")).toBe("Mgr. Filip Stráňavský");
    expect(menoPodpisujuceho("Terezka")).toBe("Terezka (za poskytovatele)");
  });
  it("mail nesie celé znenie aj odkaz na podpis", () => {
    const m = zmluvaMail(zn, { oslovenie: "Jene", odkaz: "https://x/z/ABCDEFGHJKLMNP" });
    expect(m.text).toContain("Ahoj Jene,");
    expect(m.text).toContain("https://x/z/ABCDEFGHJKLMNP");
    expect(m.html).toContain("Přečíst a podepsat");
    expect(m.html).toContain("4.9 Klient může požádat");
  });
  it("notifikácia o podpise má kľúč na zmluvu", () => {
    const n = notifikacieZmluv([{ id: "z1", klient: "Jan Kral", at: "2026-11-10T17:33:00Z" }]);
    expect(n[0].key).toBe("zmluva-podpisana|z1");
    expect(n[0].title).toContain("zmluvu 6M");
  });
});
