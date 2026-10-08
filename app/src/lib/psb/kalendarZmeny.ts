import { normName } from "./format";

/**
 * KTORÚ ZMENU V KALENDÁRI OHLÁSIŤ.
 *
 * Pôvodné pravidlo znelo „pýtame sa len na to, čo už prebehlo" a bolo napísané
 * pre PRIDANÉ tréningy: dohodnutý termín na budúci štvrtok naozaj nie je
 * udalosť na vysvetlenie, Jerry si ho práve dohodol.
 *
 * Lenže platilo na všetko — a tým prehltlo presne to, čo Jerry vidieť chce.
 * Michal Knapčok mal stredu 12. 8. o 15:00, zrušil ju, synchronizácia
 * v pondelok o 17:23 to VIDELA (`zmizla_at` sa zapísalo), ale záznam sa
 * zahodil, lebo streda bola v budúcnosti. A keďže udalosť je odvtedy označená
 * ako zmiznutá, rozdiel ju už nikdy znova nevyrobí — ticho je trvalé.
 *
 * Zrušená budúca hodina je pritom to najdrahšie, čo kalendár vie povedať:
 * je to voľné okno a nezarobené peniaze, a čím skôr sa o ňom vie, tým väčšia
 * šanca ho zaplniť. Preto:
 *
 *   • zrušené a posunuté — hlásiť VŽDY, minulé aj budúce,
 *   • pridané a premenované — len keď sa to týka minulosti (nová rezervácia
 *     do budúcna je plán, nie otázka; premenovanie budúcej udalosti je šum).
 *
 * POSUN NA TEN ISTÝ ČAS NIE JE POSUN
 *
 * Jerry, 23. 9. 2026: „som v kalendári a sú tu štyri Lenky, prečo?" Všetky
 * štyri hlásili „presun z Št 1. 10. 15:00 na Št 1. 10. 15:00" — z toho istého
 * času na ten istý čas.
 *
 * Vzniká to takto: keď sa upraví opakovaná udalosť, Google jej budúce výskyty
 * NEPOSUNIE, ale zruší a vytvorí nanovo s iným uid. Appka párovanie zrušenej
 * a pridanej udalosti toho istého človeka v ten istý deň správne považuje za
 * posun — len sa nikdy nepýtala, či sa čas naozaj zmenil. Lenke sa 22. 9.
 * o 15:01 takto prerobili štyri termíny naraz a appka chcela ku každému dôvod,
 * hoci sa v jej kalendári nestalo nič.
 *
 * Udalosť s novým uid a rovnakým časom je tá istá hodina. Nehlási sa.
 *
 * SÚKROMNÉ A NETRÉNINGOVÉ SA NEHLÁSIA VÔBEC
 *
 * O zmazanom plávaní sa nikto pýtať nechce — to pravidlo appka mala, ale len
 * pre zmiznuté udalosti. Pridané, posunuté a premenované ho nemali, takže keď
 * si Jerry zapísal do kalendára „Poslat veronika QR" alebo „Napisat lenke",
 * appka chcela vedieť, prečo to pribudlo. Kontrola 23. 9. 2026 našla štyri
 * také otázky visieť v registri. Pravidlo je odteraz na jednom mieste
 * a platí na všetky druhy zmien.
 */
export function ohlasitZmenu(
  druh: string,
  /** Pôvodný termín (zrušenie, posun) — tvar `YYYY-MM-DDTHH:MM`. */
  pred: string | null,
  /** Nový termín (pridanie, posun). */
  po: string | null,
  /** Dnešný deň `YYYY-MM-DD`. */
  dnesDen: string,
  /** Typ udalosti (`trening`, `uvodny`, `sukromne`, `netrening`, `guillermo`). */
  typ?: string | null,
): boolean {
  if (typ === "sukromne" || typ === "netrening") return false;
  if (druh === "posunute" && pred && po && pred === po) return false;
  if (druh === "zrusene" || druh === "posunute") return true;
  const kedy = (pred || po || "").slice(0, 10);
  return !!kedy && kedy <= dnesDen;
}

export type SurovaZmena = {
  druh: string;
  u: string;
  nazov: string;
  klient: string | null;
  pred: string | null;
  po: string | null;
  typ: string;
};

/**
 * Je to ten istý človek? (na párovanie zrušenia s pridaním)
 *
 * Porovnávať `klient || nazov` cez `===` nestačí a 24. 9. 2026 to zlyhalo
 * naostro. Google prerobil Annin opakovaný termín na 7. 10. 19:00: starý
 * výskyt mal v databáze `klient` „Anna Kadličkova", nový prišiel ako nová
 * udalosť s názvom „Anna Kadlickova" a bez priradeného klienta (čaká
 * v Nových názvoch). Dva reťazce sa nerovnali, párovanie neprebehlo — a Jerry
 * dostal „zmizol tréning 7. 10.", hoci sa nezmizlo nič. Otázku, na ktorú sa
 * nedá odpovedať: „čo tam mám napísať?"
 *
 * Preto sa porovnáva bez diakritiky a malými písmenami; a keď je jedna strana
 * len PRIEZVISKO („Kadlickova" proti „Anna Kadličkova"), sedí to na posledné
 * slovo tej druhej. Krstné meno samo nestačí — „Jakub" majú v PSB traja
 * a zle spárovaný presun by ticho schoval zrušenú hodinu.
 */
