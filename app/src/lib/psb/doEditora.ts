/**
 * FOTKY Z PROFILU ROVNO DO EDITORA (Jerry, 12. 10. 2026): „chcel by som mať
 * možnosť označiť tie fotky a dať ich rovno do editora pred a po".
 *
 * Kartotéka v profile klienta a karta Editor vo Workspace o sebe nevedia —
 * profil môže byť na stole aj v anamnéze. Preto odkaz cez modul: kartotéka
 * dvojicu odloží a ohlási udalosť, App prepne na Workspace → Editor a karta
 * Editor si dvojicu vezme (raz) a pošle ju editoru fotiek do polovíc.
 * Karta Editor sa môže pripojiť až po udalosti — preto sa dvojica drží,
 * kým si ju niekto nevezme.
 */
export type FotkaDoEditora = { id: string; den: string };
export type DvojicaDoEditora =
  | { klient: string; pred: FotkaDoEditora; po: FotkaDoEditora; upravit?: undefined }
  /** Návrat k hotovému porovnaniu (12. 10. 2026) — editor si stav načíta sám (`/api/fotky?edit=`). */
  | { klient: string; upravit: string; pred?: undefined; po?: undefined };

export const UDALOST_DO_EDITORA = "psb-do-editora";

let cakajuca: DvojicaDoEditora | null = null;

/** Staršia fotka je „pred", novšia „po"; v ten istý deň rozhoduje poradie výberu. */
export function zoradDvojicu(a: FotkaDoEditora, b: FotkaDoEditora): [FotkaDoEditora, FotkaDoEditora] {
  return b.den < a.den ? [b, a] : [a, b];
}

export function posliDoEditora(klient: string, a: FotkaDoEditora, b: FotkaDoEditora): void {
  const [pred, po] = zoradDvojicu(a, b);
  cakajuca = { klient, pred, po };
  dispatchEvent(new CustomEvent(UDALOST_DO_EDITORA));
}

export function upravVEditore(klient: string, id: string): void {
  cakajuca = { klient, upravit: id };
  dispatchEvent(new CustomEvent(UDALOST_DO_EDITORA));
}

export function vezmiDvojicu(): DvojicaDoEditora | null {
  const d = cakajuca;
  cakajuca = null;
  return d;
}
