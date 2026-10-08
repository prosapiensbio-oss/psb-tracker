/**
 * Kontrola webu, bod 2 — stránky žijú a nepriberajú.
 *
 * PREČO TO VZNIKLO
 *
 * Bod 1 (`webKontrola.ts`) sa pýta, či sa dá z formulára odoslať dopyt. To má
 * zmysel len vtedy, keď sa stránka s formulárom vôbec načíta a načíta sa tak,
 * aby na ňu človek dočkal. Oboje už raz padlo:
 *
 * - pristávacia stránka /uvodni-trenink/ mala v septembri 2026 7,6 MB a LCP
 *   16 s; 60 % zaplatených klikov nedorazilo na obsah. Nikto nič nezmenil
 *   naraz — stránka pribrala po kúskoch, obrázok po obrázku, a žiadne číslo
 *   na to nedávalo pozor.
 * - WordPress neexistujúcu adresu nepriznáva 404, ale prelepí ju zástupnou
 *   stránkou. Odkaz aj reklama vedú na HTTP 200, v ktorom nie je nič z toho,
 *   čo tam má byť, a kontrola, ktorá pozerá len na stavový kód, povie „OK“.
 *
 * Preto sa tu meria štvorica: ČO odpovedalo, KDE to skončilo, KOĽKO to váži
 * a ČO je v tele.
 *
 * Posledná otázka je tu kvôli prelepeniu BEZ presmerovania. Keď WordPress
 * podstrčí zástupnú stránku interne, `konecnaUrl` sa nezmení a kontrola cieľa
 * nevystrelí vôbec; to isté platí pre fatálnu chybu a bielu obrazovku, ktoré
 * tiež vrátia 200. Jediná stopa je potom v tele: je ho podozrivo málo (spodná
 * hranica `dnoBajtov`), alebo v ňom nie je to, čo na tej stránke stáť MUSÍ
 * (`musiObsahovat`). Bez tela sa povinná značka overiť nedá, a to je
 * „neviem“, nie „v poriadku“.
 *
 * ROZDELENIE PRÁCE
 *
 * `skontrolujZivostWebu()` je čistá — dostane už stiahnuté odpovede a vráti
 * nálezy. Sieť je v `stiahniStranku()` / `stiahniStranky()`, ktoré dostávajú
 * `fetch` ako parameter, takže sa dajú otestovať bez siete. Zapojenie do
 * nočného behu (čítanie zoznamu adries z nastavení, zápis do `web_kontroly`)
 * robí volajúci; tento modul databázu nepozná.
 */

import type { NalezKontroly } from "./webKontrola";
import { sitemapUrls } from "./webObsah";

/**
 * Jedna stiahnutá odpoveď.
 *
 * `bajtov`, `trvanieMs` aj `konecnaUrl` sú nepovinné naschvál: keď ich
 * volajúci nemeral, kontrola to MÁ priznať („neviem“), nie ticho preskočiť.
 * Mlčanie o nezmeranej veci je presne to, čo nechalo 7,6 MB stránku bežať.
 *
 * `telo` je nepovinné, aby si volajúci mohol veľkú stránku po zmeraní zahodiť
 * a nedržať v pamäti Workera megabajty. Preto je tu aj `ukazka` — keď telo
 * zmizne, dôkaz, čo server naozaj poslal, zostane.
 */
export type OdpovedStranky = {
  /** Adresa, ktorú sme si vyžiadali (z nej vzniká `kluc`), nie tá, kde sme skončili. */
  url: string;
  /** HTTP stav; 0 znamená, že odpoveď neprišla vôbec (sieť, časový limit). */
  stav: number;
  /** Adresa, na ktorej načítanie skončilo po presmerovaniach. */
  konecnaUrl?: string;
  /** Telo odpovede, ak si ho volajúci nechal. */
  telo?: string;
  /** Veľkosť tela v bajtoch; keď chýba, dopočíta sa z `telo`. */
  bajtov?: number;
  /** Čas od žiadosti po dočítanie tela v milisekundách. */
  trvanieMs?: number;
  /** Prvých ~200 znakov tela — jediná stopa, keď sa odpoveď nedá rozobrať. */
  ukazka?: string;
  /** Prečo sa stránka nestiahla vôbec. */
  chyba?: string;
};

