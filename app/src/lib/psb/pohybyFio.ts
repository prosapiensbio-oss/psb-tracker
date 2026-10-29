/**
 * NÁHĽAD POHYBOV NA ÚČTE — filter pre kartu v Evidencii.
 *
 * Jerry, 29. 10. 2026, nad otázkou „Prišlo 1 100 Kč" pri Albertovi Matlovi:
 * „kedy, kde, koľko?" Odpoveď bola v `fio_transactions` (21. 9., jeden prevod
 * 8 890 Kč), ale v appke nebolo miesto, kde by sa dala prečítať bez dopytu
 * do databázy. Karta len číta — páruje sa ďalej v kroku Platby a balíčky.
 */
import { normName } from "./format";

export type PohybFio = {
  datum: string;
  suma: number;
  protistrana: string;
  poznamka: string;
  typ: string;
  kategoria: string;
  kluc: string;
  /** Komu je príjem priradený (môže ich byť viac — rozdelený prevod). */
  klienti: string;
  nieKlient: boolean;
};

export type DruhPohybov = "vsetko" | "prijmy" | "nesparovane" | "vydavky";

/** Hotovosť zo zošita je v tej istej tabuľke — na účte nie je. */
export const jeZBanky = (p: Pick<PohybFio, "typ">) => p.typ !== "hotovosť";

/** Príjem, ktorý nikto nevybavil: nemá klienta ani značku „nie je klient". */
export const jeNesparovany = (p: PohybFio) => p.suma > 0 && !p.klienti && !p.nieKlient;

/**
 * Hľadá v protistrane, správe, priradenom klientovi aj v sume. Bez diakritiky
 * a veľkosti písmen; viac slov musí sedieť všetky („matl 8890").
 * Suma sa hľadá aj s medzerou v tisícoch („8 890"), lebo tak ju človek vidí.
 */
export function filtrujPohyby(pohyby: PohybFio[], hladaj: string, druh: DruhPohybov): PohybFio[] {
  const slova = normName(hladaj).replace(/(\d)\s+(?=\d)/g, "$1").split(" ").filter(Boolean);
  return pohyby.filter((p) => {
    if (!jeZBanky(p)) return false;
    if (druh === "prijmy" && p.suma <= 0) return false;
    if (druh === "vydavky" && p.suma >= 0) return false;
    if (druh === "nesparovane" && !jeNesparovany(p)) return false;
    if (!slova.length) return true;
    const text = normName(`${p.protistrana} ${p.poznamka} ${p.klienti} ${p.kategoria}`);
    const suma = String(Math.abs(Math.round(p.suma)));
    return slova.every((s) => text.includes(s) || (/^-?\d+$/.test(s) && suma === s.replace("-", "")));
  });
}
