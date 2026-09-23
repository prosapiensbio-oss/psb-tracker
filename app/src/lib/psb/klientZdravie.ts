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
  /** Vysvetlenie pod pásom; prázdne = netreba nič dodávať. */
  detail: string;
  tón: "dobre" | "vsimnut" | "zle" | "nevieme";
};

export type Zdravie = { signaly: Signal[]; zaver: string; tón: "dobre" | "vsimnut" | "zle" | "nevieme" };

const podiel = (v: number, max: number) => Math.max(0, Math.min(1, max ? v / max : 0));

export function zdravieKlienta(
  c: ClientAgg,
  ostatni: ClientAgg[],
  vstupy: {
    /** Tréningy za posledných 90 dní a za 90 dní pred nimi. */
    tempoTeraz: number;
    tempoPredtym: number;
    /** Zrušené tréningy za 90 dní. */
    zrusene: number;
    /** Dní od posledného tréningu a obvyklý odstup medzi nimi. */
    dniOdPosledneho: number | null;
    obvyklyOdstup: number | null;
    /** Koľko balíčkov klient obnovil a koľko ich mohol obnoviť. */
    obnovil: number;
    mohol: number;
    /** Priemerné zrušené za 90 dní naprieč klientelou. */
    zrusenePriemer: number;
  },
): Zdravie {
  const priemerTempa = ostatni.length
    ? ostatni.reduce((a, x) => a + (x.sessionCount || 0), 0) / ostatni.length / Math.max(1, mesiacov(c))
    : 0;
  const maxTempo = Math.max(vstupy.tempoTeraz, vstupy.tempoPredtym, priemerTempa, 1) * 1.2;

  const zmenaTempa = vstupy.tempoPredtym > 0
    ? Math.round(((vstupy.tempoTeraz - vstupy.tempoPredtym) / vstupy.tempoPredtym) * 100)
    : 0;

  const signaly: Signal[] = [
    {
      id: "tempo",
      nazov: "Tempo",
      hodnota: `${vstupy.tempoTeraz.toFixed(1)} / mes.`,
      podiel: podiel(vstupy.tempoTeraz, maxTempo),
      priemer: podiel(priemerTempa, maxTempo),
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
      podiel: 1 - podiel(vstupy.zrusene, Math.max(4, vstupy.zrusene + 1)),
      priemer: 1 - podiel(vstupy.zrusenePriemer, Math.max(4, vstupy.zrusene + 1)),
      detail: `priemer klientely ${vstupy.zrusenePriemer.toFixed(1)}`,
      tón: vstupy.zrusene === 0 ? "dobre" : vstupy.zrusene > vstupy.zrusenePriemer * 2 ? "zle" : vstupy.zrusene > vstupy.zrusenePriemer ? "vsimnut" : "dobre",
    },
    (() => {
      const d = vstupy.dniOdPosledneho, o = vstupy.obvyklyOdstup;
      // Bolesť sa v PSB nemeria (Jerry, 23. 9. 2026) — signál na jej mieste
      // hovorí to, čo sa naozaj dá zistiť: či už nemal byť dávno tu.
      if (d == null || o == null || o <= 0) {
        return {
          id: "medzera" as const, nazov: "Od posledného tréningu", hodnota: d == null ? "—" : `${d} dní`,
          podiel: 0, priemer: 0, detail: "krátka história, odstup sa ešte nedá porovnať", tón: "nevieme" as const,
        };
      }
      const nasobok = d / o;
      return {
        id: "medzera" as const, nazov: "Od posledného tréningu", hodnota: `${d} dní`,
        // Menej je lepšie; mierka sa obracia, tak ako pri zrušených.
        podiel: 1 - podiel(d, Math.max(o * 3, d + 1)),
        priemer: 1 - podiel(o, Math.max(o * 3, d + 1)),
        detail: `obvykle chodí každých ${Math.round(o)} dní`,
        tón: nasobok >= 2.5 ? "zle" as const : nasobok >= 1.5 ? "vsimnut" as const : "dobre" as const,
      };
    })(),
    {
      id: "obnovy",
      nazov: "Obnovy balíčka",
      hodnota: vstupy.mohol ? `${vstupy.obnovil} z ${vstupy.mohol}` : "zatiaľ prvý",
      podiel: vstupy.mohol ? podiel(vstupy.obnovil, vstupy.mohol) : 0.5,
      priemer: 0.7,
      detail: vstupy.mohol ? (vstupy.obnovil === vstupy.mohol ? "nikdy nevynechal" : `${vstupy.mohol - vstupy.obnovil}× nechal prestávku`) : "",
      tón: !vstupy.mohol ? "nevieme" : vstupy.obnovil === vstupy.mohol ? "dobre" : vstupy.obnovil / vstupy.mohol < 0.6 ? "zle" : "vsimnut",
    },
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
