# Revízia Kokpitu — čo z nej zostáva

**Stav k 18. 8. 2026, večer.** Revízia bežala v poradí, ktoré si zadal.
**Hotové je všetko z revízie.** Nasadené (verzia 445), 615 testov.

Čo z nej zostáva otvorené, je nižšie v častiach 2–5.

---

## 0 · Preklikať naživo

Nasadené je všetko. Zelený build nie je dôkaz — zvlášť pri Kampaniach
a lieviku, kde sa menili definície klienta a okná období: čísla sa POHLI
zámerne a treba sa na ne pozrieť.

Nové prekliky na vyskúšanie:
- notifikácia „nedorazil nájom" → P&L sa otvorí NA TOM RIADKU (rozbalí sa,
  zvýrazní, odroluje) a Zapísané pohyby pod ním sa nafiltrujú na ten mesiac
- notifikácia „úvodný bez dopytu — Jana Malinová" → Dopyty s predvyplneným menom
- notifikácia „dvojitý zápis" → P&L + pohyby len tej kategórie a mesiaca

---

## 1 · Priority 6 a 7 — výsledok

### 6 · Prekliky — hotové
Ciele odkazov sedeli všetky (overené testom `prekliky.test.ts`, ktorý číta
producentov aj skutočné podzáložky zo zdrojáku). Zlyhávala druhá polovica:
- **P&L sa nedalo zamerať vôbec** — `PnlTab()` nebral parameter. Opravené.
- **Marketing sa nedal zamerať vôbec** — `navigate()` mu focus neodovzdával.
- Dvojitý zápis a nezhoda príjmov viedli na Údaje bez mesiaca. Opravené.

### 7 · Jarvis — hotové, s jednou výhradou
- **`SCHEMA_DB` proti skutočnosti: sedí.** Overených 32 tabuliek a 263
  stĺpcov proti `pragma_table_info` v produkčnej D1 — ani jeden stĺpec, ktorý
  Jarvis dostane, neexistuje len na papieri. Doplnené tri, ktoré mu chýbali:
  `payments.note`, `ga4_mesiace.organic_social` + `referral`,
  `mkt_kampane.stav` + `akcie`. Nový test `schema.test.ts` porovnáva schému
  s migráciami, takže sa už nemôže rozísť potichu.
- **Čísla v kontexte = čísla na obrazovke.** Break-even 138 977 Kč aj
  Ø hodín/týždeň 41,2 h sedia s dlaždicami do desatiny; register dostáva 29
  položiek aj s kľúčmi; pamäť odpovedí 28 viet.
