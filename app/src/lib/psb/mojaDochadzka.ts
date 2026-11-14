import { normName } from "./format";

/**
 * MOJA DOCHÁDZKA (Jerry, 14. 11. 2026): „moje vlastné súkromné sledovanie
 * dochádzky, jak u Guillerma tak na boxe… založiť aktivitu, napísať si koľko
 * a kedy som zaplatil, koľko hodín som si kúpil, a potom by sa to z kalendára
 * odpočítavalo… a notifikácia Guillermo dnes posledný tréning alebo box dnes
 * posledný tréning.“ Každý profil (Jerry, Terezka) má svoje vlastné.
 *
 * Aktivita = názov udalosti v kalendári daného človeka („Box“), alebo
 * udalosti typu Guillermo. Nákupy sa míňajú v poradí, v akom prišli (najstarší
 * balík prvý) — rovnako ako balíčky klientov, preto aj odznak „3/10“.
 * Súkromné — do firmy, tržieb ani výplat nevstupuje nič.
 */

export type Aktivita = {
  id: string;
  kto: string;
  nazov: string;
  /** Názvy udalostí v kalendári, ktoré sa rátajú (bez ohľadu na veľkosť písmen). */
  nazvy: string[];
  /** Ráta udalosti typu Guillermo (vzdelávanie), nie podľa názvu. */
  guillermo?: boolean;
  vytvorene: string;
};

export type Nakup = {
  id: string;
  aktivitaId: string;
  /** Deň platby / začiatku balíka, RRRR-MM-DD. Odpočet beží od neho. */
  datum: string;
  hodiny: number;
  sumaKc: number | null;
  poznamka: string;
  vytvorene: string;
};

export type DataDochadzky = { aktivity: Aktivita[]; nakupy: Nakup[] };

export type UdalostDochadzky = { uid: string; trener: string; zaciatok: string; koniec?: string | null; nazov: string | null; typ: string | null };

export const KLUC_DOCHADZKY = "moja_dochadzka";

export function citajDochadzku(hodnota: string | null | undefined): DataDochadzky {
  let v: unknown = null;
  try { v = JSON.parse(hodnota || "null"); } catch { v = null; }
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Partial<DataDochadzky>;
  return {
    aktivity: Array.isArray(o.aktivity) ? o.aktivity.filter((a) => a && a.id && a.kto && a.nazov) : [],
    nakupy: Array.isArray(o.nakupy) ? o.nakupy.filter((n) => n && n.id && n.aktivitaId && /^\d{4}-\d{2}-\d{2}$/.test(String(n.datum)) && Number(n.hodiny) > 0) : [],
  };
}

/** Patrí udalosť k aktivite? Kalendár toho istého človeka a jej názov (alebo Guillermo). */
export function patri(a: Aktivita, u: UdalostDochadzky): boolean {
  // Guillermove sedenia sú zapísané hlavne v Terezkinom kalendári („TR“),
  // hoci sú Jerryho — ráta sa každý kalendár, ako na starej karte Guillermo.
  if (a.guillermo) return u.typ === "guillermo";
  if (u.trener !== a.kto) return false;
  const n = normName(u.nazov || "");
  return !!n && a.nazvy.some((x) => normName(x) === n);
}

export type BodOdpoctu = {
  uid: string;
  zaciatok: string;
  /** Už sa konalo (pred „teraz“), alebo je to naplánované. */
  minule: boolean;
  /** Koľká hodina balíka to je („3“ z „10“), alebo mínus bez balíka. */
  poradie: number | null;
  zBalika: number | null;
  minus: number | null;
  /** Po tejto hodine už nič zaplatené neostáva. */
  posledna: boolean;
};

export type StavAktivity = {
  aktivita: Aktivita;
  kupene: number;
  odtrenovane: number;
  zostatok: number;
  /** Kedy dôjde podľa naplánovaných udalostí (deň poslednej zaplatenej), alebo null. */
  dojde: string | null;
  naplanovane: number;
  poslednyNakup: Nakup | null;
  body: BodOdpoctu[];
  /** Udalosti pred prvým nákupom — do odpočtu nevstupujú. */
  predEvidenciou: number;
};

/**
 * Odpočet jednej aktivity. Udalosť sa míňa z najstaršieho balíka, ktorý v ten
 * deň už bol kúpený a má voľnú hodinu; keď taký nie je, ide do mínusu
 * (a ďalší nákup ho NEprekryje spätne — ako pri klientoch, mínus je značka).
 */
