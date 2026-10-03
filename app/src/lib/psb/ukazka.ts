/**
 * UKÁŽKOVÉ ODKAZY — čo klient uvidí, bez toho, aby sa otvoril niekomu účet.
 *
 * Jerry, 3. 10. 2026: „prišlo mi 5 SMS, ale ani jeden odkaz sa nedal
 * otvoriť." Skúšobné správy niesli vymyslený token, a ten na stránke končí
 * na „Tento odkaz neplatí". Posielať odkazy, ktoré nikam nevedú, je horšie
 * než neposlať nič — človek si overuje práve to, či to klientovi funguje.
 *
 * Riešenie je vyhradený token, ktorý stránka pozná a vykreslí VYMYSLENÉ
 * dáta. Nie je to cudzí klient, takže sa nikomu nedvíha počítadlo otvorení
 * ani sa neukazujú jeho hodiny — a dá sa to otvoriť kedykoľvek, aj
 * z telefónu, aj bez prihlásenia.
 *
 * Tokeny musia prejsť tým istým filtrom ako skutočné (`[A-Za-z0-9]{8,24}`),
 * inak by ich route odmietla skôr, než sa k nim dostane.
 */
export const UKAZKA = {
  prehlad: "UKAZKAPREHLAD",
  predUvodnym: "UKAZKAPREDUVOD",
  poUvodnom: "UKAZKAPOUVOD",
  anamneza: "UKAZKAANAMNEZA",
} as const;

export const jeUkazka = (token: string): boolean =>
  (Object.values(UKAZKA) as string[]).includes(token);

/** Meno, ktoré sa na ukážke ukazuje. Zjavne vymyslené, nie „Lukas Hanus". */
export const UKAZKA_KLIENT = "Ukážkový Klient";
