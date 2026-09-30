import { describe, expect, it } from "bun:test";

import { naIso, prevezmi, type StaryRiadok } from "./anamnezaImport";

/** Doslovný riadok z exportu — Lukas Hanus, 20. 3. 2026 (dnešná podoba). */
const NOVY: StaryRiadok = {
  "Časová pečiatka": "2026/03/20 12:24:45 PM GMT+2",
  "Dnešní datum": "2026-03-20",
  "Meno": "Lukas", "Příjmení": "Hanus",
  "Výška": "177", "Váha": "76",
  "Popište hlavní obtíž, která vás přivedla k nám — co vás trápí, jak dlouho to trvá?":
    "chrbat, problémy s ramenami vyskakujú",
  "V jaké intenzitě máte momentální bolesti ?": "6",
  "Měli jste někdy závažné zranění, operaci (jazvy) nebo hospitalizaci?": "prave (2004) rameno",
  "Jaké odborné přístupy jste v minulosti zkoušeli? (fyzioterapie, chiropraktik, osteopatie, masáže...) Co vám pomohlo a co ne?": "do r. 2023 to nejako extra neriešil",
  "Jste těhotná?": "Ano",
  "Jaký je váš hlavní cíl v pohybu/sportu?": "Zbavit se chronické bolesti;Dlouhověkost",
  "Co jste ochotní změnit nebo obětovat? ": "Peníze;Čas;Bolest",
  "Čím se živíte ?": "obchodak predava bicykle",
  "Pracujete více vsedě, ve stoje nebo je práce pohybová/variabilní?": "Převážně vsedě",
  "Do jaké míry je vaše práce stresující ?": "8",
  "Měli jste v minulosti trenéra?": "Ano",
  "Co vám fungovalo? ": "ked robil cyklistiku",
  "Jak jste se o nás dozvěděli?": "Instagram",
  "Souhlasím s obchodními podmínkami": "Ano",
  "Souhlasím se zpracováním osobních údajů": "Ano",
  "Souhlasím ze zasilaním newslatter-u - s informacemi o lepším pochopení tréninku a speciálnimi ponukami, které nikdy jinde nejsou": "Ano",
};

/** Riadok zo starej podoby — Tomáš Martinec, 23. 6. 2025. Obtiaž je vo „Výška". */
const STARY: StaryRiadok = {
  "Časová pečiatka": "2025/06/23 5:42:25 PM GMT+3",
  "Dnešní datum": "2025-06-23",
  "Meno": "Tomáš", "Příjmení": "Martinec",
  "Výška": "zvědavost, spravit držení těla a chůzi",
  "Váha": "",
  "Popište hlavní obtíž, která vás přivedla k nám — co vás trápí, jak dlouho to trvá?": "",
  "V jaké intenzitě máte momentální bolesti ?": "2",
  "Měli jste někdy závažné zranění, operaci (jazvy) nebo hospitalizaci?": "klíční kost",
  "Jak jste se o nás dozvěděli?": "Reference;David Medek",
  "Souhlasím s obchodními podmínkami": "Ano",
  "Souhlasím se zpracováním osobních údajů": "Ano",
  "Souhlasím ze zasilaním newslatter-u - s informacemi o lepším pochopení tréninku a speciálnimi ponukami, které nikdy jinde nejsou": "Ne",
};

describe("posunuté stĺpce — formulár sa za pätnásť mesiacov menil", () => {
  it("číselná výška a váha sa preberú", () => {
    const v = prevezmi(NOVY);
    expect(v.odpovede.vyska).toBe(177);
    expect(v.odpovede.vaha).toBe(76);
  });

  it("veta v stĺpci „Výška“ je obtiaž, nie výška", () => {
    const v = prevezmi(STARY);
    expect(v.odpovede.vyska).toBeUndefined();
    expect(v.odpovede.obtiz).toBe("zvědavost, spravit držení těla a chůzi");
  });

  it("nezmyselná výška sa zahodí, nezaokrúhli", () => {
    expect(prevezmi({ ...NOVY, "Výška": "8" }).odpovede.vyska).toBeUndefined();
    expect(prevezmi({ ...NOVY, "Výška": "1770" }).odpovede.vyska).toBeUndefined();
  });
});

describe("voľby sa preberajú len pri presnej zhode", () => {
  it("čo sedí na dnešnú ponuku, prejde", () => {
    const v = prevezmi(NOVY);
    expect(v.odpovede.poloha).toBe("Převážně vsedě");
    expect(v.odpovede.tehotna).toBe("Ano");
    expect(v.odpovede.trener).toBe("Ano");
    expect(v.odpovede.stres).toBe(8);
  });

  it("stará formulácia sa NEPREKLADÁ nasilu", () => {
    // „vsedě" v starých riadkoch nie je žiadna z dnešných možností.
    expect(prevezmi({ ...NOVY, "Pracujete více vsedě, ve stoje nebo je práce pohybová/variabilní?": "vsedě" })
      .odpovede.poloha).toBeUndefined();
  });

  it("zdroj aj meno odporúčateľa", () => {
    const v = prevezmi(STARY);
    expect(v.odpovede.zdroj).toBe("Doporučení");
    expect(v.odpovede.zdroj_kto).toBe("David Medek");
    expect(prevezmi(NOVY).odpovede.zdroj).toBe("Instagram");
  });

  it("neznámy zdroj sa nevymýšľa", () => {
    expect(prevezmi({ ...NOVY, "Jak jste se o nás dozvěděli?": "vonkajší bilboard" }).odpovede.zdroj).toBeUndefined();
  });
});

