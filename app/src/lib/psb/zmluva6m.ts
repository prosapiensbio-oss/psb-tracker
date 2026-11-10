/**
 * ZMLUVA 6M — text, ktorý klient podpisuje (Jerry, 10. 11. 2026).
 *
 * Zdroj: `Obchodni_podminky_PSB_6M_v2.pdf` (Obchodní podmínky platné od
 * 1. 1. 2026), ktoré Jerry doteraz posielal cez DocuSeal.
 *
 * VERZIA SA NIKDY NEPREPISUJE. Podpísaná zmluva si pamätá verziu a odtlačok
 * (SHA-256) presného textu; keby sa text zmenil pod tou istou verziou,
 * odtlačok by už nesedel a nedalo by sa dokázať, čo klient podpísal.
 * Zmena podmienok = nový kľúč v `ZMLUVY` a `AKTUALNA_VERZIA` naň.
 *
 * Šesť pravidiel na odkliknutie je to isté, čo bolo v DocuSeal, len česky
 * (celá zmluva je česká) a so znením podľa článkov, na ktoré odkazujú.
 */

/** Odsek: holý text, text s tučným začiatkom, alebo medzinadpis v článku. */
export type Odsek = string | { b: string; t: string } | { h: string };

export type Clanok = { nadpis: string; odseky: Odsek[] };

export type Pravidlo = { id: string; nazov: string; text: string };

export type ZnenieZmluvy = {
  verzia: string;
  nazov: string;
  platneOd: string;
  clanky: Clanok[];
  /** Šesť pravidiel, ktoré klient odklikne jedno po druhom. */
  pravidla: Pravidlo[];
  /** Príloha podľa čl. 11.7 — vzorový formulár na odstúpenie. */
  priloha: { nadpis: string; odseky: string[] };
};

