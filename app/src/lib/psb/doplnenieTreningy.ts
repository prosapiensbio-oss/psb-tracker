import { KOKPIT_OD } from "./sedeniaZKalendara";

/**
 * KTORÉ TRÉNINGY ŠLI Z DOPLNENIA ČLENSTVA (Jerry, 8. 11. 2026, Daniela
 * Šašinková: „chcel by som mať možnosť na to kliknúť a pozrieť si, aké
 * tréningy konkrétne to boli").
 *
 * Doplnenie z PTmindera nemá platnosť, takže ho os času nevie zaradiť do
 * úseku. PTminder ho ale prezradí cenou: tréning z členstva stojí podiel
 * z ceny (9 400 / 8 = 1 175 Kč), tréning z doplnenia 0 Kč — doplnenie nemá
 * cenu. U Šašinkovej to sedí na všetky tri overiteľné doplnenia: 4. 7. 2026
 * 2 h = 3. a 9. 7., 12. 9. 1 h = 7. 9.
 *
 * Tréning za 0 Kč sa priradí NAJBLIŽŠIEMU doplneniu (do 60 dní na obe strany:
 * PTminder doplnenie pridáva aj spätne). Kde je počet hodín známy z histórie,
 * berie sa najviac toľko, najbližšie prvé. Len éra PTmindera (pred 1. 10.
 * 2026); od vtedy doplnenie nesie hodiny a tréningy mu dáva os sama.
 */
export type SedenieDoplnenia = { den: string; cas?: string; trener?: string; cena: number; uvodny?: boolean };

const dni = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;

export function treningyDoplneni<T extends SedenieDoplnenia>(
  doplnenia: { den: string; hodin?: number | null }[],
  sedenia: T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  if (!doplnenia.length) return out;
  const kandidati = sedenia.filter((s) => s.cena === 0 && !s.uvodny && s.den < KOKPIT_OD);
  const priradene = new Map<string, { s: T; vzd: number }[]>();
  for (const s of kandidati) {
    let naj: { den: string; vzd: number } | null = null;
    for (const d of doplnenia) {
      if (d.den >= KOKPIT_OD) continue;
      const v = dni(s.den, d.den);
      if (v <= 60 && (!naj || v < naj.vzd)) naj = { den: d.den, vzd: v };
    }
    if (naj) priradene.set(naj.den, [...(priradene.get(naj.den) || []), { s, vzd: naj.vzd }]);
  }
  for (const d of doplnenia) {
    const xs = (priradene.get(d.den) || []).sort((a, b) => a.vzd - b.vzd);
    const strop = d.hodin && d.hodin > 0 ? Math.round(d.hodin) : xs.length;
    const vybrane = xs.slice(0, strop).map((x) => x.s).sort((a, b) => b.den.localeCompare(a.den));
    if (vybrane.length) out.set(d.den, vybrane);
  }
  return out;
}
