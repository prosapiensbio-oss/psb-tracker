/**
 * Čo publikovať ďalej — návrhy z toho, čo už appka vie.
 *
 * PREČO TO VZNIKLO
 *
 * Jerryho vlastné pravidlo: číslo bez akcie je zbytočné. Marketing dnes vie
 * povedať, na čo sa ľudia pýtali, čo si prečítali a po čom napísali — a končí
 * pri tom. Táto obrazovka je koniec tej vety: nie „takto to dopadlo", ale
 * „toto napíš najbližšie a preto".
 *
 * PREČO SÚ NÁVRHY TÉMY A NIE TEXTY
 *
 * Texty píše Claude Project, ktorý má štýl a formáty. Kokpit má čísla. Návrh
 * je to, čo medzi nimi prechádza — a je zámerne krátky, aby sa dal vložiť do
 * zadania bez prepisovania.
 *
 * PREČO KAŽDÝ NÁVRH NESIE DÔKAZ
 *
 * Bez neho je to hádanie, ktoré vyzerá ako rada. S ním sa dá nesúhlasiť —
 * a to je celá hodnota: Jerry vidí, na akom čísle návrh stojí, a môže povedať
 * „to číslo je zlé" alebo „tú tému nechcem". Odporúčanie bez dôkazu sa buď
 * poslúchne naslepo, alebo ignoruje; ani jedno nie je dobre.
 *
 * ČO TO NEROBÍ
 *
 * Netvrdí príčinu. Že po príspevku prišiel dopyt, neznamená, že ho priviedol.
 * Formulácie sú preto „stojí za pokus", nie „toto funguje".
 */

export type Prilezitost = { dopyt: string; kliky: number; zobrazenia: number; pozicia: number };

/**
 * Kto na webe tú tému „vlastní".
 *
 * `titulok` = existuje stránka, ktorá je o tom (téma má domov).
 * `zmienka` = slovo sa v texte mihne, ale vlastnú stránku nemá.
 * `null`    = na webe o tom nie je nič.
 */
export type Vlastnik = { url: string; titulok: string; druh: "titulok" | "zmienka" } | null;
/**
 * Stránka, ktorú ľudia naozaj čítajú — meraná Search Console, nie interným
 * prehľadom. Rozdiel je podstatný: 17. 8. 2026 karta navrhla pripomenúť
 * článok s „1 829 zobrazeniami", lenže to bolo číslo z prehľadu článkov za
 * rok 2025, kým v Search Console má tá istá stránka 188 zobrazení a 3 kliky.
 * Jarvis na to zadanie odmietol napísať — a mal pravdu.
 */
export type Clanok = { nazov: string; url?: string; kliky: number; zobrazenia: number };
export type HookVysledok = { kategoria: string; dopytov: number; podiel: number; podielBezne: number };

export type Navrh = {
  /** Krátky nadpis — to, čo sa vloží do zadania. */
  co: string;
  /** Prečo práve toto, jednou vetou. */
  preco: string;
  /** Číslo, na ktorom návrh stojí. Bez neho by to bolo hádanie. */
  dokaz: string;
  /** Odkiaľ to viem — aby sa dalo overiť. */
  zdroj: "vyhľadávanie" | "web" | "obsah" | "tempo";
  /** Poradie riešenia. Nižšie = skôr. */
  poradie: number;
  /**
   * Stály kľúč návrhu — podľa neho si appka pamätá, že je hotový.
   *
   * NESMIE byť odvodený z textu `co`: ten nesie čísla, ktoré sa každý týždeň
   * menia, a odklepnutie by prestalo platiť pri prvom pohybe v Search
   * Console. Preto sa skladá z druhu práce a z toho, čoho sa týka.
   */
  kluc: string;
  /**
   * Na koľko dní sa návrh po odklepnutí schová.
   *
   * NIE navždy — z rovnakého dôvodu ako pri hláseniach (`skryteDo`
   * v kontrolaDat.ts): „hotové" a „už to nechcem vidieť" vyzerajú na
   * obrazovke rovnako a znamenajú opak. Napísaná stránka buď tému prevezme
   * (a návrh zmizne sám, lebo `vlastnik` ju nájde), alebo neprevezme —
   * a vtedy sa to má po čase spýtať znova.
   */
  skryDni: number;
};

