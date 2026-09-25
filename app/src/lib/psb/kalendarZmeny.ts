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
