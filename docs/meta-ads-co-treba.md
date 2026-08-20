# Čo Kokpit potrebuje, aby vedel nastavovať reklamy dobre

**Rešerš z 19. 8. 2026.** Zdroje: dokumentácia Meta for Developers, blog Meta
for Developers (zmena prístupových úrovní, máj 2026) a odborné weby o Meta Ads
(benchmarky 2026, lokálne služby, Conversions API). Odkazy sú na konci.

Zhrnuté proti TOMU, ČO PSB SKUTOČNE JE: jeden štúdiový biznis v Brne, strop
kapacity ~60–70 klientov, ~3 dopyty mesačne, cena za dopyt ~2 200 Kč, rozpočet
na septembrový test rádovo 6 000 Kč na 4–6 týždňov. Väčšina rád na internete
je písaná pre e-shopy s rozpočtom o dva rády vyšším a pre PSB **neplatí** —
kde to tak je, je to napísané.

---

## 1 · Prístup k API — jediná tvrdá prekážka

Meta v máji 2026 premenovala úrovne na **Limited Access** a **Full Access**
(predtým Standard/Advanced). Náš stav: kampane a sady reklám sa zakladať dajú,
**kreatíva nie** — Graph vráti `(#3) Application does not have the capability
to make this API call`.

Na Full Access treba:

- **500+ volaní Marketing API za 15 dní** (znížené z 1 500),
- **chybovosť pod 15 %** z posledných 500 volaní,
- overenú firmu (Business Verification) a schválenie aplikácie (App Review).

**Čo z toho vyplýva pre Kokpit:** tých 500 volaní je dosiahnuteľných — appka
ťahá kampane, príspevky a štatistiky. Chce to (a) počítať vlastné volania
a ich chybovosť, aby sme vedeli, kedy o Full Access požiadať, a (b) prejsť
overením firmy. Kým to nie je, propagácia príspevku z Kokpitu nepôjde.

## 2 · Rozpočet a učiaca fáza — najdôležitejšie číslo celej rešerše

Od marca 2026 potrebuje kampaň **50 optimalizačných udalostí týždenne**, aby
vyšla z učiacej fázy. PSB má ~3 dopyty MESAČNE. To znamená:

> **Kampaň optimalizovaná na konverzie (dopyty) sa u PSB nikdy nenaučí.**
> Pri troch dopytoch mesačne dostane algoritmus 0,7 signálu týždenne namiesto
> päťdesiatich.

Preto je správne to, čo appka robí dnes: optimalizovať na **kliky na odkaz**
alebo **zobrazenia cieľovej stránky**, nie na konverzie. Nie je to núdzové
riešenie, je to jediné, čo pri tomto objeme dáva zmysel.

Odporúčané rozpočty pre lokálne služby sú 10–20 USD/deň na test (~200–400 Kč),
20–50 USD/deň v konkurenčných trhoch. Naše plánované **140–200 Kč/deň je pri
spodnej hranici** — na čítanie klikov stačí, na čítanie dopytov nie.

## 3 · Cielenie — appka dnes vie priveľa a primálo naraz

Pre lokálnu službu odporúčajú weby **začať úzko**: okruh okolo prevádzky
(3–5 míľ, teda ~5–8 km) alebo mesto, nie celá krajina. Kokpit dnes ponúka len
Česko/Slovensko — to je pre štúdio v Brne priširoké a spáli časť rozpočtu na
ľudí, ktorí nikdy neprídu.

**Čo dorobiť:** Brno + okruh v km. Meta na to potrebuje kľúč miesta zo svojho
číselníka (Targeting Search API), takže to nie je len ďalšie políčko.

Druhá vec: v malom publiku rastie **frekvencia** — tí istí ľudia vidia reklamu
desiatky ráz týždenne. Kokpit by mal frekvenciu sledovať a upozorniť, keď
prekročí ~3.

## 4 · Meranie — tu je najväčšia páka a je už napoly hotová

Odporúčanie 2026 je jednoznačné: **Pixel aj Conversions API súčasne**, tie isté
udalosti s rovnakým `event_id` (Meta ich do 48 h zlúči). Prehliadače a iOS
zahodia 20–40 % udalostí meraných len z prehliadača.

