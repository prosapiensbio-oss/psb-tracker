// HISTÓRIA — NIE ZDROJ PRAVDY (od 17. 8. 2026).
//
// Čísla a kategórie sa berú zo ŽIVEJ tabuľky `ig_prispevky` (Meta API, 265
// kusov). Tento súbor zostáva pre obdobie, ktoré API nedáva, a ako doklad
// o tom, ako sa príspevky zaraďovali kedysi — ale do kontextu ide len vtedy,
// keď živý zdroj ešte nie je načítaný.
//
// Prečo: v rovnakom okne sa obe strany zhodli na 62 % príspevkov. Pri
// „Vyvrátení mýtu" hovoril tento súbor 33 kusov, živá tabuľka 13 — a Jarvis
// podľa toho odporučil kategóriu, ktorá je podľa živých dát najslabšia.
//
// Príspevky s textom z Metricoolu (jan 2025 – jún 2026) — 114 kusov, každý
// zaradený podľa toho, ČÍM ZAČÍNA. Hook je jediná vec, ktorá rozhoduje, či to
// niekto dopozerá, a zároveň jediné, čo sa dá triediť: podľa hashtagov to
// nejde, v každom príspevku sú skoro všetky.
//
// Kategórie nie sú vymyslené, sú vytiahnuté z reálnych prvých viet:
//   Klientsky príbeh  — začína menom klienta („Michal přišel bez očekávání.")
//   Vyvrátenie mýtu   — popiera bežné presvedčenie („Absence bolesti není zdraví")
//   Staccato výpočet  — tri krátke vety za sebou („Prkno. Sklapovačky. Plank.")
//   Otázka            — prvá veta končí otáznikom
//   Edukácia          — všetko ostatné, typicky anatómia a princípy
//
// vr = view rate (% ľudí, čo pozerali aspoň 3 s). Pri postoch sa nemeria.
export type ObsahRiadok = { m: string; f: "Reel" | "Post"; k: string; h: string; u: number; v: number; z: number; vr: number };

