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
      detail: `Píše: „${ukazka(o.text)}“ — celé je v profile klienta → fotky. Odpoveď mu napíš sám (telefón, tréning); stránka ju neposiela.`,
    });
  }
  for (const s of f.suhlasy) {
    if (s.suhlas !== "ano") continue;
    von.push({
      key: `fotky|suhlas|${s.token}`, tone: "blue", klient: s.klient, trener: s.trener,
      title: `${s.klient} súhlasí so zverejnením porovnania`,
      detail: "Bez tváre a bez mena (Instagram, web). Súhlas je pri odkaze v profile → fotky; klient ho môže na stránke zmeniť.",
    });
  }
  return von;
}
