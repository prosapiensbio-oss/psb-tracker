/**
 * WORKSPACE PO KROKOCH — čisté výpočty pre štyri karty v bete.
 *
 * Jerry, 4. 10. 2026: „na každý ten krok by som chcel vo Workspace jeden
 * list." Kroky sú štyri a idú za sebou tak, ako ide týždeň:
 *
 *   1. Kalendár — len výnimky (zmeny, „bol tam?", nové mená).
 *   2. SMS pre klientov — len tí, ktorým to práve dáva zmysel.
 *   3. Platby — párovanie s dlhmi a sumy, ktoré nesedia.
 *   4. Balíčky — nové balíčky z prvého tréningu a končiaca platnosť.
 *
 * Tu sú len pravidlá, bez Reactu, aby sa dali overiť testami na skutočných
 * prípadoch (Dan Kouřil, Kateřina Matlová, Daniela Šašinková).
 */
import type { DlhPolozka } from "./zaplatene";
import type { BezBalicka } from "./bezBalicka";
import { CENNIK, platnostDo, type Sablona } from "./cennik";
import { UVODNY } from "./uvodnaStranka";
import { fmtCZK, normName } from "./format";
import type { Udalost } from "./klientOsCasu";
import { nazovProduktu } from "./nazvyProduktov";
import { NAZOV_PRENESENYCH } from "./platnostZostatok";
import { kanalBalicka, kanalTreningu, type StavRiadku } from "./vypisHodin";
import { KOKPIT_OD } from "./sedeniaZKalendara";
import { hodinyKratko } from "./zostatokText";

const den = (s: string) => String(s || "").slice(0, 10);
const dniMedzi = (a: string, b: string) =>
  Math.round((Date.parse(`${den(b)}T00:00:00Z`) - Date.parse(`${den(a)}T00:00:00Z`)) / 86400000);

/** Po koľkých dňoch bez tréningu je to „návrat" a Kokpit sa pýta, či balíček sedí. */
export const NAVRAT_PO_DNOCH = 60;

/* ───────────────────────── 4 · NOVÝ BALÍČEK Z PRVÉHO TRÉNINGU ───────────── */

export type NavrhNovehoBalicka = {
  klient: string;
  /** Deň prvého tréningu, ktorý žiadny balíček nepokryl — od neho platí nový. */
  odDna: string;
  /** Koľko tréningov už na nový balíček padlo. */
  nekrytych: number;
  nazov: string;
  hodiny: number;
  cena: number;
  platnostDo: string;
  /** Posledný balíček, z ktorého sa veľkosť a cena berú. */
  /** Predošlý balíček, z ktorého sa veľkosť a cena odvodili; úvodný žiadny nemá. */
  predosly: { nazov: string; od: string; cena: number | null } | null;
  /**
   * Klient sa vracia po dlhej pauze — balíček vznikne, ale Kokpit sa spýta,
   * či sedí (Jerry: „vznikne automaticky a následne sa Kokpit dopýta").
   */
  navrat: boolean;
  /** Dní medzi posledným krytým tréningom a prvým nekrytým; −1 = nevie sa. */
  pauzaDni: number;
  /** Prečo práve táto cena — keď sa líši od cenníka alebo od posledného. */
  cenaPoznamka?: string;
};

/**
 * Z osi klienta: má tréningy, ktoré nepokryl žiadny balíček?
 *
 * Jerry, 4. 10. 2026: „ak klientovi skončí balíček 6 h a nezaplatil, mal by
 * už existovať ďalší balíček 6 h, z ktorého sa odpočítava nad rámec" a
 * „minutý balíček zaniká posledným odtrénovaným tréningom" — nový teda
 * začína PRVÝM tréningom, na ktorý starý nestačil, aj keď starému ešte
 * beží platnosť. Nekrytý tréning poznáme podľa `buduca` (koľkou hodinou
 * ďalšieho balíčka sa stane); priebeh balíčkov ho počíta pre profil aj
 * pre stránku za odkazom, takže návrh nemôže tvrdiť niečo iné než oni.
 *
 * Veľkosť je tá istá ako naposledy. Cena z cenníka — jednorazová zľava
 * (Kateřina Matlová 7 011 za odporúčanie) sa ďalej neprenáša; klientovi,
 * ktorý platí inú cenu stále (posledné dva balíčky za rovnakú necenníkovú
 * sumu), ostane jeho.
 */
/**
 * Ako sa úvodný volá v evidencii balíčkov. Jedno miesto — používa to návrh
 * aj faktúra z karty klienta, aby sa nerozišli (české „trénink", lebo tak sa
 * to volá aj na faktúre, ktorú vidí klient).
 */
export const NAZOV_UVODNEHO = "Úvodní trénink";

/**
 * ČO SMIE KOKPIT ZALOŽIŤ SÁM. Doplnenie členstva a prenesené hodiny sú
 * ROZHODNUTIE trénera, nie predaj (Jerry, 21. 10. 2026: „doplnenie členstva
 * môžeme dať iba my naším rozhodnutím"). Jakub Kaňovský dostal automaticky
 * „Doplnenie členstva" za 0 Kč, Natália Krivdová „Prenesené hodiny" za 0 Kč.
 * Automaticky vzniká len predaj s cenou a hodinami — inak nič; návrh, ktorý
 * týmto neprejde, je chyba vo vzore, nie dôvod niečo zapísať.
 */
export const smieVzniknutAutomaticky = (n: { nazov: string; cena: number; hodiny: number }): boolean =>
  !/^\s*(doplnenie|prenesen)/i.test(n.nazov) && n.cena > 0 && n.hodiny > 0;

