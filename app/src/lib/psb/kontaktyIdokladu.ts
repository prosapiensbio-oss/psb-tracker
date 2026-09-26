import { normName } from "./format";

/**
 * KONTAKTY Z IDOKLADU — prečítanie a návrh klienta.
 *
 * Jerry fakturoval tri roky v iDokladi a má tam 35 kontaktov s IČO, DIČ
 * a mailom. Sú to tie isté firmy, z ktorých chodia platby na účet — a appka
 * ich potrebuje poznať, aby vedela priradiť platbu človeku, ktorý za firmou
 * stojí (Jerry, 26. 9. 2026: „k menu sa priraďuje IČO, a nie názov").
 *
 * Návrh klienta je len NÁVRH. Pri fyzickej osobe sa dá uhádnuť z priezviska;
 * pri firme to appka vedieť nemôže — kto stojí za „FSH Devices", vie jedine
 * Jerry. Preto sa nič nepriraďuje samo.
 */

export type Kontakt = {
  firma: string;
  ico: string;
  dic: string;
  email: string;
  telefon: string;
  osMeno: string;
  osPriezvisko: string;
};

/** Jeden riadok CSV so zohľadnením úvodzoviek — názvy firiem majú čiarky. */
export function rozdelRiadok(r: string): string[] {
  const von: string[] = [];
  let kus = "";
  let vUvodzovkach = false;
  for (let i = 0; i < r.length; i++) {
    const z = r[i];
    if (z === '"') {
      if (vUvodzovkach && r[i + 1] === '"') { kus += '"'; i++; continue; }
      vUvodzovkach = !vUvodzovkach;
      continue;
    }
    if (z === "," && !vUvodzovkach) { von.push(kus); kus = ""; continue; }
    kus += z;
  }
  von.push(kus);
  return von.map((x) => x.trim());
}

/**
 * Export „Seznam kontaktů" z iDokladu.
 * Hlavička: Firma,IČ,DIČ,E-mailová adresa,Telefon,Jméno,Příjmení
 */
export function rozparsujKontakty(csv: string): Kontakt[] {
  const riadky = csv.split(/\r?\n/).filter((r) => r.trim());
  if (!riadky.length) return [];
  const hlavicka = rozdelRiadok(riadky[0]).map((x) => normName(x));
  const kde = (co: string) => hlavicka.findIndex((h) => h.includes(co));
  const iFirma = kde("firma");
  const iIco = hlavicka.findIndex((h) => h === "ic" || h === "ico");
  const iDic = hlavicka.findIndex((h) => h === "dic");
  const iMail = kde("mail");
  const iTel = kde("telefon");
  const iMeno = hlavicka.findIndex((h) => h === "jmeno" || h === "meno");
  const iPriez = kde("prijmeni");
  if (iFirma < 0) return [];

  const von: Kontakt[] = [];
  for (const r of riadky.slice(1)) {
    const c = rozdelRiadok(r);
    const firma = (c[iFirma] || "").trim();
    if (!firma) continue;
    von.push({
      firma,
      ico: (c[iIco] || "").trim(),
      dic: (c[iDic] || "").trim(),
      email: (c[iMail] || "").trim().toLowerCase(),
      telefon: (c[iTel] || "").trim(),
      osMeno: (c[iMeno] || "").trim(),
      osPriezvisko: (c[iPriez] || "").trim(),
    });
  }
  return von;
}

/** Vyzerá kontakt na firmu? Podľa právnej formy alebo IČO bez mena. */
export function jeFirma(k: { firma: string }): boolean {
  return /\b(s\.?\s?r\.?\s?o|a\.?\s?s|spol|z\.?\s?s|ltd|gmbh|sro)\b/i.test(k.firma);
}

/**
 * Návrh klienta pre kontakt. Len pri fyzickej osobe a len keď je zhoda
 * jednoznačná — dvaja Michalovia znamenajú, že rozhodne človek.
 */
export function navrhniKlienta(k: Pick<Kontakt, "firma" | "osMeno" | "osPriezvisko">, menaKlientov: string[]): string[] {
  if (jeFirma(k)) return [];
  // Tituly preč: „Ing. arch. Anna Nová" je Anna Nová.
  const bezTitulov = (s: string) => normName(s)
    .split(/\s+/)
    .filter((x) => x.length > 1 && !x.endsWith("."))
    .join(" ");
  const cielCele = bezTitulov(`${k.osMeno} ${k.osPriezvisko}`.trim() || k.firma);
  if (!cielCele) return [];
  const presne = menaKlientov.filter((m) => bezTitulov(m) === cielCele);
  if (presne.length) return presne;
  // Druhý pokus: priezvisko. „Mgr. Lucie Podolová" proti „Lucie Podolova".
  const priezvisko = cielCele.split(/\s+/).pop() || "";
  if (priezvisko.length < 4) return [];
  const podla = menaKlientov.filter((m) => bezTitulov(m).split(/\s+/).includes(priezvisko));
  return podla.length === 1 ? podla : [];
}
