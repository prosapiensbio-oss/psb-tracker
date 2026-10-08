# Metriky pre PSB z Jerryho knižnice (výskum 8. 10. 2026)

Zdroj: Jerryho poznámky v `~/Downloads/Tracker literatura/MD pre Jarvisa/` (46 kníh), destiláty `marketing-ramce.md` a `kniznica-index.md`. Mesačný report (`lib/psb/mesacnyReport.ts`) už má: hodiny (aj podľa trénera), klientov, hodiny na klienta, nových, odchody, tržby, náklady, zisk, maržu, break-even, tržbu na hodinu, aplikácie a AI, výplaty, dopyty, konverziu, IG, reklamu, Google profil, zdroje, osobné financie.

## Nové metriky — kandidáti
| # | Metrika | Definícia | Prečo | Kniha |
|---|---|---|---|---|
| 1 | Prežitie prvých 100 dní | podiel nových z M−3, ktorí po 100 dňoch trénujú alebo kúpili 2. balíček | polovica ročných odchodov príde v prvých 100 dňoch | never_lose, seven_pillars |
| 2 | Retencia po 6 mesiacoch (štvrťročne) | podiel kohorty spred 6 mes., ktorá v poslednom mesiaci trénovala | Jerryho cieľ 80 % | measure_what_matters, loyalty_effect, fighting_churn |
| 3 | Odchody v % + výpadok tržieb | odišlí / priemer aktívnych; tržby, ktoré odišli s nimi | štandardný a tržbový churn | fighting_churn |
| 4 | Obnova balíčkov | podiel balíčkov skončených v mesiaci, po ktorých do 30 dní prišiel nový | opakovaná platba je najcennejší príjem | money_models, built_to_sell |
| 5 | Hodnota klienta za celú spoluprácu (štvrťročne) | priemerné tržby od odišlých + priemerná dĺžka | najdôležitejšia miera podľa Reichhelda | loyalty_effect, digital_marketing |
| 6 | Vyťaženie voči stropu | hodiny trénera / jeho dohodnutý mesačný strop | robiť menej; pri pretečení delegovať alebo „nie" | eos_life, company_of_one |
| 7 | Rezerva v mesiacoch | zostatok na účtoch / priemerné mesačné výdavky vrátane výplat | zisk nie sú peniaze; prah ≥ 3 mesiace | small_biz_cashflow, profit_first |
| 8 | Predplatené vs. dlžné hodiny v Kč | hodnota zaplatených neodtrénovaných hodín vs. mínusové hodiny | peniaze na účte ešte nie sú zarobené | financial_intelligence, built_to_sell |
| 9 | Aplikácie a AI ako % tržieb a Kč/hodinu + štvrťročné P/R/U | | „overhead = death"; škrt 10 % | profit_first, company_of_one, pumpkin_plan |
| 10 | Profit First rozdelenie (štvrťročne) | skutočné % tržieb na zisk / odmeny / daň / prevádzku vs cieľ 5/50/15/30 | posun 1–3 p. b. za štvrťrok | profit_first |
| 11 | Koncentrácia (štvrťročne) | podiel top klienta a top 20 % na tržbách, podiel Jerryho na hodinách | žiadny klient nad 15 %; závislosť na zakladateľovi | built_to_sell, how_brands_grow, emyth |
| 12 | Lievik po krokoch | dopyty → úvodné → klienti, konverzia každého kroku | kde sa lievik láme | emyth, built_to_sell |
| 13 | Referral číslo (štvrťročne) | podiel aktívnych, ktorí za 12 mes. niekoho priviedli; retencia podľa zdroja | odporúčania sú hlavný zdroj | referral_engine, loyalty_effect |
| 14 | Cena za nového klienta podľa kanála a návratnosť | reklama / noví z reklamy vs. ich tržby za 30 dní a celkom | zisk za 30 dní má pokryť získanie | digital_marketing, money_models |
| 15 | Osobné: miera úspor, osobná rezerva, „číslo dosť" | (príjem − výdavky) / príjem | koľko musí firma vyplácať | profit_first (kap. 10), company_of_one |

## Break-even
Knihy explicitný vzorec nedávajú; skladá sa z financial_intelligence (mzdy sú náklad), small_biz_cashflow (fix/variabilné), impact_pricing (break-even je test prežitia, nie podklad pre cenu), profit_first. Kokpit `breakEvenRad` = náklady bez výplat + NÁROK trénerov (plný break-even). Návrh: ukazovať aj prevádzkový (bez odmien zakladateľov).

## Prahy z kníh
Rezerva ≥ 3 mesiace · Profit First do 250k USD: zisk 5 / odmeny 50 / daň 15 / prevádzka 30 · žiadny klient nad 15 % tržieb · +5 p. b. retencie = +25–100 % zisku; cieľ 80 % po 6 mes. · zisk z nového klienta za 30 dní ≥ náklad na jeho získanie.
