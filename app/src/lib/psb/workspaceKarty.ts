/**
 * Workspace — administratíva po KATEGÓRIÁCH, nie po položkách.
 *
 * Prvá verzia dávala jednu kartu na jednu vec: Martin Vaško, potom Peťa B,
 * potom platba z banky. Jerry to vyskúšal 23. 9. 2026 a povedal presne, čo
 * mu chýba: „na tých kartách som si predstavoval celé kategórie, nie že
 * klienti jeden po druhom, ale zmeny kalendára v jednom."
 *
 * Má pravdu a je to rozdiel v tom, čo znamená FOCUS. Nie „teraz riešim
 * Martina", ale „teraz robím zmeny v kalendári" — jeden DRUH práce naraz,
 * v ňom to ide rýchlo, lebo hlava sa neprepína. Pri jednej položke na kartu
 * sa navyše z troch zmien stali tri karty a kopa vyzerala nekonečná.
 *
 * KOMU KARTA PATRÍ
 *
 * Prihlásený Jerry vidí svoje, Terezka svoje. Zmeny v kalendári a názvy majú
 * trénera priamo v sebe. Peniaze trénera nemajú a sú Jerryho — rovnako ako
 * mesačné kontroly a stav hotovosti (pravidlo z 31. 8. 2026: „tieto kontroly
 * mám na starosti ja, nech Terezku nerozptyľujú").
 */

import type { BezBalicka } from "./bezBalicka";
import type { Dlznik } from "./dlznici";
import type { ZostavaPoPlatnosti } from "./platnostZostatok";

import type { PodlaKlienta } from "./sporneKonanie";

export type Zmena = { id: string; druh: string; klient: string | null; nazov: string | null; pred: string | null; po: string | null; kedy: string; trener: string };
export type NeznamyNazov = { nazov: string; trener: string; pocet: number; najblizsi: string; navrh: string };
export type NepriradenaPlatba = { fioId: string; datum: string; suma: number; text: string; navrh: string };

export type Karta =
  | { druh: "zmeny"; nadpis: string; podnadpis: string; polozky: Zmena[] }
  | { druh: "mena"; nadpis: string; podnadpis: string; polozky: NeznamyNazov[] }
  | { druh: "platby"; nadpis: string; podnadpis: string; polozky: NepriradenaPlatba[] }
  /**
   * DVE FRONTY, KTORÉ NIE SÚ O ADMINISTRATÍVE, ALE O PENIAZOCH FIRMY.
   *
   * Jerry, 28. 9. 2026: „ide mi o to, aby na jednom mieste boli balíčky
   * a na ďalšom peniaze." Obe otázky sa dali dovtedy zodpovedať len
   * prechádzaním klientov po jednom.
   */
  /**
   * Tréningy, ktoré z kalendára zmizli až po tom, čo sa mali konať.
   * Jedna položka = jeden klient so všetkými svojimi spornými hodinami.
   */
  | { druh: "konanie"; nadpis: string; podnadpis: string; polozky: PodlaKlienta[] }
  | { druh: "bezBalicka"; nadpis: string; podnadpis: string; polozky: BezBalicka[] }
  | { druh: "dlznici"; nadpis: string; podnadpis: string; polozky: Dlznik[] }
  /**
   * Platnosť končí a hodiny zostávajú — a treba sa rozhodnúť, čo s nimi.
   * Jerry, 28. 9. 2026: prepadnú, dopíšu sa ako doplnenie, alebo (pri
   * predplatnom) sa najviac dve prenesú do ďalšieho balíčka.
   */
  | { druh: "platnost"; nadpis: string; podnadpis: string; polozky: ZostavaPoPlatnosti[] }
  /**
   * Karta bez fronty — pracovný stôl jedného klienta.
   *
   * Ostatné karty sú zoznamy toho, čo čaká. Táto nie: vyhľadá sa v nej
   * človek a robí sa na ňom. Preto nemá počet a nikdy nezmizne — kopa sa
   * bez nej môže vyprázdniť, ona zostáva ako miesto, kam sa chodí.
   */
  | { druh: "klient"; nadpis: string; podnadpis: string; polozky: never[] }
  /**
   * Faktúry. Druhá karta bez fronty — Jerry, 26. 9. 2026: „toto okno faktúry
   * mi môžeš presunúť do Workspace ako ďalšiu kartu." Patrí sem, lebo
   * faktúra vzniká pri balíčku, a balíčky sa nahadzujú na karte klienta
   * hneď vedľa.
   */
  | { druh: "faktury"; nadpis: string; podnadpis: string; polozky: never[] };

