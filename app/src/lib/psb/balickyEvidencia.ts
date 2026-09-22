/**
 * Vlastná evidencia balíčkov — druhá polovica odchodu od PTmindera.
 *
 * PREČO
 *
 * Dochádzku kalendár unesie (meradlo v `porovnanieDochadzky.ts`: 296 sedení,
 * jeden rozdiel). Lenže dochádzku nemožno vypnúť samostatne: keď Jerry
 * prestane zapisovať tréningy do PTmindera, prestanú mu tam klesať hodiny na
 * balíčkoch a zostatky, ktoré Kokpit z exportu číta, sa stanú nepravdou.
 * Preto musí Kokpit vedieť zostatok sám — a najprv to musí DOKÁZAŤ vedľa
 * PTmindera, nie namiesto neho.
 *
 * ZÁZNAM V KNIHE, NIE SNÍMKA
 *
 * `balicky` drží to, čo sa PREDALO (hodiny, platnosť, cena). Zostatok je
 * odvodenina: predané mínus odtrénované podľa kalendára. Ukladať zostatok by
 * znamenalo snímku, ktorá po prvom tréningu klame — tú chybu má appka
 * zdokumentovanú pri Sofiinom barteri.
 *
 * ČO SA POROVNÁVA A PREČO PO KLIENTOVI, NIE PO BALÍČKU
 *
 * Klient môže mať dva balíčky naraz (Gažo, 24. 7. 2026: „platí 18 h na
 * 6 mesiacov, ale minie ich skôr, takže má akoby dve členstvá"). V deň
 * prekryvu sa z dát NEZISTÍ, ktorému z nich PTminder hodinu strhol — to je
 * v CLAUDE.md napísané aj s dôvodom. Porovnávať po balíčku by preto vyrábalo
 * rozdiely, ktoré nikto neopraví. Porovnáva sa SÚČET za klienta; ten je
 * jednoznačný.
 *
 * K DÁTUMU EXPORTU, NIE K DNEŠKU
 *
 * Prvé ostré porovnanie (22. 9. 2026) hlásilo 59 rozdielov a takmer všetky
 * boli −1 h. Nebola to chyba výpočtu: export bol z 20. 9. a Kokpit rátal aj
 * tréningy z 21. a 22. 9., ktoré PTminder ešte nevidel. Porovnanie preto
 * ráta odtrénované LEN po posledný deň exportu — inak meria vek súboru,
 * nie zhodu. Je to to isté pravidlo ako v `porovnanieDochadzky.ts`.
 *
 * KDE PTMINDER MLČÍ
 *
 * Offline členstvá vyváža PTminder ako `0 left from 0`. Tam export nehovorí
 * nulu, nehovorí nič — a rozdiel proti takému riadku by bol vymyslený.
 * Takí klienti majú `stav: "ptminderMlci"` a do počtu rozdielov nejdú.
 */

import { normName } from "./format";

export type Balicek = {
  id: string;
  klient: string;
  nazov: string;
  /** NULL = paušál bez limitu; zostatok sa nepočíta. */
  hodiny: number | null;
  platnostOd: string;
  platnostDo: string | null;
  cenaCzk: number | null;
  zdroj: string;
  zruseneAt: string | null;
};

export type PtBalicek = {
  klient: string;
  nazov: string;
  zostava: number;
  spolu: number;
  platnostOd: string;
  platnostDo: string;
};

type Udalost = { klient: string | null; zaciatok: string; typ: string | null };

const den = (s: string) => (s || "").slice(0, 10);

export const jeAktivny = (b: Balicek, dnes: string): boolean =>
  !b.zruseneAt && b.platnostOd <= dnes && (!b.platnostDo || b.platnostDo >= dnes);

/**
 * Koľko tréningov klient odtrénoval v danom okne.
 *
 * Počítajú sa len tréningy, ktoré UŽ PREBEHLI — objednaná hodina zajtra nie
 * je minutá hodina. Dnešok sa počíta celý: hodina, ktorá dnes prebehla, je
 * minutá, nech si export myslí čokoľvek (to isté pravidlo ako v Balíčkoch).
 */
export function odtrenovane(udalosti: Udalost[], klient: string, od: string, do_: string): number {
  const k = normName(klient);
  return udalosti.filter((u) =>
    u.klient && (u.typ === "trening" || u.typ === "uvodny")
    && normName(u.klient) === k
    && den(u.zaciatok) >= od && den(u.zaciatok) <= do_).length;
}

export type RiadokPorovnania = {
  klient: string;
  balicky: { nazov: string; hodiny: number | null; platnostDo: string | null }[];
  /** Súčet predaných hodín aktívnych balíčkov; NULL keď je medzi nimi paušál. */
  predane: number | null;
  odtrenovane: number;
  kokpit: number | null;
  ptminder: number | null;
  rozdiel: number | null;
  stav: "sedi" | "rozdiel" | "ptminderMlci" | "pausal" | "lenKokpit" | "lenPtminder";
};