/**
 * ZRUŠENÝ AUTOMATICKÝ BALÍČEK SA NEVRACIA (Jerry, 1. 11. 2026).
 *
 * Do toho dňa vznikol zrušený balíček pri ďalšom behu znova: Knapčok 19. 10.
 * zrušený 14:36, znova 14:59. Človek ho zrušil, automat to nevidel. Teraz si
 * Kokpit pamätá deň začiatku: na ten deň automat nezakladá, tréning po ňom na
 * inom dátume založí podľa normálneho pravidla. Ručný zápis to nebrzdí a
 * vrátenie zrušeného („vrat") riadok zo zoznamu vyberie samo.
 *
 * Úvodný je vlastný balíček, nie „ten istý" — prepnutie tréningu na úvodný po
 * zrušenom 6 h ho musí vedieť založiť (Luky Kríž). Opačne to neplatí: zrušený
 * úvodný zablokuje aj bežný balíček na ten deň, lebo ten tréning človek práve
 * riešil a na bežný sa z neho automat nemá prepnúť sám.
 *
 * Posun za doplnenie (`api/balicky`, akcia `pridaj`) rozhodol kód, nie človek —
 * ten balíček „vznikne znova za ním" aj vtedy, keď doplnenie deň nepokryje.
 * Preto nesie značku a nepočíta sa.
 */
export const ZNACKA_POSUNU_ZA_DOPLNENIE = "posunutý za doplnenie";
export type ZruseneAutomaty = { dni: ReadonlySet<string>; uvodne: ReadonlySet<string> };
const ZIADNE_ZRUSENE: ZruseneAutomaty = { dni: new Set(), uvodne: new Set() };

export function zruseneAutomaty(
  klient: string,
  riadky: { klient: string; nazov: string; platnost_od: string; poznamka: string | null; zrusene_at: string | null }[],
): ZruseneAutomaty {
  const k = normName(klient);
  const moje = riadky.filter((r) => normName(r.klient) === k && r.zrusene_at
    && /^automaticky/i.test(String(r.poznamka || "")) && !String(r.poznamka).includes(ZNACKA_POSUNU_ZA_DOPLNENIE));
  if (!moje.length) return ZIADNE_ZRUSENE;
  const den = (r: { platnost_od: string }) => String(r.platnost_od).slice(0, 10);
  return { dni: new Set(moje.map(den)), uvodne: new Set(moje.filter((r) => r.nazov === NAZOV_UVODNEHO).map(den)) };
}

/**
 * VEĽKOSŤ A CENA ĎALŠIEHO BALÍČKA — jedna cesta pre automat aj QR na odkaze.
 * `null` = appka nemá z čoho vychádzať (klient mal len úvodný, doplnenie…).
 */
function vzorNovehoBalicka(os: Udalost[], ceny: { den: string; cena: number | null }[], odDna: string) {
  /**
   * ÚVODNÝ NIE JE VZOR PRE ĎALŠÍ BALÍČEK (Lenka Divinová, 16. 10. 2026).
   * Po úvodnom z 28. 8. prišiel prvý riadny tréning a appka založila
   * „podľa posledného" — teda znova úvodný za 1 100 Kč. Klient, ktorý mal
   * len úvodný, je nový: prvý balíček zakladá tréner (Jerry, 14. 10. 2026),
   * appka ho len pripomenie, že trénoval bez balíčka.
   */
  const jeVzor = (u: Udalost): u is Extract<Udalost, { druh: "balicekOd" }> =>
    u.druh === "balicekOd" && !u.doplnenie && u.hodin > 0 && u.den <= odDna && u.nazov !== NAZOV_UVODNEHO
    // Prenesené hodiny nie sú predaj (Natália Krivdová, 19. 10. 2026: nový
    // balíček vznikol ako „Prenesené hodiny" za 0 Kč namiesto předplatného).
    && u.nazov !== NAZOV_PRENESENYCH
    // Doplnenie zapísané v Kokpite nemá na osi príznak `doplnenie` (je to
    // riadok z `balicky`) — Jakub Kaňovský dostal 21. 10. automaticky
    // „Doplnenie členstva" za 0 Kč. Doplnenie nie je predaj.
    && !/^\s*doplnenie/i.test(u.nazov)
    // Ukončený balíček má cenu stiahnutú o vrátenie (Radek Baláž 5 875 Kč) a
    // snímka zostatku z PTmindera predaj nie je.
    && !u.ukonceny && !u.zostatokZPtmindera;
  /**
   * SAMOSTATNÁ HODINA NIE JE VZOR, KEĎ MÁ KLIENT ČLENSTVO (Marcela Hrůzová,
   * 22. 10. 2026). Jej posledný balíček bola offline hodina z 18. 9. popri
   * online členstve; po konci členstva vznikol z online tréningu „1h Balíček"
   * za 1 450 Kč namiesto online 6 h. Hodinový balíček je vzor len pre toho,
   * kto si nikdy nič väčšie nekupoval.
   */
  const posledny = os.find((u): u is Extract<Udalost, { druh: "balicekOd" }> => jeVzor(u) && u.hodin > 1) ?? os.find(jeVzor);
  if (!posledny) return null;

  const nazovPekny = nazovProduktu(posledny.nazov);
  const sablona: Sablona | undefined = CENNIK.find((s) => s.nazov === nazovPekny && (s.hodiny || 0) > 0);
  const hodiny = sablona?.hodiny ?? posledny.hodin;

  const cenaDna = (d: string) => ceny.find((c) => den(c.den) === den(d))?.cena ?? null;
  const cenaPoslednych = os
    .filter((u) => jeVzor(u) && (posledny.hodin === 1 || u.hodin > 1))
    .slice(0, 2)
    .map((u) => cenaDna(u.den));
  const katalog = sablona?.cena ?? null;
  const posl = cenaPoslednych[0] ?? null;
  const stalaInaCena = cenaPoslednych.length === 2 && posl != null && cenaPoslednych[1] === posl && posl !== katalog;
  const cena = Math.round(stalaInaCena ? posl : (katalog ?? posl ?? 0));
  const cenaPoznamka = stalaInaCena
    ? `platí stále ${fmtCZK(posl)}, cenník je ${katalog == null ? "—" : fmtCZK(katalog)}`
    : posl != null && katalog != null && Math.round(posl) !== katalog
      ? `posledný stál ${Math.round(posl)} Kč, navrhujem cenník`
      : undefined;

  const doDna = sablona
    ? platnostDo(odDna, sablona.tyzdnov, sablona.mesiacov)
    : posledny.doDna
      ? new Date(Date.parse(`${odDna}T00:00:00Z`) + dniMedzi(posledny.den, posledny.doDna) * 86400000).toISOString().slice(0, 10)
      : "";

  return { posledny, hodiny, nazov: sablona?.nazov ?? nazovPekny, cena, cenaPoznamka, posl, doDna, vCenniku: !!sablona };
}