- **Akcie zapisujú to, čo tvrdia** — po oprave z priority 3 hlásia aj neúspech.
- **Odpovede naživo — overené 18. 8. večer.** Prvá odpoveď na strategickú
  otázku mala 4 vety a 69 slov (strop päť viet). Predošlá výhrada („prehliadač
  ma na tú adresu nepustil") bola moja chyba: appka beží na
  `kokpit.prosapiensbio.workers.dev`, ja som skúšal adresu bez prefixu.

---

## 2 · Dvojité definície — HOTOVÉ

Všetkých osem zjednotených (18. 8. 2026 večer, verzia 441).

| Čo bolo dvakrát | Jedna definícia je teraz v |
|---|---|
| Break-even + kotva „posledný uzavretý mesiac" (4 kópie) | `rezerva.ts` — `breakEvenRad`, `poslednyUzavretyIdx` |
| Vyťaženie spolu (3 rôzne vzorce, 3 rôzne čísla) | `compute.ts` — `vytazenieSpolu` |
| Odtrénované mimo exportu (2 kópie v jednom súbore) | `Kalendar.tsx` — `nezapisaneTreningy` |
| Normalizácia mena klienta | `format.ts` — `normName` |
| Tolerancie párovania BTC ↔ PTminder | `compute.ts` — `PAROVANIE`, `menoKluc` |
| Zdroj obsahu pre „Typ hooku" | `marketing.ts` — `obsahRiadky()` |
| Párovanie mien v lieviku | `najdiKlienta` (presne + fuzzy), ako u Jarvisa |
| `rozpis.ts` bez verzie | `rozpisVerzia()`, setter vracia `boolean` |

Dve poznámky k tomu, čo som ZÁMERNE nezjednotil:

- **Dnešok pri „odtrénované mimo exportu"** sa v oboch kartách líši oprávnene:
  Balíčky rátajú hodinu, ktorá dnes už prebehla (je minutá), „Chýba v PTminderi"
  dnešok vynecháva (zápis ešte len príde). Rozdiel je teraz jeden parameter
  s vysvetlením, nie dve kópie s nepravdivým docstringom.
- **Prah konverzie** — lievik meria „stal sa klientom" (`jeKlient`), Jarvis
  „zostal 5+ sedení". Sú to dve otázky, nie rozpor; zjednotil som len
  párovanie mien, ktoré bola chyba.
- **Ostatné normalizácie diakritiky** (`hook.ts`, `kalendar.ts`, `webObsah.ts`,
  `vzas.ts`) nenormalizujú MENÁ, ale text hooku, názov udalosti, text webu
  a kľúč kategórie. Zliať ich pod `normName` by bola falošná úspora.

---

## 3 · Tiché zápisy — HOTOVÉ

Opravené (verzia 443). Zápis, ktorý neprejde, sa odteraz vráti a povie to.

| Kde | Čo sa dialo | Čo robí teraz |
|---|---|---|
| **Karta klienta + 6M** (16 polí) | `setOverride` vracal boolean, nikto ho nečítal | neúspech vráti pole a ukáže pás cez celú appku — **jedno miesto pre všetkých**, nie 16 obalov |
| **Chipy v registri** | dôvod, duch, pauza, tréner — položka sa zavrela aj bez zápisu | otázka sa zavrie AŽ po úspešnom zápise ku klientovi |
| **P&L bunka** | opravené číslo zostalo na obrazovke a po reloade zmizlo | model sa vráti, editor zostane otvorený, chyba je vidieť |
| **Ciele** | server nad 20 kB vracia 413, zoznam sa stratil | zoznam sa vráti a appka povie, že cieľov je priveľa |
| **Osobné výplaty, kategórie P&L** | „uložené" bez kontroly | editor sa zavrie až po zápise |
| **Zámok mesiaca** | otvoril mesačnú správu aj pri zlyhaní | správa sa ponúkne až po zamknutí; pri hromadnom sa vypíšu mesiace menom |
| **Faktúry** | hlásili „naučených N pravidiel" = počet POKUSOV | počítajú sa len zapísané |
| **Kalendár ↻ Obnoviť** | tlačidlo prestalo točiť, zoznam zostal starý | povie, že sťahovanie neprešlo |
| **Nákupy, Nápady** | optimistická zmena bez návratky | položka sa vráti a chyba je vidieť |
| **saveJarvisChat, deleteJarvisChat** | `catch {}` bez návratovej hodnoty | vracajú `boolean` |

Nový test `zapisy.test.ts` stráži, že ukladacia funkcia nevracia `void` ani
neprehltne chybu — práve on tie posledné dve našiel. **Kalendár kontrolu už
mal** na siedmich z ôsmich miest; nález z prvého kola bol v tomto zastaraný.

---

## 4 · Metriky — HOTOVÉ

Opravené (verzia 444).

- **„Po čom nám niekto napísal"** — prepínač obdobia filtroval len dopyty,
  základ „pred bežným dňom" sa počítal cez celú históriu. Pri voľbe „2026"
  tak stĺpec vľavo hovoril o 2026 a stĺpec vedľa o jan 2025 – dnes, takže ich
  ROZDIEL (jediné číslo, o ktorom karta niečo tvrdí) meral aj zmenu skladby
  obsahu. Obsah sa teraz orezáva na to isté okno + 14 dní spätne, aby dopyt
  z 3. januára mal svoje decembrové príspevky.
- **„Nových klientov" v karte *Čo to stálo*** — štvrtá definícia klienta,
  bez `jeKlient`. Cena za klienta vychádzala nižšia, než je.
- **Benchmark** rátal aj mesiace označené `neuplny` (nahratá len časť
  príspevkov) — z tých sa nesmie čítať prepad. Teraz sa vynechajú a je
  napísané ktoré.
- **„Videnia" znamenali dve rôzne veci** na jednej obrazovke: dlaždica čítala
  metriku `Views` (skutočné videnia), tabuľka `Impressions` (koľkokrát sa
  obsah zobrazil vo feede) — rádovo iné čísla pod tým istým slovom. Dlaždica
  sa volá **Prehratia IG**, stĺpec **Zobrazenia**, oba majú vysvetlenie, že
  ten druhý meria niečo iné. Rozhodnutie „ktoré z nich je to hlavné" tým
  nepadlo — obe sú pravdivé odpovede na inú otázku.

---

## 5 · Čo potrebuje tvoje rozhodnutie

**a) Päť dopytov so zdrojom „iné"** — API do dnes zahadzovalo tri hodnoty
(`reklama`, `instagram_osobny`, `telefon`) a ticho ich prepisovalo na „iné".
Ktoré z nich boli v skutočnosti reklama, vieš len ty:

