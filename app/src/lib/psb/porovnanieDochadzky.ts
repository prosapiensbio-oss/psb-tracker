/**
 * Súbežný chod: kalendár verzus PTminder, týždeň po týždni.
 *
 * PREČO
 *
 * Jerry, 22. 9. 2026: „nemohli by sme postaviť spôsob, kde by ešte stále
 * fungoval PTminder, ale súčasne by tam bola už aj samostatná evidencia,
 * nejakú dobu by sme používali obe, a keď by to všetko sedelo, PTminder by
 * sme odstránili?"
 *
 * Presne tak. Lenže súbežný chod bez MERADLA je len dva zoznamy vedľa seba —
 * „keď by to sedelo" musí byť číslo, ktoré appka počíta sama a ktoré sa dá
 * sledovať v čase. Toto je to meradlo.
 *
 * ČO SA POROVNÁVA
 *
 * Obidva smery, lebo hovoria o inom riziku:
 *   • `lenPtminder` — sedenie, ku ktorému v kalendári nie je udalosť. To je
 *     to, čo by sa po vypnutí PTmindera STRATILO. Toto číslo rozhoduje.
 *   • `lenKalendar` — udalosť bez zápisu v PTminderi. To je dnešná robota
 *     navyše (Jerryho „recoil"), nie riziko straty.
 *
 * TOLERANCIE sú tie isté ako v `nezapisaneTreningy`: meno bez diakritiky
 * a ±1 deň (presunutá hodina, ktorú nikto v kalendári neopravil). Vlastná
 * kópia pravidla by sa raz rozišla a dve obrazovky by tvrdili dve veci.
 *
 * OKNO je zámerne ohraničené z oboch strán:
 *   • zľava dňom, KEDY SA TEN KTORÝ KALENDÁR PRVÝ RAZ PREČÍTAL. Prvá verzia
 *     brala najstaršiu udalosť v tabuľke (26. 7.) a týždne pred pripojením
 *     kalendárov tak vyzerali ako strata troch sedení — meradlo meralo
 *     dátumy, nie zhodu. Hranica je per tréner: Jerryho kalendár sa pripojil
 *     8. 8., Terezkin 9. 8.
 *   • sprava posledným dňom exportu (za ním PTminder nemá nič a každá
 *     udalosť by vyzerala ako prebytok).
 *
 * TRÉNER BEZ KALENDÁRA sa nezamlčí. Jeho sedenia sa do porovnania nerátajú
 * (nemá ich s čím porovnať), ale vracajú sa ako `bezKalendara` — po vypnutí
 * PTmindera by sa stratili všetky a to sa nesmie stratiť z dohľadu.
 */

import { normName, weekKey, weekLabel } from "./format";

export type TyzdenPorovnania = {
  tyzden: string;
  label: string;
  od: string;
  do: string;
  sedeni: number;
  lenPtminder: number;
  lenKalendar: number;
  /** Mená a dni, ktoré nesedia — aby sa dalo kliknúť a pozrieť, nie len vidieť číslo. */
  chybaju: { klient: string; den: string; kde: "ptminder" | "kalendar" }[];
};

type Udalost = { klient: string | null; zaciatok: string; typ: string | null };
type Sedenie = { client: string; date: string; trener?: string | null };

const den = (s: string) => s.slice(0, 10);
const posun = (d: string, o: number) => new Date(Date.parse(`${d}T00:00:00Z`) + o * 86400000).toISOString().slice(0, 10);

/** Kľúče `meno|deň` aj s oboma susednými dňami — tolerancia ±1 deň. */
const sOkolim = (kluce: { meno: string; den: string }[]): Set<string> => {
  const out = new Set<string>();
  for (const k of kluce) for (const o of [-1, 0, 1]) out.add(`${k.meno}|${posun(k.den, o)}`);
  return out;
};

export type PorovnanieDochadzky = {
  tyzdne: TyzdenPorovnania[];
  od: string;
  do: string;
  sedeni: number;
  lenPtminder: number;
  lenKalendar: number;
  bezKalendara: { trener: string; sedeni: number }[];
};

