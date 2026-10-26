/**
 * ZDRAVIE KOKPITU — kontrola APPKY, nie dát.
 *
 * Jerry, 10. 10. 2026: „kontrolu si predstavujem ako kontrolu appky celkovo —
 * či všetko funguje, či je všetko správne prepojené, či grafy ukazujú správne
 * a či niekde nie je chyba v kóde. Tá kontrola, o ktorej sa bavíme, mi príde
 * nadbytočná." Mal pravdu v oboch poloviciach: mesačné kontroly vznikli, keď
 * bol PTminder pravda a Kokpit nováčik, a väčšinu z toho, na čo sa pýtali,
 * dnes robí register priebežne.
 *
 * Toto je to druhé. Tri otázky, na ktoré sa appka vie spýtať sama seba:
 *
 *   1 · BEŽIA AUTOMATY? Desať nočných úloh; kým sa nezačali zapisovať
 *       (10. 10. 2026), stav mali dve z nich a zvyšok mohol mlčky nebežať.
 *   2 · SPADLO NIEČO ĽUĎOM V PREHLIADAČI? `chyba-prehliadaca` v audite —
 *       predtým o páde vedela len obrazovka toho telefónu.
 *   3 · ROZCHÁDZAJÚ SA DVA ZDROJE O TOM ISTOM? Balíčky, dochádzka a platby
 *       majú vlastné porovnania; keď sa rozídu, niečo je zle prepojené.
 *
 * Pravidlo zostáva: chýbajúci zdroj je „neviem", nie „v poriadku".
 */

export type StavZdravia = "ok" | "pozor" | "nevie";
export type RiadokZdravia = { nazov: string; hodnota: string; stav: StavZdravia; detail?: string };
export type SekciaZdravia = { nadpis: string; riadky: RiadokZdravia[]; stav: StavZdravia };

export type BehAutomatu = {
  automat: string;
  kedy: string;
  ok: number | boolean;
  detail?: string | null;
  chyba?: string | null;
  poslednyOk?: string | null;
};

export type VstupZdravia = {
  /** Teraz (ISO) — testy ho dodávajú, appka berie skutočný čas. */
  teraz: string;
  behy: BehAutomatu[];
  /** Pády v prehliadači za posledných 7 dní. */
  chybyPrehliadaca: { kedy: string; sprava: string }[];
  /** Rozdiely medzi dvoma zdrojmi o tom istom. */
  rozpory: { nazov: string; pocet: number | null; detail?: string }[];
};

/** Ako sa volajú automaty pre človeka. */
export const MENA_AUTOMATOV: Record<string, string> = {
  "kalendar": "Snímka kalendára",
  "push": "Notifikácie na telefón",
  "ranne-push": "Ranná dávka",
  "mail-dopyty": "Dopyty z pošty",
  "metricool": "Metricool",
  "text-webu": "Text webu",
  "novinky-algoritmy": "Novinky v algoritmoch",
  "kontrola-webu-formulare": "Kontrola webu — formuláre",
  "kontrola-webu-stranky": "Kontrola webu — stránky",
  "kontrola-webu-meranie": "Kontrola webu — meranie",
  "kontrola-webu-reklamy": "Kontrola webu — reklamy",
  "meta-kampane": "Meta — kampane",
  "meta-reklamy": "Meta — reklamy",
  "meta-dozor": "Meta — dozor",
  "fio-banka": "Banka — pohyby z Fio",
  "strazca-vyberu": "Strážca výberov (Peniaze manažér)",
};

/** Všetky automaty, ktoré majú bežať — aby bolo vidieť aj TIE, ktoré mlčia. */
export const OCAKAVANE_AUTOMATY = Object.keys(MENA_AUTOMATOV);

const hodiny = (od: string, teraz: string): number | null => {
  const a = Date.parse(od);
  const b = Date.parse(teraz);
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 3600000 : null;
};

export const vek = (h: number): string =>
  h < 1 ? "pred chvíľou" : h < 24 ? `pred ${Math.round(h)} h` : `pred ${Math.round(h / 24)} dňami`;

