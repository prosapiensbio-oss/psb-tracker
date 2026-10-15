/**
 * OSLOVENIE V 5. PÁDE — „Michale", nie „Michal" (Jerry, 15. 10. 2026:
 * „postav to naostro aj so skloňovaním").
 *
 * Stránky aj správy pre klientov sú po česky a oslovujú krstným menom. Do
 * toho dňa stálo všade holé meno z databázy („Michal, jedním klepnutím…"),
 * čo Čech číta ako chybu. Jedna definícia pre všetko, čo klientovi ide:
 * stránky /k/ /t/ /f/, anamnéza, SMS, maily.
 *
 * PRAVIDLO: keď si nie je istá, meno NECHÁ. Zlý tvar („Panagiotisi",
 * „Prochazkovo") je horší než správny 1. pád. Preto:
 *  • -a → -o (Jana → Jano, Terezka → Terezko, Vojta → Vojto), ale nie -ia
 *    (Lucia, Natália — slovenský tvar sa po česky neskloňuje rovnako)
 *    a nie priezvisko na -ová/-ova, ktoré niekedy stojí na mieste mena;
 *  • -ek → -ku (Radek → Radku, Zdeněk → Zdeňku, Jarek → Jarku);
 *  • Pavel, Karel → Pavle, Karle; iné -el → -eli (Daniel → Danieli);
 *  • -š -ž -č -ř -c -j -x → +i (Lukáš → Lukáši, Matěj → Matěji);
 *  • -k -h -g -ch → +u (Patrik → Patriku);
 *  • -r po spoluhláske → -ře (Petr → Petře), inak +e;
 *  • ostatné spoluhlásky → +e (Michal → Michale, Jan → Jane);
 *  • samohláska, -s, ženské mená na spoluhlásku (Nikol, Ester) → bez zmeny.
 * Mená bez diakritiky z kalendára dostanú správny tvar zo slovníka
 * (Tomas → Tomáši, Jiri → Jiří).
 *
 * Funkcia je IDEMPOTENTNÁ: 5. pád končí na -e/-i/-o/-u a tie nechá, takže
 * „Michale" zostane „Michale", aj keď prejde dvoma vrstvami.
 */

const bez = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mená, pri ktorých pravidlo nestačí — kľúč bez diakritiky, malými. */
const SLOVNIK: Record<string, string> = {
  tomas: "Tomáši", lukas: "Lukáši", matus: "Matúši", jiri: "Jiří", peter: "Petře",
  pavel: "Pavle", karel: "Karle", havel: "Havle", marketa: "Markéto",
  // Zástupné mená z dopytov, nie mená.
  bez: "", nezname: "", neznamy: "",
};

/** Ženské mená na spoluhlásku — mužské pravidlo by z nich spravilo „Nikole". */
const ZENSKE_NA_SPOLUHLASKU = new Set([
  "nikol", "ester", "karin", "ingrid", "dagmar", "miriam", "carmen", "ruth", "rut", "abigail", "elizabeth",
  "isabel", "mabel", "rachel", "lilian", "vivien", "kim", "doris", "agnes", "iris", "beatrix", "jasmin", "kristin",
]);

export function vokativ(meno: string): string {
  const m = (meno || "").trim();
  if (!m || /\s/.test(m) || m.length < 2) return m;
  const k = bez(m);
  const zoSlovnika = Object.prototype.hasOwnProperty.call(SLOVNIK, k) ? SLOVNIK[k] : undefined;
  if (zoSlovnika !== undefined) return zoSlovnika;
  if (ZENSKE_NA_SPOLUHLASKU.has(k)) return m;
  const posl = m.slice(-1);
  const male = posl.toLowerCase();

  if (male === "a") {
    if (/ia$/i.test(m) || /ova$/i.test(k)) return m;
    return `${m.slice(0, -1)}${posl === "A" ? "O" : "o"}`;
  }
  // Samohlásky (aj á, í, ý — Nováková, Jiří) a -s (Panagiotis) sa nechávajú.
  if (/[aeiouyáéíóúůýě]/i.test(male) || male === "s") return m;

  // „Zdeněk" → „Zdeňku": ě pred k mäkčí predošlú spoluhlásku (Luděk → Luďku).
  if (/ěk$/i.test(m)) return `${m.slice(0, -2).replace(/n$/, "ň").replace(/d$/, "ď").replace(/t$/, "ť")}ku`;
  if (/ek$/i.test(m)) return `${m.slice(0, -2)}ku`;
  if (/el$/i.test(m)) return `${m}i`;
  if (/[šžčřcjx]/i.test(male)) return `${m}i`;
  if (/ch$/i.test(m) || /[khg]/i.test(male)) return `${m}u`;
  if (male === "r") return /[aeiouyáéíóúůý]r$/i.test(m) ? `${m}e` : `${m.slice(0, -1)}ře`;
  if (/[bdflmnptvwzšďťň]/i.test(male)) return `${m}e`;
  return m;
}

/** Krstné meno na oslovenie. Pri „Ing. arch. Anna Nová" je to Anna. */
export function krstne(meno: string): string {
  const kusy = meno.trim().split(/\s+/).filter((k) => !k.endsWith(".") && k.length > 1);
  return kusy[0] || meno.trim().split(/\s+/)[0] || "";
}

/** Celé meno klienta → krstné meno v 5. páde („Ing. Michal Knapčok" → „Michale"). */
export const oslovenieKlienta = (meno: string): string => vokativ(krstne(meno || ""));
