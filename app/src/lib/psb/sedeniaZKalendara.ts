/**
 * DOCHÁDZKA Z KALENDÁRA — OD 1. 10. 2026 JE TO PRAVDA, PTMINDER JE KONTROLA.
 *
 * Jerry, 29. 9. 2026: „Kokpit by sa mal viac osamostatniť od PTmindera
 * a PTminder by mal slúžiť len ako kontrola." Prvá z troch tretín
 * (dochádzka, hodiny, peniaze) je dochádzka, lebo bola pripravená: od 8. 8.
 * 347 sedení a kalendár by sám stratil jedno.
 *
 * Od `KOKPIT_OD` sa tréningy pre VŠETKY výpočty (zostatky, karty, dlh, mail,
 * tržby podľa trénera) berú z kalendára. Tréningy z PTmindera za to isté
 * obdobie idú bokom (`sessionsPtminder`) a porovnávajú sa — neurčujú nič.
 * Pred týmto dňom zostáva PTminder: kalendár sa číta až od 8. 8. a staršia
 * história v ňom nie je.
 *
 * CENA TRÉNINGU
 *
 * Z ceny sa počítajú tržby podľa trénera a mesiaca, priemerná cena aj hodnota
 * klienta. Kalendár cenu nemá; bez nej by októbrové tržby klesli na nulu.
 * PTminder ju ráta ako cenu balíčka delenú počtom hodín — overené 29. 9. 2026:
 * 6 990 / 6 = 1 165, 9 400 / 8 = 1 175, 14 805 / 18 = 822,50. Presne tak sa
 * ráta aj tu, z balíčka zapísaného v Kokpite, ktorý v ten deň platil. Úvodný
 * tréning má pevnú cenu (v PTminderi posledných 16 úvodných po 1 100 Kč).
 *
 * ČO SA ZA TRÉNING NEPOVAŽUJE
 *
 * Len udalosť s klientom a typom tréning/úvodný — teda taká, ktorú Kokpit
 * pozná z mapovania mien. Neznámy názov sa NEHÁDA; objaví sa v Kope medzi
 * novými názvami. Zmiznutá udalosť sa nepočíta (zrušená), pokiaľ o nej
 * nepovedal Jerry „bol tam" (`kal_konanie`). A len to, čo sa už začalo.
 */
import type { SessionRow } from "./types";

/** Od tohto dňa je dochádzka z kalendára. */
export const KOKPIT_OD = "2026-10-01";

/** Úvodný tréning — v PTminderi 1 100 Kč pri všetkých 16 od júna 2026. */
export const CENA_UVODNEHO = 1100;

export type UdalostKalendara = {
  klient: string | null;
  trener: string;
  /** Pražský čas bez zóny, napr. `2026-10-06T10:30`. */
  zaciatok: string;
  koniec: string;
  nazov: string;
  typ: string | null;
};

export type BalicekKokpitu = {
  klient: string;
  /** Názov — podľa neho sa pozná online balíček („ON - 6h"). */
  nazov?: string;
  platnost_od: string;
  platnost_do: string | null;
  /**
   * Koľko hodín sa z balíčka od `platnost_od` ešte dá odtrénovať. Pri
   * balíčkoch naliatych z PTmindera je to ZOSTATOK v deň naliatia (Broskva
   * „ONE YEAR" 50 z 78), pri zapísaných v Kokpite celý balíček.
   */
  hodiny: number | null;
  /**
   * Celkový počet hodín produktu — ním sa delí cena. Bez neho by sa delilo
   * zostatkom a hodina by vyšla drahšia: 54 522 / 50 = 1 090 Kč namiesto
   * 54 522 / 78 = 699, ktoré ráta PTminder.
   */
  hodinySpolu?: number | null;
  cena_czk: number | null;
  zrusene_at?: string | null;
};

const den = (s: string) => String(s || "").slice(0, 10);

