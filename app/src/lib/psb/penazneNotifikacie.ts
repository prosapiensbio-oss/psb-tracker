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
    title: `Bankový výpis nedorazil ${stara.dni} dní`,
    detail: `Posledný pohyb v banke je z ${fmtDMY(stara.poslednyPohyb)}, teda spred ${stara.dni} dní.`
      + (stara.dni >= 30
        ? " Bežiaci mesiac tak má v P&L tržby, ale nie náklady — zisk vyzerá vyšší, než je."
        : " Kým výpis nenahráš, výdavky bežiaceho mesiaca v P&L chýbajú.")
      + " Nahráva sa v Upload → Dáta.",
    priority: 6, client: "udaje|", trener: "Jerry",
    ...stavPolozkyRegistra(key, ack, "banka", dnes),
  };
}

/** „Bitcoin nesedí s PTminderom — X." */
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
    title: `Bitcoin nesedí s PTminderom — ${n.klient}`,
    detail: `${n.text}. Oprav to v PTminderi pri zdroji; kontrola je v Peniaze → Tržby.`,
    priority: 8, client: "vzas|trzby", trener: "Jerry", oKom: n.klient,
    ...stavPolozkyRegistra(n.kluc, ack, "btc", dnes),
  }));
}
