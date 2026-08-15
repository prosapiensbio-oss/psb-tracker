# Úprava webu prosapiens.cz — pracovný zoznam

Vznikol 15. 8. 2026 z auditu 79 stránok a 432 vnútorných odkazov (podrobnosti
v [`zoznam-marketing.md`](zoznam-marketing.md), časť G). Jerry: *„chcem aby si
to robil sám a odškrtával z neho položky."*

Poradie je podľa pomeru úžitok / riziko, nie podľa veľkosti. Úlohy sú
rozdelené tak, aby sa každá dala dokončiť a overiť samostatne — polovica
prepísaných meta popisov je horšia než žiadny, lebo sa k tomu nikto nevráti.

**Pravidlo overenia:** žiadna položka sa neodškrtne na základe toho, že som
klikol. Odškrtne sa až po kontrole zvonku — stiahnutím stránky ako obyčajný
návštevník, bez prihlásenia.

---

## Hotové

| | čo sa stalo | overené ako |
|---|---|---|
| ✅ **Slider Revolution vypnutý na článkoch** | 7 súborov, 546 kB z každého článku | stiahnutie troch článkov bez prihlásenia: `revslider` sa nevyskytuje ani raz; úvodná stránka slider ďalej má |

---

## Robím ja

### 1 · Skrátiť šablónu titulkov v Yoaste
Na koniec každého titulku sa pridáva „- ProSapiens Biomechanic" = 24 znakov.
18 titulkov preto prerastie 60 znakov a Google ich odsekne.

**Plán:** u typu *Příspěvky* (45 článkov, tam sú tie dlhé titulky) nechať
`%%title%%` bez prípony. U *Stránky* nechať značku, ako je — na `sluzby`,
`kontakt` a úvodnej má rozpoznateľnosť značky cenu, a tie titulky sú krátke.

**Stav:** nové nastavenia Yoastu sú jednostránková aplikácia, ktorá mimo
prehliadača nedrží navigáciu medzi sekciami. Skúsim to cez staršiu adresu
`admin.php?page=wpseo_titles`, prípadne priamo v poli SEO titulku pri
najzasiahnutejších článkoch.

### 2 · Meta popisy pre 14 stránok
`gdpr` · `skupinovy-trenink` · `lekce-fascialni-svoboda` · `sluzby` ·
`obchodni-podminky` · `podekovani` · `jerry` · `terezia` · `matyas` ·
`doporucene-pomucky` · `informace-po-uvodnim-treninku` · `dychani` (+2)

Rozdelené na tri dávky, aby sa dalo priebežne overovať:
- **2a** služby a peniaze: `sluzby`, `skupinovy-trenink`, `dychani`, `lekce-fascialni-svoboda`
- **2b** ľudia: `jerry`, `terezia`, `matyas`
- **2c** zvyšok: `gdpr`, `obchodni-podminky`, `podekovani`, `doporucene-pomucky`, `informace-po-uvodnim-treninku`

Popisy píšem na symptóm a ďalší krok, nie na predstavovanie. Návrh ukážem
pred vložením len u 2a — tam sa predáva.

### 3 · LocalBusiness schema
Na webe nie je nikde. Údaje mám z kontaktnej stránky:
ProSapiens Biomechanic · Fanderlíková 70, 616 00 Brno – Žabovřesky ·
+420 702 147 704 · info@prosapiens.cz

Vloží sa ako JSON-LD cez plugin *Snippety*, ktorý na webe už je — bez ďalšieho
pluginu. **Otváracie hodiny na webe nie sú, takže ich do schémy nedám**;
vymyslené hodiny sú horšie než žiadne.

### 4 · Alt texty
512 obrázkov bez altu. Po dávkach podľa návštevnosti, nie podľa abecedy:
- **4a** `deep-front-line` (43), `arm-lines` (22), `spiral-line` (16)
- **4b** `superficial-front-line` (19), `superficial-back-line` (18), `biotensegrita` (23)
- **4c** zvyšok podľa zobrazení

