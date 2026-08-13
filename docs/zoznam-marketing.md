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
| Lead na ďakovnej stránke hlási Mete Lead, nie ViewContent | udalosť bola nastavená a zapnutá od 12. 8., ale posielala sa ako `ViewContent`. Jeden rozbaľovací zoznam — preto Events Manager nikdy nevidel Lead |
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


---

## C · Viem postaviť bez teba

### C1 · Hodina publikovania — HOTOVÉ 13. 8.
Karta **„Kedy publikovať"** v Reels & posty: bežný dosah podľa pásma dňa a dňa
v týždni, z vlastných príspevkov. Medián, nie priemer. Víťaz sa vyhlási len pri
dosť veľkej vzorke a rozdiele nad štvrtinu — inak povie, že je to jedno.

Čaká už len na dáta: čas sa ukladá od 13. 8., staršie príspevky ho nemajú
a dopočítať sa nedá. Karta sama napíše, koľko kusov čas má a koľko treba;
naplní sa pri ďalších sťahovaniach.

### C2 · Plánovanie obsahu — HOTOVÉ 13. 8. (prvá polovica)
Karta **„Čo publikovať ďalej"** na začiatku Reels & posty. Návrhy sa počítajú
zo štyroch zdrojov: témy, na ktoré sa web zobrazuje a nikto neklikne; články,
ktoré ľudia čítajú sami; typ začiatku, ktorý bol pred dopytmi vidieť častejšie
než v bežný deň; a tempo proti mesiacom s najviac dopytmi. Každý návrh nesie
číslo, na ktorom stojí, a tlačidlo, ktoré z neho spraví zadanie pre Jarvisa.

Kalendár s dátumami sa robiť nebude: plán príspevkov by sa musel do Kokpitu
prepisovať ručne, čo je práca navyše, nie úspora.

### C3 · Kampane z Kokpitu s poistkou
Schválené 13. 8. **Kokpit nikdy nespustí reklamu.** Vytvorí ju v stave PAUSED,
ukáže súhrn (cieľ, publikum, denný strop, odhad ceny za dopyt proti stropu
2 200 Kč) a odkaz do Ads Managera. Zapnutie je klik v Mete.

Appka tak technicky nemá ako minúť peniaze, ani keby v nej bola chyba.
**Odložené na neskôr** (13. 8.) — vyžaduje oprávnenie `ads_management`, ktoré
sa pridáva v Mete. A hlavne: kým nefunguje meranie, nie je čo optimalizovať.

---

## D · Tvoje — mimo Kokpitu

| | prečo je to na tebe |
|---|---|
| Token pre Conversions API v Kokpite | **nie je súrne.** WordPress už posiela Lead serverom cez PixelYourSite. Kokpitov vlastný CAPI by pridal len dopyty, ktoré neprešli webom — telefonát, správa na Instagrame |
| **450 mailov** | nie je to úloha, je to možnosť. Jerry píše, len keď má čo povedať — a má pravdu. Návrh na mail musí začínať tým, čo tí ľudia dostanú, nie tým, koľko ich je |
| Premenovať mŕtve pixely | kozmetika |

### September nie je úloha, je to pripomienka

Kampaň s cieľom Lead ani UTM už v tomto zozname nie sú. Sedia ako rozhodnutie
s termínom overenia (`zv-septembrova-kampan`) a **1. 9. vyskočia samy** v registri
„Na čo sa pozrieť" — aj s celým pokynom: cieľ `OUTCOME_LEADS`, reťazec UTM na
vloženie do každej reklamy, overená doména a zastavovacie pravidlo pri 2 200 Kč.

Dovtedy je august zámerne bez reklamy: je to jediné čisté obdobie, proti ktorému
sa dá september porovnať. Úloha, ktorá visí na zozname tri týždne predtým, než
sa dá spraviť, len otupuje zoznam.

---

### Doména JE overená (13. 8.)

`prosapiens.cz` má v Business Settings zelený štítok *Verified*. Neupravuj kvôli
tomu nič v DNS ani na webe.

Pozor na úsudok, ktorý ma pomýlil: na stránke nie je meta tag a v DNS nie je
TXT záznam — z toho som usúdil, že overená nie je. Meta má ale TRI spôsoby
overenia a ten tretí, nahratie HTML súboru, zvonku vidieť nejde. Overenie navyše
ostáva platné aj potom, čo dôkaz zo stránky zmizne. Neprítomnosť dvoch z troch
dôkazov nie je dôkaz neprítomnosti.
---

## E · Rozhodnuté, že sa nerobí

| | |
|---|---|
| Metricool API aj kalendár termínov | tarifa API neobsahuje a ručné prepisovanie plánu nie je úspora. Zrušené 13. 8. |
| Analýza videa (typ sandcastles.ai) | nahradené klasifikáciou hákov a „obsah → dopyt“. Zrušené 13. 8. |
| Brand stratég, copywriting, grafika, web developer, PR | rieši Claude Project. Zrušené 13. 8. |


---

## Poradie, ktoré navrhujem

MailerLite aj Google API sú od 13. 8. hotové. Zostáva:

1. **UTM do adries reklám** — jediná vec, ktorá ešte blokuje reťazec kampaň → klient.
   Lead na ďakovnej stránke už Mete chodí správne.
2. **Živé dáta do troch kariet na Web a Google**, ktoré ešte ukazujú rok 2025.
3. **Hodina publikovania + plánovanie obsahu.**
4. **Kampane s poistkou** — až keď septembrový test ukáže cenu za dopyt.