export function tenIstyClovek(a: string, b: string): boolean {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = x.split(" ").filter(Boolean), ty = y.split(" ").filter(Boolean);
  const jednoSlovo = (kratke: string[], dlhe: string[]) =>
    kratke.length === 1 && kratke[0].length >= 4 && dlhe.length > 1 && dlhe[dlhe.length - 1] === kratke[0];
  return jednoSlovo(tx, ty) || jednoSlovo(ty, tx);
}

/**
 * Dve zmeny, ktoré sú v skutočnosti jedna.
 *
 * Keď sa upraví opakovaná udalosť, Google jej budúce výskyty neposunie, ale
 * ZRUŠÍ a vytvorí nanovo s iným uid. Bez párovania to vyzerá ako „zmizol
 * tréning" a hneď vedľa „pridaný tréning" toho istého človeka v ten istý deň.
 * Ten istý človek + ten istý DEŇ = posun, nie dve udalosti. Či sa aj čas
 * naozaj zmenil, rieši potom `ohlasitZmenu` (posun na ten istý čas nie je
 * posun a nehlási sa vôbec).
 */
export function sparujZmeny(surove: SurovaZmena[]): SurovaZmena[] {
  const von: SurovaZmena[] = [];
  const pouzite = new Set<number>();
  const den = (x: string | null) => (x || "").slice(0, 10);
  surove.forEach((a, i) => {
    if (pouzite.has(i) || a.druh !== "zrusene") return;
    const j = surove.findIndex((b, k) =>
      !pouzite.has(k) && b.druh === "pridane" &&
      tenIstyClovek(b.klient || b.nazov, a.klient || a.nazov) &&
      den(b.po) === den(a.pred));
    if (j < 0) return;
    pouzite.add(i); pouzite.add(j);
    // Typ berieme zo STARÉHO záznamu: nová udalosť ešte nemusí byť
    // rozpoznaná (`typ` NULL) a posun tréningu by sa tak stratil.
    von.push({ ...a, druh: "posunute", po: surove[j].po });
  });
  surove.forEach((x, i) => { if (!pouzite.has(i)) von.push(x); });
  return von;
}

/**
 * ZMIZNUTÁ HODINA, KTORÁ SA INDE OBJAVILA — to nie je zrušenie, to je presun.
 *
 * Jerry, 8. 10. 2026: „prečo sú klienti, ktorí sa presunuli, ako zrušenie?
 * Veď ak sme presunuli, musíš mať záznam o tom, že je na nejakom inom čase
 * v kalendári — tým pádom sa ma môže tak max spýtať na presun."
 *
 * `sparujZmeny` vyššie spojí zrušenie s pridaním, ale len v TEN ISTÝ DEŇ
 * a len keď obe prídu z jednej synchronizácie. Presun na budúci týždeň ani
 * presun, ktorého nový termín appka videla už skôr, tým neprejde — a zostane
 * z neho „zrušené". Zmerané 8. 10. 2026 na ostrých dátach: z 46 nevysvetlených
 * zrušení ich takto vyzerá 19.
 *
 * Dôkaz je v tom, KEDY sa nová udalosť prvý raz objavila. Klient, ktorý chodí
 * každý týždeň, má v kalendári ďalší tréning vždy — to samo o sebe nehovorí
 * nič. Ale udalosť, ktorá pribudla v tej istej chvíli, keď iná zmizla, je tá
 * istá hodina na novom čase.
 *
 * Nie je to dôkaz, je to NÁVRH. Pri viacerých kandidátoch sa vyberie ten
 * najbližší v čase objavenia a appka sa pýta — nerozhoduje.
 */
export type MoznyPresun = { zaciatok: string; uid: string; kandidatov: number };

export function najdiPresun(
  zmena: { druh: string; klient: string | null; nazov: string | null; pred: string | null; kedy: string },
  udalosti: { uid: string; klient: string | null; nazov: string; zaciatok: string; prvyRaz?: string | null }[],
  /** Koľko dní okolo pôvodného termínu hľadať nový. */
  dni = 14,
  /** Koľko hodín od zmeny sa nová udalosť smie objaviť. */
  hodin = 36,
): MoznyPresun | null {
  if (zmena.druh !== "zrusene" || !zmena.pred) return null;
  const kto = zmena.klient || zmena.nazov || "";
  if (!kto) return null;
  const kedy = Date.parse(zmena.kedy);
  const pred = Date.parse(`${zmena.pred.slice(0, 16)}:00Z`);
  if (!Number.isFinite(kedy) || !Number.isFinite(pred)) return null;

  const kandidati: { odstup: number; u: (typeof udalosti)[number] }[] = [];
  for (const u of udalosti) {
    if (!u.prvyRaz) continue;
    if (u.zaciatok.slice(0, 16) === zmena.pred.slice(0, 16)) continue;
    if (!tenIstyClovek(u.klient || u.nazov, kto)) continue;
    const zac = Date.parse(`${u.zaciatok.slice(0, 16)}:00Z`);
    const prvy = Date.parse(u.prvyRaz);
    if (!Number.isFinite(zac) || !Number.isFinite(prvy)) continue;
    if (Math.abs(zac - pred) > dni * 86400000) continue;
    const odstup = Math.abs(prvy - kedy);
    if (odstup > hodin * 3600000) continue;
    kandidati.push({ odstup, u });
  }
  if (!kandidati.length) return null;
  kandidati.sort((a, b) => a.odstup - b.odstup || a.u.zaciatok.localeCompare(b.u.zaciatok));
  return { zaciatok: kandidati[0].u.zaciatok, uid: kandidati[0].u.uid, kandidatov: kandidati.length };
}
