/**
 * Čítanie textu z vlastného webu a jeho spojenie so Search Console.
 *
 * PREČO SÚ TIETO FUNKCIE ODDELENÉ OD ROUTE
 *
 * Vytiahnuť titulok z HTML je presne ten druh práce, ktorá funguje na deviatich
 * stránkach a na desiatej vráti prázdno alebo pol šablóny — a nikto si to
 * nevšimne, lebo prázdny titulok vyzerá ako stránka bez titulku. Preto sú tu
 * s testami.
 *
 * ČO Z TOHO NAKONIEC MÁ CENU
 *
 * Nie ten text sám. Cenu má `prilezitostiTitulkov()`: spojí zobrazenia zo
 * Search Console s tým, čo v tom výsledku ľudia naozaj čítajú. Dovtedy sa dalo
 * povedať len „15 777 zobrazení, 97 klikov" — čo je číslo bez akcie.
 */

export type WebStranka = {
  url: string; typ: string; titulok: string; metaPopis: string;
  h1: string; text: string; znakov: number; zmenene?: string;
};

export type GscStrana = { url: string; zobrazenia: number; kliky: number };

/**
 * Adresa na spárovanie. Search Console aj sitemapa dávajú plnú adresu
 * s lomkou na konci, ale spoliehať sa na to je hazard: jedna chýbajúca lomka
 * a spojenie mlčky nenájde nič — a prázdny výsledok nie je dôkaz.
 */
export function normUrl(u: string): string {
  const t = String(u || "").trim();
  if (!t) return "";
  return t.replace(/^http:/i, "https:").replace(/\/+$/, "").toLowerCase();
}

/** Adresy zo sitemapy (aj z indexu — oboje má rovnaký tvar `<loc>`). */
export function sitemapUrls(xml: string): string[] {
  return sitemapZapisy(xml).map((z) => z.url);
}

export type SitemapZapis = { url: string; zmenene: string };

/**
 * Adresa spolu s `lastmod`.
 *
 * PREČO SA TO ČÍTA
 *
 * Bez `lastmod` sa nedá poznať, že Jerry stránku upravil — tabuľka by držala
 * starú kópiu textu a Jarvis by navrhoval prepísať titulok, ktorý je už
 * prepísaný. WordPress `lastmod` pri úprave posúva sám, takže je to jediný
 * signál, ktorý netreba nikomu pamätať. Prvá verzia tohto importu ho ignorovala
 * a riešila to tlačidlom „prečítať odznova" — čo bola práca prehodená na
 * človeka za niečo, čo appka vie sama.
 */
export function sitemapZapisy(xml: string): SitemapZapis[] {
  const von: SitemapZapis[] = [];
  // Blok `<url>…</url>` naraz, aby lastmod patril k správnej adrese —
  // dva samostatné vzory by sa pri stránke bez lastmod rozišli o jeden riadok.
  const re = /<(?:url|sitemap)\b[^>]*>([\s\S]*?)<\/(?:url|sitemap)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(xml || "")))) {
    const blok = m[1];
    const u = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(blok);
    if (!u) continue;
    const l = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(blok);
    von.push({ url: u[1], zmenene: l ? l[1] : "" });
  }
  return von;
}

const medzery = (s: string) => s.replace(/\s+/g, " ").trim();

/** Odstráni HTML entity, ktoré by v texte inak zostali ako `&nbsp;`. */
function entity(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function titulokZHtml(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || "");
  return m ? medzery(entity(m[1])) : "";
}

export function metaPopisZHtml(html: string): string {
  // Poradie atribútov v značke nie je dané, takže sa hľadá značka a v nej obe
  // časti — nie jeden pevný vzor, ktorý pri opačnom poradí nenájde nič.
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || ""))) {
    const tag = m[0];
    if (!/name\s*=\s*["']?description["']?/i.test(tag)) continue;
    const c = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    if (c) return medzery(entity(c[1] ?? c[2] ?? ""));
  }
  return "";
}

export function h1ZHtml(html: string): string {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html || "");
  return m ? medzery(entity(m[1].replace(/<[^>]+>/g, " "))) : "";
}

/**
 * Čitateľný text stránky.
 *
 * Skripty, štýly a `<noscript>` sa musia vyhodiť VRÁTANE obsahu — inak sa do
 * textu dostane JavaScript a Jarvis by v ňom hľadal Jerryho vetu.
 */
