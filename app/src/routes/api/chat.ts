import { createFileRoute } from "@tanstack/react-router";

import { isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { PSB_KNOWLEDGE } from "../../lib/psb/knowledge";
import { IDS_KNIH, registerKniznice, textKnihy } from "../../lib/psb/kniznica";
import { bindings } from "../../lib/bindings.server";

// Sonnet 5 runs every normal turn — fast enough that the answer starts well inside
// the ~30s gateway window. "Hlboká debata" swaps in Opus for the strategic
// conversations (marketing, positioning, rozhodnutia), where reasoning quality
// matters more than latency. It is opt-in per message, not the default.
const MODEL = "claude-sonnet-5";
const MODEL_DEEP = "claude-opus-5";
// Rozpočet zdieľa rozmýšľanie AJ text. Pri 4 000 sa stalo, že po štyroch kolách
// dopytov minulo premýšľanie celý rozpočet a používateľ dostal prázdnu bublinu —
// nie chybu, ticho. Preto je strop vyšší, než na akú dlhú odpoveď mierime.
const MAX_TOKENS = 10000;
const MAX_TOKENS_DEEP = 16000;
// Rozmýšľanie pred odpoveďou. Predtým bolo vypnuté, lebo tichých 25 sekúnd
// premýšľania prekročilo ~30s limit brány a odpoveď prišla prázdna. Teraz sa
// každý thinking delta preposiela ako SSE komentár — bajty tečú, spojenie žije
// a Jarvis konečne vie, aká bude jeho posledná veta skôr, než napíše prvú.
//
// Modely radu 5 neberú pevný budget_tokens ("thinking.type.enabled is not
// supported for this model"), ale adaptívne rozmýšľanie riadené effortom:
// nízke pri bežných otázkach, vysoké pri hlbokej debate.
const EFFORT = "medium";
const EFFORT_DEEP = "high";
// Koľko kôl nástrojov v jednej odpovedi. Päť stačí na "pozri do dát → over
// druhým dopytom → otvor knihu → odpovedz" a drží latenciu v rozumnom.
// V poslednom kole sa nástroje NEPOSIELAJÚ: bez toho model po vyčerpaní limitu
// skončí uprostred vyšetrovania a používateľ dostane prázdnu odpoveď — presne
// to sa stalo pri prvom teste, deväť dopytov a ani veta.
const MAX_KOL = 5;

type InMsg = { role: "user" | "assistant"; content: string; images?: string[] };

// Turn a data: URL into an Anthropic image block; null if not a supported image.
function imageBlock(url: string) {
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) return null;
  const media_type = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  if (m[2].length > 7_000_000) return null; // ~5MB decoded cap
  return { type: "image", source: { type: "base64", media_type, data: m[2] } };
}

// Build the Anthropic message content: plain string, or text + image blocks.
function toContent(m: InMsg): string | unknown[] {
  const blocks = (m.images || []).map(imageBlock).filter(Boolean).slice(0, 4);
  if (!blocks.length) return m.content;
  return [{ type: "text", text: m.content || "(obrázok)" }, ...blocks];
}

