import { describe, expect, it } from "bun:test";

import { farby, type Slovo, zalamKusy } from "./titulka";
import { BEZPECNE_DNO } from "./titulkaVodidla";
import {
  BEZ_UPRAVY, citaj, NAJMENSI_PODIEL, navrhniRodinu, navrhniSkladbu, PLATNO, PODPIS,
  pouziUpravy, prichytenie, type Prvok, REZ, roleSkladby, SEV,
  CISLO, pasFotky, rezyCisla, SKLADBA_MAPA, SKLADBY, svgSkladby, UHLOPRIECKA,
  umiestniObrazok, VYSEK, vykresli, zapis, type Zvonku,
} from "./titulkaSkladby";

const meraj = (t: string, tenky = false) => t.length * (tenky ? 40 : 50);
const R = (t: string): Slovo[][] => zalamKusy(t, 100000, meraj);

/** Účiara rastie s veľkosťou písma — na test stačí lineárny odhad. */
const UCIARA = (r: { velkost: number }) => Math.round(r.velkost * 0.8);

const OBRAZOK = {
  uri: "data:image/jpeg;base64,AAA", sirka: 1080, vyska: 1440,
  vyrez: { dx: 0, dy: 0, k: 1 },
};

const ZVONKU: Zvonku = {
  baseline: UCIARA,
  znacka: { napis: { sirka: 1664, vyska: 300, obsah: '<path d="M0 0"/>' } },
};

const obsah = (v: Partial<Parameters<(typeof SKLADBY)[number]["zloz"]>[0]> = {}) => ({
  f: farby("svetly"), stitok: "BIOMECHANIKA",
  nadpis: R("Bolest zad\nnení *problém*\nzad"), podnadpis: ["Řízení, ne síla."],
  cislo: "", jednotka: "", maFotku: false, posun: [0, 6.4, 0],
  baseline: UCIARA, rezNadpisu: SKLADBY[0].nadpis.rez, rezCisla: rezyCisla(),
  ...v,
});

/** Skladba dostane svoj vlastný rez — presne ako od merania v prehliadači. */
const poskladaj = (
  s: (typeof SKLADBY)[number],
  v: Partial<Parameters<(typeof SKLADBY)[number]["zloz"]>[0]> = {},
) => s.zloz(obsah({ rezNadpisu: s.nadpis.rez, ...v }));

describe("skladby", () => {
  it("každá má nezameniteľné id a číslo z nástrelov", () => {
    // Číslo je most k nástrelom — aby sa dalo ukázať prstom na tú istú vec.
    expect(new Set(SKLADBY.map((s) => s.id)).size).toBe(SKLADBY.length);
    expect(new Set(SKLADBY.map((s) => s.cislo)).size).toBe(SKLADBY.length);
    expect(SKLADBA_MAPA.size).toBe(SKLADBY.length);
  });

  it("žiadna nekreslí mimo plátna", () => {
    for (const s of SKLADBY) {
      for (const p of poskladaj(s)) {
        if (p.druh === "plocha" || p.druh === "fotka") {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x + p.w).toBeLessThanOrEqual(PLATNO.sirka);
          expect(p.y + p.h).toBeLessThanOrEqual(PLATNO.vyska);
        }
      }
    }
  });

  it("každá nesie podpis na tom istom mieste", () => {
    // Značka je jediná vec, ktorá sa medzi skladbami nesmie hýbať.
    for (const s of SKLADBY) {
      const z = poskladaj(s).filter((p): p is Extract<Prvok, { druh: "znacka" }> => p.druh === "znacka");
      expect(z.length).toBe(1);
      expect(z[0].y).toBe(PODPIS.y);
      expect(z[0].sirka).toBe(PODPIS.sirka);
    }
  });

  it("znesie jednoriadkový aj štvorriadkový nadpis", () => {
    // Skladby s odvodenou pozíciou (uhlopriečka pod prvým riadkom) sú presne
    // to miesto, kde krátky nadpis rozbije rozvrh.
    for (const s of SKLADBY) {
      for (const t of ["Pánev", "Bolest zad\nnení\nproblém\nzad"]) {
        const prvky = poskladaj(s, ({ nadpis: R(t), posun: [0, 0, 0, 0] }));
        expect(prvky.length).toBeGreaterThan(2);
        expect(JSON.stringify(prvky)).not.toContain("NaN");
      }
    }
  });

  it("znesie prázdny podnadpis aj prázdny štítok", () => {
    for (const s of SKLADBY) {
      const prvky = poskladaj(s, ({ podnadpis: [], stitok: "" }));
      expect(JSON.stringify(prvky)).not.toContain("NaN");
      // Prázdny štítok sa nemá kresliť ako prázdny text.
      expect(vykresli(prvky, ZVONKU)).not.toContain("BIOMECHANIKA");
      expect(vykresli(prvky, ZVONKU)).not.toMatch(/<text[^>]*><\/text>/);
    }
  });

  it("podnadpis NIKDY nevyjde nad text, ani keď je dole málo miesta", () => {
    // Toto našli testy dvakrát. Najprv som rátal účiary namiesto spodku
    // riadkových boxov; potom, po posunutí podpisu na 1540, klesol strop
    // o 172 px a podnadpis sa pri štvorriadkovom nadpise dostal NAD jeho
    // posledný riadok. Prekrytý nadpis je horšia chyba než podnadpis, ktorý
    // zabehne do pásu, čo Instagram aj tak zakryje.
    for (const s of SKLADBY.filter((x) => x.polia.includes("podnadpis"))) {
      for (const t of ["Pánev", "Bolest zad\nnení\nproblém", "Bolest zad\nnení\nproblém\nzad"]) {
        const prvky = poskladaj(s, ({ nadpis: R(t), podnadpis: ["Řízení, ne síla.", "Druhý riadok."], posun: [0, 0, 0, 0] }));
        const podnadpisy = prvky.filter((p): p is Extract<Prvok, { druh: "text" }> =>
          p.druh === "text" && (p.text.includes("Řízení") || p.text.includes("Druhý")));
        expect(podnadpisy.length).toBe(2);
        const nadpisy = prvky.filter((p): p is Extract<Prvok, { druh: "nadpis" }> => p.druh === "nadpis");
        const dnoNadpisu = Math.max(...nadpisy.map((n) => n.y + n.riadky.length * n.rez.prokladanie));
        for (const p of podnadpisy) expect(p.y).toBeGreaterThanOrEqual(dnoNadpisu);
      }
    }
  });

  it("pri rozumnom texte ostane podnadpis nad podpisom", () => {
    for (const s of SKLADBY.filter((x) => x.polia.includes("podnadpis"))) {
      const prvky = poskladaj(s, ({ nadpis: R("Bolest zad\nnení"), podnadpis: ["Řízení, ne síla."], posun: [0, 0] }));
      const p = prvky.find((x): x is Extract<Prvok, { druh: "text" }> =>
        x.druh === "text" && x.text.includes("Řízení"))!;
      expect(p.y + UCIARA(p.rez)).toBeLessThan(PODPIS.y);
    }
  });

  it("podpis sedí v bezpečnej zóne reelu", () => {
    // Pôvodne bol na 1712 a v telefóne ho prekrýval popis s tlačidlami.
    for (const s of SKLADBY) {
      const z = poskladaj(s).find((p): p is Extract<Prvok, { druh: "znacka" }> => p.druh === "znacka")!;
      expect(z.y).toBeLessThan(BEZPECNE_DNO);
    }
  });
});

