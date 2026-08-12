/**
 * Štatistiky mesačného radu — a rozdiel medzi STAVOM a TOKOM.
 *
 * PREČO TO NIE JE JEDEN VZOREC PRE VŠETKO
 *
 * „Priemerný počet sledovateľov za 17 mesiacov" je číslo bez významu.
 * Sledovatelia sa kumulujú, takže ich priemer hovorí len o tom, kedy sa
 * meralo — a „najlepší mesiac" by vždy vyšiel ten posledný. Čo o nich niečo
 * hovorí, je PRÍRASTOK: koľko ich za mesiac pribudlo.
 *
 * Videnia, dosah, výdavok a návštevníci sú toky: každý mesiac začínajú od
 * nuly a ich priemer aj rekordy dávajú zmysel priamo.
 *
 * Preto má každá metrika druh a štatistiky sa počítajú nad tým radom, ktorý
 * pre ňu niečo znamená. Bez toho by karta tvrdila, že najlepší mesiac
 * sledovateľov je vždy ten posledný — čo je pravda a zároveň úplne zbytočná.
 */

export type Bod = { m: string; v: number };
export type Druh = "stav" | "tok";

export type Statistiky = {
  /** Rad, nad ktorým sa počítalo — pri stave sú to prírastky, nie úrovne. */
  rad: Bod[];
  druh: Druh;
  mesiacov: number;
  priemer: number;
  median: number;
  najlepsi: Bod | null;
  najhorsi: Bod | null;
  posledny: Bod | null;
  /** Zmena posledného mesiaca oproti predošlému, v %. */
  zmena: number | null;
  /** O koľko % je posledný mesiac nad/pod priemerom zvyšku. */
  odchylka: number | null;
  /** Súčet — dáva zmysel pri tokoch (koľko sa spolu minulo), nie pri stave. */
  sucet: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Zmena v %; `null`, keď sa nedá deliť — nie nula, tá by znamenala „bez zmeny". */
export function zmenaPct(z: number, na: number): number | null {
  if (!Number.isFinite(z) || !Number.isFinite(na) || z === 0) return null;
  return ((na - z) / Math.abs(z)) * 100;
}

/** Zo stavu spraví rad prírastkov. Prvý mesiac vypadne — nemá sa od čoho odraziť. */
export function prirastky(body: Bod[]): Bod[] {
  const z = [...body].sort((a, b) => a.m.localeCompare(b.m));
  return z.slice(1).map((b, i) => ({ m: b.m, v: b.v - z[i].v }));
}

export function statistiky(body: Bod[], druh: Druh = "tok"): Statistiky {
  const zoradene = [...body].filter((b) => Number.isFinite(b.v)).sort((a, b) => a.m.localeCompare(b.m));
  const rad = druh === "stav" ? prirastky(zoradene) : zoradene;
  const prazdne: Statistiky = {
    rad, druh, mesiacov: rad.length, priemer: 0, median: 0,
    najlepsi: null, najhorsi: null, posledny: null, zmena: null, odchylka: null, sucet: 0,
  };
  if (!rad.length) return prazdne;

  const hodnoty = rad.map((b) => b.v);
  const sucet = hodnoty.reduce((a, v) => a + v, 0);
  const priemer = sucet / rad.length;
  const posledny = rad[rad.length - 1];
  const predosly = rad.length > 1 ? rad[rad.length - 2] : null;

  // Odchýlka sa meria voči ZVYŠKU, nie voči priemeru vrátane seba. Inak sa
  // mesiac porovnáva sám so sebou a pri krátkom rade to výsledok stlačí.
  const zvysok = hodnoty.slice(0, -1);
  const priemerZvysku = zvysok.length ? zvysok.reduce((a, v) => a + v, 0) / zvysok.length : null;

  let najlepsi = rad[0];
  let najhorsi = rad[0];
  for (const b of rad) {
    if (b.v > najlepsi.v) najlepsi = b;
    if (b.v < najhorsi.v) najhorsi = b;
  }

  return {
    rad, druh, mesiacov: rad.length,
    priemer, median: median(hodnoty),
    najlepsi, najhorsi, posledny,
    zmena: predosly ? zmenaPct(predosly.v, posledny.v) : null,
    odchylka: priemerZvysku == null ? null : zmenaPct(priemerZvysku, posledny.v),
    sucet,
  };
}

/**
 * Súbežnosti medzi metrikami v jednom mesiaci.
 *
 * PREČO SÚ VETY OPATRNÉ
 *
 * Toto NIE JE príčina a následok. Že v mesiaci s najvyšším výdavkom prišlo
 * najmenej dopytov, neznamená, že to reklama pokazila — mohlo to byť leto,
 * dovolenka alebo náhoda pri piatich dopytoch mesačne. Vety sú preto písané
 * ako pozorovanie („súbeh"), nie ako vysvetlenie, a výklad sa necháva na
 * Jarvisa, ktorý má k tomu kontext.
 *
 * Pri malých číslach sa mlčí úplne: pri troch dopytoch je rozdiel medzi 3 a 5
 * náhoda a veta o „prepade o 40 %" by bola nezmysel s dvoma desatinnými
 * miestami.
 */
export type Suvislost = { text: string; tón: "dobrá" | "zlá" | "neutrálna" };

export function suvislosti(v: {
  dopyty: number; dopytyPriemer: number | null;
  spend: number; spendPriemer: number | null;
  dosah: number; dosahPriemer: number | null;
  noviKlienti: number;
  prispevkov: number; prispevkovPriemer: number | null;
}): Suvislost[] {
  const von: Suvislost[] = [];
  const vyrazne = (h: number, p: number | null) => {
    if (p == null || p <= 0) return null;
    const z = zmenaPct(p, h);
    return z != null && Math.abs(z) >= 25 ? z : null;
  };

  const dSpend = vyrazne(v.spend, v.spendPriemer);
  const dDosah = vyrazne(v.dosah, v.dosahPriemer);
  // Dopyty sa komentujú len tam, kde je z čoho: pri troch kusoch je 40 %
  // jeden človek.
  const dDopyty = v.dopyty >= 5 || (v.dopytyPriemer ?? 0) >= 5 ? vyrazne(v.dopyty, v.dopytyPriemer) : null;
  const dPrispevky = vyrazne(v.prispevkov, v.prispevkovPriemer);

  if (dSpend != null && dDosah != null && dSpend > 0 && dDosah > 0) {
    von.push({ tón: "neutrálna", text: `Výdavok na reklamu aj dosah boli nad priemerom (${dSpend > 0 ? "+" : ""}${Math.round(dSpend)} % a ${Math.round(dDosah)} %) — dosah v tomto mesiaci teda z veľkej časti kupovali peniaze, nie obsah.` });
  } else if (dDosah != null && dDosah > 0 && (dSpend == null || dSpend <= 0)) {
    von.push({ tón: "dobrá", text: `Dosah bol o ${Math.round(dDosah)} % nad priemerom bez toho, aby stúpol výdavok na reklamu — to je organický zásah, nie zaplatený.` });
  }

  if (dDopyty != null && dSpend != null) {
    von.push(dDopyty > 0 && dSpend > 0
      ? { tón: "dobrá", text: `Vyšší výdavok (${Math.round(dSpend)} %) sa stretol s vyšším počtom dopytov (${Math.round(dDopyty)} %). Súbeh, nie dôkaz — ale stojí za pozretie, ktorá kampaň v tom mesiaci bežala.` }
      : dDopyty < 0 && dSpend > 0
        ? { tón: "zlá", text: `Výdavok bol o ${Math.round(dSpend)} % nad priemerom, dopytov prišlo o ${Math.abs(Math.round(dDopyty))} % menej. Peniaze v tomto mesiaci dopyt nekúpili.` }
        : { tón: "neutrálna", text: `Dopyty a výdavok sa v tomto mesiaci hýbali proti sebe (${Math.round(dDopyty)} % vs ${Math.round(dSpend)} %).` });
  }

  if (dPrispevky != null && dPrispevky < -30 && dDosah != null && dDosah < 0) {
    von.push({ tón: "zlá", text: `Publikovalo sa o ${Math.abs(Math.round(dPrispevky))} % menej než obvykle a dosah klesol tiež. Najjednoduchšie vysvetlenie mesiaca býva aj to správne.` });
  }

  if (v.noviKlienti === 0 && v.spend > 0) {
    von.push({ tón: "zlá", text: `Za mesiac nezačal ani jeden nový klient, hoci reklama bežala. Pri jednom mesiaci to ešte nič neznamená — pri troch po sebe áno.` });
  }

  return von;
}
