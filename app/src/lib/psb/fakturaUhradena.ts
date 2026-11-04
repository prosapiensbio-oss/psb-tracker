import { normName } from "./format";
import type { DlhPolozka } from "./zaplatene";

/**
 * FAKTÚRA NA BALÍČEK JE UHRADENÁ, KEĎ JE ZAPLATENÝ JEJ BALÍČEK.
 *
 * Jerry, 23. 10. 2026 nad Martinom Vaškom: „8. 10. sa založila faktúra a on
 * ju 8. 10. zaplatil, tým sa vynuloval ten dlh — nemala by tam byť faktúra,
 * ktorá je po splatnosti." Uhradenú dovtedy značil len klik „uhradená";
 * platba z banky zaplatila balíček (jedno pravidlo `dlhyKlientov`), ale
 * faktúra o tom nevedela a svietila červeno.
 *
 * Rozhoduje TO ISTÉ pravidlo ako dlh: balíček faktúry žije (nie je zrušený)
 * a medzi položkami dlhu nie je. Čiastočne zaplatený balíček (Lucia: dlh
 * 4 290 z 5 640) v dlhu ostáva, takže jeho faktúra uhradená nie je.
 * Deň úhrady je platba klienta na sumu faktúry (± 1 Kč): prvá od vystavenia,
 * inak najbližšia do 30 dní pred ním (zaplatil vopred); keď taká nie je, dnešok.
 * Pri rovnakej sume každý balíček vyhrávala najstaršia platba: Jan Kral má na
 * faktúre z 16. 10. úhradu 16. 9. — to bol jeho predošlý balíček, túto platil 19. 10.
 */
export function faktureUhradeneBalickom(
  faktury: { id: string; klient: string; balicekId: string | null; vystavene: string; celkom: number; uhradeneAt: string | null; stornoAt: string | null }[],
  ziveBalicky: Set<string>,
  dlhy: DlhPolozka[],
  platby: { id: string; klient: string; datum: string; suma: number }[],
  dnes: string,
): { id: string; den: string; platbaId: string | null }[] {
  const vDlhu = new Set(dlhy.map((d) => d.id).filter(Boolean) as string[]);
  const posun = (d: string, n: number) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const out: { id: string; den: string; platbaId: string | null }[] = [];
  for (const f of faktury) {
    if (f.uhradeneAt || f.stornoAt || !f.balicekId) continue;
    if (!ziveBalicky.has(f.balicekId) || vDlhu.has(f.balicekId)) continue;
    const p = platby
      .filter((x) => normName(x.klient) === normName(f.klient) && Math.abs(Math.round(x.suma) - Math.round(f.celkom)) <= 1
        && x.datum >= posun(f.vystavene, -30) && x.datum <= dnes)
      .sort((a, b) => {
        const po = (d: string) => d >= f.vystavene;
        if (po(a.datum) !== po(b.datum)) return po(a.datum) ? -1 : 1;
        return po(a.datum) ? a.datum.localeCompare(b.datum) : b.datum.localeCompare(a.datum);
      })[0];
    out.push({ id: f.id, den: p?.datum || dnes, platbaId: p?.id || null });
  }
  return out;
}

/**
 * FAKTÚRA NA ĎALŠÍ BALÍČEK JE UHRADENÁ PLATBOU VOPRED (Jerry, 4. 11. 2026).
 *
 * Balíček ešte nie je, takže pravidlo „zaplatený balíček" nemá čo čítať. Platí
 * platba na sumu faktúry od jej vystavenia, ktorú Kokpit označil ako vopred
 * (klient v tej chvíli nič nedlžil) a nie je už na inej faktúre. Platba, ktorá
 * išla na starý dlh, faktúru neuhradí; to rozhodne až balíček.
 */
export function fakturyNaDalsiUhradene(
  faktury: { id: string; klient: string; vystavene: string; celkom: number }[],
  platby: { id: string; klient: string; datum: string; suma: number; vopred?: number | boolean | null }[],
  pouzite: Set<string>,
): { id: string; den: string; platbaId: string }[] {
  const out: { id: string; den: string; platbaId: string }[] = [];
  const vzate = new Set(pouzite);
  for (const f of [...faktury].sort((a, b) => a.vystavene.localeCompare(b.vystavene))) {
    const p = platby
      .filter((x) => x.vopred && !vzate.has(x.id) && normName(x.klient) === normName(f.klient)
        && Math.abs(Math.round(x.suma) - Math.round(f.celkom)) <= 1 && x.datum >= f.vystavene)
      .sort((a, b) => a.datum.localeCompare(b.datum))[0];
    if (!p) continue;
    vzate.add(p.id);
    out.push({ id: f.id, den: p.datum, platbaId: p.id });
  }
  return out;
}

/**
 * FAKTÚRA ZA VIACERÝCH JE UHRADENÁ, KEĎ Z JEDNÉHO PREVODU DOSTAL SVOJ DIEL KAŽDÝ.
 *
 * Jerry, 29. 10. 2026 nad Branislavom a Lindou. Pravidlo „zaplatený balíček
 * = uhradená faktúra" pozná len balíček hlavného klienta — Branislavov
 * balíček zaplatený inou platbou by tak uhradil aj Lindinu polovicu. Pri
 * faktúre s položkami za iných preto rozhoduje rozdelený prevod: platby
 * s tým istým `fio_id`, v ktorých má každý klient z faktúry svoj diel (± 1 Kč).
 * Deň úhrady je deň toho prevodu; `platbaId` je diel hlavného klienta.
 */
export function fakturyUhradeneRozdelenim(
  faktury: { id: string; klient: string; vystavene: string; diely: { klient: string; suma: number }[] }[],
  platby: { id: string; klient: string; datum: string; suma: number; fioId: string | null }[],
): { id: string; den: string; platbaId: string | null }[] {
  const podlaPrevodu = new Map<string, typeof platby>();
  for (const p of platby) if (p.fioId) podlaPrevodu.set(p.fioId, [...(podlaPrevodu.get(p.fioId) || []), p]);
  const out: { id: string; den: string; platbaId: string | null }[] = [];
  for (const f of faktury) {
    if (f.diely.length < 2) continue;
    for (const kusy of podlaPrevodu.values()) {
      if (kusy[0].datum < f.vystavene.slice(0, 10)) continue;
      const sedi = f.diely.every((d) => kusy.some((p) => normName(p.klient) === normName(d.klient) && Math.abs(Math.round(p.suma) - Math.round(d.suma)) <= 1));
      if (!sedi) continue;
      const hlavny = kusy.find((p) => normName(p.klient) === normName(f.klient));
      out.push({ id: f.id, den: kusy[0].datum, platbaId: hlavny?.id || null });
      break;
    }
  }
  return out;
}
