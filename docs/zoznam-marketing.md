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

### C1 · Hodina publikovania k príspevkom — PRIPRAVENÉ 13. 8.
Stĺpec `cas` v `ig_prispevky` existuje a sťahovanie ho odteraz ukladá.
Príspevky stiahnuté skôr ho prázdny majú — naplní sa pri najbližšom
„Stiahnuť Instagram". Analýza najlepších časov sa postaví, keď bude z čoho.

### C2 · Plánovanie obsahu — HOTOVÉ 13. 8. (prvá polovica)
Karta **„Čo publikovať ďalej"** na začiatku Reels & posty. Návrhy sa počítajú
zo štyroch zdrojov: témy, na ktoré sa web zobrazuje a nikto neklikne; články,
ktoré ľudia čítajú sami; typ začiatku, ktorý bol pred dopytmi vidieť častejšie
než v bežný deň; a tempo proti mesiacom s najviac dopytmi. Každý návrh nesie
číslo, na ktorom stojí, a tlačidlo, ktoré z neho spraví zadanie pre Jarvisa.

Kalendár s dátumami zatiaľ nie — bez Metricool API nemá kde brať plán a ručné
prepisovanie termínov je práca navyše, nie úspora.

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
| Token pre Conversions API v Kokpite | **nie je súrne.** WordPress už posiela Lead serverom cez PixelYourSite. Kokpitov vlastný CAPI by pridal len dopyty, ktoré neprešli webom — telefonát, správa na Instagrame |
| **UTM do adries reklám** | `utm_campaign={{campaign.name}}` — blokuje celý reťazec kampaň → klient |
| **Overiť doménu** v Events Manageri | DNS sa nerobilo a meta tag na webe nie je. Netreba ani jedno — postup nižšie |
| **Septembrová kampaň s cieľom Lead** | bez toho sa nemeria nič |
| **450 mailov** | nie je to úloha, je to možnosť. Jerry píše, len keď má čo povedať — a má pravdu. Návrh na mail musí začínať tým, čo tí ľudia dostanú, nie tým, koľko ich je |
| Premenovať mŕtve pixely | kozmetika |

### Overenie domény bez zásahu do webu

Na webe beží PixelYourSite a ten má na to vlastné pole. Netreba DNS ani úpravu
šablóny — plugin vloží tag do hlavičky každej stránky sám.

1. **Events Manager** → Nastavenia → Overenie domény → `prosapiens.cz`
2. Zvoľ spôsob **meta tag** a skopíruj celý riadok `<meta name="facebook-domain-verification" …>`
3. **WordPress** → PixelYourSite → Nástenka → v karte *Meta pixel* je pole
   **„Verify your domain"** (je prázdne, overené 13. 8.) → vlož ho tam
4. **Save Changes**, potom v Events Manageri **Overiť**

Prečo to treba: bez overenej domény Meta neverí, že stránka patrí tebe,
a obmedzuje, čo sa z nej dá použiť na cielenie a meranie.

---

## E · Rozhodnuté, že sa nerobí

| | |
|---|---|
| Metricool API | tarifa ho neobsahuje. Zrušené 13. 8. |
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