export type MedzeStranok = {
  /** Strop veľkosti HTML v bajtoch. Nad ním je to chyba. */
  stropBajtov?: number;
  /** Podiel stropu, od ktorého sa hlási varovanie „blíži sa k stropu“. */
  podielVarovania?: number;
  /** Čas odpovede, nad ktorým sa hlási varovanie. */
  stropMs?: number;
  /**
   * Spodná hranica veľkosti HTML v bajtoch. Pod ňou je to chyba.
   *
   * Nula bajtov bola ošetrená od začiatku, ale medzi nulou a stropom bolo
   * 3 MB priestoru, v ktorom nesvietilo nič — a prelepená stránka, fatálna
   * chyba WordPressu aj biela obrazovka vrátia 200 a pár stoviek bajtov.
   * `0` kontrolu vypne (pre adresu, ktorá naozaj má odpovedať krátko).
   */
  dnoBajtov?: number;
  /**
   * Značky, ktoré musia byť v tele KAŽDEJ kontrolovanej stránky.
   *
   * Prázdne naschvál: žiadna značka nerozlíši skutočnú stránku od zástupnej
   * na všetkých adresách naraz — zástupná stránka má tú istú tému, tú istú
   * hlavičku aj pätičku. Rozlíši ich len to, čo je na TEJ stránke (formulár,
   * nadpis), čiže hodnota per adresa nižšie. Spoločný zoznam je tu na to, čo
   * naozaj platí všade (napríklad most na formuláre).
   */
  musiObsahovat?: string | string[];
  /**
   * Povinné značky pre konkrétnu adresu alebo cestu.
   *
   * Zápis pre cestu PREPÍŠE spoločný zoznam, nespojí sa s ním: stránka, ktorá
   * spoločnú značku legitímne nemá, musí byť vyňatá (prázdnym poľom), inak by
   * svietila každú noc — a kontrola, ktorá svieti vždy, nehlási nič.
   */
  musiObsahovatNaCeste?: Record<string, string | string[]>;
};

/**
 * 3 MB HTML. Nie je to cieľ, je to hranica absurdity: septembrová pristávacia
 * stránka mala 7,6 MB a aj polovica z toho je na mobile nepoužiteľná. Nižší
 * strop (napr. 1 MB) by svietil stále a prestalo by sa naň pozerať — a
 * kontrola, ktorá svieti vždy, nehlási nič.
 */
const STROP_BAJTOV = 3 * 1024 * 1024;

/** Od 70 % stropu je to varovanie — nech sa o priberaní vie skôr, než prekročí. */
const PODIEL_VAROVANIA = 0.7;

/**
 * 4 s. Nad tým človek na mobile odchádza, ale je to jedno meranie z jedného
 * Workera, nie dôkaz — preto varovanie, nie chyba (tak to žiada aj zadanie).
 */
const STROP_MS = 4000;

/**
 * 2 kB HTML. Nie je to meradlo kvality, je to druhá hranica absurdity: stránka
 * témy psb-spready má samú hlavičku, navigáciu a pätičku na desiatky kB, takže
 * 2 kB nevie vrátiť ani tá najchudobnejšia. Vyššie dno (napr. 20 kB, čo by pre
 * tento web bola pravda) by padlo na prvej skutočne krátkej stránke a prestalo
 * by sa mu veriť; nižšie by splynulo s nulou, ktorá je ošetrená zvlášť.
 *
 * Exportované preto, že tú istú stránku meria aj bod 5 (`webKontrolaReklamy`).
 * Druhá, vlastná hranica tam znamenala dva riadky o jednej stránke v jednej
 * tabuľke — jeden červený, jeden zelený — a Jerry prestane veriť obom.
 */
export const DNO_BAJTOV = 2 * 1024;

/** Adresa, ktorou WordPress prelepuje neexistujúce stránky. */
const ZASTUPNA = /(^|\/)(404|not-?found|nenalezeno|nenalezena|chyba|error)(\/|$)/i;

/** Predvolené sitemapy. Rovnaká dvojica, akú čita import obsahu webu. */
export const SITEMAPY = ["page-sitemap.xml", "post-sitemap.xml"];

