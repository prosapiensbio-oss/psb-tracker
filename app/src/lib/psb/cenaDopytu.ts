/**
 * CENA ZA DOPYT Z REKLAMY — jedna definícia pre pás Marketingu aj Prehľad.
 *
 * Jerry, 15. 10. 2026: „riešili sme cenu toho dopytu a ty si povedal cca
 * 5 200 — a čo potom znamená na stránke Marketing toto (9 072 Kč)?"
 * Dlaždica delila výdavok za DVANÁSŤ mesiacov tromi septembrovými dopytmi.
 * Z 27 214 Kč išlo ~20 700 na boosty a kampane na dosah z novembra až
 * augusta, ktoré o dopyt nikdy nežiadali (pamäť „Reklama bola boost") —
 * cena tak merala minulý rok, nie dnešnú reklamu.
 *
 * Preto sa počíta OD SEPTEMBRA 2026: od 8. 9. beží prvá kampaň na stránku
 * s formulárom a od 14. 9. nesú odkazy UTM. Výdavok aj dopyty z toho istého
 * okna, vrátane bežiaceho mesiaca (oboje je rovnako „napočítané").
 *
 * Cieľovú cenu Jerry zámerne nestanovil („sme radi, že nám príde akýkoľvek
 * dopyt, ladíme reklamy a necháme to na neskôr") — číslo preto NESÚDI:
 * žiadna farba, žiadny strop. Keď cieľ príde, patrí sem.
 */
import { monthKey } from "./format";

/** Prvý mesiac, keď reklama žiadala o dopyt. */
export const REKLAMA_NA_DOPYT_OD = "2026-09";

type Dopyt = { date: string; name?: string | null; email?: string | null; source?: string | null; kampan?: string | null; druh?: string | null };

export const jeDopytZReklamy = (l: Dopyt): boolean =>
  l.druh !== "magnet" && (l.source === "reklama" || !!l.kampan?.trim());

export type CenaDopytu = {
  od: string;
  spend: number;
  dopyty: Dopyt[];
  /** Koľko z dopytov nemá v odkaze UTM (zdroj „reklama" zapísaný ručne). */
  bezUtm: number;
  cena: number | null;
};

export function cenaDopytuZReklamy(kampane: { mesiac: string; spend: number }[], leads: Dopyt[], od = REKLAMA_NA_DOPYT_OD): CenaDopytu {
  // Riadok kampane je kampaň × mesiac (mkt_kampane), takže súčet je výdavok obdobia.
  const spend = kampane.filter((k) => k.mesiac >= od).reduce((a, k) => a + (Number(k.spend) || 0), 0);
  const videne = new Set<string>();
  const dopyty = leads
    .filter((l) => monthKey(l.date) >= od && jeDopytZReklamy(l))
    .filter((l) => {
      // Ten istý človek dvakrát (formulár aj mail) je jeden dopyt.
      const k = (l.name || l.email || "").trim().toLowerCase();
      if (!k) return true;
      if (videne.has(k)) return false;
      videne.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const bezUtm = dopyty.filter((l) => !l.kampan?.trim()).length;
  return { od, spend, dopyty, bezUtm, cena: dopyty.length ? spend / dopyty.length : null };
}