/**
 * ČO PONÚKNUŤ KLIENTOVI, KTORÝ DOŠIEL NA NULU — QR „nový balíček" na odkaze.
 *
 * Do 1. 11. 2026 brala stránka cenu posledného riadku s cenou: Radek Baláž by
 * dostal 5 875 Kč (ukončený balíček po vrátení), Hana Hrdinová úvodný za 1 100
 * ako nový balíček. Teraz tá istá cesta ako automat — a kto mal len úvodný,
 * ponuku nedostane: prvý balíček zakladá tréner (Jerry, 14. 10. 2026). Starý
 * produkt mimo cenníka (GOLD, SILVER, BRONZ) sa už nepredáva, takže ani ten.
 */
export function ponukaNovehoBalicka(
  os: Udalost[],
  ceny: { den: string; cena: number | null }[],
  dnes: string,
): { nazov: string; hodiny: number; cena: number; cenaPoznamka?: string } | null {
  const v = vzorNovehoBalicka(os, ceny, dnes);
  if (!v || !v.vCenniku || !smieVzniknutAutomaticky(v)) return null;
  return { nazov: v.nazov, hodiny: v.hodiny, cena: v.cena, cenaPoznamka: v.cenaPoznamka };
}

/** Ceny balíčkov klienta podľa dňa začiatku — z Kokpitu aj z histórie PTmindera. */
export function cenyBalickovKlienta(
  klient: string,
  balicky: { klient: string; platnost_od: string; cena_czk: number | null; zrusene_at?: string | null }[],
  historia: { client: string; validFrom?: string; payment?: number | null }[],
): { den: string; cena: number | null }[] {
  const k = normName(klient);
  return [
    ...balicky.filter((b) => normName(b.klient) === k && !b.zrusene_at).map((b) => ({ den: b.platnost_od, cena: b.cena_czk })),
    ...historia.filter((h) => normName(h.client) === k).map((h) => ({ den: h.validFrom || "", cena: h.payment ?? null })),
  ];
}

