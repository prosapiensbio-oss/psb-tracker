import { describe, expect, it } from "bun:test";

import { vytvorZdielanie, zdielanaFunkcia, type FetchLike } from "./spolocnyDopyt";

/** Fetch, ktorý sa dá pustiť ručne — vidno, čo beží súbežne. */
function falosny(telo: () => string = () => "x", status = 200) {
  const volania: { url: string; metoda: string }[] = [];
  const cakajuce: (() => void)[] = [];
  const fetch: FetchLike = (input, init) => {
    volania.push({ url: String(input), metoda: init?.method || "GET" });
    return new Promise((res) => { cakajuce.push(() => res(new Response(telo(), { status }))); });
  };
  const pust = async () => { while (cakajuce.length) cakajuce.shift()!(); await new Promise((r) => setTimeout(r, 0)); };
  return { fetch, volania, pust };
}

const zoznam = new Set(["/api/a", "/api/b"]);

describe("zdieľanie bežiaceho dopytu", () => {
  it("šesť súbežných čítaní = jeden dopyt a každý si odpoveď prečíta sám", async () => {
    const f = falosny(() => '{"ok":1}');
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    const odpovede = Array.from({ length: 6 }, () => z.fetch("/api/a", { credentials: "same-origin" }));
    await f.pust();
    const texty = await Promise.all(odpovede.map(async (o) => (await o).text()));
    expect(f.volania).toHaveLength(1);
    expect(texty.every((t) => t === '{"ok":1}')).toBe(true);
  });

  it("rôzne adresy sa nemiešajú, adresa mimo zoznamu sa nezdieľa", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    void z.fetch("/api/a"); void z.fetch("/api/b"); void z.fetch("/api/c"); void z.fetch("/api/c");
    await f.pust();
    expect(f.volania.map((v) => v.url)).toEqual(["/api/a", "/api/b", "/api/c", "/api/c"]);
  });

  it("krátko po doběhnutí sa odpoveď ešte zdieľa, po pamäti už nie", async () => {
    let t = 1000;
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam, teraz: () => t, pamatMs: 3000 });
    void z.fetch("/api/a");
    await f.pust();
    t += 2999;
    void z.fetch("/api/a");
    expect(f.volania).toHaveLength(1);
    t += 2;
    void z.fetch("/api/a");
    expect(f.volania).toHaveLength(2);
  });

  it("PO ZÁPISE SA NEČÍTA STARÉ: čítanie po POST ide na server aj v rámci pamäti", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    void z.fetch("/api/a");
    await f.pust();
    const zapis = z.fetch("/api/x", { method: "POST", body: "{}" });
    await f.pust();
    await zapis;
    void z.fetch("/api/a");
    expect(f.volania.map((v) => `${v.metoda} ${v.url}`)).toEqual(["GET /api/a", "POST /api/x", "GET /api/a"]);
  });

  it("čítanie, ktoré začalo POČAS zápisu, sa po zápise nezdieľa", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    const zapis = z.fetch("/api/x", { method: "POST", body: "{}" });
    void z.fetch("/api/a");
    await f.pust();
    await zapis;
    void z.fetch("/api/a");
    expect(f.volania.filter((v) => v.url === "/api/a")).toHaveLength(2);
  });

  it("signál obnovy (zabudni) zahodí aj bežiaci dopyt", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    void z.fetch("/api/a");
    z.zabudni();
    void z.fetch("/api/a");
    expect(f.volania).toHaveLength(2);
    await f.pust();
  });

  it("chyba sa nepamätá — ďalší sa spýta znova", async () => {
    const f = falosny(() => "zle", 500);
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    const prvy = z.fetch("/api/a");
    const druhy = z.fetch("/api/a");
    await f.pust();
    expect((await prvy).status).toBe(500);
    expect((await druhy).status).toBe(500);
    void z.fetch("/api/a");
    expect(f.volania).toHaveLength(2);
    await f.pust();
  });

  it("výpadok siete sa dozvedia všetci, čo čakali, a ďalší skúša znova", async () => {
    let n = 0;
    const z = vytvorZdielanie(() => { n++; return Promise.reject(new Error("siet")); }, { zdielane: zoznam });
    const [a, b] = await Promise.allSettled([z.fetch("/api/a"), z.fetch("/api/a")]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    await new Promise((r) => setTimeout(r, 0));
    await z.fetch("/api/a").catch(() => null);
    expect(n).toBe(2);
  });

  it("dopyt so `signal` sa nezdieľa — zrušenie jedného nesmie zrušiť všetkých", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    void z.fetch("/api/a", { signal: new AbortController().signal });
    void z.fetch("/api/a", { signal: new AbortController().signal });
    expect(f.volania).toHaveLength(2);
    await f.pust();
  });

  it("automatický import a balíčky pri štarte pamäť nezhodia; zmenu hlási volajúci cez oznam", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    void z.fetch("/api/a");
    await f.pust();
    void z.fetch("/api/platby", { method: "POST", body: JSON.stringify({ akcia: "btc-import", platby: [] }) });
    void z.fetch("/api/balicky", { method: "POST", body: JSON.stringify({ akcia: "automaticky" }) });
    await f.pust();
    void z.fetch("/api/a");
    expect(f.volania.filter((v) => v.url === "/api/a")).toHaveLength(1);
    // Zmena: volajúci zavolá `oznam` → `zabudni`, čítanie ide na server.
    z.zabudni();
    void z.fetch("/api/a");
    expect(f.volania.filter((v) => v.url === "/api/a")).toHaveLength(2);
    // Iná akcia na tej istej adrese je zápis ako každý iný.
    await f.pust();
    void z.fetch("/api/balicky", { method: "POST", body: JSON.stringify({ akcia: "ukonci" }) });
    await f.pust();
    void z.fetch("/api/a");
    expect(f.volania.filter((v) => v.url === "/api/a")).toHaveLength(3);
    await f.pust();
  });

  it("stav Metricoolu je POST, ale nič nezapisuje — zdieľanie nerozhodí", async () => {
    const f = falosny();
    const z = vytvorZdielanie(f.fetch, { zdielane: zoznam });
    void z.fetch("/api/a");
    await f.pust();
    void z.fetch("/api/metricool", { method: "POST", body: JSON.stringify({ akcia: "stav" }) });
    await f.pust();
    void z.fetch("/api/a");
    expect(f.volania.filter((v) => v.url === "/api/a")).toHaveLength(1);
    // Stiahnutie mesiaca z Metricoolu je už zápis.
    void z.fetch("/api/metricool", { method: "POST", body: JSON.stringify({ akcia: "stiahni" }) });
    await f.pust();
    void z.fetch("/api/a");
    expect(f.volania.filter((v) => v.url === "/api/a")).toHaveLength(2);
    await f.pust();
  });
});

describe("zdieľaná funkcia (bitcoinová rezerva)", () => {
  it("súbežné volania = jedno, po pamäti znova, null sa nepamätá", async () => {
    let t = 0, n = 0;
    let vysledok: string | null = "ok";
    const f = zdielanaFunkcia(async () => { n++; return vysledok; }, { teraz: () => t, pamatMs: 100 });
    await Promise.all([f(), f(), f()]);
    expect(n).toBe(1);
    t = 50; await f();
    expect(n).toBe(1);
    t = 200; await f();
    expect(n).toBe(2);
    vysledok = null;
    t = 400; await f();
    await new Promise((r) => setTimeout(r, 0));
    await f();
    expect(n).toBe(4);
  });
  it("zabudni: ďalšie volanie ide nanovo", async () => {
    let n = 0;
    const f = zdielanaFunkcia(async () => { n++; return "x"; });
    await f(); f.zabudni(); await f();
    expect(n).toBe(2);
  });
});
