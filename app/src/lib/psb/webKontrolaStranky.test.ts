import { describe, expect, it } from "bun:test";

import {
  adresySitemap,
  cestaZAdresy,
  skontrolujSitemapu,
  skontrolujStrankuZivot,
  skontrolujZivostWebu,
  stiahniStranku,
  stiahniStranky,
  type Nacitaj,
  type OdpovedStranky,
} from "./webKontrolaStranky";

/**
 * Testy sú postavené na dvoch skutočných udalostiach:
 * - pristávacia stránka mala v septembri 2026 7,6 MB a 60 % zaplatených klikov
 *   na obsah nedorazilo,
 * - WordPress neexistujúcu adresu prelepí zástupnou stránkou s HTTP 200, takže
 *   kontrola na stavový kód povie „OK“ nad adresou, ktorá neexistuje.
 *
 * Preto sa overuje SPRÁVANIE: aký vstup → aký nález a aká veta.
 */

const MB = 1024 * 1024;

/** Zdravá odpoveď; test prepíše len to, čo skúša. */
const odp = (zmeny: Partial<OdpovedStranky> = {}): OdpovedStranky => ({
  url: "https://www.prosapiens.cz/uvodni-trenink/",
  stav: 200,
  konecnaUrl: "https://www.prosapiens.cz/uvodni-trenink/",
  bajtov: 420 * 1024,
  trvanieMs: 800,
  ...zmeny,
});

/**
 * Zdravá sitemapa. `konecnaUrl` sa dopĺňa z `url`, aby test o niečom inom
 * nepadal na kontrole cieľa — a hlavne aby sa presmerovanie dalo skúšať
 * zámerne, nie náhodou.
 */
const sit = (zmeny: Partial<OdpovedStranky> = {}): OdpovedStranky => {
  const url = zmeny.url ?? "https://www.prosapiens.cz/page-sitemap.xml";
  return { url, stav: 200, konecnaUrl: url, trvanieMs: 300, ...zmeny };
};

/** Telo nad spodnou hranicou — test o značkách nesmie padnúť na veľkosti. */
const strankaSTelom = (vnutro: string): string =>
  `<!doctype html><html><head><title>Úvodní trénink</title></head><body>${vnutro}<!-- ${"v".repeat(3000)} --></body></html>`;

describe("kľúč riadku", () => {
  it("drží sa cesty a nemení sa parametrami v adrese", () => {
    // Volajúci pripája `?kokpit=kontrola` aj parameter proti keši. Keby sa
    // dostali do kľúča, „odkedy to nefunguje“ sa už nedá zodpovedať.
    const a = skontrolujStrankuZivot(odp());
    const b = skontrolujStrankuZivot(odp({ url: "https://www.prosapiens.cz/uvodni-trenink/?kokpit=kontrola&_psb=abc" }));
    expect(a.kluc).toBe("stranka:/uvodni-trenink/");
    expect(b.kluc).toBe(a.kluc);
  });

  it("cesta sa vytiahne aj z relatívnej adresy a bez adresy nezostane prázdna", () => {
    expect(cestaZAdresy("https://www.prosapiens.cz/kontakt/?x=1#y")).toBe("/kontakt/");
    expect(cestaZAdresy("https://www.prosapiens.cz")).toBe("/");
    expect(cestaZAdresy("/test-postury/?a=b")).toBe("/test-postury/");
    expect(skontrolujStrankuZivot(odp({ url: "" })).kluc).toBe("stranka:(bez adresy)");
  });

  it("sitemapa má vlastnú oblasť kľúča, nemieša sa so stránkami", () => {
    const n = skontrolujSitemapu(sit({ telo: "<urlset><url><loc>https://www.prosapiens.cz/</loc></url></urlset>" }));
    expect(n.kluc).toBe("sitemap:/page-sitemap.xml");
  });
});