/** Karty, ktoré nie sú fronta — nemajú počet a z kopy nikdy nezmiznú. */
export const BEZ_FRONTY: Karta["druh"][] = ["klient", "faktury"];

export type ZdrojeKariet = {
  zmeny: Zmena[];
  /** Aktívni klienti, ktorým nezostala hodina. */
  bezBalicka?: BezBalicka[];
  /** „Bol tam, alebo nie?" — zoskupené po klientovi. */
  konanie?: PodlaKlienta[];
  /** Kto dlží peniaze — poplatky z PTmindera aj nezaplatené balíčky. */
  dlznici?: Dlznik[];
  /** Komu končí platnosť a zostávajú hodiny. */
  platnost?: ZostavaPoPlatnosti[];
  nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[];
  platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[]; klientsky?: boolean }[];
  navrhMena: (nazov: string) => string;
  /** „jerry" | „terezka" | null (nevie sa / spoločné prihlásenie). */
  ktoSom: string | null;
  /** Ručne zvolený tréner; `null` = všetko, `undefined` = podľa prihlásenia. */
  trener?: "Jerry" | "Terezka" | null;
};

/**
 * Meno trénera z prihlásenia, v tvare, v akom stojí v dátach.
 *
 * POROVNÁVA SA BEZ OHĽADU NA VEĽKOSŤ PÍSMEN. Session nesie `users.name`, teda
 * „Jerry" s veľkým J — a prvá verzia porovnávala s „jerry". Nesedelo to nikdy,
 * takže filter ticho prepúšťal všetko a Jerry videl aj Terezkine veci.
 * Presne ten druh tichej chyby, pri ktorej nič nespadne a nič sa neukáže zle
 * — len to robí niečo iné, než má.
 */
export const trenerZPrihlasenia = (ktoSom: string | null): "Jerry" | "Terezka" | null => {
  const m = (ktoSom || "").trim().toLowerCase();
  return m === "jerry" ? "Jerry" : m === "terezka" ? "Terezka" : null;
};

const denSK = (iso: string) => {
  const d = (iso || "").slice(0, 10);
  return d ? `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.` : "";
};

export const popisZmeny = (x: Zmena): string =>
  x.druh === "zrusene" ? `zmizol tréning z ${denSK(x.pred || x.kedy)}`
    : x.druh === "posunute" ? `presun z ${denSK(x.pred || "")} na ${denSK(x.po || "")}`
      : x.druh === "pridane" ? `pribudol tréning ${denSK(x.po || x.kedy)}`
        : "premenované";

const pocet = (n: number, jeden: string, malo: string, vela: string) =>
  n === 1 ? jeden : n < 5 ? malo : vela;