/** Cesta z adresy — základ `kluc`a, preto bez dopytu a bez domény. */
export function cestaZAdresy(url: string): string {
  const s = String(url ?? "").trim();
  if (!s) return "";
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i.exec(s);
  if (m) return m[1] || "/";
  // Relatívna alebo pokazená adresa: aspoň odrež dopyt a fragment, nech sa
  // kľúč nemení s `?kokpit=kontrola` alebo s cache-busting parametrom.
  return s.split(/[?#]/)[0] || s;
}

/**
 * Dve adresy ukazujú na tú istú stránku?
 *
 * Schéma, `www.` a koncová lomka sa ignorujú: presmerovanie z http na https
 * alebo doplnenie lomky je normálny chod webu a hlásiť ho by znamenalo tri
 * varovania každú noc. Doména sa inak porovnáva — presmerovanie na cudzí web
 * je niečo úplne iné než doplnená lomka.
 */
function tenIstyCiel(a: string, b: string): boolean {
  const kluc = (u: string) => {
    const bezSchemy = String(u ?? "").trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    const [hostCesta] = bezSchemy.split(/[?#]/);
    const i = hostCesta.indexOf("/");
    const host = (i < 0 ? hostCesta : hostCesta.slice(0, i)).toLowerCase().replace(/^www\./, "");
    const cesta = (i < 0 ? "/" : hostCesta.slice(i)).toLowerCase().replace(/\/+$/, "");
    return `${host}${cesta}`;
  };
  return kluc(a) === kluc(b);
}

/** Jedna značka aj zoznam sa čítajú rovnako; prázdne reťazce sa zahodia. */
function zoznam(v: string | string[] | undefined): string[] {
  const p = typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
  return p.map((z) => String(z ?? "").trim()).filter((z) => z.length > 0);
}

/**
 * Kľúč cesty pre zoznam povinných značiek.
 *
 * Koncová lomka a veľké písmená sa ignorujú, lebo v nastaveniach stojí raz
 * „/uvodni-trenink/“ a raz celá adresa bez lomky — a značka, ktorá sa kvôli
 * lomke nenájde, by kontrolu obsahu ticho vypla.
 */
function klucCesty(cesta: string): string {
  return String(cesta ?? "").trim().toLowerCase().replace(/\/+$/, "") || "/";
}

/** Povinné značky pre danú cestu: najprv zápis na cestu, inak spoločný zoznam. */
function znackyPreCestu(cesta: string, medze: MedzeStranok): string[] {
  const naCeste = medze.musiObsahovatNaCeste;
  if (naCeste) {
    const hladany = klucCesty(cesta);
    for (const [adresa, znacky] of Object.entries(naCeste)) {
      // Kľúč môže byť celá adresa aj len cesta — v nastaveniach stojí jedno aj druhé.
      if (klucCesty(cestaZAdresy(adresa) || adresa) === hladany) return zoznam(znacky);
    }
  }
  return zoznam(medze.musiObsahovat);
}

/**
 * Značky do vety pre človeka. Spojka je parameter, lebo tá istá funkcia sa
 * používa v zápornej vete („nie je v nej X ani Y") aj v kladnej („v tele je
 * X aj Y") — natvrdo napísané „ani" vyrobilo vetu „v tele je X ani Y", čo sa
 * číta presne opačne, než ako to kontrola myslí.
 */
function vymenuj(znacky: string[], spojka: "ani" | "aj" = "ani"): string {
  return znacky.map((z) => `„${z.slice(0, 80)}“`).join(` ${spojka} `);
}

function velkost(bajtov: number): string {
  if (bajtov < 1024) return `${bajtov} B`;
  if (bajtov < 1024 * 1024) return `${Math.round(bajtov / 1024)} kB`;
  return `${(bajtov / (1024 * 1024)).toFixed(1)} MB`;
}

// Formátovač sa stavia RAZ. Je to tá istá pasca ako `Intl` v parseri iCal —
// drahý objekt v slučke nad súborom zožral 78 % CPU a zabil worker.
const KODOVANIE = new TextEncoder();

/** Bajty v UTF-8. Pri diakritike sa počet znakov a bajtov rozchádza. */
function bajtyTextu(s: string): number {
  return KODOVANIE.encode(s).length;
}

/** Krátka ukážka tela — aby sa nikdy nehlásil len stavový kód. */
function ukazkaTela(o: OdpovedStranky): string {
  const zdroj = o.ukazka || o.telo || "";
  const t = String(zdroj).replace(/\s+/g, " ").trim().slice(0, 200);
  return t ? `, odpoveď začína: ${t}` : ", telo odpovede prázdne";
}

/** Koľko bajtov odpoveď naozaj mala, alebo `null`, keď sa to nedá zistiť. */
function bajtyOdpovede(o: OdpovedStranky): number | null {
  if (typeof o.bajtov === "number" && Number.isFinite(o.bajtov)) return o.bajtov;
  if (typeof o.telo === "string") return bajtyTextu(o.telo);
  return null;
}

type Zistenie = { tvrde: boolean; veta: string };

/** Spoločný prvý krok oboch kontrol: prišla vôbec použiteľná odpoveď? */
function odpovedPrisla(o: OdpovedStranky, co: string): Zistenie | null {
  if (o.chyba) {
    return { tvrde: true, veta: `${co} sa nedá stiahnuť: ${String(o.chyba).slice(0, 200)}` };
  }
  if (!o.stav) {
    return { tvrde: true, veta: `${co} neodpovedala vôbec a nie je známy dôvod — kontrola nedostala ani stavový kód, takže o nej neviem nič` };
  }
  if (o.stav >= 300 && o.stav < 400) {
    // Presmerovanie, ktoré nikam nedošlo: volajúci nesledoval reťaz, takže
    // sa nedá povedať, čo človek nakoniec uvidí.
    return { tvrde: true, veta: `${co} vrátila HTTP ${o.stav} a presmerovanie sa nedosledovalo${o.konecnaUrl ? ` (hlási ${o.konecnaUrl})` : ""} — nevie sa, kde človek skončí` };
  }
  if (o.stav !== 200) {
    return { tvrde: true, veta: `${co} vrátila HTTP ${o.stav}${ukazkaTela(o)}` };
  }
  return null;
}

/**
 * Spoločný druhý krok oboch kontrol: skončilo načítanie tam, kam sme mierili?
 *
 * Je to JEDNA funkcia naschvál. Kým pravidlo o cieli stálo len v kontrole
 * stránok, sitemapy sa merali iným metrom: presmerovanie page-sitemap na
 * post-sitemap bolo „v poriadku“, import obsahu webu by prečítal ten istý
 * súbor dvakrát, polovica webu by v `web_obsah` prestala existovať — a nočná
 * kontrola by na to ohlásila dva zelené riadky. Vety sú pre každý druh iné
 * (človek má vedieť, čo tým stráca), pravidlo aj prísnosť sú spoločné.
 */
function cielSedi(o: OdpovedStranky, co: "stranka" | "sitemapa"): Zistenie | null {
  if (!o.konecnaUrl) {
    // Nezmerané nie je v poriadku: bez konečnej adresy by presmerovanie
    // zostalo nevidené a práve to je tichá chyba, pre ktorú modul vznikol.
    return {
      tvrde: false,
      veta: co === "stranka"
        ? "nevie sa, na akej adrese načítanie skončilo — presmerovanie na zástupnú stránku by takto zostalo nevidené"
        : "nevie sa, na akej adrese načítanie skončilo — keby sitemapa presmerovávala na inú, import obsahu webu by čítal iný súbor, než si myslí",
    };
  }
  if (tenIstyCiel(o.url, o.konecnaUrl)) return null;
  // Zástupná stránka je tvrdý nález aj pri sitemape: prelepené XML sa nedá
  // rozobrať vôbec, čiže import z neho nedostane ani jednu adresu. Zmierniť
  // to u sitemapy na varovanie by znamenalo písať druhé pravidlo.
  if (ZASTUPNA.test(cestaZAdresy(o.konecnaUrl))) {
    return {
      tvrde: true,
      veta: co === "stranka"
        ? `adresa už neexistuje — načítanie skončilo na zástupnej stránke ${o.konecnaUrl} a WordPress to zakryl stavom 200, takže odkazy aj reklama vedú na prázdno`
        : `sitemapa už neexistuje — načítanie skončilo na zástupnej stránke ${o.konecnaUrl}, ktorú WordPress zakryl stavom 200, takže import obsahu webu z nej neprečíta ani jednu adresu`,
    };
  }
  return {
    tvrde: false,
    veta: co === "stranka"
      ? `adresa presmerováva na ${o.konecnaUrl} — stránka síce odpovedá, ale je to iná stránka, než na ktorú vedú odkazy a reklama`
      : `sitemapa presmerováva na ${o.konecnaUrl} — import by z nej čítal iný súbor, než si myslí, a stránky z tejto sitemapy by v tabuľke obsahu webu prestali existovať`,
  };
}

/** Zloží nález zo zistení; jeden tvrdý prebije ľubovoľný počet mäkkých. */
function zlozNalez(kluc: string, nazov: string, zistenia: Zistenie[], detailOk: string): NalezKontroly {
  if (!zistenia.length) return { kluc, nazov, stav: "ok", detail: detailOk };
  return {
    kluc,
    nazov,
    stav: zistenia.some((z) => z.tvrde) ? "chyba" : "varovanie",
    detail: zistenia.map((z) => z.veta).join(" · "),
  };
}

/**
 * Jedna stránka. Vracia nález pripravený na zápis.
 *
 * Kľúč je `stranka:<cesta>` a drží sa cesty, ktorú sme si VYŽIADALI. Keby sa
 * bral z `konecnaUrl`, stránka prelepená na /404/ by každú noc zapísala iný
 * riadok a otázka „odkedy to nefunguje“ by sa už nedala zodpovedať.
 */
export function skontrolujStrankuZivot(o: OdpovedStranky, medze: MedzeStranok = {}): NalezKontroly {
  const stropBajtov = medze.stropBajtov ?? STROP_BAJTOV;
  const podiel = medze.podielVarovania ?? PODIEL_VAROVANIA;
  const stropMs = medze.stropMs ?? STROP_MS;
  // Záporné dno by z `bajtov < dno` urobilo nikdy neplatnú podmienku bez toho,
  // aby to bolo niekde vidieť; nula kontrolu vypína zámerne.
  const dnoBajtov = Math.max(0, medze.dnoBajtov ?? DNO_BAJTOV);
  // Bez adresy sa kľúč MUSÍ dať aj tak zapísať — riadok bez kľúča by v
  // tabuľke prepisoval ten predošlý (PK je beh|kluc) a nález by zmizol.
  const cesta = cestaZAdresy(o.url) || "(bez adresy)";
  const kluc = `stranka:${cesta}`;
  const nazov = `Stránka ${cesta}`;
  const zistenia: Zistenie[] = [];

  const neprisla = odpovedPrisla(o, "stránka");
  if (neprisla) return { kluc, nazov, stav: "chyba", detail: neprisla.veta };

  // 1. KDE sa to skončilo. HTTP 200 na prelepenej adrese je tichšia chyba
  //    než 404, lebo sa na ňu nedá kliknúť a vidieť, že je zle.
  const ciel = cielSedi(o, "stranka");
  if (ciel) zistenia.push(ciel);

  // 2. KOĽKO to váži. Nula sa nesmie zliať s „malou stránkou“: prázdne telo
  //    pri stave 200 je rozbitá stránka, nie úsporná.
  const bajtov = bajtyOdpovede(o);
  if (bajtov === null) {
    zistenia.push({ tvrde: false, veta: "veľkosť stránky sa nezmerala, takže o priberaní neviem nič — to nie je to isté ako „je v poriadku“" });
  } else if (bajtov === 0) {
    zistenia.push({ tvrde: true, veta: "stránka vrátila HTTP 200 a PRÁZDNE telo — človek vidí bielu obrazovku" });
  } else if (bajtov > stropBajtov) {
    zistenia.push({ tvrde: true, veta: `stránka váži ${velkost(bajtov)} pri strope ${velkost(stropBajtov)} — v septembri 2026 takto nedorazilo 60 % zaplatených klikov` });
  } else if (dnoBajtov > 0 && bajtov < dnoBajtov) {
    // Tým istým argumentom ako nula: toľko HTML nie je úsporná stránka.
    zistenia.push({ tvrde: true, veta: `stránka vrátila HTTP 200, ale len ${velkost(bajtov)} HTML pri spodnej hranici ${velkost(dnoBajtov)} — to nie je úsporná stránka, ale zástupná stránka WordPressu, fatálna chyba alebo biela obrazovka${ukazkaTela(o)}` });
  } else if (bajtov > stropBajtov * podiel) {
    zistenia.push({ tvrde: false, veta: `stránka váži ${velkost(bajtov)} a blíži sa k stropu ${velkost(stropBajtov)} — pribrala, ešte sa to dá vrátiť jedným obrázkom` });
  }

  // 2b. ČO je v tele. Jediná vetva, ktorá chytí prelepenie BEZ presmerovania:
  //     `konecnaUrl` sa pri ňom nemení a veľkosť môže byť v poriadku, lebo
  //     zástupná stránka nesie tú istú tému. Preto sa hľadá značka, ktorá na
  //     tej stránke stáť musí.
  //     Bez zadanej značky sa nehlási nič — nie je čo hľadať. Detail pri „ok“
  //     to ale MUSÍ priznať, inak by zelený riadok tvrdil viac, než sa zmeralo.
  const znacky = znackyPreCestu(cesta, medze);
  const telo = o.telo;
  if (znacky.length) {
    if (typeof telo !== "string") {
      zistenia.push({ tvrde: false, veta: `telo stránky sa neuložilo, takže sa nedá overiť, či je v nej ${vymenuj(znacky)} — prelepená zástupná stránka vracia HTTP 200 a pozná sa len z obsahu` });
    } else {
      // Porovnanie bez ohľadu na veľkosť písmen: v HTML je <FORM to isté ako
      // <form, a značka, ktorá by sa kvôli veľkému písmenu nenašla, by hlásila
      // chybu, ktorá na webe nie je.
      const dole = telo.toLowerCase();
      const chybaju = znacky.filter((z) => !dole.includes(z.toLowerCase()));
      if (chybaju.length) {
        zistenia.push({ tvrde: true, veta: `stránka odpovedala 200, ale nie je v nej ${vymenuj(chybaju)} — pravdepodobne ju WordPress prelepil zástupnou stránkou, a pri prelepení sa adresa ani stav nezmenia, takže inak to nevidno${ukazkaTela(o)}` });
      }
    }
  }

  // 3. AKO DLHO sa čakalo. Jedno meranie z Workera nie je dôkaz o rýchlosti
  //    webu, preto varovanie — chyba by nočnú kontrolu znedôveryhodnila.
  const ms = o.trvanieMs;
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    zistenia.push({ tvrde: false, veta: "čas odpovede sa nezmeral — o rýchlosti tejto stránky neviem nič" });
  } else if (ms > stropMs) {
    zistenia.push({ tvrde: false, veta: `odpoveď trvala ${(ms / 1000).toFixed(1)} s pri hranici ${(stropMs / 1000).toFixed(1)} s — je to jedno meranie, ale ak sa zopakuje, čakajú tak dlho aj ľudia z reklamy` });
  }

  const oObsahu = znacky.length
    ? `v tele je ${vymenuj(znacky, "aj")}`
    : "obsah sa nekontroloval — pre túto cestu nie je zadaná povinná značka";
  return zlozNalez(
    kluc,
    nazov,
    zistenia,
    `HTTP 200 · ${velkost(bajtov ?? 0)} z ${velkost(stropBajtov)} · odpoveď ${((ms ?? 0) / 1000).toFixed(1)} s · ${oObsahu}`,
  );
}

/**
 * Jedna sitemapa.
 *
 * Kokpit z nich číta celý obsah webu (`web_obsah`). Keď sitemapa zmizne,
 * import nespadne — prečíta nula stránok a ohlási úspech. Preto sa kontroluje
 * samostatne a preto je prázdna sitemapa so stavom 200 varovanie: buď je
 * naozaj prázdna, alebo zmenila tvar a prestali sme ju vedieť rozobrať. Jedno
 * od druhého sa zvonku nerozlíši, a „neviem“ je tu správna odpoveď.
 */
export function skontrolujSitemapu(o: OdpovedStranky): NalezKontroly {
  const cesta = cestaZAdresy(o.url) || "(bez adresy)";
  const kluc = `sitemap:${cesta}`;
  const nazov = `Sitemapa ${cesta}`;

  const neprisla = odpovedPrisla(o, "sitemapa");
  if (neprisla) {
    return { kluc, nazov, stav: "chyba", detail: `${neprisla.veta} — Kokpit z nej čita obsah webu, bez nej import prečíta nula stránok a ohlási úspech` };
  }

  const zistenia: Zistenie[] = [];

  // Cieľ sa kontroluje TÝM ISTÝM pravidlom ako pri stránke. Dovtedy sa tu
  // nekontroloval vôbec, takže prelepená aj presmerovaná sitemapa boli „v
  // poriadku“ — hoci import by z nej čítal celkom iný súbor.
  const ciel = cielSedi(o, "sitemapa");
  if (ciel) zistenia.push(ciel);

  const telo = o.telo;
  let adries = 0;
  if (typeof telo !== "string" || !telo.trim()) {
    zistenia.push({ tvrde: false, veta: "sitemapa odpovedala stavom 200, ale telo sa neuložilo alebo je prázdne — počet adries v nej sa nedá overiť" });
  } else {
    adries = sitemapUrls(telo).length;
    if (!adries) {
      zistenia.push({ tvrde: false, veta: `sitemapa odpovedala stavom 200, ale nie je v nej ani jedna adresa — buď je prázdna, alebo zmenila tvar a prestali sme ju vedieť prečítať${ukazkaTela(o)}` });
    }
  }

  return zlozNalez(kluc, nazov, zistenia, `${adries} adries · ${velkost(bajtyOdpovede(o) ?? 0)}`);
}

/**
 * Hlavná čistá funkcia bodu 2.
 *
 * Dostane už stiahnuté odpovede, vráti nálezy pre tabuľku `web_kontroly`.
 * Keď nedostane nič, NEVRÁTI prázdne pole: prázdny výsledok sa v tabuľke
 * nedá odlíšiť od behu, ktorý všetko našel v poriadku, a presne tak sa dva
 * týždne nevedelo o rozbitom formulári.
 */
export function skontrolujZivostWebu(
  vstup: { stranky?: OdpovedStranky[]; sitemapy?: OdpovedStranky[] },
  medze: MedzeStranok = {},
): NalezKontroly[] {
  const stranky = vstup.stranky ?? [];
  const sitemapy = vstup.sitemapy ?? [];
  const nalezy: NalezKontroly[] = [];

  if (!stranky.length) {
    nalezy.push({
      kluc: "stranka:ziadna", nazov: "Stránky na kontrolu",
      stav: "varovanie",
      detail: "kontrola nedostala ani jednu stránku, takže sa nemeralo nič — zoznam adries je prázdny alebo sa nepodarilo prečítať",
    });
  }
  for (const o of stranky) nalezy.push(skontrolujStrankuZivot(o, medze));

  if (!sitemapy.length) {
    nalezy.push({
      kluc: "sitemap:ziadna", nazov: "Sitemapy",
      stav: "varovanie",
      detail: "kontrola nedostala ani jednu sitemapu — či z webu Kokpit ešte vie prečítať obsah, sa týmto behom nezistilo",
    });
  }
  for (const o of sitemapy) nalezy.push(skontrolujSitemapu(o));

  return zlucPodlaKluca(nalezy);
}

const TVRDOST: Record<NalezKontroly["stav"], number> = { ok: 0, varovanie: 1, chyba: 2 };

/**
 * Dva nálezy s tým istým kľúčom zlúči do jedného.
 *
 * Primárny kľúč tabuľky je `beh|kluc`, takže druhý riadok s tým istým kľúčom
 * by ten prvý PREPÍSAL a nález by zmizol — a to je presne ten druh tichej
 * straty, pre ktorú celá kontrola vznikla. Stáva sa to vtedy, keď v zozname
 * adries stojí tá istá cesta dvakrát (raz s parametrom, raz bez). Rozlišovať
 * ich príveskom v kľúči sa NESMIE: kľúč musí byť medzi behmi rovnaký, inak sa
 * nedá povedať, odkedy to nefunguje.
 */
function zlucPodlaKluca(nalezy: NalezKontroly[]): NalezKontroly[] {
  const podlaKluca = new Map<string, NalezKontroly>();
  for (const n of nalezy) {
    const uz = podlaKluca.get(n.kluc);
    if (!uz) { podlaKluca.set(n.kluc, n); continue; }
    podlaKluca.set(n.kluc, {
      kluc: n.kluc,
      nazov: uz.nazov,
      stav: TVRDOST[n.stav] > TVRDOST[uz.stav] ? n.stav : uz.stav,
      detail: uz.detail === n.detail ? uz.detail : `${uz.detail} · (druhé meranie tej istej adresy) ${n.detail}`,
    });
  }
  return [...podlaKluca.values()];
}

// ─── Sťahovanie ──────────────────────────────────────────────────────────────
//
// Oddelené od kontroly, aby sa pravidlá dali testovať bez siete. `fetch` je
// parameter, nie globál — s globálom by test musel prepisovať `globalThis`
// a dva testy naraz by si liezli do cesty.

export type OdpovedSiete = { status: number; url?: string; text: () => Promise<string> };
export type Nacitaj = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<OdpovedSiete>;

export type MoznostiStahovania = {
  /** Hlavička user-agent — nech sa dá v logoch hostingu kontrola rozoznať. */
  ua?: string;
  /** Časový limit jednej žiadosti v ms. */
  timeoutMs?: number;
  /**
   * Pridať jednorazový parameter do adresy a obísť tak keš.
   *
   * Predvolene VYPNUTÉ: otázka bodu 2 je „čo dostane návštevník“, a to je
   * práve kešovaná kópia. Vynútené obídenie kešu by navyše meralo čas
   * generovania stránky, nie čas, ktorý čaká človek. Import obsahu webu to
   * má naopak zapnuté — jeho otázka je „čo je na webe teraz“.
   */
  bezKese?: boolean;
  /** Nechať si celé telo v odpovedi (sitemapy áno, veľké stránky netreba). */
  drzatTelo?: boolean;
};

const UA = "Mozilla/5.0 (compatible; KokpitKontrola/1.0; +https://prosapiens.cz)";

/**
 * Stiahne jednu adresu a zmeria ju. NIKDY nevyhodí výnimku — dôvod zlyhania
 * je tu údaj (`chyba`), nie pád. Jeden nedostupný obrázok nesmie zhodiť celú
 * nočnú kontrolu; to isté urobil kalendár, keď sa dva behy spojili do jedného.
 */
export async function stiahniStranku(
  url: string,
  nacitaj: Nacitaj,
  moznosti: MoznostiStahovania = {},
): Promise<OdpovedStranky> {
  const { ua = UA, timeoutMs = 20000, bezKese = false, drzatTelo = true } = moznosti;
  const adresa = bezKese
    ? `${url}${url.includes("?") ? "&" : "?"}_psb=${Date.now().toString(36)}`
    : url;
  const zac = Date.now();
  try {
    const r = await nacitaj(adresa, {
      headers: { "user-agent": ua },
      // Časový limit musí byť: Worker má vlastný strop a bez limitu by jedna
      // zaseknutá stránka zhodila aj kontroly, ktoré sa k slovu nedostali.
      signal: AbortSignal.timeout(timeoutMs),
    });
    const telo = await r.text();
    // Čas sa meria až po dočítaní tela — návštevník čaká na to isté. Samotné
    // hlavičky prídu aj z 7,6 MB stránky rýchlo, takže merať len ich by
    // o septembrovej pristávacej stránke nepovedalo nič.
    const trvanieMs = Date.now() - zac;
    return {
      url,
      stav: r.status,
      // Konečná adresa sa NEDOMÝŠĽA. `url` je v `OdpovedSiete` nepovinné,
      // takže odpoveď bez nej je dovolený vstup — a dosadiť do nej adresu,
      // ktorú sme si vyžiadali, by znamenalo vyrobiť si zhodu: `cielSedi` by
      // ohlásil „v poriadku“ o presmerovaní, o ktorom nevie nič, čiže práve
      // o prelepení zástupnou stránkou WordPressu, pre ktoré modul vznikol.
      // Prázdno je tu „neviem“ a `cielSedi` z neho urobí varovanie — pri
      // sťahovaní s `bezKese` sa tým nič nepokazí, lebo keď konečná adresa
      // príde, `tenIstyCiel` jednorazový parameter aj tak odreže.
      konecnaUrl: r.url || undefined,
      telo: drzatTelo ? telo : undefined,
      // Veľkosť sa berie z tela, nie z hlavičky content-length: tá nesie
      // zabalenú (gzip) veľkosť a 7,6 MB stránka v nej vypadá ako pol mega.
      bajtov: bajtyTextu(telo),
      trvanieMs,
      ukazka: telo.replace(/\s+/g, " ").trim().slice(0, 200),
    };
  } catch (e) {
    const trvanieMs = Date.now() - zac;
    const dovod = String(e instanceof Error ? e.message : e).slice(0, 200);
    return {
      url, stav: 0, trvanieMs,
      chyba: /abort|timeout|timed out/i.test(dovod)
        ? `odpoveď neprišla do ${Math.round(timeoutMs / 1000)} s (${dovod})`
        : dovod,
    };
  }
}

/**
 * Stiahne adresy JEDNU PO DRUHEJ.
 *
 * Nie `Promise.all`: Worker má strop na počet súbežných podžiadostí a hlavne
 * by sa súbežnými žiadosťami pokazilo meranie času — pätica naraz si navzájom
 * predĺži odpoveď a kontrola by hlásila pomalé stránky, ktoré pomalé nie sú.
 */
export async function stiahniStranky(
  adresy: string[],
  nacitaj: Nacitaj,
  moznosti: MoznostiStahovania = {},
): Promise<OdpovedStranky[]> {
  const von: OdpovedStranky[] = [];
  for (const a of adresy) von.push(await stiahniStranku(a, nacitaj, moznosti));
  return von;
}

/**
 * Adresy sitemáp pre daný základ webu. Mená sú parameter, ale predvolená
 * dvojica je tá, ktorú naozaj čita import obsahu — keby sa tu vymyslela
 * vlastná, kontrola by hliadkovala nad súborom, ktorý nikto nepoužíva.
 */
export function adresySitemap(zaklad: string, mena: string[] = SITEMAPY): string[] {
  const z = String(zaklad ?? "").trim();
  if (!z) return [];
  const koren = z.replace(/\/+$/, "");
  return mena.map((m) => `${koren}/${String(m).replace(/^\/+/, "")}`);
}