describe("čo dnešný formulár nemá, ide do archívu — nie do koša", () => {
  it("intenzita bolesti aj „ochotní obetovať“ zostanú čitateľné", () => {
    const a = prevezmi(NOVY).odpovede._archiv as { polozky: [string, string][] };
    const mapa = Object.fromEntries(a.polozky);
    expect(mapa["V jaké intenzitě máte momentální bolesti ?"]).toBe("6");
    expect(mapa["Co jste ochotní změnit nebo obětovat?"]).toBe("Peníze;Čas;Bolest");
    expect(mapa["Jaký je váš hlavní cíl v pohybu/sportu?"]).toBe("Zbavit se chronické bolesti;Dlouhověkost");
  });

  it("preložené stĺpce sa v archíve NEOPAKUJÚ", () => {
    const a = prevezmi(NOVY).odpovede._archiv as { polozky: [string, string][] };
    const nazvy = a.polozky.map(([n]) => n);
    expect(nazvy).not.toContain("Výška");
    expect(nazvy).not.toContain("Čím se živíte ?");
    expect(nazvy.some((n) => n.startsWith("Souhlasím"))).toBe(false);
  });

  it("prázdne hodnoty do archívu nejdú", () => {
    const a = prevezmi(STARY).odpovede._archiv as { polozky: [string, string][] };
    expect(a.polozky.every(([, v]) => v.length > 0)).toBe(true);
  });
});

describe("doklad o súhlase hovorí, čo naozaj odklepli", () => {
  it("newsletter áno aj nie", () => {
    expect(prevezmi(NOVY).suhlasy?.newsletter).toBe(true);
    expect(prevezmi(STARY).suhlasy?.newsletter).toBe(false);
  });

  it("zdravotné údaje a fotky starý formulár NEPOKRÝVAL", () => {
    // Doklad sa nesmie tváriť silnejšie, než je: na osobitnú kategóriu
    // a na fotky sa starý formulár nepýtal.
    const g = prevezmi(NOVY).suhlasy?.gdpr as { dano: boolean; zdravotneUdaje: boolean; fotky: boolean };
    expect(g.dano).toBe(true);
    expect(g.zdravotneUdaje).toBe(false);
    expect(g.fotky).toBe(false);
  });

  it("bez odklepnutia nie je doklad", () => {
    expect(prevezmi({ ...NOVY, "Souhlasím s obchodními podmínkami": "", "Souhlasím se zpracováním osobních údajů": "" }).suhlasy).toBeNull();
  });
});

describe("koncová medzera v hlavičke nesmie stratiť odpoveď", () => {
  it("„Co vám fungovalo?“ sa trafí s medzerou aj bez nej", () => {
    // Export má na tom stĺpci koncovú medzeru; kto ju po ceste oreže
    // (a orezať ju je prirodzené), prišiel by o odpoveď do archívu.
    const s = prevezmi({ ...NOVY, "Co vám fungovalo?": "kontrola techniky" });
    expect(s.odpovede.trener_fungovalo).toBe("kontrola techniky");
    const m = prevezmi({ ...NOVY, "Co vám fungovalo? ": "kontrola techniky" });
    expect(m.odpovede.trener_fungovalo).toBe("kontrola techniky");
  });

  it("dvojitá medzera v názve odpoveď tiež nestratí", () => {
    const v = prevezmi({ ...NOVY, "Čím se  živíte ?": "zubár" });
    expect(v.odpovede.zivi).toBe("zubár");
    // A keď sa trafila do poľa, nesmie zároveň ležať v archíve.
    const a = v.odpovede._archiv as { polozky: [string, string][] };
    expect(a.polozky.map(([n]) => n).some((n) => n.includes("živíte"))).toBe(false);
  });
});

describe("dátum vyplnenia", () => {
  it("poobedná pečiatka sa prevedie na 24 hodín", () => {
    expect(naIso("2025/06/23 5:42:25 PM GMT+3", "")).toBe("2025-06-23T17:42:25.000Z");
    expect(naIso("2026/03/20 12:24:45 PM GMT+2", "")).toBe("2026-03-20T12:24:45.000Z");
    expect(naIso("2026/01/09 9:13:44 AM GMT+2", "")).toBe("2026-01-09T09:13:44.000Z");
  });

  it("bez pečiatky sa vezme dátum, ale len keď dáva zmysel", () => {
    expect(naIso("", "2026-05-06")).toBe("2026-05-06T12:00:00.000Z");
    // V dátach je aj „0025-08-20" — preklep, ktorý by anamnézu poslal do
    // tretieho storočia.
    expect(naIso("", "0025-08-20")).toBe("");
  });
});
