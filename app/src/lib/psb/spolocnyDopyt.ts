/**
 * ZDIEĽANIE BEŽIACEHO DOPYTU (rozbor Kokpitu, 1. 11. 2026).
 *
 * Načítanie stránky robilo GET `/api/vzas-settings` 6×, `/api/fio` 3–4×,
 * `/api/faktury` 3× a otvorenie profilu `/api/vydane-faktury` 4× — každá
 * obrazovka si pýta svoje a nevie o susedoch. Worker to pocítil: `/api/data`
 * súbežne s ďalšou ťažkou požiadavkou 1. 9. 2026 padol na 500.
 *
 * Volaní je vyše dvadsať v pätnástich súboroch a každá nová obrazovka pribudne
 * s ďalším. Preto sa to rieši na jednom mieste, nad `fetch`, a nie v každom
 * z nich: kto si pýta adresu zo zoznamu nižšie, dostane odpoveď dopytu, ktorý
 * už beží alebo práve doběhol. Každý volajúci má vlastnú kópiu (`clone`), takže
 * si ju môže prečítať po svojom.
 *
 * PRAVIDLO, BEZ KTORÉHO BY TO BOLO HORŠIE NEŽ DUPLICITA: PO ZÁPISE SA NEČÍTA
 * STARÉ (`obnovaSignal.ts`). Čokoľvek iné než GET zdieľané dopyty zahodí na
 * začiatku aj na konci, a tiež `oznam()` — `/api/kalendar` a spol. tak po zápise
 * idú na server vždy nanovo. Dopyt, ktorý začal pred zápisom, doběhne len tým,
 * čo naň už čakali — ako doteraz.
 *
 * Pamäť po doběhnutí je krátka (`PAMAT_MS`) len kvôli obrazovkám, ktoré sa
 * pýtajú o chvíľu neskôr, až keď dostanú `/api/data`. Neúspešná odpoveď sa
 * nepamätá: chyba sa nesmie rozdať ďalším ako hotová vec.
 *
 * `cache: "no-store"` sa nerozlišuje: znamená „nechcem HTTP cache", a odpoveď,
 * ktorá začala po poslednom zápise, je čerstvá rovnako. Dopyt so `signal`
 * sa nezdieľa — zrušenie jedného by zrušilo všetkých.
 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Ako dlho po doběhnutí sa dá odpoveď zdieľať. Jedno načítanie, nie cache. */
export const PAMAT_MS = 3000;

/**
 * Čo sa zdieľa. Vymenované zámerne: každá adresa je čítanie, ktoré stačí urobiť
 * raz (overené v `routes/api/*`; `/api/vydane-faktury` si pri čítaní doplní
 * úhrady, ale je to nezávislé od počtu volaní). Nová adresa sem patrí, až keď
 * to platí — `/api/kalendar?cron=1` je napríklad zápis, a preto sa porovnáva
 * celá adresa vrátane parametrov.
 */
const ZDIELANE = new Set([
  "/api/vzas-settings",
  "/api/fio",
  "/api/fio?nahrate=1",
  "/api/faktury",
  "/api/vydane-faktury",
  "/api/balicky",
  "/api/platby",
  "/api/platby?klient=1",
  "/api/kalendar",
  "/api/jarvis-memory",
]);

/**
 * POST, ktorý nič nezapisuje. `/api/metricool` s `akcia: "stav"` sa len pýta,
 * či je Metricool pripojený — volá ho každé otvorenie Workspace a keby sa rátal
 * ako zápis, rozhodil by zdieľanie práve v tej chvíli, keď je najviac dopytov.
 */
const jeCitanieCezPost = (url: string, init?: RequestInit): boolean =>
  url === "/api/metricool" && typeof init?.body === "string" && init.body.includes('"akcia":"stav"');

/**
 * POST, KTORÝ IDE SÁM PRI ŠTARTE A SKORO VŽDY NIČ NEZMENÍ (kontrola po
 * nasadení, 1. 11. 2026): bitcoinový import a automatické balíčky. Zahodili
 * zdieľanú pamäť uprostred načítania, a `/api/vzas-settings`, `/api/fio`
 * a `/api/faktury` išli preto druhýkrát, hoci nevzniklo nič.
 *
 * Bezpečné je to preto, že obaja volajúci hlásia zmenu sami: `oznam("peniaze")`
 * pri `nove`, `oznam("klienti")` pri `vznikli` (App.tsx), a `oznam` pamäť zahodí.
 * Nová adresa sem smie, len keď platí to isté.
 */
