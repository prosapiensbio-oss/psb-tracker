# Chyby v Kokpite — čo Jerry našiel a čo sa našlo za ním

Zostavené 21. 10. 2026 z 3 902 Jerryho správ v 90 konverzáciách (28. 7. – 21. 10. 2026).
Vybralo sa 887 správ, kde niečo nesedelo, a z nich ~190 rôznych chýb. Nižšie sú
zoradené podľa DRUHU — lebo to, čo Jerry nachádzal náhodou, sa opakovalo vo
vzoroch, a vzor sa dá hľadať aj tam, kde ho ešte nikto nevidel.

Stav „opravené" sa opiera o CLAUDE.md a pamäť (tam sú opravy zapísané s dátumom).
Kde sa to nedá doložiť, je „neoverené".

## 1. Dva zdroje, dve pravdy (najčastejšie — ~45 hlásení)

PTminder vs. kalendár vs. Kokpit, profil vs. zoznam, obrazovka vs. Jarvis.

- Cena za sedenie 1 048 / 841, rezerva 1,0 / 1,2 mes., výplata 72k / 70k, BTC −3 % / −8 %
- Hanus −3 vs −1 (karta, zoznam, odkaz klientovi) — opravené 3.–4. 10. (jedno číslo `packageRemaining`)
- Vaško balíček 6 990 dvakrát (Kokpit + PTminder) — opravené 5. 10. (`dlhyKlientov`)
- 8 klientov: karta ≠ zoznam hodín (Stoklasková, Gerich, Broskva, Krčmar…) — opravené 5.–6. 10.
- Kouřil, Vopalenský, Kadličková, Khamaziuk o 1–3 h menej ako PTminder — opravené 6. 10. (história z PTmindera)
- Tržby 232 967 vs 324 849 (chýbal zošit, BTC, „other") — prepínač „peniaze z Kokpitu" len pri sedení mesiaca
- Notifikácie nečítali kalendár (Matlová „16 dní", Pavlík „ozvi sa", Hanus 3. 9.) — opravené 31. 8.
- **Vzor:** to isté číslo sa počítalo na dvoch miestach. Liek: jedna funkcia v `lib/psb`, obrazovka aj Jarvis ju volajú.

## 2. Ticho — klik bez účinku, uložené a stratené (~40)

- „+ hotovostná platba" nič, „Zobraziť skryté" nič, faktúra Terezky Janke nič, „Vložiť fotku" nič
- Koncept zaraďovania zmizol / zasekol sa, únava zmazaná po „vyplniť", Jarvisove konverzácie stratené
- Rozrobené fotky prepísané (Baláž zozadu, Hanus) — opravené 15. a 20. 10.
- Kopírovanie do Higgsfieldu (promise visel) — opravené 28. 8. (`doSchranky`)
- **Vzor:** `catch` alebo `.catch(() => [])`, ktorý z chyby spraví prázdno. Liek: chyba sa ukáže, prázdno nie je odpoveď.

## 3. Identita a mená (~25)

- Štigut/Stigut, Križová ×2 profily, Marketa Resnerová/Lozias, „Monika", Kalva, Jana Malinová
- Sofia Broskvová = Resnerová, Přinosilovci (faktúra na mamu), Pavlík/Jakubiček, Dan+Monika jedným prevodom
- Kateřina vedená pod Richardom, Matlovci — **Albert ↔ Richard 21. 10.** (pravidlo mena pre celý názov)
- „Jarek" zo zošita naučený na Heinricha — opravené 5. 10.
- **Vzor:** meno ako reťazec; pravidlo naučené raz platí navždy a na všetko s tým názvom.

## 4. Pravidlo širšie, než malo byť (~15)

- Filter trénera Jerry/Terezka neplatil (5 výskytov 17. 8. – 23. 9.), Terezkini klienti u Jerryho
- „Na čo sa pozrieť" s filtrom Jerry ukazoval Doležalovú; narodeniny Natálie Terezke
- Zápis presunu 23 000 v zošite sa zapísal, hoci nebol označený
- Zmena klienta v okne udalosti prepísala všetky udalosti s tým názvom (Matl, 21. 10.)

## 5. Notifikácie (~30)

- Vybavené sa vracajú (Hanus 6M, Robin, „tie isté 3 dni"), únava 4×, „bol na tréningu?" záplava
- Presun hlásený ako zrušenie (Kadličková) — opravené („Presun nie je zrušenie")
- Preklik „Otvoriť" vedie inam (Klienti namiesto profilu, vrch Výsledkov)
- Stará „posledný pohyb v banke" pri nočnom Fio, reklamy po vyriešení s Jarvisom
- **Vzor:** kľúč odpovede sa viaže na niečo, čo sa mení; liek je `platneOd` (9. 10.).

## 6. Čas a okná (~15)

- UTC namiesto Prahy (appka „vo včerajšku" po polnoci) — opravené 5. 10.
- „Ozvali sme sa" 6 dní namiesto 0, týždne v grafe zle ohraničené, september s týždňom navyše
- Kontrola sa pýtala na rok 2024 (695 otázok) — opravené 1. 10.

## 7. Dvojité počítanie (~12)

- Výpis 848 246 namiesto 93 109, Jarek 6 000 v zošite aj v banke, Alza + BTC rozdelenie, BTC zľava dvakrát
- Rovnaké platby v jeden deň zahodené (export bez ID operace) — opravené 13. 9.

## 8. Mobil a rozloženie (~20)

- Workspace švih, profil sa nedá rolovať, kalendár na telefóne, `<datalist>` na iPade, priesvitné okná — opravené 28. 9. – 9. 10.

---

## Skryté chyby nájdené 21. 10. 2026 (hľadané podľa vzorov hore)

Hľadalo sa dvoma spôsobmi: kontroly nad ostrými dátami (súčasný stav) a audit kódu
(kde sa ten istý vzor môže zopakovať). Stav pri každom je na konci zostavy.

### V dátach (už sa prejavili)
1. **Albert ↔ Richard Matl** — pravidlo „Albert Matl" → Richard; Albertovi 21 dní „bez tréningu", Richardovi balíček 7 790 z cudzích hodín. Opravené, balíček zrušený.
2. **Linda Muth** — úvodný uložený ako tréning (tlačidlo „Je to on" posielalo vždy tréning) → 26. 10. by dostala balíček 6 h. Opravené.
3. **Veronika Stoklasková** — „…-online" sa nepripísal nikomu, tréning 20. 10. sa nepočítal. Opravené aj rozpoznávanie.
4. **Branislav Široký** — pravidlo celého mena s typom „úvodný" → každý ďalší tréning by bol úvodný za 1 100 bez hodiny. Opravené.

### V dátach (zatiaľ bez škody, ale čakalo to)
5. Tri fakturačné kontakty s viacerými klientmi (Benefit Management, Finance JK, Lenka Přinosilová) → prvá faktúra by vyrobila „klienta" s čiarkou v mene.
6. Kolízia v kalendári 28. 10. 7:30 — Natália aj Papiež (informatívne).

### V kóde (vzor sa môže zopakovať)
Zoznam a stav opráv: pozri commit z 21. 10. 2026 „Audit: skryté chyby…".

**Opravené v kóde 21. 10. 2026** (audit + oprava, kontrola profilov pred/po zhodná pre všetkých klientov):

| Čo | Kde |
|---|---|
| Pravidlo celého mena je vždy „tréning“; úvodný nesie značku na udalosti | nahodTrening.server.ts |
| Premapovanie mena neprepíše ručne nastavený druh ani klienta jednej udalosti | kalendar.ts (mapuj, mapujVela) |
| Zoznam známych klientov aj z balíčkov, kalendára a Client Listu (PTminder stojí) | znamiKlienti |
| Úvodný/tréning podľa dňa sa nájde aj pri inej podobe mena | klientOsCasu.ts, db.server.ts |
| Fakturačný kontakt s viacerými klientmi = výber, nie klient „A, B“ | platbyEvidencia.ts, platby.ts |
| Jeden pohyb v banke sa nedá celý priradiť druhému klientovi | platby.ts |
| Zlé naučené pravidlo platiteľa sa pri inom priradení nahradí/zmaže | platby.ts |
| Hromadné priradenie: chyba jednej položky nezastaví ostatné, všetko v audite | platby.ts |
| Najnovšia ľudská kategória pohybu vyhráva nad starými pravidlami | fio.ts |
| Zošit: keď sa nedá overiť duplicita, nič sa nezapíše | zosit.ts |
| Pôvodná fakturačná firma sa nestratí pri zmene odberateľa | vydane-faktury.ts |
| Premenovanie a zmazanie klienta pokrýva ~40 tabuliek; platby sa len rušia | premenuj.ts, client-delete.ts |
| Načítanie platieb/balíčkov/kalendára chybu nezhltne (inak „všetci dlžia“) | db.server.ts, App.tsx |
| Stránka klienta a mail hľadajú balíčky a tréningy aj pri inej podobe mena | osKlienta, obsahOdkazu, sedeniaZKalendara |
| Kontakt nového klienta: neuložený e-mail sa ukáže; balíčky nenačítané = varovanie | KlientStol.tsx |
| SMS krok neponúkne znova odoslanie, keď sa nedá overiť, komu SMS odišla | WorkspaceKroky.tsx |
| Deň podľa Prahy pri zmenách kalendára a dátume úhrady faktúry | kalendar.ts, vydane-faktury.ts |
