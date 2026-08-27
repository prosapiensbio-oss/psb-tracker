# Revízia Kokpitu — 27. 8. 2026

Kompletná revízia podľa deviatich priorít (verzia pri štarte 745, po oprave 746).
Stav dát: sessions/payments do 23. 8., Fio do 31. 7., IG do 11. 8., kotva = júl 2026.

## Nálezy s dopadom na čísla

1. **Lievik ukazoval konverziu dopyt→úvodný 100 %; skutočná je 79 %.**
   `pct(uvodne, dopyty)` delil dve rôzne množiny ľudí (úvodné z odporúčaní
   dopyt nemajú) — presne vzor „124 %" z 13. 8., ktorý vlastný komentár v kóde
   odsudzuje. Nezávislé overenie SQL+Python: na úvodný došlo 29–30 z 38
   dopytov. OPRAVENÉ (pct(zDopytuUvodny, dopyty)) + regresný test.
   Kópie: len obrazovka (vrchný pás to už počítal správne — 91 % v inom okne).

2. **Jarvis tvrdil, že „appka nemá break-even za júl"** — dlaždica ho ukazuje
   (189 270). pnlSuhrn v kontexte niesol len polročný priemer. OPRAVENÉ
   (break_even za mesiac v pnlSuhrn), overené naživo po nasadení.

3. **Dlaždica Rezerva nehlásila vek ručného stavu peňazí** — účet+hotovosť
   z 8. 8. (19 dní) sa tvárili ako dnešné. OPRAVENÉ (dátum v podnadpise).

4. **SCHEMA_DB (Jarvisova kópia schémy) nemala stĺpce `mkt_napady.titulka`
   a `uvodne_vety`** — vlastný dlh z 26. 8. (krok 6 reťaze). OPRAVENÉ.
   Nebezpečný smer čistý: žiadny neexistujúci stĺpec v celej schéme.

5. **naostro.sh: dve zlyhania boli chyby KONTROL, nie appky** (4. a 5. prípad):
   kontrola 4 predpokladala otvorené `novy|` (Jerry ich má umlčané), kontrola 1
   čakala `gone|` na novej klientke bez sedení v PTminderi. OPRAVENÉ; beh je
   zelený celý.

6. Drobné: kľúč `poslednéDatum` s diakritikou v /api/merania (bez konzumenta,
   opravený); TEST záver `zmsm8gbrh` v registri (zrušený).

## Čo sedí (overené dvoma cestami)

- Tržby júl 311 800 / aug 149 575 = `payments` na korunu; 0 duplicít dedup_key.
- Zisk júl 133 465 a dlh −132 402: obrazovka = Jarvis.
- Rezerva vnútorne konzistentná (3×178 522−majetok); rozdiel 1 149 Kč medzi
  pozorovaniami je živá cena BTC, nie chyba.
- Faktúra↔banka↔BTC párovanie bráni dvojitému zápisu (overené v kóde,
  vetva rozpisany/pouzite).
- Hlavička „32 nevysvetlených zmien" = DB = notifikácie (ranných „30" bol
  starší stav dát, nie chyba).
- Prekliky: Regina→karta klienta, Kalendár→tabuľka zmien, Dopyty→prepínač
  „len nevyriešené" so správnym riadkom. 3/3 presné.
- Jarvis: prázdne merania priznal, Reginine čísla (5. 8., 60 448 Kč, 6 platieb)
  sedia s kartou.

## Otvorené / na rozhodnutie

- **Augustové „poslané" 1 332 Kč/os.** vychádza zo spoločných nákupov; ručný
  prepočet dal 1 405. Rozdiel ~146 Kč spolu — pravdepodobne hranica mesiaca
  pri párovaní faktúra↔platba. Nedoriešené (pod hranicou nákladov na pátranie).
- „22 dní bez tréningu" (notifikácia) vs „(23 d)" (karta) — dve rátania dní.
- Dopyty: „Konverzia na klienta 90 %" a Referencia 16/16=100 % — čísla sedia,
  ale referenčné dopyty sa často zapisujú spätne (výberové skreslenie zdroja,
  nie chyba výpočtu).

## Nespravené

- Jarvisove AKCIE (spusti-kampan/zastav-kampan) netestované — reklama je
  zámerne stop do septembra, nespúšťal som.
- Mapa cyklu podiely fáz — bez prepočtu (kontrolované v minulých revíziách).
- P&L položky po kategóriách proti Fio riadok po riadku — len vzorka júl.
