/**
 * NAPLÁNOVANÁ PONUKA ÚVODNEJ LEKCIE (Jerry, 26. 11. 2026: „nachystaj mi na
 * zajtra notifikáciu, cez ktorú môžem Leonovi poslať tú SMS s úvodnou lekciou").
 *
 * Ponuka sa nedá pripraviť dopredu celá — časy, ktoré sa naťukajú, platia až
 * v deň odoslania. Preto sa plánuje len PRIPOMIENKA: v deň `den` príde
 * notifikácia s tlačidlom, ktoré otvorí Kalendár → Termíny s menom a typom
 * úvodný už nastavenými. Zhasne sama, keď od naplánovania vznikla ponuka
 * úvodného na to meno alebo telefón (`hotovo` počíta loadData).
 *
 * Uložené vo `vzas_settings.planovane_ponuky` ako JSON pole.
 */
export type PlanovanaPonuka = {
  id: string;
  /** Meno, pod ktorým je človek v Ponuke termínov (súkromný kontakt alebo dopyt). */
  kontakt: string;
  telefon?: string;
  /** Deň, keď sa má notifikácia ukázať (RRRR-MM-DD, pražský). */
  den: string;
  trener: string;
  poznamka?: string;
  /** Ponuka úvodnej lekcie (predvolené) alebo bežných termínov klientovi. */
  uvodny?: boolean;
  /** Kto pripomienku naplánoval. */
  kto?: string;
  vytvorene: string;
  /** Ponuka úvodného od naplánovania už vznikla — dopĺňa loadData. */
  hotovo?: boolean;
};

export type PlanovanaPonukaPolozka = {
  kluc: string;
  kontakt: string;
  trener: string;
  nadpis: string;
  detail: string;
  /** Cieľ tlačidla: Kalendár → Termíny s menom a úvodným. */
  ciel: string;
};

export function citajPlanovanePonuky(json: string | null | undefined): PlanovanaPonuka[] {
  try {
    const v = JSON.parse(String(json || "[]"));
    return Array.isArray(v)
      ? v.filter((p) => p && typeof p.id === "string" && typeof p.kontakt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(p.den || "")))
      : [];
  } catch { return []; }
}

export function planovanePonukyNaDnes(plan: PlanovanaPonuka[], dnes: string): PlanovanaPonukaPolozka[] {
  return plan
    .filter((p) => !p.hotovo && p.den <= dnes)
    .map((p) => {
      return {
        kluc: `planovana-ponuka|${p.id}`,
        kontakt: p.kontakt,
        trener: p.trener || "Jerry",
        nadpis: `Poslať ponuku ${p.uvodny === false ? "termínov" : "úvodnej lekcie"} — ${p.kontakt}`,
        detail: `${p.den < dnes ? `Naplánované na ${Number(p.den.slice(8, 10))}. ${Number(p.den.slice(5, 7))}. — ` : ""}${p.poznamka ? `${p.poznamka.replace(/\.\s*$/, "")}. ` : ""}${p.uvodny === false
          ? `Tlačidlo otvorí Kalendár → Termíny s ${p.kontakt}: naťukaj časy a odošli SMS.`
          : `Tlačidlo otvorí Kalendár → Termíny s ${p.kontakt} a úvodným tréningom: naťukaj časy a odošli SMS.`} Zhasne samo, keď ponuka odíde.`,
        ciel: `kalendar|terminy|k:${p.kontakt}|${p.uvodny === false ? "trening" : "uvodny"}`,
      };
    });
}

/**
 * Pridanie z obrazovky (Kalendár → Termíny, 26. 11. 2026). Vráti nový zoznam
 * alebo vetu, prečo sa pridať nedá. Ten istý človek na ten istý deň je jedna
 * pripomienka — druhé kliknutie ju len aktualizuje.
 */
export function pridajPlan(
  plan: PlanovanaPonuka[],
  v: { kontakt: string; den: string; telefon?: string; uvodny: boolean; poznamka?: string; trener: string; kto?: string },
  dnes: string,
  teraz: string,
  id: string,
): PlanovanaPonuka[] | string {
  const kontakt = String(v.kontakt || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!kontakt) return "Chýba komu.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.den) || Number.isNaN(Date.parse(`${v.den}T12:00:00Z`))) return "Vyber deň.";
  if (v.den < dnes) return "Deň už bol.";
  const zvysok = plan.filter((p) => !(p.kontakt === kontakt && p.den === v.den && !p.hotovo));
  const novy: PlanovanaPonuka = {
    id, kontakt, den: v.den, trener: v.trener || "Jerry", uvodny: v.uvodny, vytvorene: teraz,
    ...(v.telefon ? { telefon: String(v.telefon).trim().slice(0, 40) } : {}),
    ...(v.poznamka ? { poznamka: String(v.poznamka).replace(/\s+/g, " ").trim().slice(0, 200) } : {}),
    ...(v.kto ? { kto: v.kto } : {}),
  };
  // Hotové staršie ako mesiac sa zahodia — zoznam nesmie rásť donekonečna.
  const hranica = new Date(Date.parse(`${dnes}T12:00:00Z`) - 31 * 86400000).toISOString().slice(0, 10);
  return [...zvysok.filter((p) => !(p.hotovo && p.den < hranica)), novy]
    .map(({ hotovo: _h, ...p }) => p)
    .sort((a, b) => a.den.localeCompare(b.den));
}