/** `14:30` → `2:30pm` — tvar, v akom čas nesie PTminder. */
export function casPtminder(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}${pm ? "pm" : "am"}`;
}

const minutyMedzi = (od: string, do_: string): number => {
  const a = Date.parse(`${od.slice(0, 16)}:00Z`), b = Date.parse(`${do_.slice(0, 16)}:00Z`);
  const m = Math.round((b - a) / 60000);
  return Number.isFinite(m) && m > 0 && m <= 240 ? m : 60;
};

/**
 * Cena hodiny z balíčka, ktorý klientovi v ten deň platil.
 *
 * Keď ich platí viac, rozhoduje najnovší — to je ten, z ktorého sa hodiny
 * práve míňajú. Balíček bez ceny alebo bez hodín (paušál, darček) dá 0,
 * rovnako ako v PTminderi.
 */
/**
 * Balíček, z ktorého sa tréning odpíše.
 *
 * Keď klient má naraz online aj offline členstvo, rozhoduje typ tréningu —
 * online hodina ide z online balíčka. Marcela Hrůzová má „ON - 6h" aj
 * „OFF - 1 hodina"; PTminder jej online tréning 24. 9. ocenil z online
 * (1 098,33 Kč), nie z novšieho offline (1 450). Až potom rozhoduje novší.
 */
function platnyBalicek(balicky: BalicekKokpitu[], klient: string, isoDen: string, online = false): BalicekKokpitu | null {
  const platne = balicky
    .filter((b) => b.klient === klient && !b.zrusene_at && den(b.platnost_od) <= isoDen && (!b.platnost_do || den(b.platnost_do) >= isoDen))
    .sort((a, b) => den(b.platnost_od).localeCompare(den(a.platnost_od)));
  const jeOnline = (b: BalicekKokpitu) => /^\s*ON\b|online/i.test(b.nazov || "");
  return platne.find((b) => jeOnline(b) === online) || platne[0] || null;
}

const cenaZBalicka = (b: BalicekKokpitu | null): number => {
  const delitel = (b?.hodinySpolu || 0) > 0 ? b!.hodinySpolu! : (b?.hodiny || 0);
  if (!b || !b.cena_czk || !delitel) return 0;
  return Math.round((b.cena_czk / delitel) * 100) / 100;
};

/** Cena hodiny z balíčka, ktorý v ten deň platil (bez ohľadu na minuté hodiny). */
export function cenaHodiny(balicky: BalicekKokpitu[], klient: string, isoDen: string): number {
  return cenaZBalicka(platnyBalicek(balicky, klient, isoDen));
}

export function sedeniaZKalendara(
  udalosti: UdalostKalendara[],
  balicky: BalicekKokpitu[],
  /** Pražský „teraz" ako `YYYY-MM-DDTHH:MM` — budúce udalosti sa nepočítajú. */
  teraz: string,
  od: string = KOKPIT_OD,
): SessionRow[] {
  const out: SessionRow[] = [];
  /**
   * Koľko hodín sa z ktorého balíčka už minulo. Tréning nad rámec balíčka
   * je v PTminderi za 0 Kč — kryje ho doplnenie (hodiny už zaplatené skôr)
   * alebo je to dlh, ktorý príde s ďalšou platbou. Keby sa ocenil cenou
   * členstva, tržby by boli vyššie, než klient zaplatil (Barbora Vaňková
   * mala v septembri 3 také tréningy).
   */
  const minute = new Map<BalicekKokpitu, number>();
  const chronologicky = udalosti.slice().sort((a, b) => a.zaciatok.localeCompare(b.zaciatok));
  for (const u of chronologicky) {
    if (!u.klient || (u.typ !== "trening" && u.typ !== "uvodny")) continue;
    const d = den(u.zaciatok);
    if (d < od || u.zaciatok.slice(0, 16) > teraz) continue;
    const uvodny = u.typ === "uvodny";
    const online = !uvodny && /online/i.test(u.nazov || "");
    const minut = minutyMedzi(u.zaciatok, u.koniec);
    out.push({
      date: `${d}T00:00:00.000Z`,
      time: casPtminder(u.zaciatok.slice(11, 16)),
      client: u.klient,
      sessionTrainer: u.trener,
      sessionName: uvodny ? "Uvodny trenink OFFLINE" : `${online ? "ONLINE" : "OFFLINE"} - ${minut}min`,
      sessionType: uvodny ? "UVODNE" : online ? "ONLINE" : "OFFLINE",
      duration: minut,
      price: uvodny ? CENA_UVODNEHO : (() => {
        const b = platnyBalicek(balicky, u.klient, d, online);
        if (!b) return 0;
        const n = minute.get(b) || 0;
        minute.set(b, n + minut / 60);
        return b.hodiny != null && n + minut / 60 > b.hodiny + 1e-9 ? 0 : cenaZBalicka(b);
      })(),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/**
 * Spojí dve histórie na jednu: pred `od` PTminder, od `od` kalendár.
 * Vráti aj to, čo z PTmindera od `od` zostalo bokom — na kontrolu.
 */
export function spojDochadzku(
  ptminder: SessionRow[],
  zKalendara: SessionRow[],
  od: string = KOKPIT_OD,
): { sessions: SessionRow[]; kontrola: SessionRow[] } {
  return {
    sessions: [...ptminder.filter((s) => den(s.date) < od), ...zKalendara],
    kontrola: ptminder.filter((s) => den(s.date) >= od),
  };
}

/**
 * Doplní balíčkom z Kokpitu celkový počet hodín, ktorým sa delí cena.
 *
 * Balíček zapísaný v Kokpite ho má v `hodiny`. Naliaty z PTmindera nesie
 * v `hodiny` zostatok v deň naliatia, takže celok sa hľadá v exporte:
 * „78 left from 78" → 78, členstvo „8 per month" → 8, inak číslo z názvu.
 */
export function doplnHodinySpolu(
  balicky: (BalicekKokpitu & { nazov: string; zdroj?: string | null })[],
  export_: { client: string; package: string; total: number; naObdobie?: number }[],
  hodinZNazvu: (nazov: string) => number,
): BalicekKokpitu[] {
  return balicky.map((b) => {
    if (b.zdroj !== "ptminder") return { ...b, hodinySpolu: b.hodiny };
    const p = export_.find((x) => x.client === b.klient && x.package === b.nazov);
    const spolu = (p?.total || 0) > 0 ? p!.total : (p?.naObdobie || 0) > 0 ? p!.naObdobie! : hodinZNazvu(b.nazov) || b.hodiny;
    return { ...b, hodinySpolu: spolu };
  });
}
