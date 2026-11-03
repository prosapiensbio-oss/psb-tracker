import { describe, expect, it } from "bun:test";
import { prispevkyKonkurentov, uctyKonkurentov, vzoryZOdpovede, zadanieVzorov } from "./konkurenti";

const ucty = [{ id: 601959, screenName: "holystic.training", displayName: "Mira", followers: 1257, engagement: 2.3, posts: 9, reels: 9 }, { screenName: "" }];
describe("konkurenti", () => {
  it("účty: bez mena sa zahodia, chýbajúce číslo nie je nula", () => {
    expect(uctyKonkurentov(ucty)).toEqual([{ ucet: "holystic.training", meno: "Mira", sledovatelia: 1257, engagement: 2.3, prispevky: 9, reels: 9 }]);
    expect(uctyKonkurentov([{ screenName: "a" }])[0].sledovatelia).toBeNull();
  });
  it("príspevky: účet podľa blogId, najviac interakcií hore, prázdne preč, cudzia adresa nie", () => {
    const r = prispevkyKonkurentov([
      { blogId: 601959, created: "2026-10-29 16:32:23", type: "POST", content: "Menej", likes: 1, comments: 0, interactions: 1, url: "https://www.instagram.com/p/a/" },
      { blogId: 601959, created: "2026-10-20 10:00:00", type: "REEL", content: "Viac", likes: 9, comments: 2, interactions: 11, engagement: 0.8, url: "javascript:x" },
      { blogId: 601959, content: " ", url: "" },
    ], ucty);
    expect(r.map((p) => p.text)).toEqual(["Viac", "Menej"]);
    expect(r[0]).toMatchObject({ ucet: "holystic.training", datum: "2026-10-20", interakcie: 11, url: "" });
  });
  it("vzory: tolerujú text okolo JSON, rozbité = null", () => {
    expect(vzoryZOdpovede('tu: {"vzory":[{"vzor":"V","priklad":"P","preco":"X"},{"vzor":""}],"prePsb":["N"]}')).toEqual({ vzory: [{ vzor: "V", priklad: "P", preco: "X" }], prePsb: ["N"] });
    expect(vzoryZOdpovede("nie")).toBeNull();
    expect(vzoryZOdpovede('{"vzory":[]}')).toBeNull();
  });
  it("zadanie nesie text príspevku a zákaz kopírovať FP", () => {
    const t = zadanieVzorov([{ ucet: "a", datum: "", typ: "", text: "POPIS", lajky: 0, komentare: 0, interakcie: 3, engagement: null, url: "" }]);
    expect(t).toContain("POPIS");
    expect(t).toContain("Functional Patterns");
  });
});
