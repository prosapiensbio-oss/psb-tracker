/**
 * Zdravie vzťahu s klientom — tri signály a jedna veta.
 *
 * Jerry si 23. 9. 2026 vybral kombináciu návrhov 3 a 5: signály odchodu,
 * každý s mierkou (kde na nej stojí tento klient oproti ostatným).
 * Dôvod, prečo spolu: signál bez mierky nič nehovorí — „tempo 3,0" je veľa
 * alebo málo len oproti tomu, ako chodia ostatní, a to je pravidlo, ktoré
 * má appka napísané už pri profile (21. 9. 2026).
 *
 * ČO TO NEROBÍ
 *
 * Nepredpovedá odchod. Hovorí, čo sa u toho klienta zmenilo a ako to vyzerá
 * vedľa ostatných; záver „riziko stredné" je zhrnutie tých riadkov,
 * nie model. Appka má vlastné pravidlo o tom, že číslo bez akcie je
 * zbytočné — preto je pri každom signále napísané, čo ho zhoršilo.
 *
 * ŠTVRTÝ SIGNÁL TU BOL A JE PREČ
 *
 * „Obnovy balíčka" ukazovali percento, ktoré Jerrymu nič nehovorilo ani po
 * oprave výpočtu — u väčšiny klientov vyšlo z jediného páru balíčkov, takže
 * skákalo medzi 0 a 100 % podľa jednej dovolenky. Jerry ho 23. 9. zrušil.
 * To, či klient nadviazal, je vidieť v záložke balíčky ako dátumy.
 */

import type { ClientAgg } from "./compute";

