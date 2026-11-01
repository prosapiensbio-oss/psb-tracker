/**
 * ROD KLIENTA PODĽA MENA (rozbor Kokpitu, 1. 11. 2026).
 *
 * Kokpit písal všetkým v mužskom rode: „Prečo neprišiel — Radka Kovaříková",
 * „priviedol Katarína Mátlová", „Je to on". Rod v dátach nie je, dá sa len
 * odhadnúť z mena — a preto platí jedno pravidlo:
 *
 *   PRI NEISTOTE NEUTRÁLNE, NIKDY MUŽSKÝ.
 *
 * Mužský rod ako „predvolený" je presne tá chyba, ktorú to opravuje. Mená ako
 * Nikola, Saša, Peťa alebo cudzie krstné bez priezviska vrátia „?" a volajúci
 * ukáže vetu bez rodu. Kde sa dá veta napísať bez rodu rovno, je to lepšie
 * než táto funkcia.
 */

export type Rod = "m" | "z" | "?";

const holy = (s: string) =>
  String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Mužské krstné, ktoré sa nedajú poznať z koncovky (bez diakritiky). */
const MUZSKE = new Set((
  "adam adrian akis ales albert alex alexander alexej andrej anton antonin arnost bohdan bohumil bohuslav boris brano branislav "
  + "dalibor dan daniel david denis dominik dusan eduard emil erik filip frantisek gabriel guillermo honza hynek igor ilja imrich ivan "
  + "jakub jan jarek jaromir jaroslav jerry jindrich jiri jirka jozef josef julius juraj kamil karel karol kristian kuba ladislav "
  + "leos libor lubomir lubos ludek ludwig ludovit lukas luky luka marcel marek marian martin matej maty matus matyas michal "
  + "mikulas milan milos miro miroslav misko mojmir norbert ondra ondrej oskar otakar otto panagiotis patrik pavel peter peto petr "
  + "premysl prokop radek radim radko radoslav radovan raoul rastislav richard rober robert roman rudolf samuel sebastian simon "
  + "stanislav standa stefan stepan svetopluk tadeas teodor timotej tomas vaclav vit vitezslav viktor vlastimil vlastislav vladimir "
  + "vladislav vojta vojtech zdenek zbynek"
).split(" "));

/** Ženské krstné, ktoré sa nedajú poznať z koncovky (bez diakritiky). */
const ZENSKE = new Set((
  "agnes adel beatrice carmen dagmar edith ester ingrid iris karin katrin kim lucie maria marie miriam nikol "
  + "rut ruth sofie sylvie terezie zofie ivet ivett viktorie julie natalie valerie amalie emilie"
).split(" "));

/** Krstné bez istého rodu; rozhodnúť môže len priezvisko. */
const NEISTE = new Set(["nikola", "sasa", "sasha", "peta", "mata", "matka", "misa", "andy", "alex", "robin", "bez", "nezname", "neznama"]);

/** Na -a, ale mužské (bez diakritiky). */
const MUZSKE_NA_A = new Set(["honza", "kuba", "ondra", "vojta", "jirka", "luka", "mira", "standa", "vlada", "lada", "jura", "kosta", "ilja", "luca", "misa", "joshua", "nikita"]);

/**
 * Odhad rodu z celého mena. Priezvisko na -ová/-ova/-á znamená ženu aj vtedy,
 * keď krstné nepoznáme; keď si krstné a priezvisko protirečia, je to „?".
 */
export function rodKlienta(meno: string | null | undefined): Rod {
  const slova = holy(String(meno || "").replace(/[\s\-–—]+(uvodn|úvodn|diagnost).*$/iu, ""))
    .split(/\s+/).filter(Boolean);
  if (!slova.length) return "?";
  const povodne = String(meno || "").trim().split(/\s+/);
  const krstne = slova[0];
  const posledne = slova[slova.length - 1];
  const povodnePosledne = povodne[povodne.length - 1] || "";

  // Priezvisko hovorí, len keď je to naozaj druhé slovo — alebo jediné slovo
  // s jednoznačnou koncovkou (dopyt „Prochazkova" bez krstného).
  const priezviskoZena = posledne.endsWith("ova") || (slova.length > 1 && /á$/iu.test(povodnePosledne));
  const priezviskoMuz = slova.length > 1 && /ý$/iu.test(povodnePosledne);

  const krstneRod: Rod = NEISTE.has(krstne)
    ? "?"
    : MUZSKE.has(krstne) || MUZSKE_NA_A.has(krstne)
      ? "m"
      : ZENSKE.has(krstne) || (krstne.length > 2 && krstne.endsWith("a"))
        ? "z"
        : "?";

  if (priezviskoZena) return krstneRod === "m" ? "?" : "z";
  if (priezviskoMuz) return krstneRod === "z" ? "?" : "m";
  return krstneRod;
}

/** Vyberie tvar podľa rodu; `neutralne` je veta bez rodu, nie mužský tvar. */
export function podlaRodu(meno: string | null | undefined, tvary: { m: string; z: string; neutralne: string }): string {
  const r = rodKlienta(meno);
  return r === "m" ? tvary.m : r === "z" ? tvary.z : tvary.neutralne;
}
