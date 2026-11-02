import { useEffect, useMemo, useState } from "react";

import { fetchBtcReserve, fetchVzasSettings, type BtcReserve } from "../../lib/psb/client";
import { pocuvaj } from "../../lib/psb/obnovaSignal";
import { breakEvenPriemer, spocitajRezervu } from "../../lib/psb/rezerva";
import { stavRezervnehoUctu, type PrevodRezervy } from "../../lib/psb/rezervaOdlozenie";
import { vzasVerzia } from "../../lib/psb/vzas";

/**
 * Rezerva firmy pre obrazovku, ktorá nedostáva stav účtu a hotovosti zhora.
 *
 * Jerry, 2. 11. 2026: „rezerva mi ukazuje 1,8 mesiaca a keď na ňu kliknem,
 * vidím 1,6." Dlaždica delila všetky peniaze break-evenom za pol roka, detail
 * len bitcoin break-evenom za zvolené obdobie aj s rozrobeným mesiacom. Dve
 * čísla pod jedným menom, a výsledok vyšiel podobne len náhodou.
 */
export function useRezerva(prevody: PrevodRezervy[] | undefined, zapnute = true) {
  const [btc, setBtc] = useState<BtcReserve | null>(null);
  const [btcStav, setBtcStav] = useState<"load" | "ok" | "err">("load");
  const [ucet, setUcet] = useState<{ suma: number; datum: string } | null>(null);
  const [hotovost, setHotovost] = useState<{ suma: number; datum: string } | null>(null);
  const [verzia, setVerzia] = useState(0);

  useEffect(() => pocuvaj("peniaze", () => setVerzia((v) => v + 1)), []);

  useEffect(() => {
    if (!zapnute) return;
    void fetchBtcReserve().then((r) => { setBtc(r); setBtcStav(r ? "ok" : "err"); });
    void fetchVzasSettings().then((st) => {
      const v = st["stav_penazi"] as { hotovost?: number; fio?: number; datum: string } | undefined;
      setHotovost(v && typeof v.hotovost === "number" ? { suma: v.hotovost, datum: v.datum } : null);
      const fz = st["fio_zostatok"] as { suma?: number; datum: string } | undefined;
      if (fz && typeof fz.suma === "number") setUcet({ suma: fz.suma, datum: fz.datum });
      else setUcet(v && typeof v.fio === "number" ? { suma: v.fio, datum: v.datum } : null);
    }).catch(() => {});
  }, [zapnute, verzia]);

  const rezervnyUcet = stavRezervnehoUctu(prevody || []);
  const rezerva = useMemo(
    () => spocitajRezervu({ btcCzk: btc?.czk ?? null, ucet, hotovost, rezervnyUcet, bePriem: breakEvenPriemer().bePriem }),
    [btc, ucet, hotovost, rezervnyUcet, vzasVerzia()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { rezerva, btc, btcStav, ucet, hotovost, rezervnyUcet };
}
