/**
 * NOTIFIKÁCIA „POSLEDNÁ HODINA / MÍNUS" S TLAČIDLOM NA SMS (9. 10. 2026).
 *
 * Jerry: „sprav mi upozornenie, že klient má poslednú hodinu alebo že je
 * v mínuse, a pridaj mi tam poslať SMS." Jedna funkcia pre appku (register
 * v App.tsx) aj pre rannú správu na telefón (registerServer) — pravidlá sú
 * v `upozorneniaHodin` (workspaceKroky.ts), tá istá rodina ako krok 2 · SMS.
 *
 * Kľúč je `hodiny|<meno>|posledna|minus` a nesie `platneOd` = posledná
 * platba alebo balíček: „Vybavené" platí na stupeň v tejto epizóde, ďalší
 * nákup hodín ju ukončí. Pravidlá sú v `upozorneniaHodin`.
 */
import { stavPolozkyRegistra, type ClientAgg, type RegisterItem } from "./compute";
import { terazPraha } from "./cas";
import { poslednaZmenaStavu, upozorneniaHodin, vetaHodin } from "./workspaceKroky";

type Ack = Record<string, { note?: string; ackedAt?: string; actor?: string } | undefined>;

/**
 * Pražský čas „RRRR-MM-DDTHH:MM" → UTC ISO. Odpovede (`ackedAt`) sú v UTC
 * a `platneOd` sa s nimi porovnáva reťazcom — v pražskom čase by „SMS
 * poslaná" o 18:30 (16:30 UTC) vyšla staršia než tréning o 18:00 a
 * notifikácia by sa hneď vrátila.
 */
export function prahaNaUtc(p: string): string {
  if (!p) return "";
  const g = Date.parse(`${p.slice(0, 16)}:00Z`);
  if (!Number.isFinite(g)) return "";
  const posun = Date.parse(`${terazPraha(new Date(g))}:00Z`) - g;
  return new Date(g - posun).toISOString();
}

export function polozkyHodin(
  clients: Record<string, ClientAgg>,
  udalosti: { zaciatok: string; klient: string | null; typ: string | null }[],
  platby: { klient: string; datum: string }[],
  balicky: { klient: string; platnost_od?: string; platnostOd?: string }[],
  /** Kedy klientovi naposledy odišla SMS — audit `sms-odoslana` (UTC). */
  odoslaneUtc: Record<string, string>,
  ack: Ack,
  dnes: Date = new Date(),
): RegisterItem[] {
  const terazP = terazPraha(dnes);
  const mena = Object.keys(clients);
  const { reset, objednane } = poslednaZmenaStavu(mena, udalosti, platby, balicky, terazP);
  // Audit je v UTC, zmena v pražskom čase — porovnáva sa v jednom pásme.
  const odoslane: Record<string, string> = {};
  for (const [k, v] of Object.entries(odoslaneUtc)) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) odoslane[k] = terazPraha(new Date(t));
  }
  return upozorneniaHodin(Object.values(clients), odoslane, reset, objednane, terazP.slice(0, 10)).map((u) => {
    // Stupeň v kľúči: „Vybavené" pri poslednej hodine neumlčí prechod do mínusu.
    const key = `hodiny|${u.meno}|${u.stav === "posledna" ? "posledna" : "minus"}`;
    const v = vetaHodin(u);
    const platneOd = prahaNaUtc(u.platneOd) || undefined;
    return {
      key,
      category: "Anomália" as const,
      tone: u.stav === "minus" ? ("orange" as const) : ("blue" as const),
      title: v.title,
      detail: v.detail,
      priority: u.stav === "minus" ? 7 : 15,
      client: u.meno,
      oKom: u.meno,
      platneOd,
      sms: { meno: u.meno, trener: u.trener, zostatok: u.zostatok },
      ...stavPolozkyRegistra(key, ack, "hodiny", dnes, platneOd),
    };
  });
}
