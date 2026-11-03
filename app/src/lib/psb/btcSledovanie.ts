import { KURZ_BTC } from "./dlhKlienta";
import { normName } from "./format";
import { czkZaPolozky, type PolozkaPlatby } from "./platiZa";

/**
 * BITCOINOVÉ PLATBY NA POTVRDENIE (Jerry, 3. 11. 2026): „ako je API na Fio
 * a sleduje transakcie, malo by byť také niečo aj v BTC appke", a hneď potom:
 * „nech to nie je automatické spárovanie, chcem to spraviť ručne ako platby
 * z Kokpitu." Kokpit teda platbu sám NÁJDE, zapíše ju až človek. Nájde ju
 * dvoma cestami: riadok v BTC knihe a faktúra z odkazu, o ktorej Blink povie,
 * že je zaplatená (`overit`, bez API kľúča).
 *
 * VOLATILITA: „pokiaľ majú zaplatiť 10 tisíc a BTC klesne a zrazu je tam iba
 * 9 765, nie sú nič dlžní, Kokpit má evidovať, že zaplatili 10 tisíc."
 * Dohodnutá suma je tá z odkazu v SMS, nie prepočet satoshi kurzom knihy.
 */

export type DielFaktury = { klient: string; czk: number };
export type LnFaktura = { id: string; klient: string; rozpis: DielFaktury[]; czk: number; sats: number; vytvorena: string; zaplatenaAt: string | null };
export type BtcBezMena = { id: number; datum: string; sats: number; czk: number | null; poznamka: string };
export type BtcZKnihy = { klient: string | null; datum: string; czk: number | null; sats?: number };
export type DielPlatby = { klient: string; suma: number };

/** Koľko z odkazu patrí komu, každý svojou zľavou. Súčet sedí s `czkZaPolozky`. */
export function rozpisFaktury(polozky: PolozkaPlatby[], zlava: (meno: string) => number): DielFaktury[] {
  const podla = new Map<string, PolozkaPlatby[]>();
  for (const p of polozky) podla.set(p.klient, [...(podla.get(p.klient) || []), p]);
  return [...podla].map(([klient, kusy]) => ({ klient, czk: czkZaPolozky(kusy, zlava).czk }));
}

/** Hash platby je posledný kus overovacej adresy; id faktúry, kým neexistuje iné. */
export const idFaktury = (overit: string): string => overit.split("/").filter(Boolean).pop() || overit;

const dniMedzi = (a: string, b: string): number =>
  Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000;

/**
 * Je riadok knihy zaplatená faktúra? Satoshi musia sedieť na celok, alebo na
 * podiel klienta (kniha delí spoločnú platbu 50/50). Tolerancia 1 % je len na
 * zaokrúhlenie, kurz tu nehrá: oba údaje sú v satoshi. Vráti, čo z nej patrí
 * tomuto riadku; riadok bez mena môže byť len celá faktúra.
 */
export function dielyZFaktury(riadok: { klient: string | null; datum: string; sats: number }, f: LnFaktura): DielFaktury[] | null {
  if (!f.zaplatenaAt || !(riadok.sats > 0) || dniMedzi(riadok.datum, f.zaplatenaAt) > 4) return null;
  const sedi = (s: number) => Math.abs(riadok.sats - s) <= s * 0.01;
  if (!riadok.klient) return sedi(f.sats) ? f.rozpis : null;
  const moj = f.rozpis.find((d) => normName(d.klient) === normName(riadok.klient as string));
  if (!moj) return null;
  if (sedi(f.sats)) return f.rozpis;
  return sedi((f.sats * moj.czk) / (f.czk || 1)) || sedi(f.sats / f.rozpis.length) ? [moj] : null;
}

/**
 * Čo predvyplniť: suma z odkazu, keď ju kurz vysvetlí (do 10 %, `KURZ_BTC`).
 * Väčší rozdiel kurz nevysvetlí a predvyplní sa to, čo prišlo: človek vidí oboje
 * a zapisuje on. Riadok knihy môže byť celok, alebo už rozdelený diel klienta.
 */
export function navrhDielov(czk: number | null, klient: string, rozpis: DielFaktury[]): { diely: DielPlatby[]; zOdkazu: boolean } {
  const naPlatbu = (d: DielFaktury[]) => d.map((x) => ({ klient: x.klient, suma: x.czk }));
  const spolu = rozpis.reduce((a, d) => a + d.czk, 0);
  const moj = rozpis.find((d) => normName(d.klient) === normName(klient));
  const sedi = (caka: number) => czk !== null && caka > 0 && Math.abs(czk - caka) <= caka * KURZ_BTC;
  if (sedi(spolu)) return { diely: naPlatbu(rozpis), zOdkazu: true };
  if (moj && sedi(moj.czk)) return { diely: naPlatbu([moj]), zOdkazu: true };
  return { diely: [{ klient, suma: Math.round(czk || 0) }], zOdkazu: false };
}

