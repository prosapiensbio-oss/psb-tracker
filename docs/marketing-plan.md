# Marketingový plán — čo staviame a prečo

Zhrnutie rozhovoru z 11.–12. 8. 2026. Vzniklo preto, že sa toho prebralo veľa
a plán sa stratil v konverzácii.

---

## 1 · Odkiaľ to celé vyšlo

Sedemdesiatjeden percent klientov chodí z odporúčaní. Znie to ako sila a je to
sila — ale **referencia nie je kanál, je to následok.** Rastie s počtom
spokojných klientov, nie s tým, koľko ich práve potrebuješ.

Z toho plynú dva problémy, ktoré sa nedajú vyriešiť lepším obsahom:

1. **Keď odíde osem ľudí naraz, referencie nezrýchlia.** Chodí ich ~1,4
   mesačne. Znamená to pol roka diery, počas ktorej sa nedá spraviť nič.
2. **Novému trénerovi nedajú nič.** Nemá koho spokojného. Kým si vybuduje
   vlastné odporúčania, prejdú roky — a dovtedy ho nemáš čím zaplatiť.

Preto reklama. Nie preto, že by referencie boli málo, ale preto, že sa **nedajú
objednať**.

---

## 2 · Čo v skutočnosti kupujeme

Toto je najdôležitejšia veta celého plánu:

> **Nekupujeme zisk z reklamy. Kupujeme schopnosť.**

Pri marginálnej marži 240 Kč na sedenie (u Terezkiných klientov) by bola
reklama ako zisková činnosť slabý biznis. To, čo za tie peniaze naozaj
dostaneš, je odpoveď na otázku: *keď mi odíde osem ľudí, viem si za známu cenu
objednať dvadsať dopytov?*

Dnes tá odpoveď neexistuje. Preto je meradlom úspechu prvej fázy **poznať cenu
dopytu**, nie „vrátilo sa to".

---

## 3 · Koľko klientov naozaj treba

Voľných miest je 18. Ale klientela je prietok — kým zapĺňaš, tečie.

| za posledných 12 mesiacov | mesačne |
|---|---|
| prišlo klientov | 3,83 |
| odišlo | 3,42 |
| **čistý prírastok** | **+0,42** |

Pri tomto tempe trvá zaplnenie 18 miest **44 mesiacov**. Aby bolo plno za pol
roka, treba získať **39 klientov** — 18 voľných miest plus 21, ktorí medzitým
odídu.

Je to v appke: Kokpit → *Koľko klientov naozaj treba*.

---

## 4 · Lievik nie je pokazený, je nedokrmený

Za január–august 2026, 35 dopytov:

| zdroj | dopytov | trénovalo | zostalo (5+ sedení) |
|---|---|---|---|
| Instagram | 12 | 7 | **5 (42 %)** |
| Referencia | 10 | 9 | 7 (70 %) |
| Google | 5 | 4 | 2 |
| Iné | 8 | 3 | 1 |
| **spolu** | **35** | **23 (66 %)** | **15 (43 %)** |

Štyridsaťdva percent konverzie z Instagramu je na platený kanál veľmi dobré
číslo. Problém nie je v tom, čo sa s dopytmi deje — problém je, že ich je
necelých päť mesačne.

*(Pozn.: 12 instagramových dopytov je malá vzorka. Smer je jasný, presnosť nie.)*

**Reklama nemá čo opravovať. Má priniesť viac ľudí do niečoho, čo už funguje.**

---

## 5 · Koľko to bude stáť

39 klientov ÷ konverzia = **~60–65 dopytov za pol roka**, teda **~10,5 mesačne**.
Organicky ich chodí 5. **Reklama musí doniesť ~5,5 mesačne.**

Strop na jeden dopyt — koľko sa zaň dá zaplatiť a byť na nule:

| kam klient pôjde | strop |
|---|---|
| Terezke (850 Kč/h je náklad firmy) | ~2 200 Kč |
| Jerrymu (850 Kč/h je jeho vlastná výplata) | ~10 000 Kč |
| realistický mix 8 + 10 | **~5 700 Kč** |

Rozumný cieľ je **pod 1 000 Kč za dopyt**. Odvodený rozpočet vychádza na
**5 000–8 300 Kč mesačne** — čo je zhruba to, čo sa dnes míňa. Rozdiel bude
v tom, že prvýkrát bude vidieť, čo sa za to kúpilo.

Percentuálne pravidlo „5 % z tržieb" sa nepoužíva. Rozpočet sa odvodzuje
od kapacity a od ceny dopytu, nie od tržieb.

---

## 6 · Prečo reklama v 2025 nefungovala (hypotéza)

Nula percent klientov z platenej reklamy v 2025 sa dá vysvetliť bez toho, aby
bola kreatíva zlá:

- **Meta pixel je za súhlasom s cookies.** Načíta sa len tým, čo povolia
  reklamné cookies — typicky polovica až tri štvrtiny ľudí. Zvyšok Meta nevidí.
- **Conversion API je vypnuté.** To je serverová cesta, ktorá konverziu pošle
  aj bez súhlasu v prehliadači. Presne na tento problém existuje.
- **Meta teda nevie, kto sa objednal** — a optimalizuje na to, čo meria: na
  PREKLIKY. Platilo sa za prekliky a dostali sa prekliky.
- **Odoslaný formulár nikdy nedorazil do Kokpitu.** Všetkých 37 dopytov je
  zapísaných ručne. Bez toho sa nedá povedať, ktorá kampaň priniesla koho.

