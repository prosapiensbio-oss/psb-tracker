/**
 * TEST POSTURY A „HOVOR: NE".
 *
 * Jerry, 30. 10. 2026, nad notifikáciou o Radke Pelánovej: „je dôležité
 * spomenúť, že poslala test postury, a ešte dôležitejšie, že začiarkla
 * ‚Hovor: Ne, stačí mi analýza e-mailem' — preto sa jej nemáme ozvať."
 * Analýzu posiela formulár na webe sám (follow-up podľa vzorca odpovedí),
 * takže na takom dopyte nikto nečaká a pýtať sa „ozval si sa?" je zlá rada.
 *
 * Jedno miesto pre register, Workspace, Marketing → Dopyty aj Jarvisa.
 * Snippet na webe píše do poznámky „TEST POSTURY | … | hovor: Ne, stačí mi
 * analýza e-mailem", mail z formulára „Hovor: Ne, …" — preto bez ohľadu na
 * veľkosť písmen.
 */
type DopytText = { note?: string | null; stranka?: string | null };

export const jeTestPostury = (l: DopytText): boolean =>
  /test postury/i.test(l.note || "") || /test-postury/i.test(l.stranka || "");

/** Vyplnil test postury a výslovne nechce telefonát. */
export const nechceHovor = (l: DopytText): boolean =>
  jeTestPostury(l) && /hovor:\s*ne\b/i.test(l.note || "");
