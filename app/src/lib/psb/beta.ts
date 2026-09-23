/**
 * Beží táto stránka ako BETA?
 *
 * Jerry, 23. 9. 2026: chcel miesto, kde sa dajú preklikať nové návrhy skôr,
 * než sa nimi dotkneme ostrého Kokpitu. Beta je ten istý kód nasadený pod
 * menom `kokpit-beta` (`scripts/beta.sh`) — takže sa nepozná z konfigurácie
 * ani z premennej, ale z ADRESY. Je to jediný údaj, ktorý sa medzi tými
 * dvoma nasadeniami naozaj líši.
 *
 * Prečo nie premenná prostredia: tá by sa musela nastaviť pri nasadení a raz
 * by sa zabudla — a beta bez pruhu je horšia než žiadna beta, lebo človek
 * zapisuje do ostrých dát v domnení, že skúša.
 */
export const jeBeta = (): boolean => {
  if (typeof location === "undefined") return false;
  return /(^|\/\/)kokpit-beta[.-]/.test(location.href) || location.hostname.startsWith("kokpit-beta");
};
