import { describe, expect, it } from "bun:test";

import { PALETA } from "./titulka";
import { promptObrazka } from "./titulkaPrompt";

const zaklad = { nadpis: "Bolest zad *není* problém zad", koncept: "Rotace pánve", rezim: "svetly" as const };

describe("prompt na obrázok", () => {
  it("zakáže text v obrázku", () => {
    // Titulku sádže appka. Písmená z modelu by sa prekryli s nadpisom a ešte
    // by mali chyby v diakritike — presne to, na čom generovanie titulky padlo.
    const p = promptObrazka(zaklad);
    expect(p).toContain("NO TEXT");
    expect(p).toContain("NO LOGOS");
  });

  it("nesie celú paletu, nie len dve farby", () => {
    const p = promptObrazka(zaklad);
    for (const f of Object.values(PALETA)) expect(p).toContain(f);
  });

  it("povie, kde má ostať miesto na nadpis", () => {
    expect(promptObrazka(zaklad)).toContain("upper half");
  });

  it("hviezdičky z nadpisu sa do promptu nedostanú", () => {
    // Sú to značky pre sadzbu, nie pre model.
    expect(promptObrazka(zaklad)).not.toContain("*");
  });

  it("pevná časť je pri každom prompte rovnaká", () => {
    // Toto je to, čo drží štýl — nie model.
    const a = promptObrazka({ ...zaklad, nadpis: "Rotace pánve" });
    const b = promptObrazka({ ...zaklad, nadpis: "Dech a bránice" });
    const pevna = (t: string) => t.split("\n").slice(1).join("\n");
    expect(pevna(a)).toBe(pevna(b));
  });

  it("skladba s fotkou v písmenách pýta kresbu po celej ploche", () => {
    // Bledé pole s jedným tmavým objektom sa v písmenách rozpadne na svetlé
    // a tmavé kusy a nadpis prestane byť čitateľný.
    expect(promptObrazka({ ...zaklad, skladba: "vPismenach" })).toContain("Even texture");
    expect(promptObrazka({ ...zaklad, skladba: "duoton" })).not.toContain("Even texture");
  });

  it("bez témy neostane prázdny", () => {
    expect(promptObrazka({ nadpis: "", koncept: "", rezim: "tmavy" })).toContain("Subject:");
  });

  it("nepoužíva znenie, na ktorom padá bezpečnostný filter", () => {
    // Workers AI označil „human bodies" za nevhodný obsah (chyba 8007), hoci
    // ide o biomechaniku. Overené naživo 25. 8. 2026.
    expect(promptObrazka(zaklad)).not.toContain("human bodies");
    expect(promptObrazka(zaklad)).toContain("a person in movement");
  });

  it("odmieta to, čo Jerry v pravidlách vylúčil", () => {
    const p = promptObrazka(zaklad);
    for (const zle of ["icons", "clipart", "emoji", "gradients", "textures"]) {
      expect(p).toContain(zle);
    }
  });

  it("nepozýva model k fotografii", () => {
    // Prvá verzia tu mala „muted duotone photography" a „restrained studio
    // scenes" — Higgsfield z toho vyrobil fotoreálne štúdio s monitormi.
    // Pozor na doslovné hľadanie slova: „NO photography" ho tiež obsahuje.
    // Testuje sa, že tam nie je ako POKYN, nie ako zákaz.
    const p = promptObrazka(zaklad);
    expect(p).not.toContain("muted duotone photography");
    expect(p).not.toContain("restrained studio scenes");
    expect(p).toContain("NO photography");
    expect(p).toContain("NO studio scenes");
    expect(p.toLowerCase()).toContain("flat vector illustration");
    expect(p.toLowerCase()).toContain("not a photograph");
  });

  it("žiada jednoduchosť konkrétnym číslom, nie prívlastkom", () => {
    // „Simple" znamená pre model čokoľvek. Tri prvky sú tri prvky.
    const p = promptObrazka(zaklad);
    expect(p).toContain("At most three elements");
    expect(p).toContain("Most of the canvas is empty");
  });

  it("zakazuje tieňovanie a hĺbku — plochý vektor ich nemá", () => {
    const p = promptObrazka(zaklad);
    for (const zle of ["NO shading", "NO shadows", "NO depth", "NO perspective"]) {
      expect(p).toContain(zle);
    }
  });
});