describe("stránka odpovedá", () => {
  it("zdravá stránka je v poriadku a povie veľkosť aj čas", () => {
    const n = skontrolujStrankuZivot(odp());
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("420 kB");
    expect(n.detail).toContain("0.8 s");
  });

  it("404 je chyba a nesie úryvok odpovede, nie len kód", () => {
    const n = skontrolujStrankuZivot(odp({ stav: 404, telo: "<html><body><h1>Stránka nenalezena</h1></body></html>" }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("HTTP 404");
    expect(n.detail).toContain("Stránka nenalezena");
  });

  it("odpoveď, ktorá sa nedá rozobrať, sa ukáže v prvých 200 znakoch", () => {
    const smeti = "x".repeat(500);
    const n = skontrolujStrankuZivot(odp({ stav: 500, telo: smeti }));
    expect(n.detail).toContain("x".repeat(200));
    expect(n.detail).not.toContain("x".repeat(201));
  });

  it("neúspešná odpoveď bez tela to povie, nemlčí", () => {
    const n = skontrolujStrankuZivot(odp({ stav: 502, telo: "", bajtov: 0 }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("telo odpovede prázdne");
  });

  it("stránka, ktorá sa nestiahla, nesie dôvod", () => {
    const n = skontrolujStrankuZivot(odp({ stav: 0, chyba: "odpoveď neprišla do 20 s (The operation timed out)" }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("neprišla do 20 s");
  });

  it("stav 0 bez dôvodu je „neviem“, nie „v poriadku“", () => {
    const n = skontrolujStrankuZivot(odp({ stav: 0 }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("neviem");
  });

  it("presmerovanie, ktoré volajúci nedosledoval, je chyba — nevie sa, kde človek skončí", () => {
    const n = skontrolujStrankuZivot(odp({ stav: 301, konecnaUrl: "" }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("HTTP 301");
  });
});

describe("kde načítanie skončilo", () => {
  it("presmerovanie na zástupnú stránku je chyba, hoci vrátila 200", () => {
    const n = skontrolujStrankuZivot(odp({ url: "https://www.prosapiens.cz/stary-clanek/", konecnaUrl: "https://www.prosapiens.cz/404/" }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("/404/");
    expect(n.detail).toContain("neexistuje");
  });

  it("presmerovanie na inú živú stránku je varovanie — funguje, ale nie je to tá stránka", () => {
    const n = skontrolujStrankuZivot(odp({ url: "https://www.prosapiens.cz/uvodni-trenink/", konecnaUrl: "https://www.prosapiens.cz/sluzby/" }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("/sluzby/");
  });

  it("http → https, www a koncová lomka nie sú nález", () => {
    const n = skontrolujStrankuZivot(odp({ url: "http://prosapiens.cz/uvodni-trenink", konecnaUrl: "https://www.prosapiens.cz/uvodni-trenink/" }));
    expect(n.stav).toBe("ok");
  });

  it("nezmeraná konečná adresa je varovanie, nie ok", () => {
    const n = skontrolujStrankuZivot(odp({ konecnaUrl: undefined }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("nevie sa");
  });
});

describe("stránka nepriberá", () => {
  it("nad stropom je to chyba a hovorí obe čísla", () => {
    const n = skontrolujStrankuZivot(odp({ bajtov: Math.round(7.6 * MB) }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("7.6 MB");
    expect(n.detail).toContain("3.0 MB");
  });

  it("strop je parameter — nižší urobí z tej istej stránky chybu", () => {
    const stranka = odp({ bajtov: 420 * 1024 });
    expect(skontrolujStrankuZivot(stranka).stav).toBe("ok");
    expect(skontrolujStrankuZivot(stranka, { stropBajtov: 200 * 1024 }).stav).toBe("chyba");
  });

  it("tesne pod stropom je varovanie o priberaní", () => {
    const n = skontrolujStrankuZivot(odp({ bajtov: Math.round(2.5 * MB) }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("blíži sa k stropu");
  });

  it("nula bajtov pri HTTP 200 je biela obrazovka, nie úsporná stránka", () => {
    const n = skontrolujStrankuZivot(odp({ bajtov: 0 }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("PRÁZDNE telo");
  });

  it("veľkosť sa dopočíta z tela, keď ju volajúci neposlal", () => {
    // `dnoBajtov: 0` je tu naschvál: 15 B by inak padlo na spodnej hranici a
    // test by o počítaní bajtov v UTF-8 nepovedal nič.
    const n = skontrolujStrankuZivot(odp({ bajtov: undefined, telo: "<html>ž</html>" }), { dnoBajtov: 0 });
    expect(n.stav).toBe("ok");
    // „ž“ sú v UTF-8 dva bajty: 14 znakov → 15 bajtov.
    expect(n.detail).toContain("15 B");
  });

  it("nezmeraná veľkosť je „neviem“, nie „v poriadku“", () => {
    const n = skontrolujStrankuZivot(odp({ bajtov: undefined, telo: undefined }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("nezmerala");
  });
});

describe("stránka nie je len prelepená", () => {
  // Presne ten prípad, pre ktorý modul vznikol: WordPress prelepí stránku
  // INTERNE, takže adresa ani stav sa nezmenia a kontrola cieľa nevystrelí.
  const prazdna = "<!doctype html><html><head><title>Nenalezeno</title></head><body></body></html>";

  it("prázdna stránka s HTTP 200 na NEZMENENEJ adrese nie je „v poriadku“", () => {
    const n = skontrolujStrankuZivot(odp({ bajtov: undefined, telo: prazdna }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("spodnej hranici");
    // Veta musí ukázať, čo server naozaj poslal — nie len stavový kód.
    expect(n.detail).toContain("Nenalezeno");
  });

  it("spodná hranica je parameter a nulou sa vypne", () => {
    const kratka = odp({ bajtov: 300, telo: undefined });
    expect(skontrolujStrankuZivot(kratka).stav).toBe("chyba");
    expect(skontrolujStrankuZivot(kratka, { dnoBajtov: 100 }).stav).toBe("ok");
    expect(skontrolujStrankuZivot(kratka, { dnoBajtov: 0 }).stav).toBe("ok");
  });

  it("nula bajtov si drží vlastnú vetu, spodná hranica ju neprekryje", () => {
    const n = skontrolujStrankuZivot(odp({ bajtov: 0 }));
    expect(n.detail).toContain("PRÁZDNE telo");
    expect(n.detail).not.toContain("spodnej hranici");
  });

  it("chýbajúca povinná značka je chyba a pomenuje prelepenie", () => {
    // Zástupná stránka nesie tú istú tému, takže veľkosť je v poriadku a
    // adresa sa nezmenila — pozná sa LEN podľa toho, že v nej nie je formulár.
    const n = skontrolujStrankuZivot(
      odp({ bajtov: undefined, telo: strankaSTelom("<h1>Nenalezeno</h1>") }),
      { musiObsahovat: "<form data-form" },
    );
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("<form data-form");
    expect(n.detail).toContain("prelepil");
  });

  it("stránka so značkou je v poriadku a nález povie, čo sa overilo", () => {
    const n = skontrolujStrankuZivot(
      odp({ bajtov: undefined, telo: strankaSTelom('<form data-form="cf7:5111"></form>') }),
      { musiObsahovat: "<form data-form" },
    );
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("v tele je");
  });

  it("značka sa hľadá bez ohľadu na veľkosť písmen", () => {
    const n = skontrolujStrankuZivot(
      odp({ bajtov: undefined, telo: strankaSTelom('<FORM DATA-FORM="cf7:5111"></FORM>') }),
      { musiObsahovat: "<form data-form" },
    );
    expect(n.stav).toBe("ok");
  });

  it("bez tela sa značka nedá overiť — to je „neviem“, nie „ok“", () => {
    const n = skontrolujStrankuZivot(odp({ telo: undefined }), { musiObsahovat: "<form data-form" });
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("telo stránky sa neuložilo");
  });

  it("zelený riadok prizná, že obsah nikto nezadal", () => {
    expect(skontrolujStrankuZivot(odp()).detail).toContain("obsah sa nekontroloval");
  });

  it("značka na cestu prepíše spoločnú — vyňatá stránka nesvieti každú noc", () => {
    const medze = {
      musiObsahovat: "<form data-form",
      musiObsahovatNaCeste: { "https://www.prosapiens.cz/kontakt": [] },
    };
    const bezFormulara = strankaSTelom("<h1>Kontakt</h1>");
    // Koncová lomka ani doména v kľúči nerozhodujú, inak by sa výnimka minula.
    const vynata = skontrolujStrankuZivot(
      odp({ url: "https://www.prosapiens.cz/kontakt/", konecnaUrl: "https://www.prosapiens.cz/kontakt/", bajtov: undefined, telo: bezFormulara }),
      medze,
    );
    expect(vynata.stav).toBe("ok");
    const ina = skontrolujStrankuZivot(odp({ bajtov: undefined, telo: bezFormulara }), medze);
    expect(ina.stav).toBe("chyba");
  });

  it("povinné značky sa prenesú celým behom a platia per cestu", () => {
    const n = skontrolujZivostWebu(
      {
        stranky: [
          odp({ bajtov: undefined, telo: strankaSTelom('<form data-form="cf7:5111"></form>') }),
          odp({ url: "https://www.prosapiens.cz/test-postury/", bajtov: undefined, telo: strankaSTelom("<h1>Nenalezeno</h1>") }),
        ],
        sitemapy: [sit({ telo: "<urlset><url><loc>https://x.cz/</loc></url></urlset>" })],
      },
      { musiObsahovatNaCeste: { "/uvodni-trenink/": "<form data-form", "/test-postury/": "<form data-form" } },
    );
    expect(n.find((x) => x.kluc === "stranka:/uvodni-trenink/")?.stav).toBe("ok");
    expect(n.find((x) => x.kluc === "stranka:/test-postury/")?.stav).toBe("chyba");
  });
});

describe("čas odpovede", () => {
  it("pomalá stránka je VAROVANIE, nie chyba", () => {
    const n = skontrolujStrankuZivot(odp({ trvanieMs: 9000 }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("9.0 s");
  });

  it("hranica času je parameter", () => {
    const n = skontrolujStrankuZivot(odp({ trvanieMs: 1500 }), { stropMs: 1000 });
    expect(n.stav).toBe("varovanie");
  });

  it("nezmeraný čas sa prizná", () => {
    const n = skontrolujStrankuZivot(odp({ trvanieMs: undefined }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("čas odpovede sa nezmeral");
  });

  it("tvrdý nález prebije mäkký — pomalá a zároveň prelepená stránka je chyba", () => {
    const n = skontrolujStrankuZivot(odp({ trvanieMs: 9000, konecnaUrl: "https://www.prosapiens.cz/404/" }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("9.0 s");
  });
});

describe("sitemapy", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.prosapiens.cz/</loc></url>
    <url><loc>https://www.prosapiens.cz/sluzby/</loc></url>
  </urlset>`;

  it("sitemapa s adresami je v poriadku a povie, koľko ich je", () => {
    const n = skontrolujSitemapu(sit({ url: "https://www.prosapiens.cz/post-sitemap.xml", telo: xml, bajtov: xml.length }));
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("2 adries");
  });

  it("chýbajúca sitemapa je chyba a vysvetlí, čo tým Kokpit stratí", () => {
    const n = skontrolujSitemapu(sit({ stav: 404, telo: "nic" }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("obsah webu");
  });

  it("sitemapa bez jednej adresy je varovanie — buď je prázdna, alebo ju nevieme prečítať", () => {
    const n = skontrolujSitemapu(sit({ telo: "<urlset></urlset>" }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("ani jedna adresa");
  });

  it("bez tela sa počet adries netvrdí", () => {
    const n = skontrolujSitemapu(sit({ telo: undefined }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("nedá overiť");
  });

  it("presmerovaná sitemapa NIE JE v poriadku — import by čítal iný súbor", () => {
    // Keď WP začne presmerovávať page-sitemap na post-sitemap, import prečíta
    // ten istý súbor dvakrát a polovica webu v tabuľke obsahu zmizne.
    const n = skontrolujSitemapu(sit({
      konecnaUrl: "https://www.prosapiens.cz/post-sitemap.xml",
      telo: "<urlset><url><loc>https://www.prosapiens.cz/</loc></url></urlset>",
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("post-sitemap.xml");
    expect(n.detail).toContain("iný súbor");
  });

  it("sitemapa prelepená zástupnou stránkou je chyba", () => {
    const n = skontrolujSitemapu(sit({
      konecnaUrl: "https://www.prosapiens.cz/404/",
      telo: "<urlset><url><loc>https://www.prosapiens.cz/</loc></url></urlset>",
    }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("/404/");
  });

  it("nezmeraná konečná adresa je varovanie aj u sitemapy — ten istý meter", () => {
    const n = skontrolujSitemapu(sit({ konecnaUrl: undefined, telo: "<urlset><url><loc>https://x.cz/</loc></url></urlset>" }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("nevie sa");
  });

  it("http → https, www a lomka nie sú nález ani u sitemapy", () => {
    const n = skontrolujSitemapu(sit({
      url: "http://prosapiens.cz/page-sitemap.xml",
      konecnaUrl: "https://www.prosapiens.cz/page-sitemap.xml",
      telo: "<urlset><url><loc>https://x.cz/</loc></url></urlset>",
    }));
    expect(n.stav).toBe("ok");
  });

  it("presmerovanie a nečitateľné telo sa hlásia OBE, nie len prvé", () => {
    const n = skontrolujSitemapu(sit({ konecnaUrl: "https://www.prosapiens.cz/post-sitemap.xml", telo: "<urlset></urlset>" }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("presmerováva");
    expect(n.detail).toContain("ani jedna adresa");
  });

  it("adresy sitemáp sa skladajú z jedného základu", () => {
    expect(adresySitemap("https://www.prosapiens.cz/")).toEqual([
      "https://www.prosapiens.cz/page-sitemap.xml",
      "https://www.prosapiens.cz/post-sitemap.xml",
    ]);
    expect(adresySitemap("")).toEqual([]);
  });
});

describe("celý beh", () => {
  it("prázdny vstup NEVRÁTI prázdno — povie, že sa nemeralo nič", () => {
    const n = skontrolujZivostWebu({});
    expect(n.length).toBe(2);
    expect(n.every((x) => x.stav === "varovanie")).toBe(true);
    expect(n.map((x) => x.kluc)).toEqual(["stranka:ziadna", "sitemap:ziadna"]);
  });

  it("chýbajúce sitemapy sa nezamlčia, aj keď stránky žijú", () => {
    const n = skontrolujZivostWebu({ stranky: [odp()] });
    expect(n.find((x) => x.kluc === "stranka:/uvodni-trenink/")?.stav).toBe("ok");
    expect(n.find((x) => x.kluc === "sitemap:ziadna")?.stav).toBe("varovanie");
  });

  it("tá istá cesta dvakrát dá JEDEN riadok a horší stav — nič sa neprepíše", () => {
    const n = skontrolujZivostWebu({
      stranky: [
        odp(),
        odp({ url: "https://www.prosapiens.cz/uvodni-trenink/?kokpit=kontrola", bajtov: 8 * MB }),
      ],
      sitemapy: [sit({ url: "https://x.cz/page-sitemap.xml", telo: "<urlset><url><loc>https://x.cz/</loc></url></urlset>" })],
    });
    const riadky = n.filter((x) => x.kluc === "stranka:/uvodni-trenink/");
    expect(riadky.length).toBe(1);
    expect(riadky[0].stav).toBe("chyba");
    expect(riadky[0].detail).toContain("8.0 MB");
  });

  it("nálezy sú jeden na stránku a medze sa prenesú na všetky", () => {
    const n = skontrolujZivostWebu(
      {
        stranky: [odp(), odp({ url: "https://www.prosapiens.cz/test-postury/" })],
        sitemapy: [sit({ telo: "<urlset><url><loc>https://x.cz/</loc></url></urlset>" })],
      },
      { stropBajtov: 100 * 1024 },
    );
    expect(n.length).toBe(3);
    expect(n.filter((x) => x.stav === "chyba").length).toBe(2);
  });
});

describe("sťahovanie bez siete", () => {
  /** Náhrada `fetch`: vráti, čo test chce, a zapíše, na čo sa volalo. */
  const stub = (vysledky: Record<string, { status: number; url?: string; telo?: string }>, volania: string[] = []): Nacitaj =>
    async (url) => {
      volania.push(url);
      const bezParametrov = url.split("?")[0];
      const v = vysledky[bezParametrov] ?? { status: 404, telo: "nic" };
      return { status: v.status, url: v.url ?? url, text: async () => v.telo ?? "" };
    };

  it("globálny fetch sedí do typu Nacitaj — volajúci ho podá priamo", () => {
    // Keby `Nacitaj` fetchu nesedel, volajúci by si musel vyrobiť obálku
    // alebo pretypovať — a pretypovanie umlčí kontrolu typov.
    const f: Nacitaj = fetch;
    expect(typeof f).toBe("function");
  });

  it("zmeria bajty v UTF-8, nie znaky", async () => {
    const telo = "<html>žluťoučký kůň</html>";
    const o = await stiahniStranku("https://x.cz/a/", stub({ "https://x.cz/a/": { status: 200, telo } }));
    expect(o.stav).toBe(200);
    expect(o.bajtov).toBe(new TextEncoder().encode(telo).length);
    expect(o.bajtov).toBeGreaterThan(telo.length);
    expect(typeof o.trvanieMs).toBe("number");
  });

  it("zapamätá si adresu, na ktorej načítanie skončilo", async () => {
    const o = await stiahniStranku("https://x.cz/stary/", stub({ "https://x.cz/stary/": { status: 200, url: "https://x.cz/404/", telo: "nenalezeno" } }));
    expect(o.konecnaUrl).toBe("https://x.cz/404/");
    expect(skontrolujStrankuZivot(o).stav).toBe("chyba");
  });

  it("odpoveď BEZ konečnej adresy sa nedopĺňa vyžiadanou — nález nesmie byť „ok“", async () => {
    // `OdpovedSiete.url` je nepovinné, čiže odpoveď bez nej je dovolený vstup.
    // Kým sa dosadzovala adresa, ktorú sme si vyžiadali, `cielSedi` našel vždy
    // zhodu a mlčal — stránka prelepená zástupnou stránkou WordPressu by takto
    // dostala zelený riadok. Preto sa to testuje tu, nie len v čistej kontrole:
    // vstup pre ňu vyrába sťahovač.
    const bezAdresy: Nacitaj = async () => ({ status: 200, text: async () => `<html>${"x".repeat(5000)}</html>` });
    const o = await stiahniStranku("https://x.cz/a/", bezAdresy);
    expect(o.konecnaUrl).toBeUndefined();
    const n = skontrolujStrankuZivot(o);
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("nevie sa, na akej adrese načítanie skončilo");
  });

  it("obídenie kešu nerobí z vlastného parametra presmerovanie", async () => {
    // Pri `bezKese` sa sťahuje adresa s `_psb=…`, takže konečná adresa z
    // odpovede nesie ten parameter tiež. Nález o presmerovaní by bol falošný
    // poplach každú noc — `tenIstyCiel` dopyt odrezáva a nález zostáva „ok“.
    const o = await stiahniStranku(
      "https://www.prosapiens.cz/sluzby/",
      stub({ "https://www.prosapiens.cz/sluzby/": { status: 200, telo: "<html>" + "x".repeat(5000) + "</html>" } }),
      { bezKese: true },
    );
    expect(o.konecnaUrl).toContain("_psb=");
    expect(skontrolujStrankuZivot(o).stav).toBe("ok");
  });

  it("výnimka zo siete je ÚDAJ, nie pád", async () => {
    const padne: Nacitaj = async () => { throw new Error("Network connection lost"); };
    const o = await stiahniStranku("https://x.cz/a/", padne);
    expect(o.stav).toBe(0);
    expect(o.chyba).toContain("Network connection lost");
    expect(skontrolujStrankuZivot(o).stav).toBe("chyba");
  });

  it("časový limit sa prizná menom, nie ako neznáma chyba", async () => {
    const padne: Nacitaj = async () => { throw new Error("The operation timed out."); };
    const o = await stiahniStranku("https://x.cz/a/", padne, { timeoutMs: 5000 });
    expect(o.chyba).toContain("neprišla do 5 s");
  });

  it("telo sa dá zahodiť, ale ukážka a veľkosť zostanú", async () => {
    const o = await stiahniStranku("https://x.cz/a/", stub({ "https://x.cz/a/": { status: 500, telo: "Chyba databáze" } }), { drzatTelo: false });
    expect(o.telo).toBeUndefined();
    expect(o.bajtov).toBeGreaterThan(0);
    expect(skontrolujStrankuZivot(o).detail).toContain("Chyba databáze");
  });

  it("kešu obchádza LEN na požiadanie — inak sa meria to, čo dostane návštevník", async () => {
    const volania: string[] = [];
    const n = stub({ "https://x.cz/a/": { status: 200, telo: "ok" } }, volania);
    await stiahniStranku("https://x.cz/a/", n);
    await stiahniStranku("https://x.cz/a/", n, { bezKese: true });
    expect(volania[0]).toBe("https://x.cz/a/");
    expect(volania[1]).toContain("_psb=");
  });

  it("adresy sa sťahujú jedna po druhej a v poradí", async () => {
    const volania: string[] = [];
    const n = stub({ "https://x.cz/a/": { status: 200, telo: "a" }, "https://x.cz/b/": { status: 200, telo: "b" } }, volania);
    const von = await stiahniStranky(["https://x.cz/a/", "https://x.cz/b/"], n);
    expect(volania).toEqual(["https://x.cz/a/", "https://x.cz/b/"]);
    expect(von.map((o) => o.url)).toEqual(["https://x.cz/a/", "https://x.cz/b/"]);
    expect(von.map((o) => o.stav)).toEqual([200, 200]);
  });

  it("neznáma adresa skončí nálezom o chybe, nie výnimkou", async () => {
    const von = await stiahniStranky(["https://x.cz/neexistuje/"], stub({}));
    const n = skontrolujZivostWebu({ stranky: von });
    expect(n[0].stav).toBe("chyba");
    expect(n[0].detail).toContain("HTTP 404");
  });
});

describe("veta o obsahu sa číta ako veta", () => {
  it("kladné zistenie spája značky spojkou „aj“, nie „ani“", () => {
    // „v tele je „data-form" ani „psb-skryte"" sa číta presne opačne,
    // než ako to kontrola myslí.
    const n = skontrolujStrankuZivot(
      { url: "https://x.cz/a/", konecnaUrl: "https://x.cz/a/", stav: 200, bajtov: 50_000, trvanieMs: 500, telo: "<form data-form></form><div id=\"psb-skryte\"></div>" },
      { musiObsahovat: ["data-form", "psb-skryte"] },
    );
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("aj");
    expect(n.detail).not.toContain("ani „psb-skryte“");
  });
});
