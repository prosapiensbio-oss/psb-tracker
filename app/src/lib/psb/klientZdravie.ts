/**
 * Zdravie vzťahu s klientom — štyri signály a jedna veta.
 *
 * Jerry si 23. 9. 2026 vybral kombináciu návrhov 3 a 5: štyri signály
 * odchodu, každý s mierkou (kde na nej stojí tento klient oproti ostatným).
 * Dôvod, prečo spolu: signál bez mierky nič nehovorí — „tempo 3,0" je veľa
 * alebo málo len oproti tomu, ako chodia ostatní, a to je pravidlo, ktoré
 * má appka napísané už pri profile (21. 9. 2026).
 *
 * ČO TO NEROBÍ
 *
 * Nepredpovedá odchod. Hovorí, čo sa u toho klienta zmenilo a ako to vyzerá
 * vedľa ostatných; záver „riziko stredné" je zhrnutie tých štyroch riadkov,
 * nie model. Appka má vlastné pravidlo o tom, že číslo bez akcie je
 * zbytočné — preto je pri každom signále napísané, čo ho zhoršilo.
 */

import type { ClientAgg } from "./compute";

export type Signal = {
  id: "tempo" | "zrusene" | "medzera" | "obnovy";
  nazov: string;
  /** Hodnota klienta ako text pre človeka. */
  hodnota: string;
  /** 0..1 — kde stojí na mierke; 1 = najlepšie. */
  podiel: number;
  /** 0..1 — kde je na tej istej mierke priemer klientely. */
  priemer: number;
  /** Čo znamená sivá čiarka na páse. Prázdne = pás mierku nemá. */
  mierka: string;
  /** Vysvetlenie pod pásom; prázdne = netreba nič dodávať. */
  detail: string;
  tón: "dobre" | "vsimnut" | "zle" | "nevieme";
};

/**
 * Priemery celej klientely — počítajú sa RAZ, nie pri každom klientovi.
 *
 * Prvá verzia delila počet sedení OSTATNÝCH klientov počtom mesiacov TOHTO
 * klienta, takže „priemer klientely" vychádzal zakaždým inak podľa toho,
 * koho si človek otvoril. Jerry to 23. 9. 2026 zbadal na prvý pohľad:
 * „nezdá sa mi, že by tam boli priemery, pôsobí to náhodne."
 */
export type PriemeryKlientely = {
  /** Priemerné tempo (tréningov za mesiac) za posledných 90 dní. */
  tempo: number;
  /** Priemerný počet zrušených tréningov na klienta za 90 dní. */
  zrusene: number;
  /** Podiel obnovených balíčkov naprieč klientelou, 0..1. */
  obnovy: number;
};

export type Zdravie = { signaly: Signal[]; zaver: string; tón: "dobre" | "vsimnut" | "zle" | "nevieme" };

const podiel = (v: number, max: number) => Math.max(0, Math.min(1, max ? v / max : 0));

