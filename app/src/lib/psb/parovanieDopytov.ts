import { jeKlient, najdiKlienta, type ClientAgg } from "./compute";
import { normName } from "./format";
import type { PSBData } from "./types";

/**
 * ČO SA Z DOPYTU STALO — JEDNA DEFINÍCIA (kontrola po nasadení, 1. 11. 2026).
 *
 * Tie isté dopyty mali na štyroch obrazovkách štyri výsledky: Dopyty „Konverzia
 * na klienta 83 %" (44 z 53), Prehľad úvodný 37 z 53, kohorty 44 úvodných
 * a 33 klientov, Lievik 29 klientov. Rozdiel nebol v dátach, ale v otázke:
 *  • Dopyty a graf kohort sa pýtali „je to meno vôbec v Kokpite?" — a to spĺňa
 *    aj ten, kto prišiel raz na úvodný, kto ho má len v kalendári (Jolana
 *    Hořovská), aj dávny klient, ktorý vyplnil formulár znova (Dan Kouřil);
 *  • kohorty brali „má prvé sedenie" a „je platiaci" bez ohľadu na dátum dopytu.
 *
 * Správna otázka je tá z `krokyZa`: stalo sa to PO dopyte? Volá to Lievik,
 * Prehľad (cez `krokyZa`), kohorty, Dopyty, grafy aj Jarvis.
 */
export function parovanieDopytov(
  data: Pick<PSBData, "sessions" | "payments">,
  clients: Record<string, ClientAgg>,
) {
  // Párovanie cez `najdiKlienta` (presne + fuzzy), nie cez holé `normName`.
  // „Lukáš Hanus" z dopytu a „Lukas Hanus" z PTmindera sú jeden človek; presná
  // zhoda z nich robila dvoch (18. 8. 2026).
  const menaPlatiacich = Object.values(clients).filter((c) => jeKlient(c, data.payments)).map((c) => c.name);
  const prvePodlaMena = new Map(Object.values(clients).map((c) => [normName(c.name), c.firstSession || ""]));
  // Úvodné z CELEJ histórie: dopyt z konca okna má úvodný pokojne o dva týždne
  // neskôr, teda mimo okna.
  const uvodneVsetky = new Map<string, string>();
  for (const s of data.sessions.filter((x) => x.sessionType === "UVODNE").sort((a, b) => a.date.localeCompare(b.date)))
    if (!uvodneVsetky.has(s.client)) uvodneVsetky.set(s.client, s.date);
  const menaUvodnych = [...uvodneVsetky.keys()];

  return {
    /**
     * Kanonické meno platiaceho klienta, ktorým sa človek stal PO dopyte; inak "".
     * Bez tej podmienky sa ako konverzia počítal aj existujúci klient, ktorý
     * vyplnil formulár znova — jeho prvé sedenie je roky pred dopytom (19. 8. 2026).
     */
    klient(l: { name?: string; date: string }): string {
      if (!l.name) return "";
      const kanonicke = najdiKlienta(menaPlatiacich, l.name);
      if (!kanonicke) return "";
      const prve = prvePodlaMena.get(normName(kanonicke)) || "";
      return !prve || prve >= l.date ? kanonicke : "";
    },
    /** Úvodný tréning, ktorý prišiel najskôr v deň dopytu; inak `null`. */
    uvodny(l: { name?: string; date: string }): { meno: string; datum: string } | null {
      if (!l.name) return null;
      const meno = najdiKlienta(menaUvodnych, l.name);
      if (!meno) return null;
      const datum = (uvodneVsetky.get(meno) || "").slice(0, 10);
      if (datum && datum < l.date.slice(0, 10)) return null;
      return { meno, datum };
    },
  };
}