function navrhNovehoBalickaBezStraze(
  klient: string,
  os: Udalost[],
  stavy: Map<Udalost, StavRiadku>,
  /** Ceny balíčkov klienta podľa dňa začiatku — z Kokpitu aj z histórie PTmindera. */
  ceny: { den: string; cena: number | null }[] = [],
  /** Dni, na ktoré človek automatický balíček zrušil (`zruseneAutomaty`). */
  zrusene: ZruseneAutomaty = ZIADNE_ZRUSENE,
): NavrhNovehoBalicka | null {
  /**
   * Tréning na NEZAPLATENOM balíčku nie je nekrytý — balíček má, len čaká na
   * platbu (Martin Vaško 27. 9., Lukáš Hanus 2. 10.). Odpočet „−1 · 6 h" sa
   * kreslí rovnako, ale nový balíček by bol druhý na to isté obdobie.
   */
  const nezaplateneOd = new Set(os.filter((u) => u.druh === "balicekOd" && u.nezaplatene).map((u) => u.den));
  /**
   * …až na tréningy NAD jeho hodiny: 6 h nezaplatené a osem tréningov =
   * siedmy už patrí ďalšiemu balíčku (Jerry: „balíček sa stále odpočítava
   * od 6"). Na nezaplatenom balíčku má odpočet (`buduca`) len jeho šesť
   * tréningov; tie nad ním majú mínus bez odpočtu.
   */
  /**
   * LEN POSLEDNÉ OBDOBIE. Mínus sa na osi značí aj v histórii (Anna Nová,
   * 2025) — tam už nič nevznikne, to je minulosť. Nový balíček rieši len
   * obdobie, do ktorého patrí NAJNOVŠÍ tréning klienta.
   */
  const najnovsi = os.find((u) => u.druh === "trening" && stavy.has(u));
  const posledneObdobie = najnovsi ? stavy.get(najnovsi)?.usek ?? "" : "";
  const nekryte = os.filter((u) => {
    if (u.druh !== "trening") return false;
    if (zrusene.dni.has(u.den)) return false;
    const st = stavy.get(u);
    if (!st || st.usek !== posledneObdobie) return false;
    // Tréning s odpočtom (`zostatok`) je krytý, aj keď má mínus — ten tam
    // znamená len „odtrénované skôr, než prišla platba" (Dan Kouřil, 2. 9.).
    if (st.zostatok != null) return false;
    // Za zaplateným balíčkom je nekrytý každý tréning bez odpočtu; budúci
    // odpočet (`buduca`) siaha len po hodiny posledného balíčka, mínus ďalej.
    return nezaplateneOd.has(st.usek) ? (st.dlh != null && st.buduca == null) : (st.buduca != null || st.dlh != null);
  });
  /**
   * ÚVODNÝ TRÉNING JE VLASTNÝ BALÍČEK (Jerry, 8. 10. 2026).
   *
   * „Úvodný tréning je špecificky samostatný balík a mal by vznikať vždy
   * prvým tréningom klienta — Petr Baťa by mal mať po úvodnom automaticky
   * dlh 1 100 Kč a ja by som mal mať možnosť vystaviť mu faktúru."
   *
   * Stojí PRED hľadaním predošlého balíčka: nový klient žiadny nemá, takže
   * dovtedy mu nevzniklo nič a úvodný visel v dochádzke bez peňazí. Jedna
   * hodina za cenu úvodného — tréning ju hneď minie a zostatok sedí na nule.
   *
   * A NEPOZERÁ SA, ČI JE TEN DEŇ UŽ KRYTÝ. Luky Kríž kúpil 6 h v ten istý
   * deň, čo trénoval prvýkrát; keď ten tréning Jerry prepne na úvodný, hodina
   * nemá padnúť zo šiestich — úvodný si nesie svoju vlastnú. Preto stačí, že
   * úvodný balíček na ten deň ešte neexistuje. Len v POSLEDNOM období:
   * staršie úvodné sú minulosť a appka do nej sama nepíše.
   */
  const maUvodnyBalicek = (d: string) => os.some((u) => u.druh === "balicekOd" && u.den === d && u.nazov === NAZOV_UVODNEHO);
  const uvodny = os.find((u) => u.druh === "trening" && u.uvodny
    && stavy.get(u)?.usek === posledneObdobie && !maUvodnyBalicek(u.den) && !zrusene.uvodne.has(u.den));
  if (uvodny) {
    return {
      klient,
      odDna: uvodny.den,
      nekrytych: 1,
      nazov: NAZOV_UVODNEHO,
      hodiny: 1,
      cena: UVODNY.cenaCzk,
      platnostDo: uvodny.den,
      predosly: null,
      navrat: false,
      pauzaDni: -1,
      cenaPoznamka: undefined,
    };
  }

  const offline = samostatnaHodina(klient, os, zrusene);
  if (offline) return offline;

  if (!nekryte.length) return null;
  const odDna = nekryte.reduce((m, u) => (u.den < m ? u.den : m), nekryte[0].den);

  const vzor = vzorNovehoBalicka(os, ceny, odDna);
  if (!vzor) return null;
  const { posledny, hodiny, nazov, cena, cenaPoznamka, posl, doDna } = vzor;

  const predtym = os.find((u) => u.druh === "trening" && u.den < odDna && stavy.get(u)?.buduca == null);
  const pauzaDni = predtym ? dniMedzi(predtym.den, odDna) : -1;

  return {
    klient,
    odDna,
    nekrytych: nekryte.length,
    nazov,
    hodiny,
    cena,
    platnostDo: doDna,
    predosly: { nazov: posledny.nazov, od: posledny.den, cena: posl },
    // Bez skoršieho krytého tréningu to nie je návrat, len prvé obdobie.
    navrat: pauzaDni > NAVRAT_PO_DNOCH,
    pauzaDni,
    cenaPoznamka,
  };
}

/**
 * TRÉNING INÉHO DRUHU NEŽ ČLENSTVO = SAMOSTATNÁ HODINA (Jerry, 21. a 25. 10.
 * 2026: „Veronika keď príde na offline, tak platí 1 h za 1 450, keď online,
 * má cenu, čo má." … „keď má klient veľa hodín offline a zrazu sa v názve
 * objaví online, tak je čas dať online hodinu.").
 *
 * Druh tréningu z kalendára je od 25. 10. druh členstva, ktoré v ten deň
 * platí (`jeOnlineTrening`); iný druh má tréning len vtedy, keď ho v názve
 * mení slovo „offline"/„online". Preto už netreba výnimku „len kto si takú
 * hodinu raz kúpil" — Lucia Podolová má online členstvo a jej tréningy bez
 * slova sú online. Os už vie, že hodina iného druhu pokryje svoj tréning
 * a členstvo beží ďalej. Len od 1. 10. 2026: minulosť appka sama nepíše.
 */
