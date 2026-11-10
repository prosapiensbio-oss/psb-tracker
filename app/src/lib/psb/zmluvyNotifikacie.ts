/**
 * „PODPÍSAL(A) ZMLUVU“ — notifikácia trénerovi (Jerry, 10. 11. 2026: „bude
 * tam notifikácia klient nemá podpísanú zmluvu, tak ako je teraz, a bude
 * tam notifikácia klient podpísal").
 *
 * Kľúč nesie id zmluvy, takže „Vybavené“ platí na ten jeden podpis a nová
 * zmluva toho istého klienta sa ohlási znova.
 */
import { podlaRodu } from "./rodKlienta";

export type PodpisanaZmluvaNot = { id: string; klient: string; at: string };

export function notifikacieZmluv(rows: PodpisanaZmluvaNot[]): { key: string; klient: string; title: string; detail: string }[] {
  return rows
    .filter((r) => r.id && r.klient && r.at)
    .map((r) => {
      const [, mm, dd] = r.at.slice(0, 10).split("-").map(Number);
      return {
        key: `zmluva-podpisana|${r.id}`,
        klient: r.klient,
        title: `${r.klient} ${podlaRodu(r.klient, { m: "podpísal", z: "podpísala", neutralne: "podpísal(a)" })} zmluvu 6M`,
        detail: `${dd}. ${mm}. cez odkaz z Kokpitu. Zmluva je pri klientovi (Workspace → Zmluvy) a v profile svieti „podpísaná“.`,
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}
