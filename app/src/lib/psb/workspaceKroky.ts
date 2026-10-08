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
import { CENNIK, platnostDo, type Sablona } from "./cennik";
import { UVODNY } from "./uvodnaStranka";
import { normName } from "./format";
import type { Udalost } from "./klientOsCasu";
import { nazovProduktu } from "./nazvyProduktov";
import type { StavRiadku } from "./vypisHodin";

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

export function navrhNovehoBalicka(
  klient: string,
  os: Udalost[],
  stavy: Map<Udalost, StavRiadku>,
  /** Ceny balíčkov klienta podľa dňa začiatku — z Kokpitu aj z histórie PTmindera. */
  ceny: { den: string; cena: number | null }[] = [],
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
    && stavy.get(u)?.usek === posledneObdobie && !maUvodnyBalicek(u.den));
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

  if (!nekryte.length) return null;
  const odDna = nekryte.reduce((m, u) => (u.den < m ? u.den : m), nekryte[0].den);

  const posledny = os.find((u): u is Extract<Udalost, { druh: "balicekOd" }> =>
    u.druh === "balicekOd" && !u.doplnenie && u.hodin > 0 && u.den <= odDna);
  if (!posledny) return null;

  const predtym = os.find((u) => u.druh === "trening" && u.den < odDna && stavy.get(u)?.buduca == null);
  const pauzaDni = predtym ? dniMedzi(predtym.den, odDna) : -1;

  const nazovPekny = nazovProduktu(posledny.nazov);
  const sablona: Sablona | undefined = CENNIK.find((s) => s.nazov === nazovPekny && (s.hodiny || 0) > 0);
  const hodiny = sablona?.hodiny ?? posledny.hodin;

  const cenaDna = (d: string) => ceny.find((c) => den(c.den) === den(d))?.cena ?? null;
  const cenaPoslednych = os
    .filter((u): u is Extract<Udalost, { druh: "balicekOd" }> => u.druh === "balicekOd" && !u.doplnenie && u.hodin > 0 && u.den <= odDna)
    .slice(0, 2)
    .map((u) => cenaDna(u.den));
  const katalog = sablona?.cena ?? null;
  const posl = cenaPoslednych[0] ?? null;
  const stalaInaCena = cenaPoslednych.length === 2 && posl != null && cenaPoslednych[1] === posl && posl !== katalog;
  const cena = Math.round(stalaInaCena ? posl : (katalog ?? posl ?? 0));
  const cenaPoznamka = stalaInaCena
    ? `platí stále ${posl} Kč, cenník je ${katalog ?? "—"}`
    : posl != null && katalog != null && Math.round(posl) !== katalog
      ? `posledný stál ${Math.round(posl)} Kč, navrhujem cenník`
      : undefined;

  const doDna = sablona
    ? platnostDo(odDna, sablona.tyzdnov, sablona.mesiacov)
    : posledny.doDna
      ? new Date(Date.parse(`${odDna}T00:00:00Z`) + dniMedzi(posledny.den, posledny.doDna) * 86400000).toISOString().slice(0, 10)
      : "";

  return {
    klient,
    odDna,
    nekrytych: nekryte.length,
    nazov: sablona?.nazov ?? nazovPekny,
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
export function otazkyPlatieb(dlhy: DlhPolozka[] | undefined): OtazkaPlatby[] {
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
    moznosti.push({ druh: "cena", popis: `iná cena: ${zaplatene} Kč`, cena: zaplatene, dovod: "" });
    out.push({
      klient: x.klient, balicekId: x.id, balicek: nazovProduktu(x.nazov), platnostOd: den(x.den), cena, zaplatene,
      veta: moznosti.some((m) => m.druh === "velkost")
        ? `Prišlo ${zaplatene} Kč, ${nazovProduktu(x.nazov)} stojí ${cena} Kč. Sedí veľkosť balíčka?`
        : zlava > 0 && zlava < 50
          ? `Prišlo ${zaplatene} Kč, ${nazovProduktu(x.nazov)} stojí ${cena} Kč — o ${zlava} % menej. Prečo?`
          : `Prišlo ${zaplatene} Kč, ${nazovProduktu(x.nazov)} stojí ${cena} Kč.`,
      moznosti,
    });
  }
  return out.sort((a, b) => b.platnostOd.localeCompare(a.platnostOd));
}

/* ───────────────────────── 2 · SMS PRE KLIENTOV ──────────────────────────── */

export type KlientPreSms = {
  name: string; status: string; primaryTrainer: string; membership: string;
  packageRemaining: number; packageTotal: number; lastSession: string;
};

export type RiadokSms = {
  meno: string;
  trener: string;
  /** Čo stránka za odkazom povie — rozhoduje matematika, nie výber správy. */
  stav: "nula" | "minus" | "dlh";
  zostatok: number;
  dlh: number;
  veta: string;
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
 */
export function zoznamSms(
  clients: KlientPreSms[],
  dlhy: Record<string, number>,
  odoslane: Record<string, string>,
  zmena: Record<string, string>,
  objednane: Set<string>,
  dnes: string,
): RiadokSms[] {
  const out: RiadokSms[] = [];
  for (const c of clients) {
    if (c.status === "Neaktívny") continue;
    const dlh = Math.round(dlhy[c.name] || 0);
    const maBalicek = c.packageTotal > 0;
    if (!maBalicek && dlh <= 0) continue;
    const zostatok = Math.round(c.packageRemaining * 100) / 100;
    if (zostatok > 0 && dlh <= 0) continue;
    const nedavno = !!c.lastSession && dniMedzi(c.lastSession, dnes) <= NAVRAT_PO_DNOCH;
    if (!nedavno && !objednane.has(normName(c.name))) continue;
    const sms = odoslane[c.name];
    if (sms && (!zmena[c.name] || sms > zmena[c.name])) continue;
    const stav: RiadokSms["stav"] = zostatok < 0 ? "minus" : zostatok === 0 && maBalicek ? "nula" : "dlh";
    out.push({
      meno: c.name,
      trener: c.primaryTrainer,
      stav,
      zostatok,
      dlh,
      // Bez slovesa v minulom čase — „mal/mala" by sa pri mene pomýlilo
      // (to isté pravidlo ako text SMS od 2. 10. 2026).
      veta: stav === "minus"
        ? `${zostatok} h nad rámec${dlh ? ` · dlh ${dlh} Kč` : ""}`
        : stav === "nula"
          ? `na nule — balíček minutý${dlh ? ` · dlh ${dlh} Kč` : ""}`
          : `dlh ${dlh} Kč`,
    });
  }
  return out.sort((a, b) => a.zostatok - b.zostatok || b.dlh - a.dlh || a.meno.localeCompare(b.meno, "cs"));
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
