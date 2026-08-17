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
export type Clanok = { nazov: string; zobrazenia: number };
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
};

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
function zVyhladavania(p: Prilezitost[]): Navrh[] {
  // NÁVRH MUSÍ SEDIEŤ NA KANÁL, Z KTORÉHO VYŠIEL.
  //
  // Jerry, 17. 8. 2026: „odporúča mi na Google spraviť reel, ale tam reel
  // nerobia — to by Jarvis ako odborník na marketing mal vedieť." Mal pravdu
  // a bola to moja chyba: pôvodne tu stálo „Reel alebo článok na tému X"
  // pri VŠETKÝCH príležitostiach zo Search Console. Reel je Instagram; na to,
  // že sa web zobrazuje v Googli a nikto neklikne, nemá žiadny vplyv.
  //
  // Sú to dve rôzne diagnózy a každá má inú liečbu:
  //   • pozícia do 10 → stránka sa UŽ ukazuje na prvej strane, chýba dôvod
  //     kliknúť. Nový obsah nepomôže; treba prepísať titulok a popis.
  //   • pozícia nad 10 → obsah je slabý alebo chýba. Vtedy treba text.
  return p.slice(0, 3).map((x, i) => {
    const naPrvejStrane = x.pozicia <= 10;
    return {
      co: naPrvejStrane
        ? `Prepíš titulok a popis stránky na tému „${x.dopyt}"`
        : `Napíš alebo rozšír článok na tému „${x.dopyt}"`,
      preco: naPrvejStrane
        ? "Google už web na túto tému ukazuje na prvej strane a ľudia aj tak neklikajú — chýba dôvod, nie pozícia. Nový príspevok na Instagrame s tým nič neurobí; rozhoduje veta vo výsledku hľadania. Hotové návrhy sú v Marketing → Web, karta Titulky na prepis."
        : "Veľa ľudí to hľadá a web sa ukazuje, ale hlboko. Tu chýba samotný text na webe — reel to nenahradí, Google indexuje stránky.",
      dokaz: `${cislo(x.zobrazenia)} zobrazení, ${x.kliky} klikov, priemerná pozícia ${x.pozicia.toFixed(1)}`,
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
  return c.slice(0, 2).map((x, i) => ({
    co: `Pripomeň na Instagrame: ${x.nazov}`,
    preco: "Tento text ľudia na webe čítajú sami od seba. Príspevok, ktorý naň odkáže, je hotová práca — nepíše sa nič nové.",
    dokaz: `${cislo(x.zobrazenia)} zobrazení stránky za stiahnuté obdobie`,
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
    co: `Vráť tempo na ${Math.round(prispevkovVSilnychMesiacoch)} príspevkov mesačne`,
    preco: "V mesiacoch s najviac dopytmi si publikoval viac. Nie je to príčina, ale je to jediná vec z tohto zoznamu, ktorú máš plne v rukách.",
    dokaz: `teraz ${prispevkovMesacne.toFixed(1)} mesačne, v najsilnejších mesiacoch ${prispevkovVSilnychMesiacoch.toFixed(1)}`,
    zdroj: "tempo",
    poradie: 4,
  }];
}

export function planObsahu(v: {
  prilezitosti: Prilezitost[];
  clanky: Clanok[];
  hooky: HookVysledok[];
  prispevkovMesacne: number;
  prispevkovVSilnychMesiacoch: number | null;
}): Navrh[] {
  return [
    ...zVyhladavania(v.prilezitosti),
    ...zWebu(v.clanky),
    ...zObsahu(v.hooky),
    ...zTempa(v.prispevkovMesacne, v.prispevkovVSilnychMesiacoch),
  ]
    .sort((a, b) => a.poradie - b.poradie)
    .slice(0, KOĽKO);
}
