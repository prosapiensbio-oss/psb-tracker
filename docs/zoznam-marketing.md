# Marketing — čo je hotové, čo sa dá nasadiť, čo nie

Zoznam k 13. 8. 2026. Vznikol z Jerryho požiadavky prejsť celú debatu o
„marketingovej firme v Kokpite" a oddeliť, čo sa dá nasadiť, od toho, čo nie.

Poradie v každej časti je podľa pomeru úžitok / práca.

---

## A · Hotové (13. 8.)

| | |
|---|---|
| Onboarding a predajné princípy v znalostnej báze Jarvisa | 64 kB; FP compliance a index brand-konfliktov navyše vytiahnuté priamo do systémového promptu |
| Odovzdávacie miesto medzi Jarvisom a Claude Projectom | karta na začiatku „Reels & posty“: Jarvis vyrobí zadanie → Project z neho píše. Drobný odkaz v hlavičke Marketingu zrušený, prehliadal sa |
| MailerLite | odberatelia, skupiny a kampane; podkategória „Mailer“ |
| GA4 + Search Console cez servisný účet | jeden kľúč, obe služby; píše do tabuliek ručného importu. GA4 property 355422977, web `https://www.prosapiens.cz/` |
| Nemerané mesiace prežijú import | apríl a máj 2026 GA4 nemeralo; značka sa už neprepíše a Jarvis ju dostáva menovite |
| Strážca merania: web beží, ale GA4 ho nemeria | porovnáva GA4 proti Search Console; hlási, len keď jedno drží a druhé spadne o rád |
| Veta pod grafom kanálov sa počíta | bola napísaná natvrdo a tvrdila „~280 nových mesačne“ aj potom, čo to prestalo platiť |
| Cena za dopyt počítaná z dopytov, nie z Metiných konverzií | ukazovala 20 Kč z konverzií pixelu; za 12 mesiacov nemá ani jeden dopyt zdroj „reklama“, takže je tam pomlčka a dôvod |
| Konverzia dopyt → klient konvertuje dopyty | ukazovala 124 %, lebo delila dve rôzne skupiny ľudí |
| Changelog Graph API v nočnom sťahovaní | + kľúčové slová `deprecat`, `breaking change`, `sunset`, `api version` |
| Ohlásenie dopytu Mete cez Conversions API | čaká len na token |
| Obsah → dopyt, rozbor mesiaca, kampane od koruny po klienta | |

---

## B · Viem postaviť — potrebujem prístup

### B1 · Google API: Search Console + GA4 naraz — HOTOVÉ 13. 8.
Jeden účet Google Cloud, jeden servisný účet, prístup k obom nástrojom preň.

- **Search Console** → koniec ručných exportov. Priamo obsluhuje otvorenú
  úlohu z onboardingu 6.4 (nízke CTR na fascia článkoch — vysoké impresie,
  0,33–1,4 % preklik).
- **GA4 Data API** → kde ľudia na webe odpadávajú. To je chýbajúca rola CRO.

**Prečo naraz:** rovnaké prihlásenie, rovnaký spôsob overenia. Zvlášť =
tá istá práca dvakrát.

### B2 · MailerLite API
Potvrdené: **MailerLite**, nie mailer.com.

- ~450 kontaktov, otvorenosť klesla zo 40 % (jún 25) na 19,6 % (júl 26).
- **A hlavne:** toto je jediný spôsob, ako zmerať formulár na `/dychani`.
  Ten formulár zbiera maily, nie dopyty — takže test znie „pribúdajú
  odberatelia?", nie „chodia dopyty?". Onboarding 4.1 hlási nula odoslaní;
  MailerLite to potvrdí alebo vyvráti za pár minút.

Treba: API kľúč z MailerLite (vkladá sa v appke, nie cez chat).

### B3 · Metricool API — len fronta naplánovaných príspevkov
**Oprava predchádzajúceho odporúčania.** Graph API dáva, čo sa STALO.
Nedáva, čo je NAPLÁNOVANÉ — a to Metricool vie ako jediný.

Odporúčané rozdelenie:
- **Naplánované príspevky** → z Metricoolu, ak to tarif dovolí.
- **Najlepšie časy** → dopočítať z vlastných dát (hodina publikovania verzus
  dosah). Presnejšie než odporúčanie Metricoolu, lebo je to o tomto publiku.
  Vyžaduje uložiť pri príspevku aj hodinu — dnes sa ukladá len dátum.

Treba: potvrdiť, či tarif obsahuje API.

---

## C · Viem postaviť bez teba

### C1 · Hodina publikovania k príspevkom
Malá zmena (`ig_prispevky` + jedno pole pri sťahovaní), odomkne analýzu
najlepších časov z vlastných dát. Predpoklad pre B3.

### C2 · Plánovanie obsahu
Kalendár: dátum, formát, téma, ktorý dokument sa ním propaguje — a vedľa toho,
čo z podobného obsahu zaberalo. Stavia sa až po B1–B3, aby mal z čoho čerpať.

### C3 · Kampane z Kokpitu s poistkou
Schválené 13. 8. **Kokpit nikdy nespustí reklamu.** Vytvorí ju v stave PAUSED,
ukáže súhrn (cieľ, publikum, denný strop, odhad ceny za dopyt proti stropu
2 200 Kč) a odkaz do Ads Managera. Zapnutie je klik v Mete.

Appka tak technicky nemá ako minúť peniaze, ani keby v nej bola chyba.
Vyžaduje pridať oprávnenie `ads_management` — až keď sa to bude stavať.

Zámerne posledné: kým nefunguje meranie, nie je čo optimalizovať.

---

## D · Tvoje — mimo Kokpitu

| | prečo je to na tebe |
|---|---|
| **Token pre Conversions API** | Kokpit má funkciu hotovú a nečinnú |
| **UTM do adries reklám** | `utm_campaign={{campaign.name}}` — blokuje celý reťazec kampaň → klient |
| **Potvrdiť doménu** v Events Manageri | visí od 3. 6. |
| **Septembrová kampaň s cieľom Lead** | bez toho sa nemeria nič |
| **450 mailov** | nie je to úloha, je to možnosť. Jerry píše, len keď má čo povedať — a má pravdu. Návrh na mail musí začínať tým, čo tí ľudia dostanú, nie tým, koľko ich je |
| **Lead na formulári v PixelYourSite** | plugin to už vie, len to nemá zapnuté — do Mety chodí iba PageView (pixel 3288091694795887). Spolu s UTM odblokuje reťazec kampaň → klient |
| Premenovať mŕtve pixely | kozmetika |

---

## E · Rozhodnuté, že sa nerobí

- **Brand stratég** — funguje bez toho.
- **Copywriter, grafik a video v Kokpite** — výroba žije v Claude Projecte,
  Higgsfielde a Canve. Kokpit dodáva zadanie a meranie.
- **Web developer** — WordPress je WordPress.
- **PR** — nemá dosť objemu na to, aby to bola rola.
- **Metricool ako zdroj výsledkov** — Graph API je priamejší. Metricool
  zostáva len na to, čo API nedáva (plán, TikTok, Threads).

---

## Poradie, ktoré navrhujem

1. **MailerLite** — odomkne meranie formulára na `/dychani`, teda prvú položku
   tvojho vlastného zoznamu otvorených úloh.
2. **Google API** (Search Console + GA4) — koniec ručných exportov a konečne
   vidno, kde ľudia odpadávajú.
3. **Hodina publikovania + plánovanie obsahu.**
4. **Kampane s poistkou** — až keď meranie funguje.
