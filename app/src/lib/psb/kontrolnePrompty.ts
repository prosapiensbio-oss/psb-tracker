/**
 * Prompty pre mesačné kontroly po oblastiach.
 *
 * ZDROJ PRAVDY je tento súbor — `docs/kontrolne-prompty.md` na neho len
 * ukazuje. Keď prompt žil na dvoch miestach, jedna kópia zostarla (rovnaká
 * pasca ako tvar zadania pre Claude Project, viď CLAUDE.md).
 *
 * Register pri každej mesačnej kontrole ponúka „Skopírovať prompt" —
 * skopíruje PROTOKOL + prompt oblasti a Jerry ho vloží do Claude Code.
 */

/**
 * Spoločná časť. Toto je to, čo z revízneho promptu robí revíziu a nie
 * prehliadku: pravidlá, ako sa nález overuje a ako sa hlási. Bez nej sa
 * kontrola zvrhne na „vyzerá to v poriadku".
 */
export const PROTOKOL = `AKO PRACOVAŤ (platí pre celú kontrolu)

- Najprv si prečítaj, čo som už raz odpovedal: anomaly_ack, month_notes,
  jarvis_zavery, docs/ a CLAUDE.md. Nález, ktorý som ti už vysvetlil, nie je
  nález.
- Zisti vek dát skôr než začneš (posledné importy, kde končí kotva dát).
  Nález na zastaraných dátach over na čerstvých.
- Netvrď, over. Každý nález doloží číslo, riadok kódu alebo dopyt, a over ho
  DVOMA nezávislými cestami (číslo + kód, alebo kód + živý klik). Radšej dva
  isté nálezy než šesť možných. Odhad označ ako odhad.
- Prázdna odpoveď nie je dôkaz. Keď dopyt nič nevráti, over názvy stĺpcov;
  keď v DB nič nie je, grepni kód — statické súbory sú tiež zdroj pravdy.
- Pri každom náleze rozlíš: chyba v kóde / zastaraný text / moje nepochopenie
  procesu. Každé sa opravuje inde.
- Keď niečo opravíš, zopakuj presne ten test, ktorý chybu našiel. Oprava bez
  re-testu nie je oprava. Zelený build ani úspešný deploy nie sú dôkaz —
  nasadzuj cez ./scripts/nasad.sh a preklikaj naživo.
- Zásah do reálnych finančných dát mi najprv ukáž. Opravy v kóde nasadzuj;
  prepisovanie mojich čísel nie.
- Na konci napíš, čo si NEspravil a prečo.`;