describe("uhlopriečny rez", () => {
  it("prvý riadok skončí nad najnižším bodom uhlopriečky", () => {
    // Najnižší bod je vpravo. Keď ho text preseká, riadok prereže hranu poľa
    // a polovica písmen je tmavá na tmavom.
    const s = SKLADBY.find((x) => x.cislo === 26)!;
    const dno = UHLOPRIECKA.prvyRiadok + s.nadpis.rez.prokladanie;
    expect(dno).toBeLessThan(UHLOPRIECKA.vpravo - 60);
  });
});

describe("písmeno cez šev", () => {
  const s = SKLADBY.find((x) => x.cislo === 23)!;

  it("šev preseká PÍSMENÁ, nie medzeru medzi riadkami", () => {
    // Toto je celý nápad tej skladby. Keď šev padne medzi riadky, ostanú
    // z toho len dva pásy a nikto nepochopí, čo tam malo byť.
    for (const t of ["Pánev", "Bolest zad\nnení", "Bolest zad\nnení\nproblém", "a\nb\nc\nd"]) {
      const riadky = R(t);
      const prvky = poskladaj(s, ({ nadpis: riadky, posun: riadky.map(() => 0) }));
      const c = prvky.find((p): p is Extract<Prvok, { druh: "cezSev" }> => p.druh === "cezSev")!;
      const cez = Math.floor(riadky.length / 2);
      const ucara = c.y + cez * c.rez.prokladanie + UCIARA(c.rez);
      // Verzálky idú od účiary hore. Šev musí padnúť medzi ich vrch a účiaru.
      const vrchVerzalky = ucara - 0.7 * c.rez.velkost;
      expect(c.sev).toBeGreaterThan(vrchVerzalky);
      expect(c.sev).toBeLessThan(ucara);
    }
  });

  it("šev drží na mieste a hýbe sa nadpis, nie naopak", () => {
    for (const t of ["Pánev", "a\nb\nc"]) {
      const riadky = R(t);
      const prvky = poskladaj(s, ({ nadpis: riadky, posun: riadky.map(() => 0) }));
      const c = prvky.find((p): p is Extract<Prvok, { druh: "cezSev" }> => p.druh === "cezSev")!;
      expect(c.sev).toBe(SEV.y);
    }
  });

  it("tmavá polovica hore a svetlá dole platí v oboch režimoch", () => {
    // Keby sa v tmavom režime stmavili obe, šev by zmizol a s ním nápad.
    for (const r of ["svetly", "tmavy"] as const) {
      const prvky = poskladaj(s, ({ f: farby(r) }));
      const c = prvky.find((p): p is Extract<Prvok, { druh: "cezSev" }> => p.druh === "cezSev")!;
      expect(c.hore).not.toBe(c.dole);
      const plochy = prvky.filter((p): p is Extract<Prvok, { druh: "plocha" }> => p.druh === "plocha");
      expect(plochy[0].farba).not.toBe(plochy[1].farba);
    }
  });

  it("kreslí nadpis dvakrát, orezaný nad a pod švom", () => {
    const svg = vykresli(poskladaj(s), ZVONKU);
    expect([...svg.matchAll(/<clipPath/g)].length).toBe(2);
    expect([...svg.matchAll(/clip-path="url\(#/g)].length).toBe(2);
  });
});

describe("výsek z bloku", () => {
  const s = SKLADBY.find((x) => x.cislo === 30)!;

  it("blok rastie s počtom riadkov", () => {
    // Pevná výška by pri jednom riadku nechala prázdny pás a pri troch by
    // písmená orezala.
    const jeden = poskladaj(s, ({ nadpis: R("Pánev"), posun: [0] }));
    const tri = poskladaj(s, ({ nadpis: R("a\nb\nc"), posun: [0, 0, 0] }));
    const blok = (p: Prvok[]) => p.find((x): x is Extract<Prvok, { druh: "vysek" }> => x.druh === "vysek")!.blok;
    expect(blok(tri).h - blok(jeden).h).toBe(2 * VYSEK.prokladanie);
  });

  it("písmená sa zmestia do bloku aj s lemom", () => {
    for (const t of ["Pánev", "a\nb\nc\nd"]) {
      const riadky = R(t);
      const v = poskladaj(s, ({ nadpis: riadky, posun: riadky.map(() => 0) }))
        .find((x): x is Extract<Prvok, { druh: "vysek" }> => x.druh === "vysek")!;
      expect(v.y).toBeGreaterThan(v.blok.y);
      expect(v.y + riadky.length * v.rez.prokladanie).toBeLessThanOrEqual(v.blok.y + v.blok.h);
    }
  });

  it("blok kontrastuje s pozadím v oboch režimoch", () => {
    // Výsek je diera, cez ktorú vidno pozadie. Tmavý blok na tmavom pozadí by
    // dal dieru, ktorú nikto neuvidí.
    for (const r of ["svetly", "tmavy"] as const) {
      const f = farby(r);
      const v = poskladaj(s, ({ f }))
        .find((x): x is Extract<Prvok, { druh: "vysek" }> => x.druh === "vysek")!;
      expect(v.blok.farba).not.toBe(f.pozadie);
      expect(v.blok.farba).toBe(f.blokVyseku);
    }
  });
});

describe("vykreslenie", () => {
  it("má rozmery z PSD", () => {
    const svg = svgSkladby(poskladaj(SKLADBY[0]), ZVONKU);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
  });

  it("nesie obe variačné osi", () => {
    // Canvas šírkovú os zahadzuje; keby vypadla odtiaľto, titulka by bola
    // užšia než v Photoshope a nikto by si nevšimol prečo.
    const svg = svgSkladby(poskladaj(SKLADBY[0]), ZVONKU);
    expect(svg).toContain("&quot;wdth&quot; 120");
    expect(svg).toContain("&quot;wght&quot; 800");
    expect(svg).toContain("&quot;wght&quot; 300");
  });

  it("optický posun ťahá riadok VON z okraja, nie dnu", () => {
    const svg = svgSkladby(poskladaj(SKLADBY[0]), ZVONKU);
    expect(svg).toContain('x="89.6"');
  });

  it("ošetrí znaky, ktoré by rozbili XML", () => {
    // Rozbité XML sa neprejaví chybou, ale prázdnym obrázkom — preto test.
    const svg = svgSkladby(poskladaj(SKLADBY[0], ({ nadpis: R('A & B <c>') })), ZVONKU);
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain("<c>");
  });

  it("diakritika prejde bez ošetrenia", () => {
    const svg = svgSkladby(poskladaj(SKLADBY[0], ({ nadpis: R("PÁNEV, ŽEBRA, ŘÍZENÍ") })), ZVONKU);
    expect(svg).toContain("PÁNEV, ŽEBRA, ŘÍZENÍ");
  });

  it("bez načítanej značky nespadne, len ju nenakreslí", () => {
    const svg = svgSkladby(poskladaj(SKLADBY[0]), { ...ZVONKU, znacka: {} });
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<svg x=");
  });

  it("orezy a masky majú jedinečné id", () => {
    // Dve kresby s rovnakým id si navzájom prepíšu obsah a prejaví sa to ako
    // fotka v nesprávnom tvare — nie ako chyba.
    const prvky: Prvok[] = [
      { druh: "fotka", x: 0, y: 0, w: 100, h: 100 },
      { druh: "fotka", x: 0, y: 200, w: 100, h: 100 },
    ];
    const svg = vykresli(prvky, ZVONKU);
    const idcka = [...svg.matchAll(/clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(idcka.length).toBe(2);
    expect(new Set(idcka).size).toBe(2);
  });

  it("predpona oddelí dve kresby na jednej stránke", () => {
    const p: Prvok[] = [{ druh: "fotka", x: 0, y: 0, w: 10, h: 10 }];
    expect(vykresli(p, ZVONKU, "a")).not.toBe(vykresli(p, ZVONKU, "b"));
  });

  it("kým fotka nie je, kreslí sa miesto na ňu", () => {
    const p: Prvok[] = [{ druh: "fotka", x: 0, y: 0, w: 100, h: 100 }];
    expect(vykresli(p, ZVONKU)).toContain("#8C9A92");
    expect(vykresli(p, { ...ZVONKU, obrazok: OBRAZOK })).toContain("<image");
  });

  it("vysek robí z písma dieru, nie farbu", () => {
    const p: Prvok[] = [{
      druh: "vysek", riadky: R("BOLEST"), x: 96, y: 500,
      rez: SKLADBY[0].nadpis.rez,
      blok: { x: 0, y: 400, w: 1080, h: 400, farba: "#1A2E24" },
    }];
    const svg = vykresli(p, ZVONKU);
    expect(svg).toContain("<mask");
    expect(svg).toContain('mask="url(#');
    expect(svg).toContain('fill="#000000"');
  });
});

describe("návrh skladby", () => {
  const zaklad = { faza: 3, text: "", kluc: "a" };

  it("meranie v texte pýta číslo", () => {
    // Merania sa v Jerryho príspevkoch píšu takto — „Ploché nohy ze 7 na 3."
    for (const t of ["Ploché nohy ze 7 na 3.", "7 → 3", "91 % klientů", "18 měsíců a změna"]) {
      expect(navrhniRodinu({ ...zaklad, text: t })).toBe("cislo");
    }
  });

  it("klientsky príbeh pýta fotku", () => {
    expect(navrhniRodinu({ ...zaklad, text: "Michal měl na začátku jednu obavu." })).toBe("fotka");
    expect(navrhniRodinu({ ...zaklad, text: "Petra přišla s bolestí." })).toBe("fotka");
  });

  it("piata fáza pýta fotku aj bez toho, aby to text priznal", () => {
    // Fáza „Rozhodnutý" pýta dôkaz konkrétneho človeka.
    expect(navrhniRodinu({ ...zaklad, faza: 5, text: "Něco obecného." })).toBe("fotka");
  });

  it("edukácia je slovo", () => {
    expect(navrhniRodinu({ ...zaklad, text: "Fyzioterapie funguje. To je důležité říct." })).toBe("slovo");
    expect(navrhniRodinu({ ...zaklad, faza: 1, text: "" })).toBe("slovo");
  });

  it("meranie prebije aj klientsky príbeh", () => {
    // Keď má príbeh číslo, číslo je silnejší obraz než fotka.
    expect(navrhniRodinu({ ...zaklad, text: "Michal měl ploché nohy ze 7 na 3." })).toBe("cislo");
  });

  it("ten istý príspevok má navždy tú istú skladbu", () => {
    const a = navrhniSkladbu({ faza: 2, text: "Edukácia", kluc: "napad-1" });
    const b = navrhniSkladbu({ faza: 2, text: "Edukácia", kluc: "napad-1" });
    expect(a.id).toBe(b.id);
  });

  it("susedné príspevky nedostanú tú istú skladbu dokola", () => {
    // Vo feede by sa inak opakovala jedna skladba.
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"]
      .map((k) => navrhniSkladbu({ faza: 2, text: "Edukácia", kluc: k }).id);
    expect(new Set(ids).size).toBeGreaterThan(1);
  });

  it("každá rodina má aspoň jednu skladbu", () => {
    // Kým to platí, návrh nikdy nepadá na náhradu. Test to stráži pre prípad,
    // že by sa skladba odstránila.
    for (const r of ["slovo", "cislo", "fotka"] as const) {
      expect(SKLADBY.some((s) => s.rodina === r)).toBe(true);
    }
  });

  it("navrhnutá rodina sedí s navrhnutou skladbou", () => {
    for (const [text, rodina] of [["91 %", "cislo"], ["Michal měl", "fotka"], ["Edukácia", "slovo"]] as const) {
      expect(navrhniSkladbu({ faza: 3, text, kluc: "x" }).rodina).toBe(rodina);
    }
  });

  it("navrhnutá skladba vždy existuje", () => {
    for (const f of [0, 1, 2, 3, 4, 5]) {
      for (const t of ["", "Michal měl", "7 → 3", "Edukácia o pánvi"]) {
        expect(SKLADBA_MAPA.has(navrhniSkladbu({ faza: f, text: t, kluc: t + f }).id)).toBe(true);
      }
    }
  });
});

describe("nadpis sa zmestí do stĺpca", () => {
  it("skladba si veľkosť želá, meranie ju smie zmenšiť", () => {
    // „Sklapovačky." má pri 200 px 1 240 px a stĺpec 888 — bez zmenšenia
    // text pretekal cez okraj a vyzeralo to ako chyba appky.
    const s = SKLADBY.find((x) => x.cislo === 40)!;
    const mensi = { ...s.nadpis.rez, velkost: 130, prokladanie: 133 };
    const prvky = s.zloz(obsah({ rezNadpisu: mensi, nadpis: R("Sklapovačky") }));
    const v = prvky.find((p): p is Extract<Prvok, { druh: "vPismenach" }> => p.druh === "vPismenach")!;
    expect(v.rez.velkost).toBe(130);
  });

  it("výrez fotky sa hýbe s veľkosťou písma, nie s pevným číslom", () => {
    const s = SKLADBY.find((x) => x.cislo === 40)!;
    const vysoka = (rezV: number) => {
      const r = { ...s.nadpis.rez, velkost: rezV, prokladanie: Math.round(rezV * 1.025) };
      const p = s.zloz(obsah({ rezNadpisu: r, nadpis: R("a\nb") }));
      const v = p.find((x): x is Extract<Prvok, { druh: "vPismenach" }> => x.druh === "vPismenach")!;
      return (v.vnutro[0] as Extract<Prvok, { druh: "fotka" }>).h;
    };
    expect(vysoka(200)).toBeGreaterThan(vysoka(130));
  });

  it("najmenší podiel drží skladbu pri živote", () => {
    // Pod ním už tridsiatka nie je tridsiatka, ale tmavý obdĺžnik.
    expect(NAJMENSI_PODIEL).toBeGreaterThan(0.5);
    expect(NAJMENSI_PODIEL).toBeLessThan(0.8);
  });
});

describe("fotkové skladby", () => {
  it("obe kreslia fotku a bez nej ukážu miesto na ňu", () => {
    for (const s of SKLADBY.filter((x) => x.rodina === "fotka")) {
      const svg = vykresli(poskladaj(s), ZVONKU);
      expect(svg).toContain("#8C9A92");
      const sObrazkom = vykresli(poskladaj(s), { ...ZVONKU, obrazok: OBRAZOK });
      expect(sObrazkom).toContain("<image");
      expect(sObrazkom).not.toContain("#8C9A92");
    }
  });

  it("duotón zvýrazní práve jeden riadok", () => {
    const s = SKLADBY.find((x) => x.cislo === 39)!;
    for (const t of ["Pánev", "a\nb\nc", "a\nb\nc\nd"]) {
      const riadky = R(t);
      const n = poskladaj(s, { nadpis: riadky, posun: riadky.map(() => 0) })
        .find((p): p is Extract<Prvok, { druh: "nadpis" }> => p.druh === "nadpis")!;
      const farby = n.farba as string[];
      expect(farby.filter((f) => f === farby[Math.floor(riadky.length / 2)]).length).toBeGreaterThanOrEqual(1);
      expect(new Set(farby).size).toBe(riadky.length > 1 ? 2 : 1);
    }
  });
});

describe("číselná skladba", () => {
  const s = SKLADBY.find((x) => x.cislo === 35)!;

  it("číslo a jednotka sú jeden text, nie dva vedľa seba", () => {
    // SVG posunie jednotku samo. Merať šírku čísla by bolo ďalšie meranie,
    // ktoré sa dá pokaziť.
    const svg = vykresli(poskladaj(s, { cislo: "18", jednotka: "MĚSÍCŮ" }), ZVONKU);
    const texty = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
    const sCislom = texty.filter((t) => t.includes("18"));
    expect(sCislom.length).toBe(1);
    expect(sCislom[0]).toContain("MĚSÍCŮ");
    expect([...sCislom[0].matchAll(/<tspan/g)].length).toBe(2);
  });

  it("bez čísla nenechá hore dieru", () => {
    // Skladba sa nemá tváriť ako rozbitá, kým Jerry číslo nedopíše.
    const sCislom = poskladaj(s, { cislo: "18", jednotka: "%" })
      .find((p): p is Extract<Prvok, { druh: "nadpis" }> => p.druh === "nadpis")!;
    const bez = poskladaj(s, { cislo: "", jednotka: "" })
      .find((p): p is Extract<Prvok, { druh: "nadpis" }> => p.druh === "nadpis")!;
    expect(bez.y).toBeLessThan(sCislom.y);
    expect(vykresli(poskladaj(s, { cislo: "" }), ZVONKU)).not.toContain("cislo");
  });

  it("dlhá jednotka nedobehne pravý okraj", () => {
    // „18 MĚSÍCŮ" je pri východzích rezoch širšie než stĺpec. Meranie ich
    // zmenší SPOLU, aby si medzi sebou nezmenili pomer.
    const zmensene = rezyCisla(0.7);
    expect(zmensene.cislo.velkost / zmensene.jednotka.velkost)
      .toBeCloseTo(rezyCisla(1).cislo.velkost / rezyCisla(1).jednotka.velkost, 1);
  });

  it("krátka aj dlhá jednotka sadne na tú istú účiaru", () => {
    for (const j of ["%", "MĚSÍCŮ"]) {
      const c = poskladaj(s, { cislo: "91", jednotka: j })
        .find((p): p is Extract<Prvok, { druh: "cislo" }> => p.druh === "cislo")!;
      expect(c.y).toBe(CISLO.y);
      expect(c.rezJednotky.velkost).toBeLessThan(c.rez.velkost);
    }
  });
});

describe("úpravy", () => {
  const s = SKLADBY[0];

  it("bez úprav sa nič nekopíruje", () => {
    const p = poskladaj(s);
    expect(pouziUpravy(p, {})).toBe(p);
    expect(pouziUpravy(p, undefined)).toBe(p);
    expect(pouziUpravy(p, { nadpis: BEZ_UPRAVY })).toBe(p);
  });

  it("posun sa vezie so skladbou, nie s pevnou pozíciou", () => {
    // Toto je celý dôvod, prečo sú to posuny: dlhší nadpis posunie podnadpis
    // nižšie a úprava ide s ním. Pevná súradnica by ostala visieť v prázdne.
    const kratky = pouziUpravy(poskladaj(s, { nadpis: R("Pánev"), posun: [0] }), { podnadpis: { dx: 0, dy: 40, k: 1 } });
    const dlhy = pouziUpravy(poskladaj(s, { nadpis: R("a\nb\nc"), posun: [0, 0, 0] }), { podnadpis: { dx: 0, dy: 40, k: 1 } });
    const y = (p: Prvok[]) => p.find((x) => x.rola === "podnadpis" && x.druh === "text")!;
    expect((dlhy.find((x) => x.rola === "podnadpis") as { y: number }).y)
      .toBeGreaterThan((kratky.find((x) => x.rola === "podnadpis") as { y: number }).y);
    void y;
  });

  it("posunie sa len vybraná rola", () => {
    const p = pouziUpravy(poskladaj(s), { stitok: { dx: 30, dy: 0, k: 1 } });
    const povodne = poskladaj(s);
    const stitok = p.find((x) => x.rola === "stitok") as { x: number };
    const povodnyStitok = povodne.find((x) => x.rola === "stitok") as { x: number };
    expect(stitok.x - povodnyStitok.x).toBe(30);
    const znacka = p.find((x) => x.rola === "znacka") as { x: number };
    const povodnaZnacka = povodne.find((x) => x.rola === "znacka") as { x: number };
    expect(znacka.x).toBe(povodnaZnacka.x);
  });

  it("plocha sa zväčšuje od stredu, nie od rohu", () => {
    // Zväčšovanie od rohu by prvok posúvalo doprava dole a Jerry by ho
    // doťahoval späť po každom kroku.
    const p = pouziUpravy(
      [{ rola: "nadpis", druh: "plocha", x: 100, y: 200, w: 200, h: 400, farba: "#000" }],
      { nadpis: { dx: 0, dy: 0, k: 2 } },
    )[0] as Extract<Prvok, { druh: "plocha" }>;
    expect(p.x + p.w / 2).toBe(200);
    expect(p.y + p.h / 2).toBe(400);
    expect(p.w).toBe(400);
  });

  it("výsek posunie aj blok, nielen písmená", () => {
    const s30 = SKLADBY.find((x) => x.cislo === 30)!;
    const p = pouziUpravy(poskladaj(s30), { nadpis: { dx: 0, dy: 50, k: 1 } })
      .find((x): x is Extract<Prvok, { druh: "vysek" }> => x.druh === "vysek")!;
    const povodny = poskladaj(s30).find((x): x is Extract<Prvok, { druh: "vysek" }> => x.druh === "vysek")!;
    expect(p.y - povodny.y).toBe(50);
    expect(p.blok.y - povodny.blok.y).toBe(50);
  });

  it("prichytenie robí cestu späť ľahšou než cestu preč", () => {
    expect(prichytenie(5)).toBe(0);
    expect(prichytenie(-7)).toBe(0);
    expect(prichytenie(30)).toBe(32);
  });

  it("každá skladba ponúkne aspoň nadpis a značku", () => {
    for (const x of SKLADBY) {
      const r = roleSkladby(poskladaj(x));
      expect(r).toContain("nadpis");
      expect(r).toContain("znacka");
    }
  });

  it("chytať sa dá len v náhľade, nie v exporte", () => {
    // V PNG by boli značky mŕtva váha.
    expect(svgSkladby(poskladaj(s), ZVONKU, "a", true)).toContain('data-rola="nadpis"');
    expect(svgSkladby(poskladaj(s), ZVONKU, "a", false)).not.toContain("data-rola");
  });
});

describe("uložené nastavenie", () => {
  const plne = {
    skladba: SKLADBY[0].id, rezim: "tmavy" as const, stitok: "BIOMECHANIKA",
    nadpis: "Bolest zad", podnadpis: "Řízení.", cislo: "18", jednotka: "MĚSÍCŮ",
    upravy: { nadpis: { dx: 8, dy: -16, k: 1.2 } },
  };

  it("prejde tam a späť bez straty", () => {
    expect(citaj(zapis(plne))).toEqual(plne);
  });

  it("pokazený JSON otvorí titulku ako novú, nespadne", () => {
    // Okno, ktoré spadne na starom zázname, je horšie než okno, ktoré začne
    // odznova — z prvého sa Jerry nedostane vôbec.
    for (const zly of ["", "   ", "{", "null", "[]", '"text"', '{"skladba":123}']) {
      expect(() => citaj(zly)).not.toThrow();
    }
    expect(citaj("{")).toBeNull();
  });

  it("neznámu skladbu zahodí a nechá navrhnúť znova", () => {
    // Premenovaná alebo odstránená skladba by inak zostala v zázname navždy.
    expect(citaj(JSON.stringify({ ...plne, skladba: "uzNeexistuje" }))?.skladba).toBeUndefined();
  });

  it("neznámu rolu v úpravách ignoruje", () => {
    const v = citaj(JSON.stringify({ upravy: { nadpis: { dx: 5, dy: 0, k: 1 }, vymysleneu: { dx: 9 } } }));
    expect(Object.keys(v?.upravy ?? {})).toEqual(["nadpis"]);
  });

  it("nezmyselné čísla nahradí neutrálnymi", () => {
    const v = citaj(JSON.stringify({ upravy: { nadpis: { dx: "x", dy: null, k: 0 } } }));
    expect(v?.upravy?.nadpis).toEqual({ dx: 0, dy: 0, k: 1 });
  });

  it("fotka sa neukladá", () => {
    // Ako data: URI by nafúkla každú odpoveď plánovača o stovky kilobajtov.
    expect(zapis(plne)).not.toContain("data:");
    expect(zapis(plne).length).toBeLessThan(400);
  });
});

describe("výrez fotky", () => {
  const ram = { x: 0, y: 0, w: 1080, h: 1920 };
  const obr = { sirka: 1080, vyska: 1440 };

  it("obrázok VŽDY vyplní rám, nikdy nenechá dieru", () => {
    for (const v of [
      { dx: 0, dy: 0, k: 1 },
      { dx: 9999, dy: -9999, k: 1 },
      { dx: 0, dy: 0, k: 0.2 },
      { dx: -400, dy: 300, k: 2.5 },
    ]) {
      const r = umiestniObrazok(ram, obr, v);
      expect(r.x).toBeLessThanOrEqual(ram.x + 0.001);
      expect(r.y).toBeLessThanOrEqual(ram.y + 0.001);
      expect(r.x + r.w).toBeGreaterThanOrEqual(ram.x + ram.w - 0.001);
      expect(r.y + r.h).toBeGreaterThanOrEqual(ram.y + ram.h - 0.001);
    }
  });

  it("drží pomer strán obrázka", () => {
    const r = umiestniObrazok(ram, obr, { dx: 120, dy: -80, k: 1.4 });
    expect(r.w / r.h).toBeCloseTo(obr.sirka / obr.vyska, 3);
  });

  it("posun naozaj mení, ktorá časť je vidieť", () => {
    const stred = umiestniObrazok(ram, obr, { dx: 0, dy: 0, k: 2 });
    const bokom = umiestniObrazok(ram, obr, { dx: 100, dy: 0, k: 2 });
    expect(bokom.x - stred.x).toBe(100);
  });

  it("priblíženie pod 100 % sa ignoruje", () => {
    // Pod ním by obrázok rám nevyplnil a na kraji by ostalo prázdno.
    expect(umiestniObrazok(ram, obr, { dx: 0, dy: 0, k: 0.5 }))
      .toEqual(umiestniObrazok(ram, obr, { dx: 0, dy: 0, k: 1 }));
  });

  it("rám fotky sa úpravami nehýbe", () => {
    // Rámom je celé plátno alebo tvar písmen — posunúť ho znamená spraviť dieru.
    const p: Prvok[] = [{ rola: "fotka", druh: "fotka", x: 0, y: 0, w: 100, h: 100 }];
    expect(pouziUpravy(p, { fotka: { dx: 50, dy: 50, k: 2 } })[0]).toEqual(p[0]);
  });

  it("editor nájde fotku aj vnútri písmen", () => {
    const s40 = SKLADBY.find((x) => x.cislo === 40)!;
    expect(roleSkladby(poskladaj(s40))).toContain("fotka");
    expect(roleSkladby(poskladaj(s40))).toContain("nadpis");
  });

  it("nulové rozmery obrázka nespôsobia delenie nulou", () => {
    const r = umiestniObrazok(ram, { sirka: 0, vyska: 0 }, { dx: 0, dy: 0, k: 1 });
    expect(Number.isFinite(r.w)).toBe(true);
    expect(Number.isFinite(r.h)).toBe(true);
  });
});

describe("zarovnanie", () => {
  const s = SKLADBY[0];

  it("je kotva, nie posun — drží okraj aj pri zmene textu", () => {
    const vpravo = pouziUpravy(poskladaj(s), { nadpis: { ...BEZ_UPRAVY, zarovnanie: "vpravo" } })
      .find((p): p is Extract<Prvok, { druh: "nadpis" }> => p.druh === "nadpis")!;
    expect(vpravo.x).toBe(PLATNO.sirka - PLATNO.okraj);
    expect(vpravo.zarovnanie).toBe("vpravo");
  });

  it("na stred sadá na os plátna", () => {
    const stred = pouziUpravy(poskladaj(s), { nadpis: { ...BEZ_UPRAVY, zarovnanie: "stred" } })
      .find((p): p is Extract<Prvok, { druh: "nadpis" }> => p.druh === "nadpis")!;
    expect(stred.x).toBe(PLATNO.sirka / 2);
  });

  it("posun sa pripočíta až ku kotve, takže sa dá kombinovať oboje", () => {
    const p = pouziUpravy(poskladaj(s), { nadpis: { dx: 24, dy: 0, k: 1, zarovnanie: "stred" } })
      .find((x): x is Extract<Prvok, { druh: "nadpis" }> => x.druh === "nadpis")!;
    expect(p.x).toBe(PLATNO.sirka / 2 + 24);
  });

  it("zarovnanie doľava je odteraz skutočný pokyn, nie „nechaj tak“", () => {
    // Kým bol podpis vľavo, mohlo to znamenať „nechaj tak". Odkedy je
    // východzie na strede, musí prepnutie doľava značku naozaj presunúť.
    const s = SKLADBY[0];
    const z = pouziUpravy(poskladaj(s), { znacka: { ...BEZ_UPRAVY, zarovnanie: "vlavo" } })
      .find((p): p is Extract<Prvok, { druh: "znacka" }> => p.druh === "znacka")!;
    expect(z.x).toBe(PLATNO.okraj);
  });

  it("zväčšená značka ostane na strede", () => {
    // Mierka mení šírku; bez prepočtu stredu by značka ušla doprava.
    const s = SKLADBY[0];
    const z = pouziUpravy(poskladaj(s), { znacka: { dx: 0, dy: 0, k: 1.5 } })
      .find((p): p is Extract<Prvok, { druh: "znacka" }> => p.druh === "znacka")!;
    expect(z.x + z.sirka / 2).toBe(PLATNO.sirka / 2);
  });

  it("značka sa zarovnáva podľa vlastnej šírky, nie podľa kotvy textu", () => {
    // Nemá `text-anchor`, takže sa musí posunúť o celú svoju šírku.
    const z = pouziUpravy(poskladaj(s), { znacka: { ...BEZ_UPRAVY, zarovnanie: "vpravo" } })
      .find((p): p is Extract<Prvok, { druh: "znacka" }> => p.druh === "znacka")!;
    expect(z.x + z.sirka).toBe(PLATNO.sirka - PLATNO.okraj);
  });

  it("predsádzka sa uplatní len pri zarovnaní doľava", () => {
    // Inde by riadok ťahala mimo osi, na ktorej má visieť.
    const doprava = vykresli(
      pouziUpravy(poskladaj(s), { nadpis: { ...BEZ_UPRAVY, zarovnanie: "vpravo" } }), ZVONKU);
    expect(doprava).toContain('text-anchor="end"');
    expect(doprava).not.toContain('x="977.6"');
  });

  it("výsek aj fotka v písmenách sa zarovnať dajú", () => {
    for (const c of [30, 40]) {
      const x = SKLADBY.find((y) => y.cislo === c)!;
      const p = pouziUpravy(poskladaj(x), { nadpis: { ...BEZ_UPRAVY, zarovnanie: "stred" } })
        .find((y) => y.rola === "nadpis") as { x: number };
      expect(p.x).toBe(PLATNO.sirka / 2);
    }
  });
});

describe("fotka v prázdnom páse", () => {
  it("skladby zo Slova a Čísla ju ponúknu", () => {
    for (const s of SKLADBY.filter((x) => x.rodina !== "fotka")) {
      expect(s.polia).toContain("fotka");
    }
  });

  it("bez fotky sa pás nekreslí", () => {
    const s = SKLADBY.find((x) => x.cislo === 31)!;
    const kratky = { nadpis: R("Pánev"), podnadpis: [], posun: [0] };
    expect(poskladaj(s, { ...kratky, maFotku: false }).some((p) => p.druh === "fotka")).toBe(false);
    expect(poskladaj(s, { ...kratky, maFotku: true }).some((p) => p.druh === "fotka")).toBe(true);
  });

  it("pri dlhom texte sa pás neponúkne — nie je kam", () => {
    // Nadpis, podnadpis, pás aj podpis sa do 1540 px nezmestia naraz. Radšej
    // žiadna fotka než prúžok pod textom.
    const s = SKLADBY.find((x) => x.cislo === 31)!;
    const dlhy = { nadpis: R("a\nb\nc\nd"), podnadpis: ["Jedna.", "Druhá."], posun: [0, 0, 0, 0], maFotku: true };
    expect(poskladaj(s, dlhy).some((p) => p.druh === "fotka")).toBe(false);
  });

  it("nízky pás sa neponúkne — z fotky by bol prúžok", () => {
    expect(pasFotky(PODPIS.y - 200)).toBeNull();
    expect(pasFotky(400)).not.toBeNull();
  });

  it("pás nikdy nezasiahne podpis", () => {
    for (const dno of [300, 600, 900, 1200]) {
      const p = pasFotky(dno);
      if (p) expect(p.y + p.h).toBeLessThan(PODPIS.y);
    }
  });
});