export function postavKarty(z: ZdrojeKariet): Karta[] {
  /**
   * Koho veci sa ukazujú.
   *
   * `trener` prebije prihlásenie: keď si človek v kope prepne filter, platí
   * jeho voľba. `undefined` znamená „nechaj to na prihlásenie", `null` znamená
   * „všetko" — a to sú dve rôzne veci, preto sa nedá použiť jedna hodnota.
   *
   * Prečo vôbec voľba: keď sa prihlásenie nepodarí preložiť na trénera
   * (zdieľané heslo, identita „app"), filter ticho prestal platiť a v kope
   * boli zrazu aj cudzie udalosti. Ticho je tu to zlé slovo — Jerry to 23. 9.
   * 2026 hlásil druhýkrát a nemal ako zistiť, prečo sa to deje.
   */
  const ja = z.trener !== undefined ? z.trener : trenerZPrihlasenia(z.ktoSom);
  const moje = <T extends { trener: string }>(xs: T[]) => (ja ? xs.filter((x) => x.trener === ja) : xs);

  const zmeny = moje(z.zmeny);
  const mena: NeznamyNazov[] = moje(z.nezname).map((n) => ({ ...n, navrh: z.navrhMena(n.nazov) }));
  // Peniaze nemajú trénera a sú Jerryho. Terezke by boli len šumom.
  /**
   * V kope sú LEN príjmy od klientov. Vrátka z Alzy, vklad do bankomatu
   * alebo vratka kaucie sa riešia pri nahrávaní výpisu, kde sa berie celý
   * účet (Jerry, 23. 9. 2026) — tu by boli votrelci, nad ktorými človek
   * každý deň znova zastane a zistí, že to nie je klient.
   * Nezahadzujú sa: obrazovka „Platby z banky" ich ukazuje ďalej.
   */
  const platby: NepriradenaPlatba[] = ja === "Terezka" ? [] : z.platby.filter((p) => p.klientsky !== false).map((p) => ({
    fioId: p.fioId, datum: p.datum, suma: p.suma, text: p.text,
    // Jednoznačný návrh sa predvyplní; pri dvoch a viacerých nie — hádať sa
    // nesmie, to je pravidlo platné všade v appke.
    navrh: p.kandidati.length === 1 ? p.kandidati[0] : "",
  }));

  const karty: Karta[] = [];
  /**
   * KLIENT JE PRVÝ (Jerry, 24. 9. 2026: „ako hlavnú obrazovku vo workspace
   * daj klient"). Ostatné karty sú fronty, ktoré sa raz za čas vyprázdnia
   * a zmiznú; pracovný stôl klienta je to, kvôli čomu sa sem chodí denne.
   * Karta, ktorá nikdy nezmizne, má byť tá, na ktorú kopa otvorí.
   */
  karty.push({
    druh: "klient",
    nadpis: "Klient",
    podnadpis: "vyhľadaj človeka a rob na ňom — tréningy, peniaze, balíčky",
    polozky: [],
  });
  /**
   * FAKTÚRU VYSTAVUJE AJ TEREZKA.
   *
   * Pôvodne tu stálo „faktúry sú peniaze, a tie sú Jerryho" — tá istá veta
   * ako pri nepriradených platbách. Lenže to sú dve rôzne práce. Front
   * príjmov z banky naozaj Terezku nezaujíma; doklad pre klienta, ktorého
   * vedie, je jej robota.
   *
   * A chýbajúca karta nebola len „o jednu menej". Tlačidlo „Vystaviť
   * faktúru" na karte klienta má KAŽDÝ — Workspace po kliku hľadá kartu
   * Faktúry a keď ju nenájde, neurobí nič a nič ani nepovie. Terezka
   * 28. 9. 2026 klikala na faktúru pre Janku šnirychovú a appka mlčala.
   */
  karty.push({
    druh: "faktury",
    nadpis: "Faktúry",
    podnadpis: "vystav doklad, pošli QR platbu a veď si, čo je zaplatené",
    polozky: [],
  });
  if (zmeny.length) karty.push({
    druh: "zmeny",
    nadpis: "Zmeny v kalendári",
    podnadpis: `${zmeny.length} ${pocet(zmeny.length, "zmena čaká", "zmeny čakajú", "zmien čaká")} na dôvod`,
    polozky: zmeny,
  });
  /**
   * „Bol tam, alebo nie?" stojí VYSOKO — hneď za zmenami v kalendári.
   *
   * Každá nerozhodnutá položka je hodina, o ktorú je zostatok klienta vedľa.
   * Kým sa neodpovie, Kokpit mu tvrdí, že má viac hodín, než má — a podľa
   * toho mu aj píše maily a SMS.
   */
  const konanie = (z.konanie || []).filter((k) => (ja ? k.polozky.some((p) => p.trener === ja) : true));
  if (konanie.length) karty.push({
    druh: "konanie",
    nadpis: "Bol tam, alebo nie?",
    podnadpis: `${konanie.length} ${pocet(konanie.length, "klient s hodinou", "klienti s hodinami", "klientov s hodinami")}, o ktorej sa nevie`,
    polozky: konanie,
  });
  if (mena.length) karty.push({
    druh: "mena",
    nadpis: "Nové názvy v kalendári",
    podnadpis: `${mena.length} ${pocet(mena.length, "názov, ktorý", "názvy, ktoré", "názvov, ktoré")} appka nepozná`,
    polozky: mena,
  });
  if (platby.length) karty.push({
    druh: "platby",
    nadpis: "Platby z banky",
    podnadpis: `${platby.length} ${pocet(platby.length, "príjem bez klienta", "príjmy bez klienta", "príjmov bez klienta")}`,
    polozky: platby,
  });

  /**
   * BALÍČKY A PENIAZE SÚ DVE KARTY, NIE JEDNA.
   *
   * Jerry, 28. 9. 2026: „ide mi o to, aby na jednom mieste boli balíčky a na
   * ďalšom peniaze." Sú to dva rôzne telefonáty — „kúp si ďalší balíček"
   * a „pošli, čo dlžíš" — a miešať ich do jedného zoznamu by znamenalo
   * prepínať hlavu pri každom riadku. To je presne to, čo mala kopa odstrániť.
   *
   * Bez balíčka sa filtruje podľa trénera: predať ďalší balíček svojmu
   * klientovi je robota toho, kto ho vedie. Dlhy zostávajú Jerryho, rovnako
   * ako front príjmov z banky a mesačné kontroly.
   */
  const bezBalicka = moje(z.bezBalicka || []);
  if (bezBalicka.length) karty.push({
    druh: "bezBalicka",
    nadpis: "Bez balíčka",
    podnadpis: `${bezBalicka.length} ${pocet(bezBalicka.length, "klient chodí bez hodín", "klienti chodia bez hodín", "klientov chodí bez hodín")}`,
    polozky: bezBalicka,
  });

  const dlzni = ja === "Terezka" ? [] : (z.dlznici || []);
  if (dlzni.length) karty.push({
    druh: "dlznici",
    nadpis: "Dlhujú peniaze",
    podnadpis: `${dlzni.length} ${pocet(dlzni.length, "klient dlží", "klienti dlžia", "klientov dlží")} ${Math.round(dlzni.reduce((a, d) => a + d.spolu, 0)).toLocaleString("sk-SK")} Kč`,
    polozky: dlzni,
  });

  /**
   * PLATNOSŤ KONČÍ, HODINY ZOSTÁVAJÚ.
   *
   * Filtruje sa trénerom: je to dohoda s vlastným klientom, nie účtovníctvo.
   * Karta stojí až za peniazmi, lebo sa týka pár ľudí mesačne — ale keď sa
   * týka, treba to vybaviť v ten týždeň, nie v tom mesiaci.
   */
  const platnost = moje(z.platnost || []);
  if (platnost.length) karty.push({
    druh: "platnost",
    nadpis: "Platnosť končí, hodiny zostávajú",
    podnadpis: `${platnost.length} ${pocet(platnost.length, "klient má", "klienti majú", "klientov má")} nedočerpané hodiny`,
    polozky: platnost,
  });

  return karty;
}