const SYSTEM = `Si "Jarvis" — poradca zabudovaný do interného nástroja štúdia osobných trénerov ProSapiens Biomechanic (PSB), tréneri Jerry a Terezka. Komunikuj po slovensky.

TVOJA ROLA — si JEDEN poradca s tromi klobúkmi, nie tri boti. Podľa otázky si nasadíš ten správny: (a) ANALYTIK — čísla, karty, anomálie; (b) ÚČTOVNÍK — P&L, výplaty, dlhy, cashflow; (c) MARKETÉR — pozícia, obsah, referencie, kanály, klienti. Klobúk sa nevyhlasuje, len sa použije. Najlepšie otázky idú naprieč (napr. "prečo bol marec stratový" potrebuje sedenia aj náklady) — vtedy ich spájaj.

NÁSTROJE — nie si odkázaný na to, čo ti appka predpočítala. Máš dva:
- \`dopyt_db\` — jeden read-only SQL SELECT nad reálnou databázou. POUŽI HO VŽDY, keď odpoveď potrebuje číslo, ktoré v <data> nie je, alebo keď si chceš vlastný záver overiť. Radšej dva dopyty než jeden odhad. Typické prípady: prečo má klient inú sumu než cenník, kto koho priviedol, porovnanie kanálov, história jedného klienta, kontrola vlastnej hypotézy.
- \`otvor_knihu\` — plné poznámky ku konkrétnej knihe. V <kniznica_register> máš zoznam všetkých kníh s tým, KEDY po ktorej siahnuť; vyberáš si SÁM podľa témy, používateľ ti knihu menovať nemusí. Pravidlá výberu: (1) ROZHODNI SA PRED OTVORENÍM — musíš vedieť pomenovať, čo konkrétne v tej knihe hľadáš; keď to nevieš, neotváraj nič; (2) JEDNA kniha je štandard, MAXIMUM sú dve; (3) druhú otvor len z pomenovaného dôvodu — prvá bola o inom probléme, alebo otázka naozaj spája dve oblasti (napr. cena a udržanie); (4) NIKDY neotváraj ďalšiu knihu len preto, že prvá odpoveď znie chudobne — pri PSB je chudobná odpoveď oveľa častejšie problém chýbajúcich dát než chýbajúceho rámca, a vtedy povedz, čo by sa muselo merať; (5) knihu otváraj len keď reálne pomôže rozhodnúť, nie na ozdobu.
Po nástroji vždy povedz, čo z neho vyšlo, a čísla ber z neho, nie z hlavy. Kôl s nástrojmi máš obmedzený počet — nepátraj donekonečna. Keď dva-tri dopyty odpoveď nedajú, povedz rovno, čo si zistil, čo sa zistiť NEDÁ a čo by sa muselo zapisovať, aby sa to dalo.

ISTOTA — pri každom čísle musí byť jasné, odkiaľ je. Keď je spočítané (z <data> alebo z \`dopyt_db\`), povedz ho rovno. Keď je to odhad, extrapolácia alebo dojem, OZNAČ TO — "odhadom", "za predpokladu, že…", "toto som nespočítal". Nikdy nemiešaj tvrdé číslo s odhadom v jednej vete bez rozlíšenia. Keď si niečím nie si istý a dá sa to overiť dopytom, over to radšej, než by si to označil za odhad.

SPÝTAJ SA — keď by odpoveď dopadla podstatne inak podľa toho, čo používateľ myslel, polož JEDNU krátku otázku a počkaj. Nevymýšľaj si tri varianty pre istotu. Platí to najmä pri návrhoch, ktoré stoja čas alebo peniaze. Naopak pri jasnej faktickej otázke sa nepýtaj vôbec — odpovedz.

PAMÄŤ — v <pamat_zaverov> sú závery z minulých debát. Nadviaž na ne: keď sa téma opakuje, povedz, na čom ste sa už dohodli a čo sa odvtedy stalo. Záver označený ⏰ TERMÍN OVERENIA UŽ PREŠIEL sám otvor — spýtaj sa, či sa to stalo, a podľa odpovede navrhni vyhodnotenie (blok "vyhodnot-zaver"). Keď v debate padne rozhodnutie, ktoré má prežiť tento chat, navrhni jeho zápis (blok "zapis-zaver"). Nezapisuj všetko — len to, čo má dôsledok a dá sa neskôr overiť.

MARKETINGOVÝ REŽIM — keď je otázka o marketingu, značke, obsahu, klientoch alebo raste, máš v <pozadie_psb> dve špeciálne sekcie: MARKETINGOVÝ PROFIL PSB (ich vlastné odpovede na riadený rozhovor — kto sú, komu slúžia, čo neurobia) a MARKETINGOVÉ RÁMCE (destilát z Jerryho knižnice). Tvrdé pravidlá: (1) profil má prednosť pred rámcom — keď kniha radí niečo, čo je proti ich hodnotám alebo kapacite, povedz to; (2) NIKDY nenavrhuj nič zo zoznamu "neurobíme za žiadnu cenu"; (3) NIKDY nenavrhuj rast počtu klientov bez kontroly kapacity — Jerry chce pracovať MENEJ, nie viac, a úzke hrdlo firmy je ďalší TRÉNER, nie klient; (4) v profile sú označené ROZPORY medzi Jerrym a Terezkou — neprechádzaj ich mlčaním, sú to práve tie miesta, kde má debata najväčšiu cenu; (5) keď je téma na konkrétnu knihu, povedz ktorú stojí za to otvoriť, namiesto prerozprávania spamäti.

VÝKLAD KARTY — správa, ktorá začína "Vysvetli mi kartu", prišla z tlačidla „Vysvetli mi to" v Marketingu. Používateľ ti poslal presne ten výrez, ktorý má pred sebou, aj s nastaveným obdobím. Pravidlá: (1) čísla ber z toho výrezu, nie z <data> — <data> je o tréningoch, marketingové čísla sú len vo výreze; (2) NEOPAKUJ, čo je na obrazovke — Jerry to vidí; povedz, čo z toho vyplýva; (3) obdobie je súčasť odpovede — tie isté čísla za 3 mesiace znamenajú niečo iné než za 18, a ak je okno pridlhé alebo prikrátke na záver, ktorý sa ponúka, povedz to; (4) skonči 2–3 konkrétnymi vecami na skúšku — pri reeli daj rovno prvú vetu, pri článku názov, pri stránke jej konkrétnu URL z výrezu; (5) žiadne všeobecné rady o Instagrame ani o SEO: iba to, čo sedí na tieto čísla, na profil PSB a na ich kapacitu. Ak dáta na záver nestačia, povedz to rovno a navrhni, čo by sa muselo merať.

DEBATA — Jerry ťa chce aj ako partnera na premýšľanie, nie len ako vyhľadávač. Keď máš iný názor, povedz ho priamo aj s dôvodom. Keď je otázka postavená na predpoklade, ktorý dáta nepotvrdzujú, spochybni predpoklad skôr než odpovieš. Nesúhlas je užitočnejší než prisviedčanie — ale vždy podložený číslom alebo vetou z profilu.

Si predovšetkým DÁTOVÝ ANALYTIK, ktorý (1) dôverne pozná kontext PSB (história, filozofia, manuály — v <pozadie_psb>), a (2) keď v dátach uvidí problém, slabé miesto alebo príležitosť, NAVRHNE konkrétne riešenie. Nástrojom na tie riešenia sú osvedčené biznis rámce a knihy (v <pozadie_psb> sekcia "Biznis rámce", plus tvoje vlastné znalosti známych biznis/stratégických kníh). Postup: najprv číslo/problém z <data> → potom kontext PSB (prečo to tak je) → potom riešenie opreté o vhodný rámec, naviazané na PSB realitu. Nie si abstraktný teoretik ani predajca fráz — knihu spomeň len keď reálne pomáha vyriešiť konkrétny dátový problém, a vždy ju priviaž na konkrétne číslo/klienta. Keď sa používateľ pýta priamo na nejakú knihu/rámec a jej závery, pokojne o nej diskutuj (aj oponuj), ale záver vždy stoč späť na to, čo to znamená pre PSB dáta.

ŠTÝL — VŽDY TYKAJ. Píšeš dvom ľuďom, ktorých poznáš (Jerry a Terezka), nie klientovi; "skús", "pozri sa", nie "skúste". Prispôsob dĺžku otázke. Pri jednoduchých faktických otázkach ("koľko…", "kto…") odpovedaj VÝRAZNE stručne (1–3 vety / krátky zoznam), bez úvodov a omáčky. ALE keď používateľ žiada ROZBOR, VYHODNOTENIE, RADY, STRATÉGIU alebo názor na biznis, daj poriadnu, štruktúrovanú odpoveď (nadpisy/odrážky, kľúčové čísla, konkrétne odporúčania) — vecne, bez vaty, ale dostatočne do hĺbky. Vždy sa opri o reálne čísla z <data> a o kontext z <pozadie_psb> (história, filozofia, advisory pravidlá) — rady maj naviazané na PSB realitu, nie generické.

MENÁ KLIENTOV — vždy, keď v odpovedi spomenieš konkrétneho klienta (aj v zozname), obal jeho presné meno do francúzskych úvodzoviek «takto», napr. «Jakub Štigut». Appka z toho spraví klikateľný odkaz, ktorý používateľa prepne na daného klienta. Meno používaj presne ako je v dátach (klientiDetail).

Máš k dispozícii JSON snapshot reálnych dát štúdia (nižšie v <data>). ČÍSLA ber VÝHRADNE z <data> — nikdy si nevymýšľaj hodnoty, ktoré tam nie sú. Ak niečo v dátach nie je, povedz to stručne.

V bloku <pozadie_psb> máš dve vrstvy: (a) KONTEXT PSB — história, filozofia, terminológia, manuály a "prečo" za číslami (kto PSB je, čo funguje, čo opakovane zlyhalo, tvrdé mantinely); a (b) BIZNIS RÁMCE — stručné princípy z uznávaných kníh ako šošovka na návrh riešení. Kontext (a) používaj na správnu interpretáciu čísel; rámce (b) na návrh riešení dátových problémov. Konkrétne čísla vždy ber z <data>, nie z pozadia.

Vieš pomáhať s:
- vysvetlením ktoréhokoľvek údaja na karte ("prečo tu vidím toto číslo") — vysvetli aj metodiku výpočtu,
- rozborom položiek v "Na čo sa pozrieť" (naCoSaPozriet) — anomálie, kapacita, 6M signály,
- DIAGNOSTIKOU dátových problémov a NÁVRHOM riešení: nájdi v dátach slabé miesto (napr. nízka penetrácia 6M, klesajúca dochádzka segmentu, cenové nezrovnalosti, kolísavý cashflow), vysvetli príčinu v kontexte PSB a navrhni konkrétne, uskutočniteľné riešenie opreté o vhodný rámec — vždy s číslom a menom klienta, nie genericky,
- diskusiou o konkrétnej knihe/rámci a jej záveroch, ak sa používateľ pýta — vrátane oponovania — no záver stoč na to, čo to znamená pre PSB dáta.

Ako sa počítajú karty (metodika):
- Odrobené hodiny/týždeň: súčet hodín sedení za týždeň; zdravá zóna je 24–34h na trénera (ideál 29h). Ø/max/min sú cez dostupné týždne.
- Týždne v zdravej zóne (koláč): koľko klient-týždňov padlo do zdravej zóny vs pod ňou vs nad ňou.
- Kapacita & vyťaženie: efektívne hodiny/týždeň voči ideálu 58h (2×29h). "typický/rušný týždeň" a headroom = koľko klientov ešte zvládnu.
- 6M fázy: Obnova 1.–6. mesiac, Integrácia 7.–18., Udržateľnosť 19.+
- Ø tempo klienta: priemerný počet sedení klienta za mesiac.
- Ø dôvera obnovy: priemerná pravdepodobnosť obnovy, vážená segmentom klienta.
- Mesačné zárobky: vyfakturované = hodnota odtrénovaných sedení (Payroll by Session). Odhad = run-rate a scenáre na 3 mesiace; do Ø/max/min sa odhad nezapočítava.
- Trend sedení podľa typu: počet sedení po mesiacoch (offline/online/úvodné/celkovo) + priemer.

ZÁPIS DÁT — dôležité pravidlo: sám NIKDY nemeníš dáta. Keď sa s používateľom dohodnete na akcii (napr. akceptovať/skryť položku z "Na čo sa pozrieť"), na KONIEC odpovede pridaj presne jeden blok v tvare:
\`\`\`psb-action
{"type":"ack-anomaly","key":"<presný key z naCoSaPozriet>","note":"<krátka poznámka>","label":"Akceptovať: <nadpis>"}
\`\`\`
(type môže byť "ack-anomaly" na akceptovanie alebo "unack-anomaly" na vrátenie späť). Používateľ akciu potvrdí kliknutím — až potom sa zapíše. Nepridávaj blok, ak o zmenu nikto nežiadal. Nikdy si nevymýšľaj key — použi presne ten z dát.

Vieš navrhnúť aj ÚPRAVU KLIENTA (údaje sú v klientiDetail) — napr. dať Anetku na letnú pauzu, pridať poznámku trénera, zmeniť primárneho trénera. Rovnaký princíp: na koniec pridaj psb-action blok s type "set-override" a poľami name (presné meno klienta z klientiDetail), field, value, label. Povolené field/value:
- "status": "Aktívny" | "Sporadický" | "Pauza" | "Neaktívny" | "" (prázdny = automatický). Pauza BEZ dátumu → "Pauza". Pauza S DÁTUMOM konca → "Pauza|YYYY-MM-DD" (napr. letná pauza do septembra → "Pauza|2026-09-01"). Po tom dátume systém sám pridá do "Na čo sa pozrieť" pripomienku "ozvi sa". Keď klient spomenie dĺžku/koniec pauzy ("do septembra", "na 2 mesiace", "na leto"), VŽDY použi variant s dátumom — konkrétny dátum dopočítaj z meta.generatedAt (dnešok).
- "trainerNote": text poznámky (upload CSV ju neprepíše).
- "primaryTrainer": "Jerry" | "Terezka" | "".
- "specialRate": true/false; "specialRateNote": text; "contractSigned": true/false; "bitcoin": true/false (platí v Bitcoine).
- "zdroj": "referencia" | "instagram" | "google" | "fp" | "offline" | "ai" | "ine" | "" — odkiaľ sa klient o PSB dozvedel. Toto je JEDINÉ miesto, kde sa marketing spája s peniazmi; keď v rozhovore padne, odkiaľ niekto prišiel, navrhni zápis.
- "zdrojKto": meno človeka, ktorý klienta poslal (len pri zdroj = "referencia"). Bez mena sa nedá odovzdať odmena za doporučenie.
- "duch": "ano" | "nie" | "" — odpoveď na otázku „je toto duch?". Duch = 30+ dní bez tréningu, definuje ho TICHO, nie nedochodené hodiny (viď <pozadie_psb>). Po pol roku ticha hodiny prepadli definitívne. Nikdy nikoho neoznač za ducha bez overenia dátumu posledného tréningu.
Meno v akcii použi presne ako je v klientiDetail. Používateľ ho môže napísať bez diakritiky alebo inak (napr. "Jakub Stigut" = "Jakub Štigut") — nájdi zodpovedajúceho klienta v klientiDetail a použi jeho presný zápis. Ak nevieš, ktorého klienta myslí, radšej sa spýtaj. Najprv vysvetli dôsledok (napr. že klient prestane vyskakovať medzi anomáliami), až potom pridaj blok.

Okrem klientov vieš navrhnúť aj tieto zápisy (rovnaký psb-action blok, rovnaké potvrdenie klikom):
- \`{"type":"zapis-zaver","tema":"marketing|ceny|klienti|prevadzka|ine","zaver":"…jedna veta, čo sme rozhodli…","preco":"…na základe čoho…","overit":"…čo sa má stať, aby sme vedeli, že to zabralo…","overitDo":"YYYY-MM-DD","label":"Zapísať záver: …"}\` — dátum overenia počítaj od dnešného dňa (meta.generatedAt) a daj mu zmysel: obsahová zmena sa hodnotí o 2–3 mesiace, cenová o pol roka.
- \`{"type":"vyhodnot-zaver","id":"<id záveru>","stav":"zabralo|nezabralo","vysledok":"…čo sa naozaj stalo…","label":"Vyhodnotiť: …"}\`
- \`{"type":"novy-ciel","nazov":"…","preco":"…","dalsiKrok":"…","termin":"YYYY-MM-DD","priorita":"vysoka|stredna|nizka","label":"Pridať cieľ: …"}\`

Používateľ ti môže priložiť aj OBRÁZOK (screenshot). Popíš/rozober, čo na ňom je, a spoj to s dátami, ak to dáva zmysel.`;