export function samostatnaHodina(klient: string, os: Udalost[], zrusene: ZruseneAutomaty = ZIADNE_ZRUSENE): NavrhNovehoBalicka | null {
  const balicky = os.filter((u): u is Extract<Udalost, { druh: "balicekOd" }> => u.druh === "balicekOd" && !u.doplnenie);
  const plati = (b: { den: string; doDna?: string }, d: string) => b.den <= d && (!b.doDna || b.doDna >= d);
  const treningy = os
    .filter((u): u is Extract<Udalost, { druh: "trening" }> => u.druh === "trening" && !u.uvodny && u.zdarma === undefined && u.den >= KOKPIT_OD)
    .sort((a, b) => a.den.localeCompare(b.den));
  for (const t of treningy) {
    if (zrusene.dni.has(t.den)) continue;
    const druh = kanalTreningu(t);
    if (!druh) continue;
    const jeHodina = (b: { hodin: number; nazov: string }) => b.hodin === 1 && kanalBalicka(b.nazov) === druh && b.nazov !== NAZOV_UVODNEHO;
    if (balicky.some((b) => b.den === t.den && jeHodina(b))) continue;
    const clenstva = balicky.filter((b) => b.hodin > 1 && plati(b, t.den) && !/^\s*(doplnenie|prenesen)/i.test(b.nazov));
    // Platí aj členstvo toho druhu — tréning ide z neho.
    if (clenstva.some((b) => kanalBalicka(b.nazov) === druh)) continue;
    const clenstvo = clenstva.sort((a, b) => b.den.localeCompare(a.den))[0];
    if (!clenstvo || !kanalBalicka(clenstvo.nazov)) continue;
    const sablona = CENNIK.find((x) => x.nazov === (druh === "on" ? "1h Balíček online" : "1h Balíček"));
    if (!sablona?.hodiny) continue;
    return {
      klient,
      odDna: t.den,
      nekrytych: 1,
      nazov: sablona.nazov,
      hodiny: sablona.hodiny,
      cena: sablona.cena ?? (druh === "on" ? 1390 : 1450),
      platnostDo: platnostDo(t.den, sablona.tyzdnov, sablona.mesiacov),
      predosly: { nazov: clenstvo.nazov, od: clenstvo.den, cena: null },
      navrat: false,
      pauzaDni: -1,
      cenaPoznamka: druh === "on" ? "online tréning popri offline členstve — samostatná hodina" : "offline tréning popri online členstve — samostatná hodina",
    };
  }
  return null;
}

/* ───────────────────────── 3 · PLATBY: SUMA NESEDÍ ───────────────────────── */


export type MoznostPlatby =
  | { druh: "velkost"; popis: string; nazov: string; hodiny: number; cena: number; platnostDo: string }
  | { druh: "cena"; popis: string; cena: number; dovod: string };

export type OtazkaPlatby = {
  klient: string;
  balicekId: string;
  balicek: string;
  platnostOd: string;
  cena: number;
  /** Koľko z platieb na tento balíček zostalo — menej než cena. */
  zaplatene: number;
  /** Prečo sa appka pýta — jedna veta. */
  veta: string;
  moznosti: MoznostPlatby[];
};

/**
 * PRIŠLA PLATBA, ALE NESEDÍ NA BALÍČEK.
 *
 * Jerry, 4. 10. 2026: „príde 7 790 a balíček je 18 h — znak, že veľkosť je
 * zlá; dopýtať sa a následne to opravíme." A pri Kateřine Matlovej, ktorá
 * zaplatila 7 011: „platila inak za Richarda Matla, ktorý dal referenciu —
 * −10 %; bolo by super, keby na to prišla logika Kokpitu sama, ale kľudne
 * sa môže Kokpit dopytovať, prečo taká netradičná suma."
 *
 * Platby sa kladú na balíčky od najstaršieho (ako dlh). Otázka vzniká pri
 * balíčku, ktorý dostal NIEČO, ale nie celú cenu. Balíček bez platby nie je
 * otázka — ten len čaká na platbu.
 */
/**
 * Kľúč odpovede „doplatí zvyšok" v `anomaly_ack`. Do 29. 10. 2026 sa tá
 * odpoveď len schovala na obrazovke a po obnovení stránky sa otázka vrátila
 * (Branislav Široký). Suma je v kľúči zámerne: keď príde ďalšia čiastočná
 * platba, je to nová situácia a otázka sa spýta znova.
 */
export const klucOtazkyPlatby = (o: Pick<OtazkaPlatby, "balicekId" | "zaplatene">) => `suma-nesedi|${o.balicekId}|${o.zaplatene}`;

export function otazkyPlatieb(dlhy: DlhPolozka[] | undefined, acks?: Record<string, unknown>): OtazkaPlatby[] {
  /**
   * Jedno pravidlo „zaplatený" (`data.dlhy`, 5. 10. 2026): otázka vzniká pri
   * balíčku z Kokpitu, ktorý v zozname nezaplatených je, a dostal z ceny
   * NIEČO. Dovtedy tu bola tretia kópia kladenia platieb na balíčky — bez
   * poistky z PTmindera — a pýtala sa aj na balíček, ktorý PTminder pozná
   * ako zaplatený.
   */
  const out: OtazkaPlatby[] = [];
  for (const x of dlhy || []) {
    if (x.zdroj !== "kokpit" || !x.id) continue;
    const cena = x.cena;
    const zaplatene = Math.round(cena - x.doplatit);
    if (zaplatene <= 0 || zaplatene >= cena) continue;
    if (acks?.[klucOtazkyPlatby({ balicekId: x.id, zaplatene })]) continue;
    const moznosti: MoznostPlatby[] = [];
    for (const s of CENNIK) {
      if (!s.hodiny || !s.cena || s.cena !== zaplatene || s.nazov === nazovProduktu(x.nazov)) continue;
      moznosti.push({
        druh: "velkost", popis: `je to ${s.nazov}`, nazov: s.nazov, hodiny: s.hodiny, cena: s.cena,
        platnostDo: platnostDo(den(x.den), s.tyzdnov, s.mesiacov),
      });
    }
    const zlava = Math.round((1 - zaplatene / cena) * 100);
    if (Math.abs(zaplatene - cena * 0.9) <= 2) {
      moznosti.push({ druh: "cena", popis: "zľava 10 % za odporúčanie", cena: zaplatene, dovod: "zľava 10 % za odporúčanie" });
    }
    moznosti.push({ druh: "cena", popis: `iná cena: ${fmtCZK(zaplatene)}`, cena: zaplatene, dovod: "" });
    out.push({
      klient: x.klient, balicekId: x.id, balicek: nazovProduktu(x.nazov), platnostOd: den(x.den), cena, zaplatene,
      veta: moznosti.some((m) => m.druh === "velkost")
        ? `Prišlo ${fmtCZK(zaplatene)}, ${nazovProduktu(x.nazov)} stojí ${fmtCZK(cena)}. Sedí veľkosť balíčka?`
        : zlava > 0 && zlava < 50
          ? `Prišlo ${fmtCZK(zaplatene)}, ${nazovProduktu(x.nazov)} stojí ${fmtCZK(cena)} — o ${zlava} % menej. Prečo?`
          : `Prišlo ${fmtCZK(zaplatene)}, ${nazovProduktu(x.nazov)} stojí ${fmtCZK(cena)}.`,
      moznosti,
    });
  }
  return out.sort((a, b) => b.platnostOd.localeCompare(a.platnostOd));
}

