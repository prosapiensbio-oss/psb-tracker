import type { PdfRiadok } from "./pdftext";

// Rozpis faktúry na položky.
//
// Na jednom doklade z Alzy býva naraz granule pre psa, prostěradlo domov a
// niečo do štúdia — v banke z toho vidno jedinú sumu. Kým sa taká platba
// zaraďovala celá do jedného koša, buď sa štúdiu pripísalo, čo mu nepatrí,
// alebo naopak. Rozpis to rozdelí a bankový pohyb sa naň naviaže.
//
// Parser je zámerne skromný: dá najlepší odhad a človek ho v náhľade opraví —
// text aj čísla. Faktúry menia formát a tvrdiť, že sa vždy trafí, by bolo
// klamstvo, ktoré sa raz prejaví ako zlé číslo v P&L.

export type FakturaPolozka = {
  /** Kód dodávateľa, ak ho doklad má — nie je povinný. */
  kod: string;
  nazov: string;
  ks: number;
  /** Cena s DPH za celú položku. */
  cena: number;
  /** Kategória v P&L; prázdne = ešte nezaradené. */
  kategoria: string;
};

export type Faktura = {
  cislo: string;
  datum: string;      // ISO
  dodavatel: string;
  /** Celkom podľa dokladu — na kontrolu proti súčtu položiek. */
  celkom: number;
  polozky: FakturaPolozka[];
};

const cislo = (s: string): number => {
  const t = s.replace(/\s| /g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

const datumISO = (s: string): string => {
  const m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};

// Riadok položky končí chvostom čísel: ks, cena/ks bez DPH, cena bez DPH, DPH,
// DPH %, cena s DPH, záruka. Predposledné číslo je to, čo sa naozaj zaplatilo —
// a to je jediné, ktoré P&L zaujíma.
const CHVOST = /\s(\d+)\s+(-?[\d\s]+,\d{2})\s+(-?[\d\s]+,\d{2})\s+(-?[\d\s]+,\d{2})\s+(\d+)\s+(-?[\d\s]+,\d{2})\s+(\d+)\s*(?:[A-Z]{2,3})?\s*$/;

export function parseFaktura(riadky: PdfRiadok[]): Faktura | null {
  const text = riadky.map((r) => r.text);
  const spojene = text.join(" ");
  if (!/faktura|faktúra|daňový doklad/i.test(spojene)) return null;

  const cisloDokladu =
    /(?:faktura|faktúra)\s*[-–—:]?\s*(\d{6,})/i.exec(spojene)?.[1] ||
    /variabilní symbol:\s*(\d+)/i.exec(spojene)?.[1] || "";
  const datum =
    datumISO(text.find((r) => /datum vystavení/i.test(r)) || "") ||
    datumISO(text.find((r) => /datum uskut/i.test(r)) || "") ||
    datumISO(spojene);
  const dodavatel =
    /prodávající:\s*([^,]{2,60}?)(?:\s{2,}|$)/i.exec(spojene)?.[1]?.trim() ||
    (/alza/i.test(spojene) ? "Alza.cz a.s." : "");

  // „Celkem: 4 119,00 Kč" — berie sa posledný taký riadok, lebo pred ním býva
  // medzisúčet bez zaokrúhlenia.
  let celkom = 0;
  for (const r of text) {
    const m = /celkem:\s*(-?[\d\s]+,\d{2})\s*kč/i.exec(r);
    if (m) celkom = cislo(m[1]);
  }

  // Za prvým súhrnovým riadkom už žiadne položky nie sú — nasleduje rozpis DPH
  // a pätička. Bez tejto zarážky sa do poslednej položky prilepila tabuľka
  // sadzieb („AlzaPlus+ % 2 414,74 507,08 …").
  const SUHRN = /celkem:|vyčíslení|sazba|základ|zaokrouhlení|strana \d|ochranný znak/i;
  const polozky: FakturaPolozka[] = [];
  let koniecPolozek = false;
  for (const r of text) {
    if (SUHRN.test(r)) koniecPolozek = true;
    if (koniecPolozek) continue;
    const m = CHVOST.exec(r);
    if (!m) {
      // Riadok bez chvosta čísel je pokračovanie názvu predchádzajúcej položky —
      // názov sa na doklade láme cez dva-tri riadky. Vedúci token býva zvyšok
      // kódu, ktorý sa zalomil tiež („28 Strength, 1000 mg…"), ten do názvu
      // nepatrí; ale riadok, ktorý je jediné slovo („kapslí"), je celý názov.
      const posledna = polozky[polozky.length - 1];
      if (!posledna || r.length > 90) continue;
      const bezKodu = /^[A-Za-z0-9]{1,8}\s+\S/.test(r) ? r.replace(/^[A-Za-z0-9]{1,8}\s+/, "") : r;
      posledna.nazov = `${posledna.nazov} ${bezKodu}`.replace(/\s+/g, " ").trim();
      continue;
    }
    const hlava = r.slice(0, m.index).trim();
    const medzera = hlava.indexOf(" ");
    const kod = medzera > 0 && medzera <= 10 ? hlava.slice(0, medzera) : "";
    const nazov = (medzera > 0 && medzera <= 10 ? hlava.slice(medzera + 1) : hlava).trim();
    if (!nazov) continue;
    polozky.push({ kod, nazov, ks: Number(m[1]) || 1, cena: cislo(m[6]), kategoria: "" });
  }

  if (!polozky.length) return null;
  return { cislo: cisloDokladu, datum, dodavatel, celkom, polozky };
}

/** Súčet položiek proti súčtu z dokladu — rozdiel väčší než koruna je chyba čítania. */
export const sediSucet = (f: Faktura): boolean =>
  !f.celkom || Math.abs(f.polozky.reduce((a, p) => a + p.cena, 0) - f.celkom) <= 1;
