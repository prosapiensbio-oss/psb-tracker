import { describe, expect, it } from "bun:test";

import { cestaKniznice } from "./striznaKniznica";

describe("cesta v spoločnej knižnici", () => {
  it("hudba a vložky áno", () => {
    expect(cestaKniznice("hudba/ES_Kenji - Ooyy.mp3")).toBe("hudba/ES_Kenji - Ooyy.mp3");
    expect(cestaKniznice("vlozky/v-charade-mvkiyuws/clip.mp4")).toBe("vlozky/v-charade-mvkiyuws/clip.mp4");
  });
  it("mimo priečinkov, skryté, výstup hore a cudzia prípona nie", () => {
    for (const zle of ["kokpit.json", "dni/x/klip.mp4", "hudba/../kokpit.json", "hudba/.vlny/a.json", "hudba/x.exe", "hudba/", "/hudba/a.mp3", "hudba//a.mp3"]) {
      expect(cestaKniznice(zle)).toBeNull();
    }
  });
});