/**
 * Automat sa posudzuje podľa POSLEDNÉHO ÚSPECHU, nie podľa poslednej chyby.
 *
 * Jedna chyba nie je rozbitý automat — poštový server vie odmietnuť správne
 * heslo a o hodinu ho vziať. Rozbitý je vtedy, keď neprešiel DVA dni, alebo
 * keď o ňom appka nevie vôbec.
 */
export function stavAutomatu(b: BehAutomatu | undefined, teraz: string): RiadokZdravia["stav"] {
  if (!b) return "nevie";
  const odUspechu = b.poslednyOk ? hodiny(b.poslednyOk, teraz) : null;
  if (odUspechu === null) return "pozor";
  if (odUspechu > 48) return "pozor";
  return "ok";
}

export function sekciaAutomatov(v: VstupZdravia): SekciaZdravia {
  const podla = new Map(v.behy.map((b) => [b.automat, b]));
  const riadky: RiadokZdravia[] = OCAKAVANE_AUTOMATY.map((id) => {
    const b = podla.get(id);
    const stav = stavAutomatu(b, v.teraz);
    const h = b?.poslednyOk ? hodiny(b.poslednyOk, v.teraz) : null;
    return {
      nazov: MENA_AUTOMATOV[id] || id,
      hodnota: !b ? "appka o ňom zatiaľ nevie" : h === null ? "ani raz neprešiel" : vek(h),
      stav,
      detail: b && !(b.ok === 1 || b.ok === true) ? String(b.chyba || b.detail || "").slice(0, 160) : undefined,
    };
  });
  return { nadpis: "Bežia automaty?", riadky, stav: spolu(riadky) };
}

export function sekciaChyb(v: VstupZdravia): SekciaZdravia {
  const n = v.chybyPrehliadaca.length;
  const riadky: RiadokZdravia[] = [{
    nazov: "Pády v prehliadači (7 dní)",
    hodnota: n === 0 ? "žiadny" : `${n}`,
    stav: n === 0 ? "ok" : "pozor",
    detail: n ? v.chybyPrehliadaca.slice(0, 3).map((c) => `${c.kedy.slice(0, 16)} · ${c.sprava}`).join(" | ") : undefined,
  }];
  return { nadpis: "Spadlo niečo?", riadky, stav: spolu(riadky) };
}

export function sekciaRozporov(v: VstupZdravia): SekciaZdravia {
  const riadky: RiadokZdravia[] = v.rozpory.map((r) => ({
    nazov: r.nazov,
    hodnota: r.pocet === null ? "neporovnané" : r.pocet === 0 ? "sedí" : `${r.pocet} nesedí`,
    stav: r.pocet === null ? "nevie" : r.pocet === 0 ? "ok" : "pozor",
    detail: r.detail,
  }));
  return { nadpis: "Sedia dva zdroje o tom istom?", riadky, stav: spolu(riadky) };
}

function spolu(r: RiadokZdravia[]): StavZdravia {
  if (r.some((x) => x.stav === "pozor")) return "pozor";
  if (r.some((x) => x.stav === "nevie")) return "nevie";
  return "ok";
}

export function zdravieKokpitu(v: VstupZdravia): SekciaZdravia[] {
  return [sekciaAutomatov(v), sekciaChyb(v), sekciaRozporov(v)];
}

/** Jedna veta do nadpisu karty. */
export function suhrnZdravia(sekcie: SekciaZdravia[]): { veta: string; stav: StavZdravia } {
  const zle = sekcie.flatMap((s) => s.riadky).filter((r) => r.stav === "pozor").length;
  const nevie = sekcie.flatMap((s) => s.riadky).filter((r) => r.stav === "nevie").length;
  if (zle) return { veta: `${zle} ${zle === 1 ? "vec potrebuje" : zle < 5 ? "veci potrebujú" : "vecí potrebuje"} pozornosť`, stav: "pozor" };
  if (nevie) return { veta: `${nevie} ${nevie === 1 ? "vec sa" : "vecí sa"} nedá posúdiť`, stav: "nevie" };
  return { veta: "všetko beží", stav: "ok" };
}
