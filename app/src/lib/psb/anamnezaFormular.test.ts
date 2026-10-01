import { describe, expect, it } from "bun:test";

import { FORMULAR, viditelne, zobrazit, zTestuPostury, type Otazka, popisOdchylky } from "./anamnezaFormular";

const klientskaSekcia = FORMULAR.klient[0];
const otazka = (id: string): Otazka => {
  const o = klientskaSekcia.otazky.find((x) => x.id === id);
  if (!o) throw new Error(`otázka ${id} neexistuje`);
  return o;
};

describe("klientska časť je krátka — to je celý jej zmysel", () => {
  it("kto nemá bolesti, odpovedá na tri otázky", () => {
    const odp = { privadza: "Nic mě nebolí, chci se líp hýbat" };
    const vidno = viditelne(klientskaSekcia, odp).map((o) => o.id);
    expect(vidno).toEqual(["privadza", "ciel", "zakaz"]);
  });

  it("kto má bolesti, dostane oblasti, vlajky a lieky — nie cieľ", () => {
    const odp = { privadza: "Něco mě bolí" };
    const vidno = viditelne(klientskaSekcia, odp).map((o) => o.id);
    expect(vidno).toEqual(["privadza", "oblasti", "vlajky", "lieky", "zakaz"]);
    expect(vidno).not.toContain("ciel");
  });

  it("diagnóza ide tou istou cestou ako bolesť", () => {
    // Skolióza a výhřez bolesť obvykle sprevádza; červené vlajky sa tu
    // pýtať musia rovnako.
    const odp = { privadza: "Konkrétní diagnóza — skolióza, výhřez, asymetrie…" };
    expect(viditelne(klientskaSekcia, odp).map((o) => o.id)).toContain("vlajky");
  });

  it("zákaz od lekára sa pýta v OBOCH cestách", () => {
    for (const p of ["Něco mě bolí", "Nic mě nebolí, chci se líp hýbat"]) {
      expect(viditelne(klientskaSekcia, { privadza: p }).map((o) => o.id)).toContain("zakaz");
    }
  });
});

describe("doplnenie k červeným vlajkám", () => {
  const popis = otazka("vlajky_popis");

  it("„nic z toho“ doplnenie NEOTVORÍ", () => {
    expect(zobrazit(popis, { privadza: "Něco mě bolí", vlajky: ["nic z toho"] })).toBe(false);
  });

  it("ktorákoľvek vlajka ho otvorí", () => {
    expect(zobrazit(popis, { privadza: "Něco mě bolí", vlajky: ["závratě nebo mdloby"] })).toBe(true);
  });

  it("prázdna odpoveď ho neotvorí", () => {
    expect(zobrazit(popis, { privadza: "Něco mě bolí" })).toBe(false);
    expect(zobrazit(popis, { privadza: "Něco mě bolí", vlajky: [] })).toBe(false);
  });
});

describe("test postury predvypĺňa tie isté oblasti", () => {
  // Doslovná poznámka z ostrých dát (Josef Pávek, 13. 9. 2026).
  const skutocna = "Nový test postury — Josef Pávek · NOVÝ TEST POSTURY ===================================== "
    + "Jméno: Josef Pávek E-mail: josef.pavek@gmail.com Telefon: +420773972649 "
    + "Hovor: Ne, stačí mi analýza e-mailem OBLASTI BOLESTI: koleno, bedro, krc "
    + "POSTURÁLNÍ ODCHYLKY: predsunutahlab, jedno-rameno-nize, vysazena-panev, prepadla-kolena "
    + "IDENTIFIKOVANÝ VZOREC: 08 — Vzorec globální posturální dysbalance "
    + "POZNÁMKA OD KLIENTA: Chtěl bych se objednat na úvodní trénink";

  it("prepíše jednotné číslo bez diakritiky na oblasti anamnézy", () => {
    const v = zTestuPostury(skutocna);
    expect(v?.oblasti).toEqual(["kolena", "bedra", "krk"]);
  });

  it("vytiahne odchýlky aj vzorec", () => {
    const v = zTestuPostury(skutocna);
    expect(v?.odchylky).toContain("jedno-rameno-nize");
    expect(v?.vzorec).toContain("globální posturální dysbalance");
  });

  it("poznámka, ktorá test nie je, vráti null", () => {
    expect(zTestuPostury("Dobrý den, chtěl bych se objednat.")).toBeNull();
    expect(zTestuPostury("")).toBeNull();
  });
});

describe("kľúče odpovedí sú stabilné", () => {
  it("žiadne dve otázky nemajú v rámci svojej časti ten istý id", () => {
    for (const cast of [FORMULAR.klient, FORMULAR.zapis]) {
      const vsetky = cast.flatMap((s) => s.otazky.map((o) => `${s.id}.${o.id}`));
      expect(new Set(vsetky).size).toBe(vsetky.length);
    }
  });

  it("každá vetva ukazuje na otázku, ktorá naozaj existuje", () => {
    for (const cast of [FORMULAR.klient, FORMULAR.zapis]) {
      for (const s of cast) {
        const ids = new Set(s.otazky.map((o) => o.id));
        for (const o of s.otazky) {
          if (o.vetva) expect({ otazka: o.id, ukazuje: o.vetva.otazka, existuje: ids.has(o.vetva.otazka) })
            .toEqual({ otazka: o.id, ukazuje: o.vetva.otazka, existuje: true });
        }
      }
    }
  });

  it("v ponuke zdrojov nie je LinkedIn ani Facebook", () => {
    // Jerry, 30. 9. 2026 — za 56 odpovedí ich neuviedol nikto.
    const zdroj = FORMULAR.zapis.flatMap((s) => s.otazky).find((o) => o.id === "zdroj");
    expect(zdroj?.moznosti?.join(" ")).not.toContain("LinkedIn");
    expect(zdroj?.moznosti?.join(" ")).not.toContain("Facebook");
  });
});

describe("popisOdchylky", () => {
  it("slug z testu sa prečíta po česky", () => {
    expect(popisOdchylky("predsunutahlab")).toBe("předsunutá hlava");
    expect(popisOdchylky("vysazena-panev")).toBe("vysazená pánev");
    expect(popisOdchylky("PREPADLA-KOLENA")).toBe("kolena padají dovnitř");
  });

  it("neznámy slug prejde, nezmizne", () => {
    // Keď na webe pribudne tlačidlo, tréner má vidieť aspoň jeho hodnotu —
    // prázdne miesto by vyzeralo, že klient nič neoznačil.
    expect(popisOdchylky("nove-neco")).toBe("nove-neco");
  });

  it("odchýlky Josefa Pávka sa dajú prečítať celé", () => {
    const t = zTestuPostury(
      "NOVÝ TEST POSTURY OBLASTI BOLESTI: koleno, bedro, krc POSTURÁLNÍ ODCHYLKY: "
      + "predsunutahlab, jedno-rameno-nize, vysazena-panev, prepadla-kolena "
      + "IDENTIFIKOVANÝ VZOREC: 08 — Vzorec globální posturální dysbalance POZNÁMKA OD KLIENTA: nic",
    );
    expect(t?.odchylky.map(popisOdchylky)).toEqual(
      ["předsunutá hlava", "jedno rameno níže", "vysazená pánev", "kolena padají dovnitř"],
    );
  });
});