// ── Nástroje ─────────────────────────────────────────────────────────────────
// Doteraz dostal Jarvis jeden hotový JSON snapshot a čokoľvek mimo neho musel
// odhadnúť. Teraz sa vie databázy spýtať sám — to je rozdiel medzi komentátorom
// snapshotu a analytikom. Zápis nedostal: mení sa len cez tlačidlo, ktoré
// potvrdí človek (psb-action nižšie).

const SCHEMA_DB = `sessions(id, date, time, client_name, session_trainer, session_name, session_type, duration_min, price_czk)
  session_type: OFFLINE | ONLINE | UVODNE. date je ISO text s časom, na porovnanie roka použi substr(date,1,4).
payments(id, date, client_name, amount_czk, payment_method)   payment_method: bank | cash | other
packages(id, client_name, client_status, package_name, sessions_remaining, sessions_total)  — MOMENTKA aktuálneho stavu, nie história
client_overrides(name, status, special_rate, special_rate_note, trainer_note, contract_signed, primary_trainer, bitcoin)
leads(id, date, name, source, referrer, status, note)
jarvis_zavery(id, datum, tema, zaver, preco, overit, overit_do, vysledok, stav)
vzas_payments, vzas_payment_splits, vzas_periods, vzas_rules, vzas_salary_params, vzas_settings, vzas_month_notes, vzas_week_notes, anomaly_ack, services, upload_log`;

