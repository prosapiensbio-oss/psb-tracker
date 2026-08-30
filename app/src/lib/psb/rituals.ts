// Rituály — kedy sa čo zapisuje a čo z toho ešte chýba.
//
// Jerryho odpoveď na otázku, prečo sú týždenné zápisy prázdne, nebola „je to
// zbytočné", ale „je to úplne nový zvyk". Appka teda nemá pridať ďalšie
// políčko, má pripomenúť — a pripomenúť vtedy, kedy sa to naozaj robí:
//
//   • týždenný zápis — cez víkend (piatok až nedeľa)
//   • mesačný — prvý víkend nasledujúceho mesiaca (viď prevadzka.md)
//   • kvartálny — v prvých dňoch po skončení kvartálu
//
// Zámerne to NIE je „každý deň, kým to nevyplníš". Pripomienka, ktorá svieti
// stále, prestane byť pripomienkou a stane sa tapetou; presne tak zomrel
// pôvodný zámer týždenných zápisov.

import { weekKey, weekLabel } from "./format";

export type Ritual = {
  id: string;
  /** "tyzden" | "mesiac" | "kvartal" | "kontrola" */
  druh: "tyzden" | "mesiac" | "kvartal" | "kontrola";
  nadpis: string;
  detail: string;
  /** Kam to zapísať — dvojica pre navigáciu. */
  ciel: { tab: string; sub?: string; mesiac?: string; tyzden?: string };
  /**
   * Komu pripomienka patrí. Bez toho by ju filter trénera ukazoval obom —
   * a týždenná únava je zápis jedného človeka o sebe, nie spoločná úloha.
   */
  trener?: string;
  /**
   * Keď je hotová, zmizne aj zo zoznamu „Čo chceš zapísať".
   *
   * Platí pre dobiehanie minulého týždňa: jeho jediný zmysel je povedať
   * „niečo ti ušlo". Dobehnutý riadok s nadpisom „Chýba…" a telom „máte
   * zapísané" si protirečí a len predlžuje zoznam.
   */
  tichyKedHotovy?: boolean;
  /** true = práve teraz je čas to spraviť a nie je to spravené */
  splatne: boolean;
  /** true = už je to za dané obdobie vyplnené */
  hotove: boolean;
};

const PEOPLE = ["jerry", "terezka"] as const;

const dvoj = (n: number) => String(n).padStart(2, "0");
const mesiacKluc = (d: Date) => `${d.getFullYear()}-${dvoj(d.getMonth() + 1)}`;

/** Poradie dňa v týždni s pondelkom ako 1 a nedeľou ako 7. */
const denVTyzdni = (d: Date) => d.getDay() || 7;

