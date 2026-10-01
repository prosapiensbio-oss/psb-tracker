import { bezDiakritiky } from "./sms";

/**
 * Filtrovanie mien do vlastnej rolety pri písaní.
 *
 * `<datalist>` sme museli opustiť (viď `VyberMena.tsx`), takže filtrovanie
 * si robí appka sama — a vtedy už môže byť lepšie než to prehliadačové:
 * nerozlišuje diakritiku ani veľkosť písmen a hľadá aj v priezvisku.
 *
 * „ma" tak nájde Martina Vaška aj Marcelu Hrúzovú, „hruz" nájde Hrúzovú,
 * a „martin v" nájde Martina Vaška, aj keď medzi slovami nič iné nesedí.
 */
export function najdiMena(mena: string[], text: string, strop = 8): string[] {
  const hladane = bezDiakritiky(String(text || "")).toLowerCase().trim();
  if (!hladane) return mena.slice(0, strop);

  // Každé slovo musí sedieť na niektorý začiatok slova v mene. Bez toho by
  // „martin v" nenašlo nič — v celom reťazci taká postupnosť nie je.
  const kusy = hladane.split(/\s+/).filter(Boolean);
  const sedi = (meno: string) => {
    const slova = bezDiakritiky(meno).toLowerCase().split(/\s+/).filter(Boolean);
    return kusy.every((k) => slova.some((s) => s.startsWith(k)));
  };

  // Kto začína hľadaným, je hore: pri „ma" je Marcela bližšie než Tomáš Mareš.
  const zaciatok: string[] = [];
  const inde: string[] = [];
  for (const m of mena) {
    if (!sedi(m)) continue;
    (bezDiakritiky(m).toLowerCase().startsWith(kusy[0]) ? zaciatok : inde).push(m);
  }
  return [...zaciatok, ...inde].slice(0, strop);
}
