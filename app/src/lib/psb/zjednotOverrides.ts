/**
 * Ručné zápisy o klientovi pod JEDNO meno.
 *
 * Jerry, 23. 9. 2026: „pozrel som si Dominiku Križovú — prečo sú tam dve?"
 *
 * Lebo Kokpit ju pozná pod dvoma menami. 14. 9. jej Jarvis na Jerryho pokyn
 * zapísal doživotnú 15% zľavu, primárneho trénera a poznámku o histórii —
 * pod meno z KALENDÁRA, „Dominika Krizova". PTminder ju o štyri dni neskôr
 * vyexportoval ako „Dominika Križova", s mäkkým ž. Dva reťazce, jeden človek.
 *
 * Appka pritom mená porovnávať vie (normName zahadzuje dĺžne a mäkčene), len
 * override si hľadala presným kľúčom: `clientOverrides[c.name]`. Kto nemá
 * meno napísané na znak rovnako ako export, ten svoj zápis nikdy neuvidí —
 * a v zozname klientov sa objaví druhýkrát ako človek bez tréningov.
 *
 * Preto sa riadky prekľúčujú hneď pri čítaní z databázy, nie až na obrazovke:
 * keby to robila jedna obrazovka, ostatné by ticho ukazovali staré.
 *
 * KEĎ SA DVA RIADKY STRETNÚ, NEPREHRÁ ANI JEDEN
 *
 * Zlučuje sa po políčkach: čo je vyplnené, to prežije. Až keď sú vyplnené
 * OBE a líšia sa, rozhodne novší zápis — to je jediný prípad, keď sa dá
 * povedať, ktorý z nich človek písal ako druhý.
 */

import { normName } from "./format";
import type { ClientOverride } from "./types";

/** Políčka, kde „prázdno" znamená „nepísané" a smie ho prebiť čokoľvek. */
const prazdne = (v: unknown) => v === undefined || v === null || v === "" || v === false;

export function zjednotOverrides(
  riadky: { meno: string; ov: ClientOverride }[],
  /** Mená klientov z exportu — tie sú kanonické, tie vidí zvyšok appky. */
  menaKlientov: string[],
): Record<string, ClientOverride> {
  const kanon: Record<string, string> = {};
  for (const m of menaKlientov) {
    const k = normName(m);
    if (k && !kanon[k]) kanon[k] = m;
  }

  const out: Record<string, ClientOverride> = {};
  // Zoradené od najstaršieho: novší zápis tak prichádza ako druhý a prebíja.
  const zoradene = [...riadky].sort((a, b) => String(a.ov.updatedAt || "").localeCompare(String(b.ov.updatedAt || "")));

  for (const { meno, ov } of zoradene) {
    const kluc = kanon[normName(meno)] || meno;
    const doteraz = out[kluc];
    if (!doteraz) { out[kluc] = { ...ov }; continue; }
    const zluc: ClientOverride = { ...doteraz };
    for (const [pole, hodnota] of Object.entries(ov) as [keyof ClientOverride, unknown][]) {
      if (prazdne(hodnota)) continue;
      (zluc as Record<string, unknown>)[pole] = hodnota;
    }
    // `updatedAt` musí zostať to NOVŠIE, aj keď novší riadok mal pole prázdne —
    // inak by „ručná pauza" vyzerala staršie, než naozaj je.
    zluc.updatedAt = [doteraz.updatedAt || "", ov.updatedAt || ""].sort().pop() || "";
    out[kluc] = zluc;
  }
  return out;
}
