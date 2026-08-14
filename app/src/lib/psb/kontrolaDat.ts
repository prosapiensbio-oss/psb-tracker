/**
 * Kontrola vierohodnosti marketingových čísel.
 *
 * PREČO TO VZNIKLO
 *
 * 13. 8. sa ukázalo, že júlové „Impressions" Instagramu sú 2 994, hoci videní
 * bolo 137 200. Bol to preklep z čítania mesačnej zostavy modelom a našiel sa
 * NÁHODOU, pri stavaní inej tabuľky. Bez neho by porovnanie sietí tvrdilo, že
 * Facebook má tridsaťkrát väčší dosah než Instagram — a podľa toho by sa
 * rozhodovalo o obsahu.
 *
 * Nemám dôvod myslieť si, že to bola posledná taká chyba. Toto je poistka:
 * appka porovná čísla, ktoré spolu MUSIA súvisieť, a nezhodu ohlási.
 *
 * PREČO TO NEHÁDŽE VÝNIMKU A NIČ NEOPRAVUJE
 *
 * Nezhoda neznamená, že jedno z čísel je zlé — znamená, že si ich treba
 * pozrieť. Automatická oprava by tichým spôsobom prepísala dáta na to, čo si
 * appka myslí, a to je horšie než chyba, o ktorej sa vie.
 */