const jeTichyPostPriStarte = (url: string, init?: RequestInit): boolean =>
  typeof init?.body === "string" && (
    (url === "/api/platby" && init.body.includes('"akcia":"btc-import"'))
    || (url === "/api/balicky" && init.body.includes('"akcia":"automaticky"'))
  );

const adresa = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const metoda = (input: RequestInfo | URL, init?: RequestInit): string =>
  (init?.method || (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();

type Zaznam = { odpoved: Promise<Response>; dobehol: number | null };

export function vytvorZdielanie(zaklad: FetchLike, volby: { teraz?: () => number; pamatMs?: number; zdielane?: Set<string> } = {}) {
  const teraz = volby.teraz || Date.now;
  const pamat = volby.pamatMs ?? PAMAT_MS;
  const zoznam = volby.zdielane || ZDIELANE;
  const bezi = new Map<string, Zaznam>();

  const zabudni = () => { bezi.clear(); };

  const zdielanyFetch: FetchLike = (input, init) => {
    const url = adresa(input);
    const m = metoda(input, init);
    if (m !== "GET" && m !== "HEAD") {
      if (jeCitanieCezPost(url, init) || jeTichyPostPriStarte(url, init)) return zaklad(input, init);
      zabudni();
      return zaklad(input, init).finally(zabudni);
    }
    if (m !== "GET" || init?.signal || typeof input !== "string" || !zoznam.has(url)) return zaklad(input, init);

    const t = teraz();
    for (const [k, z] of bezi) if (z.dobehol !== null && t - z.dobehol > pamat) bezi.delete(k);
    const zije = bezi.get(url);
    if (zije) return zije.odpoved.then((r) => r.clone());

    const odpoved = zaklad(input, init);
    const zaznam: Zaznam = { odpoved, dobehol: null };
    bezi.set(url, zaznam);
    const dobeh = (ok: boolean) => {
      if (bezi.get(url) !== zaznam) return;
      if (ok) zaznam.dobehol = teraz();
      else bezi.delete(url);
    };
    odpoved.then((r) => dobeh(r.ok), () => dobeh(false));
    return odpoved.then((r) => r.clone());
  };

  return { fetch: zdielanyFetch, zabudni };
}

let aktivne: ReturnType<typeof vytvorZdielanie> | null = null;

/** Zapne zdieľanie pre celú appku. Volá sa raz, z `client.ts`. */
export function zapniZdielanie(): void {
  if (aktivne || typeof window === "undefined") return;
  aktivne = vytvorZdielanie(window.fetch.bind(window));
  window.fetch = aktivne.fetch as typeof window.fetch;
}

const funkcie = new Set<() => void>();

/** Niečo sa zapísalo — čo sa odteraz prečíta, musí prísť zo servera. */
export const zabudniZdielane = (): void => { aktivne?.zabudni(); for (const f of funkcie) f(); };

/**
 * To isté pre vec, ktorá nie je jeden `fetch` (bitcoinová rezerva má dva skoky
 * a druhý ide na inú doménu s podpisom, ktorý je zakaždým iný). Pamäť zmizne
 * spolu s tou nad `fetch` (`zabudniZdielane`); `null` z neúspechu sa nepamätá.
 */
export function zdielanaFunkcia<T>(f: () => Promise<T | null>, volby: { teraz?: () => number; pamatMs?: number } = {}) {
  const teraz = volby.teraz || Date.now;
  const pamat = volby.pamatMs ?? PAMAT_MS;
  let bezi: { vysledok: Promise<T | null>; dobehol: number | null } | null = null;
  const zavolaj = (): Promise<T | null> => {
    if (bezi && (bezi.dobehol === null || teraz() - bezi.dobehol <= pamat)) return bezi.vysledok;
    const zaznam: { vysledok: Promise<T | null>; dobehol: number | null } = { vysledok: f(), dobehol: null };
    bezi = zaznam;
    const koniec = (ok: boolean) => {
      if (bezi !== zaznam) return;
      if (ok) zaznam.dobehol = teraz();
      else bezi = null;
    };
    zaznam.vysledok.then((v) => koniec(v !== null), () => koniec(false));
    return zaznam.vysledok;
  };
  zavolaj.zabudni = () => { bezi = null; };
  funkcie.add(zavolaj.zabudni);
  return zavolaj;
}