export const MKT_OBSAH: ObsahRiadok[] = [
  { m: "2025-01", f: "Reel", k: "Edukácia", h: "Silový trénink: Evoluce vs. mýty dnešní doby", u: 3, v: 694, z: 1, vr: 32.2 },
  { m: "2025-01", f: "Reel", k: "Edukácia", h: "Proč klasická rehabilitace prostě nestačí❓", u: 1, v: 732, z: 1, vr: 34.7 },
  { m: "2025-01", f: "Reel", k: "Vyvrátenie mýtu", h: "Rok 2024 byl pro nás v @prosapiens.biomechanic rokem různých skúseností, inovací a posouvá", u: 2, v: 1275, z: 2, vr: 36.2 },
  { m: "2025-01", f: "Post", k: "Edukácia", h: "Příběh lidského těla: Proč je pohyb klíčem ke zdraví", u: 3, v: 729, z: 1, vr: 0.0 },
  { m: "2025-02", f: "Reel", k: "Edukácia", h: "Chceš se zbavit bolestí při chůzi a zlepšit své držení těla jednou provždy? 🚶‍♂️", u: 2, v: 631, z: 0, vr: 35.8 },
  { m: "2025-02", f: "Reel", k: "Edukácia", h: "🧍‍♂️ Správné držení těla ovlivňuje zdraví více, než si myslíme! 🧍‍♀️", u: 4, v: 1143, z: 1, vr: 40.1 },
  { m: "2025-02", f: "Post", k: "Edukácia", h: "Trénink, který dává smysl ☝🏻", u: 0, v: 1194, z: 1, vr: 0.0 },
  { m: "2025-02", f: "Post", k: "Vyvrátenie mýtu", h: "Kvalita pohybu je klíčem k dlouhodobému zdraví a sebevědomí. Držení těla ovlivňuje nejen f", u: 0, v: 847, z: 0, vr: 0.0 },
  { m: "2025-03", f: "Reel", k: "Edukácia", h: "📌 Trénink v těhotenství – příprava na porod i regeneraci po něm", u: 0, v: 728, z: 1, vr: 51.2 },
  { m: "2025-03", f: "Reel", k: "Edukácia", h: "🔍 BODY SCANNING: TRÉNINK, KTERÝ TĚ NAUČÍ VNÍMAT SVÉ TĚLO", u: 0, v: 621, z: 1, vr: 26.7 },
  { m: "2025-03", f: "Reel", k: "Edukácia", h: "🔥 Bolest krku nebo ramen? Možná je problém ve tvých Arm Lines!", u: 3, v: 740, z: 1, vr: 40.2 },
  { m: "2025-03", f: "Reel", k: "Edukácia", h: "🤲 ARM LINES – SKRYTÝ KLÍČ KE ZDRAVÝM RAMENŮM A KRKU", u: 3, v: 702, z: 1, vr: 29.7 },
  { m: "2025-03", f: "Post", k: "Edukácia", h: "🧬 Mechanotransdukce: Proč záleží na tom, jak se hýbeš", u: 3, v: 879, z: 1, vr: 0.0 },
  { m: "2025-04", f: "Reel", k: "Edukácia", h: "Deadlift je často prezentován jako základní cvik pro rozvoj síly zadní části těla, ale jeh", u: 2, v: 1064, z: 1, vr: 49.7 },
  { m: "2025-04", f: "Post", k: "Edukácia", h: "Rotace – strašák, nebo klíč k lepšímu pohybu? 🔁", u: 1, v: 1070, z: 1, vr: 0.0 },
  { m: "2025-04", f: "Post", k: "Edukácia", h: "Funkční biomechanika & Bitcoin", u: 2, v: 1217, z: 4, vr: 0.0 },
  { m: "2025-04", f: "Post", k: "Staccato výpočet", h: "Ne každá bolest zad má jasnou příčinu. Ale každá má svůj vzorec pohybu. ☝🏻", u: 1, v: 878, z: 0, vr: 0.0 },
  { m: "2025-05", f: "Reel", k: "Edukácia", h: "Co je to vlastně ekonomika pohybu? 🤔", u: 1, v: 714, z: 2, vr: 27.7 },
  { m: "2025-05", f: "Reel", k: "Klientsky príbeh", h: "Jarek je s námi od úplného začátku. Přišel ve chvíli, kdy už vyzkoušel všechno – silový tr", u: 8, v: 1251, z: 2, vr: 50.7 },
  { m: "2025-05", f: "Reel", k: "Edukácia", h: "Když se podíváme na děti, často si myslíme, že jejich tělo je pružné, bezproblémové a přir", u: 1, v: 782, z: 1, vr: 43.8 },
  { m: "2025-05", f: "Post", k: "Vyvrátenie mýtu", h: "🤰✨ Když Terezka přichází na trénink se svou těhotnou Sylvii, každý pohyb získává úplně nov", u: 1, v: 963, z: 2, vr: 0.0 },
  { m: "2025-06", f: "Reel", k: "Vyvrátenie mýtu", h: "@functionalpatterns je více než trénink. Není to o nazvedaných kilách o odrobených sériích", u: 3, v: 1088, z: 1, vr: 46.7 },
  { m: "2025-06", f: "Reel", k: "Vyvrátenie mýtu", h: "Spousta lidí dře v posilovně… a přesto trpí bolestmi.", u: 1, v: 511, z: 1, vr: 25.4 },
  { m: "2025-06", f: "Post", k: "Edukácia", h: "Pohyb mimo osu 🏃🏻‍♂️❌", u: 2, v: 1318, z: 3, vr: 0.0 },
  { m: "2025-06", f: "Post", k: "Otázka", h: "Jak vypadá trénink u nás?", u: 1, v: 1122, z: 0, vr: 0.0 },
  { m: "2025-06", f: "Post", k: "Edukácia", h: "💡 STRES a TVOJE DRŽENÍ TĚLA – VÍC SOUVISÍ, NEŽ SI MYSLÍŠ!", u: 6, v: 1154, z: 2, vr: 0.0 },
  { m: "2025-07", f: "Reel", k: "Edukácia", h: "🧠 Zánět, strava, pohyb", u: 0, v: 728, z: 1, vr: 36.4 },
  { m: "2025-07", f: "Post", k: "Otázka", h: "Myslíš si, že tvoje tělo je „rovné“?", u: 1, v: 1088, z: 1, vr: 0.0 },
  { m: "2025-07", f: "Post", k: "Edukácia", h: "Každý detail pohybu něco říká.", u: 0, v: 1231, z: 2, vr: 0.0 },
  { m: "2025-07", f: "Post", k: "Vyvrátenie mýtu", h: "🧍‍♂️ Můžeš být silný, ale pokud stojíš na nestabilních základech, každé další cvičení tě m", u: 2, v: 1072, z: 0, vr: 0.0 },
  { m: "2025-08", f: "Reel", k: "Edukácia", h: "🧠 U nás nejde o cviky. Jde o to, jak přemýšlíme nad pohybem.", u: 0, v: 591, z: 2, vr: 45.6 },
  { m: "2025-08", f: "Reel", k: "Vyvrátenie mýtu", h: "🌀 Nestačí jen protáhnout", u: 5, v: 560, z: 0, vr: 25.9 },
  { m: "2025-08", f: "Reel", k: "Vyvrátenie mýtu", h: "🟤 Tohle není klasický trénink.", u: 4, v: 770, z: 4, vr: 44.6 },
  { m: "2025-08", f: "Reel", k: "Vyvrátenie mýtu", h: "👀 Odstávající lopatky? Není to jen kosmetický detail.", u: 3, v: 621, z: 2, vr: 27.9 },
  { m: "2025-08", f: "Post", k: "Edukácia", h: "🪑 Sedneš si – a tělo se zhroutí.", u: 2, v: 1360, z: 2, vr: 0.0 },
  { m: "2025-08", f: "Post", k: "Otázka", h: "🔥 Táhne tě mezi lopatkami?", u: 5, v: 1319, z: 0, vr: 0.0 },
  { m: "2025-09", f: "Reel", k: "Otázka", h: "🦶 Stojíš na vlastních základech?", u: 2, v: 449, z: 0, vr: 28.0 },
  { m: "2025-09", f: "Reel", k: "Edukácia", h: "🎯 Když trénujete u nás, netlačíme vás do výkonu.", u: 1, v: 520, z: 0, vr: 39.0 },
  { m: "2025-09", f: "Reel", k: "Klientsky príbeh", h: "Regina prišla s vážnym problémom – výhřez ploténky a obdobie, keď nebola schopná normálne ", u: 1, v: 997, z: 0, vr: 40.8 },
  { m: "2025-09", f: "Reel", k: "Edukácia", h: "🌀 Tvoje tělo si pamatuje každý pohyb. Ale i každou nečinnost.", u: 2, v: 453, z: 1, vr: 25.1 },
  { m: "2025-09", f: "Reel", k: "Klientsky príbeh", h: "Jarek podniká už více než 18 let. Dlouhé hodiny v autě, stres, málo času na sebe.", u: 1, v: 682, z: 1, vr: 40.9 },
  { m: "2025-09", f: "Reel", k: "Otázka", h: "🩻 Bolí vás koleno nebo záda?", u: 2, v: 509, z: 0, vr: 37.3 },
  { m: "2025-09", f: "Reel", k: "Edukácia", h: "📌 Pánev dopředu, břicho ven, prohnutá bedra.", u: 3, v: 1004, z: 2, vr: 28.3 },
  { m: "2025-09", f: "Post", k: "Vyvrátenie mýtu", h: "Biomechanika není pro každého. A právě v tom je její síla.", u: 3, v: 1515, z: 1, vr: 0.0 },
  { m: "2025-09", f: "Post", k: "Vyvrátenie mýtu", h: "Žádné tělo není stejné❗️", u: 2, v: 1227, z: 0, vr: 0.0 },
  { m: "2025-10", f: "Reel", k: "Edukácia", h: "🌬️ Ribs Flare – když žebra trčí ven", u: 2, v: 640, z: 2, vr: 29.7 },
  { m: "2025-10", f: "Reel", k: "Vyvrátenie mýtu", h: "Silvie věděla, že nechce jen „přežít“ s bolestí zad.", u: 1, v: 673, z: 1, vr: 34.9 },
  { m: "2025-10", f: "Reel", k: "Otázka", h: "💡 Bolí vás při pohybu záda, kyčle nebo ramena?", u: 1, v: 647, z: 1, vr: 26.8 },
  { m: "2025-10", f: "Reel", k: "Klientsky príbeh", h: "Jarek není profesionální sportovec. Je to člověk jako každý z nás – práce, rodina, povinno", u: 4, v: 756, z: 1, vr: 39.7 },
  { m: "2025-10", f: "Post", k: "Vyvrátenie mýtu", h: "Držení těla není o síle – ale o napětí, které drží tvou fasciální síť v rovnováze.", u: 2, v: 1172, z: 0, vr: 0.0 },
  { m: "2025-10", f: "Post", k: "Edukácia", h: "Možná za to nemohou tvoje svaly – ale tvoje fascia.", u: 3, v: 1177, z: 1, vr: 0.0 },
  { m: "2025-11", f: "Reel", k: "Vyvrátenie mýtu", h: "🦵 Nohy do X nejsou jen „dětský problém“", u: 2, v: 589, z: 0, vr: 30.2 },
  { m: "2025-11", f: "Reel", k: "Edukácia", h: "💡 Silný krk = stabilní tělo", u: 3, v: 669, z: 2, vr: 30.6 },
  { m: "2025-11", f: "Reel", k: "Edukácia", h: "👀 Předsunutá hlava je typická známka špatného držení těla. Často si to ani neuvědomujeme –", u: 1, v: 473, z: 0, vr: 46.3 },
  { m: "2025-11", f: "Reel", k: "Vyvrátenie mýtu", h: "Bolesti zad nejsou jen problémem dospělých s kancelářskou prací.", u: 2, v: 515, z: 1, vr: 32.5 },
  { m: "2025-11", f: "Reel", k: "Edukácia", h: "💡 Síla ≠ těžké váhy", u: 2, v: 965, z: 2, vr: 32.8 },
  { m: "2025-11", f: "Post", k: "Staccato výpočet", h: "❌ Síla ≠ Funkce. A tělo to dobře ví.☝🏻", u: 1, v: 972, z: 1, vr: 0.0 },
  { m: "2025-12", f: "Reel", k: "Edukácia", h: "Rok 2025 byl pro nás silný.", u: 3, v: 791, z: 1, vr: 47.5 },
  { m: "2025-12", f: "Reel", k: "Edukácia", h: "Tělo si nebere volno.", u: 2, v: 967, z: 3, vr: 52.0 },
  { m: "2025-12", f: "Reel", k: "Edukácia", h: "Jsme @prosapiens.biomechanic", u: 5, v: 881, z: 1, vr: 46.2 },
  { m: "2025-12", f: "Reel", k: "Vyvrátenie mýtu", h: "🎄 Letos můžeš darovat víc než jen věc.", u: 0, v: 327, z: 0, vr: 0.0 },
  { m: "2025-12", f: "Reel", k: "Edukácia", h: "🔥 Když se záda hrbí, mění se celý život.", u: 1, v: 562, z: 1, vr: 40.7 },
  { m: "2025-12", f: "Post", k: "Edukácia", h: "🎄Vánoce jsou ideální chvílí zpomalit a zamyslet se nad tím, jak se ve svém těle vlastně cí", u: 0, v: 1577, z: 2, vr: 0.0 },
  { m: "2025-12", f: "Post", k: "Edukácia", h: "Tělo nezapomíná !", u: 4, v: 965, z: 0, vr: 0.0 },
  { m: "2026-01", f: "Reel", k: "Edukácia", h: "💪 Síla u nás nevzniká náhodou. A už vůbec ne bez kontextu.", u: 1, v: 899, z: 1, vr: 55.8 },
  { m: "2026-01", f: "Reel", k: "Edukácia", h: "Nejde o to, že by existovalo nekonečně mnoho správných cest.", u: 2, v: 576, z: 0, vr: 31.6 },
  { m: "2026-01", f: "Reel", k: "Edukácia", h: "↪️ Každý z nás má trochu křivou páteř.", u: 0, v: 656, z: 2, vr: 33.9 },
  { m: "2026-01", f: "Reel", k: "Vyvrátenie mýtu", h: "Trénink u nás nevypadá tak, že trenér „říká cviky“ a klient je jen vykonává. 🏋", u: 2, v: 871, z: 1, vr: 48.8 },
  { m: "2026-01", f: "Reel", k: "Edukácia", h: "🚶‍♂️ Hip Hike – když pánev poskakuje", u: 4, v: 552, z: 0, vr: 33.9 },
  { m: "2026-01", f: "Reel", k: "Vyvrátenie mýtu", h: "Většina lidí chce být silná. 💪", u: 1, v: 491, z: 2, vr: 24.9 },
  { m: "2026-01", f: "Post", k: "Edukácia", h: "Nejde o to, kolik cviků zvládneš.", u: 2, v: 1105, z: 2, vr: 0.0 },
  { m: "2026-01", f: "Post", k: "Edukácia", h: "Cvičíš pravidelně. 💪", u: 2, v: 975, z: 1, vr: 0.0 },
  { m: "2026-02", f: "Reel", k: "Vyvrátenie mýtu", h: "Na Slovensku a v Česku stále není mnoho trenérů, kteří by se systematicky věnovali zlepšov", u: 2, v: 517, z: 0, vr: 28.8 },
  { m: "2026-02", f: "Reel", k: "Vyvrátenie mýtu", h: "Změna pohybových návyků není o počtu opakování, ale o změně vnímání. Příběh našeho klienta", u: 2, v: 590, z: 2, vr: 33.6 },
  { m: "2026-02", f: "Reel", k: "Otázka", h: "Proč se držení těla někdy zhoršuje dřív, než se zlepší?", u: 2, v: 1330, z: 3, vr: 39.5 },
  { m: "2026-02", f: "Reel", k: "Edukácia", h: "Nepřišel proto, že by chtěl víc svalů nebo lepší výkon.", u: 5, v: 1065, z: 1, vr: 43.8 },
  { m: "2026-02", f: "Reel", k: "Vyvrátenie mýtu", h: "Nejde jen o trénink.", u: 4, v: 719, z: 12, vr: 34.3 },
  { m: "2026-02", f: "Post", k: "Edukácia", h: "Člověk, který nikdy nebyl „fyzický typ\". Dnes trénuje roky.", u: 1, v: 500, z: 0, vr: 0.0 },
  { m: "2026-02", f: "Post", k: "Edukácia", h: "Tvoje tělo nebylo navržené k tomu, aby celý den stálo nebo sedělo na místě. Ale přesně to ", u: 2, v: 538, z: 0, vr: 0.0 },
  { m: "2026-02", f: "Post", k: "Klientsky príbeh", h: "Natálií nešlo o jednu velkou bolest.", u: 0, v: 779, z: 0, vr: 0.0 },
  { m: "2026-03", f: "Reel", k: "Edukácia", h: "Odpověd Kamilovi", u: 4, v: 858, z: 4, vr: 40.0 },
  { m: "2026-03", f: "Reel", k: "Edukácia", h: "Když se někdo dívá na naše videa, může mít pocit, že bez speciálních nástrojů to nepůjde.", u: 2, v: 467, z: 0, vr: 32.1 },
  { m: "2026-03", f: "Reel", k: "Edukácia", h: "Když sedíš osm hodin denně, tělo se přizpůsobí.", u: 0, v: 479, z: 1, vr: 26.9 },
  { m: "2026-03", f: "Reel", k: "Edukácia", h: "Většina pohybových přístupů zůstane v tělocvičně.", u: 1, v: 522, z: 0, vr: 33.7 },
  { m: "2026-03", f: "Reel", k: "Edukácia", h: "Často dostáváme komentář, že naše cvičení jsou příliš komplikovaná. Že je tam „moc věcí na", u: 1, v: 591, z: 0, vr: 28.0 },
  { m: "2026-03", f: "Post", k: "Staccato výpočet", h: "Jedno rameno výš než druhé. Pánev mimo střed. Hlava vysunutá dopředu.", u: 5, v: 544, z: 0, vr: 0.0 },
  { m: "2026-03", f: "Post", k: "Klientsky príbeh", h: "Klient, který mě naučil víc, než jsem čekal.", u: 3, v: 753, z: 0, vr: 0.0 },
  { m: "2026-04", f: "Reel", k: "Edukácia", h: "Nebolelo to tak, aby se muselo přestat.", u: 2, v: 942, z: 13, vr: 44.5 },
  { m: "2026-04", f: "Reel", k: "Staccato výpočet", h: "Tisíce kroků denně. Hodiny sezení. Desítky opakování ve fitku.", u: 1, v: 413, z: 2, vr: 24.4 },
  { m: "2026-04", f: "Reel", k: "Edukácia", h: "Milióntina procenta z toho, co předchází @functioneck", u: 3, v: 580, z: 1, vr: 34.8 },
  { m: "2026-04", f: "Reel", k: "Vyvrátenie mýtu", h: "Pracujeme s celým tělem, ne jen s místem bolesti", u: 2, v: 1979, z: 5, vr: 64.7 },
  { m: "2026-04", f: "Reel", k: "Vyvrátenie mýtu", h: "Chcete se skutečně změnit, nebo o tom jen mluvíte? 🧠🛡️", u: 0, v: 519, z: 0, vr: 28.4 },
  { m: "2026-04", f: "Reel", k: "Edukácia", h: "„Nebyla to láska na první pohled.\"", u: 3, v: 1006, z: 8, vr: 40.5 },
  { m: "2026-04", f: "Reel", k: "Vyvrátenie mýtu", h: "Často slýcháme, že je potřeba zvedat těžké váhy – kvůli hormonální odezvě, hustotě kostí, ", u: 0, v: 504, z: 1, vr: 32.1 },
  { m: "2026-04", f: "Post", k: "Vyvrátenie mýtu", h: "Tvoje tělo nedrží pohromadě svaly.", u: 3, v: 457, z: 0, vr: 0.0 },
  { m: "2026-04", f: "Post", k: "Klientsky príbeh", h: "Michal přišel bez velkých očekávání. Odcházel s něčím, co nečekal.", u: 0, v: 600, z: 4, vr: 0.0 },
  { m: "2026-04", f: "Post", k: "Klientsky príbeh", h: "Natálie celý život sportovala.", u: 0, v: 500, z: 0, vr: 0.0 },
  { m: "2026-05", f: "Reel", k: "Staccato výpočet", h: "Prkno. Sklapovačky. Plank s hodinami odcvičenými za život.", u: 5, v: 1029, z: 3, vr: 40.0 },
  { m: "2026-05", f: "Reel", k: "Vyvrátenie mýtu", h: "Bolest nezačíná tam, kde ji cítíš.", u: 3, v: 1016, z: 4, vr: 36.6 },
  { m: "2026-05", f: "Reel", k: "Vyvrátenie mýtu", h: "Absence bolesti není známka zdraví", u: 1, v: 533, z: 1, vr: 31.6 },
  { m: "2026-05", f: "Reel", k: "Klientsky príbeh", h: "Natálie sportovala profesionálně od dětství.", u: 0, v: 664, z: 0, vr: 34.4 },
  { m: "2026-05", f: "Post", k: "Vyvrátenie mýtu", h: "Většina lidí, které upozorníš na to, že dýchají ústy, to ví. A přesto to nedokážou trvale ", u: 2, v: 510, z: 1, vr: 0.0 },
  { m: "2026-05", f: "Post", k: "Edukácia", h: "Na těchto fotkách vidíte proces, který v @prosapiens.biomechanic nazýváme biomechanickou o", u: 0, v: 553, z: 1, vr: 0.0 },
  { m: "2026-05", f: "Post", k: "Vyvrátenie mýtu", h: "Když se řekne bránice, většina lidí si představí nádech a výdech. Sval, který se pohybuje ", u: 9, v: 689, z: 1, vr: 0.0 },
  { m: "2026-06", f: "Reel", k: "Vyvrátenie mýtu", h: "Často slýcháme, že výsledky @fp.evidence jsou jen „anegdotické výsledky“. Že fotky před a ", u: 0, v: 442, z: 1, vr: 34.0 },
  { m: "2026-06", f: "Reel", k: "Edukácia", h: "Dřep se 150 kg. Mrtvý tah se 180 kg.", u: 0, v: 421, z: 0, vr: 33.7 },
  { m: "2026-06", f: "Reel", k: "Edukácia", h: "Jedním z nejzásadnějších zdrojů, ze kterých čerpáme, je kniha Anatomy Trains od Toma Myers", u: 0, v: 432, z: 0, vr: 31.8 },
  { m: "2026-06", f: "Reel", k: "Vyvrátenie mýtu", h: "Trénink, který vyžaduje mozek, ne jen svaly", u: 0, v: 473, z: 1, vr: 37.6 },
  { m: "2026-06", f: "Reel", k: "Klientsky príbeh", h: "Michal nepřišel s chronickou bolestí ani po sérii neúspěšných léčení.", u: 1, v: 810, z: 2, vr: 40.7 },
  { m: "2026-06", f: "Reel", k: "Staccato výpočet", h: "Wim Hof. Box breathing. Brániční dech.", u: 1, v: 507, z: 1, vr: 25.5 },
  { m: "2026-06", f: "Post", k: "Vyvrátenie mýtu", h: "Wim Hof, box breathing, brániční dech — metod jsou desítky. A přesto většina lidí, která j", u: 5, v: 482, z: 0, vr: 0.0 },
  { m: "2026-06", f: "Post", k: "Edukácia", h: "Dechové techniky se v posledních letech prodávají jako řešení skoro na všechno. Stres, sou", u: 4, v: 532, z: 0, vr: 0.0 },
  { m: "2026-06", f: "Post", k: "Edukácia", h: "Když „víc“ znamená „míň“ – Pohled Jerryho na Jarka ⚙️👤", u: 1, v: 725, z: 2, vr: 0.0 },
  { m: "2026-06", f: "Post", k: "Vyvrátenie mýtu", h: "Existuje jedna věc, kterou meditační komunita příliš neřeší.", u: 4, v: 409, z: 0, vr: 0.0 },
];

export const KATEGORIE_HOOKOV = ["Klientsky príbeh", "Vyvrátenie mýtu", "Staccato výpočet", "Otázka", "Edukácia"];