/**
 * Ako dlho ktorý druh práce mlčí.
 *
 * Nová stránka a prepis titulku sa v Search Console prejavia rádovo v týždňoch,
 * preto štvrťrok. Pripomenutie hotového textu na Instagrame je práca, ktorá sa
 * po pol roku môže zopakovať a nie je to chyba. Tempo je stav, nie úloha —
 * mesiac stačí.
 */
export const SKRY_DNI = {
  napis: 90,
  prepis: 90,
  rozsir: 90,
  pripomen: 180,
  zaciatok: 60,
  tempo: 30,
} as const;

/** Pod týmto počtom dopytov je podiel kategórie šum, nie signál. */
const DOSŤ_DOPYTOV = 8;

/** O koľko musí kategória prekonať bežný deň, aby to nebola náhoda. */
const ROZDIEL = 8;

/** Koľko návrhov má zmysel ukázať. Dlhší zoznam sa neprečíta. */
const KOĽKO = 6;

const cislo = (n: number) => Math.round(n).toLocaleString("sk");

/**
 * Téma, na ktorú sa web už zobrazuje, ale nikto neklikne.
 *
 * Toto je najlacnejší obsah, aký sa dá napísať: pozícia je zaplatená rokmi
 * a chýba len dôvod kliknúť. Preto sú tieto návrhy prvé.
 */
function zVyhladavania(p: Prilezitost[], vlastnik?: (dopyt: string) => Vlastnik): Navrh[] {
  // NÁVRH MUSÍ SEDIEŤ NA KANÁL AJ NA STAV WEBU.
  //
  // Jerry, 17. 8. 2026: „odporúča mi na Google spraviť reel, ale tam reel
  // nerobia." Reel je Instagram; na to, že sa web zobrazuje v Googli a nikto
  // neklikne, nemá žiadny vplyv. To bola prvá polovica opravy.
  //
  // Druhú polovicu našiel Jarvis pri Jerryho teste v ten istý deň: návrh
  // „prepíš titulok stránky na tému subokcipitálne svaly" nedával zmysel,
  // lebo TAKÁ STRÁNKA NEEXISTUJE — slovo sa len mihne v dvoch článkoch
  // o líniách. Google na ňu pritom drží pozíciu 2,3 pri 849 zobrazeniach.
  // Prepisovať titulok cudzej stránky by tému nezachránilo; toto je žiadosť
  // o novú stránku.
  //
  // Tri stavy, tri rôzne práce:
  //   • stránka o téme JE a drží sa do 10. miesta → chýba dôvod kliknúť,
  //     prepisuje sa titulok a popis;
  //   • stránka JE, ale hlboko → text je slabý, treba ho rozšíriť;
  //   • stránka NIE JE → Google ukazuje zmienku alebo nič, a to je najsilnejší
  //     signál zo všetkých: pozícia je zadarmo a obsah chýba.
  return p.slice(0, 3).map((x, i) => {
    const kto = vlastnik ? vlastnik(x.dopyt) : null;
    const maDomov = kto?.druh === "titulok";
    const naPrvejStrane = x.pozicia <= 10;
    const dokaz = `${cislo(x.zobrazenia)} zobrazení, ${x.kliky} klikov, priemerná pozícia ${x.pozicia.toFixed(1)}`;

    if (!maDomov) {
      return {
        kluc: `obsah|napis|${x.dopyt}`,
        skryDni: SKRY_DNI.napis,
        co: `Napíš stránku na tému „${x.dopyt}"`,
        preco: kto
          ? `Google na túto tému web ukazuje, ale vlastnú stránku o nej nemáš — slovo sa len mihne v článku ${kto.titulok}. Pozíciu máš zadarmo, chýba obsah, ktorý by ju uniesol.`
          : "Ľudia to hľadajú a web sa im ukazuje, hoci o tom nemáš ani stránku. Toto je najlacnejší obsah, aký sa dá napísať — dopyt je overený vopred.",
        dokaz,
        zdroj: "vyhľadávanie" as const,
        poradie: 1 + i * 0.1,
      };
    }

    return {
      // Kľúčom je ADRESA stránky, nie jej titulok — ten sa práve prepisom
      // zmení a odklepnutie by sa hneď stratilo.
      kluc: naPrvejStrane ? `obsah|prepis|${kto.url}` : `obsah|rozsir|${kto.url}|${x.dopyt}`,
      skryDni: naPrvejStrane ? SKRY_DNI.prepis : SKRY_DNI.rozsir,
      co: naPrvejStrane
        ? `Prepíš titulok a popis: ${kto.titulok}`
        : `Rozšír článok ${kto.titulok} o tému „${x.dopyt}"`,
      preco: naPrvejStrane
        ? "Google túto stránku na danú tému ukazuje na prvej strane a ľudia aj tak neklikajú — chýba dôvod, nie pozícia. Nový príspevok na Instagrame s tým nič neurobí; rozhoduje veta vo výsledku hľadania. Hotové návrhy sú v Marketing → Web, karta Titulky na prepis."
        : "Stránka na túto tému existuje, ale drží sa hlboko — text je na dopyt prislabý. Reel to nenahradí, Google indexuje stránky.",
      dokaz,
      zdroj: "vyhľadávanie" as const,
      poradie: 1 + i * 0.1,
    };
  });
}

