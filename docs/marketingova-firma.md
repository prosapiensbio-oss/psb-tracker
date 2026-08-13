# Marketingová firma v Kokpite — čo sa dá a čo nie

Otázka Jerryho z 13. 8. 2026: *„chcel by som, aby v záložke marketing bola celá
marketingová firma"* — so zoznamom šiestich oddelení. Tento dokument je odpoveď
aj rozhodovací zoznam. Keď sa niečo postaví, riadok sa prepíše na hotové.

---

## Rámec: firma verzus kancelária

Kokpit nemá byť marketingová firma. Má byť jej **kancelária** — miesto, kde sa
rozhoduje, meria a pamätá.

Výroba (texty, vizuály, video) žije v nástrojoch, ktoré na to sú a fungujú:
Claude Project, Higgsfield, Canva, CapCut. Presúvať ju do Kokpitu znamená
postaviť druhý chat, nahrávanie súborov, náhľady a revízie — drahé na stavbu,
drahé na údržbu a horšie než to, čo je.

Kancelária má naopak presne to, čo nástrojom chýba: **pamäť a meranie.**

---

## Rozhodnuté (Jerry, 13. 8.)

| rola | rozhodnutie |
|---|---|
| CMO | Doplniť Jarvisovi ďalšie dokumenty do znalostnej bázy. |
| Brand stratég | **Netreba** — funguje. |
| Copywriter | Jarvis vyrába **zadanie**, Jerry ho posiela do Claude Projectu. Chce **tlačidlo s odkazom** priamo na ten Project. |
| Content creator | **Plánovanie v Kokpite** — dátumy, čo publikovať, ktorý dokument propagovať. |
| Grafik | To isté čo copywriter: Jarvis vyrába prompty, Jerry ich posiela ďalej. |
| Video | Jerry. |
| PPC | Postaviť **s medzikrokom**: appka pripraví, Jerry potvrdí. Viď nižšie. |
| SEO | Napojiť Search Console API, koniec ručných exportov. |
| E-mail | Napojiť API mailingu. |
| Analytik | Je. |
| CRO | Napojiť GA4 API — kde ľudia odpadávajú. |
| Web dev | Nie. |
| Ops | Deje sa. |
| PR | Nie. |

---

## Úlohy, v poradí podľa pomeru úžitok / práca

### 1 · Formulár na `/dychani` do Kokpitu
Onboarding 4.1: vysoké zobrazenia, **nula odoslaní**. Kampaň naň v júli minula
1 804 Kč pri zdravom CTR. Kým je funnel za preklikom mŕtvy, je jedno, čo sa nad
ním postaví.

Riešenie je hotové a stačí ho zapojiť: nech Forminator (form ID 5445) posiela na
`/api/lead-web` rovnako ako kontaktný formulár. Potom sa hneď ukáže, či
odoslania naozaj nie sú, alebo sa len strácajú medzi pluginom a schránkou.

### 2 · Google API — Search Console aj GA4 naraz
Obe patria pod jeden účet Google Cloud a jeden servisný účet. Postaviť ich
zvlášť by znamenalo robiť to isté dvakrát.

- **Search Console** → koniec ručných exportov, dopyty a stránky sa
  aktualizujú samy.
- **GA4 Data API** → cesta používateľa po webe, teda **kde odpadávajú**. To je
  tá chýbajúca rola CRO.

Potrebné od Jerryho: účet Google Cloud, servisný účet a prístup k obom
nástrojom preň. Kľúč sa vkladá do Kokpitu, nikdy nechodí chatom.

### 3 · Mailing API
~450 kontaktov, otvorenosť klesla zo 40 % na 19,6 %. Appka o tom kanáli nevie
nič. Po napojení: kampane, otvorenosť, prekliky — a hlavne či z mailu chodia
dopyty.

**Treba potvrdiť, o ktorú službu ide** (mailer.com verzus MailerLite — vyzerá
to na druhé). Podľa toho sa líši API aj spôsob overenia.

### 4 · Zadanie na jeden klik + odkaz na Claude Project
Jarvis už vie vyrobiť zadanie (systémový prompt, sekcia ZADANIE PRE CLAUDE
PROJECT). Chýba tlačidlo, ktoré ho skopíruje a otvorí Project.

Potrebné od Jerryho: **adresa toho Projectu.**

### 5 · Plánovanie obsahu
Kalendár: dátum, formát, téma, ktorý dokument sa ním propaguje — a vedľa toho,
čo z podobného obsahu zaberalo. Stavia sa až po 2 a 3, aby mal z čoho čerpať.

### 6 · Kampane z Kokpitu s potvrdením
Viď nižšie. Zámerne posledné.

---

## Metricool API

Metricool API existuje, ale je viazané na vyšší tarif a treba token.

Dôležitejšie je, že **pre Instagram ho už nepotrebujeme** — Graph API dáva
príspevky priamejšie a presnejšie a Kokpit ho už používa. Metricool má hodnotu
pre to, čo Graph API nepokrýva: Facebook (ide cez tú istú stránku, dá sa
dorobiť), TikTok a Threads (vlastné API, každé zvlášť).

Odporúčanie: **nenapájať Metricool.** Dorobiť Facebook cez Graph API, ktorý už
máme, a TikTok s Threads nechať na mesačnú zostavu, kým z nich nebude chodiť
niečo, o čom sa rozhoduje.

---

## Kampane z Kokpitu — s medzikrokom

Jerry navrhol (13. 8.): appka reklamu pripraví, posledný krok — potvrdenie so
súhrnom — spraví človek. **To ten problém rieši**, a rieši ho lepšie, než ako
bol pôvodne zamietnutý.

Najbezpečnejšia podoba je ešte o krok ďalej: **Kokpit reklamu nikdy nespustí.**
Vytvorí ju v stave PAUSED, ukáže súhrn (cieľ, publikum, rozpočet, denný strop,
odhad ceny za dopyt proti stropu 2 200 Kč) a odkaz do Ads Managera. Zapnutie
je jeden klik — v Mete, nie v appke.

Rozdiel oproti „appka spustí a Jerry potvrdí" je v tom, že appka potom
**technicky nemá ako minúť peniaze**, aj keby v nej bola chyba. Nie je to
o dôvere, je to o tom, že poistka, ktorá stojí na správnom správaní kódu, nie
je poistka.

Token dnes oprávnenie `ads_management` nemá. Pridá sa až vtedy, keď sa toto
bude stavať.

---

## Zmeny rozhrania Mety — hotové 13. 8.

Jerry navrhol sledovať stránku, kde Meta zverejňuje zmeny. Dobrý nápad s jednou
opravou: nejde o zmeny algoritmu, ale o zmeny **API** — teda rozhrania, cez
ktoré Kokpit s Metou hovorí. Práve tam sa dopredu oznamuje, ktorá verzia sa
vypína a ktoré pole zaniká.

Pridané do nočného sťahovania noviniek (`/api/algo`): changelog Graph API a
kľúčové slová `deprecat`, `breaking change`, `sunset`, `api version`,
`will be removed`. Bez toho sa vypnutá verzia zistí až tak, že appka jedného
rána prestane sťahovať kampane a nikto nevie prečo.
