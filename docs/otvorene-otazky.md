# Otvorené otázky na Jerryho

Veci, na ktoré som sa pýtal a odpoveď zatiaľ nie je. Nie je to zoznam úloh —
sú to rozhodnutia, ktoré nie sú moje. Keď na niektorú odpovieš, riadok zmizne
a zmena ide do kódu.

Stav k 11. 8. 2026.

---

## 1 · Spustiť `uprav-pnl` naostro?

Pri teste Jarvisa som zapisovacie akcie preveril čítaním celej cesty, ale
nespustil — prostredie mi zablokovalo zápis do živej appky a `uprav-pnl` mení
reálne čísla v P&L.

**Otázka:** chceš, aby som ju spustil naozaj? Spravil by som to na jednej
položke, ktorú presne vrátim späť, a ukázal by som ti pred aj po.

**Prečo to nie je zbytočné:** práve v tejto ceste som našiel dve chyby čítaním
(chýbajúci zámok mesiaca, tichý orez JSONu). Tretiu by odhalil až beh.

---

## 2 · Sviežosť dát z PTmindera — 10 alebo 8 dní?

Appka pýta nový export, keď sú dáta staršie než 10 dní. Ty exportuješ raz
týždenne, takže 10 dní znamená, že jeden vynechaný týždeň nikto nezbadá.

**Otázka:** znížiť prah na 8 dní? Pri 8 sa ozve hneď po prvom vynechanom
týždni; pri 10 až po druhom.

---

## 3 · Kroky mesačnej uzávierky do Jarvisa?

Jediná vec, ktorú Jarvis po doplnení kalendára a marketingu stále nevidí. Dnes
nevie odpovedať na „čo mi ešte chýba do uzávierky júla".

**Otázka:** doplniť ich rovnako ako kalendár? Je to tá istá práca — asi hodina.

---

## 4 · Naďa Khamaziuk — rok narodenia 2036

V exporte z PTmindera má budúci rok. Ručná hodnota má prednosť pred exportom,
takže sa to dá prepísať v ⟦Klienti⟧ (✎ pri klientovi) — ale je to tvoj údaj,
nie môj odhad.

---

## 5 · Odložené na neskôr (tvoje rozhodnutie, nie moja otázka)

Tieto si odložil vedome, sú tu len preto, aby sa nezabudli:

- **Mobilná appka s push notifikáciami** — 3. fáza. Časť P&L sa dnes počíta na
  klientovi, čo notifikácie komplikuje.
- **Klientsky prístup** (klient vidí svoje tempo) — nápad, nie plán.
- **Export uzávierky do PDF** pre účtovníčku.
- **Google Calendar API na zrušené tréningy** — dnes to appka sleduje cez
  rozdiel dvoch stiahnutí iCal, čo funguje od 31. 7. 2026.
- **Vlastná doména** — appka beží na `workers.dev` a funguje; doména je
  kozmetika, nie podmienka.
