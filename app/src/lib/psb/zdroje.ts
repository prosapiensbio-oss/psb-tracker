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

export const nazovZdroja = (zdroj: string | null | undefined): string => {
  const z = (zdroj || "").trim();
  return NAZVY[z.toLowerCase()] || z;
};