export function stavAktivity(a: Aktivita, nakupy: Nakup[], udalosti: UdalostDochadzky[], teraz: string): StavAktivity {
  const moje = nakupy.filter((n) => n.aktivitaId === a.id).sort((x, y) => x.datum.localeCompare(y.datum) || x.vytvorene.localeCompare(y.vytvorene));
  const prvy = moje[0]?.datum || null;
  const vsetky = udalosti.filter((u) => patri(a, u)).sort((x, y) => x.zaciatok.localeCompare(y.zaciatok));
  const vEvidencii = prvy ? vsetky.filter((u) => u.zaciatok.slice(0, 10) >= prvy) : [];
  const zvysok = moje.map((n) => ({ n, volne: n.hodiny }));
  let minus = 0;
  const body: BodOdpoctu[] = vEvidencii.map((u) => {
    const den = u.zaciatok.slice(0, 10);
    const b = zvysok.find((x) => x.volne > 0 && x.n.datum <= den);
    const minule = u.zaciatok.slice(0, 16) <= teraz.slice(0, 16);
    if (!b) { minus++; return { uid: u.uid, zaciatok: u.zaciatok, minule, poradie: null, zBalika: null, minus, posledna: false }; }
    b.volne--;
    const poradie = b.n.hodiny - b.volne;
    const ostava = zvysok.filter((x) => x.n.datum <= den).reduce((s, x) => s + x.volne, 0);
    return { uid: u.uid, zaciatok: u.zaciatok, minule, poradie, zBalika: b.n.hodiny, minus: null, posledna: ostava === 0 };
  });
  const kupene = moje.reduce((s, n) => s + n.hodiny, 0);
  const odtrenovane = body.filter((b) => b.minule).length;
  const buduce = body.filter((b) => !b.minule);
  const dojde = body.find((b) => b.posledna && !b.minule)?.zaciatok.slice(0, 10) || null;
  return {
    aktivita: a, kupene, odtrenovane, zostatok: kupene - odtrenovane, dojde, naplanovane: buduce.length,
    poslednyNakup: moje[moje.length - 1] || null, body,
    predEvidenciou: prvy ? vsetky.filter((u) => u.zaciatok.slice(0, 10) < prvy).length : vsetky.length,
  };
}

export type PolozkaDochadzky = { key: string; title: string; detail: string; tone: "orange" | "blue"; kto: string; aktivitaId: string };

/**
 * Notifikácie pre majiteľa aktivity: v deň poslednej zaplatenej hodiny
 * („Box — dnes posledný tréning“) a keď ide do mínusu. Kľúč nesie deň
 * (posledný) alebo posledný nákup (mínus) — po dokúpení príde otázka nanovo.
 */
export function polozkyDochadzky(d: DataDochadzky, udalosti: UdalostDochadzky[], teraz: string): PolozkaDochadzky[] {
  const dnes = teraz.slice(0, 10);
  const out: PolozkaDochadzky[] = [];
  for (const a of d.aktivity) {
    const s = stavAktivity(a, d.nakupy, udalosti, teraz);
    if (!s.poslednyNakup) continue;
    const dnesPosledna = s.body.find((b) => b.posledna && b.zaciatok.slice(0, 10) === dnes);
    if (dnesPosledna) {
      out.push({
        key: `dochadzka|${a.id}|${dnes}`, kto: a.kto, aktivitaId: a.id, tone: "blue",
        title: `${a.nazov} — dnes posledný tréning`,
        detail: `${a.nazov} o ${dnesPosledna.zaciatok.slice(11, 16)} je posledná zaplatená hodina (${dnesPosledna.poradie}/${dnesPosledna.zBalika}). Ďalšia už nie je zaplatená — po platbe ju zapíš vo Workspace → Moja dochádzka.`,
      });
    }
    if (s.zostatok < 0) {
      out.push({
        key: `dochadzka-minus|${a.id}|${s.poslednyNakup.datum}`, kto: a.kto, aktivitaId: a.id, tone: "orange",
        title: `${a.nazov}: ${s.zostatok} h`,
        detail: `${a.nazov}: odtrénované ${s.odtrenovane} h, zaplatené ${s.kupene} h — si v mínuse ${s.zostatok}. Po platbe zapíš nákup vo Workspace → Moja dochádzka.`,
      });
    }
  }
  return out;
}

/**
 * Udalosti súkromného kontaktu patria k jeho aktivite: termín, ktorý si Leon
 * vybral cez ponuku pred 14. 11. 2026, sa v kalendári volá „Leon Box“, nie
 * „Box“. Aktivita „Box“ ho preto ráta tiež — názvy sa doplnia pri čítaní.
 */
export function sNazvamiKontaktov(aktivity: Aktivita[], kontakty: { meno: string; aktivita: string }[]): Aktivita[] {
  return aktivity.map((a) => {
    if (a.guillermo) return a;
    const navyse = kontakty.filter((k) => a.nazvy.some((n) => normName(n) === normName(k.aktivita))).map((k) => k.meno);
    return navyse.length ? { ...a, nazvy: [...new Set([...a.nazvy, ...navyse])] } : a;
  });
}
