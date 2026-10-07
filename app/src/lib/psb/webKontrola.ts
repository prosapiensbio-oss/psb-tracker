/**
 * Kontrola webu — či sa dá dopyt vôbec odoslať.
 *
 * PREČO TO VZNIKLO
 *
 * Od 23. 9. do 7. 10. 2026 sa test postury na prosapiens.cz NEDAL odoslať.
 * Vysádzaný formulár posielal do prepínača krátke „ano", kým Contact Form 7
 * mal v tom istom prepínači celú vetu („Ano, chci 15minutový hovor"), takže
 * sa nezačiarklo nič, pole bolo povinné a odoslanie padlo na validáciu. Chyba
 * sedela na SKRYTOM poli, takže človek videl len „Zkontrolujte vyplněná pole"
 * a nemal čo opraviť. Dva týždne reklamy viedli na web, kde jedna z dvoch
 * ciest k dopytu mlčky nefungovala, a zistilo sa to až ručným pokusom.
 *
 * Preto sa to kontroluje strojom, každú noc, a bez odosielania pošty: stačí
 * porovnať, čo formulár na obrazovke posiela, s tým, čo plugin žiada.
 *
 * ČO TU NIE JE A PREČO
 *
 * Nie je tu prehliadač. Stránka sa číta ako text — to stačí na otázku „sedia
 * polia?" a je to jediné, čo sa dá spoľahlivo spraviť vo Workeri. Otázka
 * „preklikne sa tam človek?" patrí do merania lievika (GA4), nie sem.
 */

/** Rovnaká normalizácia, akú používa most v téme (`holy` v formulare.js). */
export function holy(s: string): string {
  const t = String(s ?? "").toLowerCase().trim();
  return t.normalize ? t.normalize("NFD").replace(/[̀-ͯ]/g, "") : t;
}

export type Pole = {
  meno: string;
  typ: string;
  povinne: boolean;
  /** Hodnoty prepínača/zaškrtávadla; pri textovom poli prázdne. */
  hodnoty: string[];
};

export type NalezKontroly = {
  kluc: string;
  nazov: string;
  stav: "ok" | "chyba" | "varovanie";
  detail: string;
};

const znacky = (html: string, od: number, do_: number) => html.slice(od, do_ < 0 ? undefined : do_);

