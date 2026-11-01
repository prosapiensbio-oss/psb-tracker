/**
 * ODKIAĽ KLIENT PRIŠIEL — názvy pre človeka (rozbor Kokpitu, 1. 11. 2026).
 *
 * V dátach sú kódy („fp", „ai", „offline"), a staršie zápisy aj iným písmom
 * („Referencia" popri „referencia"). Dáta sa nepremenúvajú; preklad je na
 * povrchu. Neznámu hodnotu (ručný zápis) ukáže takú, aká je.
 */
const NAZVY: Record<string, string> = {
  referencia: "Referencia",
  reklama: "Reklama (platená)",
  mail: "Mail (web formulár)",
  instagram: "Instagram",
  instagram_osobny: "Instagram — osobný",
  telefon: "Telefón",
  google: "Google",
  web: "Web",
  fp: "FP adresár",
  offline: "Tabuľa / billboard / leták",
  ai: "AI (ChatGPT a pod.)",
  ine: "Iné",
};

/** Kľúč na zlúčenie: „Referencia" a „referencia" sú jeden riadok, nie dva. */
export const klucZdroja = (zdroj: string | null | undefined): string => (zdroj || "").trim().toLowerCase();

export const nazovZdroja = (zdroj: string | null | undefined): string => {
  const z = (zdroj || "").trim();
  return NAZVY[z.toLowerCase()] || z;
};

/** Do tabuľky: aj prázdny zdroj má názov, inak by rebríček tvrdil, že ho nikto nemá. */
export const popisZdroja = (zdroj: string | null | undefined): string =>
  klucZdroja(zdroj) ? nazovZdroja(zdroj) : "Zdroj nezapísaný";
