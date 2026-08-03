import { createContext } from "react";

// Jedno obdobie pre celú appku.
//
// Predtým mala vlastný prepínač obdobia každá záložka zvlášť — vo VZAS dokonca
// každá jedna (P&L, Výplaty, Cashflow, Jarek) a vo Financiách tri. Prepnutie na
// „2025" v P&L teda neznamenalo nič v Cashflowe a človek si musel pamätať, čo
// kde nastavil. Pri peniazoch to je horšie než nepohodlie: dve obrazovky vedľa
// seba ukazovali čísla za iné obdobia a vyzeralo to ako nesúlad v dátach.
//
// Kontext, nie props: prechádzalo by to cez štyri úrovne komponentov, ktoré o
// obdobie nemajú záujem. Keď kontext chýba (napr. v teste), hooky spadnú späť
// na vlastný lokálny stav a nič sa nerozbije.
export const ObdobieCtx = createContext<{ obdobie: string; setObdobie: (v: string) => void } | null>(null);