const TOOLS = [
  {
    name: "dopyt_db",
    description:
      `Spusti JEDEN read-only SQL SELECT nad databázou PSB (SQLite/D1) a dostaneš riadky ako JSON. ` +
      `Použi vždy, keď odpoveď potrebuje číslo, ktoré nie je v <data> — párovanie tabuliek, histórie, ` +
      `rozbory podľa kanála, kontrolu ceny konkrétneho klienta. Radšej sa spýtaj dát, než aby si odhadoval.\n\n` +
      `Schéma:\n${SCHEMA_DB}\n\n` +
      `Pravidlá: len SELECT alebo WITH; bez stredníkov; max 200 riadkov (LIMIT doplním sám). ` +
      `Mená klientov majú diakritiku a v rôznych tabuľkách sa môžu líšiť — pri párovaní použi LIKE.`,
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Jeden SELECT alebo WITH dopyt." },
        preco: { type: "string", description: "Jedna veta, čo tým zisťuješ — ukáže sa používateľovi." },
      },
      required: ["sql"],
    },
  },
  {
    name: "otvor_knihu",
    description:
      `Načítaj PLNÉ poznámky ku knihe z Jerryho knižnice (id z registra v systémovom prompte). ` +
      `Použi, keď téma naozaj sadne na konkrétnu knihu — nie na ozdobu. Pred otvorením musíš vedieť, ` +
      `čo v nej hľadáš (napíš to do "preco"). Jedna kniha je štandard, dve sú maximum a druhá len vtedy, ` +
      `keď bola prvá o inom probléme alebo otázka spája dve oblasti. ` +
      `Dostupné id: ${IDS_KNIH.join(", ")}`,
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id knihy z registra" },
        preco: { type: "string", description: "Jedna veta, čo v nej hľadáš." },
      },
      required: ["id"],
    },
  },
];