| dátum | meno |
|---|---|
| 14. 3. | Lucia Kafková |
| 22. 3. | Ondrej Červinka |
| 4. 5. | Alexej Bajkalov |
| 27. 7. | Terezie Pehalová |
| 27. 7. | Roman Pavlík |

(Katerina Matlova je „iné" oprávnene — leták.)

**b) Karty o návratnosti reklamy — ZJEDNOTENÉ** (verzia 445). Boli ŠTYRI,
nie tri: „Čo to prinieslo", „Čo to stálo", „Platená cesta" a „Kampane".
Nahradila ich jedna karta **Čo priniesla reklama** nad jedným výpočtom
(`lib/psb/reklama.ts`, 12 testov). Ubudlo 202 riadkov a jeden celý súbor.

Karta hovorí DVE čísla a hovorí ich oddelene:
- **cena za klienta z reklamy** — len dopyty so zdrojom reklama alebo s UTM;
  podľa tohto sa rozhoduje o rozpočte,
- **zmiešaná cena** — výdavok ÷ všetci noví klienti; je nižšia, znie lepšie
  a obsahuje aj ľudí z odporúčaní. Je to strop, nie cena.

Pravidlo, ktoré výpočet drží: **zdroje výdavku sa nesčítavajú.** Mesačná
zostava aj Metricool popisujú tie isté peniaze — sčítať ich by zdvojnásobilo
výdavok, teda aj cenu za klienta. Poradie dôvery: kampane z Meta API →
zostava → Metricool, a na karte je napísané, ktorý zdroj práve platí.

**c) Kanaly.tsx — ktoré číslo je to hlavné?** Názvy sú už rozlíšené
(Prehratia IG × Zobrazenia), takže si appka neprotirečí. Otvorené zostáva, či
má tabuľka radiť siete podľa zobrazení (dnes) alebo podľa skutočných videní —
to je tvoje rozhodnutie o tom, čo ťa zaujíma.

---

## 6 · Čo som NEurobil a prečo

- **Odpovede Jarvisa naživo** — potrebujú prihlásenie do bežiacej appky
  a prehliadač ma na tú adresu nepustil. Overil som vstupy (kontext, schéma,
  kľúče, akcie), nie text, ktorý model vypíše.
- **Neprepísal som ani jedno tvoje číslo.** Päť dopytov vyššie je návrh, nie
  zmena.
- **Nasadenie** — opravy menia zobrazené čísla (definícia klienta, okno
  kampaní), tak nech je pri prvom pohľade niekto, kto vie, čo sa zmenilo.
- **Overovanie cez ostré dáta z D1, nie klikaním** — pri väčšine revízie.
  Dôvod bol ale zlý: mal som pomýlenú adresu appky (chýbal prefix `kokpit.`).
  Nálezy to nemení, boli merané na produkčných dátach; klikaním sa dalo overiť
  viac a nemuselo sa čakať do konca.
