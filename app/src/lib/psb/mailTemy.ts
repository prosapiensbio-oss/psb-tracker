/**
 * ZÁSOBNÍK TÉM (Jerry, 4. 11. 2026: „témy ok"). Plán je zásobník, nie povinnosť:
 * keď v mesiaci nie je čo povedať, mail sa vynechá. Čísla sú kliky z Googlu
 * alebo zdieľania na Instagrame, podľa nich sa témy vyberali. Pri príbehoch
 * treba pred mailom overiť súhlas klienta s použitím v maili.
 */
export type TemaMailu = { druh: string; tema: string; zdroj: string };

export const NAZVY_DRUHOV: Record<string, string> = {
  bolest: "Prečo ťa to bolí",
  pribeh: "Príbeh klienta",
  zaujimavost: "Zaujímavosť",
  mytus: "Mýtus",
  novinka: "Novinka, ponuka",
  otazka: "Otázka",
};

export const ZASOBNIK_TEM: TemaMailu[] = [
  { druh: "bolest", tema: "Kolená padajúce dovnútra", zdroj: "článok, 202 klikov" },
  { druh: "pribeh", tema: "Jarek: „Nebyla to láska na první pohled\"", zdroj: "video, 8 zdieľaní" },
  { druh: "zaujimavost", tema: "Bránica nie je len nádych a výdych", zdroj: "príspevok, 9 uložení" },
  { druh: "novinka", tema: "Test postury zdarma", zdroj: "stránka testu" },
  { druh: "bolest", tema: "Odstávajúce lopatky a ťah medzi lopatkami", zdroj: "článok, 173 klikov" },
  { druh: "mytus", tema: "Prečo plank a sklapovačky nevyriešili chrbát", zdroj: "video, 5 uložení" },
  { druh: "pribeh", tema: "„Nebolelo to tak, aby se muselo přestat\"", zdroj: "video, 13 zdieľaní" },
  { druh: "novinka", tema: "Darček: Protokol MFR", zdroj: "dokument, 9 klikov" },
  { druh: "bolest", tema: "Predsunutá hlava", zdroj: "článok, 118 klikov" },
  { druh: "zaujimavost", tema: "Z čoho je fascia a čo robí", zdroj: "článok, 21 klikov" },
  { druh: "mytus", tema: "Fyzioterapia funguje. A prečo to niekedy nestačí", zdroj: "príspevok, 8 zdieľaní" },
  { druh: "novinka", tema: "Odporúčanie: −10 % na ďalší balíček", zdroj: "tvoje pravidlo" },
  { druh: "bolest", tema: "Panva naklonená dopredu", zdroj: "článok, 118 klikov" },
  { druh: "pribeh", tema: "Michal: „Přišel bez velkých očekávání\"", zdroj: "video, 4 zdieľania" },
  { druh: "zaujimavost", tema: "Mechanotransdukcia: ako sily formujú telo", zdroj: "článok, 65 klikov" },
  { druh: "novinka", tema: "Úvodný tréning: čo presne sa na ňom stane", zdroj: "stránka úvodného" },
  { druh: "bolest", tema: "Rib flare: vystrčené rebrá", zdroj: "článok, 104 klikov" },
  { druh: "mytus", tema: "Sila, mobilita, stabilita nestačia", zdroj: "príspevok, 11 komentárov" },
  { druh: "pribeh", tema: "Akis: prečo trénuje roky", zdroj: "video, 5 zdieľaní" },
  { druh: "novinka", tema: "Online tréning, ak nie si z Brna", zdroj: "stránka služby" },
  { druh: "bolest", tema: "Skolióza je viac než zakrivenie", zdroj: "článok, 72 klikov" },
  { druh: "zaujimavost", tema: "Biotensegrita jednoducho", zdroj: "článok, 100 klikov" },
  { druh: "pribeh", tema: "Natália alebo Tomáš", zdroj: "video na webe" },
  { druh: "novinka", tema: "Voľné termíny, keď sa uvoľní kapacita", zdroj: "podľa kalendára" },
];
