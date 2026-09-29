import { describe, expect, it } from "bun:test";

import { nahradenieObdobia, type RiadokVKokpite, type RiadokVSubore } from "./nahradenieObdobia";

const kluc = (d: string, t: string, k: string, tr: string) => `${d}T00:00:00.000Z|${t}|${k}|${tr}`;
const vSubore = (d: string, t: string, k: string, tr = "Jerry"): RiadokVSubore =>
  ({ date: `${d}T00:00:00.000Z`, sessionTrainer: tr, kluc: kluc(d, t, k, tr) });
let n = 0;
const vKokpite = (d: string, t: string, k: string, tr = "Jerry"): RiadokVKokpite =>
  ({ id: `id${++n}`, date: `${d}T00:00:00.000Z`, time: t, client_name: k, session_trainer: tr, dedup_key: kluc(d, t, k, tr) });
const nicZamknute = () => false;

describe("nahradenieObdobia", () => {
  it("opravený klient v PTminderi: starý riadok zmizne (Lenka → Maty, 17. 9.)", () => {
    const subor = [vSubore("2026-09-15", "4:00pm", "Lenka Prinosilova"), vSubore("2026-09-17", "3:00pm", "Maty Přínosil")];
    const kokpit = [
      vKokpite("2026-09-15", "4:00pm", "Lenka Prinosilova"),
      vKokpite("2026-09-17", "3:00pm", "Lenka Prinosilova"),
      vKokpite("2026-09-17", "3:00pm", "Maty Přínosil"),
    ];
    const v = nahradenieObdobia(subor, kokpit, nicZamknute);
    expect(v.odstranit.map((r) => r.client_name)).toEqual(["Lenka Prinosilova"]);
    expect(v.odstranit[0].date.slice(0, 10)).toBe("2026-09-17");
  });

  it("mimo rozsahu súboru sa nemaže — export do 27. 9. nechá 28. 9. tak", () => {
    const subor = [vSubore("2026-09-20", "9:00am", "A"), vSubore("2026-09-27", "9:00am", "B")];
    const kokpit = [vKokpite("2026-09-28", "9:00am", "C"), vKokpite("2026-09-19", "9:00am", "D")];
    expect(nahradenieObdobia(subor, kokpit, nicZamknute).odstranit).toEqual([]);
  });

  it("export len za Jerryho nezmaže Terezku", () => {
    const subor = [vSubore("2026-09-20", "9:00am", "A", "Jerry")];
    const kokpit = [vKokpite("2026-09-20", "10:00am", "B", "Terezka")];
    expect(nahradenieObdobia(subor, kokpit, nicZamknute).odstranit).toEqual([]);
  });

  it("v zamknutom mesiaci sa nemaže nič", () => {
    const subor = [vSubore("2026-08-01", "9:00am", "A"), vSubore("2026-09-01", "9:00am", "B")];
    const kokpit = [vKokpite("2026-08-05", "5:00pm", "Michal Knapčok")];
    const zamknuty = (d: string) => d.startsWith("2026-08");
    expect(nahradenieObdobia(subor, kokpit, zamknuty).odstranit).toEqual([]);
  });

  it("keď by sa malo zmazať priveľa, nezmaže sa nič a povie sa prečo", () => {
    // Súbor s iným tvarom mena trénera — všetko v Kokpite by vyzeralo navyše.
    const subor = Array.from({ length: 60 }, (_, i) => vSubore(`2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, `${i}:00`, `K${i}`, "Jerry"));
    const kokpit = Array.from({ length: 60 }, (_, i) => vKokpite(`2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, `${i}:00`, `X${i}`, "Jerry"));
    const v = nahradenieObdobia(subor, kokpit, nicZamknute);
    expect(v.odstranit).toEqual([]);
    expect(v.zastavene).toContain("Nezmazal som nič");
  });

  it("prázdny súbor nemaže nič", () => {
    expect(nahradenieObdobia([], [vKokpite("2026-09-20", "9:00am", "A")], nicZamknute).odstranit).toEqual([]);
  });
});
