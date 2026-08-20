# Žiadosť o Full Access pre Marketing API

**Pripravené 19. 8. 2026.** Podáva Jerry — appka to za neho spraviť nemôže.

## Načo to je

Jediná vec, ktorú Kokpit bez Full Access nevie: **propagovať príspevok tak, aby
sa reklamou stal TEN ISTÝ príspevok** aj s lajkami a komentármi, ktoré už má.

Bez neho appka funguje: stiahne z príspevku obrázok alebo video aj text
a poskladá rovnako vyzerajúcu reklamu. Chýba jediné — **sociálny dôkaz**.
Reklama začína na nule namiesto toho, aby ukazovala, že príspevok už niekoho
zaujal.

**Nie je to blokujúce.** Kód na pravý boost je hotový a appka ho skúša ako
prvý; v deň, keď Full Access dorazí, prepne sa naň sama.

## Čo Meta chce

| podmienka | stav k 19. 8. 2026 |
|---|---|
| 500 volaní Marketing API za 15 dní | **82** (a väčšina z dnešného testovania — bežný deň má ~5) |
| chybovosť pod 15 % | **4,9 %** ✓ |
| appka v režime Live | ✓ publikované 19. 8. |
| overená firma (Business Verification) | over v Business Settings |

Tých 500 volaní je hlavná prekážka. Pri bežnom používaní appka spraví ~5 denne,
teda 75 za pätnásť dní — na 500 by nedošla nikdy. **Volania rastú tým, že sa
appka používa:** každé stiahnutie kampaní, príspevkov a metrík sa počíta.
Počítadlo je v Kokpite pri paneli Meta.

## Kde sa žiada

1. <https://developers.facebook.com/apps> → aplikácia **Kokpit** (`1038839719119872`)
2. Vľavo **App Review → Permissions and Features**
3. Nájsť **Ads Management Standard Access** a kliknúť *Request*

## Čo do žiadosti napísať

Meta chce vidieť, že appka rieši skutočnú potrebu, nie že obchádza pravidlá.
Podstata (po anglicky, Meta slovenčinu nečíta):

> Kokpit is an internal tool for a single fitness studio in Brno, Czech
> Republic. It connects our PTminder client records with Meta Ads spend so we
> can measure cost per acquired client — something Ads Manager cannot do,
> because it does not know who became a paying client.
>
> We need Ads Management Standard Access to promote our own existing Instagram
> posts as ads. The app already creates campaigns, ad sets, creatives and ads
> in PAUSED state; a human reviews and activates them in Ads Manager. We
> promote only our own organic posts from our own account, on our own ad
> account, for our own business. There is no third-party access and no other
> user of the app.

Doplniť treba **screencast**, ako sa v appke pripravuje kampaň — Meta ho žiada
takmer vždy. Stačí nahrávka obrazovky: Marketing → Kampaň → vyplniť → založiť →
ukázať, že v Ads Manageri je kampaň POZASTAVENÁ.

## Čo očakávať

Rozhodnutie chodí do **Alert Inbox** v aplikácii a mailom. Býva to niekoľko dní
až dva týždne. Pri zamietnutí povedia dôvod a dá sa podať znova.
