/**
 * NÁHĽAD ODKAZU V ŠÍRKE TELEFÓNU (Jerry, 16. 10. 2026: „verím, že to funguje
 * naprieč všetkými odkazmi"). „Pozrieť, čo uvidí" otváral stránku v novej
 * karte — na počítači roztiahnutú na celú šírku, takže pôsobila inak než
 * u klienta v telefóne. Otvára sa preto malé okno 390 × 844 (iPhone);
 * keď ho prehliadač nepustí, ostane obyčajná nová karta.
 */
export const SIRKA_TELEFONU = 390;

export function otvorNahlad(e: { preventDefault: () => void }, url: string): void {
  e.preventDefault();
  const okno = window.open(url, "psb-nahlad", `popup=yes,width=${SIRKA_TELEFONU},height=844`);
  if (!okno) window.open(url, "_blank", "noopener");
  else okno.focus();
}