/* ───────────────────────── 2 · SMS PRE KLIENTOV ──────────────────────────── */

export type KlientPreSms = {
  name: string; status: string; primaryTrainer: string; membership: string;
  packageRemaining: number; packageTotal: number; lastSession: string;
  /** Skončil s vrátením peňazí. */
  ukonceny?: boolean;
};

export type RiadokSms = {
  meno: string;
  trener: string;
  /** Čo stránka za odkazom povie — rozhoduje matematika, nie výber správy. */
  stav: "nula" | "minus" | "dlh";
  zostatok: number;
  dlh: number;
  veta: string;
  /**
   * V zozname je len preto, že nemá na čo chodiť (`bezAktivnehoBalicka`):
   * žiadny balíček, žiadny dlh. Iba pri ňom sa dá povedať „netreba písať“ —
   * inak by riadok stál až do konca okna, aj keď to tréner s klientom vyriešil.
   */
  lenBezBalicka?: boolean;
};

/**
 * KOMU MÁ ZMYSEL POSLAŤ SMS.
 *
 * Jerry, 4. 10. 2026: „len tí, u ktorých to dáva zmysel" a „po odoslaní
 * nech zmizne, kým sa jeho stav nezmení". Zmysel to dáva pri nule, mínuse
 * a dlhu — vtedy je na stránke za odkazom QR. Klient, ktorý dva mesiace
 * netrénoval a nič nemá objednané, do zoznamu nepatrí: SMS by bola o ničom.
 *
 * `zmena` je posledný okamih, keď sa klientovi pohol stav (tréning, platba,
 * balíček). SMS odoslaná PO ňom znamená, že klient už vie, čo stránka hovorí.
 *
 * `bezHodin` (kontrola 1. 11. 2026): zoznam „Bez balíčka“ sa vo Workspace od
 * 5. 10. nekreslí ako karta — pravidlo znelo „kto je na nule, patrí do SMS“.
 * Lenže toto sito chcelo `packageTotal > 0`, a kto dobral doplnenie alebo mu
 * balíček v Kokpite skončil, má kartu 0/0: Stoklasko, Regina Obrovska, Štigut
 * a Stoklásková neboli na obrazovke nikde. Kto je v tom zozname, prejde aj
 * bez balíčka a termín v kalendári je silnejší než stav „Neaktívny“ (to isté
 * pravidlo ako `patriDoZoznamu`). Okno „trénoval za 60 dní alebo má termín“
 * a „po odoslaní zmizne“ platí rovnako ako pre ostatných.
 */
export function zoznamSms(
  clients: KlientPreSms[],
  dlhy: Record<string, number>,
  odoslane: Record<string, string>,
  zmena: Record<string, string>,
  objednane: Set<string>,
  dnes: string,
  bezHodin: Pick<BezBalicka, "meno" | "dovod" | "objednanych" | "vMinuse">[] = [],
  /**
   * Klienti s faktúrou na ďalší balíček (Jerry, 8. 11. 2026, Jan Kral: „to
   * isté"). Na nule bez dlhu je ďalší balíček už vyfakturovaný — SMS by mu
   * len oznamovala, čo dostal faktúrou. Pri mínuse alebo dlhu ostáva.
   */
  fakturyNaDalsi: string[] = [],
): RiadokSms[] {
  const naDalsi = new Set(fakturyNaDalsi.map(normName));
  const out: RiadokSms[] = [];
  const bezPodlaMena = new Map(bezHodin.map((x) => [normName(x.meno), x]));
  for (const c of clients) {
    const bez = bezPodlaMena.get(normName(c.name));
    if (c.status === "Neaktívny" && !bez) continue;
    const dlh = Math.round(dlhy[c.name] || 0);
    const maBalicek = c.packageTotal > 0;
    if (!maBalicek && dlh <= 0 && !bez) continue;
    const naKarte = Math.round(c.packageRemaining * 100) / 100;
    // Karta 0/0 mínus nenesie; ten istý počet, aký stojí v profile, dáva os.
    const zostatok = naKarte === 0 && bez && bez.vMinuse > 0 ? -bez.vMinuse : naKarte;
    if (zostatok > 0 && dlh <= 0) continue;
    if (zostatok === 0 && dlh <= 0 && naDalsi.has(normName(c.name))) continue;
    const nedavno = !!c.lastSession && dniMedzi(c.lastSession, dnes) <= NAVRAT_PO_DNOCH;
    if (!nedavno && !objednane.has(normName(c.name))) continue;
    const sms = odoslane[c.name];
    if (sms && (!zmena[c.name] || sms > zmena[c.name])) continue;
    const lenBezBalicka = !maBalicek && dlh <= 0 && !!bez;
    const stav: RiadokSms["stav"] = zostatok < 0 ? "minus" : zostatok === 0 && (maBalicek || lenBezBalicka) ? "nula" : "dlh";
    const terminov = bez?.objednanych ? ` · obj. ${bez.objednanych}` : "";
    out.push({
      meno: c.name,
      trener: c.primaryTrainer,
      stav,
      zostatok,
      dlh,
      // Bez slovesa v minulom čase — „mal/mala" by sa pri mene pomýlilo
      // (to isté pravidlo ako text SMS od 2. 10. 2026).
      veta: stav === "minus"
        ? `trénuje bez krytia${dlh ? ` · dlh ${fmtCZK(dlh)}` : ""}${terminov}`
        : stav === "nula"
          ? `na nule — ${lenBezBalicka ? bez?.dovod : "balíček minutý"}${dlh ? ` · dlh ${fmtCZK(dlh)}` : ""}${terminov}`
          : `dlh ${fmtCZK(dlh)}`,
      ...(lenBezBalicka ? { lenBezBalicka } : {}),
    });
  }
  return out.sort((a, b) => a.zostatok - b.zostatok || b.dlh - a.dlh || a.meno.localeCompare(b.meno, "cs"));
}

