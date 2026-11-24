/**
 * ÚVODNÝ V KALENDÁRI, SMS PRED NÍM NEODIŠLA.
 *
 * Jerry, 24. 11. 2026 (Tereza Šmídová, úvodný 27. 11. u Terezky): „mala by
 * byť dokonca aj notifikácia." Nebola: jediná pripomienka SMS pred úvodným
 * visela na dopyte v stave „nový" (`odpoved|`). Kto prišiel referenciou
 * a do Dopytov sa zapísal rovno ako „dohodnutý", alebo telefonátom bez
 * dopytu, ten od appky nedostal nič — a stránka s adresou, cenou a troma
 * otázkami ostala neposlaná.
 *
 * Pravidlo stojí na KALENDÁRI, nie na dopyte: úvodný je tam vždy, dopyt nie.
 * Za odoslanú sa SMS považuje, keď v audite stojí `sms-uvodny` alebo
 * `sms-ponuka` (ponuka úvodného nesie privítanie sama) na to meno, alebo keď
 * klient stránku pred úvodným už otvoril — vtedy ju dostal inou cestou.
 */
import { normName } from "./format";
import { menoZNazvuUvodneho } from "./kalendar";
import { posunDen } from "./cas";

export type UdalostPreUvodny = {
  zaciatok: string;
  klient: string | null;
  typ: string | null;
  nazov?: string | null;
  trener?: string | null;
  zmizlaAt?: string | null;
};

export type UvodnyBezSms = {
  kluc: string;
  meno: string;
  trener: string;
  /** `YYYY-MM-DDTHH:MM` podľa kalendára (pražský čas). */
  kedy: string;
  /** Koľko dní zostáva (0 = dnes). */
  dni: number;
};

/** Ako ďaleko dopredu sa pýta. Týždeň stačí na SMS aj na odpoveď klienta. */
export const UVODNY_SMS_DNI = 7;

/** Meno z riadku auditu: `Meno · +420…` → `Meno`. */
export function menoZAuditu(predmet: string): string {
  return String(predmet || "").split(" · ")[0].trim();
}

export function uvodneBezSms(
  udalosti: UdalostPreUvodny[],
  /** normName mien, ktorým SMS pred úvodným (alebo ponuka) už odišla. */
  odisla: Set<string>,
  /** normName mien s čerstvým dopytom „nový" — tam to rieši `odpoved|`. */
  zDopytu: Set<string>,
  teraz: string,
): UvodnyBezSms[] {
  const dnes = teraz.slice(0, 10);
  const hranica = posunDen(dnes, UVODNY_SMS_DNI);
  const von = new Map<string, UvodnyBezSms>();
  for (const u of udalosti) {
    if (u.typ !== "uvodny" || u.zmizlaAt) continue;
    const kedy = String(u.zaciatok || "").slice(0, 16);
    const den = kedy.slice(0, 10);
    if (kedy <= teraz.slice(0, 16) || den > hranica) continue;
    const meno = (u.klient || "").trim() || menoZNazvuUvodneho(u.nazov || "") || "";
    if (!meno) continue;   // bez mena to hlási „tréning bez mena", nie toto
    const n = normName(meno);
    if (odisla.has(n) || zDopytu.has(n)) continue;
    const kluc = `uvodny-sms|${n}|${den}`;
    if (von.has(kluc)) continue;
    const [r, m, d] = den.split("-").map(Number);
    const [r0, m0, d0] = dnes.split("-").map(Number);
    const dni = Math.round((Date.UTC(r, m - 1, d) - Date.UTC(r0, m0 - 1, d0)) / 86400000);
    von.set(kluc, { kluc, meno, trener: String(u.trener || ""), kedy, dni });
  }
  return [...von.values()].sort((a, b) => a.kedy.localeCompare(b.kedy));
}