export function textZHtml(html: string, strop = 20000): string {
  const bez = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Blokové značky nahradiť medzerou, inak sa slová z dvoch odstavcov zlepia.
    .replace(/<\/?(p|div|br|li|tr|h[1-6]|section|article|header|footer|nav)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const t = entity(bez).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > strop ? t.slice(0, strop) : t;
}

/** Typ podľa toho, z ktorej sitemapy adresa prišla. */
export function typZoSitemapy(sitemapUrl: string): string {
  // Lomka na začiatku je nepovinná. Volajúci posiela holý názov súboru
  // („post-sitemap.xml"), nie celú adresu — a kým to regex vyžadoval,
  // vracal prázdny reťazec pri KAŽDEJ stránke. Dôsledok: appka roky nevedela
  // rozlíšiť článok od stránky, takže karta „Pripomeň na Instagrame" ponúkla
  // ako najlepší článok domovskú stránku (17. 8. 2026).
  if (/(^|\/)page-sitemap/i.test(sitemapUrl)) return "stranka";
  if (/(^|\/)post-sitemap/i.test(sitemapUrl)) return "clanok";
  return "";
}

export type ChybaStranky = { url: string; druh: string; detail: string };

/**
 * Technické chyby, ktoré sa dajú nájsť v texte, čo už v tabuľke leží.
 *
 * PREČO SA NA TO NEPOUŽÍVA ŽIADNY SEO NÁSTROJ
 *
 * Toto je presne to, čo platené SEO nástroje predávajú ako „audit" — a čo sa
 * z importovaného textu spočíta bez jedinej ďalšej služby. Nie je to celý
 * audit; je to tá časť, ktorá sa dá overiť z vlastných dát a má akciu.
 *
 * Prahy nie sú náhodné:
 *  - 60 znakov: Google titulok nad túto dĺžku vo výsledkoch odsekne. Vetu si
 *    prečíta človek do polovice a rozhodne sa podľa nej.
 *  - 160 znakov: to isté pri popise.
 *  - 300 znakov textu: pod tým stránka nemá o čom byť. Nie je to pravidlo
 *    Googlu, je to zdravý rozum — a preto sa hlási ako „skontroluj", nie „zle".
 *
 * Duplicitný titulok je najhorší z tých nálezov: dve stránky si vo výsledkoch
 * konkurujú a Google si vyberie, ktorú ukáže. To rozhodnutie sa dá vziať späť
 * jednou vetou.
 */
export function chybyNaStrankach(stranky: WebStranka[]): ChybaStranky[] {
  const von: ChybaStranky[] = [];
  const precitane = stranky.filter((s) => s.titulok || s.znakov > 0);

  const podlaTitulku = new Map<string, string[]>();
  for (const s of precitane) {
    const t = s.titulok.trim().toLowerCase();
    if (!t) continue;
    podlaTitulku.set(t, [...(podlaTitulku.get(t) || []), s.url]);
  }
  for (const [t, urly] of podlaTitulku) {
    if (urly.length < 2) continue;
    for (const u of urly) {
      von.push({
        url: u, druh: "duplicitný titulok",
        detail: `„${t}“ má ${urly.length} stránky — Google si vyberie, ktorú ukáže, a to rozhodnutie robí zaňho niekto iný`,
      });
    }
  }

  for (const s of precitane) {
    if (!s.titulok) {
      von.push({ url: s.url, druh: "chýba titulok", detail: "vo výsledkoch Googlu sa zobrazí, čo si Google vyberie sám" });
    } else if (s.titulok.length > 60) {
      von.push({ url: s.url, druh: "dlhý titulok", detail: `${s.titulok.length} znakov — Google odsekne, viditeľné bude „${s.titulok.slice(0, 60)}…“` });
    }
    if (!s.metaPopis) {
      von.push({ url: s.url, druh: "chýba popis", detail: "druhý riadok vo výsledkoch si Google zloží sám z textu stránky" });
    } else if (s.metaPopis.length > 160) {
      von.push({ url: s.url, druh: "dlhý popis", detail: `${s.metaPopis.length} znakov, odsekne sa na 160` });
    }
    if (s.znakov > 0 && s.znakov < 300) {
      von.push({ url: s.url, druh: "málo textu", detail: `${s.znakov} znakov — skontroluj, či stránka má o čom byť` });
    }
    if (s.titulok && s.h1 && s.titulok.toLowerCase() === s.h1.toLowerCase()) {
      // Nie chyba, ale premárnené miesto: titulok je pre vyhľadávanie,
      // nadpis pre človeka, ktorý už na stránke je. Môžu hovoriť dve veci.
      von.push({ url: s.url, druh: "titulok = nadpis", detail: "dve miesta na dve rôzne vety, použité na jednu" });
    }
  }

  const poradie = ["duplicitný titulok", "chýba titulok", "chýba popis", "dlhý titulok", "dlhý popis", "málo textu", "titulok = nadpis"];
  return von.sort((a, b) => poradie.indexOf(a.druh) - poradie.indexOf(b.druh));
}

export type PrilezitostTitulku = {
  url: string; titulok: string; metaPopis: string;
  zobrazenia: number; kliky: number; ctr: number;
};

/**
 * Stránky, ktoré Google ukazuje a nikto na ne neklikne — s ich SÚČASNÝM
 * titulkom, aby sa dalo povedať, čo prepísať.
 *
 * PREČO PRÁVE TAKTO
 *
 * Samotné „veľa zobrazení, málo klikov" je polovica informácie: bez titulku sa
 * nedá povedať, čo je zle. A bez porovnania s ostatnými stránkami sa nedá
 * povedať, či 0,6 % je málo — preto sa CTR meria proti mediánu webu, nie proti
 * číslu vytiahnutému z klobúka.
 *
 * `DOST_ZOBRAZENI` je tam preto, že pri dvesto zobrazeniach je nízke CTR šum.
 */
const DOST_ZOBRAZENI = 1000;
const VYRAZNE_HORSIE = 0.5;   // polovica mediánu webu a menej

export function prilezitostiTitulkov(
  stranky: WebStranka[],
  gsc: GscStrana[],
  limit = 12,
): PrilezitostTitulku[] {
  const podlaUrl = new Map(stranky.map((s) => [normUrl(s.url), s]));
  const sCtr = gsc
    .filter((g) => g.zobrazenia > 0)
    .map((g) => ({ ...g, ctr: g.kliky / g.zobrazenia }));
  if (sCtr.length < 4) return [];

  const zoradene = [...sCtr].map((x) => x.ctr).sort((a, b) => a - b);
  const median = zoradene[Math.floor(zoradene.length / 2)];
  if (!(median > 0)) return [];

  const von: PrilezitostTitulku[] = [];
  for (const g of sCtr) {
    if (g.zobrazenia < DOST_ZOBRAZENI) continue;
    if (g.ctr > median * VYRAZNE_HORSIE) continue;
    const s = podlaUrl.get(normUrl(g.url));
    // Bez titulku je to znova len číslo — taký riadok sem nepatrí.
    if (!s || !s.titulok) continue;
    von.push({
      url: g.url, titulok: s.titulok, metaPopis: s.metaPopis,
      zobrazenia: g.zobrazenia, kliky: g.kliky,
      ctr: Math.round(g.ctr * 10000) / 100,
    });
  }
  return von.sort((a, b) => b.zobrazenia - a.zobrazenia).slice(0, limit);
}

/**
 * Adresa článku podľa jeho názvu.
 *
 * Rebríček najčítanejších článkov (z GA4) nesie len názov a počet zobrazení —
 * adresu nie. Jarvis tak 17. 8. 2026 vymenoval tri články bez jediného odkazu,
 * a správne: vymyslieť adresu je horšie než ju nedať. Titulky vo web_stranky
 * majú na konci značku („… - ProSapiens Biomechanic"), preto sa porovnáva
 * začiatok, nie celá zhoda.
 */
export function najdiAdresuPodlaTitulku(
  stranky: { url: string; titulok: string }[],
  nazov: string,
): string | null {
  const norm = (x: string) =>
    (x || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      .replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const n = norm(nazov);
  if (!n) return null;
  // Keď v názve už je adresa (GA4 vracia cesty), stačí ju vrátiť.
  if (/^https?:\/\//i.test(nazov.trim())) return nazov.trim();
  const presna = stranky.find((s) => norm(s.titulok) === n);
  if (presna) return presna.url;
  const zaciatok = stranky.filter((s) => norm(s.titulok).startsWith(n));
  // Pri dvoch kandidátoch radšej nič — falošný odkaz je horší než žiadny.
  return zaciatok.length === 1 ? zaciatok[0].url : null;
}

/**
 * Ktoré adresy v databáze už web nemá.
 *
 * Sitemapa je pravda o tom, čo web obsahuje. Keď Jerry stránku zruší, zmizne
 * zo sitemapy — ale v `web_stranky` po nej zostal riadok navždy. 17. 8. 2026
 * tak appka hlásila „chýba 2" donekonečna a dve mŕtve adresy sa ťahali do
 * každej dávky: `skupinovy-trenink` a `lekce-fascialni-svoboda`, obe zrušené
 * projekty, obe vracajúce 404.
 *
 * MAZAŤ SA SMIE LEN PRI ÚPLNOM ČÍTANÍ. Keď sa čo i len jedna sitemapa
 * nestiahne, jej stránky by vyzerali ako zrušené a zmizol by z appky text
 * polovice webu. Preto `uplne` — bez neho sa nemaže nič.
 */
/** Podiel riadkov, nad ktorý sa mazanie odmietne ako podozrivé. */
const STROP_MAZANIA = 0.3;

export function naZmazanie(vDb: string[], vSitemape: string[], uplne: boolean): string[] {
  if (!uplne || !vSitemape.length) return [];
  // Porovnáva sa aj bez „www." — `normUrl` ho zámerne necháva (spája sa cez
  // neho so Search Console), ale keby WordPress raz vypísal sitemapu bez neho,
  // vyzeral by celý web ako zrušený.
  const kluc = (u: string) => normUrl(u).replace("://www.", "://");
  const je = new Set(vSitemape.map(kluc));
  const von = vDb.filter((u) => !je.has(kluc(u)));
  // Poistka na nešťastie: keď sa má zmazať tretina webu a viac, niečo je
  // inak, než si myslíme — radšej nechať dve mŕtve adresy než prísť o text
  // päťdesiatich stránok, ktorý sa sťahoval polhodinu.
  if (vDb.length && von.length / vDb.length > STROP_MAZANIA) return [];
  return von;
}
