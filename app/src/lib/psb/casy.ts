/**
 * Kedy publikovať — z vlastných dát, nie z článkov na internete.
 *
 * PREČO TO STOJÍ ZA TO
 *
 * Zo všetkého, čo sa v marketingu meria, je toto jediná páka, ktorá nič
 * nestojí a nemení to, čo Jerry hovorí. Zmeniť tému znamená napísať nový text;
 * zmeniť hodinu znamená posunúť tlačidlo.
 *
 * PREČO NIE „NAJLEPŠÍ ČAS PODĽA ŠTÚDIÍ"
 *
 * Odporúčania typu „publikuj o 18:00" sú priemery cez milióny účtov, medzi
 * ktorými nie je ani jeden fyzioterapeut z Brna. Vlastných dvesto príspevkov
 * povie viac než cudzí milión — a keď nepovie, má sa mlčať.
 *
 * PREČO MEDIÁN A NIE PRIEMER
 *
 * Jeden reel s dosahom 40 000 by priemer svojho pásma vytiahol tak, že by
 * neplatil pre žiadny iný príspevok v ňom. Medián hovorí o bežnom kuse.
 *
 * PREČO SA NEVYHLASUJE VÍŤAZ, KEĎ JE ROZDIEL MALÝ
 *
 * Pásmo s piatimi príspevkami vyhrá ľahko a náhodne. Bez dosť veľkého vzorku
 * a dosť veľkého rozdielu je „najlepší čas" povera s grafom.
 */

export type Kus = { cas: string; datum: string; dosah: number };

export type Pasmo = { pasmo: string; od: number; do: number; kusov: number; medianDosah: number };
export type Den = { den: string; kusov: number; medianDosah: number };

export type Vysledok = {
  /** Koľko príspevkov má vôbec zapísaný čas. */
  sCasom: number;
  /** Prečo sa nedá odpovedať. Prázdne, keď sa dá. */
  malo: string;
  pasma: Pasmo[];
  dni: Den[];
  /** Veta, ktorá sa dá poslúchnuť. Prázdna, keď na ňu nie je dosť dôkazu. */
  zaver: string;
};

/**
 * Pásma dňa, nie jednotlivé hodiny.
 *
 * Pri hodinách by na každú pripadlo desať príspevkov a rozdiely by boli šum.
 * Päť pásiem je najjemnejšie delenie, ktoré ešte niečo unesie.
 */
const PASMA: { pasmo: string; od: number; do: number }[] = [
  { pasmo: "ráno 6–11", od: 6, do: 11 },
  { pasmo: "obed 11–15", od: 11, do: 15 },
  { pasmo: "popoludní 15–19", od: 15, do: 19 },
  { pasmo: "večer 19–23", od: 19, do: 23 },
  { pasmo: "noc 23–6", od: 23, do: 6 },
];

const DNI = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"];

/** Koľko príspevkov s časom treba, aby sa vôbec začalo počítať. */
const MINIMUM = 20;

/** Koľko kusov musí mať pásmo, aby sa o ňom dalo hovoriť. */
const V_PASME = 5;

/** O koľko musí víťaz prekonať celkový medián, aby to nebola náhoda. */
const NASOBOK = 1.25;

/** Koľko kusov musí mať víťazné pásmo, aby sa vyhlásil. */
const NA_ZAVER = 8;

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

const hodina = (cas: string): number | null => {
  const m = /^(\d{1,2}):\d{2}/.exec(cas.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
};

/** Pásmo, do ktorého hodina patrí. Noc prechádza cez polnoc. */
const doPasma = (h: number) =>
  PASMA.find((p) => (p.od < p.do ? h >= p.od && h < p.do : h >= p.od || h < p.do));

export function kedyPublikovat(kusy: Kus[]): Vysledok {
  const sCasom = kusy.filter((k) => hodina(k.cas) !== null);

  if (sCasom.length < MINIMUM) {
    return {
      sCasom: sCasom.length,
      malo: sCasom.length === 0
        ? "Príspevky nemajú zapísaný čas. Stiahni Instagram znova — odvtedy sa ukladá."
        : `Času má zatiaľ ${sCasom.length} príspevkov, na odpoveď treba aspoň ${MINIMUM}.`,
      pasma: [], dni: [], zaver: "",
    };
  }

  const pasma: Pasmo[] = PASMA.map((p) => {
    const v = sCasom.filter((k) => doPasma(hodina(k.cas)!)?.pasmo === p.pasmo);
    return { ...p, kusov: v.length, medianDosah: median(v.map((k) => k.dosah)) };
  }).filter((p) => p.kusov > 0);

  const dni: Den[] = DNI.map((den, i) => {
    const v = sCasom.filter((k) => {
      const d = new Date(`${k.datum}T12:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.getUTCDay() === i;
    });
    return { den, kusov: v.length, medianDosah: median(v.map((k) => k.dosah)) };
  }).filter((d) => d.kusov > 0);

  // Záver len z pásiem, ktoré niečo unesú — a len keď je rozdiel zreteľný.
  const celkovy = median(sCasom.map((k) => k.dosah));
  const uneslo = pasma.filter((p) => p.kusov >= V_PASME);
  const najlepsie = [...uneslo].sort((a, b) => b.medianDosah - a.medianDosah)[0];
  const zaver = najlepsie && najlepsie.kusov >= NA_ZAVER && celkovy > 0
    && najlepsie.medianDosah >= celkovy * NASOBOK
    ? `Príspevky v pásme ${najlepsie.pasmo} majú bežne dosah ${Math.round(najlepsie.medianDosah).toLocaleString("sk")} oproti ${Math.round(celkovy).toLocaleString("sk")} celkovo — z ${najlepsie.kusov} kusov. Stojí za to skúsiť tam posunúť aj zvyšok.`
    : "";

  return {
    sCasom: sCasom.length,
    malo: "",
    pasma: pasma.sort((a, b) => b.medianDosah - a.medianDosah),
    dni: dni.sort((a, b) => b.medianDosah - a.medianDosah),
    zaver,
  };
}