/** Atribút zo značky; zvláda jednoduché aj dvojité úvodzovky. */
function atr(tag: string, meno: string): string {
  const m = new RegExp(`${meno}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? "") : "";
}

/**
 * Polia z úseku HTML. Číta `input`, `textarea` aj `select`; pri prepínačoch
 * sa hodnoty zbierajú pod jedno meno, lebo tak sa aj odosielajú.
 */
export function polia(html: string): Pole[] {
  const out = new Map<string, Pole>();
  const re = /<(input|textarea|select)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[2];
    const meno = atr(tag, "name");
    if (!meno || meno.startsWith("_wpcf7")) continue;
    const typ = (m[1].toLowerCase() === "input" ? atr(tag, "type") || "text" : m[1].toLowerCase());
    const povinne = /\baria-required\s*=\s*["']true["']/i.test(tag)
      || /\brequired\b/i.test(tag)
      || /wpcf7-validates-as-required/i.test(tag);
    const e = out.get(meno) || { meno, typ, povinne: false, hodnoty: [] };
    e.povinne = e.povinne || povinne;
    if (typ === "radio" || typ === "checkbox") {
      const v = atr(tag, "value");
      if (v) e.hodnoty.push(v);
      e.typ = typ;
    }
    out.set(meno, e);
  }
  return [...out.values()];
}

/** Mapa polí z `formulare.js` — číta sa zo ŽIVÉHO súboru, nie z kópie tu. */
export function mapaPoli(js: string): Record<string, Record<string, string>> {
  const i = js.indexOf("var POLIA");
  if (i < 0) return {};
  const koniec = js.indexOf("};", i);
  const blok = znacky(js, i, koniec < 0 ? -1 : koniec);
  const out: Record<string, Record<string, string>> = {};
  const re = /(\w+)\s*:\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blok))) {
    const par: Record<string, string> = {};
    const re2 = /(\w+)\s*:\s*'([^']*)'/g;
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(m[2]))) par[m2[1]] = m2[2];
    out[m[1]] = par;
  }
  return out;
}

/**
 * Akým pravidlom most páruje hodnoty prepínačov — číta sa zo ŽIVÉHO súboru.
 *
 * Kontrola nesmie merať iným metrom, než akým meria web. Do 7. 10. 2026
 * porovnávala téma hodnoty PRESNE (`value === hodnota`) a práve na tom
 * padal test postury; od opravy páruje tolerantne (bez diakritiky, podľa
 * začiatku). Keby tu bolo natvrdo to tolerantné pravidlo a niekto by opravu
 * prepísal starou verziou témy, kontrola by naďalej hlásila „v poriadku".
 */
export function pravidloZhody(js: string): "tolerantne" | "presne" {
  return /function\s+holy\s*\(/.test(js) ? "tolerantne" : "presne";
}

/** Ktorá mapa sa na daný cieľ použije — rovnaké pravidlo ako `mapa()` v téme. */
export function mapaPreCiel(ciel: string, vsetky: Record<string, Record<string, string>>) {
  if (ciel.indexOf("forminator:") === 0) return { kluc: "forminator", mapa: vsetky.forminator || {} };
  const kluc = "cf7" + ciel.replace("cf7:", "");
  if (vsetky[kluc]) return { kluc, mapa: vsetky[kluc] };
  // Téma v tomto prípade ticho použije mapu kontaktného formulára. Keď na
  // stránke pribudne NOVÝ formulár s iným id, polia sa nenapĺňajú tými
  // správnymi menami a nikto sa to nedozvie — preto sa to hlási.
  return { kluc: "", mapa: vsetky.cf7127 || {} };
}

/** Polia, ktoré most dopĺňa sám (nie sú vo viditeľnom formulári). */
const DOPLNA_SAM: Record<string, string[]> = {
  "cf7:5111": ["psb-pain", "psb-posture", "psb-insight", "psb-gdpr"],
};
const SUHLAS = /acceptance|souhlas|gdpr|consent/i;

/**
 * Jedna stránka s formulárom. Vracia nález pripravený na zápis.
 *
 * `html` je celá stránka (hľadá sa v nej `form[data-form]` aj `#psb-skryte`),
 * `js` je obsah `formulare.js`.
 */
export function skontrolujStranku(url: string, html: string, js: string): NalezKontroly {
  const pravidlo = pravidloZhody(js);
  const kluc = `formular:${url.replace(/^https?:\/\/[^/]+/, "")}`;
  const nazov = `Formulár na ${url.replace(/^https?:\/\/[^/]+/, "")}`;
  const chyba = (detail: string): NalezKontroly => ({ kluc, nazov, stav: "chyba", detail });

  const iVid = html.search(/<form[^>]*\bdata-form\b/i);
  if (iVid < 0) return chyba("na stránke nie je vysádzaný formulár (form[data-form]) — buď zmizol, alebo sa zmenila adresa");
  const vidHtml = znacky(html, iVid, html.indexOf("</form>", iVid));

  const iSkr = html.indexOf('id="psb-skryte"');
  if (iSkr < 0) return chyba("chýba most na plugin (#psb-skryte) — formulár sa nemá cez čo odoslať");
  const skrHtml = znacky(html, iSkr, html.indexOf("</form>", html.indexOf("<form", iSkr)));
  const ciel = atr(znacky(html, iSkr - 120, html.indexOf(">", iSkr) + 1), "data-psb-ciel");
  if (!ciel) return chyba("skrytý formulár nemá data-psb-ciel — most nevie, kam hodnoty prepísať");

  const vid = polia(vidHtml);
  const skr = polia(skrHtml);
  if (!skr.length) return chyba(`skrytý formulár ${ciel} je prázdny — plugin na stránke nič nevykreslil`);

  const { kluc: klucMapy, mapa } = mapaPreCiel(ciel, mapaPoli(js));
  const problemy: string[] = [];
  if (!klucMapy) {
    problemy.push(`cieľ ${ciel} nemá v formulare.js vlastnú mapu polí — použije sa mapa kontaktného formulára a mená polí nemusia sedieť`);
  }

  // 1. Každé POVINNÉ pole pluginu musí mať, kto ho naplní.
  const doplnaSam = DOPLNA_SAM[ciel] || [];
  const naplnene = new Set<string>([...Object.values(mapa), ...doplnaSam]);
  for (const p of skr) {
    if (!p.povinne) continue;
    if (naplnene.has(p.meno)) continue;
    if ((p.typ === "checkbox") && SUHLAS.test(p.meno)) continue; // súhlasy most zaškrtne sám
    problemy.push(`povinné pole ${p.meno} (${p.typ}) nemá kto vyplniť — odoslanie padne na validáciu a človek uvidí len „Zkontrolujte vyplněná pole"`);
  }

  // 2. Prepínače musia mať zhodné hodnoty. Toto je chyba z 23. 9. 2026.
  for (const [nase, ich] of Object.entries(mapa)) {
    const z = vid.find((p) => p.meno === nase);
    const k = skr.find((p) => p.meno === ich);
    if (!z || !k) continue;
    if (z.typ !== "radio" && z.typ !== "checkbox") continue;
    if (!k.hodnoty.length) continue;
    const nesedia = z.hodnoty.filter((h) => !k.hodnoty.some((o) => {
      if (pravidlo === "presne") return o === h;
      const oo = holy(o), hh = holy(h);
      return oo === hh || oo.indexOf(hh) === 0 || hh.indexOf(oo) === 0;
    }));
    if (nesedia.length) {
      problemy.push(`prepínač ${nase} → ${ich}: hodnota „${nesedia.join("“, „")}“ nemá v plugine zhodnú možnosť (${k.hodnoty.join(" | ")})${k.povinne ? " a pole je POVINNÉ, takže formulár sa nedá odoslať" : ""}`);
    }
  }

  // 3. Čo viditeľný formulár zbiera, ale most to nikam nenesie.
  for (const p of vid) {
    if (!p.meno || mapa[p.meno] || p.typ === "submit" || p.typ === "hidden") continue;
    problemy.push(`pole ${p.meno} z obrazovky nemá v mape cieľ — čo doň človek napíše, sa stratí`);
  }

  if (!problemy.length) {
    return { kluc, nazov, stav: "ok", detail: `${ciel} · ${vid.length} polí na obrazovke, ${skr.length} v plugine, všetky povinné kryté, prepínače sa párujú ${pravidlo}` };
  }
  const tvrde = problemy.some((p) => !p.startsWith("cieľ "));
  return { kluc, nazov, stav: tvrde ? "chyba" : "varovanie", detail: problemy.join(" · ") };
}
