# Kontrolné prompty

**Texty promptov žijú v `app/src/lib/psb/kontrolnePrompty.ts`, nie tu.**
Register pri každej mesačnej kontrole ponúka tlačidlo „Prompt pre Clauda" —
skopíruje protokol + prompt oblasti a vloží sa do Claude Code v repe appky.
Tento dokument je rozcestník, nie druhá kópia (dve kópie by po prvej zmene
prestali sedieť — viď „Tvar zadania žije na dvoch miestach" v CLAUDE.md).

## Rytmus

| kedy | čo | kde |
|---|---|---|
| 1. týždeň mesiaca | Peniaze | pripomienka v registri → tlačidlo |
| 2. týždeň | Klienti & register | pripomienka → tlačidlo |
| 3. týždeň | Marketing & web | pripomienka → tlačidlo |
| 4. týždeň | Jarvis & dáta | pripomienka → tlačidlo |
| raz za kvartál | úplná revízia | `docs/revizny-prompt.md` |

Mesačná kontrola je čítanie prístrojov: hovorí appka pravdu o tom, čo už
viem? Trvá desiatky minút. Kvartálna revízia je audit: hľadá to, o čom
neviem. Trvá hodiny. Preto sú to dva rôzne prompty a nie jeden.

## Čo mesačné kontroly zámerne NEPOKRÝVAJÚ

Triedy chýb, ktoré nepatria žiadnej oblasti a menia sa pomaly — statický text
zapečený v builde, kópie tej istej pravdy mimo databázy (aiContext,
jarvis_vedomosti, pamäť Claude Projectu), redundancie, zápisy, ktoré ticho
zlyhajú. Tie hľadá kvartálna revízia. Keby boli aj v mesačných, kontrola by
trvala hodinu a nerobila by sa.
