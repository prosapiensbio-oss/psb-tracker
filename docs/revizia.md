# Revízia Kokpitu — prompt

Skopíruj celé nižšie. Aktualizované 14. 8. 2026.

Prompt sa mení podľa toho, čo sa naposledy pokazilo — starý obsahoval ešte
návrh na prekopanie záložiek z júla, ktorý sa medzitým vyriešil, a nevedel
o rodine chýb, ktorá nás stála 13. a 14. augusta celý deň (ticho zlyhávajúci
zápis). Keď nájdeš novú rodinu chýb, dopíš ju sem, nie do jednorazovej správy.

---

Sprav kompletnú revíziu Kokpitu. Postupuj v tomto poradí a nižšiu prioritu
nezačínaj, kým vyššia nie je hotová.

**1 · Peniaze.** Prejdi každý výpočet, ktorý sa dotýka koruny: tržby
z PTmindera, náklady z Fio, hotovosť zo zošita, faktúry, platby a nákupy
v BTC, výplaty, nároky, dlhy, break-even, P&L, predikcie. Pri každom čísle
over, odkiaľ pochádza a či sa niekde nezapočítava dvakrát alebo vôbec.
Zvlášť si všímaj miesta, kde jeden zdroj závisí od druhého (faktúra ↔ platba,
zošit ↔ banka, BTC ↔ P&L) — tam vznikajú tiché diery.

**2 · Čísla, ktoré merajú niečo iné, než tvrdí ich nadpis.** Toto je najčastejšia
chyba v tejto appke — za tri dni sa ich našlo trinásť a ani jednu nenašiel test.
Pri každej metrike na obrazovke over, či čitateľ a menovateľ počítajú tú istú
skupinu ľudí nad tým istým obdobím. Konkrétne prípady, ktoré tu už boli:
podiel nad 100 %; „cena za dopyt" delená konverziami z Mety namiesto dopytmi;
konverzia 100 %, lebo podmienka bola splniteľná automaticky; veta napísaná
natvrdo, ktorá prežila dáta, čo ju vyvrátili.

**3 · Zápisy, ktoré ticho zlyhajú.** Nájdi každé miesto, kde sa niečo ukladá,
a over celú reťaz: stĺpec v databáze existuje · migrácia bola spustená (ne­púšťajú
sa samy) · pole je v zozname povolených v API · funkcia vracia úspech, nie
`void` · obrazovka hlási „uložené" až po ňom. Optimistický zápis, ktorý zamlčí
chybu, je horší než chyba.

**4 · Jedna definícia na dvoch miestach.** Nájdi výpočty, ktoré existujú
dvakrát — raz v obrazovke, raz v registri alebo v Jarvisovom kontexte.
Keď sa rozídu, appka si bude protirečiť a nikto nebude vedieť, ktoré číslo
platí. Tu už boli: definícia klienta, hranica pauzy, okno mesiacov, kotva dát.

**5 · Reťazce premenných.** Nájdi premenné, ktoré ovplyvňujú iné, a over, že
zmena na vstupe sa premietne až na koniec. Najmä tam, kde sa niečo prepočíta
mimo Reactu a obrazovka o tom nevie.

**6 · Prekliky.** Otestuj každý odkaz, „Otvoriť", „Vybaviť", každý krok
uzávierky a každú položku registra. Nestačí, že sa dostanem na správnu
obrazovku — musí sa otvoriť konkrétny riadok, mesiac alebo týždeň, o ktorom
to upozornenie hovorí.

**7 · Jarvis.** Over vecnú správnosť odpovedí na finančné otázky; či pozná
kľúče registra; či neodpovedá z prázdnych dát; či dodržiava dĺžku; či jeho
akcie zapisujú to, čo tvrdia. **A osobitne:** či schéma databázy, ktorú
dostáva (`SCHEMA_DB` v `chat.ts`), sedí so skutočnými stĺpcami — je to
samostatná kópia a nevie sa spýtať na to, o čom nevie.

## Ako pracovať

- **Netvrď, over.** Každý nález doloži konkrétnym číslom, riadkom kódu alebo
  dopytom do databázy. Ak si niečím nie si istý, napíš to — odhad označený ako
  odhad je užitočný, odhad vydávaný za fakt nie.
- **Prázdna odpoveď nie je dôkaz.** Keď dopyt nič nevráti, over najprv názvy
  stĺpcov (`pragma_table_info`). Obzvlášť keď záver odporuje tomu, čo Jerry
  hovorí zo skúsenosti — appku používa denne.
- **Zelený build nie je dôkaz.** Po nasadení preklikaj appku naživo. Ak sa
  niečo nedá overiť klikaním, povedz to namiesto tvrdenia, že to funguje.
- **Pozor na kód, ktorý predpokladá, že dáta siahajú tam, kam siaha kalendár.**
  Táto rodina chýb sa tu opakovala päťkrát.
- **Zásah do reálnych finančných dát mi najprv ukáž.** Opravy v kóde nasadzuj;
  prepisovanie mojich čísel nie.

## Čo napíš na konci — v tomto poradí, nie ako súvislý text

1. **Nájdené chyby**, zoradené podľa dopadu na peniaze. Pri každej: čo je zle,
   o koľko korún ide, či si to opravil, a ako si to viem overiť.
2. **Čo vyžaduje moje rozhodnutie** — kde nevieš, ktorá možnosť je správna.
3. **Čísla, ktoré sa nedajú overiť očami.** Metrika, pod ktorú sa nedá kliknúť
   a uvidieť mená alebo riadky, je nebezpečná aj keď je správna — nikto si
   nevšimne, keď sa pokazí. Toto je dôležitejšie než zoznam chýb.
4. **Redundancie** — čo je v appke dvakrát, čo nikto nepoužíva, čo sa dá
   zmazať bez straty.
5. **Návrhy na zlepšenie**, každý s odhadom práce a s tým, čo reálne ušetria.
   Ak si čítal štúdie alebo cudzie riešenia, uveď zdroj — bez zdroja je to tvoj
   názor a ten mi povedz tiež, ale označ ho tak.
6. **Čo si NEspravil a prečo.**

Appka má fungovať ako prístroje v lietadle: na jeden pohľad vidím, čo sa deje
vnútri aj vonku, a farbu má len to, čo sa vymklo. Ak niečo tomu bráni, povedz
to, aj keď to znamená vyhodiť niečo, čo sme spolu postavili.

---

## Test Jarvisa — samostatne

Pusti test podľa `docs/test-jarvisa.md`. Ku každej numerickej otázke si najprv
vytiahni správnu odpoveď z databázy, aby si mal proti čomu merať — nehodnoť
„znie to rozumne". Výsledky zhrň po kategóriách a oddeľ CHYBU od CHÝBAJÚCEJ
FUNKCIE. Nič neklikaj.
