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
        nadpis: `Poslať ponuku úvodnej lekcie — ${p.kontakt}`,
        detail: `${p.den < dnes ? `Naplánované na ${Number(p.den.slice(8, 10))}. ${Number(p.den.slice(5, 7))}. — ` : ""}${p.poznamka ? `${p.poznamka}. ` : ""}Tlačidlo otvorí Kalendár → Termíny s ${p.kontakt} a zapnutým úvodným tréningom: naťukaj časy, doplň celé meno a odošli SMS. Zhasne samo, keď ponuka odíde.`,
        ciel: `kalendar|terminy|k:${p.kontakt}|uvodny`,
      };
    });
}