Anatomické obrázky sa opisujú tým, čo na nich je (ktorá línia, ktorý sval) —
nie „obrázok fascie". Toto je jediná vec, ktorú Google o obrázku vie.

### 5 · Zmazať neaktívne pluginy a šablónu
2 neaktívne pluginy, 1 neaktívna šablóna. Kód leží na serveri, neaktualizuje
sa a dá sa cez neho útočiť. **Až po tom, čo fungujú zálohy mimo servera** (H1
nižšie) — mazanie je nezvratné.

### 6 · Aktualizovať 24 pluginov
**Zámerne posledné a až po zálohách.** 24 aktualizácií naraz na webe s 25
pluginmi je najpravdepodobnejší spôsob, ako ho dnes rozbiť. Po dávkach, po
každej kontrola úvodnej, `sluzby` a `kontakt`.

### 7 · Poriadok v H1 *(najneskôr, možno vôbec)*
68 z 79 stránok nemá práve jeden H1; úvodná má deväť. Robí to šablóna
SetupFolio a WPBakery, takže oprava znamená zásah do šablóny — to je riziko
neúmerné úžitku. Preberieme, keď bude zvyšok hotový.

---

## Potrebujem Jerryho

### H1 · Zálohy mimo servera *(najsúrnejšie z celého zoznamu)*
UpdraftPlus zálohuje (posledná 12. 8.), ale cieľ je **OneDrive, ktorý vyžaduje
Premium** — a to vypršalo. Zálohy preto zostávajú na tom istom serveri ako web.

**Čo od teba treba:** jeden klik, ktorým povolíš prístup. Prihlásenie do Google
alebo Dropboxu ja urobiť nemôžem a nechcem — heslá nezadávam. Nastavím všetko
ostatné a zastavím sa presne pred tlačidlom „Authenticate".

### H2 · Kam má viesť odkaz „individuální trénink"
`/individualni-trenink/` vracia 404 a odkazujú naň tri stránky vrátane
**Služby**. Taká stránka na webe neexistuje — existujú `uvodni-trenink`,
`online-trenink` a `skupinovy-trenink`, individuálny nie.

**Odpovedz jedným slovom:**
- **„úvodní"** → prepíšem odkazy na `/uvodni-trenink/` (je to vstup do 1:1 práce, takže to sedí a je to hotové za päť minút) ← toto odporúčam
- **„vytvor"** → treba novú stránku o individuálnom tréningu; napíšem návrh textu a pošlem na schválenie
- **„iné"** → povedz kam

### H3 · DMARC záznam v DNS
SPF máš, DMARC nie. Bez neho chodia maily z webu horšie (aj upozornenie na nový
dopyt) a tvoju doménu môže hocikto použiť na podvrhnuté maily.

**Čo od teba treba:** pridať u správcu domény jeden TXT záznam. Do DNS nemám
prístup a ani si o ten prístup nežiadam.

```
názov:   _dmarc.prosapiens.cz
typ:     TXT
hodnota: v=DMARC1; p=none; rua=mailto:info@prosapiens.cz
```

`p=none` znamená „nič neblokuj, len mi hlás". To je správny prvý krok —
najprv mesiac pozorovať, kto tvojím menom posiela, a až potom priťahovať.

---

## Rozhodnuté, že sa nerobí

| | |
|---|---|
| **Vypnúť Wordfence** | Jerryho návrh 15. 8. Zamietam a vysvetlil som prečo: blokovanie sa netýkalo webu, ale mojej IP pri 500 požiadavkách za minútu, a samo vyprší. Wordfence navyše skrýva `wp-admin` pred neprihlásenými. Vypnúť ochranu, aby sa mne ľahšie sťahovalo, je zlá výmena — a audit sa dá spraviť pomalšie |
