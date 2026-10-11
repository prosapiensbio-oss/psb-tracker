# Kontrolné prompty

**Texty promptov žijú v `app/src/lib/psb/kontrolnePrompty.ts`, nie tu.**
Od 11. 10. 2026 sú na JEDNOM mieste: Workspace → Uzávierka mesiaca →
Mesačné kontroly → karta „Zdravie Kokpitu", riadok „dať Claudovi na
kontrolu". Prompt nesie aj KONTEXT (`promptSKontextom`): kontrolovaný
mesiac a to, čo appka našla sama, takže Claude nezačína od nuly.
Tento dokument je rozcestník, nie druhá kópia (dve kópie by po prvej zmene
prestali sedieť — viď „Tvar zadania žije na dvoch miestach" v CLAUDE.md).

## Rytmus

| kedy | čo | kde |
|---|---|---|
| pri uzávierke, podľa potreby | Peniaze · Klienti · Marketing · Jarvis | karta Zdravie Kokpitu → tlačidlo |
| raz za kvartál | úplná revízia | `docs/revizny-prompt.md` |

**Štyri týždenné pripomienky sú zrušené** (Jerry, 11. 10. 2026: „mesačná
kontrola ako zoznam úloh nemá existovať vôbec"). Boli to domáce úlohy pre
Jerryho na prácu, ktorú Workspace robí priebežne — a odklepnúť sa dali bez
toho, aby sa čokoľvek spravilo. Prompty zostali, lebo tie nikdy neboli
úloha pre neho: appku overiť vie len ten, kto vidí do kódu a databázy.

Mesačná kontrola je čítanie prístrojov: hovorí appka pravdu o tom, čo už
viem? Trvá desiatky minút. Kvartálna revízia je audit: hľadá to, o čom
neviem. Trvá hodiny. Preto sú to dva rôzne prompty a nie jeden.

## Čo mesačné kontroly zámerne NEPOKRÝVAJÚ

Triedy chýb, ktoré nepatria žiadnej oblasti a menia sa pomaly — statický text
zapečený v builde, kópie tej istej pravdy mimo databázy (aiContext,
jarvis_vedomosti, pamäť Claude Projectu), redundancie, zápisy, ktoré ticho
zlyhajú. Tie hľadá kvartálna revízia. Keby boli aj v mesačných, kontrola by
trvala hodinu a nerobila by sa.
