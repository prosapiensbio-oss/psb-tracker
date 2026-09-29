/**
 * PRÍPRAVA TRÉNINGU NA ZÁPIS DO KALENDÁRA — čistá časť, testovateľná.
 *
 * Kalendár trénera je jeho vlastný Google účet; adresy sú tie isté, z ktorých
 * snímky čítajú (kal_zdroje). Udalosť sa pomenúva PLNÝM MENOM KLIENTA — nie
 * prezývkou — aby ju mapovanie prečítalo naspäť bez učenia.
 */

export const KALENDAR_TRENERA: Record<string, string> = {
  Jerry: "jerrystranavsky@gmail.com",
  Terezka: "teres.zat@gmail.com",
};

export type VstupTreningu = { klient: string; den: string; cas: string; minut?: number; trener: string };
export type PripravenyTrening = {
  kalendar: string;
  nazov: string;
  zaciatok: string;
  koniec: string;
  trener: string;
};

/** Overí deň, čas a dĺžku — spoločné pre nahodenie aj presun udalosti. */
export function pripravCas(den: string, cas: string, minutVstup?: number): { ok: true; zaciatok: string; koniec: string } | { ok: false; chyba: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return { ok: false, chyba: "Deň musí byť v tvare RRRR-MM-DD." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cas)) return { ok: false, chyba: "Čas musí byť v tvare HH:MM." };
  const minut = minutVstup ?? 60;
  if (!Number.isInteger(minut) || minut < 15 || minut > 240) return { ok: false, chyba: "Dĺžka musí byť 15 až 240 minút." };

  const [h, m] = cas.split(":").map(Number);
  const spolu = h * 60 + m + minut;
  // Tréning cez polnoc v PSB neexistuje — skôr je to preklep v čase.
  if (spolu > 24 * 60) return { ok: false, chyba: "Tréning by presiahol polnoc — over čas." };
  const koniec = `${String(Math.floor(spolu / 60) % 24).padStart(2, "0")}:${String(spolu % 60).padStart(2, "0")}`;
  return { ok: true, zaciatok: `${den}T${cas}`, koniec: `${den}T${koniec}` };
}

export function pripravTrening(v: VstupTreningu): { ok: true; t: PripravenyTrening } | { ok: false; chyba: string } {
  const klient = String(v.klient || "").trim();
  if (!klient) return { ok: false, chyba: "Chýba klient." };
  const trener = String(v.trener || "").trim();
  const kalendar = KALENDAR_TRENERA[trener];
  if (!kalendar) return { ok: false, chyba: `Neznámy tréner „${trener}“.` };
  const c = pripravCas(v.den, v.cas, v.minut);
  if (!c.ok) return c;
  return {
    ok: true,
    t: { kalendar, nazov: klient, zaciatok: c.zaciatok, koniec: c.koniec, trener },
  };
}

/** ICS uid, pod ktorým tú istú udalosť uvidí snímka. */
export const icsUid = (googleId: string): string => `${googleId}@google.com`;
