/**
 * ANONYMNÝ DOTAZNÍK O PROSAPIENS — otázky, rozobratie formulára a výsledky.
 *
 * Jerry, 6. 10. 2026 („ok, všetko mi sedí"): varianta B — osobný odkaz len
 * na „vyplniť raz", odpovede uložené ODDELENE bez väzby na odkaz, čas len
 * deň, výsledky až od piatich odpovedí, pri textových otázkach upozornenie
 * na spoznateľnosť. Hlasovanie o funkciách Jerry ZAMIETOL („ľudia volia to,
 * čo znie dobre" a „hlasovanie je sľub") — preto tu nie je.
 *
 * Čisté funkcie: stránka (`dotaznikStranka.ts`), server (`d.$token.tsx`,
 * `/api/dotaznik`) aj obrazovka výsledkov čítajú tie isté otázky.
 */

export type OtazkaDotazniku =
  | { id: string; druh: "skala"; text: string; od: number; do: number; vlavo: string; vpravo: string }
  | { id: string; druh: "vyber"; text: string; moznosti: { id: string; text: string }[]; najviac: number }
  | { id: string; druh: "text"; text: string; nepovinne?: boolean };

/** Výsledky sa ukazujú až od tohto počtu — prvá odpoveď by bola skoro podpísaná. */
export const MIN_ODPOVEDI = 5;

export const OTAZKY: OtazkaDotazniku[] = [
  { id: "nps", druh: "skala", text: "Jak pravděpodobné je, že byste nás doporučil(a) známému?", od: 0, do: 10, vlavo: "vůbec", vpravo: "určitě" },
  {
    id: "hodnota", druh: "vyber", najviac: 2,
    text: "Co je pro vás na tréninku nejcennější? (vyberte nejvýš dvě)",
    moznosti: [
      { id: "ulava", text: "úleva od bolesti" },
      { id: "vysvetlenie", text: "vysvětlení, proč to bolí" },
      { id: "pristup", text: "individuální přístup" },
      { id: "atmosfera", text: "atmosféra" },
      { id: "pohyb", text: "výsledky v pohybu" },
      { id: "ine", text: "něco jiného" },
    ],
  },
  { id: "komunikacia", druh: "skala", text: "Jak hodnotíte komunikaci mimo tréninky (SMS, termíny, platby)?", od: 1, do: 5, vlavo: "špatně", vpravo: "výborně" },
  { id: "cena", druh: "skala", text: "Cena odpovídá tomu, co dostávám.", od: 1, do: 5, vlavo: "nesouhlasím", vpravo: "souhlasím" },
  { id: "prostredie", druh: "skala", text: "Jak hodnotíte prostředí studia?", od: 1, do: 5, vlavo: "špatně", vpravo: "výborně" },
  { id: "zmena", druh: "text", text: "Kdybyste mohl(a) změnit jednu věc, co by to bylo?" },
  { id: "odkaz", druh: "text", text: "Je něco, co byste nám chtěl(a) říct?", nepovinne: true },
];

export type OdpovedDotazniku = Record<string, number | string | string[]>;

/**
 * Z formulára (URLSearchParams) na odpoveď. Neplatné hodnoty sa zahodia —
 * nie chyba, len prázdna otázka (každá je nepovinná). Text je orezaný na
 * 1 000 znakov; výber nanajvýš toľko, koľko otázka dovoľuje.
 */
export function rozoberFormular(f: URLSearchParams): OdpovedDotazniku {
  const o: OdpovedDotazniku = {};
  for (const q of OTAZKY) {
    if (q.druh === "skala") {
      const raw = f.get(q.id);
      const n = raw === null || raw === "" ? NaN : Number(raw);
      if (Number.isInteger(n) && n >= q.od && n <= q.do) o[q.id] = n;
    } else if (q.druh === "vyber") {
      const platne = new Set(q.moznosti.map((m) => m.id));
      const v = [...new Set(f.getAll(q.id).filter((x) => platne.has(x)))].slice(0, q.najviac);
      if (v.length) o[q.id] = v;
    } else {
      const t = String(f.get(q.id) || "").trim().slice(0, 1000);
      if (t) o[q.id] = t;
    }
  }
  return o;
}

export const jePrazdna = (o: OdpovedDotazniku) => Object.keys(o).length === 0;

export type VysledkyDotazniku = {
  pocet: number;
  /** Pod `MIN_ODPOVEDI` sa nič iné nevracia — ani priemery, ani texty. */
  skryte: boolean;
  /** NPS: % propagátorov (9–10) mínus % kritikov (0–6), a priemer. */
  nps?: { skore: number; priemer: number; odpovedi: number; propagatori: number; pasivni: number; kritici: number };
  skaly: { id: string; text: string; priemer: number; odpovedi: number; rozdelenie: number[] }[];
  vybery: { id: string; text: string; moznosti: { text: string; pocet: number }[]; odpovedi: number }[];
  texty: { id: string; text: string; odpovede: string[] }[];
};

/** Texty sa miešajú, aby poradie neprezrádzalo, kto odpovedal kedy. */
function zamiesaj<T>(a: T[], seed: number): T[] {
  const x = [...a];
  let s = seed || 1;
  for (let i = x.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

export function vysledkyDotazniku(odpovede: OdpovedDotazniku[]): VysledkyDotazniku {
  const pocet = odpovede.length;
  if (pocet < MIN_ODPOVEDI) return { pocet, skryte: true, skaly: [], vybery: [], texty: [] };
  const out: VysledkyDotazniku = { pocet, skryte: false, skaly: [], vybery: [], texty: [] };
  for (const q of OTAZKY) {
    if (q.druh === "skala") {
      const h = odpovede.map((o) => o[q.id]).filter((v): v is number => typeof v === "number");
      const rozdelenie = Array.from({ length: q.do - q.od + 1 }, (_, i) => h.filter((v) => v === q.od + i).length);
      const priemer = h.length ? Math.round((h.reduce((a, v) => a + v, 0) / h.length) * 10) / 10 : 0;
      if (q.id === "nps" && h.length) {
        const p = h.filter((v) => v >= 9).length, k = h.filter((v) => v <= 6).length;
        out.nps = { skore: Math.round(((p - k) / h.length) * 100), priemer, odpovedi: h.length, propagatori: p, pasivni: h.length - p - k, kritici: k };
      } else {
        out.skaly.push({ id: q.id, text: q.text, priemer, odpovedi: h.length, rozdelenie });
      }
    } else if (q.druh === "vyber") {
      const h = odpovede.map((o) => o[q.id]).filter((v): v is string[] => Array.isArray(v));
      out.vybery.push({
        id: q.id, text: q.text, odpovedi: h.length,
        moznosti: q.moznosti.map((m) => ({ text: m.text, pocet: h.filter((v) => v.includes(m.id)).length })).sort((a, b) => b.pocet - a.pocet),
      });
    } else {
      const t = odpovede.map((o) => o[q.id]).filter((v): v is string => typeof v === "string" && !!v.trim());
      out.texty.push({ id: q.id, text: q.text, odpovede: zamiesaj(t, pocet * 7919) });
    }
  }
  return out;
}