export function ritualy(
  dnes: Date,
  weeks: Record<string, Record<string, string>>,
  monthNotes: Record<string, { note?: string; answers?: Record<string, string> }>,
  /** Čo ešte nie je nahraté — pripomienka na zápis čaká, kým je zoznam prázdny. */
  doklady?: { chybaju: string[] },
): Ritual[] {
  const out: Ritual[] = [];
  const den = denVTyzdni(dnes);
  const denVMesiaci = dnes.getDate();

  // ── Týždenný ────────────────────────────────────────────────────────────
  // Zapisuje sa za PREBIEHAJÚCI týždeň, cez víkend. Piatok je najskorší deň,
  // kedy má zmysel sa pýtať „aký bol týždeň" — v stredu to človek nevie.
  //
  // Pripomienka je PO OSOBÁCH, nie jedna spoločná. Do 29. 8. 2026 zhasínala,
  // len čo hodnotenie napísal ktokoľvek z dvojice — takže keď Jerry zapísal
  // svoju sedmičku, Terezke pripomienka zmizla a svoj týždeň nemala kde nájsť.
  // V dátach to bolo vidieť: týždeň 24. 8. má jerry_score 7 a od Terezky iba
  // poznámku, týždne 10. a 17. 8. nemajú od nej nič. Únava je zápis jedného
  // človeka o sebe — cudzí zápis ho nemôže odškrtnúť.
  //
  // Pýta sa na DVA týždne: prebiehajúci od piatku a minulý, kým je nezapísaný.
  // Jeden týždeň spätne je zámerná hranica (Jerry, 29. 8. 2026) — bez nej
  // týždeň, ktorý sa v nedeľu nestihol, zmizol v pondelok navždy a už sa
  // nikdy nepripomenul (tak zostal prázdny týždeň 17. 8.). S väčším rozsahom
  // by sa zas nakopil stĺpec starých riadkov, čo je presne tá tapeta, ktorej
  // sa celý modul vyhýba.
  const tw = weekKey(dnes.toISOString());
  // Pondelok o týždeň skôr. Počíta sa v UTC z UTC polnoci, takže sa cez
  // zmenu času neposunie o deň.
  const twMinuly = weekKey(new Date(Date.parse(`${tw}T00:00:00Z`) - 7 * 86400_000).toISOString());
  for (const p of PEOPLE) {
    const kto = p === "jerry" ? "Jerry" : "Terezka";
    const mam = (k: string) => String((weeks[k] || {})[`${p}_score`] ?? "").trim() !== "";
    const vyplneny = mam(tw);
    out.push({
      id: `tyzden-${tw}-${p}`,
      druh: "tyzden",
      nadpis: "Zapíš týždennú únavu",
      detail: vyplneny
        ? "Tento týždeň máš zapísaný."
        : "Náročnosť týždňa 1–10 (1 = ľahký, 10 = veľmi ťažký), odtrénované hodiny a poznámka — kým to máš v hlave. V pondelok si to už nikto nepamätá. Klik otvorí rovno tento týždeň.",
      // Bez týždňa dopadol klik na zoznam a človek si musel nájsť riadok sám.
      ciel: { tab: "treningy", sub: "prehled", tyzden: tw },
      trener: kto,
      splatne: !vyplneny && den >= 5,
      hotove: vyplneny,
    });
    const vyplnenyMinuly = mam(twMinuly);
    out.push({
      id: `tyzden-${twMinuly}-${p}`,
      druh: "tyzden",
      nadpis: "Chýba únava za minulý týždeň",
      detail: vyplnenyMinuly
        ? `Týždeň ${weekLabel(twMinuly)} máš zapísaný.`
        : `Týždeň ${weekLabel(twMinuly)} zostal bez hodnotenia. Toto je posledná pripomienka — v pondelok sa už nevráti. Klik otvorí rovno ten týždeň.`,
      ciel: { tab: "treningy", sub: "prehled", tyzden: twMinuly },
      trener: kto,
      tichyKedHotovy: true,
      splatne: !vyplnenyMinuly,
      hotove: vyplnenyMinuly,
    });
  }

  // ── Mesačný ─────────────────────────────────────────────────────────────
  // Uzávierka je prvý víkend nasledujúceho mesiaca — ale pripomienka NEZHASÍNA
  // kalendárom, iba zápisom. Prvá verzia zhasla po tom víkende a presne to sa
  // stalo: 4. augusta odznak zmizol, hoci júl bol stále prázdny. Pripomienka,
  // ktorá zmizne skôr než práca, je horšia než žiadna — tvári sa, že je
  // hotovo. Jeden trvalý riadok za jeden chýbajúci mesiac nie je tapeta.
  const minuly = new Date(dnes.getFullYear(), dnes.getMonth() - 1, 1);
  const mk = mesiacKluc(minuly);
  const zapis = monthNotes[mk];
  // Mesiac je zapísaný, keď naň odpovedal ČLOVEK.
  //
  // Fakty, ktoré do poznámky zapíše Jarvis cez kroniku ("Radek Baláž sa stal
  // majiteľom priestoru"), sú užitočné, ale nie sú uzávierka — a keďže sa
  // ukladajú do toho istého poľa, jeden takýto riadok by pripomienku zhasol a
  // Jerry by otázky mesiaca nikdy nezodpovedal. Kronikové riadky sa preto
  // z kontroly vynímajú podľa podpisu, ktorý si za sebou nechávajú.
  const ludskaPoznamka = (zapis?.note || "")
    .split("\n")
    .filter((r) => !/\(zapísal Jarvis \d{4}-\d{2}-\d{2}\)\s*$/.test(r.trim()))
    .join("")
    .trim();
  const maMesiac = !!(zapis && (ludskaPoznamka || Object.values(zapis.answers || {}).some((v) => String(v).trim())));
  // Odpovedať na otázky mesiaca má zmysel až nad úplnými číslami. Kým chýba
  // banka alebo PTminder, odpoveď by sa písala k neúplnému mesiacu a musela by
  // sa prepisovať — pripomienka preto čaká, kým sú doklady nahraté, a dovtedy
  // hovorí, čo chýba. Bez `doklady` (staré volania) sa správa ako predtým.
  const chybaju = doklady?.chybaju ?? [];
  const mozeZapisovat = chybaju.length === 0;
  out.push({
    id: `mesiac-${mk}`,
    druh: "mesiac",
    nadpis: "Mesačná uzávierka",
    detail: maMesiac
      ? `Mesiac ${mk} je zapísaný.`
      : mozeZapisovat
        ? `Mesiac ${mk} má nahraté všetky doklady, ale nie sú zodpovedané otázky mesiaca. Klik otvorí rovno ne.`
        : `Mesiac ${mk} ešte nemá zápis. Najprv treba doplniť: ${chybaju.join(", ")}.`,
    ciel: mozeZapisovat
      ? { tab: "vysledky", sub: "mesacne", mesiac: mk }
      : { tab: "udaje" },
    splatne: !maMesiac,
    hotove: maMesiac,
  });

  // ── Kvartálny ───────────────────────────────────────────────────────────
  // Len v prvých desiatich dňoch po skončení kvartálu a s najnižšou
  // naliehavosťou — Jerry sám hovorí, že kvartál ho zaujíma najmenej.
  const mesiac = dnes.getMonth();
  const poKvartali = mesiac % 3 === 0 && denVMesiaci <= 10;
  const kvartal = `Q${Math.floor(((mesiac + 11) % 12) / 3) + 1}`;
  out.push({
    id: `kvartal-${dnes.getFullYear()}-${kvartal}`,
    druh: "kvartal",
    nadpis: `Kvartálny pohľad ${kvartal}`,
    detail: "Prejdi ciele a KPI za kvartál — čo sa pohlo a čo sa nepohlo.",
    ciel: { tab: "vysledky", sub: "kvartalne" },
    splatne: poKvartali,
    hotove: false,
  });

  // ── Mesačné kontroly po oblastiach ──────────────────────────────────────
  //
  // Revízia 27. 8. 2026 našla chyby, ktoré vznikali mesiace (lievik ukazoval
  // 100 % namiesto 79 %) — a Jerry sa spýtal, ako často také kontroly robiť
  // a či mu ich appka nemá pripomínať sama. Toto je odpoveď: každá oblasť
  // RAZ MESAČNE, rozložené po týždňoch, aby nesvietili štyri naraz.
  //
  // Zhasína sa cez register (kľúč nesie mesiac, ďalší mesiac sa vráti sama).
  // Detail je rovno kontrolný zoznam — nie odkaz na dokument, ktorý by si
  // človek musel hľadať. Plné prompty pre hlbšiu kontrolu s Claudom sú
  // v repe: docs/kontrolne-prompty.md; kvartálna úplná revízia
  // docs/revizny-prompt.md.
  const tyzdenVMesiaci = Math.min(4, Math.ceil(denVMesiaci / 7));
  const KONTROLY: { tyzden: number; id: string; nadpis: string; detail: string; ciel: Ritual["ciel"] }[] = [
    {
      tyzden: 1, id: "peniaze", nadpis: "Mesačná kontrola: Peniaze",
      detail: "Tri otázky Jarvisovi a porovnaj s obrazovkou: tržby a zisk uzavretého mesiaca (musia sedieť na korunu s Peniaze → Zisky), rezerva a koľko chýba do cieľa (dátum stavu účtu nesmie byť starší než mesiac), dlh z výplat a jeho tempo. Keď sa dve čísla líšia, je to nález — nie zaokrúhlenie.",
      ciel: { tab: "vzas", sub: "pnl" },
    },
    {
      tyzden: 2, id: "klienti", nadpis: "Mesačná kontrola: Klienti & register",
      detail: "Prejdi otvorené notifikácie a pri každej si odpovedz: je pravdivá? Falošný poplach je chyba rovnakej váhy ako zmeškaný — nahlás ho Claudovi. Over odmlčaných proti realite a či niekto v zozname nechýba (klient, o ktorom vieš, že prestal, a appka mlčí).",
      ciel: { tab: "tracker", sub: "klienti" },
    },
    {
      tyzden: 3, id: "marketing", nadpis: "Mesačná kontrola: Marketing",
      detail: "Lievik: klikni na každé číslo a over mená (číslo bez mien sa nedá overiť). Percentá musia byť z tej istej skupiny ľudí — nič nad 100 %. V karte Čo publikovať ďalej odklepni hotové. Dopyty: každý má zdroj a dôvod, prečo z neho nebol klient.",
      ciel: { tab: "marketing", sub: "lievik" },
    },
    {
      tyzden: 4, id: "jarvis", nadpis: "Mesačná kontrola: Jarvis & dáta",
      detail: "Polož Jarvisovi tri otázky, na ktoré poznáš odpoveď z obrazovky (tržby mesiaca, posledné sedenie konkrétneho klienta, niečo z prázdnej tabuľky) — musí sedieť, a pri prázdnej tabuľke povedať „nemerali sme“, nie si vymýšľať. Over vek importov v záložke Upload: PTminder a Instagram nemajú byť staršie než dva týždne.",
      ciel: { tab: "jarvis" },
    },
  ];
  for (const k of KONTROLY) {
    out.push({
      id: `kontrola-${k.id}-${mesiacKluc(dnes)}`,
      druh: "kontrola",
      nadpis: k.nadpis,
      detail: k.detail,
      ciel: k.ciel,
      splatne: tyzdenVMesiaci === k.tyzden,
      hotove: false,
    });
  }

  return out;
}