export function zdravieKlienta(
  c: ClientAgg,
  vstupy: {
    /** Tréningy za posledných 90 dní a za 90 dní pred nimi. */
    tempoTeraz: number;
    tempoPredtym: number;
    /** Zrušené tréningy za 90 dní. */
    zrusene: number;
    /** Dní od posledného tréningu a jeho OBVYKLÝ odstup (medián). */
    dniOdPosledneho: number | null;
    obvyklyOdstup: number | null;
    /** Koľko balíčkov po sebe nadviazalo a koľko ich mohlo. */
    obnovil: number;
    mohol: number;
    /** Priemery klientely — počítajú sa RAZ nad všetkými, nie tu. */
    priemery: PriemeryKlientely;
  },
): Zdravie {
  const maxTempo = Math.max(vstupy.tempoTeraz, vstupy.tempoPredtym, vstupy.priemery.tempo, 1) * 1.2;
  const zmenaTempa = vstupy.tempoPredtym > 0
    ? Math.round(((vstupy.tempoTeraz - vstupy.tempoPredtym) / vstupy.tempoPredtym) * 100)
    : 0;
  const maxZrusene = Math.max(4, vstupy.zrusene + 1, vstupy.priemery.zrusene * 2);

  const signaly: Signal[] = [
    {
      id: "tempo",
      nazov: "Tempo",
      hodnota: `${vstupy.tempoTeraz.toFixed(1)} / mes.`,
      podiel: podiel(vstupy.tempoTeraz, maxTempo),
      priemer: podiel(vstupy.priemery.tempo, maxTempo),
      mierka: `priemer klientely ${vstupy.priemery.tempo.toFixed(1)}`,
      detail: vstupy.tempoPredtym > 0
        ? `${vstupy.tempoPredtym.toFixed(1)} → ${vstupy.tempoTeraz.toFixed(1)} za pol roka`
        : "kratšia história, než aby sa dal porovnať trend",
      tón: vstupy.tempoPredtym <= 0 ? "nevieme" : zmenaTempa <= -25 ? "zle" : zmenaTempa <= -10 ? "vsimnut" : "dobre",
    },
    {
      id: "zrusene",
      nazov: "Zrušené tréningy",
      hodnota: `${vstupy.zrusene} za 90 dní`,
      // Menej je lepšie — mierka sa preto obracia.
      podiel: 1 - podiel(vstupy.zrusene, maxZrusene),
      priemer: 1 - podiel(vstupy.priemery.zrusene, maxZrusene),
      mierka: `priemer klientely ${vstupy.priemery.zrusene.toFixed(1)}`,
      detail: vstupy.zrusene === 0 ? "nezrušil ani jeden" : "",
      tón: vstupy.zrusene === 0 ? "dobre" : vstupy.zrusene > vstupy.priemery.zrusene * 2 ? "zle" : vstupy.zrusene > vstupy.priemery.zrusene ? "vsimnut" : "dobre",
    },
    (() => {
      const d = vstupy.dniOdPosledneho, o = vstupy.obvyklyOdstup;
      // Bolesť sa v PSB nemeria (Jerry, 23. 9. 2026) — signál na jej mieste
      // hovorí to, čo sa naozaj dá zistiť: či už nemal byť dávno tu.
      //
      // Mierkou je JEHO vlastný rytmus, nie priemer klientely. Kto chodí raz
      // za dva týždne, nemešká, keď je desať dní preč — a porovnávať ho
      // s niekým, kto chodí dvakrát týždenne, by klamalo.
      if (d == null || o == null || o <= 0) {
        return {
          id: "medzera" as const, nazov: "Od posledného tréningu", hodnota: d == null ? "—" : `${d} dní`,
          podiel: 0, priemer: 0, mierka: "", detail: "krátka história, odstup sa ešte nedá porovnať", tón: "nevieme" as const,
        };
      }
      const max = Math.max(o * 3, d + 1);
      return {
        id: "medzera" as const, nazov: "Od posledného tréningu", hodnota: `${d} dní`,
        podiel: 1 - podiel(d, max),
        priemer: 1 - podiel(o, max),
        mierka: `jeho obvyklý odstup ${Math.round(o)} dní`,
        detail: "",
        tón: d / o >= 2.5 ? "zle" as const : d / o >= 1.5 ? "vsimnut" as const : "dobre" as const,
      };
    })(),
    (() => {
      /**
       * Obnova = po skončení balíčka začal ďalší do mesiaca.
       *
       * Prvá verzia posielala `obnovil = mohol`, takže každému vychádzalo
       * 100 % — číslo, ktoré je u všetkých rovnaké, nie je signál, je to
       * ozdoba. Jerry sa 23. 9. 2026 oprávnene pýtal, čo to vlastne znamená.
       */
      if (vstupy.mohol <= 0) {
        return {
          id: "obnovy" as const, nazov: "Obnovy balíčka", hodnota: "zatiaľ prvý",
          podiel: 0, priemer: 0, mierka: "", detail: "na obnovu ešte nemal príležitosť", tón: "nevieme" as const,
        };
      }
      const pomer = vstupy.obnovil / vstupy.mohol;
      return {
        id: "obnovy" as const, nazov: "Obnovy balíčka",
        hodnota: `${vstupy.obnovil} z ${vstupy.mohol}`,
        podiel: pomer,
        priemer: vstupy.priemery.obnovy,
        mierka: `priemer klientely ${Math.round(vstupy.priemery.obnovy * 100)} %`,
        detail: vstupy.obnovil === vstupy.mohol ? "nadviazal vždy do mesiaca" : `${vstupy.mohol - vstupy.obnovil}× nechal dlhšiu prestávku`,
        tón: pomer >= 0.99 ? "dobre" as const : pomer < 0.6 ? "zle" as const : "vsimnut" as const,
      };
    })(),
  ];

  const zle = signaly.filter((x) => x.tón === "zle").length;
  const vsimnut = signaly.filter((x) => x.tón === "vsimnut").length;
  const tón: Zdravie["tón"] = zle >= 2 ? "zle" : zle === 1 || vsimnut >= 2 ? "vsimnut" : "dobre";
  const zlé = signaly.filter((x) => x.tón === "zle" || x.tón === "vsimnut").map((x) => x.nazov.toLowerCase());
  const dobré = signaly.filter((x) => x.tón === "dobre").map((x) => x.nazov.toLowerCase());

  const zaver = tón === "dobre"
    ? "Nič nenaznačuje, že by odchádzal."
    : `${zle >= 2 ? "Pozor" : "Stojí za pohľad"}: ${zlé.join(" a ")} ${zlé.length > 1 ? "sa zhoršili" : "sa zhoršilo"}${dobré.length ? `, ale ${dobré.join(" a ")} drží` : ""}.`;

  return { signaly, zaver, tón };
}

function mesiacov(c: ClientAgg): number {
  if (!c.firstSession) return 1;
  return Math.max(1, (Date.now() - Date.parse(c.firstSession)) / (1000 * 60 * 60 * 24 * 30.44));
}
