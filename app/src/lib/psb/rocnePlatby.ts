/**
 * ROČNÉ PLATBY — čo sa platí raz za rok a dá sa na to zabudnúť.
 *
 * Jerry, 10. 11. 2026, po uzavretí poistenia zodpovednosti: „o rok, keď bude
 * končiť platnosť, nech mi Kokpit pripomenie, že treba zaplatiť poistku za
 * priestor." ČPP (zmluva 0029969549, 10 mil. Kč, 7 315 Kč) platí od 11. 11. 2026
 * do 10. 11. 2027 a obnovuje sa sama — nezaplatené poistné by pri obnove
 * znamenalo dieru v krytí presne tam, kde je škoda najdrahšia.
 *
 * Mesačné platby (`platbyMesiaca.ts`) majú pohyb vo výpise za mesiac; tu je
 * kľúč rok, takže odklik `rocna-platba|<id>|<RRRR>` platí len na tú jednu
 * obnovu a o rok sa pripomienka vráti sama.
 */
import { dnesPraha } from "./cas";
import { jeOdklik, type PohybPlatby } from "./platbyMesiaca";

export type RocnaPlatba = {
  id: string;
  nazov: string;
  suma: string;
  /** Rok, v ktorom pripomienka prvýkrát príde (kľúč odklikov). */
  rok: string;
  /** Od ktorého dňa sa pripomína (RRRR-MM-DD). */
  od: string;
  /** Do kedy treba mať hotovo (RRRR-MM-DD). */
  termin: string;
  /** Po tomto dni sa už nepýta — nech pripomienka nežije donekonečna. */
  do: string;
  /** Čo má Jerry urobiť — ide do detailu notifikácie. */
  popis: string;
  /** Pohyb vo výpise, ktorý platbu kryje. Bez neho stačí odklik. */
  je?: (p: PohybPlatby) => boolean;
};

const t = (p: PohybPlatby) => p.text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ROCNE_PLATBY: RocnaPlatba[] = [
  {
    id: "poistka-priestor",
    nazov: "Poistka zodpovednosti (priestor)",
    suma: "≈ 7 315 Kč",
    rok: "2027",
    od: "2027-10-25",
    termin: "2027-11-11",
    do: "2027-12-31",
    popis:
      "ČPP, zmluva 0029969549, účet 700135002/0800, variabilný symbol 0029969549 (VS pri obnove skontroluj v predpise, môže byť nový). "
      + "Poistenie končí 10. 11. 2027 a obnovuje sa samo; pojistné je splatné k počiatku nového roka, teda 11. 11. 2027. "
      + "Suma pri obnove môže byť iná než 7 315 Kč — platí predpis od ČPP. Mail s potvrdením, že byt je v poriadku, je v Gmaile (vlákno „Stráňvský Filip odpovědnost“, 30. 10. 2026).",
    je: (p) => /0029969549|podnikatelska pojistovna|\bcpp\b/.test(t(p)),
  },
  {
    // Obnova je automatická, ak sa nevypovie 6 týždňov pred koncom. Toto je
    // jediný deň, kedy sa dá ZMENIŤ poisťovňa alebo limit bez straty roka.
    id: "poistka-priestor-vypoved",
    nazov: "Poistka zodpovednosti: výpoveď alebo porovnanie",
    suma: "bez platby",
    rok: "2027",
    od: "2027-09-15",
    termin: "2027-09-29",
    do: "2027-10-31",
    popis:
      "Zmluva ČPP 0029969549 sa obnoví sama, ak ju písomne nevypovieš aspoň 6 týždňov pred 10. 11. 2027, teda najneskôr 29. 9. 2027. "
      + "Ak chceš poistku porovnať alebo zmeniť (iný limit, iná poisťovňa), spýtaj sa Václava Suchého (suchy@vs-finance.cz) ešte pred týmto dňom. Ak ju nechávaš, klikni Vybavené.",
  },
];

export type StavRocnej = { platba: RocnaPlatba; zaplatene: "banka" | "rucne" | null };

export const klucRocnejPlatby = (id: string, rok: string) => `rocna-platba|${id}|${rok}`;

/** Čo treba teraz zaplatiť (alebo vybaviť) — od dňa pripomenutia do konca okna. */
export function rocneNaZaplatenie(
  pohyby: PohybPlatby[],
  ack: Record<string, { note?: string } | undefined>,
  dnes: string = dnesPraha(),
): StavRocnej[] {
  const den = dnes.slice(0, 10);
  return ROCNE_PLATBY
    .filter((p) => den >= p.od && den <= p.do)
    .map((platba) => {
      const vOkne = pohyby.filter((m) => m.suma < 0 && m.datum.slice(0, 10) >= platba.od && m.datum.slice(0, 10) <= platba.do);
      const zaplatene = platba.je && vOkne.some(platba.je) ? "banka" as const
        : jeOdklik(ack[klucRocnejPlatby(platba.id, platba.rok)]) ? "rucne" as const : null;
      return { platba, zaplatene };
    })
    .filter((s) => !s.zaplatene);
}