const V2026_01: ZnenieZmluvy = {
  verzia: "2026-01-v2",
  nazov: "Podmínky spolupráce pro 6M proces obnovy pohybu",
  platneOd: "1. 1. 2026",
  clanky: [
    {
      nadpis: "1. Úvodní ustanovení",
      odseky: [
        "1.1 Tyto všeobecné obchodní podmínky (dále jen „obchodní podmínky“) upravují poskytování trenérských a pohybových služeb prostřednictvím studia ProSapiens Biomechanic (dále jen „studio“), provozovaného na adrese Fanderlíkova 30, Brno-Žabovřesky, 616 00, dostupného na www.prosapiens.cz.",
        "1.2 Poskytovatelem služeb je Mgr. Filip Stráňavský, IČ: 19126841, se sídlem Přadlácká 915/18, Brno, 602 00, zapsaný v živnostenském rejstříku (dále jen „poskytovatel“).",
        "1.3 Poskytovatel není lékař ani zdravotnický pracovník. Služby poskytovatele nejsou zdravotními službami ve smyslu zák. č. 372/2011 Sb. ani specifickými zdravotními službami ve smyslu zák. č. 373/2011 Sb. Poskytovatel je odborník na pohybový trénink, který doporučuje na základě nejlepšího vědomí a svědomí.",
        "1.4 Jakmile bude mezi poskytovatelem a klientem uzavřena smlouva o poskytování služeb, tyto obchodní podmínky se stávají její nedílnou součástí a upravují vzájemný vztah mezi klientem a poskytovatelem. Obchodní podmínky jsou rovněž uveřejněny a klientovi zpřístupněny na webových stránkách www.prosapiens.cz.",
        "1.5 Smlouvu o poskytování služeb lze uzavřít v českém nebo slovenském jazyce.",
        "1.6 Poskytovatel si vyhrazuje právo obchodní podmínky měnit či doplňovat. Změna obchodních podmínek se nedotýká práv a povinností vzniklých za účinnosti předchozího znění.",
      ],
    },
    {
      nadpis: "2. Smluvní vztah",
      odseky: [
        "2.1 Před zahájením spolupráce je každý nový klient povinen absolvovat úvodní trénink, který zahrnuje diagnostiku, analýzu držení těla a chůze a posouzení individuálních cílů a zdravotního stavu klienta. Úvodní trénink je zpoplatněn dle aktuálního ceníku na webových stránkách poskytovatele.",
        "2.2 Na základě úvodního tréninku poskytovatel posoudí, zda je nabízená služba pro klienta vhodná. Poskytovatel si vyhrazuje právo spolupráci odmítnout, pokud dospěje k závěru, že služba pro klienta není vhodná.",
        "2.3 Smlouva o poskytování služeb mezi poskytovatelem a klientem vzniká potvrzením objednávky ze strany poskytovatele, a to buď písemně, elektronicky nebo ústně.",
        "2.4 Veškerá prezentace služeb poskytovatele na webových stránkách má informativní charakter a poskytovatel není povinen smlouvu o poskytování služeb uzavřít.",
        "2.5 Klient je povinen poskytovatele informovat o jakýchkoli důležitých skutečnostech ohledně svého zdravotního stavu. Pokud jeho zdravotní stav vyžaduje zvláštní pohybový režim, je povinen se před začátkem spolupráce poradit se svým lékařem.",
        "2.6 Pokud je klient nezletilý, poskytovatel může požadovat písemný souhlas zákonného zástupce klienta.",
        "2.7 Služby jsou poskytovány výhradně klientu a jsou nepřevoditelné, pokud není v těchto obchodních podmínkách stanoveno jinak (viz čl. 4.10).",
        "2.8 Veškeré smluvní vztahy jsou uzavřeny v souladu s právním řádem České republiky.",
      ],
    },
    {
      nadpis: "3. Popis služeb a 6měsíční spolupráce",
      odseky: [
        "3.1 Služby jsou poskytovány formou individuálních tréninků, a to osobně nebo na dálku (prostřednictvím videohovoru). Skupinové tréninky mohou být nabízeny dle aktuální nabídky poskytovatele.",
        "3.2 Základní formou dlouhodobé spolupráce je 6měsíční program obnovy (dále jen „6M spolupráce“), jehož podmínky jsou následující:",
        { b: "Délka spolupráce:", t: "6 měsíců (závazné období)" },
        { b: "Počet tréninků:", t: "6 hodin měsíčně (celkem 36 hodin za 6 měsíců)" },
        { b: "Měsíční platba:", t: "dle aktuálního ceníku na webových stránkách poskytovatele" },
        { b: "Platební cyklus:", t: "měsíčně, vždy k prvnímu dni daného měsíce spolupráce" },
        "3.3 Klient bere na vědomí, že 6M spolupráce je závazná po celou dobu trvání. Závazné období je stanoveno s ohledem na biologické zákonitosti nervově-pohybové adaptace, kdy kratší zásah neposkytuje dostatečný čas pro dosažení trvalých změn.",
        "3.4 Poskytovatel upozorňuje, že výsledek spolupráce závisí na několika faktorech, které nejsou pod kontrolou poskytovatele, jako je zdravotní stav klienta, pravidelnost domácího cvičení, životní styl a dodržování pokynů poskytovatele.",
        "3.5 Poskytovatel a klient si před začátkem spolupráce sjednají pravidelné termíny tréninků. Tyto termíny jsou pro obě strany závazné. Po vzájemné dohodě lze termíny změnit.",
      ],
    },
    {
      nadpis: "4. Pravidla 6měsíční spolupráce",
      odseky: [
        { h: "Zrušení a přesun tréninku" },
        "4.1 Klient i poskytovatel mají právo přesunout termín individuálního tréninku na jiný termín, pokud o tom informují druhou stranu nejméně 24 hodin předem. V takovém případě se trénink přesune na náhradní termín.",
        "4.2 Pokud klient zruší trénink méně než 24 hodin před jeho začátkem nebo se na trénink nedostaví, kreditní hodina propadá.",
        "4.3 Výjimka: při prvním nedostavení se v rámci celé 6M spolupráce poskytovatel uplatní jednorázové odpuštění a trénink bude přesunut na náhradní termín.",
        "4.4 Pokud se klient dostaví na trénink pozdě, poskytovatel si vyhrazuje právo zkrátit trénink o dobu zpoždění.",
        { h: "Pozastavení při nemoci" },
        "4.5 Krátkodobá nemoc (1–2 týdny): klient má nárok na automatický přenos maximálně 2 nevyčerpaných hodin do následujícího měsíce. Podmínkou je informování poskytovatele nejpozději v den plánovaného tréninku.",
        "4.6 Dlouhodobá pracovní neschopnost (3 a více týdnů): klient má nárok na pozastavení spolupráce až na 8 týdnů po předložení lékařského potvrzení. Během pozastavení se měsíční platby nepozastavují; nevyčerpané hodiny se připočtou k poslednímu měsíci závazného období, které se odpovídajícím způsobem prodlouží.",
        { h: "Dovolená klienta" },
        "4.7 Každý klient má v rámci 6M spolupráce nárok na jedno pozastavení z důvodu dovolené v délce až 7 kalendářních dnů, během kterého se nevyčerpané hodiny nepovažují za propadlé. Alternativně může klient po dohodě s poskytovatelem nahradit osobní tréninky tréninkem na dálku.",
        { h: "Nevyčerpané hodiny" },
        "4.8 Hodiny, které klient nevyčerpá v daném měsíci, automaticky propadají na konci měsíce, pokud není v těchto obchodních podmínkách stanoveno jinak (viz čl. 4.5 – 4.7). Nevyčerpání hodin nezbavuje klienta povinnosti uhradit měsíční platbu v plné výši.",
        { h: "Předčasné ukončení spolupráce" },
        "4.9 Klient může požádat o předčasné ukončení 6M spolupráce. V takovém případě je klient povinen uhradit jednorázový poplatek ve výši 30 % z hodnoty neodcvičených hodin za zbývající období spolupráce.",
        "4.10 Alternativně může klient bezplatně převést zbývající nevyčerpané hodiny na jinou osobu, pokud tato osoba absolvuje úvodní trénink a bude poskytovatelem schválena.",
        "4.11 Předčasné ukončení spolupráce ze strany poskytovatele je možné pouze ze závažných důvodů (např. opakované porušování obchodních podmínek klientem, zdravotní důvody na straně poskytovatele). V takovém případě má klient nárok na vrácení poměrné části úhrady za nevyčerpané služby.",
      ],
    },
    {
      nadpis: "5. Cena za služby a platební podmínky",
      odseky: [
        "5.1 Cena poskytovaných služeb se řídí platným ceníkem dostupným na webových stránkách poskytovatele.",
        "5.2 U 6M spolupráce je klient povinen hradit měsíční platbu vždy před začátkem příslušného měsíce spolupráce, a to nejpozději do 5. dne daného měsíce.",
        "5.3 Klient může provést platbu následujícím způsobem: bezhotovostně převodem na účet poskytovatele; v hotovosti nebo bezhotovostně platební kartou přímo ve studiu; bitcoinem (dle dohody s poskytovatelem).",
        "5.4 V případě prodlení s úhradou měsíční platby delšího než 14 dnů je poskytovatel oprávněn pozastavit poskytování služeb do doby uhrazení dlužné částky.",
        "5.5 Do ceny služeb nejsou zahrnuty případné vstupy do externích prostor, kde mohou být služby výjimečně poskytovány.",
      ],
    },
    {
      nadpis: "6. Reklamace a stížnosti",
      odseky: [
        "6.1 V případě reklamace služeb je klient povinen kontaktovat poskytovatele na e-mailové adrese info@prosapiens.cz a uvést: kontaktní údaje, popis reklamované služby, důvod reklamace, datum poskytnutí služby a návrh řešení.",
        "6.2 Klient bere na vědomí, že nemůže reklamovat služby pouze proto, že nenaplnily jeho subjektivní očekávání ohledně výsledku.",
        "6.3 Stížnosti je možné zasílat na elektronickou adresu info@prosapiens.cz. Informaci o vyřízení stížnosti zašle poskytovatel na e-mailovou adresu klienta.",
      ],
    },
    {
      nadpis: "7. Odstoupení od smlouvy",
      odseky: [
        "7.1 Klient, který je spotřebitelem, má v souladu s § 1829 zák. č. 89/2012 Sb. (občanský zákoník) právo odstoupit od smlouvy o poskytování služeb do 14 dnů ode dne jejího uzavření.",
        "7.2 Odstoupení musí být poskytovateli doručeno ve lhůtě uvedené v čl. 7.1, a to dopisem na adresu sídla poskytovatele nebo e-mailem na info@prosapiens.cz.",
        "7.3 V případě odstoupení od smlouvy se smlouva od počátku ruší. Uhrazená cena bude klientovi vrácena nejpozději do 14 dnů od odstoupení, a to stejným způsobem, jakým byla uhrazena.",
        "7.4 Pokud klient v průběhu lhůty pro odstoupení již čerpal služby (se svým výslovným souhlasem, např. formou rezervace konkrétního termínu), je povinen uhradit poskytovateli částku úměrnou počtu vyčerpaných tréninků.",
        "7.5 Pro odstoupení může klient využít vzorový formulář, který tvoří přílohu těchto obchodních podmínek.",
      ],
    },
    {
      nadpis: "8. Vyšší moc",
      odseky: [
        "8.1 V případě událostí, které nebylo možno předvídat a které brání poskytovateli v plnění smluvních povinností (vyšší moc), je poskytovatel oprávněn posunout dobu plnění o dobu trvání překážky.",
      ],
    },
    {
      nadpis: "9. Mimosoudní řešení sporů",
      odseky: [
        "9.1 K mimosoudnímu řešení spotřebitelských sporů je příslušná Česká obchodní inspekce, se sídlem Štěpánská 567/15, 120 00 Praha 2, IČ: 000 20 869, internetová adresa: https://adr.coi.cz/cs.",
      ],
    },
    {
      nadpis: "10. Ochrana osobních údajů",
      odseky: [
        "10.1 Informační povinnost poskytovatele vůči klientu dle čl. 13 nařízení Evropského parlamentu a Rady (EU) 2016/679 (GDPR) je plněna prostřednictvím zvláštního dokumentu dostupného na webových stránkách poskytovatele.",
        "10.2 Klient souhlasí se zasíláním obchodních sdělení poskytovatele dle § 7 odst. 2 zák. č. 480/2004 Sb. Souhlas může klient kdykoli odvolat.",
      ],
    },
    {
      nadpis: "11. Závěrečná ustanovení",
      odseky: [
        "11.1 Klient je povinen oznamovat poskytovateli bez zbytečného odkladu změnu svých osobních údajů.",
        "11.2 Aktuální znění obchodních podmínek je k dispozici na webových stránkách www.prosapiens.cz.",
        "11.3 Klient souhlasí s doručováním sdělení souvisejících se smlouvou na jeho e-mailovou adresu.",
        "11.4 Neplatnost či neúčinnost jakéhokoli ustanovení těchto obchodních podmínek se nedotýká platnosti a účinnosti ostatních ustanovení.",
        "11.5 Pokud smluvní vztah obsahuje mezinárodní prvek, strany sjednávají, že se vztah řídí českým právem.",
        "11.6 Smlouva včetně obchodních podmínek je archivována poskytovatelem v elektronické podobě.",
        "11.7 Přílohou obchodních podmínek je vzorový formulář pro odstoupení od smlouvy.",
      ],
    },
  ],
  pravidla: [
    {
      id: "presun",
      nazov: "Zrušení a přesun tréninku",
      text: "Trénink lze bez ztráty kreditu přesunout, pokud ho zruším nejméně 24 hodin předem; jinak hodina propadá. První nedostavení se v rámci celé spolupráce je odpuštěno. (čl. 4.1–4.3)",
    },
    {
      id: "nemoc",
      nazov: "Pozastavení při nemoci",
      text: "Při krátkodobé nemoci lze přenést nejvýše 2 nevyčerpané hodiny do dalšího měsíce; při dlouhodobé pracovní neschopnosti lze spolupráci pozastavit až na 8 týdnů s lékařským potvrzením. Měsíční platby se nepozastavují. (čl. 4.5–4.6)",
    },
    {
      id: "dovolena",
      nazov: "Dovolená",
      text: "Během spolupráce mohu jednou pozastavit tréninky až na 7 dní, nebo je po dohodě nahradit tréninkem na dálku. (čl. 4.7)",
    },
    {
      id: "hodiny",
      nazov: "Nevyčerpané hodiny",
      text: "Hodiny nevyčerpané do konce měsíce propadají, kromě schválených výjimek (nemoc, dovolená). Měsíční platbu hradím v plné výši. (čl. 4.8)",
    },
    {
      id: "ukonceni",
      nazov: "Předčasné ukončení",
      text: "Při předčasném ukončení spolupráce uhradím poplatek 30 % z hodnoty neodcvičených hodin, nebo mohu zbývající hodiny bezplatně převést na jinou osobu. (čl. 4.9–4.10)",
    },
    {
      id: "zavaznost",
      nazov: "Závaznost spolupráce",
      text: "Beru na vědomí, že spolupráce je závazná na 6 měsíců, nejde o zdravotní službu a mám právo odstoupit od smlouvy do 14 dnů od jejího uzavření. (čl. 3.3, 1.3, 7.1)",
    },
  ],
  priloha: {
    nadpis: "Příloha: Vzorový formulář pro odstoupení od smlouvy",
    odseky: [
      "(vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)",
      "Adresát: Mgr. Filip Stráňavský, Přadlácká 915/18, 602 00 Brno, IČ: 19126841, e-mail: info@prosapiens.cz",
      "Oznamuji, že tímto odstupuji od smlouvy o poskytnutí těchto služeb: ……………………",
      "Datum uzavření smlouvy: ……………………",
      "Jméno a příjmení spotřebitele: ……………………",
      "Adresa spotřebitele: ……………………",
      "Podpis spotřebitele (pouze pokud je tento formulář zasílán v listinné podobě): ……………………",
      "Datum: ……………………",
    ],
  },
};

export const ZMLUVY: Record<string, ZnenieZmluvy> = { [V2026_01.verzia]: V2026_01 };
export const AKTUALNA_VERZIA = V2026_01.verzia;

export const znenie = (verzia: string): ZnenieZmluvy | null => ZMLUVY[verzia] || null;

/** Odtlačok presného znenia (SHA-256, hex) — čo klient naozaj videl. */
export async function odtlacokZnenia(z: ZnenieZmluvy): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify({ verzia: z.verzia, clanky: z.clanky, pravidla: z.pravidla, priloha: z.priloha }));
  const h = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Meno poskytovateľa pri podpise — zmluvná strana je vždy Filip (IČ). */
export const menoPodpisujuceho = (autor: string | null | undefined): string =>
  !autor || /^jerry$/i.test(autor.trim()) ? "Mgr. Filip Stráňavský" : `${autor.trim()} (za poskytovatele)`;

/** Podpis ako data URL PNG — overenie tvaru a veľkosti (strop 400 kB). */
export const jePodpis = (s: unknown): s is string =>
  typeof s === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length > 800 && s.length < 400_000;
