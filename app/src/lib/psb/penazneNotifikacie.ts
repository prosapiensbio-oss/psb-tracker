// Peňažné upozornenia — jeden výpočet pre obrazovku aj pre ranný push.
//
// Jerry, 3. 9. 2026: „doplň aj tie peňažné notifikácie." Boli zabudované
// priamo v App.tsx, takže o nich vedel len otvorený prehliadač; ranná dávka
// na telefón ich nemala odkiaľ vziať a Jerry videl na obrazovke štyri veci,
// v telefóne dve.
//
// Postavené sú ako čisté funkcie nad hotovými vstupmi (posledný pohyb v banke,
// platby) zámerne: appka aj server si ich vedia zavolať z toho, čo majú, a
// nemôžu sa rozísť. Peniaze má na starosti Jerry, preto všetky nesú
// `trener: "Jerry"` — Terezke by to bol šum.

import { porovnajBtcPlatby } from "./btcKontrola";
import { stavPolozkyRegistra, type RegisterItem } from "./compute";
import { fmtDMY } from "./format";
import { zastaranaBanka } from "./kontrolaNakladov";
import type { BtcKnihaPlatba } from "./compute";
import type { PaymentRow } from "./types";

type Ack = Record<string, { note?: string; ackedAt?: string } | undefined>;

/** „Bankový výpis nedorazil X dní." */
export function polozkaZastaranaBanka(poslednyPohyb: string, ack: Ack, dnes = new Date()): RegisterItem | null {
  const stara = zastaranaBanka(poslednyPohyb, dnes);
  if (!stara) return null;
  // Kľúč nesie posledný pohyb — po nahratí výpisu sa zmení a upozornenie
  // zmizne samo; odklepnutie teda umlčí tento výpadok, nie kontrolu navždy.
  const key = `banka|${stara.poslednyPohyb}`;
  return {
    key, category: "Zápis", tone: stara.tone,
    /**
     * VÝDAVKY, NIE „VÝPIS" (Jerry, 14. 10. 2026: „keďže to už ide z Fio API,
     * je toto potrebná notifikácia?"). Je — API sa samo nespúšťa. Príjmy si
     * berie krok Platby, výdavky len karta Banka, kde dostávajú kategóriu do
     * P&L (odhad kategórie nemá tiecť do P&L bez človeka). Text hovoril
     * „nahráva sa", čo pochádzalo z čias súboru.
     */
    title: `Výdavky z banky nie sú stiahnuté ${stara.dni} dní`,
    detail: `Posledný výdavok z Fio je z ${fmtDMY(stara.poslednyPohyb)}, teda spred ${stara.dni} dní.`
      + (stara.dni >= 30
        ? " Bežiaci mesiac tak má v P&L tržby, ale nie náklady — zisk vyzerá vyšší, než je."
        : " Kým ich nestiahneš, výdavky bežiaceho mesiaca v P&L chýbajú.")
      // Od 14. 10. 2026 ich Kokpit sťahuje sám každú noc (`fio-banka`) — keď
      // je výdavok starší než prah, automat nebeží, nie „zabudol si".
      + " Kokpit ich sťahuje sám každú noc, takže automat pravdepodobne nebeží — pozri Zdravie Kokpitu, alebo ich stiahni ručne v Upload → Dáta → Banka.",
    priority: 6, client: "udaje|", trener: "Jerry",
    ...stavPolozkyRegistra(key, ack, "banka", dnes),
  };
}

/** „Bitcoin nesedí s knihou platieb — X." */
export function polozkyBtcNesedi(
  payments: PaymentRow[],
  btcPlatby: BtcKnihaPlatba[],
  ack: Ack,
  dnes = new Date(),
): RegisterItem[] {
  if (!btcPlatby.length) return [];
  // Hlási sa LEN `nesedi`, nie `ciastocne`: čiastočná platba v bitcoine je
  // bežná vec (zvyšok prišiel inou cestou) a upozornenie by z nej urobilo
  // problém, ktorý neexistuje.
  return porovnajBtcPlatby(payments, btcPlatby).nesedi.map((n) => ({
    key: n.kluc, category: "Anomália" as const, tone: "orange" as const,
    title: `Bitcoin nesedí s knihou platieb — ${n.klient}`,
    detail: `${n.text}. Chýbajúcu platbu zapíš v Kokpite (Evidencia → Platby); kontrola je v Peniaze → Tržby.`,
    priority: 8, client: "vzas|trzby", trener: "Jerry", oKom: n.klient,
    ...stavPolozkyRegistra(n.kluc, ack, "btc", dnes),
  }));
}
