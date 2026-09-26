/**
 * MESAČNÉ POROVNANIE: KALENDÁR PROTI EXPORTU.
 *
 * Jerry, 26. 9. 2026: „grafy by mali byť ťahané z reportov, ale po novom by
 * to malo byť ťahané z Google kalendára… teraz sme v skúšobnej verzii, kde
 * budú fungovať obidve a budú sa navzájom porovnávať."
 *
 * Toto je to meradlo. Nie „appka si myslí, že to sedí", ale mesiac po
 * mesiaci: koľko tréningov vidí kalendár a koľko ich je v exporte. Kým sa
 * rozchádzajú, grafy na kalendári stáť nemôžu.
 *
 * ČO SA POČÍTA ZA TRÉNING
 *
 * Z kalendára len to, čo je zaradené ako tréning alebo úvodný a nezmizlo.
 * Nezaradená udalosť (nové meno, záskok) sa neráta — appka nehádže do
 * súčtu nič, čím si nie je istá — ale ukazuje sa zvlášť, aby bolo vidieť,
 * či rozdiel nie je práve v nej.
 */

export type KalendarRiadok = { zaciatok: string; typ: string | null; klient: string | null; zmizlaAt?: string | null };
export type ExportRiadok = { date: string; sessionType?: string | null };

export type MesiacPorovnanie = {
  mesiac: string;
  kalendar: number;
  export: number;
  rozdiel: number;
  /** Udalosti, ktoré appka nevie zaradiť — vysvetlenie rozdielu, nie chyba. */
  nezaradene: number;
  /** Do 5 % alebo do dvoch kusov sa to považuje za zhodu. */
  sedi: boolean;
};

const TRENINGOVE = new Set(["trening", "uvodny"]);

/** Mesiac z ISO dátumu; prázdny reťazec pri nezmysle. */
const mesiac = (iso: string) => (/^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : "");

export function porovnajMesiace(
  kal: KalendarRiadok[],
  exp: ExportRiadok[],
  /** Mesiace mimo rozsahu nemá zmysel porovnávať — kalendár tam ešte nesiaha. */
  od = "",
): MesiacPorovnanie[] {
  const m = new Map<string, MesiacPorovnanie>();
  const daj = (k: string): MesiacPorovnanie => {
    if (!m.has(k)) m.set(k, { mesiac: k, kalendar: 0, export: 0, rozdiel: 0, nezaradene: 0, sedi: true });
    return m.get(k)!;
  };

  for (const u of kal) {
    if (u.zmizlaAt) continue;
    const k = mesiac(u.zaciatok);
    if (!k || k < od) continue;
    const r = daj(k);
    if (TRENINGOVE.has(String(u.typ || ""))) r.kalendar++;
    else if (!u.typ) r.nezaradene++;
  }
  for (const s of exp) {
    const k = mesiac(s.date);
    if (!k || k < od) continue;
    daj(k).export++;
  }

  return [...m.values()]
    .map((r) => {
      const rozdiel = r.kalendar - r.export;
      // Dva kusy alebo päť percent: kalendár a export nikdy nesadnú na kus
      // presne (posunuté hodiny, zrušenia na poslednú chvíľu) a trvať na
      // nule by znamenalo, že meradlo nikdy nezozelenie.
      const strop = Math.max(2, Math.round(r.export * 0.05));
      return { ...r, rozdiel, sedi: Math.abs(rozdiel) <= strop };
    })
    .sort((a, b) => b.mesiac.localeCompare(a.mesiac));
}

/** Od ktorého mesiaca sa dá porovnávať — dovtedy kalendár v appke nie je. */
export function odkedyKalendar(kal: KalendarRiadok[]): string {
  let naj = "";
  for (const u of kal) {
    const k = mesiac(u.zaciatok);
    if (k && (!naj || k < naj)) naj = k;
  }
  return naj;
}
