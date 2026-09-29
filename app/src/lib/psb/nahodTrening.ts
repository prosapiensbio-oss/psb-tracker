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

export function pripravTrening(v: VstupTreningu): { ok: true; t: PripravenyTrening } | { ok: false; chyba: string } {
  const klient = String(v.klient || "").trim();
  if (!klient) return { ok: false, chyba: "Chýba klient." };
  const trener = String(v.trener || "").trim();
  const kalendar = KALENDAR_TRENERA[trener];
  if (!kalendar) return { ok: false, chyba: `Neznámy tréner „${trener}“.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.den)) return { ok: false, chyba: "Deň musí byť v tvare RRRR-MM-DD." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.cas)) return { ok: false, chyba: "Čas musí byť v tvare HH:MM." };
  const minut = v.minut ?? 60;
  if (!Number.isInteger(minut) || minut < 15 || minut > 240) return { ok: false, chyba: "Dĺžka musí byť 15 až 240 minút." };

  const [h, m] = v.cas.split(":").map(Number);
  const spolu = h * 60 + m + minut;
  // Tréning cez polnoc v PSB neexistuje — skôr je to preklep v čase.
  if (spolu > 24 * 60) return { ok: false, chyba: "Tréning by presiahol polnoc — over čas." };
  const koniec = `${String(Math.floor(spolu / 60) % 24).padStart(2, "0")}:${String(spolu % 60).padStart(2, "0")}`;

  return {
    ok: true,
    t: { kalendar, nazov: klient, zaciatok: `${v.den}T${v.cas}`, koniec: `${v.den}T${koniec}`, trener },
  };
}

/** ICS uid, pod ktorým tú istú udalosť uvidí snímka. */
export const icsUid = (googleId: string): string => `${googleId}@google.com`;