/* ──────────── NOTIFIKÁCIA: POSLEDNÁ HODINA ALEBO MÍNUS (9. 10. 2026) ──────────── */

/**
 * POSLEDNÁ ZMENA STAVU KLIENTA — tréning, ktorý už začal, platba, balíček.
 *
 * Časy sú PRAŽSKÉ (`RRRR-MM-DDTHH:MM`), nie UTC: kalendár ich tak nesie
 * a server beží v UTC — `new Date("…T18:00")` by tam posunulo tréning
 * o dve hodiny. Odoslanú SMS (audit je v UTC) treba pred porovnaním
 * previesť cez `terazPraha(new Date(at))`.
 */
export function poslednaZmenaStavu(
  mena: string[],
  udalosti: { zaciatok: string; klient: string | null; typ: string | null }[],
  platby: { klient: string; datum: string }[],
  balicky: { klient: string; platnost_od?: string; platnostOd?: string }[],
  terazP: string,
): { zmena: Record<string, string>; reset: Record<string, string>; objednane: Set<string>; dnesTrenuje: Set<string> } {
  const podla = new Map(mena.map((m) => [normName(m), m]));
  const zmena: Record<string, string> = {};
  /** Len platba alebo balíček — to, čo hodiny DOPĹŇA. Tréning ich len míňa. */
  const reset: Record<string, string> = {};
  const objednane = new Set<string>();
  /** Kto má DNES tréning (už bol alebo ešte len bude). */
  const dnesTrenuje = new Set<string>();
  const posun = (meno: string | null, cas: string, ajReset = false) => {
    if (!meno || !cas) return;
    const k = podla.get(normName(meno)) || meno;
    if (cas > terazP) return;
    if (!zmena[k] || cas > zmena[k]) zmena[k] = cas;
    if (ajReset && (!reset[k] || cas > reset[k])) reset[k] = cas;
  };
  for (const u of udalosti) {
    if (!u.klient || (u.typ !== "trening" && u.typ !== "uvodny")) continue;
    const cas = u.zaciatok.slice(0, 16);
    if (cas.slice(0, 10) === terazP.slice(0, 10)) dnesTrenuje.add(normName(u.klient));
    if (cas > terazP) objednane.add(normName(u.klient));
    else posun(u.klient, cas);
  }
  for (const p of platby) posun(p.klient, `${p.datum.slice(0, 10)}T00:00`, true);
  for (const b of balicky) posun(b.klient, `${String(b.platnost_od || b.platnostOd || "").slice(0, 10)}T00:00`, true);
  return { zmena, reset, objednane, dnesTrenuje };
}

export type UpozornenieHodin = {
  meno: string;
  trener: string;
  /** posledná = zostáva najviac hodina; nula = minuté; mínus = trénuje nad rámec. */
  stav: "posledna" | "nula" | "minus";
  zostatok: number;
  /** Odpoveď (aj „SMS poslaná") staršia než toto sa nepočíta — posledná platba alebo balíček. */
  platneOd: string;
};


/**
 * KTO MÁ POSLEDNÚ HODINU ALEBO JE V MÍNUSE.
 *
 * Jerry, 9. 10. 2026: „sprav mi upozornenie, že klient má poslednú hodinu
 * alebo že je v mínuse, a pridaj mi tam poslať SMS." Tie isté hranice ako
 * krok 2 · SMS (aktívny klient s balíčkom, trénoval za 60 dní alebo má
 * termín), len s jedným stupňom navyše: POSLEDNÁ HODINA — vtedy sa ešte dá
 * napísať skôr, než klient prejde do mínusu.
 *
 * NEOTRAVUJE PO KAŽDOM TRÉNINGU. Prvá verzia brala ako zmenu aj tréning —
 * klient v mínuse by svietil znova po každej hodine a pri prvom spustení
 * by ich naraz svietilo 30. Preto:
 *  - epizódu ukončí len PLATBA alebo BALÍČEK (`reset`), nie tréning;
 *  - SMS odoslaná v tejto epizóde ju umlčí celú (stránka za odkazom ukazuje
 *    stav živo — ďalšia správa by hovorila to isté);
 *  - „Vybavené" platí na STUPEŇ: posledná hodina a mínus sú dve otázky;
 *  - hlási sa LEN V DEŇ TRÉNINGU (Jerry, 9. 10. 2026: „daj mi tú notifikáciu
 *    len v deň, keď má ten klient tréning, nech mi tam nesvieti 10 ľudí len
 *    tak"). Zoznam všetkých, komu treba písať, ostáva v kroku 2 · SMS.
 */
