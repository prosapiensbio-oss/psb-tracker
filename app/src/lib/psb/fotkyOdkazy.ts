/**
 * ODPOVEDE KLIENTOV NA FOTKY → NOTIFIKÁCIE TRÉNEROVI (Jerry, 12. 10. 2026:
 * „ak odpovie, mohlo by sa to trénerovi, ku ktorému klient patrí, ukázať
 * v notifikáciách, aby mu tá odpoveď neušla").
 *
 * Dáta nalieva `loadData` (fotkyOdkazy.server.ts — rozšifruje text), sem ide
 * len čistý výpočet, aby obrazovka aj nočný push videli to isté.
 */
export type FotkyOdpoved = { id: number; token: string; klient: string; kedy: string; trener: string | null; text: string };
export type FotkySuhlas = { token: string; klient: string; kedy: string; suhlas: "ano" | "ne"; trener: string | null };
export type FotkyKlientov = { odpovede: FotkyOdpoved[]; suhlasy: FotkySuhlas[] };

export type PolozkaFotiek = {
  key: string; tone: "orange" | "blue"; title: string; detail: string; klient: string; trener: string | null;
};

const ukazka = (t: string, n = 220) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/** Každá odpoveď je vlastná položka; súhlas „ano" sa oznámi raz (modrá — nič sa nemusí). */
export function polozkyFotiek(f: FotkyKlientov | undefined): PolozkaFotiek[] {
  if (!f) return [];
  const von: PolozkaFotiek[] = [];
  for (const o of f.odpovede) {
    von.push({
      key: `fotky|odpoved|${o.id}`, tone: "orange", klient: o.klient, trener: o.trener,
      title: `${o.klient} odpísal na fotky`,
      // Riadok registra kreslí DETAIL, nie titulok — meno musí byť v ňom.
      detail: `${o.klient} odpísal na fotky: „${ukazka(o.text)}“ — celé je v profile → fotky. Odpovedz mu sám (telefón, tréning); stránka odpoveď neposiela.`,
    });
  }
  for (const s of f.suhlasy) {
    if (s.suhlas !== "ano") continue;
    von.push({
      key: `fotky|suhlas|${s.token}`, tone: "blue", klient: s.klient, trener: s.trener,
      title: `${s.klient} súhlasí so zverejnením porovnania`,
      detail: `${s.klient} súhlasí so zverejnením porovnania — bez tváre a bez mena (Instagram, web). Je to pri odkaze v profile → fotky; klient to môže na stránke zmeniť.`,
    });
  }
  return von;
}
