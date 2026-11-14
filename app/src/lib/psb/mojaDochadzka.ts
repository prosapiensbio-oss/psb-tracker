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
  /**
   * Opakované udalosti podľa ICS UID série (začiatok `uid`). Guillermove stredy
   * chodia z Google kalendára ako „Busy“ — názov v iCal nie je (14. 11. 2026).
   */
  serie?: string[];
  vytvorene: string;
};

/** Tréning, ktorý v kalendári nie je (rok 2025 u Guillerma) — zapísaný ručne. */
export type RucnyTrening = { id: string; aktivitaId: string; zaciatok: string; poznamka: string };

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

export type DataDochadzky = { aktivity: Aktivita[]; nakupy: Nakup[]; rucne?: RucnyTrening[] };

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
    rucne: Array.isArray(o.rucne) ? o.rucne.filter((r) => r && r.id && r.aktivitaId && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(r.zaciatok))) : [],
  };
}

/** Patrí udalosť k aktivite? Kalendár toho istého človeka a jej názov (alebo Guillermo). */
export function patri(a: Aktivita, u: UdalostDochadzky): boolean {
  // Guillermove sedenia sú zapísané hlavne v Terezkinom kalendári („TR“),
  // hoci sú Jerryho — ráta sa každý kalendár, ako na starej karte Guillermo.
  if (u.uid.startsWith(`rucne:${a.id}:`)) return true;
  if (a.serie?.some((x) => x && u.uid.startsWith(x))) return true;
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

/** Ručne zapísané tréningy ako udalosti — aby sa rátali rovnako ako kalendár. */
export function rucneAkoUdalosti(d: DataDochadzky): UdalostDochadzky[] {
  return (d.rucne || []).map((r) => {
    const a = d.aktivity.find((x) => x.id === r.aktivitaId);
    return { uid: `rucne:${r.aktivitaId}:${r.id}`, trener: a?.kto || "", zaciatok: r.zaciatok, nazov: r.poznamka || a?.nazov || "", typ: "rucne" };
  });
}

/**
 * Odpočet jednej aktivity, chronologicky. Platba pridá hodiny a NAJPRV vyrovná
 * mínus (tréningy, ktoré prebehli skôr, než prišla platba — u Guillerma bežné,
 * platí sa spätne); potom sa míňa najstarší balík. Mínus sa platbou vynuluje,
 * ako pri klientoch. Zostatok = kúpené − odtrénované.
 */
export function stavAktivity(a: Aktivita, nakupy: Nakup[], udalosti: UdalostDochadzky[], teraz: string): StavAktivity {
  const moje = nakupy.filter((n) => n.aktivitaId === a.id).sort((x, y) => x.datum.localeCompare(y.datum) || x.vytvorene.localeCompare(y.vytvorene));
  const prvy = moje[0]?.datum || null;
  const vsetky = udalosti.filter((u) => patri(a, u)).sort((x, y) => x.zaciatok.localeCompare(y.zaciatok));
  const vEvidencii = prvy ? vsetky.filter((u) => u.zaciatok.slice(0, 10) >= prvy) : [];
  const baliky: { n: Nakup; pouzite: number }[] = [];
  let dlh = 0;
  let ni = 0;
  const pridajNakupyDo = (den: string) => {
    while (ni < moje.length && moje[ni].datum <= den) {
      const b = { n: moje[ni], pouzite: 0 };
      const vyrovna = Math.min(dlh, b.n.hodiny);
      b.pouzite += vyrovna; dlh -= vyrovna;
      baliky.push(b); ni++;
    }
  };
  const body: BodOdpoctu[] = vEvidencii.map((u) => {
    const den = u.zaciatok.slice(0, 10);
    pridajNakupyDo(den);
    const minule = u.zaciatok.slice(0, 16) <= teraz.slice(0, 16);
    const b = baliky.find((x) => x.pouzite < x.n.hodiny);
    if (!b) { dlh++; return { uid: u.uid, zaciatok: u.zaciatok, minule, poradie: null, zBalika: null, minus: dlh, posledna: false }; }
    b.pouzite++;
    const ostava = baliky.reduce((sum, x) => sum + (x.n.hodiny - x.pouzite), 0);
    return { uid: u.uid, zaciatok: u.zaciatok, minule, poradie: b.pouzite, zBalika: b.n.hodiny, minus: null, posledna: ostava === 0 };
  });
  const kupene = moje.reduce((sum, n) => sum + n.hodiny, 0);
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