export function upozorneniaHodin(
  clients: KlientPreSms[],
  odoslane: Record<string, string>,
  reset: Record<string, string>,
  dnesTrenuje: Set<string>,
): UpozornenieHodin[] {
  const out: UpozornenieHodin[] = [];
  for (const c of clients) {
    if (c.status === "Neaktívny" || c.status === "Pauza") continue;
    if (c.ukonceny) continue;
    if (!(c.packageTotal > 0)) continue;
    const zostatok = Math.round(c.packageRemaining * 100) / 100;
    if (zostatok > 1) continue;
    if (!dnesTrenuje.has(normName(c.name))) continue;
    const zm = reset[c.name] || "";
    const sms = odoslane[c.name];
    if (sms && (!zm || sms > zm)) continue;
    out.push({
      meno: c.name,
      trener: c.primaryTrainer,
      stav: zostatok < 0 ? "minus" : zostatok === 0 ? "nula" : "posledna",
      zostatok,
      platneOd: zm,
    });
  }
  return out.sort((a, b) => a.zostatok - b.zostatok || a.meno.localeCompare(b.meno, "cs"));
}

/** Veta do notifikácie — bez slovesa v minulom čase (rod sa z mena nevyčíta). */
export function vetaHodin(u: UpozornenieHodin): { title: string; detail: string } {
  if (u.stav === "minus") {
    return {
      title: `${u.meno}: ${hodinyKratko(u.zostatok)}`,
      detail: `${u.meno} trénuje bez krytia (${hodinyKratko(u.zostatok)}). Pošli SMS s odkazom — stránka za ním ukáže stav hodín aj QR na platbu.`,
    };
  }
  if (u.stav === "nula") {
    return {
      title: `${u.meno}: balíček minutý (0 h)`,
      detail: `${u.meno} má balíček minutý — ďalší tréning už bude v mínuse. Pošli SMS s odkazom na stav hodín a platbu.`,
    };
  }
  return {
    title: `${u.meno}: posledná hodina z balíčka`,
    detail: `${u.meno} má v balíčku poslednú hodinu (${u.zostatok} h). Pošli SMS, nech vie skôr, než prejde do mínusu — za odkazom vidí stav hodín.`,
  };
}

/* ───────────────────────── 3 · PLATBY: KTORÁ PLATBA Z BANKY K DLHU ─────────── */

export type KandidatPlatby = { fioId: string; datum: string; suma: number; text: string; preco: "meno" | "suma" | "meno+suma" };

/**
 * KTORÁ NEPRIRADENÁ PLATBA Z BANKY MÔŽE PATRIŤ TOMUTO DLŽNÍKOVI.
 *
 * Jerry, 4. 10. 2026: „keď kliknem na meno klienta, rozbalí sa to — keď
 * žiadna platba nie je, ukáže mi, že žiadna platba; keď by vo Fiu existoval
 * nejaký pár, ukáže sa tá platba (dátum, poznámka) a ja môžem dať párovať."
 * A „prečo je v platbách vybavené? Keď dám vybavené, zmizne to a nič sa
 * nenapáruje." Párovanie preto nahrádza „vybavené": dlh zmizne, až keď
 * platba naozaj príde.
 *
 * Pár je platba, kde appka navrhuje tohto klienta (meno, faktúra, firma),
 * alebo platba presne na sumu dlhu či jedného z nezaplatených balíčkov —
 * najskôr dva týždne pred najstarším z nich.
 */
export function kandidatiPlatby(
  meno: string,
  dlh: { spolu: number; polozky: { datum: string; suma: number }[] },
  nepriradene: { fioId: string; datum: string; suma: number; text: string; kandidati: string[] }[],
  nezaplatene: { klient: string; den: string; cena: number; doplatit?: number }[] = [],
): KandidatPlatby[] {
  const k = normName(meno);
  const moje = nezaplatene.filter((b) => normName(b.klient) === k);
  const sumy = new Set([dlh.spolu, ...dlh.polozky.map((p) => p.suma), ...moje.map((b) => b.doplatit ?? b.cena)].map((x) => Math.round(x)).filter((x) => x > 0));
  const dni = [...dlh.polozky.map((p) => den(p.datum)), ...moje.map((b) => den(b.den))].filter(Boolean).sort();
  const od = dni.length ? new Date(Date.parse(`${dni[0]}T00:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10) : "";
  const out: KandidatPlatby[] = [];
  for (const p of nepriradene) {
    const menom = p.kandidati.some((x) => normName(x) === k);
    const sumou = sumy.has(Math.round(p.suma)) && (!od || den(p.datum) >= od);
    if (!menom && !sumou) continue;
    out.push({ fioId: p.fioId, datum: den(p.datum), suma: p.suma, text: p.text, preco: menom && sumou ? "meno+suma" : menom ? "meno" : "suma" });
  }
  const vaha = { "meno+suma": 0, meno: 1, suma: 2 } as const;
  return out.sort((a, b) => vaha[a.preco] - vaha[b.preco] || b.datum.localeCompare(a.datum));
}

/** Návrh nového balíčka — len taký, aký smie vzniknúť sám (`smieVzniknutAutomaticky`). */
export function navrhNovehoBalicka(...args: Parameters<typeof navrhNovehoBalickaBezStraze>): NavrhNovehoBalicka | null {
  const n = navrhNovehoBalickaBezStraze(...args);
  return n && smieVzniknutAutomaticky(n) ? n : null;
}