/** Rozdelenie satoshi v knihe: prvý dostane zvyšok, ako `POST /api/reserve` v BTC appke. */
export function satsDielov(sats: number, n: number): number[] {
  const diel = Math.floor(sats / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? sats - diel * (n - 1) : diel));
}

/** Satoshi z kľúča `btc:deň|meno|sats`; kniha riadky nečísluje, inde nie sú. */
export function kluczKnihy(fioId: string): { datum: string; meno: string; sats: number } | null {
  const m = /^btc:(\d{4}-\d{2}-\d{2})\|(.+)\|(\d+)$/.exec(fioId);
  return m ? { datum: m[1], meno: m[2], sats: Number(m[3]) } : null;
}

export type BtcNaPotvrdenie = {
  /** Stabilný kľúč položky: skrytie aj zápis stoja na ňom. */
  kluc: string;
  zdroj: "kniha" | "bez-mena" | "faktura";
  datum: string;
  sats: number;
  /** Hodnota podľa kurzu v knihe; pri samotnej faktúre je to jej suma. */
  czk: number | null;
  poznamka: string;
  /** Meno, ako stojí v knihe. Do kľúča platby ide toto, nie meno z Kokpitu. */
  klientKnihy?: string;
  idKnihy?: number;
  idFaktury?: string;
  /** Faktúra z odkazu, o ktorej Blink povedal, že je zaplatená. */
  zFaktury: DielFaktury[] | null;
};

/**
 * Čo ešte nie je zapísané. Riadok knihy je vybavený, keď má platbu s tým istým
 * dňom a satoshi (meno sa v oboch appkách píše inak), alebo keď ho pokryla
 * faktúra, ktorú už človek potvrdil. Faktúra, ku ktorej je riadok v knihe, sa
 * neukazuje zvlášť: je to tá istá platba.
 */
export function btcNaPotvrdenie(v: {
  kniha: BtcZKnihy[];
  bezMena: BtcBezMena[];
  faktury: LnFaktura[];
  zapisane: string[];
  skryte: string[];
  odDna: string;
}): BtcNaPotvrdenie[] {
  const knihaKluce = new Set(v.zapisane.map(kluczKnihy).filter((k) => !!k).map((k) => `${k!.datum}|${k!.sats}`));
  const potvrdena = (f: LnFaktura) => v.zapisane.includes(`btc:ln:${f.id}`);
  const out: BtcNaPotvrdenie[] = [];
  const pokryte = new Set<string>();

  const riadok = (r: { klient: string | null; datum: string; sats: number }): { f: LnFaktura; diely: DielFaktury[] } | null => {
    for (const f of v.faktury) {
      const diely = dielyZFaktury(r, f);
      if (diely) return { f, diely };
    }
    return null;
  };

  for (const b of v.kniha) {
    const datum = String(b.datum || "").slice(0, 10);
    const sats = Math.round(Number(b.sats) || 0);
    if (!b.klient || !(sats > 0) || datum < v.odDna) continue;
    const z = riadok({ klient: b.klient, datum, sats });
    if (z) pokryte.add(z.f.id);
    if (knihaKluce.has(`${datum}|${sats}`) || (z && potvrdena(z.f))) continue;
    out.push({ kluc: `btc:${datum}|${b.klient.trim()}|${sats}`, zdroj: "kniha", datum, sats, czk: b.czk === null ? null : Math.round(Number(b.czk)), poznamka: "", klientKnihy: b.klient.trim(), zFaktury: z?.diely || null, idFaktury: z?.f.id });
  }
  for (const b of v.bezMena) {
    if (b.datum < v.odDna || !(b.sats > 0)) continue;
    const z = riadok({ klient: null, datum: b.datum, sats: b.sats });
    if (z) pokryte.add(z.f.id);
    if (z && potvrdena(z.f)) continue;
    out.push({ kluc: `btc:kniha:${b.id}`, zdroj: "bez-mena", datum: b.datum, sats: b.sats, czk: b.czk, poznamka: b.poznamka, idKnihy: b.id, zFaktury: z?.diely || null, idFaktury: z?.f.id });
  }
  for (const f of v.faktury) {
    if (!f.zaplatenaAt || pokryte.has(f.id) || potvrdena(f)) continue;
    out.push({ kluc: `btc:ln:${f.id}`, zdroj: "faktura", datum: f.zaplatenaAt.slice(0, 10), sats: f.sats, czk: f.czk, poznamka: "", idFaktury: f.id, zFaktury: f.rozpis });
  }
  return out.filter((p) => !v.skryte.includes(p.kluc)).sort((a, b) => b.datum.localeCompare(a.datum));
}