export type Riadok = { mesiac: string; kanal: string; metrika: string; hodnota: number };
export type Nezhoda = {
  kluc: string;
  zavaznost: "vysoka" | "stredna";
  nadpis: string;
  detail: string;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const cislo = (n: number) => Math.round(n).toLocaleString("sk");

/** Hodnota metriky pre kanál a mesiac; `null`, keď chýba. */
function hod(r: Riadok[], kanal: string, metrika: string, mesiac: string): number | null {
  const x = r.find((y) => y.mesiac === mesiac && y.kanal === kanal && y.metrika.toLowerCase() === metrika.toLowerCase());
  return x ? x.hodnota : null;
}

/**
 * Dvojice metrík, ktoré si pri danom kanáli MUSIA rovnať.
 *
 * Nie je to dohad: pri Instagrame vychádzali Impressions a Views rovnaké
 * v siedmich overených mesiacoch po sebe. Keď sa raz rozídu, je to chyba
 * prepisu, nie zmena skutočnosti.
 */
const ROVNAKE: { kanal: string; a: string; b: string }[] = [
  { kanal: "Instagram", a: "Impressions", b: "Views" },
];

/** Odchýlka, pri ktorej sa ešte mlčí — zaokrúhľovanie v zostave je bežné. */
const TOLERANCIA = 0.05;

/** Násobok mediánu, nad ktorým je hodnota podozrivá, nie len výnimočná. */
const RAD = 10;

/**
 * Pod touto úrovňou sa rady nekontrolujú.
 *
 * Pri metrike, ktorej medián je 2 (interakcie na Threadse) alebo 9 (impresie
 * na LinkedIne), je desaťnásobok bežný výkyv — stačí jeden príspevok navyše.
 * Prvá verzia bez tejto hranice vypľula dvadsať nálezov, z toho pätnásť
 * o číslach, ktoré nikoho nezaujímajú. Register, ktorý sa naučí ignorovať,
 * je horší než žiadny.
 */
const MALE_CISLA = 30;

/**
 * Koľko výkyvov ešte znamená výkyv.
 *
 * Keď je v rade odľahlých hodnôt viac, nie je odľahlá ani jedna — mení sa
 * celá rada a medián o nej nič nehovorí.
 */
const MAX_ODLAHLYCH = 2;

/**
 * Ako ďaleko dozadu má zmysel hlásiť DOHAD.
 *
 * Jerry, 13. 8.: „Facebook 2025-11 — prečo by ma toto malo zaujímať?" Nemalo.
 * Kanál, ktorý aktívne nerobí, číslo spred deviatich mesiacov — aj keby bolo
 * zlé, nič sa podľa neho nerozhoduje. Bola to kontrola dátovej kvality, nie
 * upozornenie, a porušovala jeho vlastné pravidlo, že číslo bez akcie je
 * zbytočné.
 *
 * Platí len na tretiu kontrolu, ktorá HÁDA. Prvé dve nehádajú — tam je
 * nezhoda dôkaz chyby a tá sa hlási bez ohľadu na vek, lebo skresľuje aj
 * priemery, proti ktorým sa porovnáva dnešok.
 */
const DOHAD_MESIACOV = 3;

export function kontrolaKanalov(riadky: Riadok[], vydavokZMety: { mesiac: string; spend: number }[]): Nezhoda[] {
  const von: Nezhoda[] = [];
  const mesiace = [...new Set(riadky.map((r) => r.mesiac))].sort();

  // ── 1 · dvojice, ktoré sa musia rovnať ────────────────────────────────────
  for (const p of ROVNAKE) {
    for (const m of mesiace) {
      const a = hod(riadky, p.kanal, p.a, m);
      const b = hod(riadky, p.kanal, p.b, m);
      if (a == null || b == null || (a === 0 && b === 0)) continue;
      const rozdiel = Math.abs(a - b) / Math.max(a, b);
      if (rozdiel <= TOLERANCIA) continue;
      von.push({
        kluc: `rovnake|${p.kanal}|${p.a}|${m}`,
        zavaznost: "vysoka",
        nadpis: `${p.kanal} ${m}: ${p.a} a ${p.b} sa nerovnajú`,
        detail: `${p.a} ${cislo(a)} verzus ${p.b} ${cislo(b)}. Pri ${p.kanal.toLowerCase()}e sú to v zostave to isté číslo — rozdiel znamená chybu prepisu, nie zmenu skutočnosti. Skontroluj mesačnú zostavu za tento mesiac.`,
      });
    }
  }

  // ── 2 · výdavok na reklamu: zostava verzus Meta API ───────────────────────
  //
  // Dva nezávislé zdroje toho istého čísla. Keď sa rozídu, jeden z nich je
  // zle prečítaný — a je jedno ktorý, obidva sa používajú na rozhodovanie.
  const podlaMesiaca = new Map<string, number>();
  for (const v of vydavokZMety) podlaMesiaca.set(v.mesiac, (podlaMesiaca.get(v.mesiac) || 0) + v.spend);
  for (const [m, zMety] of podlaMesiaca) {
    const zZostavy = hod(riadky, "Meta Ads", "Spent", m);
    if (zZostavy == null || (zMety === 0 && zZostavy === 0)) continue;
    const rozdielKc = Math.abs(zMety - zZostavy);
    const rozdiel = rozdielKc / Math.max(zMety, zZostavy, 1);
    // Malé rozdiely sú zaokrúhľovanie; pod dvesto korún to nikoho nezaujíma.
    if (rozdiel <= 0.1 || rozdielKc < 200) continue;
    von.push({
      kluc: `reklama|${m}`,
      zavaznost: "stredna",
      nadpis: `${m}: výdavok na reklamu sa v dvoch zdrojoch líši`,
      detail: `Mesačná zostava hovorí ${cislo(zZostavy)} Kč, Meta API ${cislo(zMety)} Kč — rozdiel ${cislo(rozdielKc)} Kč. Obidve čísla sa používajú na rozhodovanie, takže je jedno, ktoré je zlé; jedno z nich treba opraviť.`,
    });
  }

  // ── 3 · hodnota mimo rádu ────────────────────────────────────────────────
  //
  // Generická poistka na to, čo prvé dve kontroly nezachytia. Nehľadá výkyvy —
  // tie sú v marketingu bežné — ale hodnoty mimo RÁDU oproti mediánu vlastnej
  // rady. Presne tam padla tá júlová chyba.
  const rady = new Map<string, { m: string; v: number }[]>();
  for (const r of riadky) {
    const k = `${r.kanal}|${r.metrika}`;
    rady.set(k, [...(rady.get(k) || []), { m: r.mesiac, v: r.hodnota }]);
  }
  // Posledné mesiace, o ktorých sa ešte rozhoduje.
  const cerstve = new Set(mesiace.slice(-DOHAD_MESIACOV));
  for (const [k, rad] of rady) {
    // Pri krátkej rade nie je median na čom postaviť.
    if (rad.length < 5) continue;
    const kladne = rad.filter((x) => x.v > 0);
    if (kladne.length < 5) continue;
    const med = median(kladne.map((x) => x.v));
    if (med < MALE_CISLA) continue;
    const odlahle = rad.filter((x) => x.v > 0 && (x.v > med ? x.v / med : med / x.v) >= RAD);
    if (!odlahle.length || odlahle.length > MAX_ODLAHLYCH) continue;
    // Dohad sa hlási len o mesiacoch, o ktorých sa ešte rozhoduje. Rad sa
    // pritom počíta z CELEJ histórie — starý výkyv medián nepokazí, len sa
    // o ňom mlčí.
    const cerstveOdlahle = odlahle.filter((x) => cerstve.has(x.m));
    if (!cerstveOdlahle.length) continue;
    const [kanal, metrika] = k.split("|");
    for (const x of cerstveOdlahle) {
      const nasobok = Math.round(x.v > med ? x.v / med : med / x.v);
      von.push({
        kluc: `rad|${k}|${x.m}`,
        zavaznost: "stredna",
        nadpis: `${kanal} ${x.m}: ${metrika} je mimo rádu`,
        detail: `${cislo(x.v)} oproti bežným ${cislo(med)} — ${nasobok}× ${x.v > med ? "viac" : "menej"}. Je to čerstvý mesiac, takže sa podľa neho ešte rozhoduje; over zostavu skôr, než sa tak stane. Ak je číslo správne, stalo sa niečo, čo stojí za pozretie samo o sebe.`,
      });
    }
  }

  return von.sort((a, b) => (a.zavaznost === b.zavaznost ? a.kluc.localeCompare(b.kluc) : a.zavaznost === "vysoka" ? -1 : 1));
}

/**
 * Strážca merania: beží web, ale prestal sa merať?
 *
 * PREČO TO VZNIKLO
 *
 * Od marca do júna 2026 nenameralo GA4 na webe takmer nič, hoci Search Console
 * za tie isté mesiace hlásil 235 klikov mesačne — najlepšie čísla, aké web mal.
 * Merací kód prestal fungovať a nikto si to päť mesiacov nevšimol. Nevšimol by
 * si to ani teraz, keby sa obidva zdroje prvýkrát neocitli vedľa seba.
 *
 * Prečo to zlyhalo, sa už nedozvieme a nepotrebujeme — tie mesiace sú
 * označené za nemerané a nič sa z nich nerozhoduje. Dôležité je, aby sa to
 * nabudúce neopakovalo POTICHU.
 *
 * PREČO PRÁVE TIETO DVA ZDROJE
 *
 * Sú na sebe nezávislé. Search Console počíta Google na svojej strane, GA4
 * počíta skript na stránke. Keď sa rozídu, chyba je takmer isto v tom
 * druhom — na návštevnosť webu Kokpit iné potvrdenie nemá.
 *
 * ČO TO NEROBÍ
 *
 * Nehlási bežný pokles. Kliky a noví používatelia nie sú to isté číslo a ich
 * pomer kolíše. Hlási sa len prípad, keď jedno drží a druhé spadne o rád —
 * teda to, čo sa nedá vysvetliť správaním ľudí, len prestatým meraním.
 */

export type MeranieMesiac = { m: string; novi: number; chyba?: boolean; castocne?: boolean };

/** Podiel mediánu, pod ktorým sa GA4 považuje za spadnuté. */
const SPADNUTE = 0.2;

/** Podiel mediánu, nad ktorým sa Search Console považuje za bežiace. */
const BEZI = 0.5;

export function kontrolaMerania(
  ga4: MeranieMesiac[],
  gsc: { m: string; kliky: number }[],
): Nezhoda[] {
  // Mesiace, o ktorých sa už vie, sa nehlásia znova — sú označené v appke.
  const znameDiery = new Set(ga4.filter((x) => x.chyba || x.castocne).map((x) => x.m));
  const merane = ga4.filter((x) => !x.chyba && !x.castocne);
  if (merane.length < 5 || gsc.length < 5) return [];

  const medGa4 = median(merane.map((x) => x.novi));
  const medGsc = median(gsc.map((x) => x.kliky));
  if (medGa4 < MALE_CISLA || medGsc < 5) return [];

  const von: Nezhoda[] = [];
  for (const g of gsc) {
    if (znameDiery.has(g.m)) continue;
    if (g.kliky < medGsc * BEZI) continue;           // web sám mal slabý mesiac
    const a = ga4.find((x) => x.m === g.m);
    // Chýbajúci mesiac je rovnaká správa ako mesiac s nulou: GA4 nemá nič,
    // Search Console má návštevy.
    const novi = a && !a.chyba ? a.novi : 0;
    if (novi >= medGa4 * SPADNUTE) continue;
    von.push({
      kluc: `meranie|${g.m}`,
      zavaznost: "vysoka",
      nadpis: `${g.m}: web beží, ale GA4 ho nemeria`,
      detail: `Search Console hlási ${cislo(g.kliky)} klikov (bežne ${cislo(medGsc)}), GA4 ${a ? cislo(novi) : "žiadny riadok"} nových (bežne ${cislo(medGa4)}). Ľudia na web chodia — nemeria sa. Skontroluj merací kód: na webe ho vkladá plugin PixelYourSite (GA4 → Google Analytics) a môže ho blokovať súhlas s cookies. Kým sa to nespraví, tento mesiac označ za nemeraný, nech sa nepočíta ako prepad.`,
    });
  }
  return von;
}

/**
 * Podozrivo dokonalé čísla — appka spochybňuje samu seba.
 *
 * PREČO TO VZNIKLO
 *
 * 13. 8. ukazoval lievik „po úvodnom 100 % úspešnosť". Nebola to chyba
 * počítania: úvodný tréning je platený, takže podmienka „má platbu" bola
 * splnená okamihom, keď naň človek prišiel. Merala sa dochádzka, nie
 * rozhodnutie pokračovať.
 *
 * Nenašiel to test ani ja. Našiel to Jerry otázkou „mame naozaj 100 %
 * úspešnosť?" — a to je presne otázka, ktorú si mala položiť appka.
 *
 * PREČO TO NEHOVORÍ „JE TO ZLE"
 *
 * Sto percent MÔŽE byť pravda. Podozrivé nie je číslo, ale to, že sa nedá
 * odlíšiť od chyby v definícii — a rozdiel medzi „všetci zostali" a „meriame
 * to zle" rozhodne o tom, či sa podľa toho dá konať. Preto je to otázka
 * s návodom, čo overiť, nie rozsudok.
 *
 * PREČO NIE KAŽDÝ PODIEL
 *
 * Pri troch ľuďoch je 100 % bežná náhoda. Hlási sa až od vzorky, pri ktorej
 * by dokonalý výsledok bol prekvapením aj v dobrom podniku.
 */

export type Podiel = {
  /** Ako sa metrika volá na obrazovke. */
  nazov: string;
  /** Koľko ich vstúpilo do kroku. */
  zo: number;
  /** Koľko ich prešlo. */
  preslo: number;
  /** Čo overiť, keď číslo vyzerá príliš dobre. Píše sa ku každej metrike zvlášť. */
  coOverit: string;
};

/** Pod týmto počtom je dokonalý výsledok bežná náhoda, nie signál. */
const DOSŤ_VZORKY = 8;

/** Od tejto hranice je „takmer všetci" podozrivé rovnako ako „všetci". */
const TAKMER_VSETCI = 0.95;

export function podozriveCisla(podiely: Podiel[]): Nezhoda[] {
  const von: Nezhoda[] = [];
  for (const p of podiely) {
    if (p.zo < DOSŤ_VZORKY) continue;
    const podiel = p.preslo / p.zo;

    // Nad sto percent je fyzikálne nemožné — čitateľ a menovateľ počítajú
    // rôznych ľudí. Toto nie je podozrenie, to je dôkaz chyby.
    if (podiel > 1) {
      von.push({
        kluc: `podiel|nemozne|${p.nazov}`,
        zavaznost: "vysoka",
        nadpis: `${p.nazov}: ${Math.round(podiel * 100)} % je nemožných`,
        detail: `${cislo(p.preslo)} z ${cislo(p.zo)}. Podiel nad sto percent znamená, že sa delia dve rôzne skupiny ľudí — nie že sa darí. ${p.coOverit}`,
      });
      continue;
    }

    if (podiel >= TAKMER_VSETCI) {
      von.push({
        kluc: `podiel|dokonale|${p.nazov}`,
        zavaznost: "stredna",
        nadpis: `${p.nazov}: ${Math.round(podiel * 100)} % — naozaj?`,
        detail: `${cislo(p.preslo)} z ${cislo(p.zo)} prešlo. Môže to byť pravda, ale nedá sa to odlíšiť od chyby v definícii — a rozdiel medzi „všetci zostali" a „meriame to zle" rozhoduje o tom, či sa podľa toho dá konať. ${p.coOverit}`,
      });
      continue;
    }

    // Nula pri dostatočnej vzorke je rovnaký druh podozrenia z opačnej strany:
    // buď sa naozaj nikomu nedarí, alebo sa krok nemeria.
    if (p.preslo === 0) {
      von.push({
        kluc: `podiel|nula|${p.nazov}`,
        zavaznost: "stredna",
        nadpis: `${p.nazov}: 0 z ${cislo(p.zo)}`,
        detail: `Ani jeden neprešiel. Buď sa naozaj nikomu nedarí, alebo sa ten krok nemeria — a to sú dve veľmi rôzne správy. ${p.coOverit}`,
      });
    }
  }
  return von;
}
