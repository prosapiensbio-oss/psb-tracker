import { describe, expect, it } from "bun:test";

import { MIN_ODPOVEDI, OTAZKY, rozoberFormular, vysledkyDotazniku, type OdpovedDotazniku } from "./dotaznik";
import { dotaznikHotovo, dotaznikStranka } from "./dotaznikStranka";

const f = (q: string) => new URLSearchParams(q);

describe("anonymný dotazník — formulár", () => {
  it("rozoberie platné odpovede, neplatné zahodí", () => {
    const o = rozoberFormular(f("nps=9&komunikacia=7&cena=4&hodnota=ulava&hodnota=pristup&hodnota=atmosfera&hodnota=hack&zmena=++viac+termínov++&odkaz="));
    expect(o.nps).toBe(9);
    expect(o.komunikacia).toBeUndefined(); // 7 je mimo 1–5
    expect(o.cena).toBe(4);
    expect(o.hodnota).toEqual(["ulava", "pristup"]); // najviac dve, neznáme preč
    expect(o.zmena).toBe("viac termínov");
    expect(o.odkaz).toBeUndefined();
  });

  it("prázdny formulár je prázdna odpoveď", () => {
    expect(rozoberFormular(f(""))).toEqual({});
  });

  it("stránka nemá skript, má všetkých 7 otázok, upozornenie na anonymitu a na spoznateľnosť textu", () => {
    const h = dotaznikStranka({});
    expect(h).not.toContain("<script");
    expect(OTAZKY.length).toBe(7);
    for (const q of OTAZKY) expect(h).toContain(`name="${q.id}"`);
    expect(h).toContain("anonymní");
    expect(h).toContain("můžeme poznat, o koho jde");
    expect(h).not.toMatch(/required/);
  });

  it("náhľad pre Kokpit je tá istá stránka s pruhom navrchu", () => {
    const h = dotaznikStranka({ nahlad: true });
    expect(h).toContain("Náhľad pre Kokpit");
    expect(h.replace(/<div style="margin-bottom:18px[^]*?<\/div>/, "")).toBe(dotaznikStranka({}));
  });

  it("poďakovanie rozlišuje „práve teraz“ a „už predtým“", () => {
    expect(dotaznikHotovo({})).toContain("uložili");
    expect(dotaznikHotovo({ uzPredtym: true })).toContain("jen jednou");
  });
});

describe("anonymný dotazník — výsledky", () => {
  const o = (nps: number, extra: OdpovedDotazniku = {}): OdpovedDotazniku => ({ nps, cena: 4, ...extra });

  it(`pod ${MIN_ODPOVEDI} odpoveďami sa neukáže nič z obsahu`, () => {
    const v = vysledkyDotazniku([o(10, { zmena: "konkrétna príhoda" }), o(3)]);
    expect(v.skryte).toBe(true);
    expect(v.pocet).toBe(2);
    expect(v.nps).toBeUndefined();
    expect(v.texty).toEqual([]);
  });

  it("NPS = % 9–10 mínus % 0–6", () => {
    const v = vysledkyDotazniku([o(10), o(9), o(8), o(6), o(10)]);
    expect(v.nps?.skore).toBe(40); // 3 propagátori, 1 kritik z 5
    expect(v.nps?.priemer).toBe(8.6);
    expect(v.skaly.find((x) => x.id === "cena")?.priemer).toBe(4);
  });

  it("texty sa ukážu všetky, ale poradie nesleduje poradie odpovedí", () => {
    const zoznam = ["a", "b", "c", "d", "e", "f"].map((t, i) => o(9, { zmena: t, nps: i }));
    const v = vysledkyDotazniku(zoznam);
    const t = v.texty.find((x) => x.id === "zmena")!.odpovede;
    expect([...t].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(t).not.toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