export const PROMPTY_KONTROL: Record<string, { nadpis: string; telo: string }> = {
  peniaze: {
    nadpis: "Mesačná kontrola — PENIAZE",
    telo: `Over peniaze v Kokpite proti databáze. Nie „prejdi peniaze" — toto sú
miesta, kde tu už chyby boli:

1. Tržby uzavretého mesiaca: SUM(amount_czk) z payments musí na korunu sedieť
   s Peniaze → Zisky AJ s Jarvisovou odpoveďou na tú istú otázku. Tri kópie,
   jedna pravda.
2. Rezerva: používa zostatok z posledného výpisu (fio_zostatok), nie ručné
   číslo? Nie je dátum na dlaždici starší než posledný import? Sedí súčet
   účet + hotovosť + BTC s číslom na dlaždici?
3. Miesta, kde jeden zdroj závisí od druhého — faktúra ↔ platba, zošit ↔
   banka, BTC ↔ P&L. Tam vznikajú tiché diery: suma, ktorá je dvakrát, alebo
   nie je vôbec. Pri každom páre over dopytom, či počty sedia.
   POZOR na falošný poplach, oba smery sú normálny stav a NEHLÁSIA sa:
   platba BEZ nového balíčka (členstvo sa zakladá až od prvého tréningu
   nového cyklu, ktorý ešte nemusí byť dohodnutý) aj balíček BEZ platby
   (balíček sa nahodí hneď, klient z neho čerpá, faktúra dobehne — preto je
   ten istý človek naraz v „Balíček dojde…" aj v „Nezaplatené").
   Viď prevadzka.md, oddiel 12c.
4. Dlh z výplat a jeho tempo: číslo na obrazovke = Jarvisovo číslo.
5. Break-even a predikcia: z akého obdobia sa počítajú a či to obdobie ešte
   existuje v dátach (kotva dát, nie kalendár).

Každý rozdiel dolož dopytom, nie okom. Rozdiel v zaokrúhlení je tiež rozdiel —
povedz, z čoho vzniká.`,
  },
  klienti: {
    nadpis: "Mesačná kontrola — KLIENTI & REGISTER",
    telo: `Spusti ./scripts/naostro.sh a prejdi výstup nad živými dátami.

1. Pri KAŽDEJ otvorenej notifikácii over, či je pravdivá. Spočítaj, koľko
   z aktuálnych upozornení je falošných, a to číslo mi napíš. Falošný poplach
   je chyba rovnakej váhy ako zmeškaná — naučí ma upozornenia ignorovať.
2. Odmlčaní: over proti sessions (posledné sedenie a počet dní musí počítať
   jedna funkcia — daysBetween). Karta klienta a notifikácia nesmú hovoriť
   iný počet dní.
3. Opačný smer: chýba niekto? Nájdi klientov, ktorí prestali chodiť a appka
   o nich mlčí — dopytom nad sessions, nie cez appku.
4. Register: ostali otvorené položky staršie než dva mesiace? Buď sú
   nepravdivé, alebo sa nedajú vybaviť — obe sú nález.
5. Fluktuácia a počet aktívnych klientov: sedí s tým, čo vidím v Klientoch?`,
  },
  marketing: {
    nadpis: "Mesačná kontrola — MARKETING & WEB",
    telo: `1. Lievik: každé percento musí mať čitateľa, ktorý je PODMNOŽINOU
   menovateľa (tá istá kohorta ľudí nad tým istým obdobím) — nie dve rôzne
   množiny. Prepočítaj dopyt→úvodný a úvodný→klient nezávisle cez leads ×
   sessions s normalizáciou mien a porovnaj s obrazovkou. Nič nad 100 %,
   a rovnako podozrivé je presných 100 %.
2. Klikni na každé číslo a over mená. Metrika bez prekliku na mená je
   nebezpečná, aj keď je správna.
3. „Čo publikovať ďalej": odklepnuté veci sa nesmú vrátiť na zoznam a musí
   ich vidieť aj Jarvis (uzHotove v aiContext). Over, že návrhy nevznikajú
   z dát, ktoré už neplatia.
4. Dopyty: každý má zdroj a dôvod, prečo z neho nebol klient. Chýbajúci zdroj
   je diera v meraní, nie prázdne políčko.
5. Web: import web_stranky má byť z dneška (cron 3:30). Over, že články
   odklepnuté ako hotové sedia s tým, čo je naozaj publikované na
   prosapiens.cz, a že sa nový článok objavil v dátach sám.`,
  },
  jarvis: {
    nadpis: "Mesačná kontrola — JARVIS & DÁTA",
    telo: `1. SCHEMA_DB v src/routes/api/chat.ts je RUČNÁ kópia schémy. Porovnaj ju
   so skutočnosťou (pragma_table_info tabuľka po tabuľke) — obzvlášť stĺpce
   pridané od poslednej kontroly. Chýbajúci stĺpec = Jarvis o dátach nevie.
2. Polož mu tri otázky s odpoveďou známou z obrazovky (tržby mesiaca,
   posledné sedenie konkrétneho klienta, rezerva) a jednu nad prázdnou
   tabuľkou — pri prázdnej musí povedať „nemerali sme", nie si vymyslieť.
3. Keď hovorí niečo iné než obrazovka, nájdi, z KTOREJ kópie pravdy to má:
   aiContext, jarvis_vedomosti, statické súbory v PSB_KNOWLEDGE, pamäť
   Claude Projectu. Má ich viac než databázu — a starnú nezávisle.
4. Vek importov (záložka Upload): PTminder, Fio, Instagram, GA4/GSC,
   web_stranky. Nič staršie než dva týždne bez vysvetlenia.
5. Jarvisove akcie: over, že zapisujú to, čo tvrdia — jednou akciou na
   testovacom zázname, ktorý po sebe zmažeš.`,
  },
};

/** Celý text na skopírovanie: protokol + oblasť. */
export function promptKontroly(id: string): string | null {
  const p = PROMPTY_KONTROL[id];
  if (!p) return null;
  return `${p.nadpis}\n\n${p.telo}\n\n${PROTOKOL}`;
}