export function porovnajTyzdne(
  udalosti: Udalost[],
  sedenia: Sedenie[],
  /** Odkedy sa ktorý kalendár číta (`kal_snimky`), v ISO dňoch. */
  kalendarOd: Record<string, string> = {},
  dnes: Date = new Date(),
): PorovnanieDochadzky {
  const treningy = udalosti
    .filter((u) => u.klient && (u.typ === "trening" || u.typ === "uvodny"))
    .map((u) => ({ meno: normName(u.klient as string), klient: u.klient as string, den: den(u.zaciatok) }));

  // Tréner bez pripojeného kalendára sa neporovnáva, ale ani nezamlčí.
  const bezMapy: Record<string, number> = {};
  const zapisy: { meno: string; klient: string; den: string }[] = [];
  for (const s of sedenia) {
    const kto = String(s.trener || "").trim();
    const zaciatokKal = kalendarOd[kto];
    if (!zaciatokKal) { bezMapy[kto || "—"] = (bezMapy[kto || "—"] || 0) + 1; continue; }
    if (den(s.date) < zaciatokKal) continue;
    zapisy.push({ meno: normName(s.client), klient: s.client, den: den(s.date) });
  }
  const bezKalendara = Object.entries(bezMapy).map(([trener, n]) => ({ trener, sedeni: n })).sort((a, b) => b.sedeni - a.sedeni);

  // Okno: odkedy sa kalendáre čítajú, dokiaľ siaha export — a nikdy nie
  // dnešok ani budúcnosť (dnešný zápis do PTmindera ešte len príde).
  const vcera = posun(new Date(dnes.getTime()).toISOString().slice(0, 10), -1);
  const zaciatky = Object.values(kalendarOd).filter(Boolean).sort();
  const od = zaciatky[0] || "";
  const doExport = zapisy.length ? zapisy.reduce((a, z) => (z.den > a ? z.den : a), zapisy[0].den) : "";
  const do_ = doExport && doExport < vcera ? doExport : vcera;
  if (!od || !do_ || od > do_) {
    return { tyzdne: [], od: od || "", do: do_ || "", sedeni: 0, lenPtminder: 0, lenKalendar: 0, bezKalendara };
  }

  const vOkne = <T extends { den: string }>(x: T) => x.den >= od && x.den <= do_;
  const vKalendari = sOkolim(treningy);
  const vPtminderi = sOkolim(zapisy);

  const tyzdne = new Map<string, TyzdenPorovnania>();
  const riadok = (d: string) => {
    const k = weekKey(d);
    let t = tyzdne.get(k);
    if (!t) {
      const pon = new Date(Date.parse(`${d}T00:00:00Z`));
      pon.setUTCDate(pon.getUTCDate() - ((pon.getUTCDay() || 7) - 1));
      const zac = pon.toISOString().slice(0, 10);
      t = { tyzden: k, label: weekLabel(d), od: zac, do: posun(zac, 6), sedeni: 0, lenPtminder: 0, lenKalendar: 0, chybaju: [] };
      tyzdne.set(k, t);
    }
    return t;
  };

  for (const z of zapisy.filter(vOkne)) {
    const t = riadok(z.den);
    t.sedeni++;
    if (!vKalendari.has(`${z.meno}|${z.den}`)) {
      t.lenPtminder++;
      t.chybaju.push({ klient: z.klient, den: z.den, kde: "ptminder" });
    }
  }
  for (const u of treningy.filter(vOkne)) {
    if (!vPtminderi.has(`${u.meno}|${u.den}`)) {
      const t = riadok(u.den);
      t.lenKalendar++;
      t.chybaju.push({ klient: u.klient, den: u.den, kde: "kalendar" });
    }
  }

  const zoznam = [...tyzdne.values()].sort((a, b) => b.od.localeCompare(a.od));
  return {
    tyzdne: zoznam,
    od, do: do_,
    sedeni: zoznam.reduce((a, t) => a + t.sedeni, 0),
    lenPtminder: zoznam.reduce((a, t) => a + t.lenPtminder, 0),
    lenKalendar: zoznam.reduce((a, t) => a + t.lenKalendar, 0),
    bezKalendara,
  };
}