PSB má oboje: pixel aj `meta_capi_token` a appka už serverovú udalosť posiela
(`lead-web.ts`). **Chyba nie je v technike, ale v tom, ČO sa meria:** konverzná
akcia dnes zaznamenáva zobrazenie stránky, nie odoslaný formulár. Udalosť
`Lead` sa má poslať až po ÚSPEŠNOM odoslaní, nie pri kliknutí na tlačidlo a už
vôbec nie pri načítaní stránky.

Toto je ten istý nález, ktorý appka hlási pri Google Ads (299 konverzií vs 13
klientov). Opraviť ho je lacnejšie než čokoľvek iné v tomto zozname a bez neho
sú všetky ostatné čísla nečitateľné.

## 5 · Kreatíva — čo merať a prečo ich Meta chce toľko

Metriky, ktoré appka dnes o reklamách nemá a mať by mala:

| metrika | čo hovorí | pásmo |
|---|---|---|
| **hook rate** (3s videnia ÷ zobrazenia) | či video vôbec zastaví palec | pod 25 % = problém v kreatíve; feed 18–28 %, reels 24–36 % |
| **hold rate** | či vydržia po prvej sekunde | čítať VŽDY spolu s hookom |
| **CTR** | či po pozretí kliknú | medián naprieč odvetviami 2,19 % |
| **CPM** | koľko stojí tisíc zobrazení | globálny medián ~13,5–14,2 USD; ČR býva nižšia |
| **frekvencia** | koľkokrát to ten istý človek videl | nad ~3 pri malom publiku = únava |

Algoritmus si podľa odporúčaní pýta **15–50 aktívnych kreatív**. To je pre PSB
nereálne — a práve preto je **propagácia hotových príspevkov** (bod 1) taká
dôležitá: kreatívy už existujú, majú organický výkon a appka vie, ktoré z nich
ľudia ukladali.

---

## Poradie, v akom to postaviť

1. **Opraviť udalosť `Lead`** (pixel + CAPI, `event_id`, až po odoslaní).
   Bez toho sa nedá čítať nič ďalšie. Nepotrebuje Full Access.
2. **Cielenie na Brno + okruh** v karte Pripraviť kampaň.
3. **Metriky reklám do Kokpitu** — hook rate, hold rate, CTR, CPM, frekvencia
   na úrovni reklamy, nie len kampane.
4. **Počítadlo volaní API + chybovosti** a žiadosť o Full Access.
5. **Propagácia príspevku** — hneď, ako Full Access prejde.
6. **Strážca rozpočtu:** appka nech nedovolí optimalizáciu na konverzie, kým
   nie je aspoň ~50 udalostí týždenne, a nech to povie vetou, nie ticho.

## Zdroje

- Meta for Developers — [Marketing API Access Tier (máj 2026)](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)
- Meta for Developers — [Permissions Reference](https://developers.facebook.com/docs/permissions/)
- Meta for Developers — [Conversion Tracking (Meta Pixel)](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking/)
- [Meta Ads Management for Small Business: 2026 Practitioner's Guide](https://adlibrary.com/posts/meta-ads-management-for-small-business)
- [Meta Ads Best Practices 2026 (Advantage+)](https://optifox.in/blog/meta-ads-best-practices-2026/)
- [Meta Conversions API: Setup, Deduplication & Best Practices (2026)](https://adsuploader.com/blog/meta-conversions-api)
- [Meta Ads Conversions Not Tracking? Fix Guide 2026](https://benly.ai/learn/meta-ads/meta-ads-conversions-not-tracking)
- [Thumbstop Rate (hook) benchmark](https://www.adsights.ai/resources/glossary/metrics/thumbstop-rate-tsr)
- [Meta Ads Benchmarks by Industry 2026](https://superscale.ai/learn/meta-ads-benchmarks-by-industry/)
- [Local Facebook Ads Targeting](https://www.stackmatix.com/blog/local-facebook-ads-targeting)
- [Facebook Ads for Local Services](https://clicksgeek.com/facebook-ads-for-local-services/)