Nie je to dokázané, ale sedí to a dá sa to lacno odstrániť.

---

## 7 · Čo staviame

### A · Formulár → dopyt v Kokpite  *(prvé, moje)*
Odoslanie formulára na webe vytvorí dopyt aj s kampaňou z UTM parametrov.
K tomu **stav, dôvod straty a čas prvej odpovede.**

*Prečo:* dnes je všetkých 37 dopytov v stave „nový" a dvanásť z nich
netrénovalo bez toho, aby niekto vedel prečo. Bez tohto by reklama liala vodu
do vedra, na ktoré sa nikto nepozerá — a rýchlosť odpovede je v službách
najsilnejšia páka na konverziu, silnejšia než cena aj než text reklamy.

### B · Meta pixel a Conversion API  *(Jerry, na webe)*
Zapnúť Conversion API v PixelYourSite a označiť odoslanie formulára ako
konverznú udalosť. Token sa generuje v Meta Events Manager a vkladá priamo do
nastavenia — **nikdy cez chat.**

*Prečo:* bez toho Meta neoptimalizuje na objednávky, ale na prekliky.

### C · Meta Marketing API — len čítanie  *(moje, po B)*
Výdavok a výsledky po kampaniach automaticky do Kokpitu.

*Prečo:* aby sa cena za dopyt počítala sama a nemusela sa prepisovať ručne.
Púšťanie reklám z Kokpitu **zámerne nestaviame** — Meta mení rozhranie
rýchlejšie, než by sme ho stíhali dobiehať, a pri jednej-dvoch kampaniach naraz
by to bola práca navyše bez úžitku.

### D · Obsah → dopyt  *(moje)*
Ku každému dopytu, čo vyšlo v predchádzajúcich dvoch týždňoch.

*Prečo:* toto je analýza obsahu, ktorá slúži cieľu. Nie „ktorý hák má
uloženia", ale **„po čom nám niekto napísal"**. Uloženie je proxy, dopyt je vec
sama.

### E · Rozhodovacia obrazovka kampaní  *(moje, posledné)*
Kampaň → výdavok → dopyty → klienti → cena za klienta, proti stropu.

*Prečo:* Ads Manager vie povedať cenu za preklik. **Nikdy nepovie cenu za
klienta, ktorý zostal pol roka** — nevie, kto sa ním stal. Kokpit má oba konce.
Je to jediné miesto na svete, kde sa to dá zobraziť.

---

## 8 · Ako to bude fungovať v praxi

1. Reklama beží s UTM parametrami, klik pristane na **`/uvodni-trenink/`** —
   je to jediná z troch stránok, čo má na jednom mieste bolesť, vysvetlenie,
   priebeh, dva klientske príbehy, cenu 1 100 Kč, FAQ a formulár. Plus zachytávač
   pre nerozhodnutých (protokol MFR zadarmo).
2. Odoslaný formulár urobí dve veci naraz: **dopyt v Kokpite** s kampaňou
   a **konverziu do Mety** cez Conversion API.
3. Voláš alebo píšeš. Do appky sa zapíše, kedy a s akým výsledkom — a pri
   strate aj dôvod.
4. Keď človek príde na úvodný a zostane, appka si ho spáruje s dopytom
   a dopočíta **skutočnú cenu za klienta**.
5. Kokpit ukáže kampaň od výdavku po klienta. Jarvis z toho plánuje ďalší
   kvartál a vyrobí **zadanie pre Claude Project**, ktorý píše captiony
   a scenáre.

---

## 9 · Kedy

| kedy | čo |
|---|---|
| **August** | Reklama je vypnutá (od 1. 8.) — a to je dobre. Dá čistú organickú základňu, proti ktorej sa septembrový výsledok porovná. Medzitým staviam A, ty riešiš B. |
| **September** | Test: **~6 000 Kč na 4–6 týždňov.** Cieľ nie je zarobiť, ale zistiť cenu dopytu. Zastavovacie pravidlo: keď je po 6 000 Kč cena nad 2 200 Kč, problém nie je kanál, ale ponuka alebo kreatíva. |
| **Október** | Vyhodnotenie. Poznáš cenu dopytu → nastaví sa mesačný rozpočet a postaví sa E. |

---

## 10 · Čo sa k tomu už postavilo (11.–12. 8.)

- **Marketing v Jarvisovom kontexte** — Instagram po mesiacoch, obsah po
  kategórii háku, Search Console, zdroje klientov, náklady.
- **Plánovací režim + zadanie pre Claude Project** — Jarvis udáva smer, Project
  píše texty.
- **Retencia (watch time)** — bola v exportoch z Metricoolu celý čas a appka ju
  nikdy nečítala. Medián 8 s, rozptyl 4,4–48,5 s. Ukázala, že **klientske
  príbehy držia pozornosť najdlhšie, hoci v uloženiach sú posledné.** Sú to dva
  rôzne signály: uloženie je pre algoritmus, čas sledovania pre reklamu.
- **Karta „Koľko klientov naozaj treba"** — deravé vedro.
- **História z Metricoolu** — tabuľka príspevkov z 23 riadkov na 1 104.

---

## Ceny, na ktoré sa teraz nesiaha

Marginálna marža 240 Kč na sedenie je tenká a zdvihnutie ceny by stropom
pohlo viac než akékoľvek zlepšenie reklamy. Jerry sa 11. 8. rozhodol **cenou
teraz nehýbať** a zahrať to s kartami, ktoré sú na stole; zdraženie príde
o pár mesiacov. Je to tu zapísané preto, aby sa na tú páku nezabudlo.
