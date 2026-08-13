# Marketingová firma v Kokpite — čo sa dá a čo nie

Otázka Jerryho z 13. 8. 2026: *„chcel by som, aby v záložke marketing bola celá
marketingová firma"* — so zoznamom šiestich oddelení a rolí. Tento dokument je
odpoveď a zároveň rozhodovací zoznam. Keď sa niečo z neho postaví, riadok sa
prepíše na hotové.

---

## Rámec: firma verzus kancelária

Kokpit nemá byť marketingová firma. Má byť jej **kancelária** — miesto, kde sa
rozhoduje, meria a pamätá.

Výroba (texty, vizuály, video) sa deje v nástrojoch, ktoré na to existujú a
fungujú lepšie, než čo by sa dalo postaviť: Claude Project, Higgsfield, Canva,
CapCut. Presúvať ju do Kokpitu znamená postaviť druhý chat, nahrávanie súborov,
náhľady a revízie — drahé na stavbu, drahé na údržbu a horšie než to, čo je.

Kancelária má naopak presne to, čo v nástrojoch chýba: **pamäť a meranie.**

---

## Mapa rolí

| oddelenie | rola | stav | poznámka |
|---|---|---|---|
| 1 Stratégia | Marketing manažér / CMO | **čiastočne je** | Jarvis má plánovací režim, čísla aj kapacitný strop. Chýba rozpočet ako živá veličina — vidí, čo sa minulo, nie čo je k dispozícii. |
| 1 | Brand stratég | **nedá sa** | Positioning je výsledok rokov a NDA. Model ho vie dodržiavať, nie vymyslieť. |
| 2 Kreatíva | Copywriter | **inde** | Claude Project, funguje. |
| 2 | Content creator | **plánovanie áno, tvorba nie** | Kalendár, ktorý vie, čo zabralo, do Kokpitu patrí. |
| 2 | Grafik | **inde** | Higgsfield, Canva. |
| 2 | Video | **Jerry** | Jediná časť, kde je jeho prítomnosť produkt. |
| 3 Performance | PPC | **viď nižšie** | |
| 3 | SEO | **dá sa lacno** | Search Console má API; dnes sa nahrávajú exporty ručne. |
| 3 | E-mail | **dá sa** | mailer.com má API. ~450 kontaktov; otvorenosť a prekliky ako ďalší kanál. |
| 4 Dáta | Analytik | **JE** | Jediná rola, ktorú Kokpit robí lepšie než kúpený nástroj. |
| 4 | CRO | **chýba** | Appka nevidí, kde ľudia na webe odpadávajú. |
| 5 Web | Developer | **nie** | WordPress je WordPress. |
| 5 | Ops / technológ | **deje sa** | Formulár → dopyt, Meta API, CAPI, algoritmus na pozadí. |
| 6 PR | PR manažér | **nie** | Nemá dosť objemu na to, aby to bola rola. |

---

## Otvorená otázka: má Kokpit vedieť púšťať reklamu?

**Technicky áno.** Meta Marketing API vie kampane vytvárať a Kokpit ju už
používa na čítanie. Chýba jediné oprávnenie: `ads_management`.

**To sa z tokenu vynechalo zámerne** (12. 8.). Appka, ktorá vie čítať, a appka,
ktorá vie minúť peniaze, sú dve triedy rizika. Chyba v čítaní ukáže zlé číslo;
chyba v písaní minie rozpočet cez víkend.

**Cena nie sú tokeny** — zadanie na kampaň stojí koruny. Cena je stavba a
údržba: Meta mení rozhranie rýchlejšie, než by sa stíhalo dobiehať, a pri
jednej-dvoch kampaniach naraz je to práca navyše bez úžitku. (Ten dôvod je
zapísaný v `Kampane.tsx` od začiatku.)

**Navrhované rozdelenie:**

1. **Kokpit navrhne.** Zadanie podložené dátami — cieľ, publikum, rozpočet
   proti stropu 2 200 Kč za klienta, ktorý obsah použiť podľa toho, čo doteraz
   zaberalo. Text na skopírovanie.
2. **Claude s Meta MCP vykoná.** Jerry to už má a už to skúšal. Reklamy cez
   konektor navyše vznikajú v stave PAUSED — poistka, ktorú by Kokpit musel
   vyrábať sám.
3. **Kokpit odmeria.** To už vie.

Peniaze sa tak míňajú vždy cez ľudský klik.

---

## Poradie, keby sa v tom pokračovalo

1. **Formulár na `/dychani`** — vysoké zobrazenia, nula odoslaní (onboarding
   4.1). Kým je funnel za preklikom mŕtvy, je jedno, aká firma je nad ním.
   Riešenie je po ruke: nech ten formulár posiela na `/api/lead-web` rovnako
   ako kontaktný — hneď bude vidieť, či odoslania nie sú, alebo sa strácajú.
2. **E-mail ako kanál** — mailer.com API. Najlacnejšie publikum, aké PSB má,
   a appka o ňom nevie nič.
3. **Rozpočet ako živá veličina** — aby CMO vedel, koľko ešte môže minúť.
4. **SEO cez Search Console API** — koniec ručných exportov.
5. **CRO** — kde ľudia na webe odpadávajú.

Reklama z Kokpitu je vedome NA KONCI, a možno nikdy.
