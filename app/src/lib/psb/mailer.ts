/**
 * MailerLite — čo z odberateľov a kampaní čítať.
 *
 * PREČO JE PRVÁ OTÁZKA „PRIBÚDAJÚ ODBERATELIA"
 *
 * Formulár na /dychani zbiera maily, nie dopyty. Onboarding od júla hlási, že
 * má vysoké zobrazenia a nula odoslaní, a kampaň naň minula 1 804 Kč. Odpoveď
 * nie je v Kokpite ani v Mete — je tu: keď formulár funguje, pribúdajú
 * odberatelia. Keď nie, rad prihlásení je plochý.
 *
 * PREČO SÚ OTVORENIA UNIKÁTNE
 *
 * MailerLite vracia aj celkové počty. Jeden človek, čo si mail otvoril päťkrát,
 * by v nich vyzeral ako päť ľudí a otvorenosť by presiahla sto percent.
 */

export type Odberatel = {
  id: string; email: string; prihlaseny: string; status: string; skupiny: string;
  /** Doplnené z CSV exportu pred zrušením MailerLite (27. 10. 2026). */
  meno?: string;
  odhlaseny_at?: string;
  dovod?: string;
  odoslanych?: number;
  otvoreni?: number;
  klikov?: number;
  /** Meno klienta z Kokpitu, keď sa mail spároval. */
  klient?: string | null;
};
export type MailKampan = {
  id: string; nazov: string; odoslane: string;
  prijemcov: number; otvorenia: number; prekliky: number; odhlasenia: number;
};

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

/** Otvorenosť a preklikovosť kampane v percentách. `null`, keď nie je z čoho. */
export function mieryKampane(k: MailKampan) {
  return {
    otvorenost: pct(k.otvorenia, k.prijemcov),
    preklikovost: pct(k.prekliky, k.prijemcov),
    // Preklik z tých, čo mail OTVORILI — hovorí o obsahu, nie o predmete.
    // Kampaň s biednym predmetom a skvelým obsahom má nízku preklikovosť
    // a vysokú túto; opravovať sa má predmet, nie text.
    preklikZOtvorenych: pct(k.prekliky, k.otvorenia),
    odhlasenost: pct(k.odhlasenia, k.prijemcov),
  };
}

/**
 * Prihlásenia po mesiacoch.
 *
 * Mesiace bez jediného prihlásenia sa DOPĹŇAJÚ ako nula. Bez toho by graf
 * preskočil prázdne obdobie a plochý rad by vyzeral ako rastúci — čo je presne
 * tá otázka, na ktorú má odpovedať.
 */
export function prihlaseniaPoMesiacoch(odberatelia: Odberatel[]): { m: string; v: number }[] {
  const dni = odberatelia.map((o) => o.prihlaseny?.slice(0, 7)).filter(Boolean).sort();
  if (!dni.length) return [];
  const podla = new Map<string, number>();
  for (const m of dni) podla.set(m, (podla.get(m) || 0) + 1);

  const von: { m: string; v: number }[] = [];
  let [r, mm] = dni[0].split("-").map(Number);
  const koniec = dni[dni.length - 1];
  for (let i = 0; i < 240; i++) {
    const kluc = `${r}-${String(mm).padStart(2, "0")}`;
    von.push({ m: kluc, v: podla.get(kluc) || 0 });
    if (kluc >= koniec) break;
    mm++;
    if (mm > 12) { mm = 1; r++; }
  }
  return von;
}

/** Aktívni, teda tí, komu sa ešte dá napísať. */
export const aktivni = (o: Odberatel[]) => o.filter((x) => x.status === "active").length;


/**
 * ZOSTAVA ZOZNAMU PO EXPORTE — kto je kto a kto ho naozaj číta.
 *
 * Jerry, 27. 10. 2026, pred zrušením MailerLite. Sú to tie isté čísla pre
 * obrazovku aj pre Jarvisa; druhá kópia by sa o mesiac rozišla.
 */
export function zostavaZoznamu(odb: Odberatel[]): {
  spolu: number; aktivni: number; odhlaseni: number; nedorucitelni: number;
  klientov: number; citaju: number; odhlaseniKlienti: number;
} {
  const poc = (s: string) => odb.filter((o) => o.status === s).length;
  return {
    spolu: odb.length,
    aktivni: poc("active"),
    odhlaseni: poc("unsubscribed"),
    nedorucitelni: poc("bounced"),
    klientov: odb.filter((o) => o.klient).length,
    // „Číta" = aspoň raz otvoril ktorýkoľvek mail. Je to dolná hranica:
    // otvorenie sa meria obrázkom, ktorý časť schránok nenačíta.
    citaju: odb.filter((o) => o.status === "active" && (o.otvoreni || 0) > 0).length,
    odhlaseniKlienti: odb.filter((o) => o.status === "unsubscribed" && o.klient).length,
  };
}