/**
 * Článok, ktorý ľudia čítajú — ale nič naň neodkazuje.
 *
 * Text, čo už roky funguje, je hotová práca. Pripomenúť ho stojí jeden
 * príspevok a nie napísanie nového.
 */
function zWebu(c: Clanok[]): Navrh[] {
  // Rozhodujú KLIKY, nie zobrazenia. Zobrazenie znamená, že Google stránku
  // ukázal; klik znamená, že sa niekto rozhodol ju otvoriť. Pri pripomínaní
  // hotového textu je podstatné to druhé — pripomínať sa oplatí to, čo si
  // ľudia naozaj vybrali.
  return c.filter((x) => x.kliky > 0).slice(0, 2).map((x, i) => ({
    kluc: `obsah|pripomen|${x.url || x.nazov}`,
    skryDni: SKRY_DNI.pripomen,
    co: `Pripomeň na Instagrame: ${x.nazov}${x.url ? ` (${x.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")})` : ""}`,
    preco: "Tento text si ľudia z Googlu sami otvárajú. Príspevok, ktorý naň odkáže, je hotová práca — nepíše sa nič nové.",
    dokaz: `${cislo(x.kliky)} klikov z Googlu pri ${cislo(x.zobrazenia)} zobrazeniach (Search Console)`,
    zdroj: "web",
    poradie: 2 + i * 0.1,
  }));
}

/**
 * Typ začiatku, po ktorom ľudia písali častejšie než po ostatných.
 *
 * Nie je to dôkaz — je to pozorovanie o súbežnosti. Preto „stojí za pokus".
 */
function zObsahu(h: HookVysledok[]): Navrh[] {
  const najlepsi = h
    .filter((x) => x.dopytov >= DOSŤ_DOPYTOV && x.podiel - x.podielBezne >= ROZDIEL)
    .sort((a, b) => (b.podiel - b.podielBezne) - (a.podiel - a.podielBezne))[0];
  if (!najlepsi) return [];
  return [{
    kluc: `obsah|zaciatok|${najlepsi.kategoria}`,
    skryDni: SKRY_DNI.zaciatok,
    co: `Skús začiatok typu „${najlepsi.kategoria}"`,
    preco: "V dvoch týždňoch pred dopytom bol tento typ začiatku vidieť častejšie než v bežný deň. Nie je to dôkaz, že ho priviedol — ale stojí za pokus.",
    dokaz: `${Math.round(najlepsi.podiel)} % pred dopytmi verzus ${Math.round(najlepsi.podielBezne)} % v bežný deň, ${najlepsi.dopytov} dopytov`,
    zdroj: "obsah",
    poradie: 3,
  }];
}

/**
 * Tempo publikovania proti mesiacom, keď dopytov prišlo najviac.
 *
 * Zámerne posledné a zámerne opatrné: viac príspevkov nie je viac klientov.
 * Ale keď sa tempo prepadne pod úroveň, na ktorej to fungovalo, stojí to
 * za jednu vetu.
 */
function zTempa(prispevkovMesacne: number, prispevkovVSilnychMesiacoch: number | null): Navrh[] {
  if (prispevkovVSilnychMesiacoch == null || prispevkovVSilnychMesiacoch < 4) return [];
  if (prispevkovMesacne >= prispevkovVSilnychMesiacoch * 0.7) return [];
  return [{
    kluc: "obsah|tempo",
    skryDni: SKRY_DNI.tempo,
    co: `Vráť tempo na ${Math.round(prispevkovVSilnychMesiacoch)} príspevkov mesačne`,
    preco: "V mesiacoch s najviac dopytmi si publikoval viac. Nie je to príčina, ale je to jediná vec z tohto zoznamu, ktorú máš plne v rukách.",
    dokaz: `teraz ${prispevkovMesacne.toFixed(1)} mesačne, v najsilnejších mesiacoch ${prispevkovVSilnychMesiacoch.toFixed(1)}`,
    zdroj: "tempo",
    poradie: 4,
  }];
}

export function planObsahu(v: {
  prilezitosti: Prilezitost[];
  /** Kto na webe tú tému vlastní — bez toho sa nedá rozlíšiť prepis od nového textu. */
  vlastnik?: (dopyt: string) => Vlastnik;
  clanky: Clanok[];
  hooky: HookVysledok[];
  prispevkovMesacne: number;
  prispevkovVSilnychMesiacoch: number | null;
}): Navrh[] {
  return [
    ...zVyhladavania(v.prilezitosti, v.vlastnik),
    ...zWebu(v.clanky),
    ...zObsahu(v.hooky),
    ...zTempa(v.prispevkovMesacne, v.prispevkovVSilnychMesiacoch),
  ]
    .sort((a, b) => a.poradie - b.poradie)
    .slice(0, KOĽKO);
}

/**
 * Kľúč do `anomaly_ack`. Vlastný priestor, aby sa nemiešal s registrom
 * ani s hláseniami (`hlasenie|…` v kontrolaDat.ts).
 */
export function klucHotoveho(kluc: string): string {
  return `plan|${kluc}`;
}

/**
 * Dokedy je návrh odklepnutý — alebo null, keď platí.
 *
 * Prázdny či pokazený dátum sa berie ako neodklepnuté: radšej návrh ukázať
 * zbytočne, než ho zmlčať kvôli chybe v zápise. To isté pravidlo má
 * `skryteDo` pri hláseniach.
 */
export function hotoveDo(
  zaznam: { ackedAt?: string } | undefined,
  skryDni: number,
  dnes: Date,
): Date | null {
  if (!zaznam?.ackedAt) return null;
  const od = new Date(zaznam.ackedAt);
  if (Number.isNaN(od.getTime())) return null;
  const do_ = new Date(od.getTime() + skryDni * 24 * 3600 * 1000);
  return do_ > dnes ? do_ : null;
}

/**
 * Rozdelí návrhy na platné a odklepnuté.
 *
 * Odklepnuté sa NEZAHADZUJÚ — obrazovka po nich nechá jeden riadok. Appka
 * nikdy nepredstiera, že nič nemá; to je to isté pravidlo ako pri hláseniach.
 */
export function rozdelPodlaHotovych(
  navrhy: Navrh[],
  ack: Record<string, { ackedAt?: string }> | undefined,
  dnes: Date,
): { platne: Navrh[]; hotove: { navrh: Navrh; do: Date }[] } {
  const platne: Navrh[] = [];
  const hotove: { navrh: Navrh; do: Date }[] = [];
  for (const n of navrhy) {
    const do_ = hotoveDo(ack?.[klucHotoveho(n.kluc)], n.skryDni, dnes);
    if (do_) hotove.push({ navrh: n, do: do_ });
    else platne.push(n);
  }
  return { platne, hotove };
}
