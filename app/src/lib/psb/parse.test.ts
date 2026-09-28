import { describe, expect, test } from "bun:test";

import { datumNarodenia, detectCSVType, jeIkonaMiestoCisla, parseAnamneza, parseIdoklad, parsePackages } from "./parse";

/**
 * Anamnéza je Google Forms a ľudia si do nej píšu sami. Preto sa z nej berie
 * len to, čo sa dá overiť — a nezrozumiteľný tvar sa radšej zahodí než uhádne.
 */
describe("dátum narodenia z anamnézy", () => {
  test("prijme tvary, v ktorých to ľudia píšu", () => {
    expect(datumNarodenia("12.3.1984")).toBe("1984-03-12");
    expect(datumNarodenia("1984-03-12")).toBe("1984-03-12");
    expect(datumNarodenia("12/03/1984")).toBe("1984-03-12");
    expect(datumNarodenia(" 5. 9. 1990 ")).toBe("1990-09-05");
  });

  test("nezrozumiteľný tvar zahodí, neuhádne", () => {
    expect(datumNarodenia("marec 84")).toBe("");
    expect(datumNarodenia("")).toBe("");
    expect(datumNarodenia("32.13.1984")).toBe("");
  });

  test("rok v budúcnosti je preklep, nie dátum", () => {
    // Naďa Khamaziuk mala v exporte rok 2036 a appka ju kvôli tomu považovala
    // za dieťa. Zlý rok narodenia je horší než žiadny.
    expect(datumNarodenia("1.1.2036")).toBe("");
    expect(datumNarodenia("1.1.1899")).toBe("");
  });
});

describe("parseAnamneza", () => {
  const csv = (riadky: string[][]) => riadky.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");

  test("vytiahne meno, zdroj aj narodeniny", () => {
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Datum narození", "Jak jste se o nás dozvěděli?"],
      ["Jana", "Nováková", "12.3.1984", "Instagram"],
    ]));
    expect(v).toHaveLength(1);
    expect(v[0].meno).toBe("Jana Nováková");
    expect(v[0].narodeniny).toBe("1984-03-12");
    expect(v[0].zdroj).toBeTruthy();
  });

  test("bez stĺpca s narodeninami funguje ako doteraz", () => {
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Jak jste se o nás dozvěděli?"],
      ["Jana", "Nováková", "Instagram"],
    ]));
    expect(v[0].narodeniny).toBe("");
    expect(v[0].zdroj).toBeTruthy();
  });

  test("riadok s narodeninami a bez zdroja sa nezahodí", () => {
    // Zdroj a narodeniny sú dve nezávislé polia; jedno bez druhého má cenu.
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Datum narození", "Jak jste se o nás dozvěděli?"],
      ["Jana", "Nováková", "12.3.1984", ""],
    ]));
    expect(v).toHaveLength(1);
    expect(v[0].narodeniny).toBe("1984-03-12");
  });

  test("riadok bez mena sa preskočí", () => {
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Jak jste se o nás dozvěděli?"],
      ["", "", "Instagram"],
    ]));
    expect(v).toEqual([]);
  });
});

describe("PTminder vie miesto čísla vyexportovať ikonu", () => {
  const hlavicka = "First Name,Last Name,Client Status,Membership,Payment,# of sessions,# of classes,# of sessions in current period,# of classes in current period,Status,Added,Dates,Duration,Payments Schedule";
  const ikona = "<i class=bootstrap-tooltip far fa-question-circle credits-in-current-period data-type=sessions data-original-title=Click to see the number of available credits for the current period style=cursor: pointer;></i>";

  test("rozpozná ikonu v riadku", () => {
    expect(jeIkonaMiestoCisla(`Albert,Matl,Active Client,OFF - 6h,CZK7790,6 per 8-week,0 per week,${ikona}`)).toBe(true);
    expect(jeIkonaMiestoCisla("Anetka,Přinosilová,Active Client,OFF - 18 hodín offline,CZK21150,18 per 6-month,0 per month,16 left from 18")).toBe(false);
  });

  test("keď je zostatok číslo, prečíta sa", () => {
    const csv = `${hlavicka}\nAnetka,Přinosilová,Active Client,OFF - 18 hodín offline,CZK21150,18 per 6-month,0 per month,16 left from 18,0 left from 0,active,05 Sep; 2026,02 Sep  2026 - 01 Mar  2027,1 6-monthly,none`;
    expect(parsePackages(csv)[0]).toMatchObject({ remaining: 16, total: 18, validFrom: "2026-09-02", kind: "membership" });
  });

  test("keď je tam ikona, zostatok je 0/0 — appka ho dopočíta z názvu", () => {
    const csv = `${hlavicka}\nAlbert,Matl,Active Client,OFF - 6h BEZ viazanosti,CZK7790,6 per 8-week,0 per week,${ikona},${ikona},active,20 Sep; 2026,16 Sep  2026 - 10 Nov  2026,1 8-weekly,none`;
    expect(parsePackages(csv)[0]).toMatchObject({ remaining: 0, total: 0, validFrom: "2026-09-16" });
  });
});

describe("vydané faktúry z iDokladu", () => {
  const csv = [
    "Číslo dokladu,Popis,Název/Jméno,Vystaveno,Splatnost,Celkem,Měna,Stav úhrady",
    "20260037,Individualni vzdelávací program,FSH Devices s.r.o.,09/13/2026,09/20/2026,6990.00,Kč,Uhrazeno",
    "20260032,Fakturujem 6 blokov,\"DK Consulting, s.r.o.\",08/31/2026,09/14/2026,15580.00,Kč,Uhrazeno",
  ].join("\n");

  test("rozpozná sa podľa hlavičky", () => {
    expect(detectCSVType(csv)).toBe("idoklad");
  });

  test("dátum je AMERICKÝ — 09/13 je september, nie 9. trinásty", () => {
    expect(parseIdoklad(csv)[0]).toMatchObject({
      cislo: "20260037", nazov: "FSH Devices s.r.o.", suma: 6990,
      vystaveno: "2026-09-13", splatnost: "2026-09-20", stav: "Uhrazeno",
    });
  });

  test("meno s čiarkou v úvodzovkách sa nerozpadne", () => {
    expect(parseIdoklad(csv)[1]).toMatchObject({ cislo: "20260032", nazov: "DK Consulting, s.r.o.", suma: 15580 });
  });

  test("riadok bez čísla dokladu sa preskočí", () => {
    expect(parseIdoklad(`${csv}\n,Poznámka,,,,,,`)).toHaveLength(2);
  });
});
