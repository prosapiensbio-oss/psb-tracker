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
  if (/\/page-sitemap/i.test(sitemapUrl)) return "stranka";
  if (/\/post-sitemap/i.test(sitemapUrl)) return "clanok";
  return "";
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
