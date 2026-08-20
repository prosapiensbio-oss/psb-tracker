# Revízny prompt Kokpitu

Optimalizovaná verzia z 20. 8. 2026 — pôvodný prompt z revízie 19. 8. doplnený
o ponaučenia z nej (čítanie odpovedí pred nálezmi, kópie pravdy mimo DB,
falošné poplachy kontrol, zmluvné zoznamy, re-test po oprave).

---

Sprav kompletnú revíziu Kokpitu. Postupuj v poradí; nižšiu prioritu nezačínaj,
kým vyššia nie je uzavretá. Pri každej priorite najprv vypíš zoznam miest,
ktoré preveríš — ten zoznam je zmluva: čo si z neho nestihol, patrí na koniec
do „Čo som nespravil".

PRED PRVÝM NÁLEZOM

- Prečítaj odpovede, ktoré už existujú: anomaly_ack, month_notes,
  jarvis_zavery, pamäť registra, docs/. Nález, ktorý som ti už raz vysvetlil,
  nie je nález — je to dôkaz, že si nečítal.
- Zisti stav dát: posledné importy (PTminder, Fio, Meta, GA4) a kde končí
  kotva dát. Nález na zastaraných dátach najprv over na čerstvých.
- Prečítaj CLAUDE.md — sú tam pasce, na ktoré sa už doplatilo. Neobjavuj ich
  znova.

1 · PENIAZE. Každý výpočet, ktorý sa dotýka koruny: tržby z PTmindera, náklady
z Fio, hotovosť, faktúry, BTC, výplaty, nároky, dlhy, break-even, P&L,
predikcie. Pri každom čísle: odkiaľ pochádza, či sa nezapočítava dvakrát alebo
vôbec. Zvlášť miesta, kde jeden zdroj závisí od druhého (faktúra ↔ platba,
zošit ↔ banka, BTC ↔ P&L) — tam vznikajú tiché diery. Kde existujú dve kópie
toho istého čísla, over ich rovnosť dopytom, nie okom.

2 · ČÍSLA, KTORÉ MERAJÚ NIEČO INÉ, NEŽ TVRDÍ NADPIS. Najčastejšia chyba appky.
Pri každej metrike over, či čitateľ a menovateľ počítajú tú istú skupinu ľudí
nad tým istým obdobím. Už tu boli: podiel nad 100 %; cena za dopyt delená
konverziami namiesto dopytov; konverzia 100 % zo splniteľnej podmienky; veta
natvrdo, ktorá prežila dáta.

3 · ZÁPISY, KTORÉ TICHO ZLYHAJÚ. Pri každom ukladaní over celú reťaz: stĺpec
existuje · migrácia spustená · pole povolené v API · funkcia vracia úspech,
nie void · „uložené" sa hlási až po ňom. Zápisové akcie testuj end-to-end
vlastným testovacím záznamom — a po sebe ho zmaž.

4 · JEDNA DEFINÍCIA NA VIACERÝCH MIESTACH. Definície nežijú len v kóde
obrazoviek. Kópie tej istej pravdy sú aj v registri, v Jarvisovom kontexte
(aiContext), v statických textoch (zamerania.ts, marketing-onboarding.md
a ďalšie súbory v PSB_KNOWLEDGE), v jarvis_vedomosti a v pamäti Claude
Projectu. Fakt, ktorý sa zmenil, oprav vo VŠETKÝCH kópiách a pri náleze vypíš,
ktoré kópie si menil.

5 · REŤAZCE PREMENNÝCH. Zmena na vstupe sa musí premietnuť až na koniec —
najmä tam, kde sa počíta mimo Reactu a obrazovka o tom nevie.

6 · KONTROLY, KTORÉ SVIETIA NA NESPRÁVNYCH ĽUDÍ. Pri každej kontrole
v registri spočítaj na živých dátach, koľko z aktuálnych upozornení je
pravdivých. Kontrola s falošnými poplachmi je horšia než žiadna — naučí ma
upozornenia ignorovať. Falošný poplach je chyba rovnakej váhy ako zmeškaná.

7 · PREKLIKY. Každý odkaz, „Otvoriť", „Vybaviť", krok uzávierky, položka
registra — naživo v prehliadači. Nestačí správna obrazovka; musí sa otvoriť
konkrétny riadok, mesiac alebo týždeň, o ktorom upozornenie hovorí.

8 · JARVIS. Polož mu naživo otázky naprieč oblasťami a over vecnú správnosť
odpovedí proti dátam. Osobitne: či necituje zdroj, ktorý v rozhovore nečítal;
či neodpovedá z prázdnych dát; či SCHEMA_DB sedí so skutočnými stĺpcami (je to
ručná kópia); či jeho akcie zapisujú to, čo tvrdia. Keď hovorí niečo iné než
obrazovka, nájdi, z ktorej kópie pravdy to má — má ich viac než databázu.

9 · AKTUÁLNOSŤ MINULÝCH NASADENÍ. Vyber vzorku vecí nasadených v minulosti —
texty, briefy, kontroly, dokumenty — a over, či ešte hovoria pravdu. Statický
text zapečený v builde nestarne v databáze, ale starne.

AKO PRACOVAŤ

- Netvrď, over. Každý nález doloží číslo, riadok kódu alebo dopyt. Nález over
  dvoma nezávislými cestami (číslo + kód, alebo kód + živý klik) — radšej päť
  istých než pätnásť možných. Odhad označ ako odhad.
- Prázdna odpoveď nie je dôkaz — v databáze ani v repe. Keď dopyt nič nevráti,
  over názvy stĺpcov; keď v DB nič nie je, grepni kód — statické súbory sú
  tiež zdroj pravdy. Obzvlášť keď záver odporuje mojej skúsenosti — appku
  používam denne.
- Zelený build nie je dôkaz, úspešný deploy tiež nie. Nasadzuj len cez
  ./scripts/nasad.sh a po nasadení preklikaj naživo. Čo sa nedá overiť
  klikaním, označ ako neoverené — netvrď, že funguje.
- Pri každom náleze rozlíš: chyba v kóde / zastaraný text / moje nepochopenie
  procesu. Každé sa opravuje inde a inak.
- Keď niečo opravíš, zopakuj presne ten test, ktorý chybu našiel. Oprava bez
  re-testu nie je oprava.
- Pozor na kód, ktorý predpokladá, že dáta siahajú tam, kam kalendár.
- Zásah do reálnych finančných dát mi najprv ukáž. Opravy v kóde nasadzuj;
  prepisovanie mojich čísel nie.

ČO NAPÍŠ NA KONCI — v tomto poradí, nie ako súvislý text

1. Chyby podľa dopadu na peniaze. Pri každej: čo je zle, o koľko korún ide,
   opravené áno/nie, ako si to overím, ktoré kópie pravdy sa menili.
2. Čo vyžaduje moje rozhodnutie.
3. Čísla, ktoré sa nedajú overiť očami — metrika bez prekliku na mená a riadky
   je nebezpečná, aj keď je správna.
4. Redundancie — čo je dvakrát, čo nikto nepoužíva, čo sa dá zmazať bez
   straty.
5. Návrhy na zlepšenie s odhadom práce a úžitku; cudzie riešenia so zdrojom,
   vlastný názor označený ako názor.
6. Čo si NEspravil a prečo — vrátane položiek zo zmluvných zoznamov priorít.

Appka má fungovať ako prístroje v lietadle: na jeden pohľad vidím, čo sa deje
vnútri aj vonku, a farbu má len to, čo sa vymklo. Ak niečo tomu bráni, povedz
to, aj keď to znamená vyhodiť niečo, čo sme spolu postavili.