export function porovnajBalicky(
  vlastne: Balicek[],
  ptminder: PtBalicek[],
  udalosti: Udalost[],
  dnes: string = new Date().toISOString().slice(0, 10),
  /** Posledný deň, ktorý export z PTmindera pokrýva. Po ňom sa neporovnáva. */
  poExport: string = dnes,
): { riadky: RiadokPorovnania[]; spolu: number; sedi: number; rozdiel: number; mlci: number; poExport: string } {
  const kluc = (m: string) => normName(m);
  const mojePodla = new Map<string, Balicek[]>();
  for (const b of vlastne) {
    if (!jeAktivny(b, dnes)) continue;
    const k = kluc(b.klient);
    if (!mojePodla.has(k)) mojePodla.set(k, []);
    mojePodla.get(k)!.push(b);
  }
  const ptPodla = new Map<string, PtBalicek[]>();
  for (const p of ptminder) {
    if (p.platnostDo && p.platnostDo < dnes) continue;
    if (p.platnostOd && p.platnostOd > dnes) continue;
    const k = kluc(p.klient);
    if (!ptPodla.has(k)) ptPodla.set(k, []);
    ptPodla.get(k)!.push(p);
  }

  const riadky: RiadokPorovnania[] = [];
  for (const k of new Set([...mojePodla.keys(), ...ptPodla.keys()])) {
    const moje = mojePodla.get(k) || [];
    const pt = ptPodla.get(k) || [];
    const meno = moje[0]?.klient || pt[0]?.klient || k;

    if (!moje.length) {
      // Riadok v exporte, na ktorom nič nezostáva, nie je nález. PTminder
      // hovorí nulu, Kokpit nemá nič — to je tá istá odpoveď, nie rozdiel.
      // Bez tejto vetvy hlásila karta 24 „chýbajúcich" klientov, ktorým
      // v skutočnosti nezostávala ani hodina.
      const zostava = pt.reduce((a, p) => a + p.zostava, 0);
      if (zostava <= 0) continue;
      riadky.push({
        klient: meno, balicky: [], predane: null, odtrenovane: 0,
        kokpit: null, ptminder: zostava, rozdiel: null, stav: "lenPtminder",
      });
      continue;
    }

    const pausal = moje.some((b) => b.hodiny == null);
    const predane = pausal ? null : moje.reduce((a, b) => a + (b.hodiny || 0), 0);
    // Okno je zjednotenie platností aktívnych balíčkov: pri prekryve sa
    // nedá povedať, ktorému balíčku hodina patrí, ale súčet je jednoznačný.
    const od = moje.reduce((a, b) => (b.platnostOd < a ? b.platnostOd : a), moje[0].platnostOd);
    const odtren = odtrenovane(udalosti, meno, od, poExport < dnes ? poExport : dnes);
    const kokpit = predane == null ? null : Math.max(0, predane - odtren);

    const balicky = moje.map((b) => ({ nazov: b.nazov, hodiny: b.hodiny, platnostDo: b.platnostDo }));
    if (pausal) {
      riadky.push({ klient: meno, balicky, predane, odtrenovane: odtren, kokpit: null, ptminder: null, rozdiel: null, stav: "pausal" });
      continue;
    }
    if (!pt.length) {
      riadky.push({ klient: meno, balicky, predane, odtrenovane: odtren, kokpit, ptminder: null, rozdiel: null, stav: "lenKokpit" });
      continue;
    }
    // Export, ktorý na VŠETKÝCH riadkoch klienta stojí na 0/0, nehovorí nulu
    // — nehovorí nič. Rozdiel proti nemu by bol vymyslený.
    const mlci = pt.every((p) => p.zostava === 0 && p.spolu === 0);
    if (mlci) {
      riadky.push({ klient: meno, balicky, predane, odtrenovane: odtren, kokpit, ptminder: null, rozdiel: null, stav: "ptminderMlci" });
      continue;
    }
    const ptSpolu = pt.reduce((a, p) => a + p.zostava, 0);
    const rozdiel = (kokpit as number) - ptSpolu;
    riadky.push({
      klient: meno, balicky, predane, odtrenovane: odtren,
      kokpit, ptminder: ptSpolu, rozdiel, stav: rozdiel === 0 ? "sedi" : "rozdiel",
    });
  }

  riadky.sort((a, b) => Math.abs(b.rozdiel ?? 0) - Math.abs(a.rozdiel ?? 0) || a.klient.localeCompare(b.klient, "sk"));
  return {
    riadky,
    spolu: riadky.length,
    sedi: riadky.filter((r) => r.stav === "sedi").length,
    rozdiel: riadky.filter((r) => r.stav === "rozdiel" || r.stav === "lenPtminder").length,
    mlci: riadky.filter((r) => r.stav === "ptminderMlci" || r.stav === "pausal").length,
    poExport,
  };
}