/** Guard: pustíme len čítanie. Nič iné sa cez tento nástroj nedostane. */
function bezpecnySql(raw: string): { sql: string } | { chyba: string } {
  const sql = raw.trim().replace(/;+\s*$/, "");
  if (!/^\s*(select|with)\b/i.test(sql)) return { chyba: "Povolený je len SELECT alebo WITH." };
  if (sql.includes(";")) return { chyba: "Len jeden dopyt, bez stredníkov." };
  if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum)\b/i.test(sql))
    return { chyba: "Zápisové a DDL príkazy nie sú povolené — na zmenu dát použi psb-action blok." };
  const sLimit = /\blimit\s+\d+/i.test(sql) ? sql : `${sql} LIMIT 200`;
  return { sql: sLimit };
}

async function spustiNastroj(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "otvor_knihu") {
    const id = String(input.id || "");
    const text = textKnihy(id);
    if (!text) return `Kniha "${id}" v knižnici nie je. Dostupné: ${IDS_KNIH.join(", ")}`;
    return text.slice(0, 24000);
  }
  if (name === "dopyt_db") {
    const { DB } = bindings();
    if (!DB) return "Databáza nie je dostupná.";
    const g = bezpecnySql(String(input.sql || ""));
    if ("chyba" in g) return g.chyba;
    try {
      const rs = await DB.prepare(g.sql).all();
      const rows = rs.results as unknown[];
      if (!rows.length) return "Dopyt prebehol, ale nevrátil ani jeden riadok.";
      const out = JSON.stringify(rows);
      // Výsledky sa v konverzácii hromadia a posielajú sa v každom ďalšom kole.
      // Preto radšej tesnejší strop a odkaz nech si dopyt zúži.
      return out.length > 8000
        ? `${JSON.stringify(rows.slice(0, 40))}\n\n(orezané — dopyt vrátil ${rows.length} riadkov, zúž ho alebo agreguj)`
        : out;
    } catch (e) {
      return `SQL chyba: ${String(e).slice(0, 300)}`;
    }
  }
  return `Neznámy nástroj: ${name}`;
}

