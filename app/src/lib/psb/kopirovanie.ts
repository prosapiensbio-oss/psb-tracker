/**
 * Kopírovanie do schránky, ktoré sa nezasekne.
 *
 * `navigator.clipboard.writeText` sa nemusí len odmietnuť — vie zostať visieť
 * a NIKDY sa nedokončiť (overené 28. 8. 2026 v Kokpite: povolenie
 * clipboard-write bolo `granted`, stránka mala focus, a promise sa po 3 s
 * ešte nehol). Kód, ktorý naň čaká cez `await`, potom nespustí ani záložnú
 * cestu, ani nezobrazí potvrdenie — používateľ klikne a nestane sa nič.
 * To je presne tá trieda chýb, ktorú Kokpit najhoršie ukazuje (CLAUDE.md,
 * „Tichá chyba").
 *
 * Preto: moderná cesta dostane sekundu a pol, potom sa ide cez výber textu
 * a execCommand, ktorý povolenie nepotrebuje.
 */
export async function doSchranky(text: string, pole?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, rej) => setTimeout(() => rej(new Error("schránka neodpovedá")), 1500)),
    ]);
    return true;
  } catch { /* ide sa druhou cestou */ }
  try {
    const el = pole ?? document.createElement("textarea");
    if (!pole) {
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
    }
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    if (!pole) document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
