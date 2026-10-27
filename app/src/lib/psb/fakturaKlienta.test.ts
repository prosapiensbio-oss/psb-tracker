import { describe, expect, it } from "bun:test";

import { blokFakturyHtml, platneIco, udajeHotove, udajeZAres, vstupZFormulara } from "./fakturaKlienta";
import { uvodnaStrankaHtml } from "./uvodnaStranka";

describe("IČO s kontrolnou číslicou", () => {
  it("platné prejde, preklep nie", () => {
    expect(platneIco("27074358")).toBe(true);
    expect(platneIco("27074357")).toBe(false);
    expect(platneIco("2707435")).toBe(false);
    expect(platneIco("abc")).toBe(false);
  });
  it("medzery nevadia", () => {
    expect(platneIco("270 74 358")).toBe(true);
  });
});

describe("register ARES → faktúra", () => {
  it("ulica s číslom popisným aj orientačným, Praha s obvodom, PSČ s medzerou", () => {
    const u = udajeZAres({
      obchodniJmeno: "Asseco Central Europe, a.s.", dic: "CZ27074358",
      sidlo: { nazevObce: "Praha", nazevMestskehoObvodu: "Praha 4", nazevUlice: "Budějovická", cisloDomovni: 778, cisloOrientacni: 3, cisloOrientacniPismeno: "a", psc: 14000 },
    });
    expect(u).toEqual({ firma: "Asseco Central Europe, a.s.", dic: "CZ27074358", ulica: "Budějovická 778/3a", psc: "140 00", mesto: "Praha 4" });
  });
  it("obec bez ulíc: časť obce a číslo popisné", () => {
    const u = udajeZAres({ obchodniJmeno: "Jan Novák", sidlo: { nazevObce: "Lelekovice", nazevCastiObce: "Lelekovice", cisloDomovni: 12, psc: 66431 } });
    expect(u?.ulica).toBe("Lelekovice 12");
    expect(u?.mesto).toBe("Lelekovice");
    expect(u?.dic).toBe("");
  });
  it("bez názvu nie je čo uložiť", () => {
    expect(udajeZAres({})).toBeNull();
    expect(udajeZAres(null)).toBeNull();
  });
});

describe("formulár", () => {
  it("firme stačí IČO a e-mail", () => {
    const r = vstupZFormulara({ komu: "firma", ico: "27074358", email: "Fakt@Firma.cz" });
    expect(r.ok && r.v.ico).toBe("27074358");
    expect(r.ok && r.v.email).toBe("fakt@firma.cz");
  });
  it("chybné IČO, DIČ, e-mail", () => {
    expect(vstupZFormulara({ komu: "firma", ico: "12345678", email: "a@b.cz" })).toEqual({ ok: false, chyba: "ico" });
    expect(vstupZFormulara({ komu: "firma", ico: "27074358", dic: "123", email: "a@b.cz" })).toEqual({ ok: false, chyba: "dic" });
    expect(vstupZFormulara({ komu: "firma", ico: "27074358", email: "nie" })).toEqual({ ok: false, chyba: "email" });
  });
  it("na meno treba celú adresu; berú sa polia osoby, nie firmy", () => {
    expect(vstupZFormulara({ komu: "osoba", o_nazov: "Jan", o_ulica: "Joštova 4", o_psc: "602", o_mesto: "Brno", email: "a@b.cz" }))
      .toEqual({ ok: false, chyba: "adresa" });
    const r = vstupZFormulara({ komu: "osoba", o_nazov: "Jan Novák", o_ulica: "Joštova 4", o_psc: "60200", o_mesto: "Brno", f_nazov: "Iná s.r.o.", ico: "27074358", email: "a@b.cz" });
    expect(r.ok && r.v).toMatchObject({ komu: "osoba", nazov: "Jan Novák", psc: "602 00", ico: "" });
  });
});

describe("blok na stránke po úvodnom", () => {
  it("bez údajov sa pýta a formulár je zavretý", () => {
    const h = blokFakturyHtml({ klient: "Jan Novák", udaje: null });
    expect(h).toContain("Chcete platit fakturou?");
    expect(h).toContain("Vyplnit fakturační údaje");
    expect(h).not.toContain("<details open");
  });
  it("s chybou je formulár otvorený, s hláškou a s tým, čo klient napísal", () => {
    const h = blokFakturyHtml({ klient: "Jan Novák", udaje: null, chyba: "ico", vstup: { komu: "firma", ico: "1234", email: "x@y.cz" } });
    expect(h).toContain("<details open");
    expect(h).toContain("IČO nesedí");
    expect(h).toContain('value="1234"');
    expect(h).toContain('value="x@y.cz"');
  });
  it("keď údaje máme, ukáže čo bude na faktúre a dá ich zmeniť", () => {
    const u = { firma: "Firma s.r.o.", ico: "27074358", dic: "", ulica: "Joštova 4", psc: "602 00", mesto: "Brno", email: "a@b.cz" };
    expect(udajeHotove(u)).toBe(true);
    const h = blokFakturyHtml({ klient: "Jan Novák", udaje: u, ulozene: true });
    expect(h).toContain("Děkujeme, fakturační údaje máme");
    expect(h).toContain("Firma s.r.o.");
    expect(h).toContain("IČO 27074358");
    expect(h).toContain("Změnit údaje");
    expect(h).not.toContain("Chcete platit fakturou?");
  });
  it("samotný e-mail ešte nie sú fakturačné údaje", () => {
    expect(udajeHotove({ firma: "", ico: "", dic: "", ulica: "", psc: "", mesto: "", email: "a@b.cz" })).toBe(false);
  });
  it("text klienta sa escapuje", () => {
    const h = blokFakturyHtml({ klient: "Jan", udaje: null, chyba: "email", vstup: { email: '"><script>' } });
    expect(h).not.toContain("<script>");
  });
  it("je len na stránke po úvodnom, pred „Souhrn z dnešní lekce“", () => {
    const zaklad = { trener: "Jerry", kedy: null, logoUrl: "/l.svg" } as const;
    const po = uvodnaStrankaHtml({ ...zaklad, druh: "po", faktura: { klient: "Jan", udaje: null } });
    expect(po.indexOf("Chcete platit fakturou?")).toBeGreaterThan(0);
    expect(po.indexOf("Chcete platit fakturou?")).toBeLessThan(po.indexOf("Souhrn z dnešní lekce"));
    expect(uvodnaStrankaHtml({ ...zaklad, druh: "po" })).not.toContain("Chcete platit fakturou?");
  });
});