export function klucPolozky(
  druh: Karta["druh"],
  p: Zmena | NeznamyNazov | NepriradenaPlatba | BezBalicka | Dlznik | ZostavaPoPlatnosti | PodlaKlienta,
): string {
  if (druh === "zmeny") return `zmeny|${(p as Zmena).id}`;
  if (druh === "mena") return `mena|${(p as NeznamyNazov).nazov}|${(p as NeznamyNazov).trener}`;
  /**
   * Kľúč je MENO, nie stav.
   *
   * Pravidlo z 26. 8. 2026: kľúč sa neodvodzuje z textu, ktorý sa mení. Suma
   * dlhu aj počet hodín sa hýbu každým importom a odklepnutie by padlo pri
   * prvom pohybe. „Vybavené" tu znamená „s týmto človekom som to riešil".
   */
  if (druh === "bezBalicka") return `bezBalicka|${(p as BezBalicka).meno}`;
  // Kľúč je meno klienta — kým má čo i len jednu nerozhodnutú hodinu, otázka
  // stojí. Zmizne sama, keď sa odpovie na všetky; odklepnúť sa nedá.
  if (druh === "konanie") return `konanie|${(p as PodlaKlienta).klient}`;
  if (druh === "dlznici") return `dlznici|${(p as Dlznik).meno}`;
  // Kľúč je ten istý, aký nesie notifikácia — odklepnutie na karte tým
  // umlčí aj upozornenie a nepýta sa to na dvoch miestach zvlášť.
  if (druh === "platnost") return `platnost|${(p as ZostavaPoPlatnosti).meno}|${(p as ZostavaPoPlatnosti).platnostDo}`;
  return `platby|${(p as NepriradenaPlatba).fioId}`;
}
