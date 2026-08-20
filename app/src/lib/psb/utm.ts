/**
 * Značkovanie odkazov do reklamy.
 *
 * PREČO TO NIE JE JEDEN ODKAZ NAPEVNO
 *
 * Karta „Ako zapnúť meranie reklamy" mala do 19. 8. 2026 zadrátovanú jedinú
 * adresu — príručku o dýchaní so značkou pre Metu. Vznikla v čase, keď bežala
 * jedna kampaň. Jerry sa pýta na septembrový test: čo keď pôjde reklama na
 * ÚVODNÝ TRÉNING a čo keď pôjde cez GOOGLE. Odpoveď na oboje je iná adresa.
 *
 * PREČO GOOGLE ZNAČKU NEDOSTANE
 *
 * Google Ads si značkuje sám (parameter `gclid`, automatické značkovanie).
 * Ručné `utm_` v cieľovej adrese mu do toho hovorí a vie automatické
 * značkovanie prebiť — z dvoch zdrojov pravdy je jeden navyše. Pri Googli
 * teda nie je čo kopírovať; treba skontrolovať tri veci v jeho rozhraní.
 * Preto tu funkcia pre Google vracia null, nie odkaz.
 */

export type Platforma = "meta" | "google" | "mail";

/** Ako sa kanál volá v GA4. `null` znamená, že sa neznačkuje ručne. */
const ZNACKY: Record<Platforma, { source: string; medium: string } | null> = {
  meta: { source: "meta", medium: "paid" },
  mail: { source: "mailer", medium: "email" },
  google: null,
};

/**
 * Názov kampane na tvar, ktorý znesie adresa.
 *
 * Diakritika sa v adrese zakóduje na nečitateľnú zmes percent, takže sa
 * odstráni; medzery a interpunkcia idú na spojovník. „Úvodní trénink — září"
 * → `uvodni-trenink-zari`.
 */
export function slug(text: string): string {
  return (text || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Značkovaný odkaz do reklamy.
 *
 * Vracia null, keď sa značkovať nemá (Google) alebo keď chýba adresa.
 * Existujúce parametre v adrese zostanú; `utm_` sa prepíšu, aby dvojité
 * spustenie tej istej kampane nevyrobilo dva rôzne odkazy na to isté.
 */
export function znackovanyOdkaz(adresa: string, platforma: Platforma, kampan: string): string | null {
  const znacka = ZNACKY[platforma];
  if (!znacka) return null;
  const cista = (adresa || "").trim();
  if (!cista) return null;
  let u: URL;
  try { u = new URL(cista); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.searchParams.set("utm_source", znacka.source);
  u.searchParams.set("utm_medium", znacka.medium);
  const k = slug(kampan);
  if (k) u.searchParams.set("utm_campaign", k);
  else u.searchParams.delete("utm_campaign");
  // Bez dekódovania: slug je len [a-z0-9-], takže sa nič nezakóduje, a
  // dekódovať celú adresu by rozbilo tú, v ktorej je zakódovaná medzera.
  return u.toString();
}