export type Signal = {
  id: "tempo" | "zrusene" | "dochadzka" | "vztah" | "hodinovka";
  nazov: string;
  /** Hodnota klienta ako text pre človeka. */
  hodnota: string;
  /**
   * 0..1 — dĺžka pásu klienta. VIAC ZNAMENÁ VIAC, nie „lepšie".
   *
   * Pôvodne sa hodnota obracala tak, aby dlhší pás vždy znamenal lepšie
   * (menej zrušení = dlhší pás). Jerry to 24. 9. 2026 nazval matúcim
   * a mal pravdu: pás, ktorý raz meria vec a raz jej opak, sa nedá čítať.
   * Teraz pás meria hodnotu a to, či je vyššie lepšie, hovorí `lepsieJeViac`
   * — z toho sa berie iba FARBA.
   */
  podiel: number;
  /** 0..1 — dĺžka pásu priemeru klientely, na tej istej mierke. */
  priemer: number;
  /** Priemer ako text pre človeka („2,8 / mes."). */
  priemerHodnota: string;
  /** Je vyššie číslo lepšie? Pri zrušených tréningoch nie. */
  lepsieJeViac: boolean;
  /** Čo sa s čím porovnáva. Prázdne = porovnanie nemá zmysel. */
  mierka: string;
  /** Vysvetlenie pod pásom; prázdne = netreba nič dodávať. */
  detail: string;
  tón: "dobre" | "vsimnut" | "zle" | "nevieme";
  /**
   * Počíta sa tento riadok do záveru?
   *
   * Dĺžka vzťahu a hodinovka sú KONTEXT, nie varovanie. Nový klient nie je
   * problém a nízka hodinovka je spravidla zľava, ktorú niekto schválil —
   * keby zhoršovali záver, appka by hlásila „pozor" pri každom nováčikovi
   * so zľavou a človek by prestal čítať aj tie riadky, ktoré varovanie sú.
   */
  doZaveru: boolean;
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
  /** Priemerná dochádzka klientely, 0..1. */
  dochadzka: number;
  /** Priemerná dĺžka vzťahu v mesiacoch. */
  vztah: number;
  /** Priemerná cena odtrénovanej hodiny v Kč. */
  hodinovka: number;
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
      priemerHodnota: `${vstupy.priemery.tempo.toFixed(1)} / mes.`,
      lepsieJeViac: true,
      mierka: "priemer aktívnych klientov",
      detail: vstupy.tempoPredtym > 0
        ? `${vstupy.tempoPredtym.toFixed(1)} → ${vstupy.tempoTeraz.toFixed(1)} za pol roka`
        : "kratšia história, než aby sa dal porovnať trend",
      tón: vstupy.tempoPredtym <= 0 ? "nevieme" : zmenaTempa <= -25 ? "zle" : zmenaTempa <= -10 ? "vsimnut" : "dobre",
      doZaveru: true,
    },
    {
      id: "zrusene",
      nazov: "Zrušené tréningy",
      hodnota: `${vstupy.zrusene} za 90 dní`,
      // Pás meria POČET zrušení; že menej je lepšie, hovorí `lepsieJeViac`
      // a prejaví sa to len na farbe. Obracať dĺžku by znamenalo pás, ktorý
      // raz meria vec a raz jej opak.
      podiel: podiel(vstupy.zrusene, maxZrusene),
      priemer: podiel(vstupy.priemery.zrusene, maxZrusene),
      priemerHodnota: `${vstupy.priemery.zrusene.toFixed(1)} za 90 dní`,
      lepsieJeViac: false,
      mierka: "priemer aktívnych klientov",
      detail: vstupy.zrusene === 0 ? "nezrušil ani jeden" : "",
      tón: vstupy.zrusene === 0 ? "dobre" : vstupy.zrusene > vstupy.priemery.zrusene * 2 ? "zle" : vstupy.zrusene > vstupy.priemery.zrusene ? "vsimnut" : "dobre",
      doZaveru: true,
    },
    (() => {
      // DOCHÁDZKA — z ľavého stĺpca sem (Jerry, 23. 9. 2026). Holé „78 %"
      // nehovorí nič; vedľa priemeru klientely áno.
      const moja = c.attendance || 0;
      const p = vstupy.priemery.dochadzka;
      if (!c.sessionCount) {
        return {
          id: "dochadzka" as const, nazov: "Dochádzka", hodnota: "—", podiel: 0, priemer: 0,
          priemerHodnota: "", lepsieJeViac: true,
          mierka: "", detail: "ešte nemá odtrénované", tón: "nevieme" as const, doZaveru: false,
        };
      }
      return {
        id: "dochadzka" as const, nazov: "Dochádzka",
        hodnota: `${Math.round(moja * 100)} %`,
        podiel: podiel(moja, 1), priemer: podiel(p, 1),
        priemerHodnota: `${Math.round(p * 100)} %`,
        lepsieJeViac: true,
        mierka: "priemer aktívnych klientov",
        detail: "koľko z objednaných termínov naozaj odchodil",
        tón: moja >= p ? "dobre" as const : moja >= p * 0.8 ? "vsimnut" as const : "zle" as const,
        doZaveru: true,
      };
    })(),
    (() => {
      // DĹŽKA VZŤAHU — kontext, nie varovanie. Prvé mesiace sú najrizikovejšie
      // a je dobré to vidieť, ale nováčik nie je chyba.
      const m = mesiacovVztahu(c);
      const max = Math.max(vstupy.priemery.vztah * 2, m * 1.2, 12);
      if (!c.firstSession) {
        return {
          id: "vztah" as const, nazov: "Dĺžka vzťahu", hodnota: "—", podiel: 0, priemer: 0,
          priemerHodnota: "", lepsieJeViac: true,
          mierka: "", detail: "zatiaľ bez odtrénovaného tréningu", tón: "nevieme" as const, doZaveru: false,
        };
      }
      return {
        id: "vztah" as const, nazov: "Dĺžka vzťahu",
        hodnota: m >= 12 ? `${(m / 12).toFixed(1)} roka` : `${Math.round(m)} mes.`,
        podiel: podiel(m, max), priemer: podiel(vstupy.priemery.vztah, max),
        priemerHodnota: `${Math.round(vstupy.priemery.vztah)} mes.`,
        lepsieJeViac: true,
        mierka: "priemer aktívnych klientov",
        detail: m < 3 ? "prvé mesiace sú najrizikovejšie" : "",
        tón: m >= vstupy.priemery.vztah ? "dobre" as const : "vsimnut" as const,
        doZaveru: false,
      };
    })(),
    (() => {
      // HODINOVKA — jediný riadok, ktorý hovorí o peniazoch. Tiež kontext:
      // nízka hodinovka je skoro vždy zľava, ktorú niekto vedome dal.
      const h = Math.round(c.avgPrice || 0);
      const p = vstupy.priemery.hodinovka;
      if (!h) {
        return {
          id: "hodinovka" as const, nazov: "Cena hodiny", hodnota: "—", podiel: 0, priemer: 0,
          priemerHodnota: "", lepsieJeViac: true,
          mierka: "", detail: "bez zaplatených hodín sa nedá spočítať", tón: "nevieme" as const, doZaveru: false,
        };
      }
      const max = Math.max(h, p, 1) * 1.2;
      return {
        id: "hodinovka" as const, nazov: "Cena hodiny",
        hodnota: `${h.toLocaleString("cs-CZ")} Kč`,
        podiel: podiel(h, max), priemer: podiel(p, max),
        priemerHodnota: `${Math.round(p).toLocaleString("cs-CZ")} Kč`,
        lepsieJeViac: true,
        mierka: "priemer aktívnych klientov",
        detail: c.specialRate ? "má schválenú špeciálnu sadzbu" : "",
        tón: h >= p ? "dobre" as const : h >= p * 0.8 ? "vsimnut" as const : "zle" as const,
        doZaveru: false,
      };
    })(),
  ];

  const varovne = signaly.filter((x) => x.doZaveru);
  const zle = varovne.filter((x) => x.tón === "zle").length;
  const vsimnut = varovne.filter((x) => x.tón === "vsimnut").length;
  const tón: Zdravie["tón"] = zle >= 2 ? "zle" : zle === 1 || vsimnut >= 2 ? "vsimnut" : "dobre";
  const zlé = varovne.filter((x) => x.tón === "zle" || x.tón === "vsimnut").map((x) => x.nazov.toLowerCase());
  const dobré = varovne.filter((x) => x.tón === "dobre").map((x) => x.nazov.toLowerCase());

  const zaver = tón === "dobre"
    ? "Nič nenaznačuje, že by odchádzal."
    : `${zle >= 2 ? "Pozor" : "Stojí za pohľad"}: ${zlé.join(" a ")} ${zlé.length > 1 ? "sa zhoršili" : "sa zhoršilo"}${dobré.length ? `, ale ${dobré.join(" a ")} drží` : ""}.`;

  return { signaly, zaver, tón };
}

/** Koľko mesiacov klient chodí — od prvého tréningu podnes. */
function mesiacovVztahu(c: ClientAgg): number {
  if (!c.firstSession) return 0;
  return Math.max(0, (Date.now() - Date.parse(c.firstSession)) / (1000 * 60 * 60 * 24 * 30.44));
}
