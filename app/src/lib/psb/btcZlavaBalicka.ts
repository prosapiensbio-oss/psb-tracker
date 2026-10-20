import { cenaPoZlave, katalogovaCena } from "./lightning";
import { NAZOV_UVODNEHO } from "./workspaceKroky";

/**
 * BITCOINOVÁ ZĽAVA AJ PRI BALÍČKU, KTORÝ VZNIKOL SÁM (Jerry, 20. 10. 2026:
 * „Knapčok platí BTC — prečo má plnú sumu?"). Návrh berie cenu z cenníka,
 * a tak Michal Knapčok dostal 18h Balíček za 21 150 Kč namiesto 14 805
 * (−30 %). Zľava je číslo pri klientovi (`btcZlava`), základ je cenník —
 * nie predošlá zaplatená suma (inak zľava dvakrát). „Platí stále X Kč" je
 * už cena po zľave a ostáva, úvodný sa nezľavuje.
 */
export function sBtcZlavou<T extends { nazov: string; cena: number; cenaPoznamka?: string }>(
  n: T,
  prepis?: { bitcoin?: boolean | null; btcZlava?: number | null } | null,
): T {
  const zlava = Number(prepis?.btcZlava) || 0;
  if (!prepis?.bitcoin || zlava <= 0 || !(n.cena > 0)) return n;
  if (n.nazov === NAZOV_UVODNEHO || /^platí stále/.test(n.cenaPoznamka || "")) return n;
  const katalog = katalogovaCena(n.nazov);
  if (katalog == null || Math.round(n.cena) !== katalog) return n;
  return { ...n, cena: cenaPoZlave(katalog, zlava), cenaPoznamka: `${zlava} % zľava za bitcoin z ${katalog.toLocaleString("cs-CZ").replace(/\u00a0/g, " ")} Kč` };
}
