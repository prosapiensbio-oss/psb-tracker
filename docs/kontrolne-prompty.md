# Kontrolné prompty — mesačné kontroly po oblastiach

Pripomienky sa objavujú samy v registri (modré, jedna oblasť na týždeň
v mesiaci). Krátky kontrolný zoznam nesie samotná pripomienka; toto sú PLNÉ
prompty na hlbšiu kontrolu s Claudom (vlož do Claude Code v repe appky).
Kvartálna úplná revízia: `docs/revizny-prompt.md`.

## 1. týždeň — Peniaze

> Over peniaze v Kokpite proti databáze. Tržby uzavretého mesiaca z tabuľky
> payments (SUM amount_czk) musia na korunu sedieť s Peniaze → Zisky aj
> s Jarvisovou odpoveďou na tú istú otázku. Over, že rezerva používa zostatok
> z posledného výpisu (fio_zostatok) a že dátum na dlaždici nie je starší než
> posledný import. Skontroluj dlh z výplat: číslo na obrazovke = Jarvisovo
> číslo. Každý rozdiel dolož dopytom, nie okom.

## 2. týždeň — Klienti & register

> Spusti ./scripts/naostro.sh a prejdi výstup. Pri každej otvorenej
> notifikácii over na živých dátach, či je pravdivá — falošný poplach je
> chyba rovnakej váhy ako zmeškaná. Skontroluj odmlčaných proti sessions
> (posledné sedenie + počet dní jednou funkciou daysBetween) a či nechýba
> klient, ktorý prestal chodiť a appka mlčí.

## 3. týždeň — Marketing

> Over lievik: každé percento musí mať čitateľa, ktorý je podmnožinou
> menovateľa (kohorta, nie dve rôzne množiny) — prepočítaj dopyt→úvodný
> nezávisle cez leads×sessions s normalizáciou mien. Klikni na každé číslo
> a over mená. V „Čo publikovať ďalej" over, či odklepnuté veci nezmizli zo
> zoznamu potichu a či ich vidí aj Jarvis (uzHotove).

## 4. týždeň — Jarvis & dáta

> Porovnaj SCHEMA_DB v chat.ts so skutočnými stĺpcami (pragma_table_info
> tabuľka po tabuľke) — obzvlášť stĺpce pridané od poslednej kontroly.
> Polož Jarvisovi tri otázky s odpoveďou známou z obrazovky a jednu nad
> prázdnou tabuľkou (musí priznať prázdno). Over vek importov: PTminder,
> Fio, IG, GA4/GSC, web_stranky (cron 3:30 — má byť z dneška).
