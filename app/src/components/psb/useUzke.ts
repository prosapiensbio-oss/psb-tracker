import { useEffect, useState } from "react";

/**
 * Telefón. Inline štýly médiá nevedia, takže sa to pýta cez `matchMedia`
 * — rovnako ako dashboard.
 *
 * Na 375 px zožierali bočné šípky 92 px zo šírky karty a riadky s
 * minimálnymi šírkami sa lámali do štyroch riadkov na jedného človeka.
 * Zo siedmich mien tak bolo vidieť dve a zvyšok sa musel vyrolovať vnútri
 * karty, o čom sa nedalo tušiť (Jerry, 28. 9. 2026: „nezobrazujú sa mi tam
 * všetci bez balíčka“).
 *
 * Je to JEDNA definícia pre celú appku: kto si spraví vlastnú kópiu
 * s inou hranicou, bude mať na tej istej obrazovke dva rôzne telefóny.
 */
export function useUzke(hranica = 640) {
  const [uzke, setUzke] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${hranica}px)`);
    const pouzi = () => setUzke(mq.matches);
    pouzi();
    mq.addEventListener("change", pouzi);
    return () => mq.removeEventListener("change", pouzi);
  }, [hranica]);
  return uzke;
}
