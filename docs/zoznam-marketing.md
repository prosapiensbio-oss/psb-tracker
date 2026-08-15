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

---

## F · Web a FP compliance (pridané 15. 8. 2026)

Vzniklo z čítania štyroch FP dokumentov (NDA, FP Policy, Practitioner's
Handbook) a z Jerryho otázok o verifikačných odkazoch a prístupe k webu.

### Viem postaviť bez teba

| | |
|---|---|
| **Text stránok webu do Kokpitu, spojený so Search Console** | Nie HTML ani CSS — text. Dnes Jarvis vie web len cez čísla (kto prišel, na čo hľadal), nie čo na stránkach STOJÍ. Po spojení s GSC riadkami sa z „2 000 zobrazení, 0 klikov" stane „…a tu je jej titulok, prepíšme ho". Chýbajúca polovica SEO práce, ktorá leží od 11. 8. |
| **Kontrola FP compliance nad publikovaným obsahom** | Vypadne z predošlého. Teraz nič neoveruje, že to, čo je na webe, sedí s pravidlom 2.3 — ani že sa niekde nevysvetľuje metodika. Kontrola proti bodom 2.3.1–2.3.8 vrátane nového testu „hovoril o tom Naudi verejne" |

**Nerobíme: evidencia klientov a ich NDA v Kokpite.** Jerry 15. 8.: *„daj nech
jarvis pozna tie dokumenty ale nemusíme to mat explicitne v kokpite — kokpit sa
priamo sústredí na PSB."* Bol to môj návrh, nie jeho požiadavka. Kokpit meria
PSB — peniaze, klientov, dopyt. Povinnosť z cudzej zmluvy je vec, na ktorú sa
Jerry spýta Jarvisa, keď ju potrebuje, nie stĺpec, ktorý mu bude svietiť
v registri. Dokumenty pozná Jarvis, evidencia nie je.

### Tvoje — mimo Kokpitu

| | |
|---|---|
| **Spýtať sa FP na dve veci** (`FPPolicy@Functionalpatterns.com`) | (1) Pokrýva „any other health focused professional" zubára a dentálnu hygieničku? Menované profesie sú všetky z pohybu a manuálnej terapie, takže zámer môže byť „kto by metódu mohol aplikovať", nie „kto má zdravotnícke vzdelanie". (2) Smie verifikačný odkaz ísť aj na prosapiens.cz? Handbook ho predpisuje do website poľa Instagramu a pre web predpisuje ich hotovú stránku — iné umiestnenie nezakazuje, ale ani nepovoľuje |
| **Verifikačný odkaz na stránku „Co je Functional Patterns"** | Až po odpovedi FP. Je to najnavštevovanejšia podstránka a chodia tam presne tí, čo si overujú, či si skutočný. Asymetria hrá pre PSB: konkurencia metódu menuje, PSB ju vie DOKÁZAŤ — odkaz, za ktorý ručí FP, má len certifikovaný praktik. Odkaz prezrádza len meno, kurz, platnosť a fotku |
| **Prejsť klientov, ktorým sa posielal before/after** | Zistiť, u ktorých chýba FP NDA. Pozor na dva rôzne dokumenty: súhlas so zverejnením obsahu (ten Jerry podľa vlastných slov má) NIE JE NDA. Súhlas chráni klienta, NDA chráni metódu FP |
| **Rozhodnúť o pravidle „FP sa nemenuje"** | Overené 15. 8.: je to positioning voľba PSB, **nie povinnosť z NDA**. Handbook v sekcii Existing Branding uvádzanie certifikácie na vlastnom webe výslovne povoľuje a dodáva na to hotový text. Pravidlo drží, kým Jerry nerozhodne inak — a rozhodnutie je jeho, nie compliance otázka |

### Hotové 15. 8.

| | |
|---|---|
| Logo a slovná značka FP zakázané v pravidlách Kokpitu | *„should not be used by practitioners for any reason"* — v 2.3 o tom dovtedy nebolo nič |
| Test „hovoril o tom Naudi verejne?" | Overiteľné kritérium namiesto dojmu pri hraničných prípadoch |
| Before/after má v pravidlách dve branky | Schválenie na fp.app **a** písomný súhlas klienta |
| Zákaz vyhľadávať FP spolu s PSB odstránený | Nemal oporu v žiadnom zo štyroch dokumentov — bola to moja domnienka, dvakrát po sebe |