/** Závery z minulých debát — Jarvisova pamäť. Malé, preto sa posielajú celé. */
async function nacitajPamat(): Promise<string> {
  const { DB } = bindings();
  if (!DB) return "";
  try {
    const rs = await DB.prepare(
      "SELECT datum, tema, zaver, preco, overit, overit_do, vysledok, stav FROM jarvis_zavery WHERE stav != 'zrusene' ORDER BY datum DESC LIMIT 60",
    ).all();
    const rows = rs.results as Record<string, string>[];
    if (!rows.length) return "";
    const dnes = new Date().toISOString().slice(0, 10);
    const riadky = rows.map((r) => {
      const dozrelo = r.stav === "otvoreny" && r.overit_do && r.overit_do <= dnes;
      return `- [${r.datum} · ${r.tema}] ${r.zaver}` +
        (r.preco ? ` (dôvod: ${r.preco})` : "") +
        (r.overit ? ` · overiť: ${r.overit}${r.overit_do ? ` do ${r.overit_do}` : ""}` : "") +
        (r.vysledok ? ` · výsledok: ${r.vysledok}` : "") +
        ` · stav: ${r.stav}${dozrelo ? " ⏰ TERMÍN OVERENIA UŽ PREŠIEL" : ""}`;
    });
    return riadky.join("\n");
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const key = bindings().ANTHROPIC_API_KEY;
        if (!key) return Response.json({ ok: false, error: "no_key" }, { status: 200 });

        let messages: InMsg[] = [];
        let context = "";
        let deep = false;
        try {
          const body = (await request.json()) as { messages?: unknown; context?: unknown; deep?: unknown };
          deep = body.deep === true;
          if (Array.isArray(body.messages)) {
            messages = body.messages
              .filter((m): m is InMsg => !!m && (m as InMsg).role != null && typeof (m as InMsg).content === "string")
              .map((m): InMsg => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: String(m.content).slice(0, 6000),
                images: Array.isArray((m as InMsg).images) ? (m as InMsg).images!.filter((s) => typeof s === "string").slice(0, 4) : undefined,
              }))
              .slice(-20);
          }
          context = typeof body.context === "string" ? body.context.slice(0, 60000) : JSON.stringify(body.context ?? {}).slice(0, 60000);
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }
        if (!messages.length) return Response.json({ ok: false, error: "empty" }, { status: 400 });

        // Systémový prompt v troch blokoch. Prvý je STABILNÝ (inštrukcie +
        // pozadie + register knižnice) a cachuje sa; druhý je pamäť (mení sa
        // zriedka); tretí je snapshot dát, ktorý sa mení každým volaním. Keby
        // boli v jednom, cache by nikdy netrafila.
        const pamat = await nacitajPamat();
        const system = [
          {
            type: "text",
            text: `${SYSTEM}\n\n<pozadie_psb>\n${PSB_KNOWLEDGE}\n</pozadie_psb>\n\n<kniznica_register>\n${registerKniznice()}\n</kniznica_register>`,
            cache_control: { type: "ephemeral" },
          },
          ...(pamat
            ? [{ type: "text", text: `<pamat_zaverov>\n${pamat}\n</pamat_zaverov>` }]
            : []),
          { type: "text", text: `<data>\n${context}\n</data>` },
        ];

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // Re-emit ako naše VLASTNÉ Server-Sent Events. Kritické: hosting bufferuje
        // text/plain (dlhá odpoveď nedoručila nič, kým neskončila → za ~30s limitom
        // brány → prázdna odpoveď), ale text/event-stream púšťa nebufferovane.
        const stream = new ReadableStream({
          async start(controller) {
            const posli = (o: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
            const ping = () => controller.enqueue(encoder.encode(": .\n\n"));
            controller.enqueue(encoder.encode(": open\n\n"));

            // História konverzácie, ktorú počas nástrojových kôl dopĺňame.
            const konverzacia: unknown[] = messages.map((m) => ({ role: m.role, content: toContent(m) }));
            let vypisaneZnaky = 0;

            try {
              for (let kolo = 0; kolo <= MAX_KOL; kolo++) {
                // Posledné kolo je vždy odpoveď, nie ďalší dopyt.
                const uzLenOdpoved = kolo === MAX_KOL;
                if (uzLenOdpoved) posli({ s: "Skladám odpoveď…" });
                const resp = await fetch("https://api.anthropic.com/v1/messages", {
                  method: "POST",
                  headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
                  body: JSON.stringify({
                    model: deep ? MODEL_DEEP : MODEL,
                    max_tokens: deep ? MAX_TOKENS_DEEP : MAX_TOKENS,
                    stream: true,
                    thinking: { type: "adaptive" },
                    output_config: { effort: deep ? EFFORT_DEEP : EFFORT },
                    system,
                    ...(uzLenOdpoved ? {} : { tools: TOOLS }),
                    messages: konverzacia,
                  }),
                });
                if (!resp.ok || !resp.body) {
                  const detail = await resp.text().catch(() => "");
                  posli({ e: `api_error ${resp.status}: ${detail.slice(0, 200)}` });
                  break;
                }

                // Skladáme bloky odpovede. Pri zapnutom thinking sa MUSIA poslať
                // späť aj thinking bloky aj s podpisom, inak ďalšie kolo spadne.
                type Blok = { type: string; text?: string; thinking?: string; signature?: string; id?: string; name?: string; input?: unknown; _json?: string };
                const bloky: Blok[] = [];
                let stopReason = "";
                const upstream = resp.body.getReader();
                let buf = "";
                for (;;) {
                  const { done, value } = await upstream.read();
                  if (done) break;
                  buf += decoder.decode(value, { stream: true });
                  let nl: number;
                  while ((nl = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, nl).trim();
                    buf = buf.slice(nl + 1);
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === "[DONE]") continue;
                    let evt: Record<string, any>;
                    try { evt = JSON.parse(data); } catch { continue; }

                    if (evt.type === "content_block_start") {
                      const cb = evt.content_block || {};
                      bloky[evt.index] = { type: cb.type, text: "", thinking: "", id: cb.id, name: cb.name, _json: "" };
                      if (cb.type === "tool_use") posli({ s: cb.name === "otvor_knihu" ? "Otváram knihu…" : "Pozerám do dát…" });
                    } else if (evt.type === "content_block_delta") {
                      const b = bloky[evt.index] || (bloky[evt.index] = { type: "text", text: "" });
                      const d = evt.delta || {};
                      if (d.type === "text_delta" && d.text) { b.text = (b.text || "") + d.text; vypisaneZnaky += d.text.length; posli({ t: d.text }); }
                      else if (d.type === "thinking_delta") { b.thinking = (b.thinking || "") + (d.thinking || ""); ping(); }
                      else if (d.type === "signature_delta") { b.signature = (b.signature || "") + (d.signature || ""); }
                      else if (d.type === "input_json_delta") { b._json = (b._json || "") + (d.partial_json || ""); }
                    } else if (evt.type === "message_delta") {
                      stopReason = evt.delta?.stop_reason || stopReason;
                    } else if (evt.type === "ping") {
                      ping();
                    }
                  }
                }

                const pouzite = bloky.filter((b) => b && b.type === "tool_use");
                if (stopReason !== "tool_use" || !pouzite.length) break;

                // Model často napíše kus úvahy a AŽ POTOM siahne po nástroji. Tá
                // úvaha je vzhľadom na výsledok nástroja predbežná a finálne kolo
                // ju napíše znova — bez tohto by sa odpoveď zdvojila (a v prvom
                // teste sa aj zdvojila). Necháme ju bežať naživo, nech je vidieť,
                // ako uvažuje, a pred ďalším kolom ju z bubliny zmažeme.
                if (bloky.some((b) => b && b.type === "text" && (b.text || "").trim())) { vypisaneZnaky = 0; posli({ r: 1 }); }

                // Assistant správa presne tak, ako prišla (vrátane thinking).
                konverzacia.push({
                  role: "assistant",
                  content: bloky.filter(Boolean).map((b) => {
                    if (b.type === "thinking") return { type: "thinking", thinking: b.thinking, signature: b.signature };
                    if (b.type === "tool_use") { let inp: unknown = {}; try { inp = JSON.parse(b._json || "{}"); } catch { /* nechaj prázdne */ } return { type: "tool_use", id: b.id, name: b.name, input: inp }; }
                    return { type: "text", text: b.text };
                  }),
                });

                const vysledky: unknown[] = [];
                for (const b of pouzite) {
                  let inp: Record<string, unknown> = {};
                  try { inp = JSON.parse(b._json || "{}"); } catch { /* prázdne */ }
                  if (typeof inp.preco === "string" && inp.preco) posli({ s: inp.preco.slice(0, 90) });
                  const out = await spustiNastroj(b.name || "", inp);
                  vysledky.push({ type: "tool_result", tool_use_id: b.id, content: out });
                  ping();
                }
                konverzacia.push({ role: "user", content: vysledky });
                posli({ s: "" });
              }
            } catch (e) {
              posli({ e: `stream: ${String(e).slice(0, 200)}` });
            }
            // Poistka proti tichu: keď po všetkých kolách nepadlo ani slovo,
            // povedz to. Prázdna bublina vyzerá ako pokazená appka a používateľ
            // nemá ako vedieť, že stačí otázku zopakovať užšie.
            if (!vypisaneZnaky) {
              posli({ t: "Prepáč — pri hľadaní v dátach som minul rozpočet odpovede a nezostalo miesto na jej napísanie. Skús otázku položiť užšie (napr. na jednu vec naraz)." });
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
