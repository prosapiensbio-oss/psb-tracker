/**
 * PREŽITIE KLIENTOV PO KOHORTÁCH.
 *
 * Jerry, 24. 9. 2026 — jeden z dvoch návrhov z auditu, ktoré stoja na dátach,
 * čo už v databáze sú.
 *
 * Kokpit vedel povedať, koľko klientov má dnes a koľko ich odišlo za mesiac.
 * Nevedel povedať to podstatnejšie: KOĽKO Z ĽUDÍ, ČO PRIŠLI V MARCI, TU JE
 * PO POL ROKU. A práve podľa toho sa rozhoduje, či sa oplatí kupovať ďalších,
 * alebo držať tých, čo sú — nový klient za 2 000 Kč je dobrý obchod len
 * vtedy, keď vydrží dlhšie než pár mesiacov.
 *
 * ČO SA POČÍTA ZA „EŠTE CHODÍ"
 *
 * Klient patrí do kohorty mesiaca svojho PRVÉHO tréningu. Po N mesiacoch sa
 * počíta ako žijúci vtedy, keď má aspoň jeden tréning v okne ±1 mesiac okolo
 * toho bodu. Nie „posledný tréning je neskôr" — to by z jedného zabudnutého
 * tréningu po roku urobilo verného klienta.
 *
 * KOHORTA, KTORÁ EŠTE NEDOZREla, SA NEPOČÍTA
 *
 * Kto prišiel pred dvoma mesiacmi, nemôže mať šesťmesačné prežitie. Také
 * políčko zostáva prázdne — nie nulové. Nula by vyzerala ako odchod a
 * priemer by ťahala dole presne v najnovších mesiacoch, kde je najviac ľudí.
 */

import { monthKey } from "./format";

export type Kohorta = {
  /** Mesiac prvého tréningu, `RRRR-MM`. */
  mesiac: string;
  /** Koľko ľudí v tom mesiaci prišlo. */
  prislo: number;
  /**
   * Koľko z nich ešte chodilo po N mesiacoch. `null` = kohorta na ten bod
   * ešte nedozrela, teda sa to nedá povedať.
   */
  ziju: Record<number, number | null>;
};

type Klient = { name: string; firstSession?: string; sessions: { date: string }[] };

const MESIAC = 30.44 * 86400000;

/** Body, v ktorých sa prežitie meria. */
export const BODY = [3, 6, 12] as const;

export function kohortyKlientov(
  klienti: Klient[],
  dnes: Date = new Date(),
  body: readonly number[] = BODY,
): Kohorta[] {
  const podlaMesiaca = new Map<string, Klient[]>();
  for (const k of klienti) {
    if (!k.firstSession) continue;
    const m = monthKey(k.firstSession);
    if (!m) continue;
    if (!podlaMesiaca.has(m)) podlaMesiaca.set(m, []);
    podlaMesiaca.get(m)!.push(k);
  }

  const out: Kohorta[] = [];
  for (const [mesiac, ludia] of [...podlaMesiaca.entries()].sort()) {
    const ziju: Record<number, number | null> = {};
    for (const n of body) {
      let zivych = 0;
      let dozrelo = false;
      for (const k of ludia) {
        const start = Date.parse(String(k.firstSession).slice(0, 10));
        if (!Number.isFinite(start)) continue;
        const bod = start + n * MESIAC;
        // Kohorta dozrela, keď bod už prešiel — meria sa podľa KLIENTA, nie
        // podľa mesiaca: ľudia z toho istého mesiaca prišli v rôzne dni.
        if (bod + MESIAC <= dnes.getTime()) dozrelo = true;
        const od = bod - MESIAC, doD = bod + MESIAC;
        if (k.sessions.some((s) => {
          const t = Date.parse(String(s.date).slice(0, 10));
          return Number.isFinite(t) && t >= od && t <= doD;
        })) zivych++;
      }
      ziju[n] = dozrelo ? zivych : null;
    }
    out.push({ mesiac, prislo: ludia.length, ziju });
  }
  return out;
}

/** Priemer naprieč dozretými kohortami — jedno číslo na každý bod. */
export function priemernePrezitie(kohorty: Kohorta[], body: readonly number[] = BODY): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const n of body) {
    const zrele = kohorty.filter((k) => k.ziju[n] != null && k.prislo > 0);
    const prislo = zrele.reduce((a, k) => a + k.prislo, 0);
    const zivych = zrele.reduce((a, k) => a + (k.ziju[n] as number), 0);
    out[n] = prislo ? zivych / prislo : null;
  }
  return out;
}
